<script setup lang="ts">
/**
 * Centro de Reportes — RPT-01/02/03 (PLAN_MOTOR_REPORTES.md §6, D-136).
 *
 * Lista los reportes de la copropiedad, pide sus parámetros, los ejecuta y
 * los exporta. Toda ejecución queda en el historial con su formato; la vista
 * previa del diseñador (RPT-02) es la que no, por diseño.
 */
import { formatearValor, type ColumnaReporte, type EncabezadoReporte } from '@aquila/reporting'
import type { ColumnaTabla } from '~/components/ui/UiTabla.vue'
import { useReportesStore, type CampoCatalogo, type ReporteListado } from '~/stores/reportes'
import { exportarCsv, exportarPdf, exportarXlsx } from '~/utils/reporte-exportar'

// La autenticación la cubre auth.global; no hace falta declarar middleware.
useHead({ title: 'Centro de Reportes' })

const store = useReportesStore()
const tenantStore = useTenantStore()
const authStore = useAuthStore()

// En una carga en frío directa sobre /reportes (F5 o enlace pegado), el
// layout todavía no ha resuelto la copropiedad activa y el catálogo saldría
// vacío. Mismo preámbulo que dashboard/index.vue: perfil y membresías
// primero — comparten clave de useAsyncData, así que no hay petición doble.
await useAsyncData('perfil', () => authStore.cargarPerfil())
await useAsyncData('memberships', () => tenantStore.cargarMemberships())

const seleccionado = ref<ReporteListado | null>(null)
const valores = ref<Record<string, string>>({})

// ── Crear / duplicar (RPT-02) ───────────────────────────────────────────
const router = useRouter()
const creando = ref(false)
const guardandoNuevo = ref(false)
const nuevo = ref({ nombre: '', fuente: '', duplicarDe: null as ReporteListado | null })

const puedeEditar = computed(() => tenantStore.puede('settings:manage'))

/** Código a partir del nombre: el usuario no debería inventarse un código. */
function codigoDesde(nombre: string): string {
  const base = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20)
  return `${base || 'REPORTE'}-${String(Date.now()).slice(-4)}`
}

function abrirNuevo(desde: ReporteListado | null = null): void {
  nuevo.value = {
    nombre: desde ? `${desde.nombre} (copia)` : '',
    fuente: desde?.versionPublicada?.definicion.fuente ?? store.fuentes[0]?.codigo ?? '',
    duplicarDe: desde,
  }
  creando.value = true
}

async function confirmarNuevo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nuevo.value.nombre.trim()) return

  guardandoNuevo.value = true
  const codigo = codigoDesde(nuevo.value.nombre)
  const creado = nuevo.value.duplicarDe
    ? await store.duplicar(tenantId, nuevo.value.duplicarDe, codigo, nuevo.value.nombre.trim())
    : await store.crearReporte(
        tenantId,
        { codigo, nombre: nuevo.value.nombre.trim(), descripcion: '', categoriaId: null },
        { fuente: nuevo.value.fuente, campos: [] },
      )
  guardandoNuevo.value = false

  if (creado) {
    creando.value = false
    await router.push(`/reportes/disenador/${creado.versionId}`)
  }
}

/**
 * Abre el diseñador sobre algo editable: el borrador que ya exista o, si el
 * reporte solo tiene versiones publicadas, la siguiente recién creada. Nunca
 * lleva a una publicada, que es inmutable y solo se podría mirar.
 */
async function editar(reporte: ReporteListado): Promise<void> {
  if (reporte.versionBorrador) {
    await router.push(`/reportes/disenador/${reporte.versionBorrador.id}`)
    return
  }
  const nuevaId = await store.nuevaVersion(reporte)
  if (nuevaId) {
    await store.cargar(tenantStore.activeTenant!.id)
    await router.push(`/reportes/disenador/${nuevaId}`)
  }
}

