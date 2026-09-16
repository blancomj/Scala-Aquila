<script setup lang="ts">
/**
 * Diseñador de reportes — RPT-02 (PLAN_MOTOR_REPORTES.md §6, D-136).
 *
 * `[id]` es el id de una VERSIÓN, no del reporte: se diseña siempre sobre
 * una versión concreta, y una publicada es inmutable (§38). Entrar a una
 * publicada abre el diseñador en solo lectura y ofrece crear la siguiente.
 *
 * La vista previa no se registra en el historial: diseñar son decenas de
 * corridas de prueba y anotarlas todas dejaría la bitácora inservible.
 */
import { formatearValor } from '@aquila/reporting'
import type { ColumnaTabla } from '~/components/ui/UiTabla.vue'
import {
  useReportesStore,
  type CampoCatalogo,
  type DefinicionReporte,
  type FiltroDefinicion,
  type ResultadoEjecucion,
  type VersionReporte,
} from '~/stores/reportes'

useHead({ title: 'Diseñador de reportes' })

const route = useRoute()
const router = useRouter()
const store = useReportesStore()
const tenantStore = useTenantStore()
const authStore = useAuthStore()

const versionId = computed(() => String(route.params.id))

const version = ref<VersionReporte | null>(null)
const definicion = ref<DefinicionReporte>({ fuente: '', campos: [] })
const valoresParametros = ref<Record<string, string>>({})
const preview = ref<ResultadoEjecucion | null>(null)
const previsualizando = ref(false)
const guardando = ref(false)
const publicando = ref(false)
const sinGuardar = ref(false)
const guardadoEn = ref<string | null>(null)
const valoresSugeridos = ref<Record<string, string[]>>({})

await useAsyncData('perfil', () => authStore.cargarPerfil())
await useAsyncData('memberships', () => tenantStore.cargarMemberships())

/**
 * La carga va en onMounted y NO en useAsyncData: aquí el resultado se escribe
 * en refs de página (`version`, `definicion`), y eso no sobrevive a la
 * hidratación — el cliente reutiliza el payload sin re-ejecutar y los refs se
 * quedan vacíos. Con `version` en null, `soloLectura` daba true y el
 * diseñador abría un borrador como si fuera una versión publicada
 * (reproducido en navegador). Lo que sí hidrata es el store de Pinia, por eso
 * `store.cargar` puede vivir en useAsyncData y esto no.
 */
async function cargarTodo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  if (!store.fuentes.length) await store.cargar(tenantId)
  const cargada = await store.cargarVersion(versionId.value)
  if (!cargada) return
  version.value = cargada
  definicion.value = { ...cargada.definicion, campos: cargada.definicion.campos ?? [] }
  valoresParametros.value = store.parametrosIniciales(cargada.definicion)
  // La carga inicial no es un cambio del usuario.
  await nextTick()
  sinGuardar.value = false
}

onMounted(cargarTodo)
watch(() => tenantStore.activeTenant?.id, cargarTodo)

const soloLectura = computed(() => version.value?.estado !== 'borrador')
const fuente = computed(() => store.fuenteDe(definicion.value.fuente))
const camposDisponibles = computed(() => fuente.value?.campos ?? [])
const dimensiones = computed(() => camposDisponibles.value.filter((c) => c.clase === 'dimension'))
const metricas = computed(() => camposDisponibles.value.filter((c) => c.clase === 'metrica'))

const seleccionados = computed(() => definicion.value.campos.map((c) => c.campo))
const hayAgregacion = computed(() => (definicion.value.agrupar ?? []).length > 0)

function metaDe(codigo: string): CampoCatalogo | undefined {
  return camposDisponibles.value.find((c) => c.codigo === codigo)
}

// ── Edición de la definición ────────────────────────────────────────────
function alternarCampo(codigo: string): void {
  if (soloLectura.value) return
  const indice = definicion.value.campos.findIndex((c) => c.campo === codigo)
  if (indice >= 0) {
    definicion.value.campos.splice(indice, 1)
    definicion.value.agrupar = (definicion.value.agrupar ?? []).filter((g) => g !== codigo)
    definicion.value.orden = (definicion.value.orden ?? []).filter((o) => o.campo !== codigo)
  } else {
    definicion.value.campos.push({ campo: codigo })
  }
}

