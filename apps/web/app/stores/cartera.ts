/**
 * Dashboard de Cartera (CAR F9 §23.1/§23.2) — tarjetas principales,
 * distribución por antigüedad/etapa, Top N por inmueble, evolución
 * histórica, recaudo del mes y alertas.
 *
 * cartera-dashboard/cartera-evolucion/cartera-recaudo/cartera-alertas
 * son deliberadamente independientes de cartera-indicadores — esa exige
 * snapshot en fecha_desde Y fecha_hasta o responde 422 (Roll/Cure Rate),
 * lo que la hace frágil para un dashboard que siempre debe cargar.
 * Recaudo del mes reutiliza fn_indicadores_gestion directo (sin ese
 * gate), no cartera-indicadores completa.
 *
 * Piezas sin backend hoy (cobertura de provisión, deltas "vs. mes
 * anterior") quedan documentadas como pendientes en la página. Cobertura
 * de provisión queda "próximamente" definitivo (no existe concepto de
 * provisión contable en el esquema — decisión explícita del usuario).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

export interface TarjetasCarteraDTO {
  carteraTotal: string
  carteraVencida: string
  carteraCorriente: string
  /** GAP-CAR-001: cargos sin fecha de vencimiento determinable — nunca fundidos en carteraCorriente. */
  carteraSinVencimiento: string
  interesesCausados: string
  carteraMayor90: string
  carteraMayor180: string
  carteraPrejuridica: string
  carteraJuridica: string
  saldosAFavor: string
}

export interface TramoAntiguedadDTO {
  codigo: string
  diasMin: number
  diasMax: number | null
  cantidadInmuebles: number
  monto: string
  pctDelTotal: number
}

export interface EtapaCarteraDTO {
  etapa: string
  cantidadInmuebles: number
  monto: string
  pctDelTotal: number
}

export interface InmuebleTopDTO {
  inmuebleId: string
  codigo: string
  deudaVencida: string
  diasMoraMaximo: number
}

export interface DashboardCarteraDTO {
  fechaCorte: string
  tarjetas: TarjetasCarteraDTO
  antiguedad: TramoAntiguedadDTO[]
  porEtapa: EtapaCarteraDTO[]
  topInmuebles: InmuebleTopDTO[]
  diasPromedioMora: number | null
}

export interface PuntoEvolucionDTO {
  mes: string
  fechaSnapshot: string | null
  deudaVencida: string | null
}

export interface EvolucionCarteraDTO {
  puntos: PuntoEvolucionDTO[]
}

export interface RecaudoDTO {
  fechaDesde: string
  fechaHasta: string
  montoRecaudado: string
  collectionEffectiveness: number | null
}

export interface AlertasDTO {
  fechaReferencia: string
  obligacionesMayor90Cantidad: number
  obligacionesMayor90Monto: string
  promesasPorVencerCantidad: number
  promesasPorVencerMonto: string
  cuotasAcuerdoVencidasCantidad: number
  cuotasAcuerdoVencidasMonto: string
  /** GAP-CAR-001: cargos sin fecha de vencimiento determinable (ni propia ni de su periodo). */
  obligacionesSinVencimientoCantidad: number
  obligacionesSinVencimientoMonto: string
}

export interface RollRateTramoDTO {
  tramoCodigo: string
  tramoSiguienteCodigo: string | null
  deudaEnTramoAnterior: string
  deudaQueRoloAlSiguiente: string
  rollRate: number | null
}

export interface IndicadoresCarteraDTO {
  fechaDesde: string
  fechaHasta: string
  overduePortfolioPct: number | null
  cureRate: number | null
  rollRatePorTramo: RollRateTramoDTO[]
  recoveryRate: number | null
  collectionEffectiveness: number | null
  promiseFulfillmentRate: number | null
  agreementFulfillmentRate: number | null
  legalReferralRate: number | null
  legalRecoveryRate: number | null
  averageDaysToRecovery: number | null
  costToCollect: number | null
}

