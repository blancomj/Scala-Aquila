<script setup lang="ts">
// Detalle de un acuerdo de pago (CAR §12.3-12.5): transiciones de estado
// (guard_acuerdo_transicion decide cuáles son válidas y exige
// administrador + bloquea autoaprobación al activar) y calendario de
// cuotas. Sin conciliación automática (GAP-CAR-008 sigue abierto): marcar
// una cuota pagada aquí es manual.
import {
  useCarteraGestionStore,
  type AcuerdoPago,
  type EstadoCuotaAcuerdo,
} from '~/stores/promesasAcuerdos'
import { useDocumentosStore } from '~/stores/documentos'
import { formatoMoneda } from '~/utils/formato'

const props = defineProps<{ acuerdo: AcuerdoPago; inmuebleCodigo: string }>()
const emit = defineEmits<{ cerrar: [] }>()

const tenantStore = useTenantStore()
const gestionStore = useCarteraGestionStore()
const documentosStore = useDocumentosStore()
const toast = useToast()

const esAdministrador = computed(() => tenantStore.role === 'administrador')

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: 'Borrador',
  pendiente_aprobacion: 'Espera aprobación',
  vigente: 'Vigente',
  cumplido: 'Cumplido',
  incumplido: 'Incumplido',
  cancelado: 'Cancelado',
}

const ETIQUETA_ESTADO_CUOTA: Record<EstadoCuotaAcuerdo, string> = {
  pendiente: 'Pendiente',
  parcial: 'Pago parcial',
  pagada: 'Pagada',
  vencida: 'Vencida',
  incumplida: 'Incumplida',
  cancelada: 'Cancelada',
}
const OPCIONES_ESTADO_CUOTA = Object.entries(ETIQUETA_ESTADO_CUOTA).map(([value, label]) => ({ value, label }))

const acuerdoActual = computed(() => gestionStore.acuerdos.find((a) => a.id === props.acuerdo.id) ?? props.acuerdo)

// El acuerdo firmado, si se adjuntó al crearlo (CAR §12.1) — documentosStore
// se carga scoped al inmueble en onMounted, misma instancia compartida que
// el resto de pantallas de documentos.
const documentoAcuerdo = computed(() =>
  documentosStore.documentos.find((d) => d.id === acuerdoActual.value.documento_id),
)
const descargandoDocumento = ref(false)

async function descargarDocumentoAcuerdo(): Promise<void> {
  const storagePath = documentoAcuerdo.value?.storage_path
  if (!storagePath) return
  descargandoDocumento.value = true
  try {
    const url = await documentosStore.urlDescarga(storagePath)
    window.open(url, '_blank', 'noopener')
  } catch {
    toast.add({ title: 'No se pudo generar el enlace de descarga', color: 'error' })
  } finally {
    descargandoDocumento.value = false
  }
}

async function cambiarEstado(estado: 'pendiente_aprobacion' | 'borrador' | 'vigente' | 'cancelado' | 'cumplido' | 'incumplido'): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  try {
    await gestionStore.cambiarEstadoAcuerdo(tenantId, props.acuerdo.id, estado)
    toast.add({ title: 'Acuerdo actualizado', color: 'success' })
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo actualizar el acuerdo',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  }
}

