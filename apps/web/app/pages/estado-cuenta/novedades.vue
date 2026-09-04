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
const agrupacionesStore = useAgrupacionesStore()
const toast = useToast()

const inmueblePorId = computed(() => new Map(cuentaStore.inmuebles.map((i) => [i.id, i.codigo])))
const tipoNovedadPorId = computed(
  () => new Map(cuentaStore.tiposNovedad.map((t) => [t.id, t.nombre])),
)
const agrupacionPorInmueble = computed(
  () => new Map(cuentaStore.inmuebles.map((i) => [i.id, i.agrupacion_id])),
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
    agrupacionesStore.cargarTiposAgrupacion(tenantId),
    agrupacionesStore.cargarAgrupaciones(tenantId),
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
const SIN_AGRUPAR = '__sin_agrupar__'
const filtroAgrupacionId = ref<string | null>(null)
const filtroFecha = ref('')

const novedadesFiltradas = computed<Novedad[]>(() => {
  const porEstado =
    filtro.value === 'todas'
      ? cuentaStore.novedades
      : cuentaStore.novedades.filter((n) => n.estado === filtro.value)

  const porAgrupacion = porEstado.filter((n) => {
    if (filtroAgrupacionId.value === null) return true
    const agrupacionId = agrupacionPorInmueble.value.get(n.inmueble_id)
    return filtroAgrupacionId.value === SIN_AGRUPAR
      ? !agrupacionId
      : agrupacionId === filtroAgrupacionId.value
  })

  const porFecha = !filtroFecha.value
    ? porAgrupacion
    : porAgrupacion.filter((n) => n.created_at.slice(0, 10) === filtroFecha.value)

  const texto = busqueda.value.trim().toLowerCase()
  if (!texto) return porFecha
  return porFecha.filter(
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
    const texto = `${generadas} de ${novedad.cuotas_totales} cuotas`
    return novedad.inhabilitada_at ? `${texto} (inhabilitada)` : texto
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
    <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 mt-1 max-w-2xl">
      <template #titulo>
        <h1 class="text-xl font-semibold">Novedades</h1>
      </template>
      <template #descripcion>
        Cobros y abonos puntuales que no vienen del presupuesto — una sanción, una reparación,
        un descuento. Cada uno requiere aprobación: solo al aprobarlo se carga a la cuenta del
        inmueble.
      </template>
    </UiTituloDescripcion>

    <p v-if="cuentaStore.inmuebles.length === 0" class="text-neutral-500 text-sm">
      Esta copropiedad todavía no tiene inmuebles registrados.
    </p>

    <template v-else>
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="flex flex-wrap items-end gap-2">
          <UFormField label="Buscar">
            <UInput
              v-model="busqueda"
              placeholder="Buscar por inmueble, propietario o descripción…"
              size="sm"
              class="w-64"
            >
              <template v-if="busqueda" #trailing>
                <UButton
                  size="xs"
                  variant="ghost"
                  icon="i-lucide-x"
                  title="Limpiar búsqueda"
                  @click="busqueda = ''"
                />
              </template>
            </UInput>
          </UFormField>

          <UFormField label="Agrupación">
            <USelect
              v-model="filtroAgrupacionId"
              :items="[
                { label: 'Toda agrupación', value: null },
                { label: 'Sin agrupar', value: SIN_AGRUPAR },
                ...agrupacionesStore.arbolPlano.map((n) => ({ label: n.ruta, value: n.id })),
              ]"
              value-key="value"
              size="sm"
              class="w-56"
            />
          </UFormField>

          <UFormField label="Estado">
            <USelect
              v-model="filtro"
              :items="FILTROS.map((f) => ({ label: `${f.etiqueta} (${conteoPorFiltro[f.clave]})`, value: f.clave }))"
              value-key="value"
              size="sm"
              class="w-40"
            />
          </UFormField>

          <UFormField label="Fecha de creación">
            <UInput v-model="filtroFecha" type="date" size="sm" class="w-40" />
          </UFormField>
        </div>

        <UButton size="sm" to="/novedades/nueva">Nueva novedad</UButton>
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
            <NuxtLink :to="`/inmuebles/${fila.inmueble_id}`" class="whitespace-nowrap hover:text-primary hover:underline">
              {{ inmueblePorId.get(fila.inmueble_id) ?? fila.inmueble_id }}
            </NuxtLink>
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
            v-if="fila.inhabilitada_at"
            color="neutral"
            variant="subtle"
            title="Fue aprobada, pero ya no genera cargos ni cuotas nuevas."
          >
            Inhabilitada
          </UBadge>
          <UBadge
            v-else
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
