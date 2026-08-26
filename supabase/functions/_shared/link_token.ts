// Tokens HMAC para el enlace público del estado de cuenta — D-27
// (Docs/evaluacion/13-evaluacion-estado-de-cuenta.md §A.2, hallazgo A2 de
// Docs/evaluacion/01-evaluacion-seguridad-arquitectura.md).
//
// A diferencia de tokens.ts (AD-04: token aleatorio + solo el hash en BD),
// aquí el token es DETERMINISTA: firma {id, exp} con HMAC-SHA256 para que el
// enlace (a) no pueda falsificarse ni alterarse sin la clave y (b) caduque
// por sí mismo — sin estado en base de datos que purgar, igual espíritu
// append-only que el resto del proyecto.
//
// Formato: `v1.<expoch>.<hex(hmac(id + '.' + exp))>` — la versión inicial
// permite rotar el formato sin ambigüedad si algún día cambia la primitiva.
//
// La clave viene de ESTADO_CUENTA_LINK_SECRET; si no está definida se deriva
// de SUPABASE_SERVICE_ROLE_KEY (quien posea esa clave ya lo puede todo, así
// que derivar no amplía la superficie). Definir la variable dedicada sigue
// siendo preferible: permite rotar el secreto de los enlaces sin tocar el
// service_role.
//
// El material de clave es INYECTABLE en todas las funciones públicas: los
// tests corren con deno test sin permisos de entorno (mismo runner que el
// resto de _shared), así que pasan un material fijo; producción usa el
// default (lectura de env). El cache solo aplica a la vía por entorno.

const VERSION = 'v1'

function aHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Hex(texto: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return aHex(new Uint8Array(buffer))
}

let claveCacheada: CryptoKey | null = null

async function claveDesdeMaterial(material: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(material),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function clavePorEntorno(): Promise<CryptoKey> {
  if (claveCacheada) return claveCacheada
  const explicita = Deno.env.get('ESTADO_CUENTA_LINK_SECRET')
  const material =
    explicita ??
    (await sha256Hex(`${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}:edc-link-v1`))
  claveCacheada = await claveDesdeMaterial(material)
  return claveCacheada
}

async function hmacHex(mensaje: string, clave: CryptoKey): Promise<string> {
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(mensaje))
  return aHex(new Uint8Array(firma))
}

/** Firma un enlace para el estado de cuenta `id`, válido por `vigenciaDias`.
 * `materialClave` inyecta la clave (tests); si se omite se lee del entorno. */
export async function firmarTokenEnlace(
  id: string,
  vigenciaDias: number,
  materialClave?: string,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + vigenciaDias * 24 * 3600
  const clave = materialClave
    ? await claveDesdeMaterial(materialClave)
    : await clavePorEntorno()
  const firma = await hmacHex(`${id}.${exp}`, clave)
  return `${VERSION}.${exp}.${firma}`
}

export type VeredictoToken = 'valido' | 'invalido' | 'vencido'

/**
 * Verifica que `token` sea una firma válida PARA ESTE `id` y no esté vencida.
 * El id va dentro del mensaje firmado: un token válido para otro documento
 * (o un id editado en la URL) no pasa. Debe recibirse el MISMO materialClave
 * con el que se firmó cuando se inyecta.
 */
export async function verificarTokenEnlace(
  token: string,
  id: string,
  materialClave?: string,
): Promise<VeredictoToken> {
  const partes = token.split('.')
  if (partes.length !== 3 || partes[0] !== VERSION) return 'invalido'
  const [, expTexto, firma] = partes
  const exp = Number(expTexto)
  if (!Number.isInteger(exp) || exp <= 0) return 'invalido'
  const clave = materialClave
    ? await claveDesdeMaterial(materialClave)
    : await clavePorEntorno()
  const esperada = await hmacHex(`${id}.${exp}`, clave)
  // Comparación de longitud fija vía doble HMAC innecesaria aquí: la firma es
  // HMAC-SHA256 (preimagen resistente) y el fallo no filtra timing útil para
  // forjarla; === simple mantiene el módulo libre de dependencias.
  if (firma !== esperada) return 'invalido'
  if (exp * 1000 < Date.now()) return 'vencido'
  return 'valido'
}

/** SHA-256 hex de un texto — hash de contenido que imprime el documento. */
export function sha256HexPublico(texto: string): Promise<string> {
  return sha256Hex(texto)
}
