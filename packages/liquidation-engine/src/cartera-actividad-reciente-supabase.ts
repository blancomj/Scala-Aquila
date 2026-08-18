/**
 * I/O Supabase de "Actividad reciente en cartera" (dashboard frontend,
 * 2026-08-17) — mismo nivel de autorización que cartera-alertas-
 * supabase.ts (D-14, vigilado por eslint.config.js).
 *
 * fn_actividad_reciente_cartera (20260823170000) ya devuelve las filas
 * ordenadas y limitadas — no hay cálculo puro que aplicar, solo mapear
 * tipos (mismo criterio que cartera-alertas-supabase.ts). `tipo` llega
 * como `string` desde el generador de tipos de Supabase (la función SQL
 * lo produce con `::text` sobre un literal) — se angosta aquí a la unión
 * real de valores que la función puede emitir.
 */
import type { AquilaClient } from '@aquila/shared'
import { money, type Money } from '@aquila/financial-kernel'

export type TipoEventoActividadCartera = 'pago' | 'promesa' | 'acuerdo' | 'caso_juridico'

export interface EventoActividadCartera {
  readonly tipo: TipoEventoActividadCartera
  readonly fecha: string
  readonly inmuebleId: string
  readonly codigo: string
  readonly monto: Money
}

export async function obtenerActividadRecienteCartera(
  cliente: AquilaClient,
  opciones: { readonly tenantId: string; readonly moneda: string; readonly limite?: number },
): Promise<readonly EventoActividadCartera[]> {
  const { data, error } = await cliente.rpc('fn_actividad_reciente_cartera', {
    p_tenant_id: opciones.tenantId,
    ...(opciones.limite === undefined ? {} : { p_limite: opciones.limite }),
  })
  if (error) throw new Error(`No se pudo leer la actividad reciente de cartera: ${error.message}`)

  return data.map((fila) => ({
    tipo: fila.tipo as TipoEventoActividadCartera,
    fecha: fila.fecha,
    inmuebleId: fila.inmueble_id,
    codigo: fila.codigo,
    monto: money(fila.monto, opciones.moneda),
  }))
}
