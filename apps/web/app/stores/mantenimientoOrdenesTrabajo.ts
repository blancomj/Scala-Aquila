/**
 * MANT-4 · Órdenes de trabajo. Cerrar SIEMPRE pasa por fn_mant_cerrar_ot (RPC) — nunca un UPDATE
 * directo de estado a 'cerrada', el guard de la base lo rechaza (ver informe del corte).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type OtRow = Database['public']['Tables']['mant_ordenes_trabajo']['Row']
type OtInsert = Database['public']['Tables']['mant_ordenes_trabajo']['Insert']
type OtUpdate = Database['public']['Tables']['mant_ordenes_trabajo']['Update']
type TareaRow = Database['public']['Tables']['mant_ot_tareas']['Row']
type TareaInsert = Database['public']['Tables']['mant_ot_tareas']['Insert']
type TareaUpdate = Database['public']['Tables']['mant_ot_tareas']['Update']
type MedicionRow = Database['public']['Tables']['mant_ot_mediciones']['Row']
type MedicionInsert = Database['public']['Tables']['mant_ot_mediciones']['Insert']
type EvidenciaRow = Database['public']['Tables']['mant_ot_evidencias']['Row']
type EvidenciaInsert = Database['public']['Tables']['mant_ot_evidencias']['Insert']
type HistorialRow = Database['public']['Tables']['mant_ot_estado_historial']['Row']

export const useMantenimientoOrdenesTrabajoStore = defineStore('mantenimientoOrdenesTrabajo', () => {
  const ordenes = shallowRef<OtRow[]>([])
  const otActual = ref<OtRow | null>(null)
  const tareas = shallowRef<TareaRow[]>([])
  const mediciones = shallowRef<MedicionRow[]>([])
  const evidencias = shallowRef<EvidenciaRow[]>([])
  const historial = shallowRef<HistorialRow[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarOrdenes(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_ordenes_trabajo').select('*').eq('tenant_id', tenantId)
        .order('anio', { ascending: false }).order('numero', { ascending: false })
      if (error) throw error
      ordenes.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarOt(tenantId: string, id: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const [
        { data: ot, error: errOt }, { data: t, error: errT }, { data: m, error: errM },
        { data: e, error: errE }, { data: h, error: errH },
      ] = await Promise.all([
        cliente.from('mant_ordenes_trabajo').select('*').eq('id', id).single(),
        cliente.from('mant_ot_tareas').select('*').eq('ot_id', id).order('orden'),
        cliente.from('mant_ot_mediciones').select('*').eq('ot_id', id).order('created_at'),
        cliente.from('mant_ot_evidencias').select('*').eq('ot_id', id).order('created_at'),
        cliente.from('mant_ot_estado_historial').select('*').eq('ot_id', id).order('created_at'),
      ])
      if (errOt) throw errOt
      if (errT) throw errT
      if (errM) throw errM
      if (errE) throw errE
      if (errH) throw errH
      otActual.value = ot
      tareas.value = t ?? []
      mediciones.value = m ?? []
      evidencias.value = e ?? []
      historial.value = h ?? []
      void tenantId
    } finally {
      loading.value = false
    }
  }

  async function crearOt(fila: OtInsert): Promise<OtRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('mant_ordenes_trabajo').insert(fila).select('*').single()
      if (error) throw error
      return data
    } finally {
      guardando.value = false
    }
  }

  async function actualizarOt(id: string, patch: OtUpdate): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('mant_ordenes_trabajo').update(patch).eq('id', id).select('*').single()
      if (error) throw error
      otActual.value = data
      const { data: h } = await cliente.from('mant_ot_estado_historial').select('*').eq('ot_id', id).order('created_at')
      historial.value = h ?? []
    } finally {
      guardando.value = false
    }
  }

  async function cerrarOt(otId: string, params?: { fechaCierre?: string; evidenciaReferencia?: string; aprobadaPor?: string }): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('fn_mant_cerrar_ot', {
        p_ot_id: otId,
        p_fecha_cierre: params?.fechaCierre,
        p_evidencia_referencia: params?.evidenciaReferencia,
        p_aprobada_por: params?.aprobadaPor,
      })
      if (error) throw error
      const tenantId = otActual.value?.tenant_id
      if (tenantId) await cargarOt(tenantId, otId)
    } finally {
      guardando.value = false
    }
  }

  async function agregarTarea(fila: TareaInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_ot_tareas').insert(fila)
      if (error) throw error
      const { data } = await cliente.from('mant_ot_tareas').select('*').eq('ot_id', fila.ot_id).order('orden')
      tareas.value = data ?? []
    } finally {
      guardando.value = false
    }
  }

  async function actualizarTarea(id: string, otId: string, patch: TareaUpdate): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_ot_tareas').update(patch).eq('id', id)
      if (error) throw error
      const { data } = await cliente.from('mant_ot_tareas').select('*').eq('ot_id', otId).order('orden')
      tareas.value = data ?? []
    } finally {
      guardando.value = false
    }
  }

  async function agregarMedicion(fila: MedicionInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_ot_mediciones').insert(fila)
      if (error) throw error
      const { data } = await cliente.from('mant_ot_mediciones').select('*').eq('ot_id', fila.ot_id).order('created_at')
      mediciones.value = data ?? []
    } finally {
      guardando.value = false
    }
  }

  async function agregarEvidencia(fila: EvidenciaInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_ot_evidencias').insert(fila)
      if (error) throw error
      const { data } = await cliente.from('mant_ot_evidencias').select('*').eq('ot_id', fila.ot_id).order('created_at')
      evidencias.value = data ?? []
    } finally {
      guardando.value = false
    }
  }

  function limpiarActual(): void {
    otActual.value = null
    tareas.value = []
    mediciones.value = []
    evidencias.value = []
    historial.value = []
  }

  return {
    ordenes, otActual, tareas, mediciones, evidencias, historial, loading, guardando,
    cargarOrdenes, cargarOt, crearOt, actualizarOt, cerrarOt,
    agregarTarea, actualizarTarea, agregarMedicion, agregarEvidencia, limpiarActual,
  }
})
