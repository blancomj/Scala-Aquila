<script setup lang="ts">
// Rediseño de Presupuesto — orquestador delgado de pestañas (ver mockup
// discutido + PLAN aprobado). Mismo patrón estructural que
// components/inmuebles/InmuebleFicha.vue (TABS + tabActiva + nav de
// botones + v-if/v-else-if por pestaña, cada una delegada a su propio
// componente) — pero en Tailwind/Nuxt UI, el estilo que esta página (y
// coeficientes/usuarios) ya usaba antes de este cambio, no el sistema
// legacy .ficha-inmueble/.tabs de InmuebleFicha (ese es otro subsistema
// de diseño, usado solo por fichas/drawers — ver UiDrawer.vue).
//
// "Periodos y vigencia" y "Control y validaciones" pasaron a páginas
// propias del sidebar (ver utils/navegacion.ts). "Conceptos" también
// salió de estas pestañas — ahora vive en /estado-cuenta/conceptos
// (components/conceptos/ConceptosCatalogo.vue), porque el catálogo
// alimenta cuenta corriente/novedades, no solo presupuesto.
//
// Rediseño "Libro Presupuestal" (mockup aprobado): "Catálogo de cuentas" y
// "Componentes presupuestales" —dos pestañas casi idénticas sobre el mismo
// árbol— se fusionaron en "Plan de cuentas" (PresupuestoTabPlanCuentas.vue,
// con su propio toggle Ver montos/Editar estructura). "Fuentes de
// financiación" salió de "Aplicación de bases" (ahora "Simulación de
// cobro") a su propia pestaña — no son la misma acción. Se agregó el
// rastreador de ciclo bajo el encabezado y el badge de estado junto al
// selector, para que el usuario sepa en qué punto del ciclo presupuestal
// está sin tener que adivinar leyendo tablas.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()
const fundamentoStore = useFundamentoNormativoStore()
const route = useRoute()
const router = useRouter()

