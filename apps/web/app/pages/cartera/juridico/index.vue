<script setup lang="ts">
// Casos jurídicos (CAR §15.3, bloque 20) — remisión a proceso ejecutivo
// desde una certificación vigente. certificacion_id NOT NULL en
// casos_juridicos (20260822340000) convierte el art. 48 en una restricción
// de integridad referencial: sin certificación vigente no hay caso, y esta
// pantalla no deja avanzar sin una.
import { useCasosJuridicosStore, type EstadoCasoJuridico } from '~/stores/casosJuridicos'
import { useCertificacionesStore } from '~/stores/certificaciones'
import { useCuentaCorrienteStore } from '~/stores/cuentaCorriente'
import { useTercerosStore } from '~/stores/terceros'
import { formatoMoneda } from '~/utils/formato'
import { generarChips, type CampoFiltro, type ValorFiltro } from '~/composables/useFiltros'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const casosStore = useCasosJuridicosStore()
const certStore = useCertificacionesStore()
const cuentaStore = useCuentaCorrienteStore()
const tercerosStore = useTercerosStore()
const toast = useToast()

const errorCarga = ref<string | null>(null)

function hoyISO(): string {
  const d = new Date()
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ETIQUETA_ESTADO: Record<EstadoCasoJuridico, string> = {
  remitido: 'Remitido',
  documentacion: 'Reuniendo documentación',
  radicado: 'Radicado',
  admitido: 'Admitido',
  en_tramite: 'En trámite',
  medidas_cautelares: 'Medidas cautelares',
  conciliacion: 'Conciliación',
  sentencia: 'Sentencia',
  ejecucion: 'Ejecución',
  terminado: 'Terminado',
  desistido: 'Desistido',
  archivado: 'Archivado',
}

const COLOR_ESTADO: Record<EstadoCasoJuridico, 'neutral' | 'success' | 'warning' | 'error'> = {
  remitido: 'neutral',
  documentacion: 'neutral',
  radicado: 'warning',
  admitido: 'warning',
  en_tramite: 'warning',
  medidas_cautelares: 'warning',
  conciliacion: 'warning',
  sentencia: 'warning',
  ejecucion: 'warning',
  terminado: 'success',
  desistido: 'error',
  archivado: 'neutral',
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  try {
    await Promise.all([
      casosStore.cargarCasos(tenantId),
      certStore.cargar(tenantId),
      cuentaStore.cargarInmuebles(tenantId),
      tercerosStore.cargarPersonasTenant(tenantId),
    ])
  } catch (excepcion) {
    errorCarga.value = excepcion instanceof Error ? excepcion.message : 'No se pudo cargar la información.'
  }
}

await useAsyncData('cartera-juridico-inicial', async () => {
  await cargar()
  return null
})

watch(() => tenantStore.activeTenant?.id, cargar)

const inmueblePorId = computed(() => new Map(cuentaStore.inmuebles.map((i) => [i.id, i.codigo])))

const opcionesInmueble = computed(() =>
  cuentaStore.inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo })),
)

const opcionesAbogado = computed(() => [
  { valor: null, etiqueta: 'Sin asignar' },
  ...tercerosStore.personasTenant
    .filter((p) => p.rol.codigo === 'abogado' && (p.vigente_hasta === null || p.vigente_hasta >= hoyISO()))
    .map((p) => ({ valor: p.tercero_id, etiqueta: p.tercero.nombre_completo ?? p.tercero_id })),
])

// ── filtros (ver CLAUDE.md, "Panel de filtros reutilizable") ──────────
// Esta pantalla no tenía NINGÚN filtro sobre una tabla de 7 columnas — imposible de acotar con
// más de un puñado de casos. Abogado queda fijo e instantáneo (el lookup más común: "mis casos
// asignados"), con su propio set de opciones — `null` significa "todos" acá, no "sin asignar"
// como en `opcionesAbogado` del modal de creación, así que "sin asignar" necesita su propio
// sentinel (mismo criterio que SIN_AGRUPAR en inmuebles/novedades). El resto va al panel: Estado
// (enum real de 12 valores, nunca filtrable hoy), Ciudad (derivada de los valores reales ya
// cargados, no hay catálogo formal), Monto de la pretensión (rango) y "Solo sin radicar" (booleano
// sobre numero_radicado, útil para ubicar casos pendientes de una acción).
const busqueda = ref('')
const SIN_ABOGADO = '__sin_abogado__'

const opcionesFiltroAbogado = computed(() => [
  { valor: null, etiqueta: 'Todos los abogados' },
  { valor: SIN_ABOGADO, etiqueta: 'Sin asignar' },
  ...tercerosStore.personasTenant
    .filter((p) => p.rol.codigo === 'abogado' && (p.vigente_hasta === null || p.vigente_hasta >= hoyISO()))
    .map((p) => ({ valor: p.tercero_id, etiqueta: p.tercero.nombre_completo ?? p.tercero_id })),
])

