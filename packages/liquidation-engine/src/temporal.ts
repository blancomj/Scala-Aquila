/**
 * Conceptos avanzados Fase 2 — filtro temporal: ¿este concepto aplica en
 * el periodo (anio, mes) que se está liquidando? Módulo puro, sin
 * Supabase (D-14) — construirSnapshotDesdeSupabase() es el único llamador
 * hoy, pero la función no depende de cómo se obtuvieron los datos.
 */
import { ConceptoRecurrenciaSinFechaError } from './errors.js'
import type { SnapshotConcepto } from './snapshot.js'

function claveAnioMes(anio: number, mes: number): number {
  return anio * 12 + mes
}

/** mensual: cada periodo (comportamiento pre-existente, intervalo=1). */
const INTERVALO_MESES: Record<NonNullable<SnapshotConcepto['periodicidad']>, number> = {
  mensual: 1,
  bimensual: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
}

/**
 * recurrente: aplica desde fechaInicio en adelante (inclusive), cada
 * `periodicidad` (mensual: todos; bimensual/trimestral/semestral/anual:
 * cada 2/3/6/12 periodos exactos desde fechaInicio — un periodo a mitad de
 * camino no aplica).
 * unico: aplica solo en el periodo fechaInicio exacto.
 * por_periodo: aplica entre fechaInicio y fechaFin, ambos inclusive.
 * novedad: nunca aplica por este filtro — se factura por inmueble puntual
 * vía la tabla novedades (Fase 4), nunca por el barrido de liquidar-periodo.
 */
export function conceptoAplicaEnPeriodo(
  concepto: SnapshotConcepto,
  anio: number,
  mes: number,
): boolean {
  const claveActual = claveAnioMes(anio, mes)

  switch (concepto.tipoRecurrencia) {
    case 'novedad':
      return false

    case 'recurrente':
    case 'unico': {
      if (concepto.fechaInicioAnio === null || concepto.fechaInicioMes === null) {
        throw new ConceptoRecurrenciaSinFechaError(concepto.codigo, concepto.tipoRecurrencia)
      }
      const claveInicio = claveAnioMes(concepto.fechaInicioAnio, concepto.fechaInicioMes)
      if (concepto.tipoRecurrencia === 'unico') {
        return claveActual === claveInicio
      }
      if (concepto.periodicidad === null) {
        throw new ConceptoRecurrenciaSinFechaError(concepto.codigo, concepto.tipoRecurrencia)
      }
      const intervalo = INTERVALO_MESES[concepto.periodicidad]
      return claveActual >= claveInicio && (claveActual - claveInicio) % intervalo === 0
    }

    case 'por_periodo': {
      if (
        concepto.fechaInicioAnio === null ||
        concepto.fechaInicioMes === null ||
        concepto.fechaFinAnio === null ||
        concepto.fechaFinMes === null
      ) {
        throw new ConceptoRecurrenciaSinFechaError(concepto.codigo, concepto.tipoRecurrencia)
      }
      const claveInicio = claveAnioMes(concepto.fechaInicioAnio, concepto.fechaInicioMes)
      const claveFin = claveAnioMes(concepto.fechaFinAnio, concepto.fechaFinMes)
      return claveActual >= claveInicio && claveActual <= claveFin
    }
  }
}
