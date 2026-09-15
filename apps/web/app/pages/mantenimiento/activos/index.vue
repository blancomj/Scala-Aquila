<script setup lang="ts">
// Mantenimiento → Activos, Registro Maestro (Fase 1) + Crear/Editar (Fase 2) de
// PROMPT_IMPLEMENTACION_MANTENIMIENTO_ACTIVOS_AQUILA.md (D-88). Reemplaza la
// lista mínima de MANT-1 (§3.7, "MANT-0 no construyó esta pantalla") por el
// registro completo: KPIs, búsqueda, filtros combinables, tabla paginada,
// creación y edición de la ficha maestra.
//
// Cambio de estado/capitalizar/dar de baja/QR siguen para Fase 4 (operaciones
// de dominio) — esas usan funciones transaccionales que todavía no tienen UI.
import type { Database } from '@aquila/shared'
import type { ActivoListado } from '~/stores/activos'

type ActivoRow = Database['public']['Tables']['activos']['Row']

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const activosStore = useActivosStore()
const depreciacionDefaultStore = useDepreciacionDefaultStore()
// Fase 6 (D-94): "permisos" — un auditor tiene `data:read` (por eso llega a esta pantalla, ver
// `definePageMeta` abajo) pero no `data:create`/`data:update`; ocultar los botones de escritura
// evita que confíe en un control que la RLS igual rechazaría (mismo criterio que
// FondosTabMovimientos.vue).
const puedeEscribir = computed(() => tenantStore.puede('data:create'))

const tiposActivo = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const categoriasActivo = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])

// Fase 6 (D-94): "manejo de errores" — antes, un fallo de red/RLS dejaba la tabla en su
// estado vacío ("Todavía no hay activos registrados"), indistinguible de un tenant real sin
// activos. Ahora se muestra el motivo y "Actualizar" sirve de reintento.
const errorCarga = ref<string | null>(null)
async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  try {
    await Promise.all([
      activosStore.cargarActivos(tenantId),
      activosStore.cargarListado(tenantId),
      cargarListaTipos(tenantId, 'TIPO_ACTIVO').then((d) => { tiposActivo.value = d }),
      cargarListaTipos(tenantId, 'CATEGORIA_ACTIVO').then((d) => { categoriasActivo.value = d }),
      depreciacionDefaultStore.cargarDefaults(tenantId),
    ])
  } catch (excepcion) {
    errorCarga.value = mensajeError(excepcion, 'No se pudo cargar el registro de activos.')
  }
}
onMounted(cargar)

const cargando = computed(() => activosStore.loading || activosStore.cargandoListado)

// ── Vista combinada: mant_activos_listado (nombres resueltos, criticidad,
//    valor neto, fechas de mantenimiento) + la fila cruda de `activos`
//    (marca/modelo/serial/fabricante/descripción/clasificación) — dos
//    orígenes ya cargados, un simple cruce por id, no un cálculo nuevo. ──
interface FilaActivo extends ActivoListado {
  marca: string | null
  modelo: string | null
  numeroSerie: string | null
  descripcion: string | null
  fabricante: string | null
  naturalezaBien: string | null
  origen: string | null
  categoriaId: number | null
  tipoId: number | null
}

const filas = computed<FilaActivo[]>(() => {
  const crudosPorId = new Map(activosStore.activos.map((a) => [a.id, a]))
  return activosStore.listado.map((l) => {
    const crudo = crudosPorId.get(l.id)
    return {
      ...l,
      marca: crudo?.marca ?? null,
      modelo: crudo?.modelo ?? null,
      numeroSerie: crudo?.numero_serie ?? null,
      descripcion: crudo?.descripcion ?? null,
      fabricante: crudo?.fabricante ?? null,
      naturalezaBien: crudo?.naturaleza_bien ?? null,
      origen: crudo?.origen ?? null,
      categoriaId: crudo?.categoria_id ?? null,
      tipoId: crudo?.tipo_id ?? null,
    }
  })
})

