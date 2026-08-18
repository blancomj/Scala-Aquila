-- ═══════════════════════════════════════════════════════════════════════
--  E9 seguimiento · Ingreso operacional real conectado al árbol
--
--  Gap real (no diferido): CUOTA_ADMIN — el ingreso operacional
--  dominante — se recauda vía liquidacion_lineas→cargos→pagos, un camino
--  totalmente separado de presupuesto_cuenta/presupuesto_ejecucion. Antes
--  de este corte, la sección "Ingresos" de Componentes/Ejecución siempre
--  aparecía vacía aunque el tenant sí estuviera facturando y cobrando
--  cuotas reales — "Excedente del ejercicio" (20260823270000) nunca podía
--  ser una cifra real, solo puro gasto.
--
--  Fix: presupuesto_cuenta gana concepto_id (nullable) — qué concepto de
--  cobro (AEL) realiza el ingreso de esa cuenta hoja. Cuando está
--  poblado, presupuesto_cuenta_ejecucion() suma cargos.monto_original
--  (base devengo/accrual — lo facturado del periodo, igual criterio que
--  "COBRO DESPENSAS COMUNES" en el Estado de Resultado real revisado, no
--  lo efectivamente recaudado en caja) en vez de depender de
--  presupuesto_ejecucion — así que NO hace falta doble captura manual de
--  lo que el motor de liquidación ya está registrando.
--
--  Una cuenta con concepto_id vinculado deja de admitir movimientos
--  manuales en presupuesto_ejecucion (evita doble conteo) y deja de poder
--  ganar subcuentas (solo hojas tienen concepto_id, mismo criterio que
--  rubros/E8).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.presupuesto_cuenta
  add column concepto_id uuid references public.conceptos (id);

comment on column public.presupuesto_cuenta.concepto_id is
  'Concepto de cobro (AEL) cuyo cargos.monto_original realiza el ingreso de esta cuenta hoja — '
  'solo naturaleza=ingreso (guard_presupuesto_cuenta_concepto). Cuando está poblado, '
  'presupuesto_cuenta_ejecucion() suma cargos automáticamente en vez de depender de '
  'presupuesto_ejecucion (evita doble captura manual de lo que el motor de liquidación ya '
  'registra) — ver 20260823290000.';

-- ── guard: concepto_id solo en hoja + naturaleza ingreso + mismo tenant ──
create function public.guard_presupuesto_cuenta_concepto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_concepto_tenant uuid;
begin
  if new.concepto_id is null then
    return new;
  end if;

  if not new.es_hoja then
    raise exception 'CUENTA_NO_ES_HOJA: % agrupa subcuentas — un concepto de cobro solo puede '
      'vincularse a una cuenta hoja', new.id;
  end if;

  if new.naturaleza <> 'ingreso' then
    raise exception 'CUENTA_NATURALEZA_INVALIDA: % es egreso — un concepto de cobro solo puede '
      'vincularse a una cuenta de ingreso', new.id;
  end if;

  select tenant_id into v_concepto_tenant from public.conceptos where id = new.concepto_id;

  if v_concepto_tenant is null then
    raise exception 'CONCEPTO_INEXISTENTE: concepto_id % no existe', new.concepto_id;
  end if;

  if v_concepto_tenant <> new.tenant_id then
    raise exception 'CONCEPTO_TENANT_INCONSISTENTE: el concepto % pertenece a otro tenant',
      new.concepto_id;
  end if;

  return new;
end;
$$;

create trigger guard_presupuesto_cuenta_concepto
  before insert or update of concepto_id on public.presupuesto_cuenta
  for each row execute function public.guard_presupuesto_cuenta_concepto();

-- ── guard_presupuesto_cuenta_arbol: una cuenta con concepto no puede ganar hijos ──
create or replace function public.guard_presupuesto_cuenta_arbol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.presupuesto_cuenta%rowtype;
  v_profundidad_relativa int;
