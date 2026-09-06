/**
 * MANT-1 · Atributos técnicos dinámicos y criticidad (§3.7 UI).
 *
 * Lista y ficha mínima de activos (MANT-0 no construyó esta UI — ver
 * "Qué NO se implementó" en MANT_01_INFORME.md) más lo propio de este
 * corte: valores de atributos técnicos y evaluación/puntaje de criticidad.
 * No es un CRUD completo de todos los campos de MANT-0 (bloque contable,
 * ciclo de vida) — eso sigue fuera de alcance.
 */
import { defineStore } from 'pinia'
import type { Database, Json } from '@aquila/shared'

type ActivoRow = Database['public']['Tables']['activos']['Row']
type DefinicionRow = Database['public']['Tables']['mant_atributo_definicion']['Row']
type EvaluacionRow = Database['public']['Tables']['mant_activo_criticidad']['Row']
type CriterioRow = Database['public']['Tables']['mant_criticidad_criterio']['Row']
type Criticidad = Database['public']['Functions']['mant_criticidad']['Returns'][number]

export const useActivosStore = defineStore('activos', () => {
  const activos = shallowRef<ActivoRow[]>([])
  const activo = shallowRef<ActivoRow | null>(null)
  const definiciones = shallowRef<DefinicionRow[]>([])
  const criteriosVigentes = shallowRef<CriterioRow[]>([])
  const evaluaciones = shallowRef<EvaluacionRow[]>([])
  const criticidad = shallowRef<Criticidad | null>(null)
  const errorCriticidad = ref<string | null>(null)
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarActivos(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('activos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('codigo')
      if (error) throw error
      activos.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  /** Carga la ficha, el esquema de atributos de su tipo, y el estado de criticidad —
   * en paralelo, ya que son independientes entre sí. */
  async function cargarFicha(tenantId: string, activoId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data: fila, error: errActivo } = await cliente
        .from('activos').select('*').eq('id', activoId).single()
      if (errActivo) throw errActivo
      activo.value = fila

      const [{ data: defs, error: errDefs }, { data: evals, error: errEvals }] = await Promise.all([
        cliente
          .from('mant_atributo_definicion')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('tipo_activo_id', fila.tipo_id)
          .order('orden'),
        cliente
          .from('mant_activo_criticidad')
          .select('*')
          .eq('activo_id', activoId),
      ])
      if (errDefs) throw errDefs
      if (errEvals) throw errEvals
      definiciones.value = defs ?? []
      evaluaciones.value = evals ?? []

      const { data: setVigente } = await cliente
        .from('mant_criticidad_set').select('id').eq('tenant_id', tenantId).eq('estado', 'vigente').maybeSingle()
      if (setVigente) {
        const { data: criterios, error: errCriterios } = await cliente
          .from('mant_criticidad_criterio').select('*').eq('set_id', setVigente.id).order('codigo')
        if (errCriterios) throw errCriterios
        criteriosVigentes.value = criterios ?? []
      } else {
        criteriosVigentes.value = []
      }

      await cargarCriticidad(activoId)
    } finally {
      loading.value = false
    }
  }

  /** Independiente de cargarFicha: se vuelve a llamar sola tras evaluar un criterio, sin
   * recargar toda la ficha. Guarda el error explícito (CRITICIDAD_SIN_SET_VIGENTE /
   * CRITICIDAD_EVALUACION_INCOMPLETA) en vez de tragárselo — el panel lo muestra tal cual. */
  async function cargarCriticidad(activoId: string): Promise<void> {
    errorCriticidad.value = null
    criticidad.value = null
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('mant_criticidad', { p_activo_id: activoId }).maybeSingle()
    if (error) {
      errorCriticidad.value = error.message
      return
    }
    criticidad.value = data
  }

  async function actualizarAtributos(
    activoId: string, atributos: Record<string, string | number | boolean>,
  ): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('activos').update({ atributos: atributos as Json }).eq('id', activoId).select('*').single()
      if (error) throw error
      activo.value = data
    } finally {
      guardando.value = false
    }
  }

  async function evaluarCriterio(
    tenantId: string, activoId: string, criterioId: string, valor: string,
  ): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('mant_activo_criticidad')
        .upsert(
          { tenant_id: tenantId, activo_id: activoId, criterio_id: criterioId, valor },
          { onConflict: 'activo_id,criterio_id' },
        )
      if (error) throw error
      const { data: evals, error: errEvals } = await cliente
        .from('mant_activo_criticidad').select('*').eq('activo_id', activoId)
      if (errEvals) throw errEvals
      evaluaciones.value = evals ?? []
      await cargarCriticidad(activoId)
    } finally {
      guardando.value = false
    }
  }

  return {
    activos, activo, definiciones, criteriosVigentes, evaluaciones, criticidad, errorCriticidad,
    loading, guardando,
    cargarActivos, cargarFicha, cargarCriticidad, actualizarAtributos, evaluarCriterio,
  }
})
