// EXT-12 §7.7 (Ola 2, M17) — "Mi correspondencia": lo que llegó para el propio inmueble del
// actor externo. Solo lectura (§6.1, §8.4) — marcar `entregada` es siempre staff en portería,
// vía correspondencia-registrar; esta función nunca escribe.
//
// `correspondencia` no tiene NINGUNA política RLS utilizable por un actor externo (AD-37) — mismo
// camino que external-cuenta-resumen/external-documentos-listar: admin (service_role) resuelve el
// contexto (_shared/actor_externo_context.ts) y filtra por tenant_id/inmueble_id ya verificados.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import {
  extraerJwtDelHeader,
  resolverContextoActorExterno,
  respuestaErrorContextoActorExterno,
} from '../_shared/actor_externo_context.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

interface FilaCorrespondencia {
  id: string
  tipo_id: number | null
  destino: string
  remitente: string
  descripcion: string | null
  created_at: string
  entregada: boolean
  entregada_a: string | null
  entregada_at: string | null
}

interface FilaTipo {
  id: number
  nombre: string
}

Deno.serve(async (req) => {
  const preflight = respuestaPreflight(req)
  if (preflight) return preflight

  const correlationId = crypto.randomUUID()
  if (req.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Solo POST.', undefined, correlationId)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser JSON.', undefined, correlationId)
  }
  const vinculoId = (body as { vinculo_id?: unknown } | null)?.vinculo_id
  if (typeof vinculoId !== 'string' || vinculoId.length === 0) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'vinculo_id es requerido.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const jwt = extraerJwtDelHeader(req)
  const contexto = await resolverContextoActorExterno(admin, jwt, vinculoId)
  if ('tipo' in contexto) {
    return respuestaErrorContextoActorExterno(contexto, correlationId)
  }

  const bloqueo = await enforceRateLimit(
    admin,
    `correspondencia_listar_vinculo:${contexto.vinculoId}`,
    RATE_LIMIT_MAX_HITS,
    RATE_LIMIT_VENTANA,
    correlationId,
  )
  if (bloqueo) return bloqueo

  const { data: filas, error: errorCorrespondencia } = await admin
    .from('correspondencia')
    .select('id, tipo_id, destino, remitente, descripcion, created_at, entregada, entregada_a, entregada_at')
    .eq('tenant_id', contexto.tenantId)
    .eq('inmueble_id', contexto.inmuebleId)
    .order('created_at', { ascending: false })
  if (errorCorrespondencia) {
    return errorResponse(500, 'INTERNAL_ERROR', errorCorrespondencia.message, undefined, correlationId)
  }

  const filasCorrespondencia = (filas ?? []) as FilaCorrespondencia[]
  const tipoIds = [...new Set(filasCorrespondencia.map((f) => f.tipo_id).filter((id): id is number => id !== null))]
  const { data: tipos, error: errorTipos } = tipoIds.length > 0
    ? await admin.from('lista_tipos').select('id, nombre').in('id', tipoIds)
    : { data: [] as FilaTipo[], error: null }
  if (errorTipos) {
    return errorResponse(500, 'INTERNAL_ERROR', errorTipos.message, undefined, correlationId)
  }
  const nombreTipo = new Map(((tipos ?? []) as FilaTipo[]).map((t) => [t.id, t.nombre]))

  return jsonResponse(
    {
      correspondencia: filasCorrespondencia.map((f) => ({
        id: f.id,
        tipo: f.tipo_id !== null ? (nombreTipo.get(f.tipo_id) ?? 'Correspondencia') : null,
        destino: f.destino,
        remitente: f.remitente,
        descripcion: f.descripcion,
        created_at: f.created_at,
        entregada: f.entregada,
        entregada_a: f.entregada_a,
        entregada_at: f.entregada_at,
      })),
    },
    200,
    correlationId,
  )
})
