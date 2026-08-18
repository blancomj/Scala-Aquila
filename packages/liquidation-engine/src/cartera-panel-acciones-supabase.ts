/**
 * I/O Supabase del panel de acciones (CAR §23.5) — mismo nivel de
 * autorización que cartera-dashboard-supabase.ts/cartera-indicadores-
 * supabase.ts (D-14, vigilado por eslint.config.js).
 *
 * fn_panel_acciones_cartera (20260823140000) ya devuelve los 8 conteos
 * finales — no hay ratio ni política de denominador-cero que aplicar
 * encima (a diferencia de cartera-indicadores.ts), así que no existe un
 * paso de cálculo puro separado: este adaptador mapea la fila cruda
 * directamente al tipo tipado (REC-CAR-004, no se inventa una capa sin
 * lógica que envolver).
 */
import type { AquilaClient } from '@aquila/shared'

export interface PanelAccionesCartera {
  readonly accionesPendientesAprobacion: number
  readonly accionesProgramadasHoy: number
  readonly accionesFallidas: number
  readonly llamadasPendientes: number
  readonly promesasVencenHoy: number
  readonly cuotasAcuerdoVencenSemana: number
  readonly casosJuridicosSinActuacion30d: number
  readonly certificacionesPorVencer: number
}

/**
 * `fechaReferencia` — el "hoy" del panel, explícito (el llamador lo
 * decide, la función nunca depende del reloj del servidor; mismo
 * criterio que fecha_desde/fecha_hasta en fn_indicadores_gestion/
 * fn_indicadores_legales).
 */
export async function obtenerPanelAccionesCartera(
  cliente: AquilaClient,
  opciones: { readonly tenantId: string; readonly fechaReferencia: string },
): Promise<PanelAccionesCartera> {
  const { data, error } = await cliente.rpc('fn_panel_acciones_cartera', {
    p_tenant_id: opciones.tenantId,
    p_fecha_referencia: opciones.fechaReferencia,
  })
  if (error) throw new Error(`No se pudo leer el panel de acciones: ${error.message}`)

  const fila = data[0]
  if (!fila) throw new Error('fn_panel_acciones_cartera no devolvió ninguna fila — se esperaba exactamente una.')

  return {
    accionesPendientesAprobacion: fila.acciones_pendientes_aprobacion,
    accionesProgramadasHoy: fila.acciones_programadas_hoy,
    accionesFallidas: fila.acciones_fallidas,
    llamadasPendientes: fila.llamadas_pendientes,
    promesasVencenHoy: fila.promesas_vencen_hoy,
    cuotasAcuerdoVencenSemana: fila.cuotas_acuerdo_vencen_semana,
    casosJuridicosSinActuacion30d: fila.casos_juridicos_sin_actuacion_30d,
    certificacionesPorVencer: fila.certificaciones_por_vencer,
  }
}
