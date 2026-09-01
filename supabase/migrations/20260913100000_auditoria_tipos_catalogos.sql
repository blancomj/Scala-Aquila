-- ═══════════════════════════════════════════════════════════════════════
--  auditoria_tipo_auditoria, auditoria_catalogo_riesgos
--  Catálogos globales de tipos de auditoría y riesgos de referencia
--  (Prompt Maestro Modulo Auditoria AQUILA, §8, §11)
--
--  Son catálogos de PLATAFORMA (no tienen tenant_id — igual que otros
--  catálogos globales del sistema): toda copropiedad ve el mismo catálogo
--  de referencia. Lectura abierta a cualquier usuario autenticado;
--  escritura reservada a administración de plataforma (mantenido vía
--  migraciones — sin política de INSERT/UPDATE/DELETE para roles de
--  tenant, y FORCE RLS bloquea todo lo que no tenga política explícita).
-- ═══════════════════════════════════════════════════════════════════════

-- ── Tipos de auditoría ─────────────────────────────────────────────────────
create table public.auditoria_tipo_auditoria (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique,
  nombre     text not null,
  descripcion text,
  area       text,                  -- FINANCIERA, CONTABLE, OPERATIVA, etc.
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.auditoria_tipo_auditoria enable row level security;
alter table public.auditoria_tipo_auditoria force row level security;

comment on table public.auditoria_tipo_auditoria is 'Catálogo global de tipos de auditoría (PROMPT AUDITORÍA §8) — sin tenant_id, es de plataforma.';

-- ── Catálogo de riesgos inicial ───────────────────────────────────────────
create table public.auditoria_catalogo_riesgos (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique,
  nombre     text not null,
  descripcion text,
  categoria  text not null,  -- FINANCIERO, CONTABLE, TRIBUTARIO, OPERATIVO, FRAUDE, ERROR, CARTERA, LIQUIDACION, TESORERIA, TECNOLOGICO, CIBERSEGURIDAD, ACCESO, DATOS, DOCUMENTAL, CUMPLIMIENTO, REPUTACIONAL, LEGAL, GOBIERNO
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.auditoria_catalogo_riesgos enable row level security;
alter table public.auditoria_catalogo_riesgos force row level security;

comment on table public.auditoria_catalogo_riesgos is 'Catálogo global de riesgos de referencia (PROMPT AUDITORÍA §11) — sin tenant_id, es de plataforma. auditoria_riesgos (por tenant) puede usar codigo como plantilla.';

-- ── RLS: lectura abierta a cualquier autenticado, sin escritura por RLS ────
create policy auditoria_tipo_auditoria_select
  on public.auditoria_tipo_auditoria for select
  to authenticated
  using (true);

create policy auditoria_catalogo_riesgos_select
  on public.auditoria_catalogo_riesgos for select
  to authenticated
  using (true);

-- ── Datos iniciales de tipos de auditoría ──────────────────────────────────
insert into public.auditoria_tipo_auditoria (codigo, nombre, descripcion, area) values
  ('OPERATIVA', 'Operativa', 'Revisiones operativas y controles administrativos', 'OPERATIVO'),
  ('FINANCIERA', 'Financiera', 'Control de procesos financieros y contables', 'FINANCIERO'),
  ('CONTABLE', 'Contable', 'Verificación de estados y movimientos contables', 'CONTABLE'),
  ('TRIBUTARIA', 'Tributaria', 'Control de obligaciones tributarias', 'TRIBUTARIO'),
  ('PRESUPUESTAL', 'Presupuestal', 'Control de formulación y ejecución del presupuesto', 'PRESUPUESTAL'),
  ('CARTERA', 'Cartera', 'Control de saldos, cobros y acuerdos', 'CARTERA'),
  ('RECAUDO', 'Recaudo', 'Control de medios de pago y aplicación', 'RECAUDO'),
  ('TESORERIA', 'Tesorería', 'Control de movimientos bancarios y conciliaciones', 'TESORERIA'),
  ('BANCARIA', 'Bancaria', 'Control de cuentas y transferencias', 'BANCARIA'),
  ('CONTRATACION', 'Contratación', 'Control de terceros y obligaciones', 'CONTRATACION'),
  ('PROVEEDORES', 'Proveedores', 'Control de documentos y pagos a terceros', 'PROVEEDORES'),
  ('DOCUMENTAL', 'Documental', 'Control de versiones, integridad y vencimientos', 'DOCUMENTAL'),
  ('SEGURIDAD', 'Seguridad', 'Control de accesos, roles y sesiones', 'SEGURIDAD'),
  ('ACCESOS', 'Accesos', 'Control de privilegios y actividades', 'ACCESOS'),
  ('DATOS', 'Datos', 'Control de integridad y consistencia', 'DATOS'),
  ('CUMPLIMIENTO', 'Cumplimiento', 'Verificación de requisitos normativos', 'CUMPLIMIENTO'),
  ('LIQUIDACION', 'Liquidación', 'Control de procesos de liquidación', 'LIQUIDACION'),
  ('FONDOS', 'Fondos', 'Control de fondos de imprevistos y restos', 'FONDOS'),
  ('EXTRAORDINARIA', 'Extraordinaria', 'Auditorías especiales o incidentes', 'OPERATIVO')
on conflict (codigo) do nothing;

-- ── Datos iniciales de riesgos categóricos ─────────────────────────────────
insert into public.auditoria_catalogo_riesgos (codigo, nombre, descripcion, categoria) values
  ('FIN-001', 'Riesgo financiero', 'Exposición a errores en procesos financieros', 'FINANCIERO'),
  ('FIN-002', 'Fraude financiero', 'Oportunidad o incentivo para fraude financiero', 'FRAUDE'),
  ('FIN-003', 'Error operativo', 'Errores en captura, aplicación o registro', 'ERROR'),
  ('CON-001', 'Riesgo contable', 'Errores en comprobantes o conciliaciones', 'CONTABLE'),
  ('TRIB-001', 'Obligaciones tributarias', 'Incumplimiento de requisitos fiscales', 'TRIBUTARIO'),
  ('OP-001', 'Proceso interrumpido', 'Fallas en flujos operativos', 'OPERATIVO'),
  ('OP-002', 'Duplicidad', 'Transacciones o registros duplicados', 'ERROR'),
  ('CAR-001', 'Riesgo de cartera', 'Problemas en gestión de saldos y cobros', 'CARTERA'),
  ('CAR-002', 'Incumplimiento de protocolos', 'No cumplimiento de certificaciones', 'LEGAL'),
  ('TES-001', 'Discrepancia bancaria', 'Diferencias en conciliaciones', 'TESORERIA'),
  ('DOC-001', 'Documentos incompletos', 'Falta de soportes o versión incorrecta', 'DOCUMENTAL'),
  ('SEG-001', 'Acceso no autorizado', 'Acceso a datos fuera de canal', 'SEGURIDAD'),
  ('DAT-001', 'Datos inconsistentes', 'Registros huérfanos o inválidos', 'DATOS'),
  ('CUM-001', 'No cumplimiento normativo', 'Incumplimiento de leyes/procedimientos', 'CUMPLIMIENTO')
on conflict (codigo) do nothing;
