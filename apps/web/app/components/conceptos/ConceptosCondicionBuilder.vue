<script setup lang="ts">
// Constructor visual AND/OR del árbol de alcance (Fase 5) — recursivo para
// grupos anidados. modelValue es siempre un CondicionGrupo no-null (nunca
// una hoja suelta ni null): ConceptosEditor.vue es quien decide cuándo
// inicializar/descartar el árbol completo según el selector "Alcance"
// (Todos/Calculado) — este componente solo edita un grupo ya existente.
// <script setup> se auto-registra para recursión (Vue 3.2+), sin import.
import type { CondicionAlcance, CondicionGrupo, CondicionHoja } from '@aquila/liquidation-engine/alcance'
import { CAMPOS_ALCANCE, operadoresPara } from '~/utils/alcance-campos'

const props = defineProps<{ modelValue: CondicionGrupo; readonly?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [CondicionGrupo] }>()

function esGrupo(condicion: CondicionAlcance): condicion is CondicionGrupo {
  return 'op' in condicion
}

function cambiarOperadorLogico(op: 'and' | 'or'): void {
  emit('update:modelValue', { ...props.modelValue, op })
}

function actualizarHijo(indice: number, condicion: CondicionAlcance): void {
  const condiciones = props.modelValue.condiciones.slice()
  condiciones[indice] = condicion
  emit('update:modelValue', { ...props.modelValue, condiciones })
}

function quitarHijo(indice: number): void {
  emit('update:modelValue', {
    ...props.modelValue,
    condiciones: props.modelValue.condiciones.filter((_, i) => i !== indice),
  })
}

// Primer campo del vocabulario como valor por defecto al agregar una
// condición nueva — el usuario lo cambia desde el select de ConceptosCondicionHoja.
const CAMPO_POR_DEFECTO = CAMPOS_ALCANCE[0]!.campo

function agregarCondicion(): void {
  const operadores = operadoresPara(CAMPO_POR_DEFECTO)
  const nueva: CondicionHoja = { campo: CAMPO_POR_DEFECTO, operador: operadores[0]!, valor: '' }
  emit('update:modelValue', {
    ...props.modelValue,
    condiciones: [...props.modelValue.condiciones, nueva],
  })
}

function agregarGrupo(): void {
  const nuevo: CondicionGrupo = { op: 'and', condiciones: [] }
  emit('update:modelValue', {
    ...props.modelValue,
    condiciones: [...props.modelValue.condiciones, nuevo],
  })
}
</script>

<template>
  <div class="rounded-lg border border-gray-200 dark:border-gray-800 p-3 space-y-2">
    <div class="flex items-center gap-2">
      <span class="text-xs text-gray-500">Cumple</span>
      <div class="inline-flex rounded-md border border-gray-300 dark:border-gray-700 overflow-hidden text-xs">
        <button
          type="button"
          class="px-2 py-1"
          :class="modelValue.op === 'and' ? 'bg-primary text-white' : 'bg-transparent'"
          :disabled="readonly"
          @click="cambiarOperadorLogico('and')"
        >
          TODAS (Y)
        </button>
        <button
          type="button"
          class="px-2 py-1"
          :class="modelValue.op === 'or' ? 'bg-primary text-white' : 'bg-transparent'"
          :disabled="readonly"
          @click="cambiarOperadorLogico('or')"
        >
          ALGUNA (O)
        </button>
      </div>
    </div>

    <p v-if="modelValue.condiciones.length === 0" class="text-xs text-gray-500">
      Sin condiciones — agrega al menos una.
    </p>

    <div
      v-for="(hijo, i) in modelValue.condiciones"
      :key="i"
      class="pl-3 border-l-2 border-gray-200 dark:border-gray-800"
    >
      <ConceptosCondicionHoja
        v-if="!esGrupo(hijo)"
        :model-value="hijo"
        :readonly="readonly"
        @update:model-value="actualizarHijo(i, $event)"
        @eliminar="quitarHijo(i)"
      />
      <div v-else class="space-y-1">
        <ConceptosCondicionBuilder
          :model-value="hijo"
          :readonly="readonly"
          @update:model-value="actualizarHijo(i, $event)"
        />
        <UButton
          v-if="!readonly"
          type="button"
          size="xs"
          variant="ghost"
          color="error"
          @click="quitarHijo(i)"
        >
          Quitar grupo
        </UButton>
      </div>
    </div>

    <div v-if="!readonly" class="flex items-center gap-2">
      <UButton type="button" size="xs" variant="soft" @click="agregarCondicion">+ Condición</UButton>
      <UButton type="button" size="xs" variant="ghost" @click="agregarGrupo">+ Grupo anidado</UButton>
    </div>
  </div>
</template>
