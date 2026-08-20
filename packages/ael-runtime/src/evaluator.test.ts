import type { CatalogoContratos, Regla } from '@aquila/ael-language'
import { parsear } from '@aquila/ael-language'
import { crearDecimal, money, type ModoRedondeo } from '@aquila/financial-kernel'
import { describe, expect, it } from 'vitest'
import type { ExecutionContext } from './context.js'
import { ContractoNoResueltoError } from './errors.js'
import { evaluar } from './evaluator.js'
import type { TypedValue } from './typed-value.js'

const ESPACIO = { inicio: { linea: 1, columna: 1 }, fin: { linea: 1, columna: 1 } }

function crearContexto(
  catalogo: CatalogoContratos,
  valores: Readonly<Record<string, TypedValue>>,
  modoRedondeoDinero: ModoRedondeo = 'HALF_UP',
): ExecutionContext {
  return {
    catalogo,
    modoRedondeoDinero,
    resolverContract(contrato, campo) {
      const v = valores[`${contrato}.${campo}`]
      if (v === undefined) throw new ContractoNoResueltoError(contrato, campo)
      return v
    },
  }
}

function evaluarFuente(
  fuente: string,
  catalogo: CatalogoContratos = {},
  valores: Readonly<Record<string, TypedValue>> = {},
  modoRedondeoDinero: ModoRedondeo = 'HALF_UP',
) {
  const { regla } = parsear(fuente)
  if (!regla) throw new Error('la fuente no parseó — revisa el test')
  return evaluar(regla, crearContexto(catalogo, valores, modoRedondeoDinero))
}

describe('evaluar — literales', () => {
  it('NUMBER, MONEY, BOOLEAN, NULO', () => {
    expect(evaluarFuente('REGLA X\nRETORNAR 1').resultado).toMatchObject({ tipo: 'NUMBER' })
    expect(evaluarFuente('REGLA X\nRETORNAR 1 COP').resultado).toMatchObject({ tipo: 'MONEY' })
    expect(evaluarFuente('REGLA X\nRETORNAR VERDADERO').resultado).toEqual({
      tipo: 'BOOLEAN',
      valor: true,
    })
    expect(evaluarFuente('REGLA X\nRETORNAR NULO').resultado).toEqual({ tipo: 'NULO' })
  })
})

describe('evaluar — DEFINIR / Identificador', () => {
  it('una variable declarada guarda su valor evaluado', () => {
    const r = evaluarFuente('REGLA X\nDEFINIR a = 1 COP\nRETORNAR a')
    expect(r.diagnosticos).toEqual([])
    if (r.resultado?.tipo !== 'MONEY') throw new Error()
    expect(r.resultado.valor.amount.toString()).toBe('1')
  })
})

describe('evaluar — traza ("Detalle del cálculo")', () => {
  it('un paso por DEFINIR y uno final por RETORNAR, en orden de ejecución', () => {
    const r = evaluarFuente('REGLA X\nDEFINIR a = 2\nDEFINIR b = a * 3\nRETORNAR b')
    expect(r.traza.map((p) => ({ nombre: p.nombre, expresionTexto: p.expresionTexto }))).toEqual([
      { nombre: 'a', expresionTexto: '2' },
      { nombre: 'b', expresionTexto: 'a * 3' },
      { nombre: null, expresionTexto: 'b' },
    ])
    if (r.traza[1]?.valor.tipo !== 'NUMBER') throw new Error()
    expect(r.traza[1].valor.valor.toString()).toBe('6')
  })

  it('una DEFINIR dentro de SI/ENTONCES también queda en la traza (mismo alcance plano)', () => {
    const r = evaluarFuente(
      'REGLA X\nSI VERDADERO ENTONCES\nDEFINIR a = 5\nFIN\nRETORNAR a',
    )
    expect(r.traza.map((p) => p.nombre)).toEqual(['a', null])
  })

  it('un error de evaluación conserva la traza hasta el último paso completado', () => {
    const r = evaluarFuente(
      'REGLA X\nDEFINIR a = 1\nRETORNAR PARAMETER.NO_RESUELTO',
      { PARAMETER: { NO_RESUELTO: 'NUMBER' } },
    )
    expect(r.resultado).toBeNull()
    expect(r.diagnosticos.length).toBeGreaterThan(0)
    expect(r.traza.map((p) => p.nombre)).toEqual(['a'])
  })
})

