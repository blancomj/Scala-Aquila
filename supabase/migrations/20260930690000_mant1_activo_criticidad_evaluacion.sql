-- ═══════════════════════════════════════════════════════════════════════
--  MANT-1 · Atributos técnicos dinámicos y criticidad (4/4a)
--
--  Este archivo: evaluación de un activo contra un criterio (§3.3). Una fila
--  por (activo, criterio) — re-evaluar el MISMO criterio actualiza la fila
--  (evaluado_por/evaluado_at se refrescan); cambiar de versión de criterios
--  no toca esta tabla, porque un set nuevo crea FILAS NUEVAS de criterio
--  (con otro criterio_id) — las evaluaciones viejas quedan intactas,
--  atadas a criterios ya inmutables (historica), satisfaciendo "cambiar
--  los pesos no reescribe la historia" (§3.3, prueba 7) sin necesitar un
--  trigger de solo-inserción sobre esta tabla.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_activo_criticidad (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  activo_id    uuid not null references public.activos (id) on delete cascade,
  criterio_id  uuid not null references public.mant_criticidad_criterio (id),
  valor        text not null,
  -- Calculado por guard_activo_criticidad_puntaje desde criterio.escala — nunca escrito directo
  -- por el cliente (principio 1 del marco: un valor derivable no se confía a quien escribe).
  puntaje      numeric(6, 2) not null,
  evaluado_por uuid references public.profiles (id),
  evaluado_at  timestamptz not null default now(),

  constraint mant_activo_criticidad_unico unique (activo_id, criterio_id)
);

alter table public.mant_activo_criticidad enable row level security;
alter table public.mant_activo_criticidad force row level security;

create index mant_activo_criticidad_tenant_idx on public.mant_activo_criticidad (tenant_id);
create index mant_activo_criticidad_activo_idx on public.mant_activo_criticidad (activo_id);
create index mant_activo_criticidad_criterio_idx on public.mant_activo_criticidad (criterio_id);

comment on table public.mant_activo_criticidad is
  'MANT-1 §3.3: evaluación de un activo contra un criterio de criticidad. criterio_id ata cada '
  'fila a una versión concreta e inmutable de mant_criticidad_criterio — un set nuevo crea '
  'criterios nuevos, así que las evaluaciones existentes nunca cambian de peso ni de escala '
  'retroactivamente, aunque se corrija valor/puntaje de la MISMA evaluación.';
comment on column public.mant_activo_criticidad.puntaje is
  'Resuelto de criterio.escala[valor] por guard_activo_criticidad_puntaje al insertar/actualizar '
  '— no es un dato independiente que alguien pueda hacer divergir de la escala.';

-- ── Guard: activo y criterio del mismo tenant; valor existe en la escala ─
create function public.guard_activo_criticidad_puntaje()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activo_tenant   uuid;
  v_criterio_tenant uuid;
  v_escala          jsonb;
  v_puntaje         jsonb;
begin
  select tenant_id into v_activo_tenant from public.activos where id = new.activo_id;
  if v_activo_tenant is distinct from new.tenant_id then
    raise exception 'ACTIVO_TENANT_INCONSISTENTE: el activo % no pertenece al tenant de esta '
      'evaluación', new.activo_id;
  end if;

  select tenant_id, escala into v_criterio_tenant, v_escala
    from public.mant_criticidad_criterio where id = new.criterio_id;
  if v_criterio_tenant is distinct from new.tenant_id then
    raise exception 'ACTIVO_TENANT_INCONSISTENTE: el criterio % no pertenece al tenant de esta '
      'evaluación', new.criterio_id;
  end if;

  v_puntaje := v_escala -> new.valor;
  if v_puntaje is null then
    raise exception 'CRITICIDAD_VALOR_INVALIDO: % no está en la escala del criterio % (claves '
      'válidas: %)', new.valor, new.criterio_id, (select string_agg(k, ', ') from jsonb_object_keys(v_escala) as k);
  end if;
  if jsonb_typeof(v_puntaje) <> 'number' then
    raise exception 'CRITICIDAD_VALOR_INVALIDO: la escala del criterio % no asocia % a un '
      'número', new.criterio_id, new.valor;
  end if;

  new.puntaje := v_puntaje::text::numeric;
  new.evaluado_at := now();
  return new;
end;
$$;

comment on function public.guard_activo_criticidad_puntaje() is
  'MANT-1 §3.3: valida consistencia de tenant y que `valor` sea una clave real de '
  'criterio.escala, y calcula `puntaje` desde ahí — el cliente nunca lo escribe directo.';

create trigger mant_activo_criticidad_guard_puntaje
  before insert or update on public.mant_activo_criticidad
  for each row execute function public.guard_activo_criticidad_puntaje();

-- ── RLS ──────────────────────────────────────────────────────────────────
create policy mant_activo_criticidad_select_miembro
  on public.mant_activo_criticidad for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_activo_criticidad_insert_auxiliar
  on public.mant_activo_criticidad for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_activo_criticidad_update_auxiliar
  on public.mant_activo_criticidad for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_activo_criticidad_delete_auxiliar
  on public.mant_activo_criticidad for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
