-- ═══════════════════════════════════════════════════════════════════════
--  MANT-11 · Visitantes y control de acceso (3/5) — mant_registros_acceso
--  Casos de uso/Solicitudes - Reservas - Visitantes/MANT_11_visitantes_acceso.md §4.3, §4.5
--
--  No usa forbid_mutation_salvo_tenant_borrado() (bloquea TODO update): el
--  propio spec exige que egreso_at se pueda actualizar al salir. Guard
--  dedicado que solo permite esa columna, mismo criterio que
--  actor_externo_vinculo (EXT-01) con vigente_hasta.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_registros_acceso (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants (id) on delete cascade,
  autorizacion_id      uuid references public.mant_autorizaciones_visita (id),
  visitante_nombre     text not null,
  visitante_documento  text,
  inmueble_destino_id  uuid not null references public.inmuebles (id),
  ingreso_at           timestamptz not null default now(),
  egreso_at            timestamptz,
  registrado_por       uuid not null references public.profiles (id),
  observaciones        text,

  constraint mant_registros_acceso_egreso_valido check (egreso_at is null or egreso_at >= ingreso_at)
);

alter table public.mant_registros_acceso enable row level security;
alter table public.mant_registros_acceso force row level security;

create index mant_registros_acceso_tenant_idx on public.mant_registros_acceso (tenant_id);
create index mant_registros_acceso_inmueble_idx on public.mant_registros_acceso (inmueble_destino_id);
create index mant_registros_acceso_autorizacion_idx
  on public.mant_registros_acceso (autorizacion_id) where autorizacion_id is not null;

comment on table public.mant_registros_acceso is
  'MANT-11 §4.3: el hecho real de un ingreso, registrado siempre por staff (nunca el residente ni '
  'el visitante). autorizacion_id null = acceso sin autorización previa, permitido pero exige que '
  'portería confirme por otro medio (observaciones documenta cómo).';

comment on column public.mant_registros_acceso.visitante_documento is
  'Único dato sensible del corte (Ley 1581/2012, minimización). Nunca expuesto en '
  'mant_registros_acceso_resumen (listados/bandeja) — solo en el detalle de una fila, vía esta '
  'tabla directamente.';

create function public.guard_mant_registro_acceso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  if old.tenant_id is distinct from new.tenant_id
    or old.autorizacion_id is distinct from new.autorizacion_id
    or old.visitante_nombre is distinct from new.visitante_nombre
    or old.visitante_documento is distinct from new.visitante_documento
    or old.inmueble_destino_id is distinct from new.inmueble_destino_id
    or old.ingreso_at is distinct from new.ingreso_at
    or old.registrado_por is distinct from new.registrado_por
    or old.observaciones is distinct from new.observaciones
  then
    raise exception 'REGISTRO_ACCESO_INMUTABLE: solo egreso_at es editable tras el alta';
  end if;

  return new;
end;
$$;

create trigger guard_mant_registro_acceso
  before insert or update on public.mant_registros_acceso
  for each row execute function public.guard_mant_registro_acceso();

create policy mant_registros_acceso_select_miembro
  on public.mant_registros_acceso for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_registros_acceso_staff_insert
  on public.mant_registros_acceso for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_registros_acceso_staff_update
  on public.mant_registros_acceso for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

revoke execute on function public.guard_mant_registro_acceso() from public, anon, authenticated;

-- ── mant_registros_acceso_resumen — listado/bandeja SIN visitante_documento ──
create view public.mant_registros_acceso_resumen with (security_invoker = true) as
select
  id, tenant_id, autorizacion_id, visitante_nombre, inmueble_destino_id,
  ingreso_at, egreso_at, registrado_por, observaciones
from public.mant_registros_acceso;

comment on view public.mant_registros_acceso_resumen is
  'MANT-11 §4.5: misma fila que mant_registros_acceso, sin visitante_documento — la bandeja del '
  'día y cualquier listado usan esta vista, nunca la tabla directa. security_invoker: la RLS de '
  'la tabla base decide qué filas ve cada quien.';

grant select on public.mant_registros_acceso_resumen to authenticated, service_role;
