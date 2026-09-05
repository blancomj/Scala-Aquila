<script setup lang="ts">
// Transferencias de propiedad (CJ-8, PROMPT-CAR-JUR-001 §15).
// Bitácora factual únicamente — NO reasigna deuda ni dispara ningún
// cálculo: el titular vigente del inmueble lo sigue resolviendo
// inmueble_persona_rol (ficha de inmueble). Esta pantalla solo deja
// constancia de POR QUÉ cambió el titular, con qué evidencia y cuál era
// la deuda conocida a esa fecha.
import { cargarListaTipos } from '~/composables/useListaTipos'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const transferenciasStore = useInmuebleTransferenciasStore()
const cuentaStore = useCuentaCorrienteStore()
const tercerosStore = useTercerosStore()

const errorCarga = ref<string | null>(null)
const tiposTransferencia = ref<{ id: number; codigo: string; nombre: string }[]>([])

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
      transferenciasStore.cargarTransferencias(tenantId),
      cuentaStore.cargarInmuebles(tenantId),
      tercerosStore.cargarTerceros(tenantId),
    ])
  } catch (excepcion) {
    errorCarga.value = mensajeError(excepcion, 'No se pudo cargar la información.')
  }
  try {
    tiposTransferencia.value = await cargarListaTipos(tenantId, 'TIPO_TRANSFERENCIA_PROPIEDAD')
  } catch (excepcion) {
    errorCarga.value = mensajeError(excepcion, 'No se pudieron cargar los tipos de transferencia.')
  }
}

await useAsyncData('cartera-transferencias-inicial', async () => {
  await cargar()
  return null
})

watch(() => tenantStore.activeTenant?.id, cargar)

const inmueblePorId = computed(() => new Map(cuentaStore.inmuebles.map((i) => [i.id, i.codigo])))
const opcionesInmueble = computed(() => cuentaStore.inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo })))
const tipoPorId = computed(() => new Map(tiposTransferencia.value.map((t) => [t.id, t.nombre])))
const opcionesTipo = computed(() => tiposTransferencia.value.map((t) => ({ valor: t.id, etiqueta: t.nombre })))
const terceroPorId = computed(
  () => new Map(tercerosStore.terceros.map((t) => [t.id, t.nombre_completo ?? t.numero_documento])),
)
const opcionesTercero = computed(() =>
  tercerosStore.terceros.map((t) => ({ valor: t.id, etiqueta: t.nombre_completo ?? t.numero_documento })),
)

// ── filtro por inmueble — opcional, todos si no se elige ninguno ───────
const inmuebleFiltro = ref<string | null>(null)
watch(inmuebleFiltro, () => {
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) void transferenciasStore.cargarTransferencias(tenantId, inmuebleFiltro.value ?? undefined)
})

// ── nueva transferencia ─────────────────────────────────────────────
const modalAbierto = ref(false)
const nuevoInmuebleId = ref<string | undefined>(undefined)
const nuevoTipoId = ref<number | undefined>(undefined)
const nuevaFecha = ref(hoyISO())
const nuevaDescripcion = ref('')
const nuevoPropietarioAnteriorId = ref<string | undefined>(undefined)
const nuevoPropietarioNuevoId = ref<string | undefined>(undefined)
const nuevaDeuda = ref<number | undefined>(undefined)
const errorGuardar = ref<string | null>(null)

function abrirModal(): void {
  nuevoInmuebleId.value = inmuebleFiltro.value ?? undefined
  nuevoTipoId.value = undefined
  nuevaFecha.value = hoyISO()
  nuevaDescripcion.value = ''
  nuevoPropietarioAnteriorId.value = undefined
  nuevoPropietarioNuevoId.value = undefined
  nuevaDeuda.value = undefined
  errorGuardar.value = null
  modalAbierto.value = true
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (
    !tenantId ||
    !nuevoInmuebleId.value ||
    !nuevoTipoId.value ||
    !nuevaDescripcion.value.trim() ||
    !nuevoPropietarioNuevoId.value
  )
    return
  errorGuardar.value = null
  try {
    await transferenciasStore.crearTransferencia(tenantId, {
      inmuebleId: nuevoInmuebleId.value,
      tipoTransferenciaId: nuevoTipoId.value,
      fechaTransferencia: nuevaFecha.value,
      descripcion: nuevaDescripcion.value.trim(),
      propietarioAnteriorId: nuevoPropietarioAnteriorId.value,
      propietarioNuevoId: nuevoPropietarioNuevoId.value,
      deudaALaFecha: nuevaDeuda.value,
    })
    modalAbierto.value = false
    if (inmuebleFiltro.value) await transferenciasStore.cargarTransferencias(tenantId, inmuebleFiltro.value)
  } catch (excepcion) {
    errorGuardar.value = mensajeError(excepcion, 'No se pudo registrar la transferencia.')
  }
}

