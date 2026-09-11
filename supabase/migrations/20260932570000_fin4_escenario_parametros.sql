-- ═══════════════════════════════════════════════════════════════════════
--  FIN-4 · Flujo de caja proyectado y alertas de liquidez (2/8)
--
--  Coeficientes por escenario — SOLO para 'conservador'. 'base' siempre usa
--  la tasa de recaudo histórica calculada en vivo (finanzas_tasa_recaudo_
--  historica) y 'optimista' siempre es 100% de recaudo / 0 días extra —
--  ambos son definiciones fijas del propio §3.2 del corte, no admiten
--  override. Solo 'conservador' ("supuestos deteriorados", sin definición
--  numérica en el corte) necesita que el tenant lo configure explícitamente
--  — de ahí que la tabla exista, versionada igual que finanzas_politica_
--  tesoreria (FIN-1, mismo guard de inmutabilidad dedicado desde el día
--  uno), pero en la práctica solo se esperan filas con escenario='conservador'.
--  Se deja la columna `escenario` genérica (no un check que la limite a
--  'conservador') para no cerrar la puerta a un corte futuro que también
--  quiera permitir overridear 'base'/'optimista' explícitamente.
--
--  Cero filas sembradas por defecto (APENDICE_FIN.md §"Qué NO se resuelve
--  por defecto": "el sistema no decide por nadie cuánto es grande") — sin
--  fila vigente para 'conservador', ese escenario reporta el componente de
--  ingresos como datos_insuficientes, nunca inventa una tasa.
-- ═══════════════════════════════════════════════════════════════════════

create table public.finanzas_escenario_parametros (
  id                              uuid primary key default gen_random_uuid(),
  tenant_id                       uuid not null references public.tenants (id) on delete cascade,
  escenario                       public.finanzas_flujo_escenario_t not null,
  version                         int not null,
  estado                          public.vigencia_estado_t not null default 'borrador',
  vigente_desde                   date,
  vigente_hasta                   date,
  pct_recaudo_esperado            numeric(5, 2),
  dias_adicionales_pago_proveedor integer not null default 0,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz,

  constraint finanzas_escenario_parametros_version_positiva check (version > 0),
  constraint finanzas_escenario_parametros_pct_valido
    check (pct_recaudo_esperado is null or (pct_recaudo_esperado >= 0 and pct_recaudo_esperado <= 100)),
  constraint finanzas_escenario_parametros_dias_validos check (dias_adicionales_pago_proveedor >= 0)
);

comment on table public.finanzas_escenario_parametros is
  'FIN-4 §3.2: coeficientes explícitos por (tenant, escenario), versionados. En la práctica solo '
  'escenario=''conservador'' necesita fila — ''base'' y ''optimista'' tienen definición fija (ver '
  'finanzas_flujo_proyectado). Sin fila vigente para ''conservador'', ese componente es '
  'datos_insuficientes.';

alter table public.finanzas_escenario_parametros enable row level security;
alter table public.finanzas_escenario_parametros force row level security;

create unique index finanzas_escenario_parametros_version_idx
  on public.finanzas_escenario_parametros (tenant_id, escenario, version);
create unique index finanzas_escenario_parametros_vigente_unico
  on public.finanzas_escenario_parametros (tenant_id, escenario)
  where estado = 'vigente';
create index finanzas_escenario_parametros_tenant_idx
  on public.finanzas_escenario_parametros (tenant_id);

create policy finanzas_escenario_parametros_select_miembro
  on public.finanzas_escenario_parametros for select
  to authenticated
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

create policy finanzas_escenario_parametros_insert_auxiliar
  on public.finanzas_escenario_parametros for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy finanzas_escenario_parametros_update_auxiliar
  on public.finanzas_escenario_parametros for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create trigger set_updated_at before update on public.finanzas_escenario_parametros
  for each row execute function public.set_updated_at();

-- ── Guard de inmutabilidad dedicado (mismo patrón que guard_finanzas_politica_tesoreria_
-- inmutable de FIN-1 — nunca el guard genérico, ver su propia cabecera para el porqué) ──
create function public.guard_finanzas_escenario_parametros_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.estado = 'historica' then
    raise exception 'IMMUTABLE_POLICY: los parámetros de escenario % (versión %) son inmutables '
      'en estado %', old.id, old.version, old.estado;
  end if;

  if old.estado = 'vigente' then
    if new.estado is distinct from 'historica'
       or new.version is distinct from old.version
       or new.escenario is distinct from old.escenario
       or new.vigente_desde is distinct from old.vigente_desde then
      raise exception 'IMMUTABLE_POLICY: los parámetros de escenario % (versión %) son inmutables '
        'en estado %', old.id, old.version, old.estado;
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_finanzas_escenario_parametros_inmutable
  before update on public.finanzas_escenario_parametros
  for each row execute function public.guard_finanzas_escenario_parametros_inmutable();
