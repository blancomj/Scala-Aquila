/**
 * Motor de Gestión de Cartera — antigüedad y clasificación (Docs/Motor de
 * gestion de cartera/CAR_00_Guia_Oficial.md §7-§8). Puro, sin Supabase —
 * mismo nivel de pureza que cuenta-corriente.ts (D-14, REC-CAR-009).
 *
 * REC-CAR-004: no reimplementa imputación ni interés — reutiliza CargoAbierto
 * tal como lo arma cuenta-corriente-supabase.ts desde v_cargo_saldo, y
 * diasCalendario() de cuenta-corriente.ts para la aritmética de fechas.
 */
import { createHash } from 'node:crypto'
import * as fos from '@aquila/financial-kernel'
import { money, isZeroMoney, isNegativeMoney, type Money } from '@aquila/financial-kernel'
import { type CargoAbierto, diasCalendario } from './cuenta-corriente.js'
import { PoliticaClasificacionInvalidaError, TramoClasificacionNoEncontradoError } from './errors.js'

// ─────────────────────────── Antigüedad (CAR §7) ────────────────────────

export interface CargoConAntiguedad {
  readonly cargo: CargoAbierto
  readonly diasMora: number
}

/**
 * CAR §7.2: dias_mora = GREATEST(0, fecha_corte − fecha_vencimiento).
 * Antigüedad de calendario simple — distinta del day-count de mora
 * (calcularInteresMora), que además respeta gracia/tope/convención.
 * Solo cargos con saldo > 0 tienen antigüedad (I-C01: uno saldado no
 * permanece como cartera vencida, sale del cálculo inmediatamente).
 */
export function calcularAntiguedad(
  cargosAbiertos: readonly CargoAbierto[],
  fechaCorte: string,
): readonly CargoConAntiguedad[] {
  return cargosAbiertos
    .filter((c) => !isZeroMoney(c.montoPendiente) && !isNegativeMoney(c.montoPendiente))
    .map((cargo) => ({
      cargo,
      diasMora: Math.max(0, diasCalendario(cargo.fechaVencimiento, fechaCorte)),
    }))
}

// ─────────────────────────── Posición (CAR §6) ──────────────────────────

export interface PosicionCarteraCalculada {
  readonly deudaTotal: Money
  readonly deudaCapital: Money
  readonly deudaInteres: Money
  readonly deudaOtros: Money
  /** días de mora del cargo con saldo más antiguo — el que clasifica (REC-CAR-010). */
  readonly diasMoraMaximo: number
  /** null si no hay ningún cargo vencido (todo al día). */
  readonly cargoMasAntiguoId: string | null
  readonly cantidadCargosVencidos: number
}

function esMasAntiguo(candidato: CargoConAntiguedad, actual: CargoConAntiguedad | null): boolean {
  if (actual === null) return true
  if (candidato.diasMora !== actual.diasMora) return candidato.diasMora > actual.diasMora
  // Empate determinista — mismo criterio que el desempate final de cuenta-corriente.ts.
  return candidato.cargo.id < actual.cargo.id
}

/**
 * REC-CAR-010: el cargo que determina la clasificación es el más antiguo
 * CON SALDO, no el más antiguo en absoluto — uno saldado ya no compite.
 */
export function calcularPosicionCartera(
  cargosConAntiguedad: readonly CargoConAntiguedad[],
  moneda: string,
): PosicionCarteraCalculada {
  let deudaCapital = money(0, moneda)
  let deudaInteres = money(0, moneda)
  let deudaOtros = money(0, moneda)
  let cantidadCargosVencidos = 0
  let masAntiguo: CargoConAntiguedad | null = null

  for (const item of cargosConAntiguedad) {
    const { cargo, diasMora } = item
    if (cargo.categoria === 'capital') deudaCapital = fos.sumar(deudaCapital, cargo.montoPendiente)
    else if (cargo.categoria === 'interes') deudaInteres = fos.sumar(deudaInteres, cargo.montoPendiente)
    else deudaOtros = fos.sumar(deudaOtros, cargo.montoPendiente)

    if (diasMora > 0) {
      cantidadCargosVencidos += 1
      if (esMasAntiguo(item, masAntiguo)) masAntiguo = item
    }
  }

  return {
    deudaTotal: fos.sumar(fos.sumar(deudaCapital, deudaInteres), deudaOtros),
    deudaCapital,
    deudaInteres,
    deudaOtros,
    diasMoraMaximo: masAntiguo?.diasMora ?? 0,
    cargoMasAntiguoId: masAntiguo?.cargo.id ?? null,
    cantidadCargosVencidos,
  }
}

