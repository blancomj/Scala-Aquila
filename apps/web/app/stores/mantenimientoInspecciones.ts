/**
 * MANT-7 · Inspecciones, hallazgos y acciones correctivas. Una inspección + sus respuestas
 * SIEMPRE se registran vía fn_mant_registrar_inspeccion (nunca un INSERT directo — el guard de
 * la base lo rechaza). Un hallazgo cambia de estado SIEMPRE vía
 * fn_mant_asignar_ot_hallazgo/fn_mant_aceptar_hallazgo/fn_mant_cerrar_hallazgo, nunca por
 * UPDATE directo (ver informe del corte).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type FormatoRow = Database['public']['Tables']['mant_inspeccion_formatos']['Row']
type FormatoInsert = Database['public']['Tables']['mant_inspeccion_formatos']['Insert']
type FormatoUpdate = Database['public']['Tables']['mant_inspeccion_formatos']['Update']
type ItemRow = Database['public']['Tables']['mant_inspeccion_formato_items']['Row']
type ItemInsert = Database['public']['Tables']['mant_inspeccion_formato_items']['Insert']
type InspeccionRow = Database['public']['Tables']['mant_inspecciones']['Row']
type RespuestaRow = Database['public']['Tables']['mant_inspeccion_respuestas']['Row']
type HallazgoRow = Database['public']['Tables']['mant_hallazgos']['Row']
type HallazgoAbiertoFila = Database['public']['Functions']['mant_hallazgos_abiertos']['Returns'][number]
type RespuestaValor = Database['public']['Enums']['respuesta_valor_t']

export const useMantenimientoInspeccionesStore = defineStore('mantenimientoInspecciones', () => {
  const formatos = shallowRef<FormatoRow[]>([])
  const items = shallowRef<ItemRow[]>([])
  const inspecciones = shallowRef<InspeccionRow[]>([])
  const respuestas = shallowRef<RespuestaRow[]>([])
  const hallazgos = shallowRef<HallazgoRow[]>([])
  const hallazgosAbiertos = shallowRef<HallazgoAbiertoFila[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarFormatos(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_inspeccion_formatos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('nombre')
        .order('version', { ascending: false })
      if (error) throw error
      formatos.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarItems(formatoId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('mant_inspeccion_formato_items')
      .select('*')
      .eq('formato_id', formatoId)
      .order('orden')
    if (error) throw error
    items.value = data ?? []
  }

  /** `activoId` — Fase 5 de mantenimiento de activos (D-92): la Ficha 360° necesita las
   * inspecciones de ESTE activo, no las del tenant completo. */
  async function cargarInspecciones(tenantId: string, formatoId?: string, activoId?: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      let consulta = cliente.from('mant_inspecciones').select('*').eq('tenant_id', tenantId)
      if (formatoId) consulta = consulta.eq('formato_id', formatoId)
      if (activoId) consulta = consulta.eq('activo_id', activoId)
      const { data, error } = await consulta.order('fecha', { ascending: false }).limit(200)
      if (error) throw error
      inspecciones.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarRespuestas(inspeccionId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('mant_inspeccion_respuestas')
      .select('*')
      .eq('inspeccion_id', inspeccionId)
    if (error) throw error
    respuestas.value = data ?? []
  }

  async function cargarHallazgosPorInspeccion(inspeccionId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('mant_hallazgos')
      .select('*')
      .eq('inspeccion_id', inspeccionId)
    if (error) throw error
    hallazgos.value = data ?? []
  }

  async function cargarHallazgo(id: string): Promise<HallazgoRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.from('mant_hallazgos').select('*').eq('id', id).single()
    if (error) throw error
    hallazgos.value = hallazgos.value.some((h) => h.id === id)
      ? hallazgos.value.map((h) => (h.id === id ? data : h))
      : [...hallazgos.value, data]
    return data
  }

  async function cargarHallazgosAbiertos(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('mant_hallazgos_abiertos', { p_tenant_id: tenantId })
      if (error) throw error
      hallazgosAbiertos.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function crearFormato(fila: FormatoInsert): Promise<FormatoRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_inspeccion_formatos')
        .insert(fila)
        .select('*')
        .single()
      if (error) throw error
      formatos.value = [data, ...formatos.value]
      return data
    } finally {
      guardando.value = false
    }
  }

  async function actualizarFormato(id: string, patch: FormatoUpdate): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_inspeccion_formatos')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      formatos.value = formatos.value.map((f) => (f.id === id ? data : f))
    } finally {
      guardando.value = false
    }
  }

  /** Activar una versión: la vigente actual (si existe) se retira a historica primero — el
   * guard solo permite esa única transición sobre una fila vigente. */
  async function activarFormato(tenantId: string, codigo: string, id: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data: vigente, error: errVigente } = await cliente
        .from('mant_inspeccion_formatos')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('codigo', codigo)
        .eq('estado', 'vigente')
        .maybeSingle()
      if (errVigente) throw errVigente
      if (vigente) {
        const { error } = await cliente
          .from('mant_inspeccion_formatos')
          .update({ estado: 'historica', vigente_hasta: new Date().toISOString().slice(0, 10) })
          .eq('id', vigente.id)
        if (error) throw error
      }
      const { error } = await cliente
        .from('mant_inspeccion_formatos')
        .update({ estado: 'vigente', vigente_desde: new Date().toISOString().slice(0, 10) })
        .eq('id', id)
      if (error) throw error
      await cargarFormatos(tenantId)
    } finally {
      guardando.value = false
    }
  }

  async function crearItem(fila: ItemInsert): Promise<ItemRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_inspeccion_formato_items')
        .insert(fila)
        .select('*')
        .single()
      if (error) throw error
      items.value = [...items.value, data].sort((a, b) => a.orden - b.orden)
      return data
    } finally {
      guardando.value = false
    }
  }

  async function eliminarItem(id: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_inspeccion_formato_items').delete().eq('id', id)
      if (error) throw error
      items.value = items.value.filter((i) => i.id !== id)
    } finally {
      guardando.value = false
    }
  }

  async function registrarInspeccion(params: {
    tenantId: string
    formatoId: string
    fecha: string
    respuestas: Array<{
      itemId: string
      valor: RespuestaValor
      observacion?: string
      evidenciaDocumentoId?: string
      fechaLimite?: string
    }>
    activoId?: string
    terceroId?: string
    acreditacionReferencia?: string
    resultadoOverride?: InspeccionRow['resultado']
    resultadoMotivo?: string
  }): Promise<InspeccionRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('fn_mant_registrar_inspeccion', {
          p_tenant_id: params.tenantId,
          p_formato_id: params.formatoId,
          p_fecha: params.fecha,
          p_respuestas: params.respuestas.map((r) => ({
            item_id: r.itemId,
            valor: r.valor,
            observacion: r.observacion ?? undefined,
            evidencia_documento_id: r.evidenciaDocumentoId ?? undefined,
            fecha_limite: r.fechaLimite ?? undefined,
          })),
          p_activo_id: params.activoId ?? undefined,
          p_tercero_id: params.terceroId ?? undefined,
          p_acreditacion_referencia: params.acreditacionReferencia ?? undefined,
          p_resultado_override: params.resultadoOverride ?? undefined,
          p_resultado_motivo: params.resultadoMotivo ?? undefined,
        })
        .single()
      if (error) throw error
      inspecciones.value = [data, ...inspecciones.value]
      return data
    } finally {
      guardando.value = false
    }
  }

  async function asignarOtHallazgo(hallazgoId: string, otId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('fn_mant_asignar_ot_hallazgo', {
        p_hallazgo_id: hallazgoId,
        p_ot_id: otId,
      })
      if (error) throw error
    } finally {
      guardando.value = false
    }
  }

  async function aceptarHallazgo(hallazgoId: string, motivo: string, organoId?: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('fn_mant_aceptar_hallazgo', {
        p_hallazgo_id: hallazgoId,
        p_motivo: motivo,
        p_organo_id: organoId ?? undefined,
      })
      if (error) throw error
    } finally {
      guardando.value = false
    }
  }

  async function cerrarHallazgo(hallazgoId: string, evidenciaDocumentoId?: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('fn_mant_cerrar_hallazgo', {
        p_hallazgo_id: hallazgoId,
        p_evidencia_documento_id: evidenciaDocumentoId ?? undefined,
      })
      if (error) throw error
    } finally {
      guardando.value = false
    }
  }

  return {
    formatos,
    items,
    inspecciones,
    respuestas,
    hallazgos,
    hallazgosAbiertos,
    loading,
    guardando,
    cargarFormatos,
    cargarItems,
    cargarInspecciones,
    cargarRespuestas,
    cargarHallazgosPorInspeccion,
    cargarHallazgo,
    cargarHallazgosAbiertos,
    crearFormato,
    actualizarFormato,
    activarFormato,
    crearItem,
    eliminarItem,
    registrarInspeccion,
    asignarOtHallazgo,
    aceptarHallazgo,
    cerrarHallazgo,
  }
})