// `watch: [...]`: activeTenant puede no estar resuelto en el instante de este
// setup en la carga en frío — la opción reintenta sola en cuanto el id esté
// disponible (mismo patrón que fondos/index.vue). Escribe en el store de
// Pinia, no en un ref de página, que es lo que sí sobrevive a la hidratación.
await useAsyncData(
  'reportes',
  async () => {
    const tenantId = tenantStore.activeTenant?.id
    if (!tenantId) return null
    await store.cargar(tenantId)
    return true
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)

// ── Catálogo: búsqueda, favoritos y recientes (RPT-04) ──────────────────
const busqueda = ref('')

/** Sin acentos y en minúsculas: "cartera" tiene que encontrar "Cartera". */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Busca en nombre, descripción y categoría. Una copropiedad no llega nunca a
 * tener tantos reportes como para necesitar búsqueda remota (AD-24), así que
 * se filtra en memoria y responde a cada tecla.
 */
const encontrados = computed(() => {
  const termino = normalizar(busqueda.value.trim())
  if (!termino) return store.reportes
  return store.reportes.filter((r) =>
    normalizar(`${r.nombre} ${r.descripcion ?? ''} ${r.categoria ?? ''}`).includes(termino),
  )
})

const favoritos = computed(() => encontrados.value.filter((r) => store.favoritos.has(r.id)))

/**
 * Los recientes ya vienen ordenados por uso desde el store; aquí solo se
 * cruzan con el catálogo visible y se quitan los que ya salen en Favoritos,
 * para no listar el mismo reporte dos veces en la misma columna.
 */
const recientes = computed(() => {
  const visibles = new Map(encontrados.value.map((r) => [r.id, r]))
  return store.recientes
    .filter((id) => visibles.has(id) && !store.favoritos.has(id))
    .map((id) => visibles.get(id)!)
})

const porCategoria = computed(() => {
  const grupos = new Map<string, ReporteListado[]>()
  for (const reporte of encontrados.value) {
    const clave = reporte.categoria ?? 'Otros'
    grupos.set(clave, [...(grupos.get(clave) ?? []), reporte])
  }
  return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))
})

async function alternarFavorito(reporte: ReporteListado): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) await store.alternarFavorito(tenantId, reporte.id)
}

/**
 * Una sola lista de secciones para que la plantilla no triplique el mismo
 * `<li>`. Favoritos y Recientes van arriba porque son la respuesta a "lo que
 * abro siempre"; las categorías, debajo, son para encontrar lo que no.
 */
const secciones = computed(() => {
  const lista: { titulo: string; reportes: ReporteListado[] }[] = []
  if (favoritos.value.length > 0) lista.push({ titulo: 'Favoritos', reportes: favoritos.value })
  if (recientes.value.length > 0) lista.push({ titulo: 'Recientes', reportes: recientes.value })
  for (const [categoria, reportes] of porCategoria.value) lista.push({ titulo: categoria, reportes })
  return lista
})

const definicion = computed(() => seleccionado.value?.versionPublicada?.definicion ?? null)
const fuente = computed(() =>
  definicion.value ? store.fuenteDe(definicion.value.fuente) : undefined,
)
const parametros = computed(() => definicion.value?.parametros ?? [])

const faltanParametros = computed(() =>
  parametros.value.some((p) => p.requerido && !valores.value[p.codigo]),
)

/** Columnas de la tabla: etiqueta y tipo salen del catálogo, no del dato. */
const columnas = computed<ColumnaTabla<Record<string, unknown>>[]>(() => {
  if (!definicion.value || !fuente.value) return []
  const porCodigo = new Map(fuente.value.campos.map((c) => [c.codigo, c]))
  return definicion.value.campos.map((campo) => {
    const meta = porCodigo.get(campo.campo)
    return {
      clave: campo.campo,
      etiqueta: meta?.etiqueta ?? campo.campo,
      alinear: esNumerico(meta) ? ('derecha' as const) : undefined,
    }
  })
})

const tiposPorCampo = computed(() => {
  const mapa = new Map<string, CampoCatalogo['tipo_dato']>()
  for (const campo of fuente.value?.campos ?? []) mapa.set(campo.codigo, campo.tipo_dato)
  return mapa
})

