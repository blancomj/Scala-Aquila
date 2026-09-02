<script setup lang="ts">
import { useShortcuts } from '~/composables/useShortcuts'
import { NAV_GRUPOS, NAV_INICIO, NAV_COPROPIEDADES } from '~/utils/navegacion'

const { shortcuts } = useShortcuts()
const tenantStore = useTenantStore()
const { abierto: compositorAbierto } = useCompositorCorreo()

const compositorActivo = computed(() => tenantStore.activeTenant?.compositor_correo_activo === true)

/** Busca el icono original del NavItem por su ruta `to`. */
function iconoParaRuta(to: string): string {
  if (to === NAV_INICIO.to) return NAV_INICIO.icono
  if (to === NAV_COPROPIEDADES.to) return NAV_COPROPIEDADES.icono
  for (const grupo of NAV_GRUPOS) {
    const item = grupo.items.find((i) => i.to === to)
    if (item) return item.icono
  }
  return ''
}

const ICONO_ENVELOPE = 'M2 4h20v16H2V4zm0 0l10 7 10-7'
</script>

<template>
  <div v-if="compositorActivo || shortcuts.length > 0" class="border-t border-slate-800 px-2 pt-2 pb-1">
    <div class="flex items-center gap-1">
      <!-- Slot fijo: Compositor de correo (solo si la copropiedad lo tiene activo) -->
      <UTooltip v-if="compositorActivo" text="Compositor de correo" :delay-duration="300">
        <button
          type="button"
          class="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
          :class="
            compositorAbierto
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          "
          @click="compositorAbierto = !compositorAbierto"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="w-4 h-4"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </button>
      </UTooltip>

      <!-- Accesos directos del usuario -->
      <UTooltip v-for="shortcut in shortcuts" :key="shortcut.to" :text="shortcut.label" :delay-duration="300">
        <NuxtLink
          :to="shortcut.to"
          class="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
          :class="
            $route.path === shortcut.to || $route.path.startsWith(`${shortcut.to}/`)
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          "
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="w-4 h-4"
          >
            <path :d="iconoParaRuta(shortcut.to)" />
          </svg>
        </NuxtLink>
      </UTooltip>
    </div>
  </div>
</template>
