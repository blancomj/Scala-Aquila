/**
 * GOB-5 §4: decisión y compromisos. La decisión formaliza una votación cerrada y aprobada
 * (GOB-3) — nunca es borrador. Su avance de ejecución NUNCA se lee de una columna: siempre se
 * consulta gobierno_decision_ejecucion() (marco §6.3).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type DecisionRow = Database['public']['Tables']['gobierno_decisiones']['Row']
type CompromisoRow = Database['public']['Tables']['gobierno_compromisos']['Row']
type CompromisoInsert = Database['public']['Tables']['gobierno_compromisos']['Insert']
type AvanceRow = Database['public']['Tables']['gobierno_compromiso_avances']['Row']
type EjecucionFila = Database['public']['Functions']['gobierno_decision_ejecucion']['Returns'][number]
type EfectoFila = Database['public']['Functions']['gobierno_decision_efectos']['Returns'][number]

export interface DecisionConDetalle extends DecisionRow {
  organo: { nombre: string | null } | null
  materia: { codigo: string; nombre: string } | null
  votacion: { pregunta: string; resultado: string | null } | null
}

export interface CompromisoConDetalle extends CompromisoRow {
  decision: { numero: number; anio: number; titulo: string } | null
  responsable_miembro: { tercero: { primer_nombre: string; primer_apellido: string } | null } | null
  responsable_tercero: { primer_nombre: string; primer_apellido: string } | null
}

export const useGobiernoDecisionesStore = defineStore('gobiernoDecisiones', () => {
  const decisiones = shallowRef<DecisionConDetalle[]>([])
  const decision = ref<DecisionConDetalle | null>(null)
  const ejecucion = ref<EjecucionFila | null>(null)
  const efectos = shallowRef<EfectoFila[]>([])
  const compromisos = shallowRef<CompromisoConDetalle[]>([])
  const avances = shallowRef<AvanceRow[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarDecisiones(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('gobierno_decisiones')
        .select('*, organo:organo_id(nombre), materia:materia_id(codigo, nombre), votacion:votacion_id(pregunta, resultado)')
        .eq('tenant_id', tenantId)
        .order('anio', { ascending: false })
        .order('numero', { ascending: false })
      if (error) throw error
      decisiones.value = (data ?? []) as DecisionConDetalle[]
    } finally {
      loading.value = false
    }
  }

  async function cargarDecision(id: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('gobierno_decisiones')
      .select('*, organo:organo_id(nombre), materia:materia_id(codigo, nombre), votacion:votacion_id(pregunta, resultado)')
      .eq('id', id)
      .single()
    if (error) throw error
    decision.value = data as DecisionConDetalle
    await Promise.all([cargarEjecucion(id), cargarEfectos(id), cargarCompromisos(id)])
  }

  async function cargarEjecucion(decisionId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .rpc('gobierno_decision_ejecucion', { p_decision_id: decisionId })
      .single()
    if (error) throw error
    ejecucion.value = data
  }

  async function cargarEfectos(decisionId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('gobierno_decision_efectos', { p_decision_id: decisionId })
    if (error) throw error
    efectos.value = data ?? []
  }

  async function cargarCompromisos(decisionId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('gobierno_compromisos')
      .select(
        '*, decision:decision_id(numero, anio, titulo), '
        + 'responsable_miembro:responsable_miembro_id(tercero:tercero_id(primer_nombre, primer_apellido)), '
        + 'responsable_tercero:responsable_tercero_id(primer_nombre, primer_apellido)',
      )
      .eq('decision_id', decisionId)
      .order('orden', { ascending: true })
    if (error) throw error
    compromisos.value = (data ?? []) as unknown as CompromisoConDetalle[]
  }

  /** Tablero por responsable (compromisos.vue): todos los compromisos del tenant, sin filtrar
   * por decisión — página GOB-5 §4.6 que la administración revisa a diario. */
  async function cargarCompromisosTenant(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('gobierno_compromisos')
        .select(
          '*, decision:decision_id(numero, anio, titulo), '
          + 'responsable_miembro:responsable_miembro_id(tercero:tercero_id(primer_nombre, primer_apellido)), '
          + 'responsable_tercero:responsable_tercero_id(primer_nombre, primer_apellido)',
        )
        .eq('tenant_id', tenantId)
        .order('fecha_limite', { ascending: true, nullsFirst: false })
      if (error) throw error
      compromisos.value = (data ?? []) as unknown as CompromisoConDetalle[]
    } finally {
      loading.value = false
    }
  }

  async function cargarAvances(compromisoId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('gobierno_compromiso_avances')
      .select('*')
      .eq('compromiso_id', compromisoId)
      .order('created_at', { ascending: false })
    if (error) throw error
    avances.value = data ?? []
  }

  async function crearDecision(params: {
    votacionId: string; titulo: string; descripcion?: string | null; fundamento?: string | null
    fechaLimite?: string | null; prioridad?: string | null
  }): Promise<DecisionRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('gobierno_crear_decision', {
          p_votacion_id: params.votacionId, p_titulo: params.titulo,
          ...(params.descripcion != null && { p_descripcion: params.descripcion }),
          ...(params.fundamento != null && { p_fundamento: params.fundamento }),
          ...(params.fechaLimite != null && { p_fecha_limite: params.fechaLimite }),
          ...(params.prioridad != null && { p_prioridad: params.prioridad }),
        })
        .single()
      if (error) throw error
      return data
    } finally {
      guardando.value = false
    }
  }

  async function revocarDecision(decisionId: string, votacionRevocatoriaId: string, titulo: string): Promise<DecisionRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('gobierno_revocar_decision', {
          p_decision_id: decisionId, p_votacion_revocatoria_id: votacionRevocatoriaId, p_titulo: titulo,
        })
        .single()
      if (error) throw error
      await cargarDecision(decisionId)
      return data
    } finally {
      guardando.value = false
    }
  }

  async function crearCompromiso(fila: CompromisoInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_compromisos').insert(fila)
      if (error) throw error
      await cargarCompromisos(fila.decision_id)
    } finally {
      guardando.value = false
    }
  }

  async function actualizarCompromiso(id: string, decisionId: string, cambios: Partial<CompromisoRow>): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_compromisos').update(cambios).eq('id', id)
      if (error) throw error
      await cargarCompromisos(decisionId)
    } finally {
      guardando.value = false
    }
  }

  async function registrarAvance(params: {
    tenantId: string; compromisoId: string; decisionId: string; fecha: string; descripcion: string
    porcentaje?: number | null; documentoId?: string | null
  }): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_compromiso_avances').insert({
        tenant_id: params.tenantId, compromiso_id: params.compromisoId, fecha: params.fecha,
        descripcion: params.descripcion, porcentaje: params.porcentaje ?? null,
        documento_id: params.documentoId ?? null,
      })
      if (error) throw error
      await Promise.all([cargarAvances(params.compromisoId), cargarCompromisos(params.decisionId)])
    } finally {
      guardando.value = false
    }
  }

  function limpiar(): void {
    decision.value = null
    ejecucion.value = null
    efectos.value = []
    compromisos.value = []
    avances.value = []
  }

  return {
    decisiones, decision, ejecucion, efectos, compromisos, avances, loading, guardando,
    cargarDecisiones, cargarDecision, cargarEjecucion, cargarEfectos, cargarCompromisos,
    cargarCompromisosTenant, cargarAvances, crearDecision, revocarDecision, crearCompromiso,
    actualizarCompromiso, registrarAvance, limpiar,
  }
})
