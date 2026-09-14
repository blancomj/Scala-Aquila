-- ═══════════════════════════════════════════════════════════════════════
--  fn_resetear_copropiedad (20260928120000) quedó desactualizada frente a
--  ~170 tablas con tenant_id creadas después (contabilidad, gobierno,
--  mantenimiento, finanzas, fondos, movilidad, solicitudes externas):
--  cualquier tenant con datos en esos módulos hacía fallar el reset con
--  una violación de FK (verificado en vivo: "contable_comprobante_
--  periodo_id_fkey" al intentar borrar periodos con un comprobante
--  contable todavía apuntándolo).
--
--  Esta migración agrega las 19 tablas que un tenant real puede tener
--  pobladas y que son operativas (hechos ocurridos, no configuración):
--  activos y su historial/depreciación, comprobantes contables, órganos
--  de gobierno y su atribución, corridas de vencimiento, atributos
--  históricos de inmueble, notificaciones, publicaciones, solicitudes
--  externas, anuncios, perfiles de tercero, vehículos y sus pasos, y
--  zonas comunes — con el mismo criterio que ya aplicaba la función a
--  inmuebles/terceros (dato operativo de una copropiedad "recién
--  creada", no configuración reutilizable).
--
--  NO es la cobertura completa de las ~170 tablas nuevas. El resto
--  (contable_cuenta, políticas, plantillas, consecutivos, planes de
--  mantenimiento, catálogos) es deliberadamente config y se preserva,
--  siguiendo el mismo criterio que la función ya usaba con `fondos`
--  (se conserva, solo se reinicia su saldo). Ampliar más allá de estas
--  19 requiere resolver un grafo de FK mucho más denso — varias de esas
--  tablas de config referencian datos operativos que si se borraran
--  dejarían la config con punteros colgantes — y no se acomete aquí.
--
--  Orden: se insertó el bloque nuevo justo antes de `documentos`,
--  ordenado internamente por sus propias dependencias reales (ej.
--  contable_comprobante_detalle antes que contable_comprobante antes
--  que periodos; activos antes que zonas_comunes antes que inmuebles).
--  Verificado con `pnpm exec` contra dos tenants reales con datos
--  poblados en estos módulos.
--
--  fondos.documento_principal_id (nullable) se limpia antes de borrar
--  documentos — mismo motivo que fondos.saldo_actual ya se reiniciaba:
--  fondos se preserva, pero no puede quedar apuntando a un documento
--  que ya no existe.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_resetear_copropiedad(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tablas text[] := array[
    'concepto_test_cases', 'fundamento_propuesta', 'cartera_corridas_diarias',
    'acciones_cobranza_acuses', 'costas_judiciales', 'caso_juridico_actuaciones',
    'documentos_legal_holds', 'prescripcion_actos_interruptivos', 'promesas_pago',
    'novedad_cuotas', 'novedades', 'pago_aplicaciones', 'conciliacion_propuesta',
    'extracto_linea', 'extracto_bancario', 'acciones_cobranza_envios', 'acciones_cobranza',
    -- Bloque nuevo (20260934070000), insertado antes de 'documentos' porque
    -- varias de estas tablas lo referencian; ordenado internamente por sus
    -- propias dependencias (ver cabecera).
    'mant_depreciacion_detalle', 'contable_comprobante_detalle', 'contable_comprobante',
    'activo_estado_historial', 'activos', 'zonas_comunes',
    'gobierno_atribucion', 'gobierno_organos',
    'inmueble_atributo_historico',
    'solicitud_actuaciones', 'solicitudes',
    'tercero_perfil', 'publicaciones',
    'vehiculo_paso', 'vehiculos',
    'anuncios', 'finanzas_flujo_corridas_diarias', 'gobierno_vencimiento_corridas',
    'notificaciones',
    'documentos', 'intenciones_pago', 'pagos', 'acuerdo_pago_cuotas', 'acuerdos_pago',
    'cargos', 'liquidacion_lineas', 'liquidaciones', 'presupuesto_ejecucion',
    'presupuesto_rubros', 'presupuestos', 'fondo_movimientos', 'periodos',
    'certificaciones_deuda', 'casos_juridicos', 'estados_cuenta_generados',
    'posiciones_cartera_snapshot', 'eventos_cartera', 'cartera_etapas', 'coeficientes',
    'coeficiente_sets', 'inmueble_transferencias', 'inmueble_persona_rol',
    'tenant_tercero_rol', 'terceros_contacto_procedencia', 'auditoria_muestras',
    'auditoria_evidencias', 'auditoria_plan_items', 'auditoria_riesgo_residual_historial',
    'auditoria_normativa', 'auditoria_acciones', 'auditoria_ejecuciones',
    'auditoria_procedimientos', 'auditoria_hallazgos', 'auditoria_controles',
    'auditoria_planes', 'auditoria_riesgos', 'auditoria_engagements',
    'fundamento_normativo', 'inmuebles', 'terceros'
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
$$;

comment on function public.fn_resetear_copropiedad(uuid) is
  'Utilidad de desarrollo/QA: borra la data transaccional de una copropiedad (cargos, '
  'liquidaciones, pagos, novedades, periodos, auditoría, cartera, contabilidad, gobierno, '
  'mantenimiento, finanzas, fondos, solicitudes externas, inmuebles y terceros) para poder '
  're-sembrarla desde cero. NO cubre todavía la totalidad de tablas con tenant_id — solo las '
  'operativas más comunes (20260934070000); config/políticas/plantillas/consecutivos se '
  'preservan a propósito. Exige rol administrador y deja registro en audit_log.';
