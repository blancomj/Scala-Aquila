<script setup lang="ts">
// MANT-9 · Configuración de factores y pesos, con simulación de ranking ANTES de guardar (§3.6) —
// exigencia propia del corte: sin esto, alguien podría ajustar los pesos hasta que salga el
// resultado que quería sin darse cuenta. La simulación recalcula el índice de cada activo con los
// pesos en borrador (los puntajes por factor no cambian al reponderar, solo la contribución) —
// agregar un factor NUEVO no se puede simular sin datos, se explica en pantalla.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const saludStore = useMantenimientoSaludStore()
const activosStore = useActivosStore()

const fuentes = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const cargando = ref(false)
const errorCarga = ref<string | null>(null)

/** desglose por activo del set VIGENTE (para simular reponderación) — no del borrador. */
const desglosePorActivo = ref(new Map<string, Array<{ factor_codigo: string; puntaje: number | null }>>())

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  cargando.value = true
  try {
    await Promise.all([
      saludStore.cargarSets(tenantId),
      activosStore.cargarActivos(tenantId),
      cargarListaTipos(tenantId, 'FUENTE_SALUD_FACTOR').then((d) => { fuentes.value = d }),
    ])
    if (saludStore.setVigente) {
      await saludStore.cargarFactores(saludStore.setVigente.id)
      await saludStore.cargarBandas(saludStore.setVigente.id)
      const cliente = useSupabaseClient<Database>()
      const mapa = new Map<string, Array<{ factor_codigo: string; puntaje: number | null }>>()
      await Promise.all(
        activosStore.activos.map(async (a) => {
          const { data } = await cliente.rpc('mant_salud', { p_tenant_id: tenantId, p_activo_id: a.id }).single()
          if (data?.desglose) mapa.set(a.id, data.desglose as unknown as Array<{ factor_codigo: string; puntaje: number | null }>)
        }),
      )
      desglosePorActivo.value = mapa
    }
    const borrador = saludStore.sets.find((s) => s.estado === 'borrador')
    if (borrador) await saludStore.cargarFactores(borrador.id)
  } catch (e) {
    errorCarga.value = mensajeError(e, 'No se pudo cargar la configuración de salud.')
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

const setBorrador = computed(() => saludStore.sets.find((s) => s.estado === 'borrador') ?? null)
const factoresEditables = computed(() =>
  setBorrador.value ? saludStore.factores.filter((f) => f.set_id === setBorrador.value!.id) : [],
)
const sumaPesos = computed(() => factoresEditables.value.reduce((acc, f) => acc + Number(f.peso), 0))

async function crearBorrador(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await saludStore.crearSet(tenantId)
}

// ── Simulación: pesos en borrador de edición local, comparados contra los guardados ──
const pesosSimulados = reactive<Record<string, number>>({})
watch(factoresEditables, (fs) => {
  for (const f of fs) if (!(f.id in pesosSimulados)) pesosSimulados[f.id] = Number(f.peso)
}, { immediate: true })

function indiceSimulado(activoId: string): number | null {
  const desglose = desglosePorActivo.value.get(activoId)
  if (!desglose) return null
  let contrib = 0
  let pesoDisponible = 0
  for (const factor of factoresEditables.value) {
    const puntaje = desglose.find((d) => d.factor_codigo === factor.codigo)?.puntaje
    const peso = pesosSimulados[factor.id] ?? Number(factor.peso)
    if (puntaje === null || puntaje === undefined) continue
    contrib += (puntaje * peso) / 100
    pesoDisponible += peso
  }
  return pesoDisponible === 0 ? null : Math.round((contrib / pesoDisponible) * 100 * 10) / 10
}

const rankingSimulado = computed(() =>
  activosStore.activos
    .map((a) => ({
      id: a.id,
      nombre: `${a.codigo} — ${a.nombre}`,
      actual: desglosePorActivo.value.has(a.id)
        ? (() => {
            const d = desglosePorActivo.value.get(a.id)!
            const totalPeso = factoresEditables.value.reduce((acc, f) => acc + Number(f.peso), 0)
            const contrib = factoresEditables.value.reduce((acc, f) => {
              const p = d.find((x) => x.factor_codigo === f.codigo)?.puntaje
              return p == null ? acc : acc + (p * Number(f.peso)) / 100
            }, 0)
            return totalPeso === 0 ? null : Math.round((contrib / totalPeso) * 100 * 10) / 10
          })()
        : null,
      simulado: indiceSimulado(a.id),
    }))
    .filter((r) => r.simulado !== null)
    .sort((a, b) => (a.simulado ?? 0) - (b.simulado ?? 0)),
)

const pesosSonIgualesAGuardados = computed(() =>
  factoresEditables.value.every((f) => (pesosSimulados[f.id] ?? Number(f.peso)) === Number(f.peso)),
)

async function guardarPeso(factor: (typeof factoresEditables.value)[number]): Promise<void> {
  const cliente = useSupabaseClient<Database>()
  const { error } = await cliente
    .from('mant_salud_factor')
    .update({ peso: pesosSimulados[factor.id] })
    .eq('id', factor.id)
  if (error) throw error
  if (setBorrador.value) await saludStore.cargarFactores(setBorrador.value.id)
}

// ── Nuevo factor ─────────────────────────────────────────────────────────
const drawerAbierto = ref(false)
const nuevoFactor = reactive({
  codigo: '', nombre: '', fuenteId: undefined as number | undefined,
  peso: 10, ventanaDias: 365,
  tramos: [{ hasta: null as number | null, puntaje: 100 }] as Array<{ hasta: number | null; puntaje: number }>,
})
const errorGuardar = ref<string | null>(null)

function agregarTramo(): void {
  nuevoFactor.tramos.push({ hasta: null, puntaje: 0 })
}
function quitarTramo(i: number): void {
  nuevoFactor.tramos.splice(i, 1)
}

async function guardarNuevoFactor(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !setBorrador.value || !nuevoFactor.fuenteId) return
  errorGuardar.value = null
  try {
    await saludStore.crearFactor({
      tenant_id: tenantId,
      set_id: setBorrador.value.id,
      codigo: nuevoFactor.codigo,
      nombre: nuevoFactor.nombre,
      fuente_id: nuevoFactor.fuenteId,
      peso: nuevoFactor.peso,
      ventana_dias: nuevoFactor.ventanaDias,
      escala: nuevoFactor.tramos,
    })
    drawerAbierto.value = false
  } catch (e) {
    errorGuardar.value = mensajeError(e, 'No se pudo guardar el factor.')
  }
}

