// EXS-3 — despacho de un anuncio publicado por correo.
//
// Es un paso MANUAL y posterior a publicar, por decisión de producto: al
// publicar, el anuncio queda in-app y emite su aviso en la campana; quien
// publica decide después si además merece un correo a toda la audiencia.
// Un aviso de ascensor no siempre justifica escribirle a 200 personas.
//
// No reimplementa nada del canal: resuelve la audiencia con
// fn_anuncio_destinatarios (que a su vez reutiliza gobierno_segmento_
// destinatarios de GOB-9), envía con enviarEmailCobranza y registra cada
// envío en el histórico unificado de COM-1 con origen_modulo='anuncios'.
// Así un anuncio despachado aparece en Comunicaciones junto al resto del
// correo de la copropiedad, y el webhook de Brevo puede resolver sus acuses.
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'
import { enviarEmailCobranza } from '../_shared/email_cobranza_provider.ts'
import { registrarEnvioComunicacion } from '../_shared/comunicacion_generalizada.ts'
import { logEvent } from '../_shared/logger.ts'

const payloadSchema = z.object({
  anuncio_id: z.string().uuid(),
})

interface Destinatario {
  tercero_id: string
  nombre: string | null
  email: string | null
  telefono: string | null
}

/** Escapa el contenido del anuncio antes de meterlo en el HTML del correo:
 *  lo redacta un usuario y no debe poder inyectar marcado en el mensaje. */
function escaparHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function construirCorreo(params: {
  titulo: string
  contenido: string
  numero: number
  anio: number
  copropiedad: string
}): { subject: string; html: string } {
  const referencia = `AN-${String(params.anio)}-${String(params.numero).padStart(6, '0')}`
  const parrafos = params.contenido
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;line-height:1.55">${escaparHtml(p).replaceAll('\n', '<br>')}</p>`)
    .join('')

  return {
    subject: `${params.titulo} · ${referencia}`,
    html: `<!doctype html><html><body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1f2937;max-width:640px;margin:0 auto;padding:24px">
  <p style="font-size:12px;color:#6b7280;margin:0 0 4px">${escaparHtml(params.copropiedad)} · Comunicación oficial ${referencia}</p>
  <h1 style="font-size:20px;margin:0 0 16px">${escaparHtml(params.titulo)}</h1>
  ${parrafos}
</body></html>`,
  }
}

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

    let cuerpo: unknown
    try {
      cuerpo = await req.json()
    } catch {
      return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser JSON.', undefined, correlationId)
    }
    const parsed = payloadSchema.safeParse(cuerpo)
    if (!parsed.success) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'anuncio_id es requerido.', undefined, correlationId)
    }

    // 1. El anuncio debe existir y estar publicado. Un borrador no se
    //    despacha: el correo es irreversible y saltaría la revisión.
    const { data: anuncio, error: errorAnuncio } = await admin
      .from('anuncios')
      .select('id, tenant_id, titulo, contenido, estado, numero, anio')
      .eq('id', parsed.data.anuncio_id)
      .maybeSingle()
    if (errorAnuncio || !anuncio) {
      return errorResponse(404, 'ANUNCIO_NOT_FOUND', 'El anuncio no existe.', undefined, correlationId)
    }
    if (anuncio.estado !== 'publicado') {
      return errorResponse(
        409,
        'ANUNCIO_INVALID_STATE',
        'Solo se puede enviar por correo un anuncio publicado.',
        undefined,
        correlationId,
      )
    }

    // 2. Autorización: administrador del tenant del anuncio. Se comprueba
    //    contra la BD, nunca contra un tenant_id recibido del cliente.
    const { data: membresia } = await admin
      .from('memberships')
      .select('role')
      .eq('tenant_id', anuncio.tenant_id)
      .eq('user_id', actorId)
      .eq('status', 'active')
      .maybeSingle()
    if (!membresia || membresia.role !== 'administrador') {
      return errorResponse(403, 'FORBIDDEN', 'Se requiere rol administrador.', undefined, correlationId)
    }

    // 3. Rate limit: un despacho escribe a toda la copropiedad.
    const limite = await enforceRateLimit(
      admin,
      `enviar_anuncio:${anuncio.tenant_id}`,
      20,
      '1 hour',
      correlationId,
    )
    if (limite) return limite

    // 4. Audiencia resuelta server-side, contra datos vivos.
    const { data: destinatarios, error: errorDest } = await admin.rpc('fn_anuncio_destinatarios', {
      p_anuncio_id: anuncio.id,
    })
    if (errorDest) {
      return errorResponse(500, 'INTERNAL_ERROR', 'No se pudo resolver la audiencia.', undefined, correlationId)
    }

    const { data: tenant } = await admin
      .from('tenants')
      .select('name')
      .eq('id', anuncio.tenant_id)
      .maybeSingle()

    const { subject, html } = construirCorreo({
      titulo: anuncio.titulo,
      contenido: anuncio.contenido,
      numero: anuncio.numero ?? 0,
      anio: anuncio.anio ?? new Date().getFullYear(),
      copropiedad: tenant?.name ?? 'Copropiedad',
    })

    // 5. Despachar. Quien no tiene correo registrado se cuenta aparte en vez
    //    de fallar el envío entero: que falte un dato de una persona no debe
    //    impedir que las otras 199 reciban la comunicación.
    const lista = (destinatarios ?? []) as Destinatario[]
    let enviados = 0
    let fallidos = 0
    let sinCorreo = 0

    for (const d of lista) {
      if (!d.email) {
        sinCorreo += 1
        continue
      }
      const resultadoEnvio = await enviarEmailCobranza({
        to: d.email,
        destinatarioNombre: d.nombre ?? 'Residente',
        subject,
        html,
        reference: `${anuncio.id}:${d.tercero_id}`,
        tags: ['anuncio'],
      })

      // El evento lleva el tercero para que dos destinatarios del mismo
      // anuncio no choquen contra la clave de origen única de COM-1.
      await registrarEnvioComunicacion(admin, {
        tenantId: anuncio.tenant_id,
        origen: {
          modulo: 'anuncios',
          entidad: 'anuncios',
          id: anuncio.id,
          evento: `anuncio.despachado:${d.tercero_id}`,
        },
        canal: 'email',
        destinatarioTerceroId: d.tercero_id,
        destinatarioContacto: d.email,
        plantillaCodigo: 'anuncio_oficial',
        plantillaVersion: 0,
        asunto: subject,
        contenidoRenderizado: html,
        resultadoEnvio,
        actorId,
        esAutomatico: false,
      })

      if (resultadoEnvio.success) enviados += 1
      else fallidos += 1
    }

    logEvent({
      level: 'info',
      action: 'anuncio.despachado',
      correlationId,
      actorId,
      tenantId: anuncio.tenant_id,
      meta: { anuncioId: anuncio.id, destinatarios: lista.length, enviados, fallidos, sinCorreo },
    })

    return jsonResponse({ enviados, fallidos, sin_correo: sinCorreo, destinatarios: lista.length }, 200, correlationId)
  },
}
