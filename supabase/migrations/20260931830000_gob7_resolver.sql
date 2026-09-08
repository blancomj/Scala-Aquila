-- ═══════════════════════════════════════════════════════════════════════
--  GOB-7 · gobierno_resolver_impugnacion — los cuatro efectos del §4.2
--  Ver GOB_07_impugnacion.md §4.2, pruebas 5, 6.
--
--  AQUILA no resuelve la impugnación (spec §2, §5) — esta función solo
--  REGISTRA lo que la instancia ya decidió y aplica su efecto mecánico
--  sobre el objeto. La reversión del cargo de multa (resultado=revocada)
--  usa el mismo mecanismo de ajuste que GOB-6 usó para materializar la
--  multa: novedades (tipo CREDIT, monto negativo, AD-30) + fn_aprobar_novedad
--  — nunca se borra el cargo original (append-only, 16 §68), coordina con
--  la parametrización contable de CO-3 vía el mismo concepto_id.
-- ═══════════════════════════════════════════════════════════════════════

create function public.gobierno_resolver_impugnacion(
  p_impugnacion_id uuid,
  p_resultado public.impugnacion_resultado_t,
  p_descripcion text,
  p_detalle text default null,
  p_resolucion_documento_id uuid default null,
  p_instancia text default null,
  p_actor_id uuid default null
)
returns public.gobierno_impugnaciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_impugnacion public.gobierno_impugnaciones;
  v_sancion     public.gobierno_sanciones;
  v_clase       public.gobierno_clase_sancion;
  v_novedad     public.novedades;
  v_reversion_id uuid;
  v_periodo_id  uuid;
  v_actor       uuid;
  v_nueva_etapa public.gobierno_expediente_etapa_t;
  v_nuevo_estado_decision public.gobierno_decision_estado_t;
begin
  select * into v_impugnacion from public.gobierno_impugnaciones where id = p_impugnacion_id;
  if not found then
    raise exception 'IMPUGNACION_INEXISTENTE: impugnación % no existe', p_impugnacion_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_impugnacion.tenant_id, array['administrador']::public.tenant_role_t[])
  then
    raise exception 'IMPUGNACION_TRANSICION_REQUIERE_ADMINISTRADOR: resolver una impugnación '
      'exige rol administrador';
  end if;

  if v_impugnacion.estado in ('resuelta', 'desistida') then
    raise exception 'IMPUGNACION_ESTADO_TERMINAL: la impugnación % ya está en % (terminal)',
      p_impugnacion_id, v_impugnacion.estado;
  end if;

  if p_resultado = 'modificada' and (p_detalle is null or btrim(p_detalle) = '') then
    raise exception 'IMPUGNACION_MODIFICADA_SIN_DETALLE: resultado modificada exige registrar en '
      'qué (p_detalle) — spec §4.2';
  end if;

  v_actor := coalesce((select auth.uid()), p_actor_id);

  if v_impugnacion.objeto_tipo = 'decision' then
    v_nuevo_estado_decision := case p_resultado
      when 'revocada' then 'anulada'::public.gobierno_decision_estado_t
      -- confirmada, modificada, inadmitida: la decisión sigue vigente (spec §4.2)
      else 'vigente'::public.gobierno_decision_estado_t
    end;

    update public.gobierno_decisiones set estado = v_nuevo_estado_decision
    where id = v_impugnacion.decision_id;
  else
    select * into v_sancion
    from public.gobierno_sanciones
    where expediente_id = v_impugnacion.expediente_id
    order by impuesta_at desc
    limit 1;

    v_nueva_etapa := case p_resultado
      when 'confirmada' then 'firme'::public.gobierno_expediente_etapa_t
      when 'revocada'   then 'firme'::public.gobierno_expediente_etapa_t
      -- modificada, inadmitida: vuelve al estado anterior (spec §4.2)
      else 'sancion_impuesta'::public.gobierno_expediente_etapa_t
    end;

    update public.gobierno_expedientes_convivencia
    set etapa = v_nueva_etapa, updated_at = now()
    where id = v_impugnacion.expediente_id;

    if p_resultado = 'revocada' and v_sancion.id is not null then
      update public.gobierno_sanciones set vigente_hasta = current_date where id = v_sancion.id;

      select * into v_clase from public.gobierno_clase_sancion where id = v_sancion.clase_sancion_id;

      if v_clase.codigo = 'multa' and v_sancion.novedad_id is not null then
        select * into v_novedad from public.novedades where id = v_sancion.novedad_id;

        select id into v_periodo_id
        from public.periodos
        where tenant_id = v_novedad.tenant_id
          and anio = extract(year from current_date)::int
          and mes = extract(month from current_date)::int;

        if v_periodo_id is null then
          raise exception 'IMPUGNACION_PERIODO_INEXISTENTE: no existe periodo %-% para el tenant '
            '% — no se puede registrar la reversión del cargo de multa', extract(year from current_date),
            extract(month from current_date), v_novedad.tenant_id;
        end if;

        insert into public.novedades (
          tenant_id, inmueble_id, concepto_id, tipo, monto, descripcion, fecha_efectiva, created_by
        ) values (
          v_novedad.tenant_id, v_novedad.inmueble_id, v_novedad.concepto_id, 'CREDIT',
          -v_novedad.monto, format('Reversión multa — impugnación %s/%s revocada', v_impugnacion.numero,
          v_impugnacion.anio), current_date, v_actor
        )
        returning id into v_reversion_id;

        perform public.fn_aprobar_novedad(v_reversion_id, v_actor);
      end if;
    end if;
  end if;

  insert into public.gobierno_impugnacion_actuaciones (
    tenant_id, impugnacion_id, estado, fecha, descripcion
  ) values (
    v_impugnacion.tenant_id, p_impugnacion_id, 'resuelta', current_date, p_descripcion
  );

  update public.gobierno_impugnaciones
  set estado = 'resuelta', resultado = p_resultado, resultado_detalle = p_detalle,
      resuelta_at = now(), resolucion_documento_id = p_resolucion_documento_id,
      instancia = coalesce(p_instancia, instancia), updated_at = now()
  where id = p_impugnacion_id
  returning * into v_impugnacion;

  return v_impugnacion;
end;
$$;

comment on function public.gobierno_resolver_impugnacion(
  uuid, public.impugnacion_resultado_t, text, text, uuid, text, uuid
) is
  'GOB-7: registra la resolución YA TOMADA por el juez/órgano competente (AQUILA no resuelve, '
  'spec §2/§5) y aplica su efecto mecánico (spec §4.2): decisión confirmada/modificada/'
  'inadmitida→vigente, revocada→anulada; expediente confirmada/revocada→firme (revocada además '
  'marca la sanción sin efecto y, si fue multa, reversa el cargo vía novedades CREDIT — nunca '
  'borra el cargo original), modificada/inadmitida→vuelve a sancion_impuesta. Exige rol '
  'administrador (segregación confirmada).';
