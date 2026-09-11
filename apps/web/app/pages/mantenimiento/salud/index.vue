<script setup lang="ts">
// MANT-9 · Salud del activo — listado ordenado por índice, CON el desglose visible en línea
// (nunca escondido tras un clic, exigencia del §3.6). Sin set de salud vigente, la pantalla lo
// explica y enlaza directo a Configuración en vez de mostrar una lista vacía sin contexto.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

interface SaludFila {
  indice: number | null
  set_id: string | null
  version: number | null
  desglose: unknown
  activoId: string
}

const tenantStore = useTenantStore()
const saludStore = useMantenimientoSaludStore()
const activosStore = useActivosStore()

const cargando = ref(true)
const errorCarga = ref<string | null>(null)
const filas = ref<SaludFila[]>([])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  cargando.value = true
  try {
    await Promise.all([saludStore.cargarSets(tenantId), activosStore.cargarActivos(tenantId)])
    if (!saludStore.setVigente) {
      filas.value = []
      return
    }
    const cliente = useSupabaseClient<Database>()
    const resultados = await Promise.all(
      activosStore.activos.map(async (a) => {
        const { data, error } = await cliente.rpc('mant_salud', { p_tenant_id: tenantId, p_activo_id: a.id }).single()
        if (error) throw error
        return { ...data, activoId: a.id } as SaludFila
      }),
    )
    filas.value = resultados
      .filter((f) => f.indice !== null)
      .sort((a, b) => (a.indice ?? 0) - (b.indice ?? 0))
  } catch (e) {
    errorCarga.value = mensajeError(e, 'No se pudo calcular la salud de los activos.')
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

const nombreActivo = computed(() => new Map(activosStore.activos.map((a) => [a.id, `${a.codigo} — ${a.nombre}`])))

function colorIndice(indice: number): 'error' | 'warning' | 'success' {
  if (indice < 40) return 'error'
  if (indice < 70) return 'warning'
  return 'success'
}

function formatoDato(dato: number | null): string {
  return dato === null ? '—' : dato.toLocaleString('es-CO', { maximumFractionDigits: 1 })
}

const expandidas = ref(new Set<string>())
function alternar(activoId: string): void {
  const siguiente = new Set(expandidas.value)
  if (!siguiente.delete(activoId)) siguiente.add(activoId)
  expandidas.value = siguiente
}

interface DesgloseFactor {
  factor_codigo: string
  factor_nombre: string
  fuente_codigo: string
  dato_crudo: number | null
  puntaje: number | null
  peso: number
  contribucion: number | null
}
function desgloseDe(fila: SaludFila): DesgloseFactor[] {
  return (fila as unknown as { desglose: DesgloseFactor[] }).desglose
}
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 mt-1">
      <template #titulo>
        <h1 class="text-xl font-semibold">Salud de los activos</h1>
      </template>
      <template #descripcion>
        El índice ordena y prioriza — nunca concluye. Cada número se muestra siempre con su
        desglose por factor: de dónde salió cada dato y cuánto pesó.
      </template>
    </UiTituloDescripcion>

    <UAlert v-if="errorCarga" color="error" variant="soft" :title="errorCarga" />

    <UAlert
      v-else-if="!cargando && !saludStore.setVigente"
      color="warning"
      variant="soft"
      title="Todavía no hay un set de factores de salud activo"
      description="Configura al menos un factor y actívalo para empezar a ver el índice de cada activo."
    >
      <template #actions>
        <UButton size="xs" to="/mantenimiento/salud/configuracion">Ir a configuración</UButton>
      </template>
    </UAlert>

    <div v-else-if="cargando" class="space-y-2">
      <USkeleton v-for="i in 5" :key="i" class="h-16 w-full" />
    </div>

    <ul v-else class="space-y-2">
      <li v-if="filas.length === 0" class="text-sm text-neutral-400">
        Ningún activo tiene datos suficientes todavía para calcular su salud.
      </li>
      <li
        v-for="fila in filas"
        :key="fila.activoId"
        class="rounded-lg border border-neutral-200 dark:border-neutral-800"
      >
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          @click="alternar(fila.activoId)"
        >
          <div class="flex items-center gap-3">
            <UIcon :name="expandidas.has(fila.activoId) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-neutral-400" />
            <NuxtLink :to="`/mantenimiento/salud/${fila.activoId}`" class="font-medium hover:underline" @click.stop>
              {{ nombreActivo.get(fila.activoId) ?? fila.activoId }}
            </NuxtLink>
          </div>
          <UBadge :color="colorIndice(fila.indice ?? 0)" variant="subtle" size="lg" class="tabular-nums">
            {{ fila.indice }}
          </UBadge>
        </button>
        <div v-if="expandidas.has(fila.activoId)" class="border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <table class="w-full text-xs">
            <thead>
              <tr class="text-neutral-400">
                <th class="text-left font-normal">Factor</th>
                <th class="text-right font-normal">Dato</th>
                <th class="text-right font-normal">Puntaje</th>
                <th class="text-right font-normal">Peso</th>
                <th class="text-right font-normal">Contribución</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in desgloseDe(fila)" :key="f.factor_codigo">
                <td class="py-1">{{ f.factor_nombre }}</td>
                <td class="py-1 text-right tabular-nums">{{ formatoDato(f.dato_crudo) }}</td>
                <td class="py-1 text-right tabular-nums">{{ formatoDato(f.puntaje) }}</td>
                <td class="py-1 text-right tabular-nums">{{ f.peso }}%</td>
                <td class="py-1 text-right tabular-nums">{{ formatoDato(f.contribucion) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </li>
    </ul>
  </div>
</template>
