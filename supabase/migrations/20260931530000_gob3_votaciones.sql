-- ═══════════════════════════════════════════════════════════════════════
--  GOB-3 · gobierno_votaciones / gobierno_votos
--  Ver GOB_03_quorum_votacion.md §4.4, pruebas 1-4, 7-16
--
--  Segregación de funciones confirmada (Plan del corte, igual que instalar/
--  cerrar una reunión en GOB-2): abrir y cerrar una votación exige rol
--  administrador — es una transición con efecto jurídico (congela el
--  resultado). Registrar un voto individual solo exige auxiliar.
--
--  Matiz del art. 46 par. (spec §4.4, aplicado literalmente): cuando la
--  materia SÍ admite segunda convocatoria (todas las sembradas por este
--  corte lo admiten — el art. 46 mismo lo permite condicionalmente), la
--  votación se puede ABRIR igual en segunda convocatoria; lo que impide
--  declararla aprobada es el cálculo normal de cierre, que para toda
--  materia calificada_70 ya usa base_calculo='coeficientes_totales' — en
--  segunda convocatoria, con poca asistencia, ese 70% de los TOTALES
--  raramente se alcanza, y el resultado natural es 'rechazada', sin
--  necesitar ningún caso especial en el cierre. VOTACION_MATERIA_NO_
--  ADMITE_SEGUNDA_CONVOCATORIA solo se dispara al ABRIR para una materia
--  hipotética futura con admite_segunda_convocatoria=false (ninguna de las
--  12 sembradas lo tiene hoy) — es la prohibición dura de la tabla del
--  spec; el matiz gobierna únicamente las materias que SÍ lo admiten.
-- ═══════════════════════════════════════════════════════════════════════

create type public.votacion_metodo_t as enum ('si_no_abstencion', 'opciones', 'eleccion');

comment on type public.votacion_metodo_t is
  'D-24: gobierna cómo se registra cada voto (sentido vs. opcion_texto) y cómo se calcula el '
  'resultado. eleccion se modela pero solo se implementa conteo simple (listas/cociente '
  'electoral, fuera de alcance — GOB_03_quorum_votacion.md §5).';

create type public.votacion_estado_t as enum ('abierta', 'cerrada', 'anulada');

comment on type public.votacion_estado_t is
  'D-24: FSM de gobierno_votaciones. abierta→cerrada (congela el resultado, calcula), '
  'abierta→anulada, cerrada→anulada (única corrección posible de un resultado ya cerrado — '
  'anular con motivo y repetir la votación, igual que la reversión contable de CO-2; ningún otro '
  'campo puede cambiar en esa transición). anulada es terminal. VOTACION_CERRADA_INMUTABLE '
  'bloquea cualquier otro cambio.';

create type public.votacion_resultado_t as enum ('aprobada', 'rechazada', 'sin_quorum');

comment on type public.votacion_resultado_t is
  'D-24: se calcula UNA VEZ al cerrar y queda congelado — determina si la decisión tiene efecto. '
  'sin_quorum: el quórum deliberatorio se perdió (alguien salió) entre abrir y cerrar.';

create type public.votacion_sentido_t as enum ('favor', 'contra', 'abstencion');

comment on type public.votacion_sentido_t is
  'D-24: gobierna la aritmética del cierre (coeficiente_favor/contra/abstencion) para '
  'metodo=si_no_abstencion. Para metodo en (opciones, eleccion) el voto usa opcion_texto en su '
  'lugar (constraint gobierno_votos_sentido_o_opcion) — conteo simple, sin motor de listas.';

