<script setup lang="ts">
// Edita una hoja {campo, operador, valor} del árbol de alcance (Fase 5).
// Catálogos lista_tipos (ESTADO_LEGAL_PREDIO/HABITABILIDAD_PREDIO/USO_PREDIO)
// se cargan una sola vez por familia y se comparten entre todas las hojas de
// la página vía useState — el mismo builder puede tener varias hojas que
// usan la misma familia (ej. dos condiciones de Uso del Predio en un OR).
import type { CampoCondicion, CondicionHoja, OperadorCondicion } from '@aquila/liquidation-engine/alcance'
import type { Database } from '@aquila/shared'
import { CAMPOS_ALCANCE, ETIQUETA_OPERADOR, metaDeCampo, operadoresPara } from '~/utils/alcance-campos'

const props = defineProps<{ modelValue: CondicionHoja; readonly?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [CondicionHoja]; eliminar: [] }>()

const tenantStore = useTenantStore()

type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']
const catalogos = useState<Record<string, ListaTipoRow[]>>('alcance-catalogos-lista-tipos', () => ({}))

const meta = computed(() => metaDeCampo(props.modelValue.campo))
const operadoresDisponibles = computed(() => operadoresPara(props.modelValue.campo))

// CondicionHoja.valor es string | number (los campos de catálogo llevan código,
// los numéricos un número), pero model-value de UInput solo acepta string —
// se normaliza aquí y @update:model-value lo devuelve a number.
const valorTexto = computed(() => String(props.modelValue.valor))

const opcionesCatalogo = computed(() => {
  const familia = meta.value.familiaListaTipos
  if (!familia) return []
  return (catalogos.value[familia] ?? []).map((t) => ({ valor: t.codigo, etiqueta: t.nombre }))
})

watchEffect(async () => {
  const familia = meta.value.familiaListaTipos
  const tenantId = tenantStore.activeTenant?.id
  if (!familia || !tenantId || catalogos.value[familia]) return
  catalogos.value = { ...catalogos.value, [familia]: await cargarListaTipos(tenantId, familia) }
})

function actualizar(cambios: Partial<CondicionHoja>): void {
  emit('update:modelValue', { ...props.modelValue, ...cambios })
}

function cambiarCampo(campo: CampoCondicion): void {
  const nuevaMeta = metaDeCampo(campo)
  const operadores = operadoresPara(campo)
  const operador = operadores.includes(props.modelValue.operador) ? props.modelValue.operador : (operadores[0] as OperadorCondicion)
  const valor = nuevaMeta.tipo === 'fijo' ? (nuevaMeta.opcionesFijas?.[0]?.valor ?? '') : ''
  emit('update:modelValue', { campo, operador, valor })
}
</script>

<template>
  <div class="flex items-center gap-2 flex-wrap">
    <select
      :value="modelValue.campo"
      :disabled="readonly"
      class="rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm"
      @change="cambiarCampo(($event.target as HTMLSelectElement).value as CampoCondicion)"
    >
      <option v-for="c in CAMPOS_ALCANCE" :key="c.campo" :value="c.campo">{{ c.etiqueta }}</option>
    </select>

    <select
      :value="modelValue.operador"
      :disabled="readonly"
      class="rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm w-16"
      @change="actualizar({ operador: ($event.target as HTMLSelectElement).value as OperadorCondicion })"
    >
      <option v-for="op in operadoresDisponibles" :key="op" :value="op">{{ ETIQUETA_OPERADOR[op] }}</option>
    </select>

    <select
      v-if="meta.tipo === 'catalogo'"
      :value="modelValue.valor"
      :disabled="readonly"
      class="rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm min-w-40"
      @change="actualizar({ valor: ($event.target as HTMLSelectElement).value })"
    >
      <option value="" disabled>— Elegir —</option>
      <option v-for="op in opcionesCatalogo" :key="op.valor" :value="op.valor">{{ op.etiqueta }}</option>
    </select>

    <select
      v-else-if="meta.tipo === 'fijo'"
      :value="modelValue.valor"
      :disabled="readonly"
      class="rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm min-w-40"
      @change="actualizar({ valor: ($event.target as HTMLSelectElement).value })"
    >
      <option v-for="op in meta.opcionesFijas" :key="op.valor" :value="op.valor">{{ op.etiqueta }}</option>
    </select>

    <select
      v-else-if="meta.tipo === 'mes'"
      :value="modelValue.valor"
      :disabled="readonly"
      class="rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm"
      @change="actualizar({ valor: Number(($event.target as HTMLSelectElement).value) })"
    >
      <option v-for="mes in 12" :key="mes" :value="mes">{{ mes }}</option>
    </select>

    <UInput
      v-else
      :model-value="valorTexto"
      type="number"
      size="sm"
      class="w-32"
      :disabled="readonly"
      @update:model-value="actualizar({ valor: Number($event) })"
    />

    <UButton v-if="!readonly" type="button" size="xs" variant="ghost" color="error" @click="emit('eliminar')">
      Quitar
    </UButton>
  </div>
</template>
