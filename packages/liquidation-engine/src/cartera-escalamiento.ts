/**
 * Motor de Escalamiento — máquina de estados de la etapa de cobranza
 * (Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §11). Puro, sin
 * Supabase — mismo nivel de pureza que cartera-cobranza.ts (D-14,
 * REC-CAR-009).
 *
 * Decide SI corresponde escalar/desescalar y si la transición exige
 * aprobación (REQ-CAR-011). Nunca ejecuta la transición ni escribe nada —
 * eso es responsabilidad de la capa de aplicación. La base de datos
 * (guard_cartera_etapa_transicion(), 20260822330000_cartera_escalamiento.sql)
 * es la última línea de defensa con la MISMA matriz espejada en PL/pgSQL —
 * cualquier cambio a TRANSICIONES_ETAPA_COBRANZA debe replicarse allá.
 */

import type { EtapaCobranza, ResultadoClasificacion } from './cartera.js'

export type { EtapaCobranza } from './cartera.js'

/** CAR §11.1 — orden de severidad de la máquina de estados, de menor a mayor. */
const ORDEN_ETAPAS: readonly EtapaCobranza[] = [
  'preventiva',
  'administrativa',
  'prejuridica',
  'juridica',
  'judicial',
]

export interface TransicionEtapaCobranza {
  readonly desde: EtapaCobranza
  readonly hacia: EtapaCobranza
  readonly requiereAprobacion: boolean
}

/**
 * CAR §11.3 — matriz explícita de transiciones permitidas. Cualquier par
 * (desde, hacia) que no esté aquí es un error y debe rechazarse — tanto
 * aquí como en la base de datos.
 */
export const TRANSICIONES_ETAPA_COBRANZA: readonly TransicionEtapaCobranza[] = [
  { desde: 'preventiva', hacia: 'administrativa', requiereAprobacion: false },
  { desde: 'administrativa', hacia: 'preventiva', requiereAprobacion: false },
  { desde: 'administrativa', hacia: 'prejuridica', requiereAprobacion: true },
  { desde: 'prejuridica', hacia: 'administrativa', requiereAprobacion: false },
  { desde: 'prejuridica', hacia: 'preventiva', requiereAprobacion: false },
  { desde: 'prejuridica', hacia: 'juridica', requiereAprobacion: true },
  { desde: 'juridica', hacia: 'judicial', requiereAprobacion: false },
  { desde: 'juridica', hacia: 'prejuridica', requiereAprobacion: true },
  { desde: 'juridica', hacia: 'preventiva', requiereAprobacion: true },
  { desde: 'judicial', hacia: 'preventiva', requiereAprobacion: true },
]

function buscarTransicion(desde: EtapaCobranza, hacia: EtapaCobranza): TransicionEtapaCobranza | undefined {
  return TRANSICIONES_ETAPA_COBRANZA.find((t) => t.desde === desde && t.hacia === hacia)
}

export interface ResumenAccion {
  readonly estrategiaId: string
  /** CAR §10.4: maxIntentos ya alcanzado para esta estrategia y este inmueble (ver cartera-cobranza.ts, ESTRATEGIA_AGOTADA). */
  readonly agotada: boolean
}

export interface ContextoEscalamiento {
  readonly etapaActual: EtapaCobranza
  readonly clasificacion: ResultadoClasificacion
  readonly saldoVencido: number
  /**
   * Acciones de la etapa actual, para decidir si ya se "agotaron" antes de
   * escalar a prejurídica (CAR §11.3). Interpretación (no explícita en la
   * spec): agotadas = hubo al menos una estrategia y TODAS están agotadas;
   * lista vacía (nada configurado/ejecutado todavía) NO cuenta como agotada
   * — no se puede agotar lo que nunca se intentó.
   */
  readonly accionesEjecutadasEnEtapa: readonly ResumenAccion[]
  /** CAR §12.5 — un acuerdo vigente congela la etapa, sin importar la clasificación. */
  readonly tieneAcuerdoVigente: boolean
  /** F7 (casos_juridicos) — no evaluado todavía por este motor; reservado para cuando exista. */
  readonly tieneCasoJuridicoAbierto: boolean
  /** CAR §11.3/PH-C20 — exige certificación de deuda vigente (art. 48) para prejuridica→juridica. Sin certificaciones_deuda (F7) esto siempre es false. */
  readonly tieneCertificacionVigente: boolean
}

