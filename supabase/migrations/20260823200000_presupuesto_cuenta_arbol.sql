-- ═══════════════════════════════════════════════════════════════════════
--  E8 · Árbol de cuentas presupuestales (jerarquía multinivel)
--  Propietario: gap analysis contra Estado de Resultado Integral real
--  (Casos de uso/Presupuesto/Ejemplo de presupuesto.pdf) + investigación
--  Palmar del Viento / Tesoro I / CTCP-15 / Ley 675
--  (Casos de uso/Presupuesto/sesion_presupuesto_copropiedad_AQUILA.md)
--
--  Motivación: presupuesto_rubros modelaba una sola categoría plana (7
--  valores fijos vía CATEGORIA_RUBRO_PRESUPUESTAL, sin jerarquía) y no
--  existía ningún árbol de ingresos — el ejemplo real exige 3-4 niveles
--  (Grupo>Subgrupo>Cuenta>Detalle, ej. "ENERGIA ELECTRICA TORRES"
--  desglosado en 19 torres) e ingresos con la misma profundidad que
--  egresos (usufructo zona común, alquiler salón, intereses...).
--
--  Alcance de ESTE corte:
--    • presupuesto_cuenta — catálogo jerárquico de cuentas por tenant,
--      estable entre versiones de presupuesto (la cuenta persiste año a
--      año, igual que en los modelos reales revisados — solo el monto
--      cambia por versión).
--    • presupuesto_rubros migra de categoria_id (plano) a cuenta_id (hoja
--      del árbol); la naturaleza ingreso/egreso ahora vive en la cuenta,
--      no en el rubro.
--    • guard_presupuesto_reconciliado se ajusta para sumar solo hojas de
--      naturaleza 'egreso' contra monto_total — semántica sin cambios
--      (monto_total sigue siendo la necesidad de recaudo).
--    • presupuesto_cuenta_totales() — rollup recursivo para subtotales
--      por nodo (TOTAL SERVICIOS, TOTAL EGRESOS...); no se persiste
--      ningún subtotal, todo se deriva de presupuesto_rubros.
--
--  Deliberadamente FUERA de este corte:
--    • Ejecución real / "ejecutado vs. presupuestado" / excedente del
--      ejercicio — es E9, requiere una tabla de movimientos reales que
--      todavía no existe (ver comentario ya existente en
--      presupuesto_rubros sobre la tabla `gastos` pospuesta).
--    • fuente_financiacion no se toca — sigue siendo un concepto propio
--      (recursos extraordinarios con tope de aplicación, FI-003), no un
--      subárbol de este catálogo. RESUELTO (E9 seguimiento,
--      20260823290000/300000): se mantienen separados a propósito, no por
--      falta de tiempo — fuente_financiacion son decisiones de
--      financiación extraordinaria tomadas al aprobar el presupuesto
--      (préstamos, uso de reservas, tope contra fondo_imprevistos vía
--      FI-003), mientras que presupuesto_cuenta (ingreso) + concepto_id
--      son el árbol de ingresos recurrentes/operativos, real (cargos) o
--      manual (presupuesto_ejecucion). No hay solape ni riesgo de doble
--      conteo: fuente_financiacion se valida contra monto_total
--      directamente, nunca contra una cuenta puntual. Fusionarlos
--      obligaría a rehacer las guardas de FI-003 y la Edge Function de
--      previsualización sin ninguna ganancia funcional.
--    • Semilla de catálogo por defecto para tenants nuevos (UX de
--      onboarding) — solo se migra el catálogo del/los tenant(s) que ya
--      tienen presupuesto_rubros hoy.
-- ═══════════════════════════════════════════════════════════════════════

-- ── naturaleza contable: ingreso | egreso ───────────────────────────────
create type public.presupuesto_cuenta_naturaleza_t as enum ('ingreso', 'egreso');

comment on type public.presupuesto_cuenta_naturaleza_t is
  'D-24: enum nativo, no lista_tipos — la naturaleza no es vocabulario descriptivo, es un '
  'invariante estructural: filtra qué hojas suma guard_presupuesto_reconciliado contra '
  'monto_total y qué subárbol puede colgar de qué padre (no se mezcla ingreso/egreso bajo un '
  'mismo nodo, ver guard_presupuesto_cuenta_arbol).';

