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
 * la Edge Function ver-estado-cuenta (PLAN_DATOS_REALES.md §3.3). */
export interface EstadoCuentaDatos {
  tenant_nombre: string
  tenant_nit: string | null
  inmueble_codigo: string
  movimientos: MovimientoEstadoCuenta[]
  saldo_final: number
  generado_en: string
}

export const useCuentaCorrienteStore = defineStore('cuentaCorriente', () => {
  const inmuebles = shallowRef<InmuebleRow[]>([])
  const cargosAbiertos = shallowRef<CargoSaldoRow[]>([])
  const pagos = shallowRef<PagoRow[]>([])
  const novedades = shallowRef<NovedadRow[]>([])
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
    monto: number
    descripcion: string
    fechaEfectiva: string
  }): Promise<NovedadRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<NovedadRow>(
      'crear-novedad',
      {
        body: {
          inmueble_id: params.inmuebleId,
          tipo: params.tipo,
          monto: params.monto,
          descripcion: params.descripcion,
          fecha_efectiva: params.fechaEfectiva,
        },
      },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('crear-novedad no devolvió datos.')

    await cargarNovedades(params.tenantId)
    return data
  }

  async function aprobarNovedad(novedadId: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorFuncion } = await cliente.functions.invoke('aprobar-novedad', {
      body: { novedad_id: novedadId },
    })
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)

    await Promise.all([cargarNovedades(tenantId), cargarCargosAbiertos(tenantId)])
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
   * directo por RLS (agent), sin Edge Function: no hay privilegio que
   * escalar aquí (PLAN_DATOS_REALES.md §3.3, decisión revisada — el HTML
   * se sirve desde apps/web, no desde Storage/Edge Functions, ver
   * 20260822120000_estados_cuenta_datos_jsonb.sql). Devuelve el id de la
   * fila — la página pública es /estado-cuenta/{id}. */
  async function generarEstadoCuenta(params: {
    tenantId: string
    inmuebleId: string
    inmuebleCodigo: string
    tenantNombre: string
    tenantNit: string | null
  }): Promise<string> {
    const cliente = useSupabaseClient<Database>()
    const [{ data: todosCargos, error: errorCargos }, { data: todosPagos, error: errorPagos }] =
      await Promise.all([
        cliente
          .from('cargos')
          .select('monto_original, created_at, categoria')
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
      ...(todosCargos ?? []).map(
        (c): Evento => ({
          fecha: c.created_at,
          descripcion: CATEGORIA_ESTADO_CUENTA_LABEL[c.categoria] ?? c.categoria,
          monto: Number(c.monto_original),
          esCargo: true,
        }),
      ),
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
  }

  return {
    inmuebles,
    cargosAbiertos,
    pagos,
    novedades,
    loading,
    cargarInmuebles,
    cargarCargosAbiertos,
    cargarPagos,
    cargarNovedades,
    registrarPago,
    calcularIntereses,
    crearNovedad,
    aprobarNovedad,
    rechazarNovedad,
    generarEstadoCuenta,
    limpiar,
  }
})
