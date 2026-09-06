/**
 * CO-4 · Libros oficiales de contabilidad — Diario, Mayor, Balance de prueba,
 * Inventarios y Balances. Las cuatro funciones son `stable` de solo lectura
 * sobre lo ya persistido (contable_comprobante/detalle, CO-2/CO-3); este
 * store no escribe nada salvo el registro de auditoría de exportación
 * (fn_registrar_exportacion_libro, §3.6) — ningún libro se calcula ni se
 * guarda aquí.
 */
import { defineStore } from 'pinia'
import type { Database, Json } from '@aquila/shared'

type FilaDiario = Database['public']['Functions']['contable_libro_diario']['Returns'][number]
type FilaMayor = Database['public']['Functions']['contable_libro_mayor']['Returns'][number]
type FilaBalance = Database['public']['Functions']['contable_balance_prueba']['Returns'][number]
type FilaInventarios =
  Database['public']['Functions']['contable_libro_inventarios_balances']['Returns'][number]
type FilaConciliacionCartera =
  Database['public']['Functions']['contable_conciliacion_cartera']['Returns'][number]

export const useLibrosStore = defineStore('libros', () => {
  const diario = shallowRef<FilaDiario[]>([])
  const mayor = shallowRef<FilaMayor[]>([])
  const balance = shallowRef<FilaBalance[]>([])
  const inventarios = shallowRef<FilaInventarios[]>([])
  const conciliacionCartera = shallowRef<FilaConciliacionCartera[]>([])
  const loading = ref(false)

  async function cargarDiario(tenantId: string, desde: string, hasta: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('contable_libro_diario', {
        p_tenant_id: tenantId, p_desde: desde, p_hasta: hasta,
      })
      if (error) throw error
      diario.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarMayor(tenantId: string, desde: string, hasta: string, cuentaId?: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('contable_libro_mayor', {
        p_tenant_id: tenantId, p_desde: desde, p_hasta: hasta, p_cuenta_id: cuentaId ?? undefined,
      })
      if (error) throw error
      mayor.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarBalance(tenantId: string, desde: string, hasta: string, nivel: number): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('contable_balance_prueba', {
        p_tenant_id: tenantId, p_desde: desde, p_hasta: hasta, p_nivel: nivel,
      })
      if (error) throw error
      balance.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarInventariosBalances(tenantId: string, fechaCorte: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const [{ data, error }, { data: conciliacion, error: errConciliacion }] = await Promise.all([
        cliente.rpc('contable_libro_inventarios_balances', { p_tenant_id: tenantId, p_fecha_corte: fechaCorte }),
        cliente.rpc('contable_conciliacion_cartera', { p_tenant_id: tenantId, p_fecha_corte: fechaCorte }),
      ])
      if (error) throw error
      if (errConciliacion) throw errConciliacion
      inventarios.value = data ?? []
      conciliacionCartera.value = conciliacion ?? []
    } finally {
      loading.value = false
    }
  }

  /** §3.6: los exportadores (xlsx/pdfmake) son 100% client-side, sin round-trip al servidor —
   * esta es la única llamada que deja rastro de auditoría de "quién exportó qué y cuándo". */
  async function registrarExportacion(
    tenantId: string,
    libro: 'diario' | 'mayor' | 'balance_prueba' | 'inventarios_balances',
    formato: 'excel' | 'pdf',
    filtros: Json,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.rpc('fn_registrar_exportacion_libro', {
      p_tenant_id: tenantId, p_libro: libro, p_formato: formato, p_filtros: filtros,
    })
    if (error) throw error
  }

  return {
    diario, mayor, balance, inventarios, conciliacionCartera, loading,
    cargarDiario, cargarMayor, cargarBalance, cargarInventariosBalances, registrarExportacion,
  }
})
