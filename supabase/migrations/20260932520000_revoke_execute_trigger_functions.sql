-- ═══════════════════════════════════════════════════════════════════════
--  Remediación transversal · EXECUTE de funciones trigger expuesto por
--  PostgREST — hallazgo de get_advisors (security) contra hwjmlyzzvpmhadldavbq
--
--  Toda función `RETURNS trigger` en `public` recibe, por default de
--  Postgres al hacer CREATE FUNCTION, EXECUTE para PUBLIC (heredado por
--  anon/authenticated). El linter de seguridad de Supabase marca esto como
--  "Public/Signed-In Can Execute SECURITY DEFINER Function" para cada una
--  (`anon_security_definer_function_executable` /
--  `authenticated_security_definer_function_executable`).
--
--  Verificado que el hallazgo NO es explotable en este repo — doble
--  barrera, no solo una:
--   1. Postgres rechaza toda invocación SQL directa de una función
--      `RETURNS trigger` fuera de contexto de trigger, para cualquier rol,
--      incluso superusuario: "trigger functions can only be called as
--      triggers". Confirmado con SELECT directo contra
--      guard_criticidad_set_inmutable().
--   2. PostgREST excluye las funciones `RETURNS trigger` de su schema
--      cache — no aparecen como RPC invocable. Confirmado con POST a
--      /rest/v1/rpc/<nombre> con anon key para guard_criticidad_set_inmutable,
--      guard_mant_escenario, handle_new_user y forbid_mutation: los 4
--      devuelven 404 PGRST202 "no matches found in the schema cache".
--   3. Revocar EXECUTE no afecta el disparo de los triggers: el trigger
--      manager de Postgres invoca la función internamente sin pasar por el
--      chequeo de privilegios de EXECUTE que aplica a una llamada SQL
--      explícita.
--
--  Se corrige de todos modos por higiene del advisor (deja de listar ~400
--  warnings recurrentes) y para no depender de una garantía implícita del
--  motor — mismo patrón ya usado para funciones de cron (ver
--  20260932490000_mant9_salud_funciones.sql). Alcance: las 200 funciones
--  usadas como trigger function en `public` (prefijo guard_ y el resto:
--  audit_*, forbid_mutation*, handle_new_user, set_updated_at, trg_*,
--  etc.) — mismo patrón raíz en las 200, no solo las guard_*.
--
--  No se toca la definición de ninguna función, ni service_role (no lo
--  necesita: los triggers disparan sin importar EXECUTE, y ningún backend
--  las invoca como RPC).
-- ═══════════════════════════════════════════════════════════════════════

