/**
 * Contrato de explicación estructurada (ENFOQUE_CONSOLIDACION, Ola 2 §2 —
 * 07_PROMPT_O2_EXPLICACION_ACCION.md).
 *
 * Se deriva de lo que el paso 0 (variación de cartera) realmente necesitó
 * para responder «¿por qué cambió?»: un titular, una composición, una
 * concentración, lo que ya se sabía y un residuo — no de la taxonomía
 * completa que el corpus original imagina antes de tener un caso real. Por
 * eso el contrato es solo `Afirmacion[]`, cada una con su nivel de certeza
 * y su evidencia rastreable, no un árbol de explicación con causalidad.
 *
 * Precedente en el repositorio: `FactorExplicacion` en
 * `packages/liquidation-engine/src/conciliacion-matching.ts` (factor +
 * detalle + aporte numérico) ya explica una decisión con evidencia
 * ponderada. Este contrato es más general —cubre "no se puede concluir"
 * además de "esto pesó tanto"— porque una situación puede no tener nada
 * que pesar (DI-08: información insuficiente es una respuesta legítima).
 */

/**
 * hecho: dato verificable del dominio, sin cálculo intermedio.
 * calculo: resultado producido por las reglas del dominio (nunca recalculado
 *   aquí — DI-04: esta capa solo tipa y redacta lo que el dominio ya produjo).
 * inferencia: derivación de hechos o cálculos existentes (p. ej. concentración).
 * hipotesis: correlación observada, sin causalidad demostrada — nunca se
 *   redacta como si el dominio la hubiera probado.
 * informacion_insuficiente: no se puede concluir con los datos disponibles.
 *   Un residuo grande se declara así, nunca se reparte ni se esconde.
 */
export type TipoCerteza = 'hecho' | 'calculo' | 'inferencia' | 'hipotesis' | 'informacion_insuficiente'

/**
 * A qué dato real se puede rastrear una afirmación — nunca una copia del
 * dato, siempre un puntero. `id` es `null` cuando la afirmación es agregada
 * (p. ej. "la cartera vencida aumentó $X") y no corresponde a una sola fila.
 */
export interface Evidencia {
  readonly entidad: string
  readonly id: string | null
  readonly fuente: string
  readonly fechaCorte: string | null
}

export interface Afirmacion {
  readonly tipo: TipoCerteza
  /** Redactado con plantilla + valores reales del dominio — nunca prosa de
   *  modelo de lenguaje (DI-03, ola 3). */
  readonly texto: string
  readonly evidencia: Evidencia
}

export interface Explicacion {
  readonly origenModulo: string
  readonly origenEntidad: string
  readonly origenId: string
  readonly afirmaciones: readonly Afirmacion[]
}

// ═══════════════════════════════════════════════════════════════════════
// Segundo dominio: alertas de liquidez (FIN-4) — Ola 2 §2, segundo
// productor exigido por el entregable 2 del prompt.
//
// A diferencia de cartera (una comparación entre dos cortes, con un
// módulo puro dedicado en liquidation-engine), FIN-4 ya decidió que
// finanzas_alerta_regla/finanzas_alerta_emitida se leen directo por RLS
// desde apps/web/app/stores/finanzasFlujo.ts — sin Edge Function ni
// módulo de liquidation-engine (ver la cabecera de ese store). Este
// mapper sigue esa misma convención: vive en shared, no en
// liquidation-engine, porque no hay boundary D-14 que cruzar aquí.
//
// finanzas_alertas_evaluar() (20260932620000) ya decide, por
// tipo_codigo, qué significa cada alerta y arma `detalle` jsonb — este
// mapper NO reinterpreta el disparo (DI-04): solo redacta con plantilla
// lo que esa función ya calculó, leyendo las claves que ella misma
// escribió. Un tipo_codigo desconocido o un detalle con una clave
// faltante nunca lanza: se declara informacion_insuficiente, mismo
// principio que el residuo de cartera — no se inventa un texto sobre un
// dato que no está.
// ═══════════════════════════════════════════════════════════════════════

export type TipoAlertaLiquidez =
  | 'saldo_30d_bajo_umbral'
  | 'saldo_30d_negativo'
  | 'flujo_neto_negativo_n_semanas'
  | 'cxp_vencida_sin_lote'
  | 'cartera_vencida_deteriorando'

export interface AlertaLiquidezEmitida {
  readonly tipoCodigo: string
  readonly nombreRegla: string
  readonly fechaEmision: string
  /** `finanzas_alerta_emitida.detalle` tal como lo escribió
   *  finanzas_alertas_evaluar() — forma distinta por tipoCodigo. */
  readonly detalle: Readonly<Record<string, unknown>>
}