describe('evaluar — Contracts', () => {
  it('resuelve PARAMETER.X a través del contexto', () => {
    const r = evaluarFuente(
      'REGLA X\nRETORNAR PARAMETER.TARIFA',
      { PARAMETER: { TARIFA: 'MONEY' } },
      { 'PARAMETER.TARIFA': { tipo: 'MONEY', valor: money(500, 'COP') } },
    )
    if (r.resultado?.tipo !== 'MONEY') throw new Error()
    expect(r.resultado.valor.amount.toString()).toBe('500')
  })
})

describe('evaluar — operadores', () => {
  it('NUMBER + NUMBER, MONEY + MONEY', () => {
    const a = evaluarFuente('REGLA X\nRETORNAR 2 + 3')
    if (a.resultado?.tipo !== 'NUMBER') throw new Error()
    expect(a.resultado.valor.toString()).toBe('5')

    const b = evaluarFuente('REGLA X\nRETORNAR 2 COP + 3 COP')
    if (b.resultado?.tipo !== 'MONEY') throw new Error()
    expect(b.resultado.valor.amount.toString()).toBe('5')
  })

  it('MONEY - MONEY', () => {
    const r = evaluarFuente('REGLA X\nRETORNAR 10 COP - 3 COP')
    if (r.resultado?.tipo !== 'MONEY') throw new Error()
    expect(r.resultado.valor.amount.toString()).toBe('7')
  })

  it('NUMBER * NUMBER', () => {
    const r = evaluarFuente('REGLA X\nRETORNAR 4 * 3')
    if (r.resultado?.tipo !== 'NUMBER') throw new Error()
    expect(r.resultado.valor.toString()).toBe('12')
  })

  it('MONEY * NUMBER y NUMBER * MONEY', () => {
    const a = evaluarFuente('REGLA X\nRETORNAR 2 COP * 3')
    if (a.resultado?.tipo !== 'MONEY') throw new Error()
    expect(a.resultado.valor.amount.toString()).toBe('6')

    const b = evaluarFuente('REGLA X\nRETORNAR 3 * 2 COP')
    if (b.resultado?.tipo !== 'MONEY') throw new Error()
    expect(b.resultado.valor.amount.toString()).toBe('6')
  })

  it('MONEY / NUMBER, NUMBER / NUMBER', () => {
    const a = evaluarFuente('REGLA X\nRETORNAR 10 COP / 4')
    if (a.resultado?.tipo !== 'MONEY') throw new Error()
    expect(a.resultado.valor.amount.toString()).toBe('2.5')

    const b = evaluarFuente('REGLA X\nRETORNAR 10 / 4')
    if (b.resultado?.tipo !== 'NUMBER') throw new Error()
    expect(b.resultado.valor.toString()).toBe('2.5')
  })

  it('comparaciones relacionales', () => {
    expect(evaluarFuente('REGLA X\nRETORNAR 1 < 2').resultado).toEqual({
      tipo: 'BOOLEAN',
      valor: true,
    })
    expect(evaluarFuente('REGLA X\nRETORNAR 1 > 2').resultado).toEqual({
      tipo: 'BOOLEAN',
      valor: false,
    })
    expect(evaluarFuente('REGLA X\nRETORNAR 2 >= 2').resultado).toEqual({
      tipo: 'BOOLEAN',
      valor: true,
    })
    expect(evaluarFuente('REGLA X\nRETORNAR 2 <= 1').resultado).toEqual({
      tipo: 'BOOLEAN',
      valor: false,
    })
  })

  it('== / != por tipo: NUMBER, MONEY, BOOLEAN, NULO', () => {
    expect(evaluarFuente('REGLA X\nRETORNAR 1 == 1').resultado).toEqual({
      tipo: 'BOOLEAN',
      valor: true,
    })
    expect(evaluarFuente('REGLA X\nRETORNAR 1 != 2').resultado).toEqual({
      tipo: 'BOOLEAN',
      valor: true,
    })
    expect(evaluarFuente('REGLA X\nRETORNAR 1 COP == 1 COP').resultado).toEqual({
      tipo: 'BOOLEAN',
      valor: true,
    })
    expect(evaluarFuente('REGLA X\nRETORNAR VERDADERO == VERDADERO').resultado).toEqual({
      tipo: 'BOOLEAN',
      valor: true,
    })
    expect(evaluarFuente('REGLA X\nRETORNAR NULO == NULO').resultado).toEqual({
      tipo: 'BOOLEAN',
      valor: true,
    })
  })

  it('unario "-"', () => {
    const r = evaluarFuente('REGLA X\nRETORNAR -5')
    if (r.resultado?.tipo !== 'NUMBER') throw new Error()
    expect(r.resultado.valor.toString()).toBe('-5')
  })

  it('llamada a función a través del evaluador', () => {
    const r = evaluarFuente('REGLA X\nRETORNAR MIN(3, 1)')
    if (r.resultado?.tipo !== 'NUMBER') throw new Error()
    expect(r.resultado.valor.toString()).toBe('1')
  })
})

