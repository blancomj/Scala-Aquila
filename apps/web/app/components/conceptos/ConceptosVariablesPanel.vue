<script setup lang="ts">
// Panel "Variables disponibles" del editor de conceptos — catálogo real de
// PARAMETER/UNIT/CONCEPTO/funciones (ael-catalogo.ts), buscable y agrupado
// por contrato. Deliberadamente NO usa las categorías temáticas ("Consumos",
// "Período") de un mockup de referencia: esas variables no existen en el
// dominio real (UNIT solo tiene AREA_PRIVADA/AREA_COMUN/COEFICIENTE, ver
// snapshot-supabase.ts) — mostrar categorías vacías o campos ficticios
// engañaría al usuario sobre qué puede usar de verdad en una fórmula.
import { FUNCIONES_CATALOGO, PARAMETER_CATALOGO, UNIT_CATALOGO } from '~/utils/ael-catalogo'
import { MIME_PALETA_AEL, type PayloadPaleta } from '~/utils/ael-bloques'

const props = defineProps<{ codigosConceptos: readonly string[] }>()
const emit = defineEmits<{ insertar: [texto: string, payload: PayloadPaleta] }>()

interface ItemVariable {
  readonly etiqueta: string
  readonly texto: string
  readonly tipo: string
  readonly descripcion: string
  /** Lo mismo, en forma de bloque — para insertar en el lienzo y para arrastrar. */
  readonly payload: PayloadPaleta
}

// F4, mov. 06 — este panel absorbió la paleta arrastrable. Había dos
// catálogos que no se hablaban: éste, con tipo y descripción, servía solo al
// modo texto (y pulsarlo estando en bloques te sacaba de modo sin avisar); la
// paleta de arriba servía solo a bloques, no tenía descripciones y solo
// respondía al arrastre — sus chips parecían botones y el clic no hacía nada,
// lo que además dejaba sin ruta de teclado la inserción en bloques.
//
// Ahora hay uno solo: el clic inserta (en el cursor si es texto, en el nodo
// activo si es bloques) y el arrastre sigue disponible como atajo.
function iniciarArrastre(evento: DragEvent, item: ItemVariable): void {
  evento.dataTransfer?.setData(MIME_PALETA_AEL, JSON.stringify(item.payload))
  evento.dataTransfer?.setData('text/plain', item.texto)
}
interface GrupoVariables {
  readonly titulo: string
  readonly items: readonly ItemVariable[]
}

const busqueda = ref('')

const grupos = computed<GrupoVariables[]>(() => {
  const parametros: ItemVariable[] = Object.entries(PARAMETER_CATALOGO).map(([campo, doc]) => ({
    etiqueta: campo,
    texto: `PARAMETER.${campo}`,
    tipo: doc.tipo,
    descripcion: doc.descripcion,
    payload: { kind: 'campo', contrato: 'PARAMETER', campo },
  }))
  const unidades: ItemVariable[] = Object.entries(UNIT_CATALOGO).map(([campo, doc]) => ({
    etiqueta: campo,
    texto: `UNIT.${campo}`,
    tipo: doc.tipo,
    descripcion: doc.descripcion,
    payload: { kind: 'campo', contrato: 'UNIT', campo },
  }))
  const conceptos: ItemVariable[] = props.codigosConceptos.map((codigo) => ({
    etiqueta: codigo,
    texto: `CONCEPTO.${codigo}`,
    tipo: 'MONEY',
    descripcion: 'Resultado ya evaluado de este concepto en el periodo.',
    payload: { kind: 'campo', contrato: 'CONCEPTO', campo: codigo },
  }))
  const funciones: ItemVariable[] = Object.entries(FUNCIONES_CATALOGO).map(([nombre, doc]) => ({
    etiqueta: doc.firma,
    texto: `${nombre}()`,
    tipo: 'función',
    descripcion: doc.descripcion,
    payload: { kind: 'funcion', nombre },
  }))
  return [
    { titulo: 'Parámetros', items: parametros },
    { titulo: 'Inmueble', items: unidades },
    { titulo: 'Conceptos', items: conceptos },
    { titulo: 'Funciones', items: funciones },
  ].filter((g) => g.items.length > 0)
})

const gruposFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return grupos.value
  return grupos.value
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => i.etiqueta.toLowerCase().includes(q) || i.descripcion.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.items.length > 0)
})
</script>

<template>
  <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-3">
    <p class="text-sm font-medium">Variables disponibles</p>
    <UInput v-model="busqueda" size="sm" placeholder="Buscar variable…" class="w-full" :ui="{ trailing: 'pr-8' }">
      <template v-if="busqueda" #trailing>
        <button
          type="button"
          class="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          @click="busqueda = ''"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </template>
    </UInput>

    <p v-if="gruposFiltrados.length === 0" class="text-xs text-neutral-400 italic">Sin resultados.</p>

    <div v-for="grupo in gruposFiltrados" :key="grupo.titulo" class="space-y-1">
      <p class="text-xs font-medium uppercase text-neutral-400">{{ grupo.titulo }}</p>
      <!-- Toda la fila es el botón: antes solo el «+» de 20 px lo era, y los
           chips de la paleta ni siquiera respondían al clic. Sigue siendo
           arrastrable, ahora como atajo y no como única vía. -->
      <button
        v-for="item in grupo.items"
        :key="item.texto"
        type="button"
        draggable="true"
        class="flex w-full cursor-grab items-center justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary dark:hover:bg-primary/10"
        :title="`Insertar ${item.texto}`"
        @click="emit('insertar', item.texto, item.payload)"
        @dragstart="iniciarArrastre($event, item)"
      >
        <span class="min-w-0">
          <span class="block truncate font-mono text-xs">{{ item.etiqueta }}</span>
          <span class="block truncate text-xs text-neutral-500 dark:text-neutral-400">
            {{ item.descripcion }}
          </span>
        </span>
        <span
          class="flex size-5 shrink-0 items-center justify-center rounded-full text-primary"
          aria-hidden="true"
        >
          +
        </span>
      </button>
    </div>
  </div>
</template>
