/**
 * Cuenta corriente — pagos, saldo por inmueble y novedades (motor E1-E8).
 * Lectura directa por RLS de `inmuebles`/`v_cargo_saldo`/`pagos`/`novedades`
 * (agent+auditor); casi toda la escritura va por Edge Function porque
 * `cargos`/`pagos`/`pago_aplicaciones` no tienen política de
 * INSERT/UPDATE para `authenticated` — mismo criterio que
 * `liquidacion.ts`/`presupuesto.ts`. `crear-novedad` se invoca por la
 * Edge Function y no por `.insert()` directo (aunque RLS lo permitiría)
 * porque solo la función valida el signo del monto según el tipo (AD-30)
 * y `ADJUSTMENT_ZERO_AMOUNT`. `generarEstadoCuenta` es la excepción: sí
 * escribe directo por RLS (agent) — `estados_cuenta_generados` no
 * necesita ninguna validación que no pueda expresar un CHECK/policy.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type InmuebleRow = Database['public']['Tables']['inmuebles']['Row']
type CargoSaldoRow = Database['public']['Views']['v_cargo_saldo']['Row']
type PagoRow = Database['public']['Tables']['pagos']['Row']
type NovedadRow = Database['public']['Tables']['novedades']['Row']
type NovedadTipo = Database['public']['Enums']['novedad_tipo_t']
type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']
type NovedadCuotaRow = Database['public']['Tables']['novedad_cuotas']['Row']
type NovedadTipoCuentaRow = Database['public']['Tables']['novedad_tipo_cuenta']['Row']
type JsonColumnaEstadoCuenta = Database['public']['Tables']['estados_cuenta_generados']['Row']['datos']

interface ResultadoPago {
  pago_id: string
  aplicado: string
  no_aplicado: string
  aplicaciones: { cargo_id: string; monto: string }[]
}

interface ResultadoInteres {
  inmueble_id: string
  monto_generado: string
  tope_aplicado: boolean
}

const CATEGORIA_ESTADO_CUENTA_LABEL: Record<string, string> = {
  capital: 'Capital',
  interes: 'Interés',
  otro: 'Otro',
}

export interface MovimientoEstadoCuenta {
  fecha: string
  descripcion: string
  cargo: number | null
  abono: number | null
  saldo: number
}

/** Forma de estados_cuenta_generados.datos — misma estructura que devuelve
 * la Edge Function ver-estado-cuenta (PLAN_DATOS_REALES.md §3.3).
 *
 * propietario_* y los campos opcionales posteriores solo los producen los
 * snapshots generados desde la app (store); fn_emitir_estados_cuenta (L5)
 * aún produce la forma base — el visor público trata su ausencia con '—'
 * hasta que el productor SQL alcance la misma forma (pendiente, D-28). */
export interface EstadoCuentaDatos {
  tenant_nombre: string
  tenant_nit: string | null
  inmueble_codigo: string
  movimientos: MovimientoEstadoCuenta[]
  saldo_final: number
  generado_en: string
  propietario_nombre?: string | null
  propietario_documento_enmascarado?: string | null
}

/** Enmascara un documento para documentos reenviables: deja los últimos 4
 * dígitos (D-27 §A.3 — data minimization en documento público). */
export function enmascararDocumento(documento: string): string {
  const limpio = documento.trim()
  if (limpio.length <= 4) return `****${limpio}`
  return `****${limpio.slice(-4)}`
}

