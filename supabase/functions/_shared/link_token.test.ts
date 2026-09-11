// Cobertura de _shared/link_token.ts (D-27) — corre con `deno test`, no con
// Vitest (usa Web Crypto del runtime de Deno, mismo criterio que
// tokens.test.ts). El token es determinista (HMAC de {id, exp}), así que los
// casos son exactamente los que rompe un atacante: reutilizar un token de
// otro documento, alterar la expiración, cortar/cambiar la firma y el
// vencimiento real.
//
// La clave se deriva del service_role cuando ESTADO_CUENTA_LINK_SECRET no
// está — en tests esa variable puede existir o no; lo que importa aquí es
// que firmar y verificar usen LA MISMA clave dentro del proceso, cosa que
// el cacheo garantiza.
import { assertEquals } from 'jsr:@std/assert@^1'
import { firmarTokenEnlace, sha256HexPublico, verificarTokenEnlace } from './link_token.ts'

const ID = '11111111-2222-3333-4444-555555555555'
// Material fijo inyectado - los tests corren sin permisos de entorno.
const CLAVE = 'material-de-prueba-fijo'


Deno.test('firmar/verificar: roundtrip válido dentro de la vigencia', async () => {
  const token = await firmarTokenEnlace(ID, 30, CLAVE)
  assertEquals(await verificarTokenEnlace(token, ID, CLAVE), 'valido')
})

Deno.test('verificar: un token válido para otro id NO sirve (id editado en la URL)', async () => {
  const token = await firmarTokenEnlace(ID, 30, CLAVE)
  const otroId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  assertEquals(await verificarTokenEnlace(token, otroId, CLAVE), 'invalido')
})

Deno.test('verificar: firma alterada → inválido', async () => {
  const token = await firmarTokenEnlace(ID, 30, CLAVE)
  const partes = token.split('.')
  // Bug de este test corregido en MANT-11: comparar `slice(0, -1)` (todo menos el último char,
  // ~63 caracteres) contra `'0'` (un solo char) nunca era true — la rama "ya es 0" jamás se
  // tomaba, así que si el ÚLTIMO carácter real ya era '0', "reemplazarlo por 0" no alteraba nada
  // y el test pasaba sin haber probado lo que dice probar (~1/16 de las corridas, al azar del
  // HMAC). Comparar el último carácter, no el prefijo.
  const ultimo = partes[2]!.at(-1)
  const alterado = ultimo === '0' ? '1' : '0'
  const firmaAlterada = partes[2]!.slice(0, -1) + alterado
  assertEquals(
    await verificarTokenEnlace(`${partes[0]}.${partes[1]}.${firmaAlterada}`, ID, CLAVE),
    'invalido',
  )
})

Deno.test('verificar: expiración manipulada hacia el futuro → inválido (rompe la firma)', async () => {
  const token = await firmarTokenEnlace(ID, 30, CLAVE)
  const [, , firma] = token.split('.')
  // Extender la vigencia cambiando exp invalida la firma — es el ataque
  // "vivir para siempre" que justificaba reemplazar el UUID puro de 90 días.
  const expFuturo = Math.floor(Date.now() / 1000) + 365 * 24 * 3600
  assertEquals(await verificarTokenEnlace(`v1.${expFuturo}.${firma}`, ID, CLAVE), 'invalido')
})

Deno.test('verificar: vencido real → vencido', async () => {
  // Vigencia negativa = expirado al instante.
  const token = await firmarTokenEnlace(ID, -1, CLAVE)
  assertEquals(await verificarTokenEnlace(token, ID, CLAVE), 'vencido')
})

Deno.test('verificar: basura / formato ajeno → inválido sin lanzar', async () => {
  assertEquals(await verificarTokenEnlace('', ID, CLAVE), 'invalido')
  assertEquals(await verificarTokenEnlace('v1.no-es-numero.abc', ID, CLAVE), 'invalido')
  assertEquals(await verificarTokenEnlace('v9.9999999999.abc', ID, CLAVE), 'invalido')
  assertEquals(await verificarTokenEnlace('solo-un-string', ID, CLAVE), 'invalido')
})

Deno.test('firmar: vigencias distintas producen exp distinto (y por tanto firma distinta)', async () => {
  // 30 vs 29 días garantiza exp separados por 86400s — determinista, sin
  // depender del reloj entre dos llamadas.
  const a = await firmarTokenEnlace(ID, 30, CLAVE)
  const b = await firmarTokenEnlace(ID, 29, CLAVE)
  const [, expA] = a.split('.')
  const [, expB] = b.split('.')
  assertEquals(Number(expA) - Number(expB), 24 * 3600)
})

Deno.test('firmar: vigencia fraccionaria (horas, MANT-11) produce un exp entero y verificable', async () => {
  // Regresión: antes de MANT-11 (2026-09-09), exp = floor(now/1000) + vigenciaDias*24*3600 sin
  // redondear — con vigenciaDias fraccionario (p. ej. 6 horas = 0.25 días) el resultado casi
  // siempre tiene decimales, y verificarTokenEnlace() exige Number.isInteger(exp). Los 3
  // llamadores previos a MANT-11 (ver-estado-cuenta, generar-enlace-*, generar-qr-activo) solo
  // pasaban días enteros, así que nunca lo disparaban — un QR de vigencia corta (horas) quedaba
  // siempre 'invalido'.
  const seisHorasEnDias = 6 / 24
  const token = await firmarTokenEnlace(ID, seisHorasEnDias, CLAVE)
  const [, expTexto] = token.split('.')
  assertEquals(Number.isInteger(Number(expTexto)), true)
  assertEquals(await verificarTokenEnlace(token, ID, CLAVE), 'valido')
})

Deno.test('sha256HexPublico: hash conocido para cadena vacía', async () => {
  assertEquals(
    await sha256HexPublico(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  )
})
