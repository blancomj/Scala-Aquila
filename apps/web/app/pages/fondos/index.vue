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

// ── resumen (tarjetas, plegable) ─────────────────────────────────────────
// Mismo criterio que inmuebles/index.vue: cookie (no localStorage, para evitar el hydration
// mismatch del primer render en servidor) y misma posición (bajo el título, antes del contenido).
const resumenExpandido = useCookie<boolean>('fondos-resumen-expandido', { default: () => true })

function formatoPct(valor: number): string {
  return `${valor.toFixed(1)}%`
}

const resumen = computed(() => {
  const porEstado = new Map<string, number>()
  let saldoTotal = 0
  let disponibleTotal = 0
  let comprometidoTotal = 0
  for (const fondo of fondosStore.fondos) {
    porEstado.set(fondo.estado, (porEstado.get(fondo.estado) ?? 0) + 1)
    const saldos = fondosStore.saldosPorFondo[fondo.id] ?? { saldo: 0, comprometido: 0, disponible: 0 }
    saldoTotal += saldos.saldo
    disponibleTotal += saldos.disponible
    comprometidoTotal += saldos.comprometido
  }
  return {
    total: fondosStore.fondos.length,
    porEstado,
    saldoTotal,
    disponibleTotal,
    comprometidoTotal,
    pctDisponible: saldoTotal > 0 ? (disponibleTotal / saldoTotal) * 100 : 0,
    pctComprometido: saldoTotal > 0 ? (comprometidoTotal / saldoTotal) * 100 : 0,
  }
})

/** "4 activos · 1 en cierre · 1 cerrado" — solo estados con al menos un fondo, en un orden fijo
 * (el operativo primero: activo/en_cierre/suspendido/agotado antes que los previos a activar o
 * los terminales). */
const ORDEN_DESGLOSE_ESTADO_FONDO = [
  'activo',
  'en_cierre',
  'suspendido',
  'agotado',
  'pendiente_autorizacion',
  'propuesto',
  'cerrado',
  'cancelado',
] as const
const desgloseEstadosFondo = computed(() =>
  ORDEN_DESGLOSE_ESTADO_FONDO.map((estado) => {
    const cantidad = resumen.value.porEstado.get(estado) ?? 0
    if (cantidad === 0) return null
    const etiqueta =
      cantidad === 1
        ? (ETIQUETA_ESTADO_FONDO[estado] ?? estado).toLowerCase()
        : (ETIQUETA_ESTADO_FONDO_PLURAL[estado] ?? estado)
    return `${cantidad} ${etiqueta}`
  })
    .filter((texto): texto is string => texto !== null)
    .join(' · '),
)

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
    <div>
      <h1 class="text-xl font-semibold mb-2">Fondos</h1>
      <p class="text-sm text-neutral-500 flex items-center gap-2 flex-wrap">
        Fondos de reserva de la copropiedad (Ley 675 art. 35/38): saldo, compromisos y
        solicitudes de uso.
        <button
          type="button"
          class="flex items-center gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300"
          @click="resumenExpandido = !resumenExpandido"
        >
          <UIcon :name="resumenExpandido ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" />
          {{ resumenExpandido ? 'Cerrar resumen' : 'Ver resumen' }}
        </button>
      </p>
    </div>

    <div v-if="resumenExpandido" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <p class="text-sm text-neutral-500">Total de fondos</p>
          <p class="text-2xl font-semibold">{{ resumen.total }}</p>
          <p class="mt-1 text-xs text-neutral-400">{{ desgloseEstadosFondo || '—' }}</p>
        </div>
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-600 dark:bg-success-950 dark:text-success-400">
          <UIcon name="i-lucide-layers" class="h-5 w-5" />
        </span>
      </div>
      <div class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <p class="text-sm text-neutral-500">Saldo total</p>
          <p class="text-2xl font-semibold">{{ formatoMoneda(resumen.saldoTotal) }}</p>
          <p class="mt-1 text-xs text-neutral-400">100% del total</p>
        </div>
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-400">
          <UIcon name="i-lucide-wallet" class="h-5 w-5" />
        </span>
      </div>
      <div class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <p class="text-sm text-neutral-500">Saldo disponible</p>
          <p class="text-2xl font-semibold">{{ formatoMoneda(resumen.disponibleTotal) }}</p>
          <p class="mt-1 text-xs text-neutral-400">{{ formatoPct(resumen.pctDisponible) }} del total</p>
        </div>
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-50 text-warning-600 dark:bg-warning-950 dark:text-warning-400">
          <UIcon name="i-lucide-lock" class="h-5 w-5" />
        </span>
      </div>
      <div class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <p class="text-sm text-neutral-500">Saldo comprometido</p>
          <p class="text-2xl font-semibold">{{ formatoMoneda(resumen.comprometidoTotal) }}</p>
          <p class="mt-1 text-xs text-neutral-400">{{ formatoPct(resumen.pctComprometido) }} del total</p>
        </div>
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400">
          <UIcon name="i-lucide-bar-chart-3" class="h-5 w-5" />
        </span>
      </div>
    </div>

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
