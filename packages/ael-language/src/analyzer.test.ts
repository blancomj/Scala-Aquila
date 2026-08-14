import { describe, expect, it } from 'vitest'
import { analizar, type CatalogoContratos } from './analyzer.js'
import { parsear } from './parser.js'

const CATALOGO: CatalogoContratos = {
  PARAMETER: {
    PRESUPUESTO_ANUAL: 'MONEY',
    OTROS_INGRESOS_ANUAL: 'MONEY',
    DESCUENTO_PRONTO_PAGO: 'NUMBER',
    INTERES_DIAS_GRACIA: 'NUMBER',
    INTERES_BASE_DIAS: 'NUMBER',
    INTERES_TASA_MENSUAL: 'NUMBER',
    INTERES_TOPE_MENSUAL: 'NUMBER',
  },
  UNIT: {
    PAGO_OPORTUNO: 'BOOLEAN',
    SALDO_VENCIDO: 'MONEY',
    DIAS_MORA: 'NUMBER',
  },
  CONCEPTO: {
    CUOTA_BASICA: 'MONEY',
  },
}

function analizarFuente(fuente: string, catalogo: CatalogoContratos = CATALOGO) {
  const { regla } = parsear(fuente)
  if (!regla) throw new Error('la fuente no parseó — revisa el test')
  return analizar(regla, catalogo)
}

describe('analizar — tipos de literales', () => {
  it('NUMBER, MONEY, BOOLEAN, NULO', () => {
    expect(analizarFuente('REGLA X\nRETORNAR 1').tipoRetorno).toBe('NUMBER')
    expect(analizarFuente('REGLA X\nRETORNAR 1 COP').tipoRetorno).toBe('MONEY')
    expect(analizarFuente('REGLA X\nRETORNAR VERDADERO').tipoRetorno).toBe('BOOLEAN')
    expect(analizarFuente('REGLA X\nRETORNAR NULO').tipoRetorno).toBe('NULO')
  })
})

describe('analizar — variables (02 §19-21)', () => {
  it('una variable declarada tiene el tipo de su expresión', () => {
    const r = analizarFuente('REGLA X\nDEFINIR a = 1 COP\nRETORNAR a')
    expect(r.diagnosticos).toHaveLength(0)
    expect(r.tipoRetorno).toBe('MONEY')
  })

  it('AEL-ANALYZER-UNDEFINED al usar una variable no declarada', () => {
    const r = analizarFuente('REGLA X\nRETORNAR no_existe')
    expect(r.diagnosticos[0]?.codigo).toBe('AEL-ANALYZER-UNDEFINED')
  })

  it('AEL-ANALYZER-REDECLARATION al redeclarar (02 §21)', () => {
    const r = analizarFuente('REGLA X\nDEFINIR a = 1\nDEFINIR a = 2\nRETORNAR a')
    expect(r.diagnosticos.some((d) => d.codigo === 'AEL-ANALYZER-REDECLARATION')).toBe(true)
  })
})

describe('analizar — Contracts (01 §22-23)', () => {
  it('resuelve PARAMETER.X, UNIT.X, CONCEPTO.X contra el catálogo', () => {
    const r = analizarFuente('REGLA X\nRETORNAR PARAMETER.PRESUPUESTO_ANUAL')
    expect(r.diagnosticos).toHaveLength(0)
    expect(r.tipoRetorno).toBe('MONEY')
  })

  it('AEL-ANALYZER-UNKNOWN_CONTRACT para un Contract no registrado', () => {
    const r = analizarFuente('REGLA X\nRETORNAR DESCONOCIDO.X')
    expect(r.diagnosticos[0]?.codigo).toBe('AEL-ANALYZER-UNKNOWN_CONTRACT')
  })

  it('AEL-ANALYZER-UNKNOWN_CONTRACT_FIELD para un campo no registrado', () => {
    const r = analizarFuente('REGLA X\nRETORNAR PARAMETER.NO_EXISTE')
    expect(r.diagnosticos[0]?.codigo).toBe('AEL-ANALYZER-UNKNOWN_CONTRACT_FIELD')
  })
})

