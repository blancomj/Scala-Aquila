/**
 * MANT-1 · Configuración del esquema de atributos por tipo de activo y de
 * los criterios de criticidad (§3.4 — "aviso de cuántos activos se verán
 * afectados antes de guardar un cambio").
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type DefinicionRow = Database['public']['Tables']['mant_atributo_definicion']['Row']
type DefinicionInsert = Database['public']['Tables']['mant_atributo_definicion']['Insert']
type SetRow = Database['public']['Tables']['mant_criticidad_set']['Row']
type CriterioRow = Database['public']['Tables']['mant_criticidad_criterio']['Row']
type CriterioInsert = Database['public']['Tables']['mant_criticidad_criterio']['Insert']
type BandaRow = Database['public']['Tables']['mant_criticidad_banda']['Row']
type BandaInsert = Database['public']['Tables']['mant_criticidad_banda']['Insert']
type Huerfano = Database['public']['Functions']['mant_atributos_huerfanos']['Returns'][number]
type RequisitoRow = Database['public']['Tables']['mant_requisito']['Row']
type RequisitoInsert = Database['public']['Tables']['mant_requisito']['Insert']

export const useMantenimientoConfiguracionStore = defineStore('mantenimientoConfiguracion', () => {
  const definiciones = shallowRef<DefinicionRow[]>([])
  const huerfanos = shallowRef<Huerfano[]>([])
  const sets = shallowRef<SetRow[]>([])
  const criterios = shallowRef<CriterioRow[]>([])
  const bandas = shallowRef<BandaRow[]>([])
  const requisitos = shallowRef<RequisitoRow[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarDefiniciones(tenantId: string, tipoActivoId: number): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_atributo_definicion')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('tipo_activo_id', tipoActivoId)
        .order('orden')
      if (error) throw error
      definiciones.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  /** §3.4: cuántos activos de este tipo tienen ya algo cargado bajo esta clave — se muestra
   * ANTES de guardar un cambio que afecte una definición existente. */
  async function contarActivosConAtributo(
    tenantId: string, tipoActivoId: number, codigo: string,
  ): Promise<number> {
    const cliente = useSupabaseClient<Database>()
    const { count, error } = await cliente
      .from('activos')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('tipo_id', tipoActivoId)
      .not(`atributos->${codigo}`, 'is', null)
    if (error) throw error
    return count ?? 0
  }

  async function guardarDefinicion(fila: DefinicionInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = fila.id
        ? await cliente.from('mant_atributo_definicion').update(fila).eq('id', fila.id)
        : await cliente.from('mant_atributo_definicion').insert(fila)
      if (error) throw error
      await cargarDefiniciones(fila.tenant_id, fila.tipo_activo_id)
    } finally {
      guardando.value = false
    }
  }

  async function eliminarDefinicion(tenantId: string, tipoActivoId: number, id: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_atributo_definicion').delete().eq('id', id)
      if (error) throw error
      await cargarDefiniciones(tenantId, tipoActivoId)
    } finally {
      guardando.value = false
    }
  }

  async function cargarHuerfanos(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('mant_atributos_huerfanos', { p_tenant_id: tenantId })
    if (error) throw error
    huerfanos.value = data ?? []
  }

  // ── Criticidad ───────────────────────────────────────────────────────
  async function cargarSets(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_criticidad_set').select('*').eq('tenant_id', tenantId).order('version', { ascending: false })
      if (error) throw error
      sets.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarHijosDeSet(setId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const [{ data: crit, error: errCrit }, { data: band, error: errBand }] = await Promise.all([
      cliente.from('mant_criticidad_criterio').select('*').eq('set_id', setId).order('codigo'),
      cliente.from('mant_criticidad_banda').select('*').eq('set_id', setId).order('orden'),
    ])
    if (errCrit) throw errCrit
    if (errBand) throw errBand
    criterios.value = crit ?? []
    bandas.value = band ?? []
  }

  async function crearSet(tenantId: string, version: number): Promise<SetRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_criticidad_set').insert({ tenant_id: tenantId, version }).select('*').single()
      if (error) throw error
      await cargarSets(tenantId)
      return data
    } finally {
      guardando.value = false
    }
  }

  /** §3.3: retirar la vigente actual a 'historica' es un paso aparte y obligatorio antes de
   * poder activar una nueva — el guard (20260930710000) solo permite ese único cambio sobre una
   * fila vigente. */
  async function retirarSet(tenantId: string, setId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('mant_criticidad_set').update({ estado: 'historica' }).eq('id', setId)
      if (error) throw error
      await cargarSets(tenantId)
    } finally {
      guardando.value = false
    }
  }

  async function activarSet(tenantId: string, setId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('mant_criticidad_set').update({ estado: 'vigente' }).eq('id', setId)
      if (error) throw error
      await cargarSets(tenantId)
    } finally {
      guardando.value = false
    }
  }

  async function guardarCriterio(fila: CriterioInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = fila.id
        ? await cliente.from('mant_criticidad_criterio').update(fila).eq('id', fila.id)
        : await cliente.from('mant_criticidad_criterio').insert(fila)
      if (error) throw error
      await cargarHijosDeSet(fila.set_id)
    } finally {
      guardando.value = false
    }
  }

  async function eliminarCriterio(setId: string, id: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_criticidad_criterio').delete().eq('id', id)
      if (error) throw error
      await cargarHijosDeSet(setId)
    } finally {
      guardando.value = false
    }
  }

  async function guardarBanda(fila: BandaInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = fila.id
        ? await cliente.from('mant_criticidad_banda').update(fila).eq('id', fila.id)
        : await cliente.from('mant_criticidad_banda').insert(fila)
      if (error) throw error
      await cargarHijosDeSet(fila.set_id)
    } finally {
      guardando.value = false
    }
  }

  async function eliminarBanda(setId: string, id: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_criticidad_banda').delete().eq('id', id)
      if (error) throw error
      await cargarHijosDeSet(setId)
    } finally {
      guardando.value = false
    }
  }

  // ── MANT-2: requisitos de cumplimiento normativo ─────────────────────
  // Las filas con tenant_id null (semilla global) nunca llegan aquí — RLS de mant_requisito
  // solo expone al cliente autenticado sus propias filas (tenant_id = su tenant).
  async function cargarRequisitos(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_requisito').select('*').eq('tenant_id', tenantId).eq('activo', true).order('nombre')
      if (error) throw error
      requisitos.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function guardarRequisito(fila: RequisitoInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = fila.id
        ? await cliente.from('mant_requisito').update(fila).eq('id', fila.id)
        : await cliente.from('mant_requisito').insert(fila)
      if (error) throw error
      await cargarRequisitos(fila.tenant_id as string)
    } finally {
      guardando.value = false
    }
  }

  /** "Quitar de mi copropiedad" — activo = false, nunca DELETE físico: un cumplimiento ya
   * registrado sigue apuntando a este id (§ guard_mant_cumplimiento). */
  async function quitarRequisito(tenantId: string, id: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_requisito').update({ activo: false }).eq('id', id)
      if (error) throw error
      await cargarRequisitos(tenantId)
    } finally {
      guardando.value = false
    }
  }

  return {
    definiciones, huerfanos, sets, criterios, bandas, requisitos, loading, guardando,
    cargarDefiniciones, contarActivosConAtributo, guardarDefinicion, eliminarDefinicion, cargarHuerfanos,
    cargarSets, cargarHijosDeSet, crearSet, retirarSet, activarSet,
    guardarCriterio, eliminarCriterio, guardarBanda, eliminarBanda,
    cargarRequisitos, guardarRequisito, quitarRequisito,
  }
})
