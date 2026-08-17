/**
 * I/O Supabase de los indicadores de cartera (CAR §23.3) — mismo nivel de
 * autorización que cartera-dashboard-supabase.ts (D-14, vigilado por
 * eslint.config.js).
 *
 * Solo LEE posiciones_cartera_snapshot (F3, ya congelado) — nunca
 * recalcula un estado pasado. La política de tramos se toma de la que
 * produjo el snapshot de fecha_desde (politica_clasificacion_id ahí
 * guardado), no de la vigente HOY — REC-CAR-012: un cambio de política
 * posterior no reescribe cómo se interpreta un tramo histórico.
 */
import type { AquilaClient } from '@aquila/shared'
import { money } from '@aquila/financial-kernel'
import type { FilaSnapshotIndicador, RawIndicadoresGestion, TramoOrdenado } from './cartera-indicadores.js'

export interface SnapshotIndicador {
  readonly filas: readonly FilaSnapshotIndicador[]
  /** política_clasificacion_id de referencia — todas las filas de una fecha_corte comparten la misma política. null si no hay snapshot ese día. */
  readonly politicaId: string | null
}

export async function obtenerSnapshotIndicador(
  cliente: AquilaClient,
  opciones: { readonly tenantId: string; readonly fechaCorte: string; readonly moneda: string },
): Promise<SnapshotIndicador> {
  const { data, error } = await cliente
    .from('posiciones_cartera_snapshot')
    .select('inmueble_id, deuda_total, clasificacion_codigo, politica_clasificacion_id')
    .eq('tenant_id', opciones.tenantId)
    .eq('fecha_corte', opciones.fechaCorte)
  if (error) throw new Error(`No se pudo leer el snapshot de cartera del ${opciones.fechaCorte}: ${error.message}`)

  return {
    filas: data.map(
      (fila): FilaSnapshotIndicador => ({
        inmuebleId: fila.inmueble_id,
        deudaVencida: money(fila.deuda_total, opciones.moneda),
        clasificacionCodigo: fila.clasificacion_codigo,
      }),
    ),
    politicaId: data[0]?.politica_clasificacion_id ?? null,
  }
}

/**
 * Tramos de UNA política puntual, ordenados por dias_min — a diferencia
 * de obtenerPoliticaClasificacionVigente() (cartera-supabase.ts), que
 * exige estado='vigente' HOY. Para Roll Rate se necesita la política que
 * produjo el snapshot histórico, vigente o no a la fecha actual.
 */
export async function obtenerTramosDePolitica(
  cliente: AquilaClient,
  opciones: { readonly politicaId: string },
): Promise<TramoOrdenado[]> {
  const { data, error } = await cliente
    .from('politica_clasificacion_tramos')
    .select('codigo')
    .eq('politica_id', opciones.politicaId)
    .order('dias_min', { ascending: true })
  if (error) throw new Error(`No se pudieron leer los tramos de la política ${opciones.politicaId}: ${error.message}`)
  return data.map((t) => ({ codigo: t.codigo }))
}

/**
 * Conteos/sumas crudos de fn_indicadores_gestion (20260823110000) — un
 * período [fecha_desde, fecha_hasta]. La función siempre devuelve
 * exactamente una fila (agregados escalares, sin group by).
 */
export async function obtenerRawIndicadoresGestion(
  cliente: AquilaClient,
  opciones: { readonly tenantId: string; readonly fechaDesde: string; readonly fechaHasta: string; readonly moneda: string },
): Promise<RawIndicadoresGestion> {
  const { data, error } = await cliente.rpc('fn_indicadores_gestion', {
    p_tenant_id: opciones.tenantId,
    p_fecha_desde: opciones.fechaDesde,
    p_fecha_hasta: opciones.fechaHasta,
  })
  if (error) throw new Error(`No se pudieron leer los indicadores de gestión: ${error.message}`)

  const fila = data[0]
  if (!fila) throw new Error('fn_indicadores_gestion no devolvió ninguna fila — se esperaba exactamente una.')

  return {
    montoRecuperadoPeriodo: money(fila.monto_recuperado_periodo, opciones.moneda),
    accionesEjecutadas: fila.acciones_ejecutadas,
    accionesEfectivas: fila.acciones_efectivas,
    promesasVencidas: fila.promesas_vencidas,
    promesasCumplidas: fila.promesas_cumplidas,
    acuerdosTerminados: fila.acuerdos_terminados,
    acuerdosCumplidos: fila.acuerdos_cumplidos,
  }
}
