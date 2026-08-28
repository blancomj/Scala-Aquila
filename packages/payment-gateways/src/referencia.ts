/**
 * Referencia estructurada de una transacción de pasarela (§C.2.5 del
 * documento propietario):
 *
 *     {tenant_slug}-{codigo_inmueble}-{periodo}-{uuid_corto}
 *
 * No es cosmética: es la llave que después alimenta la conciliación bancaria,
 * donde hay que reconocer una transferencia por su referencia y nada más. Por
 * eso construir y parsear tienen que ser inversos exactos, y por eso vive
 * aquí — función pura testeable — y no incrustada en una Edge Function.
 *
 * POR QUÉ CADA SEGMENTO SE COLAPSA A ALFANUMÉRICO: el separador es `-`, y
 * tanto los slugs de tenant (`torre-a`) como los códigos de inmueble
 * (`APT-101`) pueden contenerlo. Si se conservara, `torre-a-apt-101-...` sería
 * imposible de dividir sin ambigüedad y construir/parsear dejarían de ser
 * inversos. Colapsarlos (`torrea`, `apt101`) hace que la referencia tenga
 * SIEMPRE exactamente 4 partes.
 *
 * Eso no pierde información útil: la referencia se resuelve buscándola
 * completa en `intenciones_pago` (índice único por tenant), no reconstruyendo
 * el código del inmueble a partir del texto. El parseo solo sirve para saber
 * a qué tenant preguntarle.
 */

export interface ReferenciaPago {
  readonly tenantSlug: string
  readonly codigoInmueble: string
  /** Periodo en formato AAAAMM. */
  readonly periodo: string
  readonly uuidCorto: string
}

const LARGO_UUID_CORTO = 8
const PATRON_PERIODO = /^\d{6}$/
const PATRON_UUID_CORTO = /^[0-9a-f]{8}$/
const PATRON_SEGMENTO = /^[a-z0-9]+$/

/** Minúsculas, sin acentos, y todo lo que no sea alfanumérico se elimina —
 *  incluidos los guiones, ver la nota de cabecera. */
export function normalizarSegmento(segmento: string): string {
  return segmento
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function construirReferencia(params: {
  tenantSlug: string
  codigoInmueble: string
  /** AAAAMM. */
  periodo: string
  /** uuid completo; se toman sus primeros 8 caracteres hex. */
  uuid: string
}): string {
  const tenantSlug = normalizarSegmento(params.tenantSlug)
  const codigoInmueble = normalizarSegmento(params.codigoInmueble)
  if (!tenantSlug || !codigoInmueble) {
    throw new Error(
      'Referencia inválida: el slug del tenant y el código del inmueble no pueden quedar vacíos ' +
        'tras normalizar.',
    )
  }
  if (!PATRON_PERIODO.test(params.periodo)) {
    throw new Error(`Referencia inválida: el periodo debe ser AAAAMM, se recibió "${params.periodo}".`)
  }
  const uuidCorto = params.uuid.replace(/-/g, '').slice(0, LARGO_UUID_CORTO).toLowerCase()
  if (!PATRON_UUID_CORTO.test(uuidCorto)) {
    throw new Error(`Referencia inválida: no se pudo derivar un uuid corto de "${params.uuid}".`)
  }
  return `${tenantSlug}-${codigoInmueble}-${params.periodo}-${uuidCorto}`
}

/**
 * Parsea una referencia.
 *
 * DATO HOSTIL: esto se aplica a lo que venga en el cuerpo de un webhook
 * anónimo, así que devuelve null en vez de lanzar, y su resultado sirve
 * ÚNICAMENTE para buscar la clave con la que validar la firma — nunca para
 * autorizar nada por sí solo.
 */
export function parsearReferencia(referencia: string): ReferenciaPago | null {
  const partes = referencia.split('-')
  if (partes.length !== 4) return null

  const [tenantSlug, codigoInmueble, periodo, uuidCorto] = partes as [string, string, string, string]

  if (!PATRON_SEGMENTO.test(tenantSlug) || !PATRON_SEGMENTO.test(codigoInmueble)) return null
  if (!PATRON_PERIODO.test(periodo) || !PATRON_UUID_CORTO.test(uuidCorto)) return null

  return { tenantSlug, codigoInmueble, periodo, uuidCorto }
}
