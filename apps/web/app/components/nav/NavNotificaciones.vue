<script setup lang="ts">
/**
 * Campana de notificaciones — no existe una tabla `notificaciones` en el
 * esquema (verificado antes de construir esto). Reutiliza audit_log, la
 * única fuente real de "cosas que pasaron recientemente" (misma tabla que
 * ya usa dashboard/index.vue), en vez de inventar un sistema con estado
 * leído/no-leído que no existe en la base. El conteo de "nuevo" es
 * client-side: compara created_at contra la cookie `notificaciones-vistas`
 * (última vez que se abrió el panel) — honesto sobre lo que sabe (esta
 * sesión/navegador) y lo que no (no hay tabla de lectura por usuario).
 */
const tenantStore = useTenantStore()
const auditStore = useAuditStore()

const menuAbierto = useMenuHeaderAbierto()
const abierto = computed(() => menuAbierto.value === 'notificaciones')
const contenedorRef = ref<HTMLElement | null>(null)
const vistasEn = useCookie<string | null>('notificaciones-vistas', { default: () => null })

const noLeidos = computed(() => {
  if (!vistasEn.value) return auditStore.eventosRecientes.length
  const umbral = new Date(vistasEn.value).getTime()
  return auditStore.eventosRecientes.filter((e) => new Date(e.created_at).getTime() > umbral).length
})

async function alAbrir(): Promise<void> {
  const abriendo = !abierto.value
  menuAbierto.value = abriendo ? 'notificaciones' : null
  if (!abriendo) return
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) await auditStore.cargarEventosRecientes(tenantId)
  vistasEn.value = new Date().toISOString()
}

function alPerderFoco(evento: FocusEvent): void {
  const siguiente = evento.relatedTarget as Node | null
  if (siguiente && contenedorRef.value?.contains(siguiente)) return
  if (abierto.value) menuAbierto.value = null
}

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}
</script>

<template>
  <div ref="contenedorRef" class="relative" @focusout="alPerderFoco">
    <button
      type="button"
      class="relative w-9 h-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
      title="Actividad reciente"
      @click="alAbrir"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
        <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      <span
        v-if="noLeidos > 0"
        class="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center"
      >
        {{ noLeidos > 9 ? '9+' : noLeidos }}
      </span>
    </button>

    <div
      v-if="abierto"
      class="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl z-40 overflow-hidden"
    >
      <div class="flex items-center justify-between px-3 pt-2.5 pb-1">
        <p class="text-[10.5px] uppercase tracking-wide text-gray-400 font-mono">Actividad reciente</p>
        <NuxtLink
          to="/auditoria"
          class="text-xs text-primary-600 dark:text-primary-400 hover:underline"
          @click="menuAbierto = null"
        >
          Ver todo
        </NuxtLink>
      </div>
      <p v-if="auditStore.eventosRecientes.length === 0" class="px-3 py-4 text-sm text-gray-400 text-center">
        Sin actividad reciente.
      </p>
      <ul v-else class="max-h-80 overflow-y-auto">
        <li
          v-for="evento in auditStore.eventosRecientes"
          :key="evento.id"
          class="px-3 py-2 border-t border-gray-100 dark:border-gray-800 text-sm"
        >
          <p class="text-gray-700 dark:text-gray-200">{{ evento.action }}</p>
          <p class="text-xs text-gray-400 mt-0.5">{{ formatoFecha(evento.created_at) }}</p>
        </li>
      </ul>
    </div>
  </div>
</template>
