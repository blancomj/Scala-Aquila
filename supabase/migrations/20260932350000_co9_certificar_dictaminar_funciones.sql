-- ═══════════════════════════════════════════════════════════════════════
--  CO-9 · fn_contable_certificar_estados / fn_contable_invalidar_certificacion /
--  fn_contable_registrar_dictamen (CO_09_gobierno_y_asamblea.md §4.1/§4.2)
--
--  El hash se calcula sobre contable_estado_financiero() de CO-5
--  (20260930470000), con p_comparativo := false: si se incluyera el
--  comparativo, el hash de un ejercicio ya certificado cambiaría cuando se
--  abra el ejercicio SIGUIENTE (valor_anterior cambiaría de fuente) sin que
--  las cifras propias de este ejercicio se hayan tocado — rompería la
--  prueba 2 (hash estable si las cifras no cambian).
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_contable_certificar_estados(
  p_tenant_id              uuid,
  p_ejercicio              int,
  p_fecha_corte            date,
  p_estados_incluidos      text[],
  p_administrador_documento text,
  p_texto_certificacion    text,
  p_contador_tercero_id    uuid default null,
  p_contador_tarjeta_profesional text default null
)
returns public.contable_certificacion
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bloqueados     int;
  v_total_periodos int;
  v_existente      uuid;
  v_contenido      jsonb;
  v_hash           text;
  v_administrador  record;
  v_contador_nombre text;
  v_row            public.contable_certificacion;
