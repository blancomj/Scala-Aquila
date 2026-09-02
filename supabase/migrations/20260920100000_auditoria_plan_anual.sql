-- PROMPT AUDITORÍA §30 — Plan anual de auditoría.
-- `auditoria_planes` (encabezado por año) + `auditoria_plan_items` (una fila
-- por riesgo/proceso planificado, con prioridad/frecuencia/responsable que
-- decide el auditor). `fn_sugerir_plan_anual` propone candidatos con señales
-- reales del esquema (riesgo_inherente, historial de hallazgos, si el riesgo
-- ya tiene control automatizado) — no inventa "cambios recientes" (no hay
-- vínculo riesgo↔audit_log en el esquema) ni asigna prioridad rígida por
-- umbral (PLAN §10: "no codificar umbrales rígidos"); la prioridad la decide
-- el humano al agregar el ítem al plan.

create table public.auditoria_planes (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  anio         integer not null check (anio between 2000 and 2100),
  estado       text not null default 'BORRADOR' check (estado in ('BORRADOR', 'APROBADO')),
  aprobado_por uuid references public.profiles (id) on delete set null,
  aprobado_at  timestamptz,
  created_by   uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  unique (tenant_id, anio)
);

alter table public.auditoria_planes enable row level security;
alter table public.auditoria_planes force row level security;

create policy auditoria_planes_select
  on public.auditoria_planes for select
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_planes_insert
  on public.auditoria_planes for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    and created_by = (select auth.uid())
  );

create policy auditoria_planes_update
  on public.auditoria_planes for update
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_planes_delete
  on public.auditoria_planes for delete
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

create table public.auditoria_plan_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  plan_id       uuid not null references public.auditoria_planes (id) on delete cascade,
  riesgo_id     uuid references public.auditoria_riesgos (id) on delete set null,
  proceso       text,
  prioridad     text not null check (prioridad in ('ALTA', 'MEDIA', 'BAJA')),
  frecuencia    text,
  responsable   uuid references public.profiles (id) on delete set null,
  periodo       text,
  -- Se llena cuando el ítem planificado se convierte en una auditoría real
  -- (PROMPT AUDITORÍA §30 no lo pide explícito, pero sin esto no hay forma
  -- de saber si un ítem del plan ya se ejecutó).
  engagement_id uuid references public.auditoria_engagements (id) on delete set null,
  created_by    uuid not null references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

alter table public.auditoria_plan_items enable row level security;
alter table public.auditoria_plan_items force row level security;

create index auditoria_plan_items_plan_idx on public.auditoria_plan_items (tenant_id, plan_id);

create policy auditoria_plan_items_select
  on public.auditoria_plan_items for select
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_plan_items_insert
  on public.auditoria_plan_items for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    and created_by = (select auth.uid())
  );

create policy auditoria_plan_items_update
  on public.auditoria_plan_items for update
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_plan_items_delete
  on public.auditoria_plan_items for delete
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

-- Señales por riesgo para sugerir el plan (PROMPT AUDITORÍA §30):
--   riesgo_inherente     → probabilidad * impacto (columna generada existente;
--                          proxy honesto de "riesgo residual" — el §63 de
--                          riesgo residual dinámico no está construido)
--   hallazgos_abiertos   → historial de hallazgos, cuenta de los no cerrados
--   hallazgos_criticos   → criticidad, cuenta de CRITICO/ALTO históricos
--   tiene_control_automatico → si ya hay CCM cubriendo el riesgo
--   procesos / frecuencias   → agregados desde los controles ya definidos
--                              para el riesgo (columnas existentes, no inventadas)
-- No se calcula "cambios recientes": no existe vínculo riesgo↔audit_log en
-- el esquema y no se va a inventar uno para esta función.
create or replace function public.fn_sugerir_plan_anual(p_tenant_id uuid)
returns table (
  riesgo_id                uuid,
  riesgo_nombre             text,
  categoria                 text,
  riesgo_inherente          integer,
  hallazgos_abiertos        integer,
  hallazgos_criticos        integer,
  tiene_control_automatico  boolean,
  procesos                  text,
  frecuencias               text,
  score                     numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.id,
    r.nombre,
    r.categoria,
    r.riesgo_inherente,
    coalesce(ha.abiertos, 0)::integer,
    coalesce(hc.criticos, 0)::integer,
    coalesce(c.automatico, false),
    c.procesos,
    c.frecuencias,
    (
      r.riesgo_inherente::numeric
      + coalesce(ha.abiertos, 0) * 3
      + coalesce(hc.criticos, 0) * 5
      - case when coalesce(c.automatico, false) then 4 else 0 end
    ) as score
  from public.auditoria_riesgos r
  -- Un hallazgo se asocia a un riesgo directo (h.riesgo_id, típico de un
  -- hallazgo cargado a mano) o indirecto (vía el control automático que lo
  -- generó, que sí sabe su riesgo_id — auditoria_control_ejecutar no llena
  -- h.riesgo_id, solo h.control_id). Se cuentan ambos caminos.
  left join lateral (
    select count(*) as abiertos
    from public.auditoria_hallazgos h
    left join public.auditoria_controles ac on ac.id = h.control_id
    where (h.riesgo_id = r.id or ac.riesgo_id = r.id)
      and h.estado not in ('CERRADO', 'RECHAZADO')
  ) ha on true
  left join lateral (
    select count(*) as criticos
    from public.auditoria_hallazgos h
    left join public.auditoria_controles ac on ac.id = h.control_id
    where (h.riesgo_id = r.id or ac.riesgo_id = r.id)
      and h.nivel in ('CRITICO', 'ALTO')
  ) hc on true
  left join lateral (
    select
      bool_or(ac.automatizado) as automatico,
      string_agg(distinct ac.proceso, ', ' order by ac.proceso) as procesos,
      string_agg(distinct ac.frecuencia, ', ' order by ac.frecuencia) as frecuencias
    from public.auditoria_controles ac
    where ac.riesgo_id = r.id
  ) c on true
  where r.tenant_id = p_tenant_id
  order by score desc nulls last;
$$;

revoke execute on function public.fn_sugerir_plan_anual(uuid) from public, anon;
grant execute on function public.fn_sugerir_plan_anual(uuid) to authenticated;
