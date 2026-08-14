/**
 * DataSnapshot — Docs/17 §8-24 (SNAPSHOT, DATA CATEGORIES): vista congelada e
 * inmutable de los datos necesarios para liquidar UN periodo de UN tenant.
 *
 * D-14: solo lo que las reglas piloto seedeadas en F2 necesitan — no "toda
 * la base de datos" (17 §12-13 SNAPSHOT CONTENT/PRINCIPLE). Sin pagos,
 * novedades ni saldo anterior (D-13).
 */
import type { TypedValue } from '@aquila/ael-runtime'
import type { ModoRedondeo } from '@aquila/financial-kernel'

export interface SnapshotInmueble {
  readonly id: string
  readonly codigo: string
  /** Coeficiente vigente de este inmueble en el set activo del tenant (16 §82: valor real, no se asume 1.0). */
  readonly coeficiente: string
}

export interface SnapshotPeriodo {
  readonly id: string
  readonly anio: number
  readonly mes: number
}

export interface SnapshotConcepto {
  readonly id: string
  readonly codigo: string
  readonly modoCalculo: 'directo' | 'distribucion'
  readonly formulaAel: string
  readonly prioridad: number
}

export interface SnapshotPresupuesto {
  readonly id: string
  readonly anio: number
  readonly montoTotal: string
}

export interface SnapshotPolitica {
  readonly redondeoModo: ModoRedondeo
  readonly redondeoEscala: number
}

export interface DataSnapshot {
  readonly tenantId: string
  readonly moneda: string
  /** El periodo que se está liquidando. */
  readonly periodo: SnapshotPeriodo
  /** Los 12 periodos del mismo año — Paso 1 de PLAN §6.5 reparte el presupuesto entre todos ellos. */
  readonly periodosDelAnio: readonly SnapshotPeriodo[]
  readonly inmuebles: readonly SnapshotInmueble[]
  readonly conceptos: readonly SnapshotConcepto[]
  readonly presupuestoVigente: SnapshotPresupuesto | null
  readonly politica: SnapshotPolitica
  /**
   * PARAMETER.<clave> — quien construye el snapshot es responsable de volcar
   * aquí los valores derivables de otras tablas (p.ej. PRESUPUESTO_ANUAL desde
   * `presupuestoVigente.montoTotal`) antes de pasarlo al motor. El motor no
   * infiere nada por sí mismo (17 §25 NO LIVE LOOKUP).
   */
  readonly parametros: Readonly<Record<string, TypedValue>>
  /** UNIT.<clave> por inmueble — vacío en v0 (D-13). */
  readonly unidades: Readonly<Record<string, Readonly<Record<string, TypedValue>>>>
}

/** Clave de ordenamiento cronológico ascendente — "2026-01" < "2026-02" < … < "2026-12". */
export function clavePeriodo(p: SnapshotPeriodo): string {
  return `${String(p.anio).padStart(4, '0')}-${String(p.mes).padStart(2, '0')}`
}
