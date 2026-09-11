/**
 * MANT-9 · Salud del activo y apoyo a la decisión. El índice y su desglose son SIEMPRE un solo
 * retorno (mant_salud) — este store nunca expone el índice sin el desglose. Ningún método arma
 * ni expone una "recomendación": mant_evaluar_escenario() solo devuelve componentes/total/
 * sensibilidad, nunca un veredicto (prohibido por el corte, ver 20260932500000).
 */
import { defineStore } from 'pinia'
import type { Database, Json } from '@aquila/shared'

type SaludSetRow = Database['public']['Tables']['mant_salud_set']['Row']
type SaludFactorRow = Database['public']['Tables']['mant_salud_factor']['Row']
type SaludFactorInsert = Database['public']['Tables']['mant_salud_factor']['Insert']
type SaludBandaRow = Database['public']['Tables']['mant_salud_banda']['Row']
type SaludBandaInsert = Database['public']['Tables']['mant_salud_banda']['Insert']
type SaludSnapshotRow = Database['public']['Tables']['mant_salud_snapshot']['Row']
type EscenarioRow = Database['public']['Tables']['mant_escenario']['Row']
type EscenarioInsert = Database['public']['Tables']['mant_escenario']['Insert']
type SaludFila = Database['public']['Functions']['mant_salud']['Returns'][number]
type ExplicacionFila = Database['public']['Functions']['mant_salud_explicacion']['Returns'][number]
type ProyeccionFila = Database['public']['Functions']['mant_proyeccion']['Returns'][number]

