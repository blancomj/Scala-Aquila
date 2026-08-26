/**
 * I/O Supabase del ledger de cuenta corriente — mismo nivel de autorización
 * que snapshot-supabase.ts/persistencia-supabase.ts (D-14, vigilado por
 * eslint.config.js): único otro módulo del paquete que habla con Supabase.
 */
import type { AquilaClient } from '@aquila/shared'
import { money, type Money } from '@aquila/financial-kernel'
import { PeriodoSinFechaVencimientoError } from './errors.js'
import { clavePeriodo } from './snapshot.js'
import type {
  CargoAbierto,
  CargoInteresGenerado,
  CategoriaCargo,
  EstrategiaImputacion,
  PlanImputacion,
  PoliticaMora,
} from './cuenta-corriente.js'

export interface OpcionesCargosAbiertos {
  readonly tenantId: string
  readonly inmuebleId: string
  readonly moneda: string
}

export async function obtenerCargosAbiertos(
  cliente: AquilaClient,
  opciones: OpcionesCargosAbiertos,
): Promise<readonly CargoAbierto[]> {
  const { tenantId, inmuebleId, moneda } = opciones

  const { data: filas, error } = await cliente
    .from('v_cargo_saldo')
    .select('id, periodo_id, categoria, concepto_id, novedad_id, monto_pendiente, fecha_vencimiento')
    .eq('tenant_id', tenantId)
    .eq('inmueble_id', inmuebleId)
    .neq('monto_pendiente', 0)
  if (error) throw new Error(`No se pudieron leer los cargos abiertos: ${error.message}`)
  if (filas.length === 0) return []

  // REQ-NOVEDAD-003 (D-23): calcularInteresMora() necesita saber cuáles
  // cargos categoria='otro' vienen de un DISCOUNT — novedades.tipo no está
  // en v_cargo_saldo (solo novedad_id), así que se resuelve aparte, mismo
  // patrón que periodoPorId/conceptoPrioridadPorId.
  const novedadIds = [...new Set(filas.flatMap((f) => (f.novedad_id ? [f.novedad_id] : [])))]
  const tipoPorNovedadId = new Map<string, string>()
  if (novedadIds.length > 0) {
    const { data: novedades, error: errorNovedades } = await cliente
      .from('novedades')
      .select('id, tipo')
      .in('id', novedadIds)
    if (errorNovedades) throw new Error(`No se pudieron leer las novedades: ${errorNovedades.message}`)
    for (const n of novedades) tipoPorNovedadId.set(n.id, n.tipo)
  }

  const periodoIds = [...new Set(filas.flatMap((f) => (f.periodo_id ? [f.periodo_id] : [])))]
  const { data: periodos, error: errorPeriodos } = await cliente
    .from('periodos')
    .select('id, anio, mes, fecha_vencimiento')
    .in('id', periodoIds)
  if (errorPeriodos) throw new Error(`No se pudieron leer los periodos: ${errorPeriodos.message}`)
  const periodoPorId = new Map(periodos.map((p) => [p.id, p]))

  const conceptoIds = [...new Set(filas.flatMap((f) => (f.concepto_id ? [f.concepto_id] : [])))]
  const conceptoPrioridadPorId = new Map<string, number>()
  if (conceptoIds.length > 0) {
    const { data: conceptos, error: errorConceptos } = await cliente
      .from('conceptos')
      .select('id, prioridad')
      .in('id', conceptoIds)
    if (errorConceptos)
      throw new Error(`No se pudieron leer los conceptos: ${errorConceptos.message}`)
    for (const c of conceptos) conceptoPrioridadPorId.set(c.id, c.prioridad)
  }

  return filas.map((f) => {
    // v_cargo_saldo es una vista — Postgres no propaga los NOT NULL de
    // cargos/la agregación COALESCE al tipo generado. Nunca deberían venir
    // nulos en la práctica; si ocurre, es un invariante roto del motor, no
    // un caso de negocio (0AEL §23: errores typed, actionable, traceable).
    if (f.id === null || f.periodo_id === null || f.monto_pendiente === null) {
      throw new Error(`Invariante violado: fila de v_cargo_saldo con columna NOT NULL en null`)
    }
    const periodo = periodoPorId.get(f.periodo_id)
    if (!periodo) {
      throw new Error(`El cargo ${f.id} referencia un periodo inexistente (${f.periodo_id})`)
    }
    // GAP-CAR-001: cargos.fecha_vencimiento es un override opcional del
    // vencimiento del periodo (cuotas con calendario propio) — la fecha
    // efectiva es la del cargo si existe, si no la del periodo.
    const fechaVencimientoEfectiva = f.fecha_vencimiento ?? periodo.fecha_vencimiento
    if (fechaVencimientoEfectiva === null) {
      throw new PeriodoSinFechaVencimientoError(f.id, periodo.id)
    }
    return {
      id: f.id,
      periodoClave: clavePeriodo({ id: periodo.id, anio: periodo.anio, mes: periodo.mes }),
      categoria: f.categoria as CategoriaCargo,
      conceptoPrioridad: f.concepto_id ? (conceptoPrioridadPorId.get(f.concepto_id) ?? null) : null,
      fechaVencimiento: fechaVencimientoEfectiva,
      montoPendiente: money(f.monto_pendiente, moneda),
      novedadTipo: f.novedad_id
        ? ((tipoPorNovedadId.get(f.novedad_id) ?? null) as CargoAbierto['novedadTipo'])
        : null,
    }
  })
}

