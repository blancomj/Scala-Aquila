/**
 * F4, movimiento 11 — la frase que describe una fórmula. Lo que estos tests
 * cuidan es que la frase no MIENTA: sobre todo el agrupamiento, porque una
 * descripción que pierde los paréntesis describe otra fórmula.
 */
import { describe, expect, it } from 'vitest'
import { parsear } from '@aquila/ael-language'
import { resumirRegla } from './ael-resumen'

function resumir(fuente: string): string | null {
  const { regla } = parsear(fuente)
  if (!regla) throw new Error(`la fuente de prueba no parsea: ${fuente}`)
  return resumirRegla(regla)
}

describe('resumirRegla', () => {
  it('describe un cálculo y su resultado', () => {
    expect(resumir('REGLA r\nDEFINIR base = 100\nRETORNAR base')).toBe(
      'Calcula base como 100; el resultado es base.',
    )
  })

  it('lee los operadores como se dicen en voz alta', () => {
    expect(resumir('REGLA r\nRETORNAR 10 * 3')).toBe('El resultado es 10 por 3.')
    expect(resumir('REGLA r\nRETORNAR 10 / 3')).toBe('El resultado es 10 dividido entre 3.')
  })

  it('conserva el agrupamiento cuando cambia el significado', () => {
    expect(resumir('REGLA r\nRETORNAR (100 - 40) / 12')).toContain('(100 menos 40) dividido entre 12')
    expect(resumir('REGLA r\nRETORNAR 100 - 40 / 12')).toContain('100 menos 40 dividido entre 12')
  })

  it('agrupa el lado derecho de igual precedencia — asociatividad izquierda', () => {
    expect(resumir('REGLA r\nRETORNAR 100 - (40 - 12)')).toContain('100 menos (40 menos 12)')
  })

  it('nombra los datos del sistema en legible', () => {
    const frase = resumir('REGLA r\nRETORNAR PARAMETER.PRESUPUESTO_ANUAL')
    expect(frase).toBe('El resultado es presupuesto anual.')
  })

  it('aclara que un campo de UNIT es del inmueble', () => {
    expect(resumir('REGLA r\nRETORNAR UNIT.COEFICIENTE')).toContain('coeficiente de copropiedad del inmueble')
  })

  it('cita el código de un concepto en vez de embellecerlo', () => {
    expect(resumir('REGLA r\nRETORNAR CONCEPTO.CUOTA_ADMIN')).toContain('el concepto «CUOTA_ADMIN»')
  })

  it('da lectura natural a las funciones del catálogo', () => {
    expect(resumir('REGLA r\nRETORNAR MIN(2, 3)')).toContain('el menor entre 2 y 3')
    expect(resumir('REGLA r\nRETORNAR PORCENTAJE(1000, 16)')).toContain('el 16% de 1000')
    expect(resumir('REGLA r\nRETORNAR REDONDEAR_DINERO(500, 0)')).toContain(
      '500 redondeado a 0 decimales',
    )
  })

  it('cae con elegancia en una función desconocida', () => {
    // No está en el catálogo de lecturas naturales: se describe igual, sin romper.
    expect(resumir('REGLA r\nRETORNAR OTRA_COSA(1, 2)')).toContain('otra cosa de 1 y 2')
  })

  it('describe las dos ramas de un condicional', () => {
    const frase = resumir(
      ['REGLA r', 'SI UNIT.AREA_PRIVADA > 80 ENTONCES', 'RETORNAR 1', 'SINO', 'RETORNAR 2', 'FIN'].join('\n'),
    )
    expect(frase).toContain('Si área privada del inmueble es mayor que 80')
    expect(frase).toContain('el resultado es 1')
    expect(frase).toContain('de lo contrario, el resultado es 2')
  })

  it('omite la rama alterna cuando no existe', () => {
    const frase = resumir(['REGLA r', 'SI VERDADERO ENTONCES', 'RETORNAR 1', 'FIN'].join('\n'))
    expect(frase).not.toContain('de lo contrario')
  })

  it('devuelve null para una fórmula sin instrucciones', () => {
    const { regla } = parsear('REGLA vacia')
    expect(resumirRegla(regla!)).toBeNull()
  })

  it('describe la fórmula real de una cuota de administración', () => {
    const frase = resumir(
      [
        'REGLA cuota',
        'DEFINIR base = (PARAMETER.PRESUPUESTO_ANUAL - PARAMETER.OTROS_INGRESOS_ANUAL) / 12',
        'RETORNAR REDONDEAR_DINERO(base * UNIT.COEFICIENTE, 0)',
      ].join('\n'),
    )
    expect(frase).toBe(
      'Calcula base como (presupuesto anual menos otros ingresos anuales) dividido entre 12; ' +
        'el resultado es base por coeficiente de copropiedad del inmueble redondeado a 0 decimales.',
    )
  })
})
