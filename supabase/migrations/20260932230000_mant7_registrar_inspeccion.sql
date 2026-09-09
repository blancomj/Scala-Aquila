-- ═══════════════════════════════════════════════════════════════════════
--  MANT-7 · Inspecciones, hallazgos y acciones correctivas (4/7)
--
--  fn_mant_registrar_inspeccion es el corte central: calcula el resultado
--  sugerido desde las respuestas, congela la versión del formato, genera
--  el cumplimiento (MANT-2) si el formato lo exige, genera un hallazgo por
--  cada respuesta no_conforme, y solo entonces inserta todo atómicamente
--  (mismo criterio que fn_mant_cerrar_ot para mant_cumplimiento).
--
--  p_respuestas: jsonb array de objetos
--    {item_id, valor, observacion?, evidencia_documento_id?, fecha_limite?}
--  fecha_limite viaja por respuesta (no se infiere ni se calcula aquí) —
--  el marco prohíbe inventar un plazo de subsanación sin verificación
--  normativa (MANT_07 §"fuera de alcance"); si la severidad del ítem es
--  crítico/mayor y no viene fecha_limite, el guard de mant_hallazgos
--  (20260932240000) rechaza la transacción completa con
--  HALLAZGO_SIN_FECHA_LIMITE — quien ejecuta la inspección debe digitarla.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_mant_registrar_inspeccion(
  p_tenant_id uuid,
  p_formato_id uuid,
  p_fecha date,
  p_respuestas jsonb,
  p_activo_id uuid default null,
  p_tercero_id uuid default null,
  p_acreditacion_referencia text default null,
  p_resultado_override public.cumplimiento_resultado_t default null,
  p_resultado_motivo text default null
)
returns public.mant_inspecciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_formato             public.mant_inspeccion_formatos;
  v_requisito           public.mant_requisito;
  v_resultado_sugerido  public.cumplimiento_resultado_t;
  v_resultado           public.cumplimiento_resultado_t;
  v_cumplimiento_id     uuid;
  v_inspeccion          public.mant_inspecciones;
  v_respuesta           jsonb;
  v_item                public.mant_inspeccion_formato_items;
  v_tiene_no_conforme   boolean := false;
  v_tiene_critico       boolean := false;
