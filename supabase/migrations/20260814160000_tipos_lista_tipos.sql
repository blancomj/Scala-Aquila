-- ═══════════════════════════════════════════════════════════════════════
--  Catálogo genérico de tipos — decisión de diseño de esta sesión
--  Propietario: PLAN_MAESTRO_IMPLEMENTACION.md §4.3 (corrige/amplía)
--
--  Motivación: el corpus modelaba cada lista de clasificación (tipo de
--  inmueble, tipo de zona común, categoría de rubro presupuestal...) como
--  un `CREATE TYPE ... AS ENUM` nuevo. Eso es correcto para vocabularios
--  cerrados que gatillan lógica (`concepto_modo_calculo_t`,
--  `redondeo_modo_t`, `periodo_estado_t`... siguen siendo enums, no se
--  tocan aquí) pero es rígido para vocabulario puramente descriptivo que
--  cada copropiedad debería poder ampliar sin una migración nueva.
--
--  De los 12 enums de F2 (20260814100000_domain_enums.sql), verificado que
--  solo 3 no los lee ningún motor de cálculo
--  (packages/liquidation-engine/src/{snapshot,executor}.ts): tipo de
--  inmueble, tipo de zona común, categoría de rubro. Esos 3 migran aquí.
--  Los otros 9 se quedan como enums nativos — están acoplados a la
--  ejecución real de la liquidación y a invariantes de transición de
--  estado; convertirlos sería debilitar una garantía de la base de datos
--  por una tabla que en teoría se puede editar.
--
--  `tipos`       = catálogo de catálogos (una fila por familia, p.ej.
--                  TIPO_INMUEBLE). Solo lectura para tenants — una familia
--                  nueva es una decisión de esquema, se crea por migración.
--  `lista_tipos` = los valores de cada familia. `tenant_id IS NULL` = fila
--                  de plataforma: visible para todos, inmutable e
--                  imborrable para cualquier tenant. `tenant_id` propio =
--                  el tenant la creó y la controla por completo.
--
--  Sin trigger de "doble barrera" aquí (a diferencia de guard_self_modify/
--  guard_last_agent): la política RLS de INSERT/UPDATE/DELETE ya exige
--  `tenant_id is not null and has_role(...)`, así que una fila con
--  `tenant_id IS NULL` no puede satisfacerla nunca — RLS sola es la
--  barrera completa. Un trigger adicional sería redundancia sin ganancia
--  de seguridad (21 §6), y además bloquearía el seed legítimo de filas de
--  plataforma vía service_role en migraciones futuras.
-- ═══════════════════════════════════════════════════════════════════════