const OPCIONES_ESTADO_FILTRO: Array<{ valor: string; etiqueta: string }> = Object.entries(ETIQUETA_ESTADO).map(
  ([valor, etiqueta]) => ({ valor, etiqueta }),
)

const opcionesCiudadFiltro = computed(() => {
  const vistas = new Set<string>()
  for (const c of casosStore.casos) if (c.ciudad) vistas.add(c.ciudad)
  return Array.from(vistas)
    .sort()
    .map((ciudad) => ({ valor: ciudad, etiqueta: ciudad }))
})

interface FiltrosJuridico extends Record<string, ValorFiltro> {
  abogado: string | null
  estado: Array<string | number>
  ciudad: Array<string | number>
  montoPretension: { min: number | null; max: number | null }
  sinRadicar: boolean
}

const FILTROS_INICIALES: FiltrosJuridico = {
  abogado: null,
  estado: [],
  ciudad: [],
  montoPretension: { min: null, max: null },
  sinRadicar: false,
}

const filtros = useFiltros<FiltrosJuridico>(FILTROS_INICIALES)
const panelFiltrosAbierto = ref(false)

const filtroAbogadoId = computed({
  get: () => filtros.aplicados.value.abogado,
  set: (v: string | null) => filtros.actualizarInmediato('abogado', v),
})

const schemaFiltros = computed<CampoFiltro[]>(() => [
  { clave: 'estado', etiqueta: 'Estado', tipo: 'multiselect', icono: 'i-lucide-scale', opciones: OPCIONES_ESTADO_FILTRO },
  {
    clave: 'ciudad', etiqueta: 'Ciudad', tipo: 'multiselect', icono: 'i-lucide-map-pin',
    opciones: opcionesCiudadFiltro.value,
    mensajeVacio: 'Todavía no hay casos con ciudad registrada.',
  },
  {
    clave: 'montoPretension', etiqueta: 'Monto de la pretensión', tipo: 'rango', icono: 'i-lucide-circle-dollar-sign',
    formato: 'moneda',
  },
  { clave: 'sinRadicar', etiqueta: 'Solo sin radicar', tipo: 'boolean', icono: 'i-lucide-file-x' },
])

// Solo cubre los campos del panel a propósito — Abogado ya está siempre visible en su propio
// control, un chip para él sería redundante (mismo criterio que en inmuebles/novedades).
const chipsFiltros = computed(() => generarChips(schemaFiltros.value, filtros.aplicados.value, FILTROS_INICIALES))

const hayFiltrosActivos = computed(() => busqueda.value.trim().length > 0 || filtros.activos.value)

function limpiarFiltros(): void {
  busqueda.value = ''
  filtros.limpiarTodo()
}

const casosFiltrados = computed(() => {
  const f = filtros.aplicados.value

  const porAbogado = casosStore.casos.filter((c) => {
    if (f.abogado === null) return true
    if (f.abogado === SIN_ABOGADO) return !c.abogado_tercero_id
    return c.abogado_tercero_id === f.abogado
  })

  const porEstado = f.estado.length === 0 ? porAbogado : porAbogado.filter((c) => f.estado.includes(c.estado))

  const porCiudad = f.ciudad.length === 0 ? porEstado : porEstado.filter((c) => c.ciudad !== null && f.ciudad.includes(c.ciudad))

  const porMonto = porCiudad.filter((c) => {
    const monto = Number(c.monto_pretension)
    if (f.montoPretension.min !== null && monto < f.montoPretension.min) return false
    if (f.montoPretension.max !== null && monto > f.montoPretension.max) return false
    return true
  })

  const porRadicado = f.sinRadicar ? porMonto.filter((c) => !c.numero_radicado) : porMonto

  const texto = busqueda.value.trim().toLowerCase()
  if (!texto) return porRadicado
  return porRadicado.filter(
    (c) =>
      (c.consecutivo ?? '').toLowerCase().includes(texto) ||
      (inmueblePorId.value.get(c.inmueble_id) ?? '').toLowerCase().includes(texto) ||
      (c.numero_radicado ?? '').toLowerCase().includes(texto) ||
      (c.juzgado ?? '').toLowerCase().includes(texto),
  )
})

// ── nuevo caso ────────────────────────────────────────────────────────
const modalNuevoAbierto = ref(false)
const nuevoInmuebleId = ref<string | null>(null)
const nuevaCertificacionId = ref<string | null>(null)
const nuevaFechaRemision = ref(hoyISO())
const nuevoAbogadoId = ref<string | null>(null)
const nuevoRadicado = ref('')
const nuevoJuzgado = ref('')
const nuevaCiudad = ref('')
const nuevoMontoPretension = ref<number | null>(null)
const nuevaFechaPretension = ref(hoyISO())

