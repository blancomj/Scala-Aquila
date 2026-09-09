<script setup lang="ts">
// MANT-7 · Inspecciones, hallazgos y acciones correctivas. "Hallazgos abiertos" es la primera
// pestaña a propósito — es el panel de control vinculante del corte (mant_hallazgos_abiertos):
// una inspección sin seguimiento no debe poder desaparecer del radar.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const inspeccionesStore = useMantenimientoInspeccionesStore()
const route = useRoute()
const router = useRouter()

async function cargarTodo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    inspeccionesStore.cargarHallazgosAbiertos(tenantId),
    inspeccionesStore.cargarFormatos(tenantId),
    inspeccionesStore.cargarInspecciones(tenantId),
  ])
}
onMounted(cargarTodo)

type Tab = 'hallazgos' | 'inspecciones' | 'formatos'
const TABS: ReadonlyArray<{ id: Tab; etiqueta: string; slug: string }> = [
  { id: 'hallazgos', etiqueta: 'Hallazgos abiertos', slug: 'hallazgos' },
  { id: 'inspecciones', etiqueta: 'Inspecciones', slug: 'inspecciones' },
  { id: 'formatos', etiqueta: 'Formatos', slug: 'formatos' },
]
function tabDesdeHash(hash: string): Tab {
  const slug = hash.replace(/^#/, '')
  return TABS.find((t) => t.slug === slug)?.id ?? 'hallazgos'
}
const tabActiva = ref<Tab>('hallazgos')
onMounted(() => {
  const id = tabDesdeHash(route.hash)
  if (id !== tabActiva.value) tabActiva.value = id
})
watch(tabActiva, (id) => {
  const slug = TABS.find((t) => t.id === id)!.slug
  if (route.hash !== `#${slug}`) router.replace({ hash: `#${slug}` })
})

const nombreFormato = computed(
  () => new Map(inspeccionesStore.formatos.map((f) => [f.id, `${f.nombre} (v${f.version})`])),
)

// ── drawers ──
const drawerFormato = ref(false)
const formatoEditando = ref<
  Awaited<ReturnType<typeof inspeccionesStore.crearFormato>> | null
>(null)
const drawerInspeccion = ref(false)
const hallazgoAbiertoId = ref<string | null>(null)

function abrirNuevoFormato(): void {
  formatoEditando.value = null
  drawerFormato.value = true
}
function abrirEditarFormato(fila: NonNullable<typeof formatoEditando.value>): void {
  formatoEditando.value = fila
  drawerFormato.value = true
}
async function alGuardadoFormato(): Promise<void> {
  drawerFormato.value = false
  formatoEditando.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) await inspeccionesStore.cargarFormatos(tenantId)
}
async function alGuardadoInspeccion(): Promise<void> {
  drawerInspeccion.value = false
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) await cargarTodo()
}
async function alActualizadoHallazgo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) await inspeccionesStore.cargarHallazgosAbiertos(tenantId)
}

