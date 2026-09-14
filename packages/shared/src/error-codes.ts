/**
 * Registro central de códigos de error (Doc 14 — cierra el gap de
 * auditoría del corpus 01-24: sin esto, los ~35+ códigos existentes solo
 * vivían como convención textual dispersa entre SQL (`raise exception
 * 'CODIGO: mensaje'`) y TS (`errorResponse(status, 'CODIGO', ...)`),
 * verificable solo por grep, nunca por el compilador ni por un test.
 *
 * Sin dependencias runtime — importable tanto desde paquetes Node
 * (vía dist/) como directo desde Deno (Edge Functions), igual que
 * database.generated.ts.
 *
 * AD-35 (Doc 14, mitad "versionado"): sin versionado de API en v0 — un
 * único cliente propietario (apps/web) desplegado junto a las Edge
 * Functions; se adopta cuando exista un segundo consumidor externo real
 * (AD-23). Un código de error que cambia de semántica se retira (nunca se
 * reutiliza el nombre) y se añade uno nuevo — no hace falta un esquema de
 * versión aparte mientras el único consumidor se despliega en el mismo
 * commit que el servidor.
 *
 * tests/governance/error-codes-coverage.test.ts escanea `supabase/` y
 * falla si aparece un código nuevo que no esté aquí — mantener esta lista
 * al día no es opcional, es lo que el test verifica.
 *
 * GENERADO A MANO, no por introspección — a diferencia de
 * database.generated.ts, no hay una fuente única de verdad estructural
 * para extraer esto (los códigos viven en strings SQL y TS). Regenerar
 * manualmente si el test-guardia falla.
 */

