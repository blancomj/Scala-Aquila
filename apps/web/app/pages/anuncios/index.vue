<script setup lang="ts">
// EXS-3 · Anuncios y comunicación oficial.
//
// Dos vistas de lo mismo, y la primera es deliberada: "Para mí" antes que
// "Gestión". La mayoría de las veces que alguien entra aquí es para leer lo
// que le comunicaron, no para redactar — y los que requieren confirmación
// van arriba del todo porque son los únicos que piden una acción.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const anunciosStore = useAnunciosStore()
const catalogosStore = useCatalogosStore()

type Tab = 'para-mi' | 'gestion'
const TABS: ReadonlyArray<{ id: Tab; etiqueta: string }> = [
  { id: 'para-mi', etiqueta: 'Para mí' },
  { id: 'gestion', etiqueta: 'Gestión' },
]
const tabActiva = ref<Tab>('para-mi')

const categorias = ref<{ id: number; codigo: string; nombre: string }[]>([])
const prioridades = ref<{ id: number; codigo: string; nombre: string }[]>([])

async function cargarTodo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await anunciosStore.cargar(tenantId)
  // cargarValores trae el catálogo entero (globales + los del tenant) en una
  // consulta; filtrar aquí evita dos viajes más por familia.
  const valores = await catalogosStore.cargarValores(tenantId)
  categorias.value = valores
    .filter((v) => v.tipo === 'CATEGORIA_ANUNCIO')
    .map((v) => ({ id: v.id, codigo: v.codigo, nombre: v.nombre }))
  prioridades.value = valores
    .filter((v) => v.tipo === 'PRIORIDAD_ANUNCIO')
    .map((v) => ({ id: v.id, codigo: v.codigo, nombre: v.nombre }))
}
onMounted(cargarTodo)
watch(() => tenantStore.activeTenant?.id, cargarTodo)

// ── Para mí: solo lo publicado y vigente ──
const vigentes = computed(() =>
  anunciosStore.anuncios
    .filter((a) => a.estado === 'publicado')
    .filter((a) => !a.vigenteHasta || new Date(a.vigenteHasta) >= new Date())
    // Los que piden confirmación primero; luego no leídos; luego por fecha.
    .sort((a, b) => {
      const pendienteA = a.requiereConfirmacion && !a.confirmado ? 0 : 1
      const pendienteB = b.requiereConfirmacion && !b.confirmado ? 0 : 1
      if (pendienteA !== pendienteB) return pendienteA - pendienteB
      if (a.leido !== b.leido) return a.leido ? 1 : -1
      return (b.publicadoAt ?? '').localeCompare(a.publicadoAt ?? '')
    }),
)

const sinLeer = computed(() => vigentes.value.filter((a) => !a.leido).length)

// ── Gestión ──
const filtroEstado = ref<string>('todos')
const gestion = computed(() =>
  filtroEstado.value === 'todos'
    ? anunciosStore.anuncios
    : anunciosStore.anuncios.filter((a) => a.estado === filtroEstado.value),
)

// Nuxt UI v4 rechaza un <SelectItem> con value vacío ("must have a value
// prop that is not an empty string"), así que el "sin filtro" viaja como
// centinela — mismo patrón que fundamentos/index.vue.
const SENTINEL_TODOS = 'todos'
const ESTADOS = [
  { value: SENTINEL_TODOS, label: 'Todos los estados' },
  { value: 'borrador', label: 'Borrador' },
  { value: 'pendiente_revision', label: 'Pendiente de revisión' },
  { value: 'aprobado', label: 'Aprobado' },
  { value: 'programado', label: 'Programado' },
  { value: 'publicado', label: 'Publicado' },
  { value: 'rechazado', label: 'Rechazado' },
  { value: 'archivado', label: 'Archivado' },
  { value: 'cancelado', label: 'Cancelado' },
]

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: 'Borrador',
  pendiente_revision: 'Pendiente de revisión',
  aprobado: 'Aprobado',
  programado: 'Programado',
  publicado: 'Publicado',
  rechazado: 'Rechazado',
  archivado: 'Archivado',
  cancelado: 'Cancelado',
}

