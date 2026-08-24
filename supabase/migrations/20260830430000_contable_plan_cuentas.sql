-- ═══════════════════════════════════════════════════════════════════════
--  PC-1 · Plan de cuentas contable — catálogo maestro y plan por tenant
--  Propietario: Casos de uso/Contabilidad/PC_00_Analisis_Plan_de_Cuentas_
--  Contable.md + PC_01_Plantilla_PUC_Propiedad_Horizontal.md
--
--  Por qué un catálogo separado de presupuesto_cuenta (E8) y no una
--  extensión suya — la decisión está argumentada en PC-00 §2; el resumen:
--    • Cobertura incompatible: el árbol presupuestal solo modela resultado
--      (clases 4 y 5). Un plan contable necesita balance (1/2/3) y cuentas
--      de orden (8), que jamás serán partidas presupuestables.
--    • Granularidad opuesta: el seed real de GC-001 desglosa "Energía
--      eléctrica — torres" en 19 cuentas hoja. Contablemente eso es UNA
--      cuenta 5405 con dimensión agrupacion_id = Torre N. Fusionarlos
--      obligaría a crear 19 cuentas contables, justo lo que el prompt
--      maestro §12/§59/§81 prohíbe.
--    • Ciclo de vida distinto: el árbol presupuestal lo reedita el
--      administrador cada año; el plan contable debe ser estable entre
--      ejercicios. Un solo catálogo no puede tener ambas políticas.
--
--  Alcance de ESTE corte:
--    • contable_plan / contable_plan_cuenta — plantilla GLOBAL (tenant_id
--      no existe aquí a propósito: es catálogo maestro, como lista_tipos
--      con tenant_id null), versionable, no editable por ningún tenant.
--    • contable_cuenta — plan instanciado por copropiedad, personalizable.
--    • Seed de PUC_PH_CO_V1: 161 cuentas (149 base + 12 opcionales).
--
--  Deliberadamente FUERA de este corte:
--    • fn_instanciar_plan_contable(tenant) — PC-2. La plantilla existe pero
--      todavía nadie la copia a un tenant.
--    • presupuesto_cuenta.contable_cuenta_id y las demás columnas puente
--      (fondos, cuentas_bancarias) — PC-3.
--    • contable_cuenta_default (cuentas predeterminadas por evento) — PC-3.
--    • Comprobantes, asientos, partida doble, saldos — etapas posteriores.
--      Este corte NO registra un solo movimiento contable; solo define
--      contra qué se registrarán.
-- ═══════════════════════════════════════════════════════════════════════

-- ── naturaleza contable: debito | credito ───────────────────────────────
create type public.contable_naturaleza_t as enum ('debito', 'credito');

comment on type public.contable_naturaleza_t is
  'D-24: enum nativo, no lista_tipos — no es vocabulario descriptivo sino el invariante que '
  'determina el signo con que cada movimiento afecta el saldo de la cuenta (saldo = Σdébitos − '
  'Σcréditos para naturaleza debito, y al revés para credito). Cerrado por definición de la '
  'partida doble: no admite un tercer valor ni valores por copropiedad. No se deriva de la '
  'clase: 1390 Deterioro de cartera, 1595 Depreciación acumulada y 1695 Amortización acumulada '
  'son cuentas correctoras de naturaleza credito dentro de la clase 1 (Activo).';

-- ═══════════════════════════════════════════════════════════════════════
--  1. Plantilla global
-- ═══════════════════════════════════════════════════════════════════════

create table public.contable_plan (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,
  nombre      text not null,
  version     smallint not null default 1,
  vigente     boolean not null default true,
  descripcion text,
  created_at  timestamptz not null default now()
);

comment on table public.contable_plan is
  'Cabecera de plantilla global de plan de cuentas (PC-1). Sin tenant_id a propósito: es '
  'catálogo maestro compartido, mismo criterio que lista_tipos con tenant_id null. Versionable '
  'para poder publicar un PUC base corregido sin alterar los planes ya instanciados en '
  'contable_cuenta — cada tenant conserva la copia que recibió.';

