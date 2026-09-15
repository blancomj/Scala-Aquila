// ENFOQUE_CONSOLIDACION, Ola 3 (primera rebanada) — redacta en prosa una
// Explicacion ya estructurada (Ola 2), usando el proveedor de IA que el
// tenant ya configuró y activó (IA-01/D-121). Invocada bajo demanda desde
// un botón ("Redactar con IA") — nunca automática en cada carga de
// pantalla, para no disparar una llamada pagada sin que alguien la pida.
//
// DEGRADACIÓN, no error (Ola 3 §6): "IA no activa", "presupuesto agotado" y
// cualquier falla real del proveedor responden 200 con
// { texto: null, degradado: true, motivo }. La narrativa determinista que
// ya construyó D-132 sigue exactamente igual en la pantalla — este
// endpoint solo AÑADE prosa, nunca es la única fuente de la respuesta.
// Nunca 500 por una falla del proveedor, mismo criterio que Brevo
// (_shared/email_cobranza_provider.ts).
//
// El modelo NUNCA calcula ni decide nada (DI-04/DI-09): redactarExplicacion
// solo redacta lo que la Explicacion ya trae calculado. Este archivo, por
// su parte, solo escribe ia_uso_mensual y audit_log — nada más, sin
// importar qué texto devuelva el proveedor.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import { estimarCosto, ErrorIa, redactarExplicacion } from '@aquila/ai-providers'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 20
const RATE_LIMIT_VENTANA = '1 hour'

const afirmacionSchema = z.object({
  tipo: z.enum(['hecho', 'calculo', 'inferencia', 'hipotesis', 'informacion_insuficiente']),
  texto: z.string().min(1),
  evidencia: z.object({
    entidad: z.string().min(1),
    id: z.string().nullable(),
    fuente: z.string().min(1),
    fechaCorte: z.string().nullable(),
  }),
})

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  explicacion: z.object({
    origenModulo: z.string().min(1),
    origenEntidad: z.string().min(1),
    origenId: z.string().min(1),
    // Al menos una afirmación: una Explicacion vacía no tiene nada que redactar.
    afirmaciones: z.array(afirmacionSchema).min(1),
  }),
})

interface RespuestaRedaccion {
  texto: string | null
  degradado: boolean
  motivo?: string
}

function degradada(motivo: string, correlationId: string): Response {
  return jsonResponse({ texto: null, degradado: true, motivo } satisfies RespuestaRedaccion, 200, correlationId)
}