const severidadColor: Record<string, 'error' | 'warning' | 'neutral'> = {
  critico: 'error',
  mayor: 'warning',
  menor: 'neutral',
  observacion: 'neutral',
}
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Inspecciones</h1>
      </template>
      <template #descripcion>
        Checklists de inspección versionados, sus hallazgos y su rastro hasta el cierre
        verificado — un hallazgo sin seguimiento no debe poder perderse.
      </template>
    </UiTituloDescripcion>

    <nav
      class="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto"
      role="tablist"
      aria-label="Secciones de Inspecciones"
    >
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="tabActiva === tab.id"
        class="px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors"
        :class="
          tabActiva === tab.id
            ? 'border-primary text-primary font-medium'
            : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
        "
        @click="tabActiva = tab.id"
      >
        {{ tab.etiqueta }}
      </button>
    </nav>

    <div role="tabpanel">
      <!-- Hallazgos abiertos -->
      <div v-if="tabActiva === 'hallazgos'" class="space-y-3">
        <UiTabla
          :columnas="[
            { clave: 'severidad', etiqueta: 'Severidad' },
            { clave: 'descripcion', etiqueta: 'Hallazgo' },
            { clave: 'fecha_limite', etiqueta: 'Fecha límite' },
            { clave: 'dias_abierto', etiqueta: 'Días abierto', alinear: 'derecha' },
            { clave: 'acciones', etiqueta: '' },
          ]"
          :filas="inspeccionesStore.hallazgosAbiertos"
          :clave-fila="(h) => h.hallazgo_id"
          vacio="Sin hallazgos abiertos."
        >
          <template #celda-severidad="{ fila }">
            <UBadge :color="severidadColor[fila.severidad]" variant="soft" class="capitalize">{{
              fila.severidad
            }}</UBadge>
          </template>
          <template #celda-fecha_limite="{ fila }">
            <span v-if="fila.fecha_limite" :class="fila.vencido ? 'text-error font-medium' : ''">
              {{ new Date(`${fila.fecha_limite}T00:00:00`).toLocaleDateString('es-CO') }}
              <span v-if="fila.vencido">(vencido)</span>
            </span>
            <span v-else class="text-muted">—</span>
          </template>
          <template #celda-dias_abierto="{ fila }"
            ><span class="tabular-nums">{{ fila.dias_abierto }}</span></template
          >
          <template #celda-acciones="{ fila }">
            <UButton size="xs" variant="ghost" @click="hallazgoAbiertoId = fila.hallazgo_id"
              >Ver</UButton
            >
          </template>
        </UiTabla>
      </div>

      <!-- Inspecciones -->
      <div v-else-if="tabActiva === 'inspecciones'" class="space-y-3">
        <div class="flex justify-end">
          <UButton icon="i-lucide-plus" @click="drawerInspeccion = true">Ejecutar inspección</UButton>
        </div>
        <UiTabla
          :columnas="[
            { clave: 'fecha', etiqueta: 'Fecha' },
            { clave: 'formato', etiqueta: 'Formato' },
            { clave: 'resultado', etiqueta: 'Resultado' },
          ]"
          :filas="inspeccionesStore.inspecciones"
          :clave-fila="(i) => i.id"
          vacio="Sin inspecciones registradas."
        >
          <template #celda-fecha="{ fila }">{{
            new Date(`${fila.fecha}T00:00:00`).toLocaleDateString('es-CO')
          }}</template>
          <template #celda-formato="{ fila }">{{ nombreFormato.get(fila.formato_id) ?? '—' }}</template>
          <template #celda-resultado="{ fila }">
            <UBadge
              :color="fila.resultado === 'no_conforme' ? 'error' : fila.resultado === 'con_hallazgos' ? 'warning' : 'success'"
              variant="soft"
              class="capitalize"
              >{{ fila.resultado.replace('_', ' ') }}</UBadge
            >
          </template>
        </UiTabla>
      </div>

      <!-- Formatos -->
      <div v-else-if="tabActiva === 'formatos'" class="space-y-3">
        <div class="flex justify-end">
          <UButton icon="i-lucide-plus" @click="abrirNuevoFormato()">Nuevo formato</UButton>
        </div>
        <UiTabla
          :columnas="[
            { clave: 'nombre', etiqueta: 'Nombre' },
            { clave: 'version', etiqueta: 'Versión' },
            { clave: 'estado', etiqueta: 'Estado' },
            { clave: 'acciones', etiqueta: '' },
          ]"
          :filas="inspeccionesStore.formatos"
          :clave-fila="(f) => f.id"
          vacio="Sin formatos registrados."
        >
          <template #celda-version="{ fila }"
            ><span class="tabular-nums">v{{ fila.version }}</span></template
          >
          <template #celda-estado="{ fila }">
            <UBadge
              :color="fila.estado === 'vigente' ? 'success' : fila.estado === 'borrador' ? 'neutral' : 'neutral'"
              variant="soft"
              class="capitalize"
              >{{ fila.estado }}</UBadge
            >
          </template>
          <template #celda-acciones="{ fila }">
            <UButton size="xs" variant="ghost" @click="abrirEditarFormato(fila)">Ver</UButton>
          </template>
        </UiTabla>
      </div>
    </div>

    <MantenimientoInspeccionesFormatoDrawer
      v-if="drawerFormato"
      :formato="formatoEditando"
      @cerrar="drawerFormato = false"
      @guardado="alGuardadoFormato"
    />
    <MantenimientoInspeccionesInspeccionDrawer
      v-if="drawerInspeccion"
      @cerrar="drawerInspeccion = false"
      @guardado="alGuardadoInspeccion"
    />
    <MantenimientoInspeccionesHallazgoDrawer
      v-if="hallazgoAbiertoId"
      :hallazgo-id="hallazgoAbiertoId"
      @cerrar="hallazgoAbiertoId = null"
      @actualizado="alActualizadoHallazgo"
    />
  </div>
</template>
