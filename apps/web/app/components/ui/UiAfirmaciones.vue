<script setup lang="ts">
// ENFOQUE_CONSOLIDACION, Ola 2 §2 — render del contrato Afirmacion[] (packages/shared/src/
// explicacion.ts). Cada afirmación ya viene redactada con plantilla + valores reales del
// dominio (DI-03: nunca prosa de modelo de lenguaje); este componente solo la muestra con su
// taxonomía de certeza visible, no reinterpreta ni recalcula nada (DI-04).
import type { Afirmacion, TipoCerteza } from '@aquila/shared'

defineProps<{ afirmaciones: readonly Afirmacion[] }>()

const ETIQUETA_CERTEZA: Record<TipoCerteza, string> = {
  hecho: 'Hecho',
  calculo: 'Cálculo',
  inferencia: 'Inferencia',
  hipotesis: 'Hipótesis',
  informacion_insuficiente: 'Sin datos suficientes',
}

const COLOR_CERTEZA: Record<TipoCerteza, 'neutral' | 'primary' | 'info' | 'warning'> = {
  hecho: 'neutral',
  calculo: 'primary',
  inferencia: 'info',
  hipotesis: 'warning',
  informacion_insuficiente: 'warning',
}
</script>

<template>
  <ul class="space-y-2">
    <li v-for="(a, i) in afirmaciones" :key="i" class="flex items-start gap-2 text-sm">
      <UBadge size="sm" variant="subtle" :color="COLOR_CERTEZA[a.tipo]" class="mt-0.5 shrink-0">
        {{ ETIQUETA_CERTEZA[a.tipo] }}
      </UBadge>
      <span class="text-neutral-600 dark:text-neutral-400">{{ a.texto }}</span>
    </li>
  </ul>
</template>
