/**
 * Variación de cartera entre dos cortes — "¿por qué cambió la cartera?"
 * (ENFOQUE_CONSOLIDACION, paso 0). Puro, sin Supabase — mismo nivel de
 * pureza que cartera-dashboard.ts (D-14, vigilado por eslint.config.js).
 *
 * DB-FIRST: la comparación ya viene hecha. fn_variacion_cartera
 * (20260934050000) hace el FULL OUTER JOIN entre los dos cortes y cuenta
 * los eventos por inmueble; este módulo recibe una fila por inmueble ya
 * comparada y solo suma, clasifica y arma la presentación — igual que
 * calcularDashboardCartera() trabaja sobre las filas que fn_dashboard_
 * cartera ya agregó (REC-CAR-004).
 *
 * NO RECALCULA NADA FINANCIERO (DI-04). Ni siquiera define qué es una
 * deuda vencida: eso lo decide fn_dashboard_cartera, a la que la función
 * SQL llama dos veces.
 *
 * DENOMINADOR CERO → null, NO 0% (REC-CAR-004, mismo criterio que el resto
 * de cartera): si el corte anterior era cero, el porcentaje de cambio es
 * indeterminado, no "infinito" ni "100%".
 *
 * GAP-CAR-001 se respeta en toda la línea: lo sin vencimiento se compara
 * aparte y nunca se funde con lo corriente.
 */
import { isZeroMoney, money, type Money } from '@aquila/financial-kernel'
import * as fos from '@aquila/financial-kernel'
import type { EtapaCobranza } from './cartera.js'

/** Umbral de concentración: cuántos inmuebles explican esta fracción del incremento. */
const PCT_CONCENTRACION = 80

/** Una fila de fn_variacion_cartera: un inmueble, ya comparado entre los dos cortes. */
export interface FilaVariacionCartera {
  readonly inmuebleId: string
  readonly codigo: string
  readonly vencidaAnterior: Money
  readonly vencidaActual: Money
  readonly totalAnterior: Money
  readonly totalActual: Money
  readonly corrienteAnterior: Money
  readonly corrienteActual: Money
  readonly sinVencimientoAnterior: Money
  readonly sinVencimientoActual: Money
  readonly interesAnterior: Money
  readonly interesActual: Money
  readonly diasMoraMaximo: number
  readonly etapaCobranza: EtapaCobranza
  /** 0 = el saldo cambió sin evento registrado que lo explique. */
  readonly eventosEnPeriodo: number
}

export interface DeltaMonetario {
  readonly anterior: Money
  readonly actual: Money
  /** actual − anterior. Negativo significa que bajó. */
  readonly delta: Money
  /** null cuando `anterior` es cero: sin base de comparación (REC-CAR-004). */
  readonly pctCambio: number | null
}

/**
 * Cómo cambió un inmueble. Se deriva solo de los dos saldos — no hay
 * política ni umbral detrás, a propósito: clasificar "gravedad" es
 * competencia de politicas_clasificacion_cartera (F1), no de este reporte.
 */
export type ClaseContribuyente = 'nuevo' | 'empeoro' | 'mejoro' | 'resuelto' | 'sin_cambio'

export interface ContribuyenteVariacion {
  readonly inmuebleId: string
  readonly codigo: string
  readonly vencidaAnterior: Money
  readonly vencidaActual: Money
  readonly delta: Money
  readonly clase: ClaseContribuyente
  readonly diasMoraMaximo: number
  readonly etapaCobranza: EtapaCobranza
  readonly eventosEnPeriodo: number
}

export interface ConcentracionVariacion {
  /** Cuántos inmuebles que empeoraron explican PCT_CONCENTRACION del incremento bruto. */
  readonly inmuebles: number
  readonly monto: Money
  /** Fracción real alcanzada por esos inmuebles. null si no hubo incremento bruto. */
  readonly pctDelIncremento: number | null
  readonly umbralPct: number
}

export interface ConteosVariacion {
  readonly nuevos: number
  readonly empeoraron: number
  readonly mejoraron: number
  readonly resueltos: number
  readonly sinCambio: number
}

/**
 * Inmuebles que empeoraron, separados según tengan o no algún evento que
 * acompañe el cambio. `sinExplicar` es el residuo y se muestra: significa
 * que la cartera se movió sin que quedara rastro de por qué.
 */
export interface AtribucionEventos {
  readonly explicado: { readonly inmuebles: number; readonly monto: Money }
  readonly sinExplicar: { readonly inmuebles: number; readonly monto: Money }
}

