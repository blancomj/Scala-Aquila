-- ═══════════════════════════════════════════════════════════════════════
--  CO-7 · Cálculo, reconocimiento y estructura de castigo de deterioro de
--  cartera (CO_07_deterioro_cartera.md §4.2-§4.4)
--
--  contable_calcular_deterioro es de solo lectura (stable) — la simulación que verá el
--  contador antes de reconocer nunca escribe nada (criterio de aceptación §8).
--  fn_contable_reconocer_deterioro replica el patrón ya usado por MANT-0
--  (fn_mant_capitalizar_activo, 20260930290000): arma contable_comprobante +
--  contable_comprobante_detalle en borrador y llama a fn_contabilizar_comprobante — nunca
--  inserta un comprobante ya contabilizado a mano.
--
--  "cuenta de cartera" (§4.2) se resuelve exactamente como ya lo hace contable_hechos() (CO-3,
--  20260930230000): CARTERA_CUOTA_ORDINARIA/CARTERA_INTERES_MORA/CARTERA_OTROS por
--  cargos.categoria — no se inventa una resolución nueva.
--
--  contable_castigo_cartera es solo estructura (§4.4, vinculante): sin RPC de ejecución ni UI
--  de castigo masivo — la pregunta de qué órgano autoriza queda abierta para el contador.
-- ═══════════════════════════════════════════════════════════════════════

-- ── contable_deterioro_detalle ──────────────────────────────────────────
create table public.contable_deterioro_detalle (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references public.tenants (id) on delete cascade,
  comprobante_id              uuid not null references public.contable_comprobante (id) on delete cascade,
  inmueble_id                 uuid not null references public.inmuebles (id),
  cuenta_cartera_id           uuid not null references public.contable_cuenta (id),
  saldo                       numeric(18, 2) not null,
  deterioro_calculado         numeric(18, 2) not null,
  deterioro_reconocido_previo numeric(18, 2) not null default 0,
  ajuste                      numeric(18, 2) not null,
  created_at                  timestamptz not null default now()
);

alter table public.contable_deterioro_detalle enable row level security;
alter table public.contable_deterioro_detalle force row level security;

create index contable_deterioro_detalle_tenant_idx
  on public.contable_deterioro_detalle (tenant_id);
create index contable_deterioro_detalle_comprobante_idx
  on public.contable_deterioro_detalle (comprobante_id);
create index contable_deterioro_detalle_inmueble_idx
  on public.contable_deterioro_detalle (tenant_id, inmueble_id);

comment on table public.contable_deterioro_detalle is
  'Desglose por inmueble de cada reconocimiento de deterioro (CO-7 §4.3) — la línea de 1399 en '
  'contable_comprobante_detalle es agregada (no exige inmueble); este es el detalle consultable '
  'para la nota 6 de CO-5 y el libro de inventarios y balances de CO-4. Se inserta únicamente '
  'desde fn_contable_reconocer_deterioro — no hay política de escritura directa para usuarios.';

create policy contable_deterioro_detalle_select_miembro
  on public.contable_deterioro_detalle for select
  to authenticated
  using (public.is_member(tenant_id));

-- ── contable_castigo_cartera — solo estructura (§4.4) ───────────────────
create table public.contable_castigo_cartera (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  inmueble_id     uuid not null references public.inmuebles (id),
  monto           numeric(18, 2) not null check (monto > 0),
  motivo          text,
  acta_referencia text not null,
  autorizado_por  uuid references public.profiles (id),
  autorizado_at   timestamptz,
  creado_por      uuid references public.profiles (id),
  created_at      timestamptz not null default now()
);

alter table public.contable_castigo_cartera enable row level security;
alter table public.contable_castigo_cartera force row level security;

create index contable_castigo_cartera_tenant_idx
  on public.contable_castigo_cartera (tenant_id);

