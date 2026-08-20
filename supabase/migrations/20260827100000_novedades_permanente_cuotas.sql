-- ═══════════════════════════════════════════════════════════════════════
--  Conceptos avanzados Fase 4 — novedades permanentes y prorrateables
--
--  Hoy fn_aprobar_novedad genera EXACTAMENTE un cargo, siempre, ligado al
--  periodo de fecha_efectiva — una novedad es un evento de una sola vez.
--  Esta fase agrega dos variantes que NO reemplazan ese camino (una novedad
--  ni permanente ni prorrateable se comporta exactamente igual que hoy):
--   - permanente: se repite cada periodo hasta que alguien la inhabilite —
--     ej. una cuota de parqueadero adicional que no tiene fecha de fin.
--   - prorrateable: su monto total se reparte en N cuotas iguales, una por
--     periodo — ej. una reparación de $900.000 en 3 cuotas de $300.000.
--
--  Para ambas, fn_aprobar_novedad SALTA su inserción de cargo inmediata
--  (ver más abajo) — el cargo (o los N cargos) se generan periodo a periodo
--  vía la nueva fn_generar_cargos_novedades_periodo(), invocada desde
--  liquidar-periodo justo después de guardarLiquidacion(). Esto es lo que
--  hace que "correr la función 3 veces con periodos distintos" produzca
--  exactamente 3 cargos para una novedad prorrateable de 3 cuotas — no 1
--  (de la aprobación) + 2 (de la función).
--
--  cargos_origen_unico (20260816100000) YA permite varios cargos con el
--  mismo novedad_id — no hay que aflojar ninguna restricción existente,
--  solo agregar el camino de código nuevo (verificado directamente antes
--  de diseñar esta fase).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.novedades
  add column permanente boolean not null default false,
  add column inhabilitada_at timestamptz,
  add column inhabilitada_por uuid references public.profiles (id),
  add column prorrateable boolean not null default false,
  add column cuotas_totales int;

comment on column public.novedades.permanente is
  'Se repite cada periodo (fn_generar_cargos_novedades_periodo) hasta inhabilitada_at. '
  'Mutuamente excluyente con prorrateable.';
comment on column public.novedades.prorrateable is
  'Su monto se reparte en cuotas_totales cuotas iguales, una por periodo (novedad_cuotas). '
  'Mutuamente excluyente con permanente.';

alter table public.novedades
  add constraint novedades_permanente_prorrateable_exclusivos check (
    not (permanente and prorrateable)
  ),
  add constraint novedades_cuotas_totales_coherente check (
    (prorrateable and cuotas_totales is not null and cuotas_totales > 1)
    or (not prorrateable and cuotas_totales is null)
  ),
  add constraint novedades_inhabilitada_coherente check (
    (inhabilitada_at is null) = (inhabilitada_por is null)
    and (not permanente or inhabilitada_at is null or estado = 'aprobada')
  ),
  -- Una novedad recurrente sin concepto_id nunca aparecería clasificada
  -- como "Novedad" en la tabla de liquidación — el propósito entero de
  -- esta fase. Una novedad de una sola vez sigue sin exigirlo (compatible
  -- con lo que ya existe).
  add constraint novedades_recurrente_requiere_concepto check (
    not (permanente or prorrateable) or concepto_id is not null
  );

-- ── novedad_cuotas — ledger de cuotas de una novedad prorrateable ───────
-- Mismo criterio que presupuestos/presupuesto_rubros: una tabla, no
-- columnas sueltas — cada cuota es una fila con su propio estado
-- pendiente/generada. Todas las N filas se pre-materializan al aprobar
-- (fn_aprobar_novedad); periodo_id/cargo_id/generada_at quedan null hasta
-- que fn_generar_cargos_novedades_periodo() reclama y completa esa cuota.
create table public.novedad_cuotas (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  novedad_id   uuid not null references public.novedades (id),
  numero_cuota int not null check (numero_cuota > 0),
  monto_cuota  numeric(18, 2) not null check (monto_cuota <> 0),
  periodo_id   uuid references public.periodos (id),
  cargo_id     uuid references public.cargos (id),
  generada_at  timestamptz,

  constraint novedad_cuotas_unica unique (novedad_id, numero_cuota),
  constraint novedad_cuotas_generada_coherente check (
    (periodo_id is null and cargo_id is null and generada_at is null)
    or (periodo_id is not null and cargo_id is not null and generada_at is not null)
  )
);

alter table public.novedad_cuotas enable row level security;
alter table public.novedad_cuotas force row level security;

create index novedad_cuotas_tenant_idx on public.novedad_cuotas (tenant_id);
create index novedad_cuotas_novedad_idx on public.novedad_cuotas (novedad_id);

