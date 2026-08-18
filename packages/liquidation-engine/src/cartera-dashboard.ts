/**
 * Dashboard e indicadores — tarjetas principales y distribución por
 * antigüedad (Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md
 * §23.1/§23.2). Puro, sin Supabase — mismo nivel de pureza que cartera.ts
 * (D-14, REC-CAR-009).
 *
 * Los 8 tramos de antigüedad son FIJOS (industria, para permitir
 * benchmark externo, §23.3) — a diferencia de los tramos de
 * `politicas_clasificacion_cartera` (F1), que son configurables por
 * tenant y gobiernan el escalamiento (F6). No se reutilizan esos tramos
 * aquí a propósito: son dos vocabularios distintos con propósitos
 * distintos (uno decide una máquina de estados, el otro es un reporte).
 *
 * "monto" de cada tramo de antigüedad es la deuda VENCIDA atribuida a ese
 * tramo (mismo criterio REC-CAR-010 que fn_posicion_cartera: el inmueble
 * completo se atribuye al tramo de su cargo vencido con saldo más
 * antiguo — coherente con "número de inmuebles" en la especificación, no
 * "número de cargos"). El tramo AL_DIA por definición tiene monto=0 para
 * cada inmueble que cae en él — esta tabla mide distribución de MORA, no
 * balance corriente (esa es CARTERA_CORRIENTE en las tarjetas, un número
 * aparte). pctDelTotal se calcula sobre carteraVencida (no carteraTotal)
 * para que la suma de los 8 tramos sea exactamente 100%.
 */
import { isZeroMoney, money, type Money } from '@aquila/financial-kernel'
import * as fos from '@aquila/financial-kernel'
import type { EtapaCobranza } from './cartera.js'

export interface FilaDashboardCartera {
  readonly inmuebleId: string
  /** Todos los cargos abiertos (vencidos + corrientes). */
  readonly deudaTotal: Money
  /** Solo cargos con fecha_vencimiento < fecha_corte. */
  readonly deudaVencida: Money
  readonly interesCausado: Money
  readonly saldoCredito: Money
  /** días de mora del cargo vencido con saldo más antiguo (REC-CAR-010); 0 si no hay ninguno. */
  readonly diasMoraMaximo: number
  readonly etapaCobranza: EtapaCobranza
}

export interface TarjetasCartera {
  readonly carteraTotal: Money
  readonly carteraVencida: Money
  readonly carteraCorriente: Money
  readonly interesesCausados: Money
  readonly carteraMayor90: Money
  readonly carteraMayor180: Money
  readonly carteraPrejuridica: Money
  readonly carteraJuridica: Money
  readonly saldosAFavor: Money
}

export type CodigoTramoAntiguedad =
  | 'AL_DIA'
  | 'MORA_TEMPRANA'
  | 'MORA_INICIAL'
  | 'MORA_MEDIA'
  | 'MORA_AVANZADA'
  | 'MORA_CRITICA'
  | 'ALTO_RIESGO'
  | 'CRITICA'

export interface TramoAntiguedad {
  readonly codigo: CodigoTramoAntiguedad
  readonly diasMin: number
  readonly diasMax: number | null
  readonly cantidadInmuebles: number
  readonly monto: Money
  /** 0-100, relativo a carteraVencida — la suma de los 8 tramos es exactamente 100. */
  readonly pctDelTotal: number
}

/**
 * Distribución de cartera vencida por etapa GOBERNADA de cobranza (CAR
 * §11, cartera_etapas/F6) — las 5 etapas REALES de la máquina de
 * estados, no un catálogo aparte. "monto" es deuda VENCIDA (mismo
 * criterio que los tramos de antigüedad); pctDelTotal es relativo a
 * carteraVencida, así que los 5 valores suman exactamente 100%.
 */
export interface EtapaCarteraResumen {
  readonly etapa: EtapaCobranza
  readonly cantidadInmuebles: number
  readonly monto: Money
  readonly pctDelTotal: number
}

export interface DashboardCartera {
  readonly tarjetas: TarjetasCartera
  readonly antiguedad: readonly TramoAntiguedad[]
  readonly porEtapa: readonly EtapaCarteraResumen[]
}

/** Orden fijo de presentación — el mismo orden de la máquina de estados (CAR §11.1), no alfabético. */
const ETAPAS_ORDEN: readonly EtapaCobranza[] = ['preventiva', 'administrativa', 'prejuridica', 'juridica', 'judicial']

interface DefinicionTramo {
  readonly codigo: CodigoTramoAntiguedad
  readonly diasMin: number
  readonly diasMax: number | null
}

/** CAR §23.2 — catálogo fijo, en orden. */
const TRAMOS_ANTIGUEDAD: readonly DefinicionTramo[] = [
  { codigo: 'AL_DIA', diasMin: 0, diasMax: 0 },
  { codigo: 'MORA_TEMPRANA', diasMin: 1, diasMax: 30 },
  { codigo: 'MORA_INICIAL', diasMin: 31, diasMax: 60 },
  { codigo: 'MORA_MEDIA', diasMin: 61, diasMax: 90 },
  { codigo: 'MORA_AVANZADA', diasMin: 91, diasMax: 120 },
  { codigo: 'MORA_CRITICA', diasMin: 121, diasMax: 180 },
  { codigo: 'ALTO_RIESGO', diasMin: 181, diasMax: 360 },
  { codigo: 'CRITICA', diasMin: 361, diasMax: null },
]