comment on table public.contable_castigo_cartera is
  'Solo estructura (CO-7 §4.4) — modela la posibilidad de castigar cartera incobrable (baja '
  'del activo contra el deterioro constituido), que requiere autorización de asamblea o '
  'consejo. NO implementa el proceso completo ni la UI de castigo masivo — deliberadamente '
  'fuera de este corte. Qué órgano autoriza y con qué mayoría es pregunta abierta para el '
  'contador/reglamento de cada copropiedad; acta_referencia es obligatoria porque cualquier '
  'fila aquí presupone que esa autorización ya existió.';

create policy contable_castigo_cartera_select_miembro
  on public.contable_castigo_cartera for select
  to authenticated
  using (public.is_member(tenant_id));

create policy contable_castigo_cartera_insert_administrador
  on public.contable_castigo_cartera for insert
  to authenticated
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

-- ── contable_calcular_deterioro — solo lectura ──────────────────────────
create function public.contable_calcular_deterioro(
  p_tenant_id   uuid,
  p_fecha_corte date
)
returns table (
  inmueble_id          uuid,
  cuenta_cartera_id    uuid,
  cuenta_codigo        text,
  cuenta_nombre        text,
  saldo                numeric(18, 2),
  dias_vencido         int,
  tramo_id             uuid,
  porcentaje           numeric(5, 2),
  deterioro_calculado  numeric(18, 2),
  deterioro_reconocido numeric(18, 2),
  ajuste               numeric(18, 2)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_politica public.contable_politica_deterioro%rowtype;
begin
  select * into v_politica
    from public.contable_politica_deterioro
   where tenant_id = p_tenant_id
     and estado = 'vigente'
     and vigente_desde <= p_fecha_corte
     and (vigente_hasta is null or vigente_hasta >= p_fecha_corte);

  if v_politica.id is null then
    raise exception 'DETERIORO_SIN_POLITICA: no hay política de deterioro vigente para % en % '
      '(CO-7 §4.2)', p_tenant_id, p_fecha_corte;
  end if;

  if v_politica.metodo = 'individual' then
    raise exception 'DETERIORO_METODO_NO_IMPLEMENTADO: el método individual no tiene cálculo '
      'implementado en CO-7 — requiere diseño de un corte futuro (política %)', v_politica.id;
  end if;

  return query
  with cuentas as (
    select
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'CARTERA_CUOTA_ORDINARIA'))[1] as ordinaria,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'CARTERA_INTERES_MORA'))[1]    as interes,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'CARTERA_OTROS'))[1]           as otros
    from public.contable_cuenta_default cd
    join public.lista_tipos lt on lt.id = cd.evento_id
    where cd.tenant_id = p_tenant_id
  ),
  saldo_cargo as (
    select
      c.id as cargo_id,
      c.inmueble_id,
      case
        when c.categoria = 'capital' then (select ordinaria from cuentas)
        when c.categoria = 'interes' then (select interes from cuentas)
        else (select otros from cuentas)
      end as cuenta_cartera_id,
      c.monto_original - coalesce(sum(pa.monto), 0) as saldo,
      greatest((p_fecha_corte - p.fecha_vencimiento), 0) as dias_vencido
    from public.cargos c
    join public.periodos p on p.id = c.periodo_id
    left join public.pago_aplicaciones pa on pa.cargo_id = c.id
    where c.tenant_id = p_tenant_id
      and (
        not v_politica.excluir_cargos_con_acuerdo_vigente
        or not exists (
          select 1 from public.acuerdos_pago ap
          where ap.tenant_id = p_tenant_id
            and ap.inmueble_id = c.inmueble_id
            and ap.estado = 'vigente'
        )
      )
    group by c.id, c.inmueble_id, c.categoria, c.monto_original, p.fecha_vencimiento
    having c.monto_original - coalesce(sum(pa.monto), 0) <> 0
  ),
  con_tramo as (
    select
      sc.*,
      case when v_politica.metodo = 'antiguedad' then t.id end as tramo_id,
      case
        when v_politica.metodo = 'antiguedad' then t.porcentaje
        else v_politica.porcentaje_global
      end as porcentaje
    from saldo_cargo sc
    left join public.contable_politica_deterioro_tramo t
      on v_politica.metodo = 'antiguedad'
     and t.politica_id = v_politica.id
     and sc.dias_vencido >= t.dias_desde
     and (t.dias_hasta is null or sc.dias_vencido <= t.dias_hasta)
  ),
  agregado as (
    select
      con_tramo.inmueble_id,
      con_tramo.cuenta_cartera_id,
      sum(con_tramo.saldo) as saldo,
      max(con_tramo.dias_vencido) as dias_vencido,
      (array_agg(con_tramo.tramo_id order by con_tramo.dias_vencido desc))[1] as tramo_id,
      (array_agg(con_tramo.porcentaje order by con_tramo.dias_vencido desc))[1] as porcentaje,
      sum(round(con_tramo.saldo * coalesce(con_tramo.porcentaje, 0) / 100, 2)) as deterioro_calculado
    from con_tramo
    group by con_tramo.inmueble_id, con_tramo.cuenta_cartera_id
  ),
  previo as (
    select dd.inmueble_id, dd.cuenta_cartera_id, sum(dd.ajuste) as reconocido
    from public.contable_deterioro_detalle dd
    join public.contable_comprobante c on c.id = dd.comprobante_id
    where c.tenant_id = p_tenant_id and c.numero is not null and c.fecha <= p_fecha_corte
    group by dd.inmueble_id, dd.cuenta_cartera_id
  )
  select
    a.inmueble_id,
    a.cuenta_cartera_id,
    cc.codigo as cuenta_codigo,
    cc.nombre as cuenta_nombre,
    a.saldo,
    a.dias_vencido,
    a.tramo_id,
    a.porcentaje,
    a.deterioro_calculado,
    coalesce(p.reconocido, 0) as deterioro_reconocido,
    a.deterioro_calculado - coalesce(p.reconocido, 0) as ajuste
  from agregado a
  left join previo p
    on p.inmueble_id = a.inmueble_id and p.cuenta_cartera_id = a.cuenta_cartera_id
  left join public.contable_cuenta cc on cc.id = a.cuenta_cartera_id;
