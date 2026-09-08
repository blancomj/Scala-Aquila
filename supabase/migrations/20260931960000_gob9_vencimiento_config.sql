-- ═══════════════════════════════════════════════════════════════════════
--  GOB-9 (2/7) · Motor de vencimientos — configuración y bitácora
--  Ver GOB_09_comunicaciones_workflow.md §3.3, pruebas 6-8, 11.
--
--  gobierno_tipo_vencimiento_t es enum nativo (no lista_tipos) por el
--  mismo criterio de D-24/estado_acuse_t: cada valor GATILLA una consulta
--  de detección distinta y hardcodeada a una tabla concreta
--  (gobierno_compromisos, gobierno_expediente_actuaciones,
--  gobierno_impugnaciones, solicitudes, gobierno_actas) — no es
--  vocabulario descriptivo que un tenant pueda ampliar; un valor nuevo
--  exigiría código nuevo en gobierno_detectar_vencimientos(), igual que
--  un canal de cobranza nuevo exige código nuevo en despacho_cobranza.ts.
--
--  Cero reglas sembradas por defecto (criterio de aceptación GOB-9): esta
--  migración NO inserta ninguna fila en gobierno_vencimiento_config. Sin
--  configuración, el motor no notifica nada — comportamiento, no un caso
--  de error.
-- ═══════════════════════════════════════════════════════════════════════

create type public.gobierno_tipo_vencimiento_t as enum (
  'compromiso',              -- gobierno_compromisos.fecha_limite
  'expediente_convivencia',  -- gobierno_expediente_actuaciones.fecha_limite
  'impugnacion',             -- gobierno_impugnaciones.plazo_limite
  'solicitud',               -- solicitudes.sla_vence_at
  'acta_disposicion'         -- gobierno_actas.plazo_disposicion_limite
);

comment on type public.gobierno_tipo_vencimiento_t is
  'Por qué es enum nativo (D-24): 5 valores CERRADOS, cada uno gatilla una consulta de detección '
  'distinta y codificada a una tabla concreta en gobierno_detectar_vencimientos() — no es '
  'vocabulario ampliable por tenant, es la lista de máquinas de estado que GOB-9 sabe consultar. '
  'Un sexto valor exige código nuevo, no una fila de catálogo.';

-- ── Configuración por tenant: a cuántos días, a quién, por qué canal ────
create table public.gobierno_vencimiento_config (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  tipo_vencimiento   public.gobierno_tipo_vencimiento_t not null,
  dias_anticipacion  integer not null,
  canal              public.canal_cobranza_t not null,
  destinatario_regla text not null default 'responsable',
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,

  constraint gobierno_vencimiento_config_dias_valido check (dias_anticipacion >= 0),
  constraint gobierno_vencimiento_config_regla_valida check (
    destinatario_regla in ('responsable', 'administracion', 'organo')
  ),
  constraint gobierno_vencimiento_config_unica unique (tenant_id, tipo_vencimiento, dias_anticipacion)
);

alter table public.gobierno_vencimiento_config enable row level security;
alter table public.gobierno_vencimiento_config force row level security;

create trigger set_updated_at before update on public.gobierno_vencimiento_config
  for each row execute function public.set_updated_at();

create policy gobierno_vencimiento_config_select_miembro
  on public.gobierno_vencimiento_config for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_vencimiento_config_administrador_todo
  on public.gobierno_vencimiento_config for all
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

comment on table public.gobierno_vencimiento_config is
  'GOB-9 §3.3: por tenant y tipo de vencimiento, a cuántos días de anticipación notificar, por '
  'qué canal y a quién. BUENA PRÁCTICA (marco §4) — ninguna norma fija estos días; sin fila para '
  'un tipo, ese tipo simplemente no genera notificaciones (no es un error, es la ausencia de '
  'configuración). destinatario_regla: ''responsable'' resuelve el responsable propio de la '
  'entidad (miembro/tercero del compromiso, solicitante, impugnante); ''administracion''/'
  '''organo'' son remisiones explícitas cuando la entidad no tiene responsable individual.';

-- ── Bitácora append-only: qué se notificó, para no repetirlo ────────────
create table public.gobierno_vencimiento_notificaciones (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  tipo_vencimiento public.gobierno_tipo_vencimiento_t not null,
  entidad_id       uuid not null,
  config_id        uuid not null references public.gobierno_vencimiento_config (id),
  fecha_deteccion  date not null default current_date,
  envio_id         uuid references public.acciones_cobranza_envios (id),
  created_at       timestamptz not null default now(),

  -- Prueba 8: una notificación ya emitida no se repite en la corrida
  -- siguiente. La llave natural es (entidad, config) — no incluye la
  -- fecha: si la corrida de mañana ve la misma entidad bajo la misma
  -- regla de anticipación, este unique la detiene ANTES de intentar
  -- despachar nada de nuevo.
  constraint gobierno_vencimiento_notificaciones_unica unique (tenant_id, tipo_vencimiento, entidad_id, config_id)
);

alter table public.gobierno_vencimiento_notificaciones enable row level security;
alter table public.gobierno_vencimiento_notificaciones force row level security;

create trigger gobierno_vencimiento_notificaciones_append_only
  before update or delete on public.gobierno_vencimiento_notificaciones
  for each row execute function public.forbid_mutation();

create index gobierno_vencimiento_notificaciones_tenant_idx
  on public.gobierno_vencimiento_notificaciones (tenant_id, tipo_vencimiento, entidad_id);

create policy gobierno_vencimiento_notificaciones_select_miembro
  on public.gobierno_vencimiento_notificaciones for select
  to authenticated
  using (public.is_member(tenant_id));

comment on table public.gobierno_vencimiento_notificaciones is
  'GOB-9 §3.3 prueba 8: registra qué (entidad, regla de anticipación) ya generó una notificación, '
  'para que la corrida siguiente no la repita. Append-only, solo la escribe '
  'gobierno_detectar_vencimientos() (SECURITY DEFINER) — nunca cambia estado de la entidad '
  'notificada (prueba 7): esta tabla es la ÚNICA escritura que hace el motor.';
