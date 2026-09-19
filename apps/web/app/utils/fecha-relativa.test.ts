import { describe, expect, it } from 'vitest'
import {
  diasDesdeHoy,
  parsearFechaLocal,
  relativoConVencimiento,
  relativoCorto,
  textoDias,
} from './fecha-relativa'

describe('parsearFechaLocal', () => {
  it('construye una fecha en medianoche LOCAL, no UTC', () => {
    const fecha = parsearFechaLocal('2026-10-05')
    expect(fecha.getFullYear()).toBe(2026)
    expect(fecha.getMonth()).toBe(9) // octubre = índice 9
    expect(fecha.getDate()).toBe(5)
    expect(fecha.getHours()).toBe(0)
  })

  it('acepta un ISO con hora y toma solo la fecha', () => {
    const fecha = parsearFechaLocal('2026-10-05T23:50:00.000Z')
    expect(fecha.getDate()).toBe(5)
  })
})

describe('diasDesdeHoy', () => {
  const ahora = new Date(2026, 8, 18, 23, 0, 0) // 18 sep 2026, 11pm local

  it('da 0 cuando la fecha es hoy, sin importar la hora del día', () => {
    expect(diasDesdeHoy('2026-09-18', ahora)).toBe(0)
  })

  it('da positivo cuando la fecha es futura', () => {
    expect(diasDesdeHoy('2026-09-30', ahora)).toBe(12)
  })

  it('da negativo cuando la fecha ya pasó', () => {
    expect(diasDesdeHoy('2026-09-10', ahora)).toBe(-8)
  })

  it('no retrocede un día por el corrimiento UTC de un date puro cerca de medianoche', () => {
    // Caso exacto de la advertencia del prompt: `new Date('2026-10-05')` se
    // parsea como UTC y en Colombia (UTC−5) da 4 de octubre — esta función
    // no debe reproducir ese bug.
    const finDeMes = new Date(2026, 9, 4, 23, 30, 0) // 4 oct, 23:30 local
    expect(diasDesdeHoy('2026-10-05', finDeMes)).toBe(1)
  })
})

describe('textoDias', () => {
  it('dice "hoy" cuando dias es 0', () => {
    expect(textoDias(0, 'en', 'hace')).toBe('hoy')
  })

  it('usa el sufijo de futuro y pluraliza', () => {
    expect(textoDias(1, 'en', 'hace')).toBe('en 1 día')
    expect(textoDias(5, 'en', 'hace')).toBe('en 5 días')
  })

  it('usa el sufijo de pasado con el valor absoluto', () => {
    expect(textoDias(-1, 'en', 'hace')).toBe('hace 1 día')
    expect(textoDias(-9, 'en', 'hace')).toBe('hace 9 días')
  })
})

describe('relativoCorto', () => {
  it('redondea a minutos por debajo de una hora', () => {
    const ahora = new Date('2026-09-18T12:00:00Z')
    const hace5min = new Date('2026-09-18T11:55:00Z').toISOString()
    expect(relativoCorto(hace5min, ahora)).toBe('hace 5 minutos')
  })

  it('dice "hace un momento" por debajo de un minuto', () => {
    const ahora = new Date('2026-09-18T12:00:00Z')
    const hace20seg = new Date('2026-09-18T11:59:40Z').toISOString()
    expect(relativoCorto(hace20seg, ahora)).toBe('hace un momento')
  })

  it('pasa a horas y luego a días', () => {
    const ahora = new Date('2026-09-18T12:00:00Z')
    expect(relativoCorto(new Date('2026-09-18T09:00:00Z').toISOString(), ahora)).toBe('hace 3 horas')
    expect(relativoCorto(new Date('2026-09-15T12:00:00Z').toISOString(), ahora)).toBe('hace 3 días')
  })
})

describe('relativoConVencimiento', () => {
  const ahora = new Date('2026-09-18T12:00:00Z')

  it('marca vencido=true y "venció hace" cuando la fecha ya pasó', () => {
    const resultado = relativoConVencimiento(new Date('2026-09-18T10:00:00Z').toISOString(), ahora)
    expect(resultado.vencido).toBe(true)
    expect(resultado.texto).toBe('venció hace 2 horas')
  })

  it('marca vencido=false y "vence en" cuando la fecha es futura', () => {
    const resultado = relativoConVencimiento(new Date('2026-09-20T12:00:00Z').toISOString(), ahora)
    expect(resultado.vencido).toBe(false)
    expect(resultado.texto).toBe('vence en 2 días')
  })
})
