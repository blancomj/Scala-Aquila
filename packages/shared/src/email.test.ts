import { describe, expect, it } from 'vitest'
import {
  EmailValidationError,
  extraerCamposPlantillaEmail,
  extraerCamposSinPrefijo,
  filtrarOverridesValidos,
  renderEmailTemplate,
  validateEmailTemplateBody,
} from './email.js'

describe('renderEmailTemplate', () => {
  it('sustituye variables con prefijo params. presentes en params', () => {
    expect(
      renderEmailTemplate('Hola {{ params.nombreResidente }}, saldo {{ params.saldoPendiente }}', {
        nombreResidente: 'Ana',
        saldoPendiente: '$100',
      }),
    ).toBe('Hola Ana, saldo $100')
  })

  it('deja el marcador visible cuando falta el valor (no un hueco silencioso)', () => {
    expect(renderEmailTemplate('Hola {{ params.nombreResidente }}', {})).toBe(
      'Hola {{ params.nombreResidente }}',
    )
  })

  it('ignora {{ campo }} sin el prefijo params. (no lo sustituye)', () => {
    expect(renderEmailTemplate('Hola {{ nombreResidente }}', { nombreResidente: 'Ana' })).toBe(
      'Hola {{ nombreResidente }}',
    )
  })
})

describe('extraerCamposPlantillaEmail', () => {
  it('extrae solo los campos con prefijo params.', () => {
    expect(extraerCamposPlantillaEmail('{{ params.a }} texto {{ params.b }}')).toEqual(['a', 'b'])
  })

  it('no confunde un campo sin prefijo con uno válido', () => {
    expect(extraerCamposPlantillaEmail('{{ a }} {{ params.b }}')).toEqual(['b'])
  })
})

describe('extraerCamposSinPrefijo', () => {
  it('detecta {{ campo }} sin params. — trampa real documentada en el spec', () => {
    expect(extraerCamposSinPrefijo('Hola {{ guestName }}')).toEqual(['guestName'])
  })

  it('no marca como sin-prefijo lo que sí tiene params.', () => {
    expect(extraerCamposSinPrefijo('Hola {{ params.nombreResidente }}')).toEqual([])
  })

  it('deduplica repetidos', () => {
    expect(extraerCamposSinPrefijo('{{ a }} y otra vez {{ a }}')).toEqual(['a'])
  })
})

describe('validateEmailTemplateBody', () => {
  it('acepta asunto+cuerpo con solo campos válidos del evento', () => {
    expect(() => {
      validateEmailTemplateBody(
        'cartera_recordatorio_pago',
        'Recordatorio para {{ params.inmueble }}',
        'Hola {{ params.nombreResidente }}, debes {{ params.saldoPendiente }} antes de {{ params.fechaVencimiento }}',
      )
    }).not.toThrow()
  })

  it('evento desconocido → EMAIL_UNKNOWN_EVENT', () => {
    try {
      validateEmailTemplateBody('evento_inexistente', 'asunto', 'cuerpo largo de verdad')
      throw new Error('debía lanzar')
    } catch (e) {
      expect(e).toBeInstanceOf(EmailValidationError)
      expect((e as EmailValidationError).code).toBe('EMAIL_UNKNOWN_EVENT')
    }
  })

  it('cuerpo muy corto → EMAIL_BODY_TOO_SHORT', () => {
    try {
      validateEmailTemplateBody('cartera_recordatorio_pago', 'asunto', 'corto')
      throw new Error('debía lanzar')
    } catch (e) {
      expect(e).toBeInstanceOf(EmailValidationError)
      expect((e as EmailValidationError).code).toBe('EMAIL_BODY_TOO_SHORT')
    }
  })

  it('{{ campo }} sin prefijo params. → EMAIL_MISSING_PARAMS_PREFIX, antes que UNKNOWN_FIELDS', () => {
    try {
      validateEmailTemplateBody('cartera_recordatorio_pago', 'asunto', 'Hola {{ nombreResidente }}, cuerpo largo')
      throw new Error('debía lanzar')
    } catch (e) {
      expect(e).toBeInstanceOf(EmailValidationError)
      expect((e as EmailValidationError).code).toBe('EMAIL_MISSING_PARAMS_PREFIX')
      expect((e as EmailValidationError).message).toContain('params.nombreResidente')
    }
  })

  it('el asunto también se valida — un campo desconocido solo ahí también rechaza', () => {
    try {
      validateEmailTemplateBody('cartera_recordatorio_pago', 'Asunto con {{ params.diasMora }}', 'Cuerpo largo válido')
      throw new Error('debía lanzar')
    } catch (e) {
      expect(e).toBeInstanceOf(EmailValidationError)
      expect((e as EmailValidationError).code).toBe('EMAIL_UNKNOWN_FIELDS')
      expect((e as EmailValidationError).message).toContain('diasMora')
    }
  })

  it('campo de otro evento pegado por error → EMAIL_UNKNOWN_FIELDS, los nombra', () => {
    try {
      validateEmailTemplateBody(
        'cartera_recordatorio_pago',
        'asunto',
        'Hola {{ params.nombreResidente }}, {{ params.diasMora }}',
      )
      throw new Error('debía lanzar')
    } catch (e) {
      expect(e).toBeInstanceOf(EmailValidationError)
      expect((e as EmailValidationError).code).toBe('EMAIL_UNKNOWN_FIELDS')
      expect((e as EmailValidationError).message).toContain('diasMora')
    }
  })
})

describe('filtrarOverridesValidos', () => {
  it('mantiene solo los campos declarados en el registro del evento', () => {
    expect(
      filtrarOverridesValidos('cartera_recordatorio_pago', {
        nombreResidente: 'Carlos',
        campoInventado: 'x',
      }),
    ).toEqual({ nombreResidente: 'Carlos' })
  })

  it('evento sin campos registrados → todo se filtra', () => {
    expect(filtrarOverridesValidos('evento_inexistente', { a: 'b' })).toEqual({})
  })
})