-- ── tipos — catálogo de catálogos ──────────────────────────────────────
create table public.tipos (
  id            bigint generated always as identity primary key,
  codigo        text not null unique,
  nombre        text not null,
  descripcion   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

alter table public.tipos enable row level security;
alter table public.tipos force row level security;

create policy tipos_select_authenticated
  on public.tipos for select
  to authenticated
  using (true);

create trigger set_updated_at before update on public.tipos
  for each row execute function public.set_updated_at();

comment on table public.tipos is
  'Familias de clasificación (una fila por lista, p.ej. TIPO_INMUEBLE). Solo lectura para '
  'tenants — crear una familia nueva es una decisión de esquema, va por migración.';

-- ── lista_tipos — valores de cada familia ──────────────────────────────
create table public.lista_tipos (
  id            bigint generated always as identity primary key,
  tipo          text not null references public.tipos (codigo),
  codigo        text not null,
  nombre        text not null,
  descripcion   text,
  activo        boolean not null default true,
  orden         smallint not null default 0,
  -- NULL = fila de plataforma: global, inmutable e imborrable por cualquier tenant.
  tenant_id     uuid references public.tenants (id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,

  constraint lista_tipos_codigo_unico unique nulls not distinct (tipo, codigo, tenant_id)
);

alter table public.lista_tipos enable row level security;
alter table public.lista_tipos force row level security;

create index lista_tipos_tenant_idx on public.lista_tipos (tenant_id);
create index lista_tipos_tipo_idx on public.lista_tipos (tipo, orden);

create policy lista_tipos_select_miembro
  on public.lista_tipos for select
  to authenticated
  using (tenant_id is null or public.is_member(tenant_id));

create policy lista_tipos_insert_agent
  on public.lista_tipos for insert
  to authenticated
  with check (tenant_id is not null and public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy lista_tipos_update_agent
  on public.lista_tipos for update
  to authenticated
  using (tenant_id is not null and public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (tenant_id is not null and public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy lista_tipos_delete_agent
  on public.lista_tipos for delete
  to authenticated
  using (tenant_id is not null and public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create trigger set_updated_at before update on public.lista_tipos
  for each row execute function public.set_updated_at();

comment on table public.lista_tipos is
  'Valores de cada familia de `tipos`. tenant_id NULL = plataforma (global, protegida por '
  'RLS: ninguna política de INSERT/UPDATE/DELETE la alcanza). tenant_id propio = el tenant '
  'la creó y tiene control total (agent).';

-- ── seed: las 3 familias que reemplazan enums existentes ───────────────
insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_INMUEBLE', 'Tipo de Inmueble', 'Clasificación de un inmueble como destino de cobro (PLAN §4.3).'),
  ('TIPO_ZONA_COMUN', 'Tipo de Zona Común', 'Clasificación de un bien común descriptivo (PLAN §4.1.1, R6).'),
  ('CATEGORIA_RUBRO_PRESUPUESTAL', 'Categoría de Rubro Presupuestal', 'Agrupación informativa de un rubro del presupuesto anual (PLAN §4.3).');

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_INMUEBLE', 'apartamento', 'Apartamento', 1),
  ('TIPO_INMUEBLE', 'casa', 'Casa', 2),
  ('TIPO_INMUEBLE', 'local', 'Local', 3),
  ('TIPO_INMUEBLE', 'oficina', 'Oficina', 4),
  ('TIPO_INMUEBLE', 'parqueadero', 'Parqueadero', 5),
  ('TIPO_INMUEBLE', 'deposito', 'Depósito', 6),
  ('TIPO_INMUEBLE', 'otro', 'Otro', 7),

  ('TIPO_ZONA_COMUN', 'recreativa', 'Recreativa', 1),
  ('TIPO_ZONA_COMUN', 'tecnica', 'Técnica', 2),
  ('TIPO_ZONA_COMUN', 'transito', 'Tránsito', 3),
  ('TIPO_ZONA_COMUN', 'servicio', 'Servicio', 4),
  ('TIPO_ZONA_COMUN', 'parqueadero', 'Parqueadero', 5),
  ('TIPO_ZONA_COMUN', 'deposito', 'Depósito', 6),
  ('TIPO_ZONA_COMUN', 'otra', 'Otra', 7),

  ('CATEGORIA_RUBRO_PRESUPUESTAL', 'administracion', 'Administración', 1),
  ('CATEGORIA_RUBRO_PRESUPUESTAL', 'vigilancia', 'Vigilancia', 2),
  ('CATEGORIA_RUBRO_PRESUPUESTAL', 'aseo', 'Aseo', 3),
  ('CATEGORIA_RUBRO_PRESUPUESTAL', 'mantenimiento', 'Mantenimiento', 4),
  ('CATEGORIA_RUBRO_PRESUPUESTAL', 'servicios_publicos', 'Servicios Públicos', 5),
  ('CATEGORIA_RUBRO_PRESUPUESTAL', 'seguros', 'Seguros', 6),
  ('CATEGORIA_RUBRO_PRESUPUESTAL', 'otros', 'Otros', 7);

-- ── inmuebles.tipo (enum) → inmuebles.tipo_id (FK) ─────────────────────
alter table public.inmuebles add column tipo_id bigint;

update public.inmuebles i
set tipo_id = lt.id
from public.lista_tipos lt
where lt.tipo = 'TIPO_INMUEBLE' and lt.tenant_id is null and lt.codigo = i.tipo::text;

alter table public.inmuebles alter column tipo_id set not null;
alter table public.inmuebles
  add constraint inmuebles_tipo_id_fkey foreign key (tipo_id) references public.lista_tipos (id);
create index inmuebles_tipo_id_idx on public.inmuebles (tipo_id);

alter table public.inmuebles drop column tipo;

-- ── zonas_comunes.tipo (enum) → zonas_comunes.tipo_id (FK) ─────────────
alter table public.zonas_comunes add column tipo_id bigint;

update public.zonas_comunes z
set tipo_id = lt.id
from public.lista_tipos lt
where lt.tipo = 'TIPO_ZONA_COMUN' and lt.tenant_id is null and lt.codigo = z.tipo::text;

alter table public.zonas_comunes alter column tipo_id set not null;
alter table public.zonas_comunes
  add constraint zonas_comunes_tipo_id_fkey foreign key (tipo_id) references public.lista_tipos (id);
create index zonas_comunes_tipo_id_idx on public.zonas_comunes (tipo_id);

alter table public.zonas_comunes drop column tipo;

-- ── presupuesto_rubros.categoria (enum) → presupuesto_rubros.categoria_id (FK) ──
alter table public.presupuesto_rubros add column categoria_id bigint;

update public.presupuesto_rubros pr
set categoria_id = lt.id
from public.lista_tipos lt
where lt.tipo = 'CATEGORIA_RUBRO_PRESUPUESTAL' and lt.tenant_id is null and lt.codigo = pr.categoria::text;

alter table public.presupuesto_rubros alter column categoria_id set not null;
alter table public.presupuesto_rubros
  add constraint presupuesto_rubros_categoria_id_fkey foreign key (categoria_id) references public.lista_tipos (id);
create index presupuesto_rubros_categoria_id_idx on public.presupuesto_rubros (categoria_id);

alter table public.presupuesto_rubros drop column categoria;

-- ── limpieza: los 3 enums ya no los referencia ninguna columna ─────────
drop type public.inmueble_tipo_t;
drop type public.zona_comun_tipo_t;
drop type public.presupuesto_rubro_categoria_t;
