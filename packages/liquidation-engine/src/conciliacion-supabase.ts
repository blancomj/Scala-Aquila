/**
 * I/O Supabase del motor de conciliación bancaria — mismo nivel de
 * autorización que cuenta-corriente-supabase.ts (D-14): habla con Supabase,
 * pero toda decisión de NEGOCIO vive en conciliacion-matching.ts (puro).
 *
 * LA REGLA DE ORO (§E.5): este archivo NUNCA hace un INSERT propio en
 * `pagos`. Todo pago sale de registrarPago() (cuenta-corriente-supabase.ts)
 * — el mismo camino canónico que usa registrar-pago/index.ts. De ahí en
 * adelante, el recibo de caja y el descuento por pronto pago ocurren solos
 * (triggers ya existentes).
 */
import type { AquilaClient } from '@aquila/shared'
import { money } from '@aquila/financial-kernel'
import { imputarPago, type CargoAbierto, type PlanImputacion } from './cuenta-corriente.js'
import {
  obtenerCargosAbiertos,
  obtenerPoliticaImputacion,
  registrarPago,
} from './cuenta-corriente-supabase.js'
import { clavePeriodo } from './snapshot.js'
import {
  buscarReferenciaEnTexto,
  evaluarLinea,
  type CandidatoHeuristico,
  type CandidatoPorMontoFecha,
  type CandidatoPorReferencia,
  type DecisionMatching,
  type LineaAConciliar,
} from './conciliacion-matching.js'
import {
  detectarParser,
  formatosSoportados,
  hashArchivo,
  hashLinea,
  type LineaCruda,
} from './conciliacion-parsers.js'

const VENTANA_DIAS_MONTO_FECHA = 5
// Un monto "aproximado" para el heurístico: dentro del ±10% del saldo
// pendiente del inmueble — suficientemente cerca para sumar como factor,
// nunca suficiente por sí solo para auto-aplicar (eso lo decide §6.1).
const TOLERANCIA_MONTO_APROXIMADO = 0.1

export class ArchivoNoReconocidoError extends Error {
  constructor(formatosSoportados: readonly string[]) {
    super(
      `Ningún parser reconoce este archivo. Formatos soportados hoy: ${formatosSoportados.join(', ')}.`,
    )
    this.name = 'ArchivoNoReconocidoError'
  }
}

export class LineaYaResueltaError extends Error {
  constructor(lineaId: string) {
    super(`La línea ${lineaId} ya fue resuelta — no admite una segunda decisión.`)
    this.name = 'LineaYaResueltaError'
  }
}

function diasEntre(fechaA: string, fechaB: string): number {
  const msPorDia = 86_400_000
  return Math.round((new Date(fechaA).getTime() - new Date(fechaB).getTime()) / msPorDia)
}

// ── Resolución de candidatos (SQL) — la decisión la toma evaluarLinea() ──

async function resolverCandidatosPorReferencia(
  cliente: AquilaClient,
  tenantId: string,
  linea: LineaAConciliar,
): Promise<readonly CandidatoPorReferencia[]> {
  // La referencia puede venir en su propio campo o incrustada en la
  // descripción (§304 del prompt: "aparece en descripcion_banco o
  // referencia_banco") — se prueba el campo dedicado primero.
  const textoConReferencia = linea.referenciaBanco ?? linea.descripcionBanco
  const referencia = buscarReferenciaEnTexto(textoConReferencia)
  if (!referencia) return []

  // La referencia estructurada de la Fase 2 (§C.2.5) es la llave real de
  // intenciones_pago — es DATO NO CONFIABLE (viene de texto libre de un
  // extracto), se usa solo para buscar, nunca para autorizar directamente:
  // la fila de intenciones_pago (con su tenant_id/inmueble_id reales) es la
  // fuente de verdad, no lo que se parseó del texto.
  const { data, error } = await cliente
    .from('intenciones_pago')
    .select('inmueble_id')
    .eq('tenant_id', tenantId)
    .eq('referencia', `${referencia.tenantSlug}-${referencia.codigoInmueble}-${referencia.periodo}-${referencia.uuidCorto}`)
    .in('estado', ['creada', 'pendiente'])
    .limit(1)
  if (error) throw new Error(`No se pudo resolver la referencia: ${error.message}`)

  return data.map((i) => ({ inmuebleId: i.inmueble_id, coincideExacto: true }))
}

