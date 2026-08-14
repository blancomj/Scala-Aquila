/**
 * Evaluador de AEL v0 — árbol de sintaxis → TypedValue.
 * Propietario documental: Docs/06 §428 FINAL EXECUTION MODEL, 01 §16
 * (semántica dimensional de los operadores).
 *
 * Precondición: `regla` debe haber pasado por `analizar()` de
 * @aquila/ael-language sin diagnósticos ERROR, usando el MISMO catálogo que
 * expone `contexto.catalogo`. El evaluador hace una verificación de
 * frontera mínima (tipo declarado vs. tipo que devuelve el proveedor) pero
 * no repite la verificación estática completa — confía en que el Analyzer
 * ya se ejecutó (0AEL §20: cada error se detecta en la capa que corresponde).
 *
 * Evaluación fail-fast: el primer error aborta toda la evaluación — una
 * regla financiera no tiene "resultado parcial" — y se reporta como un
 * único Diagnostico, a diferencia del Analyzer, que acumula todos los
 * errores estáticos posibles para dar mejor DX.
 *
 * NOTA (alcance compartido con el Analyzer, PLAN §3.4): DEFINIR dentro de
 * una rama SI/SINO queda visible fuera de la rama, igual que en
 * ael-language/src/analyzer.ts — el entorno es un único mapa plano por
 * regla, no hay scoping por bloque. Ninguna de las tres reglas piloto
 * declara variables dentro de una rama, así que el caso contrario no se ha
 * ejercitado; ampliar si un caso real lo requiere (AD-23).
 */
import { crearDiagnostico, type Diagnostico } from '@aquila/ael-core'
import type { Expresion, Instruccion, Regla } from '@aquila/ael-language'
import {
  compararDecimales,
  crearDecimal,
  dividir,
  dividirDecimales,
  esIgual,
  money,
  multiplicar,
  multiplicarDecimales,
  negarDecimal,
  restar,
  restarDecimales,
  sumar,
  sumarDecimales,
} from '@aquila/financial-kernel'
import type { ExecutionContext } from './context.js'
import { InvarianteEvaluadorError } from './errors.js'
import { FUNCIONES } from './functions.js'
import { booleano, dinero, numero, type TypedValue } from './typed-value.js'

export interface ResultadoEvaluador {
  readonly resultado: TypedValue | null
  readonly diagnosticos: readonly Diagnostico[]
}

export function evaluar(
  regla: Regla,
  contexto: ExecutionContext,
  origen = '<fuente>',
): ResultadoEvaluador {
  try {
    const entorno = new Map<string, TypedValue>()
    const resultado = evaluarInstrucciones(regla.cuerpo, entorno, contexto)
    return { resultado, diagnosticos: [] }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    return {
      resultado: null,
      diagnosticos: [
        crearDiagnostico({
          codigo: 'AEL-RUNTIME-EVALUATION_ERROR',
          severidad: 'ERROR',
          mensaje,
          span: regla.span,
          origen,
        }),
      ],
    }
  }
}

/** `null` mientras ninguna instrucción de esta lista haya ejecutado RETORNAR. */
function evaluarInstrucciones(
  instrucciones: readonly Instruccion[],
  entorno: Map<string, TypedValue>,
  contexto: ExecutionContext,
): TypedValue | null {
  for (const inst of instrucciones) {
    switch (inst.tipo) {
      case 'Declaracion':
        entorno.set(inst.nombre, evaluarExpresion(inst.expresion, entorno, contexto))
        break

      case 'Retorno':
        return evaluarExpresion(inst.expresion, entorno, contexto)

      case 'Condicional': {
        const condicion = booleano(evaluarExpresion(inst.condicion, entorno, contexto))
        const rama = condicion.valor ? inst.entonces : inst.sino
        if (rama !== null) {
          const resultado = evaluarInstrucciones(rama, entorno, contexto)
          if (resultado !== null) return resultado
        }
        break
      }
    }
  }
  return null
}

function evaluarExpresion(
  expr: Expresion,
  entorno: Map<string, TypedValue>,
  contexto: ExecutionContext,
): TypedValue {
  switch (expr.tipo) {
    case 'NumeroLiteral':
      return { tipo: 'NUMBER', valor: crearDecimal(expr.valor) }

    case 'DineroLiteral':
      return { tipo: 'MONEY', valor: money(expr.monto, expr.moneda) }

    case 'BooleanoLiteral':
      return { tipo: 'BOOLEAN', valor: expr.valor }

    case 'NuloLiteral':
      return { tipo: 'NULO' }

    case 'Identificador': {
      const v = entorno.get(expr.nombre)
      if (v === undefined) {
        throw new InvarianteEvaluadorError(
          `variable no definida en tiempo de ejecución: "${expr.nombre}" — debió rechazarse en el Analyzer`,
        )
      }
      return v
    }

    case 'ReferenciaContract':
      return resolverContract(expr.contrato, expr.campo, contexto)

    case 'LlamadaFuncion': {
      const impl = FUNCIONES[expr.nombre]
      if (!impl) {
        throw new InvarianteEvaluadorError(
          `función desconocida: "${expr.nombre}" — debió rechazarse en el Analyzer`,
        )
      }
      const argumentos = expr.argumentos.map((a) => evaluarExpresion(a, entorno, contexto))
      return impl(argumentos, contexto.modoRedondeoDinero)
    }

    case 'ExpresionUnaria': {
      const operando = numero(evaluarExpresion(expr.operando, entorno, contexto))
      return { tipo: 'NUMBER', valor: negarDecimal(operando.valor) }
    }

    case 'ExpresionBinaria':
      return evaluarBinaria(expr, entorno, contexto)
  }
}

