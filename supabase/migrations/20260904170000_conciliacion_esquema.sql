-- ═══════════════════════════════════════════════════════════════════════
--  Motor de conciliación bancaria — Fase 3, Bloque B.
--  Propietario: Docs/evaluacion/05-evaluacion-pagos-conciliacion.md §E.
--
--  LA REGLA DE ORO (§E.5, no admite excepción): la conciliación NUNCA edita
--  el ledger. Solo crea `pagos` legítimos, por el mismo camino canónico que
--  ya usa registrar-pago (imputarPago/registrarPago) — este esquema no
--  agrega ninguna vía de escritura directa a pagos/pago_aplicaciones/cargos.
--
--  Motiva por qué las 3 tablas de aquí NO tienen política de escritura para
--  `authenticated`: crear/resolver una línea de conciliación decide si un
--  movimiento bancario se convierte en un pago real — mismo efecto de
--  seguridad que pagos/pago_aplicaciones (REQ-SEC-001).
-- ═══════════════════════════════════════════════════════════════════════

create type public.extracto_origen_t as enum ('banco', 'pasarela', 'datafono');

comment on type public.extracto_origen_t is
  'De dónde vienen los movimientos de un extracto. Enum nativo y no lista_tipos (D-24) porque '
  'el valor decide qué parser y qué estrategia de matching aplica: banco parsea por entidad '
  'financiera (ENTIDAD_FINANCIERA), mientras pasarela y datafono llegan con transaction_id '
  'propio y saltan directo al matching determinista contra intenciones_pago/pagos existentes.';

create type public.conciliacion_estado_t as enum
  ('pendiente', 'conciliada_auto', 'conciliada_manual', 'descartada');

comment on type public.conciliacion_estado_t is
  'Estado de conciliación de una línea de extracto bancario. Enum nativo y no lista_tipos '
  '(D-24) porque el valor gatilla lógica real: solo pendiente admite ser resuelta '
  '(guard_conciliacion_transicion), los dos conciliada_* exigen pago_id no nulo y descartada '
  'exige motivo (extracto_linea_coherencia_estado, un CHECK que hace cumplir esto). Además '
  'separa auto de manual porque el KPI de producto (% auto-conciliado, §E.6) se calcula sobre '
  'esa distinción exacta.';

create type public.conciliacion_metodo_t as enum ('referencia', 'monto_fecha', 'heuristico');

comment on type public.conciliacion_metodo_t is
  'Método que produjo una propuesta o conciliación automática (§E.2-E.4). Enum nativo y no '
  'lista_tipos (D-24): el valor decide el comportamiento de seguridad más importante del '
  'módulo — referencia y monto_fecha son deterministas y pueden auto-conciliar; heuristico '
  'JAMÁS auto-aplica, solo propone (§6.1). Si esto fuera texto libre en un catálogo editable, '
  'esa barrera de seguridad dependería de datos, no de código.';

-- ── extracto_bancario — el archivo importado ────────────────────────────
create table public.extracto_bancario (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  cuenta_bancaria_id uuid references public.cuentas_bancarias (id),
  origen             public.extracto_origen_t not null default 'banco',
  nombre_archivo     text not null,
  hash_archivo       text not null,
  storage_path       text,
  periodo_desde      date,
  periodo_hasta      date,
  lineas_totales     int not null default 0,
  importado_por      uuid references public.profiles (id),
  created_at         timestamptz not null default now()
);

comment on table public.extracto_bancario is
  'Extracto bancario importado (§E.1). Reimportar el mismo archivo no duplica nada '
  '(extracto_bancario_hash_unico) — la ingesta es idempotente por diseño, no por convención.';

alter table public.extracto_bancario enable row level security;
alter table public.extracto_bancario force row level security;

create index extracto_bancario_tenant_idx on public.extracto_bancario (tenant_id);

-- Reimportar el mismo archivo NO duplica nada (doc propietario §E.5).
create unique index extracto_bancario_hash_unico
  on public.extracto_bancario (tenant_id, hash_archivo);

create policy extracto_bancario_select_miembro on public.extracto_bancario
  for select to authenticated
  using (public.is_member(tenant_id));

-- ── extracto_linea — cada movimiento ────────────────────────────────────
create table public.extracto_linea (
  id                uuid primary key default gen_random_uuid(),
  extracto_id       uuid not null references public.extracto_bancario (id) on delete cascade,
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  fecha_movimiento  date not null,
  -- Puede ser negativo (débitos, comisiones) — §6.3: un monto negativo
  -- nunca es candidato a pago.
  monto             numeric(18, 2) not null,
  descripcion_banco text not null,
  referencia_banco  text,
  hash_linea        text not null,
  estado            public.conciliacion_estado_t not null default 'pendiente',
  pago_id           uuid references public.pagos (id),
  descartada_motivo text,
  resuelta_por      uuid references public.profiles (id),
  resuelta_at       timestamptz,
  created_at        timestamptz not null default now()
);

