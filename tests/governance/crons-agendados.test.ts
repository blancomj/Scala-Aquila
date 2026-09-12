/**
 * Gobernanza — toda función `cron_*` tiene que estar agendada en pg_cron.
 *
 * Nace de un fallo real: EXS-3 y EXS-6 escribieron
 * `cron_anuncios_publicar_programados` y `cron_marketplace_expirar`
 * siguiendo el patrón del repositorio, correctas e idempotentes, y **nadie
 * las llamó nunca**. La publicación programada y la expiración no ocurrían
 * solas, y no había forma de notarlo: no hay error cuando un cron no
 * existe, solo trabajo que no se hace.
 *
 * El nombre `cron_*` es una promesa —"esto lo dispara el scheduler"— y esta
 * prueba la hace exigible. Si alguien escribe la función y olvida el
 * `cron.schedule`, la suite lo dice en vez de descubrirlo un usuario meses
 * después preguntando por qué su anuncio no salió.
 */
// Igual que tests/rls/helpers.ts: sin esto, process.env.SUPABASE_DB_URL está
// vacío al evaluar el módulo y la suite entera se saltaría en silencio —
// que es justo el modo de fallar que esta prueba existe para evitar.
import 'dotenv/config'
import { describe, expect, it } from 'vitest'

const dbUrl = process.env.SUPABASE_DB_URL
const d = dbUrl ? describe : describe.skip

/** Funciones `cron_*` que NO deben estar agendadas, con el motivo. Una
 *  excepción aquí es una decisión consciente y documentada; la lista vacía
 *  sería ideal, pero mentir para que la prueba pase, no. */
const NO_AGENDADAS_A_PROPOSITO = new Map<string, string>([
  // Ninguna por ahora. Ejemplo de entrada legítima: un worker de despacho
  // que envía correo real y cuya activación es decisión de negocio, no de
  // infraestructura (ver la cabecera de 20260906160000).
])

// El genérico va acotado a QueryResultRow, que es lo que `pg` exige; el
// patrón de conexión directa es el mismo de tests/external/reservas.test.ts.
async function consultar<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  const { Client } = await import('pg')
  const client = new Client({ connectionString: dbUrl })
  await client.connect()
  try {
    const resultado = await client.query<T>(sql)
    return resultado.rows
  } finally {
    await client.end()
  }
}

d('gobernanza — crons agendados', () => {
  it('toda función cron_* está agendada en pg_cron', async () => {
    const funciones = await consultar<{ proname: string }>(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'cron\\_%'
      order by p.proname
    `)
    expect(funciones.length).toBeGreaterThan(0)

    const jobs = await consultar<{ command: string }>('select command from cron.job')
    const agendado = (nombre: string) => jobs.some((j) => j.command.includes(nombre))

    const huerfanas = funciones
      .map((f) => f.proname)
      .filter((nombre) => !agendado(nombre) && !NO_AGENDADAS_A_PROPOSITO.has(nombre))

    expect(
      huerfanas,
      `estas funciones cron_* existen pero nadie las llama — agéndalas con cron.schedule o ` +
        `documenta la excepción en NO_AGENDADAS_A_PROPOSITO: ${huerfanas.join(', ')}`,
    ).toEqual([])
  }, 30_000)

  it('los dos crons de la serie EXS están activos y con la frecuencia que les toca', async () => {
    const jobs = await consultar<{ jobname: string; schedule: string; active: boolean }>(`
      select jobname, schedule, active from cron.job where jobname like 'exs-%'
    `)
    const porNombre = new Map(jobs.map((j) => [j.jobname, j]))

    // Anuncios cada 15 minutos: publicar_at es un TIMESTAMP, así que un
    // cron diario llegaría con horas de retraso a algo pedido a una hora
    // concreta. Si alguien lo baja a diario, esta prueba lo detiene.
    const anuncios = porNombre.get('exs-anuncios-publicar-programados')
    expect(anuncios, 'falta el job de publicación programada').toBeDefined()
    expect(anuncios!.schedule).toBe('*/15 * * * *')
    expect(anuncios!.active).toBe(true)

    // Marketplace diario: vigente_hasta es una FECHA y nada cambia dentro
    // del día; correrlo más veces sería trabajo inútil.
    const marketplace = porNombre.get('exs-marketplace-expirar')
    expect(marketplace, 'falta el job de expiración del marketplace').toBeDefined()
    expect(marketplace!.schedule).toBe('0 5 * * *')
    expect(marketplace!.active).toBe(true)
  }, 30_000)

  it('ningún job quedó desactivado por descuido', async () => {
    const inactivos = await consultar<{ jobname: string }>(
      'select jobname from cron.job where not active',
    )
    expect(inactivos.map((j) => j.jobname)).toEqual([])
  }, 30_000)
})
