/**
 * JOB_CARTERA_DIARIA — orquestación pura de la corrida diaria de cartera
 * (Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §18). Puro, sin
 * Supabase — mismo nivel de pureza que cartera.ts/cartera-escalamiento.ts
 * (D-14, REC-CAR-009). Esto ES "modo simulación" (§18.1): computa qué
 * cambiaría sin escribir nada — el llamador (cartera-job-supabase.ts)
 * decide si persistir.
 *
 * REC-CAR-008: fecha_corte es un parámetro explícito de cada evaluación,
 * nunca la fecha del sistema.
 *
 * Alcance deliberadamente acotado — lo que este módulo NO hace:
 *
 * - No crea acciones_cobranza. evaluarAccionesAplicables() (cartera-
 *   cobranza.ts) ya decide QUÉ estrategias corresponden, pero crear la
 *   acción exige resolver un destinatario real (destinatario_tercero_id/
 *   destinatario_rol_codigo) — qué relación de inmueble_persona_rol
 *   corresponde a "residente"/"administrador_copropiedad"
 *   (SMS_EVENT_RECIPIENTS, packages/shared/src/sms.ts), con cuál si hay
 *   varios (solidaridad proporcional, CAR §21). Esa resolución no existe
 *   en ningún punto del código todavía (ejecutar-accion-cobranza.ts
 *   asume una fila ya creada con destinatario ya resuelto — nunca la
 *   crea). Inventar una convención aquí sin ese diseño sería fabricar
 *   quién recibe un cobro, no una decisión de bajo riesgo. Pieza
 *   siguiente, no esta.
 * - No "descongela" cartera_etapas explícitamente: CARTERA_ETAPA_
 *   CONGELADA (F6) consulta acuerdos_pago en vivo, así que un acuerdo
 *   que pasa a incumplido/cumplido levanta el congelamiento como efecto
 *   secundario natural, sin acción aparte.
 * - No marca cuotas 'incumplida' (solo 'vencida'): el guard de
 *   acuerdo_pago_cuotas (20260822310000) modela vencida→incumplida como
 *   una transición separada, pero el documento nunca definió el umbral
 *   de días entre una y otra. No se inventa ese número — 'incumplida'
 *   queda para cuando exista ese criterio.
 */
import type {
  AccionHistorica,
  AccionOmitida,
  CanalCobranza,
  EstrategiaCobranza,
  TipoAccionCobranza,
} from './cartera-cobranza.js'
import { evaluarAccionesAplicables } from './cartera-cobranza.js'
import type { DestinatarioResuelto, RelacionInmueblePersona } from './cartera-destinatarios.js'
import { resolverDestinatarios } from './cartera-destinatarios.js'
import type { EtapaCobranza, ResultadoClasificacion } from './cartera.js'
import { clasificarCartera, type PoliticaClasificacion } from './cartera.js'
import { evaluarEscalamiento, type ContextoEscalamiento, type DecisionEscalamiento, type ResumenAccion } from './cartera-escalamiento.js'
import { diasCalendario } from './cuenta-corriente.js'
import { createHash } from 'node:crypto'

// ── Promesas de pago ────────────────────────────────────────────────────

export interface PromesaPendiente {
  readonly id: string
  readonly estado: 'pendiente' | 'cumplida' | 'incumplida' | 'cancelada'
  readonly fechaPagoPrometida: string
}

/** CAR §12.2 — "Por defecto: 0 días, 0%. (estricto)". toleranciaDias es [CONFIG], sin config hoy = 0 literal (el default que el propio documento fija, no uno inventado). */
export function evaluarPromesaIncumplida(
  promesa: PromesaPendiente,
  fechaCorte: string,
  toleranciaDias: number,
): boolean {
  if (promesa.estado !== 'pendiente') return false
  return diasCalendario(promesa.fechaPagoPrometida, fechaCorte) > toleranciaDias
}

// ── Cuotas de acuerdo de pago ────────────────────────────────────────────

export interface CuotaPendiente {
  readonly id: string
  readonly acuerdoId: string
  readonly estado: 'pendiente' | 'parcial' | 'pagada' | 'vencida' | 'incumplida' | 'cancelada'
  readonly fechaVencimiento: string
}

