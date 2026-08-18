/**
 * Dashboard de Cartera (CAR F9 §23.1/§23.2) — tarjetas principales y
 * distribución por antigüedad, a una fecha de corte explícita.
 *
 * Solo `cartera-dashboard` por ahora: es la única Edge Function de F9 que
 * no depende de que exista un snapshot congelado (JOB_CARTERA_DIARIA) —
 * `cartera-indicadores` exige snapshot en fecha_desde Y fecha_hasta o
 * responde 422 (Roll/Cure Rate), lo que la hace frágil para un rango tipo
 * "mes actual" en un dashboard que siempre debe cargar. Los indicadores
 * de período (Recaudo del mes, Efectividad de cobranza) y el resto de
 * piezas sin backend hoy (etapa de cobranza completa, Top 10 por
 * inmueble, evolución histórica, alertas, actividad reciente, cobertura
 * de provisión) quedan documentadas como pendientes en la página —
 * decisión del usuario (2026-08-17): "próximamente" visible, no inventar
 * ni ocultar silenciosamente.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

export interface TarjetasCarteraDTO {
  carteraTotal: string
  carteraVencida: string
  carteraCorriente: string
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

export interface DashboardCarteraDTO {
  fechaCorte: string
  tarjetas: TarjetasCarteraDTO
  antiguedad: TramoAntiguedadDTO[]
  porEtapa: EtapaCarteraDTO[]
}

export interface PuntoEvolucionDTO {
  mes: string
  fechaSnapshot: string | null
  deudaVencida: string | null
}

export interface EvolucionCarteraDTO {
  puntos: PuntoEvolucionDTO[]
}

export const useCarteraStore = defineStore('cartera', () => {
  const dashboard = shallowRef<DashboardCarteraDTO | null>(null)
  const evolucion = shallowRef<PuntoEvolucionDTO[]>([])
  const loading = ref(false)

  async function cargarDashboard(tenantId: string, fechaCorte: string): Promise<DashboardCarteraDTO> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorFuncion } = await cliente.functions.invoke<DashboardCarteraDTO>(
        'cartera-dashboard',
        { body: { tenant_id: tenantId, fecha_corte: fechaCorte } },
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

  function limpiar(): void {
    dashboard.value = null
    evolucion.value = []
  }

  return {
    dashboard,
    evolucion,
    loading,
    cargarDashboard,
    cargarEvolucion,
    limpiar,
  }
})
