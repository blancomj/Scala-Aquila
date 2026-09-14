// Configuración de proveedor de IA por copropiedad — FASE DE ESTRUCTURA.
// Acciones: guardar_credenciales · probar_conexion · activar.
//
// REGLA ABSOLUTA DE ESTA FUNCIÓN (idéntica a configurar-pasarela): el valor
// de una credencial nunca aparece en una respuesta HTTP, en un log, en
// `details` de un error ni en audit_log. Ni truncado. Entra por el body, va
// a Vault, y de ahí solo la vuelve a leer service_role cuando algún módulo
// necesite consumir el proveedor de verdad (fn_leer_credenciales_ia).
//
// ia_credencial no tiene NINGUNA política para `authenticated` (ver el
// COMMENT ON TABLE de 20260935000000) — por eso las escrituras de
// credenciales van con ctx.supabaseAdmin, después de verificar el rol
// explícitamente aquí, igual que configurar-pasarela/index.ts.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import { DESCRIPTORES } from '@aquila/ai-providers'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 40
const RATE_LIMIT_VENTANA = '1 hour'

const PROVEEDORES = ['anthropic', 'openai', 'google', 'openrouter'] as const

const payloadSchema = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('guardar_credenciales'),
    tenant_id: z.string().uuid(),
    proveedor: z.enum(PROVEEDORES),
    modelo: z.string().trim().min(1),
    // Los valores viajan aquí y NO salen nunca más de esta función.
    credenciales: z.record(z.string().trim().min(1), z.string().min(1)).optional(),
  }),
  z.object({
    accion: z.literal('probar_conexion'),
    tenant_id: z.string().uuid(),
    config_id: z.string().uuid(),
  }),
  z.object({
    accion: z.literal('activar'),
    tenant_id: z.string().uuid(),
    config_id: z.string().uuid(),
  }),
])

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
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'El cuerpo debe ser JSON válido.',
        undefined,
        correlationId,
      )
    }

    const parseo = payloadSchema.safeParse(payload)
    if (!parseo.success) {
      // `issues` de zod puede citar el valor que falló — con credenciales en
      // el payload eso filtraría el secreto. Se devuelve solo el mensaje.
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        parseo.error.issues[0]?.message ?? 'Payload inválido.',
        undefined,
        correlationId,
      )
    }
    const datos = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `configurar_ia:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: esAuxiliar, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: datos.tenant_id,
      p_roles: ['auxiliar'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!esAuxiliar) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un auxiliar o administrador puede configurar el proveedor de IA.',
        undefined,
        correlationId,
      )
    }

    if (datos.accion === 'guardar_credenciales') {
      const descriptor = DESCRIPTORES[datos.proveedor]
      const requeridas: readonly string[] = descriptor.capacidades.credencialesRequeridas
      const entregadas = Object.keys(datos.credenciales ?? {})
      const desconocidas = entregadas.filter((n) => !requeridas.includes(n))
      if (desconocidas.length > 0) {
        return errorResponse(
          400,
          'IA_CREDENCIAL_INVALIDA',
          `${descriptor.nombreComercial} no usa: ${desconocidas.join(', ')}.`,
          undefined,
          correlationId,
        )
      }

      // Upsert de la configuración (sin secretos) con la sesión del usuario:
      // ia_config SÍ tiene políticas, así que RLS es quien autoriza.
      const { data: config, error: errorConfig } = await ctx.supabase
        .from('ia_config')
        .upsert(
          {
            tenant_id: datos.tenant_id,
            proveedor: datos.proveedor,
            modelo: datos.modelo,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,proveedor' },
        )
        .select('id, proveedor, modelo, activa, verificada_at')
        .single()
      if (errorConfig) {
        return errorResponse(500, 'INTERNAL_ERROR', errorConfig.message, undefined, correlationId)
      }

      // Credenciales: Vault + service_role. Guardar una credencial invalida
      // la verificación anterior — lo que se probó ya no es lo que hay.
      const nombresGuardados: string[] = []
      for (const [nombre, valor] of Object.entries(datos.credenciales ?? {})) {
        const { data: secretId, error: errorVault } = await ctx.supabaseAdmin.rpc(
          'fn_guardar_credencial_ia',
          {
            p_config_id: config.id,
            p_tenant_id: datos.tenant_id,
            p_nombre: nombre,
            p_valor: valor,
            p_actor_id: actorId,
          },
        )
        if (errorVault) {
          // El mensaje del error de la base podría citar el valor en algún
          // borde; se devuelve un texto propio, nunca errorVault.message.
          logEvent({
            level: 'error',
            action: 'configurar_ia.credencial_fallida',
            correlationId,
            actorId,
            tenantId: datos.tenant_id,
            meta: { proveedor: datos.proveedor, credencial: nombre },
          })
          return errorResponse(
            500,
            'INTERNAL_ERROR',
            `No se pudo guardar la credencial "${nombre}".`,
            undefined,
            correlationId,
          )
        }
        if (secretId) nombresGuardados.push(nombre)
      }

      logEvent({
        level: 'info',
        action: 'configurar_ia.guardada',
        correlationId,
        actorId,
        tenantId: datos.tenant_id,
        // Solo NOMBRES de credencial, nunca valores.
        meta: { proveedor: datos.proveedor, modelo: datos.modelo, credenciales: nombresGuardados },
      })

      return jsonResponse({ config, credenciales_guardadas: nombresGuardados }, 200, correlationId)
    }

    // Las otras 2 acciones operan sobre una config existente.
    const { data: config, error: errorConfig } = await ctx.supabase
      .from('ia_config')
      .select('id, proveedor, modelo, activa, verificada_at')
      .eq('id', datos.config_id)
      .eq('tenant_id', datos.tenant_id)
      .maybeSingle()
    if (errorConfig) {
      return errorResponse(500, 'INTERNAL_ERROR', errorConfig.message, undefined, correlationId)
    }
    if (!config) {
      return errorResponse(
        404,
        'IA_NO_CONFIGURADA',
        'Esa configuración de proveedor de IA no existe en esta copropiedad.',
        undefined,
        correlationId,
      )
    }

    if (datos.accion === 'probar_conexion') {
      const descriptor = DESCRIPTORES[config.proveedor]
      const requeridas: readonly string[] = descriptor.capacidades.credencialesRequeridas

      // Lo único que se puede verificar en la FASE DE ESTRUCTURA: que estén
      // todas las credenciales que el proveedor exige y que Vault las pueda
      // descifrar. Hablar de verdad con la API del proveedor es
      // responsabilidad de quien consuma esta configuración cuando la
      // necesite — sellar verificada_at aquí sería decir "probado" sin
      // haber hablado con nadie.
      const { data: presentes, error: errorCred } = await ctx.supabaseAdmin
        .from('ia_credencial')
        .select('nombre')
        .eq('config_id', config.id)
      if (errorCred) {
        return errorResponse(500, 'INTERNAL_ERROR', errorCred.message, undefined, correlationId)
      }
      const nombresPresentes = new Set((presentes ?? []).map((c) => c.nombre))
      const faltantes = requeridas.filter((n) => !nombresPresentes.has(n))
      if (faltantes.length > 0) {
        return errorResponse(
          422,
          'IA_CREDENCIAL_FALTANTE',
          `Faltan credenciales de ${descriptor.nombreComercial}: ${faltantes.join(', ')}.`,
          undefined,
          correlationId,
        )
      }

      const { data: descifrables, error: errorDescifrar } = await ctx.supabaseAdmin.rpc(
        'fn_credenciales_ia_descifrables',
        { p_config_id: config.id, p_tenant_id: datos.tenant_id },
      )
      if (errorDescifrar || descifrables !== requeridas.length) {
        return errorResponse(
          422,
          'IA_CREDENCIAL_INVALIDA',
          'Alguna credencial no se pudo leer del almacén seguro. Vuelve a guardarla.',
          undefined,
          correlationId,
        )
      }

      const { data: sellada, error: errorSellar } = await ctx.supabase
        .from('ia_config')
        .update({ verificada_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', config.id)
        .eq('tenant_id', datos.tenant_id)
        .select('id, proveedor, modelo, activa, verificada_at')
        .single()
      if (errorSellar) {
        return errorResponse(500, 'INTERNAL_ERROR', errorSellar.message, undefined, correlationId)
      }

      logEvent({
        level: 'info',
        action: 'configurar_ia.verificada',
        correlationId,
        actorId,
        tenantId: datos.tenant_id,
        meta: { proveedor: config.proveedor, credenciales: requeridas.length },
      })

      return jsonResponse(
        {
          config: sellada,
          // Honestidad sobre el alcance: no se habló con el proveedor.
          alcance: 'credenciales_presentes_y_descifrables',
        },
        200,
        correlationId,
      )
    }

    const { data: activada, error: errorActivar } = await ctx.supabase.rpc(
      'fn_activar_ia_proveedor',
      { p_config_id: config.id, p_tenant_id: datos.tenant_id },
    )
    if (errorActivar) {
      const esNoVerificada = errorActivar.message.includes('IA_NO_VERIFICADA')
      return errorResponse(
        esNoVerificada ? 422 : 500,
        esNoVerificada ? 'IA_NO_VERIFICADA' : 'INTERNAL_ERROR',
        esNoVerificada
          ? 'No se puede activar un proveedor de IA cuyas credenciales nunca se probaron.'
          : errorActivar.message,
        undefined,
        correlationId,
      )
    }
    return jsonResponse({ config: activada }, 200, correlationId)
  }),
}