/** Sin tolerancia: fecha_corte posterior a fecha_vencimiento es, por definición, vencida. */
export function evaluarCuotaVencida(cuota: CuotaPendiente, fechaCorte: string): boolean {
  if (cuota.estado !== 'pendiente' && cuota.estado !== 'parcial') return false
  return diasCalendario(cuota.fechaVencimiento, fechaCorte) > 0
}

export interface CambioPromesa {
  readonly promesaId: string
  readonly nuevoEstado: 'incumplida'
}

export interface CambioCuota {
  readonly cuotaId: string
  readonly nuevoEstado: 'vencida'
}

export interface CambioAcuerdo {
  readonly acuerdoId: string
  readonly nuevoEstado: 'incumplido'
}

/** CAR §19.2/19.3 — insumo para el evento CARTERA_CLASIFICACION_CAMBIO (estado_anterior). */
export interface ClasificacionAnterior {
  readonly codigo: string
  readonly diasMora: number
}

/** §18.2 paso 8. null = no hubo cambio (sin snapshot previo, o mismo código que hoy). */
export interface CambioClasificacion {
  readonly codigoAnterior: string
  readonly diasMoraAnterior: number
  readonly codigoNuevo: string
  readonly diasMoraNuevo: number
}

// ── Orquestador por inmueble ─────────────────────────────────────────────

export interface EntradaJobCarteraInmueble {
  readonly inmuebleId: string
  readonly etapaActual: EtapaCobranza
  readonly diasMoraMaximo: number
  readonly saldoVencido: number
  readonly politicaClasificacion: PoliticaClasificacion
  readonly accionesEjecutadasEnEtapa: readonly ResumenAccion[]
  readonly tieneAcuerdoVigente: boolean
  readonly tieneCasoJuridicoAbierto: boolean
  readonly tieneCertificacionVigente: boolean
  /** CAR §34.2 I-C23 — acciones del inmueble acreditadas por acuse técnico. Ver ContextoEscalamiento. */
  readonly accionesAcreditadas: number
  readonly promesasPendientes: readonly PromesaPendiente[]
  readonly cuotasPendientesOParciales: readonly CuotaPendiente[]
  readonly acuerdoVigenteId: string | null
  readonly fechaCorte: string
  readonly toleranciaDiasPromesa: number
  /** Estrategias vigentes del tenant — CAR §9.3. */
  readonly estrategias: readonly EstrategiaCobranza[]
  /** Historial de acciones del inmueble, para la anti-duplicación de §10.4. */
  readonly historialAcciones: readonly AccionHistorica[]
  /** Relaciones persona-predio con contacto, para resolver el destinatario. */
  readonly relaciones: readonly RelacionInmueblePersona[]
  readonly diasEnTramoActual: number
  /** Decimal string — la deuda que compara contra monto_minimo_deuda. */
  readonly deudaTotal: string
  /** §18.2 paso 8 — clasificación del snapshot inmediatamente anterior a fechaCorte
   * (posiciones_cartera_snapshot). null = sin snapshot previo (primera corrida de este
   * inmueble): no hay "cambio" que reportar, ninguna clasificación anterior que fabricar. */
  readonly clasificacionAnterior: ClasificacionAnterior | null
}

/** Acción que corresponde disparar, ya con el "a quién" resuelto. */
export interface AccionConDestinatarios {
  readonly estrategiaId: string
  readonly tipoAccion: TipoAccionCobranza
  readonly canal: CanalCobranza
  readonly intentoNumero: number
  readonly requiereAprobacion: boolean
  /**
   * Uno o más. Cada elemento produce una fila de acciones_cobranza; el
   * llamador las une con un grupo_envio_id para conservar una evidencia
   * por persona (CAR §34.3, regla R2).
   */
  readonly destinatarios: readonly DestinatarioResuelto[]
}

/**
 * Correspondía disparar la acción, pero no se pudo resolver a quién.
 * Se reporta explícitamente en vez de omitirse en silencio: un inmueble
 * que nunca recibe cobros porque su ficha está incompleta es un problema
 * que hay que ver, no un vacío en la bandeja.
 */
