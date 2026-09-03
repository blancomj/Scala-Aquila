/**
 * D-26 (DECISIONES.md) — test-guardia: ningún archivo `.vue`/`.css` nuevo
 * puede introducir un color hex hardcodeado, una fuente fuera de
 * Inter/Inter Tight, o una clase `gray-*` de Tailwind — debe pasar por los
 * tokens de `apps/web/app/assets/css/tokens.css` o los props semánticos de
 * Nuxt UI (`DESIGN_SYSTEM.md`, raíz del repo).
 *
 * Las dos listas de abajo NO son lo mismo y por eso se comportan distinto
 * (D-38):
 *
 * · `DEUDA_GRAY` es **deuda**: código heredado que debería migrarse. Lleva
 *   la cuenta EXACTA por archivo y falla en las dos direcciones — si sube
 *   (regresión) y si baja (hay que anotar el avance). Es un trinquete: el
 *   total solo puede ir hacia abajo y un archivo que llega a cero sale de la
 *   lista, con lo que queda protegido por el guard general y ya no puede
 *   volver a introducir `gray-*`.
 *
 * · `EXCEPCIONES_HEX` son **excepciones categóricas permanentes**, no deuda:
 *   la propia fuente de los tokens, dataviz y escalas ordinales necesitan
 *   paletas propias por diseño. No llevan cuenta —un gráfico puede ganar o
 *   perder series legítimamente— pero sí exigen justificación escrita, y se
 *   revisa que sigan haciendo falta.
 *
 * Antes las dos eran un `Set` congelado al 23-08-2026, y eso las volvía un
 * balde con fugas: al 03-09-2026, 24 de las 51 entradas de `gray` ya no
 * violaban nada. Un archivo limpio que sigue en la lista puede volver a
 * ensuciarse en silencio, que es justo lo contrario de lo que la lista
 * pretende. Ahora una entrada muerta rompe CI y obliga a sacarla.
 *
 * Puramente estático — sin red, sin Supabase, corre siempre.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = join(import.meta.dirname, '..', '..')
const DIR_APP = join(RAIZ, 'apps', 'web', 'app')

/**
 * Excepciones categóricas PERMANENTES al hex — cada una con el porqué. No son
 * deuda: no se espera que bajen a cero. Para agregar una, documenta primero la
 * excepción en DESIGN_SYSTEM.md.
 *
 * Salieron de acá y no deben volver: 'pages/comprobante-cuenta/[id].vue'
 * (D-27/D-28) y, el 03-09-2026, 'cartera/certificaciones/[id].vue' y
 * 'cartera/expediente/[inmuebleId].vue' (D-36) — sus neutros eran los tokens
 * escritos a mano y sus estados pasaron a los semánticos.
 */
const EXCEPCIONES_HEX: Record<string, string> = {
  'assets/css/tokens.css': 'fuente de la verdad de los tokens — acá SÍ van los hex',
  'assets/css/ficha-inmueble.css': '#fff literal en texto sobre fondo de color (D-26)',
  'components/cartera/DonutAntiguedad.vue': 'dataviz — paleta categórica',
  'components/cartera/EvolucionChart.vue': 'dataviz — paleta categórica',
  'pages/cartera/index.vue': 'dataviz — paleta categórica (escalones de mora)',
  'pages/auditoria/informes/[id].vue':
    'escala ORDINAL de severidad (crítico/alto/medio/bajo): los cuatro tonos ' +
    'tienen que leerse como progresión, así que es categórica igual que dataviz. ' +
    'Solo por sus cuatro `.nivel-*` — el resto del archivo sí se migró (D-36)',
}

/**
 * Deuda de `gray-*` — cuenta EXACTA por archivo, censada el 03-09-2026 con el
 * mismo `PATRON_GRAY` de abajo. **Trinquete**: subir es una regresión y bajar
 * obliga a actualizar el número acá. Cuando un archivo llega a cero se BORRA
 * la entrada; a partir de ahí lo cubre el guard general y un `gray-*` nuevo
 * rompe CI.
 *
 * No agregues archivos nuevos: para código nuevo la regla es `neutral-*` o las
 * clases semánticas de Nuxt UI (`text-muted`, `border-default`…).
 *
 * Contexto (D-37): estos 292 usos ya no divergen visualmente — `tokens.css`
 * aliasa `--color-gray-*` a la escala del proyecto. Lo que queda es deuda de
 * NOMBRE, no de color, así que se salda con un rename mecánico y sin riesgo.
 */
