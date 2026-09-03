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
  //
  // D-36 (2026-09-03): 'cartera/certificaciones/[id].vue' y
  // 'cartera/expediente/[inmuebleId].vue' también salieron — sus neutros eran
  // los tokens escritos a mano y sus estados ahora usan los semánticos nuevos.
  // 'auditoria/informes/[id].vue' ENTRA, pero solo por sus cuatro `.nivel-*`:
  // crítico/alto/medio/bajo es una escala ordinal de severidad, no cuatro
  // estados sueltos. Los cuatro tonos tienen que leerse como progresión, y
  // eso es paleta categórica —misma excepción que dataviz, ya reconocida
  // arriba para los escalones de mora—. El resto del archivo sí se migró.
  'pages/auditoria/informes/[id].vue',
])

/** Congelado al 23-08-2026 (D-26) — 904 usos de gray-* en estos 66 archivos,
 * no se migran retroactivamente. No agregar archivos nuevos acá.
 *
 * Los 8 `components/Ael*.vue` salieron de la lista el 2026-09-02 con el
 * movimiento 10 de la Fase 8 (rediseño del constructor visual de fórmulas):
 * se reescribió su presentación entera, así que migrarlos a `neutral-*`
 * salía gratis. A partir de ahora un `gray-*` nuevo ahí rompe CI — que es
 * justamente el punto de sacarlos. */