function esNumerico(campo: CampoCatalogo | undefined): boolean {
  return campo !== undefined && ['dinero', 'numero', 'porcentaje'].includes(campo.tipo_dato)
}

/**
 * Presentación por tipo declarado — nunca se adivina por el valor. Es la
 * MISMA función que formatea el XLSX, el CSV y el PDF (RPT-03): si la
 * pantalla tuviera su propia copia, tarde o temprano el archivo diría una
 * cifra y la pantalla otra, que es justo el hallazgo de la auditoría de
 * 2026-08-26 sobre `formatoMoneda` copiado 18 veces.
 */
function formatear(campo: string, valor: unknown): string {
  return formatearValor(valor, tiposPorCampo.value.get(campo) ?? 'texto')
}

function seleccionar(reporte: ReporteListado): void {
  seleccionado.value = reporte
  store.resultado = null
  store.error = null
  valores.value = reporte.versionPublicada
    ? store.parametrosIniciales(reporte.versionPublicada.definicion)
    : {}
}

async function ejecutar(): Promise<void> {
  if (seleccionado.value) await store.ejecutar(seleccionado.value, valores.value)
}

// ── Exportar (RPT-03) ───────────────────────────────────────────────────
const exportando = ref<'' | 'xlsx' | 'csv' | 'pdf'>('')

/** Columnas con su tipo del catálogo: los renderers formatean por tipo. */
const columnasReporte = computed<ColumnaReporte[]>(() => {
  if (!definicion.value || !fuente.value) return []
  const porCodigo = new Map(fuente.value.campos.map((c) => [c.codigo, c]))
  return definicion.value.campos.map((campo) => {
    const meta = porCodigo.get(campo.campo)
    return {
      clave: campo.campo,
      etiqueta: campo.alias || meta?.etiqueta || campo.campo,
      tipo: meta?.tipo_dato ?? 'texto',
    }
  })
})

const encabezadoReporte = computed<EncabezadoReporte>(() => ({
  titulo: seleccionado.value?.nombre ?? 'Reporte',
  copropiedad: tenantStore.activeTenant?.name ?? '',
  version: seleccionado.value?.versionPublicada?.version,
  generadoEn: new Date(),
  // Los parámetros con los que se ejecutó viajan en el archivo: es lo que
  // permite saber meses después de dónde salió esa cifra (§95).
  parametros: Object.fromEntries(
    (definicion.value?.parametros ?? []).map((p) => [p.etiqueta, valores.value[p.codigo] ?? '']),
  ),
}))

/**
 * Exportar no reusa lo que está en pantalla: vuelve a ejecutar el reporte y
 * exporta ESO (§30). Lo de la pantalla puede venir de otros parámetros, o
 * estar recortado por el límite de filas.
 */
