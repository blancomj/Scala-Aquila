// Vincula evidencia real (archivo) a un hallazgo de auditoría —
// PROMPT_MAESTRO_MODULO_AUDITORIA_AQUILA §34, §70.
//
// auditoria_evidencias no tiene política INSERT para `authenticated` sobre
// storage.objects (mismo criterio que documentos/subir-documento): el hash
// SHA-256 que garantiza la integridad de la evidencia se calcula aquí, en
// servidor — nunca puede confiarse en un hash que mande el cliente, porque
// entonces cualquiera podría registrar una evidencia con un hash que no
// corresponde al contenido real del archivo. Por eso esta función es el
// único punto de escritura: sube el objeto y luego inserta la fila con
// ctx.supabaseAdmin, igual que subir-documento/index.ts. Si el insert falla
// después de subir el objeto, se borra el objeto para no dejar un archivo
// huérfano en Storage.
//
// Body: multipart/form-data (no JSON) — mismo motivo que subir-documento:
// los campos de FormData son todos string | File, se validan a mano.
import { withSupabase } from '@supabase/server'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 20
const RATE_LIMIT_VENTANA = '1 hour'

const BUCKET = 'auditoria-evidencias'
const TAMANO_MAXIMO_BYTES = 15 * 1024 * 1024 // 15 MB — mismo límite que el bucket (migración).
const MIME_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIPOS_EVIDENCIA = new Set([
  'DOCUMENTO', 'CAPTURA', 'REPORTE', 'CONSULTA', 'LOG',
  'COMPROBANTE', 'CONCILIACION', 'ENTREVISTA', 'OBSERVACION', 'OTRO',
])

function sanearNombreArchivo(nombre: string): string {
  const limpio = nombre.replace(/[^\w.\-]+/g, '_').slice(-150)
  return limpio.length > 0 ? limpio : 'evidencia'
}

