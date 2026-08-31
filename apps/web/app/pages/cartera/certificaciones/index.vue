<script setup lang="ts">
// Certificaciones de deuda (CAR §15.2, bloque 21) — el artefacto del art.
// 48: presta mérito ejecutivo. El backend (certificaciones_deuda +
// registrarCertificacionDeuda) existe desde F7; esta es la primera puerta
// de entrada por UI — hasta ahora solo se podía emitir por SQL directo.
//
// GAP-CAR-011 sigue abierto: expensas extraordinarias y sanciones siempre
// salen en $0 en el detalle (no en esta lista, para no saturarla) — el
// esquema no distingue esos dos rubros a nivel de cargo, documentado, no
// inventado. La nota se repite ahí porque es el documento que se radica.
import { useCertificacionesStore, type CertificacionResumen } from '~/stores/certificaciones'
import { useCuentaCorrienteStore } from '~/stores/cuentaCorriente'
import { formatoMoneda } from '~/utils/formato'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const certStore = useCertificacionesStore()
const cuentaStore = useCuentaCorrienteStore()
const toast = useToast()

const errorCarga = ref<string | null>(null)

function hoyISO(): string {
  const d = new Date()
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const inmuebleId = ref<string | null>(null)
const fechaCorte = ref(hoyISO())
const fechaExpedicion = ref(hoyISO())
const cargoFirmante = ref('')

const opcionesInmueble = computed(() =>
  cuentaStore.inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo })),
)

const inmueblePorId = computed(() => new Map(cuentaStore.inmuebles.map((i) => [i.id, i.codigo])))

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  try {
    await Promise.all([certStore.cargar(tenantId), cuentaStore.cargarInmuebles(tenantId)])
  } catch (excepcion) {
    errorCarga.value = excepcion instanceof Error ? excepcion.message : 'No se pudo cargar la información.'
  }
}

await useAsyncData('cartera-certificaciones-inicial', async () => {
  await cargar()
  return null
})

watch(() => tenantStore.activeTenant?.id, cargar)

const puedeEmitir = computed(() => inmuebleId.value !== null && cargoFirmante.value.trim().length >= 3)

async function emitir(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !inmuebleId.value || !puedeEmitir.value) return
  try {
    const resultado = await certStore.emitir(tenantId, {
      inmuebleId: inmuebleId.value,
      fechaCorte: fechaCorte.value,
      fechaExpedicion: fechaExpedicion.value,
      cargoFirmante: cargoFirmante.value.trim(),
    })
    toast.add({
      title: 'Certificación expedida',
      description: `Consecutivo ${resultado.consecutivo}.`,
      color: 'success',
    })
    inmuebleId.value = null
    cargoFirmante.value = ''
    await certStore.cargar(tenantId)
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo expedir la certificación',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  }
}

// ── anular ──────────────────────────────────────────────────────────────
const modalAnularAbierto = ref(false)
const certificacionAAnular = ref<CertificacionResumen | null>(null)
const motivoAnulacion = ref('')
const anulando = ref(false)

function abrirAnular(cert: CertificacionResumen): void {
  certificacionAAnular.value = cert
  motivoAnulacion.value = ''
  modalAnularAbierto.value = true
}

async function confirmarAnular(): Promise<void> {
  const cert = certificacionAAnular.value
  const tenantId = tenantStore.activeTenant?.id
  if (!cert || !tenantId || motivoAnulacion.value.trim().length === 0) return
  anulando.value = true
  try {
    await certStore.anular(cert.id, motivoAnulacion.value.trim())
    toast.add({ title: 'Certificación anulada', color: 'success' })
    modalAnularAbierto.value = false
    await certStore.cargar(tenantId)
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo anular',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    anulando.value = false
  }
}