// ── KPIs (§8.2) — sobre el total, no sobre el filtro activo ──────────────
const totalActivos = computed(() => filas.value.length)
const enServicio = computed(() => filas.value.filter((f) => f.estado === 'en_servicio').length)
const enMantenimiento = computed(() => filas.value.filter((f) => f.estado === 'en_mantenimiento').length)
const fueraDeServicio = computed(() => filas.value.filter((f) => f.estado === 'fuera_de_servicio').length)
const capitalizados = computed(() => filas.value.filter((f) => f.capitalizado).length)
// "Por vencer": vida útil restante calculada por mant_activos_listado, <= 12 meses.
const vidaUtilPorVencer = computed(
  () => filas.value.filter((f) => f.vida_util_restante_meses !== null && f.vida_util_restante_meses <= 12).length,
)
function pctDelTotal(n: number): number {
  return totalActivos.value > 0 ? Math.round((n / totalActivos.value) * 100) : 0
}
const resumenExpandido = useCookie<boolean>('activos-resumen-expandido', { default: () => true })

// ── Filtros combinables (§8.3) ───────────────────────────────────────────
const busqueda = ref('')
const filtroTipo = ref<number | null>(null)
const filtroCategoria = ref<number | null>(null)
const filtroEstado = ref<string | null>(null)
const filtroUbicacion = ref<string | null>(null)
const filtroCriticidad = ref<string | null>(null)
const mostrarMasFiltros = ref(false)
const filtroNaturaleza = ref<string | null>(null)
const filtroOrigen = ref<string | null>(null)
const filtroCapitalizado = ref<'todos' | 'si' | 'no'>('todos')
const filtroFabricante = ref<string | null>(null)

const opcionesUbicacion = computed(() => {
  const vistas = new Set(filas.value.map((f) => f.ubicacion).filter((u): u is string => !!u))
  return [...vistas].sort().map((u) => ({ label: u, value: u }))
})
const opcionesCriticidad = computed(() => {
  const vistas = new Set(filas.value.map((f) => f.criticidad_banda).filter((b): b is string => !!b))
  return [...vistas].sort().map((b) => ({ label: b, value: b }))
})
const opcionesFabricante = computed(() => {
  const vistas = new Set(filas.value.map((f) => f.fabricante).filter((v): v is string => !!v))
  return [...vistas].sort().map((v) => ({ label: v, value: v }))
})

let debounceId: ReturnType<typeof setTimeout> | undefined
const busquedaAplicada = ref('')
watch(busqueda, () => {
  if (debounceId) clearTimeout(debounceId)
  debounceId = setTimeout(() => { busquedaAplicada.value = busqueda.value.trim().toLowerCase() }, 300)
})

const filasFiltradas = computed(() => {
  const q = busquedaAplicada.value
  return filas.value.filter((f) => {
    if (filtroTipo.value !== null && f.tipoId !== filtroTipo.value) return false
    if (filtroCategoria.value !== null && f.categoriaId !== filtroCategoria.value) return false
    if (filtroEstado.value && f.estado !== filtroEstado.value) return false
    if (filtroUbicacion.value && f.ubicacion !== filtroUbicacion.value) return false
    if (filtroCriticidad.value && f.criticidad_banda !== filtroCriticidad.value) return false
    if (filtroNaturaleza.value && f.naturalezaBien !== filtroNaturaleza.value) return false
    if (filtroOrigen.value && f.origen !== filtroOrigen.value) return false
    if (filtroCapitalizado.value === 'si' && !f.capitalizado) return false
    if (filtroCapitalizado.value === 'no' && f.capitalizado) return false
    if (filtroFabricante.value && f.fabricante !== filtroFabricante.value) return false
    if (q) {
      const texto = [f.codigo, f.nombre, f.descripcion, f.marca, f.modelo, f.numeroSerie, f.fabricante, f.ubicacion]
        .filter((v): v is string => !!v)
        .join(' ')
        .toLowerCase()
      if (!texto.includes(q)) return false
    }
    return true
  })
})

function limpiarFiltros(): void {
  busqueda.value = ''
  busquedaAplicada.value = ''
  filtroTipo.value = null
  filtroCategoria.value = null
  filtroEstado.value = null
  filtroUbicacion.value = null
  filtroCriticidad.value = null
  filtroNaturaleza.value = null
  filtroOrigen.value = null
  filtroCapitalizado.value = 'todos'
  filtroFabricante.value = null
}