comment on table public.novedad_cuotas is
  'Ledger de cuotas de una novedad prorrateable — una fila por cuota, pre-materializadas al '
  'aprobar (fn_aprobar_novedad). Pendiente: periodo_id/cargo_id/generada_at null. Generada: los '
  'tres poblados a la vez, por fn_generar_cargos_novedades_periodo(), y ya no cambia (append-only '
  'una vez generada, ver guard_novedad_cuota_generada).';

create function public.guard_novedad_cuota_generada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.generada_at is not null then
    raise exception 'NOVEDAD_CUOTA_INMUTABLE: la cuota % de la novedad % ya fue generada — no se puede modificar',
      old.numero_cuota, old.novedad_id;
  end if;
  return new;
end;
$$;

create trigger guard_novedad_cuota_generada
  before update on public.novedad_cuotas
  for each row execute function public.guard_novedad_cuota_generada();

-- Sin política de insert/update para `authenticated`: igual que cargos/
-- novedades, ambas rutas de escritura viven en funciones service_role
-- (fn_aprobar_novedad / fn_generar_cargos_novedades_periodo).
create policy novedad_cuotas_select_agent_auditor
  on public.novedad_cuotas for select
  to authenticated
  using (public.has_role(tenant_id, array['agent', 'auditor']::public.tenant_role_t[]));

-- ── singleton: un solo concepto tipo_recurrencia='novedad' vivo por tenant ─
-- "vivo" = no archivado — permite reemplazar el singleton archivando el
-- viejo y creando uno nuevo, sin quedar bloqueado para siempre.
create unique index conceptos_novedad_singleton_idx on public.conceptos (tenant_id)
  where tipo_recurrencia = 'novedad' and estado <> 'archivado';

comment on index public.conceptos_novedad_singleton_idx is
  'Conceptos avanzados Fase 4: exactamente un concepto tipo_recurrencia=''novedad'' no-archivado '
  'por tenant — el "concepto Novedad" singleton que novedades.concepto_id referencia (nunca entra '
  'al barrido de liquidar-periodo, ver temporal.ts::conceptoAplicaEnPeriodo).';

-- ── fn_aprobar_novedad: salta el cargo inmediato para permanente/prorrateable,
--    pre-puebla novedad_cuotas para prorrateable. El resto de la función
--    (transición de estado, approved_by/at) no cambia. ────────────────────
create or replace function public.fn_aprobar_novedad(p_novedad_id uuid, p_actor_id uuid)
returns public.novedades
language plpgsql
set search_path = ''
as $$
declare
  v_novedad public.novedades;
  v_anio int;
  v_mes int;
  v_periodo_id uuid;
  v_monto_base numeric(18, 2);
  i int;
begin
  select * into v_novedad from public.novedades where id = p_novedad_id;
  if v_novedad.id is null then
    raise exception 'NOVEDAD_NO_ENCONTRADA: % no existe', p_novedad_id;
  end if;

  v_anio := extract(year from v_novedad.fecha_efectiva);
  v_mes := extract(month from v_novedad.fecha_efectiva);

  select id into v_periodo_id
    from public.periodos
   where tenant_id = v_novedad.tenant_id and anio = v_anio and mes = v_mes;
  if v_periodo_id is null then
    raise exception 'PERIODO_NO_ENCONTRADO_PARA_FECHA_EFECTIVA: no existe periodo %-% para el '
      'tenant % (novedad %)', v_anio, v_mes, v_novedad.tenant_id, p_novedad_id;
  end if;

  update public.novedades
     set estado = 'aprobada', approved_by = p_actor_id, approved_at = now()
   where id = p_novedad_id
  returning * into v_novedad;

  if v_novedad.permanente or v_novedad.prorrateable then
    -- Ninguna: el cargo (o los cargos) los genera fn_generar_cargos_novedades_periodo,
    -- periodo a periodo — no aquí, para no duplicar con esa función.
    if v_novedad.prorrateable then
      v_monto_base := round(v_novedad.monto / v_novedad.cuotas_totales, 2);
      for i in 1 .. (v_novedad.cuotas_totales - 1) loop
        insert into public.novedad_cuotas (tenant_id, novedad_id, numero_cuota, monto_cuota)
        values (v_novedad.tenant_id, v_novedad.id, i, v_monto_base);
      end loop;
      -- La última cuota absorbe el residual del redondeo — la suma de
      -- cuotas siempre reconcilia exacto con el monto total (mismo
      -- principio que allocate()/mayor_resto, aplicado a mano aquí porque
      -- allocate() vive en TypeScript, no en plpgsql).
      insert into public.novedad_cuotas (tenant_id, novedad_id, numero_cuota, monto_cuota)
      values (
        v_novedad.tenant_id, v_novedad.id, v_novedad.cuotas_totales,
        v_novedad.monto - v_monto_base * (v_novedad.cuotas_totales - 1)
      );
    end if;
  else
    -- AD-33: el cargo hereda el signo de novedades.monto (AD-30) — un
    -- DISCOUNT/CREDIT/REFUND negativo reduce el saldo del inmueble sin pasar
    -- por pago_aplicaciones (imputarPago() ya ignora cargos con
    -- montoPendiente <= 0, packages/liquidation-engine/src/cuenta-corriente.ts).
    insert into public.cargos (
      tenant_id, inmueble_id, periodo_id, categoria, origen_tipo, novedad_id, concepto_id, monto_original
    ) values (
      v_novedad.tenant_id, v_novedad.inmueble_id, v_periodo_id, 'otro', 'novedad', v_novedad.id,
      v_novedad.concepto_id, v_novedad.monto
    );
  end if;

  return v_novedad;