function moverCampo(indice: number, delta: number): void {
  const destino = indice + delta
  if (destino < 0 || destino >= definicion.value.campos.length) return
  const campos = definicion.value.campos
  const [movido] = campos.splice(indice, 1)
  campos.splice(destino, 0, movido!)
}

function alternarAgrupacion(codigo: string): void {
  const grupos = definicion.value.agrupar ?? []
  definicion.value.agrupar = grupos.includes(codigo)
    ? grupos.filter((g) => g !== codigo)
    : [...grupos, codigo]
}

function agregarFiltro(): void {
  const primero = dimensiones.value.find((c) => c.filtrable)
  if (!primero) return
  definicion.value.filtros = [
    ...(definicion.value.filtros ?? []),
    { campo: primero.codigo, operador: 'igual', valor: '' },
  ]
}

function quitarFiltro(indice: number): void {
  definicion.value.filtros = (definicion.value.filtros ?? []).filter((_, i) => i !== indice)
}

function agregarOrden(): void {
  const disponible = definicion.value.campos.find(
    (c) => !(definicion.value.orden ?? []).some((o) => o.campo === c.campo),
  )
  if (!disponible) return
  definicion.value.orden = [
    ...(definicion.value.orden ?? []),
    { campo: disponible.campo, direccion: 'asc' },
  ]
}

function quitarOrden(indice: number): void {
  definicion.value.orden = (definicion.value.orden ?? []).filter((_, i) => i !== indice)
}

/** Valores reales del campo para el desplegable del filtro (y su cascada). */
async function cargarValores(indice: number): Promise<void> {
  const filtro = (definicion.value.filtros ?? [])[indice]
  if (!filtro || !fuente.value) return
  // Los filtros anteriores acotan la lista: elegida la torre, los inmuebles
  // que se ofrecen son los de esa torre.
  const previos = (definicion.value.filtros ?? [])
    .slice(0, indice)
    .filter((f) => f.valor !== '' && f.valor !== undefined)
  valoresSugeridos.value[filtro.campo] = await store.valoresDe(
    fuente.value.codigo,
    filtro.campo,
    previos,
  )
}

// ── Autosave con debounce (§64) ─────────────────────────────────────────
let temporizador: ReturnType<typeof setTimeout> | null = null

watch(
  definicion,
  () => {
    if (soloLectura.value || !version.value) return
    sinGuardar.value = true
    if (temporizador) clearTimeout(temporizador)
    temporizador = setTimeout(() => void guardar(), 1500)
  },
  { deep: true },
)

async function guardar(): Promise<void> {
  if (!version.value || soloLectura.value) return
  guardando.value = true
  const ok = await store.guardarBorrador(version.value.id, definicion.value)
  guardando.value = false
  if (ok) {
    sinGuardar.value = false
    guardadoEn.value = new Date().toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }
}

onBeforeRouteLeave(() => {
  if (!sinGuardar.value) return true
  return window.confirm('Tienes cambios sin guardar. ¿Salir de todos modos?')
})

onBeforeUnmount(() => {
  if (temporizador) clearTimeout(temporizador)
})

// ── Probar y publicar ───────────────────────────────────────────────────
async function probar(): Promise<void> {
  previsualizando.value = true
  preview.value = await store.previsualizar(definicion.value, valoresParametros.value, 100)
  previsualizando.value = false
}

const puedePublicar = computed(
  () => !soloLectura.value && definicion.value.campos.length > 0 && preview.value !== null,
)

async function publicar(): Promise<void> {
  if (!version.value) return
  publicando.value = true
  await guardar()
  const ok = await store.publicar(version.value.id)
  publicando.value = false
  if (ok) {
    sinGuardar.value = false
    const tenantId = tenantStore.activeTenant?.id
    if (tenantId) await store.cargar(tenantId)
    await router.push('/reportes')
  }
}

