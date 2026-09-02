<script setup lang="ts">
// Motor de cuenta corriente (E4) — novedades: ajustes manuales con
// aprobación separada del motor de cálculo (Docs/19 §284, AD-33). Crear es
// agent-only (rechazo/aprobación también) porque materializa un cargo real
// en el ledger al aprobar.
//
// Rediseño: esta página quedó solo como lista. El formulario de creación se
// movió a /novedades/nueva y el detalle a /novedades/[id] (ver
// components/novedades/NovedadesEditor.vue), mismo criterio que el catálogo
// de Conceptos con /conceptos/nuevo. La tabla bajó de 11 a 7 columnas con
// filtro por estado + búsqueda, porque aquí también la lista crece con el
// tiempo y lo único accionable son las pendientes.
//
// Se conserva "Aprobar" en línea porque no pide nada más y el caso real es
// despachar varias seguidas. "Rechazar" e "Inhabilitar" viven solo en el
// detalle: piden un motivo o tienen consecuencias que conviene leer con la
// novedad completa a la vista, y así no se duplican los modales.
import {
  COLOR_ESTADO_NOVEDAD,
  DESCRIPCION_ESTADO_NOVEDAD,
  ETIQUETA_ESTADO_NOVEDAD,
  ETIQUETA_REPETICION,
  ETIQUETA_TIPO_NOVEDAD,
  mesAnioTexto,
  type NovedadTipo,
} from '~/utils/novedad-labels'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const cuentaStore = useCuentaCorrienteStore()
const toast = useToast()

const inmueblePorId = computed(() => new Map(cuentaStore.inmuebles.map((i) => [i.id, i.codigo])))
const tipoNovedadPorId = computed(
  () => new Map(cuentaStore.tiposNovedad.map((t) => [t.id, t.nombre])),
)

await useAsyncData('cuenta-corriente-novedades-base', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
  await Promise.all([
    cuentaStore.cargarInmuebles(tenantId),
    cuentaStore.cargarNovedades(tenantId),
    cuentaStore.cargarTiposNovedad(tenantId),
    cuentaStore.cargarNovedadCuotas(tenantId),
    cuentaStore.cargarPropietarios(tenantId),
  ])
  return null
})


type Novedad = (typeof cuentaStore.novedades)[number]

// ── filtro + búsqueda ──────────────────────────────────────────────────
const FILTROS = [
  { clave: 'pendiente', etiqueta: 'Pendientes' },
  { clave: 'aprobada', etiqueta: 'Aprobadas' },
  { clave: 'rechazada', etiqueta: 'Rechazadas' },
  { clave: 'todas', etiqueta: 'Todas' },
] as const
type ClaveFiltro = (typeof FILTROS)[number]['clave']

const conteoPorFiltro = computed<Record<ClaveFiltro, number>>(() => ({
  pendiente: cuentaStore.novedades.filter((n) => n.estado === 'pendiente').length,
  aprobada: cuentaStore.novedades.filter((n) => n.estado === 'aprobada').length,
  rechazada: cuentaStore.novedades.filter((n) => n.estado === 'rechazada').length,
  todas: cuentaStore.novedades.length,
}))

// Arranca en Pendientes solo si hay algo que atender; si no, mostrar una
// tabla vacía por defecto sería desconcertante.
const filtro = ref<ClaveFiltro>(conteoPorFiltro.value.pendiente > 0 ? 'pendiente' : 'todas')
const busqueda = ref('')

const novedadesFiltradas = computed<Novedad[]>(() => {
  const porEstado =
    filtro.value === 'todas'
      ? cuentaStore.novedades
      : cuentaStore.novedades.filter((n) => n.estado === filtro.value)

  const texto = busqueda.value.trim().toLowerCase()
  if (!texto) return porEstado
  return porEstado.filter(
    (n) =>
      n.descripcion.toLowerCase().includes(texto) ||
      (inmueblePorId.value.get(n.inmueble_id) ?? '').toLowerCase().includes(texto) ||
      (cuentaStore.propietariosPorInmueble.get(n.inmueble_id) ?? '').toLowerCase().includes(texto),
  )
})

// ── aprobar (única acción en línea) ────────────────────────────────────
// Confirmación de dos pasos EN LA MISMA fila, no un modal: aprobar
// materializa un cargo real en el ledger (ver cabecera del archivo), pero
// el caso real es despachar varias seguidas — un modal por cada una iría
// contra ese diseño deliberado. El primer clic solo "arma" el botón
// mostrando el monto exacto; el segundo clic, dentro de la ventana, aprueba
// de verdad. Armar otra fila, o dejar pasar la ventana, desarma esta.
const accionEnCursoId = ref<string | null>(null)
const errorAccion = ref<string | null>(null)
const confirmandoId = ref<string | null>(null)
let temporizadorConfirmacion: ReturnType<typeof setTimeout> | null = null

