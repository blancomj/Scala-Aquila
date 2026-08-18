/**
 * I/O Supabase de "Alertas y pendientes" (dashboard frontend, 2026-08-17)
 * — mismo nivel de autorización que cartera-dashboard-supabase.ts
 * (D-14, vigilado por eslint.config.js).
 *
 * fn_alertas_cartera (20260823160000, extendida en 20260823180000) ya
 * devuelve los conteos+montos finales — no hay ratio ni política de
 * denominador-cero que aplicar (mismo criterio que
 * cartera-panel-acciones-supabase.ts), así que no existe un paso de
 * cálculo puro separado. "Casos próximos a remisión jurídica" NO vive
 * aquí — se deriva en el frontend de dashboard.porEtapa[prejuridica], ya
 * cargado para "Cartera por etapa de cobranza"; no se vuelve a consultar
 * la base de datos. "Obligaciones sin fecha de vencimiento" (GAP-CAR-001,
 * 20260823180000) sí vive aquí — antes invisible, ni vencida ni corriente.
 */
import type { AquilaClient } from '@aquila/shared'
import { money, type Money } from '@aquila/financial-kernel'

export interface RawAlertasCartera {
  readonly obligacionesMayor90Cantidad: number
  readonly obligacionesMayor90Monto: Money
  readonly promesasPorVencerCantidad: number
  readonly promesasPorVencerMonto: Money
  readonly cuotasAcuerdoVencidasCantidad: number
  readonly cuotasAcuerdoVencidasMonto: Money
  /** GAP-CAR-001 [20260823180000]: cargos sin fecha de vencimiento determinable. */
  readonly obligacionesSinVencimientoCantidad: number
  readonly obligacionesSinVencimientoMonto: Money
}

export async function obtenerRawAlertasCartera(
  cliente: AquilaClient,
  opciones: { readonly tenantId: string; readonly fechaReferencia: string; readonly moneda: string },
): Promise<RawAlertasCartera> {
  const { data, error } = await cliente.rpc('fn_alertas_cartera', {
    p_tenant_id: opciones.tenantId,
    p_fecha_referencia: opciones.fechaReferencia,
  })
  if (error) throw new Error(`No se pudieron leer las alertas de cartera: ${error.message}`)

  const fila = data[0]
  if (!fila) throw new Error('fn_alertas_cartera no devolvió ninguna fila — se esperaba exactamente una.')

  return {
    obligacionesMayor90Cantidad: fila.obligaciones_mayor_90_cantidad,
    obligacionesMayor90Monto: money(fila.obligaciones_mayor_90_monto, opciones.moneda),
    promesasPorVencerCantidad: fila.promesas_por_vencer_cantidad,
    promesasPorVencerMonto: money(fila.promesas_por_vencer_monto, opciones.moneda),
    cuotasAcuerdoVencidasCantidad: fila.cuotas_acuerdo_vencidas_cantidad,
    cuotasAcuerdoVencidasMonto: money(fila.cuotas_acuerdo_vencidas_monto, opciones.moneda),
    obligacionesSinVencimientoCantidad: fila.obligaciones_sin_vencimiento_cantidad,
    obligacionesSinVencimientoMonto: money(fila.obligaciones_sin_vencimiento_monto, opciones.moneda),
  }
}
