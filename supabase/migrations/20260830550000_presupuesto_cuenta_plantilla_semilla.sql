-- ═══════════════════════════════════════════════════════════════════════
--  PC-2b · Semilla del árbol presupuestal + enganche al alta de copropiedad
--  Propietario: Casos de uso/Contabilidad/PC_00_Analisis_Plan_de_Cuentas_
--  Contable.md §8 (G-19, PRE-11)
--
--  Problema: 25 de 32 tenants no tienen ninguna fila en presupuesto_cuenta
--  (E8 solo migró el catálogo de quien ya tenía presupuesto_rubros; no
--  sembró nada para el resto — ver nota final de
--  20260823200000_presupuesto_cuenta_arbol.sql). Sin árbol presupuestal no
--  hay nada que mapear a contable_cuenta (PC-3), así que estos 25 tenants
--  quedan fuera del bloque contable aunque este ya esté completo.
--
--  Diseño: mismo patrón que PC-1/PC-2 (contable_plan_cuenta +
--  fn_instanciar_plan_contable) — plantilla global, versionable por
--  migración, función idempotente que la copia a un tenant.
--
--  Qué entra en la plantilla y qué no:
--  Solo Nivel 1 (Grupo) y Nivel 2 (Subgrupo) — la porción del árbol de
--  GC-001 que es genuinamente genérica a cualquier PH (Honorarios,
--  Servicios, Seguros, Cuotas de administración...). Nivel 3-4 en GC-001
--  desglosa "Energía eléctrica — torres" en 19 cuentas, una por torre: eso
--  es geometría de ESE edificio, no algo sembrable. Cada tenant extiende
--  su copia con el detalle que le corresponda vía la UI de "Editar
--  estructura" que E8 ya entrega — la plantilla es el punto de partida,
--  no el árbol completo.
--
--  Códigos y nombres se copian tal cual de GC-001 (incluida la etiqueta
--  "— torres" en egr_energia_torres): es una estructura de Estado de
--  Resultado Integral ya investigada contra el ejemplo real (E8, ver
--  Casos de uso/Presupuesto/), no una inventada para esta migración.
--  Renombrar lo específico de un edificio es trabajo del administrador de
--  cada copropiedad, no de la semilla.
--
--  Alcance de ESTE corte:
--    • presupuesto_cuenta_plantilla — catálogo global (sin tenant_id),
--      solo lectura para tenants, editable solo por migración.
--    • fn_instanciar_presupuesto_cuenta(tenant) — idempotente por
--      (tenant_id, codigo), mismo criterio que fn_instanciar_plan_contable.
--    • Backfill: los 25 tenants sin ninguna fila en presupuesto_cuenta hoy.
--    • create_tenant(): a partir de ahora siembra ambos catálogos
--      (presupuestal + contable) en la misma transacción de alta, para que
--      G-19/PRE-11 y G-03 queden resueltos también hacia adelante, no solo
--      para los tenants existentes.
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
--  1. Plantilla global
-- ═══════════════════════════════════════════════════════════════════════

create table public.presupuesto_cuenta_plantilla (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.presupuesto_cuenta_plantilla (id) on delete restrict,
  naturaleza public.presupuesto_cuenta_naturaleza_t not null,
  codigo     text not null unique,
  nombre     text not null,
  -- Capturado, no generado: a diferencia de contable_plan_cuenta, el código aquí es un slug
  -- (egr_honorarios), no un código numérico de longitud fija — no hay de dónde derivarlo.
  nivel      smallint not null,
  orden      int not null default 0,
  created_at timestamptz not null default now(),

  constraint presupuesto_cuenta_plantilla_nivel_valido check (nivel in (1, 2)),
  constraint presupuesto_cuenta_plantilla_raiz_consistente
    check ((nivel = 1) = (parent_id is null))
);

