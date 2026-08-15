/**
 * I/O Supabase del ledger de cuenta corriente — mismo nivel de autorización
 * que snapshot-supabase.ts/persistencia-supabase.ts (D-14, vigilado por
 * eslint.config.js): único otro módulo del paquete que habla con Supabase.
 */
import type { AquilaClient } from '@aquila/shared'
import { money, type Money } from '@aquila/financial-kernel'
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
    .select('id, periodo_id, categoria, concepto_id, monto_pendiente')
    .eq('tenant_id', tenantId)
    .eq('inmueble_id', inmuebleId)
    .neq('monto_pendiente', 0)
  if (error) throw new Error(`No se pudieron leer los cargos abiertos: ${error.message}`)
  if (filas.length === 0) return []

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
    if (periodo.fecha_vencimiento === null) {
      throw new Error(
        `El periodo ${periodo.id} no tiene fecha_vencimiento configurada — requerida ` +
          `para el ledger de cuenta corriente`,
      )
    }
    return {
      id: f.id,
      periodoClave: clavePeriodo({ id: periodo.id, anio: periodo.anio, mes: periodo.mes }),
      categoria: f.categoria as CategoriaCargo,
      conceptoPrioridad: f.concepto_id ? (conceptoPrioridadPorId.get(f.concepto_id) ?? null) : null,
      fechaVencimiento: periodo.fecha_vencimiento,
      montoPendiente: money(f.monto_pendiente, moneda),
    }
  })
}

export async function obtenerPoliticaMora(
  cliente: AquilaClient,
  opciones: { tenantId: string },
): Promise<PoliticaMora> {
  const { data, error } = await cliente
    .from('politicas_financieras')
    .select('interes_tasa_mensual, interes_tope_mensual, interes_dias_gracia')
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

/** Filas ya insertadas de liquidacion_lineas (con `.select()` sobre el insert). */
export interface LiquidacionLineaInsertada {
  readonly id: string
  readonly inmueble_id: string
  readonly concepto_id: string
  readonly monto: number
}

/** AD-33 aplicado a capital: un cargo por cada línea de liquidación con monto != 0. */
export async function registrarCargosDeLiquidacion(
  cliente: AquilaClient,
  tenantId: string,
  periodoId: string,
  lineas: readonly LiquidacionLineaInsertada[],
): Promise<void> {
  const cargos = lineas
    .filter((l) => l.monto !== 0)
    .map((l) => ({
      tenant_id: tenantId,
      inmueble_id: l.inmueble_id,
      periodo_id: periodoId,
      categoria: 'capital' as const,
      origen_tipo: 'liquidacion_linea' as const,
      liquidacion_linea_id: l.id,
      concepto_id: l.concepto_id,
      monto_original: l.monto,
    }))
  if (cargos.length === 0) return

  const { error } = await cliente.from('cargos').insert(cargos)
  if (error)
    throw new Error(`No se pudieron registrar los cargos de la liquidación: ${error.message}`)
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
