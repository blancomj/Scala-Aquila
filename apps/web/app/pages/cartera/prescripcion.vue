<script setup lang="ts">
// Actos interruptivos de prescripción (VER-CAR-05 parcial, bloque 13).
// Bitácora factual únicamente — NO hay alerta de plazo ni cálculo de
// días para prescribir: el término y el cómputo del régimen civil
// aplicable siguen sin verificar (§3.5, VER-CAR-05 sigue abierto). Esta
// pantalla solo deja constancia de qué se dice que pasó, cuándo, y con
// qué evidencia — la misma distinción que ya usa el expediente jurídico
// (bitácora de actuaciones sin arbitrar su efecto procesal).
import { cargarListaTipos } from '~/composables/useListaTipos'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const prescripcionStore = usePrescripcionStore()
const cuentaStore = useCuentaCorrienteStore()

const errorCarga = ref<string | null>(null)
const tiposActo = ref<{ id: number; codigo: string; nombre: string }[]>([])

function hoyISO(): string {
  const d = new Date()
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  try {
    await Promise.all([prescripcionStore.cargarActos(tenantId), cuentaStore.cargarInmuebles(tenantId)])
  } catch (excepcion) {
    errorCarga.value = mensajeError(excepcion, 'No se pudo cargar la información.')
  }
  try {
    tiposActo.value = await cargarListaTipos(tenantId, 'TIPO_ACTO_INTERRUPTIVO_PRESCRIPCION')
  } catch (excepcion) {
    errorCarga.value = mensajeError(excepcion, 'No se pudieron cargar los tipos de acto.')
  }
}

await useAsyncData('cartera-prescripcion-inicial', async () => {
  await cargar()
  return null
})

watch(() => tenantStore.activeTenant?.id, cargar)

const inmueblePorId = computed(() => new Map(cuentaStore.inmuebles.map((i) => [i.id, i.codigo])))
const opcionesInmueble = computed(() => cuentaStore.inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo })))
const tipoActoPorId = computed(() => new Map(tiposActo.value.map((t) => [t.id, t.nombre])))
const opcionesTipoActo = computed(() => tiposActo.value.map((t) => ({ valor: t.id, etiqueta: t.nombre })))

// ── filtro por inmueble — opcional, todos si no se elige ninguno ───────
const inmuebleFiltro = ref<string | null>(null)
watch(inmuebleFiltro, () => {
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) void prescripcionStore.cargarActos(tenantId, inmuebleFiltro.value ?? undefined)
})

// ── nuevo acto ───────────────────────────────────────────────────────
const modalAbierto = ref(false)
const nuevoInmuebleId = ref<string | undefined>(undefined)
const nuevoTipoActoId = ref<number | undefined>(undefined)
const nuevaFecha = ref(hoyISO())
const nuevaDescripcion = ref('')
const errorGuardar = ref<string | null>(null)

function abrirModal(): void {
  nuevoInmuebleId.value = inmuebleFiltro.value ?? undefined
  nuevoTipoActoId.value = undefined
  nuevaFecha.value = hoyISO()
  nuevaDescripcion.value = ''
  errorGuardar.value = null
  modalAbierto.value = true
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nuevoInmuebleId.value || !nuevoTipoActoId.value || !nuevaDescripcion.value.trim()) return
  errorGuardar.value = null
  try {
    await prescripcionStore.crearActo(tenantId, {
      inmuebleId: nuevoInmuebleId.value,
      tipoActoId: nuevoTipoActoId.value,
      fechaOcurrencia: nuevaFecha.value,
      descripcion: nuevaDescripcion.value.trim(),
    })
    modalAbierto.value = false
    if (inmuebleFiltro.value) await prescripcionStore.cargarActos(tenantId, inmuebleFiltro.value)
  } catch (excepcion) {
    errorGuardar.value = mensajeError(excepcion, 'No se pudo registrar el acto.')
  }
}

const columnas = [
  { clave: 'fecha_ocurrencia', etiqueta: 'Fecha' },
  { clave: 'inmueble_id', etiqueta: 'Inmueble' },
  { clave: 'tipo_acto_id', etiqueta: 'Tipo de acto' },
  { clave: 'descripcion', etiqueta: 'Descripción' },
]
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <UiTituloDescripcion clase-descripcion="text-sm text-gray-500 mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Actos interruptivos de prescripción</h1>
        </template>
        <template #descripcion>
          Bitácora de hechos que podrían interrumpir la prescripción de la deuda — pagos, reconocimientos
          escritos, demandas, actuaciones judiciales. Registro puramente factual: esta pantalla
          <strong>no calcula plazos ni alerta de riesgo de prescripción</strong> (el término y el cómputo del
          régimen civil aplicable siguen sin verificar jurídicamente, VER-CAR-05).
        </template>
      </UiTituloDescripcion>
      <UButton icon="i-lucide-plus" @click="abrirModal">Registrar acto</UButton>
    </div>

    <UAlert v-if="errorCarga" color="error" variant="soft" :title="errorCarga" />

    <UFormField label="Filtrar por inmueble">
      <USelect
        v-model="inmuebleFiltro"
        :items="[{ label: 'Todos los inmuebles', value: null }, ...opcionesInmueble.map((o) => ({ label: o.etiqueta, value: o.valor }))]"
        value-key="value"
        class="w-64"
      />
    </UFormField>

    <UiTabla
      :columnas="columnas"
      :filas="prescripcionStore.actos"
      :clave-fila="(f) => f.id"
      :loading="prescripcionStore.loading"
      vacio="Sin actos interruptivos registrados."
    >
      <template #celda-inmueble_id="{ fila }">{{ inmueblePorId.get(fila.inmueble_id) ?? fila.inmueble_id }}</template>
      <template #celda-tipo_acto_id="{ fila }">{{ tipoActoPorId.get(fila.tipo_acto_id) ?? fila.tipo_acto_id }}</template>
    </UiTabla>

    <UModal v-model:open="modalAbierto" title="Registrar acto interruptivo">
      <template #body>
        <form class="space-y-4" @submit.prevent="guardar">
          <UFormField label="Inmueble" required>
            <USelect
              v-model="nuevoInmuebleId"
              :items="opcionesInmueble.map((o) => ({ label: o.etiqueta, value: o.valor }))"
              value-key="value"
              placeholder="Selecciona un inmueble"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Tipo de acto" required>
            <USelect
              v-model="nuevoTipoActoId"
              :items="opcionesTipoActo.map((o) => ({ label: o.etiqueta, value: o.valor }))"
              value-key="value"
              placeholder="Selecciona un tipo"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Fecha del acto" required>
            <UInput v-model="nuevaFecha" type="date" required class="w-48" />
          </UFormField>
          <UFormField label="Descripción" required>
            <UTextarea
              v-model="nuevaDescripcion"
              :rows="3"
              placeholder="Qué pasó exactamente, con qué evidencia (ej. referencia del pago, folio de la demanda)…"
              class="w-full"
            />
          </UFormField>
          <UAlert v-if="errorGuardar" color="error" variant="soft" :title="errorGuardar" />
        </form>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="modalAbierto = false">Cancelar</UButton>
          <UButton
            :disabled="!nuevoInmuebleId || !nuevoTipoActoId || !nuevaDescripcion.trim()"
            :loading="prescripcionStore.guardando"
            @click="guardar"
          >
            Registrar
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
