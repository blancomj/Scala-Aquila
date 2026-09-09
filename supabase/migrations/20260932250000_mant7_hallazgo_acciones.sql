-- ═══════════════════════════════════════════════════════════════════════
--  MANT-7 · Inspecciones, hallazgos y acciones correctivas (6/7)
--
--  Cada función hace la transición de mant_hallazgos.estado Y la entrada
--  de bitácora (mant_hallazgo_actuaciones) en la misma transacción — mismo
--  criterio que fn_mant_cerrar_ot: ningún cambio de estado queda sin su
--  rastro. Los guards reales (HALLAZGO_LEGAL_NO_ACEPTABLE,
--  HALLAZGO_ACEPTACION_SIN_JUSTIFICACION, HALLAZGO_CIERRE_SIN_EVIDENCIA)
--  viven en guard_mant_hallazgo_transicion (20260932240000) — estas
--  funciones no los repiten, solo orquestan el UPDATE + INSERT atómico.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_mant_asignar_ot_hallazgo(p_hallazgo_id uuid, p_ot_id uuid)
returns public.mant_hallazgos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hallazgo      public.mant_hallazgos;
  v_estado_previo public.hallazgo_estado_t;
begin
  select * into v_hallazgo from public.mant_hallazgos where id = p_hallazgo_id;
  if v_hallazgo.id is null then
    raise exception 'HALLAZGO_INEXISTENTE: %', p_hallazgo_id;
  end if;
  if (select auth.uid()) is not null
     and not public.has_role(v_hallazgo.tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: no tienes rol suficiente en este tenant';
  end if;
  if v_hallazgo.estado = 'cerrado' then
    raise exception 'HALLAZGO_TRANSICION_INVALIDA: % ya está cerrado', p_hallazgo_id;
  end if;

  v_estado_previo := v_hallazgo.estado;

  update public.mant_hallazgos set estado = 'en_tratamiento', ot_id = p_ot_id
    where id = p_hallazgo_id
    returning * into v_hallazgo;

  insert into public.mant_hallazgo_actuaciones (
    tenant_id, hallazgo_id, tipo_actuacion_id, descripcion, estado_desde, estado_hasta
  ) values (
    v_hallazgo.tenant_id, p_hallazgo_id,
    (select id from public.lista_tipos where tipo = 'TIPO_ACTUACION_HALLAZGO' and codigo = 'asignacion_ot' and tenant_id is null),
    format('Asignado a la OT %s', p_ot_id), v_estado_previo, 'en_tratamiento'
  );

  return v_hallazgo;
end;
$$;

comment on function public.fn_mant_asignar_ot_hallazgo(uuid, uuid) is
  'MANT-7: mueve el hallazgo a en_tratamiento enlazándolo a una OT — valida tenant de la OT en '
  'guard_mant_hallazgo_transicion (HALLAZGO_TENANT_INCONSISTENTE).';

create function public.fn_mant_aceptar_hallazgo(
  p_hallazgo_id uuid, p_motivo text, p_organo_id uuid default null
)
returns public.mant_hallazgos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hallazgo      public.mant_hallazgos;
  v_estado_previo public.hallazgo_estado_t;
begin
  select * into v_hallazgo from public.mant_hallazgos where id = p_hallazgo_id;
  if v_hallazgo.id is null then
    raise exception 'HALLAZGO_INEXISTENTE: %', p_hallazgo_id;
  end if;
  if (select auth.uid()) is not null
     and not public.has_role(v_hallazgo.tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: no tienes rol suficiente en este tenant';
  end if;
  if v_hallazgo.estado = 'cerrado' then
    raise exception 'HALLAZGO_TRANSICION_INVALIDA: % ya está cerrado', p_hallazgo_id;
  end if;

  v_estado_previo := v_hallazgo.estado;

  update public.mant_hallazgos
    set estado = 'aceptado', aceptado_motivo = p_motivo, aceptado_por = (select auth.uid()),
        organo_aprobador_id = p_organo_id
    where id = p_hallazgo_id
    returning * into v_hallazgo;

  insert into public.mant_hallazgo_actuaciones (
    tenant_id, hallazgo_id, tipo_actuacion_id, descripcion, estado_desde, estado_hasta
  ) values (
    v_hallazgo.tenant_id, p_hallazgo_id,
    (select id from public.lista_tipos where tipo = 'TIPO_ACTUACION_HALLAZGO' and codigo = 'aceptacion' and tenant_id is null),
    format('Aceptado sin tratamiento: %s', p_motivo), v_estado_previo, 'aceptado'
  );

  return v_hallazgo;
end;
$$;

comment on function public.fn_mant_aceptar_hallazgo(uuid, text, uuid) is
  'MANT-7: acepta un hallazgo sin tratamiento — guard_mant_hallazgo_transicion bloquea con '
  'HALLAZGO_LEGAL_NO_ACEPTABLE si es de origen legal, exige motivo '
  '(HALLAZGO_ACEPTACION_SIN_JUSTIFICACION) y, si es crítico y el tenant tiene GOB-1 vigente, '
  'exige p_organo_id.';

create function public.fn_mant_cerrar_hallazgo(
  p_hallazgo_id uuid, p_evidencia_documento_id uuid default null
)
returns public.mant_hallazgos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hallazgo      public.mant_hallazgos;
  v_estado_previo public.hallazgo_estado_t;
begin
  select * into v_hallazgo from public.mant_hallazgos where id = p_hallazgo_id;
  if v_hallazgo.id is null then
    raise exception 'HALLAZGO_INEXISTENTE: %', p_hallazgo_id;
  end if;
  if (select auth.uid()) is not null
     and not public.has_role(v_hallazgo.tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: no tienes rol suficiente en este tenant';
  end if;
  if v_hallazgo.estado = 'cerrado' then
    raise exception 'HALLAZGO_TRANSICION_INVALIDA: % ya está cerrado', p_hallazgo_id;
  end if;

  v_estado_previo := v_hallazgo.estado;

  update public.mant_hallazgos
    set estado = 'cerrado', cerrado_evidencia_documento_id = p_evidencia_documento_id
    where id = p_hallazgo_id
    returning * into v_hallazgo;

  insert into public.mant_hallazgo_actuaciones (
    tenant_id, hallazgo_id, tipo_actuacion_id, descripcion, estado_desde, estado_hasta
  ) values (
    v_hallazgo.tenant_id, p_hallazgo_id,
    (select id from public.lista_tipos where tipo = 'TIPO_ACTUACION_HALLAZGO' and codigo = 'cierre' and tenant_id is null),
    'Cierre verificado', v_estado_previo, 'cerrado'
  );

  return v_hallazgo;
end;
$$;

comment on function public.fn_mant_cerrar_hallazgo(uuid, uuid) is
  'MANT-7: cierra un hallazgo — guard_mant_hallazgo_transicion exige evidencia verificada '
  '(HALLAZGO_CIERRE_SIN_EVIDENCIA) si la severidad es crítico/mayor.';

-- ── Panel de control: hallazgos abiertos, por severidad y antigüedad ─────
create function public.mant_hallazgos_abiertos(p_tenant_id uuid)
returns table (
  hallazgo_id   uuid,
  descripcion   text,
  severidad     public.severidad_t,
  estado        public.hallazgo_estado_t,
  fecha_limite  date,
  vencido       boolean,
  dias_abierto  integer,
  inspeccion_id uuid,
  ot_id         uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    h.id, h.descripcion, h.severidad, h.estado, h.fecha_limite,
    (h.fecha_limite is not null and h.fecha_limite < current_date) as vencido,
    (current_date - h.created_at::date) as dias_abierto,
    h.inspeccion_id, h.ot_id
  from public.mant_hallazgos h
  where h.tenant_id = p_tenant_id and h.estado <> 'cerrado'
  order by
    case h.severidad when 'critico' then 1 when 'mayor' then 2 when 'menor' then 3 else 4 end,
    h.created_at asc
$$;

comment on function public.mant_hallazgos_abiertos(uuid) is
  'MANT-7: panel de control de hallazgos no cerrados — ordena por severidad (crítico primero) y '
  'antigüedad, marca vencido cuando fecha_limite ya pasó. Calculado en cada llamada, nunca '
  'almacenado — mismo criterio que mant_estado_cumplimiento (MANT-2).';
