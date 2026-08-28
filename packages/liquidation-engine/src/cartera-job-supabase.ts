/**
 * I/O Supabase del job diario de cartera (CAR §18) — mismo nivel de
 * autorización que cartera-supabase.ts/cartera-cobranza-supabase.ts
 * (D-14, vigilado por eslint.config.js).
 *
 * Solo LEE y arma EntradaJobCarteraInmueble — la reutilización de lo ya
 * construido (REC-CAR-004) es explícita: obtenerPoliticaClasificacionVigente
 * (F1), obtenerEstrategiasCobranzaVigentes/obtenerHistorialAccionesCobranza
 * (F4). Persistir el plan que produce evaluarJobCarteraInmueble() (posiciones_
 * cartera_snapshot vía service_role, cartera_etapas/promesas_pago/
 * acuerdo_pago_cuotas/acuerdos_pago vía la sesión del administrador que
 * invoca, eventos_cartera vía service_role) vive en la Edge Function
 * cartera-recalcular — mezcla dos niveles de privilegio (ctx.supabase +
 * ctx.supabaseAdmin) que este módulo puro de lectura no necesita conocer.
 */
import type { AquilaClient } from '@aquila/shared'
import type { EstrategiaCobranza } from './cartera-cobranza.js'
import { obtenerHistorialAccionesCobranza } from './cartera-cobranza-supabase.js'
import { obtenerRelacionesInmueble } from './cartera-destinatarios-supabase.js'
import { diasCalendario } from './cuenta-corriente.js'
import type { ResumenAccion } from './cartera-escalamiento.js'
import type { CuotaPendiente, EntradaJobCarteraInmueble, PromesaPendiente } from './cartera-job.js'
import type { PoliticaClasificacion } from './cartera.js'

export async function obtenerInmueblesDelTenant(
  cliente: AquilaClient,
  opciones: { readonly tenantId: string; readonly alcanceInmuebles?: readonly string[] },
): Promise<string[]> {
  let consulta = cliente.from('inmuebles').select('id').eq('tenant_id', opciones.tenantId)
  if (opciones.alcanceInmuebles && opciones.alcanceInmuebles.length > 0) {
    consulta = consulta.in('id', opciones.alcanceInmuebles)
  }
  const { data, error } = await consulta
  if (error) throw new Error(`No se pudieron leer los inmuebles del tenant: ${error.message}`)
  return data.map((i) => i.id)
}

/**
 * Etapa gobernada actual (cartera_etapas, F6) — si el inmueble nunca se
 * evaluó, la fila no existe todavía; el llamador (Edge Function) la crea
 * en preventiva antes de invocar esto (guard_cartera_etapa_inicial exige
 * exactamente ese valor al nacer).
 */
