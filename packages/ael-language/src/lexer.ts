/**
 * Lexer de AEL v0.
 * Propietario documental: Docs/02 §65-67 LEXER.
 *
 * "Una entrada inválida nunca debe provocar un crash del proceso" (01 §54
 * FUZZING). Un carácter no reconocido produce un diagnóstico y el lexer
 * continúa, no lanza una excepción.
 */
import { crearDiagnostico, type Diagnostico, type Posicion } from '@aquila/ael-core'
import { esPalabraReservada, type Token, type TipoToken } from './tokens.js'

const UN_CARACTER: Record<string, TipoToken> = {
  '(': 'PARENTESIS_IZQ',
  ')': 'PARENTESIS_DER',
  '.': 'PUNTO',
  ',': 'COMA',
  '+': 'MAS',
  '-': 'MENOS',
  '*': 'POR',
  '/': 'DIVIDIDO',
}

export interface ResultadoLexer {
  readonly tokens: readonly Token[]
  readonly diagnosticos: readonly Diagnostico[]
}

export function tokenizar(fuente: string, origen = '<fuente>'): ResultadoLexer {
  const tokens: Token[] = []
  const diagnosticos: Diagnostico[] = []
  let i = 0
  let linea = 1
  let columna = 1

  function posicionActual(): Posicion {
    return { linea, columna }
  }

  /** Mira el carácter en `i + desplazamiento` sin consumirlo. */
  function mirar(desplazamiento = 0): string | undefined {
    return fuente[i + desplazamiento]
  }

  function avanzar(): string {
    const c = mirar()
    if (c === undefined) {
      throw new Error('Invariante violado: avanzar() llamado al final de la fuente')
    }
    i++
    if (c === '\n') {
      linea++
      columna = 1
    } else {
      columna++
    }
    return c
  }

  function agregarToken(tipo: TipoToken, lexema: string, inicio: Posicion): void {
    tokens.push({ tipo, lexema, span: { inicio, fin: posicionActual() } })
  }

  for (;;) {
    const c = mirar()
    if (c === undefined) break
    const inicio = posicionActual()

    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      avanzar()
      continue
    }

    // Docs/01 §8 COMENTARIOS — línea completa desde //
    if (c === '/' && mirar(1) === '/') {
      while (mirar() !== undefined && mirar() !== '\n') avanzar()
      continue
    }

    if (c === '=') {
      avanzar()
      if (mirar() === '=') {
        avanzar()
        agregarToken('IGUAL_IGUAL', '==', inicio)
      } else {
        agregarToken('IGUAL', '=', inicio)
      }
      continue
    }

    if (c === '!') {
      avanzar()
      if (mirar() === '=') {
        avanzar()
        agregarToken('DISTINTO', '!=', inicio)
      } else {
        diagnosticos.push(
          crearDiagnostico({
            codigo: 'AEL-LEXER-UNEXPECTED_CHAR',
            severidad: 'ERROR',
            mensaje: `Carácter inesperado "!" — ¿quisiste decir "!="?`,
            span: { inicio, fin: posicionActual() },
            origen,
          }),
        )
      }
      continue
    }

    if (c === '>') {
      avanzar()
      if (mirar() === '=') {
        avanzar()
        agregarToken('MAYOR_IGUAL', '>=', inicio)
      } else {
        agregarToken('MAYOR', '>', inicio)
      }
      continue
    }

    if (c === '<') {
      avanzar()
      if (mirar() === '=') {
        avanzar()
        agregarToken('MENOR_IGUAL', '<=', inicio)
      } else {
        agregarToken('MENOR', '<', inicio)
      }
      continue
    }

    const tipoUnCaracter = UN_CARACTER[c]
    if (tipoUnCaracter) {
      avanzar()
      agregarToken(tipoUnCaracter, c, inicio)
      continue
    }

    // Docs/02 §9-10: literales numéricos, con decimales.
    if (/[0-9]/.test(c)) {
      let lexema = ''
      while (/[0-9]/.test(mirar() ?? '')) lexema += avanzar()
      if (mirar() === '.' && /[0-9]/.test(mirar(1) ?? '')) {
        lexema += avanzar() // '.'
        while (/[0-9]/.test(mirar() ?? '')) lexema += avanzar()
      }
      agregarToken('NUMERO', lexema, inicio)
      continue
    }

    // Docs/02 §4: identificador = letra + {letra|dígito|_}
    if (/[a-zA-Z]/.test(c)) {
      let lexema = ''
      while (/[a-zA-Z0-9_]/.test(mirar() ?? '')) lexema += avanzar()
      if (esPalabraReservada(lexema)) {
        agregarToken(lexema, lexema, inicio)
      } else {
        agregarToken('IDENTIFICADOR', lexema, inicio)
      }
      continue
    }

    avanzar()
    diagnosticos.push(
      crearDiagnostico({
        codigo: 'AEL-LEXER-UNEXPECTED_CHAR',
        severidad: 'ERROR',
        mensaje: `Carácter inesperado: "${c}"`,
        span: { inicio, fin: posicionActual() },
        origen,
      }),
    )
  }

  tokens.push({
    tipo: 'FIN_ARCHIVO',
    lexema: '',
    span: { inicio: posicionActual(), fin: posicionActual() },
  })

  return { tokens, diagnosticos }
}
