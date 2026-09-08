/**
 * GOB-9 §3.4 — tablero de gobierno. Este store llama EXCLUSIVAMENTE a
 * gobierno_tablero_resumen(tenant_id) — un solo RPC que compone, del lado del servidor, las
 * funciones que cada corte anterior (GOB-1, GOB-4 a GOB-8) ya expuso. Nunca consulta con
 * `.from(...)` una tabla de otro corte directamente — esa es la prueba estructural 10 de
 * tests/gobierno/comunicaciones-workflow.test.ts, y se verifica leyendo este archivo.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

export interface CompromisoPendiente {
  compromiso_id: string
  decision_id: string
  titulo: string
  responsable: string
  estado: string
  fecha_limite: string | null
  vencido: boolean
}

export interface DecisionEstado {
  decision_id: string
  titulo: string
  sin_compromisos: boolean
  semaforo: string
}

export interface ExpedienteDetenido {
  expediente_id: string
  etapa: string
  dias_detenido: number
}

export interface SolicitudSlaEstado {
  estado: 'vencida' | 'proxima'
  cantidad: number
}

export interface ActaPendiente {
  concepto: 'sin_suscribir' | 'sin_disposicion'
  cantidad: number
}

export interface ImpugnacionEnTramite {
  impugnacion_id: string
  plazo_limite: string
  dias_restantes: number
}

export interface AlertaOrgano {
  alerta: string
  organo_id: string | null
  detalle: string
}

export interface TableroResumen {
  compromisos: CompromisoPendiente[]
  decisiones: DecisionEstado[]
  expedientes_detenidos: ExpedienteDetenido[]
  solicitudes_sla: SolicitudSlaEstado[]
  actas_pendientes: ActaPendiente[]
  impugnaciones_en_tramite: ImpugnacionEnTramite[]
  alertas_organo: AlertaOrgano[]
}

export const useGobiernoTableroStore = defineStore('gobiernoTablero', () => {
  const resumen = shallowRef<TableroResumen | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function cargarResumen(tenantId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorRpc } = await cliente.rpc('gobierno_tablero_resumen', { p_tenant_id: tenantId })
      if (errorRpc) throw errorRpc
      resumen.value = data as unknown as TableroResumen
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'No se pudo cargar el tablero de gobierno.'
    } finally {
      loading.value = false
    }
  }

  function limpiar(): void {
    resumen.value = null
    error.value = null
  }

  return { resumen, loading, error, cargarResumen, limpiar }
})
