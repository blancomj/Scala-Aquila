-- ═══════════════════════════════════════════════════════════════════════
--  auditoria_engagements, auditoria_hallazgos, auditoria_acciones
--  Módulo de auditoría interna — núcleo de trabajo
--  (Prompt Maestro Modulo Auditoria AQUILA, §§16, 24-40, 45, 57)
--
--  Roles (ver 20260910100000 para el detalle del modelo): auditor +
--  administrador leen/escriben todo. auxiliar solo ve/actualiza lo que
--  tiene asignado como `responsable` en hallazgos/acciones (rol de
--  "responsable de proceso" del prompt maestro §7), y no puede cerrarlo
--  por sí solo.
--
--  Segregación de funciones (§7, §40, §55): un hallazgo no puede ser
--  cerrado por quien lo creó (auditoria_hallazgo_cierre_guard), y no puede
--  cerrarse sin evidencia. Una acción no puede cerrarse sin
--  evidencia_cierre (auditoria_accion_cierre_guard).
-- ═══════════════════════════════════════════════════════════════════════

-- ── Engagement / Auditoría ───────────────────────────────────────────────────
create table public.auditoria_engagements (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  nombre          text not null,
  objetivo        text,
  alcance         text,
  periodo         text,              -- 2026, 2026-Q1, 2026-01
  estado          text not null default 'BORRADOR'
                  check (estado in ('BORRADOR', 'PLANIFICADA', 'EN_EJECUCION', 'EN_REVISION', 'FINALIZADA', 'CERRADA', 'CANCELADA')),
  tipo            text,              -- OPERATIVA, FINANCIERA, CONTABLE, etc. (auditoria_tipo_auditoria.codigo)
  prioridad       text check (prioridad in ('ALTA', 'MEDIA', 'BAJA')),
  responsable     uuid references public.profiles (id) on delete set null,
  fecha_inicio    timestamptz,
  fecha_fin       timestamptz,
  conclusion      text,
  -- Trazabilidad hacia el registro AQUILA que originó el engagement cuando
  -- viene de "Auditar ahora" (PROMPT AUDITORÍA §57) — sin FK porque el
  -- origen puede ser cualquier tabla del dominio (liquidaciones, cargos...).
  origen_tipo     text,
  origen_id       uuid,
  created_by      uuid not null references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

alter table public.auditoria_engagements enable row level security;
alter table public.auditoria_engagements force row level security;

create index auditoria_engagements_tenant_idx on public.auditoria_engagements (tenant_id);
create index auditoria_engagements_estado_idx on public.auditoria_engagements (tenant_id, estado);
create index auditoria_engagements_origen_idx on public.auditoria_engagements (origen_tipo, origen_id) where origen_id is not null;

comment on table public.auditoria_engagements is
  'Auditorías/Engagements del módulo de auditoría interna — PROMPT AUDITORÍA §31, §68.';

-- ── Hallazgos ────────────────────────────────────────────────────────────────
create table public.auditoria_hallazgos (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  engagement_id   uuid not null references public.auditoria_engagements (id) on delete cascade,
  proceso         text not null,         -- proceso donde se detectó el hallazgo
  riesgo_id       uuid references public.auditoria_riesgos (id) on delete set null,
  criterio        text,                  -- norma, política, procedimiento
  condicion       text,                  -- lo que se encontró
  causa           text,                  -- causa raíz (opcional)
  efecto          text,                  -- impacto
  nivel           text not null default 'MEDIO'
                  check (nivel in ('CRITICO', 'ALTO', 'MEDIO', 'BAJO', 'OBSERVACION')),
  recomendacion   text,
  responsable     uuid references public.profiles (id) on delete set null,
  fecha_compromiso timestamptz,
  estado          text not null default 'ABIERTO'
                  check (estado in ('ABIERTO', 'EN_REVISION', 'EN_CORRECCION', 'EN_VERIFICACION', 'CERRADO', 'RECHAZADO')),
  evidencia       text[],
  created_by      uuid not null references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

alter table public.auditoria_hallazgos enable row level security;
alter table public.auditoria_hallazgos force row level security;

create index auditoria_hallazgos_tenant_idx on public.auditoria_hallazgos (tenant_id);
create index auditoria_hallazgos_engagement_idx on public.auditoria_hallazgos (tenant_id, engagement_id);
create index auditoria_hallazgos_estado_idx on public.auditoria_hallazgos (tenant_id, estado);
create index auditoria_hallazgos_responsable_idx on public.auditoria_hallazgos (responsable) where responsable is not null;

comment on table public.auditoria_hallazgos is
  'Hallazgos de auditoría — estructura CRITERIO/CONDICION/CAUSA/EFECTO/RECOMENDACIÓN (PROMPT AUDITORÍA §36).';
comment on column public.auditoria_hallazgos.nivel is 'CRITICO, ALTO, MEDIO, BAJO, OBSERVACION (PROMPT AUDITORÍA §37).';
comment on column public.auditoria_hallazgos.responsable is '"Responsable de proceso" (rol funcional del prompt maestro §7) — un auxiliar asignado aquí puede ver y trabajar el hallazgo, pero no cerrarlo (segregación de funciones §55).';

-- ── Acciones / Seguimiento ───────────────────────────────────────────────────
create table public.auditoria_acciones (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  hallazgo_id     uuid not null references public.auditoria_hallazgos (id) on delete cascade,
  accion          text not null,
  responsable     uuid references public.profiles (id) on delete set null,
  fecha_inicio    timestamptz,
  fecha_compromiso timestamptz,
  prioridad       text check (prioridad in ('ALTA', 'MEDIA', 'BAJA')),
  estado          text not null default 'PENDIENTE'
                  check (estado in ('PENDIENTE', 'EN_PROGRESO', 'BLOQUEADA', 'IMPLEMENTADA', 'EN_VERIFICACION', 'CERRADA', 'RECHAZADA')),
  evidencia_cierre text[],
  created_by      uuid not null references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

alter table public.auditoria_acciones enable row level security;
alter table public.auditoria_acciones force row level security;

create index auditoria_acciones_tenant_idx on public.auditoria_acciones (tenant_id);
create index auditoria_acciones_hallazgo_idx on public.auditoria_acciones (tenant_id, hallazgo_id);
create index auditoria_acciones_estado_idx on public.auditoria_acciones (tenant_id, estado);
create index auditoria_acciones_responsable_idx on public.auditoria_acciones (responsable) where responsable is not null;

comment on table public.auditoria_acciones is
  'Plan de acción y seguimiento — estados: PENDIENTE → EN_PROGRESO → IMPLEMENTADA → EN_VERIFICACION → CERRADA (PROMPT AUDITORÍA §39, §40).';
comment on column public.auditoria_acciones.estado is 'No cerrar sin evidencia_cierre (PROMPT AUDITORÍA §40) — reforzado por auditoria_accion_cierre_guard.';

-- ── RLS: engagements ──────────────────────────────────────────────────────
create policy auditoria_engagements_select
  on public.auditoria_engagements for select
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_engagements_insert
  on public.auditoria_engagements for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    and created_by = (select auth.uid())
  );

create policy auditoria_engagements_update
  on public.auditoria_engagements for update
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_engagements_delete
  on public.auditoria_engagements for delete
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

-- ── RLS: hallazgos (auxiliar solo ve lo que tiene asignado) ────────────────
create policy auditoria_hallazgos_select
  on public.auditoria_hallazgos for select
  to authenticated
  using (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    or responsable = (select auth.uid())
  );

create policy auditoria_hallazgos_insert
  on public.auditoria_hallazgos for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    and created_by = (select auth.uid())
  );

-- Solo auditor/administrador editan el hallazgo (incluida la transición de
-- cierre, que además pasa por auditoria_hallazgo_cierre_guard). El
-- responsable asignado (auxiliar) no tiene UPDATE — su interacción con el
-- hallazgo es a través de sus acciones de remediación, no editando el
-- hallazgo mismo.
create policy auditoria_hallazgos_update
  on public.auditoria_hallazgos for update
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

-- Sin DELETE: un hallazgo no se borra (§54 "no permitir que un usuario
-- borre silenciosamente evidencia o hallazgos"). Se cierra o se rechaza.

-- ── RLS: acciones (auxiliar puede trabajar lo que tiene asignado) ─────────
create policy auditoria_acciones_select
  on public.auditoria_acciones for select
  to authenticated
  using (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    or responsable = (select auth.uid())
  );

create policy auditoria_acciones_insert
  on public.auditoria_acciones for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    and created_by = (select auth.uid())
  );

create policy auditoria_acciones_update
  on public.auditoria_acciones for update
  to authenticated
  using (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    or responsable = (select auth.uid())
  )
  with check (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    or (responsable = (select auth.uid()) and estado <> 'CERRADA')
  );

-- Sin DELETE: mismo motivo que hallazgos.

-- ── Segregación de funciones: guardas de cierre ────────────────────────────
create function public.auditoria_hallazgo_cierre_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = 'CERRADO' and old.estado is distinct from 'CERRADO' then
    if new.evidencia is null or coalesce(array_length(new.evidencia, 1), 0) = 0 then
      raise exception 'AUD-CIERRE: no se puede cerrar un hallazgo sin evidencia (PROMPT AUDITORÍA §40)';
    end if;
    if (select auth.uid()) = new.created_by then
      raise exception 'AUD-SOD: quien crea un hallazgo no puede cerrarlo — requiere revisión independiente (PROMPT AUDITORÍA §40, §55)';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.auditoria_hallazgo_cierre_guard is
  'Impide auto-cierre (creador = quien cierra) y cierre sin evidencia — PROMPT AUDITORÍA §40, §55.';

create trigger auditoria_hallazgos_cierre_guard
  before update on public.auditoria_hallazgos
  for each row execute function public.auditoria_hallazgo_cierre_guard();

create function public.auditoria_accion_cierre_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = 'CERRADA' and old.estado is distinct from 'CERRADA' then
    if new.evidencia_cierre is null or coalesce(array_length(new.evidencia_cierre, 1), 0) = 0 then
      raise exception 'AUD-CIERRE: no se puede cerrar una acción sin evidencia_cierre (PROMPT AUDITORÍA §40)';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.auditoria_accion_cierre_guard is
  'Impide cerrar una acción de seguimiento sin evidencia_cierre — PROMPT AUDITORÍA §40.';

create trigger auditoria_acciones_cierre_guard
  before update on public.auditoria_acciones
  for each row execute function public.auditoria_accion_cierre_guard();

-- ── Triggers updated_at ───────────────────────────────────────────────────────
create trigger set_auditoria_engagements_updated_at
  before update on public.auditoria_engagements
  for each row execute function public.set_updated_at();

create trigger set_auditoria_hallazgos_updated_at
  before update on public.auditoria_hallazgos
  for each row execute function public.set_updated_at();

create trigger set_auditoria_acciones_updated_at
  before update on public.auditoria_acciones
  for each row execute function public.set_updated_at();