function numeroDe(detalle: Readonly<Record<string, unknown>>, clave: string): number | null {
  const valor = detalle[clave]
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

function evidenciaLiquidez(alerta: AlertaLiquidezEmitida): Evidencia {
  return {
    entidad: 'finanzas_alerta_emitida',
    id: null,
    fuente: 'finanzas_alertas_evaluar',
    fechaCorte: alerta.fechaEmision,
  }
}

function afirmacionInsuficiente(alerta: AlertaLiquidezEmitida, razon: string): Afirmacion {
  return {
    tipo: 'informacion_insuficiente',
    texto: `La regla "${alerta.nombreRegla}" se disparó, pero ${razon}: no se puede explicar con el detalle disponible.`,
    evidencia: evidenciaLiquidez(alerta),
  }
}

/**
 * Arma las afirmaciones de una alerta de liquidez ya emitida. Pura: no
 * llama a finanzas_alertas_evaluar de nuevo (DI-04, DI-09 — detectar no
 * es explicar dos veces), solo lee lo que esa función ya dejó en
 * `detalle`. Sin formateo de moneda con separadores, mismo criterio que
 * explicarVariacionCartera.
 */
export function explicarAlertaLiquidez(alerta: AlertaLiquidezEmitida): Afirmacion[] {
  const evidencia = evidenciaLiquidez(alerta)

  switch (alerta.tipoCodigo as TipoAlertaLiquidez) {
    case 'saldo_30d_bajo_umbral': {
      const saldo = numeroDe(alerta.detalle, 'saldo_acumulado_30d')
      const umbral = numeroDe(alerta.detalle, 'umbral')
      if (saldo === null || umbral === null) return [afirmacionInsuficiente(alerta, 'falta el saldo o el umbral proyectados')]
      return [
        {
          tipo: 'calculo',
          texto: `El saldo proyectado a 30 días (${String(saldo)}) está por debajo del umbral de la regla "${alerta.nombreRegla}" (${String(umbral)}).`,
          evidencia,
        },
      ]
    }
    case 'saldo_30d_negativo': {
      const saldo = numeroDe(alerta.detalle, 'saldo_acumulado_30d')
      if (saldo === null) return [afirmacionInsuficiente(alerta, 'falta el saldo proyectado')]
      return [
        {
          tipo: 'calculo',
          texto: `El saldo proyectado a 30 días es negativo (${String(saldo)}).`,
          evidencia,
        },
      ]
    }
    case 'flujo_neto_negativo_n_semanas': {
      const semanas = numeroDe(alerta.detalle, 'semanas_negativas')
      const umbralSemanas = numeroDe(alerta.detalle, 'umbral_semanas')
      if (semanas === null || umbralSemanas === null) {
        return [afirmacionInsuficiente(alerta, 'falta el conteo de semanas con flujo neto negativo')]
      }
      return [
        {
          tipo: 'inferencia',
          texto: `${String(semanas)} semanas con flujo neto negativo alcanzan o superan el umbral de la regla "${alerta.nombreRegla}" (${String(umbralSemanas)}).`,
          evidencia,
        },
      ]
    }
    case 'cxp_vencida_sin_lote': {
      const monto = numeroDe(alerta.detalle, 'cxp_vencida_sin_lote')
      const umbral = numeroDe(alerta.detalle, 'umbral')
      if (monto === null || umbral === null) return [afirmacionInsuficiente(alerta, 'falta el monto de cuentas por pagar o el umbral')]
      return [
        {
          tipo: 'calculo',
          texto: `Hay ${String(monto)} en cuentas por pagar vencidas sin lote de pago, por encima del umbral de la regla "${alerta.nombreRegla}" (${String(umbral)}).`,
          evidencia,
        },
      ]
    }
    case 'cartera_vencida_deteriorando': {
      const actual = numeroDe(alerta.detalle, 'deuda_vencida_actual')
      const anterior = numeroDe(alerta.detalle, 'deuda_vencida_anterior')
      if (actual === null || anterior === null) {
        return [afirmacionInsuficiente(alerta, 'falta la comparación de deuda vencida entre los dos meses')]
      }
      return [
        {
          tipo: 'inferencia',
          texto: `La deuda vencida pasó de ${String(anterior)} a ${String(actual)} entre los dos últimos meses: va en deterioro.`,
          evidencia,
        },
      ]
    }
    default:
      return [afirmacionInsuficiente(alerta, `el tipo de regla "${alerta.tipoCodigo}" no tiene una plantilla de explicación`)]
  }
}
