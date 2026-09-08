-- ═══════════════════════════════════════════════════════════════════════
--  GOB-5 · gobierno_decisiones — una decisión con efectos rastreables
--  Ver GOB_05_decision_compromisos.md §4.1, pruebas 1-4, 12-13.
--
--  A diferencia del acta (GOB-4), la decisión NUNCA es borrador: solo nace
--  de una votación ya cerrada y aprobada (DECISION_SIN_VOTACION_APROBADA),
--  así que el consecutivo se asigna en el mismo INSERT, sin la separación
--  generar/suscribir del acta.
--
--  Segregación de funciones confirmada (Plan del corte): crear una decisión
--  exige rol auxiliar (formalización administrativa de una votación ya
--  aprobada, igual que generar el acta en GOB-4); revocarla exige rol
--  administrador (acto de efecto jurídico, igual que suscribir el acta o
--  cerrar una votación).
--
--  Sin política insert/update para `authenticated`: toda escritura pasa por
--  gobierno_crear_decision()/gobierno_revocar_decision() (security definer),
--  mismo criterio que gobierno_actas.
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_decision_consecutivo (
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  anio          smallint not null,
  ultimo_numero integer not null default 0,
  updated_at    timestamptz,

  primary key (tenant_id, anio)
);

alter table public.gobierno_decision_consecutivo enable row level security;
alter table public.gobierno_decision_consecutivo force row level security;

comment on table public.gobierno_decision_consecutivo is
  'GOB-5: último número de decisión asignado por (tenant, año) — mismo patrón que '
  'gobierno_acta_consecutivo (GOB-4), sin serie_id: solo se numera la decisión.';

create policy gobierno_decision_consecutivo_select_miembro
  on public.gobierno_decision_consecutivo for select
  to authenticated
  using (public.is_member(tenant_id));

