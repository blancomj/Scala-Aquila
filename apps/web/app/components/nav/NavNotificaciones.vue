<script setup lang="ts">
/**
 * Campana de notificaciones — EXS-2.
 *
 * Hasta este corte leía `audit_log` y contaba lo "nuevo" comparando contra
 * una cookie de este navegador, porque no existía una tabla de
 * notificaciones. Ya existe: `notificaciones` + `notificacion_lectura`
 * (20260933010000). Tres cosas cambian para quien la usa:
 *
 *   · lo que sale es lo que le concierne (RLS por tenant y por módulo
 *     visible), no todo lo que ocurrió en la copropiedad;
 *   · el "no leído" es real y por persona — sobrevive al cambio de equipo
 *     o de navegador, que la cookie no hacía;
 *   · cada aviso lleva al contexto exacto, no a la pantalla general.
 *
 * La actividad de auditoría no desaparece: sigue en /auditoria, que es su
 * sitio. Campana y auditoría dejan de ser la misma cosa.
 */
const tenantStore = useTenantStore()
const notificacionesStore = useNotificacionesStore()

const menuAbierto = useMenuHeaderAbierto()
const abierto = computed(() => menuAbierto.value === 'notificaciones')
const contenedorRef = ref<HTMLElement | null>(null)

const noLeidos = computed(() => notificacionesStore.noLeidas)

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) await notificacionesStore.cargar(tenantId)
}

// El contador debe verse sin abrir el panel, así que se carga al montar.
onMounted(cargar)

// Cambiar de copropiedad invalida por completo lo que había: son avisos de
// otro tenant (prompt 06 §19/§20 — nada de resultados residuales al hacer
// switch).
watch(() => tenantStore.activeTenant?.id, cargar)

function alAbrir(): void {
  menuAbierto.value = abierto.value ? null : 'notificaciones'
}

function alPerderFoco(evento: FocusEvent): void {
  const siguiente = evento.relatedTarget as Node | null
  if (siguiente && contenedorRef.value?.contains(siguiente)) return
  if (abierto.value) menuAbierto.value = null
}

async function alActivar(id: string, enlace: string | null): Promise<void> {
  await notificacionesStore.marcarLeida(id)
  menuAbierto.value = null
  if (enlace) await navigateTo(enlace)
}

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}

const CLASE_PRIORIDAD: Record<string, string> = {
  critica: 'bg-red-500',
  importante: 'bg-amber-500',
  informativa: 'bg-gray-300 dark:bg-gray-600',
}
</script>

<template>
  <div ref="contenedorRef" class="relative" @focusout="alPerderFoco">
    <button
      type="button"
      class="relative w-9 h-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
      :title="noLeidos > 0 ? `${noLeidos} notificaciones sin leer` : 'Notificaciones'"
      :aria-label="noLeidos > 0 ? `Notificaciones, ${noLeidos} sin leer` : 'Notificaciones'"
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
        <p class="text-[10.5px] uppercase tracking-wide text-gray-400 font-mono">Notificaciones</p>
        <button
          v-if="noLeidos > 0"
          type="button"
          class="text-xs text-primary-600 dark:text-primary-400 hover:underline"
          @click="notificacionesStore.marcarTodasLeidas()"
        >
          Marcar todas leídas
        </button>
      </div>

      <p
        v-if="notificacionesStore.notificaciones.length === 0"
        class="px-3 py-4 text-sm text-gray-400 text-center"
      >
        Sin notificaciones.
      </p>

      <ul v-else class="max-h-80 overflow-y-auto">
        <li
          v-for="n in notificacionesStore.notificaciones"
          :key="n.id"
          class="border-t border-gray-100 dark:border-gray-800"
        >
          <component
            :is="n.enlace ? 'button' : 'div'"
            :type="n.enlace ? 'button' : undefined"
            class="w-full text-left px-3 py-2 text-sm flex gap-2"
            :class="[
              n.enlace ? 'hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer' : '',
              n.leida ? 'opacity-60' : '',
            ]"
            @click="n.enlace ? alActivar(n.id, n.enlace) : undefined"
          >
            <!-- La prioridad no se comunica solo por color: el punto lleva
                 su propio texto accesible (WCAG 2.2, prompt 02 §38). -->
            <span
              class="mt-1.5 w-2 h-2 rounded-full shrink-0"
              :class="CLASE_PRIORIDAD[n.prioridad] ?? CLASE_PRIORIDAD.informativa"
            />
            <span class="sr-only">Prioridad {{ n.prioridad }}.</span>
            <span class="min-w-0">
              <span class="block text-gray-700 dark:text-gray-200" :class="n.leida ? '' : 'font-medium'">
                {{ n.titulo }}
              </span>
              <span v-if="n.cuerpo" class="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {{ n.cuerpo }}
              </span>
              <span class="block text-xs text-gray-400 mt-0.5">{{ formatoFecha(n.createdAt) }}</span>
            </span>
          </component>
        </li>
      </ul>
    </div>
  </div>
</template>
