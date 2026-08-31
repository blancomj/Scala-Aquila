<script setup lang="ts">
// Título + descripción colapsable. Muchas pantallas llevan un párrafo
// explicativo justo debajo del título que, cuando es largo, hace la pantalla
// verse cargada. Este componente mide el ancho NATURAL (sin wrap) del texto
// contra 1/4 del ancho del contenedor: si lo excede —ya sea porque envuelve a
// varias líneas o porque una sola línea es demasiado ancha— la descripción
// arranca oculta detrás de un chevron con tooltip "Descripción"; si no lo
// excede, se muestra igual que antes, sin chevron. La medición es real (no
// un umbral de caracteres) para que se adapte a cualquier ancho de pantalla.
const props = withDefaults(
  defineProps<{
    /** Clases del párrafo de descripción — se puede ajustar por página si el
     * diseño existente usaba un tamaño o color distinto al default. */
    claseDescripcion?: string
  }>(),
  { claseDescripcion: 'text-sm text-muted mt-1 max-w-3xl' },
)

const contenedorRef = ref<HTMLElement | null>(null)
const medidorRef = ref<HTMLElement | null>(null)
const colapsable = ref(false)
const expandido = ref(false)

function medir(): void {
  const contenedor = contenedorRef.value
  const medidor = medidorRef.value
  if (!contenedor || !medidor) return
  colapsable.value = medidor.scrollWidth > contenedor.clientWidth / 4
  // Siempre arranca colapsada — si una re-medición (resize) la vuelve
  // colapsable, no se abre sola; si deja de serlo, ya no hay nada que ocultar.
  if (!colapsable.value) expandido.value = false
}

let resizeObserver: ResizeObserver | undefined

onMounted(async () => {
  medir()
  if (contenedorRef.value && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => medir())
    resizeObserver.observe(contenedorRef.value)
  }
  // La medición del mount puede quedar corta: el contenedor es un flex-item
  // en varias pantallas (comparte fila con un botón u otro hermano) y su
  // ancho final, o el de la fuente web, a veces no está resuelto todavía en
  // ese primer tick. Re-medir tras el próximo repaint y cuando la fuente
  // termine de cargar cubre ambos casos sin depender de que algo dispare el
  // ResizeObserver por su cuenta.
  await nextTick()
  requestAnimationFrame(medir)
  void document.fonts?.ready?.then(medir)
})

onUnmounted(() => resizeObserver?.disconnect())
</script>

<template>
  <div ref="contenedorRef">
    <div class="inline-flex items-start gap-1">
      <slot name="titulo" />
      <UTooltip v-if="colapsable" text="Descripción">
        <button
          type="button"
          class="mt-0.5 shrink-0 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          :aria-label="expandido ? 'Ocultar descripción' : 'Mostrar descripción'"
          :aria-expanded="expandido"
          @click="expandido = !expandido"
        >
          <UIcon :name="expandido ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
        </button>
      </UTooltip>
    </div>
    <p v-if="!colapsable || expandido" :class="props.claseDescripcion">
      <slot name="descripcion" />
    </p>
    <!-- Clon fuera de flujo (invisible, sin wrap) solo para medir el ancho
         natural del texto — nunca se muestra. -->
    <span ref="medidorRef" aria-hidden="true" class="invisible absolute -z-10 whitespace-nowrap" :class="props.claseDescripcion" style="left: -9999px; top: -9999px">
      <slot name="descripcion" />
    </span>
  </div>
</template>
