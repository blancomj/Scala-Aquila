// GOB-0 §4.4 — Opción 1 mínima de AD-26: enlace de consulta con token y
// caducidad para CUALQUIER documento del tenant (documentos, generalizada de
// documentos_inmueble en 20260822130000), reutilizando tal cual el mecanismo
// HMAC ya construido para el estado de cuenta (link_token.ts, D-27) — sin
// tocar auth/RLS/memberships (fuera de alcance vinculante del corte).
//
// Este es el lado "miembro con sesión pide el enlace" — ver-documento (sin
// sesión) es el que lo consume. Solo auxiliar+ del tenant dueño del
// documento puede generarlo: RLS-scoped (ctx.supabase) ya impide leer un
// documento ajeno, y has_role() lo confirma explícitamente antes de firmar.
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
    const cuerpo = body as { documento_id?: unknown; vigencia_dias?: unknown } | null
    const documentoId = cuerpo?.documento_id
    if (typeof documentoId !== 'string' || !UUID_RE.test(documentoId)) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'documento_id debe ser un uuid válido.', undefined, correlationId)
    }
    let vigenciaDias = VIGENCIA_DIAS_DEFAULT
    if (cuerpo?.vigencia_dias !== undefined) {
      const valor = cuerpo.vigencia_dias
      // 0 días es válido (expira de inmediato) — permite emitir un enlace ya
      // vencido a propósito (revocación instantánea; también usado por
      // tests/gobierno/prerrequisitos.test.ts para probar la ruta de
      // caducidad end-to-end sin reconstruir el HMAC fuera de Deno).
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
      `generar_enlace_documento:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // RLS-scoped: solo resuelve el documento si el actor es miembro del
    // tenant dueño — un documento ajeno simplemente no aparece (mismo
    // criterio que subir-documento con inmueble_id).
    const { data: documento, error: errorDocumento } = await ctx.supabase
      .from('documentos')
      .select('id, tenant_id')
      .eq('id', documentoId)
      .maybeSingle()
    if (errorDocumento) {
      return errorResponse(500, 'INTERNAL_ERROR', errorDocumento.message, undefined, correlationId)
    }
    if (!documento) {
      return errorResponse(
        404,
        'DOCUMENTO_NO_ENCONTRADO',
        'El documento no existe o no es accesible.',
        undefined,
        correlationId,
      )
    }

    const { data: esAuxiliar, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: documento.tenant_id,
      p_roles: ['auxiliar'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!esAuxiliar) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un auxiliar puede generar enlaces de consulta.',
        undefined,
        correlationId,
      )
    }

    const token = await firmarTokenEnlace(documento.id, vigenciaDias)
    const expiraEn = new Date(Date.now() + vigenciaDias * 24 * 3600 * 1000).toISOString()

    return jsonResponse(
      { documento_id: documento.id, token, vigencia_dias: vigenciaDias, expira_en: expiraEn },
      200,
      correlationId,
    )
  }),
}
