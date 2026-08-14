-- ═══════════════════════════════════════════════════════════════════════
--  F2 · Tablas del dominio PH (entrada de cálculo)
--  Propietario: PLAN_MAESTRO_IMPLEMENTACION.md §4.2-4.3
--
--  D-13: liquidaciones/liquidacion_lineas/saldos/novedades/pagos NO viven
--  aquí — se diseñan en F5 junto con el grafo y el pipeline que los llenan.
--
--  SEC-12 (PLAN §4.4): toda tabla de dominio lleva su propio `tenant_id`,
--  incluidas las líneas hijas (coeficientes, presupuesto_rubros,
--  inmueble_propietario, fondo_movimientos) — aunque sea derivable vía su
--  FK padre, así toda política RLS filtra por columna directa, sin join.
--
--  AD-08 / SEC-01: RLS ENABLE + FORCE en la MISMA migración que crea la
--  tabla. Sin políticas todavía: deny-by-default (llegan en la siguiente
--  migración).
-- ═══════════════════════════════════════════════════════════════════════

-- ── tenants: atributos de copropiedad (PLAN §4.2) ──────────────────────
alter table public.tenants
  add column nit          text,
  add column direccion    text,
  add column moneda       char(3) not null default 'COP',
  add column zona_horaria text not null default 'America/Bogota';

-- ── inmuebles — destino de cobro (PLAN §4.3, UNIT.CODE) ────────────────
create table public.inmuebles (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants (id) on delete cascade,
  codigo                  text not null,
  tipo                    public.inmueble_tipo_t not null,
  matricula_inmobiliaria  text,
  area_privada            numeric(14, 4),
  area_comun              numeric(14, 4),
  estado                  public.inmueble_estado_t not null default 'activo',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz,

  constraint inmuebles_codigo_unico unique (tenant_id, codigo)
);

alter table public.inmuebles enable row level security;
alter table public.inmuebles force row level security;

create index inmuebles_tenant_idx on public.inmuebles (tenant_id);

comment on table public.inmuebles is
  'Propiedad privada: tiene dueño y coeficiente, es destino de cobro y de prorrateo '
  '(PLAN §4.1.1). Mapea al contrato AEL UNIT (§4.1.2).';

-- ── zonas_comunes — inventario, fuera de la cadena de cálculo (R6) ─────
create table public.zonas_comunes (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references public.tenants (id) on delete cascade,
  codigo                      text not null,
  nombre                      text not null,
  tipo                        public.zona_comun_tipo_t not null,
  area                        numeric(14, 4),
  -- §4.3.1 forma B: bien común de uso exclusivo de un inmueble (sin coeficiente propio).
  uso_exclusivo_inmueble_id   uuid references public.inmuebles (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz,

  constraint zonas_comunes_codigo_unico unique (tenant_id, codigo)
);

alter table public.zonas_comunes enable row level security;
alter table public.zonas_comunes force row level security;

create index zonas_comunes_tenant_idx on public.zonas_comunes (tenant_id);
create index zonas_comunes_uso_exclusivo_idx
  on public.zonas_comunes (uso_exclusivo_inmueble_id)
  where uso_exclusivo_inmueble_id is not null;

comment on table public.zonas_comunes is
  'Descriptiva: inventario de bienes comunes. R6 (PLAN §4.1.1): nunca es target de una '
  'allocation ni sujeto de una línea de liquidación — su sostenimiento se cubre vía el '
  'concepto CUOTA_ADMIN, no vía cargo individual. '
  'GAP abierto (PLAN §4.3.1): "un mismo bien nunca existe en las dos tablas [inmuebles / '
  'zonas_comunes]" debe validarse por constraint, no solo por convención — el plan no fija '
  'la clave de identidad del bien (¿matrícula?) para esa validación cruzada. No se '
  'implementa aquí; requiere decisión antes de F6.';

-- ── coeficiente_sets / coeficientes — versionado, vigencia histórica ───
create table public.coeficiente_sets (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  version         int not null,
  vigente_desde   date not null,
  vigente_hasta   date,
  estado          public.vigencia_estado_t not null default 'borrador',
  -- 16 §82: NO se asume 1.0 — se persiste el valor real.
  suma_total      numeric(12, 10) not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,

  constraint coeficiente_sets_version_unica unique (tenant_id, version)
);

alter table public.coeficiente_sets enable row level security;
alter table public.coeficiente_sets force row level security;

create index coeficiente_sets_tenant_idx on public.coeficiente_sets (tenant_id);
create unique index coeficiente_sets_vigente_unico
  on public.coeficiente_sets (tenant_id)
  where estado = 'vigente';

create table public.coeficientes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  set_id        uuid not null references public.coeficiente_sets (id) on delete cascade,
  inmueble_id   uuid not null references public.inmuebles (id) on delete cascade,
  valor         numeric(12, 10) not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,

  constraint coeficientes_unico unique (set_id, inmueble_id)
);