begin
  if tg_op = 'UPDATE' and old.parent_id is distinct from new.parent_id then
    select coalesce(max(nivel) - old.nivel, 0) into v_profundidad_relativa
    from (
      with recursive descendientes as (
        select id, nivel from public.presupuesto_cuenta where parent_id = old.id
        union all
        select c.id, c.nivel from public.presupuesto_cuenta c join descendientes d on c.parent_id = d.id
      )
      select nivel from descendientes
    ) sub;
  end if;

  if new.parent_id is null then
    if v_profundidad_relativa > 3 then
      raise exception 'CUENTA_PROFUNDIDAD_EXCEDIDA: mover % a cuenta raíz dejaría descendientes '
        'en nivel % (máximo 4)', old.id, 1 + v_profundidad_relativa;
    end if;
    new.nivel := 1;
    new.ruta := lpad(new.orden::text, 4, '0');
    return new;
  end if;

  select * into v_parent from public.presupuesto_cuenta where id = new.parent_id;

  if v_parent.id is null then
    raise exception 'CUENTA_PADRE_INEXISTENTE: parent_id % no existe', new.parent_id;
  end if;

  if v_parent.tenant_id <> new.tenant_id then
    raise exception 'CUENTA_TENANT_INCONSISTENTE: la cuenta padre % pertenece a otro tenant',
      new.parent_id;
  end if;

  if tg_op = 'UPDATE' then
    if new.parent_id in (
      with recursive descendientes as (
        select id from public.presupuesto_cuenta where parent_id = old.id
        union all
        select c.id from public.presupuesto_cuenta c join descendientes d on c.parent_id = d.id
      )
      select id from descendientes
    ) then
      raise exception 'CUENTA_CICLO: % no puede reasignarse bajo su propio descendiente %',
        old.id, new.parent_id;
    end if;

    if old.parent_id is distinct from new.parent_id
       and (v_parent.nivel + 1 + v_profundidad_relativa) > 4 then
      raise exception 'CUENTA_PROFUNDIDAD_EXCEDIDA: mover % bajo % dejaría descendientes en '
        'nivel % (máximo 4)', old.id, new.parent_id, v_parent.nivel + 1 + v_profundidad_relativa;
    end if;
  end if;

  if v_parent.naturaleza <> new.naturaleza then
    raise exception 'CUENTA_NATURALEZA_MEZCLADA: % no puede colgar de % — no se mezcla '
      'ingreso/egreso bajo el mismo nodo (E8)', new.naturaleza, v_parent.naturaleza;
  end if;

  if v_parent.nivel >= 4 then
    raise exception 'CUENTA_PROFUNDIDAD_MAXIMA: % ya está en el nivel máximo (4) — no admite '
      'hijos', v_parent.id;
  end if;

  if v_parent.concepto_id is not null then
    raise exception 'CUENTA_TIENE_CONCEPTO: % ya tiene un concepto de cobro vinculado — no '
      'puede ganar subcuentas (solo hojas admiten concepto_id)', v_parent.id;
  end if;

  new.nivel := v_parent.nivel + 1;
  new.ruta := v_parent.ruta || '.' || lpad(new.orden::text, 4, '0');

  if v_parent.es_hoja then
    update public.presupuesto_cuenta set es_hoja = false where id = v_parent.id;
  end if;

  return new;
end;
$$;

-- ── guard_presupuesto_ejecucion_cuenta: rechaza manual si hay concepto vinculado ──
create or replace function public.guard_presupuesto_ejecucion_cuenta()
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

  if v_cuenta.concepto_id is not null then
    raise exception 'CUENTA_CONCEPTO_AUTOMATICO: % ya recibe su ejecutado automáticamente del '
      'concepto % — no admite movimientos manuales (evita doble conteo)', new.cuenta_id,
      v_cuenta.concepto_id;
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

-- ── presupuesto_cuenta_ejecucion: ejecutado = manual (E9) + automático (concepto→cargos) ──
create or replace function public.presupuesto_cuenta_ejecucion(p_presupuesto_id uuid)
returns table (cuenta_id uuid, presupuestado numeric, ejecutado numeric)
language sql
stable
set search_path = ''
as $$
  with recursive movimientos as (
    -- manual (E9) — cuentas sin concepto_id vinculado (el guard lo exige)
    select pe.cuenta_id, pe.monto
    from public.presupuesto_ejecucion pe
    join public.periodos pr on pr.id = pe.periodo_id
    join public.presupuestos pp on pp.id = p_presupuesto_id and pp.anio = pr.anio
    where pe.tenant_id = pp.tenant_id
    union all
    -- automático — cuentas con concepto_id: lo facturado (devengo), no lo recaudado en caja
    select c.id as cuenta_id, cg.monto_original as monto
    from public.presupuesto_cuenta c
    join public.cargos cg on cg.concepto_id = c.concepto_id
    join public.periodos pr on pr.id = cg.periodo_id
    join public.presupuestos pp on pp.id = p_presupuesto_id and pp.anio = pr.anio
    where c.concepto_id is not null and cg.tenant_id = pp.tenant_id
  ),
  hoja as (
    select
      c.id,
      c.parent_id,
      coalesce(r.monto_anual, 0) as presupuestado_propio,
      coalesce(m.ejecutado_propio, 0) as ejecutado_propio
    from public.presupuestos p
    join public.presupuesto_cuenta c on c.tenant_id = p.tenant_id
    left join public.presupuesto_rubros r
      on r.cuenta_id = c.id and r.presupuesto_id = p_presupuesto_id
    left join (
      select mv.cuenta_id, sum(mv.monto) as ejecutado_propio
      from movimientos mv
      group by mv.cuenta_id
    ) m on m.cuenta_id = c.id
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
  'Rollup recursivo que empareja presupuesto_rubros.monto_anual (presupuestado) contra '
  'ejecutado por cuenta hoja: presupuesto_ejecucion.monto para cuentas manuales (E9), o '
  'Σ cargos.monto_original (devengo) para cuentas con concepto_id vinculado (20260823290000) — '
  'nunca ambas para la misma cuenta (el guard de presupuesto_ejecucion lo impide). Acotado al '
  'año fiscal del presupuesto. La variación (absoluta/%, con o sin prorrateo mensual) se calcula '
  'en la capa de presentación, no aquí.';