async function activar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !setBorrador.value) return
  errorGuardar.value = null
  try {
    await saludStore.activarSet(tenantId, setBorrador.value.id)
    await cargar()
  } catch (e) {
    errorGuardar.value = mensajeError(e, 'No se pudo activar el set.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 mt-1">
      <template #titulo>
        <h1 class="text-xl font-semibold">Configuración de salud</h1>
      </template>
      <template #descripcion>
        Cero factores, pesos o bandas vienen precargados — cada copropiedad arma los suyos. Los
        pesos deben sumar exactamente 100 para poder activar un set.
      </template>
    </UiTituloDescripcion>

    <UAlert v-if="errorCarga" color="error" variant="soft" :title="errorCarga" />
    <UAlert v-if="errorGuardar" color="error" variant="soft" :title="errorGuardar" />

    <div v-if="saludStore.setVigente" class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p class="text-sm">
        Set vigente: <span class="font-medium">versión {{ saludStore.setVigente.version }}</span>
        <span class="text-neutral-500"> desde {{ saludStore.setVigente.vigente_desde }}</span>
      </p>
    </div>

    <div v-if="!setBorrador" class="rounded-lg border border-dashed border-neutral-300 p-4 text-center dark:border-neutral-700">
      <p class="mb-3 text-sm text-neutral-500">No hay ninguna versión en construcción.</p>
      <UButton size="sm" :loading="saludStore.guardando" @click="crearBorrador">Crear nueva versión</UButton>
    </div>

    <template v-else>
      <div class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">
            Versión {{ setBorrador.version }} (borrador) — factores
            <span :class="sumaPesos === 100 ? 'text-success-600' : 'text-warning-600'">({{ sumaPesos }}/100)</span>
          </h2>
          <UButton size="xs" @click="drawerAbierto = true">Agregar factor</UButton>
        </div>

        <table v-if="factoresEditables.length > 0" class="w-full text-sm">
          <thead>
            <tr class="text-neutral-400 text-xs">
              <th class="text-left font-normal">Factor</th>
              <th class="text-left font-normal">Fuente</th>
              <th class="text-right font-normal">Ventana</th>
              <th class="text-right font-normal">Peso (guardado → simulado)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in factoresEditables" :key="f.id" class="border-t border-neutral-100 dark:border-neutral-800">
              <td class="py-2">{{ f.nombre }}</td>
              <td class="py-2 text-neutral-500">{{ fuentes.find((x) => x.id === f.fuente_id)?.nombre ?? '—' }}</td>
              <td class="py-2 text-right tabular-nums">{{ f.ventana_dias }}d</td>
              <td class="py-2">
                <div class="flex items-center justify-end gap-2">
                  <span class="text-neutral-400 tabular-nums">{{ f.peso }}%</span>
                  <UInput v-model.number="pesosSimulados[f.id]" type="number" min="0" max="100" class="w-20" size="xs" />
                  <UButton
                    v-if="pesosSimulados[f.id] !== Number(f.peso)"
                    size="xs" variant="soft" @click="guardarPeso(f)"
                  >
                    Guardar
                  </UButton>
                </div>
              </td>
              <td class="py-2 text-right">
                <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="saludStore.eliminarFactor(f.id)" />
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-neutral-400">Sin factores todavía.</p>

        <UButton
          size="sm"
          :disabled="sumaPesos !== 100 || factoresEditables.length === 0"
          :loading="saludStore.guardando"
          @click="activar"
        >
          Activar esta versión
        </UButton>
      </div>

      <div v-if="!pesosSonIgualesAGuardados" class="rounded-lg border border-primary/40 bg-primary/5 p-4">
        <h2 class="mb-1 text-sm font-semibold">Simulación — qué pasaría con el ranking</h2>
        <p class="mb-3 text-xs text-neutral-500">
          Con los pesos que estás escribiendo arriba (todavía sin guardar). Un factor agregado
          hoy no se puede simular hasta que se guarde — no hay dato con qué calcularlo.
        </p>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-neutral-400 text-xs">
              <th class="text-left font-normal">Activo</th>
              <th class="text-right font-normal">Índice actual</th>
              <th class="text-right font-normal">Índice simulado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rankingSimulado" :key="r.id" class="border-t border-neutral-100 dark:border-neutral-800">
              <td class="py-1.5">{{ r.nombre }}</td>
              <td class="py-1.5 text-right tabular-nums text-neutral-400">{{ r.actual }}</td>
              <td class="py-1.5 text-right tabular-nums font-medium">{{ r.simulado }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <UiDrawer :abierto="drawerAbierto" titulo="Nuevo factor de salud" @cerrar="drawerAbierto = false">
      <div class="space-y-4">
        <UFormField label="Código (único en el set)"><UInput v-model="nuevoFactor.codigo" class="w-full" /></UFormField>
        <UFormField label="Nombre"><UInput v-model="nuevoFactor.nombre" class="w-full" /></UFormField>
        <UFormField label="Fuente">
          <USelect
            v-model="nuevoFactor.fuenteId"
            :items="fuentes.map((f) => ({ label: f.nombre, value: f.id }))"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Ventana (días hacia atrás)">
          <UInput v-model.number="nuevoFactor.ventanaDias" type="number" min="1" class="w-full" />
        </UFormField>
        <UFormField label="Peso inicial (%)">
          <UInput v-model.number="nuevoFactor.peso" type="number" min="1" max="100" class="w-full" />
        </UFormField>
        <div>
          <p class="mb-2 text-sm font-medium">
            Tramos (dato crudo → puntaje 0-100). El primero cuyo "hasta" cubra el dato gana —
            deja el último sin "hasta" para "en adelante".
          </p>
          <div v-for="(t, i) in nuevoFactor.tramos" :key="i" class="mb-2 flex items-center gap-2">
            <UInput v-model.number="t.hasta" type="number" placeholder="hasta (vacío = sin techo)" class="flex-1" />
            <UInput v-model.number="t.puntaje" type="number" min="0" max="100" placeholder="puntaje" class="flex-1" />
            <UButton size="xs" variant="ghost" color="error" icon="i-lucide-x" @click="quitarTramo(i)" />
          </div>
          <UButton size="xs" variant="soft" @click="agregarTramo">Agregar tramo</UButton>
        </div>
        <UButton block :loading="saludStore.guardando" @click="guardarNuevoFactor">Guardar factor</UButton>
      </div>
    </UiDrawer>
  </div>
</template>