create table public.gobierno_votaciones (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants (id) on delete cascade,
  reunion_id                uuid not null references public.gobierno_reuniones (id) on delete cascade,
  agenda_punto_id           uuid references public.gobierno_agenda_puntos (id),
  materia_id                bigint not null references public.gobierno_materia_decision (id),
  pregunta                  text not null,
  metodo                    public.votacion_metodo_t not null default 'si_no_abstencion',
  estado                    public.votacion_estado_t not null default 'abierta',
  coeficiente_total         numeric(14, 6),
  coeficiente_representado  numeric(14, 6),
  coeficiente_favor         numeric(14, 6),
  coeficiente_contra        numeric(14, 6),
  coeficiente_abstencion    numeric(14, 6),
  resultado                 public.votacion_resultado_t,
  regla_aplicada            jsonb,
  abierta_at                timestamptz not null default now(),
  cerrada_at                timestamptz,
  anulada_motivo            text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz
);

alter table public.gobierno_votaciones enable row level security;
alter table public.gobierno_votaciones force row level security;

create index gobierno_votaciones_tenant_idx on public.gobierno_votaciones (tenant_id);
create index gobierno_votaciones_reunion_idx on public.gobierno_votaciones (reunion_id);
create index gobierno_votaciones_materia_idx on public.gobierno_votaciones (materia_id);

comment on table public.gobierno_votaciones is
  'GOB-3: una votación dentro de una reunión instalada. coeficiente_*/resultado/regla_aplicada '
  'se congelan al cerrar (nunca antes) — reproducible aunque cambien los coeficientes o la regla '
  'de mayoría después (pruebas 15-16).';

create policy gobierno_votaciones_select_miembro
  on public.gobierno_votaciones for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_votaciones_insert_administrador
  on public.gobierno_votaciones for insert
  to authenticated
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

create policy gobierno_votaciones_update_administrador
  on public.gobierno_votaciones for update
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

create table public.gobierno_votos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  votacion_id   uuid not null references public.gobierno_votaciones (id) on delete cascade,
  asistencia_id uuid not null references public.gobierno_asistencia (id),
  sentido       public.votacion_sentido_t,
  opcion_texto  text,
  coeficiente   numeric(9, 6) not null,
  emitido_at    timestamptz not null default now(),

  constraint gobierno_votos_sentido_o_opcion check (
    (sentido is not null and opcion_texto is null) or (sentido is null and opcion_texto is not null)
  )
);

alter table public.gobierno_votos enable row level security;
alter table public.gobierno_votos force row level security;

create index gobierno_votos_tenant_idx on public.gobierno_votos (tenant_id);
create index gobierno_votos_votacion_idx on public.gobierno_votos (votacion_id);

comment on table public.gobierno_votos is
  'GOB-3: un voto individual, con el coeficiente congelado desde gobierno_asistencia.coeficiente '
  '(nunca recalculado). Un inmueble (o, en consejo, un miembro) vota una sola vez por votación — '
  'VOTO_DUPLICADO, verificado en el guard contra inmueble_id o asistente_ref según corresponda.';

create policy gobierno_votos_select_miembro
  on public.gobierno_votos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_votos_insert_auxiliar
  on public.gobierno_votos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── guard: abrir/cerrar/anular una votación ──────────────────────────────
create function public.guard_gobierno_votacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reunion record;
  v_materia record;
  v_regla record;
  v_organo_tipo_codigo text;
  v_atribucion_codigo text;
  v_competente boolean;
  v_quorum record;
  v_favor numeric;
  v_contra numeric;
  v_abstencion numeric;
  v_representado numeric;
  v_total numeric;
  v_pct_favor numeric;
  v_piso_defecto numeric;
