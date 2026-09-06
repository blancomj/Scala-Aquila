/**
 * MANT-5 §4.1/§4.4: perfil, habilitación y evaluación de proveedores/contratistas — cero tablas
 * de proveedor nuevas, esto solo extiende terceros (ya con rol proveedor/contratista vía
 * tenant_tercero_rol, gestionado por useTercerosStore).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type PerfilRow = Database['public']['Tables']['mant_proveedor_perfil']['Row']
type PerfilInsert = Database['public']['Tables']['mant_proveedor_perfil']['Insert']
type HabilitacionRow = Database['public']['Tables']['mant_proveedor_habilitacion']['Row']
type HabilitacionInsert = Database['public']['Tables']['mant_proveedor_habilitacion']['Insert']
type SemaforoRow = Database['public']['Functions']['mant_habilitaciones_semaforo']['Returns'][number]
type EvaluacionRow = Database['public']['Tables']['mant_proveedor_evaluacion']['Row']
type EvaluacionInsert = Database['public']['Tables']['mant_proveedor_evaluacion']['Insert']
type ReglaRow = Database['public']['Tables']['mant_habilitacion_requerida']['Row']
type ReglaInsert = Database['public']['Tables']['mant_habilitacion_requerida']['Insert']

export const useMantenimientoProveedoresStore = defineStore('mantenimientoProveedores', () => {
  const perfil = ref<PerfilRow | null>(null)
  const semaforo = shallowRef<SemaforoRow[]>([])
  const habilitaciones = shallowRef<HabilitacionRow[]>([])
  const evaluaciones = shallowRef<EvaluacionRow[]>([])
  const reglas = shallowRef<ReglaRow[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarFicha(tenantId: string, terceroId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const [
        { data: perfilFila }, { data: semaforoFilas, error: errSemaforo },
        { data: habilitacionesFilas, error: errHab }, { data: evaluacionesFilas, error: errEval },
      ] = await Promise.all([
        cliente.from('mant_proveedor_perfil').select('*').eq('tenant_id', tenantId).eq('tercero_id', terceroId).maybeSingle(),
        cliente.rpc('mant_habilitaciones_semaforo', { p_tercero_id: terceroId }),
        cliente.from('mant_proveedor_habilitacion').select('*').eq('tercero_id', terceroId).order('created_at', { ascending: false }),
        cliente.from('mant_proveedor_evaluacion').select('*').eq('tercero_id', terceroId).order('created_at', { ascending: false }),
      ])
      if (errSemaforo) throw errSemaforo
      if (errHab) throw errHab
      if (errEval) throw errEval
      perfil.value = perfilFila
      semaforo.value = semaforoFilas ?? []
      habilitaciones.value = habilitacionesFilas ?? []
      evaluaciones.value = evaluacionesFilas ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarReglas(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('mant_habilitacion_requerida').select('*').eq('tenant_id', tenantId).order('created_at')
    if (error) throw error
    reglas.value = data ?? []
  }

  async function guardarPerfil(fila: PerfilInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_proveedor_perfil')
        .upsert(fila, { onConflict: 'tenant_id,tercero_id' })
        .select('*').single()
      if (error) throw error
      perfil.value = data
    } finally {
      guardando.value = false
    }
  }

  async function agregarHabilitacion(fila: HabilitacionInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_proveedor_habilitacion').insert(fila)
      if (error) throw error
      const [{ data: habilitacionesFilas }, { data: semaforoFilas }] = await Promise.all([
        cliente.from('mant_proveedor_habilitacion').select('*').eq('tercero_id', fila.tercero_id).order('created_at', { ascending: false }),
        cliente.rpc('mant_habilitaciones_semaforo', { p_tercero_id: fila.tercero_id }),
      ])
      habilitaciones.value = habilitacionesFilas ?? []
      semaforo.value = semaforoFilas ?? []
    } finally {
      guardando.value = false
    }
  }

  async function agregarEvaluacion(fila: EvaluacionInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_proveedor_evaluacion').insert(fila)
      if (error) throw error
      const { data } = await cliente
        .from('mant_proveedor_evaluacion').select('*').eq('tercero_id', fila.tercero_id).order('created_at', { ascending: false })
      evaluaciones.value = data ?? []
    } finally {
      guardando.value = false
    }
  }

  async function agregarRegla(fila: ReglaInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_habilitacion_requerida').insert(fila)
      if (error) throw error
      await cargarReglas(fila.tenant_id)
    } finally {
      guardando.value = false
    }
  }

  async function eliminarRegla(id: string, tenantId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_habilitacion_requerida').delete().eq('id', id)
      if (error) throw error
      await cargarReglas(tenantId)
    } finally {
      guardando.value = false
    }
  }

  function limpiarFicha(): void {
    perfil.value = null
    semaforo.value = []
    habilitaciones.value = []
    evaluaciones.value = []
  }

  return {
    perfil, semaforo, habilitaciones, evaluaciones, reglas, loading, guardando,
    cargarFicha, cargarReglas, guardarPerfil, agregarHabilitacion, agregarEvaluacion,
    agregarRegla, eliminarRegla, limpiarFicha,
  }
})
