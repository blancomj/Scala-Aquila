/**
 * MANT-8 · Indicadores y tendencias de mantenimiento. Solo lectura — todo indicador es una
 * función de base de datos (ninguno persistido, MANT_08_indicadores_tendencias.md §3.4), así que
 * este store no tiene ninguna acción de escritura, solo `cargar*`.
 *
 * "Comprometido" y "Disponible" (mockup del corte) — decisión aprobada, ver
 * 20260932420000_mant8_indicadores_financieros.sql: Presupuestado/Ejecutado son passthrough
 * exacto de presupuesto_cuenta_ejecucion (coinciden por construcción con el módulo de
 * Presupuesto); "Comprometido" se muestra APARTE, derivado de costo_estimado de OT abiertas y
 * etiquetado como estimado; "Disponible" no se calcula (restaría una estimación de una cifra
 * real).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type CostosFila = Database['public']['Functions']['mant_costos']['Returns'][number]
type MttrFila = Database['public']['Functions']['mant_indicador_mttr']['Returns'][number]
type MtbfFila = Database['public']['Functions']['mant_indicador_mtbf']['Returns'][number]
type DisponibilidadFila = Database['public']['Functions']['mant_indicador_disponibilidad']['Returns'][number]
type CumplimientoPlanFila = Database['public']['Functions']['mant_indicador_cumplimiento_plan']['Returns'][number]
type OtATiempoFila = Database['public']['Functions']['mant_indicador_ot_a_tiempo']['Returns'][number]
type ProporcionFila = Database['public']['Functions']['mant_indicador_proporcion_mantenimiento']['Returns'][number]
type CumplimientoNormativoFila =
  Database['public']['Functions']['mant_indicador_cumplimiento_normativo']['Returns'][number]
type HallazgoCriticoFila = Database['public']['Functions']['mant_indicador_hallazgos_criticos']['Returns'][number]
type HabilitacionVencidaFila =
  Database['public']['Functions']['mant_indicador_habilitaciones_vencidas']['Returns'][number]
type FinancieroFila = Database['public']['Functions']['mant_indicador_financiero_presupuesto']['Returns'][number]
type ComprometidoFila = Database['public']['Functions']['mant_indicador_comprometido_estimado']['Returns'][number]
type CostoM2Fila = Database['public']['Functions']['mant_indicador_costo_m2']['Returns'][number]
type TendenciaFila = Database['public']['Functions']['mant_tendencia_fallas']['Returns'][number]

export const useMantenimientoIndicadoresStore = defineStore('mantenimientoIndicadores', () => {
  const costos = shallowRef<CostosFila[]>([])
  const mttr = ref<MttrFila | null>(null)
  const mtbf = ref<MtbfFila | null>(null)
  const disponibilidad = ref<DisponibilidadFila | null>(null)
  const cumplimientoPlan = ref<CumplimientoPlanFila | null>(null)
  const otATiempo = ref<OtATiempoFila | null>(null)
  const proporcionMantenimiento = shallowRef<ProporcionFila[]>([])
  const cumplimientoNormativo = shallowRef<CumplimientoNormativoFila[]>([])
  const hallazgosCriticos = shallowRef<HallazgoCriticoFila[]>([])
  const habilitacionesVencidas = shallowRef<HabilitacionVencidaFila[]>([])
  const financiero = shallowRef<FinancieroFila[]>([])
  const comprometidoEstimado = ref<ComprometidoFila | null>(null)
  const costoM2 = ref<CostoM2Fila | null>(null)
  const tendencia = shallowRef<TendenciaFila[]>([])
  const loading = ref(false)

  /** Todo lo que no necesita un activo/presupuesto específico — el resumen tenant-wide del rango. */
  async function cargarResumen(params: { tenantId: string; desde: string; hasta: string }): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { tenantId, desde, hasta } = params
      const [
        rMttr,
        rCumplimientoPlan,
        rOtATiempo,
        rProporcion,
        rCumplimientoNormativo,
        rHallazgos,
        rHabilitaciones,
        rComprometido,
        rCostoM2,
        rCostos,
      ] = await Promise.all([
        cliente.rpc('mant_indicador_mttr', { p_tenant_id: tenantId, p_desde: desde, p_hasta: hasta }).single(),
        cliente.rpc('mant_indicador_cumplimiento_plan', { p_tenant_id: tenantId, p_desde: desde, p_hasta: hasta }).single(),
        cliente.rpc('mant_indicador_ot_a_tiempo', { p_tenant_id: tenantId, p_desde: desde, p_hasta: hasta }).single(),
        cliente.rpc('mant_indicador_proporcion_mantenimiento', {
          p_tenant_id: tenantId,
          p_desde: desde,
          p_hasta: hasta,
        }),
        cliente.rpc('mant_indicador_cumplimiento_normativo', { p_tenant_id: tenantId }),
        cliente.rpc('mant_indicador_hallazgos_criticos', { p_tenant_id: tenantId }),
        cliente.rpc('mant_indicador_habilitaciones_vencidas', { p_tenant_id: tenantId }),
        cliente.rpc('mant_indicador_comprometido_estimado', { p_tenant_id: tenantId }).single(),
        cliente.rpc('mant_indicador_costo_m2', { p_tenant_id: tenantId, p_desde: desde, p_hasta: hasta }).single(),
        cliente.rpc('mant_costos', { p_tenant_id: tenantId, p_desde: desde, p_hasta: hasta }),
      ])
      if (rMttr.error) throw rMttr.error
      if (rCumplimientoPlan.error) throw rCumplimientoPlan.error
      if (rOtATiempo.error) throw rOtATiempo.error
      if (rProporcion.error) throw rProporcion.error
      if (rCumplimientoNormativo.error) throw rCumplimientoNormativo.error
      if (rHallazgos.error) throw rHallazgos.error
      if (rHabilitaciones.error) throw rHabilitaciones.error
      if (rComprometido.error) throw rComprometido.error
      if (rCostoM2.error) throw rCostoM2.error
      if (rCostos.error) throw rCostos.error

      mttr.value = rMttr.data
      cumplimientoPlan.value = rCumplimientoPlan.data
      otATiempo.value = rOtATiempo.data
      proporcionMantenimiento.value = rProporcion.data ?? []
      cumplimientoNormativo.value = rCumplimientoNormativo.data ?? []
      hallazgosCriticos.value = rHallazgos.data ?? []
      habilitacionesVencidas.value = rHabilitaciones.data ?? []
      comprometidoEstimado.value = rComprometido.data
      costoM2.value = rCostoM2.data
      costos.value = rCostos.data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarMtbf(params: { tenantId: string; activoId: string; desde: string; hasta: string }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .rpc('mant_indicador_mtbf', {
        p_tenant_id: params.tenantId,
        p_activo_id: params.activoId,
        p_desde: params.desde,
        p_hasta: params.hasta,
      })
      .single()
    if (error) throw error
    mtbf.value = data
  }

  async function cargarDisponibilidad(params: {
    tenantId: string
    activoId: string
    desde: string
    hasta: string
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .rpc('mant_indicador_disponibilidad', {
        p_tenant_id: params.tenantId,
        p_activo_id: params.activoId,
        p_desde: params.desde,
        p_hasta: params.hasta,
      })
      .single()
    if (error) throw error
    disponibilidad.value = data
  }

  async function cargarFinanciero(params: { tenantId: string; presupuestoId: string; cuentaId?: string }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('mant_indicador_financiero_presupuesto', {
      p_tenant_id: params.tenantId,
      p_presupuesto_id: params.presupuestoId,
      p_cuenta_id: params.cuentaId ?? undefined,
    })
    if (error) throw error
    financiero.value = data ?? []
  }

  async function cargarTendencia(params: {
    tenantId: string
    activoId: string
    ventanas: number
    diasVentana?: number
    umbralObservaciones?: number
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('mant_tendencia_fallas', {
      p_tenant_id: params.tenantId,
      p_activo_id: params.activoId,
      p_ventanas: params.ventanas,
      p_dias_ventana: params.diasVentana ?? undefined,
      p_umbral_observaciones: params.umbralObservaciones ?? undefined,
    })
    if (error) throw error
    tendencia.value = data ?? []
  }

  function limpiar(): void {
    costos.value = []
    mttr.value = null
    mtbf.value = null
    disponibilidad.value = null
    cumplimientoPlan.value = null
    otATiempo.value = null
    proporcionMantenimiento.value = []
    cumplimientoNormativo.value = []
    hallazgosCriticos.value = []
    habilitacionesVencidas.value = []
    financiero.value = []
    comprometidoEstimado.value = null
    costoM2.value = null
    tendencia.value = []
  }

  return {
    costos,
    mttr,
    mtbf,
    disponibilidad,
    cumplimientoPlan,
    otATiempo,
    proporcionMantenimiento,
    cumplimientoNormativo,
    hallazgosCriticos,
    habilitacionesVencidas,
    financiero,
    comprometidoEstimado,
    costoM2,
    tendencia,
    loading,
    cargarResumen,
    cargarMtbf,
    cargarDisponibilidad,
    cargarFinanciero,
    cargarTendencia,
    limpiar,
  }
})