const certificacionesDelInmueble = computed(() =>
  certStore.certificaciones.filter((c) => c.inmueble_id === nuevoInmuebleId.value && c.estado === 'vigente'),
)

const opcionesCertificacion = computed(() =>
  certificacionesDelInmueble.value.map((c) => ({
    valor: c.id,
    etiqueta: `${c.consecutivo} · ${formatoMoneda(c.monto_total)}`,
  })),
)

watch(nuevoInmuebleId, () => {
  nuevaCertificacionId.value = null
})

function abrirNuevo(): void {
  nuevoInmuebleId.value = null
  nuevaCertificacionId.value = null
  nuevaFechaRemision.value = hoyISO()
  nuevoAbogadoId.value = null
  nuevoRadicado.value = ''
  nuevoJuzgado.value = ''
  nuevaCiudad.value = ''
  nuevoMontoPretension.value = null
  nuevaFechaPretension.value = hoyISO()
  modalNuevoAbierto.value = true
}

const puedeCrear = computed(
  () => nuevoInmuebleId.value !== null && nuevaCertificacionId.value !== null && (nuevoMontoPretension.value ?? 0) > 0,
)

async function crearCaso(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nuevoInmuebleId.value || !nuevaCertificacionId.value || !puedeCrear.value) return
  try {
    await casosStore.crearCaso(tenantId, {
      inmuebleId: nuevoInmuebleId.value,
      certificacionId: nuevaCertificacionId.value,
      fechaRemision: nuevaFechaRemision.value,
      abogadoTerceroId: nuevoAbogadoId.value,
      numeroRadicado: nuevoRadicado.value.trim() || null,
      juzgado: nuevoJuzgado.value.trim() || null,
      ciudad: nuevaCiudad.value.trim() || null,
      montoPretension: nuevoMontoPretension.value ?? 0,
      fechaPretension: nuevaFechaPretension.value,
    })
    toast.add({ title: 'Caso remitido a jurídico', color: 'success' })
    modalNuevoAbierto.value = false
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo remitir el caso',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  }
}

