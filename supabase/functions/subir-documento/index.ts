// Cierra el gap §8.1 de PROMPT_FICHA_INMUEBLE.md: documentos (antes
// documentos_inmueble) no tiene política INSERT para `authenticated` (mismo criterio que
// pagos/liquidaciones — calcular la siguiente versión bajo concurrencia
// necesita coordinación con Storage) y el bucket tampoco tenía política de
// escritura para el mismo rol. Esta función es el único punto de escritura:
// sube el objeto y luego inserta la fila con ctx.supabaseAdmin, igual que
// registrar-pago/index.ts. Si el insert falla después de subir el objeto,
// se borra el objeto para no dejar un archivo huérfano en Storage.
//
// Body: multipart/form-data (no JSON) — es la única función del proyecto
// que recibe un archivo, por eso no usa el payloadSchema con zod del resto:
// los campos de FormData son todos string | File, se validan a mano.
import { withSupabase } from '@supabase/server'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 20
const RATE_LIMIT_VENTANA = '1 hour'

const BUCKET = 'documentos-inmueble'
const TAMANO_MAXIMO_BYTES = 15 * 1024 * 1024 // 15 MB — mismo límite que el bucket (migración) y el dropzone.
const MIME_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

function sanearNombreArchivo(nombre: string): string {
  const limpio = nombre.replace(/[^\w.\-]+/g, '_').slice(-150)
  return limpio.length > 0 ? limpio : 'documento'
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

    const inmuebleIdRaw = form.get('inmueble_id')
    const tenantIdRaw = form.get('tenant_id')
    const tipoDocumentoIdRaw = form.get('tipo_documento_id')
    const fechaVencimiento = form.get('fecha_vencimiento')
    const descripcionRaw = form.get('descripcion')
    const pagoIdRaw = form.get('pago_id')
    const casoJuridicoIdRaw = form.get('caso_juridico_id')
    const envioIdRaw = form.get('envio_id')
    const publicacionIdRaw = form.get('publicacion_id')
    const archivo = form.get('archivo')

    // inmueble_id ausente/vacío = documento de la copropiedad misma (tenant_id
    // explícito en su lugar) — generalización de documentos_inmueble →
    // documentos (20260822130000), resuelve la mitad "Documentos" del gap
    // §8.1 de PROMPT_FICHA_COPROPIEDAD.md.
    const inmuebleId = typeof inmuebleIdRaw === 'string' && inmuebleIdRaw.length > 0 ? inmuebleIdRaw : null
    if (inmuebleId !== null && !UUID_RE.test(inmuebleId)) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'inmueble_id debe ser un uuid válido.',
        undefined,
        correlationId,
      )
    }
    // caso_juridico_id — nullable, mismo criterio que inmueble_id (CAR §15.4,
    // GAP-CAR-007): un documento puede pertenecer al expediente de un caso
    // jurídico en vez de (o además de) un inmueble/la copropiedad. Si viene
    // y no hay inmueble_id, resuelve el tenant igual que inmueble_id lo hace
    // — nunca se confía en un tenant_id enviado por el cliente cuando sí hay
    // caso_juridico_id (ver resolución de tenantId más abajo).
    const casoJuridicoId =
      typeof casoJuridicoIdRaw === 'string' && casoJuridicoIdRaw.length > 0 ? casoJuridicoIdRaw : null
    if (casoJuridicoId !== null && !UUID_RE.test(casoJuridicoId)) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'caso_juridico_id debe ser un uuid válido.',
        undefined,
        correlationId,
      )
    }
    // envio_id — PRQ-CAR-022 (CAR §24.1): un documento puede evidenciar un
    // envío puntual de cobranza (constancia de entrega, acuse firmado del
    // canal físico) — distinto de acciones_cobranza_acuses.documento_id,
    // que cuelga del ACUSE (el evento), no del envío (el intento). Mismo
    // criterio de resolución de tenant que inmueble_id/caso_juridico_id.
    const envioId = typeof envioIdRaw === 'string' && envioIdRaw.length > 0 ? envioIdRaw : null
    if (envioId !== null && !UUID_RE.test(envioId)) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'envio_id debe ser un uuid válido.', undefined, correlationId)
    }
    // publicacion_id — EXS-6: las fotos de un aviso del marketplace. Mismo
    // criterio de resolución de tenant que los anteriores.
    const publicacionId =
      typeof publicacionIdRaw === 'string' && publicacionIdRaw.length > 0 ? publicacionIdRaw : null
    if (publicacionId !== null && !UUID_RE.test(publicacionId)) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'publicacion_id debe ser un uuid válido.',
        undefined,
        correlationId,
      )
    }
    if (
      inmuebleId === null &&
      casoJuridicoId === null &&
      envioId === null &&
      publicacionId === null &&
      (typeof tenantIdRaw !== 'string' || !UUID_RE.test(tenantIdRaw))
    ) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'tenant_id debe ser un uuid válido cuando no se envía inmueble_id, caso_juridico_id, envio_id ni publicacion_id.',
        undefined,
        correlationId,
      )
    }
    const tipoDocumentoId = Number(tipoDocumentoIdRaw)
    if (typeof tipoDocumentoIdRaw !== 'string' || !Number.isInteger(tipoDocumentoId)) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'tipo_documento_id debe ser un entero.',
        undefined,
        correlationId,
      )
    }
    if (fechaVencimiento !== null && typeof fechaVencimiento !== 'string') {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'fecha_vencimiento debe ser texto.',
        undefined,
        correlationId,
      )
    }
    if (
      typeof fechaVencimiento === 'string' &&
      fechaVencimiento.length > 0 &&
      !FECHA_RE.test(fechaVencimiento)
    ) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'fecha_vencimiento debe ser YYYY-MM-DD.',
        undefined,
        correlationId,
      )
    }
    if (descripcionRaw !== null && typeof descripcionRaw !== 'string') {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'descripcion debe ser texto.',
        undefined,
        correlationId,
      )
    }
    const pagoId = typeof pagoIdRaw === 'string' && pagoIdRaw.length > 0 ? pagoIdRaw : null
    if (pagoId !== null && !UUID_RE.test(pagoId)) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'pago_id debe ser un uuid válido.', undefined, correlationId)
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
      return errorResponse(
        400,
        'ARCHIVO_INVALIDO',
        'El archivo debe pesar entre 1 byte y 15 MB.',
        undefined,
        correlationId,
      )
    }
    if (!MIME_PERMITIDOS.has(archivo.type)) {
      return errorResponse(
        400,
        'ARCHIVO_INVALIDO',
        'Solo se aceptan PDF, JPG o PNG.',
        undefined,
        correlationId,
      )
    }

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `subir_documento:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // Lectura RLS-scoped: solo resuelve el inmueble si el usuario es miembro
    // de ese tenant — nunca se confía en un tenant_id enviado por el cliente
    // cuando sí hay inmueble_id. Para un documento de la copropiedad misma
    // (inmueble_id null) no hay tabla que resolver: el tenant_id sí viene del
    // cliente, pero has_role() abajo lo verifica contra la membresía real del
    // actor — un tenant_id ajeno simplemente falla ahí, igual que un
    // inmueble_id ajeno fallaría en el maybeSingle() de abajo.
    let tenantId: string
    if (inmuebleId !== null) {
      const { data: inmueble, error: errorInmueble } = await ctx.supabase
        .from('inmuebles')
        .select('id, tenant_id')
        .eq('id', inmuebleId)
        .maybeSingle()
      if (errorInmueble) {
        return errorResponse(500, 'INTERNAL_ERROR', errorInmueble.message, undefined, correlationId)
      }
      if (!inmueble) {
        return errorResponse(
          404,
          'INMUEBLE_NO_ENCONTRADO',
          'El inmueble no existe o no es accesible.',
          undefined,
          correlationId,
        )
      }
      tenantId = inmueble.tenant_id
    } else if (casoJuridicoId !== null) {
      const { data: caso, error: errorCaso } = await ctx.supabase
        .from('casos_juridicos')
        .select('id, tenant_id')
        .eq('id', casoJuridicoId)
        .maybeSingle()
      if (errorCaso) {
        return errorResponse(500, 'INTERNAL_ERROR', errorCaso.message, undefined, correlationId)
      }
      if (!caso) {
        return errorResponse(
          404,
          'CASO_JURIDICO_NO_ENCONTRADO',
          'El caso jurídico no existe o no es accesible.',
          undefined,
          correlationId,
        )
      }
      tenantId = caso.tenant_id
    } else if (envioId !== null) {
      const { data: envio, error: errorEnvio } = await ctx.supabase
        .from('acciones_cobranza_envios')
        .select('id, tenant_id')
        .eq('id', envioId)
        .maybeSingle()
      if (errorEnvio) {
        return errorResponse(500, 'INTERNAL_ERROR', errorEnvio.message, undefined, correlationId)
      }
      if (!envio) {
        return errorResponse(
          404,
          'ENVIO_NO_ENCONTRADO',
          'El envío no existe o no es accesible.',
          undefined,
          correlationId,
        )
      }
      tenantId = envio.tenant_id
    } else if (publicacionId !== null) {
      const { data: publicacion, error: errorPublicacion } = await ctx.supabase
        .from('publicaciones')
        .select('id, tenant_id')
        .eq('id', publicacionId)
        .maybeSingle()
      if (errorPublicacion) {
        return errorResponse(500, 'INTERNAL_ERROR', errorPublicacion.message, undefined, correlationId)
      }
      if (!publicacion) {
        return errorResponse(
          404,
          'PUBLICACION_NO_ENCONTRADA',
          'La publicación no existe o no es accesible.',
          undefined,
          correlationId,
        )
      }
      tenantId = publicacion.tenant_id
    } else {
      tenantId = tenantIdRaw as string
    }

    // pago_id — RC-7: el comprobante que se adjunta al registrar un pago
    // (foto del recibo físico, comprobante bancario). RLS-scoped, mismo
    // criterio que inmuebleId arriba: un pago ajeno simplemente no aparece.
    if (pagoId !== null) {
      const { data: pago, error: errorPago } = await ctx.supabase
        .from('pagos')
        .select('id, tenant_id')
        .eq('id', pagoId)
        .maybeSingle()
      if (errorPago) {
        return errorResponse(500, 'INTERNAL_ERROR', errorPago.message, undefined, correlationId)
      }
      if (!pago || pago.tenant_id !== tenantId) {
        return errorResponse(
          404,
          'PAGO_NO_ENCONTRADO',
          'El pago no existe o no es accesible.',
          undefined,
          correlationId,
        )
      }
    }

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
        'Solo un auxiliar puede subir documentos.',
        undefined,
        correlationId,
      )
    }

    // RLS-scoped (respeta el aislamiento de lista_tipos: filas de plataforma
    // + propias del tenant, nunca las de otro tenant).
    const { data: tipoDocumento, error: errorTipo } = await ctx.supabase
      .from('lista_tipos')
      .select('id')
      .eq('id', tipoDocumentoId)
      .eq('tipo', 'TIPO_DOCUMENTO')
      .maybeSingle()
    if (errorTipo) {
      return errorResponse(500, 'INTERNAL_ERROR', errorTipo.message, undefined, correlationId)
    }
    if (!tipoDocumento) {
      return errorResponse(
        400,
        'TIPO_DOCUMENTO_INVALIDO',
        'tipo_documento_id no corresponde a un tipo de documento válido.',
        undefined,
        correlationId,
      )
    }

    // Versionado: si ya existe un documento vigente del mismo tipo en este
    // alcance (mismo tenant/inmueble), esta subida lo "reemplaza" — mismo
    // grupo_id, version+1 (ver comentario de la tabla en
    // 20260820100300_documentos_inmueble.sql). RLS-scoped: solo ve
    // documentos del propio tenant, ya verificado como miembro arriba.
    //
    // Con pago_id: el alcance también se acota a ESE pago — cada pago es su
    // propio evento, así que el comprobante de un pago nuevo nunca debe
    // "reemplazar" el de un pago anterior solo por compartir tipo/inmueble.
    // Como pago_id es único por pago, esto siempre resuelve en version=1.
    let consultaVigente = ctx.supabase
      .from('v_documento_vigente')
      .select('grupo_id, version')
      .eq('tenant_id', tenantId)
      .eq('tipo_documento_id', tipoDocumentoId)
    consultaVigente =
      inmuebleId === null ? consultaVigente.is('inmueble_id', null) : consultaVigente.eq('inmueble_id', inmuebleId)
    consultaVigente = pagoId === null ? consultaVigente.is('pago_id', null) : consultaVigente.eq('pago_id', pagoId)
    consultaVigente =
      casoJuridicoId === null
        ? consultaVigente.is('caso_juridico_id', null)
        : consultaVigente.eq('caso_juridico_id', casoJuridicoId)
    consultaVigente = envioId === null ? consultaVigente.is('envio_id', null) : consultaVigente.eq('envio_id', envioId)
    consultaVigente =
      publicacionId === null
        ? consultaVigente.is('publicacion_id', null)
        : consultaVigente.eq('publicacion_id', publicacionId)

    // EXS-6 · las fotos de un aviso NO se versionan entre sí.
    //
    //  El versionado de esta función agrupa por (tenant, tipo, alcance) y
    //  asume que ese alcance identifica UN documento: la escritura de
    //  propiedad del inmueble 501, el comprobante del pago X. Con pago_id
    //  eso siempre resuelve en version=1 porque un pago tiene un
    //  comprobante — y el comentario de arriba lo dice explícitamente.
    //
    //  Una publicación, en cambio, tiene VARIAS fotos, y todas comparten
    //  tipo y publicacion_id. Si se agruparan, la segunda foto sería la
    //  "version 2" de la primera y v_documento_vigente mostraría una sola:
    //  subir la foto del respaldo borraría de la galería la del frente.
    //  Cada foto es un documento propio, no la corrección de otra.
    let vigente: { grupo_id: string; version: number } | null = null
    if (publicacionId === null) {
      const { data, error: errorVigente } = await consultaVigente.maybeSingle()
      if (errorVigente) {
        return errorResponse(500, 'INTERNAL_ERROR', errorVigente.message, undefined, correlationId)
      }
      vigente = data
    }

    const grupoId = vigente?.grupo_id ?? crypto.randomUUID()
    const version = (vigente?.version ?? 0) + 1
    const nombreSaneado = sanearNombreArchivo(archivo.name)
    const carpetaAlcance =
      inmuebleId ??
      (casoJuridicoId !== null
        ? `_caso-juridico/${casoJuridicoId}`
        : envioId !== null
          ? `_envio/${envioId}`
          : publicacionId !== null
            ? `_publicacion/${publicacionId}`
            : '_copropiedad')
    const storagePath = `${tenantId}/${carpetaAlcance}/${grupoId}/${version}_${nombreSaneado}`

    // Único uso de service_role: ni el bucket ni documentos (antes
    // documentos_inmueble, generalizada en 20260822130000) tienen política
    // de escritura para `authenticated` (ver cabecera). El rol ya se
    // verificó arriba, así que este bypass de RLS es intencional y acotado.
    const { error: errorUpload } = await ctx.supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, archivo, { contentType: archivo.type, upsert: false })
    if (errorUpload) {
      logEvent({
        level: 'error',
        action: 'subir_documento.storage_fallido',
        correlationId,
        actorId,
        tenantId,
        message: errorUpload.message,
      })
      return errorResponse(500, 'INTERNAL_ERROR', errorUpload.message, undefined, correlationId)
    }

    const { data: documento, error: errorInsert } = await ctx.supabaseAdmin
      .from('documentos')
      .insert({
        tenant_id: tenantId,
        inmueble_id: inmuebleId,
        pago_id: pagoId,
        caso_juridico_id: casoJuridicoId,
        envio_id: envioId,
        publicacion_id: publicacionId,
        tipo_documento_id: tipoDocumentoId,
        grupo_id: grupoId,
        version,
        nombre_archivo: archivo.name,
        storage_path: storagePath,
        tamano_bytes: archivo.size,
        fecha_vencimiento:
          typeof fechaVencimiento === 'string' && fechaVencimiento.length > 0
            ? fechaVencimiento
            : null,
        descripcion:
          typeof descripcionRaw === 'string' && descripcionRaw.trim().length > 0
            ? descripcionRaw.trim()
            : null,
        subido_por: actorId,
      })
      .select()
      .single()
    if (errorInsert) {
      // Rollback del objeto: sin esto quedaría un archivo huérfano en
      // Storage sin fila que lo referencie ni política de lectura efectiva.
      await ctx.supabaseAdmin.storage.from(BUCKET).remove([storagePath])
      logEvent({
        level: 'error',
        action: 'subir_documento.insert_fallido',
        correlationId,
        actorId,
        tenantId,
        message: errorInsert.message,
      })
      return errorResponse(500, 'INTERNAL_ERROR', errorInsert.message, undefined, correlationId)
    }

    logEvent({
      level: 'info',
      action: 'subir_documento.completada',
      correlationId,
      actorId,
      tenantId,
      meta: { documentoId: documento.id, tamanoBytes: archivo.size },
    })

    return jsonResponse(documento, 200, correlationId)
  }),
}
