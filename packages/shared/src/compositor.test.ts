import { describe, expect, it } from 'vitest'
import {
  COMPOSITOR_FIELD_REGISTRY,
  validateCompositorBody,
  renderCompositorPreview,
} from './compositor.js'
import { EmailValidationError } from './email.js'

describe('COMPOSITOR_FIELD_REGISTRY', () => {
  it('contiene los campos esperados', () => {
    const campos = COMPOSITOR_FIELD_REGISTRY.map((c) => c.field)
    expect(campos).toContain('nombreDestinatario')
    expect(campos).toContain('inmuebleCodigo')
    expect(campos).toContain('saldoPendiente')
    expect(campos).toContain('fechaActual')
    expect(campos).toContain('remitenteNombre')
  })

  it('cada campo tiene sample y description', () => {
    for (const campo of COMPOSITOR_FIELD_REGISTRY) {
      expect(campo.sample.length).toBeGreaterThan(0)
      expect(campo.description.length).toBeGreaterThan(0)
    }
  })
})

describe('validateCompositorBody', () => {
  it('acepta asunto+cuerpo con solo campos válidos del registro', () => {
    expect(() => {
      validateCompositorBody(
        'Saldo pendiente — {{ params.inmuebleCodigo }}',
        'Estimado {{ params.nombreDestinatario }}, su saldo es {{ params.saldoPendiente }}.',
      )
    }).not.toThrow()
  })

  it('cuerpo muy corto → COMPOSITOR_BODY_TOO_SHORT', () => {
    try {
      validateCompositorBody('asunto', 'corto')
      throw new Error('debía lanzar')
    } catch (e) {
      expect(e).toBeInstanceOf(EmailValidationError)
      expect((e as EmailValidationError).code).toBe('COMPOSITOR_BODY_TOO_SHORT')
    }
  })

  it('{{ campo }} sin prefijo params. → COMPOSITOR_MISSING_PARAMS_PREFIX', () => {
    try {
      validateCompositorBody('asunto', 'Hola {{ nombreDestinatario }}, cuerpo largo suficiente')
      throw new Error('debía lanzar')
    } catch (e) {
      expect(e).toBeInstanceOf(EmailValidationError)
      expect((e as EmailValidationError).code).toBe('COMPOSITOR_MISSING_PARAMS_PREFIX')
      expect((e as EmailValidationError).message).toContain('params.nombreDestinatario')
    }
  })

  it('campo desconocido → COMPOSITOR_UNKNOWN_FIELDS', () => {
    try {
      validateCompositorBody(
        'asunto',
        'Hola {{ params.nombreDestinatario }}, {{ params.campoInventado }} cuerpo largo',
      )
      throw new Error('debía lanzar')
    } catch (e) {
      expect(e).toBeInstanceOf(EmailValidationError)
      expect((e as EmailValidationError).code).toBe('COMPOSITOR_UNKNOWN_FIELDS')
      expect((e as EmailValidationError).message).toContain('campoInventado')
    }
  })

  it('el asunto también se valida', () => {
    try {
      validateCompositorBody('Asunto {{ params.campoFalso }}', 'Cuerpo largo válido con texto')
      throw new Error('debía lanzar')
    } catch (e) {
      expect(e).toBeInstanceOf(EmailValidationError)
      expect((e as EmailValidationError).code).toBe('COMPOSITOR_UNKNOWN_FIELDS')
      expect((e as EmailValidationError).message).toContain('campoFalso')
    }
  })

  it('sin campos params. en absoluto → válido (texto libre sin variables)', () => {
    expect(() => {
      validateCompositorBody(
        'Recordatorio de pago',
        'Estimado propietario, le recordamos que tiene un saldo pendiente. Comuníquese con la administración.',
      )
    }).not.toThrow()
  })
})

describe('renderCompositorPreview', () => {
  it('sustituye los campos con los valores provistos', () => {
    const resultado = renderCompositorPreview(
      'Saldo — {{ params.inmuebleCodigo }}',
      '<p>Hola {{ params.nombreDestinatario }}</p>',
      { inmuebleCodigo: 'Apto 302', nombreDestinatario: 'Juan Pérez' },
    )
    expect(resultado.subject).toBe('Saldo — Apto 302')
    expect(resultado.html).toBe('<p>Hola Juan Pérez</p>')
  })

  it('deja el marcador visible cuando falta el valor', () => {
    const resultado = renderCompositorPreview(
      'Saldo — {{ params.inmuebleCodigo }}',
      '<p>Hola {{ params.nombreDestinatario }}</p>',
      {},
    )
    expect(resultado.subject).toBe('Saldo — {{ params.inmuebleCodigo }}')
    expect(resultado.html).toBe('<p>Hola {{ params.nombreDestinatario }}</p>')
  })

  it('ignora {{ campo }} sin prefijo params.', () => {
    const resultado = renderCompositorPreview(
      'Asunto',
      '<p>{{ nombre }}</p>',
      { nombre: 'Juan' },
    )
    expect(resultado.html).toBe('<p>{{ nombre }}</p>')
  })
})
