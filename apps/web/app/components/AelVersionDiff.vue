<script setup lang="ts">
// AEL-004 Fase 3 (E4) — comparación visual de dos versiones de una fórmula.
// Solo lectura: unifiedMergeView (@codemirror/merge) muestra `modelo`
// contra `original`, con el mismo resaltado de sintaxis que AelEditor
// (extensionResaltadoAel, ael-codemirror.ts) para no divergir del editor
// real. Sin botones accept/reject — esto no es un merge editable.
import { basicSetup, EditorView } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { unifiedMergeView } from '@codemirror/merge'
import { extensionResaltadoAel } from '~/utils/ael-codemirror'

const props = defineProps<{
  original: string
  modificado: string
}>()

const contenedor = ref<HTMLDivElement | null>(null)
let vista: EditorView | null = null

function crearVista(): void {
  if (!contenedor.value) return
  vista?.destroy()
  vista = new EditorView({
    state: EditorState.create({
      doc: props.modificado,
      extensions: [
        basicSetup,
        ...extensionResaltadoAel(),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        unifiedMergeView({ original: props.original, mergeControls: false }),
      ],
    }),
    parent: contenedor.value,
  })
}

onMounted(crearVista)
onBeforeUnmount(() => {
  vista?.destroy()
  vista = null
})

watch([() => props.original, () => props.modificado], crearVista)
</script>

<template>
  <div
    ref="contenedor"
    class="rounded-md border border-gray-300 dark:border-gray-700 overflow-hidden"
  />
</template>
