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

function claseParaToken(tipo: TipoToken): string | null {
  if (PALABRA_RESERVADA.has(tipo)) return 'cm-ael-keyword'
  if (tipo === 'NUMERO') return 'cm-ael-number'
  if (tipo === 'IDENTIFICADOR') return 'cm-ael-identifier'
  if (OPERADOR.has(tipo)) return 'cm-ael-operator'
  if (PUNTUACION.has(tipo)) return 'cm-ael-punctuation'
  return null
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
    .map((token: Token) => {
      const clase = claseParaToken(token.tipo)
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
  '.cm-ael-keyword': { color: 'var(--ael-keyword, #a855f7)', fontWeight: '600' },
  '.cm-ael-number': { color: 'var(--ael-number, #0ea5e9)' },
  '.cm-ael-identifier': { color: 'var(--ael-identifier, inherit)' },
  '.cm-ael-operator': { color: 'var(--ael-operator, #f59e0b)' },
  '.cm-ael-punctuation': { color: 'var(--ael-punctuation, #6b7280)' },
})

export function extensionResaltadoAel(): Extension[] {
  return [tema, campoResaltado]
}
