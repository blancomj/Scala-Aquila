/**
 * Plan de cuentas contable por copropiedad (PC-1..PC-3) y su parametrización.
 *
 * Lectura/escritura directa por RLS (`contable_cuenta_*_auxiliar`), mismo criterio que
 * presupuesto.ts y agrupaciones.ts: no hay efecto colateral atómico que exija una Edge
 * Function. Las invariantes las imponen los guards en la base —jerarquía por prefijo del
 * código, coherencia de clase con la naturaleza presupuestal, cuenta de movimiento y activa en
 * todo vínculo— y sus errores llegan tal cual en `error.message`.
 *
 * El plan se carga ENTERO (≈145-158 cuentas por copropiedad) y el árbol se deriva aquí: el
 * código numérico ya codifica la jerarquía, así que `nivel` y los hijos salen de él sin
 * consultar `parent_id` recursivamente.
 *
 * Este store NO instancia el plan por su cuenta: eso lo hace `fn_instanciar_plan_contable`
 * (PC-2), idempotente, que se invoca desde aquí como RPC.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type ContableCuentaRow = Database['public']['Tables']['contable_cuenta']['Row']
type ContableCuentaDefaultRow = Database['public']['Tables']['contable_cuenta_default']['Row']
type ContablePlanCuentaRow = Database['public']['Tables']['contable_plan_cuenta']['Row']
type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']
type PresupuestoCuentaRow = Database['public']['Tables']['presupuesto_cuenta']['Row']
export type ParametrizacionPendiente =
  Database['public']['Functions']['contable_parametrizacion_pendiente']['Returns'][number]
export type MarcoContableTenant =
  Database['public']['Functions']['tenant_marco_contable']['Returns'][number]

/** Nodo con lo derivado ya resuelto, para no recalcularlo en cada componente. */
export interface ContableCuentaNodo extends ContableCuentaRow {
  readonly hijos: ContableCuentaNodo[]
  /** Cuántas cuentas presupuestales apuntan a esta — el "19 torres → 5405" hecho visible. */
  readonly usos: number
}