async function calcularHashSha256(archivo: File): Promise<string> {
  const buffer = await archivo.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

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

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'El cuerpo debe ser multipart/form-data.',
        undefined,
        correlationId,
      )
    }

    const hallazgoIdRaw = form.get('hallazgo_id')
    const tipoRaw = form.get('tipo')
    const origenRaw = form.get('origen')
    const descripcionRaw = form.get('descripcion')
    const archivo = form.get('archivo')

    if (typeof hallazgoIdRaw !== 'string' || !UUID_RE.test(hallazgoIdRaw)) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'hallazgo_id debe ser un uuid válido.', undefined, correlationId)
    }
    if (typeof tipoRaw !== 'string' || !TIPOS_EVIDENCIA.has(tipoRaw)) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        `tipo debe ser uno de: ${[...TIPOS_EVIDENCIA].join(', ')}.`,
        undefined,
        correlationId,
      )
    }
    if (origenRaw !== null && typeof origenRaw !== 'string') {
      return errorResponse(400, 'INVALID_PAYLOAD', 'origen debe ser texto.', undefined, correlationId)
    }
    if (descripcionRaw !== null && typeof descripcionRaw !== 'string') {
      return errorResponse(400, 'INVALID_PAYLOAD', 'descripcion debe ser texto.', undefined, correlationId)
    }
    const DESCRIPCION_MAX = 500
    if (typeof descripcionRaw === 'string' && descripcionRaw.length > DESCRIPCION_MAX) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        `descripcion no puede superar ${DESCRIPCION_MAX} caracteres.`,
        undefined,
        correlationId,
      )
    }
    if (!(archivo instanceof File)) {
      return errorResponse(400, 'ARCHIVO_INVALIDO', 'Falta el archivo.', undefined, correlationId)
    }
    if (archivo.size === 0 || archivo.size > TAMANO_MAXIMO_BYTES) {
      return errorResponse(400, 'ARCHIVO_INVALIDO', 'El archivo debe pesar entre 1 byte y 15 MB.', undefined, correlationId)
    }
    if (!MIME_PERMITIDOS.has(archivo.type)) {
      return errorResponse(400, 'ARCHIVO_INVALIDO', 'Solo se aceptan PDF, JPG o PNG.', undefined, correlationId)
    }

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `subir_evidencia_auditoria:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // Lectura RLS-scoped: resuelve el tenant desde el hallazgo mismo — nunca
    // se confía en un tenant_id enviado por el cliente. Un hallazgo ajeno o
    // inexistente simplemente no aparece aquí (RLS lo filtra).
    const { data: hallazgo, error: errorHallazgo } = await ctx.supabase
      .from('auditoria_hallazgos')
      .select('id, tenant_id')
      .eq('id', hallazgoIdRaw)
      .maybeSingle()
    if (errorHallazgo) {
      return errorResponse(500, 'INTERNAL_ERROR', errorHallazgo.message, undefined, correlationId)
    }
    if (!hallazgo) {
      return errorResponse(404, 'HALLAZGO_NO_ENCONTRADO', 'El hallazgo no existe o no es accesible.', undefined, correlationId)
    }
    const tenantId = hallazgo.tenant_id

    // auditoria_evidencias solo admite INSERT de auditor/administrador
    // (20260912100000) — un auxiliar puede VER un hallazgo que tiene
    // asignado como responsable, pero no adjuntarle evidencia.
    const { data: puedeEscribir, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: tenantId,
      p_roles: ['auditor', 'administrador'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!puedeEscribir) {
      return errorResponse(403, 'FORBIDDEN', 'Solo auditor o administrador pueden adjuntar evidencia.', undefined, correlationId)
    }

    // Integridad de la evidencia (§34, §70): el hash se calcula aquí, nunca
    // se confía en uno enviado por el cliente.
    const hash = await calcularHashSha256(archivo)
    const nombreSaneado = sanearNombreArchivo(archivo.name)
    const storagePath = `${tenantId}/${hallazgoIdRaw}/${hash}_${nombreSaneado}`

    // Único uso de service_role: ni el bucket ni auditoria_evidencias tienen
    // política de escritura para `authenticated` (ver cabecera de la
    // migración 20260915100000). El rol ya se verificó arriba.
    const { error: errorUpload } = await ctx.supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, archivo, { contentType: archivo.type, upsert: false })
    if (errorUpload) {
      // storagePath es determinístico (tenant+hallazgo+hash+nombre): el mismo
      // archivo ya adjuntado a este hallazgo choca aquí, no en el unique
      // constraint del insert (que nunca llega a ejecutarse).
      if ('statusCode' in errorUpload && errorUpload.statusCode === '409') {
        return errorResponse(
          409,
          'EVIDENCIA_DUPLICADA',
          'Este archivo ya fue adjuntado como evidencia de este hallazgo.',
          undefined,
          correlationId,
        )
      }
      logEvent({
        level: 'error',
        action: 'subir_evidencia_auditoria.storage_fallido',
        correlationId,
        actorId,
        tenantId,
        message: errorUpload.message,
      })
      return errorResponse(500, 'INTERNAL_ERROR', errorUpload.message, undefined, correlationId)
    }

    const { data: evidencia, error: errorInsert } = await ctx.supabaseAdmin
      .from('auditoria_evidencias')
      .insert({
        tenant_id: tenantId,
        hallazgo_id: hallazgoIdRaw,
        tipo: tipoRaw,
        usuario_id: actorId,
        origen: typeof origenRaw === 'string' && origenRaw.trim().length > 0 ? origenRaw.trim() : null,
        archivo_path: storagePath,
        hash,
        descripcion:
          typeof descripcionRaw === 'string' && descripcionRaw.trim().length > 0 ? descripcionRaw.trim() : null,
      })
      .select()
      .single()
    if (errorInsert) {
      // Rollback del objeto: sin esto quedaría un archivo huérfano en
      // Storage sin fila que lo referencie.
      await ctx.supabaseAdmin.storage.from(BUCKET).remove([storagePath])
      // unique(tenant_id, hallazgo_id, hash) — el mismo archivo ya fue
      // adjuntado a este hallazgo (23505 = unique_violation).
      if (errorInsert.code === '23505') {
        return errorResponse(
          409,
          'EVIDENCIA_DUPLICADA',
          'Este archivo ya fue adjuntado como evidencia de este hallazgo.',
          undefined,
          correlationId,
        )
      }
      logEvent({
        level: 'error',
        action: 'subir_evidencia_auditoria.insert_fallido',
        correlationId,
        actorId,
        tenantId,
        message: errorInsert.message,
      })
      return errorResponse(500, 'INTERNAL_ERROR', errorInsert.message, undefined, correlationId)
    }

    logEvent({
      level: 'info',
      action: 'subir_evidencia_auditoria.completada',
      correlationId,
      actorId,
      tenantId,
      meta: { evidenciaId: evidencia.id, hallazgoId: hallazgoIdRaw, tamanoBytes: archivo.size },
    })

    return jsonResponse(evidencia, 200, correlationId)
  }),
}
