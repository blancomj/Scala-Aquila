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
import type { EstrategiaCobranza } from './cartera-cobranza.js'
import type { RelacionInmueblePersona } from './cartera-destinatarios.js'
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
    accionesAcreditadas: 1,
    promesasPendientes: [],
    cuotasPendientesOParciales: [],
    acuerdoVigenteId: null,
    fechaCorte: '2026-08-17',
    toleranciaDiasPromesa: 0,
    estrategias: [],
    historialAcciones: [],
    relaciones: [],
    diasEnTramoActual: 0,
    deudaTotal: '0',
    clasificacionAnterior: null,
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

  // §18.2 paso 8 — CARTERA_CLASIFICACION_CAMBIO.
  it('sin snapshot previo (clasificacionAnterior null), no hay cambio que reportar', () => {
    const plan = evaluarJobCarteraInmueble(entrada({ diasMoraMaximo: 10, saldoVencido: 200_000 }))
    expect(plan.clasificacion.codigo).toBe('MORA_TEMPRANA')
    expect(plan.cambioClasificacion).toBeNull()
  })

  it('mismo código que ayer: no hay cambio, aunque sí hubo snapshot previo', () => {
    const plan = evaluarJobCarteraInmueble(
      entrada({
        diasMoraMaximo: 10,
        saldoVencido: 200_000,
        clasificacionAnterior: { codigo: 'MORA_TEMPRANA', diasMora: 5 },
      }),
    )
    expect(plan.clasificacion.codigo).toBe('MORA_TEMPRANA')
    expect(plan.cambioClasificacion).toBeNull()
  })

  it('código distinto al de ayer: reporta el cambio con ambos códigos y ambos días de mora', () => {
    const plan = evaluarJobCarteraInmueble(
      entrada({
        diasMoraMaximo: 61,
        saldoVencido: 500_000,
        clasificacionAnterior: { codigo: 'MORA_TEMPRANA', diasMora: 60 },
      }),
    )
    expect(plan.clasificacion.codigo).toBe('MORA_AVANZADA')
    expect(plan.cambioClasificacion).toEqual({
      codigoAnterior: 'MORA_TEMPRANA',
      diasMoraAnterior: 60,
      codigoNuevo: 'MORA_AVANZADA',
      diasMoraNuevo: 61,
    })
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

// ── §18.2 pasos 14-16: el job ya no se detiene antes de crear acciones ──

const estrategiaEmail: EstrategiaCobranza = {
  id: 'est-1',
  tramoCodigo: 'MORA_TEMPRANA',
  tipoAccion: 'email',
  canal: 'email',
  diasDesdeClasificacion: 0,
  frecuenciaDias: null,
  maxIntentos: 1,
  montoMinimoDeuda: null,
  activa: true,
  requiereAprobacion: false,
}

const propietario: RelacionInmueblePersona = {
  terceroId: 'ter-1',
  rolCodigo: 'copropietario',
  porcentaje: 100,
  esPagador: true,
  recibeNotificaciones: true,
  vigenteDesde: '2020-01-01',
  vigenteHasta: null,
  email: 'due@example.test',
  telefono: '3001112233',
  direccion: 'Calle 1 # 2-3',
  municipio: 'Barranquilla',
  direccionVerificadaAt: null,
}

describe('evaluarJobCarteraInmueble — acciones con destinatario', () => {
  it('propone la acción con su destinatario resuelto', () => {
    const plan = evaluarJobCarteraInmueble(
      entrada({
        diasMoraMaximo: 10,
        saldoVencido: 500_000,
        deudaTotal: '500000',
        estrategias: [estrategiaEmail],
        relaciones: [propietario],
      }),
    )

    expect(plan.accionesPropuestas).toHaveLength(1)
    expect(plan.accionesPropuestas[0]?.canal).toBe('email')
    expect(plan.accionesPropuestas[0]?.destinatarios).toHaveLength(1)
    expect(plan.accionesPropuestas[0]?.destinatarios[0]?.contacto).toBe('due@example.test')
    expect(plan.accionesBloqueadas).toHaveLength(0)
  })

  it('reporta la acción bloqueada en vez de callarla cuando falta el contacto', () => {
    const plan = evaluarJobCarteraInmueble(
      entrada({
        diasMoraMaximo: 10,
        saldoVencido: 500_000,
        deudaTotal: '500000',
        estrategias: [estrategiaEmail],
        relaciones: [{ ...propietario, email: null }],
      }),
    )

    expect(plan.accionesPropuestas).toHaveLength(0)
    expect(plan.accionesBloqueadas).toHaveLength(1)
    expect(plan.accionesBloqueadas[0]?.causa).toBe('contacto_faltante')
  })

  it('reporta bloqueo cuando el inmueble no tiene relaciones vigentes', () => {
    const plan = evaluarJobCarteraInmueble(
      entrada({
        diasMoraMaximo: 10,
        saldoVencido: 500_000,
        deudaTotal: '500000',
        estrategias: [estrategiaEmail],
        relaciones: [],
      }),
    )

    expect(plan.accionesBloqueadas[0]?.causa).toBe('sin_destinatario')
  })

  it('produce una entrada por copropietario: una evidencia por persona (R2)', () => {
    const plan = evaluarJobCarteraInmueble(
      entrada({
        diasMoraMaximo: 10,
        saldoVencido: 500_000,
        deudaTotal: '500000',
        estrategias: [{ ...estrategiaEmail, tipoAccion: 'requerimiento_formal' }],
        relaciones: [
          { ...propietario, terceroId: 'ter-1', porcentaje: 50, esPagador: false },
          { ...propietario, terceroId: 'ter-2', porcentaje: 50, esPagador: false, email: 'dos@example.test' },
        ],
      }),
    )

    expect(plan.accionesPropuestas[0]?.destinatarios.map((d) => d.terceroId)).toEqual([
      'ter-1',
      'ter-2',
    ])
  })

  it('no propone nada con un acuerdo de pago vigente (§12.5)', () => {
    const plan = evaluarJobCarteraInmueble(
      entrada({
        diasMoraMaximo: 10,
        saldoVencido: 500_000,
        deudaTotal: '500000',
        estrategias: [estrategiaEmail],
        relaciones: [propietario],
        tieneAcuerdoVigente: true,
      }),
    )

    expect(plan.accionesPropuestas).toHaveLength(0)
    expect(plan.accionesBloqueadas).toHaveLength(0)
  })
})
