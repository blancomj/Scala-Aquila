-- ═══════════════════════════════════════════════════════════════════════
--  E9 corrección de dirección · el concepto elige su cuenta presupuestal,
--  no al revés
--
--  presupuesto_cuenta.concepto_id (20260823290000) hacía que la CUENTA
--  saliera a buscar qué concepto la cobra. Inconsistente con el patrón ya
--  usado en novedades.presupuesto_cuenta_id (20260826100000), donde es la
--  novedad (lo que cobra) la que apunta a su cuenta. Se invierte: ahora es
--  conceptos.presupuesto_cuenta_id.
--
--  Ventaja real, no solo simetría: con la FK en la cuenta, una cuenta solo
--  podía recibir de UN concepto (se llegó a agregar una deduplicación en
--  el drawer para evitarlo). Con la FK en el concepto, varios conceptos
--  pueden clasificar bajo la MISMA cuenta sin crear una hoja artificial
--  por cada uno (ej. "Arriendo salón" + "Arriendo BBQ" bajo "Arrendamientos")
--  — por eso el índice nuevo NO es único, y presupuesto_cuenta_ejecucion()
--  simplemente suma los cargos de todos los conceptos que apunten a la
--  cuenta.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. columna nueva + backfill del dato ya sembrado (GC-001) ───────────
alter table public.conceptos
  add column presupuesto_cuenta_id uuid references public.presupuesto_cuenta (id);

update public.conceptos c
set presupuesto_cuenta_id = pc.id
from public.presupuesto_cuenta pc
where pc.concepto_id = c.id;

comment on column public.conceptos.presupuesto_cuenta_id is
  'Cuenta presupuestal de ingreso (hoja del árbol E8) que este concepto de cobro alimenta — '
  'reemplaza presupuesto_cuenta.concepto_id (20260823290000, dirección invertida). Varios '
  'conceptos pueden apuntar a la misma cuenta: presupuesto_cuenta_ejecucion() suma sus cargos '
  'juntos. NULL = sin clasificar en el presupuesto.';

-- ── 2. guard: presupuesto_cuenta_id solo hacia hoja + naturaleza ingreso ──
-- Mismo criterio que guard_novedad_tipo_presupuesto (20260826100000) y el
-- guard_presupuesto_cuenta_concepto que este reemplaza.
create function public.guard_concepto_presupuesto_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta public.presupuesto_cuenta%rowtype;
begin
  if new.presupuesto_cuenta_id is null then
    return new;
  end if;

  select * into v_cuenta from public.presupuesto_cuenta where id = new.presupuesto_cuenta_id;

  if v_cuenta.id is null then
    raise exception 'CUENTA_INEXISTENTE: presupuesto_cuenta_id % no existe',
      new.presupuesto_cuenta_id;
  end if;

  if v_cuenta.tenant_id <> new.tenant_id then
    raise exception 'CUENTA_TENANT_INCONSISTENTE: la cuenta % pertenece a otro tenant',
      new.presupuesto_cuenta_id;
  end if;

  if not v_cuenta.es_hoja then
    raise exception 'CUENTA_NO_ES_HOJA: % agrupa subcuentas — un concepto de cobro solo puede '
      'vincularse a una cuenta hoja', new.presupuesto_cuenta_id;
  end if;

  if v_cuenta.naturaleza <> 'ingreso' then
    raise exception 'CUENTA_NATURALEZA_INVALIDA: % es egreso — un concepto de cobro solo puede '
      'vincularse a una cuenta de ingreso', new.presupuesto_cuenta_id;
  end if;

  return new;
end;
$$;

create trigger guard_concepto_presupuesto_cuenta
  before insert or update of presupuesto_cuenta_id on public.conceptos
  for each row execute function public.guard_concepto_presupuesto_cuenta();

-- ── 3. guard_presupuesto_cuenta_arbol: concepto_id ahora se busca en conceptos ──
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

  if exists (select 1 from public.conceptos where presupuesto_cuenta_id = v_parent.id) then
    raise exception 'CUENTA_TIENE_CONCEPTO: % ya tiene un concepto de cobro vinculado — no '
      'puede ganar subcuentas (solo hojas admiten concepto de cobro)', v_parent.id;
  end if;

  new.nivel := v_parent.nivel + 1;
  new.ruta := v_parent.ruta || '.' || lpad(new.orden::text, 4, '0');

  if v_parent.es_hoja then
    update public.presupuesto_cuenta set es_hoja = false where id = v_parent.id;
  end if;

  return new;
end;
$$;

