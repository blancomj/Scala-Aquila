/**
 * FIN-2 (20260931120000-20260931200000) — factura de proveedor y retenciones aplicadas. Ver
 * Casos de uso/Tres Modulos/Financiero/FIN_02_factura_proveedor.md.
 *
 * `aprobarFactura` es el único camino a 'aprobada' — llama fn_finanzas_aprobar_factura (única
 * autoridad: crea o enlaza presupuesto_ejecucion, nunca un saldo propio del store). El resto de
 * transiciones (registrada/en_revision/en_disputa/anulada) son UPDATE directo, validadas por el
 * guard de BD — sus mensajes llegan tal cual, sin traducir.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type FacturaRow = Database['public']['Tables']['finanzas_facturas_proveedor']['Row']
type FacturaInsert = Database['public']['Tables']['finanzas_facturas_proveedor']['Insert']
type FacturaUpdate = Database['public']['Tables']['finanzas_facturas_proveedor']['Update']
type RetencionRow = Database['public']['Tables']['finanzas_factura_retencion']['Row']
type RetencionInsert = Database['public']['Tables']['finanzas_factura_retencion']['Insert']
type AdvertenciaRow = Database['public']['Tables']['finanzas_factura_advertencia']['Row']
type PoliticaRow = Database['public']['Tables']['finanzas_politica_aprobacion_pago']['Row']
type DescomposicionFila = Database['public']['Functions']['finanzas_factura_descomposicion']['Returns'][number]

export const useFinanzasFacturasStore = defineStore('finanzasFacturas', () => {
  const facturas = shallowRef<FacturaRow[]>([])
  const facturaActual = ref<FacturaRow | null>(null)
  const retenciones = shallowRef<RetencionRow[]>([])
  const advertencias = shallowRef<AdvertenciaRow[]>([])
  const descomposicion = shallowRef<DescomposicionFila[]>([])
  const politicaVigente = ref<PoliticaRow | null>(null)
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarFacturas(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('finanzas_facturas_proveedor').select('*').eq('tenant_id', tenantId)
        .order('fecha_emision', { ascending: false })
      if (error) throw error
      facturas.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarPoliticaVigente(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('finanzas_politica_aprobacion_pago').select('*')
      .eq('tenant_id', tenantId).eq('estado', 'vigente').maybeSingle()
    if (error) throw error
    politicaVigente.value = data
  }

  async function cargarFactura(id: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const [
        { data: factura, error: errFactura }, { data: retencionesFilas, error: errRet },
        { data: advertenciasFilas, error: errAdv },
      ] = await Promise.all([
        cliente.from('finanzas_facturas_proveedor').select('*').eq('id', id).single(),
        cliente.from('finanzas_factura_retencion').select('*').eq('factura_id', id),
        cliente.from('finanzas_factura_advertencia').select('*').eq('factura_id', id).order('created_at', { ascending: false }),
      ])
      if (errFactura) throw errFactura
      if (errRet) throw errRet
      if (errAdv) throw errAdv
      facturaActual.value = factura
      retenciones.value = retencionesFilas ?? []
      advertencias.value = advertenciasFilas ?? []
      if (factura.presupuesto_ejecucion_id) {
        const { data: lineas, error: errLineas } = await cliente
          .rpc('finanzas_factura_descomposicion', { p_ejecucion_id: factura.presupuesto_ejecucion_id })
        if (errLineas) throw errLineas
        descomposicion.value = lineas ?? []
      } else {
        descomposicion.value = []
      }
    } finally {
      loading.value = false
    }
  }

  async function crearFactura(fila: FacturaInsert): Promise<FacturaRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('finanzas_facturas_proveedor').insert(fila).select('*').single()
      if (error) throw error
      return data
    } finally {
      guardando.value = false
    }
  }

  async function actualizarFactura(id: string, patch: FacturaUpdate): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('finanzas_facturas_proveedor').update(patch).eq('id', id).select('*').single()
      if (error) throw error
      facturaActual.value = data
    } finally {
      guardando.value = false
    }
  }

  async function agregarRetencion(fila: RetencionInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('finanzas_factura_retencion').insert(fila)
      if (error) throw error
      const { data } = await cliente.from('finanzas_factura_retencion').select('*').eq('factura_id', fila.factura_id)
      retenciones.value = data ?? []
    } finally {
      guardando.value = false
    }
  }

  /** Único camino a estado='aprobada' — fn_finanzas_aprobar_factura crea/enlaza
   * presupuesto_ejecucion (nunca lo hace este store) y registra advertencia si el monto supera
   * el umbral y GOB-1 no existe. */
  async function aprobarFactura(facturaId: string): Promise<FacturaRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('fn_finanzas_aprobar_factura', { p_factura_id: facturaId }).single<FacturaRow>()
      if (error) throw error
      facturaActual.value = data
      const { data: advertenciasFilas } = await cliente
        .from('finanzas_factura_advertencia').select('*').eq('factura_id', facturaId).order('created_at', { ascending: false })
      advertencias.value = advertenciasFilas ?? []
      return data
    } finally {
      guardando.value = false
    }
  }

  function limpiarActual(): void {
    facturaActual.value = null
    retenciones.value = []
    advertencias.value = []
    descomposicion.value = []
  }

  return {
    facturas, facturaActual, retenciones, advertencias, descomposicion, politicaVigente, loading, guardando,
    cargarFacturas, cargarPoliticaVigente, cargarFactura, crearFactura, actualizarFactura,
    agregarRetencion, aprobarFactura, limpiarActual,
  }
})
