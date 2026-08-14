/**
 * Snapshot Builder respaldado por Supabase — Docs/17 §27-29 (SNAPSHOT
 * BUILDER RESPONSIBILITIES/NON-RESPONSIBILITY).
 *
 * Único módulo de liquidation-engine autorizado a hablar con Supabase
 * (D-14, vigilado por eslint.config.js) — el resto del paquete es puro y
 * opera solo sobre el `DataSnapshot` que esta función produce.
 *
 * GAP abierto (heredado de 20260814100400_seed_gc001.sql, F2): no existe
 * columna para `PARAMETER.OTROS_INGRESOS_ANUAL`. No se inventa aquí — si
 * una fórmula lo referencia, el evaluador lanzará `ContractoNoResueltoError`
 * explícito (17 §37 SNAPSHOT INCOMPLETE) en vez de asumir cero en silencio.
 *
 * Nota de tipos: PostgrestResponse/PostgrestSingleResponse son uniones
 * discriminadas por `error` — tras `if (error) throw`, `data` queda
 * estrechado a no-nulo (array posiblemente vacío, o la fila con `.single()`)
 * sin necesitar `??`/`?.` adicionales. `.maybeSingle()` es la excepción
 * real: `data` puede ser `null` sin error, y así se trata más abajo.
 */
import type { AquilaClient } from '@aquila/shared'
import { money, type ModoRedondeo } from '@aquila/financial-kernel'
import type { TypedValue } from '@aquila/ael-runtime'
import type { DataSnapshot, SnapshotConcepto, SnapshotPeriodo } from './snapshot.js'

function mapearModoRedondeo(modo: 'half_up' | 'half_even' | 'down' | 'up'): ModoRedondeo {
  switch (modo) {
    case 'half_up':
      return 'HALF_UP'
    case 'half_even':
      return 'HALF_EVEN'
    case 'down':
      return 'DOWN'
    case 'up':
      return 'UP'
  }
}

export interface OpcionesSnapshot {
  readonly tenantId: string
  readonly anio: number
  readonly mes: number
}

export async function construirSnapshotDesdeSupabase(
  cliente: AquilaClient,
  opciones: OpcionesSnapshot,
): Promise<DataSnapshot> {
  const { tenantId, anio, mes } = opciones

  const { data: tenant, error: errorTenant } = await cliente
    .from('tenants')
    .select('id, moneda')
    .eq('id', tenantId)
    .single()
  if (errorTenant) {
    throw new Error(`No se pudo resolver el tenant ${tenantId}: ${errorTenant.message}`)
  }

  const { data: periodosFilas, error: errorPeriodos } = await cliente
    .from('periodos')
    .select('id, anio, mes')
    .eq('tenant_id', tenantId)
    .eq('anio', anio)
    .order('mes')
  if (errorPeriodos) throw new Error(`No se pudieron leer los periodos: ${errorPeriodos.message}`)

  const periodosDelAnio: SnapshotPeriodo[] = periodosFilas.map((p) => ({
    id: p.id,
    anio: p.anio,
    mes: p.mes,
  }))
  const periodo = periodosDelAnio.find((p) => p.mes === mes)
  if (!periodo) {
    throw new Error(
      `No existe el periodo ${String(anio)}-${String(mes)} para el tenant ${tenantId}`,
    )
  }

  const { data: inmueblesFilas, error: errorInmuebles } = await cliente
    .from('inmuebles')
    .select('id, codigo')
    .eq('tenant_id', tenantId)
    .eq('estado', 'activo')
  if (errorInmuebles)
    throw new Error(`No se pudieron leer los inmuebles: ${errorInmuebles.message}`)

  const { data: setVigente, error: errorSet } = await cliente
    .from('coeficiente_sets')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('estado', 'vigente')
    .single()
  if (errorSet) {
    throw new Error(
      `No hay un coeficiente_set vigente para el tenant ${tenantId}: ${errorSet.message}`,
    )
  }

  const { data: coeficientesFilas, error: errorCoef } = await cliente
    .from('coeficientes')
    .select('inmueble_id, valor')
    .eq('set_id', setVigente.id)
  if (errorCoef) throw new Error(`No se pudieron leer los coeficientes: ${errorCoef.message}`)

  const coeficientePorInmueble = new Map(coeficientesFilas.map((c) => [c.inmueble_id, c.valor]))

  const inmuebles = inmueblesFilas.map((inmueble) => {
    const coeficiente = coeficientePorInmueble.get(inmueble.id)
    if (coeficiente === undefined) {
      throw new Error(`El inmueble ${inmueble.codigo} no tiene coeficiente en el set vigente`)
    }
    return { id: inmueble.id, codigo: inmueble.codigo, coeficiente: String(coeficiente) }
  })

  const { data: presupuesto, error: errorPresupuesto } = await cliente
    .from('presupuestos')
    .select('id, anio, monto_total')
    .eq('tenant_id', tenantId)
    .eq('anio', anio)
    .eq('estado', 'vigente')
    .maybeSingle()
  if (errorPresupuesto)
    throw new Error(`No se pudo leer el presupuesto vigente: ${errorPresupuesto.message}`)

  const { data: politica, error: errorPolitica } = await cliente
    .from('politicas_financieras')
    .select('redondeo_modo, redondeo_escala')
    .eq('tenant_id', tenantId)
    .eq('estado', 'vigente')
    .single()
  if (errorPolitica) {
    throw new Error(
      `No hay una política financiera vigente para el tenant ${tenantId}: ${errorPolitica.message}`,
    )
  }

  const { data: conceptosFilas, error: errorConceptos } = await cliente
    .from('conceptos')
    .select('id, codigo, modo_calculo, formula_ael, prioridad')
    .eq('tenant_id', tenantId)
    .eq('estado', 'activo')
  if (errorConceptos)
    throw new Error(`No se pudieron leer los conceptos: ${errorConceptos.message}`)

  // v0 no ejecuta conceptos sin formula_ael (tipo_base-only) — AD-23: se
  // amplía cuando un caso real lo requiera.
  const conceptos: SnapshotConcepto[] = conceptosFilas
    .filter((c): c is typeof c & { formula_ael: string } => c.formula_ael !== null)
    .map((c) => ({
      id: c.id,
      codigo: c.codigo,
      modoCalculo: c.modo_calculo,
      formulaAel: c.formula_ael,
      prioridad: c.prioridad,
    }))

  const parametros: Record<string, TypedValue> = {}
  if (presupuesto) {
    parametros.PRESUPUESTO_ANUAL = {
      tipo: 'MONEY',
      valor: money(presupuesto.monto_total, tenant.moneda),
    }
  }

  return {
    tenantId: tenant.id,
    moneda: tenant.moneda,
    periodo,
    periodosDelAnio,
    inmuebles,
    conceptos,
    presupuestoVigente: presupuesto
      ? { id: presupuesto.id, anio: presupuesto.anio, montoTotal: String(presupuesto.monto_total) }
      : null,
    politica: {
      redondeoModo: mapearModoRedondeo(politica.redondeo_modo),
      redondeoEscala: politica.redondeo_escala,
    },
    parametros,
    unidades: {},
  }
}