// ── Paginación (patrón de asuntos/index.vue) ─────────────────────────────
const TAMANOS_PAGINA = [10, 20, 50, 100]
const porPagina = ref(10)
const pagina = ref(1)
watch([filasFiltradas, porPagina], () => { pagina.value = 1 })
const totalPaginas = computed(() => Math.max(1, Math.ceil(filasFiltradas.value.length / porPagina.value)))
const filasPagina = computed(() =>
  filasFiltradas.value.slice((pagina.value - 1) * porPagina.value, pagina.value * porPagina.value),
)
const desde = computed(() => (filasFiltradas.value.length === 0 ? 0 : (pagina.value - 1) * porPagina.value + 1))
const hasta = computed(() => Math.min(pagina.value * porPagina.value, filasFiltradas.value.length))
const numerosPagina = computed(() => {
  const total = totalPaginas.value
  const actual = pagina.value
  const ventana = 2
  const numeros: (number | '…')[] = []
  for (let n = 1; n <= total; n++) {
    if (n === 1 || n === total || (n >= actual - ventana && n <= actual + ventana)) numeros.push(n)
    else if (numeros[numeros.length - 1] !== '…') numeros.push('…')
  }
  return numeros
})

// ── Presentación (mapas compartidos en utils/activos-labels.ts) ──────────
function formatoFecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}
/** Porcentaje de vida útil YA CONSUMIDA (para la barra) — 0 si no hay datos, nunca negativo
 * ni mayor a 100 aunque el activo ya haya superado su vida útil nominal. */
function porcentajeVidaUtilConsumida(f: FilaActivo): number {
  if (f.vida_util_meses === null || f.vida_util_restante_meses === null || f.vida_util_meses <= 0) return 0
  const consumida = f.vida_util_meses - f.vida_util_restante_meses
  return Math.min(100, Math.max(0, Math.round((consumida / f.vida_util_meses) * 100)))
}
function etiquetaVidaUtilRestante(f: FilaActivo): string {
  if (f.vida_util_restante_meses === null) return '—'
  if (f.vida_util_restante_meses <= 0) return 'Vencida'
  const anios = Math.floor(f.vida_util_restante_meses / 12)
  const meses = f.vida_util_restante_meses % 12
  if (anios === 0) return `${String(meses)} m`
  return meses === 0 ? `${String(anios)} a` : `${String(anios)}a ${String(meses)}m`
}

// ── Fase 2: crear/editar (§9-12) ─────────────────────────────────────────
const drawerAbierto = ref(false)
const activoEnEdicion = ref<ActivoRow | null>(null)

