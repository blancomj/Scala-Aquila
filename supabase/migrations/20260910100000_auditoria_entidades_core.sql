-- ═══════════════════════════════════════════════════════════════════════
--  auditoria_riesgos, auditoria_controles, auditoria_procedimientos
--  Modelo de auditoría interno basado en Gobierno → Riesgo → Control → Resultado
--  (Prompt Maestro Modulo Auditoria AQUILA, §§5-13, 53-59, 91)
--
--  Modelo de roles (decisión del usuario, 2026-08-31 — amplía D-19 solo para
--  este módulo): tenant_role_t sigue siendo ('auxiliar','auditor',
--  'administrador'), sin nuevos valores. auditor pasa de "solo lectura
--  global" (D-19) a lectura + escritura DENTRO de auditoria_* — es quien
--  crea/ejecuta el trabajo de auditoría. administrador aprueba/cierra.
--  auxiliar NO tiene acceso general a estas tablas de configuración; su
--  único punto de entrada al módulo es como "responsable de proceso"
--  asignado en auditoria_hallazgos/auditoria_acciones (ver migración
--  20260911100000). has_role() NO hace administrador ⊇ auditor (son ejes
--  distintos) — hay que listar ambos roles explícitamente donde ambos deban
--  poder actuar.
-- ═══════════════════════════════════════════════════════════════════════

comment on type public.tenant_role_t is
  'Roles dentro de una copropiedad. administrador = rol máximo del tenant (quien lo crea lo recibe '
  'automáticamente; también gana los chequeos exclusivos de aprobación de cartera/jurídico, GAP-CAR-009). '
  'auxiliar = opera el tenant (captura, factura, cobra) pero no administra — nivel por debajo de '
  'administrador. auditor = solo lectura en la operación general del tenant; dentro del módulo de '
  'auditoría interna (tablas auditoria_*) tiene además escritura de su propio trabajo — crea riesgos, '
  'controles, procedimientos, engagements y hallazgos, pero no puede cerrar/aprobar lo que él mismo creó '
  '(segregación de funciones, PROMPT AUDITORÍA §7, §40, §55). El admin de plataforma vive aparte, en '
  'profiles.is_platform_admin (AD-09).';

