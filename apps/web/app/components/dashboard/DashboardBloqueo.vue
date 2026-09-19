<script setup lang="ts">
// Puente de mando §4.3 — una fila de "lo que bloquea el cierre". Lista, no
// tarjetas: punto de severidad + título + consecuencia (verdadera, sacada de
// datos reales, nunca una plantilla) + metadato + el botón que resuelve.
// `puedeActuar` viene de `tenantStore.puede(...)` (§8) — un auditor ve el
// bloqueo pero no el botón, nunca un botón muerto.
defineProps<{
  severidad: 'error' | 'warning'
  titulo: string
  consecuencia: string
  metadato: string
  accionTexto: string
  accionEnlace: string
  puedeActuar: boolean
}>()
</script>

<template>
  <li class="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
    <div class="flex min-w-0 items-start gap-3">
      <span
        aria-hidden="true"
        class="mt-2 size-[9px] shrink-0 rounded-full"
        :class="severidad === 'error' ? 'bg-error' : 'bg-warning'"
      />
      <div class="min-w-0 space-y-0.5">
        <p class="font-display text-[17px] text-highlighted">{{ titulo }}</p>
        <p class="max-w-[68ch] text-sm text-muted">{{ consecuencia }}</p>
        <p class="text-xs text-dimmed">{{ metadato }}</p>
      </div>
    </div>
    <UButton
      v-if="puedeActuar"
      :to="accionEnlace"
      size="sm"
      color="neutral"
      variant="outline"
      class="shrink-0 self-start sm:self-center"
    >
      {{ accionTexto }}
    </UButton>
  </li>
</template>
