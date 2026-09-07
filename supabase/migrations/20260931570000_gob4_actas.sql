-- ═══════════════════════════════════════════════════════════════════════
--  GOB-4 · gobierno_actas — el acta se genera, no se adjunta (art. 47)
--  Ver GOB_04_acta.md §4.1, §4.2, §4.4.
--
--  numero se asigna SOLO al suscribir, no al generar el borrador — mismo
--  principio que fn_contabilizar_comprobante (CO-2): el consecutivo se
--  asigna en la transición que hace el objeto jurídicamente definitivo, no
--  al crear su borrador. Así "generar 5, descartar 2, suscribir 3 → 1,2,3"
--  (prueba 9) sale sin lógica especial: los 2 descartados nunca tuvieron
--  número.
--
--  Sin política insert/update para `authenticated`: toda escritura pasa por
--  gobierno_generar_acta()/fn_gobierno_suscribir_acta()/fn_gobierno_
--  actualizar_narrativa() (todas security definer, mismo criterio que
--  `documentos`, que tampoco tiene policy insert para authenticated).
--
--  Confirmado con el usuario (Plan del corte): suscribir exige rol
--  administrador (segregación de funciones, marco §5.5) — mismo patrón que
--  instalar/cerrar una reunión (GOB-2) y abrir/cerrar una votación (GOB-3).
--  Voto nominal por unidad incluido por defecto (lectura literal del art.
--  47), configurable por acta vía incluye_voto_nominal.
--
--  Fuera de alcance, documentado explícitamente: acta aclaratoria (el
--  mecanismo de corrección que cita el propio corte) — ninguna de las 14
--  pruebas la exige; solo se implementa el guard de inmutabilidad.
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_acta_consecutivo (
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  anio          smallint not null,
  ultimo_numero integer not null default 0,
  updated_at    timestamptz,

  primary key (tenant_id, anio)
);

alter table public.gobierno_acta_consecutivo enable row level security;
alter table public.gobierno_acta_consecutivo force row level security;

comment on table public.gobierno_acta_consecutivo is
  'GOB-4: último número de acta asignado por (tenant, año) — sin `serie_id` (a diferencia de '
  'contable_consecutivo/mant_consecutivo): solo hay una cosa que numerar, el acta. Deliberadamente '
  'sin `sequence` (un hueco en la numeración de actas es un defecto probatorio, art. 47).';

create policy gobierno_acta_consecutivo_select_miembro
  on public.gobierno_acta_consecutivo for select
  to authenticated
  using (public.is_member(tenant_id));