alter table public.coeficientes enable row level security;
alter table public.coeficientes force row level security;

create index coeficientes_tenant_idx on public.coeficientes (tenant_id);
create index coeficientes_set_idx on public.coeficientes (set_id);

-- ── propietarios / inmueble_propietario — datos, no usuarios (AD-26) ───
create table public.propietarios (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  tipo_documento     text not null,
  numero_documento   text not null,
  nombre             text not null,
  email              extensions.citext,
  telefono           text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,

  constraint propietarios_documento_unico unique (tenant_id, tipo_documento, numero_documento)
);

alter table public.propietarios enable row level security;
alter table public.propietarios force row level security;

create index propietarios_tenant_idx on public.propietarios (tenant_id);

comment on table public.propietarios is
  'Datos del dominio, no usuarios (AD-26): sin FK a auth.users, sin política RLS propia '
  'de identidad — se leen a través del tenant (PLAN §7.5).';

create table public.inmueble_propietario (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  inmueble_id      uuid not null references public.inmuebles (id) on delete cascade,
  propietario_id   uuid not null references public.propietarios (id) on delete cascade,
  porcentaje       numeric(6, 3) not null,
  desde            date not null,
  hasta            date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,

  constraint inmueble_propietario_porcentaje_valido check (porcentaje > 0 and porcentaje <= 100),
  constraint inmueble_propietario_fechas_validas check (hasta is null or hasta >= desde)
);

alter table public.inmueble_propietario enable row level security;
alter table public.inmueble_propietario force row level security;

create index inmueble_propietario_tenant_idx on public.inmueble_propietario (tenant_id);
create index inmueble_propietario_inmueble_idx on public.inmueble_propietario (inmueble_id);

-- ── periodos ────────────────────────────────────────────────────────────
create table public.periodos (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants (id) on delete cascade,
  anio                 int not null,
  mes                  int not null,
  estado               public.periodo_estado_t not null default 'abierto',
  fecha_vencimiento    date,
  cerrado_at           timestamptz,
  cerrado_por          uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz,

  constraint periodos_unico unique (tenant_id, anio, mes),
  constraint periodos_mes_valido check (mes between 1 and 12)
);

alter table public.periodos enable row level security;
alter table public.periodos force row level security;

create index periodos_tenant_idx on public.periodos (tenant_id);

comment on column public.periodos.estado is
  'Transiciones válidas (PLAN §4.3, 24 §24): abierto → en_liquidacion → cerrado → '
  'bloqueado. cerrado → abierto solo vía reapertura autorizada y auditada (16 §94). '
  'Enforced por trigger guard_periodo_transicion.';

-- ── conceptos — el ítem de cobro facturable ────────────────────────────
create table public.conceptos (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  codigo          text not null,
  nombre          text not null,
  tipo_base       public.concepto_tipo_base_t not null,
  modo_calculo    public.concepto_modo_calculo_t not null,
  formula_ael     text,
  prioridad       int not null default 0,
  estado          public.concepto_estado_t not null default 'borrador',
  version         int not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,

  constraint conceptos_codigo_unico unique (tenant_id, codigo)
);

alter table public.conceptos enable row level security;
alter table public.conceptos force row level security;

create index conceptos_tenant_idx on public.conceptos (tenant_id);

-- ── politicas_financieras — parámetros configurables y versionados ─────
create table public.politicas_financieras (
  id                              uuid primary key default gen_random_uuid(),
  tenant_id                       uuid not null references public.tenants (id) on delete cascade,
  version                         int not null,
  estado                          public.vigencia_estado_t not null default 'borrador',
  vigente_desde                   date,
  vigente_hasta                   date,
  redondeo_modo                   public.redondeo_modo_t not null default 'half_up',
  redondeo_escala                 int not null default 0,
  residual_metodo                 public.residual_metodo_t not null default 'mayor_resto',
  imputacion_orden                jsonb not null default '[]'::jsonb,
  interes_tasa_mensual            numeric(8, 6),
  interes_tope_mensual            numeric(8, 6),
  interes_dias_gracia             int not null default 0,
  fondo_imprevistos_porcentaje    numeric(6, 4),
  fondo_imprevistos_base          public.fondo_base_calculo_t,
  coeficientes_suma_esperada      numeric(12, 10) not null default 1.0,
  -- 19 §73: hash del contenido canónico de la política — provenance del resultado (20 §54).
  policy_hash                     text not null,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz
);