async function resolverCandidatosPorMontoFecha(
  cliente: AquilaClient,
  tenantId: string,
  linea: LineaAConciliar,
): Promise<readonly CandidatoPorMontoFecha[]> {
  // Saldo pendiente total por inmueble, sumado desde v_cargo_saldo —
  // v_cargo_saldo ya deriva monto_pendiente, nunca se recalcula a mano aquí.
  const { data, error } = await cliente
    .from('v_cargo_saldo')
    .select('inmueble_id, monto_pendiente, fecha_vencimiento, inmueble:inmuebles(codigo)')
    .eq('tenant_id', tenantId)
    .neq('monto_pendiente', 0)
  if (error) throw new Error(`No se pudo leer el saldo pendiente: ${error.message}`)

  const porInmueble = new Map<string, { total: number; codigo: string; fechaMasCercana: string }>()
  for (const fila of data) {
    // v_cargo_saldo.inmueble_id pierde el NOT NULL de cargos en el tipo
    // generado de la vista — en la práctica todo cargo tiene inmueble.
    if (fila.inmueble_id === null) continue
    const inmuebleId: string = fila.inmueble_id

    const actual = porInmueble.get(inmuebleId)
    const total = (actual?.total ?? 0) + Number(fila.monto_pendiente)
    const codigo = fila.inmueble?.codigo ?? '—'

    // fecha_vencimiento es nullable en cargos (categoria='otro' sin
    // vencimiento propio) — sin fecha con la que comparar, esa fila no
    // puede mover "fechaMasCercana"; se ignora para ese propósito, no para
    // el total.
    let fechaMasCercana = actual?.fechaMasCercana ?? linea.fechaMovimiento
    const fechaVencimiento: string | null = fila.fecha_vencimiento
    if (fechaVencimiento !== null) {
      if (!actual || diasEntre(fechaVencimiento, linea.fechaMovimiento) < diasEntre(fechaMasCercana, linea.fechaMovimiento)) {
        fechaMasCercana = fechaVencimiento
      }
    }

    porInmueble.set(inmuebleId, { total, codigo, fechaMasCercana })
  }

  const candidatos: CandidatoPorMontoFecha[] = []
  for (const [inmuebleId, resumen] of porInmueble) {
    candidatos.push({
      inmuebleId,
      codigo: resumen.codigo,
      montoCoincide: Math.abs(resumen.total - linea.monto) < 0.01,
      diasDeDiferencia: diasEntre(linea.fechaMovimiento, resumen.fechaMasCercana),
    })
  }
  // Solo interesan los candidatos con monto coincidente (o cercano, para
  // que el heurístico los use como factor "monto aproximado") — filtrar
  // aquí en vez de en evaluarLinea() mantiene la función pura simple.
  return candidatos.filter(
    (c) => c.montoCoincide || Math.abs(c.diasDeDiferencia) <= VENTANA_DIAS_MONTO_FECHA,
  )
}

async function resolverCandidatosHeuristicos(
  cliente: AquilaClient,
  tenantId: string,
  linea: LineaAConciliar,
  candidatosMontoFecha: readonly CandidatoPorMontoFecha[],
): Promise<readonly CandidatoHeuristico[]> {
  const { data, error } = await cliente.rpc('fn_similitud_pagadores', {
    p_tenant_id: tenantId,
    p_texto: linea.descripcionBanco,
  })
  if (error) throw new Error(`No se pudo calcular similitud de nombre: ${error.message}`)

  const montoFechaPorInmueble = new Map(candidatosMontoFecha.map((c) => [c.inmuebleId, c]))

  return data.map((fila): CandidatoHeuristico => {
    const montoFecha = montoFechaPorInmueble.get(fila.inmueble_id)
    return {
      inmuebleId: fila.inmueble_id,
      codigo: fila.codigo,
      similitudNombre: fila.similitud,
      montoAproximado: montoFecha
        ? Math.abs(1 - linea.monto / Math.max(1, linea.monto)) <= TOLERANCIA_MONTO_APROXIMADO &&
          montoFecha.montoCoincide
        : false,
      diasDeDiferencia: montoFecha?.diasDeDiferencia ?? 999,
    }
  })
}