revoke execute on function public.aplicar_novedad_cuenta_por_tipo() from public, anon, authenticated;
revoke execute on function public.asignar_version_concepto() from public, anon, authenticated;
revoke execute on function public.audit_fondo_change() from public, anon, authenticated;
revoke execute on function public.audit_fondo_compromiso_change() from public, anon, authenticated;
revoke execute on function public.audit_fondo_solicitud_uso_change() from public, anon, authenticated;
revoke execute on function public.audit_membership_change() from public, anon, authenticated;
revoke execute on function public.audit_membership_rol_funcional_change() from public, anon, authenticated;
revoke execute on function public.audit_platform_admin() from public, anon, authenticated;
revoke execute on function public.auditoria_accion_cierre_guard() from public, anon, authenticated;
revoke execute on function public.auditoria_hallazgo_cierre_guard() from public, anon, authenticated;
revoke execute on function public.auditoria_hallazgos_congelar_version_riesgo() from public, anon, authenticated;
revoke execute on function public.auditoria_riesgos_bump_version() from public, anon, authenticated;
revoke execute on function public.fn_finanzas_lote_item_crear_compromiso() from public, anon, authenticated;
revoke execute on function public.fn_inmueble_estado_fechas() from public, anon, authenticated;
revoke execute on function public.forbid_mutation() from public, anon, authenticated;
revoke execute on function public.forbid_mutation_audit_log() from public, anon, authenticated;
revoke execute on function public.forbid_mutation_fondo_remanentes() from public, anon, authenticated;
revoke execute on function public.forbid_mutation_salvo_tenant_borrado() from public, anon, authenticated;
revoke execute on function public.guard_accion_cobranza_contexto_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_accion_cobranza_propuesta() from public, anon, authenticated;
revoke execute on function public.guard_accion_cobranza_transicion() from public, anon, authenticated;
revoke execute on function public.guard_active_tenant() from public, anon, authenticated;
revoke execute on function public.guard_activo_atributos() from public, anon, authenticated;
revoke execute on function public.guard_activo_atributos_obligatorios() from public, anon, authenticated;
revoke execute on function public.guard_activo_criticidad_puntaje() from public, anon, authenticated;
revoke execute on function public.guard_activo_ficha() from public, anon, authenticated;
revoke execute on function public.guard_activo_transicion() from public, anon, authenticated;
revoke execute on function public.guard_acuerdo_propuesta() from public, anon, authenticated;
revoke execute on function public.guard_acuerdo_transicion() from public, anon, authenticated;
revoke execute on function public.guard_agrupacion_arbol() from public, anon, authenticated;
revoke execute on function public.guard_agrupacion_centro_costo() from public, anon, authenticated;
revoke execute on function public.guard_atencion_token_consulta_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_atributo_definicion_valida() from public, anon, authenticated;
revoke execute on function public.guard_bien_matricula_no_duplicada() from public, anon, authenticated;
revoke execute on function public.guard_cartera_etapa_inicial() from public, anon, authenticated;
revoke execute on function public.guard_cartera_etapa_transicion() from public, anon, authenticated;
revoke execute on function public.guard_caso_juridico_actuacion_registrada_por() from public, anon, authenticated;
revoke execute on function public.guard_caso_juridico_insert() from public, anon, authenticated;
revoke execute on function public.guard_caso_juridico_transicion() from public, anon, authenticated;
revoke execute on function public.guard_castigo_cartera_origen() from public, anon, authenticated;
revoke execute on function public.guard_certificacion_insert() from public, anon, authenticated;
revoke execute on function public.guard_certificacion_transicion() from public, anon, authenticated;
revoke execute on function public.guard_coeficiente_set_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_coeficiente_set_padre_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_concepto_presupuesto_cuenta() from public, anon, authenticated;
revoke execute on function public.guard_concepto_transicion() from public, anon, authenticated;
revoke execute on function public.guard_conciliacion_transicion() from public, anon, authenticated;
revoke execute on function public.guard_contable_codigo_no_retirado() from public, anon, authenticated;
revoke execute on function public.guard_contable_comprobante_detalle_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_contable_comprobante_transicion() from public, anon, authenticated;
revoke execute on function public.guard_contable_cuenta_arbol() from public, anon, authenticated;
revoke execute on function public.guard_contable_cuenta_default() from public, anon, authenticated;
revoke execute on function public.guard_contable_cuenta_movimiento() from public, anon, authenticated;
revoke execute on function public.guard_contable_cuenta_naturaleza_tributaria() from public, anon, authenticated;
revoke execute on function public.guard_contable_periodo_transicion() from public, anon, authenticated;
revoke execute on function public.guard_contacto_procedencia_insert() from public, anon, authenticated;
revoke execute on function public.guard_costa_judicial_insert() from public, anon, authenticated;
revoke execute on function public.guard_costa_judicial_transicion() from public, anon, authenticated;
revoke execute on function public.guard_criticidad_set_hijo_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_criticidad_set_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_criticidad_set_pesos_completos() from public, anon, authenticated;
revoke execute on function public.guard_cuota_acuerdo_transicion() from public, anon, authenticated;
revoke execute on function public.guard_documento_tipo_familia() from public, anon, authenticated;
revoke execute on function public.guard_estrategia_cobranza_tramo_coherente() from public, anon, authenticated;
revoke execute on function public.guard_finanzas_compromiso_bancario() from public, anon, authenticated;
revoke execute on function public.guard_finanzas_compromiso_bancario_transicion() from public, anon, authenticated;
revoke execute on function public.guard_finanzas_factura_proveedor() from public, anon, authenticated;
revoke execute on function public.guard_finanzas_factura_retencion() from public, anon, authenticated;
revoke execute on function public.guard_finanzas_lote_item() from public, anon, authenticated;
revoke execute on function public.guard_finanzas_lote_pago() from public, anon, authenticated;
revoke execute on function public.guard_finanzas_politica_aprobacion_lote_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_finanzas_politica_aprobacion_pago_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_finanzas_politica_tesoreria() from public, anon, authenticated;
revoke execute on function public.guard_finanzas_politica_tesoreria_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_fondo_autorizacion() from public, anon, authenticated;
revoke execute on function public.guard_fondo_cierre_completo() from public, anon, authenticated;
revoke execute on function public.guard_fondo_compromiso() from public, anon, authenticated;
revoke execute on function public.guard_fondo_compromiso_transicion() from public, anon, authenticated;
revoke execute on function public.guard_fondo_estado_transicion() from public, anon, authenticated;
revoke execute on function public.guard_fondo_fuente() from public, anon, authenticated;
revoke execute on function public.guard_fondo_movimiento() from public, anon, authenticated;
revoke execute on function public.guard_fondo_referencias() from public, anon, authenticated;
revoke execute on function public.guard_fondo_remanente_referencias() from public, anon, authenticated;
revoke execute on function public.guard_fondo_saldo_derivado() from public, anon, authenticated;
revoke execute on function public.guard_fondo_solicitud_uso() from public, anon, authenticated;
revoke execute on function public.guard_fondo_solicitud_uso_transicion() from public, anon, authenticated;
revoke execute on function public.guard_fuente_financiacion() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_acta_entrega() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_acta_verificador() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_agenda_punto() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_asistencia() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_atribucion() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_clase_sancion() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_compromiso() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_compromiso_avance_registrado_por() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_convocatoria() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_convocatoria_envio() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_decision_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_infraccion() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_materia_decision() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_miembro() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_organo() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_poder() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_politica_semaforo_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_regla_mayoria() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_reunion() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_votacion() from public, anon, authenticated;
revoke execute on function public.guard_gobierno_voto() from public, anon, authenticated;
revoke execute on function public.guard_inmueble_agrupacion() from public, anon, authenticated;
revoke execute on function public.guard_inmueble_transferencia_insert() from public, anon, authenticated;
revoke execute on function public.guard_intencion_transicion() from public, anon, authenticated;
revoke execute on function public.guard_last_agent() from public, anon, authenticated;
revoke execute on function public.guard_liquidacion_creacion() from public, anon, authenticated;
revoke execute on function public.guard_liquidacion_resultado_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_liquidacion_transicion() from public, anon, authenticated;
revoke execute on function public.guard_mant_almacen() from public, anon, authenticated;
revoke execute on function public.guard_mant_contrato() from public, anon, authenticated;
revoke execute on function public.guard_mant_contrato_activos() from public, anon, authenticated;
revoke execute on function public.guard_mant_contrato_clausulas() from public, anon, authenticated;
revoke execute on function public.guard_mant_cumplimiento() from public, anon, authenticated;
revoke execute on function public.guard_mant_escenario() from public, anon, authenticated;
revoke execute on function public.guard_mant_garantia() from public, anon, authenticated;
revoke execute on function public.guard_mant_garantia_reclamacion() from public, anon, authenticated;
revoke execute on function public.guard_mant_habilitacion_requerida() from public, anon, authenticated;
revoke execute on function public.guard_mant_hallazgo_actuacion_registrada_por() from public, anon, authenticated;
revoke execute on function public.guard_mant_hallazgo_insert() from public, anon, authenticated;
revoke execute on function public.guard_mant_hallazgo_transicion() from public, anon, authenticated;
revoke execute on function public.guard_mant_incidencia() from public, anon, authenticated;
revoke execute on function public.guard_mant_inspeccion_flag() from public, anon, authenticated;
revoke execute on function public.guard_mant_inspeccion_formato() from public, anon, authenticated;
revoke execute on function public.guard_mant_inspeccion_formato_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_mant_inspeccion_formato_item_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_mant_inspeccion_registrada_por() from public, anon, authenticated;
revoke execute on function public.guard_mant_inventario_movimiento() from public, anon, authenticated;
revoke execute on function public.guard_mant_matriz_prioridad() from public, anon, authenticated;
revoke execute on function public.guard_mant_ot() from public, anon, authenticated;
revoke execute on function public.guard_mant_ot_medicion() from public, anon, authenticated;
revoke execute on function public.guard_mant_ot_tarea() from public, anon, authenticated;
revoke execute on function public.guard_mant_plan() from public, anon, authenticated;
revoke execute on function public.guard_mant_politica_aprobacion_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_mant_programacion_transicion() from public, anon, authenticated;
revoke execute on function public.guard_mant_proveedor_evaluacion() from public, anon, authenticated;
revoke execute on function public.guard_mant_proveedor_habilitacion() from public, anon, authenticated;
revoke execute on function public.guard_mant_proveedor_perfil() from public, anon, authenticated;
revoke execute on function public.guard_mant_repuesto() from public, anon, authenticated;
revoke execute on function public.guard_marco_contable_tenant() from public, anon, authenticated;
revoke execute on function public.guard_nota_edicion() from public, anon, authenticated;
revoke execute on function public.guard_novedad_cuota_generada() from public, anon, authenticated;
revoke execute on function public.guard_novedad_tipo_cuenta() from public, anon, authenticated;
revoke execute on function public.guard_novedad_tipo_presupuesto() from public, anon, authenticated;
revoke execute on function public.guard_novedad_transicion() from public, anon, authenticated;
revoke execute on function public.guard_pago_aplicacion_no_excede() from public, anon, authenticated;
revoke execute on function public.guard_pago_aplicacion_reversa_coherente() from public, anon, authenticated;
revoke execute on function public.guard_pago_medio_recaudo() from public, anon, authenticated;
revoke execute on function public.guard_pago_reversa_coherente() from public, anon, authenticated;
revoke execute on function public.guard_pasarela_metodo() from public, anon, authenticated;
revoke execute on function public.guard_periodo_transicion() from public, anon, authenticated;
revoke execute on function public.guard_politica_clasificacion_completa() from public, anon, authenticated;
revoke execute on function public.guard_politica_deterioro_completa() from public, anon, authenticated;
revoke execute on function public.guard_politica_deterioro_porcentaje_valido() from public, anon, authenticated;
revoke execute on function public.guard_politica_financiera_tope_legal() from public, anon, authenticated;
revoke execute on function public.guard_politica_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_prescripcion_acto_insert() from public, anon, authenticated;
revoke execute on function public.guard_presupuesto_cuenta_arbol() from public, anon, authenticated;
revoke execute on function public.guard_presupuesto_cuenta_contable() from public, anon, authenticated;
revoke execute on function public.guard_presupuesto_ejecucion_activo() from public, anon, authenticated;
revoke execute on function public.guard_presupuesto_ejecucion_cuenta() from public, anon, authenticated;
revoke execute on function public.guard_presupuesto_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_presupuesto_origen_aprobacion() from public, anon, authenticated;
revoke execute on function public.guard_presupuesto_reconciliado() from public, anon, authenticated;
revoke execute on function public.guard_presupuesto_rubro_cuenta() from public, anon, authenticated;
revoke execute on function public.guard_privileged_columns() from public, anon, authenticated;
revoke execute on function public.guard_promesa_registrada() from public, anon, authenticated;
revoke execute on function public.guard_promesa_transicion() from public, anon, authenticated;
revoke execute on function public.guard_rendicion_origen_exclusivo() from public, anon, authenticated;
revoke execute on function public.guard_requisito_referencia() from public, anon, authenticated;
revoke execute on function public.guard_salud_factor_fuente() from public, anon, authenticated;
revoke execute on function public.guard_salud_set_hijo_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_salud_set_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_salud_set_pesos_completos() from public, anon, authenticated;
revoke execute on function public.guard_self_modify() from public, anon, authenticated;
revoke execute on function public.guard_tenant_catalogos() from public, anon, authenticated;
revoke execute on function public.guard_tercero_invariantes() from public, anon, authenticated;
revoke execute on function public.guard_tramo_deterioro_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_tramo_deterioro_porcentaje_valido() from public, anon, authenticated;
revoke execute on function public.guard_tramo_politica_inmutable() from public, anon, authenticated;
revoke execute on function public.guard_tributario_iva_generado() from public, anon, authenticated;
revoke execute on function public.guard_vinculo_cuenta_efectivo() from public, anon, authenticated;
revoke execute on function public.guard_zona_comun_esencial_sin_uso_exclusivo() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.instanciar_clase6_al_explotar_bienes_comunes() from public, anon, authenticated;
revoke execute on function public.propagar_presupuesto_cuenta_ruta() from public, anon, authenticated;
revoke execute on function public.propagar_solicitud_ejecutada() from public, anon, authenticated;
revoke execute on function public.recalcular_ejecutado_compromiso() from public, anon, authenticated;
revoke execute on function public.recalcular_saldo_fondo() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.trg_aplicar_anticipos() from public, anon, authenticated;
revoke execute on function public.trg_aporte_fondo_imprevistos() from public, anon, authenticated;
revoke execute on function public.trg_descuento_pronto_pago() from public, anon, authenticated;
revoke execute on function public.validar_lista_tipos_ocultos_plataforma() from public, anon, authenticated;
