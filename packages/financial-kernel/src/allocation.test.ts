import { describe, expect, it } from 'vitest'
import {
  allocate,
  obtener,
  verificarSumaReconciliada,
  type AllocationRequest,
} from './allocation.js'
import {
  DuplicateTargetError,
  EmptyTargetsError,
  NegativeBasisError,
  ReconciliationFailedError,
  ZeroTotalBasisError,
} from './errors.js'
import { money } from './money.js'

const POLICY = { modo: 'HALF_UP', escala: 0 } as const

describe('allocate() — validación (19 §12-17, §43-44)', () => {
  it('rechaza targets vacíos', () => {
    const req: AllocationRequest = {
      basisType: 'equalShare',
      sourceAmount: money(100, 'COP'),
      targets: [],
      policy: POLICY,
    }
    expect(() => allocate(req)).toThrow(EmptyTargetsError)
  })

  it('rechaza targets duplicados', () => {
    const req: AllocationRequest = {
      basisType: 'equalShare',
      sourceAmount: money(100, 'COP'),
      targets: [{ id: 'A' }, { id: 'A' }],
      policy: POLICY,
    }
    expect(() => allocate(req)).toThrow(DuplicateTargetError)
  })

  it('rechaza basis negativa', () => {
    const req: AllocationRequest = {
      basisType: 'coefficient',
      sourceAmount: money(100, 'COP'),
      targets: [
        { id: 'A', basis: '0.5' },
        { id: 'B', basis: '-0.5' },
      ],
      policy: POLICY,
    }
    expect(() => allocate(req)).toThrow(NegativeBasisError)
  })

  it('rechaza basis total cero', () => {
    const req: AllocationRequest = {
      basisType: 'coefficient',
      sourceAmount: money(100, 'COP'),
      targets: [
        { id: 'A', basis: 0 },
        { id: 'B', basis: 0 },
      ],
      policy: POLICY,
    }
    expect(() => allocate(req)).toThrow(ZeroTotalBasisError)
  })
})

describe('allocate() — equalShare', () => {
  it('divide en partes iguales cuando no hay residual', () => {
    const resultado = allocate({
      basisType: 'equalShare',
      sourceAmount: money(300, 'COP'),
      targets: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      policy: POLICY,
    })
    expect(resultado.entries.map((e) => e.allocatedAmount.amount.toString())).toEqual([
      '100',
      '100',
      '100',
    ])
  })

  it('distribuye el residual por mayor resto con desempate por id ASC (19 §29-30)', () => {
    // 100 / 3 = 33.333...  cada target tiene el mismo remanente → empate → id ASC
    const resultado = allocate({
      basisType: 'equalShare',
      sourceAmount: money(100, 'COP'),
      targets: [{ id: 'C' }, { id: 'A' }, { id: 'B' }],
      policy: POLICY,
    })
    const porId = Object.fromEntries(
      resultado.entries.map((e) => [e.targetId, e.allocatedAmount.amount.toNumber()]),
    )
    // Solo 1 unidad de residual (100 - 99) → va al id menor: 'A'
    expect(porId).toEqual({ A: 34, B: 33, C: 33 })
  })
})

describe('allocate() — coefficient', () => {
  it('reparte proporcionalmente respetando el residual', () => {
    const resultado = allocate({
      basisType: 'coefficient',
      sourceAmount: money(100, 'COP'),
      targets: [
        { id: 'A', basis: '0.5' },
        { id: 'B', basis: '0.5' },
      ],
      policy: POLICY,
    })
    expect(resultado.entries.map((e) => e.allocatedAmount.amount.toString())).toEqual(['50', '50'])
  })

  it('no asume que la suma de coeficientes debe ser 1.0 (16 §82)', () => {
    // coeficientes que suman 2 (p.ej. dos sets solapados) — sigue siendo válido
    const resultado = allocate({
      basisType: 'coefficient',
      sourceAmount: money(100, 'COP'),
      targets: [
        { id: 'A', basis: '1' },
        { id: 'B', basis: '1' },
      ],
      policy: POLICY,
    })
    expect(resultado.entries.map((e) => e.allocatedAmount.amount.toString())).toEqual(['50', '50'])
  })
})

describe('verificarSumaReconciliada (19 §92-98) — guardia probado de forma aislada', () => {
  it('no lanza cuando la suma reconcilia', () => {
    const fuente = money(100, 'COP')
    expect(() => {
      verificarSumaReconciliada([{ allocatedAmount: money(100, 'COP') }], fuente)
    }).not.toThrow()
  })

  it('lanza ReconciliationFailedError cuando la suma NO reconcilia', () => {
    const fuente = money(100, 'COP')
    expect(() => {
      verificarSumaReconciliada([{ allocatedAmount: money(99, 'COP') }], fuente)
    }).toThrow(ReconciliationFailedError)
  })
})

describe('obtener() — guardia de invariante probado de forma aislada', () => {
  it('devuelve el valor cuando la clave existe', () => {
    const mapa = new Map([['A', money(1, 'COP')]])
    expect(obtener(mapa, 'A')).toEqual(money(1, 'COP'))
  })

  it('lanza un error explícito cuando la clave no existe (nunca debería pasar en allocate())', () => {
    const mapa = new Map<string, number>()
    expect(() => obtener(mapa, 'inexistente')).toThrow(/Invariante violado/)
  })
})