export async function obtenerPoliticaMora(
  cliente: AquilaClient,
  opciones: { tenantId: string },
): Promise<PoliticaMora> {
  const { data, error } = await cliente
    .from('politicas_financieras')
    .select(
      'interes_tasa_mensual, interes_tope_mensual, interes_dias_gracia, interes_day_count, interes_descuento_orden',
    )
    .eq('tenant_id', opciones.tenantId)
    .eq('estado', 'vigente')
    .single()
  if (error) {
    throw new Error(
      `No hay una política financiera vigente para el tenant ${opciones.tenantId}: ${error.message}`,
    )
  }

  return {
    tasaMensual: data.interes_tasa_mensual === null ? null : String(data.interes_tasa_mensual),
    topeMensual: data.interes_tope_mensual === null ? null : String(data.interes_tope_mensual),
    diasGracia: data.interes_dias_gracia,
    dayCount: data.interes_day_count,
    descuentoOrden: data.interes_descuento_orden,
  }
}

export interface PoliticaImputacion {
  readonly orden: readonly CategoriaCargo[]
  readonly estrategia: EstrategiaImputacion
}

export async function obtenerPoliticaImputacion(
  cliente: AquilaClient,
  opciones: { tenantId: string },
): Promise<PoliticaImputacion> {
  const { data, error } = await cliente
    .from('politicas_financieras')
    .select('imputacion_orden, imputacion_estrategia')
    .eq('tenant_id', opciones.tenantId)
    .eq('estado', 'vigente')
    .single()
  if (error) {
    throw new Error(
      `No hay una política financiera vigente para el tenant ${opciones.tenantId}: ${error.message}`,
    )
  }

  return {
    // Validado en runtime por imputarPago() (OrdenImputacionInvalidoError) — no se
    // repite la validación aquí, un solo punto de verdad.
    orden: data.imputacion_orden as CategoriaCargo[],
    estrategia: data.imputacion_estrategia,
  }
}

export interface DatosPago {
  readonly tenantId: string
  readonly inmuebleId: string
  readonly monto: Money
  readonly fechaPago: string
  readonly referencia?: string
  readonly registradoPor: string
}

export async function registrarPago(
  cliente: AquilaClient,
  datos: DatosPago,
  plan: PlanImputacion,
): Promise<string> {
  const { data: pago, error: errorPago } = await cliente
    .from('pagos')
    .insert({
      tenant_id: datos.tenantId,
      inmueble_id: datos.inmuebleId,
      monto: Number(datos.monto.amount.toString()),
      fecha_pago: datos.fechaPago,
      referencia: datos.referencia ?? null,
      registrado_por: datos.registradoPor,
    })
    .select('id')
    .single()
  if (errorPago) throw new Error(`No se pudo registrar el pago: ${errorPago.message}`)

  if (plan.aplicaciones.length === 0) return pago.id

  const filas = plan.aplicaciones.map((a) => ({
    tenant_id: datos.tenantId,
    pago_id: pago.id,
    cargo_id: a.cargoId,
    monto: Number(a.monto.amount.toString()),
  }))
  const { error: errorAplicaciones } = await cliente.from('pago_aplicaciones').insert(filas)
  if (errorAplicaciones) {
    throw new Error(
      `No se pudieron registrar las aplicaciones del pago: ${errorAplicaciones.message}`,
    )
  }

  return pago.id
}

