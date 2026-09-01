// Compositor de correo — envío vía Brevo (Patrón A).
//
// Recibe: tenant_id (validado contra JWT), destinatario (email suelto o
// persona de BD), y opcionalmente plantilla_id (precarga) o asunto/cuerpo
// directos (texto libre).
//
// Doble validación server-side:
//  1. tenants.compositor_correo_activo debe ser true
//  2. Si viene plantilla_id, esa plantilla debe tener activa = true
//
// Resolución de placeholders: los campos del COMPOSITOR_FIELD_REGISTRY se
// resuelven con datos reales del destinatario (nombre, inmueble, saldo,
// fecha, remitente). Si un campo no se puede resolver, se informa en la
// respuesta como dato, no como error (mismo criterio D-28).
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { COMPOSITOR_FIELD_REGISTRY } from '../../../packages/shared/src/compositor-registry.ts'
import { errorResponse, jsonResponse, parsearErrorRpc, respuestaPreflight } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'
import { construirCorreoCompositor } from '../_shared/email_compositor.ts'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  destinatario_email: z.string().email(),
  destinatario_nombre: z.string().min(1),
  inmueble_id: z.string().uuid().optional(),
  plantilla_id: z.string().uuid().optional(),
  asunto: z.string().optional(),
  cuerpo: z.string().optional(),
})