export interface AccionBloqueada {
  readonly estrategiaId: string
  readonly tipoAccion: TipoAccionCobranza
  readonly canal: CanalCobranza
  readonly causa: 'sin_destinatario' | 'contacto_faltante' | 'no_aplica'
  readonly motivo: string
}

export interface PlanJobCarteraInmueble {
  readonly inmuebleId: string
  readonly clasificacion: ResultadoClasificacion
  readonly decisionEscalamiento: DecisionEscalamiento
  readonly promesasIncumplidas: readonly CambioPromesa[]
  readonly cuotasVencidas: readonly CambioCuota[]
  readonly acuerdoIncumplido: CambioAcuerdo | null
  /** §18.2 paso 8 — CARTERA_CLASIFICACION_CAMBIO. null = sin cambio (o sin snapshot previo). */
  readonly cambioClasificacion: CambioClasificacion | null
  /** §18.2 pasos 14-16 — lo que faltaba para que el job creara acciones. */
  readonly accionesPropuestas: readonly AccionConDestinatarios[]
  readonly accionesOmitidas: readonly AccionOmitida[]
  readonly accionesBloqueadas: readonly AccionBloqueada[]
}

/**
 * Compone clasificarCartera() + evaluarEscalamiento() (ya existentes,
 * REC-CAR-004: no se recalculan) con la evaluación de promesas/cuotas de
 * este módulo. Pura y determinista — el mismo insumo siempre produce el
 * mismo plan, sin importar cuántas veces se llame (PH-C33).
 */
