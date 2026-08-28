import { describe, expect, it } from 'vitest'
import { formaPagoDeMetodo } from './metodo-forma-pago.js'

describe('mapeo método de pasarela → código FORMA_PAGO', () => {
  it.each([
    ['PSE', 'pse'],
    ['pse', 'pse'],
    ['CARD', 'tarjeta_credito'],
    ['DEBIT_CARD', 'tarjeta_debito'],
    ['NEQUI', 'nequi'],
    ['EFECTY', 'corresponsal_bancario'],
    ['BALOTO', 'corresponsal_bancario'],
    ['BANCOLOMBIA_TRANSFER', 'transferencia_bancaria'],
  ])('%s → %s', (reportado, esperado) => {
    expect(formaPagoDeMetodo(reportado)).toBe(esperado)
  })

  it('tolera espacios y mayúsculas', () => {
    expect(formaPagoDeMetodo('  Nequi  ')).toBe('nequi')
  })

  it('devuelve null ante un método desconocido, no adivina', () => {
    // Adivinar aquí desviaría la contabilidad de caja a la cuenta equivocada:
    // el llamador debe tratarlo como incidente.
    expect(formaPagoDeMetodo('cripto_lunar')).toBeNull()
    expect(formaPagoDeMetodo('')).toBeNull()
  })
})
