/**
 * Auditoría — PROMPT_MAESTRO_FASE1.md §11 (audit_log), E6/F10.
 *
 * Solo lectura: audit_log es append-only, escrito por triggers/RPCs
 * (nunca por el cliente). RLS (`audit_log_select_agent_auditor`) ya
 * restringe a agent/auditor del tenant — coincide con el permiso
 * `audit:view` de la matriz (T-MATRIX lo cubre).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type AuditLogRow = Database['public']['Tables']['audit_log']['Row']

export const useAuditStore = defineStore('audit', () => {
  const eventos = shallowRef<AuditLogRow[]>([])
  const loading = ref(false)

  // Estado aparte para la campana de notificaciones del header (layouts/
  // default.vue vía NavNotificaciones.vue): comparte el mismo store porque
  // es la misma fuente (audit_log), pero NO reutiliza `eventos` — ese ref
  // también lo llena dashboard/index.vue con su propio límite, y al ser un
  // store Pinia (singleton) una llamada pisaría el resultado de la otra.
  const eventosRecientes = shallowRef<AuditLogRow[]>([])

  async function cargarEventos(tenantId: string, limite = 50): Promise<AuditLogRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorEventos } = await cliente
        .from('audit_log')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limite)
      if (errorEventos) throw errorEventos
      eventos.value = data ?? []
      return eventos.value
    } finally {
      loading.value = false
    }
  }

  async function cargarEventosRecientes(tenantId: string, limite = 8): Promise<AuditLogRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorEventos } = await cliente
      .from('audit_log')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limite)
    if (errorEventos) throw errorEventos
    eventosRecientes.value = data ?? []
    return eventosRecientes.value
  }

  function limpiar(): void {
    eventos.value = []
    eventosRecientes.value = []
  }

  return { eventos, loading, eventosRecientes, cargarEventos, cargarEventosRecientes, limpiar }
})