comment on table public.presupuesto_cuenta_plantilla is
  'Plantilla global del árbol presupuestal (PC-2b) — Nivel 1-2 solamente (Grupo>Subgrupo), '
  'copiado de la estructura real de GC-001 ya investigada en E8. Sin tenant_id a propósito, '
  'mismo criterio que contable_plan_cuenta: catálogo maestro, solo cambia por migración. Cada '
  'tenant recibe una copia editable vía fn_instanciar_presupuesto_cuenta(); el detalle de Nivel '
  '3-4 específico de cada edificio se agrega después, a mano, con la UI de "Editar estructura".';

create index presupuesto_cuenta_plantilla_parent_idx
  on public.presupuesto_cuenta_plantilla (parent_id);

alter table public.presupuesto_cuenta_plantilla enable row level security;
alter table public.presupuesto_cuenta_plantilla force row level security;

create policy presupuesto_cuenta_plantilla_select_autenticado
  on public.presupuesto_cuenta_plantilla for select to authenticated using (true);

-- ── seed: Nivel 1 (13 cuentas raíz) ──────────────────────────────────────
insert into public.presupuesto_cuenta_plantilla (naturaleza, codigo, nombre, nivel, orden) values
  ('ingreso', 'ing_operacionales',              'Operacionales',                   1, 1),
  ('ingreso', 'ing_no_operacionales',           'No operacionales',                1, 2),
  ('egreso',  'egr_honorarios',                 'Honorarios',                      1, 1),
  ('egreso',  'egr_seguros',                    'Seguros',                         1, 2),
  ('egreso',  'egr_servicios',                  'Servicios',                       1, 3),
  ('egreso',  'egr_gastos_legales',             'Gastos legales',                  1, 4),
  ('egreso',  'egr_mantenimiento_reparaciones', 'Mantenimiento y reparaciones',    1, 5),
  ('egreso',  'egr_adecuacion_instalacion',     'Adecuación e instalación',        1, 6),
  ('egreso',  'egr_amortizaciones',             'Amortizaciones',                  1, 7),
  ('egreso',  'egr_diversos',                   'Diversos',                        1, 8),
  ('egreso',  'egr_financieros',                'Financieros',                     1, 9),
  ('egreso',  'egr_gastos_extraordinarios',     'Gastos extraordinarios',          1, 10),
  ('egreso',  'egr_gastos_diversos',            'Gastos diversos',                 1, 11);

