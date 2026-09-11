-- ═══════════════════════════════════════════════════════════════════════
--  CO-9 · Hook en fn_contable_corregir_error (CO-6, 20260930590000):
--  corregir un ejercicio ya cerrado cambia sus cifras persistidas, así que
--  invalida cualquier certificación vigente de ese ejercicio (prueba 3).
--
--  fn_contable_reabrir_periodo (CO-6) NO es el punto de enganche correcto:
--  esa función bloquea explícitamente reabrir un periodo cuyo ejercicio ya
--  tiene comprobante CIERRE (CONTABLE_EJERCICIO_YA_CERRADO) — "reabrir y
--  corregir el ejercicio" solo es alcanzable, hoy, por la rama
--  v_periodo_origen.contable_estado = 'bloqueado' de fn_contable_corregir_
--  error (Grupo 3, CTCP 0146/2025). Verificado leyendo el cuerpo completo
--  de ambas funciones antes de escribir este hook — no se asumió por el
--  nombre.
--
--  Diff mínimo sobre la función completa (mismo criterio que D-56/D-57:
--  reescribir un guard grande entero arriesga perder algo ya corregido) —
--  se reproduce el cuerpo íntegro de la versión vigente (única forma de
--  hacer CREATE OR REPLACE) y se añade EXACTAMENTE una línea: la llamada a
--  fn_contable_invalidar_certificacion en la rama 'bloqueado'.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_contable_corregir_error(
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
    -- CO-9 §4.1 / prueba 3: las cifras del ejercicio certificado cambiaron —
    -- la certificación vigente de ese ejercicio deja de ser confiable.
    perform public.fn_contable_invalidar_certificacion(
      p_tenant_id, v_periodo_origen.anio,
      'Corrección de error post-cierre (' || p_tipo_correccion || '): ' || p_motivo
    );
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
  'CO-6 §3.6, extendida por CO-9 §4.1: enruta según el estado del periodo del origen y, si el '
  'ejercicio ya está cerrado, según tenant_marco_contable().marco_grupo. Grupo 3 con ejercicio '
  'cerrado además invalida (nunca borra) cualquier certificación vigente de ese ejercicio, vía '
  'fn_contable_invalidar_certificacion — las cifras certificadas ya no son las persistidas.';
