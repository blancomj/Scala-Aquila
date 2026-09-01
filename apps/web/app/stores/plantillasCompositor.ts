/**
 * Plantillas del compositor de correo — CRUD + envío.
 *
 * Patrón: RLS directo para SELECT (is_member), Edge Functions para
 * INSERT/UPDATE/DELETE/envío (SECURITY DEFINER, audit_log).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type PlantillaRowDb = Database['public']['Tables']['plantillas_compositor']['Row']

export interface PlantillaCompositorItem {
  id: string
  nombre: string
  asunto: string
  cuerpo: string
  activa: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string | null
}

export interface ResultadoEnvioCompositor {
  ok: boolean
  campos_resueltos?: string[]
  campos_no_resueltos?: string[]
  error?: string
}

function rowToItem(row: PlantillaRowDb): PlantillaCompositorItem {
  return {
    id: row.id,
    nombre: row.nombre,
    asunto: row.asunto,
    cuerpo: row.cuerpo,
    activa: row.activa,
    createdBy: row.creado_por,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const usePlantillasCompositorStore = defineStore('plantillasCompositor', () => {
  const plantillas = shallowRef<PlantillaCompositorItem[]>([])
  const loading = ref(false)

  async function cargarPlantillas(tenantId: string): Promise<PlantillaCompositorItem[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorSelect } = await cliente
        .from('plantillas_compositor')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('nombre')
      if (errorSelect) throw errorSelect
      plantillas.value = (data ?? []).map(rowToItem)
      return plantillas.value
    } finally {
      loading.value = false
    }
  }

  async function guardar(
    tenantId: string,
    nombre: string,
    asunto: string,
    cuerpo: string,
  ): Promise<PlantillaCompositorItem> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFn } = await cliente
      .from('plantillas_compositor')
      .upsert(
        { tenant_id: tenantId, nombre, asunto, cuerpo },
        { onConflict: 'tenant_id,nombre' },
      )
      .select()
      .single()
    if (errorFn) throw errorFn
    await cargarPlantillas(tenantId)
    return rowToItem(data)
  }

  async function toggleActiva(
    tenantId: string,
    plantillaId: string,
    activa: boolean,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorFn } = await cliente
      .from('plantillas_compositor')
      .update({ activa })
      .eq('id', plantillaId)
      .eq('tenant_id', tenantId)
    if (errorFn) throw errorFn
    await cargarPlantillas(tenantId)
  }

  async function eliminar(
    tenantId: string,
    plantillaId: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorFn } = await cliente
      .from('plantillas_compositor')
      .delete()
      .eq('id', plantillaId)
      .eq('tenant_id', tenantId)
    if (errorFn) throw errorFn
    await cargarPlantillas(tenantId)
  }

  async function enviarCorreo(
    tenantId: string,
    params: {
      destinatario_email: string
      destinatario_nombre: string
      inmueble_id?: string
      plantilla_id?: string
      asunto?: string
      cuerpo?: string
    },
  ): Promise<ResultadoEnvioCompositor> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFn } = await cliente.functions.invoke<ResultadoEnvioCompositor>(
      'enviar-correo-compositor',
      { body: { tenant_id: tenantId, ...params } },
    )
    if (errorFn) throw await extraerErrorFuncion(errorFn)
    if (!data) throw new Error('enviar-correo-compositor no devolvió datos.')
    return data
  }

  function limpiar(): void {
    plantillas.value = []
  }

  return {
    plantillas,
    loading,
    cargarPlantillas,
    guardar,
    toggleActiva,
    eliminar,
    enviarCorreo,
    limpiar,
  }
})