export interface VariacionCartera {
  readonly moneda: string
  readonly total: DeltaMonetario
  readonly vencida: DeltaMonetario
  readonly corriente: DeltaMonetario
  readonly sinVencimiento: DeltaMonetario
  readonly interesCausado: DeltaMonetario
  /**
   * Suma de los deltas positivos. No es el delta neto: separar lo que
   * subió de lo que bajó es lo que permite decir "aumentó X aunque N
   * inmuebles se pusieron al día".
   */
  readonly incrementoBruto: Money
  /** Suma de los deltas negativos, en valor absoluto. */
  readonly reduccionBruta: Money
  /** Solo los que subieron, de mayor a menor aporte. */
  readonly contribuyentes: readonly ContribuyenteVariacion[]
  readonly concentracion: ConcentracionVariacion
  readonly conteos: ConteosVariacion
  readonly atribucion: AtribucionEventos
  readonly inmueblesComparados: number
}

function delta(anterior: Money, actual: Money): DeltaMonetario {
  const diferencia = fos.restar(actual, anterior)
  const pctCambio = isZeroMoney(anterior)
    ? null
    : fos.dividirDecimales(diferencia.amount, anterior.amount).times(100).toNumber()
  return { anterior, actual, delta: diferencia, pctCambio }
}

function clasificar(anterior: Money, actual: Money): ClaseContribuyente {
  const comparacion = fos.comparar(actual, anterior)
  if (comparacion === 0) return 'sin_cambio'
  if (comparacion > 0) return isZeroMoney(anterior) ? 'nuevo' : 'empeoro'
  return isZeroMoney(actual) ? 'resuelto' : 'mejoro'
}

/**
 * Arma la variación a partir de las filas que fn_variacion_cartera ya
 * comparó. Los totales se suman aquí sobre filas ya agregadas por
 * inmueble, mismo reparto de trabajo que calcularDashboardCartera().
 */
export function calcularVariacionCartera(
  filas: readonly FilaVariacionCartera[],
  moneda: string,
): VariacionCartera {
  const cero = money(0, moneda)

  let vencidaAnterior = cero
  let vencidaActual = cero
  let totalAnterior = cero
  let totalActual = cero
  let corrienteAnterior = cero
  let corrienteActual = cero
  let sinVencAnterior = cero
  let sinVencActual = cero
  let interesAnterior = cero
  let interesActual = cero
  let incrementoBruto = cero
  let reduccionBruta = cero
  let montoExplicado = cero
  let montoSinExplicar = cero
  let inmueblesExplicados = 0
  let inmueblesSinExplicar = 0

  const conteos = { nuevos: 0, empeoraron: 0, mejoraron: 0, resueltos: 0, sinCambio: 0 }
  const contribuyentes: ContribuyenteVariacion[] = []

  for (const fila of filas) {
    vencidaAnterior = fos.sumar(vencidaAnterior, fila.vencidaAnterior)
    vencidaActual = fos.sumar(vencidaActual, fila.vencidaActual)
    totalAnterior = fos.sumar(totalAnterior, fila.totalAnterior)
    totalActual = fos.sumar(totalActual, fila.totalActual)
    corrienteAnterior = fos.sumar(corrienteAnterior, fila.corrienteAnterior)
    corrienteActual = fos.sumar(corrienteActual, fila.corrienteActual)
    sinVencAnterior = fos.sumar(sinVencAnterior, fila.sinVencimientoAnterior)
    sinVencActual = fos.sumar(sinVencActual, fila.sinVencimientoActual)
    interesAnterior = fos.sumar(interesAnterior, fila.interesAnterior)
    interesActual = fos.sumar(interesActual, fila.interesActual)

    const diferencia = fos.restar(fila.vencidaActual, fila.vencidaAnterior)
    const clase = clasificar(fila.vencidaAnterior, fila.vencidaActual)

    if (clase === 'nuevo') conteos.nuevos += 1
    else if (clase === 'empeoro') conteos.empeoraron += 1
    else if (clase === 'mejoro') conteos.mejoraron += 1
    else if (clase === 'resuelto') conteos.resueltos += 1
    else conteos.sinCambio += 1

    if (fos.comparar(diferencia, cero) > 0) {
      incrementoBruto = fos.sumar(incrementoBruto, diferencia)
      if (fila.eventosEnPeriodo > 0) {
        montoExplicado = fos.sumar(montoExplicado, diferencia)
        inmueblesExplicados += 1
      } else {
        montoSinExplicar = fos.sumar(montoSinExplicar, diferencia)
        inmueblesSinExplicar += 1
      }
      contribuyentes.push({
        inmuebleId: fila.inmuebleId,
        codigo: fila.codigo,
        vencidaAnterior: fila.vencidaAnterior,
        vencidaActual: fila.vencidaActual,
        delta: diferencia,
        clase,
        diasMoraMaximo: fila.diasMoraMaximo,
        etapaCobranza: fila.etapaCobranza,
        eventosEnPeriodo: fila.eventosEnPeriodo,
      })
    } else if (fos.comparar(diferencia, cero) < 0) {
      reduccionBruta = fos.sumar(reduccionBruta, fos.multiplicar(diferencia, -1))
    }
  }

  // fn_variacion_cartera ya devuelve ordenado por delta_vencida desc, pero
  // no se asume: el orden es un requisito de esta salida, no un efecto
  // secundario de la consulta.
  contribuyentes.sort((a, b) => fos.comparar(b.delta, a.delta))

  return {
    moneda,
    total: delta(totalAnterior, totalActual),
    vencida: delta(vencidaAnterior, vencidaActual),
    corriente: delta(corrienteAnterior, corrienteActual),
    sinVencimiento: delta(sinVencAnterior, sinVencActual),
    interesCausado: delta(interesAnterior, interesActual),
    incrementoBruto,
    reduccionBruta,
    contribuyentes,
    concentracion: calcularConcentracion(contribuyentes, incrementoBruto, moneda),
    conteos,
    atribucion: {
      explicado: { inmuebles: inmueblesExplicados, monto: montoExplicado },
      sinExplicar: { inmuebles: inmueblesSinExplicar, monto: montoSinExplicar },
    },
    inmueblesComparados: filas.length,
  }
}

