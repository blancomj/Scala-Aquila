/**
 * Ejecuta las tres reglas piloto (paso0/reglas/*.ael) de punta a punta:
 * lexer → parser → analyzer → evaluador. Este es el criterio de salida de
 * F4 en PLAN_MAESTRO_IMPLEMENTACION.md: "las 3 reglas piloto evalúan
 * correctamente".
 *
 * CUOTA_BASICA usa los montos reales de paso0/INFORME_PASO_0.md §3.1-3.2
 * (Golden Case GC-001) y su resultado (100.000.000 COP) es el número
 * documentado y verificable a mano. CUOTA_CON_DESCUENTO e INTERES_MORA usan
 * valores de prueba propios (GC-001 no fija esos parámetros — ver
 * INFORME_PASO_0.md §3.4: "se añade al extender GC-001 con novedad, pago
 * parcial e interés") calculados a mano en los comentarios de cada test.
 */
import { analizar, parsear, type CatalogoContratos } from '@aquila/ael-language'
import { crearDecimal, money, type ModoRedondeo } from '@aquila/financial-kernel'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { ExecutionContext } from './context.js'
import { ContractoNoResueltoError } from './errors.js'
import { evaluar } from './evaluator.js'
import type { TypedValue } from './typed-value.js'

const RAIZ_REGLAS = fileURLToPath(new URL('../../../paso0/reglas/', import.meta.url))

function leerRegla(archivo: string): string {
  return readFileSync(new URL(archivo, `file://${RAIZ_REGLAS}`), 'utf8')
}

const CATALOGO: CatalogoContratos = {
  PARAMETER: {
    PRESUPUESTO_ANUAL: 'MONEY',
    OTROS_INGRESOS_ANUAL: 'MONEY',
    DESCUENTO_PRONTO_PAGO: 'NUMBER',
    INTERES_DIAS_GRACIA: 'NUMBER',
    INTERES_BASE_DIAS: 'NUMBER',
    INTERES_TASA_MENSUAL: 'NUMBER',
    INTERES_TOPE_MENSUAL: 'NUMBER',
  },
  UNIT: {
    PAGO_OPORTUNO: 'BOOLEAN',
    SALDO_VENCIDO: 'MONEY',
    DIAS_MORA: 'NUMBER',
  },
  CONCEPTO: {
    CUOTA_BASICA: 'MONEY',
  },
}

function crearContexto(
  valores: Readonly<Record<string, TypedValue>>,
  modoRedondeoDinero: ModoRedondeo = 'HALF_UP',
): ExecutionContext {
  return {
    catalogo: CATALOGO,
    modoRedondeoDinero,
    resolverContract(contrato, campo) {
      const v = valores[`${contrato}.${campo}`]
      if (v === undefined) throw new ContractoNoResueltoError(contrato, campo)
      return v
    },
  }
}

/** Compila (parsear + analizar) y falla el test si hay diagnósticos ERROR. */
function compilar(fuente: string) {
  const { regla, diagnosticos: diagLexerParser } = parsear(fuente)
  if (!regla)
    throw new Error(`la regla no parseó: ${diagLexerParser.map((d) => d.mensaje).join('; ')}`)
  const { diagnosticos } = analizar(regla, CATALOGO)
  if (diagnosticos.length > 0) {
    throw new Error(`la regla no analizó limpio: ${diagnosticos.map((d) => d.mensaje).join('; ')}`)
  }
  return regla
}

describe('GC-001 — CUOTA_BASICA (paso0/INFORME_PASO_0.md §3.1-3.2)', () => {
  it('120.000.000 - 20.000.000 = 100.000.000 COP', () => {
    const regla = compilar(leerRegla('CUOTA_BASICA.ael'))
    const r = evaluar(
      regla,
      crearContexto({
        'PARAMETER.PRESUPUESTO_ANUAL': { tipo: 'MONEY', valor: money(120_000_000, 'COP') },
        'PARAMETER.OTROS_INGRESOS_ANUAL': { tipo: 'MONEY', valor: money(20_000_000, 'COP') },
      }),
    )
    expect(r.diagnosticos).toEqual([])
    if (r.resultado?.tipo !== 'MONEY') throw new Error('se esperaba MONEY')
    expect(r.resultado.valor.amount.toString()).toBe('100000000')
    expect(r.resultado.valor.currency).toBe('COP')
  })
})

