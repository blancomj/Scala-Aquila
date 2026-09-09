/**
 * MANT-6 · Inventario de repuestos y costos. El stock NUNCA se guarda — se deriva vía la RPC
 * mant_stock() (ver 20260932110000). El consumo/devolución desde una OT SIEMPRE pasan por las
 * RPC fn_mant_registrar_consumo/fn_mant_registrar_devolucion (nunca un INSERT directo con
 * orden_trabajo_id), y una transferencia SIEMPRE por fn_mant_transferir_repuesto (el guard de la
 * base rechaza un INSERT suelto de tipo 'transferencia' — ver informe del corte).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type RepuestoRow = Database['public']['Tables']['mant_repuestos']['Row']
type RepuestoInsert = Database['public']['Tables']['mant_repuestos']['Insert']
type RepuestoUpdate = Database['public']['Tables']['mant_repuestos']['Update']
type AlmacenRow = Database['public']['Tables']['mant_almacenes']['Row']
type AlmacenInsert = Database['public']['Tables']['mant_almacenes']['Insert']
type MovimientoRow = Database['public']['Tables']['mant_inventario_movimientos']['Row']
type MovimientoTipo = Database['public']['Enums']['movimiento_tipo_t']
type AlertaRow = Database['public']['Tables']['mant_inventario_alertas']['Row']
type CostoFila = Database['public']['Functions']['mant_costos']['Returns'][number]
type PendienteFila =
  Database['public']['Functions']['mant_inventario_pendientes_contabilizar']['Returns'][number]

export const useMantenimientoInventarioStore = defineStore('mantenimientoInventario', () => {
  const repuestos = shallowRef<RepuestoRow[]>([])
  const almacenes = shallowRef<AlmacenRow[]>([])
  const movimientos = shallowRef<MovimientoRow[]>([])
  const alertas = shallowRef<AlertaRow[]>([])
  const costos = shallowRef<CostoFila[]>([])
  const pendientesContabilizar = shallowRef<PendienteFila[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarCatalogos(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const [{ data: r, error: errR }, { data: a, error: errA }] = await Promise.all([
        cliente.from('mant_repuestos').select('*').eq('tenant_id', tenantId).order('nombre'),
        cliente.from('mant_almacenes').select('*').eq('tenant_id', tenantId).order('nombre'),
      ])
      if (errR) throw errR
      if (errA) throw errA
      repuestos.value = r ?? []
      almacenes.value = a ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarMovimientos(
    tenantId: string,
    filtro?: { repuestoId?: string; otId?: string },
  ): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      let consulta = cliente
        .from('mant_inventario_movimientos')
        .select('*')
        .eq('tenant_id', tenantId)
      if (filtro?.repuestoId) consulta = consulta.eq('repuesto_id', filtro.repuestoId)
      if (filtro?.otId) consulta = consulta.eq('orden_trabajo_id', filtro.otId)
      const { data, error } = await consulta.order('registrado_at', { ascending: false }).limit(200)
      if (error) throw error
      movimientos.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarAlertas(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_inventario_alertas')
        .select('*')
        .eq('tenant_id', tenantId)
        .is('resuelta_at', null)
        .order('generada_at', { ascending: false })
      if (error) throw error
      alertas.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarCostos(tenantId: string, desde: string, hasta: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('mant_costos', {
        p_tenant_id: tenantId,
        p_desde: desde,
        p_hasta: hasta,
      })
      if (error) throw error
      costos.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarPendientesContabilizar(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('mant_inventario_pendientes_contabilizar', {
      p_tenant_id: tenantId,
    })
    if (error) throw error
    pendientesContabilizar.value = data ?? []
  }

  async function stockDe(tenantId: string, repuestoId: string, almacenId: string): Promise<number> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('mant_stock', {
      p_tenant_id: tenantId,
      p_repuesto_id: repuestoId,
      p_almacen_id: almacenId,
      p_fecha: new Date().toISOString().slice(0, 10),
    })
    if (error) throw error
    return Number(data ?? 0)
  }

  async function crearRepuesto(fila: RepuestoInsert): Promise<RepuestoRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('mant_repuestos').insert(fila).select('*').single()
      if (error) throw error
      repuestos.value = [...repuestos.value, data].sort((a, b) => a.nombre.localeCompare(b.nombre))
      return data
    } finally {
      guardando.value = false
    }
  }

  async function actualizarRepuesto(id: string, patch: RepuestoUpdate): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_repuestos')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      repuestos.value = repuestos.value.map((r) => (r.id === id ? data : r))
    } finally {
      guardando.value = false
    }
  }

  async function crearAlmacen(fila: AlmacenInsert): Promise<AlmacenRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('mant_almacenes').insert(fila).select('*').single()
      if (error) throw error
      almacenes.value = [...almacenes.value, data].sort((a, b) => a.nombre.localeCompare(b.nombre))
      return data
    } finally {
      guardando.value = false
    }
  }

  /** Entrada/salida/ajuste directo — NUNCA para 'transferencia' (ver fn_mant_transferir_repuesto)
   * ni para movimientos enlazados a una OT (ver fn_mant_registrar_consumo/devolucion). */
  async function registrarMovimiento(params: {
    tenantId: string
    repuestoId: string
    almacenId: string
    tipo: Exclude<MovimientoTipo, 'transferencia'>
    cantidad: number
    direccion?: 1 | -1
    costoUnitario?: number
    tercero_id?: string
    motivo?: string
  }): Promise<MovimientoRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_inventario_movimientos')
        .insert({
          tenant_id: params.tenantId,
          repuesto_id: params.repuestoId,
          almacen_id: params.almacenId,
          tipo: params.tipo,
          cantidad: params.cantidad,
          direccion: params.direccion ?? 1,
          costo_unitario: params.costoUnitario ?? null,
          tercero_id: params.tercero_id ?? null,
          motivo: params.motivo ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      movimientos.value = [data, ...movimientos.value]
      return data
    } finally {
      guardando.value = false
    }
  }

  async function registrarConsumo(params: {
    otId: string
    repuestoId: string
    almacenId: string
    cantidad: number
    costoUnitario?: number
  }): Promise<MovimientoRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('fn_mant_registrar_consumo', {
          p_ot_id: params.otId,
          p_repuesto_id: params.repuestoId,
          p_almacen_id: params.almacenId,
          p_cantidad: params.cantidad,
          p_costo_unitario: params.costoUnitario,
        })
        .single()
      if (error) throw error
      movimientos.value = [data, ...movimientos.value]
      return data
    } finally {
      guardando.value = false
    }
  }

  async function registrarDevolucion(params: {
    otId: string
    repuestoId: string
    almacenId: string
    cantidad: number
  }): Promise<MovimientoRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('fn_mant_registrar_devolucion', {
          p_ot_id: params.otId,
          p_repuesto_id: params.repuestoId,
          p_almacen_id: params.almacenId,
          p_cantidad: params.cantidad,
        })
        .single()
      if (error) throw error
      movimientos.value = [data, ...movimientos.value]
      return data
    } finally {
      guardando.value = false
    }
  }

  async function transferir(params: {
    tenantId: string
    repuestoId: string
    almacenOrigenId: string
    almacenDestinoId: string
    cantidad: number
  }): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('fn_mant_transferir_repuesto', {
        p_tenant_id: params.tenantId,
        p_repuesto_id: params.repuestoId,
        p_almacen_origen_id: params.almacenOrigenId,
        p_almacen_destino_id: params.almacenDestinoId,
        p_cantidad: params.cantidad,
      })
      if (error) throw error
      await cargarMovimientos(params.tenantId, { repuestoId: params.repuestoId })
    } finally {
      guardando.value = false
    }
  }

  return {
    repuestos,
    almacenes,
    movimientos,
    alertas,
    costos,
    pendientesContabilizar,
    loading,
    guardando,
    cargarCatalogos,
    cargarMovimientos,
    cargarAlertas,
    cargarCostos,
    cargarPendientesContabilizar,
    stockDe,
    crearRepuesto,
    actualizarRepuesto,
    crearAlmacen,
    registrarMovimiento,
    registrarConsumo,
    registrarDevolucion,
    transferir,
  }
})
