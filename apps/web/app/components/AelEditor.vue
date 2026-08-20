<script setup lang="ts">
// AEL-004 Fase 2 (PLAN_AEL004_RULE_WORKSPACE.md) — editor de fórmulas AEL.
// Primer componente Vue reutilizable del proyecto: un editor de código es
// justo el tipo de pieza no trivial que amerita extraerse, a diferencia
// del resto de páginas F6, que siguen siendo autocontenidas a propósito.
//
// El resaltado de sintaxis reutiliza tokenizar() real de @aquila/ael-language
// (Decoration.mark por token.tipo) en vez de una gramática CodeMirror/Lezer
// paralela que pudiera divergir del lexer real.
import { basicSetup, EditorView } from 'codemirror'
import { Compartment, EditorState, type Extension, type Text } from '@codemirror/state'
import { hoverTooltip } from '@codemirror/view'
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { linter, forceLinting, type Diagnostic } from '@codemirror/lint'
import { tokenizar } from '@aquila/ael-language'
import type { Diagnostico } from '@aquila/ael-core'
import {
  FUNCIONES_CATALOGO,
  PALABRAS_RESERVADAS_DOC,
  PARAMETER_CATALOGO,
  UNIT_CATALOGO,
} from '~/utils/ael-catalogo'
import { clamp, extensionResaltadoAel, offsetDesdePosicion } from '~/utils/ael-codemirror'

const props = defineProps<{
  modelValue: string
  conceptosDisponibles?: readonly string[]
  diagnosticos?: readonly Diagnostico[]
  readonly?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [valor: string] }>()

const contenedor = ref<HTMLDivElement | null>(null)
let vista: EditorView | null = null
// AEL-004 Fase 4 — soloLectura se activa/desactiva sin recrear el editor
// (conceptos ya no editables fuera de borrador, guard_concepto_transicion).
const compartmentSoloLectura = new Compartment()

function extensionesSoloLectura(): Extension[] {
  return props.readonly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []
}

function codigosConceptos(): readonly string[] {
  return props.conceptosDisponibles ?? []
}

const CONTRATOS = ['PARAMETER', 'UNIT', 'CONCEPTO'] as const
type NombreContrato = (typeof CONTRATOS)[number]

function opcionesDeContrato(contrato: NombreContrato): Completion[] {
  if (contrato === 'PARAMETER') {
    return Object.entries(PARAMETER_CATALOGO).map(([campo, doc]) => ({
      label: campo,
      type: 'property',
      detail: doc.tipo,
      info: doc.descripcion,
    }))
  }
  if (contrato === 'UNIT') {
    return Object.entries(UNIT_CATALOGO).map(([campo, doc]) => ({
      label: campo,
      type: 'property',
      detail: doc.tipo,
      info: doc.descripcion,
    }))
  }
  return codigosConceptos().map((codigo) => ({
    label: codigo,
    type: 'property',
    detail: 'MONEY',
    info: 'Resultado ya evaluado de este concepto en el periodo.',
  }))
}

function fuenteAutocompletado(context: CompletionContext): CompletionResult | null {
  const campo = context.matchBefore(/(PARAMETER|UNIT|CONCEPTO)\.\w*/)
  if (campo) {
    const contrato = campo.text.split('.')[0] as NombreContrato
    return {
      from: campo.from + contrato.length + 1,
      options: opcionesDeContrato(contrato),
    }
  }

  const palabra = context.matchBefore(/[A-Za-z_]*/)
  if (!palabra || (palabra.from === palabra.to && !context.explicit)) return null

  const opciones: Completion[] = [
    ...Object.entries(PALABRAS_RESERVADAS_DOC).map(([kw, info]) => ({
      label: kw,
      type: 'keyword',
      info,
    })),
    ...Object.entries(FUNCIONES_CATALOGO).map(([nombre, doc]) => ({
      label: nombre,
      type: 'function',
      detail: doc.firma,
      info: doc.descripcion,
    })),
    {
      label: 'PARAMETER',
      type: 'namespace',
      info: 'Parámetros derivados del presupuesto/política vigente.',
    },
    {
      label: 'UNIT',
      type: 'namespace',
      info: 'Campos del inmueble — sin datos cableados en liquidar-periodo todavía (D-13).',
    },
    {
      label: 'CONCEPTO',
      type: 'namespace',
      info: 'Resultado de otro concepto ya evaluado en este periodo.',
    },
  ]
  return { from: palabra.from, options: opciones }
}

