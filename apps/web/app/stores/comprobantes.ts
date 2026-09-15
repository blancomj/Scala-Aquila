/**
 * CO-2 · Núcleo del libro contable — comprobantes con partida doble persistida.
 *
 * NO contabiliza todavía ninguna operación real de otro módulo (cartera, presupuesto, fondos) —
 * eso es CO-3. Este store solo cubre la captura manual y el ciclo de vida
 * borrador → contabilizado → anulado, más la reversión.
 *
 * `numero` nunca se envía desde aquí: lo asigna `fn_contabilizar_comprobante` (RPC), nunca un
 * UPDATE directo — guard_contable_comprobante_transicion lo rechaza con
 * COMPROBANTE_NUMERO_NO_ASIGNABLE si alguien lo intenta.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type ComprobanteRow = Database['public']['Tables']['contable_comprobante']['Row']
type DetalleRow = Database['public']['Tables']['contable_comprobante_detalle']['Row']
type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']
type PeriodoRow = Database['public']['Tables']['periodos']['Row']

export interface NuevaLineaDetalle {
  cuentaId: string
  debito: number
  credito: number
  descripcion?: string
  terceroId?: string | null
  inmuebleId?: string | null
  centroCostoId?: number | null
  agrupacionId?: string | null
  fondoId?: string | null
}

export interface FiltrosComprobantes {
  periodoId?: string
  tipoId?: number
  estado?: Database['public']['Enums']['contable_comprobante_estado_t']
  desde?: string
  hasta?: string
}

export const useComprobantesStore = defineStore('comprobantes', () => {
  const comprobantes = shallowRef<ComprobanteRow[]>([])
  const detalle = shallowRef<DetalleRow[]>([])
  const tipos = shallowRef<ListaTipoRow[]>([])
  const periodos = shallowRef<PeriodoRow[]>([])
  const loading = ref(false)

  /** Tipos que solo genera el motor — no se ofrecen en el formulario de captura manual (CO-2
   * §3.2). Constante de UI, sin columna nueva en lista_tipos ni guard de servidor: ningún
   * guard de este corte depende de la distinción, es puramente qué opciones mostrar. */
  const TIPOS_DE_SISTEMA: ReadonlySet<string> = new Set([
    'APERTURA',
    'DEPRECIACION',
    'DETERIORO',
    'CIERRE',
  ])

  const tiposCaptura = computed(() => tipos.value.filter((t) => !TIPOS_DE_SISTEMA.has(t.codigo)))

  async function cargarTipos(): Promise<ListaTipoRow[]> {
    if (tipos.value.length > 0) return tipos.value
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('lista_tipos')
      .select('*')
      .eq('tipo', 'TIPO_COMPROBANTE')
      .eq('activo', true)
      .order('orden')
    if (error) throw error
    tipos.value = data ?? []
    return tipos.value
  }

  async function cargarPeriodos(tenantId: string): Promise<PeriodoRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('periodos')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('anio', { ascending: false })
      .order('mes', { ascending: false })
    if (error) throw error
    periodos.value = data ?? []
    return periodos.value
  }

  async function cargarComprobantes(
    tenantId: string,
    filtros: FiltrosComprobantes = {},
  ): Promise<ComprobanteRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      let consulta = cliente
        .from('contable_comprobante')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

      if (filtros.periodoId) consulta = consulta.eq('periodo_id', filtros.periodoId)
      if (filtros.tipoId) consulta = consulta.eq('tipo_id', filtros.tipoId)
      if (filtros.estado) consulta = consulta.eq('estado', filtros.estado)
      if (filtros.desde) consulta = consulta.gte('fecha', filtros.desde)
      if (filtros.hasta) consulta = consulta.lte('fecha', filtros.hasta)

      const { data, error } = await consulta
      if (error) throw error
      comprobantes.value = data ?? []
      return comprobantes.value
    } finally {
      loading.value = false
    }
  }

  async function cargarDetalle(comprobanteId: string): Promise<DetalleRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('contable_comprobante_detalle')
      .select('*')
      .eq('comprobante_id', comprobanteId)
      .order('linea')
    if (error) throw error
    detalle.value = data ?? []
    return detalle.value
  }

  /** Crea el borrador y sus líneas en dos pasos — no hay RPC atómico porque el borrador es
   * editable (agregar/quitar líneas) antes de contabilizar; la atomicidad real la exige
   * fn_contabilizar_comprobante, no la captura. */
  async function crearComprobante(params: {
    tenantId: string
    periodoId: string
    tipoId: number
    anio: number
    fecha: string
    descripcion: string
    observaciones?: string
    lineas: NuevaLineaDetalle[]
  }): Promise<string> {
    const cliente = useSupabaseClient<Database>()
    const { data: comp, error: errComp } = await cliente
      .from('contable_comprobante')
      .insert({
        tenant_id: params.tenantId,
        periodo_id: params.periodoId,
        tipo_id: params.tipoId,
        anio: params.anio,
        fecha: params.fecha,
        descripcion: params.descripcion,
        observaciones: params.observaciones?.trim() || null,
      })
      .select('id')
      .single()
    if (errComp) throw errComp

    const filas = params.lineas.map((l, i) => ({
      tenant_id: params.tenantId,
      comprobante_id: comp.id,
      linea: i + 1,
      cuenta_id: l.cuentaId,
      debito: l.debito,
      credito: l.credito,
      descripcion: l.descripcion ?? null,
      tercero_id: l.terceroId ?? null,
      inmueble_id: l.inmuebleId ?? null,
      centro_costo_id: l.centroCostoId ?? null,
      agrupacion_id: l.agrupacionId ?? null,
      fondo_id: l.fondoId ?? null,
    }))
    const { error: errLineas } = await cliente.from('contable_comprobante_detalle').insert(filas)
    if (errLineas) throw errLineas

    await cargarComprobantes(params.tenantId)
    return comp.id
  }

  /** Solo admite un borrador (RLS + guard_contable_comprobante_detalle_inmutable rechazan
   * cualquier cambio fuera de ese estado con COMPROBANTE_CONTABILIZADO_INMUTABLE). */
  async function eliminarComprobante(tenantId: string, comprobanteId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('contable_comprobante').delete().eq('id', comprobanteId)
    if (error) throw error
    await cargarComprobantes(tenantId)
  }

  async function contabilizar(tenantId: string, comprobanteId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.rpc('fn_contabilizar_comprobante', {
      p_comprobante_id: comprobanteId,
    })
    if (error) throw error
    await cargarComprobantes(tenantId)
  }

  /** Anular es una transición directa (contabilizado → anulado), no una RPC — la valida
   * guard_contable_comprobante_transicion (periodo abierto, motivo obligatorio). */
  async function anular(tenantId: string, comprobanteId: string, motivo: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('contable_comprobante')
      .update({ estado: 'anulado', anulado_motivo: motivo })
      .eq('id', comprobanteId)
    if (error) throw error
    await cargarComprobantes(tenantId)
  }

  /** RPC dedicada (no un UPDATE directo): contable_comprobante_update_auxiliar exige estado in
   * (borrador, anulado) a propósito — un comprobante contabilizado necesita poder anotarse
   * igual (ej. un revisor fiscal dejando contexto), así que fn_actualizar_observaciones_
   * comprobante (SECURITY DEFINER, solo toca esta columna) es el único camino para ese caso. */
  async function actualizarObservaciones(
    tenantId: string,
    comprobanteId: string,
    observaciones: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.rpc('fn_actualizar_observaciones_comprobante', {
      p_comprobante_id: comprobanteId,
      p_observaciones: observaciones,
    })
    if (error) throw error
    await cargarComprobantes(tenantId)
  }

  async function reversar(
    tenantId: string,
    comprobanteId: string,
    periodoDestinoId: string,
    motivo: string,
  ): Promise<string> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('fn_reversar_comprobante', {
      p_comprobante_id: comprobanteId,
      p_periodo_destino: periodoDestinoId,
      p_motivo: motivo,
    })
    if (error) throw error
    await cargarComprobantes(tenantId)
    return data as string
  }

  function limpiar(): void {
    comprobantes.value = []
    detalle.value = []
    tipos.value = []
    periodos.value = []
  }

  return {
    comprobantes,
    detalle,
    tipos,
    periodos,
    loading,
    tiposCaptura,
    cargarTipos,
    cargarPeriodos,
    cargarComprobantes,
    cargarDetalle,
    crearComprobante,
    eliminarComprobante,
    contabilizar,
    anular,
    reversar,
    actualizarObservaciones,
    limpiar,
  }
})
