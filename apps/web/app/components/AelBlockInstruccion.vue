<script setup lang="ts">
// AEL-004 Fase 7 (E6) — render + edición estructural de una lista de
// BloqueInstruccion (el cuerpo de una REGLA o de una rama SI/SINO).
// Condicional se recursa sobre sí misma vía AelBlockInstruccion para sus
// ramas — mismo patrón que evaluarInstrucciones()/parsearInstrucciones()
// en el motor/parser reales: una lista de instrucciones es solo eso, una
// lista, sin importar el nivel de anidamiento.
//
// Reordenar admite dos rutas equivalentes a propósito (decisión del
// usuario, "no podrían coexistir las 2"): los botones ↑/↓ (+ Alt+↑/Alt+↓)
// son la vía confiable/accesible y solo operan dentro de esta lista; el
// drag-and-drop es azúcar encima y SÍ cruza ramas (ENTONCES↔SINO↔cuerpo) —
// usa el id real del bloque vía dataTransfer, no un índice local, y lo
// resuelve `aelMoverInstruccionGlobal` (provisto por AelBlockCanvas, el
// único componente con visión del árbol completo para poder quitar de una
// rama e insertar en otra en el mismo update).
import type { BloqueExpresion, BloqueInstruccion, CatalogoBloques, RutaLista } from '~/utils/ael-bloques'
import {
  bloqueCondicionalVacio,
  bloqueDeclaracionVacia,
  bloqueRetornoVacio,
} from '~/utils/ael-bloques'

const props = defineProps<{
  instrucciones: readonly BloqueInstruccion[]
  readonly?: boolean
  catalogo?: CatalogoBloques
  /** Camino desde la REGLA raíz hasta ESTA lista — [] para el cuerpo de la regla. */
  ruta?: RutaLista
}>()
const emit = defineEmits<{ 'update:instrucciones': [readonly BloqueInstruccion[]] }>()

const rutaPropia = computed<RutaLista>(() => props.ruta ?? [])
const moverGlobal = inject<(bloqueId: string, rutaDestino: RutaLista, indiceDestino: number) => void>(
  'aelMoverInstruccionGlobal',
  () => {},
)

const RE_IDENTIFICADOR = /^[a-zA-Z][a-zA-Z0-9_]*$/

function reemplazarEnIndice(indice: number, nueva: BloqueInstruccion): void {
  emit(
    'update:instrucciones',
    props.instrucciones.map((inst, i) => (i === indice ? nueva : inst)),
  )
}

function actualizarNombreDeclaracion(indice: number, texto: string): void {
  const inst = props.instrucciones[indice]
  if (inst?.tipo !== 'Declaracion' || !RE_IDENTIFICADOR.test(texto)) return
  reemplazarEnIndice(indice, { ...inst, nombre: texto })
}

function actualizarExpresionDeclaracion(indice: number, nueva: BloqueExpresion): void {
  const inst = props.instrucciones[indice]
  if (inst?.tipo !== 'Declaracion') return
  reemplazarEnIndice(indice, { ...inst, expresion: nueva })
}

function actualizarExpresionRetorno(indice: number, nueva: BloqueExpresion): void {
  const inst = props.instrucciones[indice]
  if (inst?.tipo !== 'Retorno') return
  reemplazarEnIndice(indice, { ...inst, expresion: nueva })
}

function actualizarCondicionCondicional(indice: number, nueva: BloqueExpresion): void {
  const inst = props.instrucciones[indice]
  if (inst?.tipo !== 'Condicional') return
  reemplazarEnIndice(indice, { ...inst, condicion: nueva })
}

function actualizarEntoncesCondicional(indice: number, nuevas: readonly BloqueInstruccion[]): void {
  const inst = props.instrucciones[indice]
  if (inst?.tipo !== 'Condicional') return
  reemplazarEnIndice(indice, { ...inst, entonces: nuevas })
}

function actualizarSinoCondicional(indice: number, nuevas: readonly BloqueInstruccion[]): void {
  const inst = props.instrucciones[indice]
  if (inst?.tipo !== 'Condicional' || inst.sino === null) return
  reemplazarEnIndice(indice, { ...inst, sino: nuevas })
}

