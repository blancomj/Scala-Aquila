import { describe, expect, it } from 'vitest'
import {
  cruzarConciliacionBancaria,
  type MovimientoBanco,
  type MovimientoLibro,
} from './conciliacion-bancaria-cruce.js'

const FECHA_CORTE = '2027-03-31'

function banco(overrides: Partial<MovimientoBanco> = {}): MovimientoBanco {
  return {
    id: 'b-1',
    fecha: '2027-03-15',
    monto: 250_000,
    descripcion: 'TRANSFERENCIA',
    referencia: null,
    ...overrides,
  }
}

function libro(overrides: Partial<MovimientoLibro> = {}): MovimientoLibro {
  return {
    id: 'l-1',
    fecha: '2027-03-15',
    monto: 250_000,
    descripcion: 'Comprobante ingreso',
    referencia: null,
    ...overrides,
  }
}

describe('cruzarConciliacionBancaria — saldos', () => {
  it('sin movimientos, el saldo final es igual al inicial en ambos lados', () => {
    const r = cruzarConciliacionBancaria({
      saldoInicialBanco: 1_000_000,
      saldoInicialLibros: 1_000_000,
      movimientosBanco: [],
      movimientosLibro: [],
      fechaCorte: FECHA_CORTE,
    })
    expect(r.saldoFinalBanco).toBe(1_000_000)
    expect(r.saldoFinalLibros).toBe(1_000_000)
    expect(r.partidas).toHaveLength(0)
    expect(r.partidasCruzadas).toBe(0)
  })

  it('el saldo final suma TODOS los movimientos, crucen o no', () => {
    const r = cruzarConciliacionBancaria({
      saldoInicialBanco: 0,
      saldoInicialLibros: 0,
      movimientosBanco: [banco({ id: 'b-1', monto: 100_000 }), banco({ id: 'b-2', monto: -15_000, referencia: null })],
      movimientosLibro: [libro({ id: 'l-1', monto: 100_000 })],
      fechaCorte: FECHA_CORTE,
    })
    expect(r.saldoFinalBanco).toBe(85_000)
    expect(r.saldoFinalLibros).toBe(100_000)
  })
})

