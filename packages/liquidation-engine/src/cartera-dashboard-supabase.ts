/**
 * I/O Supabase del dashboard de cartera (CAR §23.1/§23.2) — mismo nivel de
 * autorización que cartera-supabase.ts (D-14, vigilado por eslint.config.js).
 *
 * Solo LEE — llama a fn_dashboard_cartera (20260823100000) y arma las
 * filas que calcularDashboardCartera() necesita. No hay escritura en este
 * módulo (a diferencia de cartera-supabase.ts, que también registra el
 * snapshot): el dashboard no persiste nada propio, siempre recalcula.
 */
import type { AquilaClient } from '@aquila/shared'
import { money } from '@aquila/financial-kernel'
import type { EtapaCobranza } from './cartera.js'
import type { FilaDashboardCartera } from './cartera-dashboard.js'

export async function obtenerFilasDashboardCartera(
  cliente: AquilaClient,
  opciones: { readonly tenantId: string; readonly fechaCorte: string; readonly moneda: string },
): Promise<FilaDashboardCartera[]> {
  const { data, error } = await cliente.rpc('fn_dashboard_cartera', {
    p_tenant_id: opciones.tenantId,
    p_fecha_corte: opciones.fechaCorte,
  })
  if (error) throw new Error(`No se pudo leer el dashboard de cartera: ${error.message}`)

  return data.map(
    (fila): FilaDashboardCartera => ({
      inmuebleId: fila.inmueble_id,
      deudaTotal: money(fila.deuda_total, opciones.moneda),
      deudaVencida: money(fila.deuda_vencida, opciones.moneda),
      interesCausado: money(fila.interes_causado, opciones.moneda),
      saldoCredito: money(fila.saldo_credito, opciones.moneda),
      diasMoraMaximo: fila.dias_mora_maximo,
      // etapa_cobranza_t (Postgres) casteado a text por la función (RETURNS TABLE) —
      // el valor siempre es uno de los 5 válidos, coalesced a 'preventiva' si el
      // inmueble no tiene fila en cartera_etapas todavía (mismo default que F6/F8).
      etapaCobranza: fila.etapa_cobranza as EtapaCobranza,
    }),
  )
}
