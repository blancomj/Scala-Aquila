import { describe, expect, it } from 'vitest'
import { evaluarEscalamiento, type ContextoEscalamiento, type ResumenAccion } from './cartera-escalamiento.js'
import type { ResultadoClasificacion } from './cartera.js'

function clasificacion(over: Partial<ResultadoClasificacion> = {}): ResultadoClasificacion {
  return {
    codigo: 'MORA_TEMPRANA',
    nivelRiesgo: 'bajo',
    etapaCobranza: 'administrativa',
    prioridad: 1,
    diasMora: 10,
    politicaId: 'pol-1',
    politicaVersion: 1,
    ...over,
  }
}

function contexto(over: Partial<ContextoEscalamiento> = {}): ContextoEscalamiento {
  return {
    etapaActual: 'preventiva',
    clasificacion: clasificacion(),
    saldoVencido: 100_000,
    accionesEjecutadasEnEtapa: [],
    tieneAcuerdoVigente: false,
    tieneCasoJuridicoAbierto: false,
    tieneCertificacionVigente: false,
    accionesAcreditadas: 1,
    ...over,
  }
}

function accion(over: Partial<ResumenAccion> & { estrategiaId: string }): ResumenAccion {
  return { agotada: true, ...over }
}

describe('evaluarEscalamiento', () => {
  it('permanece cuando la clasificación coincide con la etapa actual', () => {
    const resultado = evaluarEscalamiento(
      contexto({ etapaActual: 'administrativa', clasificacion: clasificacion({ etapaCobranza: 'administrativa' }) }),
    )
    expect(resultado).toEqual({ tipo: 'permanecer' })
  })

  it('escala preventiva→administrativa sin aprobación (automático)', () => {
    const resultado = evaluarEscalamiento(
      contexto({ etapaActual: 'preventiva', clasificacion: clasificacion({ etapaCobranza: 'administrativa' }) }),
    )
    expect(resultado).toMatchObject({ tipo: 'escalar', hacia: 'administrativa', requiereAprobacion: false })
  })

  it('PH-C19 — administrativa→prejuridica bloqueada mientras las acciones no estén agotadas', () => {
    const resultado = evaluarEscalamiento(
      contexto({
        etapaActual: 'administrativa',
        clasificacion: clasificacion({ codigo: 'MORA_AVANZADA', etapaCobranza: 'prejuridica' }),
        accionesEjecutadasEnEtapa: [accion({ estrategiaId: 'e1', agotada: false })],
      }),
    )
    expect(resultado.tipo).toBe('bloqueado')
  })

  it('PH-C19 — administrativa→prejuridica propone escalar con aprobación una vez agotadas las acciones', () => {
    const resultado = evaluarEscalamiento(
      contexto({
        etapaActual: 'administrativa',
        clasificacion: clasificacion({ codigo: 'MORA_AVANZADA', etapaCobranza: 'prejuridica' }),
        accionesEjecutadasEnEtapa: [accion({ estrategiaId: 'e1' }), accion({ estrategiaId: 'e2' })],
      }),
    )
    expect(resultado).toMatchObject({ tipo: 'escalar', hacia: 'prejuridica', requiereAprobacion: true })
  })

  it('sin ninguna acción configurada/ejecutada, NO se considera agotado (no se puede agotar lo nunca intentado)', () => {
    const resultado = evaluarEscalamiento(
      contexto({
        etapaActual: 'administrativa',
        clasificacion: clasificacion({ codigo: 'MORA_AVANZADA', etapaCobranza: 'prejuridica' }),
        accionesEjecutadasEnEtapa: [],
      }),
    )
    expect(resultado.tipo).toBe('bloqueado')
  })

  it('PH-C20 — prejuridica→juridica bloqueada sin certificación de deuda vigente', () => {
    const resultado = evaluarEscalamiento(
      contexto({
        etapaActual: 'prejuridica',
        clasificacion: clasificacion({ codigo: 'ALTO_RIESGO', etapaCobranza: 'juridica' }),
        tieneCertificacionVigente: false,
      }),
    )
    expect(resultado).toEqual({
      tipo: 'bloqueado',
      requisitoFaltante: 'Certificación de deuda vigente (art. 48, CAR §11.3/PH-C20)',
    })
  })

  it('PH-C20 — prejuridica→juridica propone escalar con aprobación cuando hay certificación vigente', () => {
    const resultado = evaluarEscalamiento(
      contexto({
        etapaActual: 'prejuridica',
        clasificacion: clasificacion({ codigo: 'ALTO_RIESGO', etapaCobranza: 'juridica' }),
        tieneCertificacionVigente: true,
      }),
    )
    expect(resultado).toMatchObject({ tipo: 'escalar', hacia: 'juridica', requiereAprobacion: true })
  })

  it('escala un solo escalón a la vez aunque la clasificación salte varios tramos', () => {
    const resultado = evaluarEscalamiento(
      contexto({
        etapaActual: 'preventiva',
        clasificacion: clasificacion({ codigo: 'ALTO_RIESGO', etapaCobranza: 'juridica' }),
      }),
    )
    expect(resultado).toMatchObject({ tipo: 'escalar', hacia: 'administrativa', requiereAprobacion: false })
  })

  it('ya en judicial (tope de la máquina) permanece aunque la clasificación siga sugiriendo escalar', () => {
    const resultado = evaluarEscalamiento(
      contexto({ etapaActual: 'judicial', clasificacion: clasificacion({ etapaCobranza: 'judicial' }) }),
    )
    expect(resultado).toEqual({ tipo: 'permanecer' })
  })

  it('CAR §11.2 — saldo vencido en cero des-escala directo a preventiva desde cualquier etapa', () => {
    const resultado = evaluarEscalamiento(contexto({ etapaActual: 'prejuridica', saldoVencido: 0 }))
    expect(resultado).toMatchObject({ tipo: 'desescalar', hacia: 'preventiva', requiereAprobacion: false })
  })

  it('des-escalar a preventiva desde juridica/judicial SIEMPRE exige aprobación (REC-CAR-013)', () => {
    const resultado = evaluarEscalamiento(contexto({ etapaActual: 'juridica', saldoVencido: 0 }))
    expect(resultado).toMatchObject({ tipo: 'desescalar', hacia: 'preventiva', requiereAprobacion: true })
  })

  it('ya en preventiva con saldo en cero permanece (nada que des-escalar)', () => {
    const resultado = evaluarEscalamiento(contexto({ etapaActual: 'preventiva', saldoVencido: 0 }))
    expect(resultado).toEqual({ tipo: 'permanecer' })
  })

  it('desciende un escalón cuando la clasificación baja pero el saldo sigue en mora', () => {
    const resultado = evaluarEscalamiento(
      contexto({
        etapaActual: 'prejuridica',
        clasificacion: clasificacion({ codigo: 'MORA_TEMPRANA', etapaCobranza: 'administrativa' }),
        saldoVencido: 50_000,
      }),
    )
    expect(resultado).toMatchObject({ tipo: 'desescalar', hacia: 'administrativa', requiereAprobacion: false })
  })

  it('judicial no tiene bajada parcial a juridica — permanece si la clasificación baja pero el saldo no es cero', () => {
    const resultado = evaluarEscalamiento(
      contexto({
        etapaActual: 'judicial',
        clasificacion: clasificacion({ codigo: 'ALTO_RIESGO', etapaCobranza: 'juridica' }),
        saldoVencido: 50_000,
      }),
    )
    expect(resultado).toEqual({ tipo: 'permanecer' })
  })

  it('CAR §12.5 — un acuerdo vigente congela la etapa sin importar la clasificación', () => {
    const resultado = evaluarEscalamiento(
      contexto({
        etapaActual: 'administrativa',
        clasificacion: clasificacion({ etapaCobranza: 'juridica' }),
        tieneAcuerdoVigente: true,
      }),
    )
    expect(resultado.tipo).toBe('congelar')
  })

  it('PH-C42 / I-C23 — administrativa→prejuridica bloqueada si solo hay constancias humanas', () => {
    const resultado = evaluarEscalamiento(
      contexto({
        etapaActual: 'administrativa',
        clasificacion: clasificacion({ codigo: 'MORA_AVANZADA', etapaCobranza: 'prejuridica' }),
        // Tres llamadas registradas y agotadas: la estrategia se cumplió,
        // pero ninguna dejó acuse técnico.
        accionesEjecutadasEnEtapa: [accion({ estrategiaId: 'e1', agotada: true })],
        accionesAcreditadas: 0,
      }),
    )
    expect(resultado).toEqual({
      tipo: 'bloqueado',
      requisitoFaltante: 'Ninguna acción acreditada por canal con acuse técnico (CAR §34.2, REC-CAR-017, I-C23)',
    })
  })

  it('I-C23 — con una acción acreditada, el mismo caso sí escala a prejuridica', () => {
    const resultado = evaluarEscalamiento(
      contexto({
        etapaActual: 'administrativa',
        clasificacion: clasificacion({ codigo: 'MORA_AVANZADA', etapaCobranza: 'prejuridica' }),
        accionesEjecutadasEnEtapa: [accion({ estrategiaId: 'e1', agotada: true })],
        accionesAcreditadas: 1,
      }),
    )
    expect(resultado).toMatchObject({ tipo: 'escalar', hacia: 'prejuridica', requiereAprobacion: true })
  })

  it('I-C23 — prejuridica→juridica también exige notificación probada, antes que la certificación', () => {
    const resultado = evaluarEscalamiento(
      contexto({
        etapaActual: 'prejuridica',
        clasificacion: clasificacion({ codigo: 'MORA_CRITICA', etapaCobranza: 'juridica' }),
        tieneCertificacionVigente: true,
        accionesAcreditadas: 0,
      }),
    )
    expect(resultado.tipo).toBe('bloqueado')
    expect(resultado).toMatchObject({ requisitoFaltante: expect.stringContaining('I-C23') })
  })

  it('I-C23 no estorba el des-escalamiento: sin evidencia igual se vuelve a preventiva con saldo cero', () => {
    const resultado = evaluarEscalamiento(
      contexto({ etapaActual: 'prejuridica', saldoVencido: 0, accionesAcreditadas: 0 }),
    )
    expect(resultado).toMatchObject({ tipo: 'desescalar', hacia: 'preventiva' })
  })
})
