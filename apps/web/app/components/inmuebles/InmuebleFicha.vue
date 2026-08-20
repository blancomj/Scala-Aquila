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

const esCreacion = computed(() => !props.inmuebleId)
const inmueble = computed(() => inmueblesStore.inmuebleActivo)

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

const menuAbierto = ref(false)
const guardando = ref(false)
const error = ref<string | null>(null)

const datosBaseRef = ref<{ guardar: () => Promise<string>; alternarEdicion: () => void } | null>(
  null,
)

function editarFicha(): void {
  tabActiva.value = 'base'
  datosBaseRef.value?.alternarEdicion()
}

async function cargarTodo(id: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await inmueblesStore.cargarInmueble(tenantId, id)
}

watch(
  () => props.inmuebleId,
  (id) => {
    if (id) cargarTodo(id)
    else inmueblesStore.limpiar()
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
  menuAbierto.value = false
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
function badgeEstado(estado: EstadoInmueble): 'tag--sello' | 'tag--gris' {
  return estado === 'activo' ? 'tag--sello' : 'tag--gris'
}
</script>

<template>
  <div class="ficha-inmueble">
    <div class="sheet">
      <p class="breadcrumb">
        <NuxtLink to="/inmuebles">Inmuebles</NuxtLink>
        <span>›</span>
        <strong>{{ esCreacion ? 'Nuevo' : (inmueble?.codigo ?? '…') }}</strong>
      </p>

      <div class="masthead">
        <div>
          <p class="eyebrow">Ficha de inmueble</p>
          <div class="title-row">
            <h1>{{ esCreacion ? 'Nuevo inmueble' : (inmueble?.codigo ?? '…') }}</h1>
            <div v-if="!esCreacion && inmueble" class="title-badges">
              <span class="tag" :class="badgeEstado(inmueble.estado)">
                {{ TIPO_ETIQUETA[inmueble.estado] ?? inmueble.estado }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="!esCreacion" class="masthead-actions">
          <button type="button" class="btn btn--ghost" @click="irATab('novedades')">Nueva novedad</button>
          <button type="button" class="btn btn--ghost" @click="irATab('cartera')">Registrar pago</button>
          <button type="button" class="btn btn--primary" @click="editarFicha">Editar ficha</button>
          <div style="position: relative">
            <button type="button" class="btn-icon" style="width: 33px; height: 33px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--sheet); cursor: pointer" aria-haspopup="true" @click="menuAbierto = !menuAbierto">⋮</button>
            <div v-if="menuAbierto" style="position: absolute; right: 0; top: calc(100% + 6px); background: var(--sheet); border: 1px solid var(--line-strong); border-radius: var(--radius); min-width: 190px; padding: 4px; z-index: 5; box-shadow: 0 4px 14px rgba(0,0,0,.08)">
              <button type="button" class="btn--danger" style="width: 100%; text-align: left; background: none; border: none; font-family: var(--font-sans); font-size: 13px; padding: 8px 10px; cursor: pointer" @click="inactivarInmueble">
                Inactivar inmueble
              </button>
              <button type="button" disabled title="Próximamente" style="width: 100%; text-align: left; background: none; border: none; font-family: var(--font-sans); font-size: 13px; padding: 8px 10px; cursor: not-allowed; opacity: .5">
                Duplicar inmueble
              </button>
              <button type="button" disabled title="Próximamente" style="width: 100%; text-align: left; background: none; border: none; font-family: var(--font-sans); font-size: 13px; padding: 8px 10px; cursor: not-allowed; opacity: .5">
                Exportar ficha (PDF)
              </button>
            </div>
          </div>
        </div>

        <div v-else class="masthead-actions">
          <NuxtLink to="/inmuebles" class="btn btn--ghost">Cancelar</NuxtLink>
          <button type="button" class="btn btn--primary" :disabled="guardando" @click="guardarInmueble">
            {{ guardando ? 'Guardando…' : 'Guardar inmueble' }}
          </button>
        </div>
      </div>

      <div class="rule-double" />

      <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>

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

      <nav class="tabs">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          type="button"
          class="tab"
          :class="{ 'is-active': tabActiva === tab.id, 'is-disabled': esCreacion && tab.id !== 'base' }"
          @click="irATab(tab.id)"
        >
          {{ tab.etiqueta }}
        </button>
      </nav>
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
          <InmueblesInmuebleNovedades :inmueble-id="inmuebleId" />
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
  </div>
</template>
