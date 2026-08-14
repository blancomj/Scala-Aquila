// E7 · cobertura de _shared/*.ts (PROMPT_MAESTRO_FASE1.md §12.3) — corre con
// `deno test`, no con Vitest (estos módulos usan Web Crypto y solo se
// ejecutan en el runtime de Deno).
import { assertEquals, assertMatch, assertNotEquals } from 'jsr:@std/assert@^1'
import { generarToken, hashToken } from './tokens.ts'

Deno.test('generarToken(): produce 64 caracteres hex (32 bytes), aleatorio', () => {
  const uno = generarToken()
  const dos = generarToken()

  assertMatch(uno, /^[0-9a-f]{64}$/)
  assertNotEquals(uno, dos)
})

Deno.test('hashToken(): sha256 hex de 64 caracteres, determinista', async () => {
  const hash1 = await hashToken('mismo-token')
  const hash2 = await hashToken('mismo-token')
  const hashOtro = await hashToken('otro-token')

  assertMatch(hash1, /^[0-9a-f]{64}$/)
  assertEquals(hash1, hash2)
  assertNotEquals(hash1, hashOtro)
})

Deno.test('hashToken(): coincide con el hash sha256 conocido de una cadena vacía', async () => {
  const hash = await hashToken('')
  assertEquals(hash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
})
