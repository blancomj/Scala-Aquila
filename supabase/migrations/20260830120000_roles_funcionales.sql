-- ═══════════════════════════════════════════════════════════════════════
--  Roles funcionales — segunda capa de acceso, encima de tenant_role_t
--  Decisión del usuario (2026-08-20), tras revisar un mockup de referencia
--  de administración de roles/permisos: una persona puede necesitar más de
--  un rol a la vez (ej. "Administrador" + "Director Financiero"), y ese
--  segundo eje no es un nivel de acceso (eso ya lo resuelve tenant_role_t:
--  administrador/auxiliar/auditor) sino una etiqueta atada a un MÓDULO
--  (financiero, cartera_cobranza, jurídico, mantenimiento...) — para poder
--  ocultarle a un contador la cartera jurídica y a un abogado el
--  presupuesto, sin tocar tenant_role_t.
--
--  Alcance deliberadamente recortado (decisión explícita del usuario):
--  "solo se ven los datos del tenant o copropiedad que está activa" — a
--  diferencia del mockup de referencia (que mostraba alcance cross-tenant/
--  por región), no se modela nada fuera del tenant activo. Coincide con
--  GAP-17 (CAR_00_Guia_Oficial.md), que ya dejó ese alcance cross-tenant
--  fuera de bloque y diferido — este diseño no lo reabre.
--
--  Catálogo (no enum, no tabla propia): decisión explícita del usuario —
--  los valores van en lista_tipos, familia nueva ROL_FUNCIONAL, mismo
--  patrón que TIPO_NOVEDAD/PERSONA_COPROPIEDAD (20260814180000/
--  20260822090000). Todavía no es personalizable por tenant (sin builder,
--  mismo criterio que el resto de "vamos por partes" de esta sesión) —
--  seed de plataforma (tenant_id null) únicamente.
--
--  rol_funcional_modulo: mapeo código→módulo como TABLA, no hardcodeado
--  en una función SQL — decisión explícita del usuario, para que el
--  mismo dato lo lean tanto la RLS como el frontend (evita la duplicación
--  TS/SQL que ya causó la confusión agent/administrador resuelta en
--  20260830100000). 1:N deliberado (no 1:1): un rol funcional puede
--  cubrir más de un módulo — revisor_fiscal necesita financiero Y cartera.
--
--  membership_roles_funcionales: N:N real (esto es lo que resuelve "una
--  persona puede tener más de un rol"). Ancla en membership_id, no en
--  user_id — hereda el scoping de tenant de memberships sin esfuerzo
--  adicional, ninguna fila puede cruzar de un tenant a otro.
--
--  rol_id no lleva guard de familia de catálogo — mismo criterio ya
--  documentado en tenant_tercero_rol.sql/inmueble_persona_rol: el FK a
--  lista_tipos(id) es la única barrera para este tipo de columna en este
--  proyecto.
-- ═══════════════════════════════════════════════════════════════════════

-- ── catálogo ROL_FUNCIONAL ──────────────────────────────────────────────
insert into public.tipos (codigo, nombre, descripcion) values
  ('ROL_FUNCIONAL', 'Rol Funcional', 'Etiqueta de acceso por módulo, adicional al nivel de tenant_role_t (PLAN 2026-08-20).');

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('ROL_FUNCIONAL', 'contador', 'Contador', 1),
  ('ROL_FUNCIONAL', 'revisor_fiscal', 'Revisor Fiscal', 2),
  ('ROL_FUNCIONAL', 'agente_cobranza', 'Agente de Cobranza', 3),
  ('ROL_FUNCIONAL', 'jefe_mantenimiento', 'Jefe de Mantenimiento', 4);

-- ── rol_funcional_modulo — mapeo código→módulo, consultable por RLS y frontend ──
create table public.rol_funcional_modulo (
  lista_tipos_id  bigint not null references public.lista_tipos (id),
  modulo          text not null,

  constraint rol_funcional_modulo_pk primary key (lista_tipos_id, modulo)
);

alter table public.rol_funcional_modulo enable row level security;
alter table public.rol_funcional_modulo force row level security;

create policy rol_funcional_modulo_select_authenticated
  on public.rol_funcional_modulo for select
  to authenticated
  using (true);

comment on table public.rol_funcional_modulo is
  'Mapeo código de ROL_FUNCIONAL → módulo que gobierna. 1:N deliberado: un rol '
  'funcional puede cubrir varios módulos (revisor_fiscal → financiero + '
  'cartera_cobranza). Sembrado por plataforma, no personalizable por tenant todavía.';

insert into public.rol_funcional_modulo (lista_tipos_id, modulo)
select lt.id, m.modulo
from public.lista_tipos lt
join (values
  ('contador', 'financiero'),
  ('revisor_fiscal', 'financiero'),
  ('revisor_fiscal', 'cartera_cobranza'),
  ('agente_cobranza', 'cartera_cobranza'),
  ('jefe_mantenimiento', 'mantenimiento')
) as m(codigo, modulo) on m.codigo = lt.codigo
where lt.tipo = 'ROL_FUNCIONAL' and lt.tenant_id is null;

-- ── membership_roles_funcionales — asignación N:N real ──────────────────
create table public.membership_roles_funcionales (
  id               uuid primary key default gen_random_uuid(),
  membership_id    uuid not null references public.memberships (id) on delete cascade,
  rol_funcional_id bigint not null references public.lista_tipos (id),
  asignado_por     uuid references public.profiles (id),
  asignado_en      timestamptz not null default now(),

  constraint membership_roles_funcionales_unico unique (membership_id, rol_funcional_id)
);

alter table public.membership_roles_funcionales enable row level security;
alter table public.membership_roles_funcionales force row level security;

create index membership_roles_funcionales_membership_idx
  on public.membership_roles_funcionales (membership_id);

comment on table public.membership_roles_funcionales is
  'Roles funcionales asignados a una membresía — N:N deliberado (una persona puede '
  'tener varios: "Administrador" + "Director Financiero"). Ancla en membership_id, '
  'nunca en user_id — hereda el scoping de tenant sin poder cruzarlo.';

create policy membership_roles_funcionales_select_miembro
  on public.membership_roles_funcionales for select
  to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.id = membership_id and public.is_member(m.tenant_id)
    )
  );

create policy membership_roles_funcionales_insert_administrador
  on public.membership_roles_funcionales for insert
  to authenticated
  with check (
    exists (
      select 1 from public.memberships m
      where m.id = membership_id
        and public.has_role(m.tenant_id, array['administrador']::public.tenant_role_t[])
    )
  );

create policy membership_roles_funcionales_delete_administrador
  on public.membership_roles_funcionales for delete
  to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.id = membership_id
        and public.has_role(m.tenant_id, array['administrador']::public.tenant_role_t[])
    )
  );

-- ── tiene_rol_funcional() — helper para gatear lectura por módulo ───────
create function public.tiene_rol_funcional(p_tenant uuid, p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membership_roles_funcionales mrf
    join public.memberships m on m.id = mrf.membership_id
    join public.rol_funcional_modulo rfm on rfm.lista_tipos_id = mrf.rol_funcional_id
    where m.user_id = (select auth.uid())
      and m.tenant_id = p_tenant
      and m.status = 'active'
      and rfm.modulo = p_modulo
  )
$$;

comment on function public.tiene_rol_funcional is
  'True si el usuario autenticado tiene, en p_tenant, algún rol funcional que cubra '
  'p_modulo. No reemplaza has_role() — se usa junto a él (or) en policies de select '
  'de módulos sensibles para que un rol funcional destrabe lectura sin necesitar '
  'auxiliar/administrador.';
