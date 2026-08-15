/**
 * Fundamentos normativos — trazabilidad jurídica reutilizable, asociable a
 * fuente_financiacion / presupuesto_rubros (GAP-19, E-16 §7).
 *
 * SELECT/INSERT van directo por RLS (sin Edge Function): no hay guard
 * trigger ni resolución de tenant_id que justifique una capa intermedia,
 * a diferencia de fuente_financiacion (mismo criterio que members.ts).
 * SELECT devuelve tanto lo de plataforma (tenant_id null, LEY/DECRETO) como
 * lo propio del tenant — RLS ya hace esa unión, no hace falta filtrar aquí.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type FundamentoNormativoRow = Database['public']['Tables']['fundamento_normativo']['Row']
type FundamentoTipo = Database['public']['Enums']['fundamento_tipo_t']

export const useFundamentoNormativoStore = defineStore('fundamentoNormativo', () => {
  const fundamentos = shallowRef<FundamentoNormativoRow[]>([])
  const loading = ref(false)

  async function cargarFundamentos(): Promise<FundamentoNormativoRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorFundamentos } = await cliente
        .from('fundamento_normativo')
        .select('*')
        .order('created_at', { ascending: false })
      if (errorFundamentos) throw errorFundamentos
      fundamentos.value = data ?? []
      return fundamentos.value
    } finally {
      loading.value = false
    }
  }

  async function crearFundamento(params: {
    tenantId: string
    tipo: FundamentoTipo
    norma: string
    articulo?: string
    descripcion?: string
    fechaVigencia?: string
    referencia?: string
  }): Promise<FundamentoNormativoRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('fundamento_normativo')
      .insert({
        tenant_id: params.tenantId,
        tipo: params.tipo,
        norma: params.norma,
        articulo: params.articulo,
        descripcion: params.descripcion,
        fecha_vigencia: params.fechaVigencia,
        referencia: params.referencia,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarFundamentos()
    return data
  }

  function limpiar(): void {
    fundamentos.value = []
  }

  return { fundamentos, loading, cargarFundamentos, crearFundamento, limpiar }
})