create function public.fn_gobierno_siguiente_numero_acta(p_tenant_id uuid, p_anio smallint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero integer;
begin
  insert into public.gobierno_acta_consecutivo (tenant_id, anio, ultimo_numero, updated_at)
  values (p_tenant_id, p_anio, 1, now())
  on conflict (tenant_id, anio)
  do update set ultimo_numero = public.gobierno_acta_consecutivo.ultimo_numero + 1, updated_at = now()
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;

comment on function public.fn_gobierno_siguiente_numero_acta(uuid, smallint) is
  'GOB-4: consecutivo atómico por (tenant, año) — INSERT...ON CONFLICT DO UPDATE...RETURNING en un '
  'solo paso (mismo patrón que fn_contable_siguiente_numero/fn_mant_siguiente_numero), nunca '
  'sequence. Se invoca únicamente desde fn_gobierno_suscribir_acta, nunca antes.';

create table public.gobierno_actas (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants (id) on delete cascade,
  reunion_id               uuid not null unique references public.gobierno_reuniones (id) on delete cascade,
  numero                   integer,
  anio                     smallint not null,
  estado                   public.acta_estado_t not null default 'borrador',
  contenido_generado       jsonb not null,
  narrativa                text,
  incluye_voto_nominal     boolean not null default true,
  presidente_miembro_id    uuid not null references public.gobierno_miembros (id),
  secretario_miembro_id    uuid not null references public.gobierno_miembros (id),
  suscrita_at              timestamptz,
  suscrita_por             uuid references public.profiles (id),
  documento_id             uuid references public.documentos (id),
  hash_contenido           text,
  plazo_disposicion_limite date not null,
  puesta_a_disposicion_at  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz,

  constraint gobierno_actas_numero_anio_unico unique (tenant_id, anio, numero)
);

alter table public.gobierno_actas enable row level security;
alter table public.gobierno_actas force row level security;

create index gobierno_actas_tenant_idx on public.gobierno_actas (tenant_id);

comment on table public.gobierno_actas is
  'GOB-4: el acta de una reunión cerrada (art. 47), generada desde los datos ya capturados por '
  'GOB-2/GOB-3, no adjuntada. `numero` se asigna solo al suscribir (fn_gobierno_suscribir_acta), '
  'nunca al generar el borrador — un acta descartada en borrador nunca ocupó un número. Sin policy '
  'insert/update para authenticated: toda escritura pasa por gobierno_generar_acta()/fn_gobierno_'
  'suscribir_acta()/fn_gobierno_actualizar_narrativa() (security definer).';

comment on column public.gobierno_actas.contenido_generado is
  'Las secciones obligatorias del art. 47 (carácter, convocatoria, orden del día, asistentes, '
  'poderes, quórum, votaciones) con datos reales — nunca editable directamente, solo regenerable '
  'vía gobierno_generar_acta() mientras el acta no esté suscrita.';

comment on column public.gobierno_actas.hash_contenido is
  'sha256 de contenido_generado (no de narrativa) — permite verificar que un PDF exhibido '
  'corresponde a lo que el sistema produjo. Se calcula una sola vez, al suscribir.';

create policy gobierno_actas_select_miembro
  on public.gobierno_actas for select
  to authenticated
  using (public.is_member(tenant_id));

-- ── gobierno_generar_acta: crea o regenera el borrador ──────────────────
create function public.gobierno_generar_acta(p_reunion_id uuid)
returns public.gobierno_actas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reunion record;
  v_caracter jsonb;
  v_convocatoria jsonb;
  v_agenda jsonb;
  v_asistentes jsonb;
  v_poderes jsonb;
  v_quorum jsonb;
  v_votaciones jsonb;
  v_contenido jsonb;
  v_plazo_disposicion date;
  v_acta_id uuid;
begin
  select r.*, lt.codigo as tipo_codigo, lt.nombre as tipo_nombre
    into v_reunion
  from public.gobierno_reuniones r
  join public.lista_tipos lt on lt.id = r.tipo_id
  where r.id = p_reunion_id;

  if v_reunion.id is null then
    raise exception 'ACTA_REUNION_INEXISTENTE: reunion_id % no existe', p_reunion_id;
  end if;

  if (select auth.uid()) is not null and not public.has_role(v_reunion.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'ACTA_TRANSICION_REQUIERE_AUXILIAR: se requiere rol auxiliar o superior para generar el acta';
  end if;

  if v_reunion.estado <> 'cerrada' then
    raise exception 'ACTA_REUNION_NO_CERRADA: la reunión % no está cerrada (estado actual: %)', p_reunion_id, v_reunion.estado;
  end if;

  v_caracter := jsonb_build_object(
    'codigo', v_reunion.tipo_codigo, 'nombre', v_reunion.tipo_nombre,
    'caracter', case
      when v_reunion.tipo_codigo like '%\_ordinaria' escape '\' then 'ordinaria'
      when v_reunion.tipo_codigo like '%\_extraordinaria' escape '\' then 'extraordinaria'
      else null
    end
  );

  select jsonb_build_object(
    'regimen', v_reunion.convocatoria_regimen, 'emitida_at', c.emitida_at,
    'fecha_limite_respuesta', c.fecha_limite_respuesta, 'documento_id', c.documento_id
  ) into v_convocatoria
  from public.gobierno_convocatorias c
  where c.reunion_id = p_reunion_id
  order by c.emitida_at desc
  limit 1;
  if v_convocatoria is null then
    v_convocatoria := jsonb_build_object('regimen', v_reunion.convocatoria_regimen, 'emitida_at', null);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('orden', a.orden, 'titulo', a.titulo, 'descripcion', a.descripcion) order by a.orden), '[]'::jsonb)
    into v_agenda
  from public.gobierno_agenda_puntos a
  where a.reunion_id = p_reunion_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'nombre', t.nombre_completo, 'calidad', asi.calidad, 'inmueble_codigo', i.codigo,
    'coeficiente', asi.coeficiente, 'ingreso_at', asi.ingreso_at, 'salida_at', asi.salida_at
  ) order by asi.ingreso_at), '[]'::jsonb)
    into v_asistentes
  from public.gobierno_asistencia asi
  join public.terceros t on t.id = asi.asistente_ref
  left join public.inmuebles i on i.id = asi.inmueble_id
  where asi.reunion_id = p_reunion_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'inmueble_codigo', i.codigo, 'otorgante', ot.nombre_completo, 'apoderado', ap.nombre_completo,
    'validado', (p.validado_at is not null)
  )), '[]'::jsonb)
    into v_poderes
  from public.gobierno_poderes p
  join public.terceros ot on ot.id = p.otorgante_ref
  join public.terceros ap on ap.id = p.apoderado_ref
  join public.inmuebles i on i.id = p.inmueble_id
  where p.reunion_id = p_reunion_id;

  select jsonb_build_object(
    'coeficiente_total', q.coeficiente_total, 'coeficiente_presente', q.coeficiente_presente,
    'pct_presente', q.pct_presente, 'hay_pluralidad', q.hay_pluralidad, 'quorum_deliberatorio', q.quorum_deliberatorio
  ) into v_quorum
  from public.gobierno_quorum(p_reunion_id, coalesce(v_reunion.instalada_at, v_reunion.fecha_hora)) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'pregunta', v.pregunta, 'materia', m.nombre, 'estado', v.estado, 'resultado', v.resultado,
    'coeficiente_total', v.coeficiente_total, 'coeficiente_representado', v.coeficiente_representado,
    'favor', v.coeficiente_favor, 'contra', v.coeficiente_contra, 'abstencion', v.coeficiente_abstencion,
    'votos_nominales', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'inmueble_codigo', i2.codigo, 'nombre', t2.nombre_completo, 'sentido', vo.sentido, 'coeficiente', vo.coeficiente
      )), '[]'::jsonb)
      from public.gobierno_votos vo
      join public.gobierno_asistencia a2 on a2.id = vo.asistencia_id
      join public.terceros t2 on t2.id = a2.asistente_ref
      left join public.inmuebles i2 on i2.id = a2.inmueble_id
      where vo.votacion_id = v.id
    )
  ) order by v.abierta_at), '[]'::jsonb)
    into v_votaciones
  from public.gobierno_votaciones v
  join public.gobierno_materia_decision m on m.id = v.materia_id
  where v.reunion_id = p_reunion_id;

  v_contenido := jsonb_build_object(
    'caracter', v_caracter, 'convocatoria', v_convocatoria, 'orden_del_dia', v_agenda,
    'asistentes', v_asistentes, 'poderes', v_poderes, 'quorum', v_quorum, 'votaciones', v_votaciones
  );

  v_plazo_disposicion := public.gobierno_sumar_dias_habiles(v_reunion.fecha_hora::date, 20);

  insert into public.gobierno_actas (
    tenant_id, reunion_id, anio, estado, contenido_generado,
    presidente_miembro_id, secretario_miembro_id, plazo_disposicion_limite
  ) values (
    v_reunion.tenant_id, p_reunion_id, extract(year from v_reunion.fecha_hora)::smallint, 'borrador',
    v_contenido, v_reunion.presidente_miembro_id, v_reunion.secretario_miembro_id, v_plazo_disposicion
  )
  on conflict (reunion_id) do update set
    contenido_generado = excluded.contenido_generado,
    plazo_disposicion_limite = excluded.plazo_disposicion_limite,
    updated_at = now()
  where public.gobierno_actas.estado in ('borrador', 'en_verificacion')
  returning id into v_acta_id;

  if v_acta_id is null then
    raise exception 'ACTA_SUSCRITA_INMUTABLE: el acta de la reunión % ya está suscrita y no se puede regenerar', p_reunion_id;
  end if;

  return (select a from public.gobierno_actas a where a.id = v_acta_id);
