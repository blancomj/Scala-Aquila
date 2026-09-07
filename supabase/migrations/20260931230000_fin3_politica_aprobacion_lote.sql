-- ═══════════════════════════════════════════════════════════════════════
--  FIN-3 · Programación y ejecución de pagos por lote (2/8)
--
--  Umbral de aprobación del LOTE — tabla propia, deliberadamente NO
--  reutiliza finanzas_politica_aprobacion_pago (FIN-2, umbral de una
--  factura individual). Son dos decisiones de negocio distintas aunque se
--  parezcan en forma (¿aprobar esta factura sola? vs. ¿aprobar este lote
--  que puede sumar varias?) — mismo criterio que ya separa
--  finanzas_politica_tesoreria / finanzas_politica_aprobacion_pago /
--  mant_politica_aprobacion_ot / contable_politica_deterioro: cada corte
--  tiene su propia tabla de política, nunca compartida entre series ni
--  entre conceptos dentro de la misma serie. Confirmado con el usuario en
--  el Plan del corte.
--
--  Calco exacto de finanzas_politica_aprobacion_pago (20260931130000):
--  versionada (vigencia_estado_t), cero valores sembrados, guard de
--  inmutabilidad dedicado, única fila vigente por tenant. Sin fila
--  vigente, TODO lote exige aprobación de administrador (nunca auxiliar) —
--  el sistema no decide por nadie cuánto es «grande» (APENDICE_FIN.md).
-- ═══════════════════════════════════════════════════════════════════════

create table public.finanzas_politica_aprobacion_lote (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  version       integer not null,
  estado        public.vigencia_estado_t not null default 'borrador',
  monto_umbral  numeric(18, 2),
  vigente_desde date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,

  constraint finanzas_politica_aprobacion_lote_version_unica unique (tenant_id, version),
  constraint finanzas_politica_aprobacion_lote_monto_valido check (monto_umbral is null or monto_umbral >= 0)
);

alter table public.finanzas_politica_aprobacion_lote enable row level security;
alter table public.finanzas_politica_aprobacion_lote force row level security;

comment on table public.finanzas_politica_aprobacion_lote is
  'FIN-3 §3.4: umbral de monto TOTAL del lote sobre el que pasar de programado a aprobado exige '
  'administrador (nunca auxiliar). Sin fila vigente, todo lote exige administrador. Cero valores '
  'sembrados. Tabla propia, distinta de finanzas_politica_aprobacion_pago (FIN-2, umbral por '
  'factura individual) — ver cabecera de esta migración.';

create policy finanzas_politica_aprobacion_lote_select_miembro
  on public.finanzas_politica_aprobacion_lote for select
  to authenticated
  using (public.is_member(tenant_id));

create policy finanzas_politica_aprobacion_lote_administrador_todo
  on public.finanzas_politica_aprobacion_lote for all
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

create function public.guard_finanzas_politica_aprobacion_lote_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.estado = 'historica' then
    raise exception 'IMMUTABLE_POLICY: la política de aprobación de lote % (versión %) es '
      'inmutable en estado %', old.id, old.version, old.estado;
  end if;

  if old.estado = 'vigente' then
    if new.estado is distinct from 'historica'
       or new.version is distinct from old.version
       or new.monto_umbral is distinct from old.monto_umbral
       or new.vigente_desde is distinct from old.vigente_desde then
      raise exception 'IMMUTABLE_POLICY: la política de aprobación de lote % (versión %) es '
        'inmutable en estado % — corrige creando una versión nueva', old.id, old.version, old.estado;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_finanzas_politica_aprobacion_lote_inmutable() is
  'Mismo patrón que guard_finanzas_politica_aprobacion_pago_inmutable (FIN-2): único cambio '
  'permitido sobre una fila vigente es retirarla a historica.';

create trigger finanzas_politica_aprobacion_lote_guard
  before update on public.finanzas_politica_aprobacion_lote
  for each row execute function public.guard_finanzas_politica_aprobacion_lote_inmutable();

create unique index finanzas_politica_aprobacion_lote_vigente_unica
  on public.finanzas_politica_aprobacion_lote (tenant_id)
  where estado = 'vigente';

create function public.fn_finanzas_politica_aprobacion_lote_vigente(p_tenant_id uuid)
returns public.finanzas_politica_aprobacion_lote
language sql
stable
set search_path = ''
as $$
  select * from public.finanzas_politica_aprobacion_lote
  where tenant_id = p_tenant_id and estado = 'vigente'
  limit 1;
$$;

comment on function public.fn_finanzas_politica_aprobacion_lote_vigente(uuid) is
  'FIN-3: la política vigente de umbral de aprobación de lote, o ninguna fila si el tenant no ha '
  'definido una — en ese caso todo lote exige aprobación explícita de administrador.';