function tramoDe(diasMora: number): DefinicionTramo {
  const encontrado = TRAMOS_ANTIGUEDAD.find(
    (t) => diasMora >= t.diasMin && (t.diasMax === null || diasMora <= t.diasMax),
  )
  // TRAMOS_ANTIGUEDAD cubre [0,∞) sin huecos — el último tramo (diasMax=null) siempre atrapa el resto.
  return encontrado ?? (TRAMOS_ANTIGUEDAD[TRAMOS_ANTIGUEDAD.length - 1] as DefinicionTramo)
}

export function calcularDashboardCartera(
  filas: readonly FilaDashboardCartera[],
  moneda: string,
): DashboardCartera {
  let carteraTotal = money(0, moneda)
  let carteraVencida = money(0, moneda)
  let interesesCausados = money(0, moneda)
  let carteraMayor90 = money(0, moneda)
  let carteraMayor180 = money(0, moneda)
  let carteraPrejuridica = money(0, moneda)
  let carteraJuridica = money(0, moneda)
  let saldosAFavor = money(0, moneda)

  const porTramo = new Map<CodigoTramoAntiguedad, { cantidad: number; monto: Money }>(
    TRAMOS_ANTIGUEDAD.map((t) => [t.codigo, { cantidad: 0, monto: money(0, moneda) }]),
  )
  const porEtapaMap = new Map<EtapaCobranza, { cantidad: number; monto: Money }>(
    ETAPAS_ORDEN.map((e) => [e, { cantidad: 0, monto: money(0, moneda) }]),
  )

  for (const fila of filas) {
    carteraTotal = fos.sumar(carteraTotal, fila.deudaTotal)
    carteraVencida = fos.sumar(carteraVencida, fila.deudaVencida)
    interesesCausados = fos.sumar(interesesCausados, fila.interesCausado)
    saldosAFavor = fos.sumar(saldosAFavor, fila.saldoCredito)
    if (fila.diasMoraMaximo > 90) carteraMayor90 = fos.sumar(carteraMayor90, fila.deudaVencida)
    if (fila.diasMoraMaximo > 180) carteraMayor180 = fos.sumar(carteraMayor180, fila.deudaVencida)
    if (fila.etapaCobranza === 'prejuridica') carteraPrejuridica = fos.sumar(carteraPrejuridica, fila.deudaVencida)
    if (fila.etapaCobranza === 'juridica' || fila.etapaCobranza === 'judicial') {
      carteraJuridica = fos.sumar(carteraJuridica, fila.deudaVencida)
    }

    const tramo = tramoDe(fila.diasMoraMaximo)
    const acumulado = porTramo.get(tramo.codigo)
    if (acumulado) {
      porTramo.set(tramo.codigo, {
        cantidad: acumulado.cantidad + 1,
        monto: fos.sumar(acumulado.monto, fila.deudaVencida),
      })
    }

    const acumuladoEtapa = porEtapaMap.get(fila.etapaCobranza)
    if (acumuladoEtapa) {
      porEtapaMap.set(fila.etapaCobranza, {
        cantidad: acumuladoEtapa.cantidad + 1,
        monto: fos.sumar(acumuladoEtapa.monto, fila.deudaVencida),
      })
    }
  }

  const carteraCorriente = fos.restar(carteraTotal, carteraVencida)

  const antiguedad: TramoAntiguedad[] = TRAMOS_ANTIGUEDAD.map((t) => {
    const acumulado = porTramo.get(t.codigo) ?? { cantidad: 0, monto: money(0, moneda) }
    const pctDelTotal = isZeroMoney(carteraVencida)
      ? 0
      : fos.dividirDecimales(acumulado.monto.amount, carteraVencida.amount).times(100).toNumber()
    return {
      codigo: t.codigo,
      diasMin: t.diasMin,
      diasMax: t.diasMax,
      cantidadInmuebles: acumulado.cantidad,
      monto: acumulado.monto,
      pctDelTotal,
    }
  })

  const porEtapa: EtapaCarteraResumen[] = ETAPAS_ORDEN.map((etapa) => {
    const acumulado = porEtapaMap.get(etapa) ?? { cantidad: 0, monto: money(0, moneda) }
    const pctDelTotal = isZeroMoney(carteraVencida)
      ? 0
      : fos.dividirDecimales(acumulado.monto.amount, carteraVencida.amount).times(100).toNumber()
    return {
      etapa,
      cantidadInmuebles: acumulado.cantidad,
      monto: acumulado.monto,
      pctDelTotal,
    }
  })

  return {
    tarjetas: {
      carteraTotal,
      carteraVencida,
      carteraCorriente,
      interesesCausados,
      carteraMayor90,
      carteraMayor180,
      carteraPrejuridica,
      carteraJuridica,
      saldosAFavor,
    },
    antiguedad,
    porEtapa,
  }
}