describe('cruzarConciliacionBancaria — cascada de cruce', () => {
  it('referencia exacta cruza aunque la fecha sea muy distinta, siempre que el monto coincida', () => {
    const r = cruzarConciliacionBancaria({
      saldoInicialBanco: 0,
      saldoInicialLibros: 0,
      movimientosBanco: [banco({ monto: 250_000, fecha: '2027-03-15', referencia: 'PAG-001' })],
      movimientosLibro: [libro({ monto: 250_000, fecha: '2027-03-25', referencia: 'PAG-001' })],
      fechaCorte: FECHA_CORTE,
    })
    expect(r.partidasCruzadas).toBe(1)
    expect(r.partidas).toHaveLength(0)
  })

  it('referencia igual pero MONTO distinto no cruza por este paso — queda visible a ambos lados en vez de silenciar la diferencia', () => {
    const r = cruzarConciliacionBancaria({
      saldoInicialBanco: 0,
      saldoInicialLibros: 0,
      movimientosBanco: [banco({ monto: 250_000, fecha: '2027-03-15', referencia: 'PAG-002' })],
      movimientosLibro: [libro({ monto: 249_500, fecha: '2027-03-25', referencia: 'PAG-002' })],
      fechaCorte: FECHA_CORTE,
    })
    expect(r.partidasCruzadas).toBe(0)
    expect(r.partidas).toHaveLength(2)
  })

  it('la referencia se normaliza (mayúsculas/espacios) antes de comparar', () => {
    const r = cruzarConciliacionBancaria({
      saldoInicialBanco: 0,
      saldoInicialLibros: 0,
      movimientosBanco: [banco({ referencia: '  Pag-001  ' })],
      movimientosLibro: [libro({ referencia: 'pag-001' })],
      fechaCorte: FECHA_CORTE,
    })
    expect(r.partidasCruzadas).toBe(1)
  })

  it('una referencia en blanco (solo espacios) se trata como ausente — no "cruza" solo por ser dos cadenas vacías iguales', () => {
    const r = cruzarConciliacionBancaria({
      // Monto y fecha DELIBERADAMENTE distintos: si la referencia en blanco se
      // tratara como texto real ("" === ""), esto cruzaría igual por el paso 1.
      saldoInicialBanco: 0,
      saldoInicialLibros: 0,
      movimientosBanco: [banco({ monto: 40_000, fecha: '2027-03-01', referencia: '   ' })],
      movimientosLibro: [libro({ monto: 41_000, fecha: '2027-03-25', referencia: '  ' })],
      fechaCorte: FECHA_CORTE,
    })
    expect(r.partidasCruzadas).toBe(0)
    expect(r.partidas).toHaveLength(2)
  })

  it('referencia null en ambos lados no cruza por referencia — cae a monto+fecha', () => {
    const r = cruzarConciliacionBancaria({
      saldoInicialBanco: 0,
      saldoInicialLibros: 0,
      movimientosBanco: [banco({ referencia: null })],
      movimientosLibro: [libro({ referencia: null })],
      fechaCorte: FECHA_CORTE,
    })
    // Mismo monto y fecha exactos → cruza por el paso 2, no por el 1.
    expect(r.partidasCruzadas).toBe(1)
  })

  it('monto exacto + fecha dentro de la ventana cruza cuando hay un único candidato', () => {
    const r = cruzarConciliacionBancaria({
      saldoInicialBanco: 0,
      saldoInicialLibros: 0,
      movimientosBanco: [banco({ monto: 87_331, fecha: '2027-03-10' })],
      movimientosLibro: [libro({ monto: 87_331, fecha: '2027-03-12' })], // 2 días de diferencia
      fechaCorte: FECHA_CORTE,
    })
    expect(r.partidasCruzadas).toBe(1)
    expect(r.partidas).toHaveLength(0)
  })

  it('monto exacto FUERA de la ventana de fecha no cruza', () => {
    const r = cruzarConciliacionBancaria({
      saldoInicialBanco: 0,
      saldoInicialLibros: 0,
      movimientosBanco: [banco({ id: 'b-lejos', monto: 87_331, fecha: '2027-03-01' })],
      movimientosLibro: [libro({ id: 'l-lejos', monto: 87_331, fecha: '2027-03-20' })], // 19 días
      fechaCorte: FECHA_CORTE,
    })
    expect(r.partidasCruzadas).toBe(0)
    expect(r.partidas).toHaveLength(2)
    expect(r.partidas.find((p) => p.origen === 'banco')?.movimientoBancoId).toBe('b-lejos')
    expect(r.partidas.find((p) => p.origen === 'libro')?.movimientoLibroId).toBe('l-lejos')
  })

  it('AMBIGÜEDAD: dos candidatos de libro con el mismo monto y fecha no cruzan con ninguno', () => {
    const r = cruzarConciliacionBancaria({
      saldoInicialBanco: 0,
      saldoInicialLibros: 0,
      movimientosBanco: [banco({ monto: 60_000, fecha: '2027-03-10' })],
      movimientosLibro: [
        libro({ id: 'l-a', monto: 60_000, fecha: '2027-03-10' }),
        libro({ id: 'l-b', monto: 60_000, fecha: '2027-03-11' }),
      ],
      fechaCorte: FECHA_CORTE,
    })
    expect(r.partidasCruzadas).toBe(0)
    // La línea de banco queda sin cruzar, y las DOS de libro también —
    // ninguna se descarta por ambigüedad, todas quedan visibles.
    expect(r.partidas).toHaveLength(3)
  })

  it('la cascada prioriza referencia sobre monto+fecha: no deja que un candidato coincidente "robe" el cruce correcto', () => {
    const r = cruzarConciliacionBancaria({
      saldoInicialBanco: 0,
      saldoInicialLibros: 0,
      movimientosBanco: [banco({ monto: 60_000, fecha: '2027-03-10', referencia: 'REF-X' })],
      movimientosLibro: [
        // l-coincidencia calzaría por monto+fecha (mismo monto, misma fecha) si ese
        // paso se procesara antes que la referencia — sería el cruce EQUIVOCADO.
        libro({ id: 'l-coincidencia', monto: 60_000, fecha: '2027-03-10', referencia: null }),
        // l-referencia es el cruce correcto: misma referencia y mismo monto, aunque
        // la fecha esté lejos — la referencia no depende de la ventana de fecha.
        libro({ id: 'l-referencia', monto: 60_000, fecha: '2027-01-01', referencia: 'REF-X' }),
      ],
      fechaCorte: FECHA_CORTE,
    })
    expect(r.partidasCruzadas).toBe(1)
    // El que queda sin cruzar debe ser la coincidencia casual de monto+fecha, no el
    // de referencia — si la cascada estuviera invertida, sería al revés.
    expect(r.partidas).toHaveLength(1)
    expect(r.partidas[0]?.movimientoLibroId).toBe('l-coincidencia')
  })
})

