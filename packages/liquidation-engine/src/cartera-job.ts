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
  readonly promesasPendientes: readonly PromesaPendiente[]
  readonly cuotasPendientesOParciales: readonly CuotaPendiente[]
  readonly acuerdoVigenteId: string | null
  readonly fechaCorte: string
  readonly toleranciaDiasPromesa: number
}

export interface PlanJobCarteraInmueble {
  readonly inmuebleId: string
  readonly clasificacion: ResultadoClasificacion
  readonly decisionEscalamiento: DecisionEscalamiento
  readonly promesasIncumplidas: readonly CambioPromesa[]
  readonly cuotasVencidas: readonly CambioCuota[]
  readonly acuerdoIncumplido: CambioAcuerdo | null
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

  return {
    inmuebleId: entrada.inmuebleId,
    clasificacion,
    decisionEscalamiento,
    promesasIncumplidas,
    cuotasVencidas,
    acuerdoIncumplido,
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
