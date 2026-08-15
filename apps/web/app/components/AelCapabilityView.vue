<script setup lang="ts">
// AEL-004 Fase 4 — panel de solo lectura (Doc 10 §59-61 CAPABILITY VIEW/
// EXPLANATION, §141-142). Puramente derivado del texto de la fórmula, sin
// backend — ver utils/ael-capabilities.ts.
import { extraerCapabilidades } from '~/utils/ael-capabilities'

const props = defineProps<{ formulaAel: string }>()

const capacidades = computed(() => extraerCapabilidades(props.formulaAel))
const sinDependencias = computed(
  () => capacidades.value.contratos.length === 0 && capacidades.value.funciones.length === 0,
)
</script>

<template>
  <div class="rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-2">
    <p class="text-sm font-medium">Capabilities</p>
    <p v-if="sinDependencias" class="text-xs text-gray-500">Sin dependencias detectadas.</p>
    <ul v-else class="space-y-1 text-xs">
      <li v-for="c in capacidades.contratos" :key="c.contrato">
        <span class="font-mono font-medium">{{ c.capability }}</span>
        <span class="text-gray-500">
          — requerido por {{ c.campos.map((campo) => `${c.contrato}.${campo}`).join(', ') }}</span
        >
      </li>
      <li v-for="f in capacidades.funciones" :key="f">
        <span class="font-mono font-medium">USES_FUNCTION</span>
        <span class="text-gray-500"> — {{ f }}</span>
      </li>
    </ul>
  </div>
</template>
