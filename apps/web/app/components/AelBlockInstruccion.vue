<script setup lang="ts">
// AEL-004 Fase 7 (E6) — render + edición estructural de una lista de
// BloqueInstruccion (el cuerpo de una REGLA o de una rama SI/SINO).
// Condicional se recursa sobre sí misma vía AelBlockInstruccion para sus
// ramas — mismo patrón que evaluarInstrucciones()/parsearInstrucciones()
// en el motor/parser reales: una lista de instrucciones es solo eso, una
// lista, sin importar el nivel de anidamiento.
//
// Reordenar admite dos rutas equivalentes a propósito (decisión del
// usuario, "no podrían coexistir las 2"): los botones ↑/↓ son la vía
// confiable/accesible; el drag-and-drop (mismo mover()) es azúcar encima
// — arrastrar en árboles anidados es frágil, así que nunca es la única
// forma de lograr algo. El drag solo reordena DENTRO de la misma lista
// (mismo array de props.instrucciones); mover una instrucción entre
// ramas (p. ej. de ENTONCES a SINO) queda fuera de alcance.
import type { BloqueExpresion, BloqueInstruccion } from '~/utils/ael-bloques'
import {
  bloqueCondicionalVacio,
  bloqueDeclaracionVacia,
  bloqueRetornoVacio,
} from '~/utils/ael-bloques'

const props = defineProps<{ instrucciones: readonly BloqueInstruccion[]; readonly?: boolean }>()
const emit = defineEmits<{ 'update:instrucciones': [readonly BloqueInstruccion[]] }>()

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

const indiceArrastrado = ref<number | null>(null)

function iniciarArrastre(indice: number): void {
  indiceArrastrado.value = indice
}

function soltarEn(indice: number): void {
  if (indiceArrastrado.value !== null) moverInstruccion(indiceArrastrado.value, indice)
  indiceArrastrado.value = null
}
</script>

<template>
  <div class="space-y-1.5">
    <div
      v-for="(inst, indice) in instrucciones"
      :key="inst.id"
      :draggable="!readonly"
      class="flex items-start gap-1"
      @dragstart="iniciarArrastre(indice)"
      @dragover.prevent
      @drop.prevent="soltarEn(indice)"
    >
      <span
        v-if="!readonly"
        class="mt-0.5 cursor-grab select-none text-xs text-gray-400"
        title="Arrastra para reordenar"
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
            @update:bloque="(nuevo) => actualizarExpresionDeclaracion(indice, nuevo)"
          />
        </div>

        <div v-else-if="inst.tipo === 'Retorno'" class="flex flex-wrap items-center gap-1.5 text-xs">
          <span class="font-mono font-medium text-gray-500">RETORNAR</span>
          <AelBlockExpresion
            :bloque="inst.expresion"
            :readonly="readonly"
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
              @update:bloque="(nuevo) => actualizarCondicionCondicional(indice, nuevo)"
            />
            <span class="font-mono font-medium text-purple-700 dark:text-purple-300">ENTONCES</span>
          </div>
          <div class="mt-1.5 border-l-2 border-purple-200 pl-3 dark:border-purple-800">
            <AelBlockInstruccion
              :instrucciones="inst.entonces"
              :readonly="readonly"
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
          title="Mover arriba"
          @click="moverInstruccion(indice, indice - 1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
          :disabled="indice === instrucciones.length - 1"
          title="Mover abajo"
          @click="moverInstruccion(indice, indice + 1)"
        >
          ↓
        </button>
        <button
          type="button"
          class="text-xs text-gray-400 hover:text-red-500"
          title="Eliminar"
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