describe('cruzarConciliacionBancaria — identidad contable', () => {
  it('saldo banco ajustado (final − sus partidas) siempre coincide con saldo libros ajustado (final − las suyas)', () => {
    const r = cruzarConciliacionBancaria({
      saldoInicialBanco: 500_000,
      saldoInicialLibros: 500_000,
      movimientosBanco: [
        banco({ id: 'b-cruza', monto: 100_000, fecha: '2027-03-10', referencia: 'REF-1' }),
        banco({ id: 'b-transito', monto: 40_000, fecha: '2027-03-30' }), // depósito en tránsito
        banco({ id: 'b-comision', monto: -5_000, fecha: '2027-03-20' }), // nota débito
      ],
      movimientosLibro: [
        libro({ id: 'l-cruza', monto: 100_000, fecha: '2027-03-10', referencia: 'REF-1' }),
        libro({ id: 'l-cheque', monto: -22_000, fecha: '2027-03-18' }), // cheque pendiente
      ],
      fechaCorte: FECHA_CORTE,
    })
    expect(r.partidasCruzadas).toBe(1)
    expect(r.partidas).toHaveLength(3)

    const sumaPartidasBanco = r.partidas.filter((p) => p.origen === 'banco').reduce((s, p) => s + p.monto, 0)
    const sumaPartidasLibro = r.partidas.filter((p) => p.origen === 'libro').reduce((s, p) => s + p.monto, 0)
    const saldoBancoAjustado = r.saldoFinalBanco - sumaPartidasBanco
    const saldoLibrosAjustado = r.saldoFinalLibros - sumaPartidasLibro
    expect(saldoBancoAjustado).toBe(saldoLibrosAjustado)
  })
})

describe('cruzarConciliacionBancaria — clasificación de partidas sin cruzar', () => {
  it('banco positivo y reciente (dentro de la ventana del corte) → depósito en tránsito', () => {
    const r = cruzarConciliacionBancaria({
      saldoInicialBanco: 0,
      saldoInicialLibros: 0,
      movimientosBanco: [banco({ monto: 50_000, fecha: '2027-03-30' })], // 1 día antes del corte
      movimientosLibro: [],
      fechaCorte: FECHA_CORTE,
    })
    expect(r.partidas[0]?.tipo).toBe('deposito_transito')
  })

  it('banco positivo y lejano del corte → nota crédito del banco sin registrar', () => {
    const r = cruzarConciliacionBancaria({
      saldoInicialBanco: 0,
      saldoInicialLibros: 0,
      movimientosBanco: [banco({ monto: 50_000, fecha: '2027-03-05' })], // lejos del corte
      movimientosLibro: [],
      fechaCorte: FECHA_CORTE,
    })
    expect(r.partidas[0]?.tipo).toBe('nota_credito_banco')
  })

  it('banco negativo → nota débito del banco sin registrar (comisión, GMF)', () => {
    const r = cruzarConciliacionBancaria({
      saldoInicialBanco: 0,
      saldoInicialLibros: 0,
      movimientosBanco: [banco({ monto: -15_000, fecha: '2027-03-30' })],
      movimientosLibro: [],
      fechaCorte: FECHA_CORTE,
    })
    expect(r.partidas[0]?.tipo).toBe('nota_debito_banco')
  })

  it('libro negativo (salida) sin cruzar → cheque o pago pendiente de cobro', () => {
    const r = cruzarConciliacionBancaria({
      saldoInicialBanco: 0,
      saldoInicialLibros: 0,
      movimientosBanco: [],
      movimientosLibro: [libro({ monto: -80_000 })],
      fechaCorte: FECHA_CORTE,
    })
    expect(r.partidas[0]?.tipo).toBe('cheque_pendiente')
  })

  it('libro positivo (entrada) sin cruzar → otro (caso atípico, sin vocabulario propio)', () => {
    const r = cruzarConciliacionBancaria({
      saldoInicialBanco: 0,
      saldoInicialLibros: 0,
      movimientosBanco: [],
      movimientosLibro: [libro({ monto: 30_000 })],
      fechaCorte: FECHA_CORTE,
    })
    expect(r.partidas[0]?.tipo).toBe('otro')
  })
})
