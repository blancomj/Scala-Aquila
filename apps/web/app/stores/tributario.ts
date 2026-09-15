/**
 * CO-8 · Obligaciones tributarias — segregación de cuentas, retención en la fuente, IVA y base
 * de exógena. Nada de este store se llama si el tenant no lo necesita; la página condiciona sus
 * pestañas a responsable_iva/agente_retencion (CO-1), este store solo orquesta lecturas/escrituras.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type ContableCuentaRow = Database['public']['Tables']['contable_cuenta']['Row']
type ConceptoRetencionRow = Database['public']['Tables']['tributario_concepto_retencion']['Row']
type CertificadoFila = Database['public']['Functions']['tributario_certificado_retencion']['Returns'][number]
type ResumenRetencionFila = Database['public']['Functions']['tributario_resumen_retenciones_mensual']['Returns'][number]
type IngresoNaturalezaFila = Database['public']['Functions']['contable_ingresos_por_naturaleza_tributaria']['Returns'][number]
type ResumenIvaFila = Database['public']['Functions']['tributario_resumen_iva']['Returns'][number]
type ResumenIcaFila = Database['public']['Functions']['tributario_resumen_ica']['Returns'][number]
type ExogenaResultado = Database['public']['Functions']['tributario_base_exogena']['Returns']

export const useTributarioStore = defineStore('tributario', () => {
  const cuentasClasificables = shallowRef<ContableCuentaRow[]>([])
  const conceptosRetencion = shallowRef<ConceptoRetencionRow[]>([])
  const certificado = shallowRef<CertificadoFila[]>([])
  const resumenRetenciones = shallowRef<ResumenRetencionFila[]>([])
  const ingresosPorNaturaleza = shallowRef<IngresoNaturalezaFila[]>([])
  const resumenIva = shallowRef<ResumenIvaFila | null>(null)
  const resumenIca = shallowRef<ResumenIcaFila | null>(null)
  const exogena = shallowRef<ExogenaResultado | null>(null)
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarCuentasClasificables(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('contable_cuenta')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('clase', [1, 4, 5])
        .eq('permite_movimiento', true)
        .order('codigo')
      if (error) throw error
      cuentasClasificables.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function clasificarCuenta(cuentaId: string, naturalezaTributariaId: number | null): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('contable_cuenta')
        .update({ naturaleza_tributaria_id: naturalezaTributariaId })
        .eq('id', cuentaId)
      if (error) throw error
      cuentasClasificables.value = cuentasClasificables.value.map((c) =>
        c.id === cuentaId ? { ...c, naturaleza_tributaria_id: naturalezaTributariaId } : c,
      )
    } finally {
      guardando.value = false
    }
  }

  async function cargarIngresosPorNaturaleza(tenantId: string, desde: string, hasta: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('contable_ingresos_por_naturaleza_tributaria', {
      p_tenant_id: tenantId, p_desde: desde, p_hasta: hasta,
    })
    if (error) throw error
    ingresosPorNaturaleza.value = data ?? []
  }

  async function cargarConceptosRetencion(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('tributario_concepto_retencion').select('*').eq('tenant_id', tenantId).order('codigo')
    if (error) throw error
    conceptosRetencion.value = data ?? []
  }

  async function crearConceptoRetencion(params: {
    tenantId: string; codigo: string; nombre: string; tarifa: number
    baseMinimaUvt?: number | null; cuentaContableId: string; tipoId: number
  }): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('tributario_concepto_retencion').insert({
        tenant_id: params.tenantId, codigo: params.codigo, nombre: params.nombre, tarifa: params.tarifa,
        base_minima_uvt: params.baseMinimaUvt ?? null, cuenta_contable_id: params.cuentaContableId,
        tipo_id: params.tipoId,
      })
      if (error) throw error
      await cargarConceptosRetencion(params.tenantId)
    } finally {
      guardando.value = false
    }
  }

  /** `tipoCodigo` (fuente/iva/ica): sin especificar, junta los tres tipos (retrocompatible con
   * el comportamiento anterior al gap ReteIVA/ReteICA). */
  async function cargarCertificado(
    tenantId: string, terceroId: string, desde: string, hasta: string, tipoCodigo?: string,
  ): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('tributario_certificado_retencion', {
        p_tenant_id: tenantId, p_tercero_id: terceroId, p_desde: desde, p_hasta: hasta,
        p_tipo_codigo: tipoCodigo,
      })
      if (error) throw error
      certificado.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarResumenRetenciones(
    tenantId: string, anio: number, mes: number, tipoCodigo?: string,
  ): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('tributario_resumen_retenciones_mensual', {
        p_tenant_id: tenantId, p_anio: anio, p_mes: mes, p_tipo_codigo: tipoCodigo,
      })
      if (error) throw error
      resumenRetenciones.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarResumenIca(tenantId: string, anio: number, periodoNumero: number): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('tributario_resumen_ica', { p_tenant_id: tenantId, p_anio: anio, p_periodo_numero: periodoNumero })
        .single()
      if (error) throw error
      resumenIca.value = data
    } finally {
      loading.value = false
    }
  }

  async function cargarResumenIva(tenantId: string, anio: number, periodoNumero: number): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('tributario_resumen_iva', { p_tenant_id: tenantId, p_anio: anio, p_periodo_numero: periodoNumero })
        .single()
      if (error) throw error
      resumenIva.value = data
    } finally {
      loading.value = false
    }
  }

  async function cargarExogena(tenantId: string, anio: number): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('tributario_base_exogena', { p_tenant_id: tenantId, p_anio: anio })
      if (error) throw error
      exogena.value = data
    } finally {
      loading.value = false
    }
  }

  function limpiar(): void {
    certificado.value = []
    resumenRetenciones.value = []
    resumenIva.value = null
    resumenIca.value = null
    exogena.value = null
  }

  return {
    cuentasClasificables, conceptosRetencion, certificado, resumenRetenciones,
    ingresosPorNaturaleza, resumenIva, resumenIca, exogena, loading, guardando,
    cargarCuentasClasificables, clasificarCuenta, cargarIngresosPorNaturaleza,
    cargarConceptosRetencion, crearConceptoRetencion, cargarCertificado, cargarResumenRetenciones,
    cargarResumenIva, cargarResumenIca, cargarExogena, limpiar,
  }
})