function desarmarConfirmacion(): void {
  confirmandoId.value = null
  if (temporizadorConfirmacion) {
    clearTimeout(temporizadorConfirmacion)
    temporizadorConfirmacion = null
  }
}

async function ejecutarAprobacion(novedadId: string): Promise<void> {
  errorAccion.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  accionEnCursoId.value = novedadId
  try {
    await cuentaStore.aprobarNovedad(novedadId, tenantId)
    toast.add({ title: 'Novedad aprobada', color: 'success' })
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo aprobar la novedad.')
  } finally {
    accionEnCursoId.value = null
  }
}

function aprobar(novedadId: string): void {
  if (confirmandoId.value === novedadId) {
    desarmarConfirmacion()
    void ejecutarAprobacion(novedadId)
    return
  }
  desarmarConfirmacion()
  confirmandoId.value = novedadId
  temporizadorConfirmacion = setTimeout(desarmarConfirmacion, 4000)
}

// ── "cuota N de M, saldo pendiente" por novedad prorrateable ───────────
const progresoCuotasPorNovedad = computed(() => {
  const mapa = new Map<string, { generadas: number; total: number; saldo: number }>()
  for (const cuota of cuentaStore.novedadCuotas) {
    const entrada = mapa.get(cuota.novedad_id) ?? { generadas: 0, total: 0, saldo: 0 }
    entrada.total += 1
    if (cuota.generada_at) entrada.generadas += 1
    else entrada.saldo += Number(cuota.monto_cuota)
    mapa.set(cuota.novedad_id, entrada)
  }
  return mapa
})

function repeticionTexto(novedad: Novedad): string {
  if (novedad.permanente) {
    return novedad.inhabilitada_at
      ? `${ETIQUETA_REPETICION.permanente} (inhabilitada)`
      : ETIQUETA_REPETICION.permanente
  }
  if (novedad.prorrateable) {
    const generadas = progresoCuotasPorNovedad.value.get(novedad.id)?.generadas ?? 0
    return `${generadas} de ${novedad.cuotas_totales} cuotas`
  }
  return ETIQUETA_REPETICION.ninguna
}

