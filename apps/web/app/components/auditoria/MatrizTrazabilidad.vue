<script setup lang="ts">
// Matriz de trazabilidad (PROMPT AUDITORÍA §91): Riesgo → Control → Prueba →
// Evidencia → Hallazgo → Acción → Seguimiento → Cierre. Vista de solo
// lectura sobre fn_matriz_trazabilidad() — sin tabla propia, agrega lo que
// ya existe en riesgos/controles/procedimientos+ejecuciones/evidencias/
// hallazgos/acciones.
import type { FilaMatrizTrazabilidad } from '~/stores/auditoria'

const tenantStore = useTenantStore()
const auditoriaStore = useAuditoriaStore()

const cargando = ref(true)
const error = ref<string | null>(null)
const filas = ref<FilaMatrizTrazabilidad[]>([])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargando.value = true
  error.value = null
  try {
    filas.value = await auditoriaStore.cargarMatrizTrazabilidad(tenantId)
  } catch (err) {
    error.value = mensajeError(err, 'No se pudo cargar la matriz de trazabilidad.')
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

const grupos = computed(() => {
  const porRiesgo = new Map<string, { riesgo_nombre: string | null; riesgo_inherente: number | null; filas: FilaMatrizTrazabilidad[] }>()
  for (const fila of filas.value) {
    const clave = fila.riesgo_id ?? '__sin_riesgo__'
    if (!porRiesgo.has(clave)) {
      porRiesgo.set(clave, { riesgo_nombre: fila.riesgo_nombre, riesgo_inherente: fila.riesgo_inherente, filas: [] })
    }
    porRiesgo.get(clave)!.filas.push(fila)
  }
  return [...porRiesgo.entries()]
    .sort(([, a], [, b]) => (b.riesgo_inherente ?? -1) - (a.riesgo_inherente ?? -1))
    .map(([clave, grupo]) => ({ clave, ...grupo }))
})

const COLOR_NIVEL: Record<string, 'error' | 'warning' | 'neutral'> = {
  CRITICO: 'error',
  ALTO: 'error',
  MEDIO: 'warning',
  BAJO: 'neutral',
  OBSERVACION: 'neutral',
}
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-neutral-500 dark:text-neutral-400">
      Riesgo → Control → Prueba → Evidencia → Hallazgo → Acción → Seguimiento → Cierre (§91).
    </p>

    <div v-if="cargando" class="text-sm text-neutral-500 py-8 text-center">Cargando…</div>
    <p v-else-if="error" class="text-sm text-error-600">{{ error }}</p>
    <div v-else-if="filas.length === 0" class="text-sm text-neutral-500 py-8 text-center">
      Sin riesgos, controles o hallazgos registrados todavía.
    </div>

    <div v-else class="space-y-6">
      <div v-for="grupo in grupos" :key="grupo.clave">
        <div class="flex items-center gap-2 mb-2">
          <h3 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {{ grupo.riesgo_nombre ?? 'Sin riesgo asociado' }}
          </h3>
          <UBadge v-if="grupo.riesgo_inherente !== null" color="neutral" variant="subtle" size="xs">
            riesgo {{ grupo.riesgo_inherente }}
          </UBadge>
          <UBadge v-else color="warning" variant="subtle" size="xs">cadena incompleta</UBadge>
        </div>

        <div class="overflow-x-auto border border-neutral-200 dark:border-neutral-800 rounded-md">
          <table class="min-w-full text-sm">
            <thead class="bg-neutral-50 dark:bg-neutral-900/60">
              <tr class="text-left text-xs text-neutral-500 dark:text-neutral-400">
                <th class="px-3 py-2 font-medium">Control</th>
                <th class="px-3 py-2 font-medium">Prueba</th>
                <th class="px-3 py-2 font-medium">Evidencia</th>
                <th class="px-3 py-2 font-medium">Hallazgo</th>
                <th class="px-3 py-2 font-medium">Acción / seguimiento</th>
                <th class="px-3 py-2 font-medium">Cierre</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(fila, i) in grupo.filas"
                :key="fila.hallazgo_id ?? fila.control_id ?? i"
                class="border-t border-neutral-100 dark:border-neutral-800"
              >
                <td class="px-3 py-2 align-top">
                  <span v-if="fila.control_nombre">{{ fila.control_nombre }}</span>
                  <span v-else class="text-neutral-400">—</span>
                  <UBadge v-if="fila.control_id" :color="fila.control_automatizado ? 'info' : 'neutral'" variant="subtle" size="xs" class="ml-1">
                    {{ fila.control_automatizado ? 'Auto' : 'Manual' }}
                  </UBadge>
                </td>
                <td class="px-3 py-2 align-top tabular-nums">{{ fila.pruebas_count }}</td>
                <td class="px-3 py-2 align-top tabular-nums">{{ fila.evidencias_count }}</td>
                <td class="px-3 py-2 align-top">
                  <template v-if="fila.hallazgo_id">
                    <UBadge :color="COLOR_NIVEL[fila.hallazgo_nivel ?? ''] ?? 'neutral'" variant="subtle" size="xs">
                      {{ fila.hallazgo_nivel }}
                    </UBadge>
                    <span class="ml-1 text-xs text-neutral-500 dark:text-neutral-400">{{ fila.hallazgo_proceso }}</span>
                  </template>
                  <span v-else class="text-neutral-400">Sin hallazgos</span>
                </td>
                <td class="px-3 py-2 align-top">
                  <template v-if="fila.hallazgo_id">
                    {{ fila.acciones_count }} ({{ fila.acciones_abiertas }} abiertas)
                  </template>
                  <span v-else class="text-neutral-400">—</span>
                </td>
                <td class="px-3 py-2 align-top">
                  <UBadge v-if="fila.cerrado === true" color="success" variant="subtle" size="xs">Cerrado</UBadge>
                  <UBadge v-else-if="fila.cerrado === false" color="warning" variant="subtle" size="xs">
                    {{ fila.hallazgo_estado?.replace('_', ' ') }}
                  </UBadge>
                  <span v-else class="text-neutral-400">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
