/**
 * GOB-3 §4: motor de quórum y votación. Consume las materias legales (catálogo global e
 * inmutable), la configuración acotada de mayoría por tenant, y orquesta abrir/votar/cerrar sobre
 * una reunión ya instalada (GOB-2).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type MateriaRow = Database['public']['Tables']['gobierno_materia_decision']['Row']
type ReglaRow = Database['public']['Tables']['gobierno_regla_mayoria']['Row']
type ReglaInsert = Database['public']['Tables']['gobierno_regla_mayoria']['Insert']
type VotacionRow = Database['public']['Tables']['gobierno_votaciones']['Row']
type VotacionInsert = Database['public']['Tables']['gobierno_votaciones']['Insert']
type VotoRow = Database['public']['Tables']['gobierno_votos']['Row']
type QuorumFila = Database['public']['Functions']['gobierno_quorum']['Returns'][number]

export interface ReglaConDetalle extends ReglaRow {
  materia: { codigo: string; nombre: string } | null
}
export interface VotacionConDetalle extends VotacionRow {
  materia: { codigo: string; nombre: string; mayoria_tipo: string; base_calculo: string } | null
}
export interface VotoConDetalle extends VotoRow {
  asistencia: { inmueble: { codigo: string } | null; asistente: { nombre_completo: string } | null } | null
}

export const useGobiernoVotacionesStore = defineStore('gobiernoVotaciones', () => {
  const materias = shallowRef<MateriaRow[]>([])
  const reglas = shallowRef<ReglaConDetalle[]>([])
  const votaciones = shallowRef<VotacionConDetalle[]>([])
  const votos = shallowRef<VotoConDetalle[]>([])
  const quorum = ref<QuorumFila | null>(null)
  const loading = ref(false)
  const guardando = ref(false)

  // Catálogo legal global (gobierno_materia_decision no tiene tenant_id — inmutable, D-24).
  async function cargarMaterias(): Promise<void> {
    if (materias.value.length > 0) return
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.from('gobierno_materia_decision').select('*').order('numeral_articulo', { ascending: true })
    if (error) throw error
    materias.value = data ?? []
  }

  async function cargarReglas(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('gobierno_regla_mayoria')
      .select('*, materia:materia_id(codigo, nombre)')
      .eq('tenant_id', tenantId).is('vigente_hasta', null)
    if (error) throw error
    reglas.value = (data ?? []) as ReglaConDetalle[]
  }

  async function cargarVotaciones(reunionId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('gobierno_votaciones')
        .select('*, materia:materia_id(codigo, nombre, mayoria_tipo, base_calculo)')
        .eq('reunion_id', reunionId)
        .order('abierta_at', { ascending: false })
      if (error) throw error
      votaciones.value = (data ?? []) as VotacionConDetalle[]
    } finally {
      loading.value = false
    }
  }

  async function cargarVotos(votacionId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('gobierno_votos')
      .select('*, asistencia:asistencia_id(inmueble:inmueble_id(codigo), asistente:asistente_ref(nombre_completo))')
      .eq('votacion_id', votacionId)
      .order('emitido_at', { ascending: true })
    if (error) throw error
    votos.value = (data ?? []) as VotoConDetalle[]
  }

  async function cargarQuorum(reunionId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .rpc('gobierno_quorum', { p_reunion_id: reunionId, p_momento: new Date().toISOString() })
      .single()
    if (error) throw error
    quorum.value = data
  }

  async function crearRegla(fila: ReglaInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_regla_mayoria').insert(fila)
      if (error) throw error
      await cargarReglas(fila.tenant_id)
    } finally {
      guardando.value = false
    }
  }

  async function abrirVotacion(fila: VotacionInsert): Promise<VotacionRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('gobierno_votaciones').insert(fila).select('*').single()
      if (error) throw error
      await Promise.all([cargarVotaciones(fila.reunion_id), cargarQuorum(fila.reunion_id)])
      return data
    } finally {
      guardando.value = false
    }
  }

  async function cerrarVotacion(id: string, reunionId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_votaciones').update({ estado: 'cerrada' }).eq('id', id)
      if (error) throw error
      await cargarVotaciones(reunionId)
    } finally {
      guardando.value = false
    }
  }

  async function anularVotacion(id: string, reunionId: string, motivo: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('gobierno_votaciones').update({ estado: 'anulada', anulada_motivo: motivo }).eq('id', id)
      if (error) throw error
      await cargarVotaciones(reunionId)
    } finally {
      guardando.value = false
    }
  }

  async function emitirVoto(
    votacionId: string, tenantId: string, reunionId: string, asistenciaId: string, sentido: 'favor' | 'contra' | 'abstencion',
  ): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      // coeficiente lo sobrescribe siempre el guard desde gobierno_asistencia — el valor enviado
      // aquí es un relleno sin efecto real (constraint NOT NULL de la columna).
      const { error } = await cliente
        .from('gobierno_votos')
        .insert({ tenant_id: tenantId, votacion_id: votacionId, asistencia_id: asistenciaId, sentido, coeficiente: 0 })
      if (error) throw error
      await Promise.all([cargarVotos(votacionId), cargarQuorum(reunionId)])
    } finally {
      guardando.value = false
    }
  }

  function limpiar(): void {
    reglas.value = []
    votaciones.value = []
    votos.value = []
    quorum.value = null
  }

  return {
    materias, reglas, votaciones, votos, quorum, loading, guardando,
    cargarMaterias, cargarReglas, cargarVotaciones, cargarVotos, cargarQuorum,
    crearRegla, abrirVotacion, cerrarVotacion, anularVotacion, emitirVoto, limpiar,
  }
})