function saldoProrrateable(novedad: Novedad): number | null {
  if (!novedad.prorrateable) return null
  return progresoCuotasPorNovedad.value.get(novedad.id)?.saldo ?? 0
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-xl font-semibold mb-2">Novedades</h1>
        <p class="text-sm text-neutral-500 max-w-2xl">
          Cobros y abonos puntuales que no vienen del presupuesto — una sanción, una reparación,
          un descuento. Cada uno requiere aprobación: solo al aprobarlo se carga a la cuenta del
          inmueble.
        </p>
      </div>
      <UButton
        size="sm"
        :disabled="cuentaStore.inmuebles.length === 0"
        to="/novedades/nueva"
      >
        Nueva novedad
      </UButton>
    </div>

    <p v-if="cuentaStore.inmuebles.length === 0" class="text-neutral-500 text-sm">
      Esta copropiedad todavía no tiene inmuebles registrados.
    </p>

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <!-- flex + wrap, no grid de columnas iguales: con auto-cols-fr cada botón se achicaba al
             ancho de columna del contenedor, pero whitespace-nowrap seguía exigiendo su ancho de
             texto completo — en mobile el texto se derramaba sobre el botón vecino en vez de
             recortarse (confirmado en vivo: "Pendientes (0)" invadía "Aprobadas (6)"). Con flex
             cada botón mide su propio contenido y el conjunto pasa a una segunda fila si no cabe,
             en vez de comprimir texto que no puede comprimirse. -->
        <div
          class="flex flex-wrap gap-0.5 p-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-sm"
        >
          <button
            v-for="opcion in FILTROS"
            :key="opcion.clave"
            type="button"
            class="px-3 py-1 rounded transition-colors whitespace-nowrap"
            :aria-pressed="filtro === opcion.clave"
            :class="
              filtro === opcion.clave
                ? 'bg-white dark:bg-neutral-900 shadow-sm font-medium'
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            "
            @click="filtro = opcion.clave"
          >
            {{ opcion.etiqueta }} ({{ conteoPorFiltro[opcion.clave] }})
          </button>
        </div>

        <UInput
          v-model="busqueda"
          placeholder="Buscar por inmueble, propietario o descripción…"
          size="sm"
          class="w-64"
          :ui="{ trailing: 'pr-8' }"
        >
          <template v-if="busqueda" #trailing>
            <button
              type="button"
              class="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              @click="busqueda = ''"
            >
              <UIcon name="i-lucide-x" class="size-3.5" />
            </button>
          </template>
        </UInput>
      </div>

      <UAlert v-if="errorAccion" color="error" variant="soft" :title="errorAccion" />

      <p v-if="cuentaStore.novedades.length === 0" class="text-neutral-500 text-sm">
        Todavía no hay novedades registradas.
      </p>
      <p v-else-if="novedadesFiltradas.length === 0" class="text-neutral-500 text-sm">
        Ninguna novedad coincide con este filtro.
      </p>
      <UiTabla
        v-else
        :columnas="[
          { clave: 'periodo', etiqueta: 'Periodo' },
          { clave: 'inmueble', etiqueta: 'Inmueble' },
          { clave: 'descripcion', etiqueta: 'Descripción' },
          { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha' },
          { clave: 'repeticion', etiqueta: 'Repetición' },
          { clave: 'estado', etiqueta: 'Estado' },
          { clave: 'acciones', etiqueta: '' },
        ]"
        :filas="novedadesFiltradas"
        :clave-fila="(novedad) => novedad.id"
        vacio="Ninguna."
      >
        <template #celda-periodo="{ fila }">
          <span class="whitespace-nowrap">{{ mesAnioTexto(fila.fecha_efectiva) }}</span>
        </template>
        <template #celda-inmueble="{ fila }">
          <div class="leading-tight">
            <span class="whitespace-nowrap">
              {{ inmueblePorId.get(fila.inmueble_id) ?? fila.inmueble_id }}
            </span>
            <p
              v-if="cuentaStore.propietariosPorInmueble.get(fila.inmueble_id)"
              class="text-xs text-neutral-400"
            >
              {{ cuentaStore.propietariosPorInmueble.get(fila.inmueble_id) }}
            </p>
          </div>
        </template>
        <template #celda-descripcion="{ fila }">
          <div class="leading-tight">
            <NuxtLink :to="`/novedades/${fila.id}`" class="hover:underline">
              {{ fila.descripcion }}
            </NuxtLink>
            <p class="text-xs text-neutral-400">
              {{ ETIQUETA_TIPO_NOVEDAD[fila.tipo as NovedadTipo] ?? fila.tipo
              }}<template v-if="fila.tipo_novedad_id">
                · {{ tipoNovedadPorId.get(fila.tipo_novedad_id) ?? '—' }}</template>
            </p>
          </div>
        </template>
        <template #celda-monto="{ fila }">
          <span
            class="tabular-nums whitespace-nowrap"
            :class="Number(fila.monto) < 0 ? 'text-success-600 dark:text-success-500' : ''"
          >
            {{ formatoMoneda(fila.monto) }}
          </span>
        </template>
        <template #celda-repeticion="{ fila }">
          <div class="leading-tight">
            <span class="text-neutral-500">{{ repeticionTexto(fila) }}</span>
            <p v-if="fila.prorrateable" class="text-xs text-neutral-400">
              saldo {{ formatoMoneda(saldoProrrateable(fila) ?? 0) }}
            </p>
          </div>
        </template>
        <template #celda-estado="{ fila }">
          <UBadge
            :color="COLOR_ESTADO_NOVEDAD[fila.estado] ?? 'neutral'"
            variant="subtle"
            :title="DESCRIPCION_ESTADO_NOVEDAD[fila.estado] ?? ''"
          >
            {{ ETIQUETA_ESTADO_NOVEDAD[fila.estado] ?? fila.estado }}
          </UBadge>
        </template>
        <template #celda-acciones="{ fila }">
          <div class="flex justify-end gap-2">
            <UButton
              v-if="fila.estado === 'pendiente'"
              size="xs"
              :variant="confirmandoId === fila.id ? 'solid' : 'soft'"
              :color="confirmandoId === fila.id ? 'warning' : 'primary'"
              :loading="accionEnCursoId === fila.id"
              @click="aprobar(fila.id)"
            >
              {{ confirmandoId === fila.id ? `¿Aprobar ${formatoMoneda(fila.monto)}?` : 'Aprobar' }}
            </UButton>
            <UButton size="xs" variant="ghost" :to="`/novedades/${fila.id}`">Ver</UButton>
          </div>
        </template>
      </UiTabla>
    </template>
  </div>
</template>
