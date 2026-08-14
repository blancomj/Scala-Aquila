/**
 * Parser recursivo-descendente de AEL v0.
 * Propietario documental: Docs/02 §56-64 GRAMÁTICA EBNF.
 *
 * Precedencia (de menor a mayor), Docs/02 §57 — sin Y/O/NO (ningún
 * piloto los usa; se amplía cuando haga falta, PLAN §3.4):
 *   igualdad (== !=) → relacional (> >= < <=) → aditiva (+ -)
 *   → multiplicativa (* /) → unaria (-) → primaria
 *
 * "Una entrada inválida nunca debe provocar un crash del proceso"
 * (01 §54): un error de sintaxis se captura como ParseError interno y se
 * traduce a un Diagnostico; parsear() nunca lanza hacia afuera.
 */
import { crearDiagnostico, type Diagnostico } from '@aquila/ael-core'
import type {
  Condicional,
  Declaracion,
  Expresion,
  Instruccion,
  OperadorBinario,
  Regla,
  Retorno,
} from './ast.js'
import type { Token, TipoToken } from './tokens.js'
import { tokenizar } from './lexer.js'

/** Ruptura de control interna — nunca cruza la frontera pública del módulo. */
class ParseError extends Error {}

/** ISO 4217: 3 letras mayúsculas — igual que financial-kernel/src/money.ts. */
const PATRON_MONEDA = /^[A-Z]{3}$/

export interface ResultadoParser {
  readonly regla: Regla | null
  readonly diagnosticos: readonly Diagnostico[]
}

