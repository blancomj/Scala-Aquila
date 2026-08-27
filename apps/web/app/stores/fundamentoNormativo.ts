/**
 * Fundamentos normativos — trazabilidad jurídica reutilizable, asociable a
 * fuente_financiacion / presupuesto_rubros (GAP-19, E-16 §7).
 *
 * SELECT/INSERT van directo por RLS (sin Edge Function): no hay guard
 * trigger ni resolución de tenant_id que justifique una capa intermedia.
 * SELECT devuelve tanto lo de plataforma (tenant_id null) como lo propio
 * del tenant — RLS ya hace esa unión.
 *
 * D-29: platform admin escribe globales; tenant solo ve + propone.
 * D-30: propuestas de cambio vía fundamento_propuesta (separadas del catálogo).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
type FundamentoRow = Database['public']['Tables']['fundamento_normativo']['Row']
type FundamentoTipo = Database['public']['Enums']['fundamento_tipo_t']

// Extiende con campos de la migración 20260902100000 hasta regenerar db-types
type FundamentoRowExtendido = FundamentoRow & {
  estado?: string
  fuente_url?: string | null
  validado_por?: string | null
  fecha_validacion?: string | null
}

type FundamentoConTenant = FundamentoRowExtendido & { _es_plataforma: boolean }

// Tipos temporales hasta que db-types se regenere tras la migración
type PropuestaRow = Record<string, unknown> & {
  id: number
  norma: string
  articulo: string | null
  estado: string
  creado_at: string
}

export const useFundamentoNormativoStore = defineStore('fundamentoNormativo', () => {
  const fundamentos = shallowRef<FundamentoConTenant[]>([])
  const propuestas = shallowRef<PropuestaRow[]>([])
  const loading = ref(false)
  const busqueda = ref('')
  const filtroTipo = ref<FundamentoTipo | ''>('')
  const filtroEstado = ref<string>('')

  const fundamentosPlataforma = computed(() =>
    fundamentos.value.filter((f) => f._es_plataforma),
  )

  const fundamentosTenant = computed(() =>
    fundamentos.value.filter((f) => !f._es_plataforma),
  )

  const fundamentosFiltrados = computed(() => {
    let resultado = fundamentos.value
    if (busqueda.value) {
      const termino = busqueda.value.toLowerCase()
      resultado = resultado.filter(
        (f) =>
          f.norma.toLowerCase().includes(termino) ||
          (f.articulo && f.articulo.toLowerCase().includes(termino)) ||
          (f.descripcion && f.descripcion.toLowerCase().includes(termino)) ||
          (f.referencia && f.referencia.toLowerCase().includes(termino)),
      )
    }
    if (filtroTipo.value) {
      resultado = resultado.filter((f) => f.tipo === filtroTipo.value)
    }
    if (filtroEstado.value) {
      resultado = resultado.filter((f) => f.estado === filtroEstado.value)
    }
    return resultado
  })

  const plataformaFiltrados = computed(() =>
    fundamentosFiltrados.value.filter((f) => f._es_plataforma),
  )

  const tenantFiltrados = computed(() =>
    fundamentosFiltrados.value.filter((f) => !f._es_plataforma),
  )

  async function cargarFundamentos(): Promise<FundamentoConTenant[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: err } = await cliente
        .from('fundamento_normativo')
        .select('*')
        .order('created_at', { ascending: false })
      if (err) throw err
      fundamentos.value = (data ?? []).map((f) => ({
        ...f,
        _es_plataforma: f.tenant_id === null,
      }))
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
    fuenteUrl?: string
  }): Promise<FundamentoRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: err } = await cliente
      .from('fundamento_normativo')
      .insert({
        tenant_id: params.tenantId,
        tipo: params.tipo,
        norma: params.norma,
        articulo: params.articulo,
        descripcion: params.descripcion,
        fecha_vigencia: params.fechaVigencia,
        referencia: params.referencia,
        fuente_url: params.fuenteUrl,
      })
      .select('*')
      .single()
    if (err) throw err
    await cargarFundamentos()
    return data
  }

  async function actualizarFundamento(
    id: number,
    params: {
      tipo: FundamentoTipo
      norma: string
      articulo?: string
      descripcion?: string
      referencia?: string
      fuenteUrl?: string
    },
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: err } = await cliente
      .from('fundamento_normativo')
      .update({
        tipo: params.tipo,
        norma: params.norma,
        articulo: params.articulo,
        descripcion: params.descripcion,
        referencia: params.referencia,
        fuente_url: params.fuenteUrl,
      })
      .eq('id', id)
    if (err) throw err
    await cargarFundamentos()
  }

  async function crearPropuesta(params: {
    fundamentoOriginalId: number
    tenantId: string
    tipo: FundamentoTipo
    norma: string
    articulo?: string
    descripcion?: string
    referencia?: string
    fuenteUrl?: string
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    // Se usa cast temporal hasta que db-types se regenere tras la migración
    const { error: err } = await cliente.from('fundamento_propuesta' as never).insert({
      fundamento_original_id: params.fundamentoOriginalId,
      tenant_id: params.tenantId,
      tipo: params.tipo,
      norma: params.norma,
      articulo: params.articulo,
      descripcion: params.descripcion,
      referencia: params.referencia,
      fuente_url: params.fuenteUrl,
      estado: 'pendiente',
    } as never)
    if (err) throw err
  }

  async function cargarPropuestas(): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: err } = await cliente
      .from('fundamento_propuesta' as never)
      .select('*')
      .order('creado_at', { ascending: false })
    if (err) throw err
    propuestas.value = (data ?? []) as PropuestaRow[]
  }

  async function aprobarPropuesta(propuestaId: number): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data: propuesta, error: err1 } = await cliente
      .from('fundamento_propuesta' as never)
      .select('*')
      .eq('id', propuestaId as never)
      .single()
    if (err1) throw err1
    if (!propuesta) throw new Error('Propuesta no encontrada')

    const { error: err2 } = await cliente.from('fundamento_normativo').insert({
      tenant_id: null,
      tipo: (propuesta as Record<string, unknown>).tipo as FundamentoTipo,
      norma: (propuesta as Record<string, unknown>).norma as string,
      articulo: (propuesta as Record<string, unknown>).articulo as string | undefined,
      descripcion: (propuesta as Record<string, unknown>).descripcion as string | undefined,
      referencia: (propuesta as Record<string, unknown>).referencia as string | undefined,
      fuente_url: (propuesta as Record<string, unknown>).fuente_url as string | undefined,
      estado: 'activo' as never,
    })
    if (err2) throw err2

    const { error: err3 } = await cliente
      .from('fundamento_propuesta' as never)
      .update({ estado: 'aprobada', revisado_at: new Date().toISOString() } as never)
      .eq('id', propuestaId as never)
    if (err3) throw err3

    await Promise.all([cargarFundamentos(), cargarPropuestas()])
  }

  async function rechazarPropuesta(propuestaId: number, motivo: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: err } = await cliente
      .from('fundamento_propuesta' as never)
      .update({
        estado: 'rechazada',
        rechazado_motivo: motivo,
        revisado_at: new Date().toISOString(),
      } as never)
      .eq('id', propuestaId as never)
    if (err) throw err
    await cargarPropuestas()
  }

  function limpiar(): void {
    fundamentos.value = []
    propuestas.value = []
  }

  return {
    fundamentos,
    propuestas,
    loading,
    busqueda,
    filtroTipo,
    filtroEstado,
    fundamentosPlataforma,
    fundamentosTenant,
    fundamentosFiltrados,
    plataformaFiltrados,
    tenantFiltrados,
    cargarFundamentos,
    crearFundamento,
    actualizarFundamento,
    crearPropuesta,
    cargarPropuestas,
    aprobarPropuesta,
    rechazarPropuesta,
    limpiar,
  }
})