// `watch: [...]`: activeTenant puede no estar resuelto en el instante exacto
// de este setup en la carga en frío — la opción reintenta sola en cuanto el
// id esté disponible (mismo espíritu que configuracion/ia.vue).
await useAsyncData(
  'presupuestos',
  async () => {
    const tenantId = tenantStore.activeTenant?.id
    if (!tenantId) return []
    const [presupuestos] = await Promise.all([
      presupuestoStore.cargarPresupuestos(tenantId),
      presupuestoStore.cargarCuentas(tenantId),
      fundamentoStore.cargarFundamentos(),
    ])
    return presupuestos
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)

const presupuestoSeleccionadoId = useSeleccionPresupuesto()

const presupuestoSeleccionado = computed(
  () => presupuestoStore.presupuestos.find((p) => p.id === presupuestoSeleccionadoId.value) ?? null,
)

// ── pestañas ─────────────────────────────────────────────────────────
// "Periodos y vigencia" y "Control y validaciones" pasaron a ser páginas
// propias del sidebar (/presupuesto/periodos, /presupuesto/control) — ya
// no son pestañas de este orquestador (ver utils/navegacion.ts).
type Tab = 'presupuestos' | 'cuentas' | 'fuentes' | 'ejecucion' | 'distribucion' | 'simulacion'
const TABS: ReadonlyArray<{ id: Tab; etiqueta: string; slug: string }> = [
  { id: 'presupuestos', etiqueta: 'Presupuestos', slug: 'presupuestos' },
  { id: 'cuentas', etiqueta: 'Plan de cuentas', slug: 'plan-de-cuentas' },
  { id: 'fuentes', etiqueta: 'Fuentes de financiación', slug: 'fuentes-de-financiacion' },
  { id: 'ejecucion', etiqueta: 'Ejecución presupuestal', slug: 'ejecucion-presupuestal' },
  { id: 'distribucion', etiqueta: 'Coeficientes', slug: 'coeficientes' },
  { id: 'simulacion', etiqueta: 'Simulación de cobro', slug: 'simulacion-de-cobro' },
]

// La pestaña activa vive en el hash de la URL — compartible y sobrevive a
// un refresh (antes se perdía siempre al recargar).
function tabDesdeHash(hash: string): Tab {
  const slug = hash.replace(/^#/, '')
  return TABS.find((t) => t.slug === slug)?.id ?? 'presupuestos'
}
// Arranca SIEMPRE en la pestaña por defecto, también en el cliente: el fragmento (#hash) de
// una URL no viaja en la petición HTTP, así que en SSR `route.hash` está vacío. Inicializar
// tabActiva desde él hacía que el servidor renderizara una pestaña y el cliente otra —
// hydration mismatch, tras el cual Vue sigue parcheando contra el DOM que ya no corresponde a
// su árbol virtual y la pantalla queda descuadrada (la cáscara de una pestaña con el contenido
// de otra dentro). La sincronización con el hash ocurre ya montado, abajo, solo en cliente.
const tabActiva = ref<Tab>('presupuestos')
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

// ── rastreador de ciclo — necesita rubros/fuentes del presupuesto seleccionado, además de lo
// que cada pestaña ya carga por su cuenta (mismo criterio de recarga que cargarCuentas). ──
watch(
  presupuestoSeleccionadoId,
  async (id) => {
    if (id) await Promise.all([presupuestoStore.cargarRubros(id), presupuestoStore.cargarFuentesFinanciacion(id)])
  },
  { immediate: true },
)

// Navegación por teclado del tablist (WAI-ARIA APG, patrón de activación automática, igual
// criterio que el click existente): con tabindex itinerante (0 en la activa, -1 en el resto) el
// tablist necesita mover el foco él mismo con flechas/Home/End, si no Tab salta directo del
// primer botón al contenido y las otras 5 pestañas quedan inalcanzables sin mouse.
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

const cuentaPorId = computed(() => new Map(presupuestoStore.cuentas.map((c) => [c.id, c])))
const sumaEgresos = computed(() =>
  presupuestoStore.rubros
    .filter((r) => cuentaPorId.value.get(r.cuenta_id)?.naturaleza === 'egreso')
    .reduce((acc, r) => acc + Number(r.monto_anual), 0),
)
const montoTotal = computed(() => (presupuestoSeleccionado.value ? Number(presupuestoSeleccionado.value.monto_total) : 0))
const rubrosCuadran = computed(() => sumaEgresos.value === montoTotal.value)
const sumaFuentesAplicadas = computed(() =>
  presupuestoStore.fuentes.reduce((acc, f) => acc + Number(f.valor_aplicado), 0),
)

</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 mt-1">
        <template #titulo>
          <h1 class="text-xl font-semibold">Presupuesto</h1>
        </template>
        <template #descripcion>
          Presupuestos, rubros, fuentes de financiación y su reparto entre unidades.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-end gap-3">
        <UBadge
          v-if="presupuestoSeleccionado"
          :color="COLOR_ESTADO_PRESUPUESTO[presupuestoSeleccionado.estado] ?? 'neutral'"
          variant="subtle"
          class="mb-1.5"
        >
          {{ ETIQUETA_ESTADO_PRESUPUESTO[presupuestoSeleccionado.estado] ?? presupuestoSeleccionado.estado }}
        </UBadge>
        <PresupuestoSelector
          v-if="presupuestoStore.presupuestos.length > 0"
          v-model="presupuestoSeleccionadoId"
        />
      </div>
    </div>

    <!-- El texto informa que falta el primer presupuesto, pero la pestaña
         "Presupuestos" (con su botón "Nuevo presupuesto", siempre visible en
         PresupuestoTabPresupuestos.vue) tiene que seguir alcanzable — antes
         vivía dentro de un v-else de este mismo estado vacío, dejando a un
         tenant nuevo sin ninguna forma de crear el primer presupuesto. -->
    <p v-if="presupuestoStore.presupuestos.length === 0" class="text-neutral-500 text-sm">
      Esta copropiedad todavía no tiene un presupuesto registrado.
      <UButton size="sm" variant="link" class="p-0 h-auto" @click="tabActiva = 'presupuestos'">
        Créalo en la pestaña "Presupuestos"
      </UButton>
    </p>

    <!-- ── rastreador de ciclo ──────────────────────────────────────── -->
    <div
      v-if="presupuestoSeleccionado"
      class="grid grid-cols-1 sm:grid-cols-4 gap-px rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden mb-2"
    >
      <div class="bg-white dark:bg-neutral-950 px-4 py-2.5">
        <p class="text-xs uppercase tracking-wide text-neutral-400">1 · Total definido</p>
        <p class="text-sm font-medium flex items-center gap-1.5">
          <span class="text-success-600">✓</span>
          <span class="tabular-nums">{{ formatoMoneda(montoTotal) }}</span>
        </p>
      </div>
      <div class="bg-white dark:bg-neutral-950 px-4 py-2.5">
        <p class="text-xs uppercase tracking-wide text-neutral-400">2 · Rubros asignados</p>
        <p class="text-sm font-medium flex items-center gap-1.5" :class="rubrosCuadran ? 'text-success-600' : 'text-warning-600'">
          <span>{{ rubrosCuadran ? '✓' : '…' }}</span>
          <span class="tabular-nums">{{ formatoMoneda(sumaEgresos) }} de {{ formatoMoneda(montoTotal) }}</span>
        </p>
      </div>
      <div class="bg-white dark:bg-neutral-950 px-4 py-2.5">
        <p class="text-xs uppercase tracking-wide text-neutral-400">3 · Fuentes registradas</p>
        <p class="text-sm font-medium flex items-center gap-1.5" :class="presupuestoStore.fuentes.length > 0 ? 'text-success-600' : 'text-neutral-400'">
          <span>{{ presupuestoStore.fuentes.length > 0 ? '✓' : '—' }}</span>
          <span class="tabular-nums">
            {{ presupuestoStore.fuentes.length }} {{ presupuestoStore.fuentes.length === 1 ? 'fuente' : 'fuentes' }}
            · {{ formatoMoneda(sumaFuentesAplicadas) }}
          </span>
        </p>
      </div>
      <div class="bg-white dark:bg-neutral-950 px-4 py-2.5">
        <p class="text-xs uppercase tracking-wide text-neutral-400">4 · Listo para activar</p>
        <p
          class="text-sm font-medium flex items-center gap-1.5"
          :class="presupuestoSeleccionado.estado !== 'borrador' ? 'text-success-600' : rubrosCuadran ? 'text-warning-600' : 'text-neutral-400'"
        >
          <span>{{ presupuestoSeleccionado.estado !== 'borrador' ? '✓' : rubrosCuadran ? '…' : '✕' }}</span>
          <span>
            <template v-if="presupuestoSeleccionado.estado !== 'borrador'">Ya activado</template>
            <template v-else-if="rubrosCuadran">
              Listo —
              <button type="button" class="underline hover:no-underline" @click="tabActiva = 'presupuestos'">
                actívalo en "Presupuestos"
              </button>
            </template>
            <template v-else>Faltan rubros por cuadrar</template>
          </span>
        </p>
      </div>
    </div>

    <nav class="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto" role="tablist" aria-label="Secciones de Presupuesto">
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
      <PresupuestoTabPresupuestos
        v-if="tabActiva === 'presupuestos'"
        v-model:presupuesto-id="presupuestoSeleccionadoId"
      />
      <PresupuestoTabPlanCuentas v-else-if="tabActiva === 'cuentas'" :presupuesto-id="presupuestoSeleccionadoId" />
      <PresupuestoTabFuentes v-else-if="tabActiva === 'fuentes'" :presupuesto-id="presupuestoSeleccionadoId" />
      <PresupuestoTabEjecucion
        v-else-if="tabActiva === 'ejecucion'"
        :presupuesto-id="presupuestoSeleccionadoId"
      />
      <CoeficientesPanel v-else-if="tabActiva === 'distribucion'" />
      <PresupuestoTabSimulacion v-else-if="tabActiva === 'simulacion'" :presupuesto-id="presupuestoSeleccionadoId" />
    </div>
  </div>
</template>
