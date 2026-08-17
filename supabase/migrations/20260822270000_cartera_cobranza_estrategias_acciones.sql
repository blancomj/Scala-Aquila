-- ═══════════════════════════════════════════════════════════════════════
--  CAR F4 · Estrategias y acciones de cobranza
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §9-§10
--
--  Reconciliación contra el sketch original de §9.3/§10.2 (escrito antes
--  de que existiera esta tabla): el destinatario ya NO se modela con un
--  enum `destinatario_t('propietario'|'arrendatario'|'ambos')` — ese
--  sketch asumía la tabla `propietarios`, que fue renombrada dos veces
--  (propietarios→personas→terceros, 20260820100000/20260821100000) y
--  generalizada a un catálogo de rol flexible (PERSONA_PREDIO vía
--  lista_tipos, tabla inmueble_persona_rol). Un enum fijo ya no
--  representaría ese modelo — se usa `destinatario_tercero_id` +
--  `destinatario_rol_codigo` (snapshot de texto, no FK al catálogo:
--  REC-CAR-012, el rol pudo cambiar desde entonces).
--
--  `plantilla_id` del sketch original también se descarta: no hay todavía
--  una tabla de plantillas única (el trabajo de plantillas SMS es de otra
--  sesión, en curso). Se usa `plantilla_codigo text` sin FK — referencia
--  blanda por código, resuelta en aplicación, mismo criterio que
--  `event_type` en packages/shared/src/sms/registry.ts.
-- ═══════════════════════════════════════════════════════════════════════

create type public.canal_cobranza_t as enum (
  'email', 'sms', 'whatsapp', 'telefono', 'fisico', 'interno'
);

-- CAR §9.2. publicacion_morosos y restriccion_servicios tienen límites
-- legales estrictos [VERIFICAR VER-CAR-04] — el catálogo los incluye por
-- completitud, pero ninguna estrategia activa debe usarlos sin concepto
-- jurídico (se aplica al crear la fila en estrategias_cobranza, no aquí).
create type public.tipo_accion_cobranza_t as enum (
  'email', 'sms', 'whatsapp', 'llamada', 'carta', 'requerimiento_formal',
  'aviso_prejuridico', 'publicacion_morosos', 'restriccion_servicios',
  'visita', 'asignacion_abogado', 'remision_juridica', 'propuesta_acuerdo',
  'revision_manual'
);

create type public.estado_accion_cobranza_t as enum (
  'programada', 'pendiente_aprobacion', 'aprobada', 'rechazada',
  'ejecutando', 'ejecutada', 'fallida', 'cancelada'
);

create type public.resultado_accion_cobranza_t as enum (
  'sin_respuesta', 'contacto_efectivo', 'contacto_no_efectivo',
  'promesa_de_pago', 'acuerdo_solicitado', 'pago_recibido',
  'rechazo_deudor', 'datos_incorrectos', 'no_aplica'
);

create type public.alcance_accion_cobranza_t as enum ('inmueble', 'cargo');
create type public.origen_accion_cobranza_t as enum ('job', 'manual');

-- ── estrategias_cobranza ─────────────────────────────────────────────────
create table public.estrategias_cobranza (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants (id) on delete cascade,
  politica_id               uuid not null references public.politicas_clasificacion_cartera (id) on delete cascade,
  tramo_id                  uuid not null references public.politica_clasificacion_tramos (id) on delete cascade,
  codigo                    text not null,
  nombre                    text not null,
  tipo_accion               public.tipo_accion_cobranza_t not null,
  canal                     public.canal_cobranza_t not null,
  dias_desde_clasificacion  int not null default 0,
  frecuencia_dias           int,
  max_intentos              int not null default 1,
  plantilla_codigo          text,
  -- Rol mínimo que puede ejecutar/ver esta estrategia en su bandeja de
  -- trabajo — informativo para la UI, no la única barrera de seguridad
  -- (eso lo hace RLS en acciones_cobranza). 'administrador' desde
  -- GAP-CAR-009 (20260822250000/260000).
  rol_minimo                public.tenant_role_t not null default 'agent',
  requiere_aprobacion       boolean not null default false,
  monto_minimo_deuda        numeric(18, 2),
  activa                    boolean not null default true,
  orden                     int not null,
  created_at                timestamptz not null default now(),

  constraint estrategia_cobranza_codigo_unico unique (tenant_id, politica_id, codigo),
  constraint estrategia_cobranza_dias_desde_no_negativo check (dias_desde_clasificacion >= 0),
  constraint estrategia_cobranza_frecuencia_positiva check (frecuencia_dias is null or frecuencia_dias > 0),
  constraint estrategia_cobranza_max_intentos_positivo check (max_intentos > 0),
  constraint estrategia_cobranza_monto_minimo_no_negativo check (monto_minimo_deuda is null or monto_minimo_deuda >= 0)
);

