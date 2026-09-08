-- ═══════════════════════════════════════════════════════════════════════
--  GOB-5 · gobierno_politica_semaforo
--  Ver GOB_05_decision_compromisos.md §4.3.
--
--  Único parámetro numérico de este corte: cuántos días antes del
--  vencimiento un compromiso pasa a semáforo "próximo_vencer". Ninguna
--  norma lo fija → REMISIÓN AL REGLAMENTO (marco §3): parámetro libre por
--  tenant, documentado como BUENA PRÁCTICA, no como norma. Mismo patrón
--  versionado (vigencia_estado_t + guard de inmutabilidad dedicado +
--  fn_..._vigente) que mant_politica_aprobacion_ot/
--  finanzas_politica_aprobacion_pago — no una fila de configuración sin
--  historial.
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_politica_semaforo (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  version             integer not null,
  estado              public.vigencia_estado_t not null default 'borrador',
  dias_proximo_vencer integer not null default 5,
  vigente_desde       date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,

  constraint gobierno_politica_semaforo_version_unica unique (tenant_id, version),
  constraint gobierno_politica_semaforo_dias_valido check (dias_proximo_vencer >= 0)
);

alter table public.gobierno_politica_semaforo enable row level security;
alter table public.gobierno_politica_semaforo force row level security;

comment on table public.gobierno_politica_semaforo is
  'GOB-5 §4.3: umbral de días para el semáforo "proximo_vencer" de gobierno_decision_ejecucion — '
  'ninguna norma lo fija (BUENA PRÁCTICA, no norma, marco §3). Sin fila vigente, '
  'gobierno_decision_ejecucion usa el default de 5 días hard-coded (documentado, no sembrado, '
  'mismo criterio que mant_politica_aprobacion_ot).';

create policy gobierno_politica_semaforo_select_miembro
  on public.gobierno_politica_semaforo for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_politica_semaforo_administrador_todo
  on public.gobierno_politica_semaforo for all
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

create function public.guard_gobierno_politica_semaforo_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.estado = 'historica' then
    raise exception 'IMMUTABLE_POLICY: la política de semáforo % (versión %) es inmutable en '
      'estado %', old.id, old.version, old.estado;
  end if;

  if old.estado = 'vigente' then
    if new.estado is distinct from 'historica'
       or new.version is distinct from old.version
       or new.dias_proximo_vencer is distinct from old.dias_proximo_vencer
       or new.vigente_desde is distinct from old.vigente_desde then
      raise exception 'IMMUTABLE_POLICY: la política de semáforo % (versión %) es inmutable en '
        'estado % — corrige creando una versión nueva', old.id, old.version, old.estado;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger gobierno_politica_semaforo_guard
  before update on public.gobierno_politica_semaforo
  for each row execute function public.guard_gobierno_politica_semaforo_inmutable();

create unique index gobierno_politica_semaforo_vigente_unica
  on public.gobierno_politica_semaforo (tenant_id)
  where estado = 'vigente';

create function public.fn_gobierno_politica_semaforo_vigente(p_tenant_id uuid)
returns public.gobierno_politica_semaforo
language sql
stable
security invoker
set search_path = ''
as $$
  select * from public.gobierno_politica_semaforo
  where tenant_id = p_tenant_id and estado = 'vigente'
  limit 1
$$;

comment on function public.fn_gobierno_politica_semaforo_vigente(uuid) is
  'La política vigente de semáforo del tenant, o ninguna fila si no hay una — '
  'gobierno_decision_ejecucion usa su dias_proximo_vencer, o 5 si no existe.';
