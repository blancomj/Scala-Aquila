-- ═══════════════════════════════════════════════════════════════════════
--  FIN-1 · Política de tesorería — qué cuentas y fondos cuentan como
--  liquidez operativa "utilizable". Versionada, cero valores por defecto
--  (APENDICE_FIN.md §"Principios invariables": "los umbrales de aprobación
--  no se siembran... el sistema no decide por nadie cuánto es grande").
--
--  Reutiliza vigencia_estado_t (D-24 ya resuelto para coeficiente_sets/
--  mant_criticidad_set/politicas_financieras) en vez de crear un enum
--  nuevo — el propio corte pide evaluar esto antes de inventar otro.
--
--  Guard de inmutabilidad DEDICADO desde el arranque (no se reutiliza
--  guard_politica_inmutable): MANT-1 (D-52) ya encontró que ese guard
--  genérico bloquea la transición vigente→historica necesaria para poder
--  activar una segunda versión — el mismo gap que coeficiente_sets
--  (20260830220000) y mant_criticidad_set (20260930710000) ya resolvieron
--  cada uno con su propio guard. Se aplica aquí desde el primer día, no
--  como fix posterior.
-- ═══════════════════════════════════════════════════════════════════════

create table public.finanzas_politica_tesoreria (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  version            int not null,
  estado             public.vigencia_estado_t not null default 'borrador',
  vigente_desde      date,
  vigente_hasta      date,
  bancos_utilizables uuid[] not null default '{}',
  fondos_utilizables uuid[] not null default '{}',
  incluir_caja       boolean not null default false,
  aprobada_por       uuid references public.profiles (id),
  aprobada_at        timestamptz,
  acta_referencia    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,

  constraint finanzas_politica_tesoreria_version_positiva check (version > 0)
);

comment on table public.finanzas_politica_tesoreria is
  'FIN-1 §3.4: qué cuentas bancarias y fondos cuentan como liquidez operativa "utilizable". Sin '
  'fila vigente, finanzas_posicion_tesoreria marca utilizable=false en todo — nunca estima por '
  'defecto. Versionada con vigencia histórica, mismo patrón que coeficiente_sets/'
  'mant_criticidad_set.';

alter table public.finanzas_politica_tesoreria enable row level security;
alter table public.finanzas_politica_tesoreria force row level security;

create unique index finanzas_politica_tesoreria_tenant_version_idx
  on public.finanzas_politica_tesoreria (tenant_id, version);
create unique index finanzas_politica_tesoreria_vigente_unico
  on public.finanzas_politica_tesoreria (tenant_id)
  where estado = 'vigente';

create index finanzas_politica_tesoreria_tenant_idx
  on public.finanzas_politica_tesoreria (tenant_id);

create policy finanzas_politica_tesoreria_select_miembro
  on public.finanzas_politica_tesoreria for select
  to authenticated
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

create policy finanzas_politica_tesoreria_insert_auxiliar
  on public.finanzas_politica_tesoreria for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy finanzas_politica_tesoreria_update_auxiliar
  on public.finanzas_politica_tesoreria for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── Guard: bancos_utilizables/fondos_utilizables deben ser del propio tenant ──
create function public.guard_finanzas_politica_tesoreria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if new.bancos_utilizables is not null and array_length(new.bancos_utilizables, 1) > 0 then
    select count(*) into v_count
      from public.cuentas_bancarias
     where id = any(new.bancos_utilizables) and tenant_id = new.tenant_id;
    if v_count <> array_length(new.bancos_utilizables, 1) then
      raise exception 'POLITICA_TESORERIA_ENTIDAD_AJENA: alguna cuenta bancaria en '
        'bancos_utilizables no pertenece al tenant %', new.tenant_id;
    end if;
  end if;

  if new.fondos_utilizables is not null and array_length(new.fondos_utilizables, 1) > 0 then
    select count(*) into v_count
      from public.fondos
     where id = any(new.fondos_utilizables) and tenant_id = new.tenant_id;
    if v_count <> array_length(new.fondos_utilizables, 1) then
      raise exception 'POLITICA_TESORERIA_ENTIDAD_AJENA: algún fondo en fondos_utilizables no '
        'pertenece al tenant %', new.tenant_id;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger guard_finanzas_politica_tesoreria
  before insert or update on public.finanzas_politica_tesoreria
  for each row execute function public.guard_finanzas_politica_tesoreria();

-- ── Guard de inmutabilidad dedicado (ver cabecera) ──
create function public.guard_finanzas_politica_tesoreria_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.estado = 'historica' then
    raise exception 'IMMUTABLE_POLICY: la política de tesorería % (versión %) es inmutable en '
      'estado %', old.id, old.version, old.estado;
  end if;

  if old.estado = 'vigente' then
    -- Único cambio permitido sobre una política vigente: retirarla a 'historica' cuando la
    -- reemplaza una versión nueva (mismo patrón que guard_criticidad_set_inmutable).
    if new.estado is distinct from 'historica'
       or new.version is distinct from old.version
       or new.vigente_desde is distinct from old.vigente_desde then
      raise exception 'IMMUTABLE_POLICY: la política de tesorería % (versión %) es inmutable en '
        'estado %', old.id, old.version, old.estado;
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_finanzas_politica_tesoreria_inmutable
  before update on public.finanzas_politica_tesoreria
  for each row execute function public.guard_finanzas_politica_tesoreria_inmutable();
