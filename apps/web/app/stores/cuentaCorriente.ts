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

export interface ResultadoPago {
  pago_id: string
  aplicado: string
  no_aplicado: string
  aplicaciones: { cargo_id: string; monto: string }[]
  /** GAP-CAR-008 — presente solo cuando el pago se asoció explícitamente a una cuota de acuerdo. */
  cuota_acuerdo?: { id: string; estado: string; monto_pagado: string; se_paga_completo: boolean }
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
  documento: string | null
  cargo: number | null
  abono: number | null
  saldo: number
}

export interface CanalPagoEstadoCuenta {
  banco: string
  tipo_cuenta: string
  numero_cuenta: string
}

/** Forma de estados_cuenta_generados.datos — misma estructura que devuelve
 * la Edge Function ver-estado-cuenta (PLAN_DATOS_REALES.md §3.3), y desde
 * 20260902120000 la misma que produce fn_emitir_estados_cuenta (L5) — el
 * gap D-28 (SQL sin propietario_*) queda cerrado.
 *
 * saldo_anterior/periodo_* quedan `undefined` en los snapshots generados a
 * mano desde la ficha del inmueble (esta función): esos son "a hoy", sin
 * periodo — el historial completo hace de saldo_anterior=0 implícito. El
 * emisor por lote sí los llena siempre, porque nace de una liquidación con
 * periodo concreto. */
export interface EstadoCuentaDatos {
  tenant_nombre: string
  tenant_nit: string | null
  tenant_direccion?: string | null
  tenant_ciudad?: string | null
  tenant_telefono?: string | null
  tenant_email?: string | null
  canales_pago?: CanalPagoEstadoCuenta[]
  inmueble_codigo: string
  inmueble_coeficiente?: number | null
  movimientos: MovimientoEstadoCuenta[]
  saldo_anterior?: number
  saldo_final: number
  generado_en: string
  periodo_inicio?: string | null
  periodo_fin?: string | null
  periodo_fecha_limite_pago?: string | null
  mensaje_divulgacion?: string | null
  propietario_nombre?: string | null
  propietario_documento_enmascarado?: string | null
}

/** Fila del historial de comprobantes ya emitidos (para reabrir/reenviar el
 * documento ORIGINAL en vez de generar uno nuevo — ver comprobante-cuenta
 * más abajo). `periodo_id` null = generado a mano desde la ficha ("a hoy");
 * no null = emitido por una liquidación real (fn_emitir_estados_cuenta). */
export interface ComprobanteEmitido {
  id: string
  folio: string | null
  created_at: string
  periodo_id: string | null
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
  const comprobantesEmitidos = shallowRef<ComprobanteEmitido[]>([])
  const formasPago = shallowRef<ListaTipoRow[]>([])
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

  /** Historial de comprobantes YA emitidos para un inmueble — para reabrir o
   * reenviar el documento oficial (folio, hash, mensaje de divulgación
   * incluidos) en vez de generar uno nuevo y distinto con "Generar
   * comprobante de cuenta". SELECT directo por RLS
   * (estados_cuenta_generados_select_miembro, cualquier miembro del tenant). */
  async function cargarComprobantesEmitidos(
    tenantId: string,
    inmuebleId: string,
  ): Promise<ComprobanteEmitido[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorComprobantes } = await cliente
      .from('estados_cuenta_generados')
      .select('id, folio, created_at, periodo_id')
      .eq('tenant_id', tenantId)
      .eq('inmueble_id', inmuebleId)
      .order('created_at', { ascending: false })
    if (errorComprobantes) throw errorComprobantes
    comprobantesEmitidos.value = data ?? []
    return comprobantesEmitidos.value
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

  /** Formas de pago disponibles: las globales de la plataforma más las
   * propias de esta copropiedad (RC-0). Solo activas — una forma retirada
   * deja de ofrecerse sin invalidar los pagos que ya la usaron. */
  async function cargarFormasPago(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('lista_tipos')
      .select('*')
      .eq('tipo', 'FORMA_PAGO')
      .eq('activo', true)
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order('orden')
    if (error) throw error
    formasPago.value = data ?? []
  }