async function crearVersionNueva(): Promise<void> {
  const reporte = store.reportes.find((r) => r.versionPublicada?.id === version.value?.id)
  if (!reporte) return
  const nueva = await store.nuevaVersion(reporte)
  if (nueva) await router.push(`/reportes/disenador/${nueva}`)
}

// ── Vista previa ────────────────────────────────────────────────────────
const columnas = computed<ColumnaTabla<Record<string, unknown>>[]>(() =>
  definicion.value.campos.map((campo) => {
    const meta = metaDe(campo.campo)
    return {
      clave: campo.campo,
      etiqueta: campo.alias || meta?.etiqueta || campo.campo,
      alinear:
        meta && ['dinero', 'numero', 'porcentaje'].includes(meta.tipo_dato)
          ? ('derecha' as const)
          : undefined,
    }
  }),
)

/**
 * La vista previa formatea con la misma función que el Centro de Reportes y
 * que los archivos exportados (RPT-03): lo que se ve al diseñar es lo que
 * saldrá impreso.
 */
function formatear(campo: string, valor: unknown): string {
  return formatearValor(valor, metaDe(campo)?.tipo_dato ?? 'texto')
}

const OPERADORES = [
  { value: 'igual', label: 'Igual a' },
  { value: 'distinto', label: 'Distinto de' },
  { value: 'contiene', label: 'Contiene' },
  { value: 'empieza_por', label: 'Empieza por' },
  { value: 'mayor', label: 'Mayor que' },
  { value: 'mayor_igual', label: 'Mayor o igual' },
  { value: 'menor', label: 'Menor que' },
  { value: 'menor_igual', label: 'Menor o igual' },
  { value: 'entre', label: 'Entre' },
  { value: 'en', label: 'Está en' },
  { value: 'no_en', label: 'No está en' },
  { value: 'es_nulo', label: 'Está vacío' },
  { value: 'no_es_nulo', label: 'Tiene valor' },
]

function operadoresDe(codigo: string): typeof OPERADORES {
  const meta = metaDe(codigo)
  if (!meta) return OPERADORES
  // Comparar textos con "mayor que" no significa nada para quien lo lee.
  if (meta.tipo_dato === 'texto') {
    return OPERADORES.filter((o) =>
      ['igual', 'distinto', 'contiene', 'empieza_por', 'en', 'no_en', 'es_nulo', 'no_es_nulo'].includes(o.value),
    )
  }
  if (meta.tipo_dato === 'booleano') {
    return OPERADORES.filter((o) => ['igual', 'distinto'].includes(o.value))
  }
  return OPERADORES.filter((o) => !['contiene', 'empieza_por'].includes(o.value))
}

function requiereValor(operador: string): boolean {
  return !['es_nulo', 'no_es_nulo'].includes(operador)
}

function esRango(operador: string): boolean {
  return operador === 'entre'
}

function tipoInput(codigo: string): string {
  const tipo = metaDe(codigo)?.tipo_dato
  if (tipo === 'fecha') return 'date'
  if (tipo === 'numero' || tipo === 'dinero' || tipo === 'porcentaje') return 'number'
  return 'text'
}

function valorDeFiltro(filtro: FiltroDefinicion, clave: 'valor' | 'desde' | 'hasta'): string {
  const bruto = filtro[clave]
  return bruto === undefined || bruto === null ? '' : String(bruto)
}
</script>

