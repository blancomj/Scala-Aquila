import { describe, expect, it } from 'vitest'
import {
  calcularResultadoJobHash,
  evaluarCuotaVencida,
  evaluarJobCarteraInmueble,
  evaluarPromesaIncumplida,
  type CuotaPendiente,
  type EntradaJobCarteraInmueble,
  type PromesaPendiente,
} from './cartera-job.js'
import type { PoliticaClasificacion } from './cartera.js'

const politica: PoliticaClasificacion = {
  id: 'pol-1',
  version: 1,
  tramos: [
    { codigo: 'AL_DIA', diasMin: 0, diasMax: 0, nivelRiesgo: 'ninguno', etapaCobranza: 'preventiva', prioridad: 1 },
    { codigo: 'MORA_TEMPRANA', diasMin: 1, diasMax: 60, nivelRiesgo: 'bajo', etapaCobranza: 'administrativa', prioridad: 2 },
    { codigo: 'MORA_AVANZADA', diasMin: 61, diasMax: null, nivelRiesgo: 'alto', etapaCobranza: 'prejuridica', prioridad: 3 },
  ],
}

function entrada(over: Partial<EntradaJobCarteraInmueble> = {}): EntradaJobCarteraInmueble {
  return {
    inmuebleId: 'inm-1',
    etapaActual: 'preventiva',
    diasMoraMaximo: 0,
    saldoVencido: 0,
    politicaClasificacion: politica,
    accionesEjecutadasEnEtapa: [],
    tieneAcuerdoVigente: false,
    tieneCasoJuridicoAbierto: false,
    tieneCertificacionVigente: false,
    promesasPendientes: [],
    cuotasPendientesOParciales: [],
    acuerdoVigenteId: null,
    fechaCorte: '2026-08-17',
    toleranciaDiasPromesa: 0,
    ...over,
  }
}

function promesa(over: Partial<PromesaPendiente> & { id: string }): PromesaPendiente {
  return { estado: 'pendiente', fechaPagoPrometida: '2026-08-01', ...over }
}

function cuota(over: Partial<CuotaPendiente> & { id: string; acuerdoId: string }): CuotaPendiente {
  return { estado: 'pendiente', fechaVencimiento: '2026-08-01', ...over }
}

describe('evaluarPromesaIncumplida', () => {
  it('CAR §12.2 — estricto: un día después de la fecha prometida, sin tolerancia, ya es incumplida', () => {
    expect(evaluarPromesaIncumplida(promesa({ id: 'p1', fechaPagoPrometida: '2026-08-16' }), '2026-08-17', 0)).toBe(true)
  })

  it('respeta la tolerancia configurada', () => {
    const p = promesa({ id: 'p1', fechaPagoPrometida: '2026-08-16' })
    expect(evaluarPromesaIncumplida(p, '2026-08-17', 1)).toBe(false)
    expect(evaluarPromesaIncumplida(p, '2026-08-18', 1)).toBe(true)
  })

  it('una promesa que no está pendiente nunca se marca incumplida', () => {
    expect(evaluarPromesaIncumplida(promesa({ id: 'p1', estado: 'cumplida', fechaPagoPrometida: '2026-01-01' }), '2026-08-17', 0)).toBe(false)
  })
})

describe('evaluarCuotaVencida', () => {
  it('pendiente/parcial con fecha_corte posterior a fecha_vencimiento queda vencida', () => {
    expect(evaluarCuotaVencida(cuota({ id: 'c1', acuerdoId: 'a1', fechaVencimiento: '2026-08-16' }), '2026-08-17')).toBe(true)
    expect(evaluarCuotaVencida(cuota({ id: 'c1', acuerdoId: 'a1', estado: 'parcial', fechaVencimiento: '2026-08-16' }), '2026-08-17')).toBe(true)
  })

  it('sin tolerancia: el mismo día del vencimiento todavía no es vencida', () => {
    expect(evaluarCuotaVencida(cuota({ id: 'c1', acuerdoId: 'a1', fechaVencimiento: '2026-08-17' }), '2026-08-17')).toBe(false)
  })

  it('una cuota ya pagada/cancelada/vencida no se reevalúa', () => {
    expect(evaluarCuotaVencida(cuota({ id: 'c1', acuerdoId: 'a1', estado: 'pagada', fechaVencimiento: '2020-01-01' }), '2026-08-17')).toBe(false)
  })
})