const DEUDA_GRAY: Record<string, number> = {
  'pages/cartera/index.vue': 47,
  'components/nav/NavUsuarioMenu.vue': 35,
  'pages/configuracion/plantillas-email.vue': 29,
  'components/nav/NavTenantSwitcher.vue': 25,
  'pages/configuracion/plantillas-sms.vue': 22,
  'components/busqueda/BusquedaResultados.vue': 19,
  'components/busqueda/BusquedaGlobal.vue': 16,
  'components/nav/NavNotificaciones.vue': 14,
  'pages/dashboard/index.vue': 12,
  'components/busqueda/BusquedaResultadoFila.vue': 10,
  'components/nav/NavBreadcrumb.vue': 8,
  'components/coeficientes/CoeficientesPanel.vue': 6,
  'layouts/default.vue': 6,
  'pages/configuracion/motivos-novedad.vue': 6,
  'pages/copropiedades/index.vue': 6,
  'components/cartera/BarrasEtapa.vue': 5,
  'pages/usuarios/index.vue': 5,
  'components/cartera/ProximamentePlaceholder.vue': 4,
  'components/cartera/DonutAntiguedad.vue': 3,
  'components/cartera/EvolucionChart.vue': 3,
  'pages/plataforma/index.vue': 3,
  'layouts/auth.vue': 2,
  'pages/invite.vue': 2,
  'pages/login.vue': 2,
  'pages/forgot-password.vue': 1,
  'pages/register.vue': 1,
}

