import { describe, expect, it } from 'vitest'
import {
  calculateSmsSegments,
  esTelefonoValido,
  extraerCamposPlantilla,
  renderSmsTemplate,
  SmsValidationError,
  validateSmsTemplateBody,
} from './sms.js'

describe('renderSmsTemplate', () => {
  it('sustituye variables presentes en params', () => {
    expect(
      renderSmsTemplate('Hola {nombreResidente}, saldo {saldoPendiente}', {
        nombreResidente: 'Ana',
        saldoPendiente: '$100',
      }),
    ).toBe('Hola Ana, saldo $100')
  })

  it('deja el marcador visible cuando falta el valor (no un hueco silencioso)', () => {
    expect(renderSmsTemplate('Hola {nombreResidente}, tu reserva', {})).toBe(
      'Hola {nombreResidente}, tu reserva',
    )
  })
})

describe('extraerCamposPlantilla', () => {
  it('extrae todas las variables en orden de aparición', () => {
    expect(extraerCamposPlantilla('{a} texto {b} más {a}')).toEqual(['a', 'b', 'a'])
  })

  it('cuerpo sin variables → arreglo vacío', () => {
    expect(extraerCamposPlantilla('sin variables aquí')).toEqual([])
  })
})

describe('calculateSmsSegments', () => {
  it('160 caracteres GSM-7 → 1 segmento', () => {
    const { encoding, segments } = calculateSmsSegments('a'.repeat(160))
    expect(encoding).toBe('GSM-7')
    expect(segments).toBe(1)
  })

  it('161 caracteres GSM-7 → 2 segmentos', () => {
    expect(calculateSmsSegments('a'.repeat(161)).segments).toBe(2)
  })

  it('70 caracteres con una "ñ" (UCS-2) → 1 segmento', () => {
    const texto = `${'a'.repeat(69)}ñ`
    const { encoding, segments } = calculateSmsSegments(texto)
    expect(encoding).toBe('UCS-2')
    expect(segments).toBe(1)
  })

  it('71 caracteres con una "ñ" (UCS-2) → 2 segmentos', () => {
    expect(calculateSmsSegments(`${'a'.repeat(70)}ñ`).segments).toBe(2)
  })

  it('el mismo texto de 100 caracteres: sin "ñ" es 1 segmento, con "ñ" son 2', () => {
    expect(calculateSmsSegments('a'.repeat(100)).segments).toBe(1)
    expect(calculateSmsSegments(`${'a'.repeat(99)}ñ`).segments).toBe(2)
  })

  it('texto vacío → 1 segmento (mínimo)', () => {
    expect(calculateSmsSegments('').segments).toBe(1)
  })
})

describe('esTelefonoValido (E.164)', () => {
  it('acepta un número con + e indicativo', () => {
    expect(esTelefonoValido('+573001234567')).toBe(true)
  })

  it('rechaza un número local sin +', () => {
    expect(esTelefonoValido('3001234567')).toBe(false)
  })

  it('rechaza un + sin dígitos suficientes', () => {
    expect(esTelefonoValido('+123')).toBe(false)
  })

  it('rechaza que empiece en 0 tras el +', () => {
    expect(esTelefonoValido('+0123456789')).toBe(false)
  })
})

describe('validateSmsTemplateBody', () => {
  it('acepta un cuerpo con solo campos válidos del evento', () => {
    expect(() => {
      validateSmsTemplateBody(
        'cartera_recordatorio_pago',
        'Hola {nombreResidente}, debes {saldoPendiente}',
      )
    }).not.toThrow()
  })

  it('evento desconocido → SMS_UNKNOWN_EVENT', () => {
    try {
      validateSmsTemplateBody('evento_inexistente', 'hola')
      throw new Error('debía lanzar')
    } catch (e) {
      expect(e).toBeInstanceOf(SmsValidationError)
      expect((e as SmsValidationError).code).toBe('SMS_UNKNOWN_EVENT')
    }
  })

  it('cuerpo de 481 caracteres → SMS_BODY_TOO_LONG, nombra el exceso', () => {
    try {
      validateSmsTemplateBody('cartera_recordatorio_pago', 'a'.repeat(481))
      throw new Error('debía lanzar')
    } catch (e) {
      expect(e).toBeInstanceOf(SmsValidationError)
      expect((e as SmsValidationError).code).toBe('SMS_BODY_TOO_LONG')
      expect((e as SmsValidationError).message).toContain('1')
    }
  })

  it('cuerpo de 480 caracteres exactos → válido (límite inclusive)', () => {
    expect(() => {
      validateSmsTemplateBody('cartera_recordatorio_pago', 'a'.repeat(480))
    }).not.toThrow()
  })

  it('campo de otro evento pegado por error → SMS_UNKNOWN_FIELDS, los nombra', () => {
    try {
      validateSmsTemplateBody('cartera_recordatorio_pago', 'Hola {nombreResidente}, {diasMora}')
      throw new Error('debía lanzar')
    } catch (e) {
      expect(e).toBeInstanceOf(SmsValidationError)
      expect((e as SmsValidationError).code).toBe('SMS_UNKNOWN_FIELDS')
      expect((e as SmsValidationError).message).toContain('diasMora')
    }
  })
})
