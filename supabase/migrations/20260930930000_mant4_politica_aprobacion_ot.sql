-- ═══════════════════════════════════════════════════════════════════════
--  MANT-4 · Incidencias y órdenes de trabajo (5/9)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_04_incidencias_ordenes_trabajo.md §3.3
--
--  Umbral que dispara `pendiente_aprobacion`, versionado (vigencia_estado_t,
--  20260814100000) igual que finanzas_politica_tesoreria/
--  contable_politica_deterioro — consistente con el resto del repo en vez
--  de una fila de configuración sin historial.
--
--  Simplificación deliberada (documentada en el informe): el umbral
--  automático solo evalúa monto y parada de servicio. Un umbral "por banda
--  de criticidad" exigiría un orden total entre bandas que MANT-1 no
--  define (son texto libre por tenant, sin posición ordinal) — inventar
--  ese orden aquí sería incrustar una regla que el propio MANT-1 no
--  estableció. El administrador siempre puede marcar `requiere_aprobacion`
--  a mano en cualquier OT, sin depender de este cálculo automático.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_politica_aprobacion_ot (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants (id) on delete cascade,
  version                   integer not null,
  estado                    public.vigencia_estado_t not null default 'borrador',
  monto_umbral              numeric(18, 2),
  exige_por_parada_servicio boolean not null default false,
  vigente_desde             date,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz,

  constraint mant_politica_aprobacion_ot_version_unica unique (tenant_id, version),
  constraint mant_politica_aprobacion_ot_monto_valido check (monto_umbral is null or monto_umbral >= 0)
);

alter table public.mant_politica_aprobacion_ot enable row level security;
alter table public.mant_politica_aprobacion_ot force row level security;

comment on table public.mant_politica_aprobacion_ot is
  'MANT-4 §3.3: umbral que dispara el estado pendiente_aprobacion en una OT. Sin fila vigente, '
  'ninguna OT exige aprobación automática por monto/parada de servicio — el administrador puede '
  'marcarla a mano igual. Cero valores sembrados (marco §6.6).';

create policy mant_politica_aprobacion_ot_select_miembro
  on public.mant_politica_aprobacion_ot for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_politica_aprobacion_ot_administrador_todo
  on public.mant_politica_aprobacion_ot for all
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

-- ── Inmutabilidad dedicada (D-52/D-55: el guard genérico bloquearía vigente->historica) ──
create function public.guard_mant_politica_aprobacion_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.estado = 'historica' then
    raise exception 'IMMUTABLE_POLICY: la política de aprobación de OT % (versión %) es '
      'inmutable en estado %', old.id, old.version, old.estado;
  end if;

  if old.estado = 'vigente' then
    if new.estado is distinct from 'historica'
       or new.version is distinct from old.version
       or new.monto_umbral is distinct from old.monto_umbral
       or new.exige_por_parada_servicio is distinct from old.exige_por_parada_servicio
       or new.vigente_desde is distinct from old.vigente_desde then
      raise exception 'IMMUTABLE_POLICY: la política de aprobación de OT % (versión %) es '
        'inmutable en estado % — corrige creando una versión nueva', old.id, old.version, old.estado;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_mant_politica_aprobacion_inmutable() is
  'Mismo patrón que guard_criticidad_set_inmutable/guard_finanzas_politica_tesoreria_inmutable: '
  'único cambio permitido sobre una fila vigente es retirarla a historica.';

create trigger mant_politica_aprobacion_ot_guard
  before update on public.mant_politica_aprobacion_ot
  for each row execute function public.guard_mant_politica_aprobacion_inmutable();

-- ── Solo una fila vigente por tenant (mismo criterio que las demás políticas versionadas) ──
create unique index mant_politica_aprobacion_ot_vigente_unica
  on public.mant_politica_aprobacion_ot (tenant_id)
  where estado = 'vigente';

create function public.fn_mant_politica_aprobacion_vigente(p_tenant_id uuid)
returns public.mant_politica_aprobacion_ot
language sql
stable
security invoker
set search_path = ''
as $$
  select * from public.mant_politica_aprobacion_ot
  where tenant_id = p_tenant_id and estado = 'vigente'
  limit 1
$$;

comment on function public.fn_mant_politica_aprobacion_vigente(uuid) is
  'La política vigente de aprobación de OT del tenant, o ninguna fila si no hay una — '
  'guard_mant_ot la usa para decidir si una OT nace/entra con requiere_aprobacion = true.';