begin
  select r.tenant_id, r.estado, r.modalidad, r.convocatoria_regimen, r.organo_id, r.fecha_hora,
         lt.codigo as organo_tipo_codigo
    into v_reunion
  from public.gobierno_reuniones r
  join public.gobierno_organos o on o.id = r.organo_id
  join public.lista_tipos lt on lt.id = o.tipo_id
  where r.id = new.reunion_id;

  if v_reunion.tenant_id is distinct from new.tenant_id then
    raise exception 'VOTACION_REUNION_INVALIDA: reunion_id % no pertenece al tenant %', new.reunion_id, new.tenant_id;
  end if;

  select * into v_materia from public.gobierno_materia_decision where id = new.materia_id;
  if v_materia.id is null then
    raise exception 'VOTACION_MATERIA_INVALIDA: materia_id % no existe', new.materia_id;
  end if;

  if tg_op = 'INSERT' then
    if v_reunion.estado <> 'instalada' then
      raise exception 'VOTACION_REUNION_NO_INSTALADA: la reunión % no está instalada', new.reunion_id;
    end if;

    if not v_materia.admite_no_presencial and v_reunion.modalidad = 'no_presencial' then
      raise exception 'VOTACION_MATERIA_NO_ADMITE_NO_PRESENCIAL: % no puede votarse en reunión no '
        'presencial (Ley 675 art. 46 par.) — prohibición absoluta, sin excepción', v_materia.codigo;
    end if;

    if not v_materia.admite_segunda_convocatoria and v_reunion.convocatoria_regimen = 'segunda' then
      raise exception 'VOTACION_MATERIA_NO_ADMITE_SEGUNDA_CONVOCATORIA: % no puede votarse en '
        'reunión de segunda convocatoria', v_materia.codigo;
    end if;

    if v_materia.organo_competente_atribucion_id is not null then
      select codigo into v_atribucion_codigo from public.lista_tipos where id = v_materia.organo_competente_atribucion_id;
      select exists (
        select 1 from public.gobierno_organo_competente(v_reunion.tenant_id, v_atribucion_codigo, v_reunion.fecha_hora::date) c
        where c.organo_id = v_reunion.organo_id
      ) into v_competente;
      if not v_competente then
        raise exception 'VOTACION_ORGANO_INCOMPETENTE: el órgano reunido no tiene la atribución % '
          'para decidir sobre %', v_atribucion_codigo, v_materia.codigo;
      end if;
    end if;

    select * into v_quorum from public.gobierno_quorum(new.reunion_id, new.abierta_at);
    if not v_quorum.quorum_deliberatorio then
      raise exception 'VOTACION_SIN_QUORUM: no hay quórum deliberatorio al momento de abrir '
        '(% coeficientes presentes de %, plural: %)', v_quorum.coeficiente_presente, v_quorum.coeficiente_total, v_quorum.hay_pluralidad;
    end if;

    return new;
  end if;

  -- UPDATE: FSM + inmutabilidad tras cerrar/anular.
  if old.estado = 'anulada' then
    raise exception 'VOTACION_CERRADA_INMUTABLE: la votación % está anulada y es inmutable', old.id;
  end if;

  if old.estado = 'cerrada' then
    if new.estado is distinct from 'anulada' or new.anulada_motivo is null
       or new.coeficiente_total is distinct from old.coeficiente_total
       or new.coeficiente_representado is distinct from old.coeficiente_representado
       or new.coeficiente_favor is distinct from old.coeficiente_favor
       or new.coeficiente_contra is distinct from old.coeficiente_contra
       or new.coeficiente_abstencion is distinct from old.coeficiente_abstencion
       or new.resultado is distinct from old.resultado
       or new.regla_aplicada is distinct from old.regla_aplicada
    then
      raise exception 'VOTACION_CERRADA_INMUTABLE: la votación % está cerrada — solo se admite '
        'anular con motivo, sin tocar el resultado congelado (corregir exige repetir la '
        'votación, igual que la reversión contable de CO-2)', old.id;
    end if;
    return new;
  end if;

  -- old.estado = 'abierta'
  if new.estado = 'anulada' then
    if new.anulada_motivo is null then
      raise exception 'VOTACION_ANULACION_SIN_MOTIVO: anular exige explicar el motivo';
    end if;
    return new;
  end if;

  if new.estado <> 'cerrada' then
    raise exception 'VOTACION_TRANSICION_INVALIDA: % → % no es una transición válida', old.estado, new.estado;
  end if;

  -- abierta → cerrada: calcular y congelar el resultado.
  select * into v_quorum from public.gobierno_quorum(new.reunion_id, now());

  if v_reunion.organo_tipo_codigo = 'consejo_administracion' then
    select
      count(*) filter (where v.sentido = 'favor'),
      count(*) filter (where v.sentido = 'contra'),
      count(*) filter (where v.sentido = 'abstencion')
      into v_favor, v_contra, v_abstencion
    from public.gobierno_votos v where v.votacion_id = old.id;
    v_total := v_quorum.coeficiente_total;
  else
    select
      coalesce(sum(v.coeficiente) filter (where v.sentido = 'favor'), 0),
      coalesce(sum(v.coeficiente) filter (where v.sentido = 'contra'), 0),
      coalesce(sum(v.coeficiente) filter (where v.sentido = 'abstencion'), 0)
      into v_favor, v_contra, v_abstencion
    from public.gobierno_votos v where v.votacion_id = old.id;
    v_total := v_quorum.coeficiente_total;
  end if;
  v_representado := coalesce(v_favor, 0) + coalesce(v_contra, 0) + coalesce(v_abstencion, 0);

  if v_materia.base_calculo = 'coeficientes_totales' then
    v_pct_favor := case when v_total > 0 then (coalesce(v_favor, 0) / v_total) * 100 else 0 end;
  else
    v_pct_favor := case when v_representado > 0 then (coalesce(v_favor, 0) / v_representado) * 100 else 0 end;
  end if;

  select * into v_regla
  from public.gobierno_regla_mayoria
  where tenant_id = new.tenant_id and materia_id = new.materia_id and vigente_hasta is null;

  if v_regla.id is null then
    -- Sin configuración del tenant: el piso legal de la materia rige por defecto (nunca se deja
    -- de aplicar la ley por falta de configuración).
    v_piso_defecto := case v_materia.mayoria_tipo
      when 'ordinaria' then 50 when 'calificada_70' then 70 when 'unanimidad' then 100 end;
  end if;

  new.coeficiente_total := v_total;
  new.coeficiente_representado := v_representado;
  new.coeficiente_favor := v_favor;
  new.coeficiente_contra := v_contra;
  new.coeficiente_abstencion := v_abstencion;
  new.regla_aplicada := jsonb_build_object(
    'materia_codigo', v_materia.codigo, 'mayoria_tipo', v_materia.mayoria_tipo,
    'base_calculo', v_materia.base_calculo,
    'mayoria_pct', coalesce(v_regla.mayoria_pct, v_piso_defecto),
    'quorum_minimo_pct', coalesce(v_regla.quorum_minimo_pct, 50),
    'reglamento_referencia', v_regla.reglamento_referencia
  );

  if not v_quorum.quorum_deliberatorio then
    new.resultado := 'sin_quorum';
  elsif v_pct_favor >= coalesce(v_regla.mayoria_pct, v_piso_defecto) then
    new.resultado := 'aprobada';
  else
    new.resultado := 'rechazada';
  end if;

  new.cerrada_at := now();
  return new;