<template>
  <div class="mx-auto max-w-[1600px] px-4 py-6">
    <!-- Cabecera -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <h1 class="font-display text-2xl font-medium text-neutral-900 dark:text-neutral-100">
            Diseñador de reportes
          </h1>
          <UBadge
            v-if="version"
            :color="version.estado === 'borrador' ? 'warning' : 'success'"
            variant="subtle"
          >
            {{ version.estado === 'borrador' ? 'Borrador' : 'Publicada' }} · v{{ version.version }}
          </UBadge>
        </div>
        <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Fuente: <strong>{{ fuente?.nombre ?? definicion.fuente }}</strong>
          <span v-if="fuente?.descripcion"> — {{ fuente.descripcion }}</span>
        </p>
      </div>

      <div class="flex items-center gap-2">
        <span v-if="guardando" class="text-xs text-neutral-500">Guardando…</span>
        <span v-else-if="sinGuardar" class="text-xs text-warning-600 dark:text-warning-400">
          Cambios sin guardar
        </span>
        <span v-else-if="guardadoEn" class="text-xs text-neutral-500">
          Guardado {{ guardadoEn }}
        </span>

        <UButton variant="ghost" color="neutral" to="/reportes">Volver</UButton>
        <UButton
          v-if="!soloLectura"
          variant="outline"
          color="neutral"
          :loading="previsualizando"
          @click="probar"
        >
          Probar
        </UButton>
        <UButton v-if="soloLectura" color="primary" @click="crearVersionNueva">
          Crear versión nueva
        </UButton>
        <UButton
          v-else
          color="primary"
          :loading="publicando"
          :disabled="!puedePublicar"
          @click="publicar"
        >
          Publicar
        </UButton>
      </div>
    </div>

    <p
      v-if="soloLectura"
      class="mt-4 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
    >
      Esta versión está publicada y no se puede modificar. Para cambiarla se crea la versión
      siguiente; las ejecuciones ya hechas seguirán apuntando a esta.
    </p>

    <p
      v-if="store.error"
      class="mt-4 rounded-md border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-700 dark:border-error-900 dark:bg-error-950/40 dark:text-error-300"
    >
      {{ store.error }}
    </p>

    <div class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <!-- Configuración -->
      <div class="space-y-4">
        <!-- Campos -->
        <section class="rounded-md border border-neutral-200 p-4 dark:border-neutral-700">
          <h2 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Campos</h2>
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Las dimensiones describen; las métricas se suman.
          </p>

          <div class="mt-3 space-y-3">
            <div>
              <p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Dimensiones
              </p>
              <div class="flex flex-wrap gap-1.5">
                <UButton
                  v-for="campo in dimensiones"
                  :key="campo.codigo"
                  size="xs"
                  :color="seleccionados.includes(campo.codigo) ? 'primary' : 'neutral'"
                  :variant="seleccionados.includes(campo.codigo) ? 'solid' : 'outline'"
                  :disabled="soloLectura"
                  @click="alternarCampo(campo.codigo)"
                >
                  {{ campo.etiqueta }}
                </UButton>
              </div>
            </div>

            <div>
              <p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Métricas
              </p>
              <div class="flex flex-wrap gap-1.5">
                <UButton
                  v-for="campo in metricas"
                  :key="campo.codigo"
                  size="xs"
                  :color="seleccionados.includes(campo.codigo) ? 'primary' : 'neutral'"
                  :variant="seleccionados.includes(campo.codigo) ? 'solid' : 'outline'"
                  :disabled="soloLectura"
                  @click="alternarCampo(campo.codigo)"
                >
                  {{ campo.etiqueta }}
                </UButton>
              </div>
            </div>
          </div>
        </section>

        <!-- Columnas elegidas -->
        <section
          v-if="definicion.campos.length"
          class="rounded-md border border-neutral-200 p-4 dark:border-neutral-700"
        >
          <h2 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Columnas del reporte
          </h2>
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            El orden es el de la tabla. El alias solo cambia el encabezado.
          </p>

          <ul class="mt-3 space-y-1.5">
            <li
              v-for="(campo, indice) in definicion.campos"
              :key="campo.campo"
              class="flex items-center gap-2 rounded-sm border border-neutral-200 px-2 py-1.5 dark:border-neutral-700"
            >
              <div class="flex shrink-0 flex-col">
                <button
                  type="button"
                  class="text-neutral-400 hover:text-neutral-700 disabled:opacity-30 dark:hover:text-neutral-200"
                  :disabled="soloLectura || indice === 0"
                  aria-label="Subir"
                  @click="moverCampo(indice, -1)"
                >
                  ▲
                </button>
                <button
                  type="button"
                  class="text-neutral-400 hover:text-neutral-700 disabled:opacity-30 dark:hover:text-neutral-200"
                  :disabled="soloLectura || indice === definicion.campos.length - 1"
                  aria-label="Bajar"
                  @click="moverCampo(indice, 1)"
                >
                  ▼
                </button>
              </div>

              <span class="min-w-0 flex-1 truncate text-sm">
                {{ metaDe(campo.campo)?.etiqueta ?? campo.campo }}
              </span>

              <UInput
                v-model="campo.alias"
                :disabled="soloLectura"
                placeholder="Alias"
                size="xs"
                class="w-28"
              />

              <USelect
                v-if="metaDe(campo.campo)?.clase === 'metrica' && hayAgregacion"
                v-model="campo.agregacion"
                :disabled="soloLectura"
                size="xs"
                class="w-28"
                :items="[
                  { value: 'suma', label: 'Suma' },
                  { value: 'conteo', label: 'Conteo' },
                  { value: 'promedio', label: 'Promedio' },
                  { value: 'minimo', label: 'Mínimo' },
                  { value: 'maximo', label: 'Máximo' },
                ]"
              />

              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                :disabled="soloLectura"
                aria-label="Quitar"
                @click="alternarCampo(campo.campo)"
              >
                ✕
              </UButton>
            </li>
          </ul>
        </section>

        <!-- Filtros -->
        <section class="rounded-md border border-neutral-200 p-4 dark:border-neutral-700">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Filtros</h2>
            <UButton size="xs" variant="outline" color="neutral" :disabled="soloLectura" @click="agregarFiltro">
              Agregar
            </UButton>
          </div>
          <p
            v-if="fuente?.filtro_obligatorio"
            class="mt-1 text-xs text-warning-600 dark:text-warning-400"
          >
            Esta fuente exige filtrar por
            «{{ metaDe(fuente.filtro_obligatorio)?.etiqueta ?? fuente.filtro_obligatorio }}».
          </p>

          <div class="mt-3 space-y-2">
            <div
              v-for="(filtro, indice) in definicion.filtros ?? []"
              :key="indice"
              class="space-y-1.5 rounded-sm border border-neutral-200 p-2 dark:border-neutral-700"
            >
              <div class="flex items-center gap-1.5">
                <USelect
                  v-model="filtro.campo"
                  :disabled="soloLectura"
                  size="xs"
                  class="w-full"
                  :items="camposDisponibles.filter((c) => c.filtrable).map((c) => ({ value: c.codigo, label: c.etiqueta }))"
                  @update:model-value="cargarValores(indice)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="soloLectura"
                  aria-label="Quitar filtro"
                  @click="quitarFiltro(indice)"
                >
                  ✕
                </UButton>
              </div>

              <USelect
                v-model="filtro.operador"
                :disabled="soloLectura"
                size="xs"
                class="w-full"
                :items="operadoresDe(filtro.campo).map((o) => ({ value: o.value, label: o.label }))"
              />

              <div v-if="esRango(filtro.operador)" class="flex items-center gap-1.5">
                <UInput
                  :model-value="valorDeFiltro(filtro, 'desde')"
                  :type="tipoInput(filtro.campo)"
                  :disabled="soloLectura"
                  size="xs"
                  class="w-full"
                  placeholder="Desde"
                  @update:model-value="filtro.desde = $event"
                />
                <UInput
                  :model-value="valorDeFiltro(filtro, 'hasta')"
                  :type="tipoInput(filtro.campo)"
                  :disabled="soloLectura"
                  size="xs"
                  class="w-full"
                  placeholder="Hasta"
                  @update:model-value="filtro.hasta = $event"
                />
              </div>

              <template v-else-if="requiereValor(filtro.operador)">
                <UInput
                  :model-value="valorDeFiltro(filtro, 'valor')"
                  :type="tipoInput(filtro.campo)"
                  :disabled="soloLectura"
                  size="xs"
                  class="w-full"
                  :list="`valores-${indice}`"
                  placeholder="Valor"
                  @focus="cargarValores(indice)"
                  @update:model-value="filtro.valor = $event"
                />
                <!-- Sugerencias reales del campo: el usuario no tiene por qué
                     recordar cómo se escribió «Torre 1». -->
                <datalist :id="`valores-${indice}`">
                  <option
                    v-for="valor in valoresSugeridos[filtro.campo] ?? []"
                    :key="valor"
                    :value="valor"
                  />
                </datalist>
              </template>
            </div>

            <p
              v-if="!(definicion.filtros ?? []).length"
              class="text-xs text-neutral-500 dark:text-neutral-400"
            >
              Sin filtros: el reporte traerá todo lo que la copropiedad tenga.
            </p>
          </div>
        </section>

        <!-- Agrupación y orden -->
        <section class="rounded-md border border-neutral-200 p-4 dark:border-neutral-700">
          <h2 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Agrupación y orden
          </h2>
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Al agrupar, cada métrica se totaliza y las demás columnas deben estar agrupadas.
          </p>

          <div class="mt-3 flex flex-wrap gap-1.5">
            <UButton
              v-for="campo in definicion.campos.filter((c) => metaDe(c.campo)?.agrupable)"
              :key="campo.campo"
              size="xs"
              :color="(definicion.agrupar ?? []).includes(campo.campo) ? 'primary' : 'neutral'"
              :variant="(definicion.agrupar ?? []).includes(campo.campo) ? 'solid' : 'outline'"
              :disabled="soloLectura"
              @click="alternarAgrupacion(campo.campo)"
            >
              {{ metaDe(campo.campo)?.etiqueta }}
            </UButton>
            <p
              v-if="!definicion.campos.length"
              class="text-xs text-neutral-500 dark:text-neutral-400"
            >
              Elige campos primero.
            </p>
          </div>

          <div class="mt-4 flex items-center justify-between">
            <p class="text-xs font-medium uppercase tracking-wide text-neutral-500">Orden</p>
            <UButton size="xs" variant="outline" color="neutral" :disabled="soloLectura" @click="agregarOrden">
              Agregar
            </UButton>
          </div>

          <div class="mt-2 space-y-1.5">
            <div
              v-for="(orden, indice) in definicion.orden ?? []"
              :key="indice"
              class="flex items-center gap-1.5"
            >
              <USelect
                v-model="orden.campo"
                :disabled="soloLectura"
                size="xs"
                class="w-full"
                :items="definicion.campos.map((c) => ({ value: c.campo, label: metaDe(c.campo)?.etiqueta ?? c.campo }))"
              />
              <USelect
                v-model="orden.direccion"
                :disabled="soloLectura"
                size="xs"
                class="w-32"
                :items="[
                  { value: 'asc', label: 'Ascendente' },
                  { value: 'desc', label: 'Descendente' },
                ]"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                :disabled="soloLectura"
                aria-label="Quitar orden"
                @click="quitarOrden(indice)"
              >
                ✕
              </UButton>
            </div>
          </div>
        </section>
      </div>

      <!-- Vista previa -->
      <div class="min-w-0">
        <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-700">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Vista previa
              </h2>
              <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Hasta 100 filas. No queda registrada en el historial.
              </p>
            </div>

            <div class="flex flex-wrap items-end gap-2">
              <UFormField
                v-for="parametro in definicion.parametros ?? []"
                :key="parametro.codigo"
                :label="parametro.etiqueta"
                size="xs"
              >
                <UInput
                  v-model="valoresParametros[parametro.codigo]"
                  :type="parametro.tipo === 'fecha' ? 'date' : 'text'"
                  size="xs"
                  class="w-40"
                />
              </UFormField>
              <UButton size="xs" :loading="previsualizando" @click="probar">Actualizar</UButton>
            </div>
          </div>

          <div v-if="preview" class="mt-4">
            <div class="overflow-x-auto">
              <UiTabla
                :columnas="columnas"
                :filas="preview.filas"
                :clave-fila="(_fila, indice) => indice"
                vacio="Sin filas con esta definición."
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
            <p class="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              {{ preview.total_filas }} {{ preview.total_filas === 1 ? 'fila' : 'filas' }}
              · {{ preview.duracion_ms }} ms
              <span v-if="preview.truncado" class="text-warning-600 dark:text-warning-400">
                · recortada a 100 filas
              </span>
            </p>
          </div>

          <p v-else class="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Pulsa «Probar» para ver el resultado con datos reales.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
