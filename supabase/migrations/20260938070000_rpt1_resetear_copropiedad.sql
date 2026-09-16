-- ═══════════════════════════════════════════════════════════════════════
--  RPT-01 · fn_resetear_copropiedad cubre las tablas del Motor de Reportes
--
--  D-99/D-122/D-125/D-126 dejaron esta función con cobertura del 100 % de
--  las FKs a tenants. Un corte que crea tablas nuevas con tenant_id y no
--  las registra aquí abre ese agujero otra vez: resetear la copropiedad
--  dejaría el historial de ejecuciones de la vida anterior, colgando de
--  reportes que ya no significan nada.
--
--  Qué se borra y qué vuelve:
--    · reporte_ejecuciones — dato operativo puro, se va entero.
--    · reportes (y reporte_versiones por cascada) — se borran TODOS,
--      incluidos los del sistema, y acto seguido se vuelve a llamar a
--      fn_reportes_sistema_sembrar: la copropiedad queda con sus reportes
--      de fábrica recién publicados, exactamente como una recién creada.
--      Un reporte personalizado que el usuario hubiera construido se pierde
--      en el reset, igual que se pierde cualquier otro dato operativo — es
--      lo que un reset significa.
--
--  El cuerpo se toma de la definición vigente en base (D-126) y solo se le
--  añaden esas dos entradas al array y la llamada de resiembra, para no
--  reescribir de memoria una función de 120 líneas.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_resetear_copropiedad(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tablas text[] := array[
    -- RPT-01: el historial de ejecuciones es dato operativo y se va; los
    -- reportes se borran enteros y se vuelven a sembrar más abajo, para que
    -- la copropiedad quede con sus reportes de fábrica, como recién creada.
    'reporte_ejecuciones', 'reportes',
    'concepto_test_cases', 'fundamento_propuesta', 'cartera_corridas_diarias',
    'acciones_cobranza_acuses', 'costas_judiciales', 'caso_juridico_actuaciones',
    'documentos_legal_holds', 'prescripcion_actos_interruptivos', 'promesas_pago',
    'novedad_cuotas', 'pago_aplicaciones', 'conciliacion_propuesta',
    'extracto_bancario', 'acciones_cobranza',
    'mant_depreciacion_detalle', 'activo_estado_historial',
    'gobierno_atribucion',
    'inmueble_atributo_historico',
    'solicitud_actuaciones', 'solicitudes',
    'tercero_perfil', 'publicaciones',
    'vehiculo_paso', 'vehiculos',
    'anuncios', 'finanzas_flujo_corridas_diarias', 'gobierno_vencimiento_corridas',
    'notificaciones',
    'intenciones_pago', 'acuerdos_pago', 'cargos', 'liquidacion_lineas',
    'presupuesto_rubros', 'presupuestos',
    'estados_cuenta_generados',
    'posiciones_cartera_snapshot', 'eventos_cartera', 'cartera_etapas', 'coeficientes',
    'inmueble_transferencias',
    'tenant_tercero_rol', 'terceros_contacto_procedencia', 'auditoria_muestras',
    'auditoria_evidencias', 'auditoria_plan_items', 'auditoria_riesgo_residual_historial',
    'auditoria_normativa', 'auditoria_acciones', 'auditoria_ejecuciones',
    'auditoria_procedimientos', 'auditoria_hallazgos', 'auditoria_controles',
    'auditoria_planes', 'auditoria_riesgos', 'auditoria_engagements',
    'actor_externo_vinculo', 'inmueble_persona_rol',
    'atencion_tokens_consulta', 'conciliacion_bancaria', 'conciliacion_bancaria_partida',
    'contable_comprobante_detalle', 'contable_castigo_cartera', 'contable_correccion',
    'contable_comprobante', 'contable_deterioro_detalle', 'contable_politica_conservacion',
    'contable_rendicion_cuentas', 'contable_dictamen', 'contable_certificacion',
    'finanzas_facturas_proveedor', 'fondo_fuentes', 'fondo_remanentes', 'fondo_movimientos',
    'liquidaciones', 'finanzas_lotes_pago', 'extracto_linea',
    'fondo_autorizaciones', 'fondo_compromisos', 'fondo_solicitudes_uso', 'fuente_financiacion',
    'gobierno_acta_entregas', 'gobierno_acta_verificadores',
    'gobierno_asistencia', 'gobierno_compromiso_avances', 'gobierno_compromisos',
    'gobierno_convocatoria_envios', 'gobierno_convocatorias', 'gobierno_expediente_actuaciones',
    'gobierno_impugnacion_actuaciones', 'gobierno_impugnaciones', 'gobierno_expedientes_convivencia',
    'gobierno_infracciones', 'gobierno_parametro_impugnacion',
    'fundamento_normativo',
    'gobierno_poderes', 'gobierno_sanciones', 'novedades', 'gobierno_vencimiento_notificaciones',
    'acciones_cobranza_envios',
    'mant_contrato_activos', 'mant_contrato_clausulas', 'mant_escenario',
    'mant_garantia_reclamaciones', 'mant_garantias', 'mant_hallazgos',
    'mant_incidencias', 'mant_inspeccion_respuestas', 'mant_inventario_movimientos',
    'mant_almacenes', 'mant_ot_evidencias', 'mant_plan_activos', 'mant_programaciones',
    'mant_planes', 'mant_proveedor_habilitacion', 'mant_registros_acceso',
    'mant_autorizaciones_visita', 'mant_repuestos', 'mant_salud_snapshot',
    'mant_zona_reserva_regla', 'publicacion_interes', 'recibos_caja', 'tributario_iva_generado',
    'presupuesto_ejecucion', 'periodos',
    'mant_ordenes_trabajo', 'mant_contratos', 'mant_inspecciones', 'mant_cumplimiento',
    'activos',
    -- Bloque nuevo (20260935110000, D-125/D-126): ciclo de Gobierno (4
    -- tablas) + mant_reservas, ordenados por su grafo real de FK (ver
    -- cabecera). Con esto, D-122 (118 FKs) queda 100% cerrado.
    'mant_reservas', 'zonas_comunes',
    'gobierno_decisiones', 'gobierno_actas', 'gobierno_reuniones', 'coeficiente_sets',
    'gobierno_organos', 'gobierno_votaciones', 'gobierno_agenda_puntos', 'gobierno_miembros',
    'documentos', 'pagos', 'acuerdo_pago_cuotas',
    'casos_juridicos', 'certificaciones_deuda', 'inmuebles', 'terceros'
  ];
  v_tabla     text;
  v_borrados  int;
  v_resumen   jsonb := '{}'::jsonb;
  i           int;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para resetear una copropiedad';
  end if;

  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_NO_ENCONTRADO: no existe la copropiedad %', p_tenant_id;
  end if;

  if not public.has_role(p_tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol administrador en esta copropiedad';
  end if;

  perform set_config('aquila.reset_context', 'true', true);
  set constraints all deferred;

  -- fondos se preserva (config), pero no puede sobrevivir apuntando a un
  -- documento que este mismo reset va a borrar.
  update public.fondos set documento_principal_id = null where tenant_id = p_tenant_id;

  for i in 1 .. array_length(v_tablas, 1) loop
    v_tabla := v_tablas[i];
    execute format('delete from public.%I where tenant_id = $1', v_tabla) using p_tenant_id;
    get diagnostics v_borrados = row_count;
    v_resumen := v_resumen || jsonb_build_object(v_tabla, v_borrados);
  end loop;

  -- fondos es configuración (se preserva) pero su saldo se deriva de
  -- fondo_movimientos, que ya se borró arriba — sin este reset quedaría
  -- un saldo fantasma sin movimientos que lo respalden.
  update public.fondos set saldo_actual = 0 where tenant_id = p_tenant_id;

  -- Los reportes de fábrica vuelven, como en una copropiedad nueva (la
  -- siembra es idempotente, así que no duplica nada).
  perform public.fn_reportes_sistema_sembrar(p_tenant_id);

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    (select auth.uid()),
    'tenant.reseteado',
    'tenant',
    p_tenant_id,
    v_resumen
  );

  return v_resumen;
end;
$function$

;
