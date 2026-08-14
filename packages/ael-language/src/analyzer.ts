/**
 * Analyzer de AEL v0 — verificación estática.
 * Propietario documental: Docs/02 §68, 01 §26-27.
 *
 * Responsabilidad: validar sintaxis ya parseada, nombres, tipos, Contracts,
 * Functions y consistencia de retornos (Docs/02 §68 SEPARACIÓN DE CAPAS:
 * "el Parser reconoce la estructura; el Analyzer determina su significado").
 *
 * NO depende de @aquila/financial-kernel: trabaja con la etiqueta estática
 * `Tipo`, nunca con un valor Money/Decimal real — eso es del evaluador,
 * en ael-runtime (PLAN §3, corrección de AD-20 tras iniciar F4).
 *
 * Deliberadamente NO implementa: verificación de exhaustividad de retornos
 * (que todo camino retorne) — ninguna de las tres reglas piloto la necesita
 * y añadirla ahora es alcance no aprobado (PLAN §3.4).
 */
import { crearDiagnostico, type Diagnostico, type Tipo } from '@aquila/ael-core'
import type { Expresion, Instruccion, Regla } from './ast.js'

/** Docs/01 §22-23: Contract → campo → Tipo. Sin catálogo no hay análisis — 0AEL §6. */
export type CatalogoContratos = Readonly<Record<string, Readonly<Record<string, Tipo>>>>

interface FirmaFuncion {
  readonly parametros: readonly Tipo[]
  readonly retorno: Tipo
}

/** Docs/01 §21: catálogo reducido — solo lo que las reglas piloto usan. */
const FUNCIONES: Readonly<Record<string, FirmaFuncion>> = {
  MIN: { parametros: ['NUMBER', 'NUMBER'], retorno: 'NUMBER' },
  MAX: { parametros: ['NUMBER', 'NUMBER'], retorno: 'NUMBER' },
  PORCENTAJE: { parametros: ['MONEY', 'NUMBER'], retorno: 'MONEY' },
  // 07 §"FUNCTION EXAMPLE": REDONDEAR_DINERO(Money<C>, Number) — la escala
  // es un argumento explícito, no un valor implícito (16 §44 ROUNDING:
  // "debe ser una política explícita").
  REDONDEAR_DINERO: { parametros: ['MONEY', 'NUMBER'], retorno: 'MONEY' },
}

export interface ResultadoAnalyzer {
  readonly tipoRetorno: Tipo | null
  readonly diagnosticos: readonly Diagnostico[]
}

