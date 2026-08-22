/**
 * Presupuestos, rubros, fuentes de financiación y previsualización —
 * GAP-19 (Docs/Motor presupuestal/AQUILA_SAAS_E16_...md §5 fase 5, §9, §14).
 *
 * `presupuestos`/`presupuesto_rubros`/`presupuesto_cuenta`/`fuente_financiacion`
 * se leen directo por RLS (mismo criterio que members.ts). Escritura:
 *  - crear presupuesto/rubro/cuenta y activar (borrador→vigente): RLS
 *    directa (`presupuestos_insert_agent`/`_update_agent`,
 *    `presupuesto_rubros_insert_agent`, `presupuesto_cuenta_insert_agent`)
 *    — los guard triggers de árbol/hoja (E8) validan en BD, el error llega
 *    tal cual sin traducir, mismo criterio que BUDGET_NOT_RECONCILED abajo.
 *  - registrar fuente_financiacion y previsualizar: Edge Functions
 *    (`presupuesto-financiacion`, `presupuesto-previsualizar`) porque
 *    ninguna de las dos es una simple lectura/escritura RLS: la primera
 *    tiene un guard trigger y resuelve tenant_id server-side; la segunda
 *    ejecuta allocate() del kernel financiero, no algo que el cliente
 *    pueda hacer solo.
 *
 * activarPresupuesto no valida Σrubros = monto_total del lado del cliente
 * más allá de una advertencia visual — guard_presupuesto_reconciliado ya
 * lo exige en BD (BUDGET_NOT_RECONCILED) y ese error llega tal cual, sin
 * traducir (mismo criterio que activarPolitica en politicaFinanciera.ts).
 *
 * activarPresupuesto retira primero el presupuesto vigente del MISMO año (si
 * existe) a 'cerrado' y luego promueve el nuevo — dos UPDATE secuenciales,
 * nunca hay dos filas vigentes a la vez (presupuestos_vigente_unico es por
 * (tenant_id, anio); un presupuesto vigente de otro año no se toca).
 * `guard_presupuesto_inmutable` (redefinido en 20260830230000) admite esa
 * única transición vigente->cerrado sobre una fila vigente; todo lo demás
 * sigue bloqueado igual que antes.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type PresupuestoRow = Database['public']['Tables']['presupuestos']['Row']
type PresupuestoRubroRow = Database['public']['Tables']['presupuesto_rubros']['Row']
type PresupuestoCuentaRow = Database['public']['Tables']['presupuesto_cuenta']['Row']
type PresupuestoCuentaNaturaleza = Database['public']['Enums']['presupuesto_cuenta_naturaleza_t']
type PresupuestoCuentaTotal =
  Database['public']['Functions']['presupuesto_cuenta_totales']['Returns'][number]
type PresupuestoCuentaEjecucion =
  Database['public']['Functions']['presupuesto_cuenta_ejecucion']['Returns'][number]
type PresupuestoEjecucionRow = Database['public']['Tables']['presupuesto_ejecucion']['Row']
type FuenteFinanciacionRow = Database['public']['Tables']['fuente_financiacion']['Row']
type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']

interface PrevisualizacionDistribucion {
  presupuesto_id: string
  anio: number
  version: number
  estado: string
  moneda: string
  monto_total: number
  otros_ingresos_aplicados: number
  necesidad_financiera: string
  distribucion: {
    inmueble_id: string
    codigo: string
    coeficiente: string | null
    valor_exacto: string
    valor_asignado: string
  }[]
}

export const usePresupuestoStore = defineStore('presupuesto', () => {
  const presupuestos = shallowRef<PresupuestoRow[]>([])
  const rubros = shallowRef<PresupuestoRubroRow[]>([])
  const cuentas = shallowRef<PresupuestoCuentaRow[]>([])
  const totalesCuenta = shallowRef<PresupuestoCuentaTotal[]>([])
  const comparativoCuenta = shallowRef<PresupuestoCuentaEjecucion[]>([])
  const ejecuciones = shallowRef<PresupuestoEjecucionRow[]>([])
  const fuentes = shallowRef<FuenteFinanciacionRow[]>([])
  const tiposFuente = shallowRef<ListaTipoRow[]>([])
  const fondoImprevistos = ref<number | null>(null)
  const loading = ref(false)

  /** Catálogo TIPO_FUENTE_FINANCIACION (20260830210000, ex-enum) — ampliable por tenant
   * sin migración, mismo patrón que cargarTiposNovedad (cuentaCorriente.ts). */
  async function cargarTiposFuente(tenantId: string): Promise<ListaTipoRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorTipos } = await cliente
      .from('lista_tipos')
      .select('*')
      .eq('tipo', 'TIPO_FUENTE_FINANCIACION')
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order('orden')
    if (errorTipos) throw errorTipos
    tiposFuente.value = data ?? []
    return tiposFuente.value
  }

  async function cargarPresupuestos(tenantId: string): Promise<PresupuestoRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorPresupuestos } = await cliente
        .from('presupuestos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('anio', { ascending: false })
      if (errorPresupuestos) throw errorPresupuestos
      presupuestos.value = data ?? []
      return presupuestos.value
    } finally {
      loading.value = false
    }
  }

  async function crearPresupuesto(params: {
    tenantId: string
    anio: number
    montoTotal: number
  }): Promise<PresupuestoRow> {
    const ultimaVersion = presupuestos.value
      .filter((p) => p.tenant_id === params.tenantId && p.anio === params.anio)
      .reduce((max, p) => Math.max(max, p.version), 0)

    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('presupuestos')
      .insert({
        tenant_id: params.tenantId,
        anio: params.anio,
        version: ultimaVersion + 1,
        estado: 'borrador',
        monto_total: params.montoTotal,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarPresupuestos(params.tenantId)
    return data
  }

  /** Retira primero el presupuesto vigente del MISMO año (si existe) a 'cerrado' y
   * luego promueve el nuevo — dos UPDATE secuenciales, nunca hay dos filas vigentes
   * a la vez (presupuestos_vigente_unico es por (tenant_id, anio); un año distinto no
   * se toca). 20260830230000 redefinió el guard para admitir esa transición puntual. */
  async function activarPresupuesto(id: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const nuevo = presupuestos.value.find((p) => p.id === id)
    const vigenteActual = presupuestos.value.find(
      (p) => p.tenant_id === tenantId && p.estado === 'vigente' && p.anio === nuevo?.anio && p.id !== id,
    )

    if (vigenteActual) {
      const { error: errorRetiro } = await cliente
        .from('presupuestos')
        .update({ estado: 'cerrado', vigente_hasta: nuevo?.vigente_desde ?? vigenteActual.vigente_desde })
        .eq('id', vigenteActual.id)
      if (errorRetiro) throw errorRetiro
    }

    const { error: errorUpdate } = await cliente
      .from('presupuestos')
      .update({ estado: 'vigente' })
      .eq('id', id)
    if (errorUpdate) throw errorUpdate

    await cargarPresupuestos(tenantId)
  }

  /** Árbol de cuentas presupuestales del tenant (E8) — ordenado por `ruta`
   * (path materializado, zero-padded), que ordena en el mismo orden que
   * el árbol real sin necesitar una consulta recursiva en el cliente. */
  async function cargarCuentas(tenantId: string): Promise<PresupuestoCuentaRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorCuentas } = await cliente
      .from('presupuesto_cuenta')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('ruta')
    if (errorCuentas) throw errorCuentas
    cuentas.value = data ?? []
    return cuentas.value
  }

  async function crearCuenta(params: {
    tenantId: string
    naturaleza: PresupuestoCuentaNaturaleza
    codigo: string
    nombre: string
    parentId?: string
    orden?: number
  }): Promise<PresupuestoCuentaRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('presupuesto_cuenta')
      .insert({
        tenant_id: params.tenantId,
        naturaleza: params.naturaleza,
        codigo: params.codigo,
        nombre: params.nombre,
        parent_id: params.parentId ?? null,
        orden: params.orden ?? 0,
        // nivel/ruta: placeholders — guard_presupuesto_cuenta_arbol (trigger BEFORE INSERT) los
        // recalcula siempre, ignorando lo que llega aquí. Solo existen para satisfacer el tipo
        // Insert generado (columnas NOT NULL sin default en la definición de la tabla).
        nivel: 0,
        ruta: '',
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarCuentas(params.tenantId)
    return data
  }

  /** Edición de una cuenta existente (E8): nombre/codigo/orden/activa, y ahora también
   * parentId (reparentar). La naturaleza sigue sin poder cambiar desde aquí — solo se puede
   * mover un nodo entre padres de su MISMA naturaleza (guard_presupuesto_cuenta_arbol lo
   * exige). Reparentar es seguro desde 20260823210000: el guard rechaza de antemano cualquier
   * movida que dejaría un descendiente más allá del nivel 4 (CUENTA_PROFUNDIDAD_EXCEDIDA), y
   * el trigger propagar_presupuesto_cuenta_ruta recalcula en cascada el nivel/ruta de todos
   * los descendientes tras el movimiento — no hay que hacerlo desde el cliente.
   *
   * parentId: undefined = no tocar; null = mover a cuenta raíz; string = nuevo padre. */
  async function actualizarCuenta(params: {
    id: string
    tenantId: string
    codigo?: string
    nombre?: string
    orden?: number
    activa?: boolean
    parentId?: string | null
  }): Promise<PresupuestoCuentaRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorUpdate } = await cliente
      .from('presupuesto_cuenta')
      .update({
        codigo: params.codigo,
        nombre: params.nombre,
        orden: params.orden,
        activa: params.activa,
        parent_id: params.parentId,
      })
      .eq('id', params.id)
      .select('*')
      .single()
    if (errorUpdate) throw errorUpdate

    await cargarCuentas(params.tenantId)
    return data
  }

  /** Rollup de presupuesto_rubros.monto_anual por cuenta (E8) — se
   * recalcula siempre en BD (presupuesto_cuenta_totales), nunca en el
   * cliente, para no duplicar la lógica del árbol. */
  async function cargarTotalesCuenta(presupuestoId: string): Promise<PresupuestoCuentaTotal[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorTotales } = await cliente.rpc('presupuesto_cuenta_totales', {
      p_presupuesto_id: presupuestoId,
    })
    if (errorTotales) throw errorTotales
    totalesCuenta.value = data ?? []
    return totalesCuenta.value
  }

  /** Rollup de presupuestado vs. ejecutado por cuenta (E9) — mismo criterio que
   * cargarTotalesCuenta: se recalcula siempre en BD (presupuesto_cuenta_ejecucion), nunca en
   * el cliente. */
  async function cargarComparativoCuenta(
    presupuestoId: string,
  ): Promise<PresupuestoCuentaEjecucion[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorComparativo } = await cliente.rpc('presupuesto_cuenta_ejecucion', {
      p_presupuesto_id: presupuestoId,
    })
    if (errorComparativo) throw errorComparativo
    comparativoCuenta.value = data ?? []
    return comparativoCuenta.value
  }

  /** Historial de movimientos de ejecución del tenant (E9) — volumen bajo, se carga completo
   * (mismo criterio que cargarFuentesFinanciacion). */
  async function cargarEjecuciones(tenantId: string): Promise<PresupuestoEjecucionRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorEjecuciones } = await cliente
      .from('presupuesto_ejecucion')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    if (errorEjecuciones) throw errorEjecuciones
    ejecuciones.value = data ?? []
    return ejecuciones.value
  }

  /** Registra un movimiento real (E9) contra una cuenta hoja — guard_presupuesto_ejecucion_cuenta
   * valida en BD que la cuenta sea hoja del propio tenant, el periodo también, y que la cuenta
   * no tenga concepto_id vinculado (esas reciben su ejecutado automático, CUENTA_CONCEPTO_
   * AUTOMATICO); el error llega tal cual, sin traducir (mismo criterio que el resto del store).
   * Append-only: no hay actualizarEjecucion ni eliminarEjecucion (16 §68) — una corrección es un
   * monto negativo con ajustaMovimientoId (ver revertirEjecucion). */
  async function registrarEjecucion(params: {
    tenantId: string
    cuentaId: string
    periodoId: string
    monto: number
    descripcion?: string
    referencia?: string
    ajustaMovimientoId?: string
  }): Promise<PresupuestoEjecucionRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('presupuesto_ejecucion')
      .insert({
        tenant_id: params.tenantId,
        cuenta_id: params.cuentaId,
        periodo_id: params.periodoId,
        monto: params.monto,
        descripcion: params.descripcion,
        referencia: params.referencia,
        ajusta_movimiento_id: params.ajustaMovimientoId,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarEjecuciones(params.tenantId)
    return data
  }

  /** Corrige un movimiento mal registrado (E9 seguimiento, 20260823300000): inserta la fila de
   * reversión (monto negativo, misma cuenta/periodo) en vez de editar/borrar el original —
   * guard_presupuesto_ejecucion_cuenta exige que sea contra la MISMA cuenta. */
  async function revertirEjecucion(params: {
    tenantId: string
    movimiento: PresupuestoEjecucionRow
    descripcion?: string
  }): Promise<PresupuestoEjecucionRow> {
    return registrarEjecucion({
      tenantId: params.tenantId,
      cuentaId: params.movimiento.cuenta_id,
      periodoId: params.movimiento.periodo_id,
      monto: -Number(params.movimiento.monto),
      descripcion: params.descripcion ?? `Reversión de "${params.movimiento.descripcion ?? params.movimiento.id}"`,
      ajustaMovimientoId: params.movimiento.id,
    })
  }

  /** Saldo del fondo de imprevistos — un solo consumidor (pestaña "Control
   * y Validaciones", check FI-003), no justifica un store `fondos.ts`
   * propio (mismo criterio que cuentas/cargarCuentas). */
  async function cargarFondoImprevistos(tenantId: string): Promise<number | null> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFondo } = await cliente
      .from('fondos')
      .select('saldo_actual')
      .eq('tenant_id', tenantId)
      .eq('tipo', 'imprevistos')
      .maybeSingle()
    if (errorFondo) throw errorFondo
    fondoImprevistos.value = data ? Number(data.saldo_actual) : null
    return fondoImprevistos.value
  }

  async function cargarRubros(presupuestoId: string): Promise<PresupuestoRubroRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorRubros } = await cliente
      .from('presupuesto_rubros')
      .select('*')
      .eq('presupuesto_id', presupuestoId)
      .order('created_at', { ascending: true })
    if (errorRubros) throw errorRubros
    rubros.value = data ?? []
    return rubros.value
  }

  async function crearRubro(params: {
    presupuestoId: string
    tenantId: string
    codigo: string
    nombre: string
    cuentaId: string
    montoAnual: number
    fundamentoNormativoId?: number
  }): Promise<PresupuestoRubroRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('presupuesto_rubros')
      .insert({
        tenant_id: params.tenantId,
        presupuesto_id: params.presupuestoId,
        codigo: params.codigo,
        nombre: params.nombre,
        cuenta_id: params.cuentaId,
        monto_anual: params.montoAnual,
        fundamento_normativo_id: params.fundamentoNormativoId,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarRubros(params.presupuestoId)
    return data
  }

  /** Edición de un rubro existente — mismo criterio que actualizarCuenta: la UI solo la ofrece
   * mientras el presupuesto está en borrador (igual gating que crearRubro), así que no hace
   * falta un guard de inmutabilidad aquí — a diferencia de fuente_financiacion, ningún trigger
   * bloquea hoy el UPDATE de presupuesto_rubros por estado del presupuesto padre. */
  async function actualizarRubro(params: {
    id: string
    presupuestoId: string
    codigo?: string
    nombre?: string
    cuentaId?: string
    montoAnual?: number
    fundamentoNormativoId?: number | null
  }): Promise<PresupuestoRubroRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorUpdate } = await cliente
      .from('presupuesto_rubros')
      .update({
        codigo: params.codigo,
        nombre: params.nombre,
        cuenta_id: params.cuentaId,
        monto_anual: params.montoAnual,
        fundamento_normativo_id: params.fundamentoNormativoId,
      })
      .eq('id', params.id)
      .select('*')
      .single()
    if (errorUpdate) throw errorUpdate

    await cargarRubros(params.presupuestoId)
    return data
  }

  async function cargarFuentesFinanciacion(
    presupuestoId: string,
  ): Promise<FuenteFinanciacionRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorFuentes } = await cliente
        .from('fuente_financiacion')
        .select('*')
        .eq('presupuesto_id', presupuestoId)
        .order('created_at', { ascending: false })
      if (errorFuentes) throw errorFuentes
      fuentes.value = data ?? []
      return fuentes.value
    } finally {
      loading.value = false
    }
  }

  async function registrarFuenteFinanciacion(params: {
    presupuestoId: string
    tipoId: number
    valorDisponible: number
    valorAplicado: number
    descripcion?: string
    fundamentoNormativoId?: number
  }): Promise<FuenteFinanciacionRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<FuenteFinanciacionRow>(
      'presupuesto-financiacion',
      {
        body: {
          presupuesto_id: params.presupuestoId,
          tipo_id: params.tipoId,
          valor_disponible: params.valorDisponible,
          valor_aplicado: params.valorAplicado,
          descripcion: params.descripcion,
          fundamento_normativo_id: params.fundamentoNormativoId,
        },
      },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('presupuesto-financiacion no devolvió datos.')

    await cargarFuentesFinanciacion(params.presupuestoId)
    return data
  }

  async function previsualizarDistribucion(
    presupuestoId: string,
  ): Promise<PrevisualizacionDistribucion> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } =
      await cliente.functions.invoke<PrevisualizacionDistribucion>('presupuesto-previsualizar', {
        body: { presupuesto_id: presupuestoId },
      })
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('presupuesto-previsualizar no devolvió datos.')
    return data
  }

  function limpiar(): void {
    presupuestos.value = []
    rubros.value = []
    cuentas.value = []
    totalesCuenta.value = []
    comparativoCuenta.value = []
    ejecuciones.value = []
    fuentes.value = []
    tiposFuente.value = []
    fondoImprevistos.value = null
  }

  return {
    presupuestos,
    rubros,
    cuentas,
    totalesCuenta,
    comparativoCuenta,
    ejecuciones,
    fuentes,
    tiposFuente,
    fondoImprevistos,
    loading,
    cargarPresupuestos,
    crearPresupuesto,
    activarPresupuesto,
    cargarCuentas,
    crearCuenta,
    actualizarCuenta,
    cargarTotalesCuenta,
    cargarComparativoCuenta,
    cargarEjecuciones,
    registrarEjecucion,
    revertirEjecucion,
    cargarFondoImprevistos,
    cargarRubros,
    crearRubro,
    actualizarRubro,
    cargarFuentesFinanciacion,
    cargarTiposFuente,
    registrarFuenteFinanciacion,
    previsualizarDistribucion,
    limpiar,
  }
})
