<script setup lang="ts">
// FIN-4 · Flujo de caja proyectado (§3.2-§3.4, §3.8).
//
// 'base' siempre usa la tasa de recaudo histórica calculada en vivo; 'optimista' siempre 100% sin
// coeficiente; 'conservador' exige finanzas_escenario_parametros vigente o el componente de
// ingresos queda datos_insuficientes — nunca un número inventado (§7 criterio de aceptación).
//
// onMounted(cargar), no useAsyncData: esta página muta refs de página locales (horizonteDias,
// escenario, filas del store), mismo criterio que las páginas de MANT-9 (useAsyncData no
// serializa efectos secundarios sobre refs de página al hidratar).
import type { FlujoEscenario } from '~/stores/finanzasFlujo'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const flujoStore = useFinanzasFlujoStore()

const HORIZONTES = [
  { label: '7 días', value: 7 },
  { label: '30 días', value: 30 },
  { label: '60 días', value: 60 },
  { label: '90 días', value: 90 },
]
const ESCENARIOS: { label: string; value: FlujoEscenario }[] = [
  { label: 'Base (histórico)', value: 'base' },
  { label: 'Conservador', value: 'conservador' },
  { label: 'Optimista', value: 'optimista' },
]
const horizonteDias = ref(30)
const horizonteCustom = ref<number | undefined>(undefined)
const escenario = ref<FlujoEscenario>('base')
const cargandoTabla = ref(true)

const horizonteEfectivo = computed(() => horizonteCustom.value || horizonteDias.value)

async function cargarTabla(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargandoTabla.value = true
  try {
    await flujoStore.cargarFlujo(tenantId, horizonteEfectivo.value, escenario.value)
  } finally {
    cargandoTabla.value = false
  }
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([cargarTabla(), flujoStore.cargarEscenarioParametros(tenantId), flujoStore.cargarSnapshots(tenantId)])
}
onMounted(cargar)
watch([horizonteEfectivo, escenario], cargarTabla)

function moneda(v: number | string | null | undefined): string {
  return formatoMoneda(v ?? 0)
}

const parametrosVisibles = computed(() => {
  if (escenario.value === 'optimista') return 'Fijo: 100% de recaudo, sin días adicionales de pago.'
  if (escenario.value === 'base') return 'Tasa de recaudo calculada de los últimos 12 meses (en vivo, no configurable).'
  const p = flujoStore.parametrosConservadorVigente
  if (!p) return 'Sin parámetros configurados — el componente de ingresos queda sin dato suficiente.'
  return `Recaudo esperado ${p.pct_recaudo_esperado ?? '—'}% · +${p.dias_adicionales_pago_proveedor} días de pago a proveedores no pactados (versión ${p.version}).`
})

// ── gráfico: saldo acumulado, las 3 curvas superpuestas ──────────────────────────────────────
interface SerieEscenario { escenario: FlujoEscenario; color: string; puntos: number[] }
const seriesGrafico = ref<SerieEscenario[]>([])
async function cargarGrafico(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const colores: Record<FlujoEscenario, string> = { base: '#3b82f6', conservador: '#ef4444', optimista: '#22c55e' }
  const series: SerieEscenario[] = []
  for (const esc of ['base', 'conservador', 'optimista'] as FlujoEscenario[]) {
    const filas = await flujoStore.cargarFlujo(tenantId, horizonteEfectivo.value, esc)
    series.push({ escenario: esc, color: colores[esc], puntos: filas.map((f) => f.saldo_acumulado) })
  }
  seriesGrafico.value = series
  // cargarFlujo pisa flujoStore.filas en cada vuelta del loop — recargar la tabla del escenario
  // seleccionado al terminar, para que el gráfico no deje la tabla mostrando otro escenario.
  await cargarTabla()
}
watch(horizonteEfectivo, cargarGrafico)
onMounted(cargarGrafico)

