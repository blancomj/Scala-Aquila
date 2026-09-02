<script setup lang="ts">
// Ficha de inmueble — componente compartido entre /inmuebles/nuevo y
// /inmuebles/[id] (PROMPT_FICHA_INMUEBLE.md §5.1, §6.2). El modo es un
// computed derivado de si hay `inmuebleId` — nunca un prop de modo ni el
// switch demostrativo del mockup (ese es solo para revisar los dos
// estados en un archivo estático, no se implementa como componente).
//
// En modo creación, "Guardar inmueble" (acá en el masthead) dispara el
// guardado del formulario que vive dentro de InmuebleDatosBase — se
// expone vía defineExpose/template ref en vez de duplicar el estado del
// formulario en este componente (Propiedad Única: los campos de "Datos
// generales" son responsabilidad de InmuebleDatosBase).
import type { Database } from '@aquila/shared'

const props = defineProps<{ inmuebleId?: string }>()

const tenantStore = useTenantStore()
const inmueblesStore = useInmueblesStore()
const tercerosStore = useTercerosStore()
const cuentaStore = useCuentaCorrienteStore()
const recaudoStore = useRecaudoStore()

const esCreacion = computed(() => !props.inmuebleId)
const inmueble = computed(() => inmueblesStore.inmuebleActivo)

/** Copropietario vigente — se muestra junto a los tabs (no hace falta abrir
 * la pestaña Datos base solo para saber de quién es la unidad). */
const nombrePropietario = computed(() => {
  if (esCreacion.value) return null
  const copropietario = tercerosStore.tercerosAsociados.find(
    (p) => p.rol.codigo === 'copropietario' && !p.vigente_hasta,
  )
  return copropietario?.tercero.nombre_completo ?? null
})

type Tab = 'base' | 'cartera' | 'novedades' | 'liquidaciones' | 'historicos' | 'documentos'
const TABS: ReadonlyArray<{ id: Tab; etiqueta: string }> = [
  { id: 'base', etiqueta: 'Datos base' },
  { id: 'cartera', etiqueta: 'Cartera' },
  { id: 'novedades', etiqueta: 'Novedades activas' },
  { id: 'liquidaciones', etiqueta: 'Liquidaciones' },
  { id: 'historicos', etiqueta: 'Históricos' },
  { id: 'documentos', etiqueta: 'Documentos' },
]
const tabActiva = ref<Tab>('base')

function irATab(tab: Tab): void {
  if (esCreacion.value && tab !== 'base') return
  tabActiva.value = tab
}

const TIPO_ETIQUETA: Record<string, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
}

const guardando = ref(false)
const error = ref<string | null>(null)

const datosBaseRef = ref<{ guardar: () => Promise<string>; alternarEdicion: () => void } | null>(
  null,
)

function editarFicha(): void {
  tabActiva.value = 'base'
  datosBaseRef.value?.alternarEdicion()
}

// ── Registrar pago — modal propio (2026-08-27): antes el botón del
// masthead solo saltaba a la pestaña Cartera, que tenía el formulario
// embebido al final (había que hacer scroll para verlo). Ahora abre
// directo la ventana específica, sin importar en qué pestaña esté el
// usuario ni si la pestaña Cartera está montada.
const modalPagoAbierto = ref(false)

function abrirRegistrarPago(): void {
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) cuentaStore.cargarFormasPago(tenantId)
  modalPagoAbierto.value = true
}

// La pestaña Cartera lee cuentaStore/recaudoStore directo (sin copia local),
// así que recargarlos aquí la refresca sola si el usuario la tiene abierta
// o vuelve a ella — no hace falta coordinarse con InmuebleCartera.vue.
async function alRegistrarPago(): Promise<void> {
  modalPagoAbierto.value = false
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !props.inmuebleId) return
  await Promise.all([
    cuentaStore.cargarCargosAbiertos(tenantId, props.inmuebleId),
    cuentaStore.cargarPagos(tenantId, props.inmuebleId),
    recaudoStore.cargarRecaudo(tenantId, { inmuebleId: props.inmuebleId }),
  ])
}

