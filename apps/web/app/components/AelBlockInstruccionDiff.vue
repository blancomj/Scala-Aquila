<script setup lang="ts">
// Diff visual bloque a bloque, solo lectura. Recibe una lista YA anotada por
// diferenciarParDeListas() (ael-bloques.ts, comparación posicional recursiva):
// este componente solo pinta el estado, no calcula el diff. Reutiliza
// AelBlockExpresion en modo readonly para no duplicar el render de
// expresiones — y por eso hereda gratis el agrupamiento visible del
// movimiento 01, que es lo que cierra el hallazgo X1: hasta entonces esta
// pantalla marcaba una instrucción como «cambiada» sobre dos líneas
// indistinguibles, y es la pantalla donde se aprueba o se rechaza.
//
// Las etiquetas siguen las mismas del editor (movimiento 03): quien compara
// dos versiones lee el mismo vocabulario que quien las escribió.
import type { CatalogoBloques, InstruccionConDiff } from '~/utils/ael-bloques'
import {
  ETIQUETA_CONDICIONAL,
  ETIQUETA_DECLARACION,
  ETIQUETA_DECLARACION_NEXO,
  ETIQUETA_ENTONCES,
  ETIQUETA_RETORNO,
  ETIQUETA_SINO,
} from '~/utils/ael-etiquetas'

defineProps<{ instrucciones: readonly InstruccionConDiff[]; catalogo?: CatalogoBloques }>()

const CLASE_POR_ESTADO: Record<InstruccionConDiff['estado'], string> = {
  igual: '',
  cambiado: '-mx-1 rounded bg-amber-100 px-1 dark:bg-amber-900/30',
  nuevo: '-mx-1 rounded bg-emerald-100 px-1 dark:bg-emerald-900/30',
  eliminado: '-mx-1 rounded bg-red-100 px-1 line-through opacity-70 dark:bg-red-900/30',
}

const CLASE_ETIQUETA = 'text-xs font-medium tracking-wide text-neutral-500 dark:text-neutral-400'
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="{ instruccion: inst, estado, entonces, sino } in instrucciones"
      :key="inst.id"
      :class="CLASE_POR_ESTADO[estado]"
    >
      <div v-if="inst.tipo === 'Declaracion'" class="flex flex-wrap items-center gap-2">
        <span :class="CLASE_ETIQUETA">{{ ETIQUETA_DECLARACION.texto }}</span>
        <span class="font-mono text-sm font-medium">{{ inst.nombre }}</span>
        <span :class="CLASE_ETIQUETA">{{ ETIQUETA_DECLARACION_NEXO }}</span>
        <AelBlockExpresion :bloque="inst.expresion" readonly :catalogo="catalogo" />
      </div>

      <div v-else-if="inst.tipo === 'Retorno'" class="flex flex-wrap items-center gap-2">
        <span :class="CLASE_ETIQUETA">{{ ETIQUETA_RETORNO.texto }}</span>
        <AelBlockExpresion :bloque="inst.expresion" readonly :catalogo="catalogo" />
      </div>

      <div
        v-else
        class="rounded-md border border-neutral-300 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/50"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            {{ ETIQUETA_CONDICIONAL.texto }}
          </span>
          <AelBlockExpresion :bloque="inst.condicion" readonly :catalogo="catalogo" />
        </div>

        <p :class="CLASE_ETIQUETA" class="mt-3">{{ ETIQUETA_ENTONCES.texto }}</p>
        <div class="mt-1.5 border-l-2 border-neutral-300 pl-3 dark:border-neutral-700">
          <AelBlockInstruccionDiff :instrucciones="entonces ?? []" :catalogo="catalogo" />
        </div>

        <template v-if="sino">
          <p :class="CLASE_ETIQUETA" class="mt-3">{{ ETIQUETA_SINO.texto }}</p>
          <div class="mt-1.5 border-l-2 border-neutral-300 pl-3 dark:border-neutral-700">
            <AelBlockInstruccionDiff :instrucciones="sino" :catalogo="catalogo" />
          </div>
        </template>
      </div>
    </div>

    <p v-if="instrucciones.length === 0" class="text-sm text-neutral-500 dark:text-neutral-400">
      Sin instrucciones.
    </p>
  </div>
</template>
