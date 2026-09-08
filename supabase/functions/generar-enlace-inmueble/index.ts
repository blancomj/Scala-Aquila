// GOB-8 §4.4 — generaliza el enlace de consulta de GOB-0 a un "paquete por
// inmueble" (estado de cuenta, paz y salvo, actas publicadas, estado de
// solicitudes). Mismo mecanismo HMAC (link_token.ts, D-27, CERO cambios),
// pero a diferencia de generar-enlace-documento/ver-documento este token SÍ
// necesita poder revocarse con motivo (spec §4.4) — un HMAC puro no puede
// expresar eso, así que se firma sobre el `id` de una fila de
// atencion_tokens_consulta (metadata de control, nunca el secreto).
//
// Lado "miembro con sesión pide el enlace" — ver-inmueble (sin sesión) es
// quien lo consume. Solo auxiliar+ del tenant dueño del inmueble puede
// generarlo (mismo criterio que generar-enlace-documento).
import { withSupabase } from '@supabase/server'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { firmarTokenEnlace } from '../_shared/link_token.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 30
const RATE_LIMIT_VENTANA = '1 hour'
const VIGENCIA_DIAS_DEFAULT = 30
const VIGENCIA_DIAS_MAXIMA = 90
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default {
  fetch: withSupabase<Database>({ auth: 'user' }, async (req, ctx) => {
    const correlationId = crypto.randomUUID()
    const actorId = ctx.userClaims?.id ?? null
    if (!actorId) {
      return errorResponse(401, 'UNAUTHENTICATED', 'Sesión inválida.', undefined, correlationId)
    }
    if (req.method !== 'POST') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Solo POST.', undefined, correlationId)
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser JSON.', undefined, correlationId)
    }
    const cuerpo = body as { inmueble_id?: unknown; vigencia_dias?: unknown } | null
    const inmuebleId = cuerpo?.inmueble_id
    if (typeof inmuebleId !== 'string' || !UUID_RE.test(inmuebleId)) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'inmueble_id debe ser un uuid válido.', undefined, correlationId)
    }
    let vigenciaDias = VIGENCIA_DIAS_DEFAULT
    if (cuerpo?.vigencia_dias !== undefined) {
      const valor = cuerpo.vigencia_dias
      if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0 || valor > VIGENCIA_DIAS_MAXIMA) {
        return errorResponse(
          400,
          'INVALID_PAYLOAD',
          `vigencia_dias debe ser un entero entre 0 y ${VIGENCIA_DIAS_MAXIMA}.`,
          undefined,
          correlationId,
        )
      }
      vigenciaDias = valor
    }

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `generar_enlace_inmueble:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // RLS-scoped: un inmueble ajeno simplemente no aparece.
    const { data: inmueble, error: errorInmueble } = await ctx.supabase
      .from('inmuebles')
      .select('id, tenant_id')
      .eq('id', inmuebleId)
      .maybeSingle()
    if (errorInmueble) {
      return errorResponse(500, 'INTERNAL_ERROR', errorInmueble.message, undefined, correlationId)
    }
    if (!inmueble) {
      return errorResponse(404, 'INMUEBLE_NO_ENCONTRADO', 'El inmueble no existe o no es accesible.', undefined, correlationId)
    }

    const { data: esAuxiliar, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: inmueble.tenant_id,
      p_roles: ['auxiliar'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!esAuxiliar) {
      return errorResponse(403, 'FORBIDDEN', 'Solo un auxiliar puede generar enlaces de consulta.', undefined, correlationId)
    }

    const expiraEn = new Date(Date.now() + vigenciaDias * 24 * 3600 * 1000).toISOString()

    const { data: tokenRow, error: errorInsert } = await ctx.supabase
      .from('atencion_tokens_consulta')
      .insert({
        tenant_id: inmueble.tenant_id, inmueble_id: inmueble.id, expira_at: expiraEn, generado_por: actorId,
      })
      .select('id')
      .single()
    if (errorInsert || !tokenRow) {
      return errorResponse(500, 'INTERNAL_ERROR', errorInsert?.message ?? 'No se pudo registrar el token.', undefined, correlationId)
    }

    const token = await firmarTokenEnlace(tokenRow.id, vigenciaDias)

    return jsonResponse(
      { id: tokenRow.id, inmueble_id: inmueble.id, token, vigencia_dias: vigenciaDias, expira_en: expiraEn },
      200,
      correlationId,
    )
  }),
}
