<script setup lang="ts">
// Formulario de registrar pago — RC-6/RC-7: componente compartido entre la
// ficha del inmueble (vía el modal de InmuebleFicha.vue) y /recaudo (vía su
// propio modal). `inmuebleId` es opcional: cuando el llamador ya sabe de
// qué inmueble se trata (la ficha) se lo pasa fijo y el formulario no
// muestra selector; cuando no (Recaudo es tenant-wide) el formulario
// resuelve su propio selector con cuentaStore.inmuebles — antes existía
// una tercera copia de este formulario en /estado-cuenta/pagos.vue, con su
// propio selector de inmueble; se retiró esa página y este componente
// absorbió esa capacidad en vez de mantener una copia aparte (2026-08-27).
//
// "Quién paga" (2026-08-27, corrige un olvido de RC-3): el backend ya
// soportaba pagador_tercero_id/pagador_nombre desde RC-0 y el recibo de
// caja ya sabía resolver "Recibí de" con esa prioridad — pero ningún
// formulario exponía el campo, así que siempre viajaba null y el recibo
// caía a la inferencia por es_pagador. Quien paga en ventanilla puede no
// ser el propietario registrado (un arrendatario, un familiar, alguien que
// paga por encargo), así que se deja explícito y editable, con la persona
// marcada es_pagador pre-seleccionada como punto de partida cuando existe.
import type { ResultadoPago } from '~/stores/cuentaCorriente'

const props = defineProps<{ inmuebleId?: string }>()
const emit = defineEmits<{ registrado: [resultado: ResultadoPago] }>()

const tenantStore = useTenantStore()
const cuentaStore = useCuentaCorrienteStore()
const tercerosStore = useTercerosStore()

const inmuebleSeleccionadoId = ref<string | null>(props.inmuebleId ?? null)
const monto = ref<number | null>(null)
const fechaPago = ref(new Date().toISOString().slice(0, 10))
const referencia = ref('')
const formaPago = ref('transferencia_bancaria')
const registrando = ref(false)
const error = ref<string | null>(null)

const opcionesFormaPago = computed(() =>
  cuentaStore.formasPago.map((f) => ({ value: f.codigo, label: f.nombre })),
)
const opcionesInmueble = computed(() =>
  cuentaStore.inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo })),
)

const inmuebleEfectivoId = computed(() => props.inmuebleId ?? inmuebleSeleccionadoId.value)

// ── Quién paga ───────────────────────────────────────────────────────
const OTRO = '__otro__'
const quienPaga = ref<string | null>(null)
const pagadorNombreLibre = ref('')

const personasVigentes = computed(() =>
  tercerosStore.tercerosAsociados.filter((p) => !p.vigente_hasta),
)
const opcionesQuienPaga = computed(() => [
  { value: null, label: 'Sin especificar — se usa el pagador registrado' },
  ...personasVigentes.value.map((p) => ({
    value: p.tercero_id,
    label: `${p.tercero.nombre_completo}${p.rol?.nombre ? ` — ${p.rol.nombre}` : ''}${p.es_pagador ? ' (pagador registrado)' : ''}`,
  })),
  { value: OTRO, label: 'Otra persona (escribir nombre)' },
])

async function cargarPersonasDelInmueble(id: string | null): Promise<void> {
  quienPaga.value = null
  pagadorNombreLibre.value = ''
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !id) return
  await tercerosStore.cargarTercerosAsociados(tenantId, id)
  const pagadorRegistrado = personasVigentes.value.find((p) => p.es_pagador)
  if (pagadorRegistrado) quienPaga.value = pagadorRegistrado.tercero_id
}

watch(inmuebleEfectivoId, (id) => cargarPersonasDelInmueble(id), { immediate: true })

async function registrar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const inmuebleId = inmuebleEfectivoId.value
  if (!tenantId || !inmuebleId || !monto.value || !fechaPago.value) return
  error.value = null
  registrando.value = true
  try {
    const resultado = await cuentaStore.registrarPago({
      inmuebleId,
      tenantId,
      monto: monto.value,
      fechaPago: fechaPago.value,
      referencia: referencia.value.trim() || undefined,
      formaPago: formaPago.value,
      pagadorTerceroId: quienPaga.value && quienPaga.value !== OTRO ? quienPaga.value : null,
      pagadorNombre: quienPaga.value === OTRO ? pagadorNombreLibre.value.trim() || null : null,
    })
    monto.value = null
    referencia.value = ''
    emit('registrado', resultado)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar el pago.')
  } finally {
    registrando.value = false
  }
}

defineExpose({ registrar })
</script>

<template>
  <div>
    <div class="space-y-4 text-sm max-w-md">
      <UFormField v-if="!inmuebleId" label="Inmueble" name="inmueble">
        <UiSelectorBuscable v-model="inmuebleSeleccionadoId" :opciones="opcionesInmueble" placeholder="Selecciona un inmueble…" />
      </UFormField>
      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Monto" name="monto">
          <UInput v-model.number="monto" type="number" min="0" step="0.01" placeholder="420000" class="w-full" />
        </UFormField>
        <UFormField label="Fecha de pago" name="fecha_pago">
          <UInput v-model="fechaPago" type="date" class="w-full" />
        </UFormField>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Forma de pago" name="forma_pago">
          <USelect v-model="formaPago" :items="opcionesFormaPago" class="w-full" />
        </UFormField>
        <UFormField label="Referencia (opcional)" name="referencia">
          <UInput v-model="referencia" type="text" placeholder="Transferencia · 88213" class="w-full" />
        </UFormField>
      </div>
      <UFormField label="Quién paga" name="quien_paga">
        <USelect
          :model-value="quienPaga"
          :items="opcionesQuienPaga"
          :disabled="!inmuebleEfectivoId"
          class="w-full"
          @update:model-value="(v) => (quienPaga = v as string | null)"
        />
      </UFormField>
      <UFormField v-if="quienPaga === OTRO" label="Nombre de quien paga" name="pagador_nombre">
        <UInput v-model="pagadorNombreLibre" placeholder="Nombre de la persona" class="w-full" />
      </UFormField>
    </div>
    <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-3 max-w-md" />
    <UButton class="mt-3" :loading="registrando" :disabled="!monto || !inmuebleEfectivoId" @click="registrar">
      Registrar pago
    </UButton>
  </div>
</template>
