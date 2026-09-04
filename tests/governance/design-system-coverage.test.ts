/**
 * D-26 (DECISIONES.md) — test-guardia: ningún archivo `.vue`/`.css` nuevo
 * puede introducir un color hex hardcodeado, una fuente fuera de
 * Inter/Inter Tight, o una clase `gray-*` de Tailwind — debe pasar por los
 * tokens de `apps/web/app/assets/css/tokens.css` o los props semánticos de
 * Nuxt UI (`DESIGN_SYSTEM.md`, raíz del repo).
 *
 * Los archivos ya existentes al 23-08-2026 (ARCHIVOS_LEGADO_*) quedan
 * exentos — no se migran retroactivamente (ver D-26: el resultado visual de
 * gray-* vs neutral-* es casi idéntico, no se justifica tocar 66 archivos a
 * mano). Solo se exige el estándar para archivos creados de aquí en
 * adelante. Dataviz (components/cartera/*Chart.vue, pages/cartera/index.vue)
 * y syntax highlighting (utils/ael-codemirror.ts, no es .vue/.css) quedan
 * fuera de alcance a propósito — necesitan paletas propias, no el acento
 * único de marca.
 *
 * Puramente estático — sin red, sin Supabase, corre siempre.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = join(import.meta.dirname, '..', '..')
const DIR_APP = join(RAIZ, 'apps', 'web', 'app')

/** Congelado al 23-08-2026 (D-26) — no agregar archivos nuevos acá; si un
 * archivo nuevo necesita color hardcodeado (dataviz/syntax highlighting),
 * la excepción se documenta en DESIGN_SYSTEM.md antes de agregarlo aquí. */
const ARCHIVOS_LEGADO_COLOR_HEX = new Set<string>([
  'assets/css/tokens.css', // fuente de la verdad de los tokens — acá SÍ van los hex
  'assets/css/ficha-inmueble.css', // #fff literal en texto sobre fondo de color, ver D-26
  'components/cartera/DonutAntiguedad.vue', // dataviz — paleta categórica
  'components/cartera/EvolucionChart.vue', // dataviz — paleta categórica
  'pages/cartera/index.vue', // dataviz — paleta categórica (escalones de mora)
  // 'pages/comprobante-cuenta/[id].vue' salió del allowlist (D-27/D-28): el
  // visor público se reescribió solo con tokens — ya no necesita hex.
])

/** Congelado al 23-08-2026 (D-26) — no se migran retroactivamente. No agregar
 * archivos nuevos acá.
 *
 * Los 8 `components/Ael*.vue` salieron de la lista el 2026-09-02 con el
 * movimiento 10 de la Fase 8 (rediseño del constructor visual de fórmulas):
 * se reescribió su presentación entera, así que migrarlos a `neutral-*`
 * salía gratis. A partir de ahora un `gray-*` nuevo ahí rompe CI — que es
 * justamente el punto de sacarlos.
 *
 * Repaso impeccable (2026-09-04): 26 archivos más ya habían llegado a cero
 * usos de `gray-*` por trabajo de diseño independiente (incluye 4 páginas
 * limpiadas en ese mismo repaso: dashboard/index.vue, cartera/index.vue,
 * auditoria/index.vue, estado-cuenta/novedades.vue) más `usuarios/index.vue`
 * y `copropiedades/index.vue` migrados en este pase — todos salieron de la
 * lista por el mismo criterio que los Ael*.vue. `pages/estado-cuenta/pagos.vue`
 * salió también: el archivo ya no existe. */
const ARCHIVOS_LEGADO_GRAY = new Set<string>([
  'components/busqueda/BusquedaGlobal.vue',
  'components/busqueda/BusquedaResultadoFila.vue',
  'components/busqueda/BusquedaResultados.vue',
  'components/cartera/BarrasEtapa.vue',
  'components/cartera/DonutAntiguedad.vue',
  'components/cartera/EvolucionChart.vue',
  'components/cartera/ProximamentePlaceholder.vue',
  'components/coeficientes/CoeficientesPanel.vue',
  'components/nav/NavBreadcrumb.vue',
  'components/nav/NavNotificaciones.vue',
  'components/nav/NavTenantSwitcher.vue',
  'components/nav/NavUsuarioMenu.vue',
  'layouts/auth.vue',
  'layouts/default.vue',
  'pages/configuracion/motivos-novedad.vue',
  'pages/configuracion/plantillas-email.vue',
  'pages/configuracion/plantillas-sms.vue',
  'pages/forgot-password.vue',
  'pages/invite.vue',
  'pages/login.vue',
  'pages/plataforma/index.vue',
  'pages/register.vue',
])

