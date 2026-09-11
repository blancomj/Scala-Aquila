/**
 * DataSnapshot — Docs/17 §8-24 (SNAPSHOT, DATA CATEGORIES): vista congelada e
 * inmutable de los datos necesarios para liquidar UN periodo de UN tenant.
 *
 * D-14: solo lo que las reglas piloto seedeadas en F2 necesitan — no "toda
 * la base de datos" (17 §12-13 SNAPSHOT CONTENT/PRINCIPLE). Pagos y saldo
 * anterior viven fuera de este snapshot a propósito (AD-31): son un ledger
 * de cuenta corriente separado (cuenta-corriente.ts/-supabase.ts), no
 * datos congelados de liquidar-periodo — un pago futuro nunca debe poder
 * alterar una liquidación pasada. Novedades: pendiente (E4 del plan de
 * cuenta corriente).
 */
import type { TypedValue } from '@aquila/ael-runtime'
import type { ModoRedondeo } from '@aquila/financial-kernel'
import type { AtributosInmueble, CondicionAlcance } from './alcance.js'

export interface SnapshotInmueble {
  readonly id: string
  readonly codigo: string
  /** Coeficiente vigente de este inmueble en el set activo del tenant (16 §82: valor real, no se asume 1.0). */
  readonly coeficiente: string
  /** H2 (auditoría externa 2026-08-26): fracción de días del periodo en que el
   * inmueble estuvo activo — "1" si estuvo activo todo el periodo (comportamiento
   * anterior a esta fase, la inmensa mayoría de los casos). executor.ts la aplica
   * en ambos caminos: ejecutarDirecto multiplica el monto del inmueble por ella;
   * ejecutarDistribucion pondera el basis del reparto (coeficiente × fracción),
   * así que allocate() sigue reconciliando exacto Σ=fuente — la porción no
   * cobrada se redistribuye entre los demás inmuebles según su propio coeficiente,
   * no queda déficit. */
  readonly fraccionActiva: string
  /** Fase 5 (alcance.ts): atributos que un concepto alcance='calculado' puede
   * condicionar. Siempre presente — un campo individual ausente es null
   * dentro de AtributosInmueble, no el objeto completo. */
  readonly atributos: AtributosInmueble
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
  /** fijo: valorFijo es el monto, formulaAel es '' y no se parsea/analiza/evalúa.
   * formulado: formulaAel es la fórmula real, valorFijo es null (comportamiento anterior a esta fase). */
  readonly modoValor: 'fijo' | 'formulado'
  readonly formulaAel: string
  readonly valorFijo: string | null
  readonly prioridad: number
  /** recurrente: aplica desde fechaInicio en adelante. unico: solo en fechaInicio exacta.
   * por_periodo: entre fechaInicio y fechaFin (inclusive). novedad: nunca aplica por este filtro
   * — construirSnapshotDesdeSupabase() lo excluye siempre del snapshot (temporal.ts, Fase 4). */
  readonly tipoRecurrencia: 'recurrente' | 'unico' | 'por_periodo' | 'novedad'
  readonly fechaInicioAnio: number | null
  readonly fechaInicioMes: number | null
  readonly fechaFinAnio: number | null
  readonly fechaFinMes: number | null
  /** Solo aplica (no null) cuando tipoRecurrencia==='recurrente' — cada cuántos
   * periodos vuelve a aplicar desde fechaInicio (mensual: todos, comportamiento
   * pre-existente). null para los demás tipos. */
  readonly periodicidad: 'mensual' | 'bimensual' | 'trimestral' | 'semestral' | 'anual' | null
  /** todos: aplica a todos los inmuebles (comportamiento anterior a esta fase).
   * calculado: solo a los que cumplen alcanceCondiciones — ejecutarDirecto/
   * ejecutarDistribucion filtran snapshot.inmuebles antes de calcular/repartir. */
  readonly alcance: 'todos' | 'calculado'
  /** Solo aplica (no null) cuando alcance==='calculado'. null para 'todos'. */
  readonly alcanceCondiciones: CondicionAlcance | null
  /** ADC-01-ADD (§14) — solo con efecto cuando modoCalculo==='distribucion'.
   * 'coeficiente' preserva el comportamiento histórico; 'area_privada' cambia
   * el basis de allocate() en el Paso 2 (ver executor.ts). */
  readonly criterioDistribucion: 'coeficiente' | 'area_privada'
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
  /** UNIT.<clave> por inmueble — AREA_PRIVADA/AREA_COMUN/COEFICIENTE, ver snapshot-supabase.ts.
   * Un campo ausente para un inmueble puntual (p.ej. área sin diligenciar) es válido: una
   * fórmula que lo referencie para ESE inmueble falla con ContractoNoResueltoError en vez de
   * inventar un valor (17 §37 SNAPSHOT INCOMPLETE). */
  readonly unidades: Readonly<Record<string, Readonly<Record<string, TypedValue>>>>
}

/** Clave de ordenamiento cronológico ascendente — "2026-01" < "2026-02" < … < "2026-12". */
export function clavePeriodo(p: SnapshotPeriodo): string {
  return `${String(p.anio).padStart(4, '0')}-${String(p.mes).padStart(2, '0')}`
}
