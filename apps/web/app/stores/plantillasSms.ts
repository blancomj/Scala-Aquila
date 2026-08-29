/**
 * Configuración de plantillas SMS — listado directo por RLS (is_member),
 * una fila por evento del REGISTRO (SMS_FIELD_REGISTRY en @aquila/shared),
 * exista o no fila en plantillas_sms — mismo criterio que el resto de
 * catálogos "declarados en código, sembrados en BD solo si el admin ya
 * redactó" del proyecto.
 *
 * Guardar/activar pasan por Edge Functions (guardar-plantilla-sms,
 * toggle-plantilla-sms): ambas validan el registro de campos y escriben
 * auditoría vía función SECURITY DEFINER — no hay política INSERT/UPDATE
 * "directa y sin auditar" posible desde aquí, ni falta: RLS ya rechazaría
 * el intento (ver migración de plantillas_sms).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { SMS_ACTIVE_EVENT_TYPES, SMS_FIELD_REGISTRY } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type PlantillaSmsRowDb = Database['public']['Tables']['plantillas_sms']['Row']

export interface PlantillaSmsItem {
  /** null = evento sin fila todavía — sin id no hay historial que pedir. */
  id: string | null
  eventType: string
  cuerpo: string | null
  /** null = evento sin fila todavía (nunca redactado); boolean = valor guardado. */
  activo: boolean | null
  isActive: boolean
  updatedAt: string | null
  /** null = sin guardar todavía. PRQ-CAR-021. */
  version: number | null
}

/** Una foto histórica del texto (PRQ-CAR-021) — nunca se edita ni se borra. */
export interface VersionPlantillaSmsItem {
  version: number
  cuerpo: string
  createdAt: string
}

export interface ResultadoPruebaSms {
  success: boolean
  segmentsUsed: number
  errorMessage?: string
}

export const usePlantillasSmsStore = defineStore('plantillasSms', () => {
  const plantillas = shallowRef<PlantillaSmsItem[]>([])
  const historial = shallowRef<VersionPlantillaSmsItem[]>([])
  const loading = ref(false)

  async function cargarPlantillas(tenantId: string): Promise<PlantillaSmsItem[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorSelect } = await cliente
        .from('plantillas_sms')
        .select('*')
        .eq('tenant_id', tenantId)
      if (errorSelect) throw errorSelect

      const porEvento = new Map<string, PlantillaSmsRowDb>((data ?? []).map((f) => [f.event_type, f]))
      plantillas.value = Object.keys(SMS_FIELD_REGISTRY).map((eventType) => {
        const fila = porEvento.get(eventType)
        return {
          id: fila?.id ?? null,
          eventType,
          cuerpo: fila?.cuerpo ?? null,
          activo: fila ? fila.activo : null,
          isActive: SMS_ACTIVE_EVENT_TYPES.includes(eventType),
          updatedAt: fila?.updated_at ?? null,
          version: fila?.version ?? null,
        }
      })
      return plantillas.value
    } finally {
      loading.value = false
    }
  }

  /** PRQ-CAR-021 — historial append-only, más reciente primero. RLS (is_member) directo, sin Edge Function. */
  async function cargarHistorial(plantillaId: string): Promise<VersionPlantillaSmsItem[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorSelect } = await cliente
      .from('plantillas_sms_versiones')
      .select('version, cuerpo, created_at')
      .eq('plantilla_id', plantillaId)
      .order('version', { ascending: false })
    if (errorSelect) throw errorSelect
    historial.value = (data ?? []).map((f) => ({ version: f.version, cuerpo: f.cuerpo, createdAt: f.created_at }))
    return historial.value
  }

  async function guardar(tenantId: string, eventType: string, cuerpo: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorFuncion } = await cliente.functions.invoke('guardar-plantilla-sms', {
      body: { tenant_id: tenantId, event_type: eventType, cuerpo },
    })
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    await cargarPlantillas(tenantId)
  }

  /** Guarda al instante, sin esperar al botón "Guardar plantilla" — son dos
   * acciones distintas (apagar un evento urgente no puede depender de que
   * el texto sea válido). */
  async function toggle(tenantId: string, eventType: string, activo: boolean): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorFuncion } = await cliente.functions.invoke('toggle-plantilla-sms', {
      body: { tenant_id: tenantId, event_type: eventType, activo },
    })
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    await cargarPlantillas(tenantId)
  }

  /** No guarda nada — envía el texto tal cual está en el editor. */
  async function probar(
    tenantId: string,
    eventType: string,
    cuerpo: string,
    phone: string,
  ): Promise<ResultadoPruebaSms> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<ResultadoPruebaSms>(
      'probar-plantilla-sms',
      { body: { tenant_id: tenantId, event_type: eventType, cuerpo, phone } },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('probar-plantilla-sms no devolvió datos.')
    return data
  }

  function limpiar(): void {
    plantillas.value = []
    historial.value = []
  }

  return { plantillas, historial, loading, cargarPlantillas, cargarHistorial, guardar, toggle, probar, limpiar }
})
