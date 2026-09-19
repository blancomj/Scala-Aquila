<script setup lang="ts">
// EXT-05 §6.2/§6.4 — solo se monta cuando actorExterno.tieneMultiplesVinculos (el layout ya lo
// condiciona con v-if), mismo criterio que NavTenantSwitcher.vue: con un solo vínculo no hay
// nada entre qué elegir, así que ese caso ni siquiera construye este componente.
const actorExterno = useActorExternoStore()
const abierto = ref(false)
const contenedorRef = ref<HTMLElement | null>(null)

function alternar(): void {
  abierto.value = !abierto.value
}

function seleccionar(vinculoId: string): void {
  actorExterno.seleccionarVinculo(vinculoId)
  abierto.value = false
}

function alPerderFoco(evento: FocusEvent): void {
  const siguiente = evento.relatedTarget as Node | null
  if (siguiente && contenedorRef.value?.contains(siguiente)) return
  abierto.value = false
}
</script>

<template>
  <div ref="contenedorRef" class="relative" @focusout="alPerderFoco">
    <button
      type="button"
      class="flex items-center gap-1.5 text-sm font-medium text-highlighted"
      :aria-expanded="abierto"
      @click="alternar"
    >
      <span class="truncate max-w-[10rem]">
        {{ actorExterno.vinculoActivo?.tenant_nombre ?? 'Selecciona un vínculo' }}
      </span>
      <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 text-dimmed" />
    </button>

    <div
      v-if="abierto"
      class="absolute top-full left-0 mt-2 w-72 bg-default border border-default rounded-lg shadow-xl z-40 overflow-hidden"
    >
      <p class="text-[10.5px] uppercase tracking-wide text-dimmed font-mono px-3 pt-2.5 pb-1">
        Tus vínculos
      </p>
      <button
        v-for="v in actorExterno.vinculos"
        :key="v.vinculo_id"
        type="button"
        class="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-muted"
        :class="
          v.vinculo_id === actorExterno.vinculoActivoId
            ? 'font-medium'
            : 'text-toned'
        "
        @click="seleccionar(v.vinculo_id)"
      >
        <span class="min-w-0">
          <span class="block truncate">{{ v.tenant_nombre }}</span>
          <span class="block text-xs text-dimmed">{{ v.rol_codigo }}</span>
        </span>
        <UIcon
          v-if="v.vinculo_id === actorExterno.vinculoActivoId"
          name="i-lucide-check"
          class="size-4 text-primary-600 dark:text-primary-400 shrink-0"
        />
      </button>
    </div>
  </div>
</template>
