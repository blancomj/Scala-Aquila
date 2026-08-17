// Datos del estado de cuenta para un residente sin sesión — PLAN_DATOS_REALES.md
// §3.3. El propietario/residente no tiene auth.users (AD-26), así que no
// puede leer estados_cuenta_generados por RLS normal (exige is_member()).
// Esta función es la única forma de leerlo sin sesión — la barrera es que
// `id` es un uuid v4 (128 bits, no adivinable), mismo modelo de seguridad
// que un link de restablecer contraseña.
//
// Devuelve JSON (los datos del ledger, no HTML) — el HTML se renderiza en
// apps/web/app/pages/estado-cuenta/[id].vue, servido por nuestro propio
// Nuxt. No puede servirse desde aquí ni desde Storage: confirmado
// empíricamente que el gateway de Supabase Edge Functions fuerza
// `Content-Type: text/plain` + `Content-Security-Policy: sandbox` en
// cualquier respuesta, sin importar los headers que ponga la función —
// control anti-XSS de toda la plataforma, no algo que se pueda desactivar
// desde el código (ver 20260822120000_estados_cuenta_datos_jsonb.sql).
//
// Sin rate-limit por IP: enforceRateLimit está pensado para un actor
// autenticado (JWT), no aplica a un visitante anónimo — riesgo aceptado
// por ahora, anotado como gap conocido, no una omisión silenciosa.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'

const VIGENCIA_DIAS = 90
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
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
  const id = (body as { id?: unknown } | null)?.id
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'id debe ser un uuid válido.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const { data: registro, error: errorRegistro } = await admin
    .from('estados_cuenta_generados')
    .select('datos, created_at')
    .eq('id', id)
    .maybeSingle()
  if (errorRegistro) {
    return errorResponse(500, 'INTERNAL_ERROR', errorRegistro.message, undefined, correlationId)
  }
  if (!registro) {
    return errorResponse(
      404,
      'ESTADO_CUENTA_NO_ENCONTRADO',
      'Este estado de cuenta no existe.',
      undefined,
      correlationId,
    )
  }

  const vigenteHasta = new Date(registro.created_at)
  vigenteHasta.setDate(vigenteHasta.getDate() + VIGENCIA_DIAS)
  if (vigenteHasta.getTime() < Date.now()) {
    return errorResponse(
      410,
      'ESTADO_CUENTA_VENCIDO',
      'Este enlace venció. Pide uno nuevo a la administración.',
      undefined,
      correlationId,
    )
  }

  return jsonResponse(registro.datos, 200, correlationId)
})