describe('CUOTA_CON_DESCUENTO — encadenada tras CUOTA_BASICA vía CONCEPTO.CUOTA_BASICA', () => {
  const regla = compilar(leerRegla('CUOTA_CON_DESCUENTO.ael'))
  // cuota = 100.000.000 COP (resultado de CUOTA_BASICA en GC-001)
  // descuento_pronto_pago = 5% → PORCENTAJE(100.000.000, 5) = 5.000.000
  const base = {
    'CONCEPTO.CUOTA_BASICA': { tipo: 'MONEY', valor: money(100_000_000, 'COP') } as TypedValue,
    'PARAMETER.DESCUENTO_PRONTO_PAGO': { tipo: 'NUMBER', valor: crearDecimal(5) } as TypedValue,
  }

  it('pago oportuno: cuota - descuento = 95.000.000 COP', () => {
    const r = evaluar(
      regla,
      crearContexto({ ...base, 'UNIT.PAGO_OPORTUNO': { tipo: 'BOOLEAN', valor: true } }),
    )
    expect(r.diagnosticos).toEqual([])
    if (r.resultado?.tipo !== 'MONEY') throw new Error('se esperaba MONEY')
    expect(r.resultado.valor.amount.toString()).toBe('95000000')
  })

  it('sin pago oportuno: cuota completa, sin descuento', () => {
    const r = evaluar(
      regla,
      crearContexto({ ...base, 'UNIT.PAGO_OPORTUNO': { tipo: 'BOOLEAN', valor: false } }),
    )
    expect(r.diagnosticos).toEqual([])
    if (r.resultado?.tipo !== 'MONEY') throw new Error('se esperaba MONEY')
    expect(r.resultado.valor.amount.toString()).toBe('100000000')
  })
})

describe('INTERES_MORA', () => {
  const regla = compilar(leerRegla('INTERES_MORA.ael'))
  // saldo_vencido=1.000.000 · tasa=2% · tope=3% → tasa_aplicable=MIN(2,3)=2%
  // dias_mora=45 · dias_gracia=5 → dias_cobrables=MAX(40,0)=40
  // interes = 1.000.000 × 0.02 × 40 / 30 = 26.666,666... → HALF_UP,0 → 26.667
  const base = {
    'PARAMETER.INTERES_DIAS_GRACIA': { tipo: 'NUMBER', valor: crearDecimal(5) } as TypedValue,
    'PARAMETER.INTERES_BASE_DIAS': { tipo: 'NUMBER', valor: crearDecimal(30) } as TypedValue,
    'PARAMETER.INTERES_TASA_MENSUAL': { tipo: 'NUMBER', valor: crearDecimal('0.02') } as TypedValue,
    'PARAMETER.INTERES_TOPE_MENSUAL': { tipo: 'NUMBER', valor: crearDecimal('0.03') } as TypedValue,
  }

  it('con mora cobrable: redondea a 26.667 COP', () => {
    const r = evaluar(
      regla,
      crearContexto({
        ...base,
        'UNIT.SALDO_VENCIDO': { tipo: 'MONEY', valor: money(1_000_000, 'COP') },
        'UNIT.DIAS_MORA': { tipo: 'NUMBER', valor: crearDecimal(45) },
      }),
    )
    expect(r.diagnosticos).toEqual([])
    if (r.resultado?.tipo !== 'MONEY') throw new Error('se esperaba MONEY')
    expect(r.resultado.valor.amount.toString()).toBe('26667')
  })

  it('sin días cobrables (dentro del periodo de gracia): 0 COP', () => {
    const r = evaluar(
      regla,
      crearContexto({
        ...base,
        'UNIT.SALDO_VENCIDO': { tipo: 'MONEY', valor: money(1_000_000, 'COP') },
        'UNIT.DIAS_MORA': { tipo: 'NUMBER', valor: crearDecimal(3) },
      }),
    )
    expect(r.diagnosticos).toEqual([])
    if (r.resultado?.tipo !== 'MONEY') throw new Error('se esperaba MONEY')
    expect(r.resultado.valor.amount.toString()).toBe('0')
  })
})
