<script setup lang="ts">
// Fondos (GAP-22, PLAN §4.3) — orquestador de pestañas, mismo patrón que
// presupuesto/index.vue: la pestaña activa vive en el hash de la URL (compartible, sobrevive a
// un refresh), arranca siempre en la pestaña por defecto también en el cliente (evita el
// hydration mismatch documentado ahí — el hash no viaja en la petición SSR).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const fondosStore = useFondosStore()
const route = useRoute()
const router = useRouter()

await useAsyncData('fondos', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  return fondosStore.cargarFondos(tenantId)
})

type Tab = 'fondos' | 'movimientos' | 'compromisos' | 'solicitudes'
const TABS: ReadonlyArray<{ id: Tab; etiqueta: string; slug: string }> = [
  { id: 'fondos', etiqueta: 'Fondos', slug: 'fondos' },
  { id: 'movimientos', etiqueta: 'Movimientos', slug: 'movimientos' },
  { id: 'compromisos', etiqueta: 'Compromisos', slug: 'compromisos' },
  { id: 'solicitudes', etiqueta: 'Solicitudes de uso', slug: 'solicitudes-de-uso' },
]

function tabDesdeHash(hash: string): Tab {
  const slug = hash.replace(/^#/, '')
  return TABS.find((t) => t.slug === slug)?.id ?? 'fondos'
}
const tabActiva = ref<Tab>('fondos')
onMounted(() => {
  const id = tabDesdeHash(route.hash)
  if (id !== tabActiva.value) tabActiva.value = id
})
watch(tabActiva, (id) => {
  const slug = TABS.find((t) => t.id === id)!.slug
  if (route.hash !== `#${slug}`) router.replace({ hash: `#${slug}` })
})
watch(
  () => route.hash,
  (hash) => {
    const id = tabDesdeHash(hash)
    if (id !== tabActiva.value) tabActiva.value = id
  },
)

const botonesTab = ref<(HTMLButtonElement | null)[]>([])
function irAPestana(indice: number): void {
  const tab = TABS[indice]
  if (!tab) return
  tabActiva.value = tab.id
  nextTick(() => botonesTab.value[indice]?.focus())
}
function onKeydownTab(evento: KeyboardEvent, indiceActual: number): void {
  switch (evento.key) {
    case 'ArrowRight':
      evento.preventDefault()
      irAPestana((indiceActual + 1) % TABS.length)
      break
    case 'ArrowLeft':
      evento.preventDefault()
      irAPestana((indiceActual - 1 + TABS.length) % TABS.length)
      break
    case 'Home':
      evento.preventDefault()
      irAPestana(0)
      break
    case 'End':
      evento.preventDefault()
      irAPestana(TABS.length - 1)
      break
  }
}
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 mt-1">
      <template #titulo>
        <h1 class="text-xl font-semibold">Fondos</h1>
      </template>
      <template #descripcion>
        Fondos de reserva de la copropiedad (Ley 675 art. 35/38): saldo, compromisos y
        solicitudes de uso.
      </template>
    </UiTituloDescripcion>

    <nav class="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto" role="tablist" aria-label="Secciones de Fondos">
      <button
        v-for="(tab, indice) in TABS"
        :key="tab.id"
        :ref="(el) => { botonesTab[indice] = el as HTMLButtonElement | null }"
        type="button"
        role="tab"
        :aria-selected="tabActiva === tab.id"
        :tabindex="tabActiva === tab.id ? 0 : -1"
        class="px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors"
        :class="
          tabActiva === tab.id
            ? 'border-primary text-primary font-medium'
            : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
        "
        @click="tabActiva = tab.id"
        @keydown="onKeydownTab($event, indice)"
      >
        {{ tab.etiqueta }}
      </button>
    </nav>

    <div role="tabpanel">
      <FondosTabDashboard v-if="tabActiva === 'fondos'" />
      <FondosTabMovimientos v-else-if="tabActiva === 'movimientos'" />
      <FondosTabCompromisos v-else-if="tabActiva === 'compromisos'" />
      <FondosTabSolicitudes v-else-if="tabActiva === 'solicitudes'" />
    </div>
  </div>
</template>
