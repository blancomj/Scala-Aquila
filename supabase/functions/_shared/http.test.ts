import { assertEquals } from 'jsr:@std/assert@^1'
import { errorResponse, jsonResponse, parsearErrorRpc } from './http.ts'

Deno.test('jsonResponse(): status 200 por defecto, headers de seguridad, sin X-Correlation-Id si no se pasa', async () => {
  const res = jsonResponse({ ok: true })
  assertEquals(res.status, 200)
  assertEquals(res.headers.get('X-Content-Type-Options'), 'nosniff')
  assertEquals(res.headers.get('Cache-Control'), 'no-store')
  assertEquals(res.headers.get('X-Correlation-Id'), null)
  assertEquals(await res.json(), { ok: true })
})

Deno.test('jsonResponse(): status y correlationId explícitos', async () => {
  const res = jsonResponse({ id: 1 }, 201, 'abc-123')
  assertEquals(res.status, 201)
  assertEquals(res.headers.get('X-Correlation-Id'), 'abc-123')
})

Deno.test('errorResponse(): contrato { error: { code, message, details } }, details null por defecto', async () => {
  const res = errorResponse(400, 'INVALID_PAYLOAD', 'malo')
  assertEquals(res.status, 400)
  assertEquals(await res.json(), { error: { code: 'INVALID_PAYLOAD', message: 'malo', details: null } })
})

Deno.test('errorResponse(): con details y correlationId', async () => {
  const res = errorResponse(429, 'RATE_LIMITED', 'espera', { bucket: 'x' }, 'corr-1')
  assertEquals(res.headers.get('X-Correlation-Id'), 'corr-1')
  assertEquals(await res.json(), {
    error: { code: 'RATE_LIMITED', message: 'espera', details: { bucket: 'x' } },
  })
})

Deno.test('parsearErrorRpc(): extrae CODIGO: mensaje del formato de las RPC', () => {
  assertEquals(parsearErrorRpc('SLUG_TAKEN: ya existe una copropiedad con ese slug'), {
    code: 'SLUG_TAKEN',
    message: 'ya existe una copropiedad con ese slug',
  })
})

Deno.test('parsearErrorRpc(): sin el formato CODIGO: mensaje cae a INTERNAL_ERROR', () => {
  assertEquals(parsearErrorRpc('algo raro sin formato'), {
    code: 'INTERNAL_ERROR',
    message: 'algo raro sin formato',
  })
})