const PATRON_HEX = /#[0-9a-fA-F]{3,8}\b/
// (?!var\() evita falsos positivos con var(--font-serif)/var(--font-sans) (nombres
// de variable, no valores literales) — y "serif"/"sans-serif" a secas NO están en
// la lista: son el fallback genérico de CSS, legítimo en cualquier font-family
// (incluida la propia definición de --font-sans en tokens.css). Solo se prohíben
// nombres de fuente concretos fuera de Inter/Inter Tight.
const PATRON_FUENTE_PROHIBIDA =
  /font-family:\s*(?!var\()[^;]*\b(Helvetica|Arial|Georgia|IBM Plex|Source Serif|SF Mono|Consolas|Menlo)\b/i
const PATRON_GRAY =
  /\b(?:text|bg|border|ring|divide|from|via|to|outline|decoration|caret|fill|stroke)-gray-\d+\b/

interface ArchivoFuente {
  ruta: string
  contenido: string
}

function archivosVueCss(dir: string): ArchivoFuente[] {
  const acumulado: ArchivoFuente[] = []
  for (const nombre of readdirSync(dir)) {
    const rutaAbsoluta = join(dir, nombre)
    const info = statSync(rutaAbsoluta)
    if (info.isDirectory()) {
      acumulado.push(...archivosVueCss(rutaAbsoluta))
    } else if (nombre.endsWith('.vue') || nombre.endsWith('.css')) {
      acumulado.push({
        ruta: relative(DIR_APP, rutaAbsoluta).replace(/\\/g, '/'),
        contenido: readFileSync(rutaAbsoluta, 'utf-8'),
      })
    }
  }
  return acumulado
}

describe('D-26 — design system único: sin color/fuente/gray-* nuevo fuera de tokens.css', () => {
  const archivos = archivosVueCss(DIR_APP)

  it('ningún archivo tiene color hex hardcodeado fuera del allowlist congelado', () => {
    const violaciones = archivos.filter(
      ({ ruta, contenido }) => !ARCHIVOS_LEGADO_COLOR_HEX.has(ruta) && PATRON_HEX.test(contenido),
    )
    if (violaciones.length > 0) {
      const detalle = violaciones.map((v) => v.ruta).join('\n  ')
      throw new Error(
        `Archivo(s) con color hex hardcodeado fuera de tokens.css (D-26, DESIGN_SYSTEM.md):\n  ${detalle}\n\n` +
          `Usa los tokens de apps/web/app/assets/css/tokens.css (--color-brand-*/--color-neutral-*) o los ` +
          `props semánticos de Nuxt UI (color="primary"/"neutral"/"success"/"warning"/"error") — nunca un ` +
          `hex suelto en markup o <style>. Si es dataviz o syntax highlighting (excepción explícita en ` +
          `DESIGN_SYSTEM.md), agrega el archivo a ARCHIVOS_LEGADO_COLOR_HEX en este test.`,
      )
    }
    expect(violaciones).toEqual([])
  })

  it('ningún archivo usa una fuente fuera de Inter/Inter Tight', () => {
    const violaciones = archivos.filter(({ contenido }) => PATRON_FUENTE_PROHIBIDA.test(contenido))
    if (violaciones.length > 0) {
      const detalle = violaciones.map((v) => v.ruta).join('\n  ')
      throw new Error(
        `Archivo(s) con font-family fuera de Inter/Inter Tight (D-26, DESIGN_SYSTEM.md):\n  ${detalle}\n\n` +
          `Usa var(--font-sans) (Inter) o var(--font-display) (Inter Tight) — nunca otra familia tipográfica.`,
      )
    }
    expect(violaciones).toEqual([])
  })

  it('ningún archivo nuevo introduce clases gray-* fuera del allowlist congelado', () => {
    const violaciones = archivos.filter(
      ({ ruta, contenido }) => !ARCHIVOS_LEGADO_GRAY.has(ruta) && PATRON_GRAY.test(contenido),
    )
    if (violaciones.length > 0) {
      const detalle = violaciones.map((v) => v.ruta).join('\n  ')
      throw new Error(
        `Archivo(s) con clases gray-* de Tailwind fuera del allowlist congelado (D-26, DESIGN_SYSTEM.md):\n  ${detalle}\n\n` +
          `Usa neutral-* (apps/web/app/assets/css/tokens.css) o las clases semánticas de Nuxt UI ` +
          `(text-muted, border-default, etc.) en vez de gray-*.`,
      )
    }
    expect(violaciones).toEqual([])
  })
})
