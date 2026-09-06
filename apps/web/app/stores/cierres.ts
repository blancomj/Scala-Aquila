/**
 * CO-6 · Cierre, apertura y corrección de errores (§3.7).
 *
 * Cinco funciones del servidor (contable_validacion_cierre + las cuatro de cierre/apertura) más
 * el historial (audit_log para reaperturas, contable_correccion para correcciones) — este store
 * no calcula nada, solo orquesta las llamadas y mantiene el estado de la pantalla.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type PeriodoRow = Database['public']['Tables']['periodos']['Row']
type Hallazgo = Database['public']['Functions']['contable_validacion_cierre']['Returns'][number]
type CorreccionRow = Database['public']['Tables']['contable_correccion']['Row']
type AuditLogRow = Database['public']['Tables']['audit_log']['Row']

export const useCierresStore = defineStore('cierres', () => {
  const periodos = shallowRef<PeriodoRow[]>([])
  const hallazgos = shallowRef<Hallazgo[]>([])
  const correcciones = shallowRef<CorreccionRow[]>([])
  const reaperturas = shallowRef<AuditLogRow[]>([])
  const loading = ref(false)
  const loadingHallazgos = ref(false)
  const procesando = ref(false)

  async function cargarPeriodos(tenantId: string, anio: number): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('periodos')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('anio', anio)
        .order('mes')
      if (error) throw error
      periodos.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarValidacion(tenantId: string, periodoId: string): Promise<void> {
    loadingHallazgos.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('contable_validacion_cierre', {
        p_tenant_id: tenantId, p_periodo_id: periodoId,
      })
      if (error) throw error
      hallazgos.value = data ?? []
    } finally {
      loadingHallazgos.value = false
    }
  }

  async function cerrarPeriodo(
    tenantId: string, periodoId: string, forzarAdvertencias: boolean,
  ): Promise<void> {
    procesando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('fn_contable_cerrar_periodo', {
        p_tenant_id: tenantId, p_periodo_id: periodoId, p_forzar_advertencias: forzarAdvertencias,
      })
      if (error) throw error
    } finally {
      procesando.value = false
    }
  }

  async function reabrirPeriodo(tenantId: string, periodoId: string, motivo: string): Promise<void> {
    procesando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('fn_contable_reabrir_periodo', {
        p_tenant_id: tenantId, p_periodo_id: periodoId, p_motivo: motivo,
      })
      if (error) throw error
    } finally {
      procesando.value = false
    }
  }

  async function cerrarEjercicio(tenantId: string, anio: number): Promise<string> {
    procesando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('fn_contable_cerrar_ejercicio', {
        p_tenant_id: tenantId, p_anio: anio,
      })
      if (error) throw error
      return data
    } finally {
      procesando.value = false
    }
  }

  async function abrirEjercicio(tenantId: string, anio: number): Promise<string> {
    procesando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('fn_contable_abrir_ejercicio', {
        p_tenant_id: tenantId, p_anio: anio,
      })
      if (error) throw error
      return data
    } finally {
      procesando.value = false
    }
  }

  /** §3.6: enruta según periodo/ejercicio/grupo — el comprobante correcto se prepara aparte
   * (captura manual normal, borrador) antes de llamar esta función. */
  async function corregirError(params: {
    tenantId: string
    comprobanteOrigenId: string
    comprobanteCorrectoId: string
    periodoDestino: string
    motivo: string
    tipoCorreccion: string
  }): Promise<string> {
    procesando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('fn_contable_corregir_error', {
        p_tenant_id: params.tenantId,
        p_comprobante_origen_id: params.comprobanteOrigenId,
        p_comprobante_correcto_id: params.comprobanteCorrectoId,
        p_periodo_destino: params.periodoDestino,
        p_motivo: params.motivo,
        p_tipo_correccion: params.tipoCorreccion,
      })
      if (error) throw error
      return data
    } finally {
      procesando.value = false
    }
  }

  /** §3.7: historial visible para el rol auditor — reaperturas (audit_log) y correcciones
   * (contable_correccion), ambas ya con su propia policy de select por miembro. */
  async function cargarHistorial(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const [{ data: aud, error: errAud }, { data: corr, error: errCorr }] = await Promise.all([
      cliente
        .from('audit_log')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('action', 'contable.periodo.reabierto')
        .order('created_at', { ascending: false }),
      cliente
        .from('contable_correccion')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }),
    ])
    if (errAud) throw errAud
    if (errCorr) throw errCorr
    reaperturas.value = aud ?? []
    correcciones.value = corr ?? []
  }

  return {
    periodos, hallazgos, correcciones, reaperturas, loading, loadingHallazgos, procesando,
    cargarPeriodos, cargarValidacion, cerrarPeriodo, reabrirPeriodo, cerrarEjercicio,
    abrirEjercicio, corregirError, cargarHistorial,
  }
})