end;
$$;

comment on function public.guard_gobierno_votacion() is
  'GOB-3: VOTACION_REUNION_INVALIDA/VOTACION_MATERIA_INVALIDA, VOTACION_REUNION_NO_INSTALADA, '
  'VOTACION_MATERIA_NO_ADMITE_NO_PRESENCIAL (absoluta), VOTACION_MATERIA_NO_ADMITE_SEGUNDA_'
  'CONVOCATORIA (solo bloquea abrir para materias que NO la admiten — el resto se abre y se '
  'resuelve al cerrar), VOTACION_ORGANO_INCOMPETENTE (gobierno_organo_competente de GOB-1), '
  'VOTACION_SIN_QUORUM (gobierno_quorum al momento de abrir), FSM (VOTACION_TRANSICION_INVALIDA, '
  'VOTACION_ANULACION_SIN_MOTIVO), VOTACION_CERRADA_INMUTABLE. Al cerrar: calcula por miembros '
  '(consejo_administracion, art. 54) o por coeficientes (el resto), congela regla_aplicada '
  '(con el piso legal como default si el tenant no configuró gobierno_regla_mayoria), y resuelve '
  'aprobada/rechazada/sin_quorum (re-verifica quórum al cierre, no solo al abrir).';

create trigger guard_gobierno_votacion
  before insert or update on public.gobierno_votaciones
  for each row execute function public.guard_gobierno_votacion();

