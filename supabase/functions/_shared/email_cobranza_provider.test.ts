// Cobertura de _shared/email_cobranza_provider.ts (COM-1) — hasta ahora sin test propio: nada lo
// cargaba en el grafo de módulos de la suite deno, así que check-edge-coverage.mjs nunca lo vio.
// COM-1 lo convirtió en el único sitio que normaliza providerMessageId para TODO correo saliente
// (compositor, estado de cuenta, recibo de caja, además de cobranza/GOB-9 que ya lo usaban) — sin
// esta cobertura, un cambio aquí podría romper el webhook de Brevo para los cinco emisores a la vez
// sin que ningún test lo note.
//
// deno test corre sin --allow-env/--allow-net (test:edge no los pasa, y un test no puede escalar
// los permisos del proceso padre): en vez de Deno.env.set/get real, se reemplaza Deno.env.get por
// una función local que nunca toca el permiso nativo. El fetch real tampoco se ejecuta —
// globalThis.fetch se reemplaza por un mock local — así que no hace falta ningún permiso.
import { assertEquals } from 'jsr:@std/assert@^1'
import { enviarEmailCobranza, normalizarMessageId } from './email_cobranza_provider.ts'

const PARAMS_BASE = {
  to: 'deudor@example.com',
  destinatarioNombre: 'Juan Pérez',
  subject: 'Recordatorio de pago',
  html: '<p>Hola</p>',
  reference: 'accion-123',
}

function conEnvBrevo<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const original = Deno.env.get
  Deno.env.get = ((key: string) => vars[key]) as typeof Deno.env.get
  return fn().finally(() => {
    Deno.env.get = original
  })
}

function conFetchMock<T>(mock: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch
  globalThis.fetch = mock
  return fn().finally(() => {
    globalThis.fetch = original
  })
}

const ENV_BREVO_OK = { BREVO_API_KEY: 'test-key', BREVO_SENDER_EMAIL: 'no-responder@aquila.test' }

Deno.test('normalizarMessageId: quita los ángulos del Message-ID', () => {
  assertEquals(normalizarMessageId('<20260829.abc@smtp-relay>'), '20260829.abc@smtp-relay')
})

Deno.test('normalizarMessageId: idempotente sobre un id sin ángulos', () => {
  assertEquals(normalizarMessageId('ya-sin-angulos'), 'ya-sin-angulos')
})

Deno.test('normalizarMessageId: recorta espacios', () => {
  assertEquals(normalizarMessageId('  <con-espacios>  '), 'con-espacios')
})

Deno.test('enviarEmailCobranza: sin BREVO_API_KEY/SENDER → falla sin llamar a fetch', () =>
  conEnvBrevo({}, async () => {
    const resultado = await enviarEmailCobranza(PARAMS_BASE)
    assertEquals(resultado.success, false)
    assertEquals(resultado.errorMessage?.includes('BREVO_API_KEY'), true)
  }))

Deno.test('enviarEmailCobranza: Brevo responde error con mensaje JSON → lo propaga', () =>
  conEnvBrevo(ENV_BREVO_OK, () =>
    conFetchMock(
      () => Promise.resolve(new Response(JSON.stringify({ message: 'sender not verified' }), { status: 400 })),
      async () => {
        const resultado = await enviarEmailCobranza(PARAMS_BASE)
        assertEquals(resultado.success, false)
        assertEquals(resultado.errorMessage, 'sender not verified (HTTP 400)')
      },
    ),
  ))

Deno.test('enviarEmailCobranza: Brevo responde error sin cuerpo JSON → mensaje genérico con status', () =>
  conEnvBrevo(ENV_BREVO_OK, () =>
    conFetchMock(
      () => Promise.resolve(new Response('<html>502</html>', { status: 502 })),
      async () => {
        const resultado = await enviarEmailCobranza(PARAMS_BASE)
        assertEquals(resultado.success, false)
        assertEquals(resultado.errorMessage, 'HTTP 502 (HTTP 502)')
      },
    ),
  ))

Deno.test('enviarEmailCobranza: éxito con messageId → normaliza y quita los ángulos', () =>
  conEnvBrevo(ENV_BREVO_OK, () =>
    conFetchMock(
      () => Promise.resolve(new Response(JSON.stringify({ messageId: '<msg-1@smtp-relay>' }), { status: 201 })),
      async () => {
        const resultado = await enviarEmailCobranza(PARAMS_BASE)
        assertEquals(resultado.success, true)
        assertEquals(resultado.providerMessageId, 'msg-1@smtp-relay')
        assertEquals(resultado.errorMessage, undefined)
      },
    ),
  ))

Deno.test('enviarEmailCobranza: éxito sin messageId → success true, con aviso de que no habrá acuses', () =>
  conEnvBrevo(ENV_BREVO_OK, () =>
    conFetchMock(
      () => Promise.resolve(new Response(JSON.stringify({}), { status: 201 })),
      async () => {
        const resultado = await enviarEmailCobranza(PARAMS_BASE)
        assertEquals(resultado.success, true)
        assertEquals(resultado.providerMessageId, undefined)
        assertEquals(resultado.errorMessage?.includes('no habrá acuses'), true)
      },
    ),
  ))

Deno.test('enviarEmailCobranza: tags por defecto son [cobranza, reference] cuando no se pasan', () =>
  conEnvBrevo(ENV_BREVO_OK, () =>
    conFetchMock(
      (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { tags: string[] }
        assertEquals(body.tags, ['cobranza', 'accion-123'])
        return Promise.resolve(new Response(JSON.stringify({ messageId: 'x' }), { status: 201 }))
      },
      () => enviarEmailCobranza(PARAMS_BASE),
    ),
  ))

Deno.test('enviarEmailCobranza: tags explícitos (GOB-9) sobreescriben el default de cobranza', () =>
  conEnvBrevo(ENV_BREVO_OK, () =>
    conFetchMock(
      (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { tags: string[] }
        assertEquals(body.tags, ['compositor'])
        return Promise.resolve(new Response(JSON.stringify({ messageId: 'x' }), { status: 201 }))
      },
      () => enviarEmailCobranza({ ...PARAMS_BASE, tags: ['compositor'] }),
    ),
  ))

Deno.test('enviarEmailCobranza: sin destinatarioNombre, el "to" viaja solo con email', () =>
  conEnvBrevo(ENV_BREVO_OK, () =>
    conFetchMock(
      (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { to: { email: string; name?: string }[] }
        assertEquals(body.to, [{ email: 'deudor@example.com' }])
        return Promise.resolve(new Response(JSON.stringify({ messageId: 'x' }), { status: 201 }))
      },
      () => enviarEmailCobranza({ ...PARAMS_BASE, destinatarioNombre: null }),
    ),
  ))
