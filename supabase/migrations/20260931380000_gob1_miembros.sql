-- ═══════════════════════════════════════════════════════════════════════
--  GOB-1 · gobierno_miembros
--  Ver GOB_01_organos_gobierno.md §4.3, pruebas 7-8
--
--  persona_ref (spec) = tercero_id: GOB-0 encontró que "propietario o
--  tercero" ya no son dos entidades — `terceros` es la única (D-60,
--  20260821100000_terceros_generalizacion.sql). Un miembro de un órgano
--  (propietario, apoderado, o un profesional externo como el revisor
--  fiscal) es siempre un `tercero`.
--
--  decision_id: nulable "hasta GOB-5" tal como pide el spec — sin FK
--  todavía porque la tabla de decisiones no existe (se agregará cuando
--  GOB-5 la cree, sin romper esta migración).
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_miembros (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  organo_id     uuid not null references public.gobierno_organos (id) on delete cascade,
  tercero_id    uuid not null references public.terceros (id),
  rol_id        bigint not null references public.lista_tipos (id),
  inmueble_id   uuid references public.inmuebles (id),
  desde         date not null,
  hasta         date,
  decision_id   uuid,
  documento_id  uuid references public.documentos (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,

  constraint gobierno_miembros_fechas_validas check (hasta is null or hasta >= desde)
);

alter table public.gobierno_miembros enable row level security;
alter table public.gobierno_miembros force row level security;

create index gobierno_miembros_tenant_idx on public.gobierno_miembros (tenant_id);
create index gobierno_miembros_organo_idx on public.gobierno_miembros (organo_id);
create index gobierno_miembros_tercero_idx on public.gobierno_miembros (tercero_id);
create index gobierno_miembros_inmueble_idx on public.gobierno_miembros (inmueble_id) where inmueble_id is not null;

comment on table public.gobierno_miembros is
  'Miembros de un órgano de gobierno, con rol (familia ROL_CONCEJO_COPROPIEDAD, reutilizada), '
  'período y la unidad que representan cuando aplique. tercero_id: un miembro siempre es un '
  '`tercero` — propietario, apoderado o profesional externo (revisor fiscal). decision_id: la '
  'decisión que lo eligió, nulable hasta que GOB-5 exista. hasta IS NULL = vigente.';

create policy gobierno_miembros_select_miembro
  on public.gobierno_miembros for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_miembros_insert_auxiliar
  on public.gobierno_miembros for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy gobierno_miembros_update_auxiliar
  on public.gobierno_miembros for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── guard: reglas duras del §4.3 ─────────────────────────────────────────
create function public.guard_gobierno_miembro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol_codigo text;
  v_organo_codigo text;
  v_tenant_organo uuid;
  v_tenant_tercero uuid;
begin
  select codigo into v_rol_codigo
  from public.lista_tipos where id = new.rol_id and tipo = 'ROL_CONCEJO_COPROPIEDAD';
  if v_rol_codigo is null then
    raise exception 'MIEMBRO_ROL_INVALIDO: rol_id % no pertenece a ROL_CONCEJO_COPROPIEDAD', new.rol_id;
  end if;

  select go.tenant_id, lt.codigo into v_tenant_organo, v_organo_codigo
  from public.gobierno_organos go
  join public.lista_tipos lt on lt.id = go.tipo_id
  where go.id = new.organo_id;
  if v_tenant_organo is distinct from new.tenant_id then
    raise exception 'MIEMBRO_ORGANO_INVALIDO: organo_id % no pertenece al tenant %', new.organo_id, new.tenant_id;
  end if;

  select tenant_id into v_tenant_tercero from public.terceros where id = new.tercero_id;
  if v_tenant_tercero is distinct from new.tenant_id then
    raise exception 'MIEMBRO_TERCERO_INVALIDO: tercero_id % no pertenece al tenant %', new.tercero_id, new.tenant_id;
  end if;

  -- Ley 675 art. 58 par. 1: período fijo de UN AÑO — PISO y TECHO legal a la vez (marco §3),
  -- no un parámetro que el tenant pueda alargar. hasta obligatorio para este órgano: un
  -- período indefinido también incumple la ley, que exige un término fijo.
  if v_organo_codigo = 'comite_convivencia' then
    if new.hasta is null or new.hasta > new.desde + interval '1 year' then
      raise exception 'COMITE_CONVIVENCIA_PERIODO_EXCEDIDO: el período del comité de '
        'convivencia es de un (1) año exacto (Ley 675 art. 58 par. 1), desde % hasta %',
        new.desde, new.hasta;
    end if;
  end if;

  -- "Un mismo rol de dirección (presidente, secretario) no puede estar duplicado y vigente en
  -- el mismo órgano" (§4.3) — literal: solo esos dos, no vicepresidente/vocal/suplente (varios
  -- vocales es lo esperado, un órgano de número impar ≥3 los necesita).
  if v_rol_codigo in ('presidente', 'secretario')
     and new.hasta is null
     and exists (
       select 1 from public.gobierno_miembros gm
       where gm.organo_id = new.organo_id
         and gm.rol_id = new.rol_id
         and gm.hasta is null
         and gm.id is distinct from new.id
     )
  then
    raise exception 'ROL_ORGANO_DUPLICADO: ya hay un % vigente en este órgano', v_rol_codigo;
  end if;

  -- Sin solapamiento de vigencias para la misma persona+rol+órgano (dato, no solo dirección).
  if exists (
    select 1 from public.gobierno_miembros gm
    where gm.organo_id = new.organo_id
      and gm.tercero_id = new.tercero_id
      and gm.rol_id = new.rol_id
      and gm.id is distinct from new.id
      and gm.desde <= coalesce(new.hasta, 'infinity'::date)
      and coalesce(gm.hasta, 'infinity'::date) >= new.desde
  ) then
    raise exception 'ROL_ORGANO_DUPLICADO: % ya tiene el rol % en este órgano en un período que se solapa',
      new.tercero_id, v_rol_codigo;
  end if;

  return new;
end;
$$;

comment on function public.guard_gobierno_miembro() is
  'GOB-1: MIEMBRO_ROL_INVALIDO, MIEMBRO_ORGANO_INVALIDO/MIEMBRO_TERCERO_INVALIDO (tenant), '
  'COMITE_CONVIVENCIA_PERIODO_EXCEDIDO (art. 58 par. 1, exactamente 1 año, hasta obligatorio), '
  'ROL_ORGANO_DUPLICADO (presidente/secretario duplicado vigente, o solapamiento de '
  'persona+rol+órgano).';

create trigger guard_gobierno_miembro
  before insert or update on public.gobierno_miembros
  for each row execute function public.guard_gobierno_miembro();

create trigger set_updated_at before update on public.gobierno_miembros
  for each row execute function public.set_updated_at();
