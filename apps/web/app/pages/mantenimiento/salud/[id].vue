<script setup lang="ts">
// MANT-9 · Ficha de salud de un activo — evolución (snapshots) + explicación factual del cambio
// (§3.2): SIEMPRE hechos concretos, nunca "probabilidad de falla" ni "se recomienda reemplazar".
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const route = useRoute()
const activoId = route.params.id as string

const tenantStore = useTenantStore()
const saludStore = useMantenimientoSaludStore()
const activosStore = useActivosStore()

const cargando = ref(false)
const errorCarga = ref<string | null>(null)

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  cargando.value = true
  try {
    await Promise.all([
      saludStore.cargarSalud({ tenantId, activoId }),
      saludStore.cargarSnapshots(activoId),
      activosStore.cargarFicha(tenantId, activoId),
    ])
  } catch (e) {
    errorCarga.value = mensajeError(e, 'No se pudo cargar la salud del activo.')
  } finally {
    cargando.value = false
  }
}

await useAsyncData(`mant9-salud-${activoId}`, async () => {
  await cargar()
  return null
})

const activo = computed(() => activosStore.activos.find((a) => a.id === activoId) ?? activosStore.activo)

interface DesgloseFactor {
  factor_codigo: string
  factor_nombre: string
  dato_crudo: number | null
  puntaje: number | null
  peso: number
  contribucion: number | null
}
const desglose = computed<DesgloseFactor[] | null>(() => {
  const s = saludStore.salud as unknown as { desglose: DesgloseFactor[] | null } | null
  return s?.desglose ?? null
})

function formatoDato(dato: number | null): string {
  return dato === null || dato === undefined ? '—' : dato.toLocaleString('es-CO', { maximumFractionDigits: 1 })
}

async function registrarSnapshotHoy(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await saludStore.registrarSnapshot({ tenantId, activoId })
  await saludStore.cargarSnapshots(activoId)
}

// ── Explicación factual ─────────────────────────────────────────────────
const hoy = new Date().toISOString().slice(0, 10)
function haceDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}
const desde = ref(haceDias(90))
const hasta = ref(hoy)
const cargandoExplicacion = ref(false)

async function cargarExplicacion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargandoExplicacion.value = true
  try {
    await saludStore.cargarExplicacion({ tenantId, activoId, desde: desde.value, hasta: hasta.value })
  } finally {
    cargandoExplicacion.value = false
  }
}
onMounted(cargarExplicacion)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h1 class="text-xl font-semibold">
          Salud — {{ activo ? `${activo.codigo} — ${activo.nombre}` : activoId }}
        </h1>
        <p class="text-sm text-neutral-500">El índice ordena y prioriza. La decisión la toman las personas.</p>
      </div>
      <div class="flex gap-2">
        <UButton size="xs" variant="ghost" :to="`/mantenimiento/salud/escenarios?activo=${activoId}`">
          Comparar escenarios
        </UButton>
        <UButton size="xs" variant="soft" :loading="saludStore.guardando" @click="registrarSnapshotHoy">
          Guardar snapshot de hoy
        </UButton>
      </div>
    </div>

    <UAlert v-if="errorCarga" color="error" variant="soft" :title="errorCarga" />

    <template v-else-if="!cargando">
      <div class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <p class="text-xs uppercase tracking-wide text-neutral-400">Índice actual</p>
        <p class="mt-1 text-3xl font-semibold tabular-nums">{{ saludStore.salud?.indice ?? '—' }}</p>
        <table v-if="desglose" class="mt-4 w-full text-sm">
          <thead>
            <tr class="text-neutral-400 text-xs">
              <th class="text-left font-normal">Factor</th>
              <th class="text-right font-normal">Dato</th>
              <th class="text-right font-normal">Puntaje</th>
              <th class="text-right font-normal">Peso</th>
              <th class="text-right font-normal">Contribución</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="f in desglose"
              :key="f.factor_codigo"
              class="border-t border-neutral-100 dark:border-neutral-800"
            >
              <td class="py-1.5">{{ f.factor_nombre }}</td>
              <td class="py-1.5 text-right tabular-nums">{{ formatoDato(f.dato_crudo) }}</td>
              <td class="py-1.5 text-right tabular-nums">{{ formatoDato(f.puntaje) }}</td>
              <td class="py-1.5 text-right tabular-nums">{{ f.peso }}%</td>
              <td class="py-1.5 text-right tabular-nums font-medium">{{ formatoDato(f.contribucion) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 class="mb-3 text-sm font-semibold">Evolución</h2>
        <ul v-if="saludStore.snapshots.length > 0" class="space-y-1 text-sm">
          <li v-for="s in saludStore.snapshots" :key="s.id" class="flex justify-between border-b border-neutral-100 py-1 last:border-0 dark:border-neutral-800">
            <span class="text-neutral-500">{{ s.fecha }}</span>
            <span class="tabular-nums font-medium">{{ s.indice }}</span>
          </li>
        </ul>
        <p v-else class="text-sm text-neutral-400">Sin snapshots guardados todavía.</p>
      </div>

      <div class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 class="mb-3 text-sm font-semibold">¿Por qué cambió la salud?</h2>
        <div class="mb-3 flex items-end gap-2">
          <UFormField label="Desde" size="xs">
            <UInput v-model="desde" type="date" class="w-40" @change="cargarExplicacion" />
          </UFormField>
          <UFormField label="Hasta" size="xs">
            <UInput v-model="hasta" type="date" class="w-40" @change="cargarExplicacion" />
          </UFormField>
        </div>
        <p class="mb-3 text-xs text-neutral-500">
          Calculado en vivo con los factores vigentes actuales sobre ambas fechas — no depende de
          que existan snapshots guardados.
        </p>
        <div v-if="cargandoExplicacion" class="text-sm text-neutral-400">Calculando…</div>
        <ul v-else class="space-y-1 text-sm">
          <li
            v-for="f in saludStore.explicacion"
            :key="f.factor_codigo"
            class="flex items-center justify-between gap-2 border-b border-neutral-100 py-1 last:border-0 dark:border-neutral-800"
          >
            <span>{{ f.factor_nombre }}</span>
            <span class="flex items-center gap-2 tabular-nums">
              <span class="text-neutral-400">{{ formatoDato(f.contribucion_desde) }} → {{ formatoDato(f.contribucion_hasta) }}</span>
              <UBadge
                v-if="f.variacion !== null"
                size="xs"
                variant="subtle"
                :color="f.variacion > 0 ? 'success' : f.variacion < 0 ? 'error' : 'neutral'"
              >
                {{ f.variacion > 0 ? '+' : '' }}{{ f.variacion }}
              </UBadge>
            </span>
          </li>
          <li v-if="saludStore.explicacion.length === 0" class="text-neutral-400">Sin factores configurados.</li>
        </ul>
      </div>
    </template>
  </div>
</template>
