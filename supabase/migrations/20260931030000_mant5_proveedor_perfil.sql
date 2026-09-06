-- ═══════════════════════════════════════════════════════════════════════
--  MANT-5 · Proveedores, contratos y garantías (2/9)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_05_proveedores_contratos_garantias.md §4.1
--
--  Satélite 1:1 sobre terceros — NO se crea mant_proveedores. Un tercero ya
--  tiene el rol proveedor/contratista vía tenant_tercero_rol; esta tabla
--  solo agrega lo que ese rol no modela: catálogo de servicios/especialidad
--  y la relación comercial (ver ESTADO_COMERCIAL_PROVEEDOR, migración
--  anterior — distinto de ESTADO_TERCERO).
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_proveedor_perfil (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  tercero_id            uuid not null references public.terceros (id) on delete cascade,
  categorias_servicio   bigint[] not null default '{}',
  especialidades        text[] not null default '{}',
  estado_comercial_id   bigint references public.lista_tipos (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,

  constraint mant_proveedor_perfil_tercero_unico unique (tenant_id, tercero_id)
);

alter table public.mant_proveedor_perfil enable row level security;
alter table public.mant_proveedor_perfil force row level security;

create index mant_proveedor_perfil_tenant_idx on public.mant_proveedor_perfil (tenant_id);

comment on table public.mant_proveedor_perfil is
  'MANT-5 §4.1: perfil de servicios de un tercero que ya tiene rol proveedor/contratista '
  '(tenant_tercero_rol) — cero tablas de proveedor nuevas, esto solo agrega lo que faltaba.';
comment on column public.mant_proveedor_perfil.categorias_servicio is
  'ids de lista_tipos familia CATEGORIA_ACTIVO (MANT-0) — en qué categorías de activo trabaja '
  'este proveedor. Validado elemento a elemento por el guard.';

create policy mant_proveedor_perfil_select_miembro
  on public.mant_proveedor_perfil for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_proveedor_perfil_insert_auxiliar
  on public.mant_proveedor_perfil for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_proveedor_perfil_update_auxiliar
  on public.mant_proveedor_perfil for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_mant_proveedor_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tercero_tenant uuid;
  v_categoria_id   bigint;
  v_estado_tipo    text;
begin
  select tenant_id into v_tercero_tenant from public.terceros where id = new.tercero_id;
  if v_tercero_tenant is null or v_tercero_tenant <> new.tenant_id then
    raise exception 'PROVEEDOR_TENANT_INCONSISTENTE: el tercero % no pertenece al tenant',
      new.tercero_id;
  end if;

  if new.categorias_servicio is not null then
    foreach v_categoria_id in array new.categorias_servicio loop
      if not exists (
        select 1 from public.lista_tipos where id = v_categoria_id and tipo = 'CATEGORIA_ACTIVO'
      ) then
        raise exception 'PROVEEDOR_CATEGORIA_INVALIDA: % no pertenece a CATEGORIA_ACTIVO',
          v_categoria_id;
      end if;
    end loop;
  end if;

  if new.estado_comercial_id is not null then
    select tipo into v_estado_tipo from public.lista_tipos where id = new.estado_comercial_id;
    if v_estado_tipo is distinct from 'ESTADO_COMERCIAL_PROVEEDOR' then
      raise exception 'PROVEEDOR_CATEGORIA_INVALIDA: estado_comercial_id % no pertenece a '
        'ESTADO_COMERCIAL_PROVEEDOR (es %)', new.estado_comercial_id, coalesce(v_estado_tipo, 'inexistente');
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_mant_proveedor_perfil() is
  'MANT-5 §4.1: valida que el tercero pertenezca al tenant y que categorias_servicio/'
  'estado_comercial_id resuelvan contra sus catálogos.';

create trigger mant_proveedor_perfil_guard
  before insert or update on public.mant_proveedor_perfil
  for each row execute function public.guard_mant_proveedor_perfil();
