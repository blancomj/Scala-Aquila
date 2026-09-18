// EXT-10 §6.1/§7.6 (Ola 2, M16) — "Mis documentos": documentos visibles para un actor externo
// (propietario/residente, EXT-01) sobre su propio inmueble o de copropiedad (sin inmueble_id).
//
// `documentos` no tiene NINGUNA política RLS utilizable por un actor externo (única policy,
// documentos_select_agent_auditor, exige is_member(tenant_id) — AD-37: un actor externo NUNCA es
// tenant_member). Mismo camino que external-cuenta-resumen (EXT-06/07): admin (service_role)
// resuelve el contexto (_shared/actor_externo_context.ts) y filtra explícitamente por
// tenant_id/inmueble_id ya verificados — nunca por lo que mande el cliente.
//
// Se lee v_documento_vigente (security_invoker=true, un service_role la atraviesa igual sin
// RLS), no `documentos` crudo — trae solo la versión más reciente de cada grupo_id, nunca
// versiones viejas ya reemplazadas (mismo criterio que la UI de staff, UiLibreriaDocumentos.vue).
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

interface FilaDocumentoVigente {
  id: string
  nombre_archivo: string
  tipo_documento_id: number
  fecha_vencimiento: string | null
  tamano_bytes: number | string | null
  descripcion: string | null
  created_at: string
  inmueble_id: string | null
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
    `documentos_listar_vinculo:${contexto.vinculoId}`,
    RATE_LIMIT_MAX_HITS,
    RATE_LIMIT_VENTANA,
    correlationId,
  )
  if (bloqueo) return bloqueo

  const { data: filas, error: errorDocumentos } = await admin
    .from('v_documento_vigente')
    .select('id, nombre_archivo, tipo_documento_id, fecha_vencimiento, tamano_bytes, descripcion, created_at, inmueble_id')
    .eq('tenant_id', contexto.tenantId)
    .or(`inmueble_id.eq.${contexto.inmuebleId},inmueble_id.is.null`)
    .order('created_at', { ascending: false })
  if (errorDocumentos) {
    return errorResponse(500, 'INTERNAL_ERROR', errorDocumentos.message, undefined, correlationId)
  }

  const documentos = (filas ?? []) as FilaDocumentoVigente[]
  const tipoIds = [...new Set(documentos.map((d) => d.tipo_documento_id))]
  const { data: tipos, error: errorTipos } = tipoIds.length > 0
    ? await admin.from('lista_tipos').select('id, nombre').in('id', tipoIds)
    : { data: [] as FilaTipo[], error: null }
  if (errorTipos) {
    return errorResponse(500, 'INTERNAL_ERROR', errorTipos.message, undefined, correlationId)
  }
  const nombreTipo = new Map(((tipos ?? []) as FilaTipo[]).map((t) => [t.id, t.nombre]))

  return jsonResponse(
    {
      documentos: documentos.map((d) => ({
        id: d.id,
        nombre_archivo: d.nombre_archivo,
        tipo_documento: nombreTipo.get(d.tipo_documento_id) ?? 'Documento',
        fecha_vencimiento: d.fecha_vencimiento,
        tamano_bytes: d.tamano_bytes === null ? null : Number(d.tamano_bytes),
        descripcion: d.descripcion,
        created_at: d.created_at,
        alcance: d.inmueble_id === null ? 'copropiedad' : 'inmueble',
      })),
    },
    200,
    correlationId,
  )
})
