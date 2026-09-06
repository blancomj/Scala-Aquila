/**
 * CO-7 · Deterioro de cartera — política versionada (contable_politica_deterioro/_tramo),
 * cálculo de solo lectura (contable_calcular_deterioro) y reconocimiento
 * (fn_contable_reconocer_deterioro). Ningún porcentaje se sugiere aquí: una política sin
 * aprobar (borrador) no calcula nada — el motor la rechaza con DETERIORO_SIN_POLITICA.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type PoliticaRow = Database['public']['Tables']['contable_politica_deterioro']['Row']
type TramoRow = Database['public']['Tables']['contable_politica_deterioro_tramo']['Row']
type FilaCalculo = Database['public']['Functions']['contable_calcular_deterioro']['Returns'][number]

export interface NuevoTramoDeterioro {
  diasDesde: number
  diasHasta: number | null
  porcentaje: number
}

export interface NuevaPoliticaDeterioro {
  tenantId: string
  version: number
  metodo: 'antiguedad' | 'porcentaje_global' | 'individual'
  porcentajeGlobal?: number
  excluirCargosConAcuerdoVigente: boolean
  vigenteDesde?: string
  acuerdoReferencia?: string
  fundamento?: string
  tramos: NuevoTramoDeterioro[]
}

export const useDeterioroStore = defineStore('deterioro', () => {
  const politicas = shallowRef<PoliticaRow[]>([])
  const tramos = shallowRef<TramoRow[]>([])
  const simulacion = shallowRef<FilaCalculo[]>([])
  const loading = ref(false)
  const simulando = ref(false)
  const reconociendo = ref(false)

  async function cargarPoliticas(tenantId: string): Promise<PoliticaRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('contable_politica_deterioro')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('version', { ascending: false })
      if (error) throw error
      politicas.value = data ?? []
      return politicas.value
    } finally {
      loading.value = false
    }
  }

  async function cargarTramos(politicaId: string): Promise<TramoRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('contable_politica_deterioro_tramo')
      .select('*')
      .eq('politica_id', politicaId)
      .order('dias_desde')
    if (error) throw error
    tramos.value = data ?? []
    return tramos.value
  }

  /** Inserta la política en borrador y sus tramos (si metodo=antiguedad) — nunca en vigente
   * directo (guard_politica_deterioro_completa solo valida al pasar por UPDATE). */
  async function crearPolitica(p: NuevaPoliticaDeterioro): Promise<string> {
    const cliente = useSupabaseClient<Database>()
    const { data: politica, error } = await cliente
      .from('contable_politica_deterioro')
      .insert({
        tenant_id: p.tenantId,
        version: p.version,
        metodo: p.metodo,
        porcentaje_global: p.metodo === 'porcentaje_global' ? (p.porcentajeGlobal ?? null) : null,
        excluir_cargos_con_acuerdo_vigente: p.excluirCargosConAcuerdoVigente,
        vigente_desde: p.vigenteDesde || null,
        acta_referencia: p.acuerdoReferencia || null,
        fundamento: p.fundamento || null,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw error

    if (p.metodo === 'antiguedad' && p.tramos.length > 0) {
      const { error: errTramos } = await cliente.from('contable_politica_deterioro_tramo').insert(
        p.tramos.map((t) => ({
          tenant_id: p.tenantId,
          politica_id: politica.id,
          dias_desde: t.diasDesde,
          dias_hasta: t.diasHasta,
          porcentaje: t.porcentaje,
        })),
      )
      if (errTramos) throw errTramos
    }

    return politica.id
  }

  /** Retira la versión vigente actual (si existe) a 'historica' y activa la nueva — ambas
   * transiciones las permite guard_politica_inmutable (solo estado/vigente_hasta/updated_at
   * pueden cambiar una vez vigente). Sin esto, la segunda activación de todo tenant fallaría
   * contra el índice único contable_politica_deterioro_vigente_unica. */
  async function activarPolitica(politicaId: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data: actual, error: errActual } = await cliente
      .from('contable_politica_deterioro')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('estado', 'vigente')
      .maybeSingle<{ id: string }>()
    if (errActual) throw errActual

    if (actual && actual.id !== politicaId) {
      const { error: errHistorica } = await cliente
        .from('contable_politica_deterioro')
        .update({ estado: 'historica' })
        .eq('id', actual.id)
      if (errHistorica) throw errHistorica
    }

    const { error } = await cliente
      .from('contable_politica_deterioro')
      .update({ estado: 'vigente' })
      .eq('id', politicaId)
    if (error) throw error
  }

  /** Solo lectura (§8: la simulación nunca escribe) — el mismo cálculo que usa el
   * reconocimiento, para que el contador vea el efecto antes de comprometerlo. */
  async function simular(tenantId: string, fechaCorte: string): Promise<FilaCalculo[]> {
    simulando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('contable_calcular_deterioro', {
        p_tenant_id: tenantId, p_fecha_corte: fechaCorte,
      })
      if (error) throw error
      simulacion.value = data ?? []
      return simulacion.value
    } finally {
      simulando.value = false
    }
  }

  /** Única vía para reconocer — arma el comprobante y registra el detalle por inmueble
   * (fn_contable_reconocer_deterioro, CO-7 §4.3). Devuelve null si el ajuste neto es cero (no
   * hay nada que registrar). */
  async function reconocer(tenantId: string, periodoId: string): Promise<string | null> {
    reconociendo.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('fn_contable_reconocer_deterioro', {
        p_tenant_id: tenantId, p_periodo_id: periodoId,
      })
      if (error) throw error
      return data
    } finally {
      reconociendo.value = false
    }
  }

  return {
    politicas, tramos, simulacion, loading, simulando, reconociendo,
    cargarPoliticas, cargarTramos, crearPolitica, activarPolitica, simular, reconocer,
  }
})