alter table public.estrategias_cobranza enable row level security;
alter table public.estrategias_cobranza force row level security;

create index estrategias_cobranza_tenant_idx on public.estrategias_cobranza (tenant_id);
create index estrategias_cobranza_tramo_idx on public.estrategias_cobranza (tramo_id);

comment on table public.estrategias_cobranza is
  'Configuración por tramo de qué acción de cobranza corresponde, cuándo y con qué '
  'límites (CAR §9.3). Espejo físico de EstrategiaCobranza '
  '(packages/liquidation-engine/src/cartera-cobranza.ts). monto_minimo_deuda: no gastar '
  'una acción de cobro en una deuda trivial (CAR §9.3 [NEGOCIO]).';

-- ── guard: tramo_id debe pertenecer a politica_id ───────────────────────
create function public.guard_estrategia_cobranza_tramo_coherente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.politica_clasificacion_tramos t
    where t.id = new.tramo_id and t.politica_id = new.politica_id
  ) then
    raise exception 'ESTRATEGIA_COBRANZA_TRAMO_AJENO: el tramo % no pertenece a la política %',
      new.tramo_id, new.politica_id;
  end if;
  return new;
end;
$$;

create trigger guard_estrategia_cobranza_tramo_coherente
  before insert or update on public.estrategias_cobranza
  for each row execute function public.guard_estrategia_cobranza_tramo_coherente();

create policy estrategias_cobranza_select_miembro
  on public.estrategias_cobranza for select
  to authenticated
  using (public.is_member(tenant_id));

create policy estrategias_cobranza_insert_agent
  on public.estrategias_cobranza for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy estrategias_cobranza_update_agent
  on public.estrategias_cobranza for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy estrategias_cobranza_delete_agent
  on public.estrategias_cobranza for delete
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ── acciones_cobranza ────────────────────────────────────────────────────
-- CAR §10.1: nunca depender solo de "última acción" — cada acción es un
-- registro con ciclo de vida propio (estado_accion_cobranza_t evoluciona,
-- la fila SÍ se actualiza), pero el contexto que la originó (CAR §10.3
-- REC-CAR-012) se escribe una vez y el guard de abajo lo congela.
create table public.acciones_cobranza (
  id                         uuid primary key default gen_random_uuid(),
  tenant_id                  uuid not null references public.tenants (id) on delete cascade,
  inmueble_id                uuid not null references public.inmuebles (id),
  estrategia_id              uuid references public.estrategias_cobranza (id),
  tipo_accion                public.tipo_accion_cobranza_t not null,
  canal                      public.canal_cobranza_t not null,

  -- FOTO DEL MOMENTO — congelada por guard_accion_cobranza_contexto_inmutable
  fecha_programada           date not null,
  fecha_ejecucion            timestamptz,
  clasificacion_codigo       text not null,
  politica_clasificacion_id  uuid not null references public.politicas_clasificacion_cartera (id),
  politica_version           int not null,
  dias_mora_al_momento       int not null,
  deuda_total_al_momento     numeric(18, 2) not null,

  -- ALCANCE
  alcance                    public.alcance_accion_cobranza_t not null default 'inmueble',
  cargo_id                   uuid references public.cargos (id),

  -- DESTINATARIO — terceros (PROMPT_FICHA_INMUEBLE.md / PROMPT_MANTENIMIENTO_
  -- TERCEROS.md), no el propietario del sketch original de este documento.
  destinatario_tercero_id    uuid not null references public.terceros (id),
  destinatario_rol_codigo    text not null,
  destinatario_contacto      text,

  -- EJECUCIÓN
  estado                     public.estado_accion_cobranza_t not null default 'programada',
  plantilla_codigo           text,
  contenido_hash             text,
  referencia_externa         text,
  intento_numero             int not null default 1,

  -- RESULTADO
  resultado                  public.resultado_accion_cobranza_t,
  resultado_fecha            timestamptz,
  notas                      text,

  -- AUTORÍA
  aprobada_por               uuid references public.profiles (id),
  aprobada_at                timestamptz,
  ejecutada_por               uuid references public.profiles (id),
  creada_por                 public.origen_accion_cobranza_t not null,
  created_at                 timestamptz not null default now(),

  constraint accion_cobranza_intento_positivo check (intento_numero > 0),
  constraint accion_cobranza_dias_mora_no_negativo check (dias_mora_al_momento >= 0),
  constraint accion_cobranza_cargo_requiere_alcance_cargo check (alcance = 'cargo' or cargo_id is null)
);