create function public.fn_gobierno_siguiente_numero_decision(p_tenant_id uuid, p_anio smallint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero integer;
begin
  insert into public.gobierno_decision_consecutivo (tenant_id, anio, ultimo_numero, updated_at)
  values (p_tenant_id, p_anio, 1, now())
  on conflict (tenant_id, anio)
  do update set ultimo_numero = public.gobierno_decision_consecutivo.ultimo_numero + 1, updated_at = now()
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;

comment on function public.fn_gobierno_siguiente_numero_decision(uuid, smallint) is
  'GOB-5: consecutivo atómico por (tenant, año), mismo mecanismo (INSERT...ON CONFLICT...'
  'RETURNING) que fn_gobierno_siguiente_numero_acta/fn_contable_siguiente_numero. Se invoca '
  'únicamente desde gobierno_crear_decision.';

create table public.gobierno_decisiones (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  numero             integer not null,
  anio               smallint not null,
  reunion_id         uuid not null references public.gobierno_reuniones (id),
  agenda_punto_id    uuid references public.gobierno_agenda_puntos (id),
  votacion_id        uuid not null unique references public.gobierno_votaciones (id),
  acta_id            uuid references public.gobierno_actas (id),
  materia_id         bigint not null references public.gobierno_materia_decision (id),
  titulo             text not null,
  descripcion        text,
  fundamento         text,
  organo_id          uuid not null references public.gobierno_organos (id),
  estado             public.gobierno_decision_estado_t not null default 'vigente',
  fecha_limite       date,
  prioridad          text,
  revoca_decision_id uuid references public.gobierno_decisiones (id),
  anulada_motivo     text,
  anulada_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,

  constraint gobierno_decisiones_numero_unico unique (tenant_id, anio, numero)
);

alter table public.gobierno_decisiones enable row level security;
alter table public.gobierno_decisiones force row level security;

create index gobierno_decisiones_tenant_idx on public.gobierno_decisiones (tenant_id);
create index gobierno_decisiones_reunion_idx on public.gobierno_decisiones (reunion_id);
create index gobierno_decisiones_organo_idx on public.gobierno_decisiones (organo_id);
create index gobierno_decisiones_revoca_idx
  on public.gobierno_decisiones (revoca_decision_id) where revoca_decision_id is not null;

comment on table public.gobierno_decisiones is
  'GOB-5: una decisión con efectos rastreables, nacida de una votación cerrada y aprobada '
  '(DECISION_SIN_VOTACION_APROBADA). Sin estado de ejecución almacenado — se calcula con '
  'gobierno_decision_ejecucion() a partir de sus compromisos (marco §6.3, spec §2/§4.3). acta_id '
  'se resuelve automáticamente contra gobierno_actas.reunion_id al crear (nulo si el acta aún no '
  'existe); una vez esa acta queda suscrita/publicada, la decisión es inmutable en sus campos '
  'sustantivos (DECISION_INMUTABLE_TRAS_ACTA) salvo la transición de revocación.';
comment on column public.gobierno_decisiones.votacion_id is
  'unique: cada votación cerrada y aprobada produce como máximo una decisión — una revocatoria es '
  'una decisión NUEVA con su propia votación, no una segunda decisión sobre la misma votación.';
comment on column public.gobierno_decisiones.prioridad is
  'Texto libre a propósito: el spec (§4.1) no fija un vocabulario cerrado y ninguna prueba lo '
  'ejercita — no gobierna ninguna transición ni cálculo, así que no amerita lista_tipos (D-24).';
comment on column public.gobierno_decisiones.revoca_decision_id is
  'La decisión anterior que esta revoca — la puebla gobierno_revocar_decision, que además marca '
  'esa decisión anterior como estado=revocada (spec, prueba 12).';

create policy gobierno_decisiones_select_miembro
  on public.gobierno_decisiones for select
  to authenticated
  using (public.is_member(tenant_id));

-- ── Inmutabilidad tras acta suscrita (spec §4.1) ─────────────────────────
-- Permite SIEMPRE el cambio de estado/revoca_decision_id (usado por
-- gobierno_revocar_decision) aunque el acta ya esté suscrita — es
-- precisamente el mecanismo de corrección que el propio spec exige
-- ("corregir exige acta aclaratoria o decisión revocatoria"). Bloquea
-- cualquier otro campo sustantivo.
create function public.guard_gobierno_decision_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado_acta public.acta_estado_t;
begin
  if old.acta_id is not null then
    select estado into v_estado_acta from public.gobierno_actas where id = old.acta_id;

    if v_estado_acta in ('suscrita', 'publicada') then
      if (to_jsonb(old) - 'estado' - 'revoca_decision_id' - 'updated_at')
         is distinct from (to_jsonb(new) - 'estado' - 'revoca_decision_id' - 'updated_at')
      then
        raise exception 'DECISION_INMUTABLE_TRAS_ACTA: la decisión % es inmutable en sus campos '
          'sustantivos porque su acta % ya fue suscrita — corrige con un acta aclaratoria o una '
          'decisión revocatoria (art. 47)', old.id, old.acta_id;
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger gobierno_decision_inmutable_guard
  before update on public.gobierno_decisiones
  for each row execute function public.guard_gobierno_decision_inmutable();

-- ── gobierno_crear_decision ──────────────────────────────────────────────
create function public.gobierno_crear_decision(
  p_votacion_id uuid,
  p_titulo text,
  p_descripcion text default null,
  p_fundamento text default null,
  p_fecha_limite date default null,
  p_prioridad text default null
)
returns public.gobierno_decisiones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_votacion public.gobierno_votaciones;
  v_reunion  public.gobierno_reuniones;
  v_acta_id  uuid;
  v_numero   integer;
  v_anio     smallint;
  v_decision public.gobierno_decisiones;
begin
  select * into v_votacion from public.gobierno_votaciones where id = p_votacion_id;
  if not found then
    raise exception 'DECISION_SIN_VOTACION_APROBADA: la votación % no existe', p_votacion_id;
  end if;

  if not public.has_role(v_votacion.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'DECISION_TRANSICION_REQUIERE_AUXILIAR: crear una decisión exige rol auxiliar';
  end if;

  if v_votacion.estado <> 'cerrada' or v_votacion.resultado <> 'aprobada' then
    raise exception 'DECISION_SIN_VOTACION_APROBADA: la votación % no está cerrada y aprobada '
      '(estado=%, resultado=%)', p_votacion_id, v_votacion.estado, v_votacion.resultado;
  end if;

  select * into v_reunion from public.gobierno_reuniones where id = v_votacion.reunion_id;

  select id into v_acta_id from public.gobierno_actas where reunion_id = v_reunion.id;

  v_anio := extract(year from v_reunion.fecha_hora)::smallint;
  v_numero := public.fn_gobierno_siguiente_numero_decision(v_votacion.tenant_id, v_anio);

  insert into public.gobierno_decisiones (
    tenant_id, numero, anio, reunion_id, agenda_punto_id, votacion_id, acta_id, materia_id,
    titulo, descripcion, fundamento, organo_id, fecha_limite, prioridad
  ) values (
    v_votacion.tenant_id, v_numero, v_anio, v_reunion.id, v_votacion.agenda_punto_id, v_votacion.id,
    v_acta_id, v_votacion.materia_id, p_titulo, p_descripcion, p_fundamento, v_reunion.organo_id,
    p_fecha_limite, p_prioridad
  )
  returning * into v_decision;

  return v_decision;
end;
$$;

comment on function public.gobierno_crear_decision(uuid, text, text, text, date, text) is
  'GOB-5: formaliza una votación cerrada y aprobada como decisión — copia reunion_id/'
  'agenda_punto_id/materia_id/organo_id de la votación y su reunión, resuelve acta_id si el acta '
  'ya existe, y asigna numero/anio de una vez (nunca hay borrador).';

-- ── gobierno_revocar_decision ─────────────────────────────────────────────
create function public.gobierno_revocar_decision(
  p_decision_id uuid,
  p_votacion_revocatoria_id uuid,
  p_titulo text,
  p_descripcion text default null,
  p_fundamento text default null
)
returns public.gobierno_decisiones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.gobierno_decisiones;
  v_nueva    public.gobierno_decisiones;
begin
  select * into v_original from public.gobierno_decisiones where id = p_decision_id;
  if not found then
    raise exception 'DECISION_REVOCACION_INVALIDA: la decisión % no existe', p_decision_id;
  end if;

  if not public.has_role(v_original.tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'DECISION_TRANSICION_REQUIERE_ADMINISTRADOR: revocar una decisión exige rol '
      'administrador';
  end if;

  if v_original.estado <> 'vigente' then
    raise exception 'DECISION_REVOCACION_INVALIDA: la decisión % no está vigente (estado=%), no '
      'se puede revocar', p_decision_id, v_original.estado;
  end if;

  v_nueva := public.gobierno_crear_decision(
    p_votacion_revocatoria_id, p_titulo, p_descripcion, p_fundamento
  );

  update public.gobierno_decisiones
  set revoca_decision_id = v_original.id
  where id = v_nueva.id
  returning * into v_nueva;

  update public.gobierno_decisiones
  set estado = 'revocada'
  where id = v_original.id;

  return v_nueva;
end;
$$;

comment on function public.gobierno_revocar_decision(uuid, uuid, text, text, text) is
  'GOB-5: crea una decisión revocatoria nueva (misma validación de votación cerrada/aprobada que '
  'gobierno_crear_decision) enlazada vía revoca_decision_id, y marca la decisión original como '
  'estado=revocada (spec §4.1, prueba 12). Exige rol administrador (segregación confirmada).';