export async function resolverCandidatos(
  cliente: AquilaClient,
  tenantId: string,
  linea: LineaAConciliar,
): Promise<DecisionMatching> {
  const [candidatosReferencia, candidatosMontoFecha] = await Promise.all([
    resolverCandidatosPorReferencia(cliente, tenantId, linea),
    resolverCandidatosPorMontoFecha(cliente, tenantId, linea),
  ])
  const candidatosHeuristicos =
    linea.monto > 0
      ? await resolverCandidatosHeuristicos(cliente, tenantId, linea, candidatosMontoFecha)
      : []

  return evaluarLinea(linea, candidatosReferencia, candidatosMontoFecha, candidatosHeuristicos)
}

// ── Importación (idempotente en dos niveles) ─────────────────────────────

export interface ResumenImportacion {
  readonly extractoId: string
  readonly lineasTotales: number
  readonly lineasNuevas: number
  readonly lineasYaExistian: number
  readonly autoConciliadas: number
  readonly propuestas: number
  readonly sinCandidato: number
  readonly noEsPago: number
}

export async function importarExtracto(
  cliente: AquilaClient,
  params: {
    tenantId: string
    cuentaBancariaId: string | null
    nombreArchivo: string
    contenidoCrudo: string
    storagePath: string | null
    importadoPor: string
  },
): Promise<ResumenImportacion> {
  const parser = detectarParser(params.contenidoCrudo)
  if (!parser) {
    throw new ArchivoNoReconocidoError(formatosSoportados())
  }

  const lineasCrudas = parser.parsea(params.contenidoCrudo)
  const hashDelArchivo = hashArchivo(params.contenidoCrudo)

  // Idempotencia nivel 1: reimportar el mismo archivo completo no hace nada.
  const { data: existente } = await cliente
    .from('extracto_bancario')
    .select('id')
    .eq('tenant_id', params.tenantId)
    .eq('hash_archivo', hashDelArchivo)
    .maybeSingle()
  if (existente) {
    return {
      extractoId: existente.id,
      lineasTotales: lineasCrudas.length,
      lineasNuevas: 0,
      lineasYaExistian: lineasCrudas.length,
      autoConciliadas: 0,
      propuestas: 0,
      sinCandidato: 0,
      noEsPago: 0,
    }
  }

  const fechas = lineasCrudas.map((l) => l.fechaMovimiento).sort()
  const { data: extracto, error: errorExtracto } = await cliente
    .from('extracto_bancario')
    .insert({
      tenant_id: params.tenantId,
      cuenta_bancaria_id: params.cuentaBancariaId,
      origen: 'banco',
      nombre_archivo: params.nombreArchivo,
      hash_archivo: hashDelArchivo,
      storage_path: params.storagePath,
      periodo_desde: fechas[0] ?? null,
      periodo_hasta: fechas[fechas.length - 1] ?? null,
      lineas_totales: lineasCrudas.length,
      importado_por: params.importadoPor,
    })
    .select('id')
    .single()
  if (errorExtracto) throw new Error(`No se pudo registrar el extracto: ${errorExtracto.message}`)

  const resumen: ResumenImportacion = {
    extractoId: extracto.id,
    lineasTotales: lineasCrudas.length,
    lineasNuevas: 0,
    lineasYaExistian: 0,
    autoConciliadas: 0,
    propuestas: 0,
    sinCandidato: 0,
    noEsPago: 0,
  }
  const acumulado = { ...resumen }

  for (const lineaCruda of lineasCrudas) {
    // Idempotencia nivel 2: extractos solapados no duplican las líneas
    // comunes. El índice único (extracto_id, hash_linea) es por extracto —
    // se comprueba contra CUALQUIER extracto de este tenant, porque lo que
    // importa es no procesar dos veces el mismo movimiento bancario, no
    // solo dentro del mismo archivo.
    const hash = hashLinea(lineaCruda)
    const { data: lineaExistente } = await cliente
      .from('extracto_linea')
      .select('id')
      .eq('tenant_id', params.tenantId)
      .eq('hash_linea', hash)
      .maybeSingle()
    if (lineaExistente) {
      acumulado.lineasYaExistian++
      continue
    }

    acumulado.lineasNuevas++
    const desenlace = await procesarLineaNueva(
      cliente,
      params.tenantId,
      extracto.id,
      lineaCruda,
      hash,
      params.importadoPor,
    )
    if (desenlace === 'auto') acumulado.autoConciliadas++
    else if (desenlace === 'propuestas') acumulado.propuestas++
    else if (desenlace === 'no_es_pago') acumulado.noEsPago++
    else acumulado.sinCandidato++
  }

  return acumulado
}