// ─────────────────────────── Clasificación (CAR §8) ─────────────────────

export type NivelRiesgo = 'ninguno' | 'bajo' | 'medio' | 'alto' | 'critico'
export type EtapaCobranza = 'preventiva' | 'administrativa' | 'prejuridica' | 'juridica' | 'judicial'

export interface TramoClasificacion {
  readonly codigo: string
  readonly diasMin: number
  /** null = sin tope superior — exactamente un tramo de la política lo tiene (IC-TRAMO-03). */
  readonly diasMax: number | null
  readonly nivelRiesgo: NivelRiesgo
  readonly etapaCobranza: EtapaCobranza
  readonly prioridad: number
}

export interface PoliticaClasificacion {
  readonly id: string
  readonly version: number
  readonly tramos: readonly TramoClasificacion[]
}

export interface ResultadoClasificacion {
  readonly codigo: string
  readonly nivelRiesgo: NivelRiesgo
  readonly etapaCobranza: EtapaCobranza
  readonly prioridad: number
  readonly diasMora: number
  readonly politicaId: string
  readonly politicaVersion: number
}

/**
 * CAR §8.3 — IC-TRAMO-01..05. Una política solo puede activarse (estado
 * 'vigente') si sus tramos cubren [0,∞) sin huecos ni solapes. Se llama al
 * validar la política antes de guardarla, no en cada clasificación.
 */
export function validarPoliticaClasificacion(tramos: readonly TramoClasificacion[]): void {
  const errores: string[] = []

  if (tramos.length === 0) {
    throw new PoliticaClasificacionInvalidaError(['La política no tiene tramos'])
  }

  // IC-TRAMO-05: códigos únicos.
  const codigosVistos = new Set<string>()
  for (const t of tramos) {
    if (codigosVistos.has(t.codigo)) errores.push(`IC-TRAMO-05: código duplicado "${t.codigo}"`)
    codigosVistos.add(t.codigo)
  }

  // IC-TRAMO-04: exactamente un tramo con dias_min = 0 (el estado "al día").
  const conDiasMinCero = tramos.filter((t) => t.diasMin === 0).length
  if (conDiasMinCero !== 1) {
    errores.push(
      `IC-TRAMO-04: se esperaba exactamente 1 tramo con dias_min=0, hay ${String(conDiasMinCero)}`,
    )
  }

  // IC-TRAMO-03: exactamente un tramo con dias_max = null (el último).
  const sinTope = tramos.filter((t) => t.diasMax === null).length
  if (sinTope !== 1) {
    errores.push(
      `IC-TRAMO-03: se esperaba exactamente 1 tramo con dias_max=null, hay ${String(sinTope)}`,
    )
  }

  // IC-TRAMO-01/02: cobertura completa, sin huecos ni solapes.
  const ordenados = [...tramos].sort((a, b) => a.diasMin - b.diasMin)
  const primero = ordenados[0]
  if (primero && primero.diasMin !== 0) {
    errores.push(
      `IC-TRAMO-01: hueco antes de dias_min=${String(primero.diasMin)} — falta cubrir desde 0`,
    )
  }
  for (let i = 1; i < ordenados.length; i++) {
    const anterior = ordenados[i - 1]
    const actual = ordenados[i]
    if (anterior === undefined || actual === undefined) continue

    if (anterior.diasMax === null) {
      errores.push(`IC-TRAMO-02: el tramo "${anterior.codigo}" no tiene tope pero hay tramos después`)
      continue
    }
    if (anterior.diasMax + 1 < actual.diasMin) {
      errores.push(
        `IC-TRAMO-01: hueco entre "${anterior.codigo}" (hasta ${String(anterior.diasMax)}) y ` +
          `"${actual.codigo}" (desde ${String(actual.diasMin)})`,
      )
    } else if (anterior.diasMax + 1 > actual.diasMin) {
      errores.push(
        `IC-TRAMO-02: solape entre "${anterior.codigo}" (hasta ${String(anterior.diasMax)}) y ` +
          `"${actual.codigo}" (desde ${String(actual.diasMin)})`,
      )
    }
  }

  if (errores.length > 0) throw new PoliticaClasificacionInvalidaError(errores)
}

