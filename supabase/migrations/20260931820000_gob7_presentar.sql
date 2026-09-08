-- ═══════════════════════════════════════════════════════════════════════
--  GOB-7 · gobierno_presentar_impugnacion + gobierno_registrar_actuacion_impugnacion
--  Ver GOB_07_impugnacion.md §4.1, §4.3, §4.4, pruebas 1-4, 7-9, 11.
--
--  Segregación de funciones (Plan del corte, mismo criterio que GOB-5/GOB-6):
--  presentar y registrar actuaciones exige rol auxiliar (formalización
--  administrativa, análoga a reportar un expediente o crear una decisión);
--  resolver (migración siguiente) exige administrador, porque tiene efecto
--  jurídico real sobre el objeto impugnado.
-- ═══════════════════════════════════════════════════════════════════════

create function public.gobierno_presentar_impugnacion(
  p_objeto_tipo public.impugnacion_objeto_t,
  p_impugnante_ref uuid,
  p_fecha_notificacion_objeto date,
  p_fecha_presentacion date,
  p_causal text,
  p_decision_id uuid default null,
  p_expediente_id uuid default null,
  p_calidad text default null,
  p_fundamento text default null,
  p_documento_id uuid default null,
  p_suspende_efectos boolean default false,
  p_suspension_fundamento text default null,
  p_actor_id uuid default null
)
returns public.gobierno_impugnaciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id     uuid;
  v_decision      public.gobierno_decisiones;
  v_expediente    public.gobierno_expedientes_convivencia;
  v_parametro     public.gobierno_parametro_impugnacion;
  v_plazo_limite  date;
  v_en_plazo      boolean;
  v_numero        integer;
  v_anio          smallint;
  v_actor         uuid;
  v_impugnacion   public.gobierno_impugnaciones;
begin
  v_actor := coalesce((select auth.uid()), p_actor_id);

  if p_objeto_tipo = 'decision' then
    select * into v_decision from public.gobierno_decisiones where id = p_decision_id;
    if not found then
      raise exception 'IMPUGNACION_OBJETO_INEXISTENTE: decision_id % no existe', p_decision_id;
    end if;
    v_tenant_id := v_decision.tenant_id;

    if v_decision.estado <> 'vigente' then
      raise exception 'IMPUGNACION_OBJETO_NO_IMPUGNABLE: la decisión % no está vigente (estado=%)'
        ', no se puede impugnar', p_decision_id, v_decision.estado;
    end if;
  else
    select * into v_expediente from public.gobierno_expedientes_convivencia where id = p_expediente_id;
    if not found then
      raise exception 'IMPUGNACION_OBJETO_INEXISTENTE: expediente_id % no existe', p_expediente_id;
    end if;
    v_tenant_id := v_expediente.tenant_id;

    if v_expediente.etapa <> 'sancion_impuesta' then
      raise exception 'IMPUGNACION_OBJETO_NO_IMPUGNABLE: el expediente % no tiene una sanción '
        'impuesta vigente (etapa=%), no se puede impugnar', p_expediente_id, v_expediente.etapa;
    end if;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_tenant_id, array['auxiliar']::public.tenant_role_t[])
  then
    raise exception 'IMPUGNACION_TRANSICION_REQUIERE_AUXILIAR: presentar una impugnación exige '
      'rol auxiliar';
  end if;

  if p_suspende_efectos and (p_suspension_fundamento is null or btrim(p_suspension_fundamento) = '') then
    raise exception 'IMPUGNACION_SUSPENSION_SIN_FUNDAMENTO: suspender los efectos exige '
      'justificarlo — la impugnación no suspende automáticamente (spec §4.2)';
  end if;

  select * into v_parametro
  from public.gobierno_parametro_impugnacion
  where tenant_id = v_tenant_id and objeto_tipo = p_objeto_tipo;

  if not found then
    raise exception 'IMPUGNACION_PLAZO_NO_CONFIGURADO: el tenant % no ha configurado el plazo de '
      'impugnación para % (gobierno_parametro_impugnacion) — no se infiere', v_tenant_id, p_objeto_tipo;
  end if;

  v_plazo_limite := public.gobierno_sumar_dias_habiles(p_fecha_notificacion_objeto, v_parametro.plazo_dias);
  v_en_plazo := p_fecha_presentacion <= v_plazo_limite;

  v_anio := extract(year from p_fecha_presentacion)::smallint;
  v_numero := public.fn_gobierno_siguiente_numero_impugnacion(v_tenant_id, v_anio);

  insert into public.gobierno_impugnaciones (
    tenant_id, numero, anio, objeto_tipo, decision_id, expediente_id, impugnante_ref, calidad,
    presentada_por, fecha_notificacion_objeto, fecha_presentacion, plazo_limite,
    plazo_fundamento_valido, presentada_en_plazo, causal, fundamento, documento_id,
    suspende_efectos, suspension_fundamento
  ) values (
    v_tenant_id, v_numero, v_anio, p_objeto_tipo, p_decision_id, p_expediente_id, p_impugnante_ref,
    p_calidad, v_actor, p_fecha_notificacion_objeto, p_fecha_presentacion, v_plazo_limite,
    v_parametro.fundamento_normativo_id is not null, v_en_plazo, p_causal, p_fundamento,
    p_documento_id, p_suspende_efectos, p_suspension_fundamento
  )
  returning * into v_impugnacion;

  if p_objeto_tipo = 'decision' then
    update public.gobierno_decisiones set estado = 'impugnada' where id = p_decision_id;
  else
    update public.gobierno_expedientes_convivencia
    set etapa = 'impugnacion', updated_at = now()
    where id = p_expediente_id;
  end if;

  return v_impugnacion;