-- ── seed: Nivel 2 (37 subcuentas, agrupadas por padre) ───────────────────
insert into public.presupuesto_cuenta_plantilla (parent_id, naturaleza, codigo, nombre, nivel, orden)
select p.id, v.naturaleza::public.presupuesto_cuenta_naturaleza_t, v.codigo, v.nombre, 2, v.orden
from (values
  -- ing_operacionales
  ('ing_operacionales', 'ingreso', 'cuotas_administracion',       'Cuotas de administración',                  1),
  ('ing_operacionales', 'ingreso', 'ing_usufructo_vehiculos',     'Usufructo zona común — vehículos',          2),
  ('ing_operacionales', 'ingreso', 'ing_usufructo_motos',         'Usufructo zona común — motos',              3),
  ('ing_operacionales', 'ingreso', 'ing_alquiler_salon',          'Alquiler salón social',                     4),
  ('ing_operacionales', 'ingreso', 'ing_energia_salon',           'Servicio de energía del salón',             5),
  ('ing_operacionales', 'ingreso', 'ing_otros_operacionales',     'Otros ingresos operacionales',              6),
  ('ing_operacionales', 'ingreso', 'ing_bicicletero',             'Bicicletero',                               7),
  ('ing_operacionales', 'ingreso', 'ing_fondo_imprevistos',       'Provisión fondo de imprevistos',            8),
  -- ing_no_operacionales
  ('ing_no_operacionales', 'ingreso', 'ing_financieros',             'Financieros',                1),
  ('ing_no_operacionales', 'ingreso', 'ing_recuperaciones',          'Recuperaciones',              2),
  ('ing_no_operacionales', 'ingreso', 'ing_otras_actividades',       'Otras actividades',           3),
  ('ing_no_operacionales', 'ingreso', 'ing_descuento_pronto_pago',   'Descuento por pronto pago',   4),
  ('ing_no_operacionales', 'ingreso', 'ing_diversos',                'Diversos',                    5),
  -- egr_honorarios
  ('egr_honorarios', 'egreso', 'egr_revisoria_fiscal',   'Revisoría fiscal',    1),
  ('egr_honorarios', 'egreso', 'egr_asesoria_juridica',  'Asesoría jurídica',   2),
  ('egr_honorarios', 'egreso', 'egr_contador_publico',   'Contador público',    3),
  ('egr_honorarios', 'egreso', 'egr_administrador',      'Administrador',       4),
  -- egr_servicios
  ('egr_servicios', 'egreso', 'egr_aseo',             'Aseo',                          1),
  ('egr_servicios', 'egreso', 'vigilancia',            'Vigilancia',                    2),
  ('egr_servicios', 'egreso', 'egr_acueducto',        'Acueducto y alcantarillado',    3),
  ('egr_servicios', 'egreso', 'egr_energia_torres',   'Energía eléctrica — torres',    4),
  ('egr_servicios', 'egreso', 'egr_zonas_comunes',    'Zonas comunes',                 5),
  ('egr_servicios', 'egreso', 'egr_telefono',         'Teléfono',                      6),
  ('egr_servicios', 'egreso', 'egr_otros_servicios',  'Otros servicios',               7),
  -- egr_mantenimiento_reparaciones
  ('egr_mantenimiento_reparaciones', 'egreso', 'egr_construcciones_edificaciones', 'Construcciones y edificaciones', 1),
  -- egr_adecuacion_instalacion
  ('egr_adecuacion_instalacion', 'egreso', 'egr_instalaciones_electricas', 'Instalaciones eléctricas', 1),
  ('egr_adecuacion_instalacion', 'egreso', 'egr_reparaciones_locativas',   'Reparaciones locativas',   2),
  -- egr_diversos
  ('egr_diversos', 'egreso', 'egr_gastos_representacion',     'Gastos de representación y relaciones públicas', 1),
  ('egr_diversos', 'egreso', 'egr_elementos_aseo_cafeteria',  'Elementos de aseo y cafetería',                  2),
  ('egr_diversos', 'egreso', 'egr_papeleria_fotocopias',      'Papelería y fotocopias',                         3),
  ('egr_diversos', 'egreso', 'egr_combustibles_lubricantes',  'Combustibles y lubricantes',                     4),
  ('egr_diversos', 'egreso', 'egr_taxis_buses',               'Taxis y buses',                                  5),
  ('egr_diversos', 'egreso', 'egr_otros_gastos_diversos',     'Otros gastos diversos',                          6),
  -- egr_financieros
  ('egr_financieros', 'egreso', 'egr_gastos_bancarios', 'Gastos bancarios',   1),
  ('egr_financieros', 'egreso', 'egr_intereses_mora',   'Intereses de mora', 2),
  -- egr_gastos_extraordinarios
  ('egr_gastos_extraordinarios', 'egreso', 'egr_gastos_ejercicios_anteriores', 'Gastos de ejercicios anteriores', 1),
  ('egr_gastos_extraordinarios', 'egreso', 'egr_impuestos_asumidos',           'Impuestos asumidos',              2)
) as v(padre_codigo, naturaleza, codigo, nombre, orden)
join public.presupuesto_cuenta_plantilla p on p.codigo = v.padre_codigo;

-- ═══════════════════════════════════════════════════════════════════════
--  2. Instanciación por tenant
-- ═══════════════════════════════════════════════════════════════════════

