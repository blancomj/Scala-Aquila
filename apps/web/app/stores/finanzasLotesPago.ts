/**
 * FIN-3 (20260931220000-20260931310000) — programación y ejecución de pagos por lote. Ver
 * Casos de uso/Tres Modulos/Financiero/FIN_03_lotes_pago.md.
 *
 * `numero`/`anio` los asigna siempre guard_finanzas_lote_pago (BEFORE INSERT) — nunca el cliente,
 * así que `crearLote` no los envía y castea el resto del payload al tipo generado (mismo motivo
 * que el fixture de tests/finanzas/lotes-pago.test.ts).
 *
 * `aprobarLote`/`ejecutarLote`/`anularLote`/`conciliarLote` son los únicos caminos a esos estados
 * — nunca un UPDATE directo del store, el guard de BD los rechaza fuera de esas RPCs (mismo
 * mecanismo que aquila.aprobando_factura de FIN-2). `agregarItem`/`quitarItem` sí son
 * INSERT/DELETE directos: todo su efecto colateral (compromiso bancario reservado/liberado,
 * estado de la factura, agregados del lote) vive en el guard de `finanzas_lote_items`, no hace
 * falta una RPC aparte.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type LoteRow = Database['public']['Tables']['finanzas_lotes_pago']['Row']
type LoteInsert = Database['public']['Tables']['finanzas_lotes_pago']['Insert']
type ItemRow = Database['public']['Tables']['finanzas_lote_items']['Row']
type ItemInsert = Database['public']['Tables']['finanzas_lote_items']['Insert']
type PoliticaLoteRow = Database['public']['Tables']['finanzas_politica_aprobacion_lote']['Row']
type LoteAdvertenciaRow = Database['public']['Tables']['finanzas_lote_advertencia']['Row']
type FacturaPagableFila = Database['public']['Functions']['finanzas_facturas_pagables']['Returns'][number]
type ExtractoLineaRow = Database['public']['Tables']['extracto_linea']['Row']

export interface ItemConDetalle extends ItemRow {
  readonly factura: {
    readonly numero_documento: string
    readonly total_neto_pagar: number
    readonly proveedor: { readonly nombre_completo: string } | null
  } | null
}

export const useFinanzasLotesPagoStore = defineStore('finanzasLotesPago', () => {
  const facturasPagables = shallowRef<FacturaPagableFila[]>([])
  const lotes = shallowRef<LoteRow[]>([])
  const loteActual = ref<LoteRow | null>(null)
  const items = shallowRef<ItemConDetalle[]>([])
  const advertencias = shallowRef<LoteAdvertenciaRow[]>([])
  const politicaVigente = ref<PoliticaLoteRow | null>(null)
  const lineasExtracto = shallowRef<ExtractoLineaRow[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarFacturasPagables(tenantId: string, hasta: string, soloVencidas = false): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('finanzas_facturas_pagables', {
      p_tenant_id: tenantId, p_hasta: hasta, p_solo_vencidas: soloVencidas,
    })
    if (error) throw error
    facturasPagables.value = data ?? []
  }

  async function cargarLotes(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('finanzas_lotes_pago').select('*').eq('tenant_id', tenantId)
        .order('anio', { ascending: false }).order('numero', { ascending: false })
      if (error) throw error
      lotes.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarPoliticaVigente(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('finanzas_politica_aprobacion_lote').select('*')
      .eq('tenant_id', tenantId).eq('estado', 'vigente').maybeSingle()
    if (error) throw error
    politicaVigente.value = data
  }

  async function cargarLote(loteId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const [{ data: lote, error: errLote }, { data: filas, error: errItems }, { data: adv, error: errAdv }] = await Promise.all([
        cliente.from('finanzas_lotes_pago').select('*').eq('id', loteId).single(),
        cliente.from('finanzas_lote_items')
          .select('*, factura:finanzas_facturas_proveedor(numero_documento, total_neto_pagar, proveedor:terceros(nombre_completo))')
          .eq('lote_id', loteId),
        cliente.from('finanzas_lote_advertencia').select('*').eq('lote_id', loteId).order('created_at', { ascending: false }),
      ])
      if (errLote) throw errLote
      if (errItems) throw errItems
      if (errAdv) throw errAdv
      loteActual.value = lote
      items.value = (filas ?? []) as ItemConDetalle[]
      advertencias.value = adv ?? []
    } finally {
      loading.value = false
    }
  }

  async function crearLote(fila: Omit<LoteInsert, 'numero' | 'anio'>): Promise<LoteRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('finanzas_lotes_pago').insert(fila as LoteInsert).select('*').single()
      if (error) throw error
      return data
    } finally {
      guardando.value = false
    }
  }

  async function agregarItem(fila: ItemInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('finanzas_lote_items').insert(fila)
      if (error) throw error
      await cargarLote(fila.lote_id)
    } finally {
      guardando.value = false
    }
  }

  async function quitarItem(itemId: string, loteId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('finanzas_lote_items').delete().eq('id', itemId)
      if (error) throw error
      await cargarLote(loteId)
    } finally {
      guardando.value = false
    }
  }

  /** borrador -> programado: sin RPC, UPDATE directo (el guard exige cantidad_pagos > 0). */
  async function programarLote(loteId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('finanzas_lotes_pago').update({ estado: 'programado' }).eq('id', loteId).select('*').single()
      if (error) throw error
      loteActual.value = data
    } finally {
      guardando.value = false
    }
  }

  async function aprobarLote(loteId: string, justificacion?: string): Promise<LoteRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('fn_finanzas_aprobar_lote', { p_lote_id: loteId, p_justificacion: justificacion })
        .single<LoteRow>()
      if (error) throw error
      loteActual.value = data
      return data
    } finally {
      guardando.value = false
    }
  }

  async function ejecutarLote(loteId: string, fechaEjecucion?: string): Promise<LoteRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('fn_finanzas_ejecutar_lote', { p_lote_id: loteId, p_fecha_ejecucion: fechaEjecucion })
        .single<LoteRow>()
      if (error) throw error
      loteActual.value = data
      return data
    } finally {
      guardando.value = false
    }
  }

  async function anularLote(loteId: string, motivo: string): Promise<LoteRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('fn_finanzas_anular_lote', { p_lote_id: loteId, p_motivo: motivo })
        .single<LoteRow>()
      if (error) throw error
      loteActual.value = data
      return data
    } finally {
      guardando.value = false
    }
  }

  /** Líneas del extracto de la cuenta bancaria del lote, sin filtrar por si ya cerraron otro lote
   * — la unique de finanzas_lotes_pago.extracto_linea_id rechaza en el servidor una línea
   * repetida, mensaje que llega tal cual (sin traducir, como el resto de guards de este store). */
  async function cargarLineasExtracto(cuentaBancariaId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('extracto_linea')
      .select('*, extracto:extracto_bancario!inner(cuenta_bancaria_id)')
      .eq('extracto.cuenta_bancaria_id', cuentaBancariaId)
      .order('fecha_movimiento', { ascending: false })
    if (error) throw error
    lineasExtracto.value = data ?? []
  }

  async function conciliarLote(loteId: string, extractoLineaId: string): Promise<LoteRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('fn_finanzas_conciliar_lote', { p_lote_id: loteId, p_extracto_linea_id: extractoLineaId })
        .single<LoteRow>()
      if (error) throw error
      loteActual.value = data
      return data
    } finally {
      guardando.value = false
    }
  }

  function limpiarActual(): void {
    loteActual.value = null
    items.value = []
    advertencias.value = []
  }

  return {
    facturasPagables, lotes, loteActual, items, advertencias, politicaVigente, lineasExtracto, loading, guardando,
    cargarFacturasPagables, cargarLotes, cargarPoliticaVigente, cargarLote, crearLote,
    agregarItem, quitarItem, programarLote, aprobarLote, ejecutarLote, anularLote,
    cargarLineasExtracto, conciliarLote, limpiarActual,
  }
})
