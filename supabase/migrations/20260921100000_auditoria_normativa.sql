-- PROMPT AUDITORÍA §65 — Normativa: cada auditoría de cumplimiento registra
-- norma + artículo + vigencia + criterio + evidencia + resultado.
--
-- "Conectar con la matriz normativa de Fase 18 de contabilidad" (§65): esa
-- matriz es `public.fundamento_normativo` (20260814200000, E-16 §7) — norma
-- y artículo ya viven ahí. Igual que `presupuesto_rubros.fundamento_normativo_id`
-- ("enlace opcional", mismo archivo), esta tabla referencia por FK — no
-- duplica norma/artículo, solo agrega lo propio de la prueba de
-- cumplimiento (vigencia, criterio, evidencia, resultado).
--
-- `vigencia` es propia de esta tabla, NO `fundamento_normativo.fecha_vigencia`:
-- esa columna del catálogo hoy está vacía para todo lo sembrado de
-- plataforma (LEY/DECRETO como "Ley 675 de 2001" se identifican por su
-- propio nombre+año, no llevan fecha_vigencia) — depender de ella habría
-- bloqueado cualquier prueba de cumplimiento real contra el catálogo
-- existente. `vigencia` documenta la versión/fecha CONTRA LA QUE
-- efectivamente se probó el cumplimiento en esta auditoría puntual, que
-- puede no coincidir con la fecha_vigencia (si la hay) del catálogo.
-- "No utilizar 'norma vigente' sin versión" (§65) queda forzado por el tipo:
-- `date not null` no admite la palabra "vigente" como valor.

create table public.auditoria_normativa (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants (id) on delete cascade,
  engagement_id           uuid not null references public.auditoria_engagements (id) on delete cascade,
  fundamento_normativo_id bigint not null references public.fundamento_normativo (id) on delete restrict,
  vigencia                date not null,
  criterio                text not null,
  evidencia               text[],
  resultado               text not null default 'PENDIENTE'
                          check (resultado in ('CUMPLE', 'NO_CUMPLE', 'PARCIAL', 'PENDIENTE')),
  observaciones           text,
  created_by              uuid not null references public.profiles (id) on delete restrict,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz
);

alter table public.auditoria_normativa enable row level security;
alter table public.auditoria_normativa force row level security;

create index auditoria_normativa_engagement_idx on public.auditoria_normativa (tenant_id, engagement_id);
create index auditoria_normativa_fundamento_idx on public.auditoria_normativa (fundamento_normativo_id);

create trigger set_updated_at before update on public.auditoria_normativa
  for each row execute function public.set_updated_at();

create policy auditoria_normativa_select
  on public.auditoria_normativa for select
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_normativa_insert
  on public.auditoria_normativa for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    and created_by = (select auth.uid())
  );

create policy auditoria_normativa_update
  on public.auditoria_normativa for update
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_normativa_delete
  on public.auditoria_normativa for delete
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));
