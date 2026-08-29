<script setup lang="ts">
// Detalle de un caso jurídico en pantalla propia (CAR §15.3-16, bloque 20).
// Antes vivía en un drawer sobre la lista; se movió a su propia ruta porque
// un caso jurídico se trabaja durante semanas —actuaciones, costas, cambios
// de estado— y necesita poder enlazarse, recargarse y compartirse por sí
// solo, no consultarse de reojo encima de una tabla.
//
// Mismo patrón de ruta que /cartera/certificaciones/[id]: la lista queda en
// `juridico.vue` y el detalle en `juridico/[id].vue`.
import { useCasosJuridicosStore, type CasoJuridico } from '~/stores/casosJuridicos'
import { useCuentaCorrienteStore } from '~/stores/cuentaCorriente'
import { useTercerosStore } from '~/stores/terceros'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const route = useRoute()
const tenantStore = useTenantStore()
const casosStore = useCasosJuridicosStore()
const cuentaStore = useCuentaCorrienteStore()
const tercerosStore = useTercerosStore()

const casoId = computed(() => String(route.params.id))
const errorCarga = ref<string | null>(null)

function hoyISO(): string {
  const d = new Date()
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  try {
    await Promise.all([
      casosStore.cargarCasos(tenantId),
      cuentaStore.cargarInmuebles(tenantId),
      tercerosStore.cargarPersonasTenant(tenantId),
    ])
  } catch (excepcion) {
    errorCarga.value = excepcion instanceof Error ? excepcion.message : 'No se pudo cargar el caso.'
  }
}

await useAsyncData(`cartera-caso-${casoId.value}`, async () => {
  await cargar()
  return null
})

watch(() => tenantStore.activeTenant?.id, cargar)

const caso = computed<CasoJuridico | undefined>(() =>
  casosStore.casos.find((c) => c.id === casoId.value),
)

const inmuebleCodigo = computed(() => {
  const actual = caso.value
  if (!actual) return ''
  return cuentaStore.inmuebles.find((i) => i.id === actual.inmueble_id)?.codigo ?? actual.inmueble_id
})

const opcionesAbogado = computed(() => [
  { valor: null, etiqueta: 'Sin asignar' },
  ...tercerosStore.personasTenant
    .filter((p) => p.rol.codigo === 'abogado' && (p.vigente_hasta === null || p.vigente_hasta >= hoyISO()))
    .map((p) => ({ valor: p.tercero_id, etiqueta: p.tercero.nombre_completo ?? p.tercero_id })),
])

// Al cerrar el caso, el componente emite `cerrar`: en pantalla propia eso
// significa volver a la lista, no desmontar un panel.
async function volverALaLista(): Promise<void> {
  await navigateTo('/cartera/juridico')
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <NuxtLink
        to="/cartera/juridico"
        class="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
      >
        <span aria-hidden="true">←</span>
        Casos jurídicos
      </NuxtLink>
    </div>

    <UAlert v-if="errorCarga" color="error" variant="soft" :title="errorCarga" />

    <div v-else-if="!caso" class="text-sm text-neutral-500">
      No se encontró el caso, o no pertenece a la copropiedad activa.
    </div>

    <template v-else>
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 class="text-xl font-semibold">Caso {{ caso.consecutivo ?? '' }}</h1>
          <p class="text-sm text-neutral-500 mt-1">Inmueble {{ inmuebleCodigo }}</p>
        </div>
      </div>

      <CarteraCasoJuridicoDetalle
        :caso="caso"
        :opciones-abogado="opcionesAbogado"
        :inmueble-codigo="inmuebleCodigo"
        @cerrar="volverALaLista"
        @actualizado="cargar"
      />
    </template>
  </div>
</template>