const PATRON_HEX = /#[0-9a-fA-F]{3,8}\b/
// (?!var\() evita falsos positivos con var(--font-serif)/var(--font-sans) (nombres
// de variable, no valores literales) — y "serif"/"sans-serif" a secas NO están en
// la lista: son el fallback genérico de CSS, legítimo en cualquier font-family
// (incluida la propia definición de --font-sans en tokens.css). Solo se prohíben
// nombres de fuente concretos fuera de Inter/Inter Tight.
const PATRON_FUENTE_PROHIBIDA =
  /font-family:\s*(?!var\()[^;]*\b(Helvetica|Arial|Georgia|IBM Plex|Source Serif|SF Mono|Consolas|Menlo)\b/i
// Global: el trinquete necesita CONTAR, no solo detectar. Ojo con `lastIndex`
// de un regex con /g — abajo se usa siempre `match()`, nunca `.test()`.
const PATRON_GRAY =
  /\b(?:text|bg|border|ring|divide|from|via|to|outline|decoration|caret|fill|stroke)-gray-\d+\b/g

function contarGray(contenido: string): number {
  return (contenido.match(PATRON_GRAY) ?? []).length
}

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

  it('ningún archivo tiene color hex hardcodeado fuera de las excepciones', () => {
    const violaciones = archivos.filter(
      ({ ruta, contenido }) => !(ruta in EXCEPCIONES_HEX) && PATRON_HEX.test(contenido),
    )
    if (violaciones.length > 0) {
      const detalle = violaciones.map((v) => v.ruta).join('\n  ')
      throw new Error(
        `Archivo(s) con color hex hardcodeado fuera de tokens.css (D-26, DESIGN_SYSTEM.md):\n  ${detalle}\n\n` +
          `Usa los tokens de apps/web/app/assets/css/tokens.css (--color-brand-*/--color-northline-*) o los ` +
          `props semánticos de Nuxt UI (color="primary"/"neutral"/"success"/"warning"/"error") — nunca un ` +
          `hex suelto en markup o <style>. Si es dataviz o una escala ordinal (excepción explícita en ` +
          `DESIGN_SYSTEM.md), agrégalo a EXCEPCIONES_HEX en este test CON su justificación.`,
      )
    }
    expect(violaciones).toEqual([])
  })

  it('toda excepción de hex sigue siendo necesaria (sin entradas muertas)', () => {
    const porRuta = new Map(archivos.map((a) => [a.ruta, a.contenido]))
    const muertas: string[] = []
    for (const ruta of Object.keys(EXCEPCIONES_HEX)) {
      const contenido = porRuta.get(ruta)
      if (contenido === undefined) muertas.push(`${ruta} — el archivo ya no existe`)
      else if (!PATRON_HEX.test(contenido)) muertas.push(`${ruta} — ya no tiene ningún hex`)
    }
    if (muertas.length > 0) {
      throw new Error(
        `EXCEPCIONES_HEX tiene entradas que ya no hacen falta:\n  ${muertas.join('\n  ')}\n\n` +
          `Bórralas. Una excepción que sobrevive a su motivo deja el archivo sin vigilancia: ` +
          `puede volver a introducir hex en silencio, que es lo contrario de lo que la lista busca (D-38).`,
      )
    }
    expect(muertas).toEqual([])
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

  it('ningún archivo fuera de la deuda introduce clases gray-*', () => {
    const violaciones = archivos.filter(
      ({ ruta, contenido }) => !(ruta in DEUDA_GRAY) && contarGray(contenido) > 0,
    )
    if (violaciones.length > 0) {
      const detalle = violaciones
        .map((v) => `${v.ruta} (${String(contarGray(v.contenido))})`)
        .join('\n  ')
      throw new Error(
        `Archivo(s) con clases gray-* de Tailwind fuera de la deuda registrada (D-26, DESIGN_SYSTEM.md):\n  ${detalle}\n\n` +
          `Usa neutral-* (apps/web/app/assets/css/tokens.css) o las clases semánticas de Nuxt UI ` +
          `(text-muted, border-default, etc.) en vez de gray-*. La deuda NO se amplía: si el archivo ` +
          `no está en DEUDA_GRAY es porque está limpio, y ensuciarlo es una regresión.`,
      )
    }
    expect(violaciones).toEqual([])
  })

  it('la deuda de gray-* solo puede bajar (trinquete)', () => {
    const porRuta = new Map(archivos.map((a) => [a.ruta, a.contenido]))
    const subieron: string[] = []
    const bajaron: string[] = []
    const saldadas: string[] = []

    for (const [ruta, anotado] of Object.entries(DEUDA_GRAY)) {
      const contenido = porRuta.get(ruta)
      if (contenido === undefined) {
        saldadas.push(`${ruta} — el archivo ya no existe`)
        continue
      }
      const real = contarGray(contenido)
      if (real === 0) saldadas.push(`${ruta} — ya no tiene ningún gray-*`)
      else if (real > anotado)
        subieron.push(
          `${ruta}: anotado ${String(anotado)}, hay ${String(real)} (+${String(real - anotado)})`,
        )
      else if (real < anotado)
        bajaron.push(
          `${ruta}: anotado ${String(anotado)}, hay ${String(real)} (−${String(anotado - real)})`,
        )
    }

    if (subieron.length > 0) {
      throw new Error(
        `REGRESIÓN — se agregaron clases gray-* a archivos que ya eran deuda:\n  ${subieron.join('\n  ')}\n\n` +
          `La deuda solo baja. Usa neutral-* o las clases semánticas de Nuxt UI en el código que agregaste.`,
      )
    }
    if (saldadas.length > 0) {
      throw new Error(
        `Deuda saldada — borra estas entradas de DEUDA_GRAY:\n  ${saldadas.join('\n  ')}\n\n` +
          `Dejarlas en 0 no es inofensivo: mientras el archivo siga en la lista puede volver a ` +
          `introducir gray-* sin que CI diga nada. Al borrarlo queda cubierto por el guard general (D-38).`,
      )
    }
    if (bajaron.length > 0) {
      throw new Error(
        `Deuda reducida — actualiza los números en DEUDA_GRAY:\n  ${bajaron.join('\n  ')}\n\n` +
          `El trinquete es de dos direcciones a propósito: el número anotado tiene que reflejar la ` +
          `realidad para que la próxima regresión se note. Ajusta y sigue.`,
      )
    }

    expect({ subieron, bajaron, saldadas }).toEqual({ subieron: [], bajaron: [], saldadas: [] })
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
    ([, semantico, paleta]) => ({ semantico: semantico!, paleta: paleta! }),
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
      const ausentes = pasos.filter((p) => !tokens.includes(`--color-${paleta}-${String(p)}:`))
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
