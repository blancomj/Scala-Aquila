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

  function limpiar(): void {
    eventos.value = []
  }

  return { eventos, loading, cargarEventos, limpiar }
})