end;
$$;

comment on function public.gobierno_presentar_impugnacion(
  public.impugnacion_objeto_t, uuid, date, date, text, uuid, uuid, text, text, uuid, boolean, text, uuid
) is
  'GOB-7: única función que crea una impugnación — calcula plazo_limite en días hábiles '
  '(gobierno_sumar_dias_habiles, GOB-4) sobre el parámetro configurado por el tenant, nunca '
  'bloquea por vencimiento ni por falta de fundamento (spec §3), y marca el objeto impugnado '
  '(decisión→impugnada, expediente→etapa impugnacion). Exige rol auxiliar (segregación '
  'confirmada).';

-- ── gobierno_registrar_actuacion_impugnacion: en_tramite / desistida ────────
-- Mismo patrón que gobierno_registrar_actuacion de GOB-6: el log ES el mecanismo de avance,
-- reservando 'presentada' (la crea gobierno_presentar_impugnacion) y 'resuelta' (la crea
-- gobierno_resolver_impugnacion, con sus efectos sobre el objeto).
create function public.gobierno_registrar_actuacion_impugnacion(
  p_impugnacion_id uuid,
  p_estado public.impugnacion_estado_t,
  p_fecha date,
  p_descripcion text,
  p_instancia text default null,
  p_documento_id uuid default null
)
returns public.gobierno_impugnacion_actuaciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_impugnacion public.gobierno_impugnaciones;
  v_actuacion   public.gobierno_impugnacion_actuaciones;
begin
  select * into v_impugnacion from public.gobierno_impugnaciones where id = p_impugnacion_id;
  if not found then
    raise exception 'IMPUGNACION_INEXISTENTE: impugnación % no existe', p_impugnacion_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_impugnacion.tenant_id, array['auxiliar']::public.tenant_role_t[])
  then
    raise exception 'IMPUGNACION_TRANSICION_REQUIERE_AUXILIAR: registrar una actuación exige rol '
      'auxiliar';
  end if;

  if v_impugnacion.estado in ('resuelta', 'desistida') then
    raise exception 'IMPUGNACION_ESTADO_TERMINAL: la impugnación % ya está en % (terminal)',
      p_impugnacion_id, v_impugnacion.estado;
  end if;

  if p_estado in ('presentada', 'resuelta') then
    raise exception 'IMPUGNACION_ESTADO_RESERVADO: el estado % no se registra con esta función '
      '— presentada se crea al presentar la impugnación, resuelta exige '
      'gobierno_resolver_impugnacion()', p_estado;
  end if;

  insert into public.gobierno_impugnacion_actuaciones (
    tenant_id, impugnacion_id, estado, fecha, descripcion, documento_id
  ) values (
    v_impugnacion.tenant_id, p_impugnacion_id, p_estado, p_fecha, p_descripcion, p_documento_id
  )
  returning * into v_actuacion;

  update public.gobierno_impugnaciones
  set estado = p_estado, instancia = coalesce(p_instancia, instancia), updated_at = now()
  where id = p_impugnacion_id;

  return v_actuacion;
end;
$$;

comment on function public.gobierno_registrar_actuacion_impugnacion(
  uuid, public.impugnacion_estado_t, date, text, text, uuid
) is
  'GOB-7: registra un hito de la impugnación (en_tramite/desistida) y avanza '
  'gobierno_impugnaciones.estado al mismo valor — reserva presentada/resuelta a sus propias '
  'funciones (mismo criterio que gobierno_registrar_actuacion de GOB-6).';