describe('evaluarJobCarteraInmueble', () => {
  it('compone clasificación + escalamiento sin deuda: permanece en preventiva', () => {
    const plan = evaluarJobCarteraInmueble(entrada())
    expect(plan.clasificacion.codigo).toBe('AL_DIA')
    expect(plan.decisionEscalamiento).toEqual({ tipo: 'permanecer' })
    expect(plan.promesasIncumplidas).toEqual([])
    expect(plan.cuotasVencidas).toEqual([])
    expect(plan.acuerdoIncumplido).toBeNull()
  })

  it('con mora, propone escalar de preventiva a administrativa', () => {
    const plan = evaluarJobCarteraInmueble(entrada({ diasMoraMaximo: 10, saldoVencido: 200_000 }))
    expect(plan.clasificacion.codigo).toBe('MORA_TEMPRANA')
    expect(plan.decisionEscalamiento).toMatchObject({ tipo: 'escalar', hacia: 'administrativa', requiereAprobacion: false })
  })

  it('detecta promesas incumplidas del inmueble', () => {
    const plan = evaluarJobCarteraInmueble(
      entrada({ promesasPendientes: [promesa({ id: 'p1', fechaPagoPrometida: '2026-08-01' })] }),
    )
    expect(plan.promesasIncumplidas).toEqual([{ promesaId: 'p1', nuevoEstado: 'incumplida' }])
  })

  it('una cuota vencida del acuerdo vigente declara el acuerdo incumplido', () => {
    const plan = evaluarJobCarteraInmueble(
      entrada({
        acuerdoVigenteId: 'a1',
        tieneAcuerdoVigente: true,
        cuotasPendientesOParciales: [cuota({ id: 'c1', acuerdoId: 'a1', fechaVencimiento: '2026-08-01' })],
      }),
    )
    expect(plan.cuotasVencidas).toEqual([{ cuotaId: 'c1', nuevoEstado: 'vencida' }])
    expect(plan.acuerdoIncumplido).toEqual({ acuerdoId: 'a1', nuevoEstado: 'incumplido' })
  })

  it('una cuota vencida de OTRO acuerdo (ya no vigente) no declara incumplido el acuerdo vigente actual', () => {
    const plan = evaluarJobCarteraInmueble(
      entrada({
        acuerdoVigenteId: 'a2',
        tieneAcuerdoVigente: true,
        cuotasPendientesOParciales: [cuota({ id: 'c1', acuerdoId: 'a1', fechaVencimiento: '2026-08-01' })],
      }),
    )
    expect(plan.acuerdoIncumplido).toBeNull()
  })
})

describe('calcularResultadoJobHash', () => {
  it('es reproducible sin importar el orden de los planes de entrada', () => {
    const planA = evaluarJobCarteraInmueble(entrada({ inmuebleId: 'inm-a' }))
    const planB = evaluarJobCarteraInmueble(entrada({ inmuebleId: 'inm-b', diasMoraMaximo: 5, saldoVencido: 1000 }))
    expect(calcularResultadoJobHash([planA, planB])).toBe(calcularResultadoJobHash([planB, planA]))
  })

  it('cambia si cambia cualquier plan', () => {
    const planA = evaluarJobCarteraInmueble(entrada({ inmuebleId: 'inm-a' }))
    const planAConMora = evaluarJobCarteraInmueble(entrada({ inmuebleId: 'inm-a', diasMoraMaximo: 5, saldoVencido: 1000 }))
    expect(calcularResultadoJobHash([planA])).not.toBe(calcularResultadoJobHash([planAConMora]))
  })
})
