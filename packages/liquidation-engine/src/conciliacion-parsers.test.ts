/**
 * Fixtures SINTÉTICOS — no verificados contra un extracto real de
 * Bancolombia. Ver el comentario de cabecera de conciliacion-parsers.ts.
 * Estos tests prueban la MECÁNICA (detección, parseo de columnas, hash,
 * idempotencia), no que el formato coincida con lo que Bancolombia entrega
 * de verdad.
 */
import { describe, expect, it } from 'vitest'
import {
  detectarParser,
  formatosSoportados,
  hashArchivo,
  hashLinea,
  parserBancolombia,
  type LineaCruda,
} from './conciliacion-parsers.js'

const EXTRACTO_SINTETICO = [
  'Fecha,Descripción,Referencia,Valor',
  '15/03/2027,TRANSFERENCIA LARELES-APT101-202703-9F3A21B4,9F3A21B4,"250.000,00"',
  '16/03/2027,COMISION MANEJO CUENTA,,"-15.500,00"',
  '17/03/2027,PAGO PSE JUAN PEREZ,REF998877,"180.000,00"',
].join('\n')

describe('parserBancolombia', () => {
  it('detecta su propio formato por el encabezado', () => {
    expect(parserBancolombia.detecta(EXTRACTO_SINTETICO)).toBe(true)
  })

  it('no reconoce un archivo de otro formato', () => {
    const otro = 'Column A;Column B;Column C\n1;2;3'
    expect(parserBancolombia.detecta(otro)).toBe(false)
    expect(detectarParser(otro)).toBeNull()
  })

  it('parsea fecha, monto (con signo), descripción y referencia', () => {
    const lineas = parserBancolombia.parsea(EXTRACTO_SINTETICO)
    expect(lineas).toHaveLength(3)
    expect(lineas[0]).toEqual({
      fechaMovimiento: '2027-03-15',
      monto: 250_000,
      descripcionBanco: 'TRANSFERENCIA LARELES-APT101-202703-9F3A21B4',
      referenciaBanco: '9F3A21B4',
    })
    // El débito (comisión) conserva el signo negativo — §6.3: nunca es
    // candidato a pago, pero el parser no lo filtra, solo lo reporta crudo.
    expect(lineas[1]?.monto).toBe(-15_500)
    expect(lineas[1]?.referenciaBanco).toBeNull()
  })

  it('archivo corrupto (sin las columnas esperadas) falla con mensaje claro', () => {
    const corrupto = 'A,B,C\n1,2,3'
    // No detecta este archivo como suyo — el llamador no debería ni invocar
    // parsea() en ese caso, pero si lo hace, falla explícito, no adivina.
    expect(parserBancolombia.detecta(corrupto)).toBe(false)
    expect(() => parserBancolombia.parsea(corrupto)).toThrow(/columnas esperadas/)
  })

  it('registra al menos un formato soportado', () => {
    expect(formatosSoportados().length).toBeGreaterThan(0)
  })
})

describe('idempotencia por hash', () => {
  it('hashArchivo es estable para el mismo contenido', () => {
    expect(hashArchivo(EXTRACTO_SINTETICO)).toBe(hashArchivo(EXTRACTO_SINTETICO))
  })

  it('hashArchivo cambia si el contenido cambia', () => {
    expect(hashArchivo(EXTRACTO_SINTETICO)).not.toBe(hashArchivo(EXTRACTO_SINTETICO + '\n'))
  })

  it('hashLinea es estable ante espacios extra en la descripción', () => {
    const a: LineaCruda = {
      fechaMovimiento: '2027-03-15',
      monto: 100,
      descripcionBanco: 'PAGO  RESIDENTE',
      referenciaBanco: null,
    }
    const b: LineaCruda = { ...a, descripcionBanco: 'PAGO RESIDENTE' }
    expect(hashLinea(a)).toBe(hashLinea(b))
  })

  it('hashLinea cambia si cambia el monto', () => {
    const a: LineaCruda = {
      fechaMovimiento: '2027-03-15',
      monto: 100,
      descripcionBanco: 'x',
      referenciaBanco: null,
    }
    const b: LineaCruda = { ...a, monto: 100.01 }
    expect(hashLinea(a)).not.toBe(hashLinea(b))
  })

  it('hashLinea cambia si cambia la referencia', () => {
    const a: LineaCruda = {
      fechaMovimiento: '2027-03-15',
      monto: 100,
      descripcionBanco: 'x',
      referenciaBanco: 'ref-1',
    }
    const b: LineaCruda = { ...a, referenciaBanco: 'ref-2' }
    expect(hashLinea(a)).not.toBe(hashLinea(b))
  })
})
