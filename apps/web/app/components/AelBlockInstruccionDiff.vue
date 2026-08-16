<script setup lang="ts">
// AEL-004 Fase 7 (E6+) — diff visual bloque-a-bloque, solo lectura.
// Recibe una lista YA anotada por diferenciarParDeListas() (ael-bloques.ts,
// comparación posicional recursiva) — este componente solo pinta el
// estado, no calcula el diff. Reutiliza AelBlockExpresion en modo readonly
// para no duplicar el render de expresiones.
import type { CatalogoBloques, InstruccionConDiff } from '~/utils/ael-bloques'

defineProps<{ instrucciones: readonly InstruccionConDiff[]; catalogo?: CatalogoBloques }>()

const CLASE_POR_ESTADO: Record<InstruccionConDiff['estado'], string> = {
  igual: '',
  cambiado: '-mx-1 rounded bg-amber-100 px-1 dark:bg-amber-900/30',
  nuevo: '-mx-1 rounded bg-green-100 px-1 dark:bg-green-900/30',
  eliminado: '-mx-1 rounded bg-red-100 px-1 opacity-70 line-through dark:bg-red-900/30',
}
</script>

<template>
  <div class="space-y-1.5">
    <div
      v-for="{ instruccion: inst, estado, entonces, sino } in instrucciones"
      :key="inst.id"
      :class="CLASE_POR_ESTADO[estado]"
    >
      <div v-if="inst.tipo === 'Declaracion'" class="flex flex-wrap items-center gap-1.5 text-xs">
        <span class="font-mono font-medium text-gray-500">DEFINIR</span>
        <span class="font-mono font-medium">{{ inst.nombre }}</span>
        <span class="text-gray-400">=</span>
        <AelBlockExpresion :bloque="inst.expresion" readonly :catalogo="catalogo" />
      </div>

      <div v-else-if="inst.tipo === 'Retorno'" class="flex flex-wrap items-center gap-1.5 text-xs">
        <span class="font-mono font-medium text-gray-500">RETORNAR</span>
        <AelBlockExpresion :bloque="inst.expresion" readonly :catalogo="catalogo" />
      </div>

      <div
        v-else
        class="rounded-md border border-dashed border-purple-400 bg-purple-50/50 p-2 dark:border-purple-600 dark:bg-purple-900/10"
      >
        <div class="flex flex-wrap items-center gap-1.5 text-xs">
          <span class="font-mono font-medium text-purple-700 dark:text-purple-300">SI</span>
          <AelBlockExpresion :bloque="inst.condicion" readonly :catalogo="catalogo" />
          <span class="font-mono font-medium text-purple-700 dark:text-purple-300">ENTONCES</span>
        </div>
        <div class="mt-1.5 border-l-2 border-purple-200 pl-3 dark:border-purple-800">
          <AelBlockInstruccionDiff :instrucciones="entonces ?? []" :catalogo="catalogo" />
        </div>
        <template v-if="sino">
          <p class="mt-1.5 font-mono text-xs font-medium text-purple-700 dark:text-purple-300">SINO</p>
          <div class="mt-1.5 border-l-2 border-purple-200 pl-3 dark:border-purple-800">
            <AelBlockInstruccionDiff :instrucciones="sino" :catalogo="catalogo" />
          </div>
        </template>
        <p class="mt-1.5 font-mono text-xs font-medium text-purple-700 dark:text-purple-300">FIN</p>
      </div>
    </div>
    <p v-if="instrucciones.length === 0" class="text-xs italic text-gray-400">Sin instrucciones.</p>
  </div>
</template>
