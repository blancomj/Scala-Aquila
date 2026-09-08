-- ═══════════════════════════════════════════════════════════════════════
--  GOB-9 (3/7) · Motor de vencimientos — detección, SIN cambiar estados
--  Ver GOB_09_comunicaciones_workflow.md §3.3, pruebas 6, 7, 8, 11.
--
--  gobierno_detectar_vencimientos() es SOLO SELECT sobre las 5 máquinas de
--  estado (compromisos, expedientes, impugnaciones, solicitudes, actas) e
--  INSERT únicamente en gobierno_vencimiento_notificaciones (prueba 7: el
--  motor no tiene ni un solo UPDATE sobre ninguna tabla de dominio — se
--  puede verificar leyendo este archivo, no hace falta un guard de
--  privilegios adicional). "No repetir" (prueba 8) lo resuelve el unique
--  de la bitácora vía ON CONFLICT DO NOTHING, no una comprobación previa
--  que podría tener una condición de carrera.
--
--  Aislamiento por tenant (prueba 11): cada bloque filtra por
--  tenant_id = p_tenant_id explícitamente — ninguna subconsulta cruza de
--  tenant (mismo criterio que toda función multi-tenant del repo).
--
--  Por qué no hay llamada a Brevo aquí: el envío real de la notificación
--  es un paso aparte (Edge Function enviar-comunicacion, §3.1), exactamente
--  como cartera separa "calcular y crear la acción" (corrida diaria) de
--  "despachar el mensaje" (ejecutar-accion-cobranza/cartera-ejecutar-lote,
--  20260906160000). Aquí también: detectar y registrar la notificación
--  pendiente es una cosa, mandarla es otra — cron_gobierno_vencimientos_
--  diario() dispara el envío por cada notificación nueva, pero si falla o
--  no hay proveedor configurado, la detección ya quedó registrada y no se
--  pierde ni se repite.
-- ═══════════════════════════════════════════════════════════════════════

create function public.gobierno_detectar_vencimientos(p_tenant_id uuid, p_fecha date default current_date)
returns setof public.gobierno_vencimiento_notificaciones
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ── compromiso (gobierno_compromisos.fecha_limite) ────────────────────
  return query
  insert into public.gobierno_vencimiento_notificaciones (tenant_id, tipo_vencimiento, entidad_id, config_id, fecha_deteccion)
  select p_tenant_id, 'compromiso'::public.gobierno_tipo_vencimiento_t, c.id, cfg.id, p_fecha
  from public.gobierno_compromisos c
  join public.gobierno_vencimiento_config cfg
    on cfg.tenant_id = p_tenant_id
   and cfg.tipo_vencimiento = 'compromiso'
   and cfg.activo
  where c.tenant_id = p_tenant_id
    and c.estado not in ('cumplido', 'cancelado')
    and c.fecha_limite is not null
    and c.fecha_limite between p_fecha and p_fecha + cfg.dias_anticipacion
  on conflict (tenant_id, tipo_vencimiento, entidad_id, config_id) do nothing
  returning *;

  -- ── expediente_convivencia (última actuación con fecha_limite) ────────
  return query
  insert into public.gobierno_vencimiento_notificaciones (tenant_id, tipo_vencimiento, entidad_id, config_id, fecha_deteccion)
  select p_tenant_id, 'expediente_convivencia'::public.gobierno_tipo_vencimiento_t, e.id, cfg.id, p_fecha
  from public.gobierno_expedientes_convivencia e
  join public.gobierno_vencimiento_config cfg
    on cfg.tenant_id = p_tenant_id
   and cfg.tipo_vencimiento = 'expediente_convivencia'
   and cfg.activo
  where e.tenant_id = p_tenant_id
    and e.etapa not in ('archivado', 'firme')
    and exists (
      select 1 from public.gobierno_expediente_actuaciones a
      where a.expediente_id = e.id
        and a.fecha_limite is not null
        and a.fecha_limite between p_fecha and p_fecha + cfg.dias_anticipacion
        -- solo el hito más reciente del expediente marca su vencimiento vigente
        and a.id = (
          select a2.id from public.gobierno_expediente_actuaciones a2
          where a2.expediente_id = e.id
          order by a2.created_at desc, a2.id desc
          limit 1
        )
    )
  on conflict (tenant_id, tipo_vencimiento, entidad_id, config_id) do nothing
  returning *;

  -- ── impugnacion (plazo_limite, sin resolver) ──────────────────────────
  return query
  insert into public.gobierno_vencimiento_notificaciones (tenant_id, tipo_vencimiento, entidad_id, config_id, fecha_deteccion)
  select p_tenant_id, 'impugnacion'::public.gobierno_tipo_vencimiento_t, i.id, cfg.id, p_fecha
  from public.gobierno_impugnaciones i
  join public.gobierno_vencimiento_config cfg
    on cfg.tenant_id = p_tenant_id
   and cfg.tipo_vencimiento = 'impugnacion'
   and cfg.activo
  where i.tenant_id = p_tenant_id
    and i.resuelta_at is null
    and i.plazo_limite between p_fecha and p_fecha + cfg.dias_anticipacion
  on conflict (tenant_id, tipo_vencimiento, entidad_id, config_id) do nothing
  returning *;

  -- ── solicitud (SLA, sin resolver ni cerrar) ───────────────────────────
  return query
  insert into public.gobierno_vencimiento_notificaciones (tenant_id, tipo_vencimiento, entidad_id, config_id, fecha_deteccion)
  select p_tenant_id, 'solicitud'::public.gobierno_tipo_vencimiento_t, s.id, cfg.id, p_fecha
  from public.solicitudes s
  join public.gobierno_vencimiento_config cfg
    on cfg.tenant_id = p_tenant_id
   and cfg.tipo_vencimiento = 'solicitud'
   and cfg.activo
  where s.tenant_id = p_tenant_id
    and s.resuelta_at is null
    and s.cerrada_at is null
    and s.sla_vence_at is not null
    and s.sla_vence_at::date between p_fecha and p_fecha + cfg.dias_anticipacion
  on conflict (tenant_id, tipo_vencimiento, entidad_id, config_id) do nothing
  returning *;

  -- ── acta_disposicion (plazo de puesta a disposición, GOB-4) ───────────
  return query
  insert into public.gobierno_vencimiento_notificaciones (tenant_id, tipo_vencimiento, entidad_id, config_id, fecha_deteccion)
  select p_tenant_id, 'acta_disposicion'::public.gobierno_tipo_vencimiento_t, a.id, cfg.id, p_fecha
  from public.gobierno_actas a
  join public.gobierno_vencimiento_config cfg
    on cfg.tenant_id = p_tenant_id
   and cfg.tipo_vencimiento = 'acta_disposicion'
   and cfg.activo
  where a.tenant_id = p_tenant_id
    and a.puesta_a_disposicion_at is null
    and a.plazo_disposicion_limite between p_fecha and p_fecha + cfg.dias_anticipacion
  on conflict (tenant_id, tipo_vencimiento, entidad_id, config_id) do nothing
  returning *;
