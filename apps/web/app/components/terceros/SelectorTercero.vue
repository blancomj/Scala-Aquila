<script setup lang="ts">
// Envuelve UiSelectorBuscable + TerceroModal para los formularios (no filtros) que piden un
// tercero y donde ese tercero muchas veces todavía no existe — evita que el usuario tenga que
// abandonar el formulario, ir a /terceros, crearlo, y volver a empezar. `permiteCrear` es el
// interruptor explícito: los filtros siguen usando UiSelectorBuscable directo, sin este wrapper.
//
// No duplica el catálogo de opciones ni el guardado del tercero: usa TerceroModal tal cual (mismo
// formulario que /terceros), que ya deja el tercero nuevo en useTercerosStore().terceros vía
// cargarTerceros() antes de emitir `guardado` — el `opciones` que reciba este componente (derivado
// de ese store en el padre) ya incluye al nuevo tercero para cuando se selecciona su id.
import type { OpcionSelectorBuscable } from '~/components/ui/UiSelectorBuscable.vue'

defineProps<{
  modelValue: string | number | null
  opciones: OpcionSelectorBuscable[]
  placeholder?: string
  deshabilitado?: boolean
  permiteCrear?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [string | number | null] }>()

const modalAbierto = ref(false)
const nombreInicial = ref('')

function alCrear(busqueda: string): void {
  nombreInicial.value = busqueda
  modalAbierto.value = true
}

function alGuardado(id: string): void {
  emit('update:modelValue', id)
  modalAbierto.value = false
}
</script>

<template>
  <UiSelectorBuscable
    :model-value="modelValue"
    :opciones="opciones"
    :placeholder="placeholder"
    :deshabilitado="deshabilitado"
    :permite-crear="permiteCrear"
    etiqueta-crear="Crear nuevo tercero"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @crear="alCrear"
  />
  <TercerosTerceroModal
    v-if="modalAbierto" :nombre-inicial="nombreInicial"
    @cerrar="modalAbierto = false" @guardado="alGuardado"
  />
</template>
