<script setup lang="ts">
// EXT-08b §6.2/§7.10 (Ola 2, M11) — campana de notificaciones in-app, montada en el header de
// TODA la sección mi-copropiedad (layouts/mi-copropiedad.vue), mismo criterio de autocontención
// que MiCopropiedadSelectorVinculo.vue (lee el store directo, carga sus propios datos). Vía
// mínima explícita: un solo evento conocido (respuesta de staff a una solicitud propia) — no un
// canal genérico de comunicados (§4.4).
const actorExterno = useActorExternoStore()
const notificaciones = ref<NotificacionExterna[]>([])
const cargando = ref(false)
const cargadas = ref(false)
const abierto = ref(false)
const contenedorRef = ref<HTMLElement | null>(null)

const noLeidas = computed(() => notificaciones.value.filter((n) => !n.leida_at).length)

async function cargar(): Promise<void> {
  if (!actorExterno.vinculoActivo || cargando.value) return
  cargando.value = true
  try {
    notificaciones.value = await listarNotificacionesExternas(actorExterno.vinculoActivo.vinculo_id)
  } catch {
    // Silencioso a propósito: la campana es un realce, no un flujo crítico — un fallo aquí no
    // debe interrumpir al residente con un error visible en cada página de la sección.
  } finally {
    cargando.value = false
    cargadas.value = true
  }
}

onMounted(cargar)

function alternar(): void {
  abierto.value = !abierto.value
  if (abierto.value && !cargadas.value) {
    void cargar()
  }
}

function alPerderFoco(evento: FocusEvent): void {
  const siguiente = evento.relatedTarget as Node | null
  if (siguiente && contenedorRef.value?.contains(siguiente)) return
  abierto.value = false
}

async function abrir(notificacion: NotificacionExterna): Promise<void> {
  if (!actorExterno.vinculoActivo) return
  abierto.value = false
  if (!notificacion.leida_at) {
    try {
      const actualizada = await marcarNotificacionExternaLeida(actorExterno.vinculoActivo.vinculo_id, notificacion.id)
      const i = notificaciones.value.findIndex((n) => n.id === notificacion.id)
      if (i !== -1) notificaciones.value[i] = actualizada
    } catch {
      // Si falla marcarla leída no bloquea la navegación — el residente igual quiere ver la
      // respuesta; simplemente seguirá contando como no leída hasta el próximo intento.
    }
  }
  if (notificacion.enlace) {
    await navigateTo(notificacion.enlace)
  }
}
</script>

<template>
  <div ref="contenedorRef" class="relative" @focusout="alPerderFoco">
    <button
      type="button"
      class="relative flex items-center justify-center rounded-full p-1.5 text-muted hover:bg-elevated"
      :aria-expanded="abierto"
      aria-label="Notificaciones"
      @click="alternar"
    >
      <UIcon name="i-lucide-bell" class="size-5" />
      <span
        v-if="noLeidas > 0"
        class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white"
      >{{ noLeidas > 9 ? '9+' : noLeidas }}</span>
    </button>

    <div
      v-if="abierto"
      class="absolute top-full right-0 mt-2 w-80 max-w-[90vw] bg-default border border-default rounded-lg shadow-xl z-40 overflow-hidden"
    >
      <p class="text-[10.5px] uppercase tracking-wide text-dimmed font-mono px-3 pt-2.5 pb-1">
        Notificaciones
      </p>
      <p v-if="cargando" class="px-3 pb-3 text-sm text-muted">Cargando…</p>
      <p v-else-if="notificaciones.length === 0" class="px-3 pb-3 text-sm text-muted">
        No tienes notificaciones todavía.
      </p>
      <div v-else class="max-h-80 divide-y divide-default overflow-y-auto">
        <button
          v-for="n in notificaciones"
          :key="n.id"
          type="button"
          class="w-full px-3 py-2.5 text-left hover:bg-muted"
          @click="abrir(n)"
        >
          <span class="flex items-start gap-2">
            <span
              class="mt-1.5 size-1.5 shrink-0 rounded-full"
              :class="n.leida_at ? 'bg-transparent' : 'bg-primary-600 dark:bg-primary-400'"
            />
            <span class="min-w-0">
              <span class="block truncate text-sm" :class="n.leida_at ? 'text-toned' : 'font-medium text-highlighted'">
                {{ n.titulo }}
              </span>
              <span v-if="n.cuerpo" class="block truncate text-xs text-muted">{{ n.cuerpo }}</span>
            </span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