export async function obtenerEtapaActual(
  cliente: AquilaClient,
  opciones: { readonly tenantId: string; readonly inmuebleId: string },
): Promise<EntradaJobCarteraInmueble['etapaActual'] | null> {
  const { data, error } = await cliente
    .from('cartera_etapas')
    .select('etapa')
    .eq('tenant_id', opciones.tenantId)
    .eq('inmueble_id', opciones.inmuebleId)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer la etapa del inmueble ${opciones.inmuebleId}: ${error.message}`)
  return data?.etapa ?? null
}

async function tieneAcuerdoVigente(
  cliente: AquilaClient,
  tenantId: string,
  inmuebleId: string,
): Promise<{ readonly vigente: boolean; readonly acuerdoId: string | null }> {
  const { data, error } = await cliente
    .from('acuerdos_pago')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('inmueble_id', inmuebleId)
    .eq('estado', 'vigente')
    .maybeSingle()
  if (error) throw new Error(`No se pudo verificar el acuerdo vigente del inmueble ${inmuebleId}: ${error.message}`)
  return { vigente: data !== null, acuerdoId: data?.id ?? null }
}

/** estado_caso_juridico_t completo, menos los 3 terminales (terminado/desistido/archivado, 20260822340000). */
const ESTADOS_CASO_JURIDICO_ABIERTO = [
  'remitido',
  'documentacion',
  'radicado',
  'admitido',
  'en_tramite',
  'medidas_cautelares',
  'conciliacion',
  'sentencia',
  'ejecucion',
] as const

async function tieneCasoJuridicoAbierto(
  cliente: AquilaClient,
  tenantId: string,
  inmuebleId: string,
): Promise<boolean> {
  const { data, error } = await cliente
    .from('casos_juridicos')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('inmueble_id', inmuebleId)
    .in('estado', ESTADOS_CASO_JURIDICO_ABIERTO)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`No se pudo verificar el caso jurídico del inmueble ${inmuebleId}: ${error.message}`)
  return data !== null
}

async function tieneCertificacionVigente(
  cliente: AquilaClient,
  tenantId: string,
  inmuebleId: string,
): Promise<boolean> {
  const { data, error } = await cliente
    .from('certificaciones_deuda')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('inmueble_id', inmuebleId)
    .eq('estado', 'vigente')
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`No se pudo verificar la certificación del inmueble ${inmuebleId}: ${error.message}`)
  return data !== null
}

/**
 * CAR §34.2 I-C23. El conteo vive en SQL (fn_contar_acciones_acreditadas)
 * y no aquí: derivar la acreditación exige el último acuse de cada envío,
 * y traerse todos los acuses del inmueble para contarlos en TypeScript
 * sería una consulta N+1 disfrazada.
 */
async function contarAccionesAcreditadas(
  cliente: AquilaClient,
  tenantId: string,
  inmuebleId: string,
): Promise<number> {
  const { data, error } = await cliente.rpc('fn_contar_acciones_acreditadas', {
    p_tenant_id: tenantId,
    p_inmueble_id: inmuebleId,
  })
  if (error) throw new Error(`No se pudieron contar las acciones acreditadas del inmueble ${inmuebleId}: ${error.message}`)
  return data
}

async function obtenerPromesasPendientes(
  cliente: AquilaClient,
  tenantId: string,
  inmuebleId: string,
): Promise<PromesaPendiente[]> {
  const { data, error } = await cliente
    .from('promesas_pago')
    .select('id, estado, fecha_pago_prometida')
    .eq('tenant_id', tenantId)
    .eq('inmueble_id', inmuebleId)
    .eq('estado', 'pendiente')
  if (error) throw new Error(`No se pudieron leer las promesas del inmueble ${inmuebleId}: ${error.message}`)
  return data.map((p) => ({ id: p.id, estado: p.estado, fechaPagoPrometida: p.fecha_pago_prometida }))
}

async function obtenerCuotasDelAcuerdo(cliente: AquilaClient, acuerdoId: string): Promise<CuotaPendiente[]> {
  const { data, error } = await cliente
    .from('acuerdo_pago_cuotas')
    .select('id, acuerdo_id, estado, fecha_vencimiento')
    .eq('acuerdo_id', acuerdoId)
    .in('estado', ['pendiente', 'parcial'])
  if (error) throw new Error(`No se pudieron leer las cuotas del acuerdo ${acuerdoId}: ${error.message}`)
  return data.map((c) => ({ id: c.id, acuerdoId: c.acuerdo_id, estado: c.estado, fechaVencimiento: c.fecha_vencimiento }))
}

/**
 * "Agotada" = ejecutadas.length >= maxIntentos, mismo criterio que
 * ESTRATEGIA_AGOTADA (cartera-cobranza.ts) — no se recalcula todo
 * evaluarAccionesAplicables() aquí (esa función decide QUÉ ejecutar hoy,
 * algo que este job no hace, ver cabecera de cartera-job.ts); solo se
 * necesita el subconjunto "¿agotada?" que evaluarEscalamiento() consume.
 */
async function obtenerAccionesEjecutadasEnTramo(
  cliente: AquilaClient,
  opciones: {
    readonly tenantId: string
    readonly inmuebleId: string
    readonly politicaId: string
    readonly tramoCodigo: string
    readonly estrategias: readonly EstrategiaCobranza[]
  },
): Promise<ResumenAccion[]> {
  const delTramo = opciones.estrategias.filter((e) => e.tramoCodigo === opciones.tramoCodigo && e.activa)
  if (delTramo.length === 0) return []

  const { data, error } = await cliente
    .from('acciones_cobranza')
    .select('estrategia_id, estado')
    .eq('tenant_id', opciones.tenantId)
    .eq('inmueble_id', opciones.inmuebleId)
    .in(
      'estrategia_id',
      delTramo.map((e) => e.id),
    )
    .eq('estado', 'ejecutada')
  if (error) throw new Error(`No se pudo leer el historial de acciones del inmueble ${opciones.inmuebleId}: ${error.message}`)

  const ejecutadasPorEstrategia = new Map<string, number>()
  for (const fila of data) {
    if (fila.estrategia_id === null) continue
    ejecutadasPorEstrategia.set(fila.estrategia_id, (ejecutadasPorEstrategia.get(fila.estrategia_id) ?? 0) + 1)
  }
  return delTramo.map((e) => ({
    estrategiaId: e.id,
    agotada: (ejecutadasPorEstrategia.get(e.id) ?? 0) >= e.maxIntentos,
  }))
}

export interface OpcionesCargarEntradaInmueble {
  readonly tenantId: string
  readonly inmuebleId: string
  readonly fechaCorte: string
  readonly diasMoraMaximo: number
  readonly saldoVencido: string
  readonly politicaClasificacion: PoliticaClasificacion
  readonly clasificacionCodigo: string
  readonly estrategias: readonly EstrategiaCobranza[]
  /** CAR §12.2 — [CONFIG] de la copropiedad; sin config hoy, se pasa el default que el propio documento fija (0). */
  readonly toleranciaDiasPromesa: number
}

/**
 * Compone TODO lo que evaluarJobCarteraInmueble() necesita para un
 * inmueble — la etapa actual debe existir ya (el llamador la crea en
 * preventiva si es la primera vez, F6).
 */
export async function cargarEntradaJobCarteraInmueble(
  cliente: AquilaClient,
  opciones: OpcionesCargarEntradaInmueble,
): Promise<EntradaJobCarteraInmueble> {
  const etapaActual = await obtenerEtapaActual(cliente, opciones)
  if (etapaActual === null) {
    throw new Error(
      `El inmueble ${opciones.inmuebleId} no tiene fila en cartera_etapas todavía — créala en preventiva antes de evaluar.`,
    )
  }

  const [
    acuerdo,
    casoAbierto,
    certificacionVigente,
    promesasPendientes,
    accionesEjecutadasEnEtapa,
    accionesAcreditadas,
  ] = await Promise.all([
    tieneAcuerdoVigente(cliente, opciones.tenantId, opciones.inmuebleId),
    tieneCasoJuridicoAbierto(cliente, opciones.tenantId, opciones.inmuebleId),
    tieneCertificacionVigente(cliente, opciones.tenantId, opciones.inmuebleId),
    obtenerPromesasPendientes(cliente, opciones.tenantId, opciones.inmuebleId),
    obtenerAccionesEjecutadasEnTramo(cliente, {
      tenantId: opciones.tenantId,
      inmuebleId: opciones.inmuebleId,
      politicaId: opciones.politicaClasificacion.id,
      tramoCodigo: opciones.clasificacionCodigo,
      estrategias: opciones.estrategias,
    }),
    contarAccionesAcreditadas(cliente, opciones.tenantId, opciones.inmuebleId),
  ])

  const cuotasPendientesOParciales = acuerdo.vigente && acuerdo.acuerdoId
    ? await obtenerCuotasDelAcuerdo(cliente, acuerdo.acuerdoId)
    : []

  const historialAcciones = await obtenerHistorialAccionesCobranza(cliente, {
    tenantId: opciones.tenantId,
    inmuebleId: opciones.inmuebleId,
  })

  const diasEnTramoActual = await obtenerDiasEnTramoActual(cliente, {
    tenantId: opciones.tenantId,
    inmuebleId: opciones.inmuebleId,
    clasificacionCodigo: opciones.clasificacionCodigo,
    fechaCorte: opciones.fechaCorte,
  })

  // Relaciones persona-predio para resolver el destinatario (CAR §10.2).
  // Se leen SIN filtrar vigencia: quien decide con la fecha de corte es
  // resolverDestinatarios(), para que una corrida con fecha pasada dé el
  // mismo resultado que dio ese día (REC-CAR-008 / AD-32).
  const relaciones = await obtenerRelacionesInmueble(cliente, {
    tenantId: opciones.tenantId,
    inmuebleId: opciones.inmuebleId,
  })

  return {
    inmuebleId: opciones.inmuebleId,
    etapaActual,
    diasMoraMaximo: opciones.diasMoraMaximo,
    saldoVencido: Number(opciones.saldoVencido),
    politicaClasificacion: opciones.politicaClasificacion,
    accionesEjecutadasEnEtapa,
    tieneAcuerdoVigente: acuerdo.vigente,
    tieneCasoJuridicoAbierto: casoAbierto,
    tieneCertificacionVigente: certificacionVigente,
    accionesAcreditadas,
    promesasPendientes,
    cuotasPendientesOParciales,
    acuerdoVigenteId: acuerdo.acuerdoId,
    fechaCorte: opciones.fechaCorte,
    toleranciaDiasPromesa: opciones.toleranciaDiasPromesa,
    estrategias: opciones.estrategias,
    historialAcciones,
    relaciones,
    diasEnTramoActual,
    // El mínimo de CAR §9.3 ("no gastar una llamada en una deuda de
    // $2.000") se compara contra la deuda VENCIDA, no contra la total:
    // un inmueble al día con una cuota del próximo mes no debe disparar
    // gestión de cobro por el tamaño de esa cuota.
    deudaTotal: opciones.saldoVencido,
  }
}

/**
 * Días que el inmueble lleva en su clasificación actual, derivados de
 * `posiciones_cartera_snapshot` — que existe exactamente para esto
 * (CAR §6.3: "para BI, roll-rate y auditoría se necesita la foto de cada
 * día"). No hay columna de "fecha de ingreso al tramo" en el esquema y no
 * se inventa una: se cuenta hacia atrás la racha continua de snapshots con
 * la misma clasificación.
 *
 * Sin snapshots previos devuelve 0, que es la lectura correcta y no un
 * relleno: si nunca se fotografió este inmueble, hoy es el primer día del
 * que hay constancia en ese tramo. La consecuencia práctica —que en la
 * primera corrida solo disparen las estrategias con
 * `dias_desde_clasificacion = 0`— es deliberada: es preferible a fabricar
 * una antigüedad de tramo que nadie observó y disparar por ella un
 * requerimiento.
 */
async function obtenerDiasEnTramoActual(
  cliente: AquilaClient,
  opciones: {
    tenantId: string
    inmuebleId: string
    clasificacionCodigo: string
    fechaCorte: string
  },
): Promise<number> {
  const { data, error } = await cliente
    .from('posiciones_cartera_snapshot')
    .select('fecha_corte, clasificacion_codigo')
    .eq('tenant_id', opciones.tenantId)
    .eq('inmueble_id', opciones.inmuebleId)
    .lte('fecha_corte', opciones.fechaCorte)
    .order('fecha_corte', { ascending: false })

  if (error) {
    throw new Error(
      `No se pudo leer el histórico de clasificación del inmueble ${opciones.inmuebleId}: ${error.message}`,
    )
  }

  let inicioRacha: string | null = null
  for (const fila of data) {
    if (fila.clasificacion_codigo !== opciones.clasificacionCodigo) break
    inicioRacha = fila.fecha_corte
  }

  if (inicioRacha === null) return 0
  return diasCalendario(inicioRacha, opciones.fechaCorte)
}