export type TipoEventoActividadDTO = 'pago' | 'promesa' | 'acuerdo' | 'caso_juridico'

export interface EventoActividadDTO {
  tipo: TipoEventoActividadDTO
  fecha: string
  inmuebleId: string
  codigo: string
  monto: string
}

export const useCarteraStore = defineStore('cartera', () => {
  const dashboard = shallowRef<DashboardCarteraDTO | null>(null)
  const evolucion = shallowRef<PuntoEvolucionDTO[]>([])
  const recaudo = shallowRef<RecaudoDTO | null>(null)
  const alertas = shallowRef<AlertasDTO | null>(null)
  const actividadReciente = shallowRef<EventoActividadDTO[]>([])
  const indicadores = shallowRef<IndicadoresCarteraDTO | null>(null)
  const loading = ref(false)

  async function cargarDashboard(
    tenantId: string,
    fechaCorte: string,
    topN = 10,
  ): Promise<DashboardCarteraDTO> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorFuncion } = await cliente.functions.invoke<DashboardCarteraDTO>(
        'cartera-dashboard',
        { body: { tenant_id: tenantId, fecha_corte: fechaCorte, top_n: topN } },
      )
      if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
      if (!data) throw new Error('cartera-dashboard no devolvió datos.')
      dashboard.value = data
      return data
    } finally {
      loading.value = false
    }
  }

  async function cargarEvolucion(
    tenantId: string,
    fechaHasta: string,
    meses = 6,
  ): Promise<PuntoEvolucionDTO[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<EvolucionCarteraDTO>(
      'cartera-evolucion',
      { body: { tenant_id: tenantId, fecha_hasta: fechaHasta, meses } },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('cartera-evolucion no devolvió datos.')
    evolucion.value = data.puntos
    return data.puntos
  }

  async function cargarRecaudo(
    tenantId: string,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<RecaudoDTO> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<RecaudoDTO>('cartera-recaudo', {
      body: { tenant_id: tenantId, fecha_desde: fechaDesde, fecha_hasta: fechaHasta },
    })
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('cartera-recaudo no devolvió datos.')
    recaudo.value = data
    return data
  }

  async function cargarAlertas(tenantId: string, fechaReferencia: string): Promise<AlertasDTO> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<AlertasDTO>('cartera-alertas', {
      body: { tenant_id: tenantId, fecha_referencia: fechaReferencia },
    })
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('cartera-alertas no devolvió datos.')
    alertas.value = data
    return data
  }

  async function cargarActividadReciente(tenantId: string, limite = 15): Promise<EventoActividadDTO[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<{ eventos: EventoActividadDTO[] }>(
      'cartera-actividad-reciente',
      { body: { tenant_id: tenantId, limite } },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('cartera-actividad-reciente no devolvió datos.')
    actividadReciente.value = data.eventos
    return data.eventos
  }

  async function cargarIndicadores(
    tenantId: string,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<IndicadoresCarteraDTO> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<IndicadoresCarteraDTO>(
      'cartera-indicadores',
      { body: { tenant_id: tenantId, fecha_desde: fechaDesde, fecha_hasta: fechaHasta } },
    )
    if (errorFuncion) {
      indicadores.value = null
      throw await extraerErrorFuncion(errorFuncion)
    }
    if (!data) throw new Error('cartera-indicadores no devolvió datos.')
    indicadores.value = data
    return data
  }

  function limpiar(): void {
    dashboard.value = null
    evolucion.value = []
    recaudo.value = null
    alertas.value = null
    actividadReciente.value = []
    indicadores.value = null
  }

  return {
    dashboard,
    evolucion,
    recaudo,
    alertas,
    actividadReciente,
    indicadores,
    loading,
    cargarDashboard,
    cargarEvolucion,
    cargarRecaudo,
    cargarAlertas,
    cargarActividadReciente,
    cargarIndicadores,
    limpiar,
  }
})