async function procesarLineaNueva(
  cliente: AquilaClient,
  tenantId: string,
  extractoId: string,
  lineaCruda: LineaCruda,
  hash: string,
  importadoPor: string,
): Promise<'auto' | 'propuestas' | 'sin_candidato' | 'no_es_pago'> {
  const lineaParaMatching: LineaAConciliar = {
    monto: lineaCruda.monto,
    fechaMovimiento: lineaCruda.fechaMovimiento,
    descripcionBanco: lineaCruda.descripcionBanco,
    referenciaBanco: lineaCruda.referenciaBanco,
  }

  const decision =
    lineaCruda.monto <= 0
      ? ({ tipo: 'no_es_pago', motivo: 'Monto no positivo.' } as const)
      : await resolverCandidatos(cliente, tenantId, lineaParaMatching)

  const { data: lineaInsertada, error: errorLinea } = await cliente
    .from('extracto_linea')
    .insert({
      extracto_id: extractoId,
      tenant_id: tenantId,
      fecha_movimiento: lineaCruda.fechaMovimiento,
      monto: lineaCruda.monto,
      descripcion_banco: lineaCruda.descripcionBanco,
      referencia_banco: lineaCruda.referenciaBanco,
      hash_linea: hash,
    })
    .select('id')
    .single()
  if (errorLinea) throw new Error(`No se pudo registrar la línea: ${errorLinea.message}`)

  if (decision.tipo === 'no_es_pago' || decision.tipo === 'sin_candidato') {
    return decision.tipo
  }

  if (decision.tipo === 'propuestas') {
    const { error: errorPropuestas } = await cliente.from('conciliacion_propuesta').insert(
      decision.candidatos.map((c) => ({
        tenant_id: tenantId,
        linea_id: lineaInsertada.id,
        inmueble_id: c.inmuebleId,
        metodo: c.metodo,
        score: c.score,
        // jsonb acepta la forma, pero el tipo generado exige Json (mutable) —
        // el array de factores es de solo lectura por diseño (interfaz
        // pública), se copia superficialmente solo para satisfacer el tipo.
        explicacion: c.explicacion.map((f) => ({ ...f })),
      })),
    )
    if (errorPropuestas) throw new Error(`No se pudieron guardar propuestas: ${errorPropuestas.message}`)
    return 'propuestas'
  }

  // decision.tipo === 'auto' — únicos métodos deterministas (§6.1).
  await materializarPago(cliente, {
    tenantId,
    lineaId: lineaInsertada.id,
    inmuebleId: decision.inmuebleId,
    monto: lineaCruda.monto,
    fechaPago: lineaCruda.fechaMovimiento,
    referencia: lineaCruda.referenciaBanco,
    estadoResultante: 'conciliada_auto',
    // Nadie "resolvió" esta línea manualmente (resuelta_por queda null: no
    // fue una decisión de una persona sobre ESTA línea), pero el pago sí
    // necesita un registrado_por real — es quien importó el archivo.
    resueltaPor: null,
    registradoPor: importadoPor,
    plan: null, // null = usar imputarPago() normal (cascada de política)
  })
  return 'auto'
}

// ── Materialización — el ÚNICO lugar que llama registrarPago() ──────────

async function resolverFormaPagoTransferencia(cliente: AquilaClient): Promise<number> {
  const { data, error } = await cliente
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'FORMA_PAGO')
    .eq('codigo', 'transferencia_bancaria')
    .is('tenant_id', null)
    .single()
  if (error) throw new Error(`No se encontró la forma de pago transferencia_bancaria: ${error.message}`)
  return data.id
}

