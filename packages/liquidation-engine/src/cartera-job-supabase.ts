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

  const [acuerdo, casoAbierto, certificacionVigente, promesasPendientes, accionesEjecutadasEnEtapa] = await Promise.all([
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
  ])

  const cuotasPendientesOParciales = acuerdo.vigente && acuerdo.acuerdoId
    ? await obtenerCuotasDelAcuerdo(cliente, acuerdo.acuerdoId)
    : []

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
    promesasPendientes,
    cuotasPendientesOParciales,
    acuerdoVigenteId: acuerdo.acuerdoId,
    fechaCorte: opciones.fechaCorte,
    toleranciaDiasPromesa: opciones.toleranciaDiasPromesa,
  }
}