end;
$$;

-- ── fn_generar_cargos_novedades_periodo: paso periódico, invocado desde
--    liquidar-periodo justo después de guardarLiquidacion(). Idempotente:
--    correr dos veces sobre el mismo periodo no duplica nada. ────────────
create function public.fn_generar_cargos_novedades_periodo(p_tenant_id uuid, p_periodo_id uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_novedad record;
  v_cuota record;
  v_cargo_id uuid;
  v_generados int := 0;
begin
  -- permanentes activas sin cargo ya generado en este periodo.
  for v_novedad in
    select n.* from public.novedades n
    where n.tenant_id = p_tenant_id
      and n.estado = 'aprobada'
      and n.permanente = true
      and n.inhabilitada_at is null
      and not exists (
        select 1 from public.cargos c
        where c.novedad_id = n.id and c.periodo_id = p_periodo_id
      )
  loop
    insert into public.cargos (
      tenant_id, inmueble_id, periodo_id, categoria, origen_tipo, novedad_id, concepto_id, monto_original
    ) values (
      p_tenant_id, v_novedad.inmueble_id, p_periodo_id, 'otro', 'novedad', v_novedad.id,
      v_novedad.concepto_id, v_novedad.monto
    );
    v_generados := v_generados + 1;
  end loop;

  -- prorrateables: la próxima cuota pendiente, una por novedad por periodo.
  for v_novedad in
    select n.* from public.novedades n
    where n.tenant_id = p_tenant_id
      and n.estado = 'aprobada'
      and n.prorrateable = true
      and not exists (
        select 1 from public.novedad_cuotas nc
        where nc.novedad_id = n.id and nc.periodo_id = p_periodo_id
      )
  loop
    select * into v_cuota from public.novedad_cuotas
     where novedad_id = v_novedad.id and cargo_id is null
     order by numero_cuota
     limit 1;
    if v_cuota.id is null then
      continue; -- ya se generaron todas sus cuotas
    end if;

    insert into public.cargos (
      tenant_id, inmueble_id, periodo_id, categoria, origen_tipo, novedad_id, concepto_id, monto_original
    ) values (
      p_tenant_id, v_novedad.inmueble_id, p_periodo_id, 'otro', 'novedad', v_novedad.id,
      v_novedad.concepto_id, v_cuota.monto_cuota
    )
    returning id into v_cargo_id;

    update public.novedad_cuotas
       set periodo_id = p_periodo_id, cargo_id = v_cargo_id, generada_at = now()
     where id = v_cuota.id;

    v_generados := v_generados + 1;
  end loop;

  return v_generados;
end;
$$;

revoke execute on function public.fn_generar_cargos_novedades_periodo(uuid, uuid) from public, anon, authenticated;

-- ── fn_inhabilitar_novedad: apaga una novedad permanente — no borra nada,
--    solo detiene que fn_generar_cargos_novedades_periodo() siga generando
--    cargos futuros. Los cargos ya generados quedan intactos (append-only). ─
create function public.fn_inhabilitar_novedad(p_novedad_id uuid, p_actor_id uuid)
returns public.novedades
language plpgsql
set search_path = ''
as $$
declare
  v_novedad public.novedades;
begin
  select * into v_novedad from public.novedades where id = p_novedad_id;
  if v_novedad.id is null then
    raise exception 'NOVEDAD_NO_ENCONTRADA: % no existe', p_novedad_id;
  end if;

  if not v_novedad.permanente then
    raise exception 'NOVEDAD_NO_PERMANENTE: % no es una novedad permanente — nada que inhabilitar',
      p_novedad_id;
  end if;

  if v_novedad.inhabilitada_at is not null then
    raise exception 'NOVEDAD_YA_INHABILITADA: % ya fue inhabilitada el %',
      p_novedad_id, v_novedad.inhabilitada_at;
  end if;

  update public.novedades
     set inhabilitada_at = now(), inhabilitada_por = p_actor_id
   where id = p_novedad_id
  returning * into v_novedad;

  return v_novedad;
end;
$$;

revoke execute on function public.fn_inhabilitar_novedad(uuid, uuid) from public, anon, authenticated;
