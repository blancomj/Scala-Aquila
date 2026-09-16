<script setup lang="ts">
/**
 * Historial de ejecuciones — RPT-04 (PLAN_MOTOR_REPORTES.md §6).
 *
 * Responde una sola pregunta, que es la que importa cuando alguien discute
 * una cifra: **¿de dónde salió este número?** Quién lo corrió, con qué
 * versión del reporte, con qué parámetros y cuándo. `reporte_ejecuciones` es
 * append-only desde RPT-01, así que esto solo lee — no hay forma de editar
 * el pasado desde aquí, ni siquiera siendo administrador.
 *
 * No hay tabla de auditoría propia (§57): los actos de gobierno —publicar
 * una versión, exportar datos— van a `audit_log` por disparador (RPT-04), y
 * esta pantalla muestra la bitácora operativa, que es otra cosa.
 */
import { formatearValor } from '@aquila/reporting'
import type { ColumnaTabla } from '~/components/ui/UiTabla.vue'
import { useReportesStore, type EjecucionHistorial } from '~/stores/reportes'

useHead({ title: 'Historial de reportes' })

const store = useReportesStore()
const tenantStore = useTenantStore()
const authStore = useAuthStore()

await useAsyncData('perfil', () => authStore.cargarPerfil())
await useAsyncData('memberships', () => tenantStore.cargarMemberships())