const columnas = [
  { clave: 'fecha_transferencia', etiqueta: 'Fecha' },
  { clave: 'inmueble_id', etiqueta: 'Inmueble' },
  { clave: 'tipo_transferencia_id', etiqueta: 'Tipo' },
  { clave: 'propietario_anterior_id', etiqueta: 'Anterior' },
  { clave: 'propietario_nuevo_id', etiqueta: 'Nuevo' },
  { clave: 'deuda_a_la_fecha', etiqueta: 'Deuda a la fecha' },
]
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Transferencias de propiedad</h1>
        </template>
        <template #descripcion>
          Bitácora de por qué cambió el titular de un inmueble (compraventa, remate judicial, donación, sucesión,
          adjudicación), con evidencia y la deuda conocida a la fecha. Registro puramente factual: esta pantalla
          <strong>no reasigna deuda ni cierra ningún cálculo</strong> — el titular vigente del inmueble lo resuelve
          la ficha de inmueble.
        </template>
      </UiTituloDescripcion>
      <UButton icon="i-lucide-plus" @click="abrirModal">Registrar transferencia</UButton>
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
      :filas="transferenciasStore.transferencias"
      :clave-fila="(f) => f.id"
      :loading="transferenciasStore.loading"
      vacio="Sin transferencias registradas."
    >
      <template #celda-inmueble_id="{ fila }">{{ inmueblePorId.get(fila.inmueble_id) ?? fila.inmueble_id }}</template>
      <template #celda-tipo_transferencia_id="{ fila }">
        {{ tipoPorId.get(fila.tipo_transferencia_id) ?? fila.tipo_transferencia_id }}
      </template>
      <template #celda-propietario_anterior_id="{ fila }">
        {{ fila.propietario_anterior_id ? (terceroPorId.get(fila.propietario_anterior_id) ?? '—') : '—' }}
      </template>
      <template #celda-propietario_nuevo_id="{ fila }">
        {{ terceroPorId.get(fila.propietario_nuevo_id) ?? fila.propietario_nuevo_id }}
      </template>
      <template #celda-deuda_a_la_fecha="{ fila }">
        {{ fila.deuda_a_la_fecha != null ? fila.deuda_a_la_fecha.toLocaleString('es-CO') : '—' }}
      </template>
    </UiTabla>

    <UModal v-model:open="modalAbierto" title="Registrar transferencia de propiedad">
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
          <UFormField label="Tipo de transferencia" required>
            <USelect
              v-model="nuevoTipoId"
              :items="opcionesTipo.map((o) => ({ label: o.etiqueta, value: o.valor }))"
              value-key="value"
              placeholder="Selecciona un tipo"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Fecha de la transferencia" required>
            <UInput v-model="nuevaFecha" type="date" required class="w-48" />
          </UFormField>
          <UFormField label="Propietario anterior" hint="Opcional — vacío si es la primera titularidad registrada">
            <USelect
              v-model="nuevoPropietarioAnteriorId"
              :items="opcionesTercero.map((o) => ({ label: o.etiqueta, value: o.valor }))"
              value-key="value"
              placeholder="Sin propietario anterior"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Propietario nuevo" required>
            <USelect
              v-model="nuevoPropietarioNuevoId"
              :items="opcionesTercero.map((o) => ({ label: o.etiqueta, value: o.valor }))"
              value-key="value"
              placeholder="Selecciona el nuevo propietario"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Deuda conocida a la fecha" hint="Informativa — no dispara ningún cálculo">
            <UInput v-model.number="nuevaDeuda" type="number" min="0" step="0.01" class="w-48" />
          </UFormField>
          <UFormField label="Descripción" required>
            <UTextarea
              v-model="nuevaDescripcion"
              :rows="3"
              placeholder="Qué evidencia respalda la transferencia (ej. escritura, sentencia de remate)…"
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
            :disabled="!nuevoInmuebleId || !nuevoTipoId || !nuevaDescripcion.trim() || !nuevoPropietarioNuevoId"
            :loading="transferenciasStore.guardando"
            @click="guardar"
          >
            Registrar
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