  async function registrarPago(params: {
    inmuebleId: string
    tenantId: string
    monto: number
    fechaPago: string
    referencia?: string
    /** Código de lista_tipos FORMA_PAGO ('efectivo', 'transferencia_bancaria',
     * 'cheque'...). Obligatorio desde RC-0: decide si la contabilidad debita
     * caja o bancos. */
    formaPago: string
    /** A qué cuenta bancaria entró. Omitir cae a la cuenta de recaudo vigente;
     * se ignora cuando la forma de pago es efectivo. */
    cuentaBancariaId?: string | null
    pagadorTerceroId?: string | null
    pagadorNombre?: string | null
    /** Cédula/NIT de quien pagó — solo aplica junto con pagadorNombre (texto libre). */
    pagadorDocumento?: string | null
    observaciones?: string | null
    /** Imputación manual (art. 1653 C.C.): a qué cargo(s) específicos aplica este pago,
     * en vez de dejar que la política automática decida. Omitir = comportamiento de siempre. */
    aplicacionesManuales?: { cargoId: string; monto: number }[]
    /** GAP-CAR-008 (CAR §12.4) — asociación explícita opcional a la cuota de acuerdo que cubre este pago. */
    acuerdoCuotaId?: string | null
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
          forma_pago: params.formaPago,
          cuenta_bancaria_id: params.cuentaBancariaId ?? null,
          pagador_tercero_id: params.pagadorTerceroId ?? null,
          pagador_nombre: params.pagadorNombre ?? null,
          pagador_documento: params.pagadorDocumento ?? null,
          observaciones: params.observaciones ?? null,
          aplicaciones_manuales: params.aplicacionesManuales?.map((a) => ({
            cargo_id: a.cargoId,
            monto: a.monto,
          })),
          acuerdo_cuota_id: params.acuerdoCuotaId ?? null,
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

  /** RC-2 — anula un pago (reversa append-only vía fn_anular_pago). Solo
   * total: no admite anular parte de un pago. */
  async function anularPago(params: {
    pagoId: string
    motivo: string
    tenantId: string
    inmuebleId: string
  }): Promise<{ reversa_id: string }> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<{ reversa_id: string }>(
      'anular-pago',
      { body: { pago_id: params.pagoId, motivo: params.motivo } },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('anular-pago no devolvió datos.')

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

  /** Fase 4 conceptos avanzados — apaga una novedad permanente, o una
   * prorrateable con saldo pendiente (deja de generar cargos/cuotas futuros,
   * no toca los ya generados). Exige observación, igual que rechazarNovedad. */
  async function inhabilitarNovedad(novedadId: string, motivo: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorFuncion } = await cliente.functions.invoke('inhabilitar-novedad', {
      body: { novedad_id: novedadId, motivo },
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
    tenantDireccion?: string | null
    tenantCiudad?: string | null
    tenantTelefono?: string | null
    tenantEmail?: string | null
    coeficiente?: number | null
    canalesPago?: CanalPagoEstadoCuenta[]
    propietarioNombre?: string | null
    propietarioDocumento?: string | null
    etiquetasConcepto?: Record<string, string>
  }): Promise<string> {
    const cliente = useSupabaseClient<Database>()
    const [{ data: todosCargos, error: errorCargos }, { data: todosPagos, error: errorPagos }] =
      await Promise.all([
        cliente
          .from('cargos')
          .select('monto_original, created_at, categoria, concepto_id, novedad_id')
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

    // Cargos de categoria='otro' vienen de una novedad — su descripcion real
    // ("Sanción por ruido nocturno") es mucho más útil que la etiqueta
    // genérica "Otro" que mostraba antes (mismo criterio que
    // fn_emitir_estados_cuenta, 20260902150000).
    const idsNovedad = [...new Set((todosCargos ?? []).map((c) => c.novedad_id).filter((id): id is string => id !== null))]
    const descripcionesNovedad = new Map<string, string>()
    if (idsNovedad.length > 0) {
      const { data: novedades, error: errorNovedades } = await cliente
        .from('novedades')
        .select('id, descripcion')
        .in('id', idsNovedad)
      if (errorNovedades) throw errorNovedades
      for (const n of novedades ?? []) descripcionesNovedad.set(n.id, n.descripcion)
    }

    interface Evento {
      fecha: string
      descripcion: string
      documento: string | null
      monto: number
      esCargo: boolean
    }
    const eventos: Evento[] = [
      ...(todosCargos ?? []).map((c): Evento => {
        const categoria = CATEGORIA_ESTADO_CUENTA_LABEL[c.categoria] ?? c.categoria
        const descripcionNovedad = c.novedad_id ? descripcionesNovedad.get(c.novedad_id) : undefined
        const concepto = c.concepto_id ? params.etiquetasConcepto?.[c.concepto_id] : undefined
        return {
          fecha: c.created_at,
          descripcion: descripcionNovedad ?? (concepto ? `${categoria} · ${concepto}` : categoria),
          documento: null,
          monto: Number(c.monto_original),
          esCargo: true,
        }
      }),
      ...(todosPagos ?? []).map(
        (p): Evento => ({
          fecha: p.fecha_pago,
          descripcion: p.referencia ? `Pago — ${p.referencia}` : 'Pago',
          documento: p.referencia,
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
        documento: e.documento,
        cargo: e.esCargo ? e.monto : null,
        abono: e.esCargo ? null : e.monto,
        saldo,
      }
    })

    const datos: EstadoCuentaDatos = {
      tenant_nombre: params.tenantNombre,
      tenant_nit: params.tenantNit,
      tenant_direccion: params.tenantDireccion ?? null,
      tenant_ciudad: params.tenantCiudad ?? null,
      tenant_telefono: params.tenantTelefono ?? null,
      tenant_email: params.tenantEmail ?? null,
      canales_pago: params.canalesPago ?? [],
      inmueble_codigo: params.inmuebleCodigo,
      inmueble_coeficiente: params.coeficiente ?? null,
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
    comprobantesEmitidos.value = []
  }

  return {
    inmuebles,
    cargosAbiertos,
    pagos,
    novedades,
    comprobantesEmitidos,
    cargarComprobantesEmitidos,
    formasPago,
    cargarFormasPago,
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
    anularPago,
    calcularIntereses,
    crearNovedad,
    aprobarNovedad,
    rechazarNovedad,
    inhabilitarNovedad,
    generarEstadoCuenta,
    limpiar,
  }
})