describe('evaluar — condicional', () => {
  it('toma la rama ENTONCES o SINO según la condición', () => {
    const a = evaluarFuente('REGLA X\nSI VERDADERO ENTONCES\nRETORNAR 1\nSINO\nRETORNAR 2\nFIN')
    expect(a.resultado).toMatchObject({ tipo: 'NUMBER' })
    if (a.resultado?.tipo !== 'NUMBER') throw new Error()
    expect(a.resultado.valor.toString()).toBe('1')

    const b = evaluarFuente('REGLA X\nSI FALSO ENTONCES\nRETORNAR 1\nSINO\nRETORNAR 2\nFIN')
    if (b.resultado?.tipo !== 'NUMBER') throw new Error()
    expect(b.resultado.valor.toString()).toBe('2')
  })

  it('sin SINO y condición falsa: la regla no retorna nada (resultado null)', () => {
    const r = evaluarFuente('REGLA X\nSI FALSO ENTONCES\nRETORNAR 1\nFIN')
    expect(r.diagnosticos).toEqual([])
    expect(r.resultado).toBeNull()
  })
})

describe('evaluar — errores de ejecución se reportan como diagnóstico único (fail-fast)', () => {
  it('Contract no resuelto por el proveedor (17 §37 SNAPSHOT INCOMPLETE)', () => {
    const r = evaluarFuente(
      'REGLA X\nRETORNAR PARAMETER.FALTA',
      { PARAMETER: { FALTA: 'MONEY' } },
      {},
    )
    expect(r.resultado).toBeNull()
    expect(r.diagnosticos).toHaveLength(1)
    expect(r.diagnosticos[0]?.codigo).toBe('AEL-RUNTIME-EVALUATION_ERROR')
    expect(r.diagnosticos[0]?.mensaje).toContain('PARAMETER.FALTA')
  })

  it('monedas distintas en == (16 §41)', () => {
    const r = evaluarFuente(
      'REGLA X\nRETORNAR PARAMETER.A == PARAMETER.B',
      { PARAMETER: { A: 'MONEY', B: 'MONEY' } },
      {
        'PARAMETER.A': { tipo: 'MONEY', valor: money(1, 'COP') },
        'PARAMETER.B': { tipo: 'MONEY', valor: money(1, 'USD') },
      },
    )
    expect(r.resultado).toBeNull()
    expect(r.diagnosticos[0]?.codigo).toBe('AEL-RUNTIME-EVALUATION_ERROR')
  })

  it('un proveedor de contexto que lanza un valor no-Error también se reporta', () => {
    const { regla } = parsear('REGLA X\nRETORNAR PARAMETER.A')
    if (!regla) throw new Error()
    const contexto: ExecutionContext = {
      catalogo: { PARAMETER: { A: 'MONEY' } },
      modoRedondeoDinero: 'HALF_UP',
      resolverContract() {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- simula un proveedor externo mal comportado (boundary externo)
        throw 'proveedor externo roto'
      },
    }
    const r = evaluar(regla, contexto)
    expect(r.resultado).toBeNull()
    expect(r.diagnosticos[0]?.mensaje).toBe('proveedor externo roto')
  })

  it('división NUMBER por cero (0AEL §20 detect → report → block)', () => {
    const r = evaluarFuente(
      'REGLA X\nRETORNAR 1 / PARAMETER.CERO',
      { PARAMETER: { CERO: 'NUMBER' } },
      { 'PARAMETER.CERO': { tipo: 'NUMBER', valor: crearDecimal(0) } },
    )
    expect(r.resultado).toBeNull()
    expect(r.diagnosticos[0]?.codigo).toBe('AEL-RUNTIME-EVALUATION_ERROR')
  })
})