export const ERROR_CODES = {
  // ── Transversal (rate limiting, contrato HTTP, autenticación) ─────────
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  RATE_LIMITED: 'RATE_LIMITED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',

  // ── Tenancy / membresías / invitaciones (Fase I) ───────────────────────
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  INVITE_PENDING: 'INVITE_PENDING',
  INV_EMAIL_MISMATCH: 'INV_EMAIL_MISMATCH',
  INV_EXPIRED: 'INV_EXPIRED',
  INV_NOT_FOUND: 'INV_NOT_FOUND',
  INV_NOT_PENDING: 'INV_NOT_PENDING',
  INV_USED: 'INV_USED',
  LAST_AGENT: 'LAST_AGENT',
  MEMBERSHIP_FETCH_FAILED: 'MEMBERSHIP_FETCH_FAILED',
  MEMBERSHIP_NOT_FOUND: 'MEMBERSHIP_NOT_FOUND',
  NO_MEMBERSHIP: 'NO_MEMBERSHIP',
  PRIVILEGE_ESCALATION: 'PRIVILEGE_ESCALATION',
  SELF_MODIFY: 'SELF_MODIFY',
  SLUG_INVALID: 'SLUG_INVALID',
  SLUG_TAKEN: 'SLUG_TAKEN',
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',

  // ── Guards de dominio genéricos ─────────────────────────────────────────
  APPEND_ONLY: 'APPEND_ONLY',
  // Lo levantan siete guards distintos (prescripción, transferencias, legal
  // holds, procedencia de terceros, actuaciones, acuerdos de pago y fondos)
  // con el mismo significado: el documento referenciado es de otro tenant.
  DOCUMENTO_INVALIDO: 'DOCUMENTO_INVALIDO',
  INVALID_INSERT: 'INVALID_INSERT',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  INVALID_UPDATE: 'INVALID_UPDATE',

  // ── Motor Presupuestal (GAP-19) ─────────────────────────────────────────
  BUDGET_NOT_RECONCILED: 'BUDGET_NOT_RECONCILED',
  COEFICIENTE_SET_NO_VIGENTE: 'COEFICIENTE_SET_NO_VIGENTE',
  DISTRIBUCION_INVALIDA: 'DISTRIBUCION_INVALIDA',
  FINANCIACION_EXCEDE_PRESUPUESTO: 'FINANCIACION_EXCEDE_PRESUPUESTO',
  FONDO_IMPREVISTOS_NO_EXISTE: 'FONDO_IMPREVISTOS_NO_EXISTE',
  FONDO_INSUFICIENTE: 'FONDO_INSUFICIENTE',
  IMMUTABLE_BUDGET: 'IMMUTABLE_BUDGET',
  IMMUTABLE_COEFFICIENT_SET: 'IMMUTABLE_COEFFICIENT_SET',
  IMMUTABLE_POLICY: 'IMMUTABLE_POLICY',
  NECESIDAD_NEGATIVA: 'NECESIDAD_NEGATIVA',
  POLITICA_NO_VIGENTE: 'POLITICA_NO_VIGENTE',
  PRESUPUESTO_NO_ENCONTRADO: 'PRESUPUESTO_NO_ENCONTRADO',
  SIN_COEFICIENTE: 'SIN_COEFICIENTE',
  SIN_INMUEBLES: 'SIN_INMUEBLES',

  // ── Dominio Fondos (GAP-22, PLAN §4.3) ───────────────────────────────────
  // FONDO_IMPREVISTOS_NO_EXISTE y FONDO_INSUFICIENTE viven arriba: nacieron
  // con el Motor Presupuestal (FI-003) y siguen siendo suyos.
  AUTORIZACION_INVALIDA: 'AUTORIZACION_INVALIDA',
  // R9: comprometer más de lo que el fondo tiene disponible (saldo - comprometido).
  COMPROMISO_EJECUCION_EXCEDE_MONTO: 'COMPROMISO_EJECUCION_EXCEDE_MONTO',
  COMPROMISO_ESTADO_NO_EJECUTABLE: 'COMPROMISO_ESTADO_NO_EJECUTABLE',
  COMPROMISO_ESTADO_TERMINAL: 'COMPROMISO_ESTADO_TERMINAL',
  COMPROMISO_EXCEDE_DISPONIBLE: 'COMPROMISO_EXCEDE_DISPONIBLE',
  COMPROMISO_INVALIDO: 'COMPROMISO_INVALIDO',
  COMPROMISO_TRANSICION_INVALIDA: 'COMPROMISO_TRANSICION_INVALIDA',
  EXTRACTO_LINEA_INVALIDA: 'EXTRACTO_LINEA_INVALIDA',
  // BLOQUE O (Modelo §35/§36): compromisos/solicitudes sin resolver bloquean el cierre.
  FONDO_COMPROMISOS_PENDIENTES: 'FONDO_COMPROMISOS_PENDIENTES',
  // BLOQUE O: el fondo destino de un traslado de remanente no existe, no es del tenant, o es el mismo fondo.
  FONDO_DESTINO_INVALIDO: 'FONDO_DESTINO_INVALIDO',
  // BLOQUE O: fn_fondo_cerrar exige que el fondo esté en_cierre (o detecta un cierre concurrente).
  FONDO_ESTADO_INVALIDO: 'FONDO_ESTADO_INVALIDO',
  FONDO_ESTADO_NO_ADMITE_AUTORIZACIONES: 'FONDO_ESTADO_NO_ADMITE_AUTORIZACIONES',
  FONDO_ESTADO_NO_ADMITE_COMPROMISOS: 'FONDO_ESTADO_NO_ADMITE_COMPROMISOS',
  FONDO_ESTADO_NO_ADMITE_FUENTES: 'FONDO_ESTADO_NO_ADMITE_FUENTES',
  FONDO_ESTADO_NO_ADMITE_MOVIMIENTOS: 'FONDO_ESTADO_NO_ADMITE_MOVIMIENTOS',
  FONDO_ESTADO_NO_ADMITE_SOLICITUDES: 'FONDO_ESTADO_NO_ADMITE_SOLICITUDES',
  FONDO_ESTADO_TERMINAL: 'FONDO_ESTADO_TERMINAL',
  FONDO_MOTIVO_REQUERIDO: 'FONDO_MOTIVO_REQUERIDO',
  FONDO_NATURALEZA_INVALIDA: 'FONDO_NATURALEZA_INVALIDA',
  FONDO_NO_ENCONTRADO: 'FONDO_NO_ENCONTRADO',
  // BLOQUE O: fondo_remanentes es append-only — ningún UPDATE/DELETE está permitido.
  FONDO_REMANENTE_INMUTABLE: 'FONDO_REMANENTE_INMUTABLE',
  // BLOQUE O: "traslado" exige fondo_destino_id; los demás destinos lo rechazan.
  FONDO_REMANENTE_DESTINO_INCONSISTENTE: 'FONDO_REMANENTE_DESTINO_INCONSISTENTE',
  // BLOQUE O: fondo_remanentes solo puede referenciar un fondo_movimientos de tipo cierre_remanente.
  FONDO_REMANENTE_MOVIMIENTO_INVALIDO: 'FONDO_REMANENTE_MOVIMIENTO_INVALIDO',
  // BLOQUE O: saldo > 0 al cerrar exige destino/organoId/decision (Modelo §36).
  FONDO_REMANENTE_SIN_DECISION: 'FONDO_REMANENTE_SIN_DECISION',
  FONDO_REMANENTE_SIN_DESTINO: 'FONDO_REMANENTE_SIN_DESTINO',
  FONDO_REVERSION_INVALIDA: 'FONDO_REVERSION_INVALIDA',
  // D-42: soporte documental diferenciado — manual exige documento_id, automático (pago_id) no.
  FONDO_SOPORTE_REQUERIDO: 'FONDO_SOPORTE_REQUERIDO',
  // R8: saldo_actual no se escribe a mano, se deriva de fondo_movimientos.
  FONDO_SALDO_DERIVADO: 'FONDO_SALDO_DERIVADO',
  // BLOQUE O: guard_fondo_cierre_completo — un saldo negativo nunca debería llegar a cerrarse.
  FONDO_SALDO_NEGATIVO: 'FONDO_SALDO_NEGATIVO',
  FONDO_SOLICITUDES_PENDIENTES: 'FONDO_SOLICITUDES_PENDIENTES',
  FONDO_TENANT_INCONSISTENTE: 'FONDO_TENANT_INCONSISTENTE',
  FONDO_TRANSICION_INVALIDA: 'FONDO_TRANSICION_INVALIDA',
  ORGANO_DECISORIO_INVALIDO: 'ORGANO_DECISORIO_INVALIDO',
  // D-37: segregación de funciones de las solicitudes de uso de fondos.
  SOLICITUD_AUTOAPROBACION: 'SOLICITUD_AUTOAPROBACION',
  SOLICITUD_AUTOEJECUCION: 'SOLICITUD_AUTOEJECUCION',
  // 'ejecutada' solo la deriva la ejecución completa del compromiso vinculado.
  SOLICITUD_EJECUTADA_NO_MANUAL: 'SOLICITUD_EJECUTADA_NO_MANUAL',
  SOLICITUD_ESTADO_TERMINAL: 'SOLICITUD_ESTADO_TERMINAL',
  // Modelo §20: no se aprueba una solicitud que exceda el disponible.
  SOLICITUD_EXCEDE_DISPONIBLE: 'SOLICITUD_EXCEDE_DISPONIBLE',
  SOLICITUD_MOTIVO_REQUERIDO: 'SOLICITUD_MOTIVO_REQUERIDO',
  // fondos-aprobar/rechazar/comprometer-solicitud: la solicitud no existe o no es visible por RLS.
  SOLICITUD_NO_ENCONTRADA: 'SOLICITUD_NO_ENCONTRADA',
  SOLICITUD_ROL_INSUFICIENTE: 'SOLICITUD_ROL_INSUFICIENTE',
  SOLICITUD_TRANSICION_INVALIDA: 'SOLICITUD_TRANSICION_INVALIDA',
  // Compartido con el dominio jurídico/terceros (mismo significado que DOCUMENTO_INVALIDO):
  // el tercero referenciado no pertenece al tenant.
  TERCERO_INVALIDO: 'TERCERO_INVALIDO',
  TIPO_FONDO_INVALIDO: 'TIPO_FONDO_INVALIDO',
  TIPO_FUENTE_FONDO_INVALIDO: 'TIPO_FUENTE_FONDO_INVALIDO',

  // ── Árbol de cuentas presupuestales (E8) ─────────────────────────────────
  CUENTA_INEXISTENTE: 'CUENTA_INEXISTENTE',
  CUENTA_PADRE_INEXISTENTE: 'CUENTA_PADRE_INEXISTENTE',
  CUENTA_TENANT_INCONSISTENTE: 'CUENTA_TENANT_INCONSISTENTE',
  CUENTA_NO_ES_HOJA: 'CUENTA_NO_ES_HOJA',
  CUENTA_NATURALEZA_MEZCLADA: 'CUENTA_NATURALEZA_MEZCLADA',
  CUENTA_NATURALEZA_INVALIDA: 'CUENTA_NATURALEZA_INVALIDA',
  CUENTA_PROFUNDIDAD_MAXIMA: 'CUENTA_PROFUNDIDAD_MAXIMA',
  CUENTA_PROFUNDIDAD_EXCEDIDA: 'CUENTA_PROFUNDIDAD_EXCEDIDA',
  CUENTA_CICLO: 'CUENTA_CICLO',
  CUENTA_TIENE_CONCEPTO: 'CUENTA_TIENE_CONCEPTO',
  CONCEPTO_INEXISTENTE: 'CONCEPTO_INEXISTENTE',
  CONCEPTO_TENANT_INCONSISTENTE: 'CONCEPTO_TENANT_INCONSISTENTE',

  // ── Plan de cuentas contable (PC-1) ──────────────────────────────────────
  // Catálogo distinto del presupuestal: aquí la jerarquía la impone el propio código numérico
  // (5505 cuelga de 55, que cuelga de 5), no un parent_id libre — de ahí que los códigos de
  // error hablen de niveles y prefijos y no de hojas ni de naturaleza mezclada.
  CUENTA_RAIZ_INVALIDA: 'CUENTA_RAIZ_INVALIDA',
  CUENTA_LONGITUD_INVALIDA: 'CUENTA_LONGITUD_INVALIDA',
  CUENTA_NIVEL_SALTADO: 'CUENTA_NIVEL_SALTADO',
  CUENTA_CODIGO_INCOHERENTE: 'CUENTA_CODIGO_INCOHERENTE',
  CUENTA_AGRUPA_SUBCUENTAS: 'CUENTA_AGRUPA_SUBCUENTAS',
  // Instanciación del plan por copropiedad (fn_instanciar_plan_contable, PC-2)
  PLAN_CONTABLE_INEXISTENTE: 'PLAN_CONTABLE_INEXISTENTE',
  TENANT_INEXISTENTE: 'TENANT_INEXISTENTE',

  // ── Puentes hacia el plan contable (PC-3) ────────────────────────────────
  // Los emite validar_cuenta_contable_destino(), compartida por presupuesto_cuenta,
  // fondos, cuentas_bancarias y contable_cuenta_default.
  CUENTA_CONTABLE_INEXISTENTE: 'CUENTA_CONTABLE_INEXISTENTE',
  CUENTA_CONTABLE_TENANT_INCONSISTENTE: 'CUENTA_CONTABLE_TENANT_INCONSISTENTE',
  CUENTA_CONTABLE_NO_ADMITE_MOVIMIENTO: 'CUENTA_CONTABLE_NO_ADMITE_MOVIMIENTO',
  CUENTA_CONTABLE_INACTIVA: 'CUENTA_CONTABLE_INACTIVA',
  CUENTA_CONTABLE_CLASE_INCOMPATIBLE: 'CUENTA_CONTABLE_CLASE_INCOMPATIBLE',
  // GAP-22: la cuenta no tiene requiere_fondo activo pese a que el evento
  // contable o la tabla (fondos) exigen la dimensión Fondos.
  CUENTA_SIN_DIMENSION_FONDO: 'CUENTA_SIN_DIMENSION_FONDO',
  EVENTO_CONTABLE_INVALIDO: 'EVENTO_CONTABLE_INVALIDO',
  // Hace cumplir en el motor una decisión de diseño ya fundamentada (PC-9): impide recrear por
  // tenant un código de cuenta que la plantilla global retiró por doctrina (ej. grupo 27/32).
  CUENTA_CODIGO_RETIRADO: 'CUENTA_CODIGO_RETIRADO',

  // ── Contrapartida de la ejecución presupuestal (PC-4) ────────────────────
  // Sin contrapartida el movimiento tiene débito y ningún crédito: no es exportable.
  LIQUIDACION_REQUERIDA: 'LIQUIDACION_REQUERIDA',
  LIQUIDACION_CUENTA_BANCARIA_REQUERIDA: 'LIQUIDACION_CUENTA_BANCARIA_REQUERIDA',
  LIQUIDACION_CUENTA_BANCARIA_NO_APLICA: 'LIQUIDACION_CUENTA_BANCARIA_NO_APLICA',
  LIQUIDACION_TERCERO_REQUERIDO: 'LIQUIDACION_TERCERO_REQUERIDO',
  CUENTA_BANCARIA_INEXISTENTE: 'CUENTA_BANCARIA_INEXISTENTE',
  CUENTA_BANCARIA_TENANT_INCONSISTENTE: 'CUENTA_BANCARIA_TENANT_INCONSISTENTE',
  CUENTA_BANCARIA_INACTIVA: 'CUENTA_BANCARIA_INACTIVA',
  TERCERO_INEXISTENTE: 'TERCERO_INEXISTENTE',
  TERCERO_TENANT_INCONSISTENTE: 'TERCERO_TENANT_INCONSISTENTE',
  FECHA_DOCUMENTO_FUERA_DE_EJERCICIO: 'FECHA_DOCUMENTO_FUERA_DE_EJERCICIO',

  // ── Ejecución presupuestal (E9) ──────────────────────────────────────────
  PERIODO_INEXISTENTE: 'PERIODO_INEXISTENTE',
  PERIODO_TENANT_INCONSISTENTE: 'PERIODO_TENANT_INCONSISTENTE',
  CUENTA_CONCEPTO_AUTOMATICO: 'CUENTA_CONCEPTO_AUTOMATICO',
  REVERSION_SIN_ORIGEN: 'REVERSION_SIN_ORIGEN',
  REVERSION_CUENTA_DISTINTA: 'REVERSION_CUENTA_DISTINTA',
  MOVIMIENTO_INEXISTENTE: 'MOVIMIENTO_INEXISTENTE',
  MOVIMIENTO_TENANT_INCONSISTENTE: 'MOVIMIENTO_TENANT_INCONSISTENTE',

  // ── Liquidación (F5/F6) ──────────────────────────────────────────────────
  LIQUIDACION_INVALIDA: 'LIQUIDACION_INVALIDA',
  PERIODO_NO_ABIERTO: 'PERIODO_NO_ABIERTO',
  PERIODO_NO_ENCONTRADO: 'PERIODO_NO_ENCONTRADO',
  PERIODO_YA_LIQUIDADO: 'PERIODO_YA_LIQUIDADO',
  SNAPSHOT_INCOMPLETO: 'SNAPSHOT_INCOMPLETO',

  // ── Liquidación en dos tiempos (L0-L3, plan 2026-08-24) ─────────────────
  // Máquina de estados y guards (L0, 20260830570000)
  LIQUIDACION_ESTADO_INICIAL_INVALIDO: 'LIQUIDACION_ESTADO_INICIAL_INVALIDO',
  LIQUIDACION_TRANSICION_INVALIDA: 'LIQUIDACION_TRANSICION_INVALIDA',
  LIQUIDACION_RESULTADO_INMUTABLE: 'LIQUIDACION_RESULTADO_INMUTABLE',
  LIQUIDACION_REQUIERE_ADMINISTRADOR: 'LIQUIDACION_REQUIERE_ADMINISTRADOR',
  LIQUIDACION_ANULACION_SIN_MOTIVO: 'LIQUIDACION_ANULACION_SIN_MOTIVO',
  // Aplicar (L3, 20260830590000)
  LIQUIDACION_NO_ENCONTRADA: 'LIQUIDACION_NO_ENCONTRADA',
  LIQUIDACION_NO_PENDIENTE: 'LIQUIDACION_NO_PENDIENTE',
  LIQUIDACION_DATOS_CAMBIARON: 'LIQUIDACION_DATOS_CAMBIARON',
  LIQUIDACION_SNAPSHOT_DESACTUALIZADO: 'LIQUIDACION_SNAPSHOT_DESACTUALIZADO',
  LIQUIDACION_PREVUELO_BLOQUEADO: 'LIQUIDACION_PREVUELO_BLOQUEADO',
  // Anular (L6, 20260830630000)
  LIQUIDACION_NO_APLICADA: 'LIQUIDACION_NO_APLICADA',
  LIQUIDACION_CON_PAGOS: 'LIQUIDACION_CON_PAGOS',
  PERIODO_CON_LIQUIDACION_APLICADA: 'PERIODO_CON_LIQUIDACION_APLICADA',

  // ── Cuenta corriente: pagos / intereses (E1-E6) ─────────────────────────
  CARGO_SOBREAPLICADO: 'CARGO_SOBREAPLICADO',
  CUENTA_CORRIENTE_INCOMPLETA: 'CUENTA_CORRIENTE_INCOMPLETA',
  IMPUTACION_INVALIDA: 'IMPUTACION_INVALIDA',
  INMUEBLE_NO_ENCONTRADO: 'INMUEBLE_NO_ENCONTRADO',
  INTERES_INVALIDO: 'INTERES_INVALIDO',
  PAGO_SOBREAPLICADO: 'PAGO_SOBREAPLICADO',
  POLITICA_MORA_NO_CONFIGURADA: 'POLITICA_MORA_NO_CONFIGURADA',
  TENANT_NO_ENCONTRADO: 'TENANT_NO_ENCONTRADO',

  // ── Recaudo: medio de pago y recibo de caja (RC-0..RC-6) ────────────────
  FORMA_PAGO_INVALIDA: 'FORMA_PAGO_INVALIDA',
  PAGO_FECHA_INCOHERENTE: 'PAGO_FECHA_INCOHERENTE',
  PAGO_MEDIO_INCOHERENTE: 'PAGO_MEDIO_INCOHERENTE',
  ANULACION_NO_REVERSABLE: 'ANULACION_NO_REVERSABLE',
  PAGO_ANULACION_SIN_MOTIVO: 'PAGO_ANULACION_SIN_MOTIVO',
  PAGO_MONTO_INVALIDO: 'PAGO_MONTO_INVALIDO',
  PAGO_NO_ENCONTRADO: 'PAGO_NO_ENCONTRADO',
  PAGO_YA_ANULADO: 'PAGO_YA_ANULADO',
  RECIBO_CAJA_NO_ENCONTRADO: 'RECIBO_CAJA_NO_ENCONTRADO',
  RECIBO_CAJA_ENLACE_INVALIDO: 'RECIBO_CAJA_ENLACE_INVALIDO',
  RECIBO_CAJA_VENCIDO: 'RECIBO_CAJA_VENCIDO',
  RECIBO_CAJA_YA_NOTIFICADO: 'RECIBO_CAJA_YA_NOTIFICADO',

  // ── Novedades (E4) ───────────────────────────────────────────────────────
  ADJUSTMENT_ZERO_AMOUNT: 'ADJUSTMENT_ZERO_AMOUNT',
  NOVEDAD_NO_ENCONTRADA: 'NOVEDAD_NO_ENCONTRADA',
  NOVEDAD_NO_PENDIENTE: 'NOVEDAD_NO_PENDIENTE',
  PERIODO_NO_ENCONTRADO_PARA_FECHA_EFECTIVA: 'PERIODO_NO_ENCONTRADO_PARA_FECHA_EFECTIVA',

  // ── Conceptos avanzados Fase 3: novedades.tipo_novedad_id/presupuesto_cuenta_id ──
  TIPO_NOVEDAD_INVALIDO: 'TIPO_NOVEDAD_INVALIDO',
  TIPO_NOVEDAD_TENANT_INCONSISTENTE: 'TIPO_NOVEDAD_TENANT_INCONSISTENTE',

  // ── Conceptos avanzados Fase 4: novedades permanentes/prorrateables ─────
  NOVEDAD_CUOTA_INMUTABLE: 'NOVEDAD_CUOTA_INMUTABLE',
  // Inhabilitar una prorrateable exige saldo pendiente (al menos una cuota
  // sin generar) — distinta de NOVEDAD_NO_PERMANENTE.
  NOVEDAD_NO_INHABILITABLE: 'NOVEDAD_NO_INHABILITABLE',
  NOVEDAD_NO_PERMANENTE: 'NOVEDAD_NO_PERMANENTE',
  // Ya se generaron todas las cuotas de la prorrateable: no hay nada que detener.
  NOVEDAD_SIN_SALDO_PENDIENTE: 'NOVEDAD_SIN_SALDO_PENDIENTE',
  NOVEDAD_YA_INHABILITADA: 'NOVEDAD_YA_INHABILITADA',

  // ── AEL-004 Fase 4: maker-checker de conceptos ──────────────────────────
  CONCEPTO_INMUTABLE: 'CONCEPTO_INMUTABLE',
  SELF_APPROVAL: 'SELF_APPROVAL',

  // ── Ficha de inmueble: documentos (§8.1) ────────────────────────────────
  ARCHIVO_INVALIDO: 'ARCHIVO_INVALIDO',
  TIPO_DOCUMENTO_INVALIDO: 'TIPO_DOCUMENTO_INVALIDO',
  INMUEBLE_INVALIDO: 'INMUEBLE_INVALIDO',

  // ── Terceros: generalización natural/jurídica ───────────────────────────
  TIPO_IDENTIFICACION_INVALIDO: 'TIPO_IDENTIFICACION_INVALIDO',
  ESTADO_TERCERO_INVALIDO: 'ESTADO_TERCERO_INVALIDO',
  TERCERO_REPRESENTANTE_INVALIDO: 'TERCERO_REPRESENTANTE_INVALIDO',
  TERCERO_PAGADOR_INVALIDO: 'TERCERO_PAGADOR_INVALIDO',

  // ── Ficha de copropiedad: datos básicos del tenant ──────────────────────
  TIPO_DIVISION_INVALIDO: 'TIPO_DIVISION_INVALIDO',

  // ── Estado de cuenta (PLAN_DATOS_REALES.md §3.3, D-27/D-28) ──────────────
  ESTADO_CUENTA_NO_ENCONTRADO: 'ESTADO_CUENTA_NO_ENCONTRADO',
  ESTADO_CUENTA_VENCIDO: 'ESTADO_CUENTA_VENCIDO',
  // Enlace público con token HMAC (D-27): firma que no corresponde al id o
  // formato ajeno — distinto de VENCIDO (firma válida, expiración cumplida).
  ESTADO_CUENTA_ENLACE_INVALIDO: 'ESTADO_CUENTA_ENLACE_INVALIDO',
  // Guard anti-doble-envío del correo (D-28): ya existe rastro
  // 'estado_cuenta.enviado' en audit_log dentro de la ventana de dedupe.
  ESTADO_CUENTA_YA_NOTIFICADO: 'ESTADO_CUENTA_YA_NOTIFICADO',

  // ── Motor de Presupuestal / Conceptos ────────────────────────────────
  // Tope legal de intereses (Art. 30 Ley 675): la tasa de mora no puede
  // superar la bancario corriente certificada por la Superfinanciera.
  TOPE_LEGAL_NO_DECLARADO: 'TOPE_LEGAL_NO_DECLARADO',
  // Protección de conceptos de plantilla: impide modificar conceptos que
  // provienen de la semilla del sistema (is_plantilla = true).
  CONCEPTO_NOVEDAD_PROTEGIDO: 'CONCEPTO_NOVEDAD_PROTEGIDO',

  // ── Motor de Gestión de Cartera (CAR §7-§8) ──────────────────────────────
  PERIODO_SIN_FECHA_VENCIMIENTO: 'PERIODO_SIN_FECHA_VENCIMIENTO',
  POLITICA_CLASIFICACION_SIN_TRAMOS: 'POLITICA_CLASIFICACION_SIN_TRAMOS',
  POLITICA_CLASIFICACION_CODIGO_DUPLICADO: 'POLITICA_CLASIFICACION_CODIGO_DUPLICADO',
  POLITICA_CLASIFICACION_SIN_TRAMO_INICIAL: 'POLITICA_CLASIFICACION_SIN_TRAMO_INICIAL',
  POLITICA_CLASIFICACION_SIN_TRAMO_ABIERTO: 'POLITICA_CLASIFICACION_SIN_TRAMO_ABIERTO',
  POLITICA_CLASIFICACION_HUECO: 'POLITICA_CLASIFICACION_HUECO',
  POLITICA_CLASIFICACION_HUECO_O_SOLAPE: 'POLITICA_CLASIFICACION_HUECO_O_SOLAPE',
  POLITICA_CLASIFICACION_NO_VIGENTE: 'POLITICA_CLASIFICACION_NO_VIGENTE',
  TRAMO_CLASIFICACION_NO_ENCONTRADO: 'TRAMO_CLASIFICACION_NO_ENCONTRADO',
  SNAPSHOT_NO_DISPONIBLE: 'SNAPSHOT_NO_DISPONIBLE',
  TASA_REFERENCIA_NO_ENCONTRADA: 'TASA_REFERENCIA_NO_ENCONTRADA',
  INTERES_EXCEDE_TOPE_LEGAL: 'INTERES_EXCEDE_TOPE_LEGAL',
  ESTRATEGIA_COBRANZA_TRAMO_AJENO: 'ESTRATEGIA_COBRANZA_TRAMO_AJENO',
  ACCION_COBRANZA_CONTEXTO_INMUTABLE: 'ACCION_COBRANZA_CONTEXTO_INMUTABLE',
  ACCION_COBRANZA_ESTADO_INICIAL_INVALIDO: 'ACCION_COBRANZA_ESTADO_INICIAL_INVALIDO',
  ACCION_COBRANZA_TRANSICION_INVALIDA: 'ACCION_COBRANZA_TRANSICION_INVALIDA',
  ACCION_COBRANZA_REQUIERE_ADMINISTRADOR: 'ACCION_COBRANZA_REQUIERE_ADMINISTRADOR',
  ACCION_COBRANZA_AUTOAPROBACION: 'ACCION_COBRANZA_AUTOAPROBACION',
  ACCION_COBRANZA_NO_ENCONTRADA: 'ACCION_COBRANZA_NO_ENCONTRADA',
  ACCION_COBRANZA_CANAL_NO_SOPORTADO: 'ACCION_COBRANZA_CANAL_NO_SOPORTADO',
  ACCION_COBRANZA_ESTADO_NO_EJECUTABLE: 'ACCION_COBRANZA_ESTADO_NO_EJECUTABLE',
  ACCION_COBRANZA_SIN_PLANTILLA: 'ACCION_COBRANZA_SIN_PLANTILLA',
  ACCION_COBRANZA_EVENTO_NO_SOPORTADO: 'ACCION_COBRANZA_EVENTO_NO_SOPORTADO',
  ACCION_COBRANZA_DESTINATARIO_SIN_TELEFONO: 'ACCION_COBRANZA_DESTINATARIO_SIN_TELEFONO',

  // ── Cartera: evidencia jurídica y trazabilidad (CJ-*, PRQ-CAR-022) ───────
  // Prescripción, transferencias de propiedad, legal hold, procedencia de
  // contacto, envío de documentos y costas judiciales — bitácoras factuales
  // auditadas 2026-08-29 (VALUACION CAR_10, PROMPT-CAR-JUR-001).
  ACTUACION_INVALIDA: 'ACTUACION_INVALIDA',
  // CJ-4 §11.3: la plantilla contiene una afirmación jurídica prohibida.
  CONTENIDO_PROHIBIDO: 'CONTENIDO_PROHIBIDO',
  ENVIO_INVALIDO: 'ENVIO_INVALIDO',
  ENVIO_NO_ENCONTRADO: 'ENVIO_NO_ENCONTRADO',
  LEGAL_HOLD_NO_ENCONTRADO: 'LEGAL_HOLD_NO_ENCONTRADO',
  // Legal hold (CJ-3 §10.6): distinto de FONDO_MOTIVO_REQUERIDO/SOLICITUD_MOTIVO_REQUERIDO.
  MOTIVO_REQUERIDO: 'MOTIVO_REQUERIDO',
  // Procedencia del dato de contacto de un tercero (CJ-9): origen_id no
  // pertenece al catálogo ORIGEN_CONTACTO_TERCERO.
  ORIGEN_INVALIDO: 'ORIGEN_INVALIDO',
  // Nueva versión de una política de clasificación (§8.5): el origen no
  // existe o no es visible para este tenant.
  POLITICA_INVALIDA: 'POLITICA_INVALIDA',
  PROPIETARIO_ANTERIOR_INVALIDO: 'PROPIETARIO_ANTERIOR_INVALIDO',
  PROPIETARIO_NUEVO_INVALIDO: 'PROPIETARIO_NUEVO_INVALIDO',
  TIPO_ACTO_INVALIDO: 'TIPO_ACTO_INVALIDO',
  TIPO_TRANSFERENCIA_INVALIDO: 'TIPO_TRANSFERENCIA_INVALIDO',

  // ── Promesas y acuerdos de pago (F5) ────────────────────────────────────
  PROMESA_TRANSICION_INVALIDA: 'PROMESA_TRANSICION_INVALIDA',
  ACUERDO_ESTADO_INICIAL_INVALIDO: 'ACUERDO_ESTADO_INICIAL_INVALIDO',
  ACUERDO_TRANSICION_INVALIDA: 'ACUERDO_TRANSICION_INVALIDA',
  ACUERDO_REQUIERE_ADMINISTRADOR: 'ACUERDO_REQUIERE_ADMINISTRADOR',
  ACUERDO_AUTOAPROBACION: 'ACUERDO_AUTOAPROBACION',
  // registrar-pago: el pago no puede conciliarse contra la cuota del acuerdo.
  CUOTA_ACUERDO_NO_CONCILIABLE: 'CUOTA_ACUERDO_NO_CONCILIABLE',
  CUOTA_ACUERDO_INVALIDA: 'CUOTA_ACUERDO_INVALIDA',
  CUOTA_ACUERDO_TRANSICION_INVALIDA: 'CUOTA_ACUERDO_TRANSICION_INVALIDA',

  // ── Escalamiento (F6) ────────────────────────────────────────────────
  CARTERA_ETAPA_INICIAL_INVALIDA: 'CARTERA_ETAPA_INICIAL_INVALIDA',
  CARTERA_ETAPA_CONTEXTO_INMUTABLE: 'CARTERA_ETAPA_CONTEXTO_INMUTABLE',
  CARTERA_ETAPA_CONGELADA: 'CARTERA_ETAPA_CONGELADA',
  CARTERA_ETAPA_TRANSICION_INVALIDA: 'CARTERA_ETAPA_TRANSICION_INVALIDA',
  CARTERA_ETAPA_SIN_PROPUESTA: 'CARTERA_ETAPA_SIN_PROPUESTA',
  CARTERA_ETAPA_REQUIERE_ADMINISTRADOR: 'CARTERA_ETAPA_REQUIERE_ADMINISTRADOR',
  CARTERA_ETAPA_AUTOAPROBACION: 'CARTERA_ETAPA_AUTOAPROBACION',

  // ── Jurídico (F7) ────────────────────────────────────────────────────
  CERTIFICACION_REQUIERE_ADMINISTRADOR: 'CERTIFICACION_REQUIERE_ADMINISTRADOR',
  CERTIFICACION_INMUTABLE: 'CERTIFICACION_INMUTABLE',
  CERTIFICACION_TRANSICION_INVALIDA: 'CERTIFICACION_TRANSICION_INVALIDA',
  CERTIFICACION_ANULACION_SIN_MOTIVO: 'CERTIFICACION_ANULACION_SIN_MOTIVO',
  CERTIFICACION_SIN_DEUDA: 'CERTIFICACION_SIN_DEUDA',
  CERTIFICACION_SIN_POLITICA_VIGENTE: 'CERTIFICACION_SIN_POLITICA_VIGENTE',
  CASO_JURIDICO_REQUIERE_ADMINISTRADOR: 'CASO_JURIDICO_REQUIERE_ADMINISTRADOR',
  CASO_JURIDICO_CERTIFICACION_INVALIDA: 'CASO_JURIDICO_CERTIFICACION_INVALIDA',
  CASO_JURIDICO_ABOGADO_INVALIDO: 'CASO_JURIDICO_ABOGADO_INVALIDO',
  CASO_JURIDICO_CONTEXTO_INMUTABLE: 'CASO_JURIDICO_CONTEXTO_INMUTABLE',
  CASO_JURIDICO_CIERRE_REQUIERE_ADMINISTRADOR: 'CASO_JURIDICO_CIERRE_REQUIERE_ADMINISTRADOR',
  CASO_JURIDICO_INVALIDO: 'CASO_JURIDICO_INVALIDO',
  CASO_JURIDICO_NO_ENCONTRADO: 'CASO_JURIDICO_NO_ENCONTRADO',
  COSTA_JUDICIAL_INMUTABLE: 'COSTA_JUDICIAL_INMUTABLE',

  // ── Plantillas SMS ────────────────────────────────────────────────────
  SMS_UNKNOWN_EVENT: 'SMS_UNKNOWN_EVENT',
  SMS_BODY_TOO_LONG: 'SMS_BODY_TOO_LONG',
  SMS_UNKNOWN_FIELDS: 'SMS_UNKNOWN_FIELDS',
  SMS_INVALID_PHONE: 'SMS_INVALID_PHONE',
  SMS_TEMPLATE_NOT_FOUND: 'SMS_TEMPLATE_NOT_FOUND',
  SMS_EVENT_NOT_ACTIVE: 'SMS_EVENT_NOT_ACTIVE',
  SMS_SEND_FAILED: 'SMS_SEND_FAILED',

  // ── Plantillas de correo (Brevo templates) ─────────────────────────────
  EMAIL_UNKNOWN_EVENT: 'EMAIL_UNKNOWN_EVENT',
  EMAIL_BODY_TOO_SHORT: 'EMAIL_BODY_TOO_SHORT',
  EMAIL_UNKNOWN_FIELDS: 'EMAIL_UNKNOWN_FIELDS',
  EMAIL_MISSING_PARAMS_PREFIX: 'EMAIL_MISSING_PARAMS_PREFIX',
  EMAIL_TEMPLATE_NOT_FOUND: 'EMAIL_TEMPLATE_NOT_FOUND',

  // ── enviar-correo-compositor: envío real vía Brevo ──────────────────────
  // La API de Brevo respondió con error al intentar enviar el correo.
  BREVO_ERROR: 'BREVO_ERROR',
  COMPOSITOR_DESACTIVADO: 'COMPOSITOR_DESACTIVADO',
  // Faltan variables de entorno de Brevo (API key o remitente).
  CONFIG_INCOMPLETA: 'CONFIG_INCOMPLETA',
  PLANTILLA_DESACTIVADA: 'PLANTILLA_DESACTIVADA',
  PLANTILLA_NO_ENCONTRADA: 'PLANTILLA_NO_ENCONTRADA',

  // ── Fuente de financiación (20260830210000, lista_tipos) ────────────────
  FUENTE_FINANCIACION_TIPO_SIN_MAPEO: 'FUENTE_FINANCIACION_TIPO_SIN_MAPEO',
  TIPO_FUENTE_INEXISTENTE: 'TIPO_FUENTE_INEXISTENTE',
  TIPO_FUENTE_INVALIDO: 'TIPO_FUENTE_INVALIDO',
  TIPO_FUENTE_TENANT_INCONSISTENTE: 'TIPO_FUENTE_TENANT_INCONSISTENTE',

  // ── Agrupaciones de predios (20260830250000) ─────────────────────────────
  AGRUPACION_INEXISTENTE: 'AGRUPACION_INEXISTENTE',
  AGRUPACION_TIPO_INVALIDO: 'AGRUPACION_TIPO_INVALIDO',
  AGRUPACION_TIPO_TENANT_INCONSISTENTE: 'AGRUPACION_TIPO_TENANT_INCONSISTENTE',
  AGRUPACION_TIPO_INACTIVO: 'AGRUPACION_TIPO_INACTIVO',
  AGRUPACION_CICLO: 'AGRUPACION_CICLO',
  AGRUPACION_PADRE_INEXISTENTE: 'AGRUPACION_PADRE_INEXISTENTE',
  AGRUPACION_TENANT_INCONSISTENTE: 'AGRUPACION_TENANT_INCONSISTENTE',
  AGRUPACION_PROFUNDIDAD_MAXIMA: 'AGRUPACION_PROFUNDIDAD_MAXIMA',

  // ── Centro de costo en presupuesto (20260830420000) ──────────────────────
  CENTRO_COSTO_INEXISTENTE: 'CENTRO_COSTO_INEXISTENTE',
  CENTRO_COSTO_INVALIDO: 'CENTRO_COSTO_INVALIDO',
  CENTRO_COSTO_TENANT_INCONSISTENTE: 'CENTRO_COSTO_TENANT_INCONSISTENTE',
  CENTRO_COSTO_INACTIVO: 'CENTRO_COSTO_INACTIVO',

  // ── Comprobante de pago adjunto (20260903170000) ─────────────────────────
  PAGO_INVALIDO: 'PAGO_INVALIDO',

  // ── Pasarelas de pago (20260904100000, fase de estructura) ───────────────
  PASARELA_NO_CONFIGURADA: 'PASARELA_NO_CONFIGURADA',
  PASARELA_CREDENCIAL_INVALIDA: 'PASARELA_CREDENCIAL_INVALIDA',
  PASARELA_CREDENCIAL_FALTANTE: 'PASARELA_CREDENCIAL_FALTANTE',
  PASARELA_NO_VERIFICADA: 'PASARELA_NO_VERIFICADA',
  PASARELA_PROVEEDOR_NO_IMPLEMENTADO: 'PASARELA_PROVEEDOR_NO_IMPLEMENTADO',

  // ── Intenciones de pago por pasarela (20260904130000, fase 2) ────────────
  INTENCION_NO_PENDIENTE: 'INTENCION_NO_PENDIENTE',
  INTENCION_TERMINAL: 'INTENCION_TERMINAL',
  INTENCION_TRANSICION_INVALIDA: 'INTENCION_TRANSICION_INVALIDA',

  // ── Cobro real por pasarela: crear-intencion-pago / webhook-pasarela
  //    (fase 2, integración Wompi) ─────────────────────────────────────────
  PASARELA_MONTO_EXCEDE_SALDO: 'PASARELA_MONTO_EXCEDE_SALDO',
  PASARELA_WEBHOOK_TOKEN_INVALIDO: 'PASARELA_WEBHOOK_TOKEN_INVALIDO',
  PASARELA_WEBHOOK_FIRMA_INVALIDA: 'PASARELA_WEBHOOK_FIRMA_INVALIDA',
  PASARELA_TRANSACCION_NO_ENCONTRADA: 'PASARELA_TRANSACCION_NO_ENCONTRADA',
  PASARELA_INTENCION_NO_ENCONTRADA: 'PASARELA_INTENCION_NO_ENCONTRADA',
  PASARELA_RESPUESTA_INVALIDA: 'PASARELA_RESPUESTA_INVALIDA',

  // ── Conciliación bancaria (20260904170000, Fase 3 Bloque B) ──────────────
  CONCILIACION_ARCHIVO_NO_RECONOCIDO: 'CONCILIACION_ARCHIVO_NO_RECONOCIDO',
  CONCILIACION_LINEA_YA_RESUELTA: 'CONCILIACION_LINEA_YA_RESUELTA',
  CONCILIACION_DESCARTE_SIN_MOTIVO: 'CONCILIACION_DESCARTE_SIN_MOTIVO',

  // ── Proveedor de IA por copropiedad (20260935000000, fase de estructura) ─
  IA_NO_CONFIGURADA: 'IA_NO_CONFIGURADA',
  IA_CREDENCIAL_INVALIDA: 'IA_CREDENCIAL_INVALIDA',
  IA_CREDENCIAL_FALTANTE: 'IA_CREDENCIAL_FALTANTE',
  IA_NO_VERIFICADA: 'IA_NO_VERIFICADA',

  // ── Cartera: cron diario, webhook de acuses, siembra de configuración
  //    (CAR §18/§34, bloques 1-2 y 4) ────────────────────────────────────
  CARTERA_CONFIGURACION_YA_EXISTE: 'CARTERA_CONFIGURACION_YA_EXISTE',
  CRON_TOKEN_INVALIDO: 'CRON_TOKEN_INVALIDO',
  WEBHOOK_TOKEN_INVALIDO: 'WEBHOOK_TOKEN_INVALIDO',

  // ── Auditoría interna (20260915100000, PROMPT AUDITORÍA §34, §70) ────────
  HALLAZGO_NO_ENCONTRADO: 'HALLAZGO_NO_ENCONTRADO',
  EVIDENCIA_DUPLICADA: 'EVIDENCIA_DUPLICADA',

  // ── CO-1: marco contable y tributario de la copropiedad (20260930160000) ─
  MARCO_GRUPO_INMUTABLE_CON_CIERRE: 'MARCO_GRUPO_INMUTABLE_CON_CIERRE',
  MARCO_USO_INCOHERENTE: 'MARCO_USO_INCOHERENTE',

  // ── CO-2: núcleo del libro contable (20260930180000-20260930220000) ──────
  CONTABLE_PERIODO_TRANSICION_INVALIDA: 'CONTABLE_PERIODO_TRANSICION_INVALIDA',
  CONTABLE_PERIODO_REAPERTURA_SIN_MOTIVO: 'CONTABLE_PERIODO_REAPERTURA_SIN_MOTIVO',
  CONTABLE_PERIODO_CERRADO: 'CONTABLE_PERIODO_CERRADO',
  COMPROBANTE_ESTADO_INVALIDO: 'COMPROBANTE_ESTADO_INVALIDO',
  COMPROBANTE_SIN_DETALLE: 'COMPROBANTE_SIN_DETALLE',
  COMPROBANTE_DESCUADRADO: 'COMPROBANTE_DESCUADRADO',
  COMPROBANTE_DIMENSION_REQUERIDA: 'COMPROBANTE_DIMENSION_REQUERIDA',
  COMPROBANTE_FECHA_FUERA_DE_PERIODO: 'COMPROBANTE_FECHA_FUERA_DE_PERIODO',
  COMPROBANTE_NUMERO_NO_ASIGNABLE: 'COMPROBANTE_NUMERO_NO_ASIGNABLE',
  COMPROBANTE_CONTABILIZADO_INMUTABLE: 'COMPROBANTE_CONTABILIZADO_INMUTABLE',
  COMPROBANTE_YA_REVERSADO: 'COMPROBANTE_YA_REVERSADO',
  COMPROBANTE_MOTIVO_REQUERIDO: 'COMPROBANTE_MOTIVO_REQUERIDO',
  // Se surte como violación de contable_comprobante_origen_unico (unique_violation de
  // Postgres, 23505), no como `raise exception` — se registra igual para que el mapeo de
  // errores del frontend tenga un nombre estable que mostrar (CO-2 §3.3).
  COMPROBANTE_ORIGEN_DUPLICADO: 'COMPROBANTE_ORIGEN_DUPLICADO',

  // ── CO-3: materialización — de la proyección al asiento persistido
  //    (20260930240000-20260930260000) ─────────────────────────────────────
  // fn_contabilizar_periodo: precondición dura, contable_parametrizacion_pendiente()
  // no está vacío (excluyendo 'movimiento_sin_contrapartida', que no bloquea).
  CONTABLE_PARAMETRIZACION_PENDIENTE: 'CONTABLE_PARAMETRIZACION_PENDIENTE',

  // ── MANT-0: registro de activos, ficha contable y depreciación
  //    (20260930280000-20260930290000) ────────────────────────────────────
  ACTIVO_CATEGORIA_INVALIDA: 'ACTIVO_CATEGORIA_INVALIDA',
  ACTIVO_TIPO_INVALIDO: 'ACTIVO_TIPO_INVALIDO',
  ACTIVO_TENANT_INCONSISTENTE: 'ACTIVO_TENANT_INCONSISTENTE',
  ACTIVO_JERARQUIA_CICLICA: 'ACTIVO_JERARQUIA_CICLICA',
  ACTIVO_VALOR_RESIDUAL_INVALIDO: 'ACTIVO_VALOR_RESIDUAL_INVALIDO',
  ACTIVO_VIDA_UTIL_INVALIDA: 'ACTIVO_VIDA_UTIL_INVALIDA',
  ACTIVO_BLOQUE_CONTABLE_INCOMPLETO: 'ACTIVO_BLOQUE_CONTABLE_INCOMPLETO',
  ACTIVO_CUENTA_CLASE_INVALIDA: 'ACTIVO_CUENTA_CLASE_INVALIDA',
  ACTIVO_TRANSICION_INVALIDA: 'ACTIVO_TRANSICION_INVALIDA',
  // Hallazgo de esta sesión (Ley 675 art. 20, CTCP 243/2025): un bien común esencial nunca
  // puede capitalizarse, sin importar los demás campos — guard a nivel de trigger, no solo en
  // fn_mant_capitalizar_activo.
  ACTIVO_BIEN_ESENCIAL_NO_CAPITALIZABLE: 'ACTIVO_BIEN_ESENCIAL_NO_CAPITALIZABLE',
  ACTIVO_VALOR_ADQUISICION_NO_CONCILIA: 'ACTIVO_VALOR_ADQUISICION_NO_CONCILIA',
  // Documentado, nunca levantado por un `raise exception`: mant_calcular_depreciacion excluye
  // estructuralmente estado='retirado' de su proyección (mismo criterio que
  // COMPROBANTE_ORIGEN_DUPLICADO en CO-2 — un código con nombre estable para un comportamiento
  // que no pasa por raise exception).
  ACTIVO_RETIRADO_NO_DEPRECIA: 'ACTIVO_RETIRADO_NO_DEPRECIA',
  ACTIVO_MOTIVO_REQUERIDO: 'ACTIVO_MOTIVO_REQUERIDO',
  ACTIVO_INVALIDO: 'ACTIVO_INVALIDO',
  // subir-documento/index.ts: p_activo_id apunta a un activo inexistente o de otro tenant
  // (documentos.activo_id, D-92).
  ACTIVO_NO_ENCONTRADO: 'ACTIVO_NO_ENCONTRADO',

  // ── CO-7: deterioro de cartera (20260930400000-20260930410000) ─────────
  DETERIORO_TRAMOS_INCOMPLETOS: 'DETERIORO_TRAMOS_INCOMPLETOS',
  DETERIORO_TRAMOS_SOLAPADOS: 'DETERIORO_TRAMOS_SOLAPADOS',
  DETERIORO_PORCENTAJE_INVALIDO: 'DETERIORO_PORCENTAJE_INVALIDO',
  DETERIORO_SIN_POLITICA: 'DETERIORO_SIN_POLITICA',
  // El método 'individual' es un valor válido del enum deterioro_metodo_t pero no tiene
  // estructura ni cálculo definidos en este corte (CO-7 §4.1) — falla explícito, no improvisa.
  DETERIORO_METODO_NO_IMPLEMENTADO: 'DETERIORO_METODO_NO_IMPLEMENTADO',

  // ── CO-5: estados financieros y notas (20260930440000-20260930480000) ──
  MARCO_CONTABLE_SIN_CLASIFICAR: 'MARCO_CONTABLE_SIN_CLASIFICAR',
  ESTADO_NO_REQUERIDO_PARA_GRUPO: 'ESTADO_NO_REQUERIDO_PARA_GRUPO',
  NOTA_OBLIGATORIA_VACIA: 'NOTA_OBLIGATORIA_VACIA',
  // Defensivo: una formula mal escrita en el catálogo (contable_estado_linea) referencia un
  // codigo que no existe o que aún no se ha calculado en ese orden — nunca debería dispararse
  // con las plantillas sembradas por esta serie, pero el motor lo valida en vez de asumir.
  FORMULA_ESTADO_INVALIDA: 'FORMULA_ESTADO_INVALIDA',

  // ── CO-6: cierre, apertura y corrección de errores (20260930520000+) ────
  // fn_contable_cerrar_periodo: bloquea si contable_validacion_cierre() reporta al menos un
  // hallazgo bloqueante y forzar_advertencias no cubre advertencias (que nunca son forzables).
  CONTABLE_CIERRE_BLOQUEADO: 'CONTABLE_CIERRE_BLOQUEADO',
  // fn_contable_reabrir_periodo: ya existe un periodo posterior contable_estado en
  // ('cerrado','bloqueado') — reabrir este dejaría huecos en la secuencia contable.
  CONTABLE_PERIODO_POSTERIOR_CERRADO: 'CONTABLE_PERIODO_POSTERIOR_CERRADO',
  // fn_contable_reabrir_periodo: el ejercicio del periodo ya tiene comprobante CIERRE —
  // reabrir un periodo de un ejercicio ya cerrado exige antes deshacer el cierre del ejercicio.
  CONTABLE_EJERCICIO_YA_CERRADO: 'CONTABLE_EJERCICIO_YA_CERRADO',
  // fn_contable_cerrar_ejercicio: exige los 12 periodos del año en contable_estado='cerrado'
  // antes de construir el comprobante CIERRE.
  CONTABLE_EJERCICIO_PERIODOS_INCOMPLETOS: 'CONTABLE_EJERCICIO_PERIODOS_INCOMPLETOS',
  // fn_contable_abrir_ejercicio: la suma de débitos/créditos del comprobante APERTURA
  // construido a partir del balance de cierre no cuadra — nunca debería dispararse si el
  // balance de prueba previo estaba cuadrado, pero se valida antes de contabilizar.
  CONTABLE_APERTURA_DESCUADRADA: 'CONTABLE_APERTURA_DESCUADRADA',
  // fn_contable_corregir_error: origen en un periodo todavía abierto — se corrige por
  // anulación directa (CO-2, fn_reversar_comprobante), no por esta ruta.
  CONTABLE_CORRECCION_PERIODO_ABIERTO: 'CONTABLE_CORRECCION_PERIODO_ABIERTO',
  // fn_contable_corregir_error: ejercicio cerrado + tenant Grupo 2 (Grupo 1 Pleno NIIF /
  // Grupo 2 Pyme bajo NIIF) — CTCP 0146/2025 solo habilita la corrección en el periodo
  // corriente para Grupo 3; Grupo 2 exige reexpresión de estados comparativos, fuera de
  // alcance de este corte.
  CONTABLE_CORRECCION_GRUPO_NO_RESUELTO: 'CONTABLE_CORRECCION_GRUPO_NO_RESUELTO',

  // ── MANT-1: atributos técnicos dinámicos y criticidad (20260930660000+) ─
  // guard_atributo_definicion_valida: tipo_activo_id/unidad_id no pertenecen a su familia de
  // lista_tipos, u opciones presente/ausente en desacuerdo con tipo_dato.
  ATRIBUTO_DEFINICION_TIPO_ACTIVO_INVALIDO: 'ATRIBUTO_DEFINICION_TIPO_ACTIVO_INVALIDO',
  ATRIBUTO_DEFINICION_UNIDAD_INVALIDA: 'ATRIBUTO_DEFINICION_UNIDAD_INVALIDA',
  ATRIBUTO_DEFINICION_OPCIONES_REQUERIDAS: 'ATRIBUTO_DEFINICION_OPCIONES_REQUERIDAS',
  // guard_activo_atributos: una clave de activos.atributos no está definida para el tipo del
  // activo, o su valor no corresponde al tipo_dato declarado.
  ATRIBUTO_NO_DEFINIDO: 'ATRIBUTO_NO_DEFINIDO',
  ATRIBUTO_TIPO_INVALIDO: 'ATRIBUTO_TIPO_INVALIDO',
  ATRIBUTO_OPCION_INVALIDA: 'ATRIBUTO_OPCION_INVALIDA',
  // guard_activo_atributos_obligatorios: falta un atributo obligatorio al entrar a en_servicio.
  ATRIBUTO_OBLIGATORIO_FALTANTE: 'ATRIBUTO_OBLIGATORIO_FALTANTE',
  // guard_criticidad_set_pesos_completos: la suma de pesos del set no es 100 al pasar a vigente.
  CRITICIDAD_PESOS_INVALIDOS: 'CRITICIDAD_PESOS_INVALIDOS',
  // guard_activo_criticidad_puntaje: `valor` no es una clave real de la escala del criterio.
  CRITICIDAD_VALOR_INVALIDO: 'CRITICIDAD_VALOR_INVALIDO',
  // mant_criticidad: el tenant del activo no tiene ningún set de criterios vigente.
  CRITICIDAD_SIN_SET_VIGENTE: 'CRITICIDAD_SIN_SET_VIGENTE',
  // mant_criticidad: falta la evaluación de al menos un criterio del set vigente para este
  // activo — falla explícito en vez de devolver un puntaje parcial silencioso (Plan del corte).
  CRITICIDAD_EVALUACION_INCOMPLETA: 'CRITICIDAD_EVALUACION_INCOMPLETA',

  // ── MANT-2: cumplimiento normativo (20260930740000+) ────────────────────
  // guard_requisito_referencia: un requisito tecnico_fabricante/contractual/interno sin
  // norma_referencia propia — sin norma pública detrás, sería una invención.
  REQUISITO_SIN_REFERENCIA: 'REQUISITO_SIN_REFERENCIA',
  // guard_mant_cumplimiento: sin evidencia_referencia, sin tercero/acreditación cuando el
  // requisito lo exige, o el activo no es del tipo que el requisito exige.
  CUMPLIMIENTO_SIN_EVIDENCIA: 'CUMPLIMIENTO_SIN_EVIDENCIA',
  CUMPLIMIENTO_SIN_ACREDITACION: 'CUMPLIMIENTO_SIN_ACREDITACION',
  CUMPLIMIENTO_ACTIVO_TIPO_INVALIDO: 'CUMPLIMIENTO_ACTIVO_TIPO_INVALIDO',

  // ── FIN-1: posición de tesorería (20260930780000+) ──────────────────────
  // guard_finanzas_compromiso_bancario reutiliza CUENTA_BANCARIA_INEXISTENTE/
  // CUENTA_BANCARIA_TENANT_INCONSISTENTE (ya registrados arriba, línea ~199).
  // origen_id ausente/presente en desacuerdo con el origen del compromiso.
  COMPROMISO_BANCARIO_ORIGEN_INVALIDO: 'COMPROMISO_BANCARIO_ORIGEN_INVALIDO',
  // R central del corte: un compromiso reservado dejaría el disponible en negativo.
  COMPROMISO_BANCARIO_EXCEDE_DISPONIBLE: 'COMPROMISO_BANCARIO_EXCEDE_DISPONIBLE',
  // guard_finanzas_compromiso_bancario_transicion.
  COMPROMISO_BANCARIO_TERMINAL_INMUTABLE: 'COMPROMISO_BANCARIO_TERMINAL_INMUTABLE',
  COMPROMISO_BANCARIO_TRANSICION_INVALIDA: 'COMPROMISO_BANCARIO_TRANSICION_INVALIDA',
  COMPROMISO_BANCARIO_SIN_MOTIVO: 'COMPROMISO_BANCARIO_SIN_MOTIVO',
  // guard_finanzas_politica_tesoreria: banco/fondo en bancos_utilizables/fondos_utilizables que
  // no pertenece al tenant.
  POLITICA_TESORERIA_ENTIDAD_AJENA: 'POLITICA_TESORERIA_ENTIDAD_AJENA',

  // ── MANT-3: planes de mantenimiento y motor de programación (20260930820000+) ──
  // guard_mant_plan: tipo_mantenimiento_id no pertenece a TIPO_MANTENIMIENTO.
  PLAN_TIPO_MANTENIMIENTO_INVALIDO: 'PLAN_TIPO_MANTENIMIENTO_INVALIDO',
  // guard_mant_plan: no exactamente un destino de alcance_* poblado según `alcance`, o el
  // tipo_activo_id/categoria_id de destino no pertenece a su familia de lista_tipos.
  PLAN_ALCANCE_INCONSISTENTE: 'PLAN_ALCANCE_INCONSISTENTE',
  // guard_mant_plan: requisito/activo/agrupación/zona común referenciados de otro tenant.
  PLAN_TENANT_INCONSISTENTE: 'PLAN_TENANT_INCONSISTENTE',
  // guard_mant_plan: frecuencia_origen = 'heredada_requisito' sin requisito_id.
  PLAN_HERENCIA_SIN_REQUISITO: 'PLAN_HERENCIA_SIN_REQUISITO',
  // guard_mant_plan: prueba central del corte — un plan no puede programar con frecuencia mayor
  // (menos seguido) que la que exige su requisito.
  PLAN_FRECUENCIA_INFERIOR_A_EXIGIDA: 'PLAN_FRECUENCIA_INFERIOR_A_EXIGIDA',
  // guard_mant_plan: ventana_dias excede la frecuencia del plan.
  PLAN_VENTANA_INVALIDA: 'PLAN_VENTANA_INVALIDA',
  // guard_mant_plan: un plan no puede nacer activo (INSERT) ni activarse (UPDATE) sin tareas.
  PLAN_SIN_TAREAS: 'PLAN_SIN_TAREAS',
  // fn_mant_resolver_alcance_plan / fn_mant_activar_plan / fn_mant_generar_programaciones.
  PLAN_INEXISTENTE: 'PLAN_INEXISTENTE',
  // fn_mant_generar_programaciones: el plan no está activo.
  PLAN_INACTIVO: 'PLAN_INACTIVO',
  // guard_mant_programacion_transicion: generada/omitida/cancelada son terminales — ninguna
  // columna admite cambios después, no solo `estado` (lección de D-54/FIN-1).
  PROGRAMACION_TERMINAL_INMUTABLE: 'PROGRAMACION_TERMINAL_INMUTABLE',
  PROGRAMACION_TRANSICION_INVALIDA: 'PROGRAMACION_TRANSICION_INVALIDA',
  PROGRAMACION_OMISION_SIN_MOTIVO: 'PROGRAMACION_OMISION_SIN_MOTIVO',

  // ── MANT-4: incidencias y órdenes de trabajo (20260930890000+) ──────────
  // guard_mant_incidencia: tipo_id/origen_id/severidad_id/prioridad_id no pertenecen a su
  // familia de lista_tipos.
  INCIDENCIA_TIPO_INVALIDO: 'INCIDENCIA_TIPO_INVALIDO',
  INCIDENCIA_ORIGEN_INVALIDO: 'INCIDENCIA_ORIGEN_INVALIDO',
  INCIDENCIA_SEVERIDAD_INVALIDA: 'INCIDENCIA_SEVERIDAD_INVALIDA',
  INCIDENCIA_PRIORIDAD_INVALIDA: 'INCIDENCIA_PRIORIDAD_INVALIDA',
  // guard_mant_incidencia: activo/zona_comun/agrupacion/inmueble/incidencia padre de otro tenant.
  INCIDENCIA_TENANT_INCONSISTENTE: 'INCIDENCIA_TENANT_INCONSISTENTE',
  // guard_mant_incidencia: prioridad_id difiere de la sugerida sin prioridad_sobrescrita_motivo.
  PRIORIDAD_SOBRESCRITA_SIN_MOTIVO: 'PRIORIDAD_SOBRESCRITA_SIN_MOTIVO',
  // guard_mant_incidencia: estado -> 'descartada' sin descartada_motivo.
  INCIDENCIA_DESCARTE_SIN_MOTIVO: 'INCIDENCIA_DESCARTE_SIN_MOTIVO',
  // guard_mant_incidencia / fn_mant_convertir_incidencia_a_ot: transición de estado no permitida.
  INCIDENCIA_TRANSICION_INVALIDA: 'INCIDENCIA_TRANSICION_INVALIDA',
  // fn_mant_cerrar_ot / fn_mant_convertir_incidencia_a_ot / fn_mant_generar_ot_desde_programacion.
  INCIDENCIA_INEXISTENTE: 'INCIDENCIA_INEXISTENTE',
  OT_INEXISTENTE: 'OT_INEXISTENTE',
  // guard_mant_ot: tipo_mantenimiento_id no pertenece a TIPO_MANTENIMIENTO.
  OT_TIPO_MANTENIMIENTO_INVALIDO: 'OT_TIPO_MANTENIMIENTO_INVALIDO',
  // guard_mant_ot: programacion_id/incidencia_id/inspeccion_id en desacuerdo con `origen`.
  OT_ORIGEN_INCONSISTENTE: 'OT_ORIGEN_INCONSISTENTE',
  // guard_mant_ot: activo/programación/requisito/tercero de otro tenant.
  OT_TENANT_INCONSISTENTE: 'OT_TENANT_INCONSISTENTE',
  // guard_mant_ot: estado -> 'cancelada' sin cancelada_motivo.
  OT_CANCELACION_SIN_MOTIVO: 'OT_CANCELACION_SIN_MOTIVO',
  // guard_mant_ot: transición de estado no permitida, o 'cerrada' fuera de fn_mant_cerrar_ot.
  OT_TRANSICION_INVALIDA: 'OT_TRANSICION_INVALIDA',
  // guard_mant_ot / guard_mant_ot_tarea / guard_mant_ot_medicion: la OT ya está cerrada —
  // terminal para cualquier columna, propia o de sus tablas hijas.
  OT_CERRADA_INMUTABLE: 'OT_CERRADA_INMUTABLE',
  // fn_mant_cerrar_ot: falta una tarea obligatoria, una medición o una evidencia exigida —
  // prueba central del corte, el mensaje enumera exactamente qué falta.
  OT_CIERRE_INCOMPLETO: 'OT_CIERRE_INCOMPLETO',
  // fn_mant_cerrar_ot: el requisito exige tercero acreditado y la OT no lo tiene.
  OT_CUMPLIMIENTO_SIN_ACREDITACION: 'OT_CUMPLIMIENTO_SIN_ACREDITACION',
  // guard_mant_ot_tarea: estado -> 'no_aplica' sin no_aplica_motivo.
  TAREA_NO_APLICA_SIN_MOTIVO: 'TAREA_NO_APLICA_SIN_MOTIVO',

  // ── MANT-5: proveedores, contratos y garantías (20260931020000+) ────────
  // guard_mant_proveedor_habilitacion / guard_mant_habilitacion_requerida: tipo_id/
  // tipo_habilitacion_id no pertenecen a TIPO_HABILITACION.
  HABILITACION_TIPO_INVALIDO: 'HABILITACION_TIPO_INVALIDO',
  // guard_mant_proveedor_habilitacion: tercero/documento de otro tenant.
  HABILITACION_TENANT_INCONSISTENTE: 'HABILITACION_TENANT_INCONSISTENTE',
  // guard_mant_proveedor_habilitacion: sin documento_id — una habilitación sin certificado es
  // una afirmación (§4.1). Columna nullable a propósito para poder emitir este mensaje propio.
  HABILITACION_SIN_SOPORTE: 'HABILITACION_SIN_SOPORTE',
  // guard_mant_habilitacion_requerida: condicion_tipo categoria_activo/tipo_mantenimiento sin
  // condicion_valor.
  HABILITACION_CONDICION_VALOR_REQUERIDO: 'HABILITACION_CONDICION_VALOR_REQUERIDO',
  // guard_mant_habilitacion_requerida: condicion_tipo trabajo_alturas/parada_servicio con un
  // condicion_valor que no aplica (la condición es la bandera misma).
  HABILITACION_CONDICION_VALOR_NO_APLICA: 'HABILITACION_CONDICION_VALOR_NO_APLICA',
  // guard_mant_habilitacion_requerida: condicion_valor no resuelve contra la familia de
  // lista_tipos esperada, o no es un numérico válido.
  HABILITACION_CONDICION_VALOR_INVALIDO: 'HABILITACION_CONDICION_VALOR_INVALIDO',
  // guard_mant_habilitacion_requerida: condicion_tipo = monto_minimo sin un condicion_valor
  // numérico no negativo.
  HABILITACION_MONTO_INVALIDO: 'HABILITACION_MONTO_INVALIDO',
  // guard_mant_proveedor_perfil / guard_mant_proveedor_evaluacion: tercero de otro tenant.
  PROVEEDOR_TENANT_INCONSISTENTE: 'PROVEEDOR_TENANT_INCONSISTENTE',
  // guard_mant_proveedor_perfil: un elemento de categorias_servicio (o estado_comercial_id) no
  // pertenece a su familia de lista_tipos.
  PROVEEDOR_CATEGORIA_INVALIDA: 'PROVEEDOR_CATEGORIA_INVALIDA',
  // guard_mant_ot (extendido, MANT-5 §4.2): el tercero asignado no tiene una habilitación
  // bloqueante vigente que la OT exige — prueba central del corte, el mensaje da el detalle.
  OT_CONTRATISTA_NO_HABILITADO: 'OT_CONTRATISTA_NO_HABILITADO',
  // guard_mant_contrato: tipo_id/periodicidad_id no pertenecen a su familia de lista_tipos.
  CONTRATO_TIPO_INVALIDO: 'CONTRATO_TIPO_INVALIDO',
  CONTRATO_PERIODICIDAD_INVALIDA: 'CONTRATO_PERIODICIDAD_INVALIDA',
  // guard_mant_contrato / guard_mant_contrato_activos / guard_mant_contrato_clausulas /
  // guard_mant_ot (extendido): tercero/activo/contrato de otro tenant.
  CONTRATO_TENANT_INCONSISTENTE: 'CONTRATO_TENANT_INCONSISTENTE',
  // guard_mant_contrato: transición de estado no permitida (solo borrador/vigente/suspendido/
  // terminado — 'por_vencer'/'vencido' nunca son estados escribibles, se calculan en
  // mant_contrato_estado_visible).
  CONTRATO_TRANSICION_INVALIDA: 'CONTRATO_TRANSICION_INVALIDA',
  // guard_mant_contrato: 'terminado' es terminal para cualquier columna.
  CONTRATO_TERMINADO_INMUTABLE: 'CONTRATO_TERMINADO_INMUTABLE',
  // guard_mant_contrato: contrato_anterior_id se referencia a sí mismo o a otro tenant.
  CONTRATO_ANTERIOR_INVALIDO: 'CONTRATO_ANTERIOR_INVALIDO',
  // guard_mant_garantia / guard_mant_garantia_reclamacion: activo/tercero/contrato/garantía de
  // otro tenant.
  GARANTIA_TENANT_INCONSISTENTE: 'GARANTIA_TENANT_INCONSISTENTE',
  // guard_mant_garantia: origen = 'contrato' sin contrato_id, o un origen distinto con
  // contrato_id poblado.
  GARANTIA_ORIGEN_INCONSISTENTE: 'GARANTIA_ORIGEN_INCONSISTENTE',
  // guard_mant_garantia_reclamacion: resultado_id no pertenece a RESULTADO_RECLAMACION_GARANTIA.
  GARANTIA_RESULTADO_INVALIDO: 'GARANTIA_RESULTADO_INVALIDO',

  // ── MANT-6: inventario de repuestos y costos (20260932100000+) ──────────
  // guard_mant_repuesto: categoria_id/unidad_id no pertenecen a CATEGORIA_REPUESTO/UNIDAD_MEDIDA.
  REPUESTO_CATEGORIA_INVALIDA: 'REPUESTO_CATEGORIA_INVALIDA',
  REPUESTO_UNIDAD_INVALIDA: 'REPUESTO_UNIDAD_INVALIDA',
  // guard_mant_repuesto: tercero/cuenta contable de otro tenant.
  REPUESTO_TENANT_INCONSISTENTE: 'REPUESTO_TENANT_INCONSISTENTE',
  // guard_mant_almacen: zona_comun_id de otro tenant.
  ALMACEN_TENANT_INCONSISTENTE: 'ALMACEN_TENANT_INCONSISTENTE',
  // guard_mant_inventario_movimiento: cantidad <= 0.
  MOVIMIENTO_CANTIDAD_INVALIDA: 'MOVIMIENTO_CANTIDAD_INVALIDA',
  // guard_mant_inventario_movimiento reutiliza MOVIMIENTO_TENANT_INCONSISTENTE (ya registrado
  // arriba, PC-4) para repuesto/almacén/tercero/documento/OT de otro tenant.
  // guard_mant_inventario_movimiento: una salida (o el lado -1 de una transferencia) dejaría
  // mant_stock() por debajo de cero.
  STOCK_INSUFICIENTE: 'STOCK_INSUFICIENTE',
  // guard_mant_inventario_movimiento: tipo = 'ajuste' sin motivo.
  AJUSTE_SIN_MOTIVO: 'AJUSTE_SIN_MOTIVO',
  // guard_mant_inventario_movimiento: tipo = 'transferencia' sin pasar por
  // fn_mant_transferir_repuesto (bandera de sesión ausente), o transferencia_par_id inválido.
  TRANSFERENCIA_DESTINO_INVALIDO: 'TRANSFERENCIA_DESTINO_INVALIDO',

  // ── MANT-7: inspecciones, hallazgos y acciones correctivas (20260932200000+) ──
  // guard_mant_inspeccion_formato: tipo_id no pertenece a TIPO_INSPECCION.
  INSPECCION_FORMATO_TIPO_INVALIDO: 'INSPECCION_FORMATO_TIPO_INVALIDO',
  // guard_mant_inspeccion_formato/guard_mant_inspeccion_formato_item_inmutable: requisito_id o el
  // propio formato de un ítem no pertenecen al tenant.
  INSPECCION_FORMATO_TENANT_INCONSISTENTE: 'INSPECCION_FORMATO_TENANT_INCONSISTENTE',
  // guard_mant_inspeccion_formato_inmutable: el formato ya está vigente/historica y el cambio no
  // es la única transición permitida (vigente→historica).
  INSPECCION_FORMATO_INMUTABLE: 'INSPECCION_FORMATO_INMUTABLE',
  // guard_mant_inspeccion_formato_item_inmutable: INSERT/UPDATE/DELETE de un ítem cuando su
  // formato ya no está borrador.
  INSPECCION_FORMATO_ITEM_INMUTABLE: 'INSPECCION_FORMATO_ITEM_INMUTABLE',
  // fn_mant_registrar_inspeccion: el formato no está vigente.
  INSPECCION_FORMATO_NO_VIGENTE: 'INSPECCION_FORMATO_NO_VIGENTE',
  // fn_mant_registrar_inspeccion: formato/activo/tercero/ítem de otro tenant o inexistente.
  INSPECCION_TENANT_INCONSISTENTE: 'INSPECCION_TENANT_INCONSISTENTE',
  // guard_mant_inspeccion_flag: INSERT directo en mant_inspecciones/mant_inspeccion_respuestas/
  // mant_hallazgos fuera de fn_mant_registrar_inspeccion (bandera de sesión ausente).
  INSPECCION_REGISTRO_DIRECTO_PROHIBIDO: 'INSPECCION_REGISTRO_DIRECTO_PROHIBIDO',
  // fn_mant_registrar_inspeccion: resultado enviado difiere del resultado_sugerido calculado
  // desde las respuestas, sin resultado_motivo.
  INSPECCION_RESULTADO_SOBRESCRITO_SIN_MOTIVO: 'INSPECCION_RESULTADO_SOBRESCRITO_SIN_MOTIVO',
  // fn_mant_registrar_inspeccion: el formato exige tercero acreditado (vía mant_requisito) y
  // falta tercero_id/acreditacion_referencia.
  INSPECCION_CUMPLIMIENTO_SIN_ACREDITACION: 'INSPECCION_CUMPLIMIENTO_SIN_ACREDITACION',
  // guard_mant_hallazgo_insert/guard_mant_hallazgo_transicion: inspección/OT/órgano de otro
  // tenant.
  HALLAZGO_TENANT_INCONSISTENTE: 'HALLAZGO_TENANT_INCONSISTENTE',
  // guard_mant_hallazgo_insert: severidad critico/mayor sin fecha_limite.
  HALLAZGO_SIN_FECHA_LIMITE: 'HALLAZGO_SIN_FECHA_LIMITE',
  // guard_mant_hallazgo_transicion: la inspección de origen demuestra un requisito
  // legal_nacional/legal_territorial — nunca se puede aceptar.
  HALLAZGO_LEGAL_NO_ACEPTABLE: 'HALLAZGO_LEGAL_NO_ACEPTABLE',
  // guard_mant_hallazgo_transicion: aceptar sin motivo, o crítico sin organo_aprobador_id cuando
  // el tenant tiene al menos un gobierno_organos vigente.
  HALLAZGO_ACEPTACION_SIN_JUSTIFICACION: 'HALLAZGO_ACEPTACION_SIN_JUSTIFICACION',
  // guard_mant_hallazgo_transicion: cerrar un hallazgo critico/mayor sin
  // cerrado_evidencia_documento_id.
  HALLAZGO_CIERRE_SIN_EVIDENCIA: 'HALLAZGO_CIERRE_SIN_EVIDENCIA',
  // fn_mant_asignar_ot_hallazgo/fn_mant_aceptar_hallazgo/fn_mant_cerrar_hallazgo: p_hallazgo_id
  // no existe.
  HALLAZGO_INEXISTENTE: 'HALLAZGO_INEXISTENTE',
  // fn_mant_asignar_ot_hallazgo/fn_mant_aceptar_hallazgo/fn_mant_cerrar_hallazgo: el hallazgo ya
  // está cerrado.
  HALLAZGO_TRANSICION_INVALIDA: 'HALLAZGO_TRANSICION_INVALIDA',

  // ── MANT-8: indicadores y tendencias de mantenimiento (20260932400000+) ──
  // mant_tendencia_fallas: p_ventanas < 2 (no hay ventana anterior con qué comparar).
  TENDENCIA_VENTANAS_INSUFICIENTES: 'TENDENCIA_VENTANAS_INSUFICIENTES',
  // mant_tendencia_fallas: p_dias_ventana < 1.
  TENDENCIA_DIAS_VENTANA_INVALIDO: 'TENDENCIA_DIAS_VENTANA_INVALIDO',

  // ── MANT-9: salud del activo y apoyo a la decisión (20260932450000+) ──
  // guard_salud_set_pesos_completos: los pesos de un set no suman 100 al activarlo.
  SALUD_PESOS_INVALIDOS: 'SALUD_PESOS_INVALIDOS',
  // guard_salud_factor_fuente: fuente_id no pertenece a FUENTE_SALUD_FACTOR.
  SALUD_FACTOR_FUENTE_INVALIDA: 'SALUD_FACTOR_FUENTE_INVALIDA',
  // fn_mant_registrar_salud_snapshot: mant_salud() devolvió índice null (sin datos).
  SALUD_SIN_DATOS: 'SALUD_SIN_DATOS',
  // guard_mant_escenario: activo_id/decision_id de otro tenant.
  ESCENARIO_TENANT_INCONSISTENTE: 'ESCENARIO_TENANT_INCONSISTENTE',
  // guard_mant_escenario: supuestos no es un objeto jsonb.
  ESCENARIO_SUPUESTOS_FORMATO_INVALIDO: 'ESCENARIO_SUPUESTOS_FORMATO_INVALIDO',
  // mant_evaluar_escenario: falta un supuesto de origen usuario que el tipo exige.
  ESCENARIO_SUPUESTOS_INCOMPLETOS: 'ESCENARIO_SUPUESTOS_INCOMPLETOS',
  // mant_evaluar_escenario: p_escenario_id no existe.
  ESCENARIO_INEXISTENTE: 'ESCENARIO_INEXISTENTE',

  // ── FIN-2: factura de proveedor y retenciones aplicadas (20260931120000+) ──
  // guard_finanzas_factura_proveedor: proveedor/contrato/cuenta presupuestal/ejecución de otro
  // tenant. Reutiliza CUENTA_NO_ES_HOJA (ya registrado) para presupuesto_cuenta_id.
  FACTURA_TENANT_INCONSISTENTE: 'FACTURA_TENANT_INCONSISTENTE',
  // guard_finanzas_factura_proveedor: (tenant, proveedor, numero_documento) ya existe.
  FACTURA_DUPLICADA: 'FACTURA_DUPLICADA',
  // guard_finanzas_factura_proveedor: presupuesto_ejecucion_id ya enlazado a otra factura.
  EJECUCION_YA_FACTURADA: 'EJECUCION_YA_FACTURADA',
  // guard_finanzas_factura_proveedor / guard_finanzas_factura_retencion: total_bruto ≠ subtotal +
  // iva_generado, total_neto_pagar ≠ total_bruto − total_retenciones, o valor ≠ base × tarifa / 100.
  FACTURA_ARITMETICA_INCONSISTENTE: 'FACTURA_ARITMETICA_INCONSISTENTE',
  // guard_finanzas_factura_proveedor: iva_descontable > 0 sin tenants.responsable_iva (CO-1).
  IVA_DESCONTABLE_INCONSISTENTE: 'IVA_DESCONTABLE_INCONSISTENTE',
  // guard_finanzas_factura_proveedor: transición de estado no permitida, o intento de UPDATE
  // directo a 'aprobada' sin pasar por fn_finanzas_aprobar_factura.
  FACTURA_TRANSICION_INVALIDA: 'FACTURA_TRANSICION_INVALIDA',
  FACTURA_ANULACION_SIN_MOTIVO: 'FACTURA_ANULACION_SIN_MOTIVO',
  FACTURA_DISPUTA_SIN_MOTIVO: 'FACTURA_DISPUTA_SIN_MOTIVO',
  // guard_finanzas_factura_proveedor: 'pagada' es terminal para cualquier columna sustantiva.
  FACTURA_PAGADA_INMUTABLE: 'FACTURA_PAGADA_INMUTABLE',
  // guard_finanzas_factura_retencion: CO-8 (tributario_concepto_retencion) no existe todavía —
  // no se pueden registrar retenciones hasta entonces (marco §1.6, no inventar catálogo).
  RETENCION_CATALOGO_TRIBUTARIO_AUSENTE: 'RETENCION_CATALOGO_TRIBUTARIO_AUSENTE',
  // fn_finanzas_aprobar_factura: la factura no existe.
  FACTURA_INEXISTENTE: 'FACTURA_INEXISTENTE',
  // fn_finanzas_aprobar_factura: aprobar exige documento_soporte_id.
  FACTURA_APROBACION_SIN_SOPORTE: 'FACTURA_APROBACION_SIN_SOPORTE',
  // fn_finanzas_aprobar_factura: la ejecución preexistente enlazada tiene un monto distinto de
  // total_neto_pagar.
  FACTURA_EJECUCION_MONTO_DISCREPA: 'FACTURA_EJECUCION_MONTO_DISCREPA',
  // fn_finanzas_aprobar_factura: sin presupuesto_ejecucion_id ni presupuesto_cuenta_id no hay
  // contra qué rubro crear la ejecución (columna añadida sobre el corte original, ver
  // 20260931140000).
  FACTURA_SIN_CUENTA_PRESUPUESTAL: 'FACTURA_SIN_CUENTA_PRESUPUESTAL',
  // fn_finanzas_aprobar_factura: reservado para cuando GOB-1 exista — hoy, sin
  // gobierno_organos, se registra como advertencia inspeccionable en
  // finanzas_factura_advertencia en vez de rechazar (FIN_02_INFORME.md).
  FACTURA_APROBACION_ORGANO_INCOMPETENTE: 'FACTURA_APROBACION_ORGANO_INCOMPETENTE',

  // ── FIN-3: programación y ejecución de pagos por lote (20260931220000+) ──
  // guard_finanzas_lote_pago: el lote no existe, o la fila referenciada no pertenece al tenant.
  LOTE_TENANT_INCONSISTENTE: 'LOTE_TENANT_INCONSISTENTE',
  // guard_finanzas_lote_pago: transición de estado no permitida, o intento de UPDATE directo a
  // aprobado/ejecutado/conciliado/anulado sin pasar por su función correspondiente.
  LOTE_TRANSICION_INVALIDA: 'LOTE_TRANSICION_INVALIDA',
  LOTE_ANULACION_SIN_MOTIVO: 'LOTE_ANULACION_SIN_MOTIVO',
  // guard_finanzas_lote_pago: 'conciliado'/'anulado' son terminales, cualquier columna.
  LOTE_CONCILIADO_INMUTABLE: 'LOTE_CONCILIADO_INMUTABLE',
  // guard_finanzas_lote_item: la factura no está 'aprobada'.
  LOTE_ITEM_FACTURA_NO_APROBADA: 'LOTE_ITEM_FACTURA_NO_APROBADA',
  // guard_finanzas_lote_item: la factura ya está en otro lote activo (no anulado).
  LOTE_ITEM_FACTURA_YA_PROGRAMADA: 'LOTE_ITEM_FACTURA_YA_PROGRAMADA',
  // guard_finanzas_lote_item: pago no parcial con monto distinto del pendiente de la factura.
  LOTE_ITEM_MONTO_INCONSISTENTE: 'LOTE_ITEM_MONTO_INCONSISTENTE',
  // guard_finanzas_lote_item: pago parcial con monto mayor o igual al pendiente de la factura.
  LOTE_ITEM_PARCIAL_INVALIDO: 'LOTE_ITEM_PARCIAL_INVALIDO',
  // guard_finanzas_lote_item: el lote ya no admite agregar/quitar ítems (no está en
  // borrador/programado), o se intentó editar un campo inmutable del ítem.
  LOTE_ITEM_LOTE_NO_MODIFICABLE: 'LOTE_ITEM_LOTE_NO_MODIFICABLE',
  // fn_finanzas_aprobar_lote: al menos un proveedor del lote tiene una habilitación vencida o
  // próxima a vencer (mant_habilitaciones_semaforo) y no se dio justificación.
  LOTE_APROBACION_SIN_JUSTIFICACION: 'LOTE_APROBACION_SIN_JUSTIFICACION',
  // fn_finanzas_aprobar_lote: reservado para cuando GOB-1 exista — hoy, sin gobierno_organos, se
  // registra como advertencia inspeccionable en finanzas_lote_advertencia en vez de rechazar
  // (mismo criterio que FACTURA_APROBACION_ORGANO_INCOMPETENTE, FIN_03_INFORME.md).
  LOTE_APROBACION_ORGANO_INCOMPETENTE: 'LOTE_APROBACION_ORGANO_INCOMPETENTE',
  // fn_finanzas_aprobar_lote/ejecutar_lote/anular_lote/conciliar_lote: el lote no existe.
  LOTE_INEXISTENTE: 'LOTE_INEXISTENTE',
  // guard_fondo_movimiento (BLOQUE H, D-112): lote_pago_id no pertenece al tenant.
  LOTE_PAGO_INVALIDO: 'LOTE_PAGO_INVALIDO',

  // ── Conciliación bancaria CONTABLE — Fase 3/5 (20260935060000+, D-115/D-117) ──
  // guard_conciliacion_bancaria_transicion: 'certificada' es terminal (D-CB-3), no se reabre.
  CONCILIACION_BANCARIA_YA_CERTIFICADA: 'CONCILIACION_BANCARIA_YA_CERTIFICADA',
  // guard_conciliacion_bancaria_partida_coherencia: conciliacion_id no existe.
  CONCILIACION_BANCARIA_INEXISTENTE: 'CONCILIACION_BANCARIA_INEXISTENTE',
  // guard_conciliacion_bancaria_partida_coherencia: la partida y su cabecera son de tenants distintos.
  CONCILIACION_BANCARIA_TENANT_INCONSISTENTE: 'CONCILIACION_BANCARIA_TENANT_INCONSISTENTE',
  // guard_conciliacion_bancaria_partida_coherencia: origen banco/libro exige extracto_linea_id
  // XOR contable_comprobante_detalle_id, nunca los dos ni ninguno.
  PARTIDA_ORIGEN_INCONSISTENTE: 'PARTIDA_ORIGEN_INCONSISTENTE',
  // guard_conciliacion_bancaria_partida_coherencia: contable_comprobante_detalle_id no pertenece al tenant.
  COMPROBANTE_DETALLE_INVALIDO: 'COMPROBANTE_DETALLE_INVALIDO',
  // guard_conciliacion_bancaria_partida_coherencia: tipo_id no es TIPO_PARTIDA_CONCILIACION visible.
  TIPO_PARTIDA_INVALIDO: 'TIPO_PARTIDA_INVALIDO',
  // generar-conciliacion-bancaria: la cuenta bancaria no tiene cuentas_bancarias.contable_cuenta_id
  // (PC-3) — no es conciliable contablemente sin ese mapeo.
  CUENTA_BANCARIA_SIN_CUENTA_CONTABLE: 'CUENTA_BANCARIA_SIN_CUENTA_CONTABLE',
  // generar-conciliacion-bancaria: ya existe una conciliacion_bancaria para esa cuenta y período
  // (conciliacion_bancaria_una_por_cuenta_periodo).
  CONCILIACION_BANCARIA_YA_EXISTE: 'CONCILIACION_BANCARIA_YA_EXISTE',
  // certificar-conciliacion-bancaria: el id no existe o no pertenece al tenant.
  CONCILIACION_BANCARIA_NO_ENCONTRADA: 'CONCILIACION_BANCARIA_NO_ENCONTRADA',

  // ── GOB-0: prerrequisitos bloqueantes (20260931320000+) ──
  // generar-enlace-documento / ver-documento: el documento no existe (o no es accesible).
  DOCUMENTO_NO_ENCONTRADO: 'DOCUMENTO_NO_ENCONTRADO',
  // ver-documento: el token no es una firma HMAC válida para este documento (link_token.ts).
  DOCUMENTO_ENLACE_INVALIDO: 'DOCUMENTO_ENLACE_INVALIDO',
  // ver-documento: el token es válido pero su fecha de expiración ya pasó.
  DOCUMENTO_VENCIDO: 'DOCUMENTO_VENCIDO',

  // ── GOB-1: órganos de gobierno y sus miembros (20260931350000+) ──
  // guard_gobierno_organo: tipo_id no pertenece a la familia ORGANO_GOBIERNO.
  ORGANO_TIPO_INVALIDO: 'ORGANO_TIPO_INVALIDO',
  // guard_gobierno_organo: un comité ad hoc (codigo=comite) sin nombre.
  ORGANO_COMITE_SIN_NOMBRE: 'ORGANO_COMITE_SIN_NOMBRE',
  // guard_gobierno_organo: segundo asamblea_general/consejo_administracion/comite_convivencia/
  // revisoria_fiscal vigente a la vez para el mismo tenant.
  ORGANO_DUPLICADO_VIGENTE: 'ORGANO_DUPLICADO_VIGENTE',
  // fn_gobierno_organo_terminar (D-85, 20260934010000): el organo_id/tenant_id no resuelve
  // ninguna fila — cierra miembros/atribuciones vigentes en cascada, así que exige el órgano
  // real antes de tocar nada.
  ORGANO_INEXISTENTE: 'ORGANO_INEXISTENTE',
  // guard_gobierno_atribucion: atribucion_id no pertenece a la familia ATRIBUCION_ORGANO.
  ATRIBUCION_TIPO_INVALIDO: 'ATRIBUCION_TIPO_INVALIDO',
  // guard_gobierno_atribucion: organo_id no pertenece al tenant de la atribución.
  ATRIBUCION_ORGANO_INVALIDO: 'ATRIBUCION_ORGANO_INVALIDO',
  // guard_gobierno_atribucion: imponer_sanciones asignada al comité de convivencia — prohibido
  // sin excepción (Ley 675 art. 58 par. 2), ni siquiera con origen=reglamento.
  ATRIBUCION_PROHIBIDA_COMITE_CONVIVENCIA: 'ATRIBUCION_PROHIBIDA_COMITE_CONVIVENCIA',
  // guard_gobierno_atribucion: origen=reglamento sin reglamento_referencia.
  ATRIBUCION_SIN_REFERENCIA_REGLAMENTO: 'ATRIBUCION_SIN_REFERENCIA_REGLAMENTO',
  // guard_gobierno_atribucion: origen=ley sin fundamento_normativo_id.
  ATRIBUCION_SIN_FUNDAMENTO: 'ATRIBUCION_SIN_FUNDAMENTO',
  // guard_gobierno_miembro: rol_id no pertenece a la familia ROL_CONCEJO_COPROPIEDAD.
  MIEMBRO_ROL_INVALIDO: 'MIEMBRO_ROL_INVALIDO',
  // guard_gobierno_miembro: organo_id no pertenece al tenant del miembro.
  MIEMBRO_ORGANO_INVALIDO: 'MIEMBRO_ORGANO_INVALIDO',
  // guard_gobierno_miembro: tercero_id no pertenece al tenant del miembro.
  MIEMBRO_TERCERO_INVALIDO: 'MIEMBRO_TERCERO_INVALIDO',
  // guard_gobierno_miembro: período del comité de convivencia distinto de un (1) año exacto, o
  // sin fecha de término (Ley 675 art. 58 par. 1, piso y techo legal a la vez).
  COMITE_CONVIVENCIA_PERIODO_EXCEDIDO: 'COMITE_CONVIVENCIA_PERIODO_EXCEDIDO',
  // guard_gobierno_miembro: presidente/secretario duplicado y vigente en el mismo órgano, o
  // la misma persona+rol+órgano con vigencias que se solapan.
  ROL_ORGANO_DUPLICADO: 'ROL_ORGANO_DUPLICADO',

  // ── GOB-2: reunión, convocatoria, asistencia y poderes (20260931410000+) ──
  // guard_gobierno_reunion: organo_id no pertenece al tenant de la reunión.
  REUNION_ORGANO_INVALIDO: 'REUNION_ORGANO_INVALIDO',
  // guard_gobierno_reunion: tipo_id no pertenece a la familia TIPO_REUNION.
  REUNION_TIPO_INVALIDO: 'REUNION_TIPO_INVALIDO',
  // guard_gobierno_reunion: convocatoria_regimen='segunda' sin convocatoria_antecedente_id —
  // Ley 675 art. 41.
  SEGUNDA_CONVOCATORIA_SIN_ANTECEDENTE: 'SEGUNDA_CONVOCATORIA_SIN_ANTECEDENTE',
  // guard_gobierno_reunion: convocatoria_antecedente_id presente pero no pertenece al tenant.
  REUNION_ANTECEDENTE_INVALIDO: 'REUNION_ANTECEDENTE_INVALIDO',
  // guard_gobierno_reunion: la reunión ya está cerrada — terminal e inmutable, sin excepción.
  REUNION_CERRADA_INMUTABLE: 'REUNION_CERRADA_INMUTABLE',
  // guard_gobierno_reunion: intento de cambiar coeficiente_set_id después de congelado al instalar.
  REUNION_COEFICIENTE_SET_INMUTABLE: 'REUNION_COEFICIENTE_SET_INMUTABLE',
  // guard_gobierno_reunion: transición de estado no permitida por el FSM
  // (convocada→instalada|cancelada, instalada→cerrada; cualquier otra).
  REUNION_TRANSICION_INVALIDA: 'REUNION_TRANSICION_INVALIDA',
  // guard_gobierno_reunion: instalar o cerrar exige rol administrador (segregación de funciones).
  REUNION_TRANSICION_REQUIERE_ADMINISTRADOR: 'REUNION_TRANSICION_REQUIERE_ADMINISTRADOR',
  // guard_gobierno_reunion: instalar sin presidente_miembro_id o secretario_miembro_id — Ley 675
  // art. 47 (el acta debe ir firmada por ambos).
  REUNION_SIN_PRESIDENTE_O_SECRETARIO: 'REUNION_SIN_PRESIDENTE_O_SECRETARIO',
  // guard_gobierno_reunion: convocatoria_regimen='universal_sin_convocatoria' y la asistencia no
  // alcanza el 100% de los coeficientes al instalar — Ley 675 art. 40, piso legal fijo.
  REUNION_UNIVERSAL_SIN_TOTALIDAD_COEFICIENTES: 'REUNION_UNIVERSAL_SIN_TOTALIDAD_COEFICIENTES',
  // guard_gobierno_convocatoria: reunion_id no pertenece al tenant de la convocatoria.
  CONVOCATORIA_REUNION_INVALIDA: 'CONVOCATORIA_REUNION_INVALIDA',
  // guard_gobierno_convocatoria_envio: convocatoria_id o destinatario_ref no pertenece al tenant.
  CONVOCATORIA_ENVIO_INVALIDO: 'CONVOCATORIA_ENVIO_INVALIDO',
  // guard_gobierno_agenda_punto: reunion_id no pertenece al tenant del punto de agenda.
  AGENDA_REUNION_INVALIDA: 'AGENDA_REUNION_INVALIDA',
  // guard_gobierno_agenda_punto: la reunión ya no está en estado 'convocada' — el orden del día
  // queda inmutable tras instalar (añadir puntos en sesión, bloqueado hasta respuesta del abogado).
  AGENDA_INMUTABLE_TRAS_INSTALAR: 'AGENDA_INMUTABLE_TRAS_INSTALAR',
  // guard_gobierno_poder: reunion_id/otorgante_ref/apoderado_ref/inmueble_id no pertenece al
  // tenant del poder.
  PODER_REFERENCIA_INVALIDA: 'PODER_REFERENCIA_INVALIDA',
  // guard_gobierno_poder: se intenta validar (validado_at) un poder sin documento_id.
  PODER_SIN_SOPORTE: 'PODER_SIN_SOPORTE',
  // guard_gobierno_asistencia: reunion_id no pertenece al tenant de la asistencia.
  ASISTENCIA_REUNION_INVALIDA: 'ASISTENCIA_REUNION_INVALIDA',
  // guard_gobierno_asistencia: inmueble_id no pertenece al tenant de la asistencia.
  ASISTENCIA_INMUEBLE_INVALIDO: 'ASISTENCIA_INMUEBLE_INVALIDO',
  // guard_gobierno_asistencia: asistente_ref no pertenece al tenant de la asistencia.
  ASISTENCIA_ASISTENTE_INVALIDO: 'ASISTENCIA_ASISTENTE_INVALIDO',
  // guard_gobierno_asistencia: el inmueble ya está representado (vigente, sin salida_at) en esta
  // misma reunión.
  ASISTENCIA_INMUEBLE_DUPLICADO: 'ASISTENCIA_INMUEBLE_DUPLICADO',
  // guard_gobierno_asistencia: un tenedor (fn_tenedores_vigentes, GOB-0) figura con calidad
  // propietario o apoderado sin poder_id.
  ASISTENCIA_TENEDOR_SIN_PODER: 'ASISTENCIA_TENEDOR_SIN_PODER',
  // guard_gobierno_asistencia: no hay un coeficiente_sets vigente para el tenant a la fecha de la
  // reunión (fn_coeficiente_set_vigente devuelve null).
  ASISTENCIA_SIN_COEFICIENTE_SET: 'ASISTENCIA_SIN_COEFICIENTE_SET',
  // guard_gobierno_asistencia: el inmueble no tiene fila de coeficiente en el set vigente resuelto.
  ASISTENCIA_INMUEBLE_SIN_COEFICIENTE: 'ASISTENCIA_INMUEBLE_SIN_COEFICIENTE',
  // guard_gobierno_asistencia: la reunión ya está cerrada o cancelada — la asistencia es inmutable
  // (hallazgo de verificación manual, 20260931480000).
  ASISTENCIA_REUNION_CERRADA: 'ASISTENCIA_REUNION_CERRADA',
  // guard_gobierno_poder: la reunión ya está cerrada o cancelada — no admite poderes nuevos
  // (mismo hallazgo, 20260931480000).
  PODER_REUNION_CERRADA: 'PODER_REUNION_CERRADA',
  // fn_gobierno_registrar_salida: p_asistencia_id no corresponde a ninguna fila de
  // gobierno_asistencia (20260931485000).
  ASISTENCIA_INEXISTENTE: 'ASISTENCIA_INEXISTENTE',

  // ── GOB-3: motor de quórum y votación (20260931490000+) ──
  // guard_gobierno_materia_decision: gobierno_materia_decision es un catálogo legal — ningún
  // insert/update/delete en runtime, ni con service_role (Ley 675 art. 46, lista taxativa).
  MATERIA_LEGAL_INMUTABLE: 'MATERIA_LEGAL_INMUTABLE',
  // guard_gobierno_regla_mayoria: materia_id no existe en gobierno_materia_decision.
  REGLA_MAYORIA_MATERIA_INVALIDA: 'REGLA_MAYORIA_MATERIA_INVALIDA',
  // guard_gobierno_regla_mayoria: mayoria_pct por debajo del piso legal de la materia (ordinaria
  // 50, calificada_70 70, unanimidad 100 — Ley 675 art. 45/46).
  MAYORIA_INFERIOR_AL_PISO_LEGAL: 'MAYORIA_INFERIOR_AL_PISO_LEGAL',
  // guard_gobierno_regla_mayoria: mayoria_pct por encima del techo del 70% (Ley 675 art. 45),
  // salvo la materia extincion_ph, que la ley exceptúa explícitamente.
  MAYORIA_EXCEDE_TECHO_LEGAL: 'MAYORIA_EXCEDE_TECHO_LEGAL',
  // guard_gobierno_regla_mayoria: quorum_minimo_pct por debajo del piso legal (más de la mitad,
  // Ley 675 art. 45).
  QUORUM_INFERIOR_AL_PISO_LEGAL: 'QUORUM_INFERIOR_AL_PISO_LEGAL',
  // guard_gobierno_votacion: reunion_id no pertenece al tenant de la votación.
  VOTACION_REUNION_INVALIDA: 'VOTACION_REUNION_INVALIDA',
  // guard_gobierno_votacion: materia_id no existe en gobierno_materia_decision.
  VOTACION_MATERIA_INVALIDA: 'VOTACION_MATERIA_INVALIDA',
  // guard_gobierno_votacion: la reunión no está en estado 'instalada' al abrir la votación.
  VOTACION_REUNION_NO_INSTALADA: 'VOTACION_REUNION_NO_INSTALADA',
  // guard_gobierno_votacion: la materia no admite reunión no_presencial (Ley 675 art. 46 par.) —
  // prohibición absoluta, sin excepción de convocatoria.
  VOTACION_MATERIA_NO_ADMITE_NO_PRESENCIAL: 'VOTACION_MATERIA_NO_ADMITE_NO_PRESENCIAL',
  // guard_gobierno_votacion: la materia no admite segunda convocatoria (solo bloquea abrir para
  // materias con admite_segunda_convocatoria=false — ninguna de las 12 sembradas hoy lo tiene;
  // para las que sí lo admiten, el matiz del art. 46 par. se resuelve al cerrar, no al abrir).
  VOTACION_MATERIA_NO_ADMITE_SEGUNDA_CONVOCATORIA:
    'VOTACION_MATERIA_NO_ADMITE_SEGUNDA_CONVOCATORIA',
  // guard_gobierno_votacion: el órgano reunido no tiene la atribución vinculada a la materia
  // (gobierno_organo_competente, GOB-1) — solo se valida si la materia tiene atribución vinculada.
  VOTACION_ORGANO_INCOMPETENTE: 'VOTACION_ORGANO_INCOMPETENTE',
  // guard_gobierno_votacion: no hay quórum deliberatorio (gobierno_quorum) al momento de abrir.
  VOTACION_SIN_QUORUM: 'VOTACION_SIN_QUORUM',
  // guard_gobierno_votacion: transición de estado no permitida por el FSM.
  VOTACION_TRANSICION_INVALIDA: 'VOTACION_TRANSICION_INVALIDA',
  // guard_gobierno_votacion: anular una votación (abierta o cerrada) sin explicar el motivo.
  VOTACION_ANULACION_SIN_MOTIVO: 'VOTACION_ANULACION_SIN_MOTIVO',
  // guard_gobierno_votacion: la votación ya está cerrada — solo se admite anular con motivo, sin
  // tocar el resultado congelado; o ya está anulada — terminal, sin ningún cambio permitido.
  VOTACION_CERRADA_INMUTABLE: 'VOTACION_CERRADA_INMUTABLE',
  // guard_gobierno_voto: votacion_id no pertenece al tenant del voto.
  VOTO_VOTACION_INVALIDA: 'VOTO_VOTACION_INVALIDA',
  // guard_gobierno_voto: la votación no está en estado 'abierta'.
  VOTO_VOTACION_NO_ABIERTA: 'VOTO_VOTACION_NO_ABIERTA',
  // guard_gobierno_voto: el emisor es un invitado, no está presente al momento de votar, o su
  // asistencia no pertenece a la reunión de esta votación.
  VOTO_EMISOR_NO_HABILITADO: 'VOTO_EMISOR_NO_HABILITADO',
  // guard_gobierno_voto: el mismo inmueble (o, en consejo, el mismo miembro) ya votó en esta
  // votación.
  VOTO_DUPLICADO: 'VOTO_DUPLICADO',

  // ── GOB-4: acta (20260931550000+) ──
  // gobierno_sumar_dias_habiles: p_dias negativo.
  DIAS_HABILES_NEGATIVO: 'DIAS_HABILES_NEGATIVO',
  // gobierno_generar_acta: reunion_id no existe.
  ACTA_REUNION_INEXISTENTE: 'ACTA_REUNION_INEXISTENTE',
  // gobierno_generar_acta/fn_gobierno_actualizar_narrativa: se requiere rol auxiliar o superior.
  ACTA_TRANSICION_REQUIERE_AUXILIAR: 'ACTA_TRANSICION_REQUIERE_AUXILIAR',
  // gobierno_generar_acta: la reunión no está en estado 'cerrada'.
  ACTA_REUNION_NO_CERRADA: 'ACTA_REUNION_NO_CERRADA',
  // gobierno_generar_acta/fn_gobierno_actualizar_narrativa/fn_gobierno_suscribir_acta: el acta ya
  // está suscrita (o publicada) — inmutable, salvo la propia entrega que la publica.
  ACTA_SUSCRITA_INMUTABLE: 'ACTA_SUSCRITA_INMUTABLE',
  // fn_gobierno_actualizar_narrativa/fn_gobierno_suscribir_acta: acta_id no existe.
  ACTA_INEXISTENTE: 'ACTA_INEXISTENTE',
  // fn_gobierno_suscribir_acta: suscribir un acta exige rol administrador.
  ACTA_TRANSICION_REQUIERE_ADMINISTRADOR: 'ACTA_TRANSICION_REQUIERE_ADMINISTRADOR',
  // fn_gobierno_suscribir_acta: los ids de presidente/secretario pasados no coinciden con los de
  // la reunión (copiados en el acta al generarla).
  ACTA_SUSCRIPTOR_NO_AUTORIZADO: 'ACTA_SUSCRIPTOR_NO_AUTORIZADO',
  // fn_gobierno_suscribir_acta: falta una sección obligatoria del art. 47 (detalle en el mensaje).
  ACTA_CONTENIDO_MINIMO_INCOMPLETO: 'ACTA_CONTENIDO_MINIMO_INCOMPLETO',
  // guard_gobierno_acta_verificador: acta_id no pertenece al tenant del verificador.
  VERIFICACION_ACTA_INVALIDA: 'VERIFICACION_ACTA_INVALIDA',
  // guard_gobierno_acta_verificador: el plazo excede 20 días hábiles desde la reunión (art. 47
  // inc. 2 — techo legal imperativo).
  VERIFICACION_PLAZO_EXCEDE_LEGAL: 'VERIFICACION_PLAZO_EXCEDE_LEGAL',
  // guard_gobierno_acta_entrega: acta_id no pertenece al tenant de la entrega.
  ENTREGA_ACTA_INVALIDA: 'ENTREGA_ACTA_INVALIDA',
  // guard_gobierno_acta_entrega: el acta todavía no está suscrita — no hay copia que entregar.
  ENTREGA_ACTA_NO_SUSCRITA: 'ENTREGA_ACTA_NO_SUSCRITA',
  // fn_gobierno_vincular_documento_acta: documento_id no pertenece al tenant del acta.
  ACTA_DOCUMENTO_INVALIDO: 'ACTA_DOCUMENTO_INVALIDO',

  // ── GOB-5: decisión y compromisos (20260931620000+) ──
  // gobierno_crear_decision: la votación no existe, o no está cerrada y aprobada.
  DECISION_SIN_VOTACION_APROBADA: 'DECISION_SIN_VOTACION_APROBADA',
  // gobierno_crear_decision: crear una decisión exige rol auxiliar.
  DECISION_TRANSICION_REQUIERE_AUXILIAR: 'DECISION_TRANSICION_REQUIERE_AUXILIAR',
  // gobierno_revocar_decision: revocar una decisión exige rol administrador.
  DECISION_TRANSICION_REQUIERE_ADMINISTRADOR: 'DECISION_TRANSICION_REQUIERE_ADMINISTRADOR',
  // guard_gobierno_decision_inmutable: la decisión está enlazada a un acta ya suscrita/publicada
  // — inmutable en sus campos sustantivos (salvo la propia transición de revocación).
  DECISION_INMUTABLE_TRAS_ACTA: 'DECISION_INMUTABLE_TRAS_ACTA',
  // gobierno_revocar_decision: la decisión no existe, o no está vigente (ya revocada/anulada/
  // impugnada) y por tanto no se puede revocar de nuevo.
  DECISION_REVOCACION_INVALIDA: 'DECISION_REVOCACION_INVALIDA',
  // gobierno_decision_origen: la entidad pasada no es 'presupuesto' ni 'fondo_autorizacion'.
  DECISION_ORIGEN_ENTIDAD_DESCONOCIDA: 'DECISION_ORIGEN_ENTIDAD_DESCONOCIDA',
  // guard_gobierno_compromiso: decision_id no pertenece al tenant del compromiso.
  COMPROMISO_DECISION_INVALIDA: 'COMPROMISO_DECISION_INVALIDA',
  // guard_gobierno_compromiso: no se puede pasar a 'cumplido' sin al menos un avance con
  // evidencia (documento_id no nulo en gobierno_compromiso_avances).
  COMPROMISO_CUMPLIDO_SIN_EVIDENCIA: 'COMPROMISO_CUMPLIDO_SIN_EVIDENCIA',
  // presupuestos: no se puede poblar acta_asamblea (texto) y decision_id (FK) a la vez.
  PRESUPUESTO_ORIGEN_APROBACION_DUPLICADO: 'PRESUPUESTO_ORIGEN_APROBACION_DUPLICADO',

  // ── GOB-6: convivencia y régimen sancionatorio (20260931710000+) ──
  // guard_gobierno_clase_sancion: el catálogo del art. 59 es taxativo, sin excepciones.
  SANCION_CLASE_NO_EXTENSIBLE: 'SANCION_CLASE_NO_EXTENSIBLE',
  // guard_gobierno_infraccion: reglamento_referencia vacía o nula.
  INFRACCION_SIN_TIPIFICACION: 'INFRACCION_SIN_TIPIFICACION',
  // guard_gobierno_infraccion: un código de clases_sancion_permitidas no está en el catálogo global.
  INFRACCION_CLASE_SANCION_INVALIDA: 'INFRACCION_CLASE_SANCION_INVALIDA',
  // gobierno_reportar_expediente: infraccion_id no existe.
  EXPEDIENTE_INFRACCION_INEXISTENTE: 'EXPEDIENTE_INFRACCION_INEXISTENTE',
  // gobierno_reportar_expediente/gobierno_registrar_actuacion/gobierno_archivar_expediente:
  // exige rol auxiliar o superior.
  EXPEDIENTE_TRANSICION_REQUIERE_AUXILIAR: 'EXPEDIENTE_TRANSICION_REQUIERE_AUXILIAR',
  // gobierno_imponer_sancion: exige rol administrador.
  EXPEDIENTE_TRANSICION_REQUIERE_ADMINISTRADOR: 'EXPEDIENTE_TRANSICION_REQUIERE_ADMINISTRADOR',
  // gobierno_registrar_actuacion/gobierno_archivar_expediente/gobierno_imponer_sancion: el
  // expediente ya está en una etapa terminal (archivado/firme/sancion_impuesta).
  EXPEDIENTE_ETAPA_TERMINAL: 'EXPEDIENTE_ETAPA_TERMINAL',
  // gobierno_registrar_actuacion/gobierno_archivar_expediente/gobierno_imponer_sancion:
  // expediente_id no existe.
  EXPEDIENTE_INEXISTENTE: 'EXPEDIENTE_INEXISTENTE',
  // gobierno_registrar_actuacion: la etapa pasada se registra con otra función
  // (reportado/sancion_impuesta/archivado).
  ACTUACION_ETAPA_RESERVADA: 'ACTUACION_ETAPA_RESERVADA',
  // gobierno_imponer_sancion: el expediente no tiene un requerimiento escrito previo registrado.
  SANCION_SIN_REQUERIMIENTO_PREVIO: 'SANCION_SIN_REQUERIMIENTO_PREVIO',
  // gobierno_imponer_sancion: el expediente no tiene una etapa de descargos registrada.
  SANCION_SIN_DEBIDO_PROCESO: 'SANCION_SIN_DEBIDO_PROCESO',
  // gobierno_imponer_sancion: decision_id no existe o no pertenece al tenant del expediente.
  SANCION_DECISION_INVALIDA: 'SANCION_DECISION_INVALIDA',
  // gobierno_imponer_sancion: el órgano de la decisión no tiene la atribución imponer_sanciones
  // vigente a la fecha de la decisión (el comité de convivencia nunca la tiene, GOB-1).
  SANCION_ORGANO_INCOMPETENTE: 'SANCION_ORGANO_INCOMPETENTE',
  // gobierno_imponer_sancion: la clase no existe en el catálogo, o no está entre las permitidas
  // por la infracción tipificada.
  SANCION_CLASE_NO_PERMITIDA: 'SANCION_CLASE_NO_PERMITIDA',
  // gobierno_imponer_sancion: la clase 'multa' exige un monto positivo.
  SANCION_MONTO_REQUERIDO: 'SANCION_MONTO_REQUERIDO',
  // gobierno_imponer_sancion: cada multa individual no puede superar el tope legal (2x expensas).
  MULTA_EXCEDE_TOPE_INDIVIDUAL: 'MULTA_EXCEDE_TOPE_INDIVIDUAL',
  // gobierno_imponer_sancion: la sumatoria de multas del infractor no puede superar el tope
  // acumulado legal (10x expensas).
  MULTA_EXCEDE_TOPE_ACUMULADO: 'MULTA_EXCEDE_TOPE_ACUMULADO',
  // gobierno_imponer_sancion: la clase 'restriccion_uso' exige una zona común.
  SANCION_ZONA_COMUN_REQUERIDA: 'SANCION_ZONA_COMUN_REQUERIDA',
  // gobierno_imponer_sancion: zona_comun_id no existe o no pertenece al tenant.
  SANCION_ZONA_COMUN_INVALIDA: 'SANCION_ZONA_COMUN_INVALIDA',
  // gobierno_imponer_sancion: la zona común restringida está marcada como esencial (nunca
  // restringible, art. 59 num. 3).
  SANCION_BIEN_COMUN_ESENCIAL: 'SANCION_BIEN_COMUN_ESENCIAL',
  // fn_gobierno_expensa_necesaria_mensual: inmueble_id no existe.
  SANCION_INMUEBLE_INEXISTENTE: 'SANCION_INMUEBLE_INEXISTENTE',
  // fn_gobierno_expensa_necesaria_mensual: el tenant no configuró qué conceptos cuentan como
  // expensa necesaria mensual — nunca se infiere.
  SANCION_BASE_EXPENSA_NO_CONFIGURADA: 'SANCION_BASE_EXPENSA_NO_CONFIGURADA',
  // fn_gobierno_expensa_necesaria_mensual: no existe periodo para la fecha dada.
  SANCION_PERIODO_INEXISTENTE: 'SANCION_PERIODO_INEXISTENTE',

  // ── GOB-7: impugnación (20260931790000+) ──
  // gobierno_presentar_impugnacion: decision_id/expediente_id no existe.
  IMPUGNACION_OBJETO_INEXISTENTE: 'IMPUGNACION_OBJETO_INEXISTENTE',
  // gobierno_presentar_impugnacion: la decisión no está vigente, o el expediente no tiene una
  // sanción impuesta vigente — no hay nada que impugnar.
  IMPUGNACION_OBJETO_NO_IMPUGNABLE: 'IMPUGNACION_OBJETO_NO_IMPUGNABLE',
  // gobierno_presentar_impugnacion/gobierno_registrar_actuacion_impugnacion: exige rol auxiliar.
  IMPUGNACION_TRANSICION_REQUIERE_AUXILIAR: 'IMPUGNACION_TRANSICION_REQUIERE_AUXILIAR',
  // gobierno_resolver_impugnacion: exige rol administrador.
  IMPUGNACION_TRANSICION_REQUIERE_ADMINISTRADOR: 'IMPUGNACION_TRANSICION_REQUIERE_ADMINISTRADOR',
  // gobierno_presentar_impugnacion: suspende_efectos=true exige justificarlo — la impugnación no
  // suspende automáticamente los efectos del objeto (spec §4.2).
  IMPUGNACION_SUSPENSION_SIN_FUNDAMENTO: 'IMPUGNACION_SUSPENSION_SIN_FUNDAMENTO',
  // gobierno_presentar_impugnacion: el tenant no configuró el plazo (gobierno_parametro_
  // impugnacion) para este objeto_tipo — nunca se infiere.
  IMPUGNACION_PLAZO_NO_CONFIGURADO: 'IMPUGNACION_PLAZO_NO_CONFIGURADO',
  // gobierno_registrar_actuacion_impugnacion/gobierno_resolver_impugnacion: impugnacion_id no
  // existe.
  IMPUGNACION_INEXISTENTE: 'IMPUGNACION_INEXISTENTE',
  // gobierno_registrar_actuacion_impugnacion/gobierno_resolver_impugnacion: la impugnación ya
  // está resuelta o desistida (terminal).
  IMPUGNACION_ESTADO_TERMINAL: 'IMPUGNACION_ESTADO_TERMINAL',
  // gobierno_registrar_actuacion_impugnacion: el estado pasado se registra con otra función
  // (presentada/resuelta).
  IMPUGNACION_ESTADO_RESERVADO: 'IMPUGNACION_ESTADO_RESERVADO',
  // gobierno_resolver_impugnacion: resultado='modificada' exige registrar en qué (p_detalle).
  IMPUGNACION_MODIFICADA_SIN_DETALLE: 'IMPUGNACION_MODIFICADA_SIN_DETALLE',
  // gobierno_resolver_impugnacion: resultado='revocada' sobre una multa, pero no existe periodo
  // para la fecha de la reversión — no se puede registrar el cargo de reversión.
  IMPUGNACION_PERIODO_INEXISTENTE: 'IMPUGNACION_PERIODO_INEXISTENTE',

  // ── GOB-8: atención al propietario/residente y consulta sin sesión (20260931850000+) ──
  // Prefijo ATENCION_, no SOLICITUD_: el módulo Fondos (fondo_solicitudes_uso) ya registró 9
  // códigos SOLICITUD_* para un concepto de dominio distinto (SOLICITUD_ESTADO_TERMINAL entre
  // ellos) — se evita la colisión/ambigüedad con nombres nuevos, ver GOB_08_INFORME.md.
  // gobierno_crear_solicitud: inmueble_id no existe.
  ATENCION_SOLICITUD_INMUEBLE_INEXISTENTE: 'ATENCION_SOLICITUD_INMUEBLE_INEXISTENTE',
  // gobierno_crear_solicitud/gobierno_registrar_actuacion_solicitud/gobierno_escalar_solicitud/
  // gobierno_revocar_token_consulta_inmueble: exige rol auxiliar.
  ATENCION_TRANSICION_REQUIERE_AUXILIAR: 'ATENCION_TRANSICION_REQUIERE_AUXILIAR',
  // gobierno_registrar_actuacion_solicitud/gobierno_escalar_solicitud: solicitud_id no existe.
  ATENCION_SOLICITUD_INEXISTENTE: 'ATENCION_SOLICITUD_INEXISTENTE',
  // gobierno_registrar_actuacion_solicitud: la solicitud ya está resuelta/cerrada/anulada.
  ATENCION_SOLICITUD_ESTADO_TERMINAL: 'ATENCION_SOLICITUD_ESTADO_TERMINAL',
  // gobierno_registrar_actuacion_solicitud: pasar a en_espera exige un motivo (pausa el SLA).
  ATENCION_EN_ESPERA_SIN_MOTIVO: 'ATENCION_EN_ESPERA_SIN_MOTIVO',
  // gobierno_registrar_actuacion_solicitud: anular una solicitud exige un motivo.
  ATENCION_ANULACION_SIN_MOTIVO: 'ATENCION_ANULACION_SIN_MOTIVO',
  // gobierno_registrar_actuacion_solicitud: resolver sin ninguna actuación es_respuesta=true.
  ATENCION_CIERRE_SIN_RESPUESTA: 'ATENCION_CIERRE_SIN_RESPUESTA',
  // gobierno_escalar_solicitud: destino_tipo inválido, o destino_id no pertenece al tenant.
  ATENCION_ESCALAMIENTO_DESTINO_INVALIDO: 'ATENCION_ESCALAMIENTO_DESTINO_INVALIDO',
  // gobierno_sumar_horas_habiles: p_horas negativo.
  HORAS_HABILES_NEGATIVO: 'HORAS_HABILES_NEGATIVO',
  // guard_atencion_token_consulta_inmutable: cualquier columna salvo revocado_at/
  // motivo_revocacion cambió tras crear el token.
  ATENCION_TOKEN_CONSULTA_INMUTABLE: 'ATENCION_TOKEN_CONSULTA_INMUTABLE',
  // guard_atencion_token_consulta_inmutable/gobierno_revocar_token_consulta_inmueble: el token
  // ya estaba revocado.
  ATENCION_TOKEN_CONSULTA_YA_REVOCADO: 'ATENCION_TOKEN_CONSULTA_YA_REVOCADO',
  // gobierno_revocar_token_consulta_inmueble: token_id no existe.
  ATENCION_TOKEN_CONSULTA_INEXISTENTE: 'ATENCION_TOKEN_CONSULTA_INEXISTENTE',
  // gobierno_revocar_token_consulta_inmueble: revocar exige un motivo.
  ATENCION_TOKEN_REVOCACION_SIN_MOTIVO: 'ATENCION_TOKEN_REVOCACION_SIN_MOTIVO',
  // ver-inmueble (Edge Function): token_id no existe.
  ATENCION_TOKEN_NO_ENCONTRADO: 'ATENCION_TOKEN_NO_ENCONTRADO',
  // ver-inmueble: la fila de control está revocada.
  ATENCION_TOKEN_REVOCADO: 'ATENCION_TOKEN_REVOCADO',
  // ver-inmueble: expira_at ya pasó, o el HMAC venció.
  ATENCION_TOKEN_VENCIDO: 'ATENCION_TOKEN_VENCIDO',
  // ver-inmueble: el HMAC no verifica contra este id.
  ATENCION_TOKEN_INVALIDO: 'ATENCION_TOKEN_INVALIDO',
  // responder-encuesta-solicitud (Edge Function, §4.5): solicitud_id no pertenece al inmueble/
  // tenant del token.
  ATENCION_ENCUESTA_SOLICITUD_NO_ENCONTRADA: 'ATENCION_ENCUESTA_SOLICITUD_NO_ENCONTRADA',
  // responder-encuesta-solicitud: la solicitud todavía no está resuelta/cerrada.
  ATENCION_ENCUESTA_ESTADO_INVALIDO: 'ATENCION_ENCUESTA_ESTADO_INVALIDO',
  // responder-encuesta-solicitud: ya existe una encuesta respondida para esta solicitud
  // (solicitud_encuesta.solicitud_id es unique).
  ATENCION_ENCUESTA_YA_RESPONDIDA: 'ATENCION_ENCUESTA_YA_RESPONDIDA',

  // ── GOB-8 (parche): recepción externa de solicitudes con triage (20260932790000+) ──
  // Prefijo SOLICITUD_, no ATENCION_ (al revés que el resto de GOB-8): estos tres códigos son
  // específicos del camino de AQUILA External (actor externo + triage humano), verificado que no
  // chocan con los SOLICITUD_* ya registrados por Fondos (fondo_solicitudes_uso) ni con los
  // ATENCION_* de GOB-8 — ver GOB_08_PARCHE_INFORME.md.
  // fn_solicitud_recibir_externa/fn_solicitud_estado_externo: el vínculo no existe, no es del
  // usuario autenticado, ya no está vigente, o no corresponde al inmueble indicado.
  SOLICITUD_EXTERNA_INMUEBLE_NO_VINCULADO: 'SOLICITUD_EXTERNA_INMUEBLE_NO_VINCULADO',
  // fn_solicitud_triage_aceptar/_rechazar: la solicitud no está en recibida_externa.
  SOLICITUD_TRIAGE_ESTADO_INVALIDO: 'SOLICITUD_TRIAGE_ESTADO_INVALIDO',
  // fn_solicitud_triage_rechazar: rechazar en triage exige un motivo, sin excepción.
  SOLICITUD_TRIAGE_RECHAZO_SIN_MOTIVO: 'SOLICITUD_TRIAGE_RECHAZO_SIN_MOTIVO',

  // ── EXT-02: solicitudes desde External (20260932820000+) ─────────────────
  // external-solicitudes-*: el vinculo_id del body no aparece en fn_actor_externo_mis_vinculos()
  // del caller (no es suyo, o ya no está vigente) — check de la Edge Function, no de una RPC.
  VINCULO_NO_PERTENECE: 'VINCULO_NO_PERTENECE',
  // fn_solicitud_cancelar_externa: la solicitud ya salió de recibida_externa (ya en triage o más
  // allá) — solo se puede cancelar antes de que el staff la haya mirado.
  SOLICITUD_CANCELACION_FUERA_DE_PLAZO: 'SOLICITUD_CANCELACION_FUERA_DE_PLAZO',

  // ── CO-8: obligaciones tributarias (20260931900000+) ─────────────────────
  // guard_contable_cuenta_naturaleza_tributaria: naturaleza_tributaria_id fuera de clase 1/4/5,
  // o el id no pertenece a la familia NATURALEZA_TRIBUTARIA_CUENTA.
  TRIBUTARIO_CLASE_INVALIDA: 'TRIBUTARIO_CLASE_INVALIDA',
  // guard_contable_cuenta_naturaleza_tributaria: uso_economico=residencial sin
  // explota_bienes_comunes no puede marcar gravado_renta/gravado_renta_iva (ET art. 19-5).
  TRIBUTARIO_MARCA_INCOHERENTE_CON_USO: 'TRIBUTARIO_MARCA_INCOHERENTE_CON_USO',
  // guard_finanzas_factura_retencion: el tenant no tiene agente_retencion=true (CO-1).
  TRIBUTARIO_SIN_AGENTE_RETENCION: 'TRIBUTARIO_SIN_AGENTE_RETENCION',
  // fn_finanzas_aprobar_factura: total_retenciones de la factura no coincide con la suma real de
  // finanzas_factura_retencion.
  TRIBUTARIO_RETENCIONES_INCONSISTENTES: 'TRIBUTARIO_RETENCIONES_INCONSISTENTES',
  // guard_tributario_iva_generado: el tenant no tiene responsable_iva=true (CO-1).
  TRIBUTARIO_SIN_RESPONSABLE_IVA: 'TRIBUTARIO_SIN_RESPONSABLE_IVA',
  // guard_tributario_iva_generado: periodo_id no pertenece al tenant.
  TENANT_INCONSISTENTE: 'TENANT_INCONSISTENTE',
  // tributario_resumen_iva: el tenant no tiene iva_periodicidad_id configurado.
  TRIBUTARIO_PERIODICIDAD_IVA_SIN_CONFIGURAR: 'TRIBUTARIO_PERIODICIDAD_IVA_SIN_CONFIGURAR',
  // tributario_resumen_iva: p_periodo_numero fuera de rango para la periodicidad configurada.
  TRIBUTARIO_PERIODO_IVA_INVALIDO: 'TRIBUTARIO_PERIODO_IVA_INVALIDO',

  // ── GOB-9: comunicaciones y workflow transversal (20260931950000+) ──
  // gobierno_segmento_destinatarios: p_criterio no es uno de los 5 soportados.
  SEGMENTO_CRITERIO_INVALIDO: 'SEGMENTO_CRITERIO_INVALIDO',

  // ── CO-9: gobierno corporativo, asamblea y conservación (20260932300000+) ──
  CERTIFICACION_SIN_ESTADOS: 'CERTIFICACION_SIN_ESTADOS',
  CERTIFICACION_SIN_TEXTO: 'CERTIFICACION_SIN_TEXTO',
  CERTIFICACION_EJERCICIO_ABIERTO: 'CERTIFICACION_EJERCICIO_ABIERTO',
  CERTIFICACION_YA_VIGENTE: 'CERTIFICACION_YA_VIGENTE',
  CERTIFICACION_CONTADOR_INVALIDO: 'CERTIFICACION_CONTADOR_INVALIDO',
  CERTIFICACION_INVALIDADA: 'CERTIFICACION_INVALIDADA',
  CERTIFICACION_INVALIDACION_SIN_MOTIVO: 'CERTIFICACION_INVALIDACION_SIN_MOTIVO',
  CERTIFICACION_INEXISTENTE: 'CERTIFICACION_INEXISTENTE',
  DICTAMEN_TERCERO_SIN_ROL_REVISOR_FISCAL: 'DICTAMEN_TERCERO_SIN_ROL_REVISOR_FISCAL',
  DICTAMEN_TIPO_OPINION_INVALIDO: 'DICTAMEN_TIPO_OPINION_INVALIDO',
  RENDICION_INEXISTENTE: 'RENDICION_INEXISTENTE',
  RENDICION_ESTADO_INVALIDO: 'RENDICION_ESTADO_INVALIDO',
  RENDICION_ORIGEN_DUPLICADO: 'RENDICION_ORIGEN_DUPLICADO',
  RENDICION_ORIGEN_FALTANTE: 'RENDICION_ORIGEN_FALTANTE',
  RENDICION_SIN_DICTAMEN_OBLIGATORIO: 'RENDICION_SIN_DICTAMEN_OBLIGATORIO',
  RENDICION_RECHAZO_SIN_MOTIVO: 'RENDICION_RECHAZO_SIN_MOTIVO',
  RENDICION_DOCUMENTO_INVALIDO: 'RENDICION_DOCUMENTO_INVALIDO',
  CASTIGO_ORIGEN_DUPLICADO: 'CASTIGO_ORIGEN_DUPLICADO',
  CASTIGO_ORIGEN_FALTANTE: 'CASTIGO_ORIGEN_FALTANTE',

  // ── FIN-4: flujo de caja proyectado y alertas de liquidez (20260932560000+) ──
  // guard_finanzas_alerta_regla_tipo: tipo_id no pertenece a la familia TIPO_ALERTA_LIQUIDEZ.
  FINANZAS_ALERTA_TIPO_INVALIDO: 'FINANZAS_ALERTA_TIPO_INVALIDO',
  // finanzas_proyeccion_vs_real: p_snapshot_id no existe o no es visible para el tenant.
  FINANZAS_SNAPSHOT_INEXISTENTE: 'FINANZAS_SNAPSHOT_INEXISTENTE',
  // finanzas_flujo_snapshot_guardar: p_motivo vacío o nulo — el snapshot append-only exige motivo.
  FINANZAS_SNAPSHOT_SIN_MOTIVO: 'FINANZAS_SNAPSHOT_SIN_MOTIVO',

  // ── EXT-01: identidad del actor externo (20260932640000+) ──
  // fn_actor_externo_solicitar_otp: p_canal no es 'email' ni 'sms'.
  ACTOR_EXTERNO_CANAL_INVALIDO: 'ACTOR_EXTERNO_CANAL_INVALIDO',
  // guard_actor_externo_vinculo: auth_user_id ya es tenant_member de ese tenant — AD-37.
  ACTOR_EXTERNO_CONFLICTO_MEMBRESIA: 'ACTOR_EXTERNO_CONFLICTO_MEMBRESIA',
  // guard_actor_externo_vinculo: ya existe un vínculo vigente y solapado para ese persona_rol_id.
  ACTOR_EXTERNO_VINCULO_DUPLICADO: 'ACTOR_EXTERNO_VINCULO_DUPLICADO',
  // guard_actor_externo_vinculo: vigente_hasta anterior a vigente_desde.
  ACTOR_EXTERNO_VIGENCIA_INVALIDA: 'ACTOR_EXTERNO_VIGENCIA_INVALIDA',
  // guard_actor_externo_vinculo: origen='autoverificacion' sin un OTP confirmado reciente.
  ACTOR_EXTERNO_ALTA_SIN_VERIFICACION: 'ACTOR_EXTERNO_ALTA_SIN_VERIFICACION',
  // guard_actor_externo_vinculo: intento de editar cualquier columna que no sea vigente_hasta.
  ACTOR_EXTERNO_VINCULO_INMUTABLE: 'ACTOR_EXTERNO_VINCULO_INMUTABLE',
  // fn_actor_externo_confirmar_otp / fn_actor_externo_paso_reforzado_confirmar: código inválido,
  // vencido, ya usado, o intentos agotados.
  OTP_INVALIDO_O_VENCIDO: 'OTP_INVALIDO_O_VENCIDO',
  // fn_actor_externo_paso_reforzado_confirmar: solicitud inexistente, ya confirmada, vencida, o
  // agotados sus 3 intentos.
  PASO_REFORZADO_AGOTADO: 'PASO_REFORZADO_AGOTADO',
  // actor-externo-confirmar-otp: el código es válido pero no resolvió ningún rol vigente.
  ACTOR_EXTERNO_SIN_VINCULOS: 'ACTOR_EXTERNO_SIN_VINCULOS',
  // actor-externo-confirmar-otp: el tercero no tiene email registrado — no se puede crear la cuenta.
  ACTOR_EXTERNO_SIN_EMAIL_PARA_CUENTA: 'ACTOR_EXTERNO_SIN_EMAIL_PARA_CUENTA',

  // ── MANT-10: reservas de zonas comunes (20260932710000+) ──
  // guard_mant_zona_reserva_regla: genera_cargo=true sin concepto_id.
  REGLA_RESERVA_SIN_CONCEPTO: 'REGLA_RESERVA_SIN_CONCEPTO',
  // guard_mant_zona_reserva_regla: genera_cargo=true y el concepto no tiene modo_valor='fijo'
  // (evaluar formula_ael por reserva sería un mecanismo de cobro propio, fuera de alcance).
  REGLA_RESERVA_CONCEPTO_NO_FIJO: 'REGLA_RESERVA_CONCEPTO_NO_FIJO',
  // guard_mant_reserva: la zona no tiene una mant_zona_reserva_regla vigente para esa fecha.
  RESERVA_ZONA_SIN_REGLA_VIGENTE: 'RESERVA_ZONA_SIN_REGLA_VIGENTE',
  // guard_mant_reserva: la franja excede duracion_maxima_minutos de la regla vigente.
  RESERVA_DURACION_EXCEDIDA: 'RESERVA_DURACION_EXCEDIDA',
  // guard_mant_reserva: no respeta anticipacion_minima_horas / anticipacion_maxima_dias.
  RESERVA_FUERA_DE_VENTANA: 'RESERVA_FUERA_DE_VENTANA',
  // guard_mant_reserva: el inmueble ya alcanzó maximo_activas_por_inmueble en esa zona.
  RESERVA_LIMITE_INMUEBLE_EXCEDIDO: 'RESERVA_LIMITE_INMUEBLE_EXCEDIDO',
  // guard_mant_reserva: cupo_simultaneo > 1 y ya hay tantas reservas activas traslapadas como cupo.
  RESERVA_CUPO_EXCEDIDO: 'RESERVA_CUPO_EXCEDIDO',
  // guard_mant_reserva: solicitante_origen='externo' y el vínculo no corresponde a ese inmueble.
  RESERVA_INMUEBLE_NO_VINCULADO: 'RESERVA_INMUEBLE_NO_VINCULADO',
  // guard_mant_reserva (UPDATE): intento de editar una columna distinta de estado y sus asociadas.
  RESERVA_INMUTABLE: 'RESERVA_INMUTABLE',
  // guard_mant_reserva (UPDATE): transición de estado fuera del ciclo de vida de reserva_estado_t.
  RESERVA_TRANSICION_INVALIDA: 'RESERVA_TRANSICION_INVALIDA',
  // fn_reserva_aprobar / fn_reserva_rechazar: la reserva no existe.
  RESERVA_INEXISTENTE: 'RESERVA_INEXISTENTE',
  // fn_reserva_aprobar / fn_reserva_rechazar: la reserva no está en estado 'solicitada'.
  RESERVA_ESTADO_INVALIDO: 'RESERVA_ESTADO_INVALIDO',
  // fn_reserva_rechazar: p_motivo vacío o nulo.
  RESERVA_RECHAZO_SIN_MOTIVO: 'RESERVA_RECHAZO_SIN_MOTIVO',
  // fn_reserva_aprobar: la regla genera_cargo=true pero no existe periodo para el anio/mes de la reserva.
  PERIODO_NO_ENCONTRADO_PARA_FECHA_RESERVA: 'PERIODO_NO_ENCONTRADO_PARA_FECHA_RESERVA',

  // ── EXT-03: reservas desde External (20260932850000+) ──
  // fn_reserva_crear_externa: traduce el exclusion_violation crudo del exclude constraint de
  // MANT-10 (traslape, cupo_simultaneo=1) a un código limpio — sin esto llegaba como
  // INTERNAL_ERROR/500 en vez del 409 esperado (parsearErrorRpc solo entiende "CODE: mensaje").
  RESERVA_TRASLAPE: 'RESERVA_TRASLAPE',
  // external-reservas-disponibilidad: zona_comun_id no existe o no pertenece al tenant del vínculo.
  RESERVA_ZONA_INEXISTENTE: 'RESERVA_ZONA_INEXISTENTE',

  // ── MANT-11: visitantes y control de acceso (20260932750000+) ──
  // guard_mant_autorizacion_visita: autorizado_por_origen='externo' y el vínculo no corresponde a ese inmueble.
  AUTORIZACION_INMUEBLE_NO_VINCULADO: 'AUTORIZACION_INMUEBLE_NO_VINCULADO',
  // guard_mant_autorizacion_visita: qr_expira_at excede fecha_prevista/hora + la ventana de 6 horas.
  AUTORIZACION_VIGENCIA_EXCESIVA: 'AUTORIZACION_VIGENCIA_EXCESIVA',
  // guard_mant_autorizacion_visita: la autorización ya está usada/revocada (terminal) o se intenta
  // editar una columna distinta de estado/qr_token/qr_expira_at.
  AUTORIZACION_ESTADO_INMUTABLE: 'AUTORIZACION_ESTADO_INMUTABLE',
  // fn_autorizacion_visita_marcar_usada / fn_autorizacion_visita_revocar: la autorización no existe.
  AUTORIZACION_INEXISTENTE: 'AUTORIZACION_INEXISTENTE',
  // fn_autorizacion_visita_marcar_usada: la autorización no está en estado 'vigente'.
  AUTORIZACION_ESTADO_INVALIDO: 'AUTORIZACION_ESTADO_INVALIDO',
  // fn_autorizacion_visita_marcar_usada: qr_expira_at ya pasó (columna, además de la verificación
  // criptográfica del token que hace la Edge Function antes de llamar esta función).
  AUTORIZACION_VENCIDA: 'AUTORIZACION_VENCIDA',
  // autorizacion-visita-validar / -consumir: verificarTokenEnlace() devolvió 'invalido'.
  AUTORIZACION_QR_INVALIDO: 'AUTORIZACION_QR_INVALIDO',
  // autorizacion-visita-consumir: fn_autorizacion_visita_marcar_usada() lanzó una excepción
  // (autorización inexistente, no vigente, o vencida) después de que el token ya se verificó.
  AUTORIZACION_CONSUMO_FALLIDO: 'AUTORIZACION_CONSUMO_FALLIDO',
  // guard_mant_registro_acceso: intento de editar una columna distinta de egreso_at.
  REGISTRO_ACCESO_INMUTABLE: 'REGISTRO_ACCESO_INMUTABLE',

  // ── EXS-2: notificaciones in-app (20260933000000+) ──
  // fn_notificar: p_tipo_codigo no existe en lista_tipos familia TIPO_NOTIFICACION. Falla
  // explícito en vez de emitir un aviso sin clasificar — cada corte EXS siembra sus propios
  // tipos en la migración que crea sus tablas, y este error delata el olvido.
  NOTIFICACION_TIPO_INVALIDO: 'NOTIFICACION_TIPO_INVALIDO',
  // fn_notificar: p_prioridad no existe en lista_tipos familia PRIORIDAD_NOTIFICACION.
  NOTIFICACION_PRIORIDAD_INVALIDA: 'NOTIFICACION_PRIORIDAD_INVALIDA',

  // ── EXS-3: anuncios y comunicación oficial (20260933100000+) ──
  // guard_anuncio_transicion: el par (estado anterior, estado nuevo) no está en la lista cerrada.
  ANUNCIO_TRANSICION_INVALIDA: 'ANUNCIO_TRANSICION_INVALIDA',
  // guard_anuncio_transicion: intento de editar contenido, categoría o consecutivo de un anuncio
  // ya publicado. Se archiva y se publica uno nuevo; el histórico es evidencia.
  ANUNCIO_PUBLICADO_INMUTABLE: 'ANUNCIO_PUBLICADO_INMUTABLE',
  // guard_anuncio_transicion: publicar sin pasar por revisión exige rol administrador.
  ANUNCIO_PUBLICACION_DIRECTA_REQUIERE_ADMINISTRADOR: 'ANUNCIO_PUBLICACION_DIRECTA_REQUIERE_ADMINISTRADOR',
  // guard_anuncio_transicion: aprobar o rechazar exige rol administrador.
  ANUNCIO_REVISION_REQUIERE_ADMINISTRADOR: 'ANUNCIO_REVISION_REQUIERE_ADMINISTRADOR',
  // guard_anuncio_transicion: publicar exige rol administrador.
  ANUNCIO_PUBLICACION_REQUIERE_ADMINISTRADOR: 'ANUNCIO_PUBLICACION_REQUIERE_ADMINISTRADOR',
  // guard_anuncio_transicion: segregación de funciones — quien redactó no aprueba lo suyo.
  ANUNCIO_AUTOAPROBACION: 'ANUNCIO_AUTOAPROBACION',
  // guard_anuncio_transicion: pasar a 'programado' sin publicar_at.
  ANUNCIO_PROGRAMADO_SIN_FECHA: 'ANUNCIO_PROGRAMADO_SIN_FECHA',
  // guard_anuncio_transicion: publicar_at debe ser futura al programar.
  ANUNCIO_PROGRAMADO_EN_PASADO: 'ANUNCIO_PROGRAMADO_EN_PASADO',
  // fn_anuncio_destinatarios / fn_anuncio_metricas: el anuncio no existe, o el solicitante no es
  // miembro de su tenant. Mismo mensaje en ambos casos: el UUID no debe revelar qué hay en otras
  // copropiedades.
  ANUNCIO_NO_ENCONTRADO: 'ANUNCIO_NO_ENCONTRADO',
  // enviar-anuncio: solo se despacha por correo un anuncio publicado.
  ANUNCIO_INVALID_STATE: 'ANUNCIO_INVALID_STATE',
  // enviar-anuncio: el anuncio no existe.
  ANUNCIO_NOT_FOUND: 'ANUNCIO_NOT_FOUND',

  // ── EXS-4: directorio (20260933200000+) ──
  // guard_tercero_perfil: categoria_comercio_id no pertenece a CATEGORIA_COMERCIO. Código propio
  // y no PROVEEDOR_CATEGORIA_INVALIDA porque son familias distintas: aquella valida en qué
  // activos trabaja un proveedor, esta qué clase de negocio es.
  PERFIL_CATEGORIA_COMERCIO_INVALIDA: 'PERFIL_CATEGORIA_COMERCIO_INVALIDA',
  // guard_tercero_perfil: publicar una ficha sin nombre_comercial la dejaría sin nombre por el
  // que encontrarla. Se exige al publicar, no al crear el perfil.
  PERFIL_PUBLICADO_SIN_NOMBRE: 'PERFIL_PUBLICADO_SIN_NOMBRE',
  // fn_directorio_listar: quien no es miembro del tenant no obtiene directorio. Mismo criterio
  // de no revelar que el tenant existe.
  DIRECTORIO_NO_DISPONIBLE: 'DIRECTORIO_NO_DISPONIBLE',

  // ── EXS-5: vehículos y movilidad (20260933300000+) ──
  // guard_vehiculo_permiso: tipo_id no pertenece a TIPO_PERMISO_VEHICULO.
  PERMISO_VEHICULO_TIPO_INVALIDO: 'PERMISO_VEHICULO_TIPO_INVALIDO',
  // guard_vehiculo_permiso: el permiso y el vehículo que ampara son de copropiedades distintas.
  // Lo comprueba el guard y no una FK compuesta porque el tenant del permiso ya lo fija la
  // policy; esto atrapa el caso en que alguien pase un vehiculo_id de otra copropiedad.
  PERMISO_VEHICULO_TENANT_INCONSISTENTE: 'PERMISO_VEHICULO_TENANT_INCONSISTENTE',
  // guard_vehiculo_permiso: un vehículo retirado no recibe permisos vigentes — retirar es
  // terminal y su placa ya puede estar registrada a nombre de otro carro.
  PERMISO_VEHICULO_RETIRADO: 'PERMISO_VEHICULO_RETIRADO',
  // fn_vehiculo_por_placa: quien no es miembro del tenant no consulta placas. Mismo mensaje que
  // para una placa inexistente: la consulta no debe servir para averiguar qué carros hay.
  VEHICULO_NO_ENCONTRADO: 'VEHICULO_NO_ENCONTRADO',

  // ── EXS-6: marketplace (20260933400000+) ──
  // guard_publicacion: tipo_id, categoria_id o condicion_id de la familia equivocada.
  PUBLICACION_TIPO_INVALIDO: 'PUBLICACION_TIPO_INVALIDO',
  PUBLICACION_CATEGORIA_INVALIDA: 'PUBLICACION_CATEGORIA_INVALIDA',
  PUBLICACION_CONDICION_INVALIDA: 'PUBLICACION_CONDICION_INVALIDA',
  // guard_publicacion: un regalo con precio es una contradicción, no un descuido.
  PUBLICACION_REGALO_CON_PRECIO: 'PUBLICACION_REGALO_CON_PRECIO',
  // guard_publicacion: el tercero que publica es de otra copropiedad.
  PUBLICACION_TERCERO_INCONSISTENTE: 'PUBLICACION_TERCERO_INCONSISTENTE',
  // guard_publicacion: el par (estado anterior, estado nuevo) no está en la lista cerrada.
  PUBLICACION_TRANSICION_INVALIDA: 'PUBLICACION_TRANSICION_INVALIDA',
  // guard_publicacion: `origen` es historia sellada al crear; cambiarlo movería el escalón de
  // aprobación que le toca a esa publicación.
  PUBLICACION_ORIGEN_INMUTABLE: 'PUBLICACION_ORIGEN_INMUTABLE',
  // guard_publicacion: editar el contenido de una publicación viva se saltaría la moderación;
  // hay que devolverla a borrador y aprobarla de nuevo.
  PUBLICACION_EDICION_EVADE_MODERACION: 'PUBLICACION_EDICION_EVADE_MODERACION',
  // guard_publicacion: publicar sin pasar por aprobación es prerrogativa del administrador.
  PUBLICACION_DIRECTA_REQUIERE_ADMINISTRADOR: 'PUBLICACION_DIRECTA_REQUIERE_ADMINISTRADOR',
  // guard_publicacion: escalera de aprobación — lo que publica un auxiliar lo aprueba un
  // administrador.
  PUBLICACION_APROBACION_REQUIERE_ADMINISTRADOR: 'PUBLICACION_APROBACION_REQUIERE_ADMINISTRADOR',
  // guard_publicacion: aprobar lo de un residente, o rechazar, exige ser del equipo.
  PUBLICACION_APROBACION_REQUIERE_EQUIPO: 'PUBLICACION_APROBACION_REQUIERE_EQUIPO',
  // guard_publicacion_interes: no se expresa interés en algo que no está en el tablón.
  INTERES_PUBLICACION_NO_DISPONIBLE: 'INTERES_PUBLICACION_NO_DISPONIBLE',
  INTERES_TENANT_INCONSISTENTE: 'INTERES_TENANT_INCONSISTENTE',
  // guard_publicacion_reporte: motivo de familia equivocada, o publicación de otro tenant.
  REPORTE_MOTIVO_INVALIDO: 'REPORTE_MOTIVO_INVALIDO',
  REPORTE_TENANT_INCONSISTENTE: 'REPORTE_TENANT_INCONSISTENTE',
  // fn_marketplace_listar: quien no es miembro no obtiene tablón. Mismo criterio que el
  // directorio: no revelar que la copropiedad existe.
  MARKETPLACE_NO_DISPONIBLE: 'MARKETPLACE_NO_DISPONIBLE',
  // guard_documento_tipo_familia: la foto cita una publicación de otra copropiedad. Código
  // propio y no PUBLICACION_TERCERO_INCONSISTENTE porque son cosas distintas: aquella valida
  // de quién es el aviso, esta a qué aviso cuelga un documento.
  PUBLICACION_INVALIDA: 'PUBLICACION_INVALIDA',
  // subir-documento: se pidió adjuntar una foto a una publicación que no existe o que el actor
  // no puede ver. Mismo criterio de no revelar qué hay en otras copropiedades.
  PUBLICACION_NO_ENCONTRADA: 'PUBLICACION_NO_ENCONTRADA',

  // guard_documento_tipo_familia: el adjunto cita un anuncio de otra copropiedad. Hermano de
  // PUBLICACION_INVALIDA, y le faltaba desde EXS-3: anuncio_id era el único alcance de
  // documentos sin validación de tenant.
  ANUNCIO_INVALIDO: 'ANUNCIO_INVALIDO',
  // guard_documento_tipo_familia: no se adjunta a un anuncio ya publicado, archivado o
  // cancelado. Al publicar, el anuncio recibe consecutivo y se congela; un adjunto posterior
  // cambiaría lo que los residentes vieron bajo esa referencia y, siendo documentos
  // append-only, no podría retirarse.
  ANUNCIO_NO_EDITABLE: 'ANUNCIO_NO_EDITABLE',
  // (subir-documento devuelve ANUNCIO_NO_ENCONTRADO cuando el anuncio no existe o el actor no
  //  puede verlo — ya registrado arriba, en EXS-3.)

  // guard_documento_tipo_familia: la foto cita una ficha de directorio de otra copropiedad
  // (20260933810000). Nace con la validación, a diferencia de anuncio_id, que estuvo sin ella
  // desde EXS-3.
  TERCERO_PERFIL_INVALIDO: 'TERCERO_PERFIL_INVALIDO',
  // subir-documento: se pidió subir una foto a una ficha que no existe o que el actor no ve.
  TERCERO_PERFIL_NO_ENCONTRADO: 'TERCERO_PERFIL_NO_ENCONTRADO',

  // ── EXS-7: mis asuntos (20260933500000) ──
  // fn_mis_asuntos: quien no es miembro del tenant no tiene bandeja. Mismo criterio de no
  // revelar que la copropiedad existe que el directorio y el marketplace.
  ASUNTOS_NO_DISPONIBLES: 'ASUNTOS_NO_DISPONIBLES',

  // ── MOV-1: bitácora de portería y cupos (20260933900000+) ──
  // fn_vehiculo_registrar_paso / fn_movilidad_dentro: quien no es miembro no tiene portería.
  // Mismo criterio de no revelar que la copropiedad existe que el resto de la serie.
  MOVILIDAD_NO_DISPONIBLE: 'MOVILIDAD_NO_DISPONIBLE',
  // fn_vehiculo_registrar_paso: registrar un paso es operación de portería, no de consulta.
  MOVILIDAD_REGISTRO_REQUIERE_AGENTE: 'MOVILIDAD_REGISTRO_REQUIERE_AGENTE',
  // fn_vehiculo_registrar_paso: no se tecleó placa y la autorización tampoco trae una.
  MOVILIDAD_PLACA_REQUERIDA: 'MOVILIDAD_PLACA_REQUERIDA',
  // guard_vehiculo_permiso: el cupo citado es de otra copropiedad.
  CUPO_INVALIDO: 'CUPO_INVALIDO',
  // guard_vehiculo_permiso: se asignó como cupo un inmueble que no es de tipo parqueadero —
  // error de captura que si no se atrapa aquí solo se nota al leer el informe.
  CUPO_NO_ES_PARQUEADERO: 'CUPO_NO_ES_PARQUEADERO',

  // ── EXS-8: hardening (20260933600000+) ──
  // guard_rate_limit_escritura: techo de escrituras por hora y por persona en tablas que se
  // escriben por PostgREST directo, sin Edge Function que llamara a enforceRateLimit.
  RATE_LIMIT_EXCEDIDO: 'RATE_LIMIT_EXCEDIDO',

  // ── ENFOQUE_CONSOLIDACION, Ola 1 §2.2: cartera empieza a notificar (20260934110000) ──
  // guard_cartera_alerta_emitida_tipo: tipo_id no pertenece a la familia TIPO_ALERTA_CARTERA.
  // Mismo patrón que FINANZAS_ALERTA_TIPO_INVALIDO (FIN-4) — se escapó de este registro al
  // cerrar Ola 1 (D-100/D-101) y lo encontró pnpm verify remoto al cerrarla de verdad.
  CARTERA_ALERTA_TIPO_INVALIDO: 'CARTERA_ALERTA_TIPO_INVALIDO',
} as const satisfies Record<string, string>

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]
