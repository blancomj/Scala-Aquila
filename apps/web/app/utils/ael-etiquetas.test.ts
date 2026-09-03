/**
 * Fase 8, movimiento 03 — la capa de etiquetas del constructor visual.
 * Lo delicado acá son los códigos de CONCEPTO: los define el usuario y no
 * tienen por qué seguir la convención MAYUSCULAS_CON_GUION_BAJO, así que
 * embellecerlos a ciegas produciría nombres falsos.
 */
import { describe, expect, it } from 'vitest'
import {
  ETIQUETA_OPERADOR_BINARIO,
  esOperadorAritmetico,
  etiquetaCampo,
  etiquetaFuncion,
} from './ael-etiquetas'

describe('etiquetaCampo', () => {
  it('convierte la convención del catálogo en texto legible', () => {
    expect(etiquetaCampo('PRESUPUESTO_ANUAL')).toBe('Presupuesto anual')
    expect(etiquetaCampo('AREA_PRIVADA')).toBe('Área privada')
    expect(etiquetaCampo('COEFICIENTE')).toBe('Coeficiente de copropiedad')
  })

  it('deja intacto lo que no sigue la convención', () => {
    // Códigos de concepto reales del tenant de prueba: los escribe el usuario.
    expect(etiquetaCampo('novedad1')).toBe('novedad1')
    expect(etiquetaCampo('ALC5C')).toBe('Alc5c')
    expect(etiquetaCampo('Cuota Extra')).toBe('Cuota Extra')
  })

  it('tolera la cadena vacía', () => {
    expect(etiquetaCampo('')).toBe('')
  })
})

describe('etiquetaFuncion', () => {
  it('nombra las funciones del catálogo en legible', () => {
    expect(etiquetaFuncion('REDONDEAR_DINERO')).toBe('Redondear dinero')
    expect(etiquetaFuncion('MIN')).toBe('Mínimo')
  })
})

describe('ETIQUETA_OPERADOR_BINARIO', () => {
  it('usa los signos reales de multiplicar y dividir, no los del teclado', () => {
    expect(ETIQUETA_OPERADOR_BINARIO['*']).toBe('×')
    expect(ETIQUETA_OPERADOR_BINARIO['/']).toBe('÷')
    expect(ETIQUETA_OPERADOR_BINARIO['-']).toBe('−')
  })

  it('escribe las comparaciones en palabras', () => {
    expect(ETIQUETA_OPERADOR_BINARIO['>=']).toBe('es mayor o igual que')
    expect(ETIQUETA_OPERADOR_BINARIO['!=']).toBe('es distinto de')
  })

  it('cubre los diez operadores del lenguaje', () => {
    expect(Object.keys(ETIQUETA_OPERADOR_BINARIO)).toHaveLength(10)
  })

  it('distingue aritméticos de comparaciones', () => {
    expect(esOperadorAritmetico('+')).toBe(true)
    expect(esOperadorAritmetico('/')).toBe(true)
    expect(esOperadorAritmetico('>')).toBe(false)
    expect(esOperadorAritmetico('==')).toBe(false)
  })
})
