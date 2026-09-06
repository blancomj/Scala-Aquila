-- ═══════════════════════════════════════════════════════════════════════
--  MANT-5 · Proveedores, contratos y garantías (8/9)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_05_proveedores_contratos_garantias.md §4.4
--
--  Marcada explícitamente como BUENA PRÁCTICA (§3 del corte): sin norma
--  detrás. Criterios y pesos configurables por tenant, cero valores
--  sembrados (marco §6.6) — cada copropiedad define sus propios criterios
--  de evaluación. Append-only: una evaluación de un periodo no se corrige,
--  se registra una nueva (mismo criterio que mant_cumplimiento, MANT-2).
--
--  puntaje NO se deriva de una fórmula fija sobre `criterios`: el propio
--  corte dice que se alimenta "en parte con datos reales... y en parte con
--  juicio humano" — es una síntesis del evaluador, no un cálculo puro, así
--  que se captura tal cual la entrega quien evalúa. El desglose completo
--  vive en `criterios` y SIEMPRE se muestra (§4.4: "nunca solo las
--  estrellas").
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_proveedor_evaluacion (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  tercero_id     uuid not null references public.terceros (id) on delete cascade,
  periodo        text not null,
  criterios      jsonb not null,
  puntaje        numeric(5, 2) not null,
  evaluado_por   uuid references public.profiles (id),
  observaciones  text,
  created_at     timestamptz not null default now(),

  constraint mant_proveedor_evaluacion_periodo_no_vacio check (btrim(periodo) <> '')
);

alter table public.mant_proveedor_evaluacion enable row level security;
alter table public.mant_proveedor_evaluacion force row level security;

create index mant_proveedor_evaluacion_tenant_idx on public.mant_proveedor_evaluacion (tenant_id);
create index mant_proveedor_evaluacion_tercero_idx on public.mant_proveedor_evaluacion (tercero_id);

comment on table public.mant_proveedor_evaluacion is
  'MANT-5 §4.4: BUENA PRÁCTICA, sin norma detrás (etiquetado explícito, no entra a '
  'fundamento_normativo). Criterios y pesos configurables por tenant, cero valores sembrados. '
  'Append-only — una evaluación de un periodo no se corrige, se registra una nueva.';
comment on column public.mant_proveedor_evaluacion.criterios is
  'jsonb libre por tenant: {"criterio": {"peso": n, "puntaje": n, ...}, ...}. Siempre se muestra '
  'en la UI junto al puntaje (§4.4) — una calificación sin desglose no permite discutir nada.';
comment on column public.mant_proveedor_evaluacion.puntaje is
  'Síntesis entregada por quien evalúa (dato + juicio humano, §4.4) — no se deriva con una '
  'fórmula fija sobre `criterios`, por eso se captura como valor propio.';

create policy mant_proveedor_evaluacion_select_miembro
  on public.mant_proveedor_evaluacion for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_proveedor_evaluacion_insert_auxiliar
  on public.mant_proveedor_evaluacion for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create trigger mant_proveedor_evaluacion_append_only
  before update or delete on public.mant_proveedor_evaluacion
  for each row execute function public.forbid_mutation();

create function public.guard_mant_proveedor_evaluacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tercero_tenant uuid;
begin
  select tenant_id into v_tercero_tenant from public.terceros where id = new.tercero_id;
  if v_tercero_tenant is null or v_tercero_tenant <> new.tenant_id then
    raise exception 'PROVEEDOR_TENANT_INCONSISTENTE: el tercero % no pertenece al tenant',
      new.tercero_id;
  end if;
  return new;
end;
$$;

create trigger mant_proveedor_evaluacion_guard
  before insert on public.mant_proveedor_evaluacion
  for each row execute function public.guard_mant_proveedor_evaluacion();
