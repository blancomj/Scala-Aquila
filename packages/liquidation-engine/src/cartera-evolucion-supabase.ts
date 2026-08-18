/**
 * I/O Supabase de la evolución mensual de cartera vencida (dashboard
 * frontend, no forma parte de §23.1/§23.2/§23.3 original) — mismo nivel
 * de autorización que cartera-dashboard-supabase.ts/cartera-indicadores-
 * supabase.ts (D-14, vigilado por eslint.config.js).
 *
 * Solo mapea la fila cruda de fn_evolucion_cartera_vencida — no hay
 * ratio ni política de denominador-cero que aplicar (mismo criterio que
 * cartera-panel-acciones-supabase.ts), así que no existe un paso de
 * cálculo puro separado.
 */
import type { AquilaClient } from '@aquila/shared'
import { money, type Money } from '@aquila/financial-kernel'

export interface PuntoEvolucionCarteraVencida {
  /** Primer día del mes calendario que representa este punto (YYYY-MM-DD). */
  readonly mes: string
  /** fecha_corte real del snapshot usado — null si ese mes no tiene ningún snapshot. */
  readonly fechaSnapshot: string | null
  /** null cuando fechaSnapshot es null (sin dato, nunca 0 inventado). */
  readonly deudaVencida: Money | null
}

/** Fila cruda real de fn_evolucion_cartera_vencida — el generador de tipos de Supabase
 * no detecta que fecha_snapshot/deuda_vencida pueden ser null (vienen de subconsultas
 * condicionales dentro de un `returns table`, no de columnas de tabla; ver cabecera de
 * la migración 20260823150000). database.generated.ts las marca no-nulas, incorrecto. */
interface FilaEvolucionCruda {
  readonly mes: string
  readonly fecha_snapshot: string | null
  readonly deuda_vencida: number | null
}

export async function obtenerEvolucionCarteraVencida(
  cliente: AquilaClient,
  opciones: { readonly tenantId: string; readonly fechaHasta: string; readonly meses: number; readonly moneda: string },
): Promise<readonly PuntoEvolucionCarteraVencida[]> {
  const { data, error } = await cliente.rpc('fn_evolucion_cartera_vencida', {
    p_tenant_id: opciones.tenantId,
    p_fecha_hasta: opciones.fechaHasta,
    p_meses: opciones.meses,
  })
  if (error) throw new Error(`No se pudo leer la evolución de cartera vencida: ${error.message}`)

  const filas = data as unknown as readonly FilaEvolucionCruda[]
  return filas.map(
    (fila): PuntoEvolucionCarteraVencida => ({
      mes: fila.mes,
      fechaSnapshot: fila.fecha_snapshot,
      deudaVencida: fila.deuda_vencida === null ? null : money(fila.deuda_vencida, opciones.moneda),
    }),
  )
}
