-- ═══════════════════════════════════════════════════════════════════════
--  E9 · Ejecución presupuestal (presupuestado vs. real)
--  Propietario: gap analysis contra Estado de Resultado Integral real
--  (Casos de uso/Presupuesto/Ejemplo de presupuesto.pdf, Almendro P.H.) +
--  Palmar del Viento / Tesoro I / CTCP-15 (sesion_presupuesto_copropiedad_
--  AQUILA.md) — los tres coinciden en que el patrón central de una
--  copropiedad real es Presupuesto → Ejecución → Variación, no el
--  presupuesto aislado. Postpuesta explícitamente en E8 (comentario en
--  presupuesto_rubros sobre la tabla `gastos`) y en el propio
--  20260823200000 ("Deliberadamente FUERA de este corte").
--
--  Alcance de ESTE corte:
--    • presupuesto_ejecucion — ledger append-only de movimientos reales
--      (ingreso o egreso, según la naturaleza de la cuenta) contra una
--      hoja de presupuesto_cuenta, ligados a un periodo — mismo patrón
--      que cargos/pagos/fondo_movimientos (16 §68, PLAN §4.3).
--    • presupuesto_cuenta_ejecucion() — rollup recursivo que empareja
--      presupuestado (presupuesto_rubros, ya existente) vs. ejecutado
--      (presupuesto_ejecucion, nuevo) por nodo del árbol, para un
--      presupuesto puntual. Reutiliza el mismo patrón bottom-up de
--      presupuesto_cuenta_totales() (20260823200000) sin tocarla.
--
--  Deliberadamente FUERA de este corte:
--    • Reversión/corrección de un movimiento ya registrado — igual que
--      pagos (16 §68), corregir un monto mal registrado es un ajuste
--      nuevo (futuro, patrón novedades), nunca un UPDATE. No se modela
--      aquí por no existir todavía ese mecanismo para este ledger.
--    • Vincular automáticamente presupuesto_ejecucion con cargos/pagos
--      para que CUOTA_ADMIN se compute solo — el ingreso operacional
--      principal ya se recauda vía liquidacion_lineas/cargos/pagos; este
--      ledger cubre el resto (todo egreso, e ingresos no operacionales
--      como multas/alquileres/intereses) sin intentar unificar ambos
--      caminos en este corte.
--    • Proration mensual del presupuesto anual para la variación — se
--      deja como responsabilidad de la capa de presentación (UI), no del
--      rollup: el rollup solo expone presupuestado (anual) y ejecutado
--      (acumulado del año), la UI decide cómo mostrarlos.
--
--  Escritura directa por rol `agent` (no vía Edge Function): a diferencia
--  de cargos/pagos (que derivan de una orquestación con invariantes
--  cross-fila — sobreaplicación, imputación — que exigen un solo punto de
--  entrada privilegiado), un movimiento de ejecución presupuestal no
--  tiene esa clase de invariante; sigue el mismo criterio ya usado para
--  presupuesto_cuenta/presupuesto_rubros (E8): RLS + guards de fila
--  bastan, sin necesitar una Edge Function dedicada.
-- ═══════════════════════════════════════════════════════════════════════

create table public.presupuesto_ejecucion (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  cuenta_id      uuid not null references public.presupuesto_cuenta (id),
  periodo_id     uuid not null references public.periodos (id),
  monto          numeric(18, 2) not null check (monto > 0),
  descripcion    text,
  referencia     text,
  registrado_por uuid references public.profiles (id),
  created_at     timestamptz not null default now()
);

alter table public.presupuesto_ejecucion enable row level security;
alter table public.presupuesto_ejecucion force row level security;

create index presupuesto_ejecucion_tenant_idx on public.presupuesto_ejecucion (tenant_id);
create index presupuesto_ejecucion_cuenta_idx on public.presupuesto_ejecucion (cuenta_id);
create index presupuesto_ejecucion_periodo_idx on public.presupuesto_ejecucion (periodo_id);

comment on table public.presupuesto_ejecucion is
  'Ledger append-only de movimientos reales (E9) contra una hoja de presupuesto_cuenta — cierra '
  'la brecha "ejecutado vs. presupuestado" identificada en los 3 modelos reales revisados '
  '(Casos de uso/Presupuesto). No reemplaza cargos/pagos (CUOTA_ADMIN sigue recaudándose por '
  'ese camino); cubre el resto: todo egreso operativo y los ingresos no operacionales '
  '(multas, alquileres, intereses) que hoy no tienen ningún registro de lo realmente ejecutado.';

-- ── guard: cuenta_id debe ser hoja del propio tenant; periodo_id del mismo tenant ──
create function public.guard_presupuesto_ejecucion_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta public.presupuesto_cuenta%rowtype;
  v_periodo_tenant uuid;
