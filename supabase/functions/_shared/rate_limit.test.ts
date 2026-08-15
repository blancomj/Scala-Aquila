import { assertEquals, assertExists } from 'jsr:@std/assert@^1'
import { enforceRateLimit } from './rate_limit.ts'

function clienteConResultado(data: boolean | null, error: { message: string } | null) {
  return {
    rpc: (_fn: 'check_rate_limit', _args: unknown) => Promise.resolve({ data, error }),
  }
}

Deno.test('enforceRateLimit(): permitido → null (no bloquea)', async () => {
  const resultado = await enforceRateLimit(
    clienteConResultado(true, null),
    'bucket-1',
    5,
    '1 hour',
    'corr-1',
  )
  assertEquals(resultado, null)
})

Deno.test('enforceRateLimit(): bloqueado → 429 RATE_LIMITED con el correlationId', async () => {
  const resultado = await enforceRateLimit(
    clienteConResultado(false, null),
    'bucket-1',
    5,
    '1 hour',
    'corr-2',
  )
  assertExists(resultado)
  assertEquals(resultado.status, 429)
  assertEquals(resultado.headers.get('X-Correlation-Id'), 'corr-2')
  const cuerpo = (await resultado.json()) as { error: { code: string } }
  assertEquals(cuerpo.error.code, 'RATE_LIMITED')
})

Deno.test('enforceRateLimit(): error de la RPC → 500 INTERNAL_ERROR', async () => {
  const resultado = await enforceRateLimit(
    clienteConResultado(null, { message: 'boom' }),
    'bucket-1',
    5,
    '1 hour',
    'corr-3',
  )
  assertExists(resultado)
  assertEquals(resultado.status, 500)
  const cuerpo = (await resultado.json()) as { error: { code: string; message: string } }
  assertEquals(cuerpo.error.code, 'INTERNAL_ERROR')
  assertEquals(cuerpo.error.message.includes('boom'), true)
})