/** AD-33: el interés se registra como cargo categoria='interes', heredando periodo/inmueble del capital origen. */
export async function registrarCargoInteres(
  cliente: AquilaClient,
  tenantId: string,
  cargosInteres: readonly CargoInteresGenerado[],
): Promise<void> {
  if (cargosInteres.length === 0) return

  const origenIds = [...new Set(cargosInteres.map((c) => c.cargoCapitalOrigenId))]
  const { data: origenes, error: errorOrigenes } = await cliente
    .from('cargos')
    .select('id, periodo_id, inmueble_id')
    .in('id', origenIds)
  if (errorOrigenes) {
    throw new Error(`No se pudieron leer los cargos de capital origen: ${errorOrigenes.message}`)
  }
  const origenPorId = new Map(origenes.map((o) => [o.id, o]))

  const filas = cargosInteres.map((c) => {
    const origen = origenPorId.get(c.cargoCapitalOrigenId)
    if (!origen) {
      throw new Error(`El cargo de capital origen ${c.cargoCapitalOrigenId} no existe`)
    }
    return {
      tenant_id: tenantId,
      inmueble_id: origen.inmueble_id,
      periodo_id: origen.periodo_id,
      categoria: 'interes' as const,
      origen_tipo: 'interes' as const,
      cargo_capital_origen_id: c.cargoCapitalOrigenId,
      monto_original: Number(c.monto.amount.toString()),
    }
  })

  const { error } = await cliente.from('cargos').insert(filas)
  if (error) throw new Error(`No se pudieron registrar los cargos de interés: ${error.message}`)
}

/**
 * Conceptos avanzados Fase 4 — paso periódico de novedades permanentes/
 * prorrateables, invocado desde liquidar-periodo justo después de
 * guardarLiquidacion(). Delega toda la lógica (idempotencia, próxima cuota
 * pendiente) en fn_generar_cargos_novedades_periodo() — un RPC, no un
 * INSERT directo, porque necesita atomicidad entre "reclamar la cuota" y
 * "generar el cargo" que un cliente HTTP no puede garantizar sin una
 * transacción explícita. Devuelve cuántos cargos nuevos se generaron.
 */
export async function generarCargosNovedadesPeriodo(
  cliente: AquilaClient,
  tenantId: string,
  periodoId: string,
): Promise<number> {
  const { data, error } = await cliente.rpc('fn_generar_cargos_novedades_periodo', {
    p_tenant_id: tenantId,
    p_periodo_id: periodoId,
  })
  if (error) {
    throw new Error(`No se pudieron generar los cargos de novedades del periodo: ${error.message}`)
  }
  return data
}

/**
 * Idempotencia entre corridas de calcular-intereses (pregunta abierta del
 * plan, resuelta aquí — no en 0AEL/PLAN): calcularInteresMora() no lleva
 * estado propio y recalcula desde fechaVencimiento cada vez, así que una
 * segunda corrida sobre el mismo rango duplicaría interés ya generado. Este
 * helper devuelve, por cada cargo de capital, la fecha del interés más
 * reciente ya generado sobre él (si existe) — el llamador debe usarla como
 * piso de fechaVencimiento antes de invocar calcularInteresMora(), para que
 * cada corrida solo devengue los días nuevos desde la última.
 */
export async function obtenerUltimaFechaInteresPorCapital(
  cliente: AquilaClient,
  cargoCapitalIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (cargoCapitalIds.length === 0) return new Map()

  const { data, error } = await cliente
    .from('cargos')
    .select('cargo_capital_origen_id, created_at')
    .in('cargo_capital_origen_id', cargoCapitalIds)
    .eq('origen_tipo', 'interes')
    .order('created_at', { ascending: false })
  if (error) {
    throw new Error(`No se pudieron leer los intereses ya generados: ${error.message}`)
  }

  const ultimaFechaPorCapital = new Map<string, string>()
  for (const fila of data) {
    if (fila.cargo_capital_origen_id === null) continue
    // El primero visto por capital es el más reciente (orden DESC).
    if (!ultimaFechaPorCapital.has(fila.cargo_capital_origen_id)) {
      ultimaFechaPorCapital.set(fila.cargo_capital_origen_id, fila.created_at.slice(0, 10))
    }
  }
  return ultimaFechaPorCapital
}
