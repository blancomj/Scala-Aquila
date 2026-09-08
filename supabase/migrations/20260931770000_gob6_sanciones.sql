-- ═══════════════════════════════════════════════════════════════════════
--  GOB-6 · gobierno_sanciones + gobierno_imponer_sancion()
--  Ver GOB_06_convivencia_sanciones.md §4.4-4.6. Los cinco guards que
--  evitan la tutela viven TODOS aquí, en una sola función orquestadora —
--  auditable en un solo lugar, ninguno es una advertencia.
--
--  Segregación de funciones confirmada (Plan del corte): imponer una
--  sanción exige rol administrador — este corte es "de alto riesgo" (marco
--  §2: puede producir una violación de derechos fundamentales), se trata
--  como el acto de mayor peso de toda la serie GOB, no como una
--  formalización administrativa (a diferencia de gobierno_crear_decision
--  en GOB-5, que solo exige auxiliar). Registrar actuaciones previas
--  (requerimiento, descargos, conciliación) exige solo auxiliar —
--  confirmado explícitamente que ambos roles deben poder hacerlo, y
--  administrador ⊇ auxiliar por has_role() ya lo garantiza.
--
--  La multa se materializa vía `novedades` (TIPO_NOVEDAD.sancion, ya
--  sembrado desde el inicio del proyecto) + fn_aprobar_novedad() — cero
--  mecanismo de cobro paralelo a cartera (spec §4.6). fn_aprobar_novedad
--  recibe p_actor_id explícito (no confía en auth.uid()), mismo criterio
--  que se replica aquí para created_by.
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_sanciones (
  id                                  uuid primary key default gen_random_uuid(),
  tenant_id                           uuid not null references public.tenants (id) on delete cascade,
  expediente_id                       uuid not null references public.gobierno_expedientes_convivencia (id) on delete cascade,
  clase_sancion_id                    bigint not null references public.gobierno_clase_sancion (id),
  decision_id                         uuid not null references public.gobierno_decisiones (id),
  monto                               numeric(18, 2),
  zona_comun_id                       uuid references public.zonas_comunes (id),
  vigente_desde                       date,
  vigente_hasta                       date,
  novedad_id                          uuid references public.novedades (id),
  publicacion_evidencia_documento_id  uuid references public.documentos (id),
  impuesta_at                         timestamptz not null default now(),
  created_at                          timestamptz not null default now(),

  constraint gobierno_sanciones_monto_positivo check (monto is null or monto > 0),
  constraint gobierno_sanciones_vigencia_valida check (vigente_hasta is null or vigente_desde is null or vigente_hasta >= vigente_desde)
);

alter table public.gobierno_sanciones enable row level security;
alter table public.gobierno_sanciones force row level security;

create index gobierno_sanciones_tenant_idx on public.gobierno_sanciones (tenant_id);
create index gobierno_sanciones_expediente_idx on public.gobierno_sanciones (expediente_id);

comment on table public.gobierno_sanciones is
  'GOB-6: la sanción impuesta — creada SOLO por gobierno_imponer_sancion(), que aplica los 5 '
  'guards de la tutela (marco §2). decision_id enlaza siempre a la decisión de GOB-5 que la '
  'autorizó (spec §4.6) — el órgano competente se lee de esa decisión, nunca se vuelve a capturar.';

create policy gobierno_sanciones_select_miembro
  on public.gobierno_sanciones for select
  to authenticated
  using (public.is_member(tenant_id));

-- Sin política insert/update para `authenticated`: toda escritura pasa por
-- gobierno_imponer_sancion() (security definer).

create function public.gobierno_imponer_sancion(
  p_expediente_id uuid,
  p_clase_sancion_codigo text,
  p_decision_id uuid,
  p_monto numeric default null,
  p_zona_comun_id uuid default null,
  p_vigente_desde date default null,
  p_vigente_hasta date default null,
  p_publicacion_documento_id uuid default null,
  p_actor_id uuid default null
)
returns public.gobierno_sanciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expediente        public.gobierno_expedientes_convivencia;
  v_infraccion        public.gobierno_infracciones;
  v_decision          public.gobierno_decisiones;
  v_fecha_decision     date;
  v_clase             public.gobierno_clase_sancion;
  v_zona               public.zonas_comunes;
  v_expensa_mensual    numeric(18, 2);
  v_acumulado_previo   numeric(18, 2);
  v_novedad_id         uuid;
  v_actor              uuid;
  v_sancion            public.gobierno_sanciones;
