<script setup lang="ts">
// CO-7 · Deterioro de cartera — política versionada (§4.1), simulación de solo lectura antes de
// comprometer nada (§4.2, §8: "la simulación no escribe") y reconocimiento del ajuste (§4.3).
//
// Dos secciones independientes, mismo patrón que politicas/index.vue (versiones + drawer +
// activar con confirmación) y cartera/simulacion.vue (simular → previsualizar → confirmar antes
// de la acción real).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const deterioroStore = useDeterioroStore()
const comprobantesStore = useComprobantesStore()

const error = ref<string | null>(null)
const drawerAbierto = ref(false)
const politicaIdAbierta = ref<string | undefined>(undefined)
const activandoId = ref<string | null>(null)
const confirmandoActivarId = ref<string | null>(null)

const politicaVigente = computed(() => deterioroStore.politicas.find((p) => p.estado === 'vigente'))
const politicaConfirmando = computed(() => deterioroStore.politicas.find((p) => p.id === confirmandoActivarId.value))
const siguienteVersion = computed(() =>
  deterioroStore.politicas.length === 0 ? 1 : Math.max(...deterioroStore.politicas.map((p) => p.version)) + 1,
)

const ETIQUETA_ESTADO: Record<string, string> = { vigente: 'Vigente', borrador: 'Borrador', historica: 'Histórica' }
const COLOR_ESTADO: Record<string, 'success' | 'neutral'> = { vigente: 'success', borrador: 'neutral', historica: 'neutral' }
const ETIQUETA_METODO: Record<string, string> = {
  antiguedad: 'Por antigüedad', porcentaje_global: 'Porcentaje global', individual: 'Individual',
}

async function cargarPoliticas(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  try {
    await deterioroStore.cargarPoliticas(tenantId)
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo cargar la política de deterioro.')
  }
}

function abrirNuevaVersion(): void {
  politicaIdAbierta.value = undefined
  drawerAbierto.value = true
}
function abrirVersion(id: string): void {
  politicaIdAbierta.value = id
  drawerAbierto.value = true
}
async function cerrarDrawer(recargar: boolean): Promise<void> {
  drawerAbierto.value = false
  if (recargar) await cargarPoliticas()
}

async function confirmarActivar(): Promise<void> {
  const id = confirmandoActivarId.value
  const tenantId = tenantStore.activeTenant?.id
  if (!id || !tenantId) return
  error.value = null
  activandoId.value = id
  try {
    await deterioroStore.activarPolitica(id, tenantId)
    confirmandoActivarId.value = null
    await cargarPoliticas()
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo activar la política de deterioro.')
  } finally {
    activandoId.value = null
  }
}

// ── simulación y reconocimiento ──
const hoy = new Date().toISOString().slice(0, 10)
const fechaCorte = ref(hoy)
const periodoId = ref<string | undefined>(undefined)
const confirmandoReconocer = ref(false)
// null = todavía no se reconoció nada esta sesión; string = comprobante generado; 'sin-cambios'
// = se reconoció pero el ajuste neto dio cero (nada que registrar, §4.3).
const resultadoReconocer = ref<string | 'sin-cambios' | null>(null)
const errorSimulacion = ref<string | null>(null)
const errorReconocer = ref<string | null>(null)

const formatoMoneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
function moneda(valor: number | string | null): string {
  const n = Number(valor ?? 0)
  return n === 0 ? '—' : formatoMoneda.format(n)
}

const totalAjuste = computed(() => deterioroStore.simulacion.reduce((s, f) => s + f.ajuste, 0))
const totalDeterioroCalculado = computed(() => deterioroStore.simulacion.reduce((s, f) => s + f.deterioro_calculado, 0))

/** No resetea resultadoReconocer — se llama de nuevo tras reconocer() para reflejar el ajuste
 * en cero de lo ya registrado, y el aviso de éxito debe seguir visible en ese momento. */
async function simular(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorSimulacion.value = null
  try {
    await deterioroStore.simular(tenantId, fechaCorte.value)
  } catch (e) {
    errorSimulacion.value = mensajeError(e, 'No se pudo simular el deterioro.')
  }
}

/** Simulación disparada por el usuario (botón/cambio de fecha) — aquí sí se limpia el aviso de
 * un reconocimiento anterior, que ya no aplica a la nueva fecha de corte. */
function simularManual(): Promise<void> {
  resultadoReconocer.value = null
  return simular()
}

async function reconocer(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !periodoId.value) return
  confirmandoReconocer.value = false
  errorReconocer.value = null
  try {
    const compId = await deterioroStore.reconocer(tenantId, periodoId.value)
    resultadoReconocer.value = compId ?? 'sin-cambios'
    await simular() // el ajuste queda en cero para lo ya reconocido — refleja el nuevo estado
  } catch (e) {
    errorReconocer.value = mensajeError(e, 'No se pudo reconocer el deterioro.')
  }
}

onMounted(async () => {
  await cargarPoliticas()
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) {
    await comprobantesStore.cargarPeriodos(tenantId)
    periodoId.value = comprobantesStore.periodos[0]?.id
  }
  await simular()
})
</script>