/**
 * Cuántos inmuebles explican PCT_CONCENTRACION del incremento bruto.
 *
 * Se calcula sobre el incremento BRUTO y no sobre el delta neto a
 * propósito: si la cartera subió $10 porque unos subieron $50 y otros
 * bajaron $40, decir "3 inmuebles explican el 80% de los $10" sería falso.
 * Lo que explican es el 80% de los $50 que efectivamente subieron.
 */
function calcularConcentracion(
  contribuyentes: readonly ContribuyenteVariacion[],
  incrementoBruto: Money,
  moneda: string,
): ConcentracionVariacion {
  const cero = money(0, moneda)
  if (isZeroMoney(incrementoBruto)) {
    return { inmuebles: 0, monto: cero, pctDelIncremento: null, umbralPct: PCT_CONCENTRACION }
  }

  const objetivo = fos.multiplicar(incrementoBruto, PCT_CONCENTRACION / 100)
  let acumulado = cero
  let inmuebles = 0

  for (const contribuyente of contribuyentes) {
    acumulado = fos.sumar(acumulado, contribuyente.delta)
    inmuebles += 1
    if (fos.comparar(acumulado, objetivo) >= 0) break
  }

  return {
    inmuebles,
    monto: acumulado,
    pctDelIncremento: fos.dividirDecimales(acumulado.amount, incrementoBruto.amount).times(100).toNumber(),
    umbralPct: PCT_CONCENTRACION,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Explicación estructurada (Ola 2 §2 — 07_PROMPT_O2_EXPLICACION_ACCION.md)
//
// Tipos espejo, NO importados de @aquila/shared: el núcleo de
// liquidation-engine no puede importar ese paquete (D-14,
// eslint.config.js). La forma real vive en packages/shared/src/
// explicacion.ts — esta es una copia estructural a propósito, mismo
// patrón que ContribuyenteLocal/DeltaLocal en supabase/functions/
// cartera-variacion/index.ts (que sí puede importar @aquila/shared y es
// quien ensambla el objeto Explicacion final).
//
// Deriva exactamente de lo que la UI del paso 0 ya necesitó (titular,
// composición, concentración, atribución) — no se inventan afirmaciones
// nuevas. "Lo que ya se sabía" (fn_alertas_cartera) no entra aquí porque
// VariacionCartera no la trae; es un productor de afirmaciones aparte, no
// una ampliación de esta función.
// ═══════════════════════════════════════════════════════════════════════

export type TipoCertezaLocal = 'hecho' | 'calculo' | 'inferencia' | 'hipotesis' | 'informacion_insuficiente'

export interface EvidenciaLocal {
  readonly entidad: string
  readonly id: string | null
  readonly fuente: string
  readonly fechaCorte: string | null
}

export interface AfirmacionLocal {
  readonly tipo: TipoCertezaLocal
  readonly texto: string
  readonly evidencia: EvidenciaLocal
}

const FUENTE = 'fn_variacion_cartera'

function evidencia(entidad: string, fechaCorte: string, fuente = FUENTE): EvidenciaLocal {
  return { entidad, id: null, fuente, fechaCorte }
}

/**
 * Arma las afirmaciones de la variación de cartera. Pura: no formatea
 * moneda con separadores ni símbolos (eso es UI, igual que dinero() en la
 * Edge Function) — usa amount.toString(), mismo criterio que el resto del
 * DTO. "Plantilla con valores reales, no texto generado" (DI-03): las
 * frases son fijas, solo los valores cambian.
 */
export function explicarVariacionCartera(
  variacion: VariacionCartera,
  contexto: { readonly fechaCorteAnterior: string; readonly fechaCorteActual: string },
): AfirmacionLocal[] {
  const { fechaCorteAnterior, fechaCorteActual } = contexto
  const afirmaciones: AfirmacionLocal[] = []

  // 1 · Titular — mismo criterio de signo que tituloVariacion() en
  // apps/web/app/pages/cartera/index.vue: subir es malo, bajar es bueno,
  // pero aquí solo se declara el hecho, sin color ni juicio.
  const signoVencida = fos.comparar(variacion.vencida.delta, money(0, variacion.moneda))
  const montoVencidaAbs = fos.multiplicar(variacion.vencida.delta, signoVencida < 0 ? -1 : 1).amount.toString()
  const pctTexto =
    variacion.vencida.pctCambio === null ? 'sin base de comparación' : `${variacion.vencida.pctCambio.toFixed(1)}%`
  const textoTitular =
    signoVencida > 0
      ? `La cartera vencida aumentó ${montoVencidaAbs} (${pctTexto}) entre ${fechaCorteAnterior} y ${fechaCorteActual}.`
      : signoVencida < 0
        ? `La cartera vencida se redujo ${montoVencidaAbs} (${pctTexto}) entre ${fechaCorteAnterior} y ${fechaCorteActual}.`
        : `La cartera vencida no cambió entre ${fechaCorteAnterior} y ${fechaCorteActual}.`
  afirmaciones.push({
    tipo: 'calculo',
    texto: textoTitular,
    evidencia: evidencia('fn_dashboard_cartera', fechaCorteActual),
  })

  // 2 · Composición — corriente, sin vencimiento e interés causado, cada
  // uno su propia afirmación (nunca se pliegan entre sí, GAP-CAR-001).
  const composicion: ReadonlyArray<{ label: string; d: DeltaMonetario }> = [
    { label: 'la deuda corriente', d: variacion.corriente },
    { label: 'la deuda sin fecha de vencimiento', d: variacion.sinVencimiento },
    { label: 'el interés causado', d: variacion.interesCausado },
  ]
  for (const { label, d } of composicion) {
    const signo = fos.comparar(d.delta, money(0, variacion.moneda))
    if (signo === 0) continue // sin cambio no aporta a la explicación del porqué
    const montoAbs = fos.multiplicar(d.delta, signo < 0 ? -1 : 1).amount.toString()
    const verbo = signo > 0 ? 'aumentó' : 'se redujo'
    afirmaciones.push({
      tipo: 'calculo',
      texto: `Dentro del cambio, ${label} ${verbo} ${montoAbs}.`,
      evidencia: evidencia('fn_dashboard_cartera', fechaCorteActual),
    })
  }

  // 3 · Concentración — inferencia: se deriva de los hechos anteriores,
  // no es un dato nuevo del dominio.
  if (variacion.concentracion.pctDelIncremento !== null) {
    afirmaciones.push({
      tipo: 'inferencia',
      texto:
        `${String(variacion.concentracion.inmuebles)} inmuebles explican el ` +
        `${variacion.concentracion.pctDelIncremento.toFixed(1)}% del incremento bruto ` +
        `(${variacion.concentracion.monto.amount.toString()}).`,
      evidencia: evidencia('inmuebles', fechaCorteActual),
    })
  } else if (fos.comparar(variacion.incrementoBruto, money(0, variacion.moneda)) === 0) {
    afirmaciones.push({
      tipo: 'informacion_insuficiente',
      texto: 'No hubo incremento en el período: no aplica un análisis de concentración.',
      evidencia: evidencia('inmuebles', fechaCorteActual),
    })
  }

  // 4 · Atribución a eventos — lo que sí tiene rastro es un hecho; lo que
  // no, es información insuficiente, nunca se reparte ni se esconde.
  if (variacion.atribucion.explicado.inmuebles > 0) {
    afirmaciones.push({
      tipo: 'hecho',
      texto:
        `${variacion.atribucion.explicado.monto.amount.toString()} del incremento, en ` +
        `${String(variacion.atribucion.explicado.inmuebles)} inmuebles, coincide con eventos de cartera ` +
        `registrados en el período.`,
      evidencia: evidencia('eventos_cartera', fechaCorteActual, 'fn_variacion_cartera_eventos'),
    })
  }
  if (variacion.atribucion.sinExplicar.inmuebles > 0) {
    afirmaciones.push({
      tipo: 'informacion_insuficiente',
      texto:
        `${variacion.atribucion.sinExplicar.monto.amount.toString()} del incremento, en ` +
        `${String(variacion.atribucion.sinExplicar.inmuebles)} inmuebles, no tiene ningún evento de cartera ` +
        `registrado en el período: no se puede explicar con la información disponible.`,
      evidencia: evidencia('eventos_cartera', fechaCorteActual, 'fn_variacion_cartera_eventos'),
    })
  }

  return afirmaciones
}