-- ── presupuesto_cuenta — catálogo jerárquico por tenant ─────────────────
create table public.presupuesto_cuenta (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  parent_id    uuid references public.presupuesto_cuenta (id) on delete restrict,
  naturaleza   public.presupuesto_cuenta_naturaleza_t not null,
  codigo       text not null,
  nombre       text not null,
  -- 1=Grupo, 2=Subgrupo, 3=Cuenta, 4=Detalle — derivado por trigger, no editable a mano.
  nivel        int not null,
  -- Path materializado (ej. '0003.0012') — orden de despliegue y ancestría sin recursión. No
  -- se recalcula en cascada si un ancestro cambia de `orden` después de tener hijos (E8,
  -- limitación conocida): solo afecta el orden de despliegue, no la jerarquía real.
  ruta         text not null,
  -- Solo las hojas reciben montos vía presupuesto_rubros.cuenta_id. Se apaga solo (nunca se
  -- reenciende) al insertar el primer hijo — ver guard_presupuesto_cuenta_arbol.
  es_hoja      boolean not null default true,
  activa       boolean not null default true,
  orden        int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,

  constraint presupuesto_cuenta_codigo_unico unique (tenant_id, codigo),
  constraint presupuesto_cuenta_nivel_valido check (nivel between 1 and 4)
);

alter table public.presupuesto_cuenta enable row level security;
alter table public.presupuesto_cuenta force row level security;

create index presupuesto_cuenta_tenant_idx on public.presupuesto_cuenta (tenant_id);
create index presupuesto_cuenta_parent_idx on public.presupuesto_cuenta (parent_id);

create trigger set_updated_at before update on public.presupuesto_cuenta
  for each row execute function public.set_updated_at();

comment on table public.presupuesto_cuenta is
  'Plan de cuentas presupuestales por tenant (E8) — jerárquico hasta 4 niveles, estable entre '
  'versiones de presupuesto (la cuenta persiste año a año, igual que los modelos reales '
  'revisados en Casos de uso/Presupuesto). Reemplaza la categoría plana que tenía '
  'presupuesto_rubros.categoria_id.';

-- Sin DELETE: una cuenta con rubros o hijos no debe poder borrarse por accidente; para
-- retirarla se desactiva (activa = false), mismo criterio que otros catálogos del proyecto.
create policy presupuesto_cuenta_select_miembro
  on public.presupuesto_cuenta for select
  to authenticated
  using (public.is_member(tenant_id));

create policy presupuesto_cuenta_insert_agent
  on public.presupuesto_cuenta for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy presupuesto_cuenta_update_agent
  on public.presupuesto_cuenta for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ── guard: mantiene nivel/ruta/es_hoja y evita mezclar naturaleza/ciclos ──
create function public.guard_presupuesto_cuenta_arbol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.presupuesto_cuenta%rowtype;
begin
  if new.parent_id is null then
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

  if tg_op = 'update' and new.parent_id is not null then
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
  end if;

  if v_parent.naturaleza <> new.naturaleza then
    raise exception 'CUENTA_NATURALEZA_MEZCLADA: % no puede colgar de % — no se mezcla '
      'ingreso/egreso bajo el mismo nodo (E8)', new.naturaleza, v_parent.naturaleza;
  end if;

  if v_parent.nivel >= 4 then
    raise exception 'CUENTA_PROFUNDIDAD_MAXIMA: % ya está en el nivel máximo (4) — no admite '
      'hijos', v_parent.id;
  end if;

  new.nivel := v_parent.nivel + 1;
  new.ruta := v_parent.ruta || '.' || lpad(new.orden::text, 4, '0');

  if v_parent.es_hoja then
    update public.presupuesto_cuenta set es_hoja = false where id = v_parent.id;
  end if;

  return new;
end;
$$;

create trigger guard_presupuesto_cuenta_arbol
  before insert or update of parent_id, naturaleza, orden on public.presupuesto_cuenta
  for each row execute function public.guard_presupuesto_cuenta_arbol();

-- ── presupuesto_rubros: categoria_id (plano) → cuenta_id (hoja del árbol) ──
alter table public.presupuesto_rubros
  add column cuenta_id uuid references public.presupuesto_cuenta (id);

-- Backfill: una cuenta de Nivel 1 por cada categoría (lista_tipos) usada hoy, por tenant,
-- naturaleza 'egreso' (todo presupuesto_rubros existente hasta hoy es egreso).
insert into public.presupuesto_cuenta (tenant_id, naturaleza, codigo, nombre, orden)
select distinct
  pr.tenant_id,
  'egreso'::public.presupuesto_cuenta_naturaleza_t,
  lt.codigo,
  lt.nombre,
  lt.orden
from public.presupuesto_rubros pr
join public.lista_tipos lt on lt.id = pr.categoria_id;

update public.presupuesto_rubros pr
set cuenta_id = pc.id
from public.lista_tipos lt
join public.presupuesto_cuenta pc
  on pc.codigo = lt.codigo and pc.nivel = 1
where lt.id = pr.categoria_id
  and pc.tenant_id = pr.tenant_id;

alter table public.presupuesto_rubros alter column cuenta_id set not null;
create index presupuesto_rubros_cuenta_idx on public.presupuesto_rubros (cuenta_id);