end;
$$;

comment on function public.contable_calcular_deterioro(uuid, date) is
  'Solo lectura (§8: la simulación nunca escribe). Por inmueble y cuenta de cartera: saldo '
  'pendiente, antigüedad (desde periodos.fecha_vencimiento del cargo), tramo/porcentaje '
  'aplicado, deterioro calculado, lo ya reconocido en comprobantes previos y el ajuste '
  'resultante — nunca el total (CO-7 §4.2/§4.3). Falla con DETERIORO_SIN_POLITICA si no hay '
  'política vigente para la fecha de corte — el cero silencioso está prohibido.';

-- ── fn_contable_reconocer_deterioro ──────────────────────────────────────
create function public.fn_contable_reconocer_deterioro(
  p_tenant_id  uuid,
  p_periodo_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_periodo          public.periodos%rowtype;
  v_fecha_corte      date;
  v_existente        uuid;
  v_tipo_id          uuid;
  v_cuenta_gasto     uuid;
  v_cuenta_deterioro uuid;
  v_comp_id          uuid;
  v_total_ajuste     numeric(18, 2);
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador para reconocer '
      'deterioro de cartera';
  end if;

  select * into v_periodo from public.periodos where id = p_periodo_id and tenant_id = p_tenant_id;
  if v_periodo.id is null or v_periodo.contable_estado <> 'abierto' then
    raise exception 'CONTABLE_PERIODO_CERRADO: el periodo % no existe o no admite asientos',
      p_periodo_id;
  end if;

  v_fecha_corte := (make_date(v_periodo.anio, v_periodo.mes, 1) + interval '1 month - 1 day')::date;

  -- Idempotencia por periodo (§4.3, prueba 5) — mismo patrón que fn_contabilizar_periodo (CO-3).
  select id into v_existente from public.contable_comprobante
   where tenant_id = p_tenant_id and origen_modulo = 'contabilidad' and origen_entidad = 'deterioro'
     and origen_id = p_periodo_id and origen_evento = 'deterioro_periodo';
  if v_existente is not null then
    return v_existente;
  end if;

  select cd.contable_cuenta_id into v_cuenta_gasto
    from public.contable_cuenta_default cd
    join public.lista_tipos lt on lt.id = cd.evento_id
   where cd.tenant_id = p_tenant_id and lt.tipo = 'EVENTO_CONTABLE'
     and lt.codigo = 'GASTO_DETERIORO_CARTERA';
  select cd.contable_cuenta_id into v_cuenta_deterioro
    from public.contable_cuenta_default cd
    join public.lista_tipos lt on lt.id = cd.evento_id
   where cd.tenant_id = p_tenant_id and lt.tipo = 'EVENTO_CONTABLE'
     and lt.codigo = 'DETERIORO_CARTERA';
  if v_cuenta_gasto is null or v_cuenta_deterioro is null then
    raise exception 'CONTABLE_PARAMETRIZACION_PENDIENTE: GASTO_DETERIORO_CARTERA/'
      'DETERIORO_CARTERA no tienen cuenta contable predeterminada para este tenant';
  end if;

  select id into v_tipo_id from public.lista_tipos
   where tipo = 'TIPO_COMPROBANTE' and codigo = 'DETERIORO' and tenant_id is null;

  select coalesce(sum(ajuste), 0) into v_total_ajuste
    from public.contable_calcular_deterioro(p_tenant_id, v_fecha_corte);

  -- Sin cambio neto, no hay nada que registrar — un comprobante vacío no cuadra.
  if v_total_ajuste = 0 then
    return null;
  end if;

  insert into public.contable_comprobante (
    tenant_id, periodo_id, tipo_id, anio, fecha, descripcion,
    origen_modulo, origen_entidad, origen_id, origen_evento, creado_por
  ) values (
    p_tenant_id, p_periodo_id, v_tipo_id, v_periodo.anio, v_fecha_corte,
    'Deterioro de cartera — periodo ' || v_periodo.anio || '-' || lpad(v_periodo.mes::text, 2, '0'),
    'contabilidad', 'deterioro', p_periodo_id, 'deterioro_periodo', (select auth.uid())
  )
  returning id into v_comp_id;

  if v_total_ajuste > 0 then
    insert into public.contable_comprobante_detalle (
      tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion
    ) values
      (p_tenant_id, v_comp_id, 1, v_cuenta_gasto, v_total_ajuste, 0,
       'Gasto por deterioro de cartera'),
      (p_tenant_id, v_comp_id, 2, v_cuenta_deterioro, 0, v_total_ajuste,
       'Deterioro de cartera (correctora)');
  else
    insert into public.contable_comprobante_detalle (
      tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion
    ) values
      (p_tenant_id, v_comp_id, 1, v_cuenta_deterioro, abs(v_total_ajuste), 0,
       'Reversión de deterioro de cartera'),
      (p_tenant_id, v_comp_id, 2, v_cuenta_gasto, 0, abs(v_total_ajuste),
       'Reversión de gasto por deterioro de cartera');
  end if;

  perform public.fn_contabilizar_comprobante(v_comp_id);

  insert into public.contable_deterioro_detalle (
    tenant_id, comprobante_id, inmueble_id, cuenta_cartera_id, saldo,
    deterioro_calculado, deterioro_reconocido_previo, ajuste
  )
  select p_tenant_id, v_comp_id, inmueble_id, cuenta_cartera_id, saldo,
    deterioro_calculado, deterioro_reconocido, ajuste
  from public.contable_calcular_deterioro(p_tenant_id, v_fecha_corte);

  return v_comp_id;
end;
$$;

comment on function public.fn_contable_reconocer_deterioro(uuid, uuid) is
  'Única vía para reconocer deterioro de cartera — arma un comprobante tipo DETERIORO y llama '
  'a fn_contabilizar_comprobante (mismo patrón que fn_mant_capitalizar_activo, MANT-0). '
  'Registra solo el ajuste contra lo ya reconocido (nunca el total, CO-7 §4.3 prueba 6); un '
  'ajuste negativo (recuperación de cartera) invierte débito/crédito. Idempotente por periodo '
  'vía origen_evento=deterioro_periodo. SECURITY DEFINER con verificación interna de has_role.';
