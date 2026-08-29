/**
 * Bandeja de escalamiento y aprobaciones (CAR §11, bloque 18) — la cola de
 * decisiones sobre la etapa de cobranza de cada inmueble.
 *
 * Las filas salen de fn_bandeja_escalamiento (20260907120000), que ya
 * resuelve días de mora y deuda actual vía fn_posicion_cartera —
 * cartera_etapas no es una foto de deuda, no se lee de una columna
 * congelada.
 *
 * Confirmar y rechazar son UPDATE directos por RLS, no Edge Functions —
 * mismo criterio y misma razón que decidirAccion en stores/cobranza.ts:
 * las reglas duras ya viven en la base (guard_cartera_etapa_transicion,
 * 20260822330000, exige rol administrador y prohíbe autoaprobación para
 * las transiciones que la matriz marca "Sí"); una función intermedia con
 * service_role solo añadiría un lugar donde equivocarse y perdería el
 * auth.uid() que el maker-checker exige identificar.
 *
 * La bitácora (eventos_cartera, tipo=CARTERA_ETAPA_CAMBIO) es una tabla
 * plana con RLS de solo-select para miembros — se consulta directo, sin
 * RPC, mismo criterio documentado en fn_panel_acciones_cartera para lo
 * que no necesita derivar/agregar nada.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { mensajeError } from '~/utils/error-message'

type EtapaCobranza = Database['public']['Enums']['etapa_cobranza_t']

export interface FilaBandejaEscalamiento {
  inmuebleId: string
  inmuebleCodigo: string
  etapa: EtapaCobranza
  etapaPropuesta: EtapaCobranza
  motivoPropuesta: string
  propuestoPor: string
  propuestoAt: string
  diasMora: number
  deudaTotal: string
  cantidadCargosVencidos: number
}

export interface EventoEscalamiento {
  id: string
  inmuebleId: string | null
  ocurridoAt: string
  estadoAnterior: unknown
  estadoNuevo: unknown
  motivo: string
  origen: string
  actorId: string | null
}

interface FilaBandejaDb {
  inmueble_id: string
  inmueble_codigo: string
  etapa: EtapaCobranza
  etapa_propuesta: EtapaCobranza
  motivo_propuesta: string
  propuesto_por: string
  propuesto_at: string
  dias_mora: number
  deuda_total: string | number
  cantidad_cargos_vencidos: number
}

export const useEscalamientoStore = defineStore('escalamiento', () => {
  const bandeja = shallowRef<FilaBandejaEscalamiento[]>([])
  const bitacora = shallowRef<EventoEscalamiento[]>([])
  const loading = ref(false)
  const loadingBitacora = ref(false)

  async function cargarBandeja(tenantId: string, fechaCorte: string): Promise<FilaBandejaEscalamiento[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('fn_bandeja_escalamiento', {
        p_tenant_id: tenantId,
        p_fecha_corte: fechaCorte,
      })
      if (error) throw error

      const filas = (data ?? []) as unknown as FilaBandejaDb[]
      bandeja.value = filas.map((f) => ({
        inmuebleId: f.inmueble_id,
        inmuebleCodigo: f.inmueble_codigo,
        etapa: f.etapa,
        etapaPropuesta: f.etapa_propuesta,
        motivoPropuesta: f.motivo_propuesta,
        propuestoPor: f.propuesto_por,
        propuestoAt: f.propuesto_at,
        diasMora: f.dias_mora,
        deudaTotal: String(f.deuda_total),
        cantidadCargosVencidos: f.cantidad_cargos_vencidos,
      }))
      return bandeja.value
    } finally {
      loading.value = false
    }
  }

  async function cargarBitacora(tenantId: string, limite = 100): Promise<EventoEscalamiento[]> {
    loadingBitacora.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('eventos_cartera')
        .select('id, inmueble_id, ocurrido_at, estado_anterior, estado_nuevo, motivo, origen, actor_id')
        .eq('tenant_id', tenantId)
        .eq('tipo', 'CARTERA_ETAPA_CAMBIO')
        .order('ocurrido_at', { ascending: false })
        .limit(limite)
      if (error) throw error

      bitacora.value = (data ?? []).map((e) => ({
        id: e.id,
        inmuebleId: e.inmueble_id,
        ocurridoAt: e.ocurrido_at,
        estadoAnterior: e.estado_anterior,
        estadoNuevo: e.estado_nuevo,
        motivo: e.motivo,
        origen: e.origen,
        actorId: e.actor_id,
      }))
      return bitacora.value
    } finally {
      loadingBitacora.value = false
    }
  }

  /**
   * Confirmar escalona/desescalona a la etapa propuesta (UPDATE etapa =
   * etapa_propuesta). Rechazar retira la propuesta (UPDATE etapa_propuesta
   * = null) — cualquier agent puede retirarla, no exige administrador
   * (guard_cartera_etapa_transicion, caso "se limpia la propuesta").
   */
  async function confirmarEtapa(inmuebleId: string, etapaPropuesta: EtapaCobranza): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('cartera_etapas')
      .update({ etapa: etapaPropuesta })
      .eq('inmueble_id', inmuebleId)
    if (error) throw new Error(mensajeError(error, 'No se pudo confirmar la transición de etapa.'))
  }

  async function rechazarPropuesta(inmuebleId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('cartera_etapas')
      .update({ etapa_propuesta: null })
      .eq('inmueble_id', inmuebleId)
    if (error) throw new Error(mensajeError(error, 'No se pudo rechazar la propuesta de escalamiento.'))
  }

  return {
    bandeja,
    bitacora,
    loading,
    loadingBitacora,
    cargarBandeja,
    cargarBitacora,
    confirmarEtapa,
    rechazarPropuesta,
  }
})
