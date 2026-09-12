/**
 * Gobernanza — todo `p_enlace` de una notificación lleva a una página real.
 *
 * Nace de un fallo real (2026-09-12): dos de los tres puentes de detección
 * de EXS-2 apuntaban a rutas que no existen —`/finanzas/flujo` en vez de
 * `/finanzas/flujo-proyectado`, y `/gobierno`, que no tiene índice—. En la
 * base local eran 142 de 246 avisos que terminaban en "Page not found".
 *
 * No falla nada en el camino: `fn_notificar` no conoce el router del
 * front, el trigger se traga sus propios errores a propósito, y las
 * pruebas de EXS-2 comprueban que el aviso se emite con su enlace, no que
 * el enlace resuelva. Solo se nota pulsándolo. Esta prueba lo hace
 * exigible sin navegador y, sobre todo, detecta el caso que lo va a
 * repetir: renombrar una página y dejar atrás al emisor que la nombraba.
 *
 * SE LEE LA DEFINICIÓN VIVA, no las migraciones. Una migración es historia
 * inmutable: el literal equivocado sigue escrito en la que lo introdujo
 * aunque un `create or replace` posterior ya lo haya corregido. Lo que
 * importa es qué función hay hoy en la base — y de paso se comprueban
 * también las filas ya emitidas, que es donde vive el 404 del usuario.
 */
// Sin esto, SUPABASE_DB_URL está vacío al evaluar el módulo y la suite se
// saltaría en silencio — el mismo modo de fallar que existe para evitar.
import 'dotenv/config'
import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const dbUrl = process.env.SUPABASE_DB_URL
const d = dbUrl ? describe : describe.skip

const PAGINAS = join(__dirname, '..', '..', 'apps', 'web', 'app', 'pages')

async function consultar<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  const { Client } = await import('pg')
  const client = new Client({ connectionString: dbUrl })
  await client.connect()
  try {
    return (await client.query<T>(sql)).rows
  } finally {
    await client.end()
  }
}

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta]
  })
}

/** Rutas que sirve Nuxt, como expresiones regulares: `index.vue` es el
 *  directorio y `[id].vue` acepta cualquier segmento. No hace falta
 *  escapar nada: una ruta solo trae letras, dígitos, guiones, barras y los
 *  corchetes del parámetro dinámico. */
function rutasDelRouter(): RegExp[] {
  return archivos(PAGINAS)
    .filter((f) => f.endsWith('.vue'))
    .map((f) => {
      const sinExt = relative(PAGINAS, f).replace(/\.vue$/, '').split(sep).join('/')
      const ruta = '/' + sinExt.replace(/\/index$/, '').replace(/^index$/, '')
      const patron = ruta.replace(/\[\.\.\.[^\]]+\]/g, '.+').replace(/\[[^\]]+\]/g, '[^/]+')
      return new RegExp(`^${patron}/?$`)
    })
}

const resuelve = (rutas: RegExp[], enlace: string) => rutas.some((r) => r.test(enlace))

d('gobernanza — enlaces de notificaciones', () => {
  it('cada p_enlace de las funciones vivas resuelve a una página existente', async () => {
    const funciones = await consultar<{ proname: string; prosrc: string }>(`
      select p.proname, p.prosrc
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosrc like '%p_enlace%=>%'
      order by p.proname
    `)
    expect(funciones.length, 'ninguna función emite p_enlace — ¿cambió el patrón?').toBeGreaterThan(
      0,
    )

    const rutas = rutasDelRouter()
    const rotos: string[] = []

    for (const { proname, prosrc } of funciones) {
      for (const linea of prosrc.split('\n')) {
        // La coma final es opcional: el último argumento no la lleva.
        const m = /p_enlace\s*=>\s*(.+?)\s*,?\s*$/.exec(linea)
        if (!m?.[1]) continue
        const expr = m[1].trim()
        if (expr === 'null') continue
        const literal = /^'([^']*)'/.exec(expr)
        if (!literal?.[1]) continue
        // '/anuncios/' || new.id::text  →  un segmento cualquiera, que es
        // lo que produce en runtime.
        const enlace = expr.includes('||') ? literal[1] + 'x' : literal[1]
        if (!resuelve(rutas, enlace)) rotos.push(`${enlace} (${proname})`)
      }
    }

    expect(
      rotos,
      `estos emisores apuntan a una página que no existe en apps/web/app/pages — ` +
        `corrige el emisor o restituye la ruta: ${rotos.join(', ')}`,
    ).toEqual([])
  }, 30_000)

  it('ninguna notificación ya emitida apunta a una página inexistente', async () => {
    const filas = await consultar<{ enlace: string; n: number }>(`
      select enlace, count(*)::int as n
      from public.notificaciones
      where enlace is not null
      group by 1 order by 2 desc
    `)

    const rutas = rutasDelRouter()
    const rotos = filas
      .filter((f) => !resuelve(rutas, f.enlace))
      .map((f) => `${f.enlace} × ${String(f.n)}`)

    expect(
      rotos,
      `hay notificaciones vivas cuyo enlace da 404 — corregir el emisor no basta, ` +
        `las filas ya emitidas siguen en la campana de alguien: ${rotos.join(', ')}`,
    ).toEqual([])
  }, 30_000)
})
