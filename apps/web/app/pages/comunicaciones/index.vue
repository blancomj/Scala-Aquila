<script setup lang="ts">
// Comunicaciones (COM-1) — repositorio unificado de todo el correo enviado
// por cualquier módulo (Cobranza, Gobierno, Compositor de correo, Estado de
// cuenta, Recibo de caja). Lee acciones_cobranza_envios/acuses, la misma
// tabla que ya usa el expediente probatorio de cobranza (CAR §34) —
// generalizada por GOB-9 y ampliada por COM-1 para que los otros emisores de
// correo también dejen rastro con acuse de entrega, no solo un log suelto.
//
// Solo lectura: el registro real ocurre en las Edge Functions con
// service_role — esta pantalla nunca escribe.
import type { ColumnaTabla } from '~/components/ui/UiTabla.vue'
import { textoLegible, ETIQUETA_CANAL } from '~/utils/mensaje-cobranza'
import { ETIQUETA_MODULO, type ComunicacionEnvio } from '~/stores/comunicaciones'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'audit:view' })

const comunicacionesStore = useComunicacionesStore()

const errorCarga = ref<string | null>(null)
const busqueda = ref('')
const fechaDesde = ref('')
const fechaHasta = ref('')
const filtroModulo = ref<string>('todos')
const filtroCanal = ref<string>('todos')
const filtroAutomatico = ref<'todos' | 'si' | 'no'>('todos')
const filtroEstado = ref<string>('todos')

const detalleAbierto = ref(false)
const envioDetalle = ref<ComunicacionEnvio | null>(null)

async function cargar(): Promise<void> {
  errorCarga.value = null
  try {
    await comunicacionesStore.cargarComunicaciones()
  } catch (excepcion) {
    errorCarga.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo cargar el histórico de comunicaciones.'
  }
}
onMounted(cargar)

const ETIQUETA_ACUSE: Record<string, string> = {
  encolado: 'En cola del proveedor',
  entregado: 'Entregado',
  leido: 'Leído',
  rebotado: 'Rebotado',
  fallido: 'Fallido',
  no_entregable: 'No entregable',
}

function moduloDe(fila: ComunicacionEnvio): string {
  return fila.accionId ? 'cobranza' : (fila.origenModulo ?? '—')
}

function etiquetaModulo(fila: ComunicacionEnvio): string {
  const modulo = moduloDe(fila)
  return ETIQUETA_MODULO[modulo] ?? modulo
}

function eventoDisparador(fila: ComunicacionEnvio): string {
  if (fila.accionId) return 'Acción de cobranza'
  return fila.origenEvento ?? '—'
}

function colorAcuse(estado: string | undefined): 'success' | 'error' | 'warning' | 'neutral' {
  if (estado === 'entregado' || estado === 'leido') return 'success'
  if (estado === 'rebotado' || estado === 'fallido' || estado === 'no_entregable') return 'error'
  if (estado === 'encolado') return 'warning'
  return 'neutral'
}

function fechaHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

const OPCIONES_MODULO = [
  { label: 'Todos los módulos', value: 'todos' },
  { label: 'Cobranza', value: 'cobranza' },
  { label: 'Gobierno', value: 'gobierno' },
  { label: 'Compositor de correo', value: 'compositor' },
  { label: 'Estado de cuenta', value: 'estado_cuenta' },
  { label: 'Recibo de caja', value: 'recibo_caja' },
]

const OPCIONES_CANAL = [
  { label: 'Todos los canales', value: 'todos' },
  { label: 'Correo', value: 'email' },
  { label: 'SMS', value: 'sms' },
]

const OPCIONES_AUTOMATICO = [
  { label: 'Todos', value: 'todos' },
  { label: 'Automático', value: 'si' },
  { label: 'Manual', value: 'no' },
]

const OPCIONES_ESTADO = [
  { label: 'Todos los estados', value: 'todos' },
  { label: 'Sin acuse todavía', value: 'sin_acuse' },
  { label: 'En cola del proveedor', value: 'encolado' },
  { label: 'Entregado', value: 'entregado' },
  { label: 'Leído', value: 'leido' },
  { label: 'Rebotado', value: 'rebotado' },
  { label: 'Fallido', value: 'fallido' },
  { label: 'No entregable', value: 'no_entregable' },
]