begin
  select * into v_cuenta from public.presupuesto_cuenta where id = new.cuenta_id;

  if v_cuenta.id is null then
    raise exception 'CUENTA_INEXISTENTE: cuenta_id % no existe', new.cuenta_id;
  end if;

  if v_cuenta.tenant_id <> new.tenant_id then
    raise exception 'CUENTA_TENANT_INCONSISTENTE: la cuenta % pertenece a otro tenant',
      new.cuenta_id;
  end if;

  if not v_cuenta.es_hoja then
    raise exception 'CUENTA_NO_ES_HOJA: % agrupa subcuentas — un movimiento de ejecución solo '
      'puede registrarse contra una cuenta hoja (E9)', new.cuenta_id;
  end if;

  select tenant_id into v_periodo_tenant from public.periodos where id = new.periodo_id;

  if v_periodo_tenant is null then
    raise exception 'PERIODO_INEXISTENTE: periodo_id % no existe', new.periodo_id;
  end if;

  if v_periodo_tenant <> new.tenant_id then
    raise exception 'PERIODO_TENANT_INCONSISTENTE: el periodo % pertenece a otro tenant',
      new.periodo_id;
  end if;

  return new;
end;
$$;

create trigger guard_presupuesto_ejecucion_cuenta
  before insert on public.presupuesto_ejecucion
  for each row execute function public.guard_presupuesto_ejecucion_cuenta();

-- Append-only (16 §68, PLAN §4.3, mismo criterio que cargos/pagos/fondo_movimientos) — la única
-- excepción es el DELETE que arrastra la cascada de tenants (E8, 20260823250000).
create trigger presupuesto_ejecucion_append_only
  before update or delete on public.presupuesto_ejecucion
  for each row execute function public.forbid_mutation_salvo_tenant_borrado();

-- ── RLS: lectura agent+auditor (mismo criterio que cargos/pagos); escritura agent ──
create policy presupuesto_ejecucion_select_agent_auditor
  on public.presupuesto_ejecucion for select
  to authenticated
  using (public.has_role(tenant_id, array['agent', 'auditor']::public.tenant_role_t[]));

create policy presupuesto_ejecucion_insert_agent
  on public.presupuesto_ejecucion for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ── presupuesto_cuenta_ejecucion: presupuestado vs. ejecutado por nodo ──
-- Mismo rollup bottom-up de presupuesto_cuenta_totales() (20260823200000), extendido con una
-- segunda hoja de acumulación (ejecutado) que solo cuenta movimientos de periodos del mismo año
-- fiscal del presupuesto consultado. No es security definer, por el mismo motivo que
-- presupuesto_cuenta_totales: las policies de select ya existentes deben seguir aplicando.
create function public.presupuesto_cuenta_ejecucion(p_presupuesto_id uuid)
returns table (cuenta_id uuid, presupuestado numeric, ejecutado numeric)
language sql
stable
set search_path = ''
as $$
  with recursive hoja as (
    select
      c.id,
      c.parent_id,
      coalesce(r.monto_anual, 0) as presupuestado_propio,
      coalesce(e.ejecutado_propio, 0) as ejecutado_propio
    from public.presupuestos p
    join public.presupuesto_cuenta c on c.tenant_id = p.tenant_id
    left join public.presupuesto_rubros r
      on r.cuenta_id = c.id and r.presupuesto_id = p_presupuesto_id
    left join (
      select pe.cuenta_id, sum(pe.monto) as ejecutado_propio
      from public.presupuesto_ejecucion pe
      join public.periodos pr on pr.id = pe.periodo_id
      join public.presupuestos pp on pp.id = p_presupuesto_id and pp.anio = pr.anio
      where pe.tenant_id = pp.tenant_id
      group by pe.cuenta_id
    ) e on e.cuenta_id = c.id
    where p.id = p_presupuesto_id
  ),
  acumulado as (
    select h.id as cuenta_id, h.id as ancestro_id, h.presupuestado_propio, h.ejecutado_propio
    from hoja h
    union all
    select a.cuenta_id, c.parent_id, a.presupuestado_propio, a.ejecutado_propio
    from acumulado a
    join public.presupuesto_cuenta c on c.id = a.ancestro_id
    where c.parent_id is not null
  )
  select
    ancestro_id as cuenta_id,
    sum(presupuestado_propio) as presupuestado,
    sum(ejecutado_propio) as ejecutado
  from acumulado
  group by ancestro_id;
$$;

comment on function public.presupuesto_cuenta_ejecucion(uuid) is
  'Rollup recursivo (E9) que empareja presupuesto_rubros.monto_anual (presupuestado) contra '
  'presupuesto_ejecucion.monto (ejecutado, acotado al año fiscal del presupuesto) por cada nodo '
  'del árbol de presupuesto_cuenta. La variación (absoluta/%) y cualquier proration mensual se '
  'calculan en la capa de presentación, no aquí.';