begin
  if not public.has_role(p_tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol administrador para certificar estados financieros';
  end if;

  if p_estados_incluidos is null or array_length(p_estados_incluidos, 1) is null then
    raise exception 'CERTIFICACION_SIN_ESTADOS: debe incluir al menos un estado financiero';
  end if;

  if coalesce(btrim(p_texto_certificacion), '') = '' then
    raise exception 'CERTIFICACION_SIN_TEXTO: el texto de certificación no puede estar vacío';
  end if;

  select count(*) filter (where contable_estado = 'bloqueado'), count(*)
    into v_bloqueados, v_total_periodos
  from public.periodos
  where tenant_id = p_tenant_id and anio = p_ejercicio;

  if v_total_periodos = 0 or v_bloqueados < v_total_periodos then
    raise exception 'CERTIFICACION_EJERCICIO_ABIERTO: el ejercicio % no está cerrado (% de % '
      'periodos bloqueados) — cierre el ejercicio (CO-6) antes de certificar',
      p_ejercicio, coalesce(v_bloqueados, 0), v_total_periodos;
  end if;

  select id into v_existente
  from public.contable_certificacion
  where tenant_id = p_tenant_id and ejercicio = p_ejercicio and not invalidada;
  if v_existente is not null then
    raise exception 'CERTIFICACION_YA_VIGENTE: ya existe una certificación vigente (%) para el '
      'ejercicio % — invalídela (fn_contable_invalidar_certificacion) antes de certificar de '
      'nuevo', v_existente, p_ejercicio;
  end if;

  select jsonb_object_agg(codigos.codigo, codigos.filas order by codigos.codigo) into v_contenido
  from (
    select
      ce.codigo,
      (
        select jsonb_agg(to_jsonb(t) order by t.orden)
        from public.contable_estado_financiero(p_tenant_id, ce.codigo, p_fecha_corte, false) as t
      ) as filas
    from unnest(p_estados_incluidos) as ce (codigo)
  ) as codigos;

  v_hash := encode(extensions.digest(coalesce(v_contenido, '{}'::jsonb)::text, 'sha256'), 'hex');

  select full_name into v_administrador from public.profiles where id = (select auth.uid());

  if p_contador_tercero_id is not null then
    select nombre_completo into v_contador_nombre
    from public.terceros where id = p_contador_tercero_id and tenant_id = p_tenant_id;
    if v_contador_nombre is null then
      raise exception 'CERTIFICACION_CONTADOR_INVALIDO: el tercero % no pertenece a este tenant',
        p_contador_tercero_id;
    end if;
  end if;

  insert into public.contable_certificacion (
    tenant_id, ejercicio, fecha_corte, estados_incluidos, hash_contenido,
    certificado_por, administrador_nombre, administrador_documento,
    contador_tercero_id, contador_nombre, contador_tarjeta_profesional,
    texto_certificacion
  ) values (
    p_tenant_id, p_ejercicio, p_fecha_corte, p_estados_incluidos, v_hash,
    (select auth.uid()), coalesce(v_administrador.full_name, ''), p_administrador_documento,
    p_contador_tercero_id, v_contador_nombre, p_contador_tarjeta_profesional,
    p_texto_certificacion
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.fn_contable_certificar_estados(
  uuid, int, date, text[], text, text, uuid, text
) is
  'CO-9 §4.1: certifica un ejercicio cerrado. CERTIFICACION_EJERCICIO_ABIERTO si algún periodo del '
  'ejercicio no está bloqueado; CERTIFICACION_YA_VIGENTE si ya hay una certificación vigente '
  '(impide certificaciones zombis, criterio de aceptación §8). hash_contenido = sha256 de las '
  'cifras de estados_incluidos (contable_estado_financiero, sin comparativo) — nunca del binario '
  'del PDF. administrador_nombre/documento y contador_nombre/tarjeta_profesional quedan '
  'congelados: cambiar el tercero después no altera esta fila (prueba 4).';

-- ── invalidación (llamada aquí directo y, más adelante, desde el hook de
--    corrección de errores post-cierre, 20260932370000) ────────────────
create function public.fn_contable_invalidar_certificacion(
  p_tenant_id uuid, p_ejercicio int, p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o superior para invalidar una certificación';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'CERTIFICACION_INVALIDACION_SIN_MOTIVO: invalidar la certificación del '
      'ejercicio % exige motivo', p_ejercicio;
  end if;

  update public.contable_certificacion
  set invalidada = true, invalidada_motivo = p_motivo, invalidada_at = now()
  where tenant_id = p_tenant_id and ejercicio = p_ejercicio and not invalidada;
end;
$$;

comment on function public.fn_contable_invalidar_certificacion(uuid, int, text) is
  'CO-9 §4.1: marca como invalidada la certificación vigente de un ejercicio (nunca se borra, '
  'prueba 3). No falla si no había ninguna vigente (idempotente) — la llama tanto un usuario '
  'directo como fn_contable_corregir_error cuando corrige un ejercicio ya certificado.';

-- ── dictamen del revisor fiscal (§4.2) ───────────────────────────────────
create function public.fn_contable_registrar_dictamen(
  p_tenant_id              uuid,
  p_certificacion_id       uuid,
  p_revisor_fiscal_tercero_id uuid,
  p_tipo_opinion_codigo    text,
  p_texto                  text,
  p_fecha                  date
)
returns public.contable_dictamen
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_certificacion public.contable_certificacion;
  v_tiene_rol     boolean;
  v_tipo_opinion  bigint;
  v_row           public.contable_dictamen;
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o superior para registrar un dictamen';
  end if;

  select * into v_certificacion
  from public.contable_certificacion
  where id = p_certificacion_id and tenant_id = p_tenant_id;
  if v_certificacion.id is null then
    raise exception 'CERTIFICACION_INEXISTENTE: % no existe para este tenant', p_certificacion_id;
  end if;
  if v_certificacion.invalidada then
    raise exception 'CERTIFICACION_INVALIDADA: la certificación % ya fue invalidada — no admite '
      'un dictamen nuevo', p_certificacion_id;
  end if;

  select exists (
    select 1 from public.tenant_tercero_rol ttr
    join public.lista_tipos lt on lt.id = ttr.rol_id
    where ttr.tenant_id = p_tenant_id and ttr.tercero_id = p_revisor_fiscal_tercero_id
      and lt.tipo = 'ROL_FUNCIONAL' and lt.codigo = 'revisor_fiscal'
      and ttr.vigente_desde <= p_fecha
      and (ttr.vigente_hasta is null or ttr.vigente_hasta >= p_fecha)
  ) into v_tiene_rol;
  if not v_tiene_rol then
    raise exception 'DICTAMEN_TERCERO_SIN_ROL_REVISOR_FISCAL: el tercero % no tiene el rol '
      'revisor_fiscal en este tenant', p_revisor_fiscal_tercero_id;
  end if;

  select id into v_tipo_opinion
  from public.lista_tipos where tipo = 'TIPO_OPINION_DICTAMEN' and codigo = p_tipo_opinion_codigo;
  if v_tipo_opinion is null then
    raise exception 'DICTAMEN_TIPO_OPINION_INVALIDO: % no es un tipo de opinión válido',
      p_tipo_opinion_codigo;
  end if;

  insert into public.contable_dictamen (
    tenant_id, certificacion_id, revisor_fiscal_tercero_id, tipo_opinion_id, texto, fecha,
    registrado_por
  ) values (
    p_tenant_id, p_certificacion_id, p_revisor_fiscal_tercero_id, v_tipo_opinion, p_texto,
    p_fecha, (select auth.uid())
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.fn_contable_registrar_dictamen(uuid, uuid, uuid, text, text, date) is
  'CO-9 §4.2: registra el dictamen del revisor fiscal sobre una certificación vigente. '
  'DICTAMEN_TERCERO_SIN_ROL_REVISOR_FISCAL si el tercero no tiene ese rol funcional (MANT-5/'
  'tenant_tercero_rol); CERTIFICACION_INVALIDADA si la certificación ya fue invalidada.';