const resumen = computed(() => {
  const total = comunicacionesStore.envios.length
  const conAcuse = comunicacionesStore.envios.filter((f) => f.ultimoAcuse !== null)
  const entregados = conAcuse.filter(
    (f) => f.ultimoAcuse?.estado === 'entregado' || f.ultimoAcuse?.estado === 'leido',
  ).length
  const rebotados = comunicacionesStore.envios.filter(
    (f) =>
      f.ultimoAcuse?.estado === 'rebotado' ||
      f.ultimoAcuse?.estado === 'fallido' ||
      f.ultimoAcuse?.estado === 'no_entregable',
  ).length
  const sinAcuse = total - conAcuse.length
  return {
    total,
    porcentajeEntregado: conAcuse.length > 0 ? Math.round((entregados / conAcuse.length) * 100) : 0,
    rebotados,
    sinAcuse,
  }
})

const filas = computed(() => {
  const texto = busqueda.value.trim().toLowerCase()
  const desde = fechaDesde.value ? new Date(fechaDesde.value) : null
  const hasta = fechaHasta.value ? new Date(`${fechaHasta.value}T23:59:59`) : null

  return comunicacionesStore.envios.filter((f) => {
    if (filtroModulo.value !== 'todos' && moduloDe(f) !== filtroModulo.value) return false
    if (filtroCanal.value !== 'todos' && f.canal !== filtroCanal.value) return false
    if (filtroAutomatico.value === 'si' && !f.esAutomatico) return false
    if (filtroAutomatico.value === 'no' && f.esAutomatico) return false
    if (filtroEstado.value === 'sin_acuse' && f.ultimoAcuse !== null) return false
    if (
      filtroEstado.value !== 'todos' &&
      filtroEstado.value !== 'sin_acuse' &&
      f.ultimoAcuse?.estado !== filtroEstado.value
    )
      return false
    const enviado = new Date(f.enviadoAt)
    if (desde && enviado < desde) return false
    if (hasta && enviado > hasta) return false
    if (
      texto &&
      !(
        f.destinatarioContacto.toLowerCase().includes(texto) ||
        (f.asunto ?? '').toLowerCase().includes(texto) ||
        f.plantillaCodigo.toLowerCase().includes(texto)
      )
    )
      return false
    return true
  })
})

const columnas: ColumnaTabla<ComunicacionEnvio>[] = [
  {
    clave: 'fecha',
    etiqueta: 'Fecha',
    ordenar: (fila) => fila.enviadoAt,
  },
  { clave: 'modulo', etiqueta: 'Módulo' },
  { clave: 'canal', etiqueta: 'Canal' },
  { clave: 'destinatario', etiqueta: 'Destinatario' },
  { clave: 'asunto', etiqueta: 'Asunto / plantilla' },
  { clave: 'automatico', etiqueta: 'Automático' },
  { clave: 'estado', etiqueta: 'Estado de entrega' },
  { clave: 'evento', etiqueta: 'Evento disparador' },
]

function abrirDetalle(fila: ComunicacionEnvio): void {
  envioDetalle.value = fila
  detalleAbierto.value = true
}
</script>