async function cargarTodo(id: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    inmueblesStore.cargarInmueble(tenantId, id),
    tercerosStore.cargarTercerosAsociados(tenantId, id),
  ])
}

watch(
  () => props.inmuebleId,
  (id) => {
    if (id) {
      cargarTodo(id)
    } else {
      inmueblesStore.limpiar()
      tercerosStore.limpiar()
    }
  },
  { immediate: true },
)

async function guardarInmueble(): Promise<void> {
  if (!datosBaseRef.value) return
  error.value = null
  guardando.value = true
  try {
    const nuevoId = await datosBaseRef.value.guardar()
    await navigateTo(`/inmuebles/${nuevoId}`)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el inmueble.')
  } finally {
    guardando.value = false
  }
}

async function inactivarInmueble(): Promise<void> {
  if (!inmueble.value) return
  await inmueblesStore.actualizarInmueble({
    id: inmueble.value.id,
    codigo: inmueble.value.codigo,
    tipoId: inmueble.value.tipo_id,
    estado: 'inactivo',
    matriculaInmobiliaria: inmueble.value.matricula_inmobiliaria ?? undefined,
    areaPrivada: inmueble.value.area_privada ?? undefined,
    areaComun: inmueble.value.area_comun ?? undefined,
    estadoLegalId: inmueble.value.estado_legal_id,
    estadoLegalObservaciones: inmueble.value.estado_legal_observaciones ?? undefined,
    habitabilidadId: inmueble.value.habitabilidad_id,
  })
}

type EstadoInmueble = Database['public']['Enums']['inmueble_estado_t']
function colorEstado(estado: EstadoInmueble): 'success' | 'neutral' {
  return estado === 'activo' ? 'success' : 'neutral'
}

const menuInmueble = [
  [
    { label: 'Inactivar inmueble', onSelect: inactivarInmueble },
    { label: 'Duplicar inmueble', disabled: true },
    { label: 'Exportar ficha (PDF)', disabled: true },
  ],
]

const tabItems = computed(() =>
  TABS.map((tab) => ({ label: tab.etiqueta, value: tab.id, disabled: esCreacion.value && tab.id !== 'base' })),
)
</script>

