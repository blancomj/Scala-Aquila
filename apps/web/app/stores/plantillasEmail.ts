/**
 * Configuración de plantillas de correo (Brevo) — listado directo por RLS
 * (is_member), una fila por evento de EMAIL_ACTIVE_EVENT_TYPES en
 * @aquila/shared, exista o no fila en email_templates — mismo criterio que
 * plantillasSms.ts.
 *
 * Guardar/sincronizar pasan por Edge Functions (guardar-plantilla-email,
 * sincronizar-plantilla-email): ambas hacen la llamada real a Brevo, algo
 * que no puede vivir en SQL. Devuelven {saved, synced, error?} — un fallo
 * de sincronización no es una excepción, es un resultado que la pantalla
 * debe mostrar distinto de un guardado sin problemas (spec §7/§11).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { EMAIL_ACTIVE_EVENT_TYPES } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type PlantillaEmailRowDb = Database['public']['Tables']['email_templates']['Row']

export interface PlantillaEmailItem {
  eventType: string
  subject: string | null
  htmlContent: string | null
  brevoTemplateId: number | null
  /** null = evento sin fila todavía (nunca guardado); boolean = valor guardado. */
  isSynced: boolean | null
  lastSyncedAt: string | null
  updatedAt: string | null
}

export interface ResultadoSyncEmail {
  saved: boolean
  synced: boolean
  error?: string
}

export interface ResultadoPruebaEmail {
  subject: string
  html: string
}

export const usePlantillasEmailStore = defineStore('plantillasEmail', () => {
  const plantillas = shallowRef<PlantillaEmailItem[]>([])
  const loading = ref(false)

  async function cargarPlantillas(tenantId: string): Promise<PlantillaEmailItem[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorSelect } = await cliente
        .from('email_templates')
        .select('*')
        .eq('tenant_id', tenantId)
      if (errorSelect) throw errorSelect

      const porEvento = new Map<string, PlantillaEmailRowDb>((data ?? []).map((f) => [f.event_type, f]))
      plantillas.value = EMAIL_ACTIVE_EVENT_TYPES.map((eventType) => {
        const fila = porEvento.get(eventType)
        return {
          eventType,
          subject: fila?.subject ?? null,
          htmlContent: fila?.html_content ?? null,
          brevoTemplateId: fila?.brevo_template_id ?? null,
          isSynced: fila ? fila.is_synced : null,
          lastSyncedAt: fila?.last_synced_at ?? null,
          updatedAt: fila?.updated_at ?? null,
        }
      })
      return plantillas.value
    } finally {
      loading.value = false
    }
  }

  async function guardar(
    tenantId: string,
    eventType: string,
    subject: string,
    htmlContent: string,
  ): Promise<ResultadoSyncEmail> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<ResultadoSyncEmail>(
      'guardar-plantilla-email',
      { body: { tenant_id: tenantId, event_type: eventType, subject, html_content: htmlContent } },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('guardar-plantilla-email no devolvió datos.')
    await cargarPlantillas(tenantId)
    return data
  }

  async function sincronizar(tenantId: string, eventType: string): Promise<ResultadoSyncEmail> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<ResultadoSyncEmail>(
      'sincronizar-plantilla-email',
      { body: { tenant_id: tenantId, event_type: eventType } },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('sincronizar-plantilla-email no devolvió datos.')
    await cargarPlantillas(tenantId)
    return data
  }

  /** No guarda nada — renderiza local el asunto/cuerpo tal cual están en el editor. */
  async function probar(
    tenantId: string,
    eventType: string,
    subject: string,
    htmlContent: string,
    overrides?: Record<string, string>,
  ): Promise<ResultadoPruebaEmail> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<ResultadoPruebaEmail>(
      'probar-plantilla-email',
      {
        body: {
          tenant_id: tenantId,
          event_type: eventType,
          subject,
          html_content: htmlContent,
          ...(overrides ? { overrides } : {}),
        },
      },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('probar-plantilla-email no devolvió datos.')
    return data
  }

  function limpiar(): void {
    plantillas.value = []
  }

  return { plantillas, loading, cargarPlantillas, guardar, sincronizar, probar, limpiar }
})