function fecha(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  const valor = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso)
  return valor.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 mt-1 max-w-2xl">
      <template #titulo>
        <h1 class="text-xl font-semibold">Certificaciones de deuda</h1>
      </template>
      <template #descripcion>
        El artefacto del art. 48 de la Ley 675: acompañada del certificado de existencia y
        representación legal, presta mérito ejecutivo. Solo un administrador puede expedirla, y una
        vez expedida es inmutable — un error se anula y se expide una nueva.
      </template>
    </UiTituloDescripcion>

    <UAlert
      v-if="errorCarga"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="No se pudo cargar"
      :description="errorCarga"
    />

    <!-- ── emitir ────────────────────────────────────────────────────── -->
    <div class="rounded-md border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
      <h2 class="text-sm font-semibold">Expedir certificación</h2>
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <UFormField label="Inmueble" name="inmueble">
          <UiSelectorBuscable v-model="inmuebleId" :opciones="opcionesInmueble" placeholder="Selecciona un inmueble…" />
        </UFormField>
        <UFormField label="Fecha de corte" name="fecha_corte">
          <UInput v-model="fechaCorte" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Fecha de expedición" name="fecha_expedicion">
          <UInput v-model="fechaExpedicion" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Firmante" name="cargo_firmante">
          <UInput v-model="cargoFirmante" type="text" placeholder="María Restrepo — Administradora" class="w-full" />
        </UFormField>
      </div>
      <UButton icon="i-lucide-file-check" :loading="certStore.emitiendo" :disabled="!puedeEmitir" @click="emitir">
        Expedir certificación
      </UButton>
      <p class="text-xs text-neutral-400">
        Solo certifica lo que hoy se puede probar con exactitud: ordinarias, intereses de mora y
        otros cargos. Extraordinarias y sanciones quedan documentadas en $0 (GAP-CAR-011) — el
        detalle de cada certificación explica por qué.
      </p>
    </div>

    <!-- ── lista ─────────────────────────────────────────────────────── -->
    <div>
      <h2 class="text-sm font-semibold mb-3">Certificaciones expedidas</h2>
      <UiTabla
        variante="tailwind"
        :columnas="[
          { clave: 'consecutivo', etiqueta: 'Consecutivo' },
          { clave: 'inmueble', etiqueta: 'Inmueble' },
          { clave: 'expedicion', etiqueta: 'Expedición' },
          { clave: 'total', etiqueta: 'Total certificado', alinear: 'derecha' },
          { clave: 'estado', etiqueta: 'Estado' },
          { clave: 'acciones', etiqueta: '', alinear: 'derecha' },
        ]"
        :filas="certStore.certificaciones"
        :clave-fila="(fila) => fila.id"
        :cargando="certStore.loading"
        vacio="Todavía no se ha expedido ninguna certificación de deuda."
      >
        <template #celda-consecutivo="{ fila }">
          <span class="font-medium">{{ fila.consecutivo }}</span>
        </template>
        <template #celda-inmueble="{ fila }">
          {{ inmueblePorId.get(fila.inmueble_id) ?? fila.inmueble_id }}
        </template>
        <template #celda-expedicion="{ fila }">
          {{ fecha(fila.fecha_expedicion) }}
        </template>
        <template #celda-total="{ fila }">
          <span class="tabular-nums">{{ formatoMoneda(fila.monto_total) }}</span>
        </template>
        <template #celda-estado="{ fila }">
          <UBadge size="sm" variant="subtle" :color="fila.estado === 'vigente' ? 'success' : 'neutral'">
            {{ fila.estado === 'vigente' ? 'Vigente' : 'Anulada' }}
          </UBadge>
        </template>
        <template #celda-acciones="{ fila }">
          <div class="flex justify-end gap-2">
            <UButton
              size="xs"
              variant="outline"
              color="neutral"
              icon="i-lucide-file-text"
              :to="`/cartera/certificaciones/${fila.id}`"
            >
              Ver
            </UButton>
            <UButton
              v-if="fila.estado === 'vigente'"
              size="xs"
              variant="outline"
              color="error"
              @click="abrirAnular(fila)"
            >
              Anular
            </UButton>
          </div>
        </template>
      </UiTabla>
    </div>

    <!-- ── anular ────────────────────────────────────────────────────── -->
    <UModal v-model:open="modalAnularAbierto" title="Anular certificación">
      <template #body>
        <div class="space-y-3 text-sm">
          <p class="text-neutral-500">
            {{ certificacionAAnular?.consecutivo }} queda anulada de forma permanente — el título
            ejecutivo la exige inmutable (REC-CAR-014). Si tiene un error, esta es la única
            corrección posible; para volver a certificar hay que expedir una nueva.
          </p>
          <UFormField label="Motivo de la anulación" name="motivo" required>
            <UTextarea v-model="motivoAnulacion" class="w-full" :rows="3" placeholder="Explica el error a corregir…" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="modalAnularAbierto = false">Cancelar</UButton>
            <UButton
              color="error"
              :loading="anulando"
              :disabled="motivoAnulacion.trim().length === 0"
              @click="confirmarAnular"
            >
              Anular certificación
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