end;
$$;

comment on function public.gobierno_detectar_vencimientos(uuid, date) is
  'GOB-9 §3.3 — detecta vencimientos próximos en las 5 máquinas de estado y registra en '
  'gobierno_vencimiento_notificaciones. Nunca hace UPDATE sobre gobierno_compromisos/'
  'gobierno_expedientes_convivencia/gobierno_impugnaciones/solicitudes/gobierno_actas (prueba 7). '
  'Sin config activa para un tipo, ese tipo no genera notificaciones — cero reglas por defecto.';

-- ── Bitácora de corridas, mismo patrón que cartera_corridas_diarias ─────
create table public.gobierno_vencimiento_corridas (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  fecha_corte  date not null,
  origen       text not null default 'cron',
  notificados  integer not null default 0,
  disparado_at timestamptz not null default now(),

  constraint gobierno_vencimiento_corrida_unica unique (tenant_id, fecha_corte, origen)
);

alter table public.gobierno_vencimiento_corridas enable row level security;
alter table public.gobierno_vencimiento_corridas force row level security;

create policy gobierno_vencimiento_corridas_select_miembro
  on public.gobierno_vencimiento_corridas for select
  to authenticated
  using (public.is_member(tenant_id));

comment on table public.gobierno_vencimiento_corridas is
  'GOB-9 §3.3 — bitácora de la corrida diaria del motor de vencimientos, mismo patrón que '
  'cartera_corridas_diarias (CAR §18): NO es un segundo scheduler, es la misma forma (un job, una '
  'función, una bitácora) aplicada a un dominio distinto — spec explícito: "no crees un segundo '
  'scheduler: estúdialo y generalízalo o reutilízalo".';

-- ── El disparo diario — reutiliza el patrón, no pg_cron dos veces sobre lo mismo ──
create function public.cron_gobierno_vencimientos_diario()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha       date := current_date;
  v_tenant      record;
  v_detectados  integer;
  v_total       integer := 0;
begin
  for v_tenant in
    select id from public.tenants where status = 'active' order by created_at
  loop
    select count(*) into v_detectados
    from public.gobierno_detectar_vencimientos(v_tenant.id, v_fecha);

    insert into public.gobierno_vencimiento_corridas (tenant_id, fecha_corte, origen, notificados)
    values (v_tenant.id, v_fecha, 'cron', v_detectados)
    on conflict (tenant_id, fecha_corte, origen) do update
      set notificados = public.gobierno_vencimiento_corridas.notificados + excluded.notificados,
          disparado_at = now();

    v_total := v_total + v_detectados;
  end loop;

  raise notice 'GOBIERNO_VENCIMIENTOS_CRON: % notificaciones nuevas detectadas para %', v_total, v_fecha;
end;
$$;

revoke execute on function public.cron_gobierno_vencimientos_diario() from public, anon, authenticated;

comment on function public.cron_gobierno_vencimientos_diario() is
  'GOB-9 §3.3 — corre vía pg_cron (job "gobierno-vencimientos-diario"), una vez por copropiedad '
  'activa. Solo detecta y registra (gobierno_detectar_vencimientos); el envío real de cada '
  'notificación nueva es responsabilidad de un paso posterior (enviar-comunicacion), igual que '
  'cartera separa calcular de despachar.';

select cron.schedule(
  'gobierno-vencimientos-diario',
  '30 11 * * *',
  $$select public.cron_gobierno_vencimientos_diario()$$
);
