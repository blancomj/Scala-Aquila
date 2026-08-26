/**
 * Liquidación de periodos, en dos tiempos (plan 2026-08-24).
 *
 * `periodos` se lee y se crea directo por RLS (`crearPeriodo`,
 * PLAN_DATOS_REALES.md §3.1.5) — solo INSERT, sin tocar `estado` (nace
 * 'abierto'); las transiciones las rigen los guards de la base.
 *
 * ═══ QUÉ PASA POR DÓNDE, Y POR QUÉ ═══
 *
 * Los cuatro actos del flujo no se resuelven igual, y la diferencia no es
 * arbitraria:
 *
 *   simular   → Edge Function. Necesita correr el motor (TypeScript) y
 *               escribir en tablas sin política de INSERT.
 *   solicitar → UPDATE directo por RLS. Es un cambio de estado sin efectos
 *               colaterales; el guard decide si vale. Sin Edge Function,
 *               mismo criterio que acciones_cobranza.
 *   aplicar   → Edge Function. Verifica el snapshot contra la base viva
 *               (solo TS sabe calcular ese hash) y llama la RPC que hace
 *               todo lo demás en una transacción.
 *   anular    → RPC directa. No hay nada que calcular: es una reversión
 *               entera dentro de la base.
 *
 * El rol lo verifica siempre la base (guard_liquidacion_transicion exige
 * administrador para aprobar/rechazar/anular). Lo que el store expone es
 * solo para decidir qué botones pintar — nunca es la barrera de seguridad.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type PeriodoRow = Database['public']['Tables']['periodos']['Row']
type LiquidacionRow = Database['public']['Tables']['liquidaciones']['Row']
type LiquidacionLineaRow = Database['public']['Tables']['liquidacion_lineas']['Row']

export type LiquidacionEstado = Database['public']['Enums']['liquidacion_estado_t']

export interface LineaLiquidacionInmueble extends LiquidacionLineaRow {
  readonly liquidacion: LiquidacionRow & { readonly periodo: PeriodoRow }
}

/** Una fila de fn_liquidacion_prevuelo. */
export interface HallazgoPrevuelo {
  severidad: 'bloqueo' | 'aviso'
  codigo: string
  titulo: string
  detalle: string
}

export interface ResultadoSimulacion {
  liquidacion_id: string
  periodo_id: string
  estado: LiquidacionEstado
  result_hash: string
  tenant_total: string
  lineas: number
  descarto_anteriores: number
  prevuelo: HallazgoPrevuelo[]
}

export interface ResultadoAplicacion {
  liquidacion_id: string
  periodo_id: string
  tenant_total: number
  cargos_creados: number
  cargos_novedades: number
  reconocimiento: 'causacion' | 'caja'
  estados_emitidos: number
  avisos: HallazgoPrevuelo[]
}

export interface ResultadoAnulacion {
  liquidacion_id: string
  periodo_id: string
  contra_cargos: number
  estados_retirados: number
  periodo_reabierto: boolean
  motivo: string
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

  // ── El flujo de dos tiempos ───────────────────────────────────────────

  /** Consulta los gates sin calcular nada — para pintar la verificación
   * previa antes de que exista una Pre-Liquidación. */
  async function cargarPrevuelo(
    tenantId: string,
    periodoId: string,
    liquidacionId?: string,
  ): Promise<HallazgoPrevuelo[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('fn_liquidacion_prevuelo', {
      p_tenant_id: tenantId,
      p_periodo_id: periodoId,
      p_liquidacion_id: liquidacionId ?? undefined,
    })
    if (error) throw error
    return (data ?? []) as HallazgoPrevuelo[]
  }

  async function simular(periodoId: string, tenantId: string): Promise<ResultadoSimulacion> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.functions.invoke<ResultadoSimulacion>(
      'simular-liquidacion',
      { body: { periodo_id: periodoId } },
    )
    if (error) throw await extraerErrorFuncion(error)
    if (!data) throw new Error('simular-liquidacion no devolvió datos.')
    await cargarLiquidaciones(tenantId)
    return data
  }

  /** UPDATE directo: el guard asigna propuesta_por desde auth.uid() y decide
   * si la transición vale. */
  async function solicitarAplicacion(
    liquidacionId: string,
    tenantId: string,
    nota?: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('liquidaciones')
      .update({ estado: 'pendiente_aprobacion', nota_solicitud: nota?.trim() || null })
      .eq('id', liquidacionId)
    if (error) throw error
    await cargarLiquidaciones(tenantId)
  }

  async function aplicar(liquidacionId: string, tenantId: string): Promise<ResultadoAplicacion> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.functions.invoke<ResultadoAplicacion>(
      'aplicar-liquidacion',
      { body: { liquidacion_id: liquidacionId } },
    )
    if (error) throw await extraerErrorFuncion(error)
    if (!data) throw new Error('aplicar-liquidacion no devolvió datos.')
    await Promise.all([cargarLiquidaciones(tenantId), cargarPeriodos(tenantId)])
    return data
  }

  async function rechazar(
    liquidacionId: string,
    tenantId: string,
    motivo: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('liquidaciones')
      .update({ estado: 'rechazada', motivo_rechazo: motivo.trim() })
      .eq('id', liquidacionId)
    if (error) throw error
    await cargarLiquidaciones(tenantId)
  }

  async function descartar(liquidacionId: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('liquidaciones')
      .update({ estado: 'descartada' })
      .eq('id', liquidacionId)
    if (error) throw error
    await cargarLiquidaciones(tenantId)
  }

  async function anular(
    liquidacionId: string,
    tenantId: string,
    motivo: string,
  ): Promise<ResultadoAnulacion> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('fn_anular_liquidacion', {
      p_liquidacion_id: liquidacionId,
      p_motivo: motivo.trim(),
    })
    if (error) throw error
    await Promise.all([cargarLiquidaciones(tenantId), cargarPeriodos(tenantId)])
    return data as unknown as ResultadoAnulacion
  }

  /** Las líneas de una Pre-Liquidación, con el inmueble y el concepto ya
   * resueltos — el detalle que la pantalla muestra por unidad. */
  async function cargarLineasDeLiquidacion(liquidacionId: string) {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('liquidacion_lineas')
      .select('id, monto, inmueble:inmuebles(id, codigo), concepto:conceptos(id, codigo, nombre)')
      .eq('liquidacion_id', liquidacionId)
    if (error) throw error
    return data ?? []
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
    cargarLineasDeLiquidacion,
    cargarPrevuelo,
    simular,
    solicitarAplicacion,
    aplicar,
    rechazar,
    descartar,
    anular,
    limpiar,
  }
})