alter table public.acciones_cobranza enable row level security;
alter table public.acciones_cobranza force row level security;

create index acciones_cobranza_inmueble_idx
  on public.acciones_cobranza (tenant_id, inmueble_id, fecha_programada desc);
create index acciones_cobranza_pendientes_idx
  on public.acciones_cobranza (tenant_id, estado)
  where estado in ('programada', 'pendiente_aprobacion');
create index acciones_cobranza_estrategia_idx on public.acciones_cobranza (estrategia_id);

comment on table public.acciones_cobranza is
  'Registro de cada acción de cobranza, con ciclo de vida propio (CAR §10.1). Las columnas '
  'de "foto del momento" (clasificacion_codigo, politica_clasificacion_id, politica_version, '
  'dias_mora_al_momento, deuda_total_al_momento) son inmutables tras creación '
  '(REC-CAR-012, guard_accion_cobranza_contexto_inmutable) — es la respuesta a "¿por qué se '
  'envió esto?" meses después, cuando la política ya cambió de versión.';

-- ── guard: el contexto congelado (REC-CAR-012) nunca se actualiza ───────
create function public.guard_accion_cobranza_contexto_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.clasificacion_codigo is distinct from old.clasificacion_codigo
     or new.politica_clasificacion_id is distinct from old.politica_clasificacion_id
     or new.politica_version is distinct from old.politica_version
     or new.dias_mora_al_momento is distinct from old.dias_mora_al_momento
     or new.deuda_total_al_momento is distinct from old.deuda_total_al_momento
     or new.tenant_id is distinct from old.tenant_id
     or new.inmueble_id is distinct from old.inmueble_id
     or new.tipo_accion is distinct from old.tipo_accion
     or new.fecha_programada is distinct from old.fecha_programada
     or new.alcance is distinct from old.alcance
     or new.cargo_id is distinct from old.cargo_id
     or new.destinatario_tercero_id is distinct from old.destinatario_tercero_id
     or new.destinatario_rol_codigo is distinct from old.destinatario_rol_codigo
     or new.creada_por is distinct from old.creada_por
  then
    raise exception 'ACCION_COBRANZA_CONTEXTO_INMUTABLE: la acción % no admite modificar su '
      'contexto congelado — solo estado/resultado/ejecución (CAR §10.3 REC-CAR-012)', old.id;
  end if;
  return new;
end;
$$;

create trigger guard_accion_cobranza_contexto_inmutable
  before update on public.acciones_cobranza
  for each row execute function public.guard_accion_cobranza_contexto_inmutable();

-- Sin política de DELETE: una acción de cobranza es evidencia, nunca se
-- borra (mismo criterio que audit_log, pero mutable en vez de append-only
-- puro porque su estado sí evoluciona — CAR §10.1).
create policy acciones_cobranza_select_miembro
  on public.acciones_cobranza for select
  to authenticated
  using (public.is_member(tenant_id));

create policy acciones_cobranza_insert_agent
  on public.acciones_cobranza for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy acciones_cobranza_update_agent
  on public.acciones_cobranza for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));
