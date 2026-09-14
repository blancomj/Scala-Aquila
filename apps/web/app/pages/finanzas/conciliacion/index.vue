<script setup lang="ts">
// Conciliación de RECAUDO (banco↔residente) — Entregable A de
// `Docs/Conciliacion Bancaria/PROMPT_CONCILIACION_BANCARIA_CONTABLE.md` §5. El backend (Fase 3,
// 20260904170000+) existía completo desde antes; esta es su primera pantalla. NO es la
// conciliación bancaria CONTABLE (banco↔libro) — esa es el Entregable B, sin empezar (glosario §2).

import type { FiltrosLineas, PropuestaConInmueble } from '~/stores/conciliacion'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const copropiedadStore = useCopropiedadStore()
const cuentaCorrienteStore = useCuentaCorrienteStore()
const conciliacionStore = useConciliacionStore()

const ESTADOS: { label: string; value: string | null }[] = [
  { label: 'Todos los estados', value: null },
  { label: 'Pendiente', value: 'pendiente' },
  { label: 'Auto-conciliada', value: 'conciliada_auto' },
  { label: 'Conciliada manual', value: 'conciliada_manual' },
  { label: 'Descartada', value: 'descartada' },
]

const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'primary'> = {
  pendiente: 'warning',
  conciliada_auto: 'success',
  conciliada_manual: 'success',
  descartada: 'neutral',
}

function primerDiaDelMes(): string {
  const hoy = new Date()
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
}
function hoyIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const filtroEstado = ref<string | null>(null)
const filtroCuenta = ref<string | null>(null)
const filtroDesde = ref(primerDiaDelMes())
const filtroHasta = ref(hoyIso())

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    conciliacionStore.cargarLineas(tenantId, {
      estado: filtroEstado.value as FiltrosLineas['estado'],
      cuentaBancariaId: filtroCuenta.value,
      desde: filtroDesde.value,
      hasta: filtroHasta.value,
    }),
    conciliacionStore.medirKpi(tenantId, filtroDesde.value, filtroHasta.value),
    copropiedadStore.cargarCuentasBancarias(tenantId),
    cuentaCorrienteStore.cargarInmuebles(tenantId),
    cuentaCorrienteStore.cargarPropietarios(tenantId),
  ])
}
onMounted(cargar)
watch([filtroEstado, filtroCuenta, filtroDesde, filtroHasta], cargar)

const opcionesCuenta = computed<{ label: string; value: string | null }[]>(() => [
  { label: 'Todas las cuentas', value: null },
  ...copropiedadStore.cuentasBancarias.map((c) => ({ label: c.numero_cuenta, value: c.id })),
])
const inmueblesParaSelector = computed(() =>
  cuentaCorrienteStore.inmuebles.map((i) => ({
    id: i.id,
    codigo: i.codigo,
    propietario: cuentaCorrienteStore.propietariosPorInmueble.get(i.id),
  })),
)

// Código del inmueble + propietario vigente (cuando lo hay), para distinguir de un vistazo el
// candidato PROPUESTO del texto crudo del banco (descripcion_banco) — el heurístico nunca se
// auto-aplica, así que esta etiqueta es solo informativa hasta que el usuario confirma en el drawer.
function etiquetaPropuesta(p: PropuestaConInmueble): string {
  const codigo = p.inmueble?.codigo ?? p.inmueble_id
  const propietario = cuentaCorrienteStore.propietariosPorInmueble.get(p.inmueble_id)
  return propietario ? `${codigo} — ${propietario}` : codigo
}

const importarAbierto = ref(false)
const resolverAbierto = ref(false)
const lineaSeleccionada = ref<(typeof conciliacionStore.lineas)[number] | null>(null)

function abrirResolver(linea: (typeof conciliacionStore.lineas)[number]): void {
  lineaSeleccionada.value = linea
  resolverAbierto.value = true
}