const CLASE_ESTADO: Record<string, string> = {
  borrador: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  pendiente_revision: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  aprobado: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  programado: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  publicado: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  rechazado: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  archivado: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  cancelado: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
}

// ── Crear ──
const drawerAbierto = ref(false)
const guardando = ref(false)
const nuevo = ref({
  titulo: '',
  resumen: '',
  contenido: '',
  categoriaId: 0,
  prioridadId: 0,
  requiereConfirmacion: false,
  vigenteHasta: '',
})

function abrirCrear(): void {
  nuevo.value = {
    titulo: '',
    resumen: '',
    contenido: '',
    categoriaId: categorias.value[0]?.id ?? 0,
    prioridadId: prioridades.value.find((p) => p.codigo === 'normal')?.id ?? prioridades.value[0]?.id ?? 0,
    requiereConfirmacion: false,
    vigenteHasta: '',
  }
  drawerAbierto.value = true
}

const puedeGuardar = computed(
  () =>
    nuevo.value.titulo.trim().length > 0 &&
    nuevo.value.contenido.trim().length > 0 &&
    nuevo.value.categoriaId > 0 &&
    nuevo.value.prioridadId > 0,
)

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !puedeGuardar.value) return
  guardando.value = true
  try {
    const id = await anunciosStore.crear({
      tenantId,
      categoriaId: nuevo.value.categoriaId,
      prioridadId: nuevo.value.prioridadId,
      titulo: nuevo.value.titulo.trim(),
      resumen: nuevo.value.resumen.trim() || null,
      contenido: nuevo.value.contenido.trim(),
      requiereConfirmacion: nuevo.value.requiereConfirmacion,
      vigenteHasta: nuevo.value.vigenteHasta || null,
    })
    if (id) {
      drawerAbierto.value = false
      await navigateTo(`/anuncios/${id}`)
    }
  } finally {
    guardando.value = false
  }
}

