/**
 * AEL-004 Fase 6 — motor de casos de prueba persistidos (Doc 10 §33-44
 * TEST RUNNER/TEST CASE/SNAPSHOT TESTING/TEST SUITE). Ejecutar un caso es
 * 100% puro y client-side: probarFormula() (Fase 1,
 * @aquila/liquidation-engine/prueba-formula) no sabe de dónde viene el
 * ExecutionContext — aquí se lo damos desde valores mock en vez de
 * Supabase. No hace falta ninguna Edge Function.
 *
 * Comparaciones MONEY/NUMBER usan esIgual()/compararDecimales() de
 * @aquila/financial-kernel (Docs/19 §94 NO EPSILON) — nunca
 * `Math.abs(a-b) < ε`. Alcance v0: solo `equals` (Doc 10 §41 lista más
 * assertions — notEquals/greaterThan/etc. — quedan en backlog explícito
 * hasta que un caso real lo pida).
 */
import { probarFormula } from '@aquila/liquidation-engine/prueba-formula'
import {
  ContractoNoResueltoError,
  type ExecutionContext,
  type TypedValue,
} from '@aquila/ael-runtime'
import {
  compararDecimales,
  crearDecimal,
  esIgual,
  money,
  type ModoRedondeo,
} from '@aquila/financial-kernel'
import type { CatalogoContratos } from '@aquila/ael-language'
import type { Diagnostico, Tipo } from '@aquila/ael-core'
import { extraerCapabilidades } from './ael-capabilities'
import { PARAMETER_CATALOGO, UNIT_CATALOGO } from './ael-catalogo'

export type ValorMock =
  | { readonly tipo: 'NUMBER'; readonly valor: string }
  | { readonly tipo: 'MONEY'; readonly valor: string }
  | { readonly tipo: 'BOOLEAN'; readonly valor: boolean }
  | { readonly tipo: 'NULO' }

export interface EntradaMock {
  readonly contrato: string
  readonly campo: string
  readonly valor: ValorMock
}

export function materializarValorMock(valor: ValorMock, moneda: string): TypedValue {
  switch (valor.tipo) {
    case 'NUMBER':
      return { tipo: 'NUMBER', valor: crearDecimal(valor.valor) }
    case 'MONEY':
      return { tipo: 'MONEY', valor: money(valor.valor, moneda) }
    case 'BOOLEAN':
      return { tipo: 'BOOLEAN', valor: valor.valor }
    case 'NULO':
      return { tipo: 'NULO' }
  }
}

/** Mismo contrato que liquidation-engine/src/context.ts::crearContexto —
 * mismo ContractoNoResueltoError si falta un valor. evaluar() ya lo
 * captura y lo convierte en diagnóstico (ael-runtime/src/evaluator.ts). */
export function crearContextoMock(
  entradas: readonly EntradaMock[],
  catalogo: CatalogoContratos,
  moneda: string,
  modoRedondeoDinero: ModoRedondeo,
): ExecutionContext {
  const valores = new Map<string, TypedValue>()
  for (const entrada of entradas) {
    valores.set(
      `${entrada.contrato}.${entrada.campo}`,
      materializarValorMock(entrada.valor, moneda),
    )
  }

  return {
    catalogo,
    modoRedondeoDinero,
    resolverContract(contrato, campo) {
      const valor = valores.get(`${contrato}.${campo}`)
      if (valor === undefined) throw new ContractoNoResueltoError(contrato, campo)
      return valor
    },
  }
}

export interface CampoRequerido {
  readonly contrato: string
  readonly campo: string
  readonly tipo: Tipo
}

/** El "Input Builder" (Doc 10 §35): qué campos necesita la fórmula actual,
 * reutilizando extraerCapabilidades() (Fase 4) — el usuario solo llena una
 * lista plana de campos tipados, nunca ve el ExecutionContext. */