function agregarSino(indice: number): void {
  const inst = props.instrucciones[indice]
  if (inst?.tipo !== 'Condicional' || inst.sino !== null) return
  reemplazarEnIndice(indice, { ...inst, sino: [] })
}

function quitarSino(indice: number): void {
  const inst = props.instrucciones[indice]
  if (inst?.tipo !== 'Condicional' || inst.sino === null) return
  reemplazarEnIndice(indice, { ...inst, sino: null })
}

// ── estructura de la lista: agregar / eliminar / reordenar ─────────────
function agregarInstruccion(nueva: BloqueInstruccion): void {
  emit('update:instrucciones', [...props.instrucciones, nueva])
}

function eliminarInstruccion(indice: number): void {
  emit(
    'update:instrucciones',
    props.instrucciones.filter((_, i) => i !== indice),
  )
}

function moverInstruccion(origen: number, destino: number): void {
  if (origen === destino || destino < 0 || destino >= props.instrucciones.length) return
  const nuevas = [...props.instrucciones]
  const movida = nuevas.splice(origen, 1)[0]
  if (movida === undefined) return
  nuevas.splice(destino, 0, movida)
  emit('update:instrucciones', nuevas)
}

// dragstart/drop burbujean por el DOM igual que cualquier evento — una fila
// anidada (p.ej. RETORNAR dentro de SINO) vive dentro del subárbol DOM de su
// fila contenedora (el SI), que también es :draggable con su propio
// @dragstart/@drop. Sin stopPropagation() la fila ancestro reescribe el
// dataTransfer (o dispara un segundo soltarEn) antes de que el drop real
// se procese, moviendo el nodo equivocado.
function iniciarArrastre(id: string, evento: DragEvent): void {
  evento.stopPropagation()
  evento.dataTransfer?.setData('text/plain', id)
}

function soltarEn(indiceDestino: number, evento: DragEvent): void {
  evento.stopPropagation()
  const bloqueId = evento.dataTransfer?.getData('text/plain')
  if (bloqueId) moverGlobal(bloqueId, rutaPropia.value, indiceDestino)
}

// Atajos de teclado — solo cuando la FILA misma tiene el foco (no un input
// hijo, evita robarle Delete/Backspace a la edición de texto normal).
function manejarTeclado(evento: KeyboardEvent, indice: number): void {
  if (evento.target !== evento.currentTarget) return
  if (evento.key === 'Delete' || evento.key === 'Backspace') {
    evento.preventDefault()
    eliminarInstruccion(indice)
  } else if (evento.altKey && evento.key === 'ArrowUp') {
    evento.preventDefault()
    moverInstruccion(indice, indice - 1)
  } else if (evento.altKey && evento.key === 'ArrowDown') {
    evento.preventDefault()
    moverInstruccion(indice, indice + 1)
  }
}
</script>