create trigger set_updated_at before update on public.gobierno_votaciones
  for each row execute function public.set_updated_at();

-- ── guard: emitir un voto ────────────────────────────────────────────────
create function public.guard_gobierno_voto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_votacion record;
  v_asistencia record;
  v_duplicado boolean;
begin
  select tenant_id, estado, reunion_id into v_votacion
  from public.gobierno_votaciones where id = new.votacion_id;
  if v_votacion.tenant_id is distinct from new.tenant_id then
    raise exception 'VOTO_VOTACION_INVALIDA: votacion_id % no pertenece al tenant %', new.votacion_id, new.tenant_id;
  end if;
  if v_votacion.estado <> 'abierta' then
    raise exception 'VOTO_VOTACION_NO_ABIERTA: la votación % no está abierta', new.votacion_id;
  end if;

  select tenant_id, reunion_id, calidad, inmueble_id, asistente_ref, ingreso_at, salida_at, coeficiente
    into v_asistencia
  from public.gobierno_asistencia where id = new.asistencia_id;

  if v_asistencia.tenant_id is distinct from new.tenant_id or v_asistencia.reunion_id is distinct from v_votacion.reunion_id then
    raise exception 'VOTO_EMISOR_NO_HABILITADO: la asistencia % no pertenece a la reunión de esta votación', new.asistencia_id;
  end if;
  if v_asistencia.calidad = 'invitado' then
    raise exception 'VOTO_EMISOR_NO_HABILITADO: un invitado no puede votar';
  end if;
  if v_asistencia.ingreso_at > new.emitido_at or (v_asistencia.salida_at is not null and v_asistencia.salida_at <= new.emitido_at) then
    raise exception 'VOTO_EMISOR_NO_HABILITADO: % no está presente al momento de votar', new.asistencia_id;
  end if;

  if v_asistencia.inmueble_id is not null then
    select exists (
      select 1 from public.gobierno_votos v
      join public.gobierno_asistencia a on a.id = v.asistencia_id
      where v.votacion_id = new.votacion_id and a.inmueble_id = v_asistencia.inmueble_id
    ) into v_duplicado;
  else
    select exists (
      select 1 from public.gobierno_votos v
      join public.gobierno_asistencia a on a.id = v.asistencia_id
      where v.votacion_id = new.votacion_id and a.asistente_ref = v_asistencia.asistente_ref
    ) into v_duplicado;
  end if;
  if v_duplicado then
    raise exception 'VOTO_DUPLICADO: ya se registró un voto para esta unidad/miembro en esta votación';
  end if;

  new.coeficiente := v_asistencia.coeficiente;
  return new;
end;
$$;

comment on function public.guard_gobierno_voto() is
  'GOB-3: VOTO_VOTACION_INVALIDA (tenant)/VOTO_VOTACION_NO_ABIERTA, VOTO_EMISOR_NO_HABILITADO '
  '(invitado, no presente al emitir, o de otra reunión), VOTO_DUPLICADO (mismo inmueble o, en '
  'consejo, mismo miembro, dos veces en la misma votación). coeficiente siempre congelado desde '
  'gobierno_asistencia, nunca del valor enviado por el cliente.';

create trigger guard_gobierno_voto
  before insert on public.gobierno_votos
  for each row execute function public.guard_gobierno_voto();