async function exportar(formato: 'xlsx' | 'csv' | 'pdf'): Promise<void> {
  if (!seleccionado.value) return
  exportando.value = formato

  await store.ejecutar(seleccionado.value, valores.value, 5000, formato)
  const resultado = store.resultado

  if (resultado) {
    const columnas = columnasReporte.value
    const encabezado = encabezadoReporte.value
    if (formato === 'csv') exportarCsv(columnas, resultado.filas, encabezado)
    if (formato === 'xlsx') await exportarXlsx(columnas, resultado.filas, encabezado)
    if (formato === 'pdf') await exportarPdf(columnas, resultado.filas, encabezado)
  }

  exportando.value = ''
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-6">
    <div class="flex items-start justify-between gap-3">
      <UiTituloDescripcion clase-descripcion="text-sm text-slate-500 dark:text-slate-400">
      <template #titulo>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Centro de Reportes
        </h1>
      </template>
      <template #descripcion>
        Los reportes leen la información que ya produjeron los módulos —cartera, cuenta corriente,
        recaudo— y la presentan con los filtros que elijas. <strong>No recalculan nada</strong>: la
        cifra que ves aquí es la misma que muestra el módulo que la produjo, ejecutada con la
        versión publicada del reporte y registrada en el historial.
      </template>
      </UiTituloDescripcion>

      <div class="flex shrink-0 gap-2">
        <UButton
          to="/reportes/historial"
          icon="i-lucide-history"
          variant="outline"
          color="neutral"
        >
          Historial
        </UButton>
        <UButton v-if="puedeEditar" icon="i-lucide-plus" @click="abrirNuevo()">
          Nuevo reporte
        </UButton>
      </div>
    </div>

    <!-- Crear o duplicar -->
    <UModal v-model:open="creando" title="Nuevo reporte">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Nombre" required>
            <UInput v-model="nuevo.nombre" placeholder="Cartera vencida por torre" class="w-full" />
          </UFormField>

          <UFormField
            v-if="!nuevo.duplicarDe"
            label="Fuente de datos"
            :help="store.fuenteDe(nuevo.fuente)?.descripcion ?? undefined"
          >
            <USelect
              v-model="nuevo.fuente"
              class="w-full"
              :items="store.fuentes.map((f) => ({ value: f.codigo, label: `${f.nombre} · ${f.modulo}` }))"
            />
          </UFormField>

          <p v-else class="text-sm text-slate-500 dark:text-slate-400">
            Se copiará la definición de <strong>{{ nuevo.duplicarDe.nombre }}</strong> en un reporte
            nuevo que sí puedes editar.
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="creando = false">Cancelar</UButton>
          <UButton
            :loading="guardandoNuevo"
            :disabled="!nuevo.nombre.trim() || (!nuevo.duplicarDe && !nuevo.fuente)"
            @click="confirmarNuevo"
          >
            Crear y diseñar
          </UButton>
        </div>
      </template>
    </UModal>

    <div v-if="store.cargando" class="mt-8 text-sm text-slate-500">Cargando reportes…</div>

    <div v-else class="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
      <!-- Catálogo -->
      <aside class="space-y-5">
        <UInput
          v-model="busqueda"
          icon="i-lucide-search"
          placeholder="Buscar reporte…"
          class="w-full"
        />

        <p v-if="secciones.length === 0" class="text-sm text-slate-500 dark:text-slate-400">
          Ningún reporte coincide con «{{ busqueda }}».
        </p>

        <section v-for="seccion in secciones" :key="seccion.titulo">
          <h2
            class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            {{ seccion.titulo }}
          </h2>
          <ul class="space-y-1.5">
            <li v-for="reporte in seccion.reportes" :key="reporte.id" class="relative">
              <button
                type="button"
                class="w-full rounded-lg border py-2.5 pl-3 pr-10 text-left transition"
                :class="
                  seleccionado?.id === reporte.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                "
                @click="seleccionar(reporte)"
              >
                <span class="block text-sm font-medium text-slate-900 dark:text-slate-100">
                  {{ reporte.nombre }}
                  <UBadge
                    v-if="reporte.versionBorrador"
                    color="warning"
                    variant="subtle"
                    size="xs"
                    class="ml-1 align-middle"
                  >
                    borrador
                  </UBadge>
                </span>
                <span class="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                  {{ reporte.descripcion }}
                </span>
              </button>

              <!-- La estrella va fuera del botón de selección: marcar un
                   favorito no debe cambiar qué reporte está abierto. -->
              <button
                type="button"
                class="absolute right-2 top-2 rounded p-1 text-slate-300 transition hover:text-amber-500 dark:text-slate-600"
                :class="store.favoritos.has(reporte.id) ? 'text-amber-500 dark:text-amber-400' : ''"
                :aria-label="
                  store.favoritos.has(reporte.id) ? 'Quitar de favoritos' : 'Marcar como favorito'
                "
                :title="
                  store.favoritos.has(reporte.id) ? 'Quitar de favoritos' : 'Marcar como favorito'
                "
                @click.stop="alternarFavorito(reporte)"
              >
                <!-- Mismo icono siempre: lucide no trae estrella rellena, y
                     el color ya distingue marcado de sin marcar. -->
                <UIcon
                  name="i-lucide-star"
                  class="size-4"
                  :class="store.favoritos.has(reporte.id) ? 'fill-current' : ''"
                />
              </button>

              <div v-if="puedeEditar && seleccionado?.id === reporte.id" class="mt-1 flex gap-1.5">
                <!-- Un reporte de fábrica no se edita: se duplica. Lo impone
                     la RLS (20260939000000), aquí solo se refleja. -->
                <UButton
                  v-if="!reporte.del_sistema"
                  size="xs"
                  variant="outline"
                  color="neutral"
                  @click="editar(reporte)"
                >
                  {{ reporte.versionBorrador ? 'Seguir editando' : 'Nueva versión' }}
                </UButton>
                <UButton size="xs" variant="ghost" color="neutral" @click="abrirNuevo(reporte)">
                  Duplicar
                </UButton>
              </div>
            </li>
          </ul>
        </section>

        <p v-if="!store.reportes.length" class="text-sm text-slate-500">
          Todavía no hay reportes disponibles en esta copropiedad.
        </p>
      </aside>

      <!-- Ejecución -->
      <section v-if="seleccionado" class="min-w-0">
        <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div class="flex flex-wrap items-end gap-3">
            <UFormField
              v-for="parametro in parametros"
              :key="parametro.codigo"
              :label="parametro.etiqueta"
              :required="parametro.requerido"
            >
              <UInput
                v-model="valores[parametro.codigo]"
                :type="parametro.tipo === 'fecha' ? 'date' : 'text'"
                class="w-44"
              />
            </UFormField>

            <UButton
              :loading="store.ejecutando && !exportando"
              :disabled="faltanParametros"
              icon="i-lucide-play"
              @click="ejecutar"
            >
              Ejecutar
            </UButton>

            <!-- Exportar vuelve a ejecutar y exporta ESO, no lo que se ve:
                 la pantalla puede estar recortada por el límite de filas. -->
            <UButton
              variant="outline"
              color="neutral"
              :loading="exportando === 'xlsx'"
              :disabled="faltanParametros"
              @click="exportar('xlsx')"
            >
              Excel
            </UButton>
            <UButton
              variant="outline"
              color="neutral"
              :loading="exportando === 'csv'"
              :disabled="faltanParametros"
              @click="exportar('csv')"
            >
              CSV
            </UButton>
            <UButton
              variant="outline"
              color="neutral"
              :loading="exportando === 'pdf'"
              :disabled="faltanParametros"
              @click="exportar('pdf')"
            >
              PDF
            </UButton>

            <p v-if="faltanParametros" class="text-xs text-amber-600 dark:text-amber-400">
              Completa los datos obligatorios para ejecutar.
            </p>
          </div>

          <p class="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Fuente: <strong>{{ fuente?.nombre ?? definicion?.fuente }}</strong>
            · versión {{ seleccionado.versionPublicada?.version }}
            <span v-if="seleccionado.del_sistema"> · reporte del sistema</span>
          </p>
        </div>

        <p
          v-if="store.error"
          class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {{ store.error }}
        </p>

        <div v-if="store.resultado" class="mt-4">
          <div class="overflow-x-auto">
            <UiTabla
              :columnas="columnas"
              :filas="store.resultado.filas"
              :clave-fila="(_fila, indice) => indice"
              vacio="El reporte no devolvió filas con esos parámetros."
            >
              <template
                v-for="columna in columnas"
                :key="columna.clave"
                #[`celda-${columna.clave}`]="{ fila }"
              >
                {{ formatear(columna.clave, (fila as Record<string, unknown>)[columna.clave]) }}
              </template>
            </UiTabla>
          </div>

          <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {{ store.resultado.total_filas }}
            {{ store.resultado.total_filas === 1 ? 'fila' : 'filas' }}
            · {{ store.resultado.duracion_ms }} ms
            <span v-if="store.resultado.truncado" class="text-amber-600 dark:text-amber-400">
              · resultado recortado al límite: afina los filtros para verlo completo
            </span>
          </p>
        </div>
      </section>

      <section
        v-else
        class="flex items-center justify-center rounded-xl border border-dashed border-slate-300 p-10 text-sm text-slate-500 dark:border-slate-700"
      >
        Elige un reporte del catálogo para ejecutarlo.
      </section>
    </div>
  </div>
</template>
