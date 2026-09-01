-- ═══════════════════════════════════════════════════════════════════════
--  auditoria_ejecuciones, auditoria_muestras, auditoria_evidencias
--  Módulo de auditoría interna — ejecución de pruebas y evidencia
--  (Prompt Maestro Modulo Auditoria AQUILA, §17, §29-34, §70)
--
--  Roles: auditor + administrador leen/escriben. Sin acceso de auxiliar —
--  la ejecución de pruebas y la evidencia son trabajo del auditor.
--  auditoria_evidencias es INSERT-only (sin UPDATE/DELETE): la integridad
--  de la evidencia depende de que no pueda sustituirse silenciosamente
--  (§34, §70) — para "corregir" una evidencia se sube una nueva fila.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Ejecuciones / Pruebas de auditoría ─────────────────────────────────────
create table public.auditoria_ejecuciones (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  procedimiento_id uuid references public.auditoria_procedimientos (id) on delete set null,
  engagement_id   uuid not null references public.auditoria_engagements (id) on delete cascade,
  resultado       text check (resultado in ('PASS', 'FAIL', 'REVIEW')),
  observaciones   text,
  ejecutado_por   uuid not null references public.profiles (id) on delete restrict,
  ejecutado_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

alter table public.auditoria_ejecuciones enable row level security;
alter table public.auditoria_ejecuciones force row level security;

create index auditoria_ejecuciones_tenant_idx on public.auditoria_ejecuciones (tenant_id);
create index auditoria_ejecuciones_procedimiento_idx on public.auditoria_ejecuciones (tenant_id, procedimiento_id);
create index auditoria_ejecuciones_engagement_idx on public.auditoria_ejecuciones (tenant_id, engagement_id);

comment on table public.auditoria_ejecuciones is
  'Ejecuciones de pruebas de auditoría — resultado PASS/FAIL/REVIEW (PROMPT AUDITORÍA §32, §45).';

-- ── Muestras (sampling) ───────────────────────────────────────────────────
create table public.auditoria_muestras (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  ejecucion_id    uuid not null references public.auditoria_ejecuciones (id) on delete cascade,
  poblacion       integer not null check (poblacion >= 0),
  cantidad        integer not null check (cantidad >= 0 and cantidad <= poblacion),
  criterio        text not null check (criterio in ('ALEATORIO', 'POR_RIESGO', 'POR_IMPORTE', 'POR_EXCEPCION', 'DIRIGIDO')),
  seleccion       uuid[],
  semilla         bigint,
  created_by      uuid not null references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now(),
  check (criterio <> 'ALEATORIO' or semilla is not null)
);

alter table public.auditoria_muestras enable row level security;
alter table public.auditoria_muestras force row level security;

create index auditoria_muestras_tenant_idx on public.auditoria_muestras (tenant_id);
create index auditoria_muestras_ejecucion_idx on public.auditoria_muestras (tenant_id, ejecucion_id);

comment on table public.auditoria_muestras is
  'Muestreo para auditoría — PROMPT AUDITORÍA §33. semilla es obligatoria cuando criterio=ALEATORIO para que la selección sea reproducible.';

-- ── Evidencias vinculadas a hallazgos ─────────────────────────────────────
create table public.auditoria_evidencias (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  hallazgo_id     uuid not null references public.auditoria_hallazgos (id) on delete cascade,
  tipo            text not null
                  check (tipo in ('DOCUMENTO', 'CAPTURA', 'REPORTE', 'CONSULTA', 'LOG', 'COMPROBANTE', 'CONCILIACION', 'ENTREVISTA', 'OBSERVACION', 'OTRO')),
  fecha           timestamptz not null default now(),
  usuario_id      uuid not null references public.profiles (id) on delete restrict,
  origen          text,
  archivo_path    text,
  hash            text,
  descripcion     text,
  created_at      timestamptz not null default now(),
  unique (tenant_id, hallazgo_id, hash)
);

alter table public.auditoria_evidencias enable row level security;
alter table public.auditoria_evidencias force row level security;

create index auditoria_evidencias_tenant_idx on public.auditoria_evidencias (tenant_id);
create index auditoria_evidencias_hallazgo_idx on public.auditoria_evidencias (tenant_id, hallazgo_id);
create index auditoria_evidencias_hash_idx on public.auditoria_evidencias (hash) where hash is not null;

comment on table public.auditoria_evidencias is
  'Evidencias vinculadas a hallazgos — hash permite verificar integridad; sin UPDATE/DELETE para impedir sustitución silenciosa (PROMPT AUDITORÍA §34, §70).';
comment on column public.auditoria_evidencias.hash is 'SHA-256 del contenido — previene sustitución (PROMPT AUDITORÍA §70).';

-- ── RLS: auditor + administrador, sin acceso de auxiliar ──────────────────
create policy auditoria_ejecuciones_select
  on public.auditoria_ejecuciones for select
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_ejecuciones_insert
  on public.auditoria_ejecuciones for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    and ejecutado_por = (select auth.uid())
  );

create policy auditoria_ejecuciones_update
  on public.auditoria_ejecuciones for update
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_muestras_select
  on public.auditoria_muestras for select
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_muestras_insert
  on public.auditoria_muestras for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    and created_by = (select auth.uid())
  );

-- Sin UPDATE/DELETE para muestras: una vez seleccionada la muestra con su
-- semilla, es un registro histórico del procedimiento ejecutado.

create policy auditoria_evidencias_select
  on public.auditoria_evidencias for select
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_evidencias_insert
  on public.auditoria_evidencias for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    and usuario_id = (select auth.uid())
  );

-- Sin UPDATE/DELETE: inmutabilidad de evidencia (§34, §70).

-- ── Trigger updated_at (solo ejecuciones tiene updated_at) ─────────────────
create trigger set_auditoria_ejecuciones_updated_at
  before update on public.auditoria_ejecuciones
  for each row execute function public.set_updated_at();
