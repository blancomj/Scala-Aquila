/**
 * Ensambla el resultado de la liquidación y verifica las reconciliaciones
 * obligatorias de PLAN §6.4 (R1, R3, R4 — R6 se satisface por construcción:
 * el snapshot nunca incluye zonas_comunes como dato de cálculo, PLAN §4.1.1;
 * R7 se satisface dentro de `allocate()` mismo, ver executor.ts).
 * 0AEL §20: detect → report → block — nunca se ajusta el resultado.
 */
import { esIgual, money, sumar, type Money } from '@aquila/financial-kernel'
import { ReconciliacionLiquidacionFallidaError } from './errors.js'
import type { ResultadoConcepto } from './executor.js'
import type { DataSnapshot } from './snapshot.js'

export interface LineaResultado {
  readonly inmuebleId: string
  readonly conceptoCodigo: string
  readonly monto: Money
}

export interface TotalInmueble {
  readonly inmuebleId: string
  readonly total: Money
}

/** ADC-01 — inmuebles que un concepto segmentado dejó fuera porque les falta el
 * dato que su condición consulta (no porque el valor sea distinto). Alimenta un
 * AVISO de pre-liquidación, nunca un bloqueo: la decisión es del administrador,
 * pero tiene que verla. Criterio D4 (20260830580000): el aviso aceptado queda
 * registrado al aplicar, así que meses después "¿sabíamos que el Local 5 no
 * recibió la vigilancia comercial?" se responde con un sí verificable.
 *
 * NO entra en calcularResultHash (hash.ts serializa solo líneas y totales), así
 * que exponerlo no invalida ninguna pre-liquidación ya sellada. */
export interface AvisoAlcanceSinDato {
  readonly conceptoCodigo: string
  readonly inmuebleId: string
  readonly campos: readonly string[]
}

export interface LiquidationResult {
  readonly tenantId: string
  readonly periodoId: string
  readonly lineas: readonly LineaResultado[]
  readonly totalesPorInmueble: readonly TotalInmueble[]
  readonly tenantTotal: Money
  readonly avisosAlcance: readonly AvisoAlcanceSinDato[]
}

export function ensamblarResultado(
  snapshot: DataSnapshot,
  resultadosConcepto: readonly ResultadoConcepto[],
): LiquidationResult {
  const moneda = snapshot.moneda
  const lineas: LineaResultado[] = resultadosConcepto.flatMap((r) => r.lineas)

  // R1 (a nivel de periodo): Σ líneas de un concepto `distribucion` = lo repartido
  // en el Paso 2 para este periodo. allocate() ya lo garantiza internamente; se
  // reverifica aquí como defensa en profundidad sobre el ensamblado del resultado.
  for (const r of resultadosConcepto) {
    if (r.cuotaPeriodo === null) continue
    const sumaLineas = r.lineas.reduce((acc, l) => sumar(acc, l.monto), money(0, moneda))
    if (!esIgual(sumaLineas, r.cuotaPeriodo)) {
      throw new ReconciliacionLiquidacionFallidaError(
        'R1',
        `concepto ${r.conceptoCodigo}: Σ líneas (${sumaLineas.amount.toString()}) ≠ ` +
          `cuota del periodo (${r.cuotaPeriodo.amount.toString()})`,
      )
    }
  }

  // R3: totalInmueble = Σ líneas de ese inmueble (es la definición de totalPorInmueble).
  const totalesMap = new Map<string, Money>()
  for (const linea of lineas) {
    const actual = totalesMap.get(linea.inmuebleId) ?? money(0, moneda)
    totalesMap.set(linea.inmuebleId, sumar(actual, linea.monto))
  }
  const totalesPorInmueble: TotalInmueble[] = snapshot.inmuebles.map((inmueble) => ({
    inmuebleId: inmueble.id,
    total: totalesMap.get(inmueble.id) ?? money(0, moneda),
  }))

  // R4: tenantTotal = Σ totalInmueble — se calcula por dos caminos independientes
  // y se exige que coincidan, en vez de asumir que uno implica el otro.
  const tenantTotalDesdeLineas = lineas.reduce((acc, l) => sumar(acc, l.monto), money(0, moneda))
  const tenantTotalDesdeInmuebles = totalesPorInmueble.reduce(
    (acc, t) => sumar(acc, t.total),
    money(0, moneda),
  )
  if (!esIgual(tenantTotalDesdeLineas, tenantTotalDesdeInmuebles)) {
    throw new ReconciliacionLiquidacionFallidaError(
      'R4',
      `tenantTotal por líneas (${tenantTotalDesdeLineas.amount.toString()}) ≠ ` +
        `Σ totalInmueble (${tenantTotalDesdeInmuebles.amount.toString()})`,
    )
  }

  return {
    tenantId: snapshot.tenantId,
    periodoId: snapshot.periodo.id,
    lineas,
    totalesPorInmueble,
    tenantTotal: tenantTotalDesdeLineas,
    avisosAlcance: resultadosConcepto.flatMap((r) =>
      r.excluidosSinDato.map((e) => ({
        conceptoCodigo: r.conceptoCodigo,
        inmuebleId: e.inmuebleId,
        campos: e.campos,
      })),
    ),
  }
}