comment on table public.extracto_linea is
  'Cada movimiento de un extracto. NUNCA se asume que es un pago de residente (§6.3): un monto '
  'negativo no es candidato, y "descartar con motivo" es un desenlace legítimo y auditado, no '
  'un fallo. pago_id solo se llena cuando la línea se resuelve por el camino canónico de '
  'registrar-pago — este esquema no ofrece ningún otro camino de escritura a pagos.';

comment on column public.extracto_linea.hash_linea is
  'SHA-256 de (fecha_movimiento, monto, descripcion_banco normalizada, referencia_banco) — '
  'exactamente esos 4 campos crudos, ver conciliacion-parsers.ts::hashLinea(). Documentado aquí '
  'porque cambiar la definición invalida todos los hashes existentes y duplica todo lo '
  'reimportado después del cambio.';

alter table public.extracto_linea enable row level security;
alter table public.extracto_linea force row level security;

create index extracto_linea_tenant_idx on public.extracto_linea (tenant_id);
create index extracto_linea_extracto_idx on public.extracto_linea (extracto_id);
create index extracto_linea_estado_idx on public.extracto_linea (tenant_id, estado);

create unique index extracto_linea_hash_unico
  on public.extracto_linea (extracto_id, hash_linea);

-- Una línea de extracto genera como máximo un pago, y un pago viene de como
-- máximo una línea — barrera contra el doble registro cuando se reimporta un
-- extracto solapado, o cuando el datáfono de Bold (Bloque A/§7.3) y el
-- webhook online reportan el mismo cobro por dos caminos distintos.
create unique index extracto_linea_pago_unico
  on public.extracto_linea (pago_id) where pago_id is not null;

alter table public.extracto_linea add constraint extracto_linea_coherencia_estado check (
  (estado = 'pendiente'                                  and pago_id is null and descartada_motivo is null)
  or (estado in ('conciliada_auto', 'conciliada_manual')  and pago_id is not null)
  or (estado = 'descartada'                               and pago_id is null and descartada_motivo is not null)
);

create policy extracto_linea_select_miembro on public.extracto_linea
  for select to authenticated
  using (public.is_member(tenant_id));

-- Una línea resuelta (cualquier estado ≠ pendiente) es terminal: mismo
-- criterio de guard_intencion_transicion (20260904130000) — ninguna
-- reconciliación se deshace escribiendo encima, se corrige anulando el pago
-- (fn_anular_pago) si hiciera falta.
create function public.guard_conciliacion_transicion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado <> 'pendiente' then
    raise exception
      'CONCILIACION_LINEA_YA_RESUELTA: la línea % ya está % y es terminal (pago %)',
      old.id, old.estado, old.pago_id;
  end if;
  new.resuelta_at := coalesce(new.resuelta_at, now());
  return new;
end;
$$;

create trigger extracto_linea_transicion
  before update on public.extracto_linea
  for each row execute function public.guard_conciliacion_transicion();

-- ── conciliacion_propuesta — lo que el motor SUGIERE, nunca lo que hace ─
create table public.conciliacion_propuesta (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  linea_id     uuid not null references public.extracto_linea (id) on delete cascade,
  inmueble_id  uuid not null references public.inmuebles (id),
  metodo       public.conciliacion_metodo_t not null,
  score        numeric(5, 4) not null check (score > 0 and score <= 1),
  -- Factores que contribuyeron (referencia parseada, distancia de fecha,
  -- similitud de nombre, monto exacto o no) — mismo principio de
  -- trazabilidad que el `trace` del motor de liquidación. No decorativo:
  -- es lo que el administrador lee para decidir si confirma.
  explicacion  jsonb not null,
  created_at   timestamptz not null default now()
);

comment on table public.conciliacion_propuesta is
  'Candidatos que el motor de matching sugiere para una línea — NUNCA aplica dinero por sí '
  'sola (§6.1). Solo conciliar-linea/index.ts, con una persona confirmando explícitamente, '
  'convierte una propuesta en un pago real.';

alter table public.conciliacion_propuesta enable row level security;
alter table public.conciliacion_propuesta force row level security;

create index conciliacion_propuesta_tenant_idx on public.conciliacion_propuesta (tenant_id);
create index conciliacion_propuesta_linea_idx on public.conciliacion_propuesta (linea_id);

create policy conciliacion_propuesta_select_miembro on public.conciliacion_propuesta
  for select to authenticated
  using (public.is_member(tenant_id));
