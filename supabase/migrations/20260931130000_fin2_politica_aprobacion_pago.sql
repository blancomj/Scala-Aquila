-- ═══════════════════════════════════════════════════════════════════════
--  FIN-2 · Factura de proveedor y retenciones aplicadas (2/7)
--
--  Umbral de aprobación de pago — calco exacto de mant_politica_aprobacion_ot
--  (MANT-4, 20260930930000): versionada (vigencia_estado_t), cero valores
--  sembrados (APENDICE_FIN.md "los umbrales de aprobación no se siembran").
--  Sin fila vigente, TODA factura exige aprobación de administrador — el
--  sistema no decide por nadie cuánto es "grande" (mismo principio que
--  MANT-4).
--
--  Guard de inmutabilidad DEDICADO, no el genérico guard_politica_inmutable
--  — mismo criterio que mant_politica_aprobacion_ot (comentario de esa
--  migración: "el guard genérico bloquearía vigente->historica" sin la
--  lista explícita de columnas).
-- ═══════════════════════════════════════════════════════════════════════

create table public.finanzas_politica_aprobacion_pago (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  version       integer not null,
  estado        public.vigencia_estado_t not null default 'borrador',
  monto_umbral  numeric(18, 2),
  vigente_desde date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,

  constraint finanzas_politica_aprobacion_pago_version_unica unique (tenant_id, version),
  constraint finanzas_politica_aprobacion_pago_monto_valido check (monto_umbral is null or monto_umbral >= 0)
);

alter table public.finanzas_politica_aprobacion_pago enable row level security;
alter table public.finanzas_politica_aprobacion_pago force row level security;

comment on table public.finanzas_politica_aprobacion_pago is
  'FIN-2 §3.1/APENDICE_FIN.md: umbral de monto sobre el que una factura exige aprobación de '
  'órgano competente (GOB-1) o, mientras GOB-1 no exista, deja advertencia. Sin fila vigente, '
  'toda factura exige aprobación explícita de administrador. Cero valores sembrados.';

create policy finanzas_politica_aprobacion_pago_select_miembro
  on public.finanzas_politica_aprobacion_pago for select
  to authenticated
  using (public.is_member(tenant_id));

create policy finanzas_politica_aprobacion_pago_administrador_todo
  on public.finanzas_politica_aprobacion_pago for all
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

create function public.guard_finanzas_politica_aprobacion_pago_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.estado = 'historica' then
    raise exception 'IMMUTABLE_POLICY: la política de aprobación de pago % (versión %) es '
      'inmutable en estado %', old.id, old.version, old.estado;
  end if;

  if old.estado = 'vigente' then
    if new.estado is distinct from 'historica'
       or new.version is distinct from old.version
       or new.monto_umbral is distinct from old.monto_umbral
       or new.vigente_desde is distinct from old.vigente_desde then
      raise exception 'IMMUTABLE_POLICY: la política de aprobación de pago % (versión %) es '
        'inmutable en estado % — corrige creando una versión nueva', old.id, old.version, old.estado;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_finanzas_politica_aprobacion_pago_inmutable() is
  'Mismo patrón que guard_mant_politica_aprobacion_inmutable (MANT-4): único cambio permitido '
  'sobre una fila vigente es retirarla a historica.';

create trigger finanzas_politica_aprobacion_pago_guard
  before update on public.finanzas_politica_aprobacion_pago
  for each row execute function public.guard_finanzas_politica_aprobacion_pago_inmutable();

-- Solo una fila vigente por tenant (mismo criterio que las demás políticas versionadas).
create unique index finanzas_politica_aprobacion_pago_vigente_unica
  on public.finanzas_politica_aprobacion_pago (tenant_id)
  where estado = 'vigente';

-- ── fn_finanzas_politica_aprobacion_vigente: única fuente de lectura del umbral ────────────
create function public.fn_finanzas_politica_aprobacion_vigente(p_tenant_id uuid)
returns public.finanzas_politica_aprobacion_pago
language sql
stable
set search_path = ''
as $$
  select * from public.finanzas_politica_aprobacion_pago
  where tenant_id = p_tenant_id and estado = 'vigente'
  limit 1;
$$;

comment on function public.fn_finanzas_politica_aprobacion_vigente(uuid) is
  'FIN-2: la política vigente de umbral de aprobación de pago, o ninguna fila si el tenant no '
  'ha definido una — en ese caso toda factura exige aprobación explícita de administrador.';
