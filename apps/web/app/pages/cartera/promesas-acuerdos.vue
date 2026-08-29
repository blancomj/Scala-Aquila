<script setup lang="ts">
// Promesas y acuerdos de pago (CAR §12, bloque 19). Dos figuras distintas
// (§12.1): la promesa es informal y no tiene efecto en escalamiento; el
// acuerdo es un negocio jurídico formal con maker-checker (aprobar exige
// administrador y bloquea autoaprobación) y calendario de cuotas.
import {
  useCarteraGestionStore,
  type AcuerdoPago,
  type EstadoPromesa,
  type EstadoAcuerdo,
} from '~/stores/promesasAcuerdos'
import { useCuentaCorrienteStore } from '~/stores/cuentaCorriente'
import { formatoMoneda } from '~/utils/formato'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const gestionStore = useCarteraGestionStore()
const cuentaStore = useCuentaCorrienteStore()
const toast = useToast()

const errorCarga = ref<string | null>(null)

function hoyISO(): string {
  const d = new Date()
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sumarMeses(iso: string, meses: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const fecha = new Date(Number(m[1]), Number(m[2]) - 1 + meses, Number(m[3]))
  return `${String(fecha.getFullYear())}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  try {
    await Promise.all([
      gestionStore.cargarPromesas(tenantId),
      gestionStore.cargarAcuerdos(tenantId),
      cuentaStore.cargarInmuebles(tenantId),
    ])
  } catch (excepcion) {
    errorCarga.value = excepcion instanceof Error ? excepcion.message : 'No se pudo cargar la información.'
  }
}

await useAsyncData('cartera-promesas-acuerdos-inicial', async () => {
  await cargar()
  return null
})

watch(() => tenantStore.activeTenant?.id, cargar)

const inmueblePorId = computed(() => new Map(cuentaStore.inmuebles.map((i) => [i.id, i.codigo])))
const opcionesInmueble = computed(() => cuentaStore.inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo })))

const ETIQUETA_ESTADO_PROMESA: Record<EstadoPromesa, string> = {
  pendiente: 'Pendiente',
  cumplida: 'Cumplida',
  incumplida: 'Incumplida',
  cancelada: 'Cancelada',
}
const COLOR_ESTADO_PROMESA: Record<EstadoPromesa, 'neutral' | 'success' | 'warning' | 'error'> = {
  pendiente: 'warning',
  cumplida: 'success',
  incumplida: 'error',
  cancelada: 'neutral',
}

const ETIQUETA_ESTADO_ACUERDO: Record<EstadoAcuerdo, string> = {
  borrador: 'Borrador',
  pendiente_aprobacion: 'Espera aprobación',
  vigente: 'Vigente',
  cumplido: 'Cumplido',
  incumplido: 'Incumplido',
  cancelado: 'Cancelado',
}
const COLOR_ESTADO_ACUERDO: Record<EstadoAcuerdo, 'neutral' | 'success' | 'warning' | 'error'> = {
  borrador: 'neutral',
  pendiente_aprobacion: 'warning',
  vigente: 'success',
  cumplido: 'success',
  incumplido: 'error',
  cancelado: 'neutral',
}

// ── promesas: nueva ───────────────────────────────────────────────────
const modalPromesaAbierto = ref(false)
const nuevaPromesaInmuebleId = ref<string | null>(null)
const nuevaPromesaMonto = ref<number | null>(null)
const nuevaPromesaFecha = ref(hoyISO())
const nuevaPromesaFechaPago = ref(hoyISO())
const nuevaPromesaNotas = ref('')

function abrirNuevaPromesa(): void {
  nuevaPromesaInmuebleId.value = null
  nuevaPromesaMonto.value = null
  nuevaPromesaFecha.value = hoyISO()
  nuevaPromesaFechaPago.value = hoyISO()
  nuevaPromesaNotas.value = ''
  modalPromesaAbierto.value = true
}

const puedeCrearPromesa = computed(
  () => nuevaPromesaInmuebleId.value !== null && (nuevaPromesaMonto.value ?? 0) > 0 && nuevaPromesaFechaPago.value >= nuevaPromesaFecha.value,
)

async function crearPromesa(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nuevaPromesaInmuebleId.value || !puedeCrearPromesa.value) return
  try {
    await gestionStore.crearPromesa(tenantId, {
      inmuebleId: nuevaPromesaInmuebleId.value,
      accionCobranzaId: null,
      fechaPromesa: nuevaPromesaFecha.value,
      montoPrometido: nuevaPromesaMonto.value ?? 0,
      fechaPagoPrometida: nuevaPromesaFechaPago.value,
      notas: nuevaPromesaNotas.value.trim() || null,
    })
    toast.add({ title: 'Promesa registrada', color: 'success' })
    modalPromesaAbierto.value = false
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo registrar la promesa',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  }
}

async function cambiarEstadoPromesa(promesaId: string, estado: EstadoPromesa): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  try {
    await gestionStore.actualizarEstadoPromesa(tenantId, promesaId, estado)
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo actualizar la promesa',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  }
}

// ── acuerdos: nuevo ───────────────────────────────────────────────────
const modalAcuerdoAbierto = ref(false)
const nuevoInmuebleId = ref<string | null>(null)
const nuevaFechaAcuerdo = ref(hoyISO())
const nuevaFechaInicio = ref(hoyISO())
const nuevaFechaFin = ref(sumarMeses(hoyISO(), 6))
const nuevoMontoCapital = ref<number | null>(null)
const nuevoMontoInteres = ref<number | null>(null)
const nuevoMontoOtros = ref<number | null>(null)
const nuevoNumeroCuotas = ref(6)
const nuevaCuotaInicial = ref<number | null>(null)
const nuevoCondonaInteres = ref(false)
const nuevoMontoCondonado = ref<number | null>(null)
const nuevoActaReferencia = ref('')
const nuevoInteresDuranteAcuerdo = ref(true)

function abrirNuevoAcuerdo(): void {
  nuevoInmuebleId.value = null
  nuevaFechaAcuerdo.value = hoyISO()
  nuevaFechaInicio.value = hoyISO()
  nuevaFechaFin.value = sumarMeses(hoyISO(), 6)
  nuevoMontoCapital.value = null
  nuevoMontoInteres.value = null
  nuevoMontoOtros.value = null
  nuevoNumeroCuotas.value = 6
  nuevaCuotaInicial.value = null
  nuevoCondonaInteres.value = false
  nuevoMontoCondonado.value = null
  nuevoActaReferencia.value = ''
  nuevoInteresDuranteAcuerdo.value = true
  modalAcuerdoAbierto.value = true
}

watch(nuevoNumeroCuotas, (n) => {
  // Sugerencia razonable, no una regla: numero_cuotas meses desde el inicio.
  // El usuario puede ajustar fecha_fin libremente después.
  nuevaFechaFin.value = sumarMeses(nuevaFechaInicio.value, n)
})

const montoTotalNuevo = computed(
  () => (nuevoMontoCapital.value ?? 0) + (nuevoMontoInteres.value ?? 0) + (nuevoMontoOtros.value ?? 0),
)

const puedeCrearAcuerdo = computed(
  () =>
    nuevoInmuebleId.value !== null &&
    montoTotalNuevo.value > 0 &&
    nuevoNumeroCuotas.value > 0 &&
    nuevaFechaFin.value > nuevaFechaInicio.value &&
    (!nuevoCondonaInteres.value || ((nuevoMontoCondonado.value ?? 0) > 0 && nuevoActaReferencia.value.trim().length > 0)),
)

async function crearAcuerdo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nuevoInmuebleId.value || !puedeCrearAcuerdo.value) return
  try {
    await gestionStore.crearAcuerdo(tenantId, {
      inmuebleId: nuevoInmuebleId.value,
      fechaAcuerdo: nuevaFechaAcuerdo.value,
      fechaInicio: nuevaFechaInicio.value,
      fechaFin: nuevaFechaFin.value,
      montoCapital: nuevoMontoCapital.value ?? 0,
      montoInteres: nuevoMontoInteres.value ?? 0,
      montoOtros: nuevoMontoOtros.value ?? 0,
      numeroCuotas: nuevoNumeroCuotas.value,
      cuotaInicial: nuevaCuotaInicial.value ?? 0,
      condonaInteres: nuevoCondonaInteres.value,
      montoCondonado: nuevoMontoCondonado.value ?? 0,
      interesDuranteAcuerdo: nuevoInteresDuranteAcuerdo.value,
      actaReferencia: nuevoActaReferencia.value.trim() || null,
    })
    toast.add({ title: 'Acuerdo creado en borrador', color: 'success' })
    modalAcuerdoAbierto.value = false
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo crear el acuerdo',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  }
}

// ── acuerdos: detalle ─────────────────────────────────────────────────
const acuerdoSeleccionado = ref<AcuerdoPago | null>(null)
function abrirDetalleAcuerdo(acuerdo: AcuerdoPago): void {
  acuerdoSeleccionado.value = acuerdo
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Promesas y acuerdos de pago</h1>
      <p class="text-sm text-neutral-500 max-w-2xl">
        La promesa es informal y no cambia el escalamiento (§12.1); el acuerdo es un negocio
        jurídico formal — aprobarlo exige rol administrador y congela el calendario de cuotas.
      </p>
    </div>

    <UAlert
      v-if="errorCarga"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="No se pudo cargar"
      :description="errorCarga"
    />

    <!-- ── promesas ──────────────────────────────────────────────────── -->
    <section class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-sm font-semibold">Promesas de pago</h2>
        <UButton size="sm" variant="outline" icon="i-lucide-message-circle" @click="abrirNuevaPromesa">
          Registrar promesa
        </UButton>
      </div>
      <UiTabla
        variante="tailwind"
        :columnas="[
          { clave: 'inmueble', etiqueta: 'Inmueble' },
          { clave: 'monto', etiqueta: 'Monto prometido', alinear: 'derecha' },
          { clave: 'fecha_pago', etiqueta: 'Fecha de pago' },
          { clave: 'estado', etiqueta: 'Estado' },
          { clave: 'acciones', etiqueta: '', alinear: 'derecha' },
        ]"
        :filas="gestionStore.promesas"
        :clave-fila="(fila) => fila.id"
        :cargando="gestionStore.loading"
        vacio="Sin promesas de pago registradas."
      >
        <template #celda-inmueble="{ fila }">
          {{ inmueblePorId.get(fila.inmueble_id) ?? fila.inmueble_id }}
        </template>
        <template #celda-monto="{ fila }">
          <span class="tabular-nums">{{ formatoMoneda(fila.monto_prometido) }}</span>
        </template>
        <template #celda-fecha_pago="{ fila }">
          {{ fila.fecha_pago_prometida }}
        </template>
        <template #celda-estado="{ fila }">
          <UBadge size="sm" variant="subtle" :color="COLOR_ESTADO_PROMESA[fila.estado]">
            {{ ETIQUETA_ESTADO_PROMESA[fila.estado] }}
          </UBadge>
        </template>
        <template #celda-acciones="{ fila }">
          <div v-if="fila.estado === 'pendiente'" class="flex justify-end gap-1.5">
            <UButton size="xs" variant="outline" color="success" @click="cambiarEstadoPromesa(fila.id, 'cumplida')">
              Cumplida
            </UButton>
            <UButton size="xs" variant="outline" color="error" @click="cambiarEstadoPromesa(fila.id, 'incumplida')">
              Incumplida
            </UButton>
            <UButton size="xs" variant="ghost" color="neutral" @click="cambiarEstadoPromesa(fila.id, 'cancelada')">
              Cancelar
            </UButton>
          </div>
        </template>
      </UiTabla>
    </section>

    <!-- ── acuerdos ──────────────────────────────────────────────────── -->
    <section class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-sm font-semibold">Acuerdos de pago</h2>
        <UButton size="sm" icon="i-lucide-file-signature" @click="abrirNuevoAcuerdo">Nuevo acuerdo</UButton>
      </div>
      <UiTabla
        variante="tailwind"
        :columnas="[
          { clave: 'consecutivo', etiqueta: 'Acuerdo' },
          { clave: 'inmueble', etiqueta: 'Inmueble' },
          { clave: 'estado', etiqueta: 'Estado' },
          { clave: 'cuotas', etiqueta: 'Cuotas' },
          { clave: 'total', etiqueta: 'Total', alinear: 'derecha' },
        ]"
        :filas="gestionStore.acuerdos"
        :clave-fila="(fila) => fila.id"
        :cargando="gestionStore.loading"
        vacio="Sin acuerdos de pago registrados."
      >
        <template #celda-consecutivo="{ fila }">
          <button type="button" class="font-medium text-primary-600 hover:underline" @click="abrirDetalleAcuerdo(fila)">
            {{ fila.consecutivo ?? '—' }}
          </button>
        </template>
        <template #celda-inmueble="{ fila }">
          {{ inmueblePorId.get(fila.inmueble_id) ?? fila.inmueble_id }}
        </template>
        <template #celda-estado="{ fila }">
          <UBadge size="sm" variant="subtle" :color="COLOR_ESTADO_ACUERDO[fila.estado]">
            {{ ETIQUETA_ESTADO_ACUERDO[fila.estado] }}
          </UBadge>
        </template>
        <template #celda-cuotas="{ fila }">
          {{ fila.numero_cuotas }}
        </template>
        <template #celda-total="{ fila }">
          <span class="tabular-nums">{{ formatoMoneda(fila.monto_total) }}</span>
        </template>
      </UiTabla>
    </section>

    <!-- ── nueva promesa ─────────────────────────────────────────────── -->
    <UModal v-model:open="modalPromesaAbierto" title="Registrar promesa de pago">
      <template #body>
        <div class="space-y-3 text-sm">
          <UFormField label="Inmueble" name="inmueble">
            <UiSelectorBuscable v-model="nuevaPromesaInmuebleId" :opciones="opcionesInmueble" placeholder="Selecciona un inmueble…" />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Monto prometido" name="monto">
              <UInput v-model.number="nuevaPromesaMonto" type="number" min="0" step="0.01" class="w-full" />
            </UFormField>
            <UFormField label="Fecha de la promesa" name="fecha_promesa">
              <UInput v-model="nuevaPromesaFecha" type="date" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Fecha en que promete pagar" name="fecha_pago_prometida">
            <UInput v-model="nuevaPromesaFechaPago" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Notas (opcional)" name="notas">
            <UTextarea v-model="nuevaPromesaNotas" class="w-full" :rows="2" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" color="neutral" @click="modalPromesaAbierto = false">Cancelar</UButton>
            <UButton :loading="gestionStore.guardando" :disabled="!puedeCrearPromesa" @click="crearPromesa">
              Registrar promesa
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ── nuevo acuerdo ─────────────────────────────────────────────── -->
    <UModal v-model:open="modalAcuerdoAbierto" title="Nuevo acuerdo de pago">
      <template #body>
        <div class="space-y-3 text-sm max-h-[70vh] overflow-y-auto pr-1">
          <UFormField label="Inmueble" name="inmueble">
            <UiSelectorBuscable v-model="nuevoInmuebleId" :opciones="opcionesInmueble" placeholder="Selecciona un inmueble…" />
          </UFormField>

          <div class="grid grid-cols-3 gap-3">
            <UFormField label="Capital" name="monto_capital">
              <UInput v-model.number="nuevoMontoCapital" type="number" min="0" step="0.01" class="w-full" />
            </UFormField>
            <UFormField label="Intereses" name="monto_interes">
              <UInput v-model.number="nuevoMontoInteres" type="number" min="0" step="0.01" class="w-full" />
            </UFormField>
            <UFormField label="Otros" name="monto_otros">
              <UInput v-model.number="nuevoMontoOtros" type="number" min="0" step="0.01" class="w-full" />
            </UFormField>
          </div>
          <p class="text-xs text-neutral-400">Total del acuerdo: {{ formatoMoneda(montoTotalNuevo) }}</p>

          <div class="grid grid-cols-3 gap-3">
            <UFormField label="Fecha del acuerdo" name="fecha_acuerdo">
              <UInput v-model="nuevaFechaAcuerdo" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Inicio del plan" name="fecha_inicio">
              <UInput v-model="nuevaFechaInicio" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Fin del plan" name="fecha_fin">
              <UInput v-model="nuevaFechaFin" type="date" class="w-full" />
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Número de cuotas" name="numero_cuotas">
              <UInput v-model.number="nuevoNumeroCuotas" type="number" min="1" step="1" class="w-full" />
            </UFormField>
            <UFormField label="Cuota inicial (abono, opcional)" name="cuota_inicial">
              <UInput v-model.number="nuevaCuotaInicial" type="number" min="0" step="0.01" class="w-full" />
            </UFormField>
          </div>
          <p class="text-xs text-neutral-400">
            El calendario reparte {{ formatoMoneda(montoTotalNuevo - (nuevaCuotaInicial ?? 0)) }} en
            {{ nuevoNumeroCuotas }} cuota(s), la última vence el {{ nuevaFechaFin }}.
          </p>

          <UFormField name="interes_durante_acuerdo">
            <UCheckbox v-model="nuevoInteresDuranteAcuerdo" label="Sigue causando interés de mora mientras el acuerdo está vigente" />
          </UFormField>

          <UFormField name="condona_interes">
            <UCheckbox v-model="nuevoCondonaInteres" label="Condona intereses de mora" />
          </UFormField>
          <template v-if="nuevoCondonaInteres">
            <UAlert
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              description="La condonación de intereses corresponde a la asamblea o a quien el reglamento faculte (CAR §12.6), no al administrador de forma unilateral — el acta es obligatoria."
            />
            <div class="grid grid-cols-2 gap-3">
              <UFormField label="Monto condonado" name="monto_condonado">
                <UInput v-model.number="nuevoMontoCondonado" type="number" min="0" step="0.01" class="w-full" />
              </UFormField>
              <UFormField label="Referencia del acta" name="acta_referencia">
                <UInput v-model="nuevoActaReferencia" class="w-full" placeholder="Acta asamblea 2026-04, punto 5" />
              </UFormField>
            </div>
          </template>

          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" color="neutral" @click="modalAcuerdoAbierto = false">Cancelar</UButton>
            <UButton :loading="gestionStore.guardando" :disabled="!puedeCrearAcuerdo" @click="crearAcuerdo">
              Crear acuerdo (borrador)
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <CarteraAcuerdoPagoDrawer
      v-if="acuerdoSeleccionado"
      :acuerdo="acuerdoSeleccionado"
      :inmueble-codigo="inmueblePorId.get(acuerdoSeleccionado.inmueble_id) ?? acuerdoSeleccionado.inmueble_id"
      @cerrar="acuerdoSeleccionado = null"
    />
  </div>
</template>