async function alResolver(): Promise<void> {
  resolverAbierto.value = false
  await cargar()
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Conciliación de Recaudo</h1>
        </template>
        <template #descripcion>
          Cada línea del extracto se enlaza a quién pagó (recaudo). Las referencias exactas y el
          monto+fecha sin ambigüedad se concilian solas; el resto queda en esta bandeja para que
          la confirmes — el nombre parecido nunca se aplica solo, solo se sugiere.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-center gap-2">
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="conciliacionStore.loading" @click="cargar()">
          Actualizar
        </UButton>
        <UButton icon="i-lucide-upload" @click="importarAbierto = true">Importar extracto</UButton>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      <div class="rounded-lg border border-default p-3">
        <p class="text-xs text-muted">Auto-conciliado del período</p>
        <p class="text-2xl font-semibold">{{ conciliacionStore.metrica?.porcentaje ?? 0 }}%</p>
        <p class="text-xs text-muted">
          {{ conciliacionStore.metrica?.autoConciliadas ?? 0 }} de {{ conciliacionStore.metrica?.candidatasAPago ?? 0 }} candidatas a pago
        </p>
      </div>
      <UFormField label="Estado">
        <USelect v-model="filtroEstado" :items="ESTADOS" class="w-full" />
      </UFormField>
      <UFormField label="Cuenta bancaria">
        <USelect v-model="filtroCuenta" :items="opcionesCuenta" class="w-full" />
      </UFormField>
      <UFormField label="Rango de fechas" class="sm:col-span-2 lg:col-span-2">
        <div class="flex items-center gap-2 min-w-0">
          <UInput v-model="filtroDesde" type="date" class="w-full min-w-0" />
          <span class="text-muted shrink-0">–</span>
          <UInput v-model="filtroHasta" type="date" class="w-full min-w-0" />
        </div>
      </UFormField>
    </div>

    <div class="rounded-lg border border-default divide-y divide-default">
      <div
        v-for="l in conciliacionStore.lineas" :key="l.id"
        class="flex items-center justify-between gap-4 p-3"
      >
        <div class="min-w-0">
          <p class="font-medium truncate">{{ l.descripcion_banco }}</p>
          <p class="text-sm text-muted">
            {{ l.fecha_movimiento }} · monto {{ formatoMoneda(l.monto) }}
            <span v-if="l.referencia_banco"> · ref. {{ l.referencia_banco }}</span>
          </p>
          <p v-if="l.conciliacion_propuesta.length > 0" class="text-sm mt-1 flex flex-wrap items-baseline gap-x-1">
            <span class="text-muted">Posible:</span>
            <span
              v-for="(p, idx) in l.conciliacion_propuesta" :key="p.id"
              class="font-medium text-primary"
            >{{ etiquetaPropuesta(p) }}<span v-if="idx < l.conciliacion_propuesta.length - 1">,</span></span>
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <UBadge :color="ESTADO_COLOR[l.estado] ?? 'neutral'" variant="soft" class="capitalize">
            {{ l.estado.replace('_', ' ') }}
          </UBadge>
          <UButton v-if="l.estado === 'pendiente'" size="sm" variant="soft" @click="abrirResolver(l)">
            Resolver
          </UButton>
        </div>
      </div>
      <p v-if="conciliacionStore.lineas.length === 0 && !conciliacionStore.loading" class="p-6 text-sm text-muted text-center">
        Sin líneas con este filtro.
      </p>
    </div>

    <FinanzasConciliacionImportarModal
      :abierto="importarAbierto"
      :tenant-id="tenantStore.activeTenant?.id ?? ''"
      :cuentas-bancarias="copropiedadStore.cuentasBancarias"
      @cerrar="importarAbierto = false"
      @importado="cargar()"
    />

    <FinanzasConciliacionResolverDrawer
      :abierto="resolverAbierto"
      :tenant-id="tenantStore.activeTenant?.id ?? ''"
      :linea="lineaSeleccionada"
      :inmuebles="inmueblesParaSelector"
      @cerrar="resolverAbierto = false"
      @resuelta="alResolver()"
    />
  </div>
</template>