export function parsear(fuente: string, origen = '<fuente>'): ResultadoParser {
  const { tokens, diagnosticos: diagnosticosLexer } = tokenizar(fuente, origen)
  const diagnosticos: Diagnostico[] = [...diagnosticosLexer]
  let pos = 0

  function actual(): Token {
    const t = tokens[pos]
    if (t === undefined) {
      // Invariante: avanzar() nunca incrementa pos más allá de FIN_ARCHIVO.
      throw new Error('Invariante violado: posición de parser fuera de rango')
    }
    return t
  }

  function chequear(tipo: TipoToken): boolean {
    return actual().tipo === tipo
  }

  function avanzar(): Token {
    const t = actual()
    if (t.tipo !== 'FIN_ARCHIVO') pos++
    return t
  }

  function error(mensaje: string, codigo: string): never {
    const t = actual()
    diagnosticos.push(
      crearDiagnostico({
        codigo,
        severidad: 'ERROR',
        mensaje,
        span: t.span,
        origen,
      }),
    )
    throw new ParseError(mensaje)
  }

  function esperar(tipo: TipoToken, descripcion: string): Token {
    if (!chequear(tipo)) {
      error(
        `Se esperaba ${descripcion}, se encontró "${actual().lexema || tipo}"`,
        'AEL-PARSER-UNEXPECTED_TOKEN',
      )
    }
    return avanzar()
  }

  // ─────────────────────────── Expresiones ───────────────────────────

  function parsearPrimaria(): Expresion {
    const t = actual()

    if (t.tipo === 'NUMERO') {
      avanzar()
      const siguiente = actual()
      if (siguiente.tipo === 'IDENTIFICADOR' && PATRON_MONEDA.test(siguiente.lexema)) {
        avanzar()
        return {
          tipo: 'DineroLiteral',
          monto: t.lexema,
          moneda: siguiente.lexema,
          span: { inicio: t.span.inicio, fin: siguiente.span.fin },
        }
      }
      return { tipo: 'NumeroLiteral', valor: t.lexema, span: t.span }
    }

    if (t.tipo === 'VERDADERO' || t.tipo === 'FALSO') {
      avanzar()
      return { tipo: 'BooleanoLiteral', valor: t.tipo === 'VERDADERO', span: t.span }
    }

    if (t.tipo === 'NULO') {
      avanzar()
      return { tipo: 'NuloLiteral', span: t.span }
    }

    if (t.tipo === 'PARENTESIS_IZQ') {
      avanzar()
      const expr = parsearExpresion()
      const cierre = esperar('PARENTESIS_DER', '")"')
      return { ...expr, span: { inicio: t.span.inicio, fin: cierre.span.fin } }
    }

    if (t.tipo === 'IDENTIFICADOR') {
      avanzar()
      const nombre = t.lexema

      // referencia_contract: IDENT "." IDENT (02 §62)
      if (chequear('PUNTO')) {
        avanzar()
        const campo = esperar('IDENTIFICADOR', 'un nombre de campo tras "."')
        return {
          tipo: 'ReferenciaContract',
          contrato: nombre,
          campo: campo.lexema,
          span: { inicio: t.span.inicio, fin: campo.span.fin },
        }
      }

      // llamada_funcion: IDENT "(" args ")" (02 §63)
      if (chequear('PARENTESIS_IZQ')) {
        avanzar()
        const argumentos: Expresion[] = []
        if (!chequear('PARENTESIS_DER')) {
          argumentos.push(parsearExpresion())
          while (chequear('COMA')) {
            avanzar()
            argumentos.push(parsearExpresion())
          }
        }
        const cierre = esperar('PARENTESIS_DER', '")" al cerrar la llamada a función')
        return {
          tipo: 'LlamadaFuncion',
          nombre,
          argumentos,
          span: { inicio: t.span.inicio, fin: cierre.span.fin },
        }
      }

      return { tipo: 'Identificador', nombre, span: t.span }
    }

    error(`Expresión inesperada: "${t.lexema || t.tipo}"`, 'AEL-PARSER-UNEXPECTED_TOKEN')
  }

  function parsearUnaria(): Expresion {
    const t = actual()
    if (t.tipo === 'MENOS') {
      avanzar()
      const operando = parsearUnaria()
      return { tipo: 'ExpresionUnaria', operador: '-', operando, span: t.span }
    }
    return parsearPrimaria()
  }

  function parsearBinariaIzqAsoc(
    siguienteNivel: () => Expresion,
    operadores: Partial<Record<TipoToken, OperadorBinario>>,
  ): Expresion {
    let izquierda = siguienteNivel()
    for (;;) {
      const op = operadores[actual().tipo]
      if (!op) return izquierda
      avanzar()
      const derecha = siguienteNivel()
      izquierda = {
        tipo: 'ExpresionBinaria',
        operador: op,
        izquierda,
        derecha,
        span: { inicio: izquierda.span.inicio, fin: derecha.span.fin },
      }
    }
  }

  const parsearMultiplicativa = () =>
    parsearBinariaIzqAsoc(parsearUnaria, { POR: '*', DIVIDIDO: '/' })
  const parsearAditiva = () =>
    parsearBinariaIzqAsoc(parsearMultiplicativa, { MAS: '+', MENOS: '-' })
  const parsearRelacional = () =>
    parsearBinariaIzqAsoc(parsearAditiva, {
      MAYOR: '>',
      MAYOR_IGUAL: '>=',
      MENOR: '<',
      MENOR_IGUAL: '<=',
    })
  const parsearIgualdad = () =>
    parsearBinariaIzqAsoc(parsearRelacional, { IGUAL_IGUAL: '==', DISTINTO: '!=' })

  function parsearExpresion(): Expresion {
    return parsearIgualdad()
  }

  // ─────────────────────────── Instrucciones ──────────────────────────

  function parsearDeclaracion(): Declaracion {
    const inicio = esperar('DEFINIR', 'DEFINIR')
    const nombre = esperar('IDENTIFICADOR', 'un nombre de variable')
    esperar('IGUAL', '"=" en la declaración')
    const expresion = parsearExpresion()
    return {
      tipo: 'Declaracion',
      nombre: nombre.lexema,
      expresion,
      span: { inicio: inicio.span.inicio, fin: expresion.span.fin },
    }
  }

  function parsearRetorno(): Retorno {
    const inicio = esperar('RETORNAR', 'RETORNAR')
    const expresion = parsearExpresion()
    return { tipo: 'Retorno', expresion, span: { inicio: inicio.span.inicio, fin: expresion.span.fin } }
  }

  function parsearCondicional(): Condicional {
    const inicio = esperar('SI', 'SI')
    const condicion = parsearExpresion()
    esperar('ENTONCES', 'ENTONCES')
    const entonces = parsearInstrucciones(['SINO', 'FIN'])
    let sino: Instruccion[] | null = null
    if (chequear('SINO')) {
      avanzar()
      sino = parsearInstrucciones(['FIN'])
    }
    const fin = esperar('FIN', 'FIN para cerrar el condicional')
    return {
      tipo: 'Condicional',
      condicion,
      entonces,
      sino,
      span: { inicio: inicio.span.inicio, fin: fin.span.fin },
    }
  }

  function parsearInstruccion(): Instruccion {
    const t = actual()
    if (t.tipo === 'DEFINIR') return parsearDeclaracion()
    if (t.tipo === 'RETORNAR') return parsearRetorno()
    if (t.tipo === 'SI') return parsearCondicional()
    if (t.tipo === 'MIENTRAS') {
      error(
        'MIENTRAS no está soportado en AEL v0: el evaluador trabaja sobre expresiones, ' +
          'sin bucles (AD-21, PLAN_MAESTRO_IMPLEMENTACION.md §1.1)',
        'AEL-PARSER-UNSUPPORTED_MIENTRAS',
      )
    }
    error(
      `Se esperaba una instrucción (DEFINIR, RETORNAR o SI), se encontró "${t.lexema || t.tipo}"`,
      'AEL-PARSER-UNEXPECTED_TOKEN',
    )
  }

  function parsearInstrucciones(terminadores: readonly TipoToken[]): Instruccion[] {
    const instrucciones: Instruccion[] = []
    while (!terminadores.includes(actual().tipo) && !chequear('FIN_ARCHIVO')) {
      instrucciones.push(parsearInstruccion())
    }
    return instrucciones
  }

  function parsearRegla(): Regla {
    const inicio = esperar('REGLA', 'REGLA')
    const nombre = esperar('IDENTIFICADOR', 'el nombre de la regla')
    const cuerpo = parsearInstrucciones(['FIN_ARCHIVO'])
    const finToken = actual()
    return {
      tipo: 'Regla',
      nombre: nombre.lexema,
      cuerpo,
      span: { inicio: inicio.span.inicio, fin: finToken.span.fin },
    }
  }

  try {
    const regla = parsearRegla()
    return { regla, diagnosticos }
  } catch (e) {
    if (e instanceof ParseError) {
      return { regla: null, diagnosticos }
    }
    throw e
  }
}
