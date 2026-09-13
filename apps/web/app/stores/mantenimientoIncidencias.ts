/**
 * MANT-4 · Incidencias — AD-26: el reportante es siempre texto libre (reportante_ref/
 * reportante_contacto), nunca un principal de autenticación. El INSERT lo hace siempre un
 * usuario con sesión (auxiliar/administrador) — este store no ofrece ninguna ruta anónima.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type IncidenciaRow = Database['public']['Tables']['mant_incidencias']['Row']
type IncidenciaInsert = Database['public']['Tables']['mant_incidencias']['Insert']
type IncidenciaUpdate = Database['public']['Tables']['mant_incidencias']['Update']
type ActuacionRow = Database['public']['Tables']['mant_incidencia_actuaciones']['Row']

export const useMantenimientoIncidenciasStore = defineStore('mantenimientoIncidencias', () => {
  const incidencias = shallowRef<IncidenciaRow[]>([])
  const incidenciaActual = ref<IncidenciaRow | null>(null)
  const actuaciones = shallowRef<ActuacionRow[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  /** `activoId` — Fase 5 de mantenimiento de activos (D-92): la Ficha 360° necesita las
   * incidencias de ESTE activo, no las del tenant completo. */
  async function cargarIncidencias(tenantId: string, activoId?: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      let consulta = cliente.from('mant_incidencias').select('*').eq('tenant_id', tenantId)
      if (activoId) consulta = consulta.eq('activo_id', activoId)
      const { data, error } = await consulta
        .order('anio', { ascending: false }).order('numero', { ascending: false })
      if (error) throw error
      incidencias.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarIncidencia(tenantId: string, id: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const [{ data: inc, error: errInc }, { data: act, error: errAct }] = await Promise.all([
        cliente.from('mant_incidencias').select('*').eq('id', id).single(),
        cliente.from('mant_incidencia_actuaciones').select('*').eq('incidencia_id', id).order('created_at'),
      ])
      if (errInc) throw errInc
      if (errAct) throw errAct
      incidenciaActual.value = inc
      actuaciones.value = act ?? []
      void tenantId
    } finally {
      loading.value = false
    }
  }

  async function crearIncidencia(fila: IncidenciaInsert): Promise<IncidenciaRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('mant_incidencias').insert(fila).select('*').single()
      if (error) throw error
      return data
    } finally {
      guardando.value = false
    }
  }

  async function actualizarIncidencia(id: string, patch: IncidenciaUpdate): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('mant_incidencias').update(patch).eq('id', id).select('*').single()
      if (error) throw error
      incidenciaActual.value = data
      const { data: act } = await cliente
        .from('mant_incidencia_actuaciones').select('*').eq('incidencia_id', id).order('created_at')
      actuaciones.value = act ?? []
    } finally {
      guardando.value = false
    }
  }

  async function agregarNota(tenantId: string, incidenciaId: string, descripcion: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_incidencia_actuaciones').insert({
        tenant_id: tenantId, incidencia_id: incidenciaId, tipo_actuacion: 'nota', descripcion,
      })
      if (error) throw error
      const { data } = await cliente
        .from('mant_incidencia_actuaciones').select('*').eq('incidencia_id', incidenciaId).order('created_at')
      actuaciones.value = data ?? []
    } finally {
      guardando.value = false
    }
  }

  async function convertirAOt(params: {
    incidenciaId: string
    tipoMantenimientoId: number
    titulo?: string
    asignadoTerceroId?: string
    asignadoUsuarioId?: string
  }): Promise<string> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('fn_mant_convertir_incidencia_a_ot', {
        p_incidencia_id: params.incidenciaId,
        p_tipo_mantenimiento_id: params.tipoMantenimientoId,
        p_titulo: params.titulo,
        p_asignado_tercero_id: params.asignadoTerceroId,
        p_asignado_usuario_id: params.asignadoUsuarioId,
      }).single<{ id: string }>()
      if (error) throw error
      return data.id
    } finally {
      guardando.value = false
    }
  }

  function limpiarActual(): void {
    incidenciaActual.value = null
    actuaciones.value = []
  }

  return {
    incidencias, incidenciaActual, actuaciones, loading, guardando,
    cargarIncidencias, cargarIncidencia, crearIncidencia, actualizarIncidencia,
    agregarNota, convertirAOt, limpiarActual,
  }
})