const ARCHIVOS_LEGADO_GRAY = new Set<string>([
  'components/busqueda/BusquedaGlobal.vue',
  'components/busqueda/BusquedaResultadoFila.vue',
  'components/busqueda/BusquedaResultados.vue',
  'components/cartera/BarrasEtapa.vue',
  'components/cartera/DonutAntiguedad.vue',
  'components/cartera/EvolucionChart.vue',
  'components/cartera/ProximamentePlaceholder.vue',
  'components/coeficientes/CoeficientesPanel.vue',
  'components/conceptos/ConceptosCatalogo.vue',
  'components/conceptos/ConceptosCondicionBuilder.vue',
  'components/conceptos/ConceptosCondicionHoja.vue',
  'components/conceptos/ConceptosEditor.vue',
  'components/conceptos/ConceptosVariablesPanel.vue',
  'components/nav/NavBreadcrumb.vue',
  'components/nav/NavNotificaciones.vue',
  'components/nav/NavTenantSwitcher.vue',
  'components/nav/NavUsuarioMenu.vue',
  'components/novedades/NovedadesEditor.vue',
  'components/presupuesto/PresupuestoTabControlValidaciones.vue',
  'components/presupuesto/PresupuestoTabEjecucion.vue',
  'components/presupuesto/PresupuestoTabFuentes.vue',
  'components/presupuesto/PresupuestoTabPlanCuentas.vue',
  'components/presupuesto/PresupuestoTabSimulacion.vue',
  'components/ui/UiSelectorBuscable.vue',
  'components/ui/UiTabla.vue',
  'layouts/auth.vue',
  'layouts/default.vue',
  'pages/auditoria/index.vue',
  'pages/cartera/index.vue',
  'pages/conceptos/dependencias.vue',
  'pages/configuracion/motivos-novedad.vue',
  'pages/configuracion/plantillas-email.vue',
  'pages/configuracion/plantillas-sms.vue',
  'pages/copropiedades/index.vue',
  'pages/dashboard/index.vue',
  'pages/estado-cuenta/conceptos.vue',
  'pages/estado-cuenta/index.vue',
  'pages/estado-cuenta/novedades.vue',
  'pages/estado-cuenta/pagos.vue',
  'pages/forgot-password.vue',
  'pages/fundamentos/index.vue',
  'pages/invite.vue',
  'pages/liquidacion/index.vue',
  'pages/login.vue',
  'pages/plataforma/index.vue',
  'pages/presupuesto/control.vue',
  'pages/presupuesto/index.vue',
  'pages/presupuesto/periodos.vue',
  'pages/register.vue',
  'pages/seguridad/index.vue',
  'pages/usuarios/index.vue',
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

/**
 * D-37 (DECISIONES.md) — el nombre que `app.config.ts` le da a cada color
 * semántico de Nuxt UI no puede coincidir con una paleta propia de Tailwind.
 *
 * Nuxt UI, para exponer `primary`/`neutral` como colores semánticos, redefine
 * `--color-<nombre>-*` como alias de `--ui-color-<nombre>-*`. Si el nombre es
 * uno de Tailwind la referencia es circular, así que Nuxt UI archiva la paleta
 * ORIGINAL en `--color-old-<nombre>-*` y apunta ahí — la escala del proyecto
 * queda desconectada y los componentes se pintan con la de Tailwind. No hay
 * error de build ni de runtime: el color simplemente es otro.
 *
 * Fue exactamente lo que pasó con `neutral: 'neutral'` hasta el 03-09-2026:
 * `--ui-color-neutral-200` resolvía a `oklch(92.2% 0 none)` (gris puro de
 * Tailwind) en vez de `#d9d9de`, con ΔE de hasta 6.33 en los escalones claros.
 * `primary: 'brand'` nunca falló porque "brand" no es una paleta de Tailwind.
 */
const PALETAS_DE_TAILWIND = new Set([
  // `tailwindcss/theme.css` — familias de gris y de color con escala 50..950.
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
])

describe('D-37 — las paletas de Nuxt UI apuntan a la escala del proyecto', () => {
  const appConfig = readFileSync(join(DIR_APP, 'app.config.ts'), 'utf-8')
  const tokens = readFileSync(join(DIR_APP, 'assets', 'css', 'tokens.css'), 'utf-8')

  const bloqueColores = appConfig.match(/colors:\s*\{([^}]*)\}/)?.[1] ?? ''
  const asignaciones = [...bloqueColores.matchAll(/(\w+)\s*:\s*'([^']+)'/g)].map(
    ([, semantico, paleta]) => ({ semantico, paleta: paleta! }),
  )

  it('app.config.ts declara al menos primary y neutral', () => {
    expect(asignaciones.map((a) => a.semantico).sort()).toEqual(['neutral', 'primary'])
  })

  it('ningún color semántico usa el nombre de una paleta de Tailwind', () => {
    const chocan = asignaciones.filter((a) => PALETAS_DE_TAILWIND.has(a.paleta))
    if (chocan.length > 0) {
      const detalle = chocan.map((c) => `${c.semantico}: '${c.paleta}'`).join('\n  ')
      throw new Error(
        `app.config.ts asigna un color semántico de Nuxt UI a una paleta propia de Tailwind:\n  ${detalle}\n\n` +
          `La referencia queda circular y Nuxt UI cae a --color-old-${chocan[0]!.paleta}-* (la escala de ` +
          `Tailwind), ignorando tokens.css SIN dar error. Renombra la paleta en tokens.css a un nombre que ` +
          `Tailwind no use (como "brand" o "northline") y apunta el color semántico a ese nombre. Ver D-37.`,
      )
    }
    expect(chocan).toEqual([])
  })

  it('cada paleta referenciada existe en tokens.css con su escala completa', () => {
    const pasos = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
    const faltantes: string[] = []
    for (const { semantico, paleta } of asignaciones) {
      const ausentes = pasos.filter((p) => !tokens.includes(`--color-${paleta}-${p}:`))
      if (ausentes.length > 0) {
        faltantes.push(`${semantico} -> '${paleta}' (faltan los pasos ${ausentes.join(', ')})`)
      }
    }
    if (faltantes.length > 0) {
      throw new Error(
        `app.config.ts apunta a una paleta que tokens.css no declara completa:\n  ${faltantes.join('\n  ')}\n\n` +
          `Nuxt UI genera --ui-color-<semantico>-<paso>: var(--color-<paleta>-<paso>, ) — con fallback VACÍO. ` +
          `Un paso que falte deja ese color inválido en runtime, sin error de build.`,
      )
    }
    expect(faltantes).toEqual([])
  })
})
