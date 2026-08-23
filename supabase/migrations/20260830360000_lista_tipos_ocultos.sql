-- ═══════════════════════════════════════════════════════════════════════
--  lista_tipos_ocultos — un tenant oculta un valor de PLATAFORMA de sus
--  propios selectores, sin afectar a los demás tenants ni tocar la fila
--  de plataforma (20260814160000_tipos_lista_tipos.sql).
--
--  Par (lista_tipos_id, tenant_id): la sola existencia de la fila significa
--  "este tenant no quiere ver este valor". Mostrar de nuevo = borrar la
--  fila (no hay UPDATE, no hace falta soft-delete acá — a diferencia de
--  lista_tipos, esto no es dato de negocio, es una preferencia de vista).
--
--  Solo alcanza a lo que ve el picker (useListaTipos.ts) — los registros ya
--  guardados que usan ese valor (inmuebles.tipo_id, roles, etc.) lo siguen
--  mostrando normal vía sus propios joins directos a lista_tipos, que esta
--  tabla no toca. Deliberado: ocultar no es borrar historial.
-- ═══════════════════════════════════════════════════════════════════════

create table public.lista_tipos_ocultos (
  lista_tipos_id  bigint not null references public.lista_tipos (id) on delete cascade,
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  created_at      timestamptz not null default now(),

  primary key (lista_tipos_id, tenant_id)
);

alter table public.lista_tipos_ocultos enable row level security;
alter table public.lista_tipos_ocultos force row level security;

create index lista_tipos_ocultos_tenant_idx on public.lista_tipos_ocultos (tenant_id);

-- ── solo se puede ocultar una fila de PLATAFORMA — la propia (tenant_id
--    propio) ya se desactiva directo con lista_tipos.activo. ─────────────
create function public.validar_lista_tipos_ocultos_plataforma()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.lista_tipos lt
    where lt.id = new.lista_tipos_id and lt.tenant_id is null
  ) then
    raise exception 'INVALID_INSERT: lista_tipos_ocultos solo aplica a valores de plataforma (tenant_id null)';
  end if;
  return new;
end;
$$;

create trigger validar_plataforma before insert on public.lista_tipos_ocultos
  for each row execute function public.validar_lista_tipos_ocultos_plataforma();

create policy lista_tipos_ocultos_select_miembro
  on public.lista_tipos_ocultos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy lista_tipos_ocultos_insert_agent
  on public.lista_tipos_ocultos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy lista_tipos_ocultos_delete_agent
  on public.lista_tipos_ocultos for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

comment on table public.lista_tipos_ocultos is
  'Valores de plataforma que un tenant decidió no ver en sus selectores. No afecta a otros '
  'tenants ni a registros ya guardados que usan ese valor (esos joins van directo a '
  'lista_tipos, sin pasar por acá). Mostrar de nuevo = borrar la fila.';
