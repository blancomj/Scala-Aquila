<script setup lang="ts">
// MANT-9 · Mapa de riesgo (§3.5) — cruce de criticidad (MANT-1) contra salud: una vista de
// priorización, honesta solo si cada punto es navegable a sus hechos (nunca un número aislado).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

interface Punto {
  activoId: string
  nombre: string
  criticidad: number
  criticidadBanda: string | null
  salud: number
}

const tenantStore = useTenantStore()
const saludStore = useMantenimientoSaludStore()
const activosStore = useActivosStore()

const cargando = ref(true)
const errorCarga = ref<string | null>(null)
const puntos = ref<Punto[]>([])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  cargando.value = true
  try {
    await Promise.all([saludStore.cargarSets(tenantId), activosStore.cargarActivos(tenantId)])
    if (!saludStore.setVigente) {
      puntos.value = []
      return
    }
    const cliente = useSupabaseClient<Database>()
    const resultados = await Promise.all(
      activosStore.activos.map(async (a) => {
        const [salud, crit] = await Promise.all([
          cliente.rpc('mant_salud', { p_tenant_id: tenantId, p_activo_id: a.id }).single(),
          cliente.rpc('mant_criticidad', { p_activo_id: a.id }).maybeSingle(),
        ])
        if (salud.error) throw salud.error
        if (crit.error) throw crit.error
        const saludDato = salud.data as unknown as { indice: number | null }
        const critDato = crit.data as unknown as { puntaje_total: number; banda: string } | null
        if (saludDato.indice === null || !critDato) return null
        const punto: Punto = {
          activoId: a.id,
          nombre: `${a.codigo} — ${a.nombre}`,
          criticidad: critDato.puntaje_total,
          criticidadBanda: critDato.banda,
          salud: saludDato.indice,
        }
        return punto
      }),
    )
    puntos.value = resultados.filter((p): p is Punto => p !== null)
  } catch (e) {
    errorCarga.value = mensajeError(e, 'No se pudo construir el mapa de riesgo.')
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

// Lienzo 0-100 en ambos ejes: x = criticidad, y = 100 - salud (arriba = peor salud).
const DIM = 320
function coordX(p: Punto): number {
  return 20 + (p.criticidad / 100) * DIM
}
function coordY(p: Punto): number {
  return 20 + ((100 - p.salud) / 100) * DIM
}
function colorPunto(p: Punto): string {
  if (p.criticidad >= 50 && p.salud < 50) return 'var(--ui-error)'
  if (p.criticidad >= 50 || p.salud < 50) return 'var(--ui-warning)'
  return 'var(--ui-success)'
}

const activo = ref<Punto | null>(null)
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 mt-1">
      <template #titulo>
        <h1 class="text-xl font-semibold">Mapa de riesgo</h1>
      </template>
      <template #descripcion>
        Cruce de criticidad y salud: prioriza dónde mirar primero, no concluye qué hacer. Cada
        punto lleva a los hechos del activo — criticidad y salud, con su desglose.
      </template>
    </UiTituloDescripcion>

    <UAlert v-if="errorCarga" color="error" variant="soft" :title="errorCarga" />

    <UAlert
      v-else-if="!cargando && !saludStore.setVigente"
      color="warning"
      variant="soft"
      title="Todavía no hay un set de factores de salud activo"
      description="Configura al menos un factor y actívalo para poder cruzar salud con criticidad."
    >
      <template #actions>
        <UButton size="xs" to="/mantenimiento/salud/configuracion">Ir a configuración</UButton>
      </template>
    </UAlert>

    <div v-else-if="cargando" class="text-sm text-neutral-400">Calculando…</div>

    <template v-else>
      <p v-if="puntos.length === 0" class="text-sm text-neutral-400">
        Ningún activo tiene salud y criticidad calculables todavía.
      </p>
      <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
        <svg :viewBox="`0 0 ${DIM + 40} ${DIM + 40}`" :width="DIM + 40" :height="DIM + 40" class="shrink-0">
          <line :x1="20 + DIM / 2" y1="20" :x2="20 + DIM / 2" :y2="20 + DIM" stroke="currentColor" class="text-neutral-200 dark:text-neutral-800" />
          <line x1="20" :y1="20 + DIM / 2" :x2="20 + DIM" :y2="20 + DIM / 2" stroke="currentColor" class="text-neutral-200 dark:text-neutral-800" />
          <rect x="20" y="20" :width="DIM" :height="DIM" fill="none" stroke="currentColor" class="text-neutral-300 dark:text-neutral-700" />

          <text :x="20 + DIM / 4" y="14" text-anchor="middle" class="fill-neutral-400 text-[9px]">Baja criticidad</text>
          <text :x="20 + (3 * DIM) / 4" y="14" text-anchor="middle" class="fill-neutral-400 text-[9px]">Alta criticidad</text>
          <text x="8" :y="20 + DIM / 4" text-anchor="middle" class="fill-neutral-400 text-[9px]" :transform="`rotate(-90 8 ${20 + DIM / 4})`">Salud baja</text>
          <text x="8" :y="20 + (3 * DIM) / 4" text-anchor="middle" class="fill-neutral-400 text-[9px]" :transform="`rotate(-90 8 ${20 + (3 * DIM) / 4})`">Salud alta</text>

          <g
            v-for="p in puntos"
            :key="p.activoId"
            class="cursor-pointer"
            @click="activo = p"
            @mouseenter="activo = p"
          >
            <circle :cx="coordX(p)" :cy="coordY(p)" r="6" :fill="colorPunto(p)" opacity="0.85" stroke="white" stroke-width="1" />
          </g>
        </svg>

        <div class="space-y-3">
          <div v-if="activo" class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <p class="font-medium">{{ activo.nombre }}</p>
            <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt class="text-neutral-500">Criticidad</dt>
              <dd class="text-right tabular-nums">{{ activo.criticidad }} ({{ activo.criticidadBanda }})</dd>
              <dt class="text-neutral-500">Salud</dt>
              <dd class="text-right tabular-nums">{{ activo.salud }}</dd>
            </dl>
            <div class="mt-3 flex gap-2">
              <UButton size="xs" variant="soft" :to="`/mantenimiento/salud/${activo.activoId}`">Ver salud y su desglose</UButton>
              <UButton size="xs" variant="soft" :to="`/mantenimiento/activos/${activo.activoId}`">Ver criticidad y su desglose</UButton>
            </div>
          </div>
          <p v-else class="text-sm text-neutral-400">Pasa el cursor sobre un punto para ver el activo.</p>

          <ul class="max-h-80 space-y-1 overflow-y-auto text-sm">
            <li
              v-for="p in [...puntos].sort((a, b) => b.criticidad - a.criticidad + (a.salud - b.salud))"
              :key="p.activoId"
              class="flex cursor-pointer items-center justify-between gap-2 border-b border-neutral-100 py-1 last:border-0 hover:text-primary-600 dark:border-neutral-800"
              @click="activo = p"
            >
              <span>{{ p.nombre }}</span>
              <span class="tabular-nums text-neutral-400">crit {{ p.criticidad }} · salud {{ p.salud }}</span>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>
