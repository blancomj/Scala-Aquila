<script setup lang="ts">
// Puente de mando §6.6 — patrón de disclosure WAI-ARIA, reutilizado por los
// cuatro bloques analíticos (el dinero, cómo envejece, por dónde entra, el
// pulso de hoy). El botón vive DENTRO del <h2> (conserva el nivel de
// encabezado en el árbol de accesibilidad) y el estado se persiste por
// usuario con useCookie — mismo precedente que `dashboard-resumen-expandido`
// del dashboard anterior. Nunca anima el alto del cuerpo (v-show, no
// max-height): un contenido de alto desconocido salta si se anima.
const props = defineProps<{
  id: string
  titulo: string
  defaultAbierto: boolean
}>()

const abierto = useCookie<boolean>(`dashboard-sec-${props.id}`, { default: () => props.defaultAbierto })

function alternar(): void {
  abierto.value = !abierto.value
}
</script>

<template>
  <section class="rounded-md border border-default">
    <h2 class="sec-plegable">
      <button
        type="button"
        class="flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :aria-expanded="abierto ? 'true' : 'false'"
        :aria-controls="`cuerpo-${id}`"
        @click="alternar"
      >
        <span class="font-display font-medium text-highlighted shrink-0">{{ titulo }}</span>
        <span class="min-w-0 flex-1 truncate text-sm text-dimmed">
          <slot name="resumen" />
        </span>
        <UIcon
          name="i-lucide-chevron-down"
          aria-hidden="true"
          class="size-4 shrink-0 text-dimmed transition-transform duration-200 motion-reduce:transition-none"
          :class="{ 'rotate-180': abierto }"
        />
      </button>
    </h2>
    <div v-show="abierto" :id="`cuerpo-${id}`" class="border-t border-default p-4">
      <slot />
    </div>
  </section>
</template>