export const useMantenimientoSaludStore = defineStore('mantenimientoSalud', () => {
  const sets = shallowRef<SaludSetRow[]>([])
  const factores = shallowRef<SaludFactorRow[]>([])
  const bandas = shallowRef<SaludBandaRow[]>([])
  const salud = ref<SaludFila | null>(null)
  const explicacion = shallowRef<ExplicacionFila[]>([])
  const snapshots = shallowRef<SaludSnapshotRow[]>([])
  const escenarios = shallowRef<EscenarioRow[]>([])
  const proyeccion = shallowRef<ProyeccionFila[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  const setVigente = computed(() => sets.value.find((s) => s.estado === 'vigente') ?? null)

  async function cargarSets(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('mant_salud_set')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('version', { ascending: false })
    if (error) throw error
    sets.value = data ?? []
  }

  async function cargarFactores(setId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('mant_salud_factor')
      .select('*')
      .eq('set_id', setId)
      .order('codigo')
    if (error) throw error
    factores.value = data ?? []
  }

  async function cargarBandas(setId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('mant_salud_banda')
      .select('*')
      .eq('set_id', setId)
      .order('orden')
    if (error) throw error
    bandas.value = data ?? []
  }

  async function crearSet(tenantId: string): Promise<SaludSetRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const siguienteVersion = 1 + Math.max(0, ...sets.value.map((s) => s.version))
      const { data, error } = await cliente
        .from('mant_salud_set')
        .insert({ tenant_id: tenantId, version: siguienteVersion })
        .select('*')
        .single()
      if (error) throw error
      sets.value = [data, ...sets.value]
      return data
    } finally {
      guardando.value = false
    }
  }

  async function crearFactor(fila: SaludFactorInsert): Promise<SaludFactorRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('mant_salud_factor').insert(fila).select('*').single()
      if (error) throw error
      factores.value = [...factores.value, data]
      return data
    } finally {
      guardando.value = false
    }
  }

  async function eliminarFactor(id: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_salud_factor').delete().eq('id', id)
      if (error) throw error
      factores.value = factores.value.filter((f) => f.id !== id)
    } finally {
      guardando.value = false
    }
  }

  async function crearBanda(fila: SaludBandaInsert): Promise<SaludBandaRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('mant_salud_banda').insert(fila).select('*').single()
      if (error) throw error
      bandas.value = [...bandas.value, data].sort((a, b) => a.orden - b.orden)
      return data
    } finally {
      guardando.value = false
    }
  }

  async function eliminarBanda(id: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_salud_banda').delete().eq('id', id)
      if (error) throw error
      bandas.value = bandas.value.filter((b) => b.id !== id)
    } finally {
      guardando.value = false
    }
  }

  /** Activa un set (borrador → vigente): retira el vigente actual a historica primero — el
   * guard solo permite esa única transición sobre una fila vigente. */
  async function activarSet(tenantId: string, setId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const vigenteActual = sets.value.find((s) => s.estado === 'vigente')
      if (vigenteActual) {
        const { error } = await cliente
          .from('mant_salud_set')
          .update({ estado: 'historica', vigente_hasta: new Date().toISOString().slice(0, 10) })
          .eq('id', vigenteActual.id)
        if (error) throw error
      }
      const { error } = await cliente
        .from('mant_salud_set')
        .update({ estado: 'vigente', vigente_desde: new Date().toISOString().slice(0, 10) })
        .eq('id', setId)
      if (error) throw error
      await cargarSets(tenantId)
    } finally {
      guardando.value = false
    }
  }

  /** Índice + desglose — SIEMPRE juntos, nunca se expone el índice solo. */
  async function cargarSalud(params: { tenantId: string; activoId: string; fecha?: string }): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('mant_salud', {
          p_tenant_id: params.tenantId,
          p_activo_id: params.activoId,
          p_fecha: params.fecha ?? undefined,
        })
        .single()
      if (error) throw error
      salud.value = data
    } finally {
      loading.value = false
    }
  }

  async function cargarExplicacion(params: {
    tenantId: string
    activoId: string
    desde: string
    hasta: string
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('mant_salud_explicacion', {
      p_tenant_id: params.tenantId,
      p_activo_id: params.activoId,
      p_desde: params.desde,
      p_hasta: params.hasta,
    })
    if (error) throw error
    explicacion.value = data ?? []
  }

  async function registrarSnapshot(params: { tenantId: string; activoId: string; fecha?: string }): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('fn_mant_registrar_salud_snapshot', {
        p_tenant_id: params.tenantId,
        p_activo_id: params.activoId,
        p_fecha: params.fecha ?? undefined,
      })
      if (error) throw error
    } finally {
      guardando.value = false
    }
  }

  async function cargarSnapshots(activoId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('mant_salud_snapshot')
      .select('*')
      .eq('activo_id', activoId)
      .order('fecha', { ascending: true })
    if (error) throw error
    snapshots.value = data ?? []
  }

  async function cargarEscenarios(tenantId: string, activoId?: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    let consulta = cliente.from('mant_escenario').select('*').eq('tenant_id', tenantId)
    if (activoId) consulta = consulta.eq('activo_id', activoId)
    const { data, error } = await consulta.order('creado_at', { ascending: false })
    if (error) throw error
    escenarios.value = data ?? []
  }

  async function crearEscenario(fila: EscenarioInsert): Promise<EscenarioRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('mant_escenario').insert(fila).select('*').single()
      if (error) throw error
      escenarios.value = [data, ...escenarios.value]
      return data
    } finally {
      guardando.value = false
    }
  }

  async function actualizarSupuestos(id: string, supuestos: Json): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_escenario')
        .update({ supuestos })
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      escenarios.value = escenarios.value.map((e) => (e.id === id ? data : e))
    } finally {
      guardando.value = false
    }
  }

  /** Devuelve el `resultado` armado — componentes + total + sensibilidad, JAMÁS una recomendación. */
  async function evaluarEscenario(id: string): Promise<EscenarioRow['resultado']> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('mant_evaluar_escenario', { p_escenario_id: id })
      if (error) throw error
      const { data, error: errRecarga } = await cliente
        .from('mant_escenario')
        .select('*')
        .eq('id', id)
        .single()
      if (errRecarga) throw errRecarga
      escenarios.value = escenarios.value.map((e) => (e.id === id ? data : e))
      return data.resultado
    } finally {
      guardando.value = false
    }
  }

  async function cargarProyeccion(tenantId: string, anio: number): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('mant_proyeccion', { p_tenant_id: tenantId, p_anio: anio })
      if (error) throw error
      proyeccion.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  function limpiar(): void {
    salud.value = null
    explicacion.value = []
    snapshots.value = []
  }

  return {
    sets,
    factores,
    bandas,
    salud,
    explicacion,
    snapshots,
    escenarios,
    proyeccion,
    loading,
    guardando,
    setVigente,
    cargarSets,
    cargarFactores,
    cargarBandas,
    crearSet,
    crearFactor,
    eliminarFactor,
    crearBanda,
    eliminarBanda,
    activarSet,
    cargarSalud,
    cargarExplicacion,
    registrarSnapshot,
    cargarSnapshots,
    cargarEscenarios,
    crearEscenario,
    actualizarSupuestos,
    evaluarEscenario,
    cargarProyeccion,
    limpiar,
  }
})
