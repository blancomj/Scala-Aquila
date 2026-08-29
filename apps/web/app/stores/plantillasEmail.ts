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
  /** null = evento sin fila todavía — sin id no hay historial que pedir. */
  id: string | null
  eventType: string
  subject: string | null
  htmlContent: string | null
  brevoTemplateId: number | null
  /** null = evento sin fila todavía (nunca guardado); boolean = valor guardado. */
  isSynced: boolean | null
  lastSyncedAt: string | null
  updatedAt: string | null
  /** null = sin guardar todavía. PRQ-CAR-021. */
  version: number | null
}

/** Una foto histórica de (subject, html_content) (PRQ-CAR-021) — nunca se edita ni se borra. */
export interface VersionPlantillaEmailItem {
  version: number
  subject: string
  htmlContent: string
  createdAt: string
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
  const historial = shallowRef<VersionPlantillaEmailItem[]>([])
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
          id: fila?.id ?? null,
          eventType,
          subject: fila?.subject ?? null,
          htmlContent: fila?.html_content ?? null,
          brevoTemplateId: fila?.brevo_template_id ?? null,
          isSynced: fila ? fila.is_synced : null,
          lastSyncedAt: fila?.last_synced_at ?? null,
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
  async function cargarHistorial(plantillaId: string): Promise<VersionPlantillaEmailItem[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorSelect } = await cliente
      .from('plantillas_email_versiones')
      .select('version, subject, html_content, created_at')
      .eq('plantilla_id', plantillaId)
      .order('version', { ascending: false })
    if (errorSelect) throw errorSelect
    historial.value = (data ?? []).map((f) => ({
      version: f.version,
      subject: f.subject,
      htmlContent: f.html_content,
      createdAt: f.created_at,
    }))
    return historial.value
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
    historial.value = []
  }

  return {
    plantillas,
    historial,
    loading,
    cargarPlantillas,
    cargarHistorial,
    guardar,
    sincronizar,
    probar,
    limpiar,
  }
})
