/**
 * I/O Supabase de la variación de cartera (ENFOQUE_CONSOLIDACION, paso 0)
 * — mismo nivel de autorización que cartera-dashboard-supabase.ts (D-14,
 * vigilado por eslint.config.js).
 *
 * Solo LEE. Dos RPC, ninguna agregación aquí: fn_variacion_cartera ya
 * devuelve una fila por inmueble comparada entre los dos cortes, y
 * fn_variacion_cartera_eventos el desglose por tipo (20260934050000).
 * Este módulo solo mapea numeric → Money.
 */
import type { AquilaClient } from '@aquila/shared'
import { money } from '@aquila/financial-kernel'
import type { EtapaCobranza } from './cartera.js'
import type { FilaVariacionCartera } from './cartera-variacion.js'

export interface GrupoEventosVariacion {
  readonly tipo: string
  readonly cantidadEventos: number
  readonly cantidadInmuebles: number
}

export async function obtenerFilasVariacionCartera(
  cliente: AquilaClient,
  opciones: {
    readonly tenantId: string
    readonly fechaCorteAnterior: string
    readonly fechaCorteActual: string
    readonly moneda: string
  },
): Promise<FilaVariacionCartera[]> {
  const { data, error } = await cliente.rpc('fn_variacion_cartera', {
    p_tenant_id: opciones.tenantId,
    p_fecha_corte_anterior: opciones.fechaCorteAnterior,
    p_fecha_corte_actual: opciones.fechaCorteActual,
  })
  if (error) throw new Error(`No se pudo leer la variación de cartera: ${error.message}`)

  return data.map(
    (fila): FilaVariacionCartera => ({
      inmuebleId: fila.inmueble_id,
      codigo: fila.codigo,
      vencidaAnterior: money(fila.vencida_anterior, opciones.moneda),
      vencidaActual: money(fila.vencida_actual, opciones.moneda),
      totalAnterior: money(fila.total_anterior, opciones.moneda),
      totalActual: money(fila.total_actual, opciones.moneda),
      corrienteAnterior: money(fila.corriente_anterior, opciones.moneda),
      corrienteActual: money(fila.corriente_actual, opciones.moneda),
      sinVencimientoAnterior: money(fila.sin_vencimiento_anterior, opciones.moneda),
      sinVencimientoActual: money(fila.sin_vencimiento_actual, opciones.moneda),
      interesAnterior: money(fila.interes_anterior, opciones.moneda),
      interesActual: money(fila.interes_actual, opciones.moneda),
      diasMoraMaximo: fila.dias_mora_maximo,
      // etapa_cobranza_t casteado a text por la función (RETURNS TABLE) —
      // el valor siempre es uno de los 5 válidos, coalesced a 'preventiva'.
      etapaCobranza: fila.etapa_cobranza as EtapaCobranza,
      eventosEnPeriodo: fila.eventos_en_periodo,
    }),
  )
}

export async function obtenerEventosVariacionPorTipo(
  cliente: AquilaClient,
  opciones: {
    readonly tenantId: string
    readonly fechaCorteAnterior: string
    readonly fechaCorteActual: string
  },
): Promise<GrupoEventosVariacion[]> {
  const { data, error } = await cliente.rpc('fn_variacion_cartera_eventos', {
    p_tenant_id: opciones.tenantId,
    p_fecha_corte_anterior: opciones.fechaCorteAnterior,
    p_fecha_corte_actual: opciones.fechaCorteActual,
  })
  if (error) throw new Error(`No se pudieron leer los eventos del período: ${error.message}`)

  return data.map(
    (fila): GrupoEventosVariacion => ({
      tipo: fila.tipo,
      cantidadEventos: fila.cantidad_eventos,
      cantidadInmuebles: fila.cantidad_inmuebles,
    }),
  )
}
