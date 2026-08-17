-- ═══════════════════════════════════════════════════════════════════════
--  tenant_tercero_rol — Personas vinculadas a la copropiedad misma
--  Propietario: PROMPT_FICHA_COPROPIEDAD.md §4.4, §7.3
--
--  PROMPT_MANTENIMIENTO_TERCEROS.md §1.2/§8.2 y PROMPT_FICHA_COPROPIEDAD.md
--  §6.3 daban esta tabla y sus funciones de store por existentes — verificado
--  falso (grep de terceros.ts y de supabase/migrations, ninguna coincidencia).
--  Se construye ahora, mismo patrón que inmueble_persona_rol
--  (20260820100000_personas_roles_flexibles.sql): rol tomado de un catálogo
--  lista_tipos, vigente_desde/vigente_hasta para terminar sin borrar,
--  recibe_notificaciones independiente del rol.
--
--  Diferencia con inmueble_persona_rol: no hay porcentaje ni es_pagador —
--  esos conceptos son de propiedad de un inmueble, no aplican a "quién
--  administra/audita/asesora la copropiedad". Tampoco hay "un solo X
--  vigente" que proteger (a diferencia de es_pagador/es_recaudo) — puede
--  haber varios administradores o contadores a la vez, así que no hace
--  falta una función swap tipo fn_marcar_pagador.
--
--  rol_id no lleva guard de familia de catálogo (mismo criterio que
--  inmueble_persona_rol.rol_id, que tampoco lo tiene hoy): el FK a
--  lista_tipos(id) es la única barrera aplicada en este proyecto para
--  este tipo de columna.
-- ═══════════════════════════════════════════════════════════════════════

create table public.tenant_tercero_rol (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  tercero_id             uuid not null references public.terceros (id) on delete cascade,
  rol_id                 bigint not null references public.lista_tipos (id),
  vigente_desde          date not null,
  vigente_hasta          date,
  recibe_notificaciones  boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz,

  constraint tenant_tercero_rol_fechas_validas
    check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

alter table public.tenant_tercero_rol enable row level security;
alter table public.tenant_tercero_rol force row level security;

create index tenant_tercero_rol_tenant_idx on public.tenant_tercero_rol (tenant_id);
create index tenant_tercero_rol_tercero_idx on public.tenant_tercero_rol (tercero_id);
create index tenant_tercero_rol_rol_idx on public.tenant_tercero_rol (rol_id);

comment on table public.tenant_tercero_rol is
  'Relación tercero↔copropiedad con rol tomado del catálogo PERSONA_COPROPIEDAD '
  '(administrador/contador/abogado/auditor_revisor_fiscal, ya sembrado en '
  '20260814180000). vigente_hasta IS NULL = relación activa; "terminar" una relación '
  'es poner vigente_hasta, nunca DELETE — mismo criterio que inmueble_persona_rol '
  '(PROMPT_FICHA_COPROPIEDAD.md §4.4).';

-- ── RLS: mismo patrón que inmueble_persona_rol (is_member / has_role agent) ──
create policy tenant_tercero_rol_select_miembro
  on public.tenant_tercero_rol for select
  to authenticated
  using (public.is_member(tenant_id));

create policy tenant_tercero_rol_insert_agent
  on public.tenant_tercero_rol for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy tenant_tercero_rol_update_agent
  on public.tenant_tercero_rol for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy tenant_tercero_rol_delete_agent
  on public.tenant_tercero_rol for delete
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));
