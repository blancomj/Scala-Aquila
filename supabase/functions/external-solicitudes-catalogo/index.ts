// EXT-02 §3.1 · Catálogo de TIPO_SOLICITUD/CATEGORIA_SOLICITUD vigentes del tenant del vínculo —
// la app nunca copia estos valores localmente (spec: "la app los muestra como selección, no como
// campo abierto"). lista_tipos exige is_member(tenant_id) para leer filas de tenant (un actor
// externo NUNCA es tenant_member, AD-37) — se resuelve el tenant vía fn_actor_externo_mis_vinculos
// (con la sesión real del caller) y se lee el catálogo con el cliente admin, nunca abriendo una
// política RLS nueva sobre lista_tipos para actores externos.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

interface VinculoFila {
  vinculo_id: string
  tenant_id: string
}

interface CatalogoFila {
  id: string
  tipo: string
  codigo: string
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
  if (typeof vinculoId !== 'string') {
    return errorResponse(400, 'INVALID_PAYLOAD', 'vinculo_id es requerido.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }

  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!jwt) {
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere sesión activa.', undefined, correlationId)
  }
  const cliente = createClient<Database>(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const {
    data: { user },
  } = await cliente.auth.getUser(jwt)
  if (!user) {
    return errorResponse(401, 'UNAUTHENTICATED', 'Sesión inválida.', undefined, correlationId)
  }

  const { data: vinculos, error: errorVinculos } = await cliente.rpc('fn_actor_externo_mis_vinculos', {
    p_auth_user_id: user.id,
  })
  if (errorVinculos) {
    return errorResponse(500, 'INTERNAL_ERROR', errorVinculos.message, undefined, correlationId)
  }
  const vinculo = (vinculos as VinculoFila[] | null)?.find((v) => v.vinculo_id === vinculoId)
  if (!vinculo) {
    return errorResponse(
      403, 'VINCULO_NO_PERTENECE',
      'Este vínculo no existe, no es tuyo, o ya no está vigente.', undefined, correlationId,
    )
  }

  const bloqueo = await enforceRateLimit(
    cliente, `solicitudes_catalogo_vinculo:${vinculo.vinculo_id}`, RATE_LIMIT_MAX_HITS, RATE_LIMIT_VENTANA, correlationId,
  )
  if (bloqueo) return bloqueo

  const admin = createClient<Database>(supabaseUrl, serviceKey)
  const { data: filas, error: errorCatalogo } = await admin
    .from('lista_tipos')
    .select('id, tipo, codigo, nombre')
    .eq('tenant_id', vinculo.tenant_id)
    .in('tipo', ['TIPO_SOLICITUD', 'CATEGORIA_SOLICITUD'])
    .eq('activo', true)
    .order('orden')
  if (errorCatalogo) {
    return errorResponse(500, 'INTERNAL_ERROR', errorCatalogo.message, undefined, correlationId)
  }

  const filasCatalogo = filas as CatalogoFila[] | null
  return jsonResponse(
    {
      tipos: (filasCatalogo ?? []).filter((f) => f.tipo === 'TIPO_SOLICITUD'),
      categorias: (filasCatalogo ?? []).filter((f) => f.tipo === 'CATEGORIA_SOLICITUD'),
    },
    200, correlationId,
  )
})