<template>
  <div class="space-y-1.5">
    <div
      v-for="(inst, indice) in instrucciones"
      :key="inst.id"
      :draggable="!readonly"
      :tabindex="readonly ? undefined : 0"
      class="flex items-start gap-1 rounded focus:outline focus:outline-2 focus:outline-primary/50"
      @dragstart="iniciarArrastre(inst.id, $event)"
      @dragover.prevent
      @drop.prevent="soltarEn(indice, $event)"
      @keydown="manejarTeclado($event, indice)"
    >
      <span
        v-if="!readonly"
        class="mt-0.5 cursor-grab select-none text-xs text-gray-400"
        title="Arrastra para reordenar (cruza ENTONCES/SINO/cuerpo)"
      >
        ⠿
      </span>

      <div class="min-w-0 flex-1">
        <div v-if="inst.tipo === 'Declaracion'" class="flex flex-wrap items-center gap-1.5 text-xs">
          <span class="font-mono font-medium text-gray-500">DEFINIR</span>
          <input
            :value="inst.nombre"
            :disabled="readonly"
            class="w-24 bg-transparent font-mono font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60"
            @change="
              actualizarNombreDeclaracion(indice, ($event.target as HTMLInputElement).value)
            "
          >
          <span class="text-gray-400">=</span>
          <AelBlockExpresion
            :bloque="inst.expresion"
            :readonly="readonly"
            :catalogo="catalogo"
            @update:bloque="(nuevo) => actualizarExpresionDeclaracion(indice, nuevo)"
          />
        </div>

        <div v-else-if="inst.tipo === 'Retorno'" class="flex flex-wrap items-center gap-1.5 text-xs">
          <span class="font-mono font-medium text-gray-500">RETORNAR</span>
          <AelBlockExpresion
            :bloque="inst.expresion"
            :readonly="readonly"
            :catalogo="catalogo"
            @update:bloque="(nuevo) => actualizarExpresionRetorno(indice, nuevo)"
          />
        </div>

        <div
          v-else
          class="rounded-md border border-dashed border-purple-400 bg-purple-50/50 p-2 dark:border-purple-600 dark:bg-purple-900/10"
        >
          <div class="flex flex-wrap items-center gap-1.5 text-xs">
            <span class="font-mono font-medium text-purple-700 dark:text-purple-300">SI</span>
            <AelBlockExpresion
              :bloque="inst.condicion"
              :readonly="readonly"
              :catalogo="catalogo"
              @update:bloque="(nuevo) => actualizarCondicionCondicional(indice, nuevo)"
            />
            <span class="font-mono font-medium text-purple-700 dark:text-purple-300">ENTONCES</span>
          </div>
          <div class="mt-1.5 border-l-2 border-purple-200 pl-3 dark:border-purple-800">
            <AelBlockInstruccion
              :instrucciones="inst.entonces"
              :readonly="readonly"
              :catalogo="catalogo"
              :ruta="[...rutaPropia, { indice, rama: 'entonces' }]"
              @update:instrucciones="(nuevas) => actualizarEntoncesCondicional(indice, nuevas)"
            />
          </div>
          <template v-if="inst.sino !== null">
            <div class="mt-1.5 flex items-center gap-2">
              <p class="font-mono text-xs font-medium text-purple-700 dark:text-purple-300">SINO</p>
              <button
                v-if="!readonly"
                type="button"
                class="text-xs text-gray-400 hover:text-red-500"
                @click="quitarSino(indice)"
              >
                quitar sino
              </button>
            </div>
            <div class="mt-1.5 border-l-2 border-purple-200 pl-3 dark:border-purple-800">
              <AelBlockInstruccion
                :instrucciones="inst.sino"
                :readonly="readonly"
                :catalogo="catalogo"
                :ruta="[...rutaPropia, { indice, rama: 'sino' }]"
                @update:instrucciones="(nuevas) => actualizarSinoCondicional(indice, nuevas)"
              />
            </div>
          </template>
          <div class="mt-1.5 flex items-center gap-2">
            <p class="font-mono text-xs font-medium text-purple-700 dark:text-purple-300">FIN</p>
            <button
              v-if="!readonly && inst.sino === null"
              type="button"
              class="text-xs text-gray-400 hover:text-purple-600"
              @click="agregarSino(indice)"
            >
              + sino
            </button>
          </div>
        </div>
      </div>

      <div v-if="!readonly" class="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          class="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
          :disabled="indice === 0"
          title="Mover arriba (Alt+↑)"
          @click="moverInstruccion(indice, indice - 1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
          :disabled="indice === instrucciones.length - 1"
          title="Mover abajo (Alt+↓)"
          @click="moverInstruccion(indice, indice + 1)"
        >
          ↓
        </button>
        <button
          type="button"
          class="text-xs text-gray-400 hover:text-red-500"
          title="Eliminar (Supr)"
          @click="eliminarInstruccion(indice)"
        >
          ✕
        </button>
      </div>
    </div>

    <div v-if="!readonly" class="flex items-center gap-2 pt-0.5">
      <button
        type="button"
        class="text-xs text-gray-400 hover:text-primary"
        @click="agregarInstruccion(bloqueDeclaracionVacia())"
      >
        + Definir
      </button>
      <button
        type="button"
        class="text-xs text-gray-400 hover:text-primary"
        @click="agregarInstruccion(bloqueRetornoVacio())"
      >
        + Retornar
      </button>
      <button
        type="button"
        class="text-xs text-gray-400 hover:text-primary"
        @click="agregarInstruccion(bloqueCondicionalVacio())"
      >
        + Si
      </button>
    </div>
  </div>
</template>
