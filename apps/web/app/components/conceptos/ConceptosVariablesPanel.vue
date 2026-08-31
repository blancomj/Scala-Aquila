<script setup lang="ts">
// Panel "Variables disponibles" del editor de conceptos — catálogo real de
// PARAMETER/UNIT/CONCEPTO/funciones (ael-catalogo.ts), buscable y agrupado
// por contrato. Deliberadamente NO usa las categorías temáticas ("Consumos",
// "Período") de un mockup de referencia: esas variables no existen en el
// dominio real (UNIT solo tiene AREA_PRIVADA/AREA_COMUN/COEFICIENTE, ver
// snapshot-supabase.ts) — mostrar categorías vacías o campos ficticios
// engañaría al usuario sobre qué puede usar de verdad en una fórmula.
import { FUNCIONES_CATALOGO, PARAMETER_CATALOGO, UNIT_CATALOGO } from '~/utils/ael-catalogo'

const props = defineProps<{ codigosConceptos: readonly string[] }>()
const emit = defineEmits<{ insertar: [texto: string] }>()

interface ItemVariable {
  readonly etiqueta: string
  readonly texto: string
  readonly tipo: string
  readonly descripcion: string
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
  }))
  const unidades: ItemVariable[] = Object.entries(UNIT_CATALOGO).map(([campo, doc]) => ({
    etiqueta: campo,
    texto: `UNIT.${campo}`,
    tipo: doc.tipo,
    descripcion: doc.descripcion,
  }))
  const conceptos: ItemVariable[] = props.codigosConceptos.map((codigo) => ({
    etiqueta: codigo,
    texto: `CONCEPTO.${codigo}`,
    tipo: 'MONEY',
    descripcion: 'Resultado ya evaluado de este concepto en el periodo.',
  }))
  const funciones: ItemVariable[] = Object.entries(FUNCIONES_CATALOGO).map(([nombre, doc]) => ({
    etiqueta: doc.firma,
    texto: `${nombre}()`,
    tipo: 'función',
    descripcion: doc.descripcion,
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
    <UInput v-model="busqueda" size="sm" placeholder="Buscar variable…" class="w-full" />

    <p v-if="gruposFiltrados.length === 0" class="text-xs text-neutral-400 italic">Sin resultados.</p>

    <div v-for="grupo in gruposFiltrados" :key="grupo.titulo" class="space-y-1">
      <p class="text-xs font-medium uppercase text-neutral-400">{{ grupo.titulo }}</p>
      <div
        v-for="item in grupo.items"
        :key="item.texto"
        class="flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
      >
        <div class="min-w-0">
          <p class="text-xs font-mono truncate" :title="item.texto">{{ item.etiqueta }}</p>
          <p class="text-xs text-neutral-400 truncate" :title="item.descripcion">
            {{ item.descripcion }}
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-full w-5 h-5 flex items-center justify-center text-primary hover:bg-primary/10"
          :title="`Insertar ${item.texto}`"
          @click="emit('insertar', item.texto)"
        >
          +
        </button>
      </div>
    </div>
  </div>
</template>