function abrirCreacion(): void {
  activoEnEdicion.value = null
  drawerAbierto.value = true
}
function abrirEdicion(activoId: string): void {
  activoEnEdicion.value = activosStore.activos.find((a) => a.id === activoId) ?? null
  drawerAbierto.value = true
}
async function alGuardar(): Promise<void> {
  drawerAbierto.value = false
  await cargar()
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div class="flex items-center gap-3 flex-wrap">
        <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
          <template #titulo>
            <h1 class="text-xl font-semibold">Activos</h1>
          </template>
          <template #descripcion>
            Registro maestro de los activos físicos de la copropiedad: identificación, ubicación,
            criticidad, ciclo de vida y situación contable en un solo lugar.
          </template>
        </UiTituloDescripcion>
        <button
          type="button"
          class="flex shrink-0 items-center gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300"
          @click="resumenExpandido = !resumenExpandido"
        >
          <UIcon :name="resumenExpandido ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" />
          {{ resumenExpandido ? 'Cerrar resumen' : 'Ver resumen' }}
        </button>
      </div>
      <div class="flex items-center gap-2">
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="cargando" @click="cargar()">
          Actualizar
        </UButton>
        <UButton v-if="puedeEscribir" icon="i-lucide-plus" @click="abrirCreacion()">Nuevo activo</UButton>
      </div>
    </div>

    <UAlert v-if="errorCarga" color="error" variant="soft" :title="errorCarga" />

    <!-- KPIs (§8.2) -->
    <div v-if="resumenExpandido" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <div class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <p class="text-sm text-neutral-500">Total de activos</p>
          <p class="text-2xl font-semibold">{{ totalActivos }}</p>
        </div>
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-400">
          <UIcon name="i-lucide-box" class="h-3.5 w-3.5" />
        </span>
      </div>
      <div class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <p class="text-sm text-neutral-500">En servicio</p>
          <p class="text-2xl font-semibold">{{ enServicio }}</p>
          <div class="mt-1.5 flex items-center gap-1.5">
            <UProgress :model-value="pctDelTotal(enServicio)" size="xs" color="success" class="w-12" />
            <span class="text-xs text-neutral-400">{{ pctDelTotal(enServicio) }}%</span>
          </div>
        </div>
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-600 dark:bg-success-950 dark:text-success-400">
          <UIcon name="i-lucide-circle-check" class="h-3.5 w-3.5" />
        </span>
      </div>
      <div class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <p class="text-sm text-neutral-500">En mantenimiento</p>
          <p class="text-2xl font-semibold">{{ enMantenimiento }}</p>
          <div class="mt-1.5 flex items-center gap-1.5">
            <UProgress :model-value="pctDelTotal(enMantenimiento)" size="xs" color="warning" class="w-12" />
            <span class="text-xs text-neutral-400">{{ pctDelTotal(enMantenimiento) }}%</span>
          </div>
        </div>
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-50 text-warning-600 dark:bg-warning-950 dark:text-warning-400">
          <UIcon name="i-lucide-wrench" class="h-3.5 w-3.5" />
        </span>
      </div>
      <div class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <p class="text-sm text-neutral-500">Fuera de servicio</p>
          <p class="text-2xl font-semibold">{{ fueraDeServicio }}</p>
          <div class="mt-1.5 flex items-center gap-1.5">
            <UProgress :model-value="pctDelTotal(fueraDeServicio)" size="xs" color="error" class="w-12" />
            <span class="text-xs text-neutral-400">{{ pctDelTotal(fueraDeServicio) }}%</span>
          </div>
        </div>
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-error-50 text-error-600 dark:bg-error-950 dark:text-error-400">
          <UIcon name="i-lucide-circle-x" class="h-3.5 w-3.5" />
        </span>
      </div>
      <div class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <p class="text-sm text-neutral-500">Capitalizados</p>
          <p class="text-2xl font-semibold">{{ capitalizados }}</p>
          <div class="mt-1.5 flex items-center gap-1.5">
            <UProgress :model-value="pctDelTotal(capitalizados)" size="xs" color="primary" class="w-12" />
            <span class="text-xs text-neutral-400">{{ pctDelTotal(capitalizados) }}%</span>
          </div>
        </div>
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-400">
          <UIcon name="i-lucide-coins" class="h-3.5 w-3.5" />
        </span>
      </div>
      <div class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <p class="text-sm text-neutral-500">Vida útil por vencer</p>
          <p class="text-2xl font-semibold">{{ vidaUtilPorVencer }}</p>
          <div class="mt-1.5 flex items-center gap-1.5">
            <UProgress :model-value="pctDelTotal(vidaUtilPorVencer)" size="xs" color="warning" class="w-12" />
            <span class="text-xs text-neutral-400">{{ pctDelTotal(vidaUtilPorVencer) }}%</span>
          </div>
        </div>
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-50 text-warning-600 dark:bg-warning-950 dark:text-warning-400">
          <UIcon name="i-lucide-clock" class="h-3.5 w-3.5" />
        </span>
      </div>
    </div>

    <!-- Búsqueda (§8.4) y filtros (§8.3) -->
    <div class="space-y-3">
      <div class="flex items-center gap-2 flex-wrap">
        <UInput
          v-model="busqueda" icon="i-lucide-search" class="w-72"
          placeholder="Buscar por código, nombre, marca, modelo, serial, fabricante…"
        />
        <USelect
          v-model="filtroTipo" class="w-40" placeholder="Tipo"
          :items="[{ label: 'Todos los tipos', value: null }, ...tiposActivo.map((t) => ({ label: t.nombre, value: t.id }))]"
        />
        <USelect
          v-model="filtroCategoria" class="w-40" placeholder="Categoría"
          :items="[{ label: 'Todas las categorías', value: null }, ...categoriasActivo.map((c) => ({ label: c.nombre, value: c.id }))]"
        />
        <USelect
          v-model="filtroEstado" class="w-44" placeholder="Estado"
          :items="[{ label: 'Todos los estados', value: null }, ...Object.entries(ESTADO_LABEL).map(([value, label]) => ({ label, value }))]"
        />
        <USelect
          v-model="filtroUbicacion" class="w-44" placeholder="Ubicación"
          :items="[{ label: 'Todas las ubicaciones', value: null }, ...opcionesUbicacion]"
        />
        <USelect
          v-model="filtroCriticidad" class="w-40" placeholder="Criticidad"
          :items="[{ label: 'Todas', value: null }, ...opcionesCriticidad]"
        />
        <UButton
          variant="outline" size="sm" icon="i-lucide-sliders-horizontal"
          @click="mostrarMasFiltros = !mostrarMasFiltros"
        >
          Más filtros
        </UButton>
        <UButton variant="ghost" size="sm" @click="limpiarFiltros()">Limpiar</UButton>
      </div>

      <div v-if="mostrarMasFiltros" class="flex items-center gap-2 flex-wrap rounded-lg border border-default p-3">
        <USelect
          v-model="filtroNaturaleza" class="w-56" placeholder="Naturaleza del bien"
          :items="[{ label: 'Toda naturaleza', value: null }, ...Object.entries(NATURALEZA_LABEL).map(([value, label]) => ({ label, value }))]"
        />
        <USelect
          v-model="filtroOrigen" class="w-44" placeholder="Origen"
          :items="[{ label: 'Todo origen', value: null }, ...Object.entries(ORIGEN_LABEL).map(([value, label]) => ({ label, value }))]"
        />
        <USelect
          v-model="filtroCapitalizado" class="w-44"
          :items="[
            { label: 'Capitalización: todos', value: 'todos' },
            { label: 'Capitalizados', value: 'si' },
            { label: 'No capitalizados', value: 'no' },
          ]"
        />
        <USelect
          v-model="filtroFabricante" class="w-44" placeholder="Fabricante"
          :items="[{ label: 'Todo fabricante', value: null }, ...opcionesFabricante]"
        />
      </div>
    </div>

    <!-- Tabla (§8.5) -->
    <div class="rounded-lg border border-default overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-muted/30">
          <tr>
            <th class="p-2 text-left">Código</th>
            <th class="p-2 text-left">Activo</th>
            <th class="p-2 text-left">Tipo / Categoría</th>
            <th class="p-2 text-left">Ubicación</th>
            <th class="p-2 text-left">Estado</th>
            <th class="p-2 text-left">Criticidad</th>
            <th class="p-2 text-left">Vida útil</th>
            <th class="p-2 text-right">Valor neto</th>
            <th class="p-2 text-left">Últ. mantenimiento</th>
            <th class="p-2 text-left">Próximo mantenimiento</th>
            <th class="p-2 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <!-- Fase 6 (D-94): "estados de carga" — sin esto, la primera carga se veía como una
               tabla vacía ("Todavía no hay activos registrados") por un instante, indistinguible
               de un tenant genuinamente sin activos. -->
          <template v-if="cargando && filasPagina.length === 0">
            <tr v-for="i in 4" :key="`skeleton-${i}`">
              <td colspan="11" class="p-2">
                <USkeleton class="h-8 w-full" />
              </td>
            </tr>
          </template>
          <tr v-for="f in filasPagina" :key="f.id" class="border-t border-default hover:bg-elevated transition-colors">
            <td class="p-2 font-mono text-xs">{{ f.codigo }}</td>
            <td class="p-2">
              <button
                v-if="puedeEscribir"
                type="button"
                class="font-medium text-left hover:text-primary hover:underline"
                @click="abrirEdicion(f.id)"
              >
                {{ f.nombre }}
              </button>
              <NuxtLink
                v-else
                :to="`/mantenimiento/activos/${f.id}`"
                class="font-medium hover:text-primary hover:underline"
              >
                {{ f.nombre }}
              </NuxtLink>
              <p v-if="f.marca || f.modelo" class="text-xs text-muted">
                {{ [f.marca, f.modelo].filter(Boolean).join(' · ') }}
              </p>
            </td>
            <td class="p-2 text-xs">
              <p>{{ f.tipo_nombre ?? '—' }}</p>
              <p class="text-muted">{{ f.categoria_nombre ?? '—' }}</p>
            </td>
            <td class="p-2 text-xs">{{ f.ubicacion ?? '—' }}</td>
            <td class="p-2">
              <UBadge :color="ESTADO_COLOR[f.estado] ?? 'neutral'" variant="soft" size="sm">
                {{ ESTADO_LABEL[f.estado] ?? f.estado }}
              </UBadge>
            </td>
            <td class="p-2">
              <UBadge v-if="f.criticidad_banda" variant="soft" size="sm">{{ f.criticidad_banda }}</UBadge>
              <span v-else class="text-xs text-muted">Sin evaluar</span>
            </td>
            <td class="p-2">
              <div class="flex items-center gap-2 w-28">
                <UProgress :model-value="porcentajeVidaUtilConsumida(f)" class="w-16" size="sm" />
                <span class="text-xs text-muted whitespace-nowrap">{{ etiquetaVidaUtilRestante(f) }}</span>
              </div>
            </td>
            <td class="p-2 text-right">{{ f.valor_neto === null ? '—' : formatoMoneda(f.valor_neto) }}</td>
            <td class="p-2 text-xs">{{ formatoFecha(f.ultimo_mantenimiento) }}</td>
            <td class="p-2 text-xs">{{ formatoFecha(f.proximo_mantenimiento) }}</td>
            <td class="p-2 text-right">
              <div class="flex items-center justify-end gap-1">
                <UTooltip text="Ver ficha">
                  <UButton :to="`/mantenimiento/activos/${f.id}`" variant="ghost" size="xs" icon="i-lucide-eye" square aria-label="Ver ficha" />
                </UTooltip>
                <UTooltip v-if="puedeEscribir" text="Editar">
                  <UButton variant="ghost" size="xs" icon="i-lucide-pencil" square aria-label="Editar" @click="abrirEdicion(f.id)" />
                </UTooltip>
              </div>
            </td>
          </tr>
          <tr v-if="filasPagina.length === 0 && !cargando">
            <td colspan="11" class="p-6 text-center text-sm text-muted">
              {{ filas.length === 0 ? 'Todavía no hay activos registrados.' : 'Ningún activo coincide con estos filtros.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Paginación -->
    <div v-if="filasFiltradas.length > 0" class="flex items-center justify-between gap-4 flex-wrap text-sm">
      <p class="text-xs text-muted">
        Mostrando {{ desde }} a {{ hasta }} de {{ filasFiltradas.length }} activos
      </p>
      <div class="flex items-center gap-1">
        <UButton size="xs" variant="ghost" :disabled="pagina === 1" @click="pagina = 1">«</UButton>
        <UButton size="xs" variant="ghost" :disabled="pagina === 1" @click="pagina -= 1">Anterior</UButton>
        <template v-for="(n, i) in numerosPagina" :key="i">
          <span v-if="n === '…'" class="px-1 text-xs text-muted">…</span>
          <UButton
            v-else size="xs" :variant="n === pagina ? 'solid' : 'ghost'" class="min-w-7 justify-center"
            @click="pagina = n"
          >
            {{ n }}
          </UButton>
        </template>
        <UButton size="xs" variant="ghost" :disabled="pagina >= totalPaginas" @click="pagina += 1">Siguiente</UButton>
        <UButton size="xs" variant="ghost" :disabled="pagina >= totalPaginas" @click="pagina = totalPaginas">»</UButton>
      </div>
      <USelect
        v-model="porPagina" class="w-32"
        :items="TAMANOS_PAGINA.map((n) => ({ label: `${String(n)} por página`, value: n }))"
      />
    </div>

    <MantenimientoActivosActivoFormDrawer
      :abierto="drawerAbierto"
      :activo="activoEnEdicion"
      :tenant-id="tenantStore.activeTenant?.id ?? ''"
      :tipos-activo="tiposActivo"
      :categorias-activo="categoriasActivo"
      :activos-existentes="activosStore.activos"
      :depreciacion-defaults="depreciacionDefaultStore.defaults"
      @cerrar="drawerAbierto = false"
      @guardado="alGuardar()"
    />
  </div>
</template>
