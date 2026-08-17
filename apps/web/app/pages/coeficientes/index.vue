<script setup lang="ts">
// Coeficientes de copropiedad — PLAN_DATOS_REALES.md §3.1.4. Lista
// versiones de coeficiente_sets, crea una nueva en borrador (una fila por
// inmueble activo), activa. Σ coeficientes: el motor no exige 1.0 (16 §82)
// — el formulario solo advierte si Σ ≠ coeficientes_suma_esperada de la
// política vigente, nunca bloquea (ver stores/coeficientes.ts).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const coeficientesStore = useCoeficientesStore()
const cuentaStore = useCuentaCorrienteStore()
const politicaStore = usePoliticaFinancieraStore()

const vigenteDesde = ref('')
const valores = ref<Record<string, number | undefined>>({})
const cargando = ref(false)
const activandoId = ref<string | null>(null)
const error = ref<string | null>(null)

await useAsyncData('coeficientes', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  const [sets] = await Promise.all([
    coeficientesStore.cargarCoeficienteSets(tenantId),
    cuentaStore.cargarInmuebles(tenantId),
    politicaStore.cargarPoliticas(tenantId),
  ])
  return sets
})

const inmueblesActivos = computed(() => cuentaStore.inmuebles.filter((i) => i.estado === 'activo'))

const politicaVigente = computed(() => politicaStore.politicas.find((p) => p.estado === 'vigente'))
const sumaEsperada = computed(() => politicaVigente.value?.coeficientes_suma_esperada ?? 1)

const sumaActual = computed(() =>
  inmueblesActivos.value.reduce((acc, i) => acc + (valores.value[i.id] ?? 0), 0),
)
const sumaDifiere = computed(() => Math.abs(sumaActual.value - sumaEsperada.value) > 1e-9)

async function crear(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !vigenteDesde.value || inmueblesActivos.value.length === 0) return

  cargando.value = true
  try {
    await coeficientesStore.crearCoeficienteSet({
      tenantId,
      vigenteDesde: vigenteDesde.value,
      valores: inmueblesActivos.value.map((i) => ({
        inmuebleId: i.id,
        valor: valores.value[i.id] ?? 0,
      })),
    })
    vigenteDesde.value = ''
    valores.value = {}
  } catch (excepcion) {
    error.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo crear el set de coeficientes.'
  } finally {
    cargando.value = false
  }
}

async function activar(id: string): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  activandoId.value = id
  try {
    await coeficientesStore.activarCoeficienteSet(id, tenantId)
  } catch (excepcion) {
    error.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo activar el set de coeficientes.'
  } finally {
    activandoId.value = null
  }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Coeficientes de copropiedad</h1>
      <p class="text-sm text-gray-500">
        Un set por versión, con un coeficiente por inmueble activo — versionado igual que
        políticas financieras.
      </p>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Versiones</h2>
      <p v-if="coeficientesStore.coeficienteSets.length === 0" class="text-gray-500 text-sm">
        Esta copropiedad todavía no tiene un set de coeficientes.
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
        <template #celda-estado="{ fila }">{{ fila.estado }}</template>
        <template #celda-vigenteDesde="{ fila }"><span class="text-gray-500">{{ fila.vigente_desde }}</span></template>
        <template #celda-suma="{ fila }"><span class="text-gray-500">{{ fila.suma_total }}</span></template>
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
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Crear nueva versión (borrador)</h2>
      <p v-if="inmueblesActivos.length === 0" class="text-gray-500 text-sm">
        Esta copropiedad todavía no tiene inmuebles activos — crea al menos uno antes de
        registrar coeficientes.
      </p>
      <form v-else class="space-y-4 max-w-md" @submit.prevent="crear">
        <UFormField label="Vigente desde" name="vigente_desde">
          <UInput v-model="vigenteDesde" type="date" class="w-full" />
        </UFormField>

        <UiTabla
          :columnas="[
            { clave: 'inmueble', etiqueta: 'Inmueble' },
            { clave: 'coeficiente', etiqueta: 'Coeficiente' },
          ]"
          :filas="inmueblesActivos"
          :clave-fila="(inmueble) => inmueble.id"
        >
          <template #celda-inmueble="{ fila }">{{ fila.codigo }}</template>
          <template #celda-coeficiente="{ fila }">
            <UInput
              v-model.number="valores[fila.id]"
              type="number"
              step="0.0000000001"
              min="0"
              class="w-full"
            />
          </template>
        </UiTabla>

        <p class="text-sm" :class="sumaDifiere ? 'text-amber-600' : 'text-gray-500'">
          Σ = {{ sumaActual }} (esperada {{ sumaEsperada }})
          <template v-if="sumaDifiere">— no coincide, pero no bloquea el guardado.</template>
        </p>

        <UAlert v-if="error" color="error" variant="soft" :title="error" />

        <UButton type="submit" :loading="cargando">Crear versión</UButton>
      </form>
    </div>
  </div>
</template>