export function camposRequeridos(formulaAelText: string): readonly CampoRequerido[] {
  const { contratos } = extraerCapabilidades(formulaAelText)
  const resultado: CampoRequerido[] = []

  for (const c of contratos) {
    for (const campo of c.campos) {
      let tipo: Tipo = 'MONEY' // CONCEPTO.* y cualquier campo sin catálogo estático — GAP-22.
      if (c.contrato === 'PARAMETER') tipo = PARAMETER_CATALOGO[campo]?.tipo ?? 'MONEY'
      else if (c.contrato === 'UNIT') tipo = UNIT_CATALOGO[campo]?.tipo ?? 'MONEY'
      resultado.push({ contrato: c.contrato, campo, tipo })
    }
  }

  return resultado
}

export interface ResultadoComparacion {
  readonly pasa: boolean
  readonly mensaje: string
}

export function compararResultado(
  actual: TypedValue,
  tipoEsperado: Tipo,
  resultadoEsperado: ValorMock | null,
  moneda: string,
): ResultadoComparacion {
  if (actual.tipo !== tipoEsperado) {
    return { pasa: false, mensaje: `Se esperaba tipo ${tipoEsperado}, se obtuvo ${actual.tipo}` }
  }

  switch (actual.tipo) {
    case 'NULO':
      return { pasa: true, mensaje: 'NULO' }

    case 'MONEY': {
      if (resultadoEsperado?.tipo !== 'MONEY') {
        return { pasa: false, mensaje: 'Falta el resultado esperado (MONEY)' }
      }
      const esperado = money(resultadoEsperado.valor, moneda)
      const pasa = esIgual(actual.valor, esperado)
      const etiquetaActual = `${actual.valor.amount.toString()} ${actual.valor.currency}`
      return {
        pasa,
        mensaje: pasa
          ? etiquetaActual
          : `esperado ${esperado.amount.toString()} ${esperado.currency}, obtenido ${etiquetaActual}`,
      }
    }

    case 'NUMBER': {
      if (resultadoEsperado?.tipo !== 'NUMBER') {
        return { pasa: false, mensaje: 'Falta el resultado esperado (NUMBER)' }
      }
      const pasa = compararDecimales(actual.valor, resultadoEsperado.valor) === 0
      return {
        pasa,
        mensaje: pasa
          ? actual.valor.toString()
          : `esperado ${resultadoEsperado.valor}, obtenido ${actual.valor.toString()}`,
      }
    }

    case 'BOOLEAN': {
      if (resultadoEsperado?.tipo !== 'BOOLEAN') {
        return { pasa: false, mensaje: 'Falta el resultado esperado (BOOLEAN)' }
      }
      const pasa = actual.valor === resultadoEsperado.valor
      return {
        pasa,
        mensaje: pasa
          ? String(actual.valor)
          : `esperado ${String(resultadoEsperado.valor)}, obtenido ${String(actual.valor)}`,
      }
    }
  }
}

export interface CasoPruebaInput {
  readonly entradas: readonly EntradaMock[]
  readonly tipoEsperado: Tipo
  readonly resultadoEsperado: ValorMock | null
}

export interface ResultadoCasoPrueba {
  readonly estado: 'passed' | 'failed'
  readonly actual: TypedValue | null
  readonly mensaje: string
  readonly diagnosticos: readonly Diagnostico[]
}

export function ejecutarCasoPrueba(
  formulaAelText: string,
  caso: CasoPruebaInput,
  catalogo: CatalogoContratos,
  moneda: string,
  modoRedondeoDinero: ModoRedondeo,
): ResultadoCasoPrueba {
  const contexto = crearContextoMock(caso.entradas, catalogo, moneda, modoRedondeoDinero)
  const resultado = probarFormula(formulaAelText, contexto)

  if (!resultado.valido || resultado.resultado === null) {
    return {
      estado: 'failed',
      actual: null,
      mensaje:
        resultado.diagnosticos.map((d) => `${d.codigo}: ${d.mensaje}`).join('; ') ||
        'La fórmula no es válida.',
      diagnosticos: resultado.diagnosticos,
    }
  }

  const comparacion = compararResultado(
    resultado.resultado,
    caso.tipoEsperado,
    caso.resultadoEsperado,
    moneda,
  )
  return {
    estado: comparacion.pasa ? 'passed' : 'failed',
    actual: resultado.resultado,
    mensaje: comparacion.mensaje,
    diagnosticos: [],
  }
}
