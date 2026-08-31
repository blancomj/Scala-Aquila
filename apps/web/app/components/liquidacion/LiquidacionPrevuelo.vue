<script setup lang="ts">
// Verificación previa (L1/L7) — la checklist que decide si el periodo está
// en condiciones de liquidarse.
//
// Los dos niveles no son decoración: un BLOQUEO deshabilita la acción y
// fn_aplicar_liquidacion lo vuelve a exigir dentro de su transacción, así que
// la pantalla nunca puede habilitar algo que la base vaya a rechazar. Un
// AVISO informa y deja seguir — y queda congelado en avisos_aceptados al
// aplicar, para poder responder después "¿sabíamos esto cuando liquidamos?".
import type { HallazgoPrevuelo } from '~/stores/liquidacion'

const props = defineProps<{
  hallazgos: HallazgoPrevuelo[]
  cargando?: boolean
}>()

const bloqueos = computed(() => props.hallazgos.filter((h) => h.severidad === 'bloqueo'))
const avisos = computed(() => props.hallazgos.filter((h) => h.severidad === 'aviso'))
const todoLimpio = computed(() => props.hallazgos.length === 0)
</script>

<template>
  <section>
    <h3 class="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
      Verificación previa
    </h3>

    <div v-if="cargando" class="space-y-2">
      <div v-for="i in 2" :key="i" class="flex items-start gap-3 px-3 py-2.5">
        <USkeleton class="size-4 shrink-0" />
        <div class="flex-1 space-y-1.5">
          <USkeleton class="h-4 w-3/4" />
          <USkeleton class="h-3 w-full" />
        </div>
      </div>
    </div>

    <div
      v-else-if="todoLimpio"
      class="flex items-center gap-2 rounded-md border border-default px-3 py-2.5 text-sm"
    >
      <UIcon name="i-lucide-check" class="size-4 text-success shrink-0" />
      <span>Todo en orden — este periodo se puede liquidar.</span>
    </div>

    <div v-else class="rounded-md border border-default divide-y divide-default overflow-hidden">
      <div
        v-for="h in [...bloqueos, ...avisos]"
        :key="h.codigo"
        class="flex items-start gap-3 px-3 py-2.5"
      >
        <UIcon
          :name="h.severidad === 'bloqueo' ? 'i-lucide-circle-x' : 'i-lucide-triangle-alert'"
          class="size-4 shrink-0 mt-0.5"
          :class="h.severidad === 'bloqueo' ? 'text-error' : 'text-warning'"
        />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">{{ h.titulo }}</p>
          <p class="text-xs text-muted mt-0.5">{{ h.detalle }}</p>
        </div>
        <UBadge
          :color="h.severidad === 'bloqueo' ? 'error' : 'warning'"
          variant="subtle"
          size="xs"
          class="shrink-0"
        >
          {{ h.severidad === 'bloqueo' ? 'Bloquea' : 'Aviso' }}
        </UBadge>
      </div>
    </div>

    <p v-if="bloqueos.length > 0" class="text-xs text-muted mt-2">
      Los bloqueos deben resolverse antes de liquidar. Los avisos no impiden continuar y quedan
      registrados en la liquidación.
    </p>
  </section>
</template>
