// Cobertura de _shared/email_estado_cuenta.ts (D-28) — deno test, módulo
// puro (construirCorreoEstadoCuenta no toca red ni entorno). Los casos son
// los que rompen un correo transaccional en producción: interpolación sin
// escapar (XSS dentro del cliente de correo del destinatario), monto mal
// formateado, URL ausente del CTA y la línea anti-phishing con el host real.
import { assertEquals, assertStringIncludes as incluir } from 'jsr:@std/assert@^1'
import { construirCorreoEstadoCuenta, hostDelEnlace } from './email_estado_cuenta.ts'

const BASE = {
  tenantNombre: 'Conjunto Los Robles',
  inmuebleCodigo: 'APT-302-T2',
  saldoFinal: 98_200,
  corteIso: '2026-08-31T12:00:00.000Z',
  urlDocumento: 'https://app.aquila.test/comprobante-cuenta/abc-123?t=v1.123.abc',
  vigenciaDias: 30,
}

Deno.test('subject: identifica copropiedad y corte', () => {
  const { subject } = construirCorreoEstadoCuenta(BASE)
  incluir(subject, 'Los Robles')
  incluir(subject, '31/08/2026')
})

Deno.test('html: contiene el saldo formateado es-CO y el inmueble', () => {
  const { html } = construirCorreoEstadoCuenta(BASE)
  // Intl es-CO: separador de miles con punto; Deno inserta un espacio tras el
  // símbolo ("$ 98.200") — se valida la cifra, no el espaciado del runtime.
  incluir(html, '98.200')
  incluir(html, 'APT-302-T2')
})

Deno.test('html: el CTA apunta exactamente a la URL firmada', () => {
  const { html } = construirCorreoEstadoCuenta(BASE)
  incluir(html, `href="${BASE.urlDocumento}"`)
})

Deno.test('html: anti-phishing muestra el host real del enlace', () => {
  const { html } = construirCorreoEstadoCuenta(BASE)
  incluir(html, 'https://app.aquila.test')
})

Deno.test('html: escapa HTML en nombre de copropiedad e inmueble (XSS)', () => {
  const hostil = construirCorreoEstadoCuenta({
    ...BASE,
    tenantNombre: `<script>alert(1)</script> "Torres" & Hijos`,
    inmuebleCodigo: `Apto <b>1</b>`,
  })
  incluir(hostil.html, '&lt;script&gt;')
  incluir(hostil.html, '&quot;Torres&quot; &amp; Hijos')
  incluir(hostil.html, 'Apto &lt;b&gt;1&lt;/b&gt;')
})

Deno.test('html: saldo negativo se presenta como "a favor" en verde', () => {
  const { html } = construirCorreoEstadoCuenta({ ...BASE, saldoFinal: -50_000 })
  incluir(html, 'Saldo a tu favor')
  incluir(html, '50.000')
  incluir(html, '#166534')
})

Deno.test('html: menciona vigencia del enlace y fundamento DIAN de cuotas', () => {
  const { html } = construirCorreoEstadoCuenta(BASE)
  incluir(html, 'vence en 30 días')
  incluir(html, 'DIAN 106/2022')
})

Deno.test('hostDelEnlace: null ante URL inválida (fallback defensivo)', () => {
  assertEquals(hostDelEnlace('no-es-una-url'), null)
})