async function materializarPago(
  cliente: AquilaClient,
  params: {
    tenantId: string
    lineaId: string
    inmuebleId: string
    monto: number
    fechaPago: string
    referencia: string | null
    estadoResultante: 'conciliada_auto' | 'conciliada_manual'
    /** Quién tomó la decisión sobre ESTA línea — null en el camino
     *  automático (nadie decidió, decidió la referencia exacta). */
    resueltaPor: string | null
    /** Quién queda como pagos.registrado_por — siempre una persona real:
     *  quien importó el archivo (auto) o quien resolvió la línea (manual). */
    registradoPor: string
    /** null = imputarPago() normal. Un plan explícito (incluido uno vacío
     *  para "crear saldo a favor") lo pasa quien llama. */
    plan: PlanImputacion | null
  },
): Promise<string> {
  const { data: tenant, error: errorTenant } = await cliente
    .from('tenants')
    .select('moneda')
    .eq('id', params.tenantId)
    .single()
  if (errorTenant) throw new Error(`No se pudo leer el tenant: ${errorTenant.message}`)

  const montoMoney = money(params.monto, tenant.moneda)
  let plan = params.plan
  if (!plan) {
    const cargosAbiertos: readonly CargoAbierto[] = await obtenerCargosAbiertos(cliente, {
      tenantId: params.tenantId,
      inmuebleId: params.inmuebleId,
      moneda: tenant.moneda,
    })
    const politica = await obtenerPoliticaImputacion(cliente, { tenantId: params.tenantId })
    const [anioStr, mesStr] = params.fechaPago.split('-')
    const periodoActualClave = clavePeriodo({ id: '', anio: Number(anioStr), mes: Number(mesStr) })
    plan = imputarPago(
      montoMoney,
      cargosAbiertos,
      politica.orden,
      politica.estrategia,
      periodoActualClave,
    )
  }

  const formaPagoId = await resolverFormaPagoTransferencia(cliente)

  // ÚNICA llamada a registrarPago() de todo el motor — la regla de oro
  // (§E.5): de aquí en adelante, recibo de caja y descuento por pronto pago
  // ocurren solos, por los triggers ya existentes.
  const pagoId = await registrarPago(
    cliente,
    {
      tenantId: params.tenantId,
      inmuebleId: params.inmuebleId,
      monto: montoMoney,
      fechaPago: params.fechaPago,
      registradoPor: params.registradoPor,
      formaPagoId,
      // exactOptionalPropertyTypes: DatosPago.referencia es opcional pero no
      // admite `undefined` explícito — se omite la clave entera si no hay
      // referencia, en vez de asignarle undefined.
      ...(params.referencia ? { referencia: params.referencia } : {}),
    },
    plan,
  )

  const { error: errorLinea } = await cliente
    .from('extracto_linea')
    .update({
      estado: params.estadoResultante,
      pago_id: pagoId,
      resuelta_por: params.resueltaPor,
      resuelta_at: new Date().toISOString(),
    })
    .eq('id', params.lineaId)
  if (errorLinea) {
    throw new Error(
      `El pago ${pagoId} se registró pero no se pudo marcar la línea ${params.lineaId}: ` +
        `${errorLinea.message}. Requiere revisión manual — el pago es real y no debe repetirse.`,
    )
  }

  return pagoId
}

// ── Acciones de la cola manual (§6.4) ────────────────────────────────────

async function verificarLineaPendiente(
  cliente: AquilaClient,
  tenantId: string,
  lineaId: string,
): Promise<{ inmuebleId: string | null; monto: number; fechaMovimiento: string; referenciaBanco: string | null }> {
  const { data, error } = await cliente
    .from('extracto_linea')
    .select('estado, monto, fecha_movimiento, referencia_banco')
    .eq('tenant_id', tenantId)
    .eq('id', lineaId)
    .single()
  if (error) throw new Error(`No se pudo leer la línea: ${error.message}`)
  if (data.estado !== 'pendiente') throw new LineaYaResueltaError(lineaId)
  return {
    inmuebleId: null,
    monto: data.monto,
    fechaMovimiento: data.fecha_movimiento,
    referenciaBanco: data.referencia_banco,
  }
}

/** Acción "Aplicar a inmueble" — imputarPago() normal (cascada de política).
 *  Lo que sobre, si sobra, queda como anticipo automáticamente. */
