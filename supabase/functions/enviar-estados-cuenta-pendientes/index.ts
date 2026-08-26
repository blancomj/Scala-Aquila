// Batch de notificación de estados de cuenta emitidos por liquidación (L5) —
// D-28. Corre programado (cron) FUERA de la transacción de
// fn_aplicar_liquidacion: el cierre contable nunca depende de que Brevo
// responda. Se autentica con secreto compartido (CRON_SECRET) en vez de JWT:
// no hay usuario humano detrás.
//
// Candidatos: filas nacidas de una liquidación (liquidacion_id NOT NULL),
// recientes (≤7 días — un batch caído más de una semana se revisa a mano, no
// se re-dispara en silencio) y sin rastro 'estado_cuenta.enviado' en
// audit_log. Límite por corrida: 50 — predecible y acotado ante un backlog.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import {
  comoAdmin,
  enviarEstadoCuentaPorId,
  fueNotificadoRecientemente,
} from '../_shared/envio_estado_cuenta.ts'

const LIMITE_POR_CORRIDA = 50

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID()

  const secreto = Deno.env.get('CRON_SECRET')
  if (!secreto || req.headers.get('x-cron-secret') !== secreto) {
    return errorResponse(403, 'FORBIDDEN', 'No autorizado.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = comoAdmin(createClient<Database>(supabaseUrl, serviceKey))

  const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  // Consulta de candidatos con el cliente tipado directo (cadena
  // .not/.gte/.order fuera del contrato mínimo de AdminMinimo).
  const clienteTipado = createClient<Database>(supabaseUrl, serviceKey)
  const { data: candidatos, error } = await clienteTipado
    .from('estados_cuenta_generados')
    .select('id, tenant_id, inmueble_id, datos, created_at')
    .not('liquidacion_id', 'is', null)
    .gte('created_at', desde)
    .order('created_at', { ascending: true })
    .limit(LIMITE_POR_CORRIDA)

  type Fila = {
    id: string
    tenant_id: string
    inmueble_id: string
    datos: {
      tenant_nombre: string
      tenant_nit: string | null
      inmueble_codigo: string
      saldo_final: number
      generado_en: string
    }
    created_at: string
  }

  if (error) {
    return errorResponse(500, 'INTERNAL_ERROR', error.message, undefined, correlationId)
  }

  let procesados = 0
  const resultados: { id: string; estado: 'enviado' | 'omitido'; detalle?: string }[] = []

  for (const fila of (candidatos as unknown as Fila[]) ?? []) {
    if (procesados >= LIMITE_POR_CORRIDA) break
    try {
      if (await fueNotificadoRecientemente(admin, fila.id)) continue
    } catch {
      continue
    }
    try {
      const resultado = await enviarEstadoCuentaPorId(admin, fila.id, {
        viaBatch: true,
        actorId: null,
      })
      procesados += 1
      resultados.push({
        id: fila.id,
        estado: 'enviado',
        detalle: `${resultado.enviados.length} correo(s), ${resultado.omitidosSinEmail} sin email`,
      })
    } catch (excepcion) {
      // Un documento con fallo (p.ej. Brevo caído) no aborta la corrida:
      // quedará como pendiente en la siguiente ejecución.
      resultados.push({
        id: fila.id,
        estado: 'omitido',
        detalle: excepcion instanceof Error ? excepcion.message : 'desconocido',
      })
    }
  }

  return jsonResponse({ corrida: correlationId, procesados, resultados }, 200, correlationId)
})