export default {
  fetch: async (req: Request): Promise<Response> => {
    const preflight = respuestaPreflight(req)
    if (preflight) return preflight

    const correlationId = crypto.randomUUID()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
    }

    const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!jwt) {
      return errorResponse(401, 'UNAUTHENTICATED', 'Sesión requerida.', undefined, correlationId)
    }
    const admin = createClient<Database>(supabaseUrl, serviceKey)
    const { data: userData, error: errorUser } = await admin.auth.getUser(jwt)
    const actorId = userData?.user?.id ?? null
    if (errorUser || !actorId) {
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
        { issues: parseo.error.issues },
        correlationId,
      )
    }
    const p = parseo.data

    // Si viene plantilla_id, no se aceptan asunto/cuerpo directos
    if (p.plantilla_id && (p.asunto || p.cuerpo)) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'No se puede enviar plantilla_id junto con asunto/cuerpo directos.',
        undefined,
        correlationId,
      )
    }
    // Si no viene plantilla_id, asunto y cuerpo son obligatorios
    if (!p.plantilla_id && (!p.asunto || !p.cuerpo)) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'Sin plantilla_id se requieren asunto y cuerpo.',
        undefined,
        correlationId,
      )
    }

    const bloqueo = await enforceRateLimit(
      admin,
      `enviar_correo_compositor:${actorId}`,
      20,
      '1 hour',
      correlationId,
    )
    if (bloqueo) return bloqueo

    // 1. Verificar que la feature esté activa para el tenant
    const { data: tenant } = await admin
      .from('tenants')
      .select('compositor_correo_activo, name')
      .eq('id', p.tenant_id)
      .maybeSingle()
    if (!tenant?.compositor_correo_activo) {
      return errorResponse(
        403,
        'COMPOSITOR_DESACTIVADO',
        'El compositor de correo no está activo para esta copropiedad.',
        undefined,
        correlationId,
      )
    }

    // 2. Verificar membership del actor
    const { data: membership } = await admin
      .from('memberships')
      .select('id')
      .eq('user_id', actorId)
      .eq('tenant_id', p.tenant_id)
      .eq('status', 'active')
      .in('role', ['auxiliar', 'administrador'])
      .maybeSingle()
    if (!membership) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un auxiliar o administrador de esta copropiedad puede enviar correos.',
        undefined,
        correlationId,
      )
    }

    // 3. Resolver asunto/cuerpo (de plantilla o directo)
    let asunto: string
    let cuerpo: string
    if (p.plantilla_id) {
      const { data: plantilla } = await admin
        .from('plantillas_compositor')
        .select('asunto, cuerpo, activa')
        .eq('id', p.plantilla_id)
        .eq('tenant_id', p.tenant_id)
        .maybeSingle()
      if (!plantilla) {
        return errorResponse(404, 'PLANTILLA_NO_ENCONTRADA', 'No existe esa plantilla.', undefined, correlationId)
      }
      if (!plantilla.activa) {
        return errorResponse(
          403,
          'PLANTILLA_DESACTIVADA',
          'Esa plantilla está desactivada.',
          undefined,
          correlationId,
        )
      }
      asunto = plantilla.asunto
      cuerpo = plantilla.cuerpo
    } else {
      asunto = p.asunto!
      cuerpo = p.cuerpo!
    }

    // 4. Resolver placeholders del registro de campos
    const params: Record<string, string> = {}
    const camposResueltos: string[] = []
    const camposNoResueltos: string[] = []

    for (const campo of COMPOSITOR_FIELD_REGISTRY) {
      let valor: string | null = null
      switch (campo.field) {
        case 'nombreDestinatario':
          valor = p.destinatario_nombre
          break
        case 'inmuebleCodigo': {
          if (!p.inmueble_id) break
          const { data: inm } = await admin
            .from('inmuebles')
            .select('codigo')
            .eq('id', p.inmueble_id)
            .maybeSingle()
          valor = inm?.codigo ?? null
          break
        }
        case 'fechaActual':
          valor = new Date().toLocaleDateString('es-CO', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
          break
        case 'remitenteNombre':
          valor = tenant.name ?? null
          break
        // saldoPendiente: suma de monto_pendiente de v_cargo_saldo para el inmueble
        case 'saldoPendiente': {
          if (!p.inmueble_id) break
          const { data: cargos } = await admin
            .from('v_cargo_saldo' as never)
            .select('monto_pendiente')
            .eq('tenant_id', p.tenant_id)
            .eq('inmueble_id', p.inmueble_id)
          if (cargos && cargos.length > 0) {
            const total = cargos.reduce(
              (acc: number, c: { monto_pendiente: number | null }) => acc + Number(c.monto_pendiente ?? 0),
              0,
            )
            valor = new Intl.NumberFormat('es-CO', {
              style: 'currency',
              currency: 'COP',
              maximumFractionDigits: 0,
            }).format(total)
          }
          break
        }
      }
      if (valor !== null && valor !== undefined) {
        params[campo.field] = valor
        camposResueltos.push(campo.field)
      } else {
        camposNoResueltos.push(campo.field)
      }
    }

    // 5. Construir HTML (Patrón A)
    const { subject, html } = construirCorreoCompositor(
      { asunto, cuerpo, remitenteNombre: tenant.name ?? 'Administración', destinatarioNombre: p.destinatario_nombre },
      params,
    )

    // 6. Enviar vía Brevo
    const apiKey = Deno.env.get('BREVO_API_KEY')
    const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL')
    const senderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Aquila PH'
    if (!apiKey || !senderEmail) {
      return errorResponse(500, 'CONFIG_INCOMPLETA', 'Brevo no está configurado.', undefined, correlationId)
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: p.destinatario_email }],
        subject,
        htmlContent: html,
      }),
    })

    if (!res.ok) {
      const cuerpoBrevo = await res.text()
      logEvent({
        level: 'warn',
        action: 'enviar_correo_compositor.brevo_error',
        correlationId,
        actorId,
        tenantId: p.tenant_id,
        meta: { status: res.status, body: cuerpoBrevo },
      })
      return errorResponse(
        502,
        'BREVO_ERROR',
        `Brevo respondió ${res.status}.`,
        undefined,
        correlationId,
      )
    }

    // 7. Auditar envío
    await admin.from('audit_log').insert({
      tenant_id: p.tenant_id,
      actor_id: actorId,
      action: 'compositor_correo.enviado',
      entity_type: 'correo',
      metadata: {
        destinatario_email: p.destinatario_email,
        destinatario_nombre: p.destinatario_nombre,
        plantilla_id: p.plantilla_id ?? null,
        campos_resueltos: camposResueltos,
        campos_no_resueltos: camposNoResueltos,
      },
    })

    logEvent({
      level: 'info',
      action: 'enviar_correo_compositor.enviado',
      correlationId,
      actorId,
      tenantId: p.tenant_id,
      meta: { destinatario_email: p.destinatario_email },
    })

    return jsonResponse(
      {
        ok: true,
        campos_resueltos: camposResueltos,
        campos_no_resueltos: camposNoResueltos.length > 0 ? camposNoResueltos : undefined,
      },
      200,
      correlationId,
    )
  },
}

function logEvent(params: {
  level: string
  action: string
  correlationId: string
  actorId: string | null
  tenantId: string
  meta?: Record<string, unknown>
}): void {
  console.log(JSON.stringify(params))
}
