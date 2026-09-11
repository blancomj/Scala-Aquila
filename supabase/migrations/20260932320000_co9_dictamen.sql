-- ═══════════════════════════════════════════════════════════════════════
--  CO-9 · Dictamen del revisor fiscal (CO_09_gobierno_y_asamblea.md §4.2)
--
--  Condicional: solo aplica cuando tenants.uso_economico ∈ {comercial,
--  mixto} (Ley 675 art. 56) o tenants.tiene_revisor_fiscal = true
--  (residencial, decisión propia del tenant, 20260932300000). La condición
--  se evalúa en fn_contable_presentar_rendicion (RENDICION_SIN_DICTAMEN_
--  OBLIGATORIO), no aquí — esta tabla solo registra el dictamen cuando
--  existe, sea o no obligatorio.
-- ═══════════════════════════════════════════════════════════════════════

create table public.contable_dictamen (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants (id) on delete cascade,
  certificacion_id          uuid not null references public.contable_certificacion (id),
  revisor_fiscal_tercero_id uuid not null references public.terceros (id),
  tipo_opinion_id           bigint not null references public.lista_tipos (id),
  texto                     text not null,
  fecha                     date not null,
  documento_id              uuid references public.documentos (id),
  registrado_por            uuid references public.profiles (id),
  created_at                timestamptz not null default now()
);

alter table public.contable_dictamen enable row level security;
alter table public.contable_dictamen force row level security;

create index contable_dictamen_tenant_idx on public.contable_dictamen (tenant_id);
create index contable_dictamen_certificacion_idx on public.contable_dictamen (certificacion_id);

comment on table public.contable_dictamen is
  'CO-9 §4.2 (Ley 675 art. 56): dictamen del revisor fiscal sobre una certificación. '
  'tipo_opinion_id es vocabulario puro (lista_tipos TIPO_OPINION_DICTAMEN, D-24) — no gatilla '
  'ninguna transición aquí, solo se presenta. Escritura vía fn_contable_registrar_dictamen — sin '
  'policy insert/update.';

create policy contable_dictamen_select_miembro
  on public.contable_dictamen for select
  to authenticated
  using (public.is_member(tenant_id));
