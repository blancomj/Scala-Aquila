// CAR §15.2 (bloque 21 de interfaz) — expide una certificación de deuda, el
// artefacto del art. 48 Ley 675: presta mérito ejecutivo. Compone lo ya
// construido (REC-CAR-004): registrarCertificacionDeuda() (packages/
// liquidation-engine) lee los cargos vencidos, agrega los rubros, calcula
// el hash reproducible (PH-C32) e inserta. Esta función solo resuelve el
// consecutivo y valida el rol antes de llamar.
//
// GAP-CAR-011 sigue abierto (decisión explícita del usuario, 2026-08-17):
// monto_expensas_extraordinarias y monto_sanciones siempre salen en 0 — el
// esquema no distingue esos dos rubros a nivel de cargo, y no se inventa una
// clasificación que no existe (ver cabecera de cartera-juridico.ts).
//
// Sin cliente de servicio: RLS + guard_certificacion_insert (20260822340000)
// ya exigen administrador y estampan expedida_por desde auth.uid() — este
// endpoint usa el cliente del propio usuario (ctx.supabase), mismo criterio
// SECURITY INVOKER que cartera-posicion (no hay nada que este endpoint
// pueda hacer que el usuario no pudiera hacer ya por su cuenta con permisos
// suficientes).
//
// El consecutivo se resuelve con fn_siguiente_consecutivo (RC-3,
// 20260903150000) — mismo mecanismo atómico por (tenant, tipo_documento)
// que recibo_caja, numeración consecutiva por copropiedad, no global.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado), no src/index.ts — mismo motivo que
// cartera-indicadores/index.ts.
import {
  CertificacionSinDeudaError,
  registrarCertificacionDeuda,
} from '../../../packages/liquidation-engine/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

// Acción administrativa infrecuente, no de volumen (a diferencia de
// ejecutar-accion-cobranza) — 30/hora es generoso para uso real y corta
// cualquier automatización accidental.
const RATE_LIMIT_MAX_HITS = 30
const RATE_LIMIT_VENTANA = '1 hour'

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Debe ser una fecha YYYY-MM-DD.')

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  inmueble_id: z.string().uuid(),
  fecha_corte: fechaSchema,
  fecha_expedicion: fechaSchema,
  cargo_firmante: z
    .string()
    .trim()
    .min(3, 'cargo_firmante debe identificar a quien firma.')
    .max(200),
})

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

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser JSON válido.', undefined, correlationId)
    }

    const parseo = payloadSchema.safeParse(payload)
    if (!parseo.success) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        parseo.error.issues[0]?.message ?? 'Payload inválido.',
        { issues: parseo.error.issues },
        correlationId,
      )
    }
    const {
      tenant_id: tenantId,
      inmueble_id: inmuebleId,
      fecha_corte: fechaCorte,
      fecha_expedicion: fechaExpedicion,
      cargo_firmante: cargoFirmante,
    } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `cartera_certificar_deuda:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: esAdministrador, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: tenantId,
      p_roles: ['administrador'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!esAdministrador) {
      return errorResponse(
        403,
        'CERTIFICACION_REQUIERE_ADMINISTRADOR',
        'Expedir una certificación de deuda exige rol administrador (art. 48 — firmante identificado).',
        undefined,
        correlationId,
      )
    }

    const { data: consecutivo, error: errorConsecutivo } = await ctx.supabase.rpc('fn_siguiente_consecutivo', {
      p_tenant_id: tenantId,
      p_tipo_documento: 'certificacion_deuda',
    })
    if (errorConsecutivo || !consecutivo) {
      return errorResponse(
        500,
        'INTERNAL_ERROR',
        errorConsecutivo?.message ?? 'No se pudo asignar el consecutivo.',
        undefined,
        correlationId,
      )
    }

    try {
      const { certificacionId, hash } = await registrarCertificacionDeuda(ctx.supabase, {
        tenantId,
        inmuebleId,
        consecutivo,
        fechaExpedicion,
        fechaCorte,
        cargoFirmante,
      })

      logEvent({
        level: 'info',
        action: 'cartera_certificar_deuda.emitida',
        correlationId,
        actorId,
        tenantId,
        meta: { inmuebleId, certificacionId, consecutivo },
      })

      return jsonResponse({ certificacionId, consecutivo, hash }, 201, correlationId)
    } catch (excepcion) {
      if (excepcion instanceof CertificacionSinDeudaError) {
        return errorResponse(422, 'CERTIFICACION_SIN_DEUDA', excepcion.message, undefined, correlationId)
      }
      const mensaje = excepcion instanceof Error ? excepcion.message : 'No se pudo expedir la certificación.'
      if (mensaje.includes('No hay una política financiera vigente')) {
        return errorResponse(422, 'CERTIFICACION_SIN_POLITICA_VIGENTE', mensaje, undefined, correlationId)
      }
      logEvent({
        level: 'error',
        action: 'cartera_certificar_deuda.error',
        correlationId,
        actorId,
        tenantId,
        message: mensaje,
        meta: { inmuebleId },
      })
      return errorResponse(500, 'INTERNAL_ERROR', mensaje, undefined, correlationId)
    }
  }),
}