-- SECURITY INVOKER, mismo criterio que fn_instanciar_plan_contable (PC-2): los INSERT pasan
-- por presupuesto_cuenta_insert_agent tal cual, la autorización la resuelve RLS. Idempotente
-- por (tenant_id, codigo) vía ON CONFLICT DO NOTHING.
create function public.fn_instanciar_presupuesto_cuenta(p_tenant_id uuid)
returns table (creadas integer, existentes integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nivel   int;
  v_creadas integer := 0;
  v_lote    integer;
  v_total   integer;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_INEXISTENTE: %', p_tenant_id;
  end if;

  -- De arriba hacia abajo, igual que fn_instanciar_plan_contable: cada nivel encuentra a su
  -- padre ya materializado en el tenant por código (la plantilla resuelve el padre por su
  -- propio parent_id, no por prefijo de texto, porque el código aquí es un slug).
  for v_nivel in 1..2 loop
    insert into public.presupuesto_cuenta (tenant_id, parent_id, naturaleza, codigo, nombre, orden)
    select
      p_tenant_id,
      padre.id,
      pl.naturaleza,
      pl.codigo,
      pl.nombre,
      pl.orden
    from public.presupuesto_cuenta_plantilla pl
    left join public.presupuesto_cuenta_plantilla padre_pl on padre_pl.id = pl.parent_id
    left join public.presupuesto_cuenta padre
      on padre.tenant_id = p_tenant_id and padre.codigo = padre_pl.codigo
    where pl.nivel = v_nivel
      and (pl.parent_id is null or padre.id is not null)
    on conflict (tenant_id, codigo) do nothing;

    get diagnostics v_lote = row_count;
    v_creadas := v_creadas + v_lote;
  end loop;

  select count(*) into v_total from public.presupuesto_cuenta_plantilla;
  return query select v_creadas, (v_total - v_creadas)::integer;
end;
$$;

comment on function public.fn_instanciar_presupuesto_cuenta(uuid) is
  'Copia la plantilla global Nivel 1-2 (presupuesto_cuenta_plantilla) al árbol presupuestal de '
  'una copropiedad (PC-2b, G-19/PRE-11). Idempotente: ON CONFLICT DO NOTHING por (tenant_id, '
  'codigo). SECURITY INVOKER: la autorización la resuelve presupuesto_cuenta_insert_agent, no '
  'la función. El detalle de Nivel 3-4 propio de cada edificio se agrega después, a mano.';

-- ── 3. backfill: los tenants que hoy no tienen NINGUNA fila en presupuesto_cuenta ─────────
do $$
declare
  v_tenant uuid;
begin
  for v_tenant in
    select t.id
    from public.tenants t
    where not exists (
      select 1 from public.presupuesto_cuenta pc where pc.tenant_id = t.id
    )
  loop
    perform public.fn_instanciar_presupuesto_cuenta(v_tenant);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  4. Enganche al alta de copropiedad — de aquí en adelante, todo tenant
--     nuevo nace con ambos árboles (presupuestal + contable) en la misma
--     transacción, cerrando G-19/PRE-11 y extendiendo G-03 hacia adelante.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.create_tenant(p_name text, p_slug text)
returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para crear una copropiedad';
  end if;

  insert into public.tenants (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), (select auth.uid()))
  returning * into v_tenant;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id)
  values (v_tenant.id, (select auth.uid()), 'tenant.created', 'tenant', v_tenant.id);

  insert into public.memberships (user_id, tenant_id, role, status)
  values ((select auth.uid()), v_tenant.id, 'administrador', 'active');

  -- PC-2b: siembra ambos árboles antes de devolver el tenant — quien lo cree lo recibe ya
  -- listo para presupuestar y para mapear a contabilidad, sin paso manual de onboarding.
  perform public.fn_instanciar_presupuesto_cuenta(v_tenant.id);
  perform public.fn_instanciar_plan_contable(v_tenant.id);

  update public.profiles
  set active_tenant_id = v_tenant.id
  where id = (select auth.uid());

  return v_tenant;
exception
  when unique_violation then
    raise exception 'SLUG_TAKEN: ya existe una copropiedad con ese slug';
  when check_violation then
    raise exception 'SLUG_INVALID: el nombre o el slug no cumplen el formato requerido';
end;
$$;