function resolverContract(contrato: string, campo: string, contexto: ExecutionContext): TypedValue {
  const tipoEsperado = contexto.catalogo[contrato]?.[campo]
  if (tipoEsperado === undefined) {
    throw new InvarianteEvaluadorError(
      `Contract desconocido en el catálogo de ejecución: "${contrato}.${campo}" — debió rechazarse en el Analyzer`,
    )
  }
  const valor = contexto.resolverContract(contrato, campo)
  if (valor.tipo !== tipoEsperado) {
    throw new InvarianteEvaluadorError(
      `el proveedor de contexto devolvió ${valor.tipo} para "${contrato}.${campo}", ` +
        `el catálogo declara ${tipoEsperado}`,
    )
  }
  return valor
}

function evaluarBinaria(
  expr: Extract<Expresion, { tipo: 'ExpresionBinaria' }>,
  entorno: Map<string, TypedValue>,
  contexto: ExecutionContext,
): TypedValue {
  const izq = evaluarExpresion(expr.izquierda, entorno, contexto)
  const der = evaluarExpresion(expr.derecha, entorno, contexto)
  const { operador } = expr

  if (operador === '==' || operador === '!=') {
    const iguales = sonIguales(izq, der)
    return { tipo: 'BOOLEAN', valor: operador === '==' ? iguales : !iguales }
  }

  if (operador === '>' || operador === '>=' || operador === '<' || operador === '<=') {
    const a = numero(izq)
    const b = numero(der)
    const cmp = compararDecimales(a.valor, b.valor)
    const valor =
      operador === '>'
        ? cmp > 0
        : operador === '>='
          ? cmp >= 0
          : operador === '<'
            ? cmp < 0
            : cmp <= 0
    return { tipo: 'BOOLEAN', valor }
  }

  if (operador === '+') {
    if (izq.tipo === 'NUMBER' && der.tipo === 'NUMBER') {
      return { tipo: 'NUMBER', valor: sumarDecimales([izq.valor, der.valor]) }
    }
    if (izq.tipo === 'MONEY' && der.tipo === 'MONEY') {
      return { tipo: 'MONEY', valor: sumar(izq.valor, der.valor) }
    }
    throw new InvarianteEvaluadorError(`"+" no soportado entre ${izq.tipo} y ${der.tipo}`)
  }

  if (operador === '-') {
    if (izq.tipo === 'NUMBER' && der.tipo === 'NUMBER') {
      return { tipo: 'NUMBER', valor: restarDecimales(izq.valor, der.valor) }
    }
    if (izq.tipo === 'MONEY' && der.tipo === 'MONEY') {
      return { tipo: 'MONEY', valor: restar(izq.valor, der.valor) }
    }
    throw new InvarianteEvaluadorError(`"-" no soportado entre ${izq.tipo} y ${der.tipo}`)
  }

  if (operador === '*') {
    if (izq.tipo === 'NUMBER' && der.tipo === 'NUMBER') {
      return { tipo: 'NUMBER', valor: multiplicarDecimales(izq.valor, der.valor) }
    }
    if (izq.tipo === 'MONEY' && der.tipo === 'NUMBER') {
      return { tipo: 'MONEY', valor: multiplicar(izq.valor, der.valor) }
    }
    if (izq.tipo === 'NUMBER' && der.tipo === 'MONEY') {
      return { tipo: 'MONEY', valor: multiplicar(der.valor, izq.valor) }
    }
    throw new InvarianteEvaluadorError(`"*" no soportado entre ${izq.tipo} y ${der.tipo}`)
  }

  // operador === '/'
  if (izq.tipo === 'NUMBER' && der.tipo === 'NUMBER') {
    return { tipo: 'NUMBER', valor: dividirDecimales(izq.valor, der.valor) }
  }
  if (izq.tipo === 'MONEY' && der.tipo === 'NUMBER') {
    return { tipo: 'MONEY', valor: dividir(izq.valor, der.valor) }
  }
  throw new InvarianteEvaluadorError(`"/" no soportado entre ${izq.tipo} y ${der.tipo}`)
}

function sonIguales(a: TypedValue, b: TypedValue): boolean {
  if (a.tipo !== b.tipo) {
    throw new InvarianteEvaluadorError(
      `"==" / "!=" requieren el mismo tipo, fue ${a.tipo} y ${b.tipo}`,
    )
  }
  switch (a.tipo) {
    case 'NULO':
      return true
    case 'BOOLEAN':
      return a.valor === booleano(b).valor
    case 'NUMBER':
      return compararDecimales(a.valor, numero(b).valor) === 0
    case 'MONEY':
      return esIgual(a.valor, dinero(b).valor)
  }
}
