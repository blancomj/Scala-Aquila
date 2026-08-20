<script setup lang="ts">
// Panel de coeficientes de copropiedad — extraído de coeficientes/
// index.vue (antes un formulario inline) para poder reutilizarse tanto
// en la página standalone /coeficientes como en la pestaña "Distribución
// por unidad" de Presupuesto (PLAN aprobado, E5) sin duplicar lógica.
// Autocontenido: carga sus propios datos (coeficiente_sets, inmuebles,
// política vigente) al montarse, en vez de depender de que cada página
// que lo use repita el mismo useAsyncData.
const tenantStore = useTenantStore()
const coeficientesStore = useCoeficientesStore()
const cuentaStore = useCuentaCorrienteStore()
const politicaStore = usePoliticaFinancieraStore()

const cargando = ref(false)
const activandoId = ref<string | null>(null)
const error = ref<string | null>(null)
const drawerAbierto = ref(false)

onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargando.value = true
  try {
    await Promise.all([
      coeficientesStore.cargarCoeficienteSets(tenantId),
      cuentaStore.cargarInmuebles(tenantId),
      politicaStore.cargarPoliticas(tenantId),
    ])
  } finally {
    cargando.value = false
  }
})

async function activar(id: string): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  activandoId.value = id
  try {
    await coeficientesStore.activarCoeficienteSet(id, tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo activar el set de coeficientes.')
  } finally {
    activandoId.value = null
  }
}

function onCreado(): void {
  drawerAbierto.value = false
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-lg font-semibold">Versiones</h2>
        <UButton size="xs" @click="drawerAbierto = true">Nueva versión</UButton>
      </div>
      <p class="text-sm text-gray-500 mb-2">
        Un set por versión, con un coeficiente por inmueble activo.
      </p>

      <p v-if="coeficientesStore.coeficienteSets.length === 0" class="text-gray-500 text-sm">
        {{ cargando ? 'Cargando…' : 'Esta copropiedad todavía no tiene un set de coeficientes.' }}
      </p>
      <UiTabla
        v-else
        :columnas="[
          { clave: 'version', etiqueta: 'Versión' },
          { clave: 'estado', etiqueta: 'Estado' },
          { clave: 'vigenteDesde', etiqueta: 'Vigente desde' },
          { clave: 'suma', etiqueta: 'Σ coeficientes' },
          { clave: 'acciones', etiqueta: '' },
        ]"
        :filas="coeficientesStore.coeficienteSets"
        :clave-fila="(set) => set.id"
      >
        <template #celda-version="{ fila }">v{{ fila.version }}</template>
        <template #celda-estado="{ fila }"
          ><span class="text-gray-500">{{ fila.estado }}</span></template
        >
        <template #celda-vigenteDesde="{ fila }">
          <span class="text-gray-500">{{ fila.vigente_desde }}</span>
        </template>
        <template #celda-suma="{ fila }"
          ><span class="text-gray-500">{{ fila.suma_total }}</span></template
        >
        <template #celda-acciones="{ fila }">
          <UButton
            v-if="fila.estado === 'borrador'"
            size="xs"
            variant="soft"
            :loading="activandoId === fila.id"
            @click="activar(fila.id)"
          >
            Activar
          </UButton>
        </template>
      </UiTabla>

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-2" />
    </div>

    <CoeficientesVersionDrawer
      v-if="drawerAbierto"
      @cerrar="drawerAbierto = false"
      @creado="onCreado"
    />
  </div>
</template>
