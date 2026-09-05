/**
 * Dominio Fondos (GAP-22, PLAN §4.3) — fondos, movimientos, autorizaciones, fuentes de
 * alimentación, compromisos y solicitudes de uso.
 *
 * Todo se lee/escribe directo por RLS (mismo criterio que presupuesto.ts/members.ts): no hay
 * Edge Function propia todavía (BLOQUE P la dejó pendiente — hoy las RPC de decisión de
 * solicitudes están protegidas solo por RLS + los guards de trigger, D-37). Los guards
 * (`guard_fondo_estado_transicion`, `guard_fondo_solicitud_uso_transicion`,
 * `guard_fondo_compromiso_transicion`, `guard_fondo_movimiento`, R9...) validan en BD y su
 * mensaje llega tal cual, sin traducir — mismo criterio que BUDGET_NOT_RECONCILED en
 * presupuesto.ts.
 *
 * Segregación de funciones (D-37: quien solicita no aprueba, quien aprueba no ejecuta) vive en
 * los guards, no aquí — este store solo hace el UPDATE que la página ya decidió que el usuario
 * puede intentar. El espejo de esa regla en el cliente (para no ofrecer un botón que el guard
 * rechazaría) vive en las páginas, mismo patrón que `motivoNoPuedeDecidir` en
 * cartera/acciones.vue.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type FondoRow = Database['public']['Tables']['fondos']['Row']
type FondoMovimientoRow = Database['public']['Tables']['fondo_movimientos']['Row']
type FondoAutorizacionRow = Database['public']['Tables']['fondo_autorizaciones']['Row']
type FondoFuenteRow = Database['public']['Tables']['fondo_fuentes']['Row']
type FondoCompromisoRow = Database['public']['Tables']['fondo_compromisos']['Row']
type FondoSolicitudUsoRow = Database['public']['Tables']['fondo_solicitudes_uso']['Row']
type FondoRemanenteRow = Database['public']['Tables']['fondo_remanentes']['Row']
type FondoEstado = Database['public']['Enums']['fondo_estado_t']
type FondoMovimientoTipo = Database['public']['Enums']['fondo_movimiento_tipo_t']
type FondoCompromisoEstado = Database['public']['Enums']['fondo_compromiso_estado_t']
type FondoSolicitudUsoEstado = Database['public']['Enums']['fondo_solicitud_uso_estado_t']

export interface FondoSaldos {
  saldo: number
  comprometido: number
  disponible: number
}

export const useFondosStore = defineStore('fondos', () => {
  const fondos = shallowRef<FondoRow[]>([])
  const movimientos = shallowRef<FondoMovimientoRow[]>([])
  const autorizaciones = shallowRef<FondoAutorizacionRow[]>([])
  const fuentes = shallowRef<FondoFuenteRow[]>([])
  const compromisos = shallowRef<FondoCompromisoRow[]>([])
  const solicitudes = shallowRef<FondoSolicitudUsoRow[]>([])
  const remanentes = shallowRef<FondoRemanenteRow[]>([])
  /** fondo_id -> saldos derivados (fn_fondo_saldos) — se recarga junto con `fondos`. */
  const saldosPorFondo = shallowRef<Record<string, FondoSaldos>>({})
  const loading = ref(false)

  async function cargarFondos(tenantId: string): Promise<FondoRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorFondos } = await cliente
        .from('fondos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
      if (errorFondos) throw errorFondos
      fondos.value = data ?? []

      const entradas = await Promise.all(
        fondos.value.map(async (f) => {
          const { data: saldos, error: errorSaldos } = await cliente
            .rpc('fn_fondo_saldos', { p_fondo_id: f.id })
            .single()
          if (errorSaldos) throw errorSaldos
          return [
            f.id,
            { saldo: Number(saldos.saldo), comprometido: Number(saldos.comprometido), disponible: Number(saldos.disponible) },
          ] as const
        }),
      )
      saldosPorFondo.value = Object.fromEntries(entradas)

      return fondos.value
    } finally {
      loading.value = false
    }
  }

  /** Refresca solo los saldos derivados de un fondo (fn_fondo_saldos) sin recargar la lista
   * completa de fondos — usado tras acciones en otras pestañas (compromisos, solicitudes) que
   * cambian saldo/comprometido/disponible pero no la lista de fondos en sí. */
  async function refrescarSaldoFondo(fondoId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data: saldos, error: errorSaldos } = await cliente
      .rpc('fn_fondo_saldos', { p_fondo_id: fondoId })
      .single()
    if (errorSaldos) throw errorSaldos
    saldosPorFondo.value = {
      ...saldosPorFondo.value,
      [fondoId]: { saldo: Number(saldos.saldo), comprometido: Number(saldos.comprometido), disponible: Number(saldos.disponible) },
    }
  }

  async function crearFondo(params: {
    tenantId: string
    codigo: string
    nombre: string
    naturaleza: 'imprevistos' | 'destinacion_especifica'
    tipoId: number
    objetivo?: string
    destinacion?: string
    permanente?: boolean
    meta?: number
    fechaInicio?: string
    fechaFin?: string
  }): Promise<FondoRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('fondos')
      .insert({
        tenant_id: params.tenantId,
        codigo: params.codigo,
        nombre: params.nombre,
        naturaleza: params.naturaleza,
        tipo_id: params.tipoId,
        objetivo: params.objetivo,
        destinacion: params.destinacion,
        permanente: params.permanente ?? false,
        meta: params.meta,
        fecha_inicio: params.fechaInicio,
        fecha_fin: params.fechaFin,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarFondos(params.tenantId)
    return data
  }

  /** Cambia el estado del fondo — guard_fondo_estado_transicion valida la máquina de estados en
   * BD; TRANSICIONES_ESTADO_FONDO (fondos-labels.ts) solo evita ofrecer un botón que ya sabemos
   * que el guard rechazaría. */
  async function cambiarEstadoFondo(id: string, tenantId: string, estado: FondoEstado): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente.from('fondos').update({ estado }).eq('id', id)
    if (errorUpdate) throw errorUpdate
    await cargarFondos(tenantId)
  }

  async function cargarMovimientos(fondoId: string): Promise<FondoMovimientoRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorMovs } = await cliente
        .from('fondo_movimientos')
        .select('*')
        .eq('fondo_id', fondoId)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
      if (errorMovs) throw errorMovs
      movimientos.value = data ?? []
      return movimientos.value
    } finally {
      loading.value = false
    }
  }

  /** Registra un movimiento manual (aporte/rendimiento/traslado/ajuste — nunca uso ni
   * cierre_remanente desde aquí, ver TIPOS_MOVIMIENTO_MANUAL). guard_fondo_movimiento valida
   * estado del fondo, signo del monto y motivo obligatorio para ajuste; el error llega tal cual. */
  async function registrarMovimiento(params: {
    tenantId: string
    fondoId: string
    tipo: FondoMovimientoTipo
    monto: number
    fecha?: string
    descripcion?: string
    motivo?: string
    documentoId?: string
  }): Promise<FondoMovimientoRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('fondo_movimientos')
      .insert({
        tenant_id: params.tenantId,
        fondo_id: params.fondoId,
        tipo: params.tipo,
        monto: params.monto,
        fecha: params.fecha,
        descripcion: params.descripcion,
        motivo: params.motivo,
        documento_id: params.documentoId,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await Promise.all([cargarMovimientos(params.fondoId), cargarFondos(params.tenantId)])
    return data
  }

  async function cargarAutorizaciones(fondoId: string): Promise<FondoAutorizacionRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorAut } = await cliente
      .from('fondo_autorizaciones')
      .select('*')
      .eq('fondo_id', fondoId)
      .order('created_at', { ascending: false })
    if (errorAut) throw errorAut
    autorizaciones.value = data ?? []
    return autorizaciones.value
  }

  /** Append-only (Modelo §7): registra el hecho jurídico ya ocurrido, no se edita después. */
  async function registrarAutorizacion(params: {
    tenantId: string
    fondoId: string
    organoId: number
    tipoDecision: string
    decision: string
    numeroActa?: string
    fechaActa?: string
    alcance?: string
    vigenciaDesde?: string
    vigenciaHasta?: string
    documentoId?: string
  }): Promise<FondoAutorizacionRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('fondo_autorizaciones')
      .insert({
        tenant_id: params.tenantId,
        fondo_id: params.fondoId,
        organo_id: params.organoId,
        tipo_decision: params.tipoDecision,
        decision: params.decision,
        numero_acta: params.numeroActa,
        fecha_acta: params.fechaActa,
        alcance: params.alcance,
        vigencia_desde: params.vigenciaDesde,
        vigencia_hasta: params.vigenciaHasta,
        documento_id: params.documentoId,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarAutorizaciones(params.fondoId)
    return data
  }

  async function cargarFuentes(fondoId: string): Promise<FondoFuenteRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuentes } = await cliente
      .from('fondo_fuentes')
      .select('*')
      .eq('fondo_id', fondoId)
      .order('created_at', { ascending: false })
    if (errorFuentes) throw errorFuentes
    fuentes.value = data ?? []
    return fuentes.value
  }

  async function registrarFuente(params: {
    tenantId: string
    fondoId: string
    tipoId: number
    porcentaje?: number
    valor?: number
    baseCalculo?: string
    periodicidad?: string
    autorizacionId?: string
    documentoId?: string
  }): Promise<FondoFuenteRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('fondo_fuentes')
      .insert({
        tenant_id: params.tenantId,
        fondo_id: params.fondoId,
        tipo_id: params.tipoId,
        porcentaje: params.porcentaje,
        valor: params.valor,
        base_calculo: params.baseCalculo,
        periodicidad: params.periodicidad,
        autorizacion_id: params.autorizacionId,
        documento_id: params.documentoId,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarFuentes(params.fondoId)
    return data
  }

  async function cambiarFuenteActiva(id: string, fondoId: string, activa: boolean): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente.from('fondo_fuentes').update({ activa }).eq('id', id)
    if (errorUpdate) throw errorUpdate
    await cargarFuentes(fondoId)
  }

  async function cargarCompromisos(fondoId: string): Promise<FondoCompromisoRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorComp } = await cliente
        .from('fondo_compromisos')
        .select('*')
        .eq('fondo_id', fondoId)
        .order('fecha', { ascending: false })
      if (errorComp) throw errorComp
      compromisos.value = data ?? []
      return compromisos.value
    } finally {
      loading.value = false
    }
  }

  /** Nace en 'proyectado' (default en BD) — no resta del disponible hasta pasar a
   * 'comprometido' (Modelo §14/R9). */
  async function crearCompromiso(params: {
    tenantId: string
    fondoId: string
    concepto: string
    monto: number
    fecha?: string
    fechaLimite?: string
    beneficiarioTerceroId?: string
    documentoId?: string
  }): Promise<FondoCompromisoRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('fondo_compromisos')
      .insert({
        tenant_id: params.tenantId,
        fondo_id: params.fondoId,
        concepto: params.concepto,
        monto: params.monto,
        fecha: params.fecha,
        fecha_limite: params.fechaLimite,
        beneficiario_tercero_id: params.beneficiarioTerceroId,
        documento_id: params.documentoId,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarCompromisos(params.fondoId)
    return data
  }

  /** guard_fondo_compromiso_transicion valida la máquina de estados (proyectado→comprometido→
   * parcialmente_ejecutado→ejecutado, o →anulado/liberado); R9 (guard_fondo_compromiso) valida
   * que comprometer no deje el disponible en negativo. */
  async function cambiarEstadoCompromiso(
    id: string,
    fondoId: string,
    estado: FondoCompromisoEstado,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente.from('fondo_compromisos').update({ estado }).eq('id', id)
    if (errorUpdate) throw errorUpdate
    await Promise.all([cargarCompromisos(fondoId), refrescarSaldoFondo(fondoId)])
  }

  async function cargarSolicitudes(fondoId: string): Promise<FondoSolicitudUsoRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorSol } = await cliente
        .from('fondo_solicitudes_uso')
        .select('*')
        .eq('fondo_id', fondoId)
        .order('fecha', { ascending: false })
      if (errorSol) throw errorSol
      solicitudes.value = data ?? []
      return solicitudes.value
    } finally {
      loading.value = false
    }
  }

  /** Nace en 'borrador' (default en BD) — el solicitante la envía a revisión aparte
   * (cambiarEstadoSolicitud a 'en_revision') cuando esté lista. */
  async function crearSolicitud(params: {
    tenantId: string
    fondoId: string
    solicitanteId: string
    objetivo: string
    montoSolicitado: number
    justificacion?: string
    documentoId?: string
  }): Promise<FondoSolicitudUsoRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('fondo_solicitudes_uso')
      .insert({
        tenant_id: params.tenantId,
        fondo_id: params.fondoId,
        solicitante_id: params.solicitanteId,
        objetivo: params.objetivo,
        monto_solicitado: params.montoSolicitado,
        justificacion: params.justificacion,
        documento_id: params.documentoId,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarSolicitudes(params.fondoId)
    return data
  }

  /** guard_fondo_solicitud_uso_transicion (D-37) hace cumplir toda la segregación de funciones
   * en BD — este store solo manda el UPDATE que la página ya decidió ofrecer (ver
   * motivoNoPuedeDecidirSolicitud en FondosTabSolicitudes.vue). motivoRechazo es obligatorio
   * cuando estado='rechazada' (SOLICITUD_MOTIVO_REQUERIDO). */
  async function cambiarEstadoSolicitud(
    id: string,
    fondoId: string,
    estado: FondoSolicitudUsoEstado,
    motivoRechazo?: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente
      .from('fondo_solicitudes_uso')
      .update({ estado, motivo_rechazo: motivoRechazo })
      .eq('id', id)
    if (errorUpdate) throw errorUpdate
    await Promise.all([cargarSolicitudes(fondoId), refrescarSaldoFondo(fondoId)])
  }

  async function cargarRemanentes(fondoId: string): Promise<FondoRemanenteRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorRemanentes } = await cliente
      .from('fondo_remanentes')
      .select('*')
      .eq('fondo_id', fondoId)
      .order('created_at', { ascending: false })
    if (errorRemanentes) throw errorRemanentes
    remanentes.value = data ?? []
    return remanentes.value
  }

  /** Cierra un fondo en_cierre (Modelo §35/§36, BLOQUE O) — fn_fondo_cerrar es una operación
   * atómica (Prompt §53): valida compromisos/solicitudes pendientes, y si el saldo derivado es
   * > 0 exige destino/organoId/decision y registra el movimiento cierre_remanente (+
   * traslado_entrada en el destino si aplica) antes de pasar el fondo a cerrado. Si el saldo ya
   * es 0 los parámetros de remanente se omiten — la página decide cuál caso mostrar según
   * saldosPorFondo, ver motivoNoPuedeCerrar en FondosTabDashboard.vue. */
  async function cerrarFondo(params: {
    fondoId: string
    destino?: 'traslado' | 'devolucion' | 'aplicacion'
    organoId?: number
    decision?: string
    fondoDestinoId?: string
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.rpc('fn_fondo_cerrar', {
      p_fondo_id: params.fondoId,
      p_destino: params.destino,
      p_organo_id: params.organoId,
      p_decision: params.decision,
      p_fondo_destino_id: params.fondoDestinoId,
    })
    if (error) throw error
    const tenantId = useTenantStore().activeTenant?.id
    if (tenantId) await cargarFondos(tenantId)
  }

  function limpiar(): void {
    fondos.value = []
    movimientos.value = []
    autorizaciones.value = []
    fuentes.value = []
    compromisos.value = []
    solicitudes.value = []
    remanentes.value = []
    saldosPorFondo.value = {}
  }

  return {
    fondos,
    movimientos,
    autorizaciones,
    fuentes,
    compromisos,
    solicitudes,
    remanentes,
    saldosPorFondo,
    loading,
    cargarFondos,
    refrescarSaldoFondo,
    crearFondo,
    cambiarEstadoFondo,
    cargarMovimientos,
    registrarMovimiento,
    cargarAutorizaciones,
    registrarAutorizacion,
    cargarFuentes,
    registrarFuente,
    cambiarFuenteActiva,
    cargarCompromisos,
    crearCompromiso,
    cambiarEstadoCompromiso,
    cargarSolicitudes,
    crearSolicitud,
    cambiarEstadoSolicitud,
    cargarRemanentes,
    cerrarFondo,
    limpiar,
  }
})
