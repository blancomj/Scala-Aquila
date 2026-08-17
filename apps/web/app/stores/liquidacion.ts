/**
 * Liquidación de periodos — F6 (PLAN §5, "el administrador liquida un
 * periodo... desde la UI"). `periodos` se lee y se crea directo por RLS
 * (`crearPeriodo`, PLAN_DATOS_REALES.md §3.1.5) — solo INSERT, sin tocar
 * `estado` (nace 'abierto'); las transiciones posteriores las rige
 * `guard_periodo_transicion`, no hay UPDATE de estado en este store.
 * `liquidaciones`/`liquidacion_lineas` sí pasan por la Edge Function
 * `liquidar-periodo` porque no tienen política de INSERT para
 * `authenticated` — es una escritura privilegiada (service_role), mismo
 * criterio que invitations.ts/presupuesto.ts para operaciones que no
 * pueden resolverse solo con RLS.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type PeriodoRow = Database['public']['Tables']['periodos']['Row']
type LiquidacionRow = Database['public']['Tables']['liquidaciones']['Row']
type LiquidacionLineaRow = Database['public']['Tables']['liquidacion_lineas']['Row']

export interface LineaLiquidacionInmueble extends LiquidacionLineaRow {
  readonly liquidacion: LiquidacionRow & { readonly periodo: PeriodoRow }
}

interface ResultadoLiquidacion {
  liquidacion_id: string
  periodo_id: string
  result_hash: string
  tenant_total: string
  lineas: { inmueble_id: string; concepto_codigo: string; monto: string }[]
}

export const useLiquidacionStore = defineStore('liquidacion', () => {
  const periodos = shallowRef<PeriodoRow[]>([])
  const liquidaciones = shallowRef<LiquidacionRow[]>([])
  const lineasPorInmueble = shallowRef<LineaLiquidacionInmueble[]>([])
  const loading = ref(false)

  async function cargarPeriodos(tenantId: string): Promise<PeriodoRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorPeriodos } = await cliente
        .from('periodos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('anio', { ascending: false })
        .order('mes', { ascending: false })
      if (errorPeriodos) throw errorPeriodos
      periodos.value = data ?? []
      return periodos.value
    } finally {
      loading.value = false
    }
  }

  /** SELECT/INSERT directo por RLS — sin Edge Function. estado nace 'abierto'
   * (default de columna); las transiciones posteriores las rige
   * guard_periodo_transicion, no se tocan aquí. */
  async function crearPeriodo(params: {
    tenantId: string
    anio: number
    mes: number
    fechaVencimiento?: string
  }): Promise<PeriodoRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('periodos')
      .insert({
        tenant_id: params.tenantId,
        anio: params.anio,
        mes: params.mes,
        fecha_vencimiento: params.fechaVencimiento,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarPeriodos(params.tenantId)
    return data
  }

  async function cargarLiquidaciones(tenantId: string): Promise<LiquidacionRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorLiquidaciones } = await cliente
      .from('liquidaciones')
      .select('*')
      .eq('tenant_id', tenantId)
    if (errorLiquidaciones) throw errorLiquidaciones
    liquidaciones.value = data ?? []
    return liquidaciones.value
  }

  async function cargarLineasPorInmueble(
    tenantId: string,
    inmuebleId: string,
  ): Promise<LineaLiquidacionInmueble[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorLineas } = await cliente
      .from('liquidacion_lineas')
      .select('*, liquidacion:liquidaciones(*, periodo:periodos(*))')
      .eq('tenant_id', tenantId)
      .eq('inmueble_id', inmuebleId)
      .order('created_at', { ascending: false })
    if (errorLineas) throw errorLineas
    lineasPorInmueble.value = (data ?? []) as LineaLiquidacionInmueble[]
    return lineasPorInmueble.value
  }

  async function liquidarPeriodo(
    periodoId: string,
    tenantId: string,
  ): Promise<ResultadoLiquidacion> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<ResultadoLiquidacion>(
      'liquidar-periodo',
      { body: { periodo_id: periodoId } },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('liquidar-periodo no devolvió datos.')

    await cargarLiquidaciones(tenantId)
    return data
  }

  function limpiar(): void {
    periodos.value = []
    liquidaciones.value = []
    lineasPorInmueble.value = []
  }

  return {
    periodos,
    liquidaciones,
    lineasPorInmueble,
    loading,
    cargarPeriodos,
    crearPeriodo,
    cargarLiquidaciones,
    cargarLineasPorInmueble,
    liquidarPeriodo,
    limpiar,
  }
})