create table public.contable_plan_cuenta (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.contable_plan (id) on delete cascade,
  parent_id  uuid references public.contable_plan_cuenta (id) on delete restrict,
  codigo     text not null,
  nombre     text not null,
  naturaleza public.contable_naturaleza_t not null,
  -- Generadas, no capturadas: un código 5505 ES clase 5, nivel 3, por definición del PUC.
  -- Capturarlas por separado abriría la puerta a que se contradigan con el código.
  clase      smallint generated always as (left(codigo, 1)::smallint) stored,
  nivel      smallint generated always as (
    case length(codigo) when 1 then 1 when 2 then 2 when 4 then 3 when 6 then 4 when 8 then 5 end
  ) stored,
  -- Solo estas admiten asiento. Un grupo (11 Efectivo) nunca recibe movimiento directo.
  permite_movimiento    boolean not null default false,
  -- Clases 6 (Costos) y 8 (Cuentas de orden): existen en la plantilla pero no se instancian
  -- salvo que la copropiedad las active — la mayoría de PH no explota bienes comunes ni lleva
  -- cuentas de orden, y entregar 12 cuentas muertas ensucia el plan (PC-01 §3.3).
  opcional              boolean not null default false,
  -- Dimensiones obligatorias (prompt maestro §35): booleanas y no jsonb porque el conjunto es
  -- cerrado y conocido — así se validan en un guard y se indexan; en jsonb, ninguna de las dos.
  requiere_tercero      boolean not null default false,
  requiere_centro_costo boolean not null default false,
  requiere_fondo        boolean not null default false,
  requiere_inmueble     boolean not null default false,
  created_at timestamptz not null default now(),

  constraint contable_plan_cuenta_codigo_unico unique (plan_id, codigo),
  -- El orden de despliegue es el orden lexicográfico del código (longitud fija por nivel), así
  -- que no hay columna `orden`: sería redundante con el propio código.
  constraint contable_plan_cuenta_codigo_valido
    check (codigo ~ '^[0-9]+$' and length(codigo) in (1, 2, 4, 6, 8)),
  constraint contable_plan_cuenta_clase_valida
    check (left(codigo, 1)::smallint between 1 and 9)
);

comment on table public.contable_plan_cuenta is
  'Detalle de la plantilla global (PC-1). Jerarquía Clase(1) > Grupo(2) > Cuenta(4) > '
  'Subcuenta(6) > Auxiliar(8), derivada de la longitud del código; parent_id se materializa '
  'por prefijo. La plantilla llega a nivel 4 solo en Caja y Bancos, donde cada cuenta bancaria '
  'real necesita su propia cuenta contable; los auxiliares (nivel 5) los crea cada tenant.';

create index contable_plan_cuenta_plan_idx on public.contable_plan_cuenta (plan_id, codigo);
create index contable_plan_cuenta_parent_idx on public.contable_plan_cuenta (parent_id);

-- RLS: lectura para cualquier autenticado (catálogo global, sin cifras ni datos de tenant);
-- escritura inexistente para usuarios — la plantilla solo cambia por migración.
alter table public.contable_plan enable row level security;
alter table public.contable_plan force row level security;
alter table public.contable_plan_cuenta enable row level security;
alter table public.contable_plan_cuenta force row level security;

create policy contable_plan_select_autenticado
  on public.contable_plan for select to authenticated using (true);

create policy contable_plan_cuenta_select_autenticado
  on public.contable_plan_cuenta for select to authenticated using (true);

-- ═══════════════════════════════════════════════════════════════════════
--  2. Plan instanciado por copropiedad
-- ═══════════════════════════════════════════════════════════════════════

