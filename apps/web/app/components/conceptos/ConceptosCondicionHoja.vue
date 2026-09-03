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
    <USelect
      :model-value="modelValue.campo"
      :options="CAMPOS_ALCANCE.map(c => ({ value: c.campo, label: c.etiqueta }))"
      size="sm"
      :disabled="readonly"
      @update:model-value="cambiarCampo($event as CampoCondicion)"
    />

    <USelect
      :model-value="modelValue.operador"
      :options="operadoresDisponibles.map(op => ({ value: op, label: ETIQUETA_OPERADOR[op] }))"
      size="sm"
      class="w-16"
      :disabled="readonly"
      @update:model-value="actualizar({ operador: $event as OperadorCondicion })"
    />

    <UiSelectorBuscable
      v-if="meta.tipo === 'catalogo'"
      :model-value="modelValue.valor"
      :opciones="opcionesCatalogo.map(o => ({ valor: o.valor, etiqueta: o.etiqueta }))"
      placeholder="— Elegir —"
      class="min-w-40"
      :deshabilitado="readonly"
      @update:model-value="actualizar({ valor: $event ?? '' })"
    />

    <USelect
      v-else-if="meta.tipo === 'fijo'"
      :model-value="modelValue.valor"
      :options="(meta.opcionesFijas ?? []).map(o => ({ value: o.valor, label: o.etiqueta }))"
      size="sm"
      class="min-w-40"
      :disabled="readonly"
      @update:model-value="actualizar({ valor: ($event ?? '') as string | number })"
    />

    <USelect
      v-else-if="meta.tipo === 'mes'"
      :model-value="modelValue.valor"
      :options="Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))"
      size="sm"
      :disabled="readonly"
      @update:model-value="actualizar({ valor: Number($event) })"
    />

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