export default {
  fetch: withSupabase<Database>({ auth: 'user' }, async (req, ctx) => {
    const preflight = respuestaPreflight(req)
    if (preflight) return preflight

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
    const { tenant_id: tenantId, explicacion } = parseo.data

    // Antes de cualquier efecto/costo (mismo criterio que configurar-ia/
    // cartera-variacion): un request bloqueado nunca llega a la llamada
    // pagada.
    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `ia_redaccion:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: esMiembro, error: errorMembresia } = await ctx.supabase.rpc('is_member', {
      p_tenant: tenantId,
    })
    if (errorMembresia) {
      return errorResponse(500, 'INTERNAL_ERROR', errorMembresia.message, undefined, correlationId)
    }
    if (!esMiembro) {
      return errorResponse(403, 'FORBIDDEN', 'No eres miembro de este tenant.', undefined, correlationId)
    }

    // RLS ya autoriza SELECT a cualquier miembro (ia_config_select_miembro).
    const { data: config, error: errorConfig } = await ctx.supabase
      .from('ia_config')
      .select('id, proveedor, modelo')
      .eq('tenant_id', tenantId)
      .eq('activa', true)
      .maybeSingle()
    if (errorConfig) {
      return errorResponse(500, 'INTERNAL_ERROR', errorConfig.message, undefined, correlationId)
    }
    if (!config) {
      return degradada('IA_NO_ACTIVA', correlationId)
    }

    const { data: presupuestoDisponible, error: errorPresupuesto } = await ctx.supabase.rpc(
      'fn_presupuesto_ia_disponible',
      { p_tenant_id: tenantId },
    )
    if (errorPresupuesto) {
      return errorResponse(500, 'INTERNAL_ERROR', errorPresupuesto.message, undefined, correlationId)
    }
    if (!presupuestoDisponible) {
      return degradada('PRESUPUESTO_AGOTADO', correlationId)
    }

    // service_role: fn_leer_credenciales_ia es la ÚNICA función que devuelve
    // el valor descifrado — nunca antes, nunca con la sesión del usuario.
    const { data: credenciales, error: errorCredenciales } = await ctx.supabaseAdmin.rpc(
      'fn_leer_credenciales_ia',
      { p_config_id: config.id, p_tenant_id: tenantId },
    )
    if (errorCredenciales) {
      logEvent({
        level: 'error',
        action: 'ia_redaccion.credenciales_fallidas',
        correlationId,
        actorId,
        tenantId,
        message: errorCredenciales.message,
      })
      return degradada('IA_CREDENCIAL_FALTANTE', correlationId)
    }
    const apiKey = (credenciales ?? []).find((c: { nombre: string; valor: string }) => c.nombre === 'api_key')?.valor
    if (!apiKey) {
      return degradada('IA_CREDENCIAL_FALTANTE', correlationId)
    }

    try {
      const resultado = await redactarExplicacion({
        proveedor: config.proveedor,
        modelo: config.modelo,
        apiKey,
        explicacion,
      })

      const costoEstimado = estimarCosto(config.modelo, resultado.tokensEntrada, resultado.tokensSalida) ?? 0
      const { error: errorRegistro } = await ctx.supabaseAdmin.rpc('fn_registrar_uso_ia', {
        p_tenant_id: tenantId,
        p_tokens_entrada: resultado.tokensEntrada,
        p_tokens_salida: resultado.tokensSalida,
        p_costo_estimado_usd: costoEstimado,
      })
      if (errorRegistro) {
        // El uso no se pudo registrar, pero el texto SÍ se redactó — no se
        // le niega al usuario un resultado válido por un fallo de
        // contabilidad interna. Se deja constancia en el log.
        logEvent({
          level: 'error',
          action: 'ia_redaccion.registro_uso_fallido',
          correlationId,
          actorId,
          tenantId,
          message: errorRegistro.message,
        })
      }

      // audit_log no tiene política de INSERT para authenticated (ver
      // 20260813190100_core_tables.sql) — mismo motivo que
      // fn_activar_ia_proveedor inserta con SECURITY DEFINER; aquí se hace
      // vía service_role porque quien inserta es esta Edge Function, no una
      // función SQL. NUNCA el texto del dominio ni la clave en metadata.
      await ctx.supabaseAdmin.from('audit_log').insert({
        tenant_id: tenantId,
        actor_id: actorId,
        action: 'ia_redaccion.completada',
        entity_type: explicacion.origenEntidad,
        entity_id: null,
        metadata: {
          proveedor: config.proveedor,
          modelo: config.modelo,
          tokens_entrada: resultado.tokensEntrada,
          tokens_salida: resultado.tokensSalida,
          costo_estimado_usd: costoEstimado,
        },
      })

      logEvent({
        level: 'info',
        action: 'ia_redaccion.completada',
        correlationId,
        actorId,
        tenantId,
        meta: { proveedor: config.proveedor, modelo: config.modelo, tokens_salida: resultado.tokensSalida },
      })

      return jsonResponse(
        { texto: resultado.texto, degradado: false } satisfies RespuestaRedaccion,
        200,
        correlationId,
      )
    } catch (excepcion) {
      const esErrorIa = excepcion instanceof ErrorIa
      const motivo = esErrorIa ? excepcion.codigo : 'IA_PROVEEDOR_ERROR'
      logEvent({
        level: 'warn',
        action: 'ia_redaccion.degradada',
        correlationId,
        actorId,
        tenantId,
        // Nunca `detalle` del proveedor: podría reflejar fragmentos del
        // payload enviado o de la clave en un borde de error mal formado.
        meta: { proveedor: config.proveedor, motivo },
      })
      return degradada(motivo, correlationId)
    }
  }),
}