async function cambiarEstadoCuota(cuotaId: string, valor: EstadoCuotaAcuerdo): Promise<void> {
  try {
    await gestionStore.actualizarCuota(props.acuerdo.id, cuotaId, { estado: valor })
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo actualizar la cuota',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  }
}

onMounted(() => {
  void gestionStore.cargarCuotas(props.acuerdo.id)
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId && props.acuerdo.documento_id) {
    void documentosStore.cargarDocumentos(tenantId, props.acuerdo.inmueble_id)
  }
})
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
    :abierto="true"
    :titulo="`Acuerdo ${acuerdo.consecutivo ?? ''}`"
    :subtitulo="`Inmueble ${inmuebleCodigo}`"
    @cerrar="emit('cerrar')"
  >
    <div class="space-y-6 text-sm">
      <section class="space-y-2">
        <div class="flex items-center gap-2">
          <UBadge size="sm" variant="subtle">{{ ETIQUETA_ESTADO[acuerdoActual.estado] }}</UBadge>
          <span v-if="acuerdoActual.condona_interes" class="text-xs text-warning-600">
            Condona {{ formatoMoneda(acuerdoActual.monto_condonado) }} de interés — {{ acuerdoActual.acta_referencia }}
          </span>
        </div>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-1">
          <dt class="text-neutral-500">Capital</dt>
          <dd class="text-right tabular-nums">{{ formatoMoneda(acuerdoActual.monto_capital) }}</dd>
          <dt class="text-neutral-500">Intereses</dt>
          <dd class="text-right tabular-nums">{{ formatoMoneda(acuerdoActual.monto_interes) }}</dd>
          <dt class="text-neutral-500">Otros</dt>
          <dd class="text-right tabular-nums">{{ formatoMoneda(acuerdoActual.monto_otros) }}</dd>
          <dt class="font-medium">Total</dt>
          <dd class="text-right tabular-nums font-medium">{{ formatoMoneda(acuerdoActual.monto_total) }}</dd>
        </dl>
        <UButton
          v-if="acuerdoActual.documento_id"
          size="xs"
          variant="outline"
          icon="i-lucide-file-check"
          :loading="descargandoDocumento"
          :disabled="!documentoAcuerdo"
          @click="descargarDocumentoAcuerdo"
        >
          {{ documentoAcuerdo ? `Ver documento firmado (${documentoAcuerdo.nombre_archivo})` : 'Documento firmado adjunto' }}
        </UButton>
        <p class="text-xs text-neutral-400">
          {{ acuerdoActual.fecha_inicio }} → {{ acuerdoActual.fecha_fin }} · {{ acuerdoActual.numero_cuotas }} cuota(s)
          <span v-if="!acuerdoActual.interes_durante_acuerdo">· sin causar interés durante el acuerdo</span>
        </p>
        <p v-if="acuerdoActual.estado === 'incumplido'" class="text-xs text-error-600">
          Incumplido el {{ acuerdoActual.fecha_incumplimiento }}<span v-if="acuerdoActual.motivo_incumplimiento"> — {{ acuerdoActual.motivo_incumplimiento }}</span>
        </p>
      </section>

      <!-- ── transiciones ─────────────────────────────────────────────── -->
      <section class="flex flex-wrap gap-2 pt-3 border-t border-neutral-200 dark:border-neutral-800">
        <UButton v-if="acuerdoActual.estado === 'borrador'" size="sm" @click="cambiarEstado('pendiente_aprobacion')">
          Enviar a aprobación
        </UButton>
        <UButton v-if="acuerdoActual.estado === 'borrador'" size="sm" variant="ghost" color="error" @click="cambiarEstado('cancelado')">
          Cancelar borrador
        </UButton>

        <template v-if="acuerdoActual.estado === 'pendiente_aprobacion'">
          <UButton v-if="esAdministrador" size="sm" color="success" @click="cambiarEstado('vigente')">
            Aprobar y activar
          </UButton>
          <p v-else class="text-xs text-neutral-500">Activar el acuerdo exige rol administrador (CAR §12.1).</p>
          <UButton size="sm" variant="outline" color="neutral" @click="cambiarEstado('borrador')">Devolver a borrador</UButton>
          <UButton size="sm" variant="ghost" color="error" @click="cambiarEstado('cancelado')">Cancelar</UButton>
        </template>

        <template v-if="acuerdoActual.estado === 'vigente'">
          <UButton size="sm" color="success" @click="cambiarEstado('cumplido')">Marcar cumplido</UButton>
          <UButton size="sm" color="error" @click="cambiarEstado('incumplido')">Marcar incumplido</UButton>
          <UButton size="sm" variant="ghost" color="neutral" @click="cambiarEstado('cancelado')">Cancelar</UButton>
        </template>
      </section>

      <!-- ── cuotas ───────────────────────────────────────────────────── -->
      <section class="space-y-2 pt-3 border-t border-neutral-200 dark:border-neutral-800">
        <h3 class="text-xs font-semibold uppercase text-neutral-400">Calendario de cuotas</h3>
        <div v-for="c in gestionStore.cuotas" :key="c.id" class="rounded-md border border-neutral-200 dark:border-neutral-800 p-2 flex items-center justify-between gap-3">
          <div>
            <p class="font-medium">Cuota {{ c.numero_cuota }} · {{ c.fecha_vencimiento }}</p>
            <p class="text-xs text-neutral-400 tabular-nums">
              {{ formatoMoneda(c.monto) }}<span v-if="c.monto_pagado > 0"> · pagado {{ formatoMoneda(c.monto_pagado) }}</span>
            </p>
          </div>
          <USelect
            :model-value="c.estado"
            :items="OPCIONES_ESTADO_CUOTA"
            value-key="value"
            size="xs"
            class="w-36"
            @update:model-value="(v) => cambiarEstadoCuota(c.id, v as EstadoCuotaAcuerdo)"
          />
        </div>
        <p v-if="gestionStore.cuotas.length === 0" class="text-xs text-neutral-400">Sin cuotas.</p>
      </section>
    </div>

    <template #foot>
      <UButton variant="ghost" color="neutral" @click="emit('cerrar')">Cerrar</UButton>
    </template>
    </UiDrawer>
  </div>
</template>