create table public.contable_cuenta (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  parent_id      uuid references public.contable_cuenta (id) on delete restrict,
  -- Origen en la plantilla; null = cuenta propia creada por la copropiedad. Permite distinguir
  -- el plan base de su personalización sin comparar textos.
  plan_cuenta_id uuid references public.contable_plan_cuenta (id),
  codigo         text not null,
  nombre         text not null,
  naturaleza     public.contable_naturaleza_t not null,
  clase          smallint generated always as (left(codigo, 1)::smallint) stored,
  nivel          smallint generated always as (
    case length(codigo) when 1 then 1 when 2 then 2 when 4 then 3 when 6 then 4 when 8 then 5 end
  ) stored,
  permite_movimiento    boolean not null default false,
  activa                boolean not null default true,
  requiere_tercero      boolean not null default false,
  requiere_centro_costo boolean not null default false,
  requiere_fondo        boolean not null default false,
  requiere_inmueble     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,

  constraint contable_cuenta_codigo_unico unique (tenant_id, codigo),
  constraint contable_cuenta_codigo_valido
    check (codigo ~ '^[0-9]+$' and length(codigo) in (1, 2, 4, 6, 8)),
  constraint contable_cuenta_clase_valida
    check (left(codigo, 1)::smallint between 1 and 9)
);

comment on table public.contable_cuenta is
  'Plan de cuentas contable de una copropiedad (PC-1) — copia personalizable de '
  'contable_plan_cuenta. NO reemplaza ni compite con presupuesto_cuenta (E8): aquella responde '
  '"en qué partida se planeó", esta "qué naturaleza contable tiene". Varias cuentas '
  'presupuestales mapean a la misma cuenta contable (19 torres -> 5405); el detalle no se '
  'pierde, vive en las dimensiones del movimiento (centro_costo_id, agrupacion_id).';

comment on column public.contable_cuenta.permite_movimiento is
  'Solo estas admiten asiento. Se apaga solo (nunca se reenciende) al insertar el primer hijo, '
  'mismo patrón que presupuesto_cuenta.es_hoja — ver guard_contable_cuenta_arbol.';

create index contable_cuenta_tenant_idx on public.contable_cuenta (tenant_id, codigo);
create index contable_cuenta_parent_idx on public.contable_cuenta (parent_id);
create index contable_cuenta_movimiento_idx on public.contable_cuenta (tenant_id)
  where permite_movimiento and activa;

alter table public.contable_cuenta enable row level security;
alter table public.contable_cuenta force row level security;

create trigger set_updated_at before update on public.contable_cuenta
  for each row execute function public.set_updated_at();

-- Sin DELETE, mismo criterio que presupuesto_cuenta: una cuenta con movimientos o hijos no
-- debe poder borrarse por accidente; para retirarla se desactiva (activa = false).
create policy contable_cuenta_select_miembro
  on public.contable_cuenta for select
  to authenticated
  using (public.is_member(tenant_id));

create policy contable_cuenta_insert_auxiliar
  on public.contable_cuenta for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy contable_cuenta_update_auxiliar
  on public.contable_cuenta for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── guard del árbol contable ─────────────────────────────────────────────
-- A diferencia de guard_presupuesto_cuenta_arbol, aquí NO se valida que la naturaleza del hijo
-- coincida con la del padre: las cuentas correctoras (1390, 1595, 1695) son credito colgando de
-- un padre debito, y eso es correcto contablemente.
create function public.guard_contable_cuenta_arbol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.contable_cuenta%rowtype;
  v_long_padre_esperada int;