describe('evaluar — invariantes contra un AST que se saltó el Analyzer', () => {
  it('variable no definida en tiempo de ejecución', () => {
    const regla: Regla = {
      tipo: 'Regla',
      nombre: 'X',
      span: ESPACIO,
      cuerpo: [
        {
          tipo: 'Retorno',
          span: ESPACIO,
          expresion: { tipo: 'Identificador', nombre: 'no_existe', span: ESPACIO },
        },
      ],
    }
    const r = evaluar(regla, crearContexto({}, {}))
    expect(r.diagnosticos[0]?.mensaje).toContain('no_existe')
  })

  it('función desconocida', () => {
    const { regla } = parsear('REGLA X\nRETORNAR NOEXISTE(1)')
    if (!regla) throw new Error()
    const r = evaluar(regla, crearContexto({}, {}))
    expect(r.diagnosticos[0]?.mensaje).toContain('NOEXISTE')
  })

  it('Contract desconocido en el catálogo de ejecución', () => {
    const { regla } = parsear('REGLA X\nRETORNAR DESCONOCIDO.X')
    if (!regla) throw new Error()
    const r = evaluar(regla, crearContexto({}, {}))
    expect(r.diagnosticos[0]?.mensaje).toContain('DESCONOCIDO.X')
  })

  it('el proveedor de contexto devuelve un tipo distinto al catálogo', () => {
    const { regla } = parsear('REGLA X\nRETORNAR PARAMETER.A')
    if (!regla) throw new Error()
    const r = evaluar(
      regla,
      crearContexto(
        { PARAMETER: { A: 'MONEY' } },
        { 'PARAMETER.A': { tipo: 'NUMBER', valor: crearDecimal(1) } },
      ),
    )
    expect(r.diagnosticos[0]?.mensaje).toContain('PARAMETER.A')
  })

  it('operadores con combinaciones de tipo no soportadas', () => {
    // 16 §41: MONEY + NUMBER / MONEY - NUMBER no están definidos (a
    // diferencia de MONEY ± MONEY, que sí lo está). MONEY × MONEY y
    // MONEY / MONEY tampoco (01 §16).
    const catalogo: CatalogoContratos = { PARAMETER: { A: 'MONEY', B: 'NUMBER' } }
    const mixto = {
      'PARAMETER.A': { tipo: 'MONEY', valor: money(1, 'COP') } as TypedValue,
      'PARAMETER.B': { tipo: 'NUMBER', valor: crearDecimal(1) } as TypedValue,
    }
    const catalogoDinero: CatalogoContratos = { PARAMETER: { A: 'MONEY', B: 'MONEY' } }
    const dosDineros = {
      'PARAMETER.A': { tipo: 'MONEY', valor: money(1, 'COP') } as TypedValue,
      'PARAMETER.B': { tipo: 'MONEY', valor: money(1, 'COP') } as TypedValue,
    }
    const casos: readonly [string, CatalogoContratos, Readonly<Record<string, TypedValue>>][] = [
      ['+', catalogo, mixto],
      ['-', catalogo, mixto],
      ['*', catalogoDinero, dosDineros],
      ['/', catalogoDinero, dosDineros],
    ]
    for (const [operador, cat, valores] of casos) {
      const { regla } = parsear(`REGLA X\nRETORNAR PARAMETER.A ${operador} PARAMETER.B`)
      if (!regla) throw new Error()
      const r = evaluar(regla, crearContexto(cat, valores))
      expect(r.diagnosticos).toHaveLength(1)
    }
  })

  it('== / != entre tipos distintos', () => {
    const { regla } = parsear('REGLA X\nRETORNAR PARAMETER.A == PARAMETER.B')
    if (!regla) throw new Error()
    const r = evaluar(
      regla,
      crearContexto(
        { PARAMETER: { A: 'NUMBER', B: 'MONEY' } },
        {
          'PARAMETER.A': { tipo: 'NUMBER', valor: crearDecimal(1) },
          'PARAMETER.B': { tipo: 'MONEY', valor: money(1, 'COP') },
        },
      ),
    )
    expect(r.diagnosticos[0]?.mensaje).toContain('mismo tipo')
  })
})
