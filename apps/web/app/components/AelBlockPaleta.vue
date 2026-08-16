<script setup lang="ts">
// AEL-004 Fase 7 (E7) — paleta de variables/funciones arrastrable. Convive
// con los selects de AelBlockExpresion (decisión del usuario, mismo patrón
// que el reordenamiento de instrucciones: botón/select accesible + drag
// como azúcar encima, "no podrían coexistir las 2"): soltar un ítem sobre
// un nodo de expresión lo reemplaza por completo con el valor real del
// catálogo, en vez del valor en blanco que produce el selector "cambiar
// tipo". El payload viaja en un MIME type propio (MIME_PALETA_AEL) para no
// chocar con el 'text/plain' que usa AelBlockInstruccion para IDs.
import type { CatalogoBloques, PayloadPaleta } from '~/utils/ael-bloques'
import { MIME_PALETA_AEL } from '~/utils/ael-bloques'

const props = defineProps<{ catalogo: CatalogoBloques }>()

const CLASE_CHIP_CAMPO: Record<string, string> = {
  PARAMETER:
    'border-green-300 bg-green-100 text-green-800 dark:border-green-700 dark:bg-green-900/40 dark:text-green-200',
  UNIT: 'border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  CONCEPTO:
    'border-purple-300 bg-purple-100 text-purple-800 dark:border-purple-700 dark:bg-purple-900/40 dark:text-purple-200',
}
const CLASE_CHIP_FUNCION =
  'border-dashed border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-600 dark:bg-orange-900/20 dark:text-orange-300'

const secciones = computed(() => [
  { contrato: 'PARAMETER', campos: props.catalogo.parameter },
  { contrato: 'UNIT', campos: props.catalogo.unit },
  { contrato: 'CONCEPTO', campos: props.catalogo.concepto },
])

const catalogoVacio = computed(
  () => secciones.value.every((s) => s.campos.length === 0) && props.catalogo.funciones.length === 0,
)

function iniciarArrastreCampo(evento: DragEvent, contrato: string, campo: string): void {
  const payload: PayloadPaleta = { kind: 'campo', contrato, campo }
  evento.dataTransfer?.setData(MIME_PALETA_AEL, JSON.stringify(payload))
  evento.dataTransfer?.setData('text/plain', `${contrato}.${campo}`)
}

function iniciarArrastreFuncion(evento: DragEvent, nombre: string): void {
  const payload: PayloadPaleta = { kind: 'funcion', nombre }
  evento.dataTransfer?.setData(MIME_PALETA_AEL, JSON.stringify(payload))
  evento.dataTransfer?.setData('text/plain', `${nombre}()`)
}
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-2 dark:border-gray-700 dark:bg-gray-900/20"
  >
    <div
      v-for="seccion in secciones"
      v-show="seccion.campos.length > 0"
      :key="seccion.contrato"
      class="flex flex-wrap items-center gap-1"
    >
      <span class="text-[9px] font-medium uppercase text-gray-400">{{ seccion.contrato }}</span>
      <span
        v-for="campo in seccion.campos"
        :key="`${seccion.contrato}.${campo}`"
        draggable="true"
        class="cursor-grab rounded-full border px-2 py-0.5 text-xs font-mono"
        :class="CLASE_CHIP_CAMPO[seccion.contrato]"
        :title="`Arrastrar ${seccion.contrato}.${campo} al canvas`"
        @dragstart="iniciarArrastreCampo($event, seccion.contrato, campo)"
      >
        {{ campo }}
      </span>
    </div>

    <div v-if="catalogo.funciones.length > 0" class="flex flex-wrap items-center gap-1">
      <span class="text-[9px] font-medium uppercase text-gray-400">Funciones</span>
      <span
        v-for="nombre in catalogo.funciones"
        :key="nombre"
        draggable="true"
        class="cursor-grab rounded-full border px-2 py-0.5 text-xs font-mono"
        :class="CLASE_CHIP_FUNCION"
        :title="`Arrastrar ${nombre}() al canvas`"
        @dragstart="iniciarArrastreFuncion($event, nombre)"
      >
        {{ nombre }}()
      </span>
    </div>

    <p v-if="catalogoVacio" class="text-xs italic text-gray-400">Catálogo vacío.</p>
  </div>
</template>