<template>
  <div class="space-y-6">
    <div class="mb-8">
      <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 max-w-2xl">
        <template #titulo>
          <h1 class="text-2xl font-semibold tracking-tight">Comunicaciones</h1>
        </template>
        <template #descripcion>
          Todo el correo enviado desde cualquier módulo — quién lo recibió, si se entregó, si lo
          disparó una persona o un proceso automático, y qué evento lo originó.
        </template>
      </UiTituloDescripcion>
    </div>

    <UAlert
      v-if="errorCarga"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="No se pudo cargar el histórico"
      :description="errorCarga"
    />

    <!-- ── resumen ──────────────────────────────────────────────────── -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
        <p class="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Total enviados
        </p>
        <p class="text-3xl font-bold tabular-nums mt-1">{{ resumen.total }}</p>
      </div>
      <div class="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
        <p class="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          % Entregado (de los que ya tienen acuse)
        </p>
        <p class="text-3xl font-bold tabular-nums mt-1 text-success-600 dark:text-success-400">
          {{ resumen.porcentajeEntregado }}%
        </p>
      </div>
      <div class="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
        <p class="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Rebotados o fallidos
        </p>
        <p class="text-3xl font-bold tabular-nums mt-1 text-error-600 dark:text-error-400">
          {{ resumen.rebotados }}
        </p>
      </div>
      <div class="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
        <p class="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Sin acuse todavía
        </p>
        <p class="text-3xl font-bold tabular-nums mt-1">{{ resumen.sinAcuse }}</p>
      </div>
    </div>

    <!-- ── filtros ──────────────────────────────────────────────────── -->
    <div class="flex flex-wrap items-end gap-3">
      <UFormField label="Buscar">
        <UInput
          v-model="busqueda"
          placeholder="Destinatario, asunto o plantilla"
          icon="i-lucide-search"
          size="sm"
          class="w-64"
        />
      </UFormField>
      <UFormField label="Desde">
        <UInput v-model="fechaDesde" type="date" size="sm" class="w-40" />
      </UFormField>
      <UFormField label="Hasta">
        <UInput v-model="fechaHasta" type="date" size="sm" class="w-40" />
      </UFormField>
      <UFormField label="Módulo">
        <USelect v-model="filtroModulo" :items="OPCIONES_MODULO" value-key="value" size="sm" class="w-48" />
      </UFormField>
      <UFormField label="Canal">
        <USelect v-model="filtroCanal" :items="OPCIONES_CANAL" value-key="value" size="sm" class="w-40" />
      </UFormField>
      <UFormField label="Origen">
        <USelect v-model="filtroAutomatico" :items="OPCIONES_AUTOMATICO" value-key="value" size="sm" class="w-36" />
      </UFormField>
      <UFormField label="Estado de entrega">
        <USelect v-model="filtroEstado" :items="OPCIONES_ESTADO" value-key="value" size="sm" class="w-48" />
      </UFormField>
      <UButton
        icon="i-lucide-refresh-cw"
        size="sm"
        variant="ghost"
        color="neutral"
        :loading="comunicacionesStore.loading"
        @click="cargar"
      >
        Actualizar
      </UButton>
    </div>

    <p class="text-xs text-neutral-400">
      El histórico arranca desde COM-1 (2026-09-09) hacia adelante — correos enviados antes de esa
      fecha por el compositor, el estado de cuenta o el recibo de caja no quedaron registrados aquí.
    </p>

    <!-- ── tabla ────────────────────────────────────────────────────── -->
    <div v-if="comunicacionesStore.loading && comunicacionesStore.envios.length === 0" class="space-y-2">
      <USkeleton v-for="i in 5" :key="i" class="h-10 w-full" />
    </div>

    <p v-else-if="filas.length === 0" class="text-sm text-neutral-500">
      No hay comunicaciones que coincidan con el filtro.
    </p>

    <UiTabla
      v-else
      variante="tailwind"
      :columnas="columnas"
      :filas="filas"
      :clave-fila="(fila) => fila.envioId"
    >
      <template #celda-fecha="{ fila }">
        <span class="text-sm tabular-nums">{{ fechaHora(fila.enviadoAt) }}</span>
      </template>
      <template #celda-modulo="{ fila }">
        <span class="text-sm">{{ etiquetaModulo(fila) }}</span>
      </template>
      <template #celda-canal="{ fila }">
        <UBadge size="sm" variant="subtle" color="neutral">{{ ETIQUETA_CANAL[fila.canal] ?? fila.canal }}</UBadge>
      </template>
      <template #celda-destinatario="{ fila }">
        <span class="text-sm">{{ fila.destinatarioContacto }}</span>
      </template>
      <template #celda-asunto="{ fila }">
        <button type="button" class="text-sm text-left hover:underline" @click="abrirDetalle(fila)">
          {{ fila.asunto ?? fila.plantillaCodigo }}
        </button>
      </template>
      <template #celda-automatico="{ fila }">
        <UBadge size="sm" variant="subtle" :color="fila.esAutomatico ? 'info' : 'neutral'">
          {{ fila.esAutomatico ? 'Automático' : 'Manual' }}
        </UBadge>
      </template>
      <template #celda-estado="{ fila }">
        <UBadge size="sm" variant="subtle" :color="colorAcuse(fila.ultimoAcuse?.estado)">
          {{ fila.ultimoAcuse ? ETIQUETA_ACUSE[fila.ultimoAcuse.estado] : 'Sin acuse' }}
        </UBadge>
      </template>
      <template #celda-evento="{ fila }">
        <span class="text-xs text-neutral-500">{{ eventoDisparador(fila) }}</span>
      </template>
    </UiTabla>

    <!-- ── detalle ──────────────────────────────────────────────────── -->
    <UModal v-model:open="detalleAbierto" title="Detalle de la comunicación">
      <template #body>
        <div v-if="envioDetalle" class="space-y-5">
          <div
            class="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800"
          >
            <div class="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6">
              <div class="space-y-1">
                <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Módulo</p>
                <p class="text-sm font-medium">{{ etiquetaModulo(envioDetalle) }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Canal</p>
                <p class="text-sm font-medium">{{ ETIQUETA_CANAL[envioDetalle.canal] ?? envioDetalle.canal }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Enviado</p>
                <p class="text-sm font-medium">{{ fechaHora(envioDetalle.enviadoAt) }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Destinatario</p>
                <p class="text-sm font-medium">{{ envioDetalle.destinatarioContacto }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
                  Vinculado a un tercero
                </p>
                <p class="text-sm font-medium">
                  {{ envioDetalle.destinatarioTerceroId ? 'Sí' : 'No — destinatario suelto' }}
                </p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Origen</p>
                <p class="text-sm font-medium">{{ envioDetalle.esAutomatico ? 'Automático' : 'Manual' }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Evento disparador</p>
                <p class="text-sm font-medium">{{ eventoDisparador(envioDetalle) }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Proveedor</p>
                <p class="text-sm font-medium">
                  {{ envioDetalle.proveedor }}{{ envioDetalle.referenciaExterna ? ` · ${envioDetalle.referenciaExterna}` : '' }}
                </p>
              </div>
            </div>
          </div>

          <div class="space-y-3">
            <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
              <UIcon name="i-lucide-shield-check" class="size-3" />
              Contenido enviado
            </h3>
            <p v-if="envioDetalle.asunto" class="text-sm font-medium">Asunto: {{ envioDetalle.asunto }}</p>
            <p class="text-sm whitespace-pre-wrap rounded bg-neutral-50 dark:bg-neutral-900 p-2">
              {{ textoLegible(envioDetalle.canal, envioDetalle.contenidoRenderizado) }}
            </p>
          </div>

          <div class="space-y-3">
            <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
              <UIcon name="i-lucide-list-checks" class="size-3" />
              Línea de tiempo de acuses
            </h3>
            <div v-if="envioDetalle.acuses.length > 0" class="flex flex-wrap items-center gap-2">
              <UBadge
                v-for="(acuse, indice) in envioDetalle.acuses"
                :key="indice"
                size="sm"
                variant="subtle"
                :color="colorAcuse(acuse.estado)"
                :title="acuse.motivo ?? ''"
              >
                {{ ETIQUETA_ACUSE[acuse.estado] ?? acuse.estado }} · {{ fechaHora(acuse.ocurridoAt) }}
              </UBadge>
            </div>
            <p v-else class="text-xs text-neutral-400">Sin acuses del proveedor todavía.</p>
          </div>
        </div>
      </template>

      <template #footer>
        <UButton color="neutral" variant="ghost" @click="detalleAbierto = false">Cerrar</UButton>
      </template>
    </UModal>
  </div>
</template>
