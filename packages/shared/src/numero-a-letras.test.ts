import { describe, expect, it } from 'vitest'
import { montoEnLetras, numeroEnteroALetras } from './numero-a-letras.js'

describe('numeroEnteroALetras', () => {
  it('cero', () => {
    expect(numeroEnteroALetras(0)).toBe('cero')
  })

  it('unidades y decenas simples', () => {
    expect(numeroEnteroALetras(1)).toBe('un')
    expect(numeroEnteroALetras(9)).toBe('nueve')
    expect(numeroEnteroALetras(10)).toBe('diez')
    expect(numeroEnteroALetras(15)).toBe('quince')
  })

  it('dieciséis a veintinueve pegados', () => {
    expect(numeroEnteroALetras(16)).toBe('dieciséis')
    expect(numeroEnteroALetras(21)).toBe('veintiún')
    expect(numeroEnteroALetras(29)).toBe('veintinueve')
  })

  it('treinta en adelante con "y"', () => {
    expect(numeroEnteroALetras(30)).toBe('treinta')
    expect(numeroEnteroALetras(31)).toBe('treinta y un')
    expect(numeroEnteroALetras(45)).toBe('cuarenta y cinco')
    expect(numeroEnteroALetras(99)).toBe('noventa y nueve')
  })

  it('cien exacto vs ciento', () => {
    expect(numeroEnteroALetras(100)).toBe('cien')
    expect(numeroEnteroALetras(101)).toBe('ciento un')
    expect(numeroEnteroALetras(199)).toBe('ciento noventa y nueve')
  })

  it('centenas compuestas', () => {
    expect(numeroEnteroALetras(200)).toBe('doscientos')
    expect(numeroEnteroALetras(500)).toBe('quinientos')
    expect(numeroEnteroALetras(999)).toBe('novecientos noventa y nueve')
  })

  it('miles', () => {
    expect(numeroEnteroALetras(1000)).toBe('mil')
    expect(numeroEnteroALetras(1001)).toBe('mil un')
    expect(numeroEnteroALetras(2000)).toBe('dos mil')
    expect(numeroEnteroALetras(21000)).toBe('veintiún mil')
    expect(numeroEnteroALetras(100000)).toBe('cien mil')
    expect(numeroEnteroALetras(999999)).toBe(
      'novecientos noventa y nueve mil novecientos noventa y nueve',
    )
  })

  it('millones', () => {
    expect(numeroEnteroALetras(1000000)).toBe('un millón')
    expect(numeroEnteroALetras(2000000)).toBe('dos millones')
    expect(numeroEnteroALetras(1500000)).toBe('un millón quinientos mil')
    expect(numeroEnteroALetras(250000000)).toBe('doscientos cincuenta millones')
  })

  it('caso real de una cuota de administración', () => {
    expect(numeroEnteroALetras(420000)).toBe('cuatrocientos veinte mil')
    expect(numeroEnteroALetras(100000)).toBe('cien mil')
  })

  it('rechaza negativos y no enteros', () => {
    expect(() => numeroEnteroALetras(-1)).toThrow()
    expect(() => numeroEnteroALetras(1.5)).toThrow()
  })

  it('rechaza fuera de rango', () => {
    expect(() => numeroEnteroALetras(1_000_000_000_000)).toThrow()
  })
})

describe('montoEnLetras', () => {
  it('monto exacto del mockup oficial (recibo_caja.html)', () => {
    expect(montoEnLetras(100000)).toBe('Cien mil pesos M/CTE')
  })

  it('un peso singular', () => {
    expect(montoEnLetras(1)).toBe('Un peso M/CTE')
  })

  it('cero pesos', () => {
    expect(montoEnLetras(0)).toBe('Cero pesos M/CTE')
  })

  it('con centavos', () => {
    expect(montoEnLetras(100000.5)).toBe('Cien mil pesos con cincuenta centavos M/CTE')
  })

  it('un centavo singular', () => {
    expect(montoEnLetras(0.01)).toBe('Cero pesos con un centavo M/CTE')
  })

  it('monto de liquidación real', () => {
    expect(montoEnLetras(420000)).toBe('Cuatrocientos veinte mil pesos M/CTE')
  })

  it('evita el error de coma flotante (0.1 + 0.2)', () => {
    expect(montoEnLetras(204615)).toBe('Doscientos cuatro mil seiscientos quince pesos M/CTE')
  })

  it('rechaza negativos', () => {
    expect(() => montoEnLetras(-100)).toThrow()
  })
})