-- ── 4. guard_presupuesto_ejecucion_cuenta: idem, exists() contra conceptos ──
create or replace function public.guard_presupuesto_ejecucion_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta public.presupuesto_cuenta%rowtype;
  v_periodo_tenant uuid;
  v_original public.presupuesto_ejecucion%rowtype;
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

  if exists (select 1 from public.conceptos where presupuesto_cuenta_id = new.cuenta_id) then
    raise exception 'CUENTA_CONCEPTO_AUTOMATICO: % ya recibe su ejecutado automáticamente de un '
      'concepto vinculado — no admite movimientos manuales (evita doble conteo)', new.cuenta_id;
  end if;

  select tenant_id into v_periodo_tenant from public.periodos where id = new.periodo_id;

  if v_periodo_tenant is null then
    raise exception 'PERIODO_INEXISTENTE: periodo_id % no existe', new.periodo_id;
  end if;

  if v_periodo_tenant <> new.tenant_id then
    raise exception 'PERIODO_TENANT_INCONSISTENTE: el periodo % pertenece a otro tenant',
      new.periodo_id;
  end if;

  if new.monto < 0 and new.ajusta_movimiento_id is null then
    raise exception 'REVERSION_SIN_ORIGEN: un monto negativo debe corregir un movimiento '
      'existente (ajusta_movimiento_id) — no se admite un negativo suelto';
  end if;

  if new.ajusta_movimiento_id is not null then
    select * into v_original
    from public.presupuesto_ejecucion where id = new.ajusta_movimiento_id;

    if v_original.id is null then
      raise exception 'MOVIMIENTO_INEXISTENTE: ajusta_movimiento_id % no existe',
        new.ajusta_movimiento_id;
    end if;

    if v_original.tenant_id <> new.tenant_id then
      raise exception 'MOVIMIENTO_TENANT_INCONSISTENTE: % pertenece a otro tenant',
        new.ajusta_movimiento_id;
    end if;

    if v_original.cuenta_id <> new.cuenta_id then
      raise exception 'REVERSION_CUENTA_DISTINTA: % corrige un movimiento de otra cuenta (%) — '
        'una reversión debe ser contra la misma cuenta; para mover el gasto a otra cuenta, '
        'registra dos movimientos nuevos', new.ajusta_movimiento_id, v_original.cuenta_id;
    end if;
  end if;

  return new;
end;
$$;

-- ── 5. presupuesto_cuenta_ejecucion: automático ahora vía conceptos ─────
create or replace function public.presupuesto_cuenta_ejecucion(p_presupuesto_id uuid)
returns table (cuenta_id uuid, presupuestado numeric, ejecutado numeric)
language sql
stable
set search_path = ''
as $$
  with recursive movimientos as (
    -- manual (E9) — cuentas sin ningún concepto vinculado (el guard lo exige)
    select pe.cuenta_id, pe.monto
    from public.presupuesto_ejecucion pe
    join public.periodos pr on pr.id = pe.periodo_id
    join public.presupuestos pp on pp.id = p_presupuesto_id and pp.anio = pr.anio
    where pe.tenant_id = pp.tenant_id
    union all
    -- automático — cuentas con uno o más conceptos vinculados: lo facturado (devengo),
    -- no lo efectivamente recaudado en caja. Varios conceptos por cuenta se suman juntos.
    select co.presupuesto_cuenta_id as cuenta_id, cg.monto_original as monto
    from public.conceptos co
    join public.cargos cg on cg.concepto_id = co.id
    join public.periodos pr on pr.id = cg.periodo_id
    join public.presupuestos pp on pp.id = p_presupuesto_id and pp.anio = pr.anio
    where co.presupuesto_cuenta_id is not null and cg.tenant_id = pp.tenant_id
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
  'ejecutado por cuenta hoja: presupuesto_ejecucion.monto para cuentas sin concepto vinculado '
  '(E9), o Σ cargos.monto_original (devengo) de todos los conceptos.presupuesto_cuenta_id que '
  'apunten a la cuenta (20260830200000, dirección invertida respecto a 20260823290000) — nunca '
  'ambas para la misma cuenta (el guard de presupuesto_ejecucion lo impide). Acotado al año '
  'fiscal del presupuesto. La variación se calcula en la capa de presentación, no aquí.';

-- ── 6. retirar el diseño anterior ────────────────────────────────────────
drop trigger guard_presupuesto_cuenta_concepto on public.presupuesto_cuenta;
drop function public.guard_presupuesto_cuenta_concepto();
drop index public.presupuesto_cuenta_concepto_idx;
alter table public.presupuesto_cuenta drop column concepto_id;

-- ── 7. índice de performance para el join de presupuesto_cuenta_ejecucion ──
create index conceptos_presupuesto_cuenta_idx on public.conceptos (presupuesto_cuenta_id)
  where presupuesto_cuenta_id is not null;