export function analizar(
  regla: Regla,
  catalogoContratos: CatalogoContratos,
  origen = '<fuente>',
): ResultadoAnalyzer {
  const diagnosticos: Diagnostico[] = []
  const variables = new Map<string, Tipo>()
  const tiposRetorno = new Set<Tipo>()

  function reportar(codigo: string, mensaje: string, span: Expresion['span']): void {
    diagnosticos.push(crearDiagnostico({ codigo, severidad: 'ERROR', mensaje, span, origen }))
  }

  /** `undefined` si ya se reportó un error — el llamador debe abortar esa rama. */
  function tipoDe(expr: Expresion): Tipo | undefined {
    switch (expr.tipo) {
      case 'NumeroLiteral':
        return 'NUMBER'
      case 'DineroLiteral':
        return 'MONEY'
      case 'BooleanoLiteral':
        return 'BOOLEAN'
      case 'NuloLiteral':
        return 'NULO'

      case 'Identificador': {
        const t = variables.get(expr.nombre)
        if (!t) {
          reportar('AEL-ANALYZER-UNDEFINED', `Variable no definida: "${expr.nombre}"`, expr.span)
          return undefined
        }
        return t
      }

      case 'ReferenciaContract': {
        const campos = catalogoContratos[expr.contrato]
        if (!campos) {
          reportar(
            'AEL-ANALYZER-UNKNOWN_CONTRACT',
            `Contract desconocido: "${expr.contrato}"`,
            expr.span,
          )
          return undefined
        }
        const t = campos[expr.campo]
        if (!t) {
          reportar(
            'AEL-ANALYZER-UNKNOWN_CONTRACT_FIELD',
            `"${expr.contrato}" no tiene el campo "${expr.campo}"`,
            expr.span,
          )
          return undefined
        }
        return t
      }

      case 'LlamadaFuncion': {
        const firma = FUNCIONES[expr.nombre]
        if (!firma) {
          reportar(
            'AEL-ANALYZER-UNKNOWN_FUNCTION',
            `Función desconocida: "${expr.nombre}"`,
            expr.span,
          )
          return undefined
        }
        if (expr.argumentos.length !== firma.parametros.length) {
          reportar(
            'AEL-ANALYZER-ARITY_MISMATCH',
            `"${expr.nombre}" espera ${String(firma.parametros.length)} argumento(s), ` +
              `recibió ${String(expr.argumentos.length)}`,
            expr.span,
          )
          return undefined
        }
        // for-loop directo (no closure): así TS sigue el flujo de `ok` sin
        // ambigüedad hasta el `return` final.
        let ok = true
        for (let i = 0; i < expr.argumentos.length; i++) {
          const arg = expr.argumentos[i]
          const tEsperado = firma.parametros[i]
          if (arg === undefined || tEsperado === undefined) continue // aridad ya validada arriba
          const tArg = tipoDe(arg)
          if (tArg === undefined) {
            ok = false
            continue
          }
          if (tArg !== tEsperado) {
            reportar(
              'AEL-TYPE-ARGUMENT_MISMATCH',
              `Argumento ${String(i + 1)} de "${expr.nombre}": se esperaba ${tEsperado}, ` +
                `se recibió ${tArg}`,
              arg.span,
            )
            ok = false
          }
        }
        return ok ? firma.retorno : undefined
      }

      case 'ExpresionUnaria': {
        const t = tipoDe(expr.operando)
        if (t === undefined) return undefined
        if (t !== 'NUMBER') {
          reportar(
            'AEL-TYPE-INVALID_UNARY',
            `El operador unario "-" solo aplica a NUMBER, se recibió ${t}`,
            expr.span,
          )
          return undefined
        }
        return 'NUMBER'
      }

      case 'ExpresionBinaria':
        return tipoDeBinaria(expr)
    }
  }

  function tipoDeBinaria(expr: Extract<Expresion, { tipo: 'ExpresionBinaria' }>): Tipo | undefined {
    const izq = tipoDe(expr.izquierda)
    const der = tipoDe(expr.derecha)
    if (izq === undefined || der === undefined) return undefined

    const { operador } = expr

    if (operador === '==' || operador === '!=') {
      if (izq !== der) {
        reportar(
          'AEL-TYPE-MISMATCH',
          `No se puede comparar ${izq} con ${der} (${operador})`,
          expr.span,
        )
        return undefined
      }
      return 'BOOLEAN'
    }

    if (operador === '>' || operador === '>=' || operador === '<' || operador === '<=') {
      if (izq !== 'NUMBER' || der !== 'NUMBER') {
        reportar(
          'AEL-TYPE-MISMATCH',
          `El operador "${operador}" solo compara NUMBER, se recibió ${izq} y ${der}`,
          expr.span,
        )
        return undefined
      }
      return 'BOOLEAN'
    }

    if (operador === '+' || operador === '-') {
      if (izq === 'NUMBER' && der === 'NUMBER') return 'NUMBER'
      if (izq === 'MONEY' && der === 'MONEY') return 'MONEY'
      reportar(
        'AEL-TYPE-MISMATCH',
        `"${operador}" requiere dos NUMBER o dos MONEY, se recibió ${izq} y ${der} (16 §41)`,
        expr.span,
      )
      return undefined
    }

    if (operador === '*') {
      if (izq === 'NUMBER' && der === 'NUMBER') return 'NUMBER'
      if (izq === 'MONEY' && der === 'NUMBER') return 'MONEY'
      if (izq === 'NUMBER' && der === 'MONEY') return 'MONEY'
      reportar(
        'AEL-TYPE-MISMATCH',
        `"*" no está definido entre ${izq} y ${der} (01 §16)`,
        expr.span,
      )
      return undefined
    }

    // operador === '/'
    if (izq === 'NUMBER' && der === 'NUMBER') return 'NUMBER'
    if (izq === 'MONEY' && der === 'NUMBER') return 'MONEY'
    reportar('AEL-TYPE-MISMATCH', `"/" no está definido entre ${izq} y ${der} (01 §16)`, expr.span)
    return undefined
  }

  function analizarInstruccion(inst: Instruccion): void {
    switch (inst.tipo) {
      case 'Declaracion': {
        const t = tipoDe(inst.expresion)
        // 02 §21 REDECLARACIÓN — no se permite redefinir un nombre existente.
        if (variables.has(inst.nombre)) {
          reportar(
            'AEL-ANALYZER-REDECLARATION',
            `"${inst.nombre}" ya fue declarado — 02 §21 prohíbe redeclarar`,
            inst.span,
          )
        } else if (t !== undefined) {
          variables.set(inst.nombre, t)
        }
        return
      }
      case 'Retorno': {
        const t = tipoDe(inst.expresion)
        if (t !== undefined) tiposRetorno.add(t)
        return
      }
      case 'Condicional': {
        const tCond = tipoDe(inst.condicion)
        if (tCond !== undefined && tCond !== 'BOOLEAN') {
          reportar(
            'AEL-TYPE-CONDITION_NOT_BOOLEAN',
            `La condición de SI debe ser BOOLEAN, se recibió ${tCond} (02 §35)`,
            inst.condicion.span,
          )
        }
        inst.entonces.forEach(analizarInstruccion)
        inst.sino?.forEach(analizarInstruccion)
        return
      }
    }
  }

  regla.cuerpo.forEach(analizarInstruccion)

  if (tiposRetorno.size > 1) {
    reportar(
      'AEL-ANALYZER-INCONSISTENT_RETURN',
      `La regla retorna tipos inconsistentes: ${[...tiposRetorno].join(', ')} (02 §39)`,
      regla.span,
    )
    return { tipoRetorno: null, diagnosticos }
  }

  return { tipoRetorno: [...tiposRetorno][0] ?? null, diagnosticos }
}