export async function aplicarLineaAInmueble(
  cliente: AquilaClient,
  params: { tenantId: string; lineaId: string; inmuebleId: string; actorId: string },
): Promise<string> {
  const linea = await verificarLineaPendiente(cliente, params.tenantId, params.lineaId)
  return materializarPago(cliente, {
    tenantId: params.tenantId,
    lineaId: params.lineaId,
    inmuebleId: params.inmuebleId,
    monto: linea.monto,
    fechaPago: linea.fechaMovimiento,
    referencia: linea.referenciaBanco,
    estadoResultante: 'conciliada_manual',
    resueltaPor: params.actorId,
    registradoPor: params.actorId,
    plan: null,
  })
}

/** Acción "Crear saldo a favor" — el monto completo queda como anticipo, sin
 *  tocar ningún cargo. NO reimplementa fn_aplicar_anticipos (que resuelve
 *  algo distinto: aplicar anticipos YA EXISTENTES a cargos NUEVOS que
 *  aparecen después) — solo construye un plan vacío para registrarPago(). */
export async function crearSaldoAFavorDesdeLinea(
  cliente: AquilaClient,
  params: { tenantId: string; lineaId: string; inmuebleId: string; actorId: string },
): Promise<string> {
  const linea = await verificarLineaPendiente(cliente, params.tenantId, params.lineaId)
  const { data: tenant, error: errorTenant } = await cliente
    .from('tenants')
    .select('moneda')
    .eq('id', params.tenantId)
    .single()
  if (errorTenant) throw new Error(`No se pudo leer el tenant: ${errorTenant.message}`)

  const montoMoney = money(linea.monto, tenant.moneda)
  const planSaldoAFavor: PlanImputacion = { aplicaciones: [], aplicado: money(0, tenant.moneda), noAplicado: montoMoney }

  return materializarPago(cliente, {
    tenantId: params.tenantId,
    lineaId: params.lineaId,
    inmuebleId: params.inmuebleId,
    monto: linea.monto,
    fechaPago: linea.fechaMovimiento,
    referencia: linea.referenciaBanco,
    estadoResultante: 'conciliada_manual',
    resueltaPor: params.actorId,
    registradoPor: params.actorId,
    plan: planSaldoAFavor,
  })
}

/** Acción "Descartar con motivo" — desenlace legítimo y auditado (§6.3), no
 *  un fallo. La línea es terminal después (guard_conciliacion_transicion). */
export async function descartarLinea(
  cliente: AquilaClient,
  params: { tenantId: string; lineaId: string; motivo: string; actorId: string },
): Promise<void> {
  await verificarLineaPendiente(cliente, params.tenantId, params.lineaId)
  const { error } = await cliente
    .from('extracto_linea')
    .update({
      estado: 'descartada',
      descartada_motivo: params.motivo,
      resuelta_por: params.actorId,
      resuelta_at: new Date().toISOString(),
    })
    .eq('id', params.lineaId)
    .eq('tenant_id', params.tenantId)
  if (error) throw new Error(`No se pudo descartar la línea: ${error.message}`)
}

// ── Métrica de producto (§E.6, §6.5) ─────────────────────────────────────

export interface MetricaAutoConciliacion {
  readonly candidatasAPago: number
  readonly autoConciliadas: number
  readonly porcentaje: number
}

/** % sobre las líneas CANDIDATAS A PAGO (monto > 0), no sobre el total del
 *  archivo — si no, el KPI miente (§6.3). */
export async function medirAutoConciliacion(
  cliente: AquilaClient,
  tenantId: string,
  periodoDesde: string,
  periodoHasta: string,
): Promise<MetricaAutoConciliacion> {
  const { data, error } = await cliente
    .from('extracto_linea')
    .select('estado, monto')
    .eq('tenant_id', tenantId)
    .gte('fecha_movimiento', periodoDesde)
    .lte('fecha_movimiento', periodoHasta)
    .gt('monto', 0)
  if (error) throw new Error(`No se pudo medir la conciliación: ${error.message}`)

  const candidatasAPago = data.length
  const autoConciliadas = data.filter((f) => f.estado === 'conciliada_auto').length
  return {
    candidatasAPago,
    autoConciliadas,
    porcentaje: candidatasAPago === 0 ? 0 : Math.round((autoConciliadas / candidatasAPago) * 10000) / 100,
  }
}
