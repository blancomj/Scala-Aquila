-- ═══════════════════════════════════════════════════════════════════════
--  CO-6 · Corrección de errores de periodos cerrados — fn_contable_corregir_error
--  (CO_06_cierre_apertura_correccion.md §3.6)
--
--  Firma ampliada frente a la mención en prosa del corte (comprobante_origen, periodo_destino,
--  motivo, tipo_correccion): se añade p_comprobante_correcto_id. El contenido correcto de un
--  asiento (qué cuentas, qué valores) es un juicio contable que ningún dato existente permite
--  derivar del asiento erróneo — inventar esa fórmula violaría MARCO §9.2 ("no inventes...
--  fórmulas"). El flujo real es: el usuario captura el comprobante correcto por la vía normal
--  (borrador, misma pantalla de captura manual que hoy usa AJUSTE/RECLASIFICACION) en el periodo
--  destino, y ESTA función decide la ruta, ejecuta la reversión si aplica, lo contabiliza y dej
--  la traza — nunca inventa sus líneas.
--
--  Ruta según §3.6 (consulta tenant_marco_contable, no una regla única):
--   • periodo del origen ABIERTO → no aplica esta ruta (COMPROBANTE_ESTADO_INVALIDO ya cubre
--     "anúlelo y rehágalo", CO-2) → CONTABLE_CORRECCION_PERIODO_ABIERTO.
--   • periodo CERRADO, ejercicio (año) NO cerrado (ningún periodo de ese año en 'bloqueado' —
--     en la práctica: el propio periodo del origen no está 'bloqueado') → reversión
--     (fn_reversar_comprobante, con la traza de corrección) + contabilizar el comprobante
--     correcto ya preparado.
--   • ejercicio cerrado (periodo del origen 'bloqueado'): según grupo (tenant_marco_contable) —
--     Grupo 3 (CTCP 0146/2025, ya validado): corrige en el periodo corriente, SIN reversar el
--     original (comprobante_reversion_id queda NULL) — el original permanece intacto y auditable.
--     Grupo 2 (o sin clasificar): NO IMPLEMENTADO — CONTABLE_CORRECCION_GRUPO_NO_RESUELTO, nada
--     se modifica (la doctrina de reexpresión de comparativos no está validada de fuente
--     primaria — pregunta abierta para el contador, ver CO_06_INFORME.md).
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_contable_corregir_error(
  p_tenant_id uuid,
  p_comprobante_origen_id uuid,
  p_comprobante_correcto_id uuid,
  p_periodo_destino uuid,
  p_motivo text,
  p_tipo_correccion text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origen         public.contable_comprobante%rowtype;
  v_periodo_origen public.periodos%rowtype;
  v_correcto       public.contable_comprobante%rowtype;
  v_marco          record;
  v_reversion_id   uuid;
  v_correccion_id  uuid;
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador para corregir un error';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'COMPROBANTE_MOTIVO_REQUERIDO: corregir % exige motivo', p_comprobante_origen_id;
  end if;

  select * into v_origen from public.contable_comprobante
  where id = p_comprobante_origen_id and tenant_id = p_tenant_id;
  if v_origen.id is null or v_origen.estado <> 'contabilizado' then
    raise exception 'COMPROBANTE_ESTADO_INVALIDO: % no existe o no está contabilizado',
      p_comprobante_origen_id;
  end if;

  select * into v_correcto from public.contable_comprobante
  where id = p_comprobante_correcto_id and tenant_id = p_tenant_id;
  if v_correcto.id is null or v_correcto.estado <> 'borrador' then
    raise exception 'COMPROBANTE_ESTADO_INVALIDO: % no existe o no está en borrador (comprobante '
      'correcto)', p_comprobante_correcto_id;
  end if;
  if v_correcto.periodo_id <> p_periodo_destino then
    raise exception 'COMPROBANTE_ESTADO_INVALIDO: el comprobante correcto % no pertenece al '
      'periodo destino %', p_comprobante_correcto_id, p_periodo_destino;
  end if;

  select * into v_periodo_origen from public.periodos where id = v_origen.periodo_id;

  if v_periodo_origen.contable_estado = 'abierto' then
    raise exception 'CONTABLE_CORRECCION_PERIODO_ABIERTO: el periodo del comprobante % está '
      'abierto — anúlelo y rehágalo (CO-2), esta ruta no aplica', p_comprobante_origen_id;
  end if;

  if v_periodo_origen.contable_estado = 'cerrado' then
    -- Periodo cerrado, ejercicio todavía abierto: reversión + comprobante correcto.
    v_reversion_id := public.fn_reversar_comprobante(p_comprobante_origen_id, p_periodo_destino, p_motivo);
    perform public.fn_contabilizar_comprobante(p_comprobante_correcto_id);
  else
    -- 'bloqueado': el ejercicio ya está cerrado. La regla depende del grupo (§3.6).
    select * into v_marco from public.tenant_marco_contable(p_tenant_id);
    if v_marco.marco_grupo is distinct from 'grupo_3' then
      raise exception 'CONTABLE_CORRECCION_GRUPO_NO_RESUELTO: el ejercicio % ya está cerrado y '
        'el grupo (%) no tiene doctrina de corrección validada en este corte — consulte al '
        'contador', v_periodo_origen.anio, coalesce(v_marco.marco_grupo, 'sin clasificar');
    end if;
    -- Grupo 3, CTCP 0146/2025: corrige en el periodo corriente, sin reversar el original.
    v_reversion_id := null;
    perform public.fn_contabilizar_comprobante(p_comprobante_correcto_id);
  end if;

  insert into public.contable_correccion (
    tenant_id, comprobante_origen_id, comprobante_reversion_id, comprobante_correcto_id,
    motivo, tipo_correccion, creado_por
  ) values (
    p_tenant_id, p_comprobante_origen_id, v_reversion_id, p_comprobante_correcto_id,
    p_motivo, p_tipo_correccion, (select auth.uid())
  )
  returning id into v_correccion_id;

  return v_correccion_id;
end;
$$;

comment on function public.fn_contable_corregir_error(uuid, uuid, uuid, uuid, text, text) is
  'CO-6 §3.6: enruta según el estado del periodo del origen y, si el ejercicio ya está cerrado, '
  'según tenant_marco_contable().marco_grupo. comprobante_reversion_id en contable_correccion es '
  'NULL exactamente cuando la ruta fue Grupo 3 con ejercicio cerrado (sin reversar el original); '
  'poblado en la ruta de periodo cerrado con ejercicio abierto (reversión real vía '
  'fn_reversar_comprobante). p_comprobante_correcto_id es un comprobante en borrador ya '
  'preparado por el usuario (captura manual normal) — esta función nunca inventa su contenido.';
