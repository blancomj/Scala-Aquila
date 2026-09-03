/**
 * AEL-004 Fase 3 — resaltado de sintaxis CodeMirror compartido, extraído de
 * AelEditor.vue (Fase 2) para reutilizarlo también en AelVersionDiff.vue
 * (Fase 3) sin duplicarlo. Reutiliza tokenizar() real de
 * @aquila/ael-language — no una gramática CodeMirror/Lezer paralela que
 * pudiera divergir del lexer real. Refactor puro: mismo comportamiento que
 * tenía inline en AelEditor.vue.
 */
import { EditorView } from 'codemirror'
import { StateField, type Extension, type Text } from '@codemirror/state'
import { Decoration, type DecorationSet } from '@codemirror/view'
import { tokenizar, type Token, type TipoToken } from '@aquila/ael-language'

const PALABRA_RESERVADA = new Set<TipoToken>([
  'REGLA',
  'DEFINIR',
  'RETORNAR',
  'SI',
  'ENTONCES',
  'SINO',
  'FIN',
  'MIENTRAS',
  'VERDADERO',
  'FALSO',
  'NULO',
])
const OPERADOR = new Set<TipoToken>([
  'IGUAL',
  'IGUAL_IGUAL',
  'DISTINTO',
  'MAYOR',
  'MAYOR_IGUAL',
  'MENOR',
  'MENOR_IGUAL',
  'MAS',
  'MENOS',
  'POR',
  'DIVIDIDO',
])
const PUNTUACION = new Set<TipoToken>(['PARENTESIS_IZQ', 'PARENTESIS_DER', 'PUNTO', 'COMA'])

const CONTRATOS = ['PARAMETER', 'UNIT', 'CONCEPTO'] as const

const CLASE_POR_CONTRATO: Readonly<Record<string, string>> = {
  PARAMETER: 'cm-ael-parametro',
  UNIT: 'cm-ael-inmueble',
  CONCEPTO: 'cm-ael-concepto',
}

/**
 * Clase de un token, MIRANDO SU CONTEXTO (Fase 8, hallazgo X3).
 *
 * Antes se coloreaba solo por tipo de token, así que en modo texto
 * `PARAMETER.PRESUPUESTO_ANUAL` y `CONCEPTO.CUOTA` se veían iguales —los dos
 * son IDENTIFICADOR— mientras que en modo bloques cada uno tenía su color por
 * origen del dato. Nada coincidía entre los dos modos y cambiar de modo
 * obligaba a reaprender el código de color.
 *
 * Ahora el eje que importa —de dónde sale el valor— se pinta igual en los dos:
 * el nombre del contrato y su campo toman el color del origen, y una función
 * conocida toma el de función. Lo estructural (palabras clave, operadores,
 * puntuación) va en neutro, también en los dos modos.
 */
function claseParaToken(tokens: readonly Token[], indice: number): string | null {
  const token = tokens[indice]
  if (!token) return null
  const { tipo, lexema } = token

  if (PALABRA_RESERVADA.has(tipo)) return 'cm-ael-keyword'
  if (tipo === 'NUMERO') return 'cm-ael-number'
  if (OPERADOR.has(tipo)) return 'cm-ael-operator'
  if (PUNTUACION.has(tipo)) return 'cm-ael-punctuation'
  if (tipo !== 'IDENTIFICADOR') return null

  // `CONTRATO` en `CONTRATO.campo`
  if (tokens[indice + 1]?.tipo === 'PUNTO' && (CONTRATOS as readonly string[]).includes(lexema)) {
    return CLASE_POR_CONTRATO[lexema] ?? 'cm-ael-identifier'
  }
  // `campo` en `CONTRATO.campo`
  if (tokens[indice - 1]?.tipo === 'PUNTO') {
    const contrato = tokens[indice - 2]
    if (contrato?.tipo === 'IDENTIFICADOR' && CLASE_POR_CONTRATO[contrato.lexema]) {
      return CLASE_POR_CONTRATO[contrato.lexema] ?? null
    }
  }
  // `NOMBRE(` — una llamada a función
  if (tokens[indice + 1]?.tipo === 'PARENTESIS_IZQ') return 'cm-ael-funcion'

  return 'cm-ael-identifier'
}

/** span usa línea/columna 1-indexadas (packages/ael-core/src/diagnostics.ts). */
export function offsetDesdePosicion(doc: Text, linea: number, columna: number): number {
  const lineaClamp = Math.min(Math.max(linea, 1), doc.lines)
  return doc.line(lineaClamp).from + (columna - 1)
}

export function clamp(offset: number, doc: Text): number {
  return Math.min(Math.max(offset, 0), doc.length)
}

function decoracionesDesdeTexto(doc: Text): DecorationSet {
  const { tokens } = tokenizar(doc.toString())
  const decoraciones = tokens
    .map((token: Token, indice: number) => {
      const clase = claseParaToken(tokens, indice)
      if (!clase) return null
      const from = offsetDesdePosicion(doc, token.span.inicio.linea, token.span.inicio.columna)
      const to = offsetDesdePosicion(doc, token.span.fin.linea, token.span.fin.columna)
      if (to <= from) return null
      return Decoration.mark({ class: clase }).range(from, to)
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
  return Decoration.set(decoraciones, true)
}

const campoResaltado = StateField.define<DecorationSet>({
  create(state) {
    return decoracionesDesdeTexto(state.doc)
  },
  update(decoraciones, tr) {
    if (!tr.docChanged) return decoraciones.map(tr.changes)
    return decoracionesDesdeTexto(tr.state.doc)
  },
  provide: (campo) => EditorView.decorations.from(campo),
})

const tema = EditorView.theme({
  '&': { fontSize: '0.75rem' },
  '.cm-content': { fontFamily: 'ui-monospace, monospace' },
  // Mismas variables que las píldoras del lienzo (assets/css/tokens.css):
  // el origen del dato se ve igual en los dos modos del editor.
  '.cm-ael-parametro': { color: 'var(--ael-parametro)', fontWeight: '500' },
  '.cm-ael-inmueble': { color: 'var(--ael-inmueble)', fontWeight: '500' },
  '.cm-ael-concepto': { color: 'var(--ael-concepto)', fontWeight: '500' },
  '.cm-ael-funcion': { color: 'var(--ael-funcion)', fontWeight: '500' },
  // Estructura en neutro — la palabra clave era morada, el mismo morado de
  // CONCEPTO, así que `SI` y una referencia a concepto se confundían.
  '.cm-ael-keyword': { color: 'var(--ael-estructura)', fontWeight: '600' },
  '.cm-ael-operator': { color: 'var(--ael-estructura)' },
  '.cm-ael-punctuation': { color: 'var(--ael-estructura)' },
  '.cm-ael-number': { color: 'var(--ael-literal)' },
  '.cm-ael-identifier': { color: 'inherit', fontStyle: 'italic' },
})

export function extensionResaltadoAel(): Extension[] {
  return [tema, campoResaltado]
}
