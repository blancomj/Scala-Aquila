<script setup lang="ts">
// Panel lateral derecho reutilizado por formularios que antes eran modal
// centrado o contenido en línea (ficha de inmueble, terceros, copropiedad).
// Estilos en assets/css/ficha-inmueble.css (.drawer-*) — mismos tokens que
// el .modal centrado que ya traía el mockup pero sin usar; se reutiliza esa
// paleta, no se inventa una nueva.
const props = defineProps<{ abierto: boolean; titulo: string; subtitulo?: string }>()
const emit = defineEmits<{ cerrar: [] }>()

function onKeydown(evento: KeyboardEvent): void {
  if (evento.key === 'Escape' && props.abierto) emit('cerrar')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Transition name="drawer-transition">
    <div v-if="abierto" class="drawer-backdrop" @click.self="emit('cerrar')">
      <div class="drawer" role="dialog" aria-modal="true" :aria-label="titulo">
        <div class="drawer-head">
          <div>
            <h2>{{ titulo }}</h2>
            <p v-if="subtitulo">{{ subtitulo }}</p>
          </div>
          <button type="button" class="modal-close" aria-label="Cerrar" @click="emit('cerrar')">✕</button>
        </div>
        <div class="drawer-body">
          <slot />
        </div>
        <div v-if="$slots.foot" class="drawer-foot">
          <slot name="foot" />
        </div>
      </div>
    </div>
  </Transition>
</template>
