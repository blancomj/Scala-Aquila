// Mi Copropiedad — mismo documento formal que ver-estado-cuenta (D-27/D-28), pero para un actor
// externo autenticado por vínculo en vez de token HMAC o membership. ver-estado-cuenta no sirve
// aquí: solo acepta token firmado o sesión con `memberships` activa, y un actor externo NUNCA es
// tenant_member (AD-37) — no tiene forma de pasar por ninguna de esas dos puertas.
//
// Devuelve el mismo sobre {datos, folio, contenido_hash, pago_habilitado} que ver-estado-cuenta,
// más `existe: boolean`, para que el componente de presentación (ComprobanteCuentaDocumento.vue)
// sea idéntico en ambas páginas sin saber de dónde vino el documento.
//
// `estados_cuenta_generados` se emite en cada corte/liquidación (fn_emitir_estados_cuenta) para
// TODAS las unidades del tenant — un inmueble cuyo tenant nunca ha corrido una liquidación
// legítimamente no tiene ningún registro; `existe: false` (200, no error) es ese caso, no una falla.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import {
  extraerJwtDelHeader,
  resolverContextoActorExterno,
  respuestaErrorContextoActorExterno,
} from '../_shared/actor_externo_context.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { sha256HexPublico } from '../_shared/link_token.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

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
    `estado_cuenta_ver_vinculo:${contexto.vinculoId}`,
    RATE_LIMIT_MAX_HITS,
    RATE_LIMIT_VENTANA,
    correlationId,
  )
  if (bloqueo) return bloqueo

  const { data: registro, error: errorRegistro } = await admin
    .from('estados_cuenta_generados')
    .select('datos, folio, tenant_id')
    .eq('inmueble_id', contexto.inmuebleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (errorRegistro) {
    return errorResponse(500, 'INTERNAL_ERROR', errorRegistro.message, undefined, correlationId)
  }
  if (!registro) {
    return jsonResponse({ existe: false }, 200, correlationId)
  }

  const contenidoHash = await sha256HexPublico(JSON.stringify(registro.datos))

  const { data: pasarelaActiva } = await admin
    .from('pasarela_config')
    .select('id')
    .eq('tenant_id', registro.tenant_id)
    .eq('activa', true)
    .maybeSingle()

  return jsonResponse(
    {
      existe: true,
      datos: registro.datos,
      folio: registro.folio,
      contenido_hash: contenidoHash,
      pago_habilitado: !!pasarelaActiva,
    },
    200,
    correlationId,
  )
})