export type DecisionEscalamiento =
  | { readonly tipo: 'permanecer' }
  | {
      readonly tipo: 'escalar'
      readonly hacia: EtapaCobranza
      readonly requiereAprobacion: boolean
      readonly motivo: string
    }
  | {
      readonly tipo: 'desescalar'
      readonly hacia: EtapaCobranza
      readonly requiereAprobacion: boolean
      readonly motivo: string
    }
  | { readonly tipo: 'congelar'; readonly motivo: string }
  | { readonly tipo: 'bloqueado'; readonly requisitoFaltante: string }

/**
 * Pura y determinista (CAR §11.4). Propone, nunca ejecuta — permite
 * simular sin efectos secundarios (necesario para PH-C27).
 *
 * Un paso de la matriz a la vez: si la clasificación sugiere una etapa
 * varios escalones más adelante que la actual, propone solo el siguiente
 * (CAR §11.3: "cualquier transición fuera de esta tabla es un error").
 * La excepción es el des-escalamiento total por saldo=0 (CAR §11.2), que
 * SÍ es directo desde cualquier etapa porque la matriz lo permite
 * explícitamente (todas las etapas tienen un borde directo a preventiva).
 */
export function evaluarEscalamiento(ctx: ContextoEscalamiento): DecisionEscalamiento {
  if (ctx.tieneAcuerdoVigente) {
    return { tipo: 'congelar', motivo: 'Acuerdo de pago vigente para este inmueble (CAR §12.5)' }
  }

  if (ctx.saldoVencido <= 0) {
    if (ctx.etapaActual === 'preventiva') return { tipo: 'permanecer' }
    return construirDecisionHacia(ctx.etapaActual, 'preventiva', 'Saldo vencido en cero (CAR §11.2)')
  }

  const idxActual = ORDEN_ETAPAS.indexOf(ctx.etapaActual)
  const idxObjetivo = ORDEN_ETAPAS.indexOf(ctx.clasificacion.etapaCobranza)

  if (idxObjetivo === idxActual) return { tipo: 'permanecer' }

  if (idxObjetivo > idxActual) {
    const siguiente = ORDEN_ETAPAS[idxActual + 1]
    if (siguiente === undefined) return { tipo: 'permanecer' } // ya en judicial, tope de la máquina

    if (siguiente === 'prejuridica' && !accionesAdministrativasAgotadas(ctx.accionesEjecutadasEnEtapa)) {
      return { tipo: 'bloqueado', requisitoFaltante: 'Acciones administrativas sin agotar (CAR §11.3)' }
    }
    if (siguiente === 'juridica' && !ctx.tieneCertificacionVigente) {
      return {
        tipo: 'bloqueado',
        requisitoFaltante: 'Certificación de deuda vigente (art. 48, CAR §11.3/PH-C20)',
      }
    }

    return construirDecisionHacia(
      ctx.etapaActual,
      siguiente,
      `Clasificación alcanzó el tramo '${ctx.clasificacion.codigo}' (${ctx.clasificacion.etapaCobranza})`,
    )
  }

  const anterior = ORDEN_ETAPAS[idxActual - 1]
  if (anterior === undefined) return { tipo: 'permanecer' }
  if (buscarTransicion(ctx.etapaActual, anterior) === undefined) return { tipo: 'permanecer' }

  return construirDecisionHacia(
    ctx.etapaActual,
    anterior,
    `Clasificación descendió al tramo '${ctx.clasificacion.codigo}' (${ctx.clasificacion.etapaCobranza})`,
  )
}

function accionesAdministrativasAgotadas(acciones: readonly ResumenAccion[]): boolean {
  return acciones.length > 0 && acciones.every((a) => a.agotada)
}

function construirDecisionHacia(
  etapaActual: EtapaCobranza,
  hacia: EtapaCobranza,
  motivo: string,
): DecisionEscalamiento {
  const transicion = buscarTransicion(etapaActual, hacia)
  if (transicion === undefined) return { tipo: 'permanecer' }

  const tipo = ORDEN_ETAPAS.indexOf(hacia) > ORDEN_ETAPAS.indexOf(etapaActual) ? 'escalar' : 'desescalar'
  return { tipo, hacia, requiereAprobacion: transicion.requiereAprobacion, motivo }
}