begin
  select * into v_expediente from public.gobierno_expedientes_convivencia where id = p_expediente_id;
  if not found then
    raise exception 'EXPEDIENTE_INEXISTENTE: expediente % no existe', p_expediente_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_expediente.tenant_id, array['administrador']::public.tenant_role_t[])
  then
    raise exception 'EXPEDIENTE_TRANSICION_REQUIERE_ADMINISTRADOR: imponer una sanción exige rol '
      'administrador';
  end if;

  if v_expediente.etapa in ('sancion_impuesta', 'archivado', 'firme') then
    raise exception 'EXPEDIENTE_ETAPA_TERMINAL: el expediente % ya está en % (terminal)',
      p_expediente_id, v_expediente.etapa;
  end if;

  -- Guards 1 y 2: los hitos del debido proceso deben estar YA logueados.
  if not exists (
    select 1 from public.gobierno_expediente_actuaciones
    where expediente_id = p_expediente_id and etapa = 'requerimiento_escrito'
  ) then
    raise exception 'SANCION_SIN_REQUERIMIENTO_PREVIO: el expediente % no tiene un requerimiento '
      'escrito previo registrado (art. 59)', p_expediente_id;
  end if;

  if not exists (
    select 1 from public.gobierno_expediente_actuaciones
    where expediente_id = p_expediente_id and etapa = 'descargos'
  ) then
    raise exception 'SANCION_SIN_DEBIDO_PROCESO: el expediente % no tiene una etapa de descargos '
      'registrada — se exige la oportunidad de defensa, no la respuesta (art. 2 num. 5, art. 60)',
      p_expediente_id;
  end if;

  select * into v_infraccion from public.gobierno_infracciones where id = v_expediente.infraccion_id;

  select * into v_decision from public.gobierno_decisiones where id = p_decision_id;
  if not found or v_decision.tenant_id is distinct from v_expediente.tenant_id then
    raise exception 'SANCION_DECISION_INVALIDA: decision_id % no pertenece al tenant del '
      'expediente', p_decision_id;
  end if;

  select r.fecha_hora::date into v_fecha_decision
  from public.gobierno_reuniones r where r.id = v_decision.reunion_id;

  -- Guard 3: el órgano de la decisión debe tener la atribución 'imponer_sanciones' vigente a
  -- esa fecha — el comité de convivencia nunca puede tenerla (bloqueado desde GOB-1).
  if not exists (
    select 1 from public.gobierno_organo_competente(v_expediente.tenant_id, 'imponer_sanciones', v_fecha_decision) oc
    where oc.organo_id = v_decision.organo_id
  ) then
    raise exception 'SANCION_ORGANO_INCOMPETENTE: el órgano % no tiene la atribución '
      'imponer_sanciones vigente a % (art. 60)', v_decision.organo_id, v_fecha_decision;
  end if;

  select * into v_clase from public.gobierno_clase_sancion where codigo = p_clase_sancion_codigo;
  if not found then
    raise exception 'SANCION_CLASE_NO_PERMITIDA: % no es una clase de sanción del catálogo del '
      'art. 59', p_clase_sancion_codigo;
  end if;

  -- Guard 4: la clase debe estar entre las que la infracción tipificada permite.
  if not (p_clase_sancion_codigo = any(v_infraccion.clases_sancion_permitidas)) then
    raise exception 'SANCION_CLASE_NO_PERMITIDA: la infracción % no permite la clase % — solo %',
      v_infraccion.codigo, p_clase_sancion_codigo, v_infraccion.clases_sancion_permitidas;
  end if;

  v_actor := coalesce((select auth.uid()), p_actor_id);

  if v_clase.codigo = 'multa' then
    if p_monto is null or p_monto <= 0 then
      raise exception 'SANCION_MONTO_REQUERIDO: la clase % exige un monto positivo', v_clase.codigo;
    end if;

    v_expensa_mensual := public.fn_gobierno_expensa_necesaria_mensual(v_expediente.inmueble_id, current_date);

    -- Guard 5a: tope individual.
    if p_monto > v_clase.tope_multiplo_expensas * v_expensa_mensual then
      raise exception 'MULTA_EXCEDE_TOPE_INDIVIDUAL: % supera % veces las expensas necesarias '
        'mensuales (%) — tope %', p_monto, v_clase.tope_multiplo_expensas, v_expensa_mensual,
        v_clase.tope_multiplo_expensas * v_expensa_mensual;
    end if;

    -- Guard 5b: tope acumulado — todas las multas previas de ESE infractor en este tenant.
    select coalesce(sum(s.monto), 0) into v_acumulado_previo
    from public.gobierno_sanciones s
    join public.gobierno_expedientes_convivencia e on e.id = s.expediente_id
    join public.gobierno_clase_sancion c on c.id = s.clase_sancion_id
    where e.tenant_id = v_expediente.tenant_id
      and e.presunto_infractor_ref = v_expediente.presunto_infractor_ref
      and c.codigo = 'multa';

    if (v_acumulado_previo + p_monto) > v_clase.tope_acumulado_multiplo * v_expensa_mensual then
      raise exception 'MULTA_EXCEDE_TOPE_ACUMULADO: % (previas %, nueva %) supera % veces las '
        'expensas necesarias mensuales (%)', v_acumulado_previo + p_monto, v_acumulado_previo,
        p_monto, v_clase.tope_acumulado_multiplo, v_expensa_mensual;
    end if;

    insert into public.novedades (tenant_id, inmueble_id, tipo, monto, descripcion, fecha_efectiva, created_by, tipo_novedad_id)
    values (
      v_expediente.tenant_id, v_expediente.inmueble_id, 'CHARGE', p_monto,
      format('Multa — expediente %s/%s (%s)', v_expediente.numero, v_expediente.anio, v_infraccion.nombre),
      current_date, v_actor,
      (select id from public.lista_tipos where tipo = 'TIPO_NOVEDAD' and codigo = 'sancion')
    )
    returning id into v_novedad_id;

    perform public.fn_aprobar_novedad(v_novedad_id, v_actor);

  elsif v_clase.codigo = 'restriccion_uso' then
    if p_zona_comun_id is null then
      raise exception 'SANCION_ZONA_COMUN_REQUERIDA: la clase % exige una zona común', v_clase.codigo;
    end if;

    select * into v_zona from public.zonas_comunes where id = p_zona_comun_id;
    if not found or v_zona.tenant_id is distinct from v_expediente.tenant_id then
      raise exception 'SANCION_ZONA_COMUN_INVALIDA: zona_comun_id % no pertenece al tenant',
        p_zona_comun_id;
    end if;

    -- Guard adicional (spec §4.4, no es de las 5 numeradas pero es igual de vinculante): jamás
    -- un bien común esencial, por construcción del catálogo cerrado más esta verificación.
    if v_zona.es_esencial then
      raise exception 'SANCION_BIEN_COMUN_ESENCIAL: % es un bien común esencial — no puede '
        'restringirse su uso (art. 59 num. 3)', v_zona.nombre;
    end if;
  end if;

  insert into public.gobierno_sanciones (
    tenant_id, expediente_id, clase_sancion_id, decision_id, monto, zona_comun_id,
    vigente_desde, vigente_hasta, novedad_id, publicacion_evidencia_documento_id
  ) values (
    v_expediente.tenant_id, p_expediente_id, v_clase.id, p_decision_id, p_monto, p_zona_comun_id,
    p_vigente_desde, p_vigente_hasta, v_novedad_id, p_publicacion_documento_id
  )
  returning * into v_sancion;

  insert into public.gobierno_expediente_actuaciones (tenant_id, expediente_id, etapa, fecha, descripcion, registrado_por)
  values (
    v_expediente.tenant_id, p_expediente_id, 'sancion_impuesta', current_date,
    format('Sanción impuesta: %s', v_clase.nombre), v_actor
  );

  update public.gobierno_expedientes_convivencia
  set etapa = 'sancion_impuesta', updated_at = now()
  where id = p_expediente_id;

  return v_sancion;
end;
$$;

comment on function public.gobierno_imponer_sancion(uuid, text, uuid, numeric, uuid, date, date, uuid, uuid) is
  'GOB-6: única función que crea una sanción — aplica los 5 guards de la tutela (marco §2, spec '
  '§4.4) en un solo lugar auditable. Exige rol administrador (segregación confirmada).';
