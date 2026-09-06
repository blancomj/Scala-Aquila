/**
 * MANT-5 §4.3: contratos con terceros. El comprometido/ejecutado SIEMPRE se lee de
 * mant_contrato_ejecucion() (que a su vez lee presupuesto_ejecucion) — este store nunca calcula
 * ni cachea un total aparte. El estado de presentación (por_vencer/vencido) sale de
 * mant_contrato_estado_visible(), nunca de contrato_estado_t directo.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type ContratoRow = Database['public']['Tables']['mant_contratos']['Row']
type ContratoInsert = Database['public']['Tables']['mant_contratos']['Insert']
type ContratoUpdate = Database['public']['Tables']['mant_contratos']['Update']
type ContratoActivoRow = Database['public']['Tables']['mant_contrato_activos']['Row']
type ClausulaRow = Database['public']['Tables']['mant_contrato_clausulas']['Row']
type ClausulaInsert = Database['public']['Tables']['mant_contrato_clausulas']['Insert']
type EjecucionRow = Database['public']['Functions']['mant_contrato_ejecucion']['Returns'][number]

export const useMantenimientoContratosStore = defineStore('mantenimientoContratos', () => {
  const contratos = shallowRef<ContratoRow[]>([])
  const estadosVisibles = ref<Record<string, string>>({})
  const contratoActual = ref<ContratoRow | null>(null)
  const ejecucion = ref<EjecucionRow | null>(null)
  const activosCubiertos = shallowRef<ContratoActivoRow[]>([])
  const clausulas = shallowRef<ClausulaRow[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarContratos(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_contratos').select('*').eq('tenant_id', tenantId).order('codigo')
      if (error) throw error
      contratos.value = data ?? []
      const pares = await Promise.all(
        contratos.value.map(async (c) => {
          const { data: estado } = await cliente.rpc('mant_contrato_estado_visible', { p_contrato_id: c.id }).single<string>()
          return [c.id, estado ?? c.estado] as const
        }),
      )
      estadosVisibles.value = Object.fromEntries(pares)
    } finally {
      loading.value = false
    }
  }

  async function cargarContrato(tenantId: string, id: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const [
        { data: contrato, error: errContrato }, { data: ejecucionFila, error: errEjecucion },
        { data: activosFilas, error: errActivos }, { data: clausulasFilas, error: errClausulas },
      ] = await Promise.all([
        cliente.from('mant_contratos').select('*').eq('id', id).single(),
        cliente.rpc('mant_contrato_ejecucion', { p_contrato_id: id }).single<EjecucionRow>(),
        cliente.from('mant_contrato_activos').select('*').eq('contrato_id', id),
        cliente.from('mant_contrato_clausulas').select('*').eq('contrato_id', id).order('orden'),
      ])
      if (errContrato) throw errContrato
      if (errEjecucion) throw errEjecucion
      if (errActivos) throw errActivos
      if (errClausulas) throw errClausulas
      contratoActual.value = contrato
      ejecucion.value = ejecucionFila
      activosCubiertos.value = activosFilas ?? []
      clausulas.value = clausulasFilas ?? []
      void tenantId
    } finally {
      loading.value = false
    }
  }

  async function crearContrato(fila: ContratoInsert): Promise<ContratoRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('mant_contratos').insert(fila).select('*').single()
      if (error) throw error
      return data
    } finally {
      guardando.value = false
    }
  }

  async function actualizarContrato(id: string, patch: ContratoUpdate): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('mant_contratos').update(patch).eq('id', id).select('*').single()
      if (error) throw error
      contratoActual.value = data
      const { data: estado } = await cliente.rpc('mant_contrato_estado_visible', { p_contrato_id: id }).single<string>()
      estadosVisibles.value = { ...estadosVisibles.value, [id]: estado ?? data.estado }
    } finally {
      guardando.value = false
    }
  }

  async function agregarActivoCubierto(fila: Database['public']['Tables']['mant_contrato_activos']['Insert']): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_contrato_activos').insert(fila)
      if (error) throw error
      const { data } = await cliente.from('mant_contrato_activos').select('*').eq('contrato_id', fila.contrato_id)
      activosCubiertos.value = data ?? []
    } finally {
      guardando.value = false
    }
  }

  async function quitarActivoCubierto(id: string, contratoId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_contrato_activos').delete().eq('id', id)
      if (error) throw error
      const { data } = await cliente.from('mant_contrato_activos').select('*').eq('contrato_id', contratoId)
      activosCubiertos.value = data ?? []
    } finally {
      guardando.value = false
    }
  }

  async function agregarClausula(fila: ClausulaInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_contrato_clausulas').insert(fila)
      if (error) throw error
      const { data } = await cliente.from('mant_contrato_clausulas').select('*').eq('contrato_id', fila.contrato_id).order('orden')
      clausulas.value = data ?? []
    } finally {
      guardando.value = false
    }
  }

  function limpiarActual(): void {
    contratoActual.value = null
    ejecucion.value = null
    activosCubiertos.value = []
    clausulas.value = []
  }

  return {
    contratos, estadosVisibles, contratoActual, ejecucion, activosCubiertos, clausulas, loading, guardando,
    cargarContratos, cargarContrato, crearContrato, actualizarContrato,
    agregarActivoCubierto, quitarActivoCubierto, agregarClausula, limpiarActual,
  }
})
