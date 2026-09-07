-- ═══════════════════════════════════════════════════════════════════════
--  GOB-1 · gobierno_atribucion + gobierno_organo_competente()
--  Ver GOB_01_organos_gobierno.md §4.2, pruebas 2-6
--
--  La tabla que hace útil el corte (§4.2 del spec): registra qué órgano
--  tiene qué atribución, con su origen legal o reglamentario. Todo corte
--  futuro que necesite saber "quién aprueba esto" consume
--  gobierno_organo_competente(), nunca codifica "lo aprueba el consejo".
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_atribucion (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants (id) on delete cascade,
  organo_id                uuid not null references public.gobierno_organos (id) on delete cascade,
  atribucion_id            bigint not null references public.lista_tipos (id),
  origen                   public.atribucion_origen_t not null,
  reglamento_referencia    text,
  fundamento_normativo_id  bigint references public.fundamento_normativo (id),
  vigente_desde            date not null,
  vigente_hasta            date,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz,

  constraint gobierno_atribucion_fechas_validas check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

alter table public.gobierno_atribucion enable row level security;
alter table public.gobierno_atribucion force row level security;

create index gobierno_atribucion_tenant_idx on public.gobierno_atribucion (tenant_id);
create index gobierno_atribucion_organo_idx on public.gobierno_atribucion (organo_id);
create index gobierno_atribucion_atribucion_idx on public.gobierno_atribucion (atribucion_id);

comment on table public.gobierno_atribucion is
  'Qué órgano tiene qué atribución (familia ATRIBUCION_ORGANO), con su origen: ley (cita '
  'fundamento_normativo_id) o reglamento (cita reglamento_referencia). vigente_hasta IS NULL = '
  'vigente. Consumida por gobierno_organo_competente() — ningún corte futuro debe codificar '
  '"lo aprueba el consejo" directamente.';

create policy gobierno_atribucion_select_miembro
  on public.gobierno_atribucion for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_atribucion_insert_auxiliar
  on public.gobierno_atribucion for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy gobierno_atribucion_update_auxiliar
  on public.gobierno_atribucion for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── guard: reglas duras del §4.2 ─────────────────────────────────────────
create function public.guard_gobierno_atribucion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atribucion_codigo text;
  v_organo_codigo text;
  v_tenant_organo uuid;
begin
  select codigo into v_atribucion_codigo
  from public.lista_tipos where id = new.atribucion_id and tipo = 'ATRIBUCION_ORGANO';
  if v_atribucion_codigo is null then
    raise exception 'ATRIBUCION_TIPO_INVALIDO: atribucion_id % no pertenece a ATRIBUCION_ORGANO', new.atribucion_id;
  end if;

  select go.tenant_id, lt.codigo into v_tenant_organo, v_organo_codigo
  from public.gobierno_organos go
  join public.lista_tipos lt on lt.id = go.tipo_id
  where go.id = new.organo_id;
  if v_tenant_organo is distinct from new.tenant_id then
    raise exception 'ATRIBUCION_ORGANO_INVALIDO: organo_id % no pertenece al tenant %', new.organo_id, new.tenant_id;
  end if;

  -- Regla central del corte (art. 58 par. 2): el comité de convivencia jamás puede sancionar,
  -- ni siquiera con origen=reglamento — el reglamento no puede otorgar lo que la ley prohíbe.
  if v_organo_codigo = 'comite_convivencia' and v_atribucion_codigo = 'imponer_sanciones' then
    raise exception 'ATRIBUCION_PROHIBIDA_COMITE_CONVIVENCIA: el comité de convivencia no puede '
      'imponer sanciones en ningún caso (Ley 675 art. 58 par. 2)';
  end if;

  if new.origen = 'reglamento' and coalesce(btrim(new.reglamento_referencia), '') = '' then
    raise exception 'ATRIBUCION_SIN_REFERENCIA_REGLAMENTO: origen=reglamento exige reglamento_referencia';
  end if;

  if new.origen = 'ley' and new.fundamento_normativo_id is null then
    raise exception 'ATRIBUCION_SIN_FUNDAMENTO: origen=ley exige fundamento_normativo_id';
  end if;

  return new;
end;
$$;

comment on function public.guard_gobierno_atribucion() is
  'GOB-1: ATRIBUCION_TIPO_INVALIDO, ATRIBUCION_ORGANO_INVALIDO (tenant), '
  'ATRIBUCION_PROHIBIDA_COMITE_CONVIVENCIA (art. 58 par. 2, la regla central del corte), '
  'ATRIBUCION_SIN_REFERENCIA_REGLAMENTO, ATRIBUCION_SIN_FUNDAMENTO.';

create trigger guard_gobierno_atribucion
  before insert or update on public.gobierno_atribucion
  for each row execute function public.guard_gobierno_atribucion();

create trigger set_updated_at before update on public.gobierno_atribucion
  for each row execute function public.set_updated_at();

-- ── gobierno_organo_competente — único lugar que resuelve "quién decide" ─
create function public.gobierno_organo_competente(p_tenant_id uuid, p_atribucion_codigo text, p_fecha date)
returns table (
  organo_id          uuid,
  organo_tipo_codigo text,
  origen             public.atribucion_origen_t
)
language sql
stable
security invoker
set search_path = ''
as $$
  select go.id, lt_organo.codigo, ga.origen
  from public.gobierno_atribucion ga
  join public.gobierno_organos go on go.id = ga.organo_id
  join public.lista_tipos lt_organo on lt_organo.id = go.tipo_id
  join public.lista_tipos lt_atrib on lt_atrib.id = ga.atribucion_id
  where ga.tenant_id = p_tenant_id
    and lt_atrib.tipo = 'ATRIBUCION_ORGANO'
    and lt_atrib.codigo = p_atribucion_codigo
    and ga.vigente_desde <= p_fecha and (ga.vigente_hasta is null or ga.vigente_hasta >= p_fecha)
    and go.vigente_desde <= p_fecha and (go.vigente_hasta is null or go.vigente_hasta >= p_fecha)
$$;

comment on function public.gobierno_organo_competente(uuid, text, date) is
  'Único lugar que resuelve qué órgano tiene una atribución vigente a una fecha (GOB-1 §4.2). Si '
  'dos órganos la tienen a la vez, devuelve AMBOS — quien la consuma resuelve la ambigüedad '
  'explícitamente, nunca por precedencia implícita. Vacío si ninguno la tiene.';
