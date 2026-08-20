<script setup lang="ts">
// AEL-004 Fase 7 (E4) — canvas editable del constructor visual.
// El AST v0 es pequeño y cerrado por diseño (sin listas/Y-O-NO/MIENTRAS,
// AD-21): todo lo que parsear() acepta es representable en bloques sin
// excepción — la única degradación posible es binaria (el texto no
// parsea), y esa guarda vive en el padre (ConceptosEditor.vue, botón de
// modo deshabilitado). Este componente solo defiende el caso null por si
// se reutiliza en otro lugar sin esa guarda. Reestructurar el cuerpo
// (agregar/quitar/reordenar instrucciones) sigue sin edición — eso llega
// con la paleta arrastrable de E6.
import type { BloqueInstruccion, BloqueRegla, CatalogoBloques, RutaLista } from '~/utils/ael-bloques'
import { encontrarRutaDeInstruccion, moverInstruccionEntreListas } from '~/utils/ael-bloques'

const props = defineProps<{
  bloque: BloqueRegla | null
  readonly?: boolean
  catalogo?: CatalogoBloques
}>()
const emit = defineEmits<{ 'update:bloque': [BloqueRegla] }>()

const RE_IDENTIFICADOR = /^[a-zA-Z][a-zA-Z0-9_]*$/

function actualizarNombreRegla(texto: string): void {
  if (props.bloque === null || !RE_IDENTIFICADOR.test(texto)) return
  emit('update:bloque', { ...props.bloque, nombre: texto })
}

function actualizarCuerpo(nuevoCuerpo: readonly BloqueInstruccion[]): void {
  if (props.bloque === null) return
  emit('update:bloque', { ...props.bloque, cuerpo: nuevoCuerpo })
}

// Único punto con visión del árbol completo — mover una instrucción entre
// ramas distintas (drag cruzando ENTONCES/SINO/cuerpo, AelBlockInstruccion)
// exige quitarla de una lista e insertarla en otra en el mismo update, algo
// que ningún AelBlockInstruccion individual puede hacer por sí solo (cada
// uno solo ve/muta su propia lista).
function moverInstruccionGlobal(bloqueId: string, rutaDestino: RutaLista, indiceDestino: number): void {
  if (props.bloque === null) return
  const encontrada = encontrarRutaDeInstruccion(props.bloque.cuerpo, bloqueId)
  if (!encontrada) return
  const nuevo = moverInstruccionEntreListas(
    props.bloque,
    encontrada.ruta,
    encontrada.indice,
    rutaDestino,
    indiceDestino,
  )
  emit('update:bloque', nuevo)
}
provide('aelMoverInstruccionGlobal', moverInstruccionGlobal)
</script>

<template>
  <div
    class="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-900/20"
  >
    <template v-if="bloque">
      <p class="mb-2 flex items-center gap-1 font-mono text-xs font-medium text-gray-500">
        REGLA
        <input
          :value="bloque.nombre"
          :disabled="readonly"
          class="w-32 bg-transparent font-mono outline-none disabled:cursor-not-allowed disabled:opacity-60"
          @change="actualizarNombreRegla(($event.target as HTMLInputElement).value)"
        >
      </p>
      <AelBlockInstruccion
        v-if="bloque.cuerpo.length > 0"
        :instrucciones="bloque.cuerpo"
        :readonly="readonly"
        :catalogo="catalogo"
        @update:instrucciones="actualizarCuerpo"
      />
      <p v-else class="text-xs text-gray-400 italic">Esta fórmula todavía no tiene instrucciones.</p>
    </template>
    <p v-else class="text-xs text-gray-400 italic">
      El texto actual tiene errores de sintaxis — corrígelo en modo texto para ver el constructor
      visual.
    </p>
  </div>
</template>