begin
  if new.parent_id is null then
    if length(new.codigo) <> 1 then
      raise exception 'CUENTA_RAIZ_INVALIDA: % no es una clase (1 dígito) — solo las clases '
        'pueden ir sin cuenta padre', new.codigo;
    end if;
    return new;
  end if;

  select * into v_parent from public.contable_cuenta where id = new.parent_id;

  if v_parent.id is null then
    raise exception 'CUENTA_PADRE_INEXISTENTE: parent_id % no existe', new.parent_id;
  end if;

  if v_parent.tenant_id <> new.tenant_id then
    raise exception 'CUENTA_TENANT_INCONSISTENTE: la cuenta padre % pertenece a otro tenant',
      new.parent_id;
  end if;

  v_long_padre_esperada :=
    case length(new.codigo) when 2 then 1 when 4 then 2 when 6 then 4 when 8 then 6 end;

  if v_long_padre_esperada is null then
    raise exception 'CUENTA_LONGITUD_INVALIDA: el código % no corresponde a ningún nivel '
      '(1, 2, 4, 6 u 8 dígitos)', new.codigo;
  end if;

  if length(v_parent.codigo) <> v_long_padre_esperada then
    raise exception 'CUENTA_NIVEL_SALTADO: % (nivel %) no puede colgar de % (nivel %) — la '
      'jerarquía contable no admite saltos de nivel', new.codigo, new.nivel, v_parent.codigo,
      v_parent.nivel;
  end if;

  -- Invariante central del PUC: el código del hijo extiende el del padre. Con esto, clase y
  -- ancestría quedan garantizadas por construcción, sin necesidad de validarlas aparte.
  if left(new.codigo, length(v_parent.codigo)) <> v_parent.codigo then
    raise exception 'CUENTA_CODIGO_INCOHERENTE: % debe empezar por el código de su cuenta '
      'padre (%)', new.codigo, v_parent.codigo;
  end if;

  -- Una cuenta que gana subcuentas deja de recibir movimiento directo.
  if v_parent.permite_movimiento then
    update public.contable_cuenta set permite_movimiento = false where id = v_parent.id;
  end if;

  return new;
end;
$$;

create trigger guard_contable_cuenta_arbol
  before insert or update of parent_id, codigo on public.contable_cuenta
  for each row execute function public.guard_contable_cuenta_arbol();

-- ── guard de coherencia interna: agrupador no recibe movimiento ──────────
create function public.guard_contable_cuenta_movimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.permite_movimiento
     and exists (select 1 from public.contable_cuenta where parent_id = new.id) then
    raise exception 'CUENTA_AGRUPA_SUBCUENTAS: % tiene subcuentas — no puede recibir '
      'movimiento directo', new.codigo;
  end if;

  return new;
end;
$$;

create trigger guard_contable_cuenta_movimiento
  before update of permite_movimiento on public.contable_cuenta
  for each row execute function public.guard_contable_cuenta_movimiento();

-- ═══════════════════════════════════════════════════════════════════════
--  3. Seed · PUC_PH_CO_V1
--
--  Fundamento (PC-01 §1): en Colombia NO existe un PUC de obligatorio
--  cumplimiento para propiedad horizontal. Las PH aplican NIIF PYMES
--  (Grupo 2) o el marco de microempresas (Grupo 3) bajo el DUR 2420 de
--  2015; el Decreto 2650 de 1993 no les rige. La estructura de clases y la
--  codificación numérica son BUENA PRÁCTICA heredada de esa convención, no
--  norma. La existencia del fondo de imprevistos sí es NORMA (Ley 675 de
--  2001, art. 35). fecha_validacion contra fuente primaria: PENDIENTE.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.contable_plan (codigo, nombre, version, descripcion) values (
  'PUC_PH_CO_V1',
  'Plan de cuentas para Propiedad Horizontal — Colombia',
  1,
  'Catálogo base para copropiedades colombianas. 149 cuentas de instalación automática más 12 '
  'opcionales (clases 6 y 8). No es un PUC comercial recortado: se diseñó desde las '
  'operaciones reales de una PH. Ver Casos de uso/Contabilidad/PC_01_Plantilla_PUC_'
  'Propiedad_Horizontal.md'
);

