/**
 * RPT-05 — cuándo toca la próxima corrida (`fn_reporte_proxima_corrida`).
 *
 * Un error de calendario no se ve hasta el mes que viene, cuando el informe
 * no llega y ya nadie recuerda qué se tocó. Por eso la función es PURA
 * (IMMUTABLE, no lee tablas) y esta prueba la ejerce con instantes fijos, sin
 * fixtures y sin depender de la hora a la que corra la suite.
 *
 * El instante de referencia es **martes 15/09/2026, 14:00 en Bogotá**
 * (= 19:00 UTC). Fijo a propósito: un «ahora» real haría que la prueba
 * significara algo distinto cada día ([[fixture de franja horaria]]).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import { Client } from 'pg'

const dbUrl = process.env.SUPABASE_DB_URL
const d = dbUrl ? describe : describe.skip

if (!dbUrl) {
  console.warn('SALTADO tests/rls/reportes-calendario: falta SUPABASE_DB_URL en .env')
}

const REFERENCIA = '2026-09-15 19:00:00+00'
const ZONA = 'America/Bogota'

interface FilaProxima {
  local: string | null
  utc: string | null
}

async function proxima(
  cliente: Client,
  frecuencia: string,
  hora: string,
  opciones: { diaSemana?: number; diaMes?: number; fechaUnica?: string; zona?: string } = {},
): Promise<FilaProxima> {
  const { rows } = await cliente.query<FilaProxima>(
    `select
       to_char(public.fn_reporte_proxima_corrida($1, $2::time, $3, $4::smallint, $5::smallint, $6::date, $7::timestamptz)
               at time zone $3, 'YYYY-MM-DD HH24:MI') as local,
       to_char(public.fn_reporte_proxima_corrida($1, $2::time, $3, $4::smallint, $5::smallint, $6::date, $7::timestamptz)
               at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as utc`,
    [
      frecuencia,
      hora,
      opciones.zona ?? ZONA,
      opciones.diaSemana ?? null,
      opciones.diaMes ?? null,
      opciones.fechaUnica ?? null,
      REFERENCIA,
    ],
  )
  return rows[0]!
}

d('RPT-05 · próxima corrida', () => {
  let cliente: Client

  beforeAll(async () => {
    cliente = new Client({ connectionString: dbUrl })
    await cliente.connect()
    // La sesión se deja en UTC a propósito: si el cálculo dependiera del
    // TimeZone de la sesión, estas pruebas lo delatarían.
    await cliente.query("set time zone 'UTC'")
  }, 30_000)

  afterAll(async () => {
    if (dbUrl) await cliente.end()
  })

  it('diaria: si la hora de hoy ya pasó, es mañana', async () => {
    expect((await proxima(cliente, 'diaria', '07:00')).local).toBe('2026-09-16 07:00')
  })

  it('diaria: si todavía no ha pasado, es hoy', async () => {
    expect((await proxima(cliente, 'diaria', '20:00')).local).toBe('2026-09-15 20:00')
  })

  it('semanal: salta al próximo día pedido', async () => {
    // Martes 15 → lunes 21.
    expect((await proxima(cliente, 'semanal', '07:00', { diaSemana: 1 })).local).toBe(
      '2026-09-21 07:00',
    )
  })

  it('semanal: si es hoy y la hora no ha pasado, es hoy mismo', async () => {
    expect((await proxima(cliente, 'semanal', '20:00', { diaSemana: 2 })).local).toBe(
      '2026-09-15 20:00',
    )
  })

  it('semanal: si es hoy pero la hora ya pasó, dentro de una semana', async () => {
    expect((await proxima(cliente, 'semanal', '07:00', { diaSemana: 2 })).local).toBe(
      '2026-09-22 07:00',
    )
  })

  it('mensual: si el día de este mes ya pasó, el mes que viene', async () => {
    expect((await proxima(cliente, 'mensual', '06:00', { diaMes: 1 })).local).toBe(
      '2026-10-01 06:00',
    )
  })

  it('mensual: si todavía falta, este mismo mes', async () => {
    expect((await proxima(cliente, 'mensual', '06:00', { diaMes: 28 })).local).toBe(
      '2026-09-28 06:00',
    )
  })

  it('una vez: devuelve su fecha si está por venir', async () => {
    expect((await proxima(cliente, 'una_vez', '09:00', { fechaUnica: '2026-12-01' })).local).toBe(
      '2026-12-01 09:00',
    )
  })

  it('una vez: NULL si ya pasó — no vuelve a correr', async () => {
    expect((await proxima(cliente, 'una_vez', '09:00', { fechaUnica: '2026-01-01' })).local).toBeNull()
  })

  // ── Lo que hace que la zona horaria no sea decorativa ────────────────
  it('la misma hora local en tres zonas son tres instantes UTC distintos', async () => {
    const bogota = await proxima(cliente, 'diaria', '07:00', { zona: 'America/Bogota' })
    const madrid = await proxima(cliente, 'diaria', '07:00', { zona: 'Europe/Madrid' })
    const mexico = await proxima(cliente, 'diaria', '07:00', { zona: 'America/Mexico_City' })

    // Las tres son «las 7 de la mañana» donde viven.
    expect(bogota.local).toBe('2026-09-16 07:00')
    expect(madrid.local).toBe('2026-09-16 07:00')
    expect(mexico.local).toBe('2026-09-16 07:00')

    // Pero el cron dispara en momentos distintos. Madrid en septiembre está
    // en horario de verano (UTC+2), y ese desfase lo resuelve `at time
    // zone`, no una constante escrita a mano.
    expect(bogota.utc).toBe('2026-09-16 12:00')
    expect(madrid.utc).toBe('2026-09-16 05:00')
    expect(mexico.utc).toBe('2026-09-16 13:00')
  })
})