<template>
  <div class="ficha-inmueble">
    <div class="sheet">
      <div class="flex items-baseline justify-between gap-4">
        <p class="breadcrumb" style="margin: 0">
          <NuxtLink to="/inmuebles">Inmuebles</NuxtLink>
          <span>›</span>
          <strong>{{ esCreacion ? 'Nuevo' : (inmueble?.codigo ?? '…') }}</strong>
        </p>
        <p class="eyebrow" style="margin: 0">Ficha de inmueble</p>
      </div>

      <div class="masthead mt-2">
        <div>
          <div class="title-row">
            <h1>{{ esCreacion ? 'Nuevo inmueble' : (inmueble?.codigo ?? '…') }}</h1>
            <div v-if="!esCreacion && inmueble" class="title-badges">
              <UBadge :color="colorEstado(inmueble.estado)" variant="subtle">
                {{ TIPO_ETIQUETA[inmueble.estado] ?? inmueble.estado }}
              </UBadge>
            </div>
            <p v-if="nombrePropietario" class="text-sm text-neutral-500 whitespace-nowrap shrink-0 ml-2">
              <UIcon name="i-lucide-user" class="size-3.5 align-[-2px]" />
              {{ nombrePropietario }}
            </p>
          </div>
        </div>

        <div v-if="!esCreacion" class="masthead-actions flex items-center gap-2">
          <UButton v-if="inmuebleId" variant="outline" color="neutral" :to="`/novedades/nueva?inmuebleId=${inmuebleId}`">
            Nueva novedad
          </UButton>
          <UButton variant="outline" color="neutral" @click="abrirRegistrarPago">Registrar pago</UButton>
          <UButton @click="editarFicha">Editar ficha</UButton>
          <UDropdownMenu :items="menuInmueble">
            <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" aria-label="Más acciones" />
          </UDropdownMenu>
        </div>

        <div v-else class="masthead-actions flex items-center gap-2">
          <UButton variant="outline" color="neutral" to="/inmuebles">Cancelar</UButton>
          <UButton :loading="guardando" @click="guardarInmueble">Guardar inmueble</UButton>
        </div>
      </div>

      <div class="rule-double" />

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mb-3" />

      <div v-if="!esCreacion && inmueble" class="specstrip">
        <div class="spec-item">
          <p class="spec-label">Matrícula inmobiliaria</p>
          <p class="spec-value">{{ inmueble.matricula_inmobiliaria ?? '—' }}</p>
        </div>
        <div class="spec-item">
          <p class="spec-label">Área privada</p>
          <p class="spec-value">{{ inmueble.area_privada ?? '—' }} m²</p>
        </div>
        <div class="spec-item">
          <p class="spec-label">Área común asignada</p>
          <p class="spec-value">{{ inmueble.area_comun ?? '—' }} m²</p>
        </div>
        <div class="spec-item">
          <p class="spec-label">Coeficiente vigente</p>
          <p class="spec-value">
            {{ inmueblesStore.coeficienteVigente ? `${inmueblesStore.coeficienteVigente.valor}` : '—' }}
          </p>
        </div>
        <div class="spec-item">
          <p class="spec-label">Saldo cartera</p>
          <p class="spec-value">Ver pestaña Cartera</p>
        </div>
      </div>
      <p v-else class="create-hint">
        Los indicadores de cartera, coeficiente y propietarios aparecen aquí después de guardar
        el inmueble.
      </p>

      <div class="flex items-center gap-4">
        <UTabs
          :items="tabItems"
          :model-value="tabActiva"
          variant="link"
          :content="false"
          class="flex-1 min-w-0"
          @update:model-value="(v) => irATab(v as Tab)"
        />
      </div>
      <p v-if="esCreacion" class="create-hint">
        Disponibles después de guardar: cartera, novedades, liquidaciones, históricos y
        documentos.
      </p>

      <div class="panels">
        <section v-if="tabActiva === 'base'">
          <InmueblesInmuebleDatosBase
            ref="datosBaseRef"
            :inmueble-id="inmuebleId"
            :es-creacion="esCreacion"
          />
        </section>
        <section v-else-if="tabActiva === 'cartera' && inmuebleId">
          <InmueblesInmuebleCartera :inmueble-id="inmuebleId" />
        </section>
        <section v-else-if="tabActiva === 'novedades' && inmuebleId">
          <InmueblesInmuebleNovedades ref="novedadesRef" :inmueble-id="inmuebleId" />
        </section>
        <section v-else-if="tabActiva === 'liquidaciones' && inmuebleId">
          <InmueblesInmuebleLiquidaciones :inmueble-id="inmuebleId" />
        </section>
        <section v-else-if="tabActiva === 'historicos' && inmuebleId">
          <InmueblesInmuebleHistoricos :inmueble-id="inmuebleId" />
        </section>
        <section v-else-if="tabActiva === 'documentos' && inmuebleId">
          <InmueblesInmuebleDocumentos :inmueble-id="inmuebleId" />
        </section>
      </div>
    </div>

    <UModal
      v-if="inmuebleId"
      :open="modalPagoAbierto"
      title="Registrar pago"
      @update:open="(abierto) => { if (!abierto) modalPagoAbierto = false }"
    >
      <template #body>
        <PagosRegistrarPagoForm :inmueble-id="inmuebleId" @registrado="alRegistrarPago" />
      </template>
    </UModal>
  </div>
</template>