export function evaluarJobCarteraInmueble(entrada: EntradaJobCarteraInmueble): PlanJobCarteraInmueble {
  const clasificacion = clasificarCartera(entrada.diasMoraMaximo, entrada.politicaClasificacion)

  const contextoEscalamiento: ContextoEscalamiento = {
    etapaActual: entrada.etapaActual,
    clasificacion,
    saldoVencido: entrada.saldoVencido,
    accionesEjecutadasEnEtapa: entrada.accionesEjecutadasEnEtapa,
    tieneAcuerdoVigente: entrada.tieneAcuerdoVigente,
    tieneCasoJuridicoAbierto: entrada.tieneCasoJuridicoAbierto,
    tieneCertificacionVigente: entrada.tieneCertificacionVigente,
    accionesAcreditadas: entrada.accionesAcreditadas,
  }
  const decisionEscalamiento = evaluarEscalamiento(contextoEscalamiento)

  const promesasIncumplidas: CambioPromesa[] = entrada.promesasPendientes
    .filter((p) => evaluarPromesaIncumplida(p, entrada.fechaCorte, entrada.toleranciaDiasPromesa))
    .map((p) => ({ promesaId: p.id, nuevoEstado: 'incumplida' as const }))

  const cuotasVencidas: CambioCuota[] = entrada.cuotasPendientesOParciales
    .filter((c) => evaluarCuotaVencida(c, entrada.fechaCorte))
    .map((c) => ({ cuotaId: c.id, nuevoEstado: 'vencida' as const }))

  // Interpretación explícita (no literal de la spec, igual que "agotadas" en
  // cartera-escalamiento.ts): el acuerdo vigente se declara incumplido apenas
  // UNA cuota propia queda vencida — estricto, sin período de gracia inventado.
  const acuerdoIncumplido: CambioAcuerdo | null =
    entrada.acuerdoVigenteId !== null &&
    cuotasVencidas.some((c) =>
      entrada.cuotasPendientesOParciales.find((original) => original.id === c.cuotaId)?.acuerdoId ===
        entrada.acuerdoVigenteId,
    )
      ? { acuerdoId: entrada.acuerdoVigenteId, nuevoEstado: 'incumplido' as const }
      : null

  // §18.2 paso 8 — CARTERA_CLASIFICACION_CAMBIO. Sin snapshot previo (primera
  // corrida) no hay "cambio": lo correcto es no reportar nada, no fabricar un
  // "anterior" que nadie observó (mismo criterio que diasEnTramoActual=0).
  const cambioClasificacion: CambioClasificacion | null =
    entrada.clasificacionAnterior !== null && entrada.clasificacionAnterior.codigo !== clasificacion.codigo
      ? {
          codigoAnterior: entrada.clasificacionAnterior.codigo,
          diasMoraAnterior: entrada.clasificacionAnterior.diasMora,
          codigoNuevo: clasificacion.codigo,
          diasMoraNuevo: clasificacion.diasMora,
        }
      : null

  // §18.2 pasos 14-16. Dos decisiones separadas y en este orden: primero
  // QUÉ corresponde disparar (evaluarAccionesAplicables, ya existente) y
  // solo después A QUIÉN (resolverDestinatarios). Invertirlas llevaría a
  // no disparar una acción debida porque falta un contacto, que es un
  // problema de datos y no una razón para dejar de cobrar.
  const evaluacion = evaluarAccionesAplicables({
    clasificacionCodigo: clasificacion.codigo,
    diasEnTramoActual: entrada.diasEnTramoActual,
    deudaTotal: entrada.deudaTotal,
    estrategias: entrada.estrategias,
    historialAcciones: entrada.historialAcciones,
    fechaCorte: entrada.fechaCorte,
    tieneAcuerdoVigente: entrada.tieneAcuerdoVigente,
  })

  const accionesPropuestas: AccionConDestinatarios[] = []
  const accionesBloqueadas: AccionBloqueada[] = []

  for (const propuesta of evaluacion.propuestas) {
    const estrategia = entrada.estrategias.find((e) => e.id === propuesta.estrategiaId)
    // No debería ocurrir — la propuesta nace de esa misma lista —, pero
    // fabricar un canal por defecto aquí sería inventar por dónde se le
    // cobra a una persona.
    if (!estrategia) continue

    const resolucion = resolverDestinatarios({
      relaciones: entrada.relaciones,
      tipoAccion: propuesta.tipoAccion,
      canal: estrategia.canal,
      fechaCorte: entrada.fechaCorte,
    })

    if (resolucion.tipo === 'resuelto') {
      accionesPropuestas.push({
        estrategiaId: propuesta.estrategiaId,
        tipoAccion: propuesta.tipoAccion,
        canal: estrategia.canal,
        intentoNumero: propuesta.intentoNumero,
        requiereAprobacion: propuesta.requiereAprobacion,
        destinatarios: resolucion.destinatarios,
      })
    } else {
      accionesBloqueadas.push({
        estrategiaId: propuesta.estrategiaId,
        tipoAccion: propuesta.tipoAccion,
        canal: estrategia.canal,
        causa: resolucion.tipo,
        motivo: resolucion.motivo,
      })
    }
  }

  return {
    inmuebleId: entrada.inmuebleId,
    clasificacion,
    decisionEscalamiento,
    promesasIncumplidas,
    cuotasVencidas,
    acuerdoIncumplido,
    cambioClasificacion,
    accionesPropuestas,
    accionesOmitidas: evaluacion.omitidas,
    accionesBloqueadas,
  }
}

/**
 * PH-C33 — hash determinista del resultado agregado de una corrida: los
 * mismos datos de entrada, en cualquier orden, siempre producen el mismo
 * hash (se ordena por inmuebleId antes de serializar). Verificar
 * reproducibilidad es correr el job dos veces y comparar este valor, no
 * solo "confiar" en que no cambió.
 */
export function calcularResultadoJobHash(planes: readonly PlanJobCarteraInmueble[]): string {
  const ordenados = [...planes].sort((a, b) => a.inmuebleId.localeCompare(b.inmuebleId))
  const canonico = JSON.stringify(
    ordenados.map((p) => ({
      inmuebleId: p.inmuebleId,
      clasificacionCodigo: p.clasificacion.codigo,
      etapaCobranza: p.clasificacion.etapaCobranza,
      decisionEscalamiento: p.decisionEscalamiento,
      promesasIncumplidas: [...p.promesasIncumplidas].map((c) => c.promesaId).sort(),
      cuotasVencidas: [...p.cuotasVencidas].map((c) => c.cuotaId).sort(),
      acuerdoIncumplido: p.acuerdoIncumplido,
    })),
  )
  return createHash('sha256').update(canonico).digest('hex')
}