// El detalle vive en su propia ruta (/cartera/juridico/[id]), no en un
// drawer sobre esta tabla: un caso jurídico se trabaja durante semanas y
// necesita poder enlazarse y recargarse por sí solo.
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Casos jurídicos</h1>
        </template>
        <template #descripcion>
          Remisión a proceso ejecutivo (art. 422 y ss. CGP) desde una certificación de deuda
          vigente. Sin certificación no hay caso — la Ley 675 exige el título ejecutivo.
        </template>
      </UiTituloDescripcion>
      <UButton icon="i-lucide-scale" @click="abrirNuevo">Remitir a jurídico</UButton>
    </div>

    <UAlert
      v-if="errorCarga"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="No se pudo cargar"
      :description="errorCarga"
    />

    <!-- ── filtros (ver CLAUDE.md, "Panel de filtros reutilizable"): Abogado fijo e
         instantáneo, el resto al panel. ──────────────────────────────────────── -->
    <div class="flex items-center justify-between gap-2 flex-wrap">
      <div class="flex items-center gap-2 flex-wrap">
        <UInput
          v-model="busqueda"
          size="sm"
          icon="i-lucide-search"
          placeholder="Buscar por caso, inmueble, radicado o juzgado…"
          class="w-64"
        >
          <template v-if="busqueda" #trailing>
            <UButton size="xs" variant="ghost" icon="i-lucide-x" title="Limpiar búsqueda" @click="busqueda = ''" />
          </template>
        </UInput>

        <UiSelectorBuscable v-model="filtroAbogadoId" :opciones="opcionesFiltroAbogado" class="w-48" />

        <UButton variant="outline" size="sm" icon="i-lucide-sliders-horizontal" @click="panelFiltrosAbierto = true">
          Filtros
          <UBadge v-if="chipsFiltros.length > 0" size="xs" color="primary" variant="solid">{{ chipsFiltros.length }}</UBadge>
        </UButton>

        <UButton
          v-if="hayFiltrosActivos"
          size="sm"
          variant="ghost"
          icon="i-lucide-x"
          title="Limpiar filtros"
          @click="limpiarFiltros"
        />
      </div>
    </div>

    <UiChipsFiltros
      :chips="chipsFiltros"
      :total="casosFiltrados.length"
      @quitar="filtros.quitar($event as keyof FiltrosJuridico)"
      @limpiar="filtros.limpiarTodo()"
    />

    <UiPanelFiltros
      v-model:abierto="panelFiltrosAbierto"
      v-model="filtros.borrador.value"
      :schema="schemaFiltros"
      titulo="Filtros de casos jurídicos"
      @aplicar="filtros.aplicar()"
      @limpiar="filtros.limpiarTodo()"
    />

    <p v-if="casosStore.casos.length === 0" class="text-neutral-500 text-sm">
      Todavía no se ha remitido ningún caso a jurídico.
    </p>
    <p v-else-if="casosFiltrados.length === 0" class="text-neutral-500 text-sm">
      Ningún caso coincide con este filtro.
    </p>
    <UiTabla
      v-else
      variante="tailwind"
      :columnas="[
        { clave: 'consecutivo', etiqueta: 'Caso' },
        { clave: 'inmueble', etiqueta: 'Inmueble' },
        { clave: 'estado', etiqueta: 'Estado' },
        { clave: 'radicado', etiqueta: 'Radicado' },
        { clave: 'proxima', etiqueta: 'Próxima actuación' },
        { clave: 'pretension', etiqueta: 'Pretensión', alinear: 'derecha' },
        { clave: 'recuperado', etiqueta: 'Recuperado', alinear: 'derecha' },
      ]"
      :filas="casosFiltrados"
      :clave-fila="(fila) => fila.id"
      :cargando="casosStore.loading"
      vacio="Todavía no se ha remitido ningún caso a jurídico."
    >
      <template #celda-consecutivo="{ fila }">
        <NuxtLink
          :to="`/cartera/juridico/${fila.id}`"
          class="font-medium text-primary-600 hover:underline"
        >
          {{ fila.consecutivo ?? '—' }}
        </NuxtLink>
      </template>
      <template #celda-inmueble="{ fila }">
        {{ inmueblePorId.get(fila.inmueble_id) ?? fila.inmueble_id }}
      </template>
      <template #celda-estado="{ fila }">
        <UBadge size="sm" variant="subtle" :color="COLOR_ESTADO[fila.estado]">
          {{ ETIQUETA_ESTADO[fila.estado] }}
        </UBadge>
      </template>
      <template #celda-radicado="{ fila }">
        {{ fila.numero_radicado ?? '—' }}
      </template>
      <template #celda-proxima="{ fila }">
        {{ fila.fecha_proxima_actuacion ?? '—' }}
      </template>
      <template #celda-pretension="{ fila }">
        <span class="tabular-nums">{{ formatoMoneda(fila.monto_pretension) }}</span>
      </template>
      <template #celda-recuperado="{ fila }">
        <span class="tabular-nums">{{ formatoMoneda(fila.monto_recuperado) }}</span>
      </template>
    </UiTabla>

    <!-- ── nuevo caso ────────────────────────────────────────────────── -->
    <UModal v-model:open="modalNuevoAbierto" title="Remitir a jurídico">
      <template #body>
        <div class="space-y-3 text-sm">
          <UFormField label="Inmueble" name="inmueble">
            <UiSelectorBuscable v-model="nuevoInmuebleId" :opciones="opcionesInmueble" placeholder="Selecciona un inmueble…" />
          </UFormField>

          <UFormField v-if="nuevoInmuebleId" label="Certificación de deuda vigente" name="certificacion">
            <UiSelectorBuscable
              v-model="nuevaCertificacionId"
              :opciones="opcionesCertificacion"
              placeholder="Selecciona una certificación…"
            />
            <p v-if="certificacionesDelInmueble.length === 0" class="text-xs text-warning-600 mt-1">
              Este inmueble no tiene una certificación de deuda vigente.
              <NuxtLink to="/cartera/certificaciones" class="underline">Emite una primero</NuxtLink>.
            </p>
          </UFormField>

          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Fecha de remisión" name="fecha_remision">
              <UInput v-model="nuevaFechaRemision" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Abogado (opcional)" name="abogado">
              <UiSelectorBuscable v-model="nuevoAbogadoId" :opciones="opcionesAbogado" placeholder="Sin asignar" />
            </UFormField>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <UFormField label="Radicado (opcional)" name="numero_radicado">
              <UInput v-model="nuevoRadicado" class="w-full" />
            </UFormField>
            <UFormField label="Juzgado (opcional)" name="juzgado">
              <UInput v-model="nuevoJuzgado" class="w-full" />
            </UFormField>
            <UFormField label="Ciudad (opcional)" name="ciudad">
              <UInput v-model="nuevaCiudad" class="w-full" />
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Monto de la pretensión" name="monto_pretension">
              <UInput v-model.number="nuevoMontoPretension" type="number" min="0" step="0.01" class="w-full" />
            </UFormField>
            <UFormField label="Fecha de la pretensión" name="fecha_pretension">
              <UInput v-model="nuevaFechaPretension" type="date" class="w-full" />
            </UFormField>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" color="neutral" @click="modalNuevoAbierto = false">Cancelar</UButton>
            <UButton :loading="casosStore.guardando" :disabled="!puedeCrear" @click="crearCaso">
              Remitir a jurídico
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

  </div>
</template>