<template>
  <div class="space-y-8">
    <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
      <template #titulo>
        <h1 class="text-xl font-semibold">Deterioro de cartera</h1>
      </template>
      <template #descripcion>
        Política configurable de estimación (CTCP 0153/2025 la exige para Grupo 3, no fija el
        método), simulación de solo lectura y reconocimiento del ajuste — nunca del total.
      </template>
    </UiTituloDescripcion>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <!-- ── política ────────────────────────────────────────────────── -->
    <section class="rounded-lg border border-default">
      <header class="px-4 py-2.5 border-b border-default bg-muted/30">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">Vigente</h2>
      </header>
      <div class="p-4">
        <p v-if="!politicaVigente" class="text-sm text-muted">
          Esta copropiedad todavía no tiene una política de deterioro vigente — sin una, cualquier
          simulación o reconocimiento falla con DETERIORO_SIN_POLITICA.
        </p>
        <dl v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <dt class="text-xs text-muted mb-0.5">Versión</dt>
            <dd class="font-medium">v{{ politicaVigente.version }} · desde {{ politicaVigente.vigente_desde ?? '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted mb-0.5">Método</dt>
            <dd class="font-medium">{{ ETIQUETA_METODO[politicaVigente.metodo] ?? politicaVigente.metodo }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted mb-0.5">Excluye acuerdo de pago vigente</dt>
            <dd class="font-medium">{{ politicaVigente.excluir_cargos_con_acuerdo_vigente ? 'Sí' : 'No' }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted mb-0.5">Porcentaje global</dt>
            <dd class="font-medium">{{ politicaVigente.porcentaje_global !== null ? `${String(politicaVigente.porcentaje_global)}%` : '—' }}</dd>
          </div>
        </dl>
      </div>
    </section>

    <section class="rounded-lg border border-default">
      <header class="px-4 py-2.5 border-b border-default bg-muted/30 flex items-center justify-between">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">Versiones</h2>
        <UButton size="xs" @click="abrirNuevaVersion">Nueva versión</UButton>
      </header>
      <div class="p-4">
        <p v-if="deterioroStore.politicas.length === 0" class="text-sm text-muted">
          Todavía no hay ninguna versión de política de deterioro.
        </p>
        <div v-else class="overflow-x-auto rounded-lg border border-default">
          <table class="w-full text-sm">
            <thead class="bg-muted/30">
              <tr>
                <th class="p-2 text-left">Versión</th><th class="p-2 text-left">Estado</th>
                <th class="p-2 text-left">Método</th><th class="p-2 text-left">Vigencia</th><th class="p-2" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in deterioroStore.politicas" :key="p.id" class="border-t border-default">
                <td class="p-2">v{{ p.version }}</td>
                <td class="p-2"><UBadge :color="COLOR_ESTADO[p.estado]" variant="subtle" size="sm">{{ ETIQUETA_ESTADO[p.estado] ?? p.estado }}</UBadge></td>
                <td class="p-2">{{ ETIQUETA_METODO[p.metodo] ?? p.metodo }}</td>
                <td class="p-2 text-muted">{{ p.vigente_desde ?? '—' }} → {{ p.vigente_hasta ?? '—' }}</td>
                <td class="p-2">
                  <div class="flex justify-end gap-1">
                    <UButton size="xs" variant="ghost" @click="abrirVersion(p.id)">Ver</UButton>
                    <UButton
                      v-if="p.estado === 'borrador'"
                      size="xs" variant="soft" :loading="activandoId === p.id"
                      @click="confirmandoActivarId = p.id"
                    >
                      Activar
                    </UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ── simulación y reconocimiento ────────────────────────────── -->
    <section class="rounded-lg border border-default">
      <header class="px-4 py-2.5 border-b border-default bg-muted/30">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">Simulación y reconocimiento</h2>
      </header>
      <div class="p-4 space-y-4">
        <div class="flex flex-wrap items-end gap-3">
          <UFormField label="Fecha de corte" name="fechaCorte" class="w-48">
            <UInput v-model="fechaCorte" type="date" @change="simularManual()" />
          </UFormField>
          <UButton icon="i-lucide-play" :loading="deterioroStore.simulando" @click="simularManual()">Simular</UButton>
        </div>

        <UAlert v-if="errorSimulacion" color="error" variant="soft" :title="errorSimulacion" />

        <template v-if="!errorSimulacion">
          <UAlert
            color="neutral" variant="subtle" icon="i-lucide-eye" title="Nada de esto se ha registrado"
            :description="`Simulado a ${fechaCorte}. ${String(deterioroStore.simulacion.length)} inmueble(s)/cuenta(s) con saldo pendiente.`"
          />

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">Deterioro calculado (total)</p>
              <p class="text-lg font-semibold">{{ moneda(totalDeterioroCalculado) }}</p>
            </div>
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">Ajuste a reconocer</p>
              <p class="text-lg font-semibold">{{ moneda(totalAjuste) }}</p>
            </div>
          </div>

          <div class="overflow-x-auto rounded-lg border border-default">
            <table class="w-full text-sm">
              <thead class="bg-muted/30">
                <tr>
                  <th class="p-2 text-left">Cuenta</th><th class="p-2 text-right">Saldo</th>
                  <th class="p-2 text-right">Días vencido</th><th class="p-2 text-right">Porcentaje</th>
                  <th class="p-2 text-right">Deterioro calculado</th><th class="p-2 text-right">Ya reconocido</th>
                  <th class="p-2 text-right">Ajuste</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in deterioroStore.simulacion" :key="`${f.inmueble_id}-${f.cuenta_cartera_id}`" class="border-t border-default">
                  <td class="p-2">{{ f.cuenta_codigo }} — {{ f.cuenta_nombre }}</td>
                  <td class="p-2 text-right">{{ moneda(f.saldo) }}</td>
                  <td class="p-2 text-right">{{ f.dias_vencido }}</td>
                  <td class="p-2 text-right">{{ f.porcentaje !== null ? `${String(f.porcentaje)}%` : '—' }}</td>
                  <td class="p-2 text-right">{{ moneda(f.deterioro_calculado) }}</td>
                  <td class="p-2 text-right">{{ moneda(f.deterioro_reconocido) }}</td>
                  <td class="p-2 text-right font-medium">{{ moneda(f.ajuste) }}</td>
                </tr>
                <tr v-if="deterioroStore.simulacion.length === 0"><td colspan="7" class="p-4 text-center text-muted">Sin cartera con saldo pendiente a esta fecha.</td></tr>
              </tbody>
            </table>
          </div>

          <div class="flex flex-wrap items-end gap-3 pt-2 border-t border-default">
            <UFormField label="Periodo a cerrar" name="periodo" class="w-64">
              <USelect
                v-model="periodoId"
                :items="comprobantesStore.periodos.map((p) => ({ label: `${String(p.anio)}-${String(p.mes).padStart(2, '0')}`, value: p.id }))"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UButton
              icon="i-lucide-check" color="primary" :disabled="!periodoId || deterioroStore.simulacion.length === 0"
              :loading="deterioroStore.reconociendo" @click="confirmandoReconocer = true"
            >
              Reconocer deterioro
            </UButton>
          </div>
          <UAlert v-if="errorReconocer" color="error" variant="soft" :title="errorReconocer" />
          <UAlert
            v-if="resultadoReconocer && resultadoReconocer !== 'sin-cambios'"
            color="success" variant="soft" title="Deterioro reconocido"
            :description="`Comprobante ${resultadoReconocer} generado.`"
          />
          <UAlert
            v-if="resultadoReconocer === 'sin-cambios'"
            color="neutral" variant="soft" title="Nada que reconocer"
            description="El ajuste neto dio cero — lo ya reconocido coincide con el deterioro calculado, así que no se generó ningún comprobante."
          />
        </template>
      </div>
    </section>

    <ContabilidadDeterioroPoliticaDrawer
      v-if="drawerAbierto && tenantStore.activeTenant?.id"
      :tenant-id="tenantStore.activeTenant.id"
      :politica-id="politicaIdAbierta"
      :siguiente-version="siguienteVersion"
      @cerrar="cerrarDrawer(false)"
      @creado="cerrarDrawer(true)"
    />

    <UModal
      :open="confirmandoActivarId !== null"
      title="¿Activar esta versión?"
      @update:open="(abierto) => { if (!abierto) confirmandoActivarId = null }"
    >
      <template #body>
        <div v-if="politicaConfirmando" class="space-y-3 text-sm">
          <p>
            Vas a activar la <strong>v{{ politicaConfirmando.version }}</strong>
            <template v-if="politicaVigente"> — retira la <strong>v{{ politicaVigente.version }}</strong>, hoy vigente</template>.
          </p>
          <p class="text-muted">
            Desde ese momento el cálculo de deterioro usa esta política. No se puede deshacer — si
            algo queda mal hay que crear una versión nueva y activarla.
          </p>
        </div>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="confirmandoActivarId = null">Cancelar</UButton>
        <UButton :loading="activandoId !== null" @click="confirmarActivar">Activar</UButton>
      </template>
    </UModal>

    <UModal v-model:open="confirmandoReconocer" title="Reconocer deterioro de cartera">
      <template #body>
        <div class="space-y-3 text-sm">
          <p>
            Se va a registrar un ajuste de <strong>{{ moneda(totalAjuste) }}</strong> para el periodo
            seleccionado — un comprobante tipo DETERIORO, contabilizado de inmediato.
          </p>
          <p class="text-muted">
            No se puede deshacer con un simple UPDATE: un asiento contabilizado se corrige con
            reversión + comprobante nuevo, nunca editándolo.
          </p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="confirmandoReconocer = false">Cancelar</UButton>
        <UButton color="primary" :loading="deterioroStore.reconociendo" @click="reconocer">Sí, reconocer</UButton>
      </template>
    </UModal>
  </div>
</template>
