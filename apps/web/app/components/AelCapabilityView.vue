<script setup lang="ts">
// AEL-004 Fase 4 — panel de solo lectura (Doc 10 §59-61 CAPABILITY VIEW/
// EXPLANATION, §141-142). Puramente derivado del texto de la fórmula, sin
// backend — ver utils/ael-capabilities.ts.
//
// Fase 8 (higiene del módulo): el panel se titulaba «Capabilities» y listaba
// `READ_PARAMETER` / `USES_FUNCTION` en crudo. Son los nombres internos del
// modelo de capacidades, no algo que signifique nada para quien administra
// una copropiedad. Los códigos siguen existiendo igual en
// ael-capabilities.ts; lo que cambia es cómo se leen en pantalla.
import { extraerCapabilidades } from '~/utils/ael-capabilities'
import { ETIQUETA_CONTRATO, etiquetaCampo, etiquetaFuncion } from '~/utils/ael-etiquetas'

const props = defineProps<{ formulaAel: string }>()

const capacidades = computed(() => extraerCapabilidades(props.formulaAel))
const sinDependencias = computed(
  () => capacidades.value.contratos.length === 0 && capacidades.value.funciones.length === 0,
)
</script>

<template>
  <div class="rounded-lg border border-neutral-200 p-4 space-y-2 dark:border-neutral-800">
    <p class="text-sm font-medium">De qué depende esta fórmula</p>
    <p v-if="sinDependencias" class="text-xs text-neutral-500 dark:text-neutral-400">
      De nada externo: solo usa valores escritos en la propia fórmula.
    </p>
    <ul v-else class="space-y-1.5 text-xs">
      <li v-for="c in capacidades.contratos" :key="c.contrato">
        <span class="font-medium">{{ ETIQUETA_CONTRATO[c.contrato] ?? c.contrato }}</span>
        <span class="text-neutral-500 dark:text-neutral-400">
          — lee {{ c.campos.map((campo) => etiquetaCampo(campo)).join(', ') }}</span
        >
      </li>
      <li v-for="f in capacidades.funciones" :key="f">
        <span class="font-medium">Función</span>
        <span class="text-neutral-500 dark:text-neutral-400"> — {{ etiquetaFuncion(f) }}</span>
      </li>
    </ul>
  </div>
</template>
