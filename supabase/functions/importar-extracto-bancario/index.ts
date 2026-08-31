// Importación de extracto bancario — Fase 3, Bloque B (§5.3).
// Sigue el patrón de subir-documento/index.ts: única función del repo (junto
// a subir-documento) que recibe multipart/form-data en vez de JSON, sube a
// Storage y borra el objeto huérfano si la inserción en base falla.
//
// extracto_bancario/extracto_linea no tienen política de INSERT para
// `authenticated` (20260904170000, mismo criterio que pagos) — el rol se
// verifica aquí explícitamente antes de usar ctx.supabaseAdmin, igual que
// subir-documento/index.ts y registrar-pago/index.ts.
//
// LA REGLA DE ORO (§E.5, §3 del prompt): esta función nunca hace un INSERT
// propio en `pagos` — importarExtracto() (liquidation-engine) usa
// registrarPago() para cualquier línea que auto-concilie.
import { withSupabase } from '@supabase/server'
// Módulos concretos, NUNCA el barrel dist/index.js: conciliacion-supabase.js
// (y conciliacion-matching.js, del que depende) ya no viven en el barrel a
// propósito (ver cabecera de packages/liquidation-engine/src/index.ts,
// CAR_08 §4) — esta función sí necesita "@aquila/payment-gateways" (ya
// mapeado en su deno.json), así que importa directo. hashArchivo no
// depende de eso (conciliacion-parsers.js no importa payment-gateways),
// pero se importa igual de forma directa por consistencia.
import { ArchivoNoReconocidoError, importarExtracto } from '../../../packages/liquidation-engine/dist/conciliacion-supabase.js'
import { hashArchivo } from '../../../packages/liquidation-engine/dist/conciliacion-parsers.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 10
const RATE_LIMIT_VENTANA = '1 hour'

const BUCKET = 'extractos-bancarios'
const TAMANO_MAXIMO_BYTES = 15 * 1024 * 1024
// Solo CSV por ahora: los parsers (conciliacion-parsers.ts) solo saben leer
// texto delimitado. .xlsx queda en el allowlist del bucket para cuando haya
// un parser que lo soporte, pero esta función lo rechaza explícito en vez de
// fallar tarde con un mensaje confuso.
const MIME_PERMITIDOS = new Set(['text/csv', 'application/vnd.ms-excel'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sanearNombreArchivo(nombre: string): string {
  const limpio = nombre.replace(/[^\w.\-]+/g, '_').slice(-150)
  return limpio.length > 0 ? limpio : 'extracto'
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

    const tenantIdRaw = form.get('tenant_id')
    const cuentaBancariaIdRaw = form.get('cuenta_bancaria_id')
    const archivo = form.get('archivo')

    if (typeof tenantIdRaw !== 'string' || !UUID_RE.test(tenantIdRaw)) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'tenant_id inválido.', undefined, correlationId)
    }
    const tenantId = tenantIdRaw

    let cuentaBancariaId: string | null = null
    if (typeof cuentaBancariaIdRaw === 'string' && cuentaBancariaIdRaw.length > 0) {
      if (!UUID_RE.test(cuentaBancariaIdRaw)) {
        return errorResponse(400, 'INVALID_PAYLOAD', 'cuenta_bancaria_id inválido.', undefined, correlationId)
      }
      cuentaBancariaId = cuentaBancariaIdRaw
    }

    if (!(archivo instanceof File)) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Falta el archivo.', undefined, correlationId)
    }
    if (archivo.size === 0) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'El archivo está vacío.', undefined, correlationId)
    }
    if (archivo.size > TAMANO_MAXIMO_BYTES) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'El archivo excede 15 MB.', undefined, correlationId)
    }
    if (!MIME_PERMITIDOS.has(archivo.type)) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        `Tipo de archivo no soportado: ${archivo.type}. Hoy solo CSV.`,
        undefined,
        correlationId,
      )
    }

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `importar_extracto:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: esAgent, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: tenantId,
      p_roles: ['auxiliar'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!esAgent) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un auxiliar o administrador puede importar un extracto bancario.',
        undefined,
        correlationId,
      )
    }

    const contenidoCrudo = await archivo.text()

    // Reimportar el mismo archivo no debe crear un objeto nuevo en Storage,
    // aunque la fila se deduplique: se comprueba el hash ANTES de subir.
    const { data: yaImportado } = await ctx.supabaseAdmin
      .from('extracto_bancario')
      .select('id, lineas_totales')
      .eq('tenant_id', tenantId)
      .eq('hash_archivo', hashArchivo(contenidoCrudo))
      .maybeSingle()
    if (yaImportado) {
      return jsonResponse(
        {
          extractoId: yaImportado.id,
          lineasTotales: yaImportado.lineas_totales,
          lineasNuevas: 0,
          lineasYaExistian: yaImportado.lineas_totales,
          autoConciliadas: 0,
          propuestas: 0,
          sinCandidato: 0,
          noEsPago: 0,
        },
        200,
        correlationId,
      )
    }

    const nombreSaneado = sanearNombreArchivo(archivo.name)
    const storagePath = `${tenantId}/${crypto.randomUUID()}_${nombreSaneado}`

    // Único uso de service_role: extracto_bancario/extracto_linea no tienen
    // política de INSERT para authenticated (ver cabecera). El rol ya se
    // verificó arriba.
    const { error: errorUpload } = await ctx.supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, archivo, { contentType: archivo.type, upsert: false })
    if (errorUpload) {
      logEvent({
        level: 'error',
        action: 'importar_extracto.storage_fallido',
        correlationId,
        actorId,
        tenantId,
        message: errorUpload.message,
      })
      return errorResponse(500, 'INTERNAL_ERROR', errorUpload.message, undefined, correlationId)
    }

    try {
      const resumen = await importarExtracto(ctx.supabaseAdmin, {
        tenantId,
        cuentaBancariaId,
        nombreArchivo: archivo.name,
        contenidoCrudo,
        storagePath,
        importadoPor: actorId,
      })

      logEvent({
        level: 'info',
        action: 'importar_extracto.completado',
        correlationId,
        actorId,
        tenantId,
        meta: { ...resumen },
      })

      return jsonResponse(resumen, 200, correlationId)
    } catch (excepcion) {
      // Rollback del objeto: sin esto quedaría un archivo huérfano en
      // Storage sin fila que lo referencie.
      await ctx.supabaseAdmin.storage.from(BUCKET).remove([storagePath])

      if (excepcion instanceof ArchivoNoReconocidoError) {
        return errorResponse(
          422,
          'CONCILIACION_ARCHIVO_NO_RECONOCIDO',
          excepcion.message,
          undefined,
          correlationId,
        )
      }

      const mensaje = excepcion instanceof Error ? excepcion.message : 'No se pudo importar el extracto.'
      logEvent({
        level: 'error',
        action: 'importar_extracto.fallido',
        correlationId,
        actorId,
        tenantId,
        message: mensaje,
      })
      return errorResponse(500, 'INTERNAL_ERROR', mensaje, undefined, correlationId)
    }
  }),
}