-- dim: T = tercero, C = centro de costo, F = fondo, I = inmueble
insert into public.contable_plan_cuenta (
  plan_id, codigo, nombre, naturaleza, permite_movimiento, opcional,
  requiere_tercero, requiere_centro_costo, requiere_fondo, requiere_inmueble
)
select
  p.id, v.codigo, v.nombre, v.nat::public.contable_naturaleza_t, v.mov, v.opc,
  position('T' in v.dim) > 0, position('C' in v.dim) > 0,
  position('F' in v.dim) > 0, position('I' in v.dim) > 0
from public.contable_plan p,
(values
  -- ═══ CLASE 1 — ACTIVO ═══
  ('1',      'ACTIVO',                                    'debito',  false, false, ''),
  ('11',     'Efectivo y equivalentes de efectivo',       'debito',  false, false, ''),
  ('1105',   'Caja',                                      'debito',  false, false, ''),
  ('110505', 'Caja general',                              'debito',  true,  false, ''),
  ('110510', 'Caja menor',                                'debito',  true,  false, ''),
  ('1110',   'Bancos',                                    'debito',  false, false, ''),
  ('111005', 'Cuenta corriente',                          'debito',  true,  false, ''),
  ('111010', 'Cuenta de ahorros',                         'debito',  true,  false, ''),
  ('111015', 'Cuenta fondo de imprevistos',               'debito',  true,  false, 'F'),
  ('111020', 'Cuenta fondo de reserva',                   'debito',  true,  false, 'F'),
  ('12',     'Inversiones',                               'debito',  false, false, ''),
  ('1205',   'Certificados de depósito a término',        'debito',  true,  false, ''),
  ('1210',   'Fondos de inversión colectiva',             'debito',  true,  false, ''),
  ('13',     'Cuentas por cobrar',                        'debito',  false, false, ''),
  ('1305',   'Cuotas de administración',                  'debito',  true,  false, 'I'),
  ('1310',   'Cuotas extraordinarias',                    'debito',  true,  false, 'I'),
  ('1315',   'Intereses de mora',                         'debito',  true,  false, 'I'),
  ('1320',   'Multas y sanciones',                        'debito',  true,  false, 'I'),
  ('1325',   'Otros conceptos facturados',                'debito',  true,  false, 'I'),
  ('1330',   'Anticipos a proveedores',                   'debito',  true,  false, 'T'),
  ('1335',   'Deudores varios',                           'debito',  true,  false, 'T'),
  ('1390',   'Deterioro de cartera',                      'credito', true,  false, ''),
  ('14',     'Inventarios',                               'debito',  false, false, ''),
  ('1405',   'Elementos de aseo y cafetería',             'debito',  true,  false, ''),
  ('1410',   'Materiales y repuestos de mantenimiento',   'debito',  true,  false, ''),
  ('15',     'Propiedad, planta y equipo',                'debito',  false, false, ''),
  ('1505',   'Muebles y enseres',                         'debito',  true,  false, ''),
  ('1510',   'Equipo de oficina',                         'debito',  true,  false, ''),
  ('1515',   'Equipo de cómputo y comunicaciones',        'debito',  true,  false, ''),
  ('1520',   'Equipo de vigilancia y seguridad',          'debito',  true,  false, ''),
  ('1525',   'Maquinaria y equipo',                       'debito',  true,  false, ''),
  ('1595',   'Depreciación acumulada',                    'credito', true,  false, ''),
  ('16',     'Activos intangibles',                       'debito',  false, false, ''),
  ('1605',   'Licencias y software',                      'debito',  true,  false, ''),
  ('1695',   'Amortización acumulada',                    'credito', true,  false, ''),
  ('17',     'Otros activos',                             'debito',  false, false, ''),
  ('1705',   'Seguros pagados por anticipado',            'debito',  true,  false, ''),
  ('1710',   'Otros pagos anticipados',                   'debito',  true,  false, ''),

  -- ═══ CLASE 2 — PASIVO ═══
  ('2',      'PASIVO',                                    'credito', false, false, ''),
  ('21',     'Obligaciones financieras',                  'credito', false, false, ''),
  ('2105',   'Créditos y sobregiros bancarios',           'credito', true,  false, 'T'),
  ('22',     'Proveedores y contratistas',                'credito', false, false, ''),
  ('2205',   'Proveedores de bienes',                     'credito', true,  false, 'T'),
  ('2210',   'Proveedores de servicios',                  'credito', true,  false, 'T'),
  ('2215',   'Contratistas',                              'credito', true,  false, 'T'),
  ('23',     'Cuentas por pagar',                         'credito', false, false, ''),
  ('2305',   'Servicios públicos',                        'credito', true,  false, 'T'),
  ('2310',   'Honorarios',                                'credito', true,  false, 'T'),
  ('2315',   'Seguridad social y parafiscales',           'credito', true,  false, ''),
  ('2320',   'Retención en la fuente',                    'credito', true,  false, 'T'),
  ('2325',   'Retenciones y aportes de nómina',           'credito', true,  false, ''),
  ('2390',   'Acreedores varios',                         'credito', true,  false, 'T'),
  ('24',     'Obligaciones laborales',                    'credito', false, false, ''),
  ('2405',   'Salarios por pagar',                        'credito', true,  false, 'T'),
  ('2410',   'Cesantías consolidadas',                    'credito', true,  false, 'T'),
  ('2415',   'Intereses sobre cesantías',                 'credito', true,  false, 'T'),
  ('2420',   'Prima de servicios',                        'credito', true,  false, 'T'),
  ('2425',   'Vacaciones',                                'credito', true,  false, 'T'),
  ('25',     'Impuestos por pagar',                       'credito', false, false, ''),
  ('2505',   'Impuesto sobre las ventas (IVA)',           'credito', true,  false, ''),
  ('2510',   'Industria y comercio (ICA)',                'credito', true,  false, ''),
  ('2590',   'Otros impuestos',                           'credito', true,  false, ''),
  ('26',     'Anticipos y depósitos recibidos',           'credito', false, false, ''),
  ('2605',   'Anticipos de copropietarios',               'credito', true,  false, 'I'),
  ('2610',   'Depósitos por uso de zonas comunes',        'credito', true,  false, 'I'),
  ('27',     'Fondos con destinación específica',         'credito', false, false, ''),
  ('2705',   'Fondo de imprevistos',                      'credito', true,  false, 'F'),
  ('2710',   'Fondo de reserva',                          'credito', true,  false, 'F'),
  ('2790',   'Otros fondos específicos',                  'credito', true,  false, 'F'),
  ('28',     'Otros pasivos',                             'credito', false, false, ''),
  ('2805',   'Ingresos recibidos por anticipado',         'credito', true,  false, 'I'),

  -- ═══ CLASE 3 — PATRIMONIO ═══
  ('3',      'PATRIMONIO',                                'credito', false, false, ''),
  ('31',     'Patrimonio social',                         'credito', false, false, ''),
  ('3105',   'Patrimonio inicial',                        'credito', true,  false, ''),
  ('32',     'Fondos patrimoniales',                      'credito', false, false, ''),
  ('3205',   'Fondo de imprevistos',                      'credito', true,  false, 'F'),
  ('3210',   'Fondo de reserva',                          'credito', true,  false, 'F'),
  ('33',     'Resultados',                                'credito', false, false, ''),
  ('3305',   'Excedentes acumulados de ejercicios anteriores', 'credito', true, false, ''),
  ('3310',   'Excedente o déficit del ejercicio',         'credito', true,  false, ''),

  -- ═══ CLASE 4 — INGRESOS ═══
  ('4',      'INGRESOS',                                  'credito', false, false, ''),
  ('41',     'Expensas comunes',                          'credito', false, false, ''),
  ('4105',   'Cuotas ordinarias de administración',       'credito', true,  false, 'I'),
  ('4110',   'Cuotas extraordinarias',                    'credito', true,  false, 'I'),
  ('42',     'Ingresos por mora',                         'credito', false, false, ''),
  ('4205',   'Intereses de mora',                         'credito', true,  false, 'I'),
  ('43',     'Uso de bienes comunes',                     'credito', false, false, ''),
  ('4305',   'Salón social',                              'credito', true,  false, ''),
  ('4310',   'Parqueaderos y zonas de estacionamiento',   'credito', true,  false, ''),
  ('4315',   'Otras zonas comunes',                       'credito', true,  false, ''),
  ('44',     'Explotación económica de bienes comunes',   'credito', false, false, ''),
  ('4405',   'Arrendamiento de espacios',                 'credito', true,  false, 'T'),
  ('4410',   'Antenas y publicidad',                      'credito', true,  false, 'T'),
  ('45',     'Sanciones',                                 'credito', false, false, ''),
  ('4505',   'Multas por incumplimiento del reglamento',  'credito', true,  false, 'I'),
  ('46',     'Otros ingresos',                            'credito', false, false, ''),
  ('4605',   'Rendimientos financieros',                  'credito', true,  false, ''),
  ('4610',   'Recuperaciones y reintegros',               'credito', true,  false, ''),
  ('4690',   'Ingresos diversos',                         'credito', true,  false, ''),

  -- ═══ CLASE 5 — GASTOS ═══
  ('5',      'GASTOS',                                    'debito',  false, false, ''),
  ('51',     'Administración, personal y honorarios',     'debito',  false, false, ''),
  ('5105',   'Honorarios de administración',              'debito',  true,  false, 'TC'),
  ('5110',   'Revisoría fiscal',                          'debito',  true,  false, 'TC'),
  ('5115',   'Contabilidad',                              'debito',  true,  false, 'TC'),
  ('5120',   'Asesoría jurídica',                         'debito',  true,  false, 'TC'),
  ('5125',   'Sueldos y salarios',                        'debito',  true,  false, 'C'),
  ('5130',   'Prestaciones sociales y seguridad social',  'debito',  true,  false, 'C'),
  ('52',     'Vigilancia y seguridad',                    'debito',  false, false, ''),
  ('5205',   'Servicio de vigilancia',                    'debito',  true,  false, 'TC'),
  ('5210',   'Monitoreo y seguridad electrónica',         'debito',  true,  false, 'TC'),
  ('53',     'Aseo y zonas comunes',                      'debito',  false, false, ''),
  ('5305',   'Servicio de aseo',                          'debito',  true,  false, 'TC'),
  ('5310',   'Elementos de aseo y cafetería',             'debito',  true,  false, 'C'),
  ('5315',   'Manejo de residuos',                        'debito',  true,  false, 'TC'),
  ('5320',   'Jardinería y zonas verdes',                 'debito',  true,  false, 'TC'),
  ('54',     'Servicios públicos',                        'debito',  false, false, ''),
  ('5405',   'Energía eléctrica',                         'debito',  true,  false, 'C'),
  ('5410',   'Acueducto y alcantarillado',                'debito',  true,  false, 'C'),
  ('5415',   'Gas',                                       'debito',  true,  false, 'C'),
  ('5420',   'Telefonía e internet',                      'debito',  true,  false, 'C'),
  ('55',     'Mantenimiento y reparaciones',              'debito',  false, false, ''),
  ('5505',   'Ascensores',                                'debito',  true,  false, 'TC'),
  ('5510',   'Equipos de bombeo e hidráulicos',           'debito',  true,  false, 'TC'),
  ('5515',   'Piscina',                                   'debito',  true,  false, 'TC'),
  ('5520',   'Planta eléctrica',                          'debito',  true,  false, 'TC'),
  ('5525',   'Instalaciones eléctricas',                  'debito',  true,  false, 'TC'),
  ('5530',   'Obras civiles y locativas',                 'debito',  true,  false, 'TC'),
  ('5535',   'Equipos de seguridad y control de acceso',  'debito',  true,  false, 'TC'),
  ('5590',   'Otros mantenimientos',                      'debito',  true,  false, 'TC'),
  ('56',     'Seguros',                                   'debito',  false, false, ''),
  ('5605',   'Póliza de áreas comunes',                   'debito',  true,  false, 'TC'),
  ('5610',   'Otras pólizas',                             'debito',  true,  false, 'TC'),
  ('57',     'Gastos legales y de asamblea',              'debito',  false, false, ''),
  ('5705',   'Gastos legales y notariales',               'debito',  true,  false, 'C'),
  ('5710',   'Gastos de asamblea y consejo',              'debito',  true,  false, 'C'),
  ('58',     'Gastos generales',                          'debito',  false, false, ''),
  ('5805',   'Papelería y útiles de oficina',             'debito',  true,  false, 'C'),
  ('5810',   'Software y servicios tecnológicos',         'debito',  true,  false, 'TC'),
  ('5815',   'Comunicaciones y notificaciones',           'debito',  true,  false, 'C'),
  ('5820',   'Gastos bancarios y comisiones',             'debito',  true,  false, 'C'),
  ('5825',   'Transporte y acarreos',                     'debito',  true,  false, 'C'),
  ('5830',   'Impuestos y contribuciones asumidos',       'debito',  true,  false, 'C'),
  ('5835',   'Intereses y gastos de financiación',        'debito',  true,  false, 'C'),
  ('5890',   'Gastos diversos',                           'debito',  true,  false, 'C'),
  ('59',     'Depreciaciones, amortizaciones y deterioros', 'debito', false, false, ''),
  ('5905',   'Depreciación',                              'debito',  true,  false, 'C'),
  ('5910',   'Amortización',                              'debito',  true,  false, 'C'),
  ('5915',   'Deterioro de cartera',                      'debito',  true,  false, ''),
  ('5990',   'Otros deterioros',                          'debito',  true,  false, 'C'),

  -- ═══ CLASE 6 — COSTOS (opcional) ═══
  ('6',      'COSTOS',                                    'debito',  false, true,  ''),
  ('61',     'Costos de actividades generadoras de ingresos', 'debito', false, true, ''),
  ('6105',   'Personal asociado',                         'debito',  true,  true,  'C'),
  ('6110',   'Insumos y suministros',                     'debito',  true,  true,  'C'),
  ('6190',   'Otros costos',                              'debito',  true,  true,  'C'),

  -- ═══ CLASE 8 — CUENTAS DE ORDEN (opcional) ═══
  ('8',      'CUENTAS DE ORDEN',                          'debito',  false, true,  ''),
  ('81',     'Deudoras',                                  'debito',  false, true,  ''),
  ('8105',   'Cartera en proceso jurídico',               'debito',  true,  true,  'I'),
  ('8110',   'Bienes recibidos en administración',        'debito',  true,  true,  ''),
  ('82',     'Acreedoras',                                'credito', false, true,  ''),
  ('8205',   'Contratos y compromisos vigentes',          'credito', true,  true,  'T'),
  ('8210',   'Garantías recibidas',                       'credito', true,  true,  'T')
) as v(codigo, nombre, nat, mov, opc, dim)
where p.codigo = 'PUC_PH_CO_V1';

-- ── parent_id por prefijo: el código ya codifica la jerarquía ────────────
update public.contable_plan_cuenta h
set parent_id = p.id
from public.contable_plan_cuenta p
where p.plan_id = h.plan_id
  and length(h.codigo) > 1
  and length(p.codigo) =
    case length(h.codigo) when 2 then 1 when 4 then 2 when 6 then 4 when 8 then 6 end
  and left(h.codigo, length(p.codigo)) = p.codigo;