describe('analizar — funciones (01 §21)', () => {
  it('MIN/MAX: NUMBER,NUMBER → NUMBER', () => {
    const r = analizarFuente('REGLA X\nRETORNAR MIN(1, 2)')
    expect(r.diagnosticos).toHaveLength(0)
    expect(r.tipoRetorno).toBe('NUMBER')
  })

  it('PORCENTAJE: MONEY,NUMBER → MONEY', () => {
    const r = analizarFuente('REGLA X\nRETORNAR PORCENTAJE(100 COP, 0.1)')
    expect(r.diagnosticos).toHaveLength(0)
    expect(r.tipoRetorno).toBe('MONEY')
  })

  it('AEL-ANALYZER-UNKNOWN_FUNCTION', () => {
    const r = analizarFuente('REGLA X\nRETORNAR NOEXISTE(1)')
    expect(r.diagnosticos[0]?.codigo).toBe('AEL-ANALYZER-UNKNOWN_FUNCTION')
  })

  it('AEL-ANALYZER-ARITY_MISMATCH', () => {
    const r = analizarFuente('REGLA X\nRETORNAR MIN(1)')
    expect(r.diagnosticos[0]?.codigo).toBe('AEL-ANALYZER-ARITY_MISMATCH')
  })

  it('AEL-TYPE-ARGUMENT_MISMATCH', () => {
    const r = analizarFuente('REGLA X\nRETORNAR MIN(1 COP, 2)')
    expect(r.diagnosticos[0]?.codigo).toBe('AEL-TYPE-ARGUMENT_MISMATCH')
  })

  it('REDONDEAR_DINERO: MONEY,NUMBER → MONEY (07 §"FUNCTION EXAMPLE")', () => {
    const r = analizarFuente('REGLA X\nRETORNAR REDONDEAR_DINERO(100 COP, 0)')
    expect(r.diagnosticos).toHaveLength(0)
    expect(r.tipoRetorno).toBe('MONEY')
  })

  it('REDONDEAR_DINERO con un solo argumento es AEL-ANALYZER-ARITY_MISMATCH', () => {
    const r = analizarFuente('REGLA X\nRETORNAR REDONDEAR_DINERO(100 COP)')
    expect(r.diagnosticos[0]?.codigo).toBe('AEL-ANALYZER-ARITY_MISMATCH')
  })
})

describe('analizar — operadores binarios', () => {
  it('NUMBER + NUMBER, MONEY + MONEY', () => {
    expect(analizarFuente('REGLA X\nRETORNAR 1 + 2').tipoRetorno).toBe('NUMBER')
    expect(analizarFuente('REGLA X\nRETORNAR 1 COP + 2 COP').tipoRetorno).toBe('MONEY')
  })

  it('16 §41: MONEY + NUMBER es un error de tipos', () => {
    const r = analizarFuente('REGLA X\nRETORNAR 1 COP + 2')
    expect(r.diagnosticos[0]?.codigo).toBe('AEL-TYPE-MISMATCH')
  })

  it('MONEY * NUMBER y NUMBER * MONEY → MONEY (01 §16)', () => {
    expect(analizarFuente('REGLA X\nRETORNAR 1 COP * 2').tipoRetorno).toBe('MONEY')
    expect(analizarFuente('REGLA X\nRETORNAR 2 * 1 COP').tipoRetorno).toBe('MONEY')
  })

  it('MONEY / NUMBER → MONEY', () => {
    expect(analizarFuente('REGLA X\nRETORNAR 10 COP / 2').tipoRetorno).toBe('MONEY')
  })

  it('comparaciones relacionales requieren NUMBER,NUMBER → BOOLEAN', () => {
    expect(analizarFuente('REGLA X\nRETORNAR 1 > 2').tipoRetorno).toBe('BOOLEAN')
    const r = analizarFuente('REGLA X\nRETORNAR 1 COP > 2 COP')
    expect(r.diagnosticos[0]?.codigo).toBe('AEL-TYPE-MISMATCH')
  })

  it('== / != exigen el mismo tipo a ambos lados', () => {
    expect(analizarFuente('REGLA X\nRETORNAR VERDADERO == VERDADERO').tipoRetorno).toBe('BOOLEAN')
    const r = analizarFuente('REGLA X\nRETORNAR 1 == VERDADERO')
    expect(r.diagnosticos[0]?.codigo).toBe('AEL-TYPE-MISMATCH')
  })

  it('unario "-" solo aplica a NUMBER', () => {
    expect(analizarFuente('REGLA X\nRETORNAR -1').tipoRetorno).toBe('NUMBER')
    const r = analizarFuente('REGLA X\nRETORNAR -VERDADERO')
    expect(r.diagnosticos[0]?.codigo).toBe('AEL-TYPE-INVALID_UNARY')
  })
})