const DIM_W = 480
const DIM_H = 160
function pathDe(puntos: number[]): string {
  if (puntos.length === 0) return ''
  const todos = seriesGrafico.value.flatMap((s) => s.puntos)
  const max = Math.max(...todos, 0)
  const min = Math.min(...todos, 0)
  const rango = max - min || 1
  const pasoX = puntos.length > 1 ? DIM_W / (puntos.length - 1) : 0
  return puntos
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * pasoX} ${DIM_H - ((v - min) / rango) * DIM_H}`)
    .join(' ')
}
const yCero = computed(() => {
  const todos = seriesGrafico.value.flatMap((s) => s.puntos)
  const max = Math.max(...todos, 0)
  const min = Math.min(...todos, 0)
  const rango = max - min || 1
  return DIM_H - ((0 - min) / rango) * DIM_H
})

// ── snapshot ──────────────────────────────────────────────────────────────────────────────────
const drawerSnapshotAbierto = ref(false)
const motivoSnapshot = ref('')
const errorSnapshot = ref<string | null>(null)
async function guardarSnapshot(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !motivoSnapshot.value.trim()) return
  errorSnapshot.value = null
  try {
    await flujoStore.guardarSnapshot({
      tenantId, horizonteDias: horizonteEfectivo.value, escenario: escenario.value, motivo: motivoSnapshot.value,
    })
    drawerSnapshotAbierto.value = false
    motivoSnapshot.value = ''
  } catch (e) {
    errorSnapshot.value = e instanceof Error ? e.message : 'No se pudo guardar el snapshot'
  }
}

// ── comparación snapshot vs. realidad (§3.4) ─────────────────────────────────────────────────
const snapshotSeleccionado = ref<string | null>(null)
const comparacion = ref<{ semana: number; flujo_neto_proyectado: number; flujo_neto_real: number; desviacion: number }[]>([])
async function verComparacion(snapshotId: string): Promise<void> {
  snapshotSeleccionado.value = snapshotId
  comparacion.value = await flujoStore.cargarProyeccionVsReal(snapshotId, new Date().toISOString().slice(0, 10))
}

// ── configuración del escenario conservador ──────────────────────────────────────────────────
const drawerConfigAbierto = ref(false)
const pctRecaudoForm = ref<number | undefined>(undefined)
const diasAdicionalesForm = ref<number | undefined>(undefined)
const errorConfig = ref<string | null>(null)
function abrirConfig(): void {
  const vigente = flujoStore.parametrosConservadorVigente
  pctRecaudoForm.value = vigente?.pct_recaudo_esperado ?? undefined
  diasAdicionalesForm.value = vigente?.dias_adicionales_pago_proveedor ?? undefined
  errorConfig.value = null
  drawerConfigAbierto.value = true
}
async function guardarConfig(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || pctRecaudoForm.value === undefined || diasAdicionalesForm.value === undefined) return
  errorConfig.value = null
  try {
    await flujoStore.guardarConservador({
      tenantId, pctRecaudoEsperado: pctRecaudoForm.value, diasAdicionalesPagoProveedor: diasAdicionalesForm.value,
    })
    drawerConfigAbierto.value = false
    await cargarTabla()
  } catch (e) {
    errorConfig.value = e instanceof Error ? e.message : 'No se pudo guardar la configuración'
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Flujo de caja proyectado</h1>
        </template>
        <template #descripcion>
          Qué va a pasar con la liquidez si nada cambia — con los supuestos siempre a la vista y en
          tres escenarios. No es el Estado de Flujos de Efectivo (eso es histórico y contable, en
          Contabilidad → Estados financieros); esto es una herramienta de decisión, nunca una
          recomendación de qué pagar o de qué recaudar primero.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-center gap-2">
        <UButton variant="ghost" icon="i-lucide-settings" @click="abrirConfig()">Configurar conservador</UButton>
        <UButton icon="i-lucide-save" @click="drawerSnapshotAbierto = true">Guardar snapshot</UButton>
      </div>
    </div>

    <!-- Selector de horizonte y escenario, con los parámetros del escenario visibles al lado (§3.8) -->
    <div class="flex items-end gap-4 flex-wrap rounded-lg border border-default p-4">
      <div class="w-40">
        <label class="text-xs text-muted">Horizonte</label>
        <USelect
          v-model="horizonteDias" class="w-full mt-1" :items="HORIZONTES"
          :disabled="!!horizonteCustom" value-key="value"
        />
      </div>
      <div class="w-32">
        <label class="text-xs text-muted">Días (personalizado)</label>
        <UInput v-model.number="horizonteCustom" type="number" min="1" class="w-full mt-1" placeholder="ej. 45" />
      </div>
      <div class="w-48">
        <label class="text-xs text-muted">Escenario</label>
        <USelect v-model="escenario" class="w-full mt-1" :items="ESCENARIOS" value-key="value" />
      </div>
      <p class="text-xs text-muted flex-1 min-w-[240px]">{{ parametrosVisibles }}</p>
    </div>

    <!-- Gráfico: saldo acumulado, las 3 curvas superpuestas -->
    <div class="rounded-lg border border-default p-4">
      <p class="text-sm font-medium mb-2">Saldo acumulado por escenario</p>
      <svg :viewBox="`0 0 ${DIM_W} ${DIM_H}`" class="w-full h-40">
        <line x1="0" :y1="yCero" :x2="DIM_W" :y2="yCero" stroke="currentColor" class="text-neutral-300 dark:text-neutral-700" stroke-dasharray="4 4" />
        <path
          v-for="s in seriesGrafico" :key="s.escenario" :d="pathDe(s.puntos)"
          fill="none" :stroke="s.color" stroke-width="2"
        />
      </svg>
      <div class="flex items-center gap-4 mt-2 text-xs">
        <span v-for="s in seriesGrafico" :key="s.escenario" class="flex items-center gap-1">
          <span class="inline-block w-3 h-0.5" :style="{ backgroundColor: s.color }" />
          {{ ESCENARIOS.find((e) => e.value === s.escenario)?.label }}
        </span>
      </div>
    </div>

    <!-- Tabla por semana con desglose por componente -->
    <div class="rounded-lg border border-default overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted border-b border-default">
            <th class="p-2 font-normal">Semana</th>
            <th class="p-2 font-normal text-right">Ingresos esperados</th>
            <th class="p-2 font-normal text-right">Ingresos otros</th>
            <th class="p-2 font-normal text-right">Egresos CxP</th>
            <th class="p-2 font-normal text-right">Egresos contratos</th>
            <th class="p-2 font-normal text-right">Egresos mant.</th>
            <th class="p-2 font-normal text-right">Flujo neto</th>
            <th class="p-2 font-normal text-right">Saldo acumulado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in flujoStore.filas" :key="f.semana" class="border-b border-default last:border-0">
            <td class="p-2">{{ f.semana }}</td>
            <td class="p-2 text-right tabular-nums" :class="{ 'text-muted italic': f.componentes_insuficientes.includes('ingresos_esperados') }">
              {{ f.componentes_insuficientes.includes('ingresos_esperados') ? 'sin dato suficiente' : moneda(f.ingresos_esperados) }}
            </td>
            <td class="p-2 text-right tabular-nums" :class="{ 'text-muted italic': f.componentes_insuficientes.includes('ingresos_otros') }">
              {{ f.componentes_insuficientes.includes('ingresos_otros') ? 'sin dato suficiente' : moneda(f.ingresos_otros) }}
            </td>
            <td class="p-2 text-right tabular-nums">{{ moneda(f.egresos_cxp) }}</td>
            <td class="p-2 text-right tabular-nums">{{ moneda(f.egresos_contratos) }}</td>
            <td class="p-2 text-right tabular-nums" :class="{ 'text-muted italic': f.componentes_insuficientes.includes('egresos_mantenimiento') }">
              {{ f.componentes_insuficientes.includes('egresos_mantenimiento') ? 'sin dato suficiente' : moneda(f.egresos_mantenimiento) }}
            </td>
            <td class="p-2 text-right tabular-nums font-medium">{{ moneda(f.flujo_neto) }}</td>
            <td class="p-2 text-right tabular-nums font-semibold" :class="f.saldo_acumulado < 0 ? 'text-error' : ''">
              {{ moneda(f.saldo_acumulado) }}
            </td>
          </tr>
          <tr v-if="!cargandoTabla && flujoStore.filas.length === 0">
            <td colspan="8" class="p-4 text-center text-muted text-sm">Sin datos para este horizonte.</td>
          </tr>
        </tbody>
      </table>
      <p v-if="flujoStore.filas.some((f) => f.componentes_insuficientes.length > 0)" class="p-2 text-xs text-muted border-t border-default">
        <span class="italic">sin dato suficiente</span> = no hay historial o configuración suficiente para ese componente — no es un cero real, nunca se inventa.
      </p>
    </div>

    <!-- Snapshots guardados + comparación contra la realidad -->
    <div class="rounded-lg border border-default p-4">
      <p class="text-sm font-medium mb-2">Snapshots guardados</p>
      <div v-if="flujoStore.snapshots.length === 0" class="text-sm text-muted">Ningún snapshot guardado todavía.</div>
      <ul v-else class="divide-y divide-default">
        <li v-for="s in flujoStore.snapshots" :key="s.id" class="py-2 flex items-center justify-between gap-3 flex-wrap">
          <div class="text-sm">
            <p class="font-medium">{{ s.motivo }}</p>
            <p class="text-xs text-muted">
              {{ new Date(s.fecha_calculo).toLocaleString('es-CO') }} · {{ s.horizonte_dias }} días · {{ s.escenario }}
            </p>
          </div>
          <UButton size="xs" variant="ghost" @click="verComparacion(s.id)">Comparar contra la realidad</UButton>
        </li>
      </ul>

      <div v-if="snapshotSeleccionado" class="mt-4 pt-4 border-t border-default">
        <p class="text-sm font-medium mb-2">Proyectado vs. real</p>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <th class="font-normal py-1">Semana</th>
              <th class="font-normal py-1 text-right">Proyectado</th>
              <th class="font-normal py-1 text-right">Real</th>
              <th class="font-normal py-1 text-right">Desviación</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in comparacion" :key="c.semana" class="border-t border-default">
              <td class="py-1">{{ c.semana }}</td>
              <td class="py-1 text-right tabular-nums">{{ moneda(c.flujo_neto_proyectado) }}</td>
              <td class="py-1 text-right tabular-nums">{{ moneda(c.flujo_neto_real) }}</td>
              <td class="py-1 text-right tabular-nums" :class="c.desviacion < 0 ? 'text-error' : 'text-success'">
                {{ moneda(c.desviacion) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Drawer: guardar snapshot -->
    <UiDrawer :abierto="drawerSnapshotAbierto" titulo="Guardar snapshot" subtitulo="Fija este cálculo como punto de referencia" @cerrar="drawerSnapshotAbierto = false">
      <div class="space-y-4">
        <UAlert v-if="errorSnapshot" color="error" variant="soft" :title="errorSnapshot" />
        <p class="text-sm text-muted">
          Horizonte {{ horizonteEfectivo }} días · escenario {{ escenario }}. Se recalcula del lado
          del servidor en este momento — no se puede fabricar un snapshot con otras cifras.
        </p>
        <UFormField label="Motivo" name="motivo" required>
          <UTextarea v-model="motivoSnapshot" class="w-full" placeholder="ej. Proyección con la que se aprobó el presupuesto 2027" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerSnapshotAbierto = false">Cancelar</UButton>
          <UButton :loading="flujoStore.guardandoSnapshot" :disabled="!motivoSnapshot.trim()" @click="guardarSnapshot()">Guardar</UButton>
        </div>
      </template>
    </UiDrawer>

    <!-- Drawer: configurar escenario conservador -->
    <UiDrawer :abierto="drawerConfigAbierto" titulo="Escenario conservador" subtitulo="Sin valores por defecto — cada copropiedad los define" @cerrar="drawerConfigAbierto = false">
      <div class="space-y-4">
        <UAlert v-if="errorConfig" color="error" variant="soft" :title="errorConfig" />
        <UAlert
          color="info" variant="soft" icon="i-lucide-info"
          description="'base' siempre usa la tasa de recaudo histórica calculada en vivo; 'optimista' siempre es 100% sin coeficiente. Solo 'conservador' se configura aquí."
        />
        <UFormField label="Recaudo esperado (%)" name="pct">
          <UInput v-model.number="pctRecaudoForm" type="number" min="0" max="100" class="w-full" />
        </UFormField>
        <UFormField label="Días adicionales de pago a proveedores no pactados" name="dias">
          <UInput v-model.number="diasAdicionalesForm" type="number" min="0" class="w-full" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerConfigAbierto = false">Cancelar</UButton>
          <UButton :disabled="pctRecaudoForm === undefined || diasAdicionalesForm === undefined" @click="guardarConfig()">
            Guardar y activar
          </UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
