// GOB-0 §4.4 — Opción 1 mínima de AD-26: enlace de consulta con token y
// caducidad para CUALQUIER documento del tenant (documentos, generalizada de
// documentos_inmueble en 20260822130000), reutilizando tal cual el mecanismo
// HMAC ya construido para el estado de cuenta (link_token.ts, D-27) — sin
// tocar auth/RLS/memberships (fuera de alcance vinculante del corte).
//
// Este es el lado "con sesión pide el enlace" — ver-documento (sin sesión)
// es el que lo consume, sin cambios: el token solo codifica {documento_id,
// exp} y no distingue quién lo pidió (EXT-09 §7.6, ver comentario de
// ver-documento).
//
// EXT-10 (Ola 2, M16) — tercera vía `actor_externo`: mismo criterio exacto
// que crear-intencion-pago (EXT-07 §7.3) para su vía 'actor_externo' — un
// actor externo (EXT-01) tiene sesión real de Supabase Auth pero NUNCA es
// tenant_member (AD-37), así que la vía original ('sesion', has_role
// auxiliar+) nunca le aplica. `via` es opcional y por defecto 'sesion' —
// los 5+ llamadores existentes (contableRendicion.ts, gobiernoActas.ts,
// tests de gobierno/rendición) siguen mandando { documento_id,
// vigencia_dias? } sin tocarlos.
//
// `documentos` no tiene NINGUNA política RLS utilizable por un actor externo
// (única policy: documentos_select_agent_auditor, exige is_member) — la vía
// actor_externo resuelve el contexto con ctx.supabaseAdmin (service_role,
// mismo patrón que subir-documento) y verifica a mano que el documento
// pedido es de su propio tenant y (inmueble propio o de copropiedad, sin
// inmueble) — el mismo filtro que external-documentos-listar ya aplica para
// listarlo, así que un actor externo nunca puede firmar un enlace para un
// documento que esa lista no le mostraría.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import {
  extraerJwtDelHeader,
  resolverContextoActorExterno,
  respuestaErrorContextoActorExterno,
} from '../_shared/actor_externo_context.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { firmarTokenEnlace } from '../_shared/link_token.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 30
const RATE_LIMIT_VENTANA = '1 hour'
const VIGENCIA_DIAS_DEFAULT = 30
const VIGENCIA_DIAS_MAXIMA = 90

const payloadObjectSchema = z.object({
  via: z.enum(['sesion', 'actor_externo']).default('sesion'),
  documento_id: z.string().uuid(),
  vinculo_id: z.string().uuid().optional(),
  vigencia_dias: z.number().int().min(0).max(VIGENCIA_DIAS_MAXIMA).optional(),
})
const payloadSchema = payloadObjectSchema.refine(
  (v: z.infer<typeof payloadObjectSchema>) => v.via !== 'actor_externo' || v.vinculo_id !== undefined,
  { message: 'vinculo_id es requerido cuando via = "actor_externo".', path: ['vinculo_id'] },
)

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
    const parseo = payloadSchema.safeParse(body)
    if (!parseo.success) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        parseo.error.issues[0]?.message ?? 'Payload inválido.',
        undefined,
        correlationId,
      )
    }
    const datos = parseo.data
    const vigenciaDias = datos.vigencia_dias ?? VIGENCIA_DIAS_DEFAULT

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `generar_enlace_documento:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    let documentoId: string

    if (datos.via === 'actor_externo') {
      const jwt = extraerJwtDelHeader(req)
      const contexto = await resolverContextoActorExterno(ctx.supabaseAdmin, jwt, datos.vinculo_id!)
      if ('tipo' in contexto) {
        return respuestaErrorContextoActorExterno(contexto, correlationId)
      }

      const { data: documento, error: errorDocumento } = await ctx.supabaseAdmin
        .from('documentos')
        .select('id, tenant_id, inmueble_id')
        .eq('id', datos.documento_id)
        .maybeSingle()
      if (errorDocumento) {
        return errorResponse(500, 'INTERNAL_ERROR', errorDocumento.message, undefined, correlationId)
      }
      // Mismo filtro que external-documentos-listar: propio tenant y (inmueble propio o
      // documento de copropiedad, sin inmueble) — nunca el de otro inmueble del mismo tenant.
      if (
        !documento
        || documento.tenant_id !== contexto.tenantId
        || (documento.inmueble_id !== null && documento.inmueble_id !== contexto.inmuebleId)
      ) {
        return errorResponse(
          404,
          'DOCUMENTO_NO_ENCONTRADO',
          'El documento no existe o no es accesible.',
          undefined,
          correlationId,
        )
      }
      documentoId = documento.id
    } else {
      // RLS-scoped: solo resuelve el documento si el actor es miembro del
      // tenant dueño — un documento ajeno simplemente no aparece (mismo
      // criterio que subir-documento con inmueble_id).
      const { data: documento, error: errorDocumento } = await ctx.supabase
        .from('documentos')
        .select('id, tenant_id')
        .eq('id', datos.documento_id)
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
      documentoId = documento.id
    }

    const token = await firmarTokenEnlace(documentoId, vigenciaDias)
    const expiraEn = new Date(Date.now() + vigenciaDias * 24 * 3600 * 1000).toISOString()

    return jsonResponse(
      { documento_id: documentoId, token, vigencia_dias: vigenciaDias, expira_en: expiraEn },
      200,
      correlationId,
    )
  }),
}