// Escribe en el store de Pinia, que sí sobrevive a la hidratación.
await useAsyncData(
  'reportes-historial',
  async () => {
    const tenantId = tenantStore.activeTenant?.id
    if (!tenantId) return null
    await store.cargarHistorial(tenantId)
    return true
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)

const soloExportaciones = ref(false)
const soloFallidas = ref(false)

const filas = computed(() =>
  store.historial.filter(
    (e) =>
      (!soloExportaciones.value || e.formato !== 'pantalla') && (!soloFallidas.value || !e.exito),
  ),
)

// ── KPIs ────────────────────────────────────────────────────────────────
// Solo los que significan algo en una copropiedad de 3-5 usuarios. Se
// descartan a propósito "usuarios que generan" y "descargas del mes" de la
// maqueta: con tres personas, el primero es siempre 3 y el segundo no cambia
// ninguna decisión.
const totalCorridas = computed(() => store.historial.length)
const exportaciones = computed(() => store.historial.filter((e) => e.formato !== 'pantalla').length)
const fallidas = computed(() => store.historial.filter((e) => !e.exito).length)
const masLenta = computed(() =>
  store.historial.reduce((peor, e) => Math.max(peor, e.duracionMs ?? 0), 0),
)

const ETIQUETA_FORMATO: Record<EjecucionHistorial['formato'], string> = {
  pantalla: 'Pantalla',
  pdf: 'PDF',
  xlsx: 'Excel',
  csv: 'CSV',
}

const COLUMNAS: ColumnaTabla<EjecucionHistorial>[] = [
  { clave: 'iniciadoAt', etiqueta: 'Cuándo' },
  { clave: 'reporteNombre', etiqueta: 'Reporte' },
  { clave: 'version', etiqueta: 'Versión' },
  { clave: 'formato', etiqueta: 'Formato' },
  { clave: 'parametros', etiqueta: 'Parámetros' },
  { clave: 'filas', etiqueta: 'Filas', alinear: 'derecha' },
  { clave: 'duracionMs', etiqueta: 'Duración', alinear: 'derecha' },
  { clave: 'archivo', etiqueta: 'Archivo' },
]

function momento(iso: string): string {
  return new Date(iso).toLocaleString('es-CO')
}

/** Los parámetros con los que se corrió, legibles en una celda. */
function parametrosLegibles(parametros: Record<string, unknown>): string {
  const partes = Object.entries(parametros).map(
    ([clave, valor]) => `${clave}: ${formatearValor(valor, 'texto')}`,
  )
  return partes.length > 0 ? partes.join(' · ') : '—'
}

function tamano(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-6">
    <div class="flex items-start justify-between gap-3">
      <UiTituloDescripcion clase-descripcion="text-sm text-slate-500 dark:text-slate-400">
        <template #titulo>
          <h1 class="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Historial de reportes
          </h1>
        </template>
        <template #descripcion>
          Cada corrida queda registrada con su versión del reporte y los parámetros exactos con que
          se ejecutó. Es lo que permite responder <strong>de dónde salió una cifra</strong> meses
          después. El registro no se puede editar ni borrar, ni siquiera desde aquí.
        </template>
      </UiTituloDescripcion>

      <UButton to="/reportes" icon="i-lucide-arrow-left" variant="ghost" color="neutral" class="shrink-0">
        Volver
      </UButton>
    </div>

    <div v-if="store.cargandoHistorial" class="mt-8 text-sm text-slate-500">
      Cargando historial…
    </div>

    <template v-else>
      <!-- KPIs -->
      <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <p class="text-xs uppercase tracking-wide text-slate-500">Corridas registradas</p>
          <p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {{ totalCorridas }}
          </p>
        </div>
        <div class="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <p class="text-xs uppercase tracking-wide text-slate-500">Con archivo descargado</p>
          <p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {{ exportaciones }}
          </p>
        </div>
        <div class="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <p class="text-xs uppercase tracking-wide text-slate-500">Fallidas</p>
          <p
            class="mt-1 text-2xl font-semibold"
            :class="fallidas > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'"
          >
            {{ fallidas }}
          </p>
        </div>
        <div class="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <p class="text-xs uppercase tracking-wide text-slate-500">Corrida más lenta</p>
          <p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {{ masLenta }} ms
          </p>
        </div>
      </div>

      <div class="mt-6 flex flex-wrap items-center gap-4">
        <UCheckbox v-model="soloExportaciones" label="Solo las que produjeron archivo" />
        <UCheckbox v-model="soloFallidas" label="Solo fallidas" />
      </div>

      <UiTabla
        class="mt-4"
        variante="tailwind"
        :columnas="COLUMNAS"
        :filas="filas"
        :clave-fila="(fila) => fila.id"
        vacio="Todavía no se ha ejecutado ningún reporte en esta copropiedad."
      >
        <template #celda-iniciadoAt="{ fila }">
          <span class="whitespace-nowrap text-sm">{{ momento(fila.iniciadoAt) }}</span>
        </template>

        <template #celda-reporteNombre="{ fila }">
          <span class="text-sm font-medium">{{ fila.reporteNombre }}</span>
          <UBadge v-if="!fila.exito" color="error" variant="subtle" size="xs" class="ml-2">
            {{ fila.errorCodigo ?? 'error' }}
          </UBadge>
          <UBadge v-if="fila.origen === 'programada'" variant="subtle" size="xs" class="ml-2">
            programada
          </UBadge>
        </template>

        <template #celda-version="{ fila }">
          <span class="text-sm">{{ fila.version ?? '—' }}</span>
        </template>

        <template #celda-formato="{ fila }">
          <span class="text-sm">{{ ETIQUETA_FORMATO[fila.formato] }}</span>
        </template>

        <template #celda-parametros="{ fila }">
          <span class="text-xs text-slate-500 dark:text-slate-400">
            {{ parametrosLegibles(fila.parametros) }}
          </span>
        </template>

        <template #celda-filas="{ fila }">
          <span class="text-sm">{{ fila.filas ?? '—' }}</span>
        </template>

        <template #celda-duracionMs="{ fila }">
          <span class="text-sm">{{ fila.duracionMs !== null ? `${fila.duracionMs} ms` : '—' }}</span>
        </template>

        <!-- El historial sobrevive al archivo: una corrida sin artefacto no
             es una corrida perdida, y una con el archivo ya purgado lo dice
             en vez de fingir que nunca existió. -->
        <template #celda-archivo="{ fila }">
          <span v-if="!fila.artefacto" class="text-xs text-slate-400">—</span>
          <span v-else-if="fila.artefacto.purgadoAt" class="text-xs text-slate-500">
            Expiró el {{ new Date(fila.artefacto.purgadoAt).toLocaleDateString('es-CO') }}
          </span>
          <span v-else class="text-xs text-slate-600 dark:text-slate-300">
            {{ tamano(fila.artefacto.bytes) }}
          </span>
        </template>
      </UiTabla>
    </template>
  </div>
</template>