function fecha(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('es-CO', { dateStyle: 'medium' }) : '—'
}
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Anuncios</h1>
      </template>
      <template #descripcion>
        Las comunicaciones oficiales de la copropiedad: qué se informó, a quién iba dirigido,
        desde cuándo está vigente y quién ya lo leyó. Un anuncio publicado no se edita —
        se archiva y se publica uno nuevo, para que el histórico siga siendo evidencia.
      </template>
    </UiTituloDescripcion>

    <nav
      class="flex gap-1 border-b border-neutral-200 dark:border-neutral-800"
      role="tablist"
      aria-label="Secciones de Anuncios"
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
        <span
          v-if="tab.id === 'para-mi' && sinLeer > 0"
          class="ml-1.5 px-1.5 py-0.5 rounded-full bg-primary text-white text-[10px]"
        >{{ sinLeer }}</span>
      </button>
    </nav>

    <p v-if="anunciosStore.error" class="text-sm text-red-600 dark:text-red-400">
      {{ anunciosStore.error }}
    </p>

    <!-- ── Para mí ── -->
    <div v-if="tabActiva === 'para-mi'" role="tabpanel" class="space-y-3">
      <p v-if="vigentes.length === 0" class="text-sm text-neutral-500 py-8 text-center">
        No hay comunicaciones vigentes.
      </p>
      <NuxtLink
        v-for="a in vigentes"
        :key="a.id"
        :to="`/anuncios/${a.id}`"
        class="block rounded-lg border p-4 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
        :class="
          a.leido
            ? 'border-neutral-200 dark:border-neutral-800'
            : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900'
        "
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm" :class="a.leido ? 'text-neutral-600 dark:text-neutral-400' : 'font-medium'">
              {{ a.titulo }}
            </p>
            <p v-if="a.resumen" class="text-xs text-neutral-500 mt-1">{{ a.resumen }}</p>
            <p class="text-xs text-neutral-400 mt-1.5">
              {{ a.categoria }} · {{ fecha(a.publicadoAt) }}
              <span v-if="a.referencia"> · {{ a.referencia }}</span>
            </p>
          </div>
          <span
            v-if="a.requiereConfirmacion && !a.confirmado"
            class="shrink-0 px-2 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
          >
            Requiere confirmación
          </span>
          <span
            v-else-if="!a.leido"
            class="shrink-0 px-2 py-0.5 rounded-full text-[11px] bg-primary/10 text-primary"
          >
            Nuevo
          </span>
        </div>
      </NuxtLink>
    </div>

    <!-- ── Gestión ── -->
    <div v-else role="tabpanel" class="space-y-3">
      <div class="flex items-center gap-3">
        <USelect v-model="filtroEstado" :items="ESTADOS" class="w-56" />
        <div class="flex-1" />
        <UButton icon="i-lucide-plus" size="xs" @click="abrirCrear">Nuevo anuncio</UButton>
      </div>

      <UiTabla
        :columnas="[
          { clave: 'titulo', etiqueta: 'Anuncio' },
          { clave: 'referencia', etiqueta: 'Referencia' },
          { clave: 'categoria', etiqueta: 'Categoría' },
          { clave: 'estado', etiqueta: 'Estado' },
          { clave: 'publicado', etiqueta: 'Publicado' },
        ]"
        :filas="gestion"
        :clave-fila="(a) => a.id"
        vacio="Todavía no hay anuncios."
      >
        <template #celda-titulo="{ fila }">
          <NuxtLink :to="`/anuncios/${fila.id}`" class="text-primary hover:underline">
            {{ fila.titulo }}
          </NuxtLink>
        </template>
        <template #celda-referencia="{ fila }">
          <span class="font-mono text-xs">{{ fila.referencia ?? '—' }}</span>
        </template>
        <template #celda-categoria="{ fila }">{{ fila.categoria }}</template>
        <template #celda-estado="{ fila }">
          <span class="px-2 py-0.5 rounded-full text-[11px]" :class="CLASE_ESTADO[fila.estado]">
            {{ ETIQUETA_ESTADO[fila.estado] }}
          </span>
        </template>
        <template #celda-publicado="{ fila }">{{ fecha(fila.publicadoAt) }}</template>
      </UiTabla>
    </div>

    <UiDrawer :abierto="drawerAbierto" titulo="Nuevo anuncio" @cerrar="drawerAbierto = false">
      <div class="space-y-4">
        <UFormField label="Título" required>
          <UInput v-model="nuevo.titulo" placeholder="Corte de agua programado" class="w-full" />
        </UFormField>

        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Categoría" required>
            <USelect
              v-model="nuevo.categoriaId"
              :items="categorias.map((c) => ({ value: c.id, label: c.nombre }))"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Prioridad" required>
            <USelect
              v-model="nuevo.prioridadId"
              :items="prioridades.map((p) => ({ value: p.id, label: p.nombre }))"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField label="Resumen" hint="Una línea; es lo que se ve en el listado y en la campana">
          <UInput v-model="nuevo.resumen" class="w-full" />
        </UFormField>

        <UFormField label="Contenido" required>
          <UTextarea v-model="nuevo.contenido" :rows="8" class="w-full" />
        </UFormField>

        <UFormField label="Vigente hasta" hint="Opcional: al pasar esta fecha deja de listarse como vigente, sin borrarse">
          <UInput v-model="nuevo.vigenteHasta" type="date" class="w-full" />
        </UFormField>

        <UCheckbox v-model="nuevo.requiereConfirmacion" label="Requiere confirmación de lectura" />
        <p class="text-xs text-neutral-500 -mt-2">
          Abrir el anuncio no cuenta como confirmar: quien lo lea deberá confirmarlo explícitamente.
        </p>

        <p v-if="anunciosStore.error" class="text-sm text-red-600 dark:text-red-400">
          {{ anunciosStore.error }}
        </p>
      </div>

      <template #foot>
        <UButton variant="ghost" @click="drawerAbierto = false">Cancelar</UButton>
        <UButton :disabled="!puedeGuardar || guardando" :loading="guardando" @click="guardar">
          Crear borrador
        </UButton>
      </template>
    </UiDrawer>
  </div>
</template>