export const useCuentaCorrienteStore = defineStore('cuentaCorriente', () => {
  const inmuebles = shallowRef<InmuebleRow[]>([])
  const cargosAbiertos = shallowRef<CargoSaldoRow[]>([])
  const pagos = shallowRef<PagoRow[]>([])
  const novedades = shallowRef<NovedadRow[]>([])
  const tiposNovedad = shallowRef<ListaTipoRow[]>([])
  const novedadCuotas = shallowRef<NovedadCuotaRow[]>([])
  const novedadTipoCuenta = shallowRef<NovedadTipoCuentaRow[]>([])
  const propietariosPorInmueble = shallowRef<Map<string, string>>(new Map())
  const loading = ref(false)

  async function cargarInmuebles(tenantId: string): Promise<InmuebleRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorInmuebles } = await cliente
        .from('inmuebles')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('codigo')
      if (errorInmuebles) throw errorInmuebles
      inmuebles.value = data ?? []
      return inmuebles.value
    } finally {
      loading.value = false
    }
  }

  async function cargarCargosAbiertos(
    tenantId: string,
    inmuebleId?: string,
  ): Promise<CargoSaldoRow[]> {
    const cliente = useSupabaseClient<Database>()
    let consulta = cliente
      .from('v_cargo_saldo')
      .select('*')
      .eq('tenant_id', tenantId)
      .gt('monto_pendiente', 0)
    if (inmuebleId) consulta = consulta.eq('inmueble_id', inmuebleId)
    const { data, error: errorCargos } = await consulta.order('created_at')
    if (errorCargos) throw errorCargos
    cargosAbiertos.value = data ?? []
    return cargosAbiertos.value
  }

  async function cargarPagos(tenantId: string, inmuebleId?: string): Promise<PagoRow[]> {
    const cliente = useSupabaseClient<Database>()
    let consulta = cliente.from('pagos').select('*').eq('tenant_id', tenantId)
    if (inmuebleId) consulta = consulta.eq('inmueble_id', inmuebleId)
    const { data, error: errorPagos } = await consulta.order('fecha_pago', {
      ascending: false,
    })
    if (errorPagos) throw errorPagos
    pagos.value = data ?? []
    return pagos.value
  }

  async function cargarNovedades(tenantId: string, inmuebleId?: string): Promise<NovedadRow[]> {
    const cliente = useSupabaseClient<Database>()
    let consulta = cliente.from('novedades').select('*').eq('tenant_id', tenantId)
    if (inmuebleId) consulta = consulta.eq('inmueble_id', inmuebleId)
    const { data, error: errorNovedades } = await consulta.order('created_at', { ascending: false })
    if (errorNovedades) throw errorNovedades
    novedades.value = data ?? []
    return novedades.value
  }

  /** Fase 4 conceptos avanzados — todas las cuotas de todas las novedades
   * prorrateables del tenant, para calcular "cuota N de M" en el listado
   * sin una consulta por fila. */
  async function cargarNovedadCuotas(tenantId: string): Promise<NovedadCuotaRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorCuotas } = await cliente
      .from('novedad_cuotas')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('numero_cuota')
    if (errorCuotas) throw errorCuotas
    novedadCuotas.value = data ?? []
    return novedadCuotas.value
  }

  /** Catálogo TIPO_NOVEDAD (sanción, reparaciones, servicios...) — Fase 3
   * conceptos avanzados. Mismo patrón que cargarTiposDivision (copropiedad.ts). */
  async function cargarTiposNovedad(tenantId: string): Promise<ListaTipoRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorTipos } = await cliente
      .from('lista_tipos')
      .select('*')
      .eq('tipo', 'TIPO_NOVEDAD')
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order('orden')
    if (errorTipos) throw errorTipos
    tiposNovedad.value = data ?? []
    return tiposNovedad.value
  }

  /** Propietario(s) vigente(s) por inmueble — rol `copropietario` de
   * PERSONA_PREDIO en inmueble_persona_rol, sin `vigente_hasta`. Se usa para
   * poder buscar un inmueble por el nombre de su propietario y mostrarlo junto
   * a la nomenclatura. Un inmueble puede tener varios copropietarios vigentes
   * (excepción explícita documentada en terceros.ts), así que los nombres se
   * unen con coma. */
  async function cargarPropietarios(tenantId: string): Promise<Map<string, string>> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorPropietarios } = await cliente
      .from('inmueble_persona_rol')
      .select('inmueble_id, tercero:terceros(nombre_completo), rol:lista_tipos!inner(codigo)')
      .eq('tenant_id', tenantId)
      .is('vigente_hasta', null)
      .eq('rol.codigo', 'copropietario')
    if (errorPropietarios) throw errorPropietarios

    const acumulado = new Map<string, string[]>()
    for (const fila of data ?? []) {
      const nombre = (fila.tercero as { nombre_completo: string } | null)?.nombre_completo
      if (!nombre) continue
      const lista = acumulado.get(fila.inmueble_id) ?? []
      lista.push(nombre)
      acumulado.set(fila.inmueble_id, lista)
    }
    propietariosPorInmueble.value = new Map(
      [...acumulado].map(([id, nombres]) => [id, nombres.join(', ')]),
    )
    return propietariosPorInmueble.value
  }

  /** Mapa motivo -> cuenta de ingreso (20260830240000). Lo aplica el trigger
   * `aplicar_novedad_cuenta_por_tipo` al insertar la novedad; aquí solo se lee
   * para configurarlo y para poder mostrar en el resumen bajo qué cuenta va a
   * quedar el cobro, sin pedirle esa decisión a quien lo registra. */
  async function cargarNovedadTipoCuenta(tenantId: string): Promise<NovedadTipoCuentaRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorMapa } = await cliente
      .from('novedad_tipo_cuenta')
      .select('*')
      .eq('tenant_id', tenantId)
    if (errorMapa) throw errorMapa
    novedadTipoCuenta.value = data ?? []
    return novedadTipoCuenta.value
  }

  /** `presupuestoCuentaId === null` borra el vínculo (el motivo vuelve a quedar
   * sin cuenta, que es un estado válido — la novedad simplemente no se explica
   * bajo ningún componente presupuestal). */
  async function guardarNovedadTipoCuenta(params: {
    tenantId: string
    tipoNovedadId: number
    presupuestoCuentaId: string | null
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()

    if (params.presupuestoCuentaId === null) {
      const { error: errorDelete } = await cliente
        .from('novedad_tipo_cuenta')
        .delete()
        .eq('tenant_id', params.tenantId)
        .eq('tipo_novedad_id', params.tipoNovedadId)
      if (errorDelete) throw errorDelete
    } else {
      const { error: errorUpsert } = await cliente.from('novedad_tipo_cuenta').upsert(
        {
          tenant_id: params.tenantId,
          tipo_novedad_id: params.tipoNovedadId,
          presupuesto_cuenta_id: params.presupuestoCuentaId,
        },
        { onConflict: 'tenant_id,tipo_novedad_id' },
      )
      if (errorUpsert) throw errorUpsert
    }

    await cargarNovedadTipoCuenta(params.tenantId)
  }

  async function registrarPago(params: {
    inmuebleId: string
    tenantId: string
    monto: number
    fechaPago: string
    referencia?: string
  }): Promise<ResultadoPago> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<ResultadoPago>(
      'registrar-pago',
      {
        body: {
          inmueble_id: params.inmuebleId,
          monto: params.monto,
          fecha_pago: params.fechaPago,
          referencia: params.referencia,
        },
      },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('registrar-pago no devolvió datos.')

    await Promise.all([
      cargarCargosAbiertos(params.tenantId, params.inmuebleId),
      cargarPagos(params.tenantId, params.inmuebleId),
    ])
    return data
  }

  async function calcularIntereses(params: {
    tenantId: string
    fechaReferencia: string
  }): Promise<ResultadoInteres[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<ResultadoInteres[]>(
      'calcular-intereses',
      { body: { tenant_id: params.tenantId, fecha_referencia: params.fechaReferencia } },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('calcular-intereses no devolvió datos.')

    await cargarCargosAbiertos(params.tenantId)
    return data
  }

  async function crearNovedad(params: {
    tenantId: string
    inmuebleId: string
    tipo: NovedadTipo
    tipoNovedadId?: number | null
    presupuestoCuentaId?: string | null
    conceptoId?: string | null
    monto: number
    descripcion: string
    fechaEfectiva: string
    permanente?: boolean
    prorrateable?: boolean
    cuotasTotales?: number | null
  }): Promise<NovedadRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<NovedadRow>(
      'crear-novedad',
      {
        body: {
          inmueble_id: params.inmuebleId,
          tipo: params.tipo,
          tipo_novedad_id: params.tipoNovedadId ?? undefined,
          presupuesto_cuenta_id: params.presupuestoCuentaId ?? undefined,
          concepto_id: params.conceptoId ?? undefined,
          monto: params.monto,
          descripcion: params.descripcion,
          fecha_efectiva: params.fechaEfectiva,
          permanente: params.permanente || undefined,
          prorrateable: params.prorrateable || undefined,
          cuotas_totales: params.cuotasTotales ?? undefined,
        },
      },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('crear-novedad no devolvió datos.')

    await Promise.all([cargarNovedades(params.tenantId), cargarNovedadCuotas(params.tenantId)])
    return data
  }

  /** Fase 4 conceptos avanzados — apaga una novedad permanente (deja de
   * generar cargos futuros, no toca los ya generados). */
  async function inhabilitarNovedad(novedadId: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorFuncion } = await cliente.functions.invoke('inhabilitar-novedad', {
      body: { novedad_id: novedadId },
    })
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)

    await cargarNovedades(tenantId)
  }

  async function aprobarNovedad(novedadId: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorFuncion } = await cliente.functions.invoke('aprobar-novedad', {
      body: { novedad_id: novedadId },
    })
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)

    await Promise.all([
      cargarNovedades(tenantId),
      cargarCargosAbiertos(tenantId),
      cargarNovedadCuotas(tenantId),
    ])
  }

  async function rechazarNovedad(
    novedadId: string,
    motivo: string,
    tenantId: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorFuncion } = await cliente.functions.invoke('rechazar-novedad', {
      body: { novedad_id: novedadId, motivo },
    })
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)

    await cargarNovedades(tenantId)
  }

  /** Calcula el ledger completo (todos los cargos + pagos del inmueble, no
   * solo los abiertos) e inserta un snapshot en estados_cuenta_generados —
   * directo por RLS (auxiliar), sin Edge Function: no hay privilegio que
   * escalar aquí (PLAN_DATOS_REALES.md §3.3, decisión revisada — el HTML
   * se sirve desde apps/web, no desde Storage/Edge Functions, ver
   * 20260822120000_estados_cuenta_datos_jsonb.sql). Devuelve el id de la
   * fila — la página pública es /comprobante-cuenta/{id}.
   *
   * etiquetasConcepto enriquece la descripción de los cargos con el código
   * del concepto (antes solo decía "Capital" — crítica del análisis UI/UX:
   * descripción pobre = reclamos). Opcional para no acoplar el store a la
   * carga previa de conceptos. */
  async function generarEstadoCuenta(params: {
    tenantId: string
    inmuebleId: string
    inmuebleCodigo: string
    tenantNombre: string
    tenantNit: string | null
    propietarioNombre?: string | null
    propietarioDocumento?: string | null
    etiquetasConcepto?: Record<string, string>
  }): Promise<string> {
    const cliente = useSupabaseClient<Database>()
    const [{ data: todosCargos, error: errorCargos }, { data: todosPagos, error: errorPagos }] =
      await Promise.all([
        cliente
          .from('cargos')
          .select('monto_original, created_at, categoria, concepto_id')
          .eq('inmueble_id', params.inmuebleId)
          .order('created_at'),
        cliente
          .from('pagos')
          .select('monto, fecha_pago, referencia')
          .eq('inmueble_id', params.inmuebleId)
          .order('fecha_pago'),
      ])
    if (errorCargos) throw errorCargos
    if (errorPagos) throw errorPagos

    interface Evento {
      fecha: string
      descripcion: string
      monto: number
      esCargo: boolean
    }
    const eventos: Evento[] = [
      ...(todosCargos ?? []).map((c): Evento => {
        const categoria = CATEGORIA_ESTADO_CUENTA_LABEL[c.categoria] ?? c.categoria
        const concepto = c.concepto_id ? params.etiquetasConcepto?.[c.concepto_id] : undefined
        return {
          fecha: c.created_at,
          descripcion: concepto ? `${categoria} · ${concepto}` : categoria,
          monto: Number(c.monto_original),
          esCargo: true,
        }
      }),
      ...(todosPagos ?? []).map(
        (p): Evento => ({
          fecha: p.fecha_pago,
          descripcion: p.referencia ? `Pago — ${p.referencia}` : 'Pago',
          monto: Number(p.monto),
          esCargo: false,
        }),
      ),
    ].sort((a, b) => a.fecha.localeCompare(b.fecha))

    let saldo = 0
    const movimientos = eventos.map((e) => {
      saldo += e.esCargo ? e.monto : -e.monto
      return {
        fecha: e.fecha,
        descripcion: e.descripcion,
        cargo: e.esCargo ? e.monto : null,
        abono: e.esCargo ? null : e.monto,
        saldo,
      }
    })

    const datos: EstadoCuentaDatos = {
      tenant_nombre: params.tenantNombre,
      tenant_nit: params.tenantNit,
      inmueble_codigo: params.inmuebleCodigo,
      movimientos,
      saldo_final: saldo,
      generado_en: new Date().toISOString(),
      propietario_nombre: params.propietarioNombre ?? null,
      propietario_documento_enmascarado: params.propietarioDocumento
        ? enmascararDocumento(params.propietarioDocumento)
        : null,
    }

    const { data, error: errorInsert } = await cliente
      .from('estados_cuenta_generados')
      .insert({
        tenant_id: params.tenantId,
        inmueble_id: params.inmuebleId,
        datos: datos as unknown as JsonColumnaEstadoCuenta,
      })
      .select('id')
      .single()
    if (errorInsert) throw errorInsert
    return data.id
  }

  function limpiar(): void {
    inmuebles.value = []
    cargosAbiertos.value = []
    pagos.value = []
    novedades.value = []
    tiposNovedad.value = []
    novedadCuotas.value = []
    novedadTipoCuenta.value = []
    propietariosPorInmueble.value = new Map()
  }

  return {
    inmuebles,
    cargosAbiertos,
    pagos,
    novedades,
    tiposNovedad,
    novedadCuotas,
    novedadTipoCuenta,
    propietariosPorInmueble,
    loading,
    cargarInmuebles,
    cargarCargosAbiertos,
    cargarPagos,
    cargarNovedades,
    cargarTiposNovedad,
    cargarNovedadTipoCuenta,
    guardarNovedadTipoCuenta,
    cargarPropietarios,
    cargarNovedadCuotas,
    registrarPago,
    calcularIntereses,
    crearNovedad,
    aprobarNovedad,
    rechazarNovedad,
    inhabilitarNovedad,
    generarEstadoCuenta,
    limpiar,
  }
})