-- ── Catálogo de riesgos ─────────────────────────────────────────────────────
create table public.auditoria_riesgos (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  nombre       text not null,
  descripcion  text,
  categoria    text not null,  -- FINANCIERO, CONTABLE, OPERATIVO, etc. (PROMPT AUDITORÍA §11)
  probabilidad integer not null check (probabilidad between 1 and 5),
  impacto      integer not null check (impacto between 1 and 5),
  riesgo_inherente integer generated always as (probabilidad * impacto) stored,
  created_by   uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

alter table public.auditoria_riesgos enable row level security;
alter table public.auditoria_riesgos force row level security;

create index auditoria_riesgos_tenant_idx on public.auditoria_riesgos (tenant_id);
create index auditoria_riesgos_categoria_idx on public.auditoria_riesgos (tenant_id, categoria);

comment on table public.auditoria_riesgos is
  'Matriz de riesgos del módulo de auditoría interna — PROMPT AUDITORÍA §10, §12, §56.';
comment on column public.auditoria_riesgos.probabilidad is '1=Muy bajo, 2=Bajo, 3=Medio, 4=Alto, 5=Crítico (PROMPT AUDITORÍA §10).';
comment on column public.auditoria_riesgos.impacto is '1=Muy bajo, 2=Bajo, 3=Medio, 4=Alto, 5=Crítico (PROMPT AUDITORÍA §10).';

-- ── Catálogo de controles ───────────────────────────────────────────────────
create table public.auditoria_controles (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  riesgo_id       uuid not null references public.auditoria_riesgos (id) on delete cascade,
  nombre          text not null,
  objetivo        text,
  proceso         text,         -- proceso cubierto por el control
  tipo            text not null check (tipo in ('PREVENTIVO', 'DETECTIVO', 'CORRECTIVO')),
  frecuencia      text,         -- periodicidad (diaria, mensual, anual, ad hoc)
  automatizado    boolean not null default false,
  manual          boolean not null default false,
  evidencia       text[],       -- tipos de evidencia necesarios
  responsable     text,
  created_by      uuid not null references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  check (automatizado or manual)
);

alter table public.auditoria_controles enable row level security;
alter table public.auditoria_controles force row level security;

create index auditoria_controles_tenant_idx on public.auditoria_controles (tenant_id);
create index auditoria_controles_riesgo_idx on public.auditoria_controles (tenant_id, riesgo_id);

comment on table public.auditoria_controles is
  'Catálogo de controles de auditoría interno — PROMPT AUDITORÍA §13-15.';
comment on column public.auditoria_controles.tipo is 'PREVENTIVO, DETECTIVO o CORRECTIVO (PROMPT AUDITORÍA §13).';

-- ── Procedimientos (metodología de auditoría) ───────────────────────────────
create table public.auditoria_procedimientos (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  control_id   uuid not null references public.auditoria_controles (id) on delete cascade,
  nombre       text not null,
  objetivo     text,
  criterio_muestreo text,   -- ALEATORIO, POR_RIESGO, POR_IMPORTE, DIRIGIDO (PROMPT AUDITORÍA §33)
  prueba_type  text not null check (prueba_type in ('INSPECCION', 'OBSERVACION', 'CONFIRMACION', 'RECALCULO', 'RECONCILIACION', 'ANALITICA', 'REVISION_DOCUMENTAL', 'PRUEBA_DE_CONTROL', 'PRUEBA_SUSTANTIVA')),
  created_by   uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

alter table public.auditoria_procedimientos enable row level security;
alter table public.auditoria_procedimientos force row level security;

create index auditoria_procedimientos_tenant_idx on public.auditoria_procedimientos (tenant_id);
create index auditoria_procedimientos_control_idx on public.auditoria_procedimientos (tenant_id, control_id);

comment on table public.auditoria_procedimientos is
  'Procedimientos/programas de prueba de auditoría — resultado vive en auditoria_ejecuciones, no aquí '
  '(PROMPT AUDITORÍA §32, §33, §35).';

-- ── RLS: auditor + administrador leen y escriben; auxiliar no tiene acceso ──
create policy auditoria_riesgos_select
  on public.auditoria_riesgos for select
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_riesgos_insert
  on public.auditoria_riesgos for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    and created_by = (select auth.uid())
  );

create policy auditoria_riesgos_update
  on public.auditoria_riesgos for update
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_riesgos_delete
  on public.auditoria_riesgos for delete
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

create policy auditoria_controles_select
  on public.auditoria_controles for select
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_controles_insert
  on public.auditoria_controles for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    and created_by = (select auth.uid())
  );

create policy auditoria_controles_update
  on public.auditoria_controles for update
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_controles_delete
  on public.auditoria_controles for delete
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

create policy auditoria_procedimientos_select
  on public.auditoria_procedimientos for select
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_procedimientos_insert
  on public.auditoria_procedimientos for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    and created_by = (select auth.uid())
  );

create policy auditoria_procedimientos_update
  on public.auditoria_procedimientos for update
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_procedimientos_delete
  on public.auditoria_procedimientos for delete
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

-- ── Triggers updated_at ───────────────────────────────────────────────────────
create trigger set_auditoria_riesgos_updated_at
  before update on public.auditoria_riesgos
  for each row execute function public.set_updated_at();

create trigger set_auditoria_controles_updated_at
  before update on public.auditoria_controles
  for each row execute function public.set_updated_at();

create trigger set_auditoria_procedimientos_updated_at
  before update on public.auditoria_procedimientos
  for each row execute function public.set_updated_at();