alter table public.politicas_financieras enable row level security;
alter table public.politicas_financieras force row level security;

create index politicas_financieras_tenant_idx on public.politicas_financieras (tenant_id);
create unique index politicas_financieras_version_unica
  on public.politicas_financieras (tenant_id, version);
create unique index politicas_financieras_vigente_unica
  on public.politicas_financieras (tenant_id)
  where estado = 'vigente';

comment on table public.politicas_financieras is
  'Ningún parámetro normativo es constante del motor: todos viven aquí, versionados, y '
  'entran en el Snapshot (17). Una política vigente/historica es inmutable — corregir = '
  'versión nueva (enforced por trigger guard_politica_inmutable).';

-- ── presupuestos — anual, entidad de dominio ───────────────────────────
create table public.presupuestos (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  anio               int not null,
  version            int not null,
  estado             public.presupuesto_estado_t not null default 'borrador',
  monto_total        numeric(18, 2) not null,
  acta_asamblea      text,
  fecha_aprobacion   date,
  vigente_desde      date,
  vigente_hasta      date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,

  constraint presupuestos_version_unica unique (tenant_id, anio, version),
  constraint presupuestos_monto_no_negativo check (monto_total >= 0)
);

alter table public.presupuestos enable row level security;
alter table public.presupuestos force row level security;

create index presupuestos_tenant_idx on public.presupuestos (tenant_id);
-- Un solo presupuesto vigente por (tenant, año) simultáneamente (PLAN §4.3).
create unique index presupuestos_vigente_unico
  on public.presupuestos (tenant_id, anio)
  where estado = 'vigente';

comment on table public.presupuestos is
  'Input de cálculo (entra en el Snapshot, 17) sujeto a inmutabilidad histórica (16 §111). '
  'vigente/cerrado es inmutable — corregir = versión nueva (guard_presupuesto_inmutable).';

create table public.presupuesto_rubros (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  presupuesto_id   uuid not null references public.presupuestos (id) on delete cascade,
  codigo           text not null,
  nombre           text not null,
  categoria        public.presupuesto_rubro_categoria_t not null,
  monto_anual      numeric(18, 2) not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,

  constraint presupuesto_rubros_codigo_unico unique (presupuesto_id, codigo),
  constraint presupuesto_rubros_monto_no_negativo check (monto_anual >= 0)
);

alter table public.presupuesto_rubros enable row level security;
alter table public.presupuesto_rubros force row level security;

create index presupuesto_rubros_tenant_idx on public.presupuesto_rubros (tenant_id);
create index presupuesto_rubros_presupuesto_idx on public.presupuesto_rubros (presupuesto_id);

comment on table public.presupuesto_rubros is
  'Construyen el presupuesto; no llegan a la factura — todo agrega en el concepto único '
  'CUOTA_ADMIN (PLAN §4.3). La tabla `gastos` de ejecución presupuestal queda pospuesta, '
  'fuera de alcance de esta fase.';

-- ── fondos / fondo_movimientos — fondo de imprevistos ──────────────────
create table public.fondos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  tipo           public.fondo_tipo_t not null,
  nombre         text not null,
  -- Derivado de fondo_movimientos (nunca fuente de verdad, 20 §18) — se
  -- recalcula por trigger recalcular_saldo_fondo en cada movimiento.
  saldo_actual   numeric(18, 2) not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);

alter table public.fondos enable row level security;
alter table public.fondos force row level security;

create index fondos_tenant_idx on public.fondos (tenant_id);
create unique index fondos_imprevistos_unico
  on public.fondos (tenant_id)
  where tipo = 'imprevistos';

create table public.fondo_movimientos (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  fondo_id          uuid not null references public.fondos (id) on delete cascade,
  tipo              public.fondo_movimiento_tipo_t not null,
  monto             numeric(18, 2) not null,
  periodo_id        uuid references public.periodos (id),
  -- FK diferida: `liquidaciones` se crea en F5 (D-13). Se añade la
  -- restricción de clave foránea en la migración de F5 que cree esa tabla.
  liquidacion_id    uuid,
  descripcion       text,
  autorizado_por    uuid references public.profiles (id),
  created_at        timestamptz not null default now(),

  constraint fondo_movimientos_monto_positivo check (monto > 0)
);

alter table public.fondo_movimientos enable row level security;
alter table public.fondo_movimientos force row level security;

create index fondo_movimientos_tenant_idx on public.fondo_movimientos (tenant_id);
create index fondo_movimientos_fondo_idx on public.fondo_movimientos (fondo_id);

comment on table public.fondo_movimientos is
  'Append-only — sin UPDATE ni DELETE para ningún rol (PLAN §4.3), igual que audit_log.';