describe('analizar — condicional (02 §35, §39)', () => {
  it('la condición debe ser BOOLEAN', () => {
    const r = analizarFuente('REGLA X\nSI 1 ENTONCES\nRETORNAR 1\nFIN\nRETORNAR 2')
    expect(r.diagnosticos[0]?.codigo).toBe('AEL-TYPE-CONDITION_NOT_BOOLEAN')
  })

  it('retornos consistentes en ambas ramas', () => {
    const fuente = 'REGLA X\nSI VERDADERO ENTONCES\nRETORNAR 1 COP\nSINO\nRETORNAR 2 COP\nFIN'
    const r = analizarFuente(fuente)
    expect(r.diagnosticos).toHaveLength(0)
    expect(r.tipoRetorno).toBe('MONEY')
  })

  it('AEL-ANALYZER-INCONSISTENT_RETURN si las ramas retornan tipos distintos (02 §39)', () => {
    const fuente = 'REGLA X\nSI VERDADERO ENTONCES\nRETORNAR 1 COP\nSINO\nRETORNAR 2\nFIN'
    const r = analizarFuente(fuente)
    expect(r.diagnosticos.some((d) => d.codigo === 'AEL-ANALYZER-INCONSISTENT_RETURN')).toBe(true)
    expect(r.tipoRetorno).toBeNull()
  })
})

describe('analizar — las tres reglas piloto (paso0/INFORME_PASO_0.md)', () => {
  it('CUOTA_BASICA analiza sin diagnósticos, retorna MONEY', () => {
    const fuente = [
      'REGLA CUOTA_BASICA',
      'DEFINIR presupuesto_anual = PARAMETER.PRESUPUESTO_ANUAL',
      'DEFINIR otros_ingresos_anual = PARAMETER.OTROS_INGRESOS_ANUAL',
      'RETORNAR presupuesto_anual - otros_ingresos_anual',
    ].join('\n')
    const r = analizarFuente(fuente)
    expect(r.diagnosticos).toEqual([])
    expect(r.tipoRetorno).toBe('MONEY')
  })

  it('CUOTA_CON_DESCUENTO analiza sin diagnósticos, retorna MONEY', () => {
    const fuente = [
      'REGLA CUOTA_CON_DESCUENTO',
      'DEFINIR cuota = CONCEPTO.CUOTA_BASICA',
      'DEFINIR porcentaje_descuento = PARAMETER.DESCUENTO_PRONTO_PAGO',
      'DEFINIR descuento = PORCENTAJE(cuota, porcentaje_descuento)',
      'SI UNIT.PAGO_OPORTUNO == VERDADERO ENTONCES',
      'RETORNAR cuota - descuento',
      'SINO',
      'RETORNAR cuota',
      'FIN',
    ].join('\n')
    const r = analizarFuente(fuente)
    expect(r.diagnosticos).toEqual([])
    expect(r.tipoRetorno).toBe('MONEY')
  })

  it('INTERES_MORA analiza sin diagnósticos, retorna MONEY', () => {
    const fuente = [
      'REGLA INTERES_MORA',
      'DEFINIR saldo_vencido = UNIT.SALDO_VENCIDO',
      'DEFINIR dias_mora = UNIT.DIAS_MORA',
      'DEFINIR dias_gracia = PARAMETER.INTERES_DIAS_GRACIA',
      'DEFINIR base_dias = PARAMETER.INTERES_BASE_DIAS',
      'DEFINIR tasa = PARAMETER.INTERES_TASA_MENSUAL',
      'DEFINIR tope = PARAMETER.INTERES_TOPE_MENSUAL',
      'DEFINIR tasa_aplicable = MIN(tasa, tope)',
      'DEFINIR dias_cobrables = MAX(dias_mora - dias_gracia, 0)',
      'DEFINIR interes = saldo_vencido * tasa_aplicable * dias_cobrables / base_dias',
      'SI dias_cobrables > 0 ENTONCES',
      'RETORNAR REDONDEAR_DINERO(interes, 0)',
      'SINO',
      'RETORNAR 0 COP',
      'FIN',
    ].join('\n')
    const r = analizarFuente(fuente)
    expect(r.diagnosticos).toEqual([])
    expect(r.tipoRetorno).toBe('MONEY')
  })
})
