<script setup lang="ts">
// Conciliación bancaria CONTABLE (banco↔libro) — Fase 6 (UI) de
// `Docs/Conciliacion Bancaria/PROMPT_CONCILIACION_BANCARIA_CONTABLE.md` (D-113/115/116/117).
// NO es la conciliación de RECAUDO (banco↔residente, `pages/finanzas/conciliacion/`, distinta
// pantalla, distinto store) — glosario §2: cuatro cosas en el repo se llaman "conciliación".
import type { PartidaConciliacion } from '~/stores/conciliacionBancaria'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const copropiedadStore = useCopropiedadStore()
const conciliacionBancariaStore = useConciliacionBancariaStore()
const toast = useToast()

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const cuentaBancariaId = ref<string | undefined>(undefined)
const periodoId = ref<string | undefined>(undefined)
const generando = ref(false)
const certificando = ref(false)
const error = ref<string | null>(null)
const comprobanteAbierto = ref(false)
const partidaSeleccionada = ref<PartidaConciliacion | null>(null)

// Certificar exige D-CB-3 terminal: solo tiene sentido ofrecerlo en borrador. Generar exige
// `auxiliar` (D-CB-4, RPC has_role literal — un administrador NO pasa ese umbral en este repo,
// ver conciliar-linea/importar-extracto-bancario, mismo criterio); certificar exige
// `administrador`. Ninguno de los dos se infiere del otro.
const puedeGenerar = computed(() => tenantStore.role === 'auxiliar')
const puedeCertificar = computed(() => tenantStore.role === 'administrador')

// Solo cuentas con cuenta contable asociada (PC-3) son conciliables — D-CB-1/CuentaBancariaSinCuentaContableError.
const cuentasConciliables = computed(() =>
  copropiedadStore.cuentasBancarias.filter((c) => c.contable_cuenta_id),
)
const opcionesCuenta = computed(() =>
  cuentasConciliables.value.map((c) => ({ label: c.numero_cuenta, value: c.id })),
)
const opcionesPeriodo = computed(() =>
  conciliacionBancariaStore.periodos.map((p) => ({ label: `${MESES[p.mes - 1]} ${String(p.anio)}`, value: p.id })),
)
const periodoSeleccionado = computed(() =>
  conciliacionBancariaStore.periodos.find((p) => p.id === periodoId.value) ?? null,
)
const cuentaSeleccionada = computed(() =>
  cuentasConciliables.value.find((c) => c.id === cuentaBancariaId.value) ?? null,
)

const partidasBanco = computed(() => conciliacionBancariaStore.partidas.filter((p) => p.origen === 'banco'))
const partidasLibro = computed(() => conciliacionBancariaStore.partidas.filter((p) => p.origen === 'libro'))

const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'neutral'> = {
  borrador: 'warning',
  certificada: 'success',
}
// D-CB-5: solo estos dos tipos son "el banco hizo algo que libros todavía no sabe" — los demás
// (deposito_transito, cheque_pendiente, partida_salida_pendiente, otro) se resuelven solos en el
// período siguiente o no corresponden a un comprobante nuevo.
const TIPOS_CON_COMPROBANTE: ReadonlySet<string> = new Set(['nota_debito_banco', 'nota_credito_banco'])

async function buscar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !cuentaBancariaId.value || !periodoId.value) return
  error.value = null
  try {
    await conciliacionBancariaStore.buscar(tenantId, cuentaBancariaId.value, periodoId.value)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cargar la conciliación.')
  }
}
watch([cuentaBancariaId, periodoId], buscar)

async function generar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !cuentaBancariaId.value || !periodoId.value) return
  generando.value = true
  error.value = null
  try {
    await conciliacionBancariaStore.generar(tenantId, cuentaBancariaId.value, periodoId.value)
    toast.add({ title: 'Conciliación generada en borrador.', color: 'success' })
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo generar la conciliación.')
  } finally {
    generando.value = false
  }
}

async function certificar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !cuentaBancariaId.value || !periodoId.value) return
  certificando.value = true
  error.value = null
  try {
    await conciliacionBancariaStore.certificar(tenantId, cuentaBancariaId.value, periodoId.value)
    toast.add({ title: 'Conciliación certificada.', color: 'success' })
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo certificar la conciliación.')
  } finally {
    certificando.value = false
  }
}

function abrirComprobante(partida: PartidaConciliacion): void {
  partidaSeleccionada.value = partida
  comprobanteAbierto.value = true
}

onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    copropiedadStore.cargarCuentasBancarias(tenantId),
    conciliacionBancariaStore.cargarPeriodos(tenantId),
  ])
})
onBeforeUnmount(() => conciliacionBancariaStore.limpiar())
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
      <template #titulo>
        <h1 class="text-xl font-semibold">Conciliación Contable</h1>
      </template>
      <template #descripcion>
        Por cuenta bancaria y período: compara el saldo del extracto contra la cuenta contable de
        bancos. Lo que no cruza queda clasificado abajo — certificar es un paso terminal, un error
        se corrige con un ajuste en el período siguiente, nunca reabriendo.
      </template>
    </UiTituloDescripcion>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <UFormField label="Cuenta bancaria">
        <USelect v-model="cuentaBancariaId" :items="opcionesCuenta" placeholder="Elige una cuenta" class="w-full" />
      </UFormField>
      <UFormField label="Período">
        <USelect v-model="periodoId" :items="opcionesPeriodo" placeholder="Elige un período" class="w-full" />
      </UFormField>
    </div>
    <p v-if="cuentasConciliables.length === 0" class="text-sm text-muted">
      Ninguna cuenta bancaria tiene una cuenta contable asociada todavía (Configuración → Cuentas
      bancarias) — sin eso no es conciliable contablemente (PC-3).
    </p>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <template v-if="cuentaBancariaId && periodoId">
      <div
        v-if="conciliacionBancariaStore.buscada && !conciliacionBancariaStore.conciliacion"
        class="rounded-lg border border-default p-6 text-center space-y-3"
      >
        <p class="text-sm text-muted">Todavía no hay una conciliación para esta cuenta y período.</p>
        <UButton :loading="generando" :disabled="!puedeGenerar" @click="generar()">Generar conciliación</UButton>
        <p v-if="!puedeGenerar" class="text-xs text-muted">Solo un auxiliar puede generarla.</p>
      </div>

      <div v-else-if="conciliacionBancariaStore.conciliacion" class="space-y-4">
        <div class="rounded-lg border border-default p-4 flex flex-wrap items-center justify-between gap-4">
          <div class="flex flex-wrap gap-6 text-sm">
            <div>
              <p class="text-xs text-muted">Saldo banco</p>
              <p class="font-medium tabular-nums">
                {{ conciliacionBancariaStore.conciliacion.saldo_inicial_banco }} →
                {{ conciliacionBancariaStore.conciliacion.saldo_final_banco }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">Saldo libros</p>
              <p class="font-medium tabular-nums">
                {{ conciliacionBancariaStore.conciliacion.saldo_inicial_libros }} →
                {{ conciliacionBancariaStore.conciliacion.saldo_final_libros }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <UBadge :color="ESTADO_COLOR[conciliacionBancariaStore.conciliacion.estado] ?? 'neutral'" variant="soft" class="capitalize">
              {{ conciliacionBancariaStore.conciliacion.estado }}
            </UBadge>
            <UButton
              v-if="conciliacionBancariaStore.conciliacion.estado === 'borrador'"
              :loading="certificando" :disabled="!puedeCertificar" @click="certificar()"
            >
              Certificar
            </UButton>
          </div>
        </div>
        <p v-if="conciliacionBancariaStore.conciliacion.estado === 'borrador' && !puedeCertificar" class="text-xs text-muted">
          Solo un administrador puede certificar.
        </p>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="space-y-2">
            <p class="text-sm font-medium">Banco — sin cruzar ({{ partidasBanco.length }})</p>
            <div class="rounded-lg border border-default divide-y divide-default">
              <div v-for="p in partidasBanco" :key="p.id" class="p-3 space-y-1">
                <div class="flex items-center justify-between gap-2">
                  <p class="font-medium text-sm">{{ p.tipo?.nombre ?? p.tipo?.codigo }}</p>
                  <p class="text-sm tabular-nums">{{ p.monto }}</p>
                </div>
                <p class="text-xs text-muted">
                  {{ p.extracto_linea?.fecha_movimiento }}
                  <span v-if="p.descripcion"> · {{ p.descripcion }}</span>
                </p>
                <UButton
                  v-if="p.tipo && TIPOS_CON_COMPROBANTE.has(p.tipo.codigo) && !p.resuelta"
                  size="xs" variant="soft" @click="abrirComprobante(p)"
                >
                  Crear comprobante
                </UButton>
              </div>
              <p v-if="partidasBanco.length === 0" class="p-4 text-sm text-muted text-center">Todo cruzó.</p>
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-sm font-medium">Libros — sin cruzar ({{ partidasLibro.length }})</p>
            <div class="rounded-lg border border-default divide-y divide-default">
              <div v-for="p in partidasLibro" :key="p.id" class="p-3 space-y-1">
                <div class="flex items-center justify-between gap-2">
                  <p class="font-medium text-sm">{{ p.tipo?.nombre ?? p.tipo?.codigo }}</p>
                  <p class="text-sm tabular-nums">{{ p.monto }}</p>
                </div>
                <p v-if="p.descripcion" class="text-xs text-muted">{{ p.descripcion }}</p>
              </div>
              <p v-if="partidasLibro.length === 0" class="p-4 text-sm text-muted text-center">Todo cruzó.</p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <FinanzasConciliacionBancariaCrearComprobanteDrawer
      :abierto="comprobanteAbierto"
      :tenant-id="tenantStore.activeTenant?.id ?? ''"
      :periodo-id="periodoId ?? ''"
      :anio="periodoSeleccionado?.anio ?? new Date().getFullYear()"
      :cuenta-banco-contable-id="cuentaSeleccionada?.contable_cuenta_id ?? ''"
      :partida="partidaSeleccionada"
      @cerrar="comprobanteAbierto = false"
      @creado="comprobanteAbierto = false"
    />
  </div>
</template>