/**
 * CAR §8.6 — determinista. Nunca devuelve un default: si ningún tramo cubre
 * diasMora, la política está mal configurada y debe fallar ruidosamente.
 */
export function clasificarCartera(
  diasMora: number,
  politica: PoliticaClasificacion,
): ResultadoClasificacion {
  const tramo = politica.tramos.find(
    (t) => diasMora >= t.diasMin && (t.diasMax === null || diasMora <= t.diasMax),
  )
  if (!tramo) throw new TramoClasificacionNoEncontradoError(diasMora, politica.id, politica.version)

  return {
    codigo: tramo.codigo,
    nivelRiesgo: tramo.nivelRiesgo,
    etapaCobranza: tramo.etapaCobranza,
    prioridad: tramo.prioridad,
    diasMora,
    politicaId: politica.id,
    politicaVersion: politica.version,
  }
}

// ─────────────────────────── Snapshot (CAR §6.3) ────────────────────────

/**
 * Exactamente los campos que persiste posiciones_cartera_snapshot — el
 * mismo objeto sirve para calcular el hash y para armar el INSERT
 * (cartera-supabase.ts), así ambos nunca pueden divergir entre sí.
 */
export interface PosicionCarteraSnapshotDatos {
  readonly tenantId: string
  readonly inmuebleId: string
  readonly fechaCorte: string
  readonly deudaTotal: string
  readonly deudaCapital: string
  readonly deudaInteres: string
  readonly deudaOtros: string
  readonly saldoCredito: string
  readonly diasMoraMaximo: number
  readonly cantidadCargosVencidos: number
  readonly fechaVencimientoMasAntigua: string | null
  readonly cargoVencidoMasAntiguoId: string | null
  readonly clasificacionCodigo: string
  readonly nivelRiesgo: NivelRiesgo
  readonly etapaCobranza: EtapaCobranza
  readonly politicaId: string
  readonly politicaVersion: number
}

/**
 * I-C15/PH-C27 — mismo principio que calcularResultHash() (hash.ts):
 * serialización canónica con orden de campos estable, solo valores
 * deterministas (nada de created_at ni de metadatos de ejecución).
 * Recalcular con los mismos datos y la misma política SIEMPRE reproduce
 * el mismo hash — así se verifica reproducibilidad, no solo se declara.
 */
export function calcularPosicionHash(datos: PosicionCarteraSnapshotDatos): string {
  const canonico = JSON.stringify({
    tenantId: datos.tenantId,
    inmuebleId: datos.inmuebleId,
    fechaCorte: datos.fechaCorte,
    deudaTotal: datos.deudaTotal,
    deudaCapital: datos.deudaCapital,
    deudaInteres: datos.deudaInteres,
    deudaOtros: datos.deudaOtros,
    saldoCredito: datos.saldoCredito,
    diasMoraMaximo: datos.diasMoraMaximo,
    cantidadCargosVencidos: datos.cantidadCargosVencidos,
    fechaVencimientoMasAntigua: datos.fechaVencimientoMasAntigua,
    cargoVencidoMasAntiguoId: datos.cargoVencidoMasAntiguoId,
    clasificacionCodigo: datos.clasificacionCodigo,
    nivelRiesgo: datos.nivelRiesgo,
    etapaCobranza: datos.etapaCobranza,
    politicaId: datos.politicaId,
    politicaVersion: datos.politicaVersion,
  })
  return createHash('sha256').update(canonico).digest('hex')
}