function crearHoverTooltip() {
  return hoverTooltip((view, pos) => {
    const doc = view.state.doc
    const { tokens } = tokenizar(doc.toString())
    const indice = tokens.findIndex((t) => {
      const from = offsetDesdePosicion(doc, t.span.inicio.linea, t.span.inicio.columna)
      const to = offsetDesdePosicion(doc, t.span.fin.linea, t.span.fin.columna)
      return pos >= from && pos <= to
    })
    if (indice === -1) return null
    const token = tokens[indice]!
    const from = offsetDesdePosicion(doc, token.span.inicio.linea, token.span.inicio.columna)
    const to = offsetDesdePosicion(doc, token.span.fin.linea, token.span.fin.columna)

    let texto: string | null = PALABRAS_RESERVADAS_DOC[token.tipo] ?? null

    if (!texto && token.tipo === 'IDENTIFICADOR') {
      const anterior = tokens[indice - 1]
      const anteAnterior = tokens[indice - 2]
      const siguiente = tokens[indice + 1]

      if (anterior?.tipo === 'PUNTO' && anteAnterior?.tipo === 'IDENTIFICADOR') {
        const contrato = anteAnterior.lexema
        if (contrato === 'CONCEPTO' && codigosConceptos().includes(token.lexema)) {
          texto = `MONEY — resultado ya evaluado del concepto ${token.lexema} en este periodo.`
        } else if (contrato === 'PARAMETER' && token.lexema in PARAMETER_CATALOGO) {
          const info = PARAMETER_CATALOGO[token.lexema]!
          texto = `${info.tipo} — ${info.descripcion}`
        } else if (contrato === 'UNIT' && token.lexema in UNIT_CATALOGO) {
          const info = UNIT_CATALOGO[token.lexema]!
          texto = `${info.tipo} — ${info.descripcion}`
        }
      } else if (
        siguiente?.tipo === 'PUNTO' &&
        (CONTRATOS as readonly string[]).includes(token.lexema)
      ) {
        if (token.lexema === 'PARAMETER')
          texto = 'Parámetros derivados del presupuesto/política vigente.'
        else if (token.lexema === 'UNIT')
          texto = 'Campos del inmueble — sin datos cableados en liquidar-periodo todavía (D-13).'
        else texto = 'Resultado de otro concepto ya evaluado en este periodo.'
      } else if (token.lexema in FUNCIONES_CATALOGO) {
        const f = FUNCIONES_CATALOGO[token.lexema]!
        texto = `${f.firma} — ${f.descripcion}`
      }
    }

    if (!texto) return null
    const mensaje = texto
    return {
      pos: from,
      end: to,
      above: true,
      create() {
        const dom = document.createElement('div')
        dom.textContent = mensaje
        dom.style.cssText =
          'max-width: 320px; padding: 6px 10px; font-size: 0.75rem; border-radius: 6px; ' +
          'background: #1f2937; color: #f9fafb; box-shadow: 0 2px 8px rgba(0,0,0,0.25);'
        return { dom }
      },
    }
  })
}

/** Traduce Diagnostico[] (ya calculado por el padre, vía validarFormulaAel)
 * a Diagnostic[] de CodeMirror — este componente no vuelve a parsear. */
function diagnosticosCodeMirror(doc: Text): Diagnostic[] {
  return (props.diagnosticos ?? []).map((d) => {
    const from = clamp(offsetDesdePosicion(doc, d.span.inicio.linea, d.span.inicio.columna), doc)
    const toRaw = clamp(offsetDesdePosicion(doc, d.span.fin.linea, d.span.fin.columna), doc)
    const to = Math.max(toRaw, Math.min(from + 1, doc.length))
    const severity =
      d.severidad === 'ERROR' ? 'error' : d.severidad === 'WARNING' ? 'warning' : 'info'
    return { from, to, severity, message: `${d.codigo}: ${d.mensaje}` }
  })
}

const extensionLinter = linter((view) => diagnosticosCodeMirror(view.state.doc))

function extensiones(): Extension[] {
  return [
    basicSetup,
    ...extensionResaltadoAel(),
    autocompletion({ override: [fuenteAutocompletado] }),
    crearHoverTooltip(),
    extensionLinter,
    compartmentSoloLectura.of(extensionesSoloLectura()),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
    }),
  ]
}

onMounted(() => {
  if (!contenedor.value) return
  vista = new EditorView({
    state: EditorState.create({ doc: props.modelValue, extensions: extensiones() }),
    parent: contenedor.value,
  })
})

onBeforeUnmount(() => {
  vista?.destroy()
  vista = null
})

watch(
  () => props.modelValue,
  (valor) => {
    if (!vista) return
    const actual = vista.state.doc.toString()
    if (actual === valor) return
    vista.dispatch({ changes: { from: 0, to: actual.length, insert: valor } })
  },
)

watch(
  () => props.readonly,
  () => {
    if (!vista) return
    vista.dispatch({ effects: compartmentSoloLectura.reconfigure(extensionesSoloLectura()) })
  },
)

// El linter recibe diagnosticos como prop y no vuelve a parsear (ver
// diagnosticosCodeMirror) — cuando el padre recalcula esos diagnósticos
// (mismo texto, nuevo resultado de validarFormulaAel) hay que forzar un
// nuevo ciclo de lint explícitamente, porque CM6 solo relinta solo, por
// defecto, cuando el documento cambia.
watch(
  () => props.diagnosticos,
  () => {
    if (vista) forceLinting(vista)
  },
)

/** Mueve la selección/cursor del editor a una posición línea:columna
 * 1-indexada — usado por el panel de diagnósticos para click-to-location
 * (Doc 10 §17 DIAGNOSTIC NAVIGATION). */
function irAPosicion(linea: number, columna: number): void {
  if (!vista) return
  const offset = clamp(offsetDesdePosicion(vista.state.doc, linea, columna), vista.state.doc)
  vista.dispatch({ selection: { anchor: offset }, scrollIntoView: true })
  vista.focus()
}

/** Inserta texto en la posición del cursor (reemplaza la selección si hay
 * una) — usado por el panel "Variables disponibles" al hacer clic en un
 * campo/función. */
function insertarTexto(texto: string): void {
  if (!vista) return
  const { from, to } = vista.state.selection.main
  vista.dispatch({
    changes: { from, to, insert: texto },
    selection: { anchor: from + texto.length },
    scrollIntoView: true,
  })
  vista.focus()
}

defineExpose({ irAPosicion, insertarTexto })
</script>

<template>
  <div
    ref="contenedor"
    class="rounded-md border border-gray-300 dark:border-gray-700 overflow-hidden"
  />
</template>
