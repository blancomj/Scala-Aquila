import { assertEquals, assertExists } from 'jsr:@std/assert@^1'
import { logEvent } from './logger.ts'

Deno.test(
  'logEvent(): emite una línea JSON por console.log con timestamp + los campos del evento',
  () => {
    const original = console.log
    let capturado = ''
    console.log = (linea: string) => {
      capturado = linea
    }
    try {
      logEvent({
        level: 'warn',
        action: 'test.evento',
        correlationId: 'corr-1',
        tenantId: 'tenant-1',
        actorId: 'actor-1',
        message: 'algo pasó',
        meta: { detalle: 42 },
      })
    } finally {
      console.log = original
    }

    const parseado = JSON.parse(capturado) as Record<string, unknown>
    assertExists(parseado.timestamp)
    assertEquals(parseado.level, 'warn')
    assertEquals(parseado.action, 'test.evento')
    assertEquals(parseado.correlationId, 'corr-1')
    assertEquals(parseado.tenantId, 'tenant-1')
    assertEquals(parseado.actorId, 'actor-1')
    assertEquals(parseado.message, 'algo pasó')
    assertEquals(parseado.meta, { detalle: 42 })
  },
)

Deno.test('logEvent(): campos opcionales pueden omitirse', () => {
  const original = console.log
  let capturado = ''
  console.log = (linea: string) => {
    capturado = linea
  }
  try {
    logEvent({ level: 'info', action: 'test.minimo', correlationId: 'corr-2' })
  } finally {
    console.log = original
  }

  const parseado = JSON.parse(capturado) as Record<string, unknown>
  assertEquals(parseado.level, 'info')
  assertEquals(parseado.action, 'test.minimo')
  assertEquals('meta' in parseado, false)
})