export const useContabilidadStore = defineStore('contabilidad', () => {
  const cuentas = shallowRef<ContableCuentaRow[]>([])
  const defaults = shallowRef<ContableCuentaDefaultRow[]>([])
  const eventos = shallowRef<ListaTipoRow[]>([])
  const cuentasPresupuestales = shallowRef<PresupuestoCuentaRow[]>([])
  const pendientes = shallowRef<ParametrizacionPendiente[]>([])
  const marcoContable = shallowRef<MarcoContableTenant | null>(null)
  /** Plantilla global (no por tenant): el vínculo a fundamento_normativo vive aquí, no en
   * contable_cuenta — se instancia una vez y responde "por qué existe esta cuenta" para
   * cualquier plan, sin repetirse por tenant (PC-9, cierre de "contabilidad explicable" §58). */
  const planCuentas = shallowRef<ContablePlanCuentaRow[]>([])
  const loading = ref(false)

  /** Árbol derivado del código: el padre de `110505` es `1105`, el de `1105` es `11`. No hace
   * falta recorrer parent_id — el prefijo ES la jerarquía (ver guard_contable_cuenta_arbol). */
  const arbol = computed<ContableCuentaNodo[]>(() => {
    const usosPorCuenta = new Map<string, number>()
    for (const pc of cuentasPresupuestales.value) {
      if (!pc.contable_cuenta_id) continue
      usosPorCuenta.set(pc.contable_cuenta_id, (usosPorCuenta.get(pc.contable_cuenta_id) ?? 0) + 1)
    }

    const nodos = new Map<string, ContableCuentaNodo>()
    const ordenadas = [...cuentas.value].sort((a, b) => a.codigo.localeCompare(b.codigo))
    for (const c of ordenadas) {
      nodos.set(c.codigo, { ...c, hijos: [], usos: usosPorCuenta.get(c.id) ?? 0 })
    }

    const raices: ContableCuentaNodo[] = []
    for (const c of ordenadas) {
      const nodo = nodos.get(c.codigo)!
      const largoPadre = { 2: 1, 4: 2, 6: 4, 8: 6 }[c.codigo.length]
      const padre = largoPadre ? nodos.get(c.codigo.slice(0, largoPadre)) : undefined
      if (padre) padre.hijos.push(nodo)
      else raices.push(nodo)
    }
    return raices
  })

  const tienePlan = computed(() => cuentas.value.length > 0)

  /** codigo -> fundamento_normativo_id, desde la plantilla. Cada cuenta instanciada comparte
   * código con su origen en contable_plan_cuenta (fn_instanciar_plan_contable lo copia
   * literalmente), así que no hace falta guardar el vínculo por tenant. */
  const fundamentoPorCodigo = computed(() => {
    const mapa = new Map<string, number>()
    for (const pc of planCuentas.value) {
      if (pc.fundamento_normativo_id !== null) {
        mapa.set(pc.codigo, pc.fundamento_normativo_id)
      }
    }
    return mapa
  })

  /** Cuentas que admiten imputación — las únicas elegibles en cualquier mapeo. */
  const cuentasDeMovimiento = computed(() =>
    [...cuentas.value]
      .filter((c) => c.permite_movimiento && c.activa)
      .sort((a, b) => a.codigo.localeCompare(b.codigo)),
  )

  /** Se carga una sola vez: es catálogo global, no cambia por tenant. */
  async function cargarPlantilla(): Promise<ContablePlanCuentaRow[]> {
    if (planCuentas.value.length > 0) return planCuentas.value
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.from('contable_plan_cuenta').select('*')
    if (error) throw error
    planCuentas.value = data ?? []
    return planCuentas.value
  }

  async function cargarPlan(tenantId: string): Promise<ContableCuentaRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('contable_cuenta')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('codigo')
      if (error) throw error
      cuentas.value = data ?? []
      return cuentas.value
    } finally {
      loading.value = false
    }
  }

  /** PC-2. Idempotente: repetirla no duplica, y llamarla con incluirOpcionales agrega solo las
   * que faltaban (clases 6 y 8, fondo de reserva). Por eso el mismo botón sirve para instalar
   * el plan y para activar las opcionales después. */
  async function instanciarPlan(
    tenantId: string,
    incluirOpcionales = false,
  ): Promise<{ creadas: number; existentes: number }> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('fn_instanciar_plan_contable', {
      p_tenant_id: tenantId,
      p_incluir_opcionales: incluirOpcionales,
    })
    if (error) throw error
    await cargarPlan(tenantId)
    return data?.[0] ?? { creadas: 0, existentes: 0 }
  }

  /** Retirar una cuenta es desactivarla, nunca borrarla: puede tener movimientos proyectados
   * que necesitan seguir resolviendo su código (mismo criterio que presupuesto_cuenta). Código y
   * padre no se editan aquí a propósito — cambiarlos reabre la jerarquía (guard_contable_cuenta_
   * arbol) y no hay UI de reparentado para este catálogo. */
  async function actualizarCuenta(
    tenantId: string,
    id: string,
    cambios: {
      activa?: boolean
      nombre?: string
      naturaleza?: Database['public']['Enums']['contable_naturaleza_t']
      requiereTercero?: boolean
      requiereCentroCosto?: boolean
      requiereFondo?: boolean
      requiereInmueble?: boolean
    },
  ): Promise<void> {
    const { requiereTercero, requiereCentroCosto, requiereFondo, requiereInmueble, ...resto } =
      cambios
    const patch: Database['public']['Tables']['contable_cuenta']['Update'] = {
      ...resto,
      ...(requiereTercero !== undefined && { requiere_tercero: requiereTercero }),
      ...(requiereCentroCosto !== undefined && { requiere_centro_costo: requiereCentroCosto }),
      ...(requiereFondo !== undefined && { requiere_fondo: requiereFondo }),
      ...(requiereInmueble !== undefined && { requiere_inmueble: requiereInmueble }),
    }
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('contable_cuenta').update(patch).eq('id', id)
    if (error) throw error
    await cargarPlan(tenantId)
  }

  /** Auxiliar propio bajo una cuenta existente. El código debe extender el del padre y saltar
   * al siguiente nivel: guard_contable_cuenta_arbol rechaza lo contrario con
   * CUENTA_CODIGO_INCOHERENTE o CUENTA_NIVEL_SALTADO. */
  async function crearCuenta(params: {
    tenantId: string
    parentId: string
    codigo: string
    nombre: string
    naturaleza: Database['public']['Enums']['contable_naturaleza_t']
    requiereTercero?: boolean
    requiereCentroCosto?: boolean
    requiereFondo?: boolean
    requiereInmueble?: boolean
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('contable_cuenta').insert({
      tenant_id: params.tenantId,
      parent_id: params.parentId,
      codigo: params.codigo,
      nombre: params.nombre,
      naturaleza: params.naturaleza,
      permite_movimiento: true,
      requiere_tercero: params.requiereTercero ?? false,
      requiere_centro_costo: params.requiereCentroCosto ?? false,
      requiere_fondo: params.requiereFondo ?? false,
      requiere_inmueble: params.requiereInmueble ?? false,
    })
    if (error) throw error
    await cargarPlan(params.tenantId)
  }

  // ── Mapeo (PC-3) ────────────────────────────────────────────────────────

  async function cargarCuentasPresupuestales(tenantId: string): Promise<PresupuestoCuentaRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('presupuesto_cuenta')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('naturaleza')
      .order('ruta')
    if (error) throw error
    cuentasPresupuestales.value = data ?? []
    return cuentasPresupuestales.value
  }

  /** El vínculo N:1 del que depende todo el bloque: varias cuentas presupuestales pueden
   * compartir cuenta contable (las 19 torres → 5405). guard_presupuesto_cuenta_contable exige
   * que la clase concuerde con la naturaleza (egreso → 5/6, ingreso → 4). */
  async function mapearCuentaPresupuestal(
    tenantId: string,
    cuentaPresupuestalId: string,
    contableCuentaId: string | null,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('presupuesto_cuenta')
      .update({ contable_cuenta_id: contableCuentaId })
      .eq('id', cuentaPresupuestalId)
    if (error) throw error
    await cargarCuentasPresupuestales(tenantId)
  }

  /** Catálogo global EVENTO_CONTABLE (PC-3): los hechos que necesitan una cuenta que no nace
   * del árbol presupuestal — cartera, bancos, proveedores, deterioro, cierre. */
  async function cargarEventos(tenantId: string): Promise<ListaTipoRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('lista_tipos')
      .select('*')
      .eq('tipo', 'EVENTO_CONTABLE')
      .eq('activo', true)
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order('orden')
    if (error) throw error
    eventos.value = data ?? []
    return eventos.value
  }

  async function cargarDefaults(tenantId: string): Promise<ContableCuentaDefaultRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('contable_cuenta_default')
      .select('*')
      .eq('tenant_id', tenantId)
    if (error) throw error
    defaults.value = data ?? []
    return defaults.value
  }

  async function guardarDefault(
    tenantId: string,
    eventoId: number,
    contableCuentaId: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('contable_cuenta_default').upsert(
      { tenant_id: tenantId, evento_id: eventoId, contable_cuenta_id: contableCuentaId },
      { onConflict: 'tenant_id,evento_id' },
    )
    if (error) throw error
    await cargarDefaults(tenantId)
  }

  /** CO-1: único lugar que traduce marco_grupo a los estados financieros exigidos. Se recarga
   * después de cualquier cambio de clasificación (ver useCopropiedadStore().actualizarTenant). */
  async function cargarMarcoContable(tenantId: string): Promise<MarcoContableTenant | null> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .rpc('tenant_marco_contable', { p_tenant_id: tenantId })
      .single()
    if (error) throw error
    marcoContable.value = data ?? null
    return marcoContable.value
  }

  /** Lo que impide exportar (PC-3/PC-5b). Debe quedar vacío antes de emitir información. */
  async function cargarPendientes(tenantId: string): Promise<ParametrizacionPendiente[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('contable_parametrizacion_pendiente', {
      p_tenant_id: tenantId,
    })
    if (error) throw error
    pendientes.value = data ?? []
    return pendientes.value
  }

  function limpiar(): void {
    cuentas.value = []
    defaults.value = []
    eventos.value = []
    cuentasPresupuestales.value = []
    pendientes.value = []
    marcoContable.value = null
  }

  return {
    cuentas,
    defaults,
    eventos,
    cuentasPresupuestales,
    pendientes,
    planCuentas,
    marcoContable,
    loading,
    arbol,
    tienePlan,
    cuentasDeMovimiento,
    fundamentoPorCodigo,
    cargarPlantilla,
    cargarPlan,
    instanciarPlan,
    actualizarCuenta,
    crearCuenta,
    cargarCuentasPresupuestales,
    mapearCuentaPresupuestal,
    cargarEventos,
    cargarDefaults,
    guardarDefault,
    cargarPendientes,
    cargarMarcoContable,
    limpiar,
  }
})
