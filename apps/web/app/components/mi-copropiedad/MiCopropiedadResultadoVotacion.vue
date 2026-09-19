<script setup lang="ts">
// EXT-11 (Ola 3, M20) — resumen de una votación ya cerrada: pregunta, resultado y coeficientes
// agregados. NUNCA recibe ni muestra el voto individual de cada miembro/inmueble (gobierno_votos)
// — ver PROMPT_MI_COPROPIEDAD_FASE3.md §1.2/§3.
defineProps<{
  votacion: VotacionGobierno
}>()

const ETIQUETA_RESULTADO: Record<string, string> = {
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  sin_quorum: 'Sin quórum',
}

function formatoCoeficiente(valor: string | null): string {
  if (valor === null) return '—'
  return `${(Number(valor) * 100).toFixed(2)}%`
}
</script>

<template>
  <div class="rounded-xl border border-default bg-elevated p-4">
    <div class="flex items-start justify-between gap-3">
      <p class="min-w-0 text-sm font-medium text-highlighted">{{ votacion.pregunta }}</p>
      <span
        v-if="votacion.resultado"
        class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
        :class="
          votacion.resultado === 'aprobada'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
            : 'bg-elevated text-toned'
        "
      >{{ ETIQUETA_RESULTADO[votacion.resultado] ?? votacion.resultado }}</span>
    </div>
    <p class="mt-1 text-xs text-muted">{{ votacion.materia_nombre }}</p>

    <dl class="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
      <div>
        <dt class="text-dimmed">A favor</dt>
        <dd class="font-medium text-default">{{ formatoCoeficiente(votacion.coeficiente_favor) }}</dd>
      </div>
      <div>
        <dt class="text-dimmed">En contra</dt>
        <dd class="font-medium text-default">{{ formatoCoeficiente(votacion.coeficiente_contra) }}</dd>
      </div>
      <div>
        <dt class="text-dimmed">Abstención</dt>
        <dd class="font-medium text-default">{{ formatoCoeficiente(votacion.coeficiente_abstencion) }}</dd>
      </div>
    </dl>
  </div>
</template>