alter table public.presupuesto_rubros drop constraint presupuesto_rubros_categoria_id_fkey;
alter table public.presupuesto_rubros drop column categoria_id;

comment on table public.presupuesto_rubros is
  'Construyen el presupuesto; no llegan a la factura — todo agrega en el concepto único '
  'CUOTA_ADMIN (PLAN §4.3). cuenta_id (E8) fija su naturaleza ingreso/egreso vía la hoja del '
  'árbol de presupuesto_cuenta. La tabla `gastos` de ejecución presupuestal queda pospuesta '
  '(E9), fuera de alcance de esta fase.';

-- ── presupuesto_rubros: cuenta_id debe ser una hoja del propio tenant ───
create function public.guard_presupuesto_rubro_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta public.presupuesto_cuenta%rowtype;
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
    raise exception 'CUENTA_NO_ES_HOJA: % agrupa subcuentas — un rubro solo puede '
      'presupuestarse contra una cuenta hoja (E8)', new.cuenta_id;
  end if;

  return new;
end;
$$;

create trigger guard_presupuesto_rubro_cuenta
  before insert or update of cuenta_id on public.presupuesto_rubros
  for each row execute function public.guard_presupuesto_rubro_cuenta();

-- ── presupuestos: reconciliación ahora filtra por naturaleza 'egreso' ──
create or replace function public.guard_presupuesto_reconciliado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suma_rubros numeric(18, 2);
  v_suma_fuentes numeric(18, 2);
begin
  if new.estado in ('aprobado', 'vigente') then
    select coalesce(sum(pr.monto_anual), 0) into v_suma_rubros
    from public.presupuesto_rubros pr
    join public.presupuesto_cuenta pc on pc.id = pr.cuenta_id
    where pr.presupuesto_id = new.id and pc.naturaleza = 'egreso';

    if v_suma_rubros <> new.monto_total then
      raise exception 'BUDGET_NOT_RECONCILED: presupuesto % — monto_total (%) no coincide '
        'con la suma de sus rubros de egreso (%) (PLAN §4.3, E8)', new.id, new.monto_total,
        v_suma_rubros;
    end if;

    select coalesce(sum(valor_aplicado), 0) into v_suma_fuentes
    from public.fuente_financiacion
    where presupuesto_id = new.id;

    if v_suma_fuentes > new.monto_total then
      raise exception 'FINANCIACION_EXCEDE_PRESUPUESTO: presupuesto % — fuentes aplicadas (%) '
        'superan monto_total (%) (E-07 FI-001/GAP-19)', new.id, v_suma_fuentes, new.monto_total;
    end if;
  end if;

  return new;
end;
$$;

-- ── presupuesto_cuenta_totales: subtotales por nodo, sin columnas redundantes ──
-- Recursivo bottom-up: cada hoja propaga su monto_anual hacia todos sus ancestros. No es
-- security definer — corre con los privilegios del invocador para que las políticas RLS de
-- select ya existentes en presupuesto_cuenta/presupuesto_rubros sigan aplicando tal cual.
create function public.presupuesto_cuenta_totales(p_presupuesto_id uuid)
returns table (cuenta_id uuid, monto_acumulado numeric)
language sql
stable
set search_path = ''
as $$
  with recursive hoja as (
    -- El join contra presupuestos acota presupuesto_cuenta al tenant dueño de
    -- p_presupuesto_id — sin esto se recorren las cuentas de TODOS los tenants (E8, bug
    -- detectado en verificación manual contra datos reales de dev).
    select c.id, c.parent_id, coalesce(r.monto_anual, 0) as monto_propio
    from public.presupuestos p
    join public.presupuesto_cuenta c on c.tenant_id = p.tenant_id
    left join public.presupuesto_rubros r
      on r.cuenta_id = c.id and r.presupuesto_id = p_presupuesto_id
    where p.id = p_presupuesto_id
  ),
  acumulado as (
    select h.id as cuenta_id, h.id as ancestro_id, h.monto_propio from hoja h
    union all
    select a.cuenta_id, c.parent_id, a.monto_propio
    from acumulado a
    join public.presupuesto_cuenta c on c.id = a.ancestro_id
    where c.parent_id is not null
  )
  select ancestro_id as cuenta_id, sum(monto_propio) as monto_acumulado
  from acumulado
  group by ancestro_id;
$$;

comment on function public.presupuesto_cuenta_totales(uuid) is
  'Rollup recursivo de presupuesto_rubros.monto_anual hacia cada ancestro del árbol de '
  'presupuesto_cuenta, para un presupuesto puntual (E8). Reemplaza el groupby plano que hacía '
  'PresupuestoTabComponentes.vue contra categoria_id.';