end;
$$;

comment on function public.gobierno_generar_acta(uuid) is
  'GOB-4: genera o regenera (mientras no esté suscrita) el contenido mínimo del art. 47 desde '
  'gobierno_reuniones/_convocatorias/_agenda_puntos/_asistencia/_poderes/_quorum/_votaciones/'
  '_votos. ACTA_REUNION_INEXISTENTE, ACTA_TRANSICION_REQUIERE_AUXILIAR, ACTA_REUNION_NO_CERRADA, '
  'ACTA_SUSCRITA_INMUTABLE (si ya está suscrita).';

-- ── narrativa editable mientras el acta no esté suscrita ─────────────────
create function public.fn_gobierno_actualizar_narrativa(p_acta_id uuid, p_narrativa text)
returns public.gobierno_actas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acta public.gobierno_actas;
begin
  select * into v_acta from public.gobierno_actas where id = p_acta_id;
  if v_acta.id is null then
    raise exception 'ACTA_INEXISTENTE: acta_id % no existe', p_acta_id;
  end if;
  if (select auth.uid()) is not null and not public.has_role(v_acta.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'ACTA_TRANSICION_REQUIERE_AUXILIAR: se requiere rol auxiliar o superior';
  end if;
  if v_acta.estado in ('suscrita', 'publicada') then
    raise exception 'ACTA_SUSCRITA_INMUTABLE: el acta % está suscrita y es inmutable', p_acta_id;
  end if;

  update public.gobierno_actas set narrativa = p_narrativa, updated_at = now()
  where id = p_acta_id
  returning * into v_acta;

  return v_acta;
end;
$$;

comment on function public.fn_gobierno_actualizar_narrativa(uuid, text) is
  'GOB-4: edita la narrativa (constancias y proposiciones, art. 47) mientras el acta no esté '
  'suscrita. ACTA_INEXISTENTE, ACTA_TRANSICION_REQUIERE_AUXILIAR, ACTA_SUSCRITA_INMUTABLE.';

-- ── suscripción: asigna numero, congela hash, hace el acta inmutable ─────
create function public.fn_gobierno_suscribir_acta(
  p_acta_id uuid, p_presidente_miembro_id uuid, p_secretario_miembro_id uuid
)
returns public.gobierno_actas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acta public.gobierno_actas;
  v_faltantes text[] := array[]::text[];
  v_numero integer;
  v_hash text;
begin
  select * into v_acta from public.gobierno_actas where id = p_acta_id;
  if v_acta.id is null then
    raise exception 'ACTA_INEXISTENTE: acta_id % no existe', p_acta_id;
  end if;

  if (select auth.uid()) is not null and not public.has_role(v_acta.tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'ACTA_TRANSICION_REQUIERE_ADMINISTRADOR: suscribir un acta exige rol administrador';
  end if;

  if v_acta.estado in ('suscrita', 'publicada') then
    raise exception 'ACTA_SUSCRITA_INMUTABLE: el acta % ya está suscrita', p_acta_id;
  end if;

  if p_presidente_miembro_id is distinct from v_acta.presidente_miembro_id
     or p_secretario_miembro_id is distinct from v_acta.secretario_miembro_id then
    raise exception 'ACTA_SUSCRIPTOR_NO_AUTORIZADO: solo el presidente % y el secretario % de la '
      'reunión pueden suscribir', v_acta.presidente_miembro_id, v_acta.secretario_miembro_id;
  end if;

  if (v_acta.contenido_generado -> 'orden_del_dia') = '[]'::jsonb then
    v_faltantes := array_append(v_faltantes, 'orden del día (art. 47)');
  end if;
  if (v_acta.contenido_generado -> 'asistentes') = '[]'::jsonb then
    v_faltantes := array_append(v_faltantes, 'lista de asistentes (art. 47)');
  end if;
  if array_length(v_faltantes, 1) > 0 then
    raise exception 'ACTA_CONTENIDO_MINIMO_INCOMPLETO: falta(n): %', array_to_string(v_faltantes, ', ');
  end if;

  v_numero := public.fn_gobierno_siguiente_numero_acta(v_acta.tenant_id, v_acta.anio);
  v_hash := encode(extensions.digest(v_acta.contenido_generado::text, 'sha256'), 'hex');

  update public.gobierno_actas
  set estado = 'suscrita', numero = v_numero, hash_contenido = v_hash,
      suscrita_at = now(), suscrita_por = (select auth.uid()), updated_at = now()
  where id = p_acta_id
  returning * into v_acta;

  return v_acta;
end;
$$;

comment on function public.fn_gobierno_suscribir_acta(uuid, uuid, uuid) is
  'GOB-4: suscribir asigna numero (fn_gobierno_siguiente_numero_acta, solo aquí — un borrador '
  'descartado nunca ocupó número), calcula hash_contenido (sha256 de contenido_generado) y hace el '
  'acta inmutable. Exige rol administrador (confirmado en el Plan del corte, marco §5.5). '
  'ACTA_INEXISTENTE, ACTA_TRANSICION_REQUIERE_ADMINISTRADOR, ACTA_SUSCRITA_INMUTABLE, '
  'ACTA_SUSCRIPTOR_NO_AUTORIZADO (los ids no coinciden con los de la reunión), '
  'ACTA_CONTENIDO_MINIMO_INCOMPLETO (con el detalle de qué falta).';