begin
  if (select auth.uid()) is not null
     and not public.has_role(p_tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: no tienes rol suficiente en este tenant';
  end if;

  select * into v_formato from public.mant_inspeccion_formatos where id = p_formato_id;
  if v_formato.id is null or v_formato.tenant_id <> p_tenant_id then
    raise exception 'INSPECCION_TENANT_INCONSISTENTE: el formato % no pertenece al tenant %',
      p_formato_id, p_tenant_id;
  end if;
  if v_formato.estado <> 'vigente' then
    raise exception 'INSPECCION_FORMATO_NO_VIGENTE: el formato % no está vigente (es %)',
      p_formato_id, v_formato.estado;
  end if;

  if p_activo_id is not null
     and not exists (select 1 from public.activos where id = p_activo_id and tenant_id = p_tenant_id) then
    raise exception 'INSPECCION_TENANT_INCONSISTENTE: el activo % no pertenece al tenant %',
      p_activo_id, p_tenant_id;
  end if;

  if p_tercero_id is not null
     and not exists (select 1 from public.terceros where id = p_tercero_id and tenant_id = p_tenant_id) then
    raise exception 'INSPECCION_TENANT_INCONSISTENTE: el tercero % no pertenece al tenant %',
      p_tercero_id, p_tenant_id;
  end if;

  -- ── Resultado sugerido: recorre las respuestas, valida cada ítem ──
  for v_respuesta in select * from jsonb_array_elements(p_respuestas)
  loop
    select * into v_item from public.mant_inspeccion_formato_items
      where id = (v_respuesta ->> 'item_id')::uuid;
    if v_item.id is null or v_item.formato_id <> p_formato_id then
      raise exception 'INSPECCION_TENANT_INCONSISTENTE: el ítem % no pertenece al formato %',
        v_respuesta ->> 'item_id', p_formato_id;
    end if;
    if (v_respuesta ->> 'valor') = 'no_conforme' then
      v_tiene_no_conforme := true;
      if v_item.severidad_si_no_conforme = 'critico' then
        v_tiene_critico := true;
      end if;
    end if;
  end loop;

  v_resultado_sugerido := case
    when v_tiene_critico then 'no_conforme'::public.cumplimiento_resultado_t
    when v_tiene_no_conforme then 'con_hallazgos'::public.cumplimiento_resultado_t
    else 'conforme'::public.cumplimiento_resultado_t
  end;

  v_resultado := coalesce(p_resultado_override, v_resultado_sugerido);
  if v_resultado is distinct from v_resultado_sugerido
     and (p_resultado_motivo is null or btrim(p_resultado_motivo) = '') then
    raise exception 'INSPECCION_RESULTADO_SOBRESCRITO_SIN_MOTIVO: resultado % difiere del sugerido'
      ' % — exige resultado_motivo', v_resultado, v_resultado_sugerido;
  end if;

  -- ── Cumplimiento (MANT-2), si el formato demuestra un requisito ──
  if v_formato.requisito_id is not null then
    select * into v_requisito from public.mant_requisito where id = v_formato.requisito_id;
    if v_requisito.requiere_tercero_acreditado
       and (p_tercero_id is null
            or p_acreditacion_referencia is null or btrim(p_acreditacion_referencia) = '') then
      raise exception 'INSPECCION_CUMPLIMIENTO_SIN_ACREDITACION: el requisito % exige tercero'
        ' acreditado y su referencia de acreditación', v_requisito.nombre;
    end if;

    insert into public.mant_cumplimiento (
      tenant_id, requisito_id, activo_id, fecha_cumplimiento,
      ejecutado_por_tercero_id, acreditacion_referencia, evidencia_referencia, resultado
    ) values (
      p_tenant_id, v_formato.requisito_id, p_activo_id, p_fecha,
      p_tercero_id, p_acreditacion_referencia,
      format('Inspección "%s" (%s)', v_formato.nombre, p_fecha), v_resultado
    ) returning id into v_cumplimiento_id;
  end if;

  -- ── Registro atómico: inspección + respuestas + hallazgos ──
  perform set_config('aquila.registrando_inspeccion', 'true', true);

  insert into public.mant_inspecciones (
    tenant_id, formato_id, formato_version, activo_id, fecha, tercero_id, acreditacion_referencia,
    resultado_sugerido, resultado, resultado_motivo, cumplimiento_id
  ) values (
    p_tenant_id, p_formato_id, v_formato.version, p_activo_id, p_fecha, p_tercero_id,
    p_acreditacion_referencia, v_resultado_sugerido, v_resultado, p_resultado_motivo, v_cumplimiento_id
  ) returning * into v_inspeccion;

  for v_respuesta in select * from jsonb_array_elements(p_respuestas)
  loop
    insert into public.mant_inspeccion_respuestas (
      tenant_id, inspeccion_id, item_id, valor, observacion, evidencia_documento_id
    ) values (
      p_tenant_id, v_inspeccion.id, (v_respuesta ->> 'item_id')::uuid,
      (v_respuesta ->> 'valor')::public.respuesta_valor_t,
      v_respuesta ->> 'observacion',
      nullif(v_respuesta ->> 'evidencia_documento_id', '')::uuid
    );

    if (v_respuesta ->> 'valor') = 'no_conforme' then
      select * into v_item from public.mant_inspeccion_formato_items
        where id = (v_respuesta ->> 'item_id')::uuid;

      insert into public.mant_hallazgos (
        tenant_id, inspeccion_id, descripcion, severidad, estado, fecha_limite
      ) values (
        p_tenant_id, v_inspeccion.id, v_item.texto, v_item.severidad_si_no_conforme, 'abierto',
        nullif(v_respuesta ->> 'fecha_limite', '')::date
      );
    end if;
  end loop;

  perform set_config('aquila.registrando_inspeccion', 'false', true);

  return v_inspeccion;
end;
$$;

comment on function public.fn_mant_registrar_inspeccion(
  uuid, uuid, date, jsonb, uuid, uuid, text, public.cumplimiento_resultado_t, text
) is
  'MANT-7: registro atómico de una inspección ejecutada. Calcula resultado_sugerido desde las '
  'respuestas (crítico no_conforme → no_conforme; cualquier otro no_conforme → con_hallazgos; '
  'todo conforme/no_aplica → conforme), congela formato_version, genera mant_cumplimiento si el '
  'formato tiene requisito_id, y un mant_hallazgos por cada respuesta no_conforme — todo o nada.';
