/**
 * CO-5 · Estados financieros y notas — motor de presentación (contable_estado_financiero) y
 * generador de notas (fn_generar_notas). Este store solo lee/orquesta; toda la estructura de
 * los estados vive en contable_estado_plantilla/_linea (CO-5 §4.1), nunca aquí.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

export type CodigoEstado =
  | 'estado_situacion_financiera'
  | 'estado_resultados'
  | 'estado_cambios_patrimonio'
  | 'estado_flujos_efectivo'

type FilaEstado = Database['public']['Functions']['contable_estado_financiero']['Returns'][number]
type FilaNota = Database['public']['Tables']['contable_nota']['Row']

export const useEstadosFinancierosStore = defineStore('estadosFinancieros', () => {
  const filasPorCodigo = shallowRef<Partial<Record<CodigoEstado, FilaEstado[]>>>({})
  const notas = shallowRef<FilaNota[]>([])
  const loading = ref(false)
  const loadingNotas = ref(false)

  async function cargarEstado(
    tenantId: string,
    codigo: CodigoEstado,
    fechaCorte: string,
    comparativo: boolean,
  ): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('contable_estado_financiero', {
        p_tenant_id: tenantId, p_codigo_estado: codigo, p_fecha_corte: fechaCorte, p_comparativo: comparativo,
      })
      if (error) throw error
      filasPorCodigo.value = { ...filasPorCodigo.value, [codigo]: data ?? [] }
    } finally {
      loading.value = false
    }
  }

  async function cargarNotas(tenantId: string, ejercicio: number): Promise<void> {
    loadingNotas.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('contable_nota')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('ejercicio', ejercicio)
        .order('numero')
      if (error) throw error
      notas.value = data ?? []
    } finally {
      loadingNotas.value = false
    }
  }

  /** Genera/regenera todas las notas con cifras reales del ejercicio — nunca sobrescribe una
   * nota ya editada a mano (fn_generar_notas, ON CONFLICT ... WHERE estado='generada'). */
  async function generarNotas(tenantId: string, ejercicio: number): Promise<void> {
    loadingNotas.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('fn_generar_notas', { p_tenant_id: tenantId, p_ejercicio: ejercicio })
      if (error) throw error
      await cargarNotas(tenantId, ejercicio)
    } finally {
      loadingNotas.value = false
    }
  }

  /** Editar una nota la marca `estado='editada'` por trigger (guard_nota_edicion) — nunca se
   * fija a mano desde el cliente. */
  async function editarNota(notaId: string, cuerpo: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('contable_nota').update({ cuerpo }).eq('id', notaId)
    if (error) throw error
    const idx = notas.value.findIndex((n) => n.id === notaId)
    if (idx >= 0) {
      const actualizadas = [...notas.value]
      actualizadas[idx] = { ...actualizadas[idx]!, cuerpo, estado: 'editada' }
      notas.value = actualizadas
    }
  }

  /** Se llama antes de exportar (§4.5) — ninguna nota obligatoria puede estar vacía. Devuelve
   * el mensaje de error si falta alguna, o null si el juego está completo. */
  async function validarNotasCompletas(tenantId: string, ejercicio: number): Promise<string | null> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.rpc('contable_validar_notas_completas', { p_tenant_id: tenantId, p_ejercicio: ejercicio })
    return error?.message ?? null
  }

  return {
    filasPorCodigo, notas, loading, loadingNotas,
    cargarEstado, cargarNotas, generarNotas, editarNota, validarNotasCompletas,
  }
})
