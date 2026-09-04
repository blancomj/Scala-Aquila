<script setup lang="ts">
// Tab Cartera — saldo, cargos pendientes, pagos/recibos y liquidaciones
// (PROMPT_FICHA_INMUEBLE.md §1.1 I5). Reutiliza cuentaCorriente.ts tal
// cual, sin lógica nueva. El formulario de registrar pago YA NO vive acá
// (pedido del usuario, 2026-08-27): el botón "Registrar pago" del masthead
// de InmuebleFicha.vue abre un modal propio con PagosRegistrarPagoForm.vue
// — esta pestaña solo lee, ya no escribe.
//
// Las tres secciones (cargos / pagos / liquidaciones) son sub-pestañas y no
// secciones apiladas: son pares conceptuales de una misma historia
// (liquidación → genera cargo → se paga con recibo) y antes estaban en dos
// niveles distintos de jerarquía — dos apiladas acá dentro y "Liquidaciones"
// como pestaña propia de la ficha. Variante `pill` a propósito: las pestañas
// de la ficha usan `link` (subrayado), así se distingue el nivel externo del
// interno. El resumen (stat-row) queda ARRIBA de las sub-pestañas porque
// resume las tres, no una.
import type { Database } from '@aquila/shared'

const props = defineProps<{ inmuebleId: string }>()

const tenantStore = useTenantStore()
const cuentaStore = useCuentaCorrienteStore()
const recaudoStore = useRecaudoStore()
const liquidacionStore = useLiquidacionStore()
const toast = useToast()

type SubTab = 'cargos' | 'pagos' | 'liquidaciones'
const subTab = ref<SubTab>('cargos')

/** Contadores en la etiqueta: en una pantalla de operación decir dónde hay
 * contenido antes del clic ahorra el paseo por las tres. Obliga a cargar las
 * líneas de liquidación al entrar a Cartera (no perezosamente) — una consulta
 * más, acotada a este inmueble. */
const subTabItems = computed(() => [
  { label: `Cargos pendientes · ${cuentaStore.cargosAbiertos.length}`, value: 'cargos' },
  { label: `Pagos y recibos · ${recaudoStore.pagos.length}`, value: 'pagos' },
  { label: `Liquidaciones · ${liquidacionStore.lineasPorInmueble.length}`, value: 'liquidaciones' },
])

const saldoTotal = computed(() =>
  cuentaStore.cargosAbiertos.reduce((acc, c) => acc + Number(c.monto_pendiente), 0),
)
const saldoCapital = computed(() =>
  cuentaStore.cargosAbiertos
    .filter((c) => c.categoria === 'capital')
    .reduce((acc, c) => acc + Number(c.monto_pendiente), 0),
)
const saldoInteres = computed(() =>
  cuentaStore.cargosAbiertos
    .filter((c) => c.categoria === 'interes')
    .reduce((acc, c) => acc + Number(c.monto_pendiente), 0),
)

/** Días de mora del cargo abierto más vencido — mismo criterio de
 * "el más antiguo con saldo decide" que fn_dashboard_cartera/fn_posicion_cartera
 * (REC-CAR-010), pero sin llamar esa función: acá solo se necesita el número
 * para mostrar, no el desempate exacto de cuál cargo es. cargosAbiertos ya
 * viene filtrado a monto_pendiente > 0 (cargarCargosAbiertos). */
const diasMoraMaximo = computed(() => {
  const hoy = Date.now()
  let maximo = 0
  for (const cargo of cuentaStore.cargosAbiertos) {
    if (!cargo.fecha_vencimiento) continue
    const dias = Math.floor((hoy - new Date(cargo.fecha_vencimiento).getTime()) / 86_400_000)
    if (dias > maximo) maximo = dias
  }
  return maximo
})

// ── estado de cartera (etapa de cobranza vigente) ───────────────────────
type EtapaCobranza = Database['public']['Enums']['etapa_cobranza_t']
const ETAPA_LABEL: Record<EtapaCobranza, string> = {
  preventiva: 'Preventiva',
  administrativa: 'Administrativa',
  prejuridica: 'Prejurídica',
  juridica: 'Jurídica',
  judicial: 'Judicial',
}
const ETAPA_COLOR: Record<EtapaCobranza, 'neutral' | 'warning' | 'error'> = {
  preventiva: 'neutral',
  administrativa: 'warning',
  prejuridica: 'warning',
  juridica: 'error',
  judicial: 'error',
}
const etapaActual = ref<EtapaCobranza>('preventiva')

/** Sin fila en cartera_etapas = nunca evaluada por el job de escalamiento
 * (F8) = 'preventiva' — mismo default que fn_dashboard_cartera/
 * guard_cartera_etapa_inicial (F6), acá vía select directo en vez de esa
 * función porque solo hace falta la etapa de ESTE inmueble, no el
 * agregado de todo el tenant. */
async function cargarEtapa(tenantId: string): Promise<void> {
  const cliente = useSupabaseClient<Database>()
  const { data, error: errorEtapa } = await cliente
    .from('cartera_etapas')
    .select('etapa')
    .eq('tenant_id', tenantId)
    .eq('inmueble_id', props.inmuebleId)
    .maybeSingle()
  if (errorEtapa) throw errorEtapa
  etapaActual.value = data?.etapa ?? 'preventiva'
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    cuentaStore.cargarCargosAbiertos(tenantId, props.inmuebleId),
    cuentaStore.cargarPagos(tenantId, props.inmuebleId),
    recaudoStore.cargarRecaudo(tenantId, { inmuebleId: props.inmuebleId }),
    liquidacionStore.cargarLineasPorInmueble(tenantId, props.inmuebleId),
    cargarEtapa(tenantId),
  ])
}

watchEffect(cargar)

function irARecibo(reciboId: string): void {
  navigateTo(`/recibo-caja/${reciboId}`, { open: { target: '_blank' } })
}

const reenviando = ref<string | null>(null)
async function reenviar(reciboId: string): Promise<void> {
  reenviando.value = reciboId
  try {
    const resultado = await recaudoStore.reenviarRecibo(reciboId)
    toast.add({
      title: resultado.enviados.length > 0 ? `Reenviado a ${resultado.enviados.length} destinatario(s).` : 'Sin destinatarios con correo.',
      color: resultado.enviados.length > 0 ? 'success' : 'warning',
    })
  } catch (excepcion) {
    toast.add({ title: mensajeError(excepcion, 'No se pudo reenviar el recibo.'), color: 'error' })
  } finally {
    reenviando.value = null
  }
}

// ── anular ───────────────────────────────────────────────────────────
const modalAnularAbierto = ref(false)
const pagoAnulando = ref<(typeof recaudoStore.pagos)[number] | null>(null)
const motivoAnulacion = ref('')
const anulando = ref(false)
const errorAnulacion = ref<string | null>(null)

function abrirAnular(pago: (typeof recaudoStore.pagos)[number]): void {
  pagoAnulando.value = pago
  motivoAnulacion.value = ''
  errorAnulacion.value = null
  modalAnularAbierto.value = true
}

async function confirmarAnular(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !pagoAnulando.value || !motivoAnulacion.value.trim()) return
  errorAnulacion.value = null
  anulando.value = true
  try {
    await cuentaStore.anularPago({
      pagoId: pagoAnulando.value.id,
      motivo: motivoAnulacion.value.trim(),
      tenantId,
      inmuebleId: props.inmuebleId,
    })
    modalAnularAbierto.value = false
    toast.add({ title: 'Pago anulado.', color: 'success' })
    await cargar()
  } catch (excepcion) {
    errorAnulacion.value = mensajeError(excepcion, 'No se pudo anular el pago.')
  } finally {
    anulando.value = false
  }
}
</script>

<template>
  <div>
    <div class="stat-row">
      <div class="stat">
        <p class="stat-label">Saldo total pendiente</p>
        <p class="stat-value" :class="{ 'is-alert': saldoTotal > 0 }">$ {{ saldoTotal.toLocaleString('es-CO') }}</p>
      </div>
      <div class="stat">
        <p class="stat-label">Capital</p>
        <p class="stat-value">$ {{ saldoCapital.toLocaleString('es-CO') }}</p>
      </div>
      <div class="stat">
        <p class="stat-label">Interés de mora</p>
        <p class="stat-value">$ {{ saldoInteres.toLocaleString('es-CO') }}</p>
      </div>
      <div class="stat">
        <p class="stat-label">Estado de cartera</p>
        <UBadge :color="ETAPA_COLOR[etapaActual]" variant="subtle">{{ ETAPA_LABEL[etapaActual] }}</UBadge>
        <p class="text-xs text-neutral-400 mt-1">
          {{ diasMoraMaximo > 0 ? `${diasMoraMaximo} días de mora` : 'Sin mora' }}
        </p>
      </div>
    </div>

    <UTabs
      :items="subTabItems"
      :model-value="subTab"
      variant="pill"
      size="sm"
      :content="false"
      class="w-full mt-1 mb-4"
      @update:model-value="(v) => (subTab = v as SubTab)"
    />

    <UiTabla
      v-if="subTab === 'cargos'"
      :columnas="[
        { clave: 'categoria', etiqueta: 'Categoría' },
        { clave: 'pendiente', etiqueta: 'Pendiente', alinear: 'derecha', claseCelda: 'mono' },
        { clave: 'desde', etiqueta: 'Desde', claseCelda: 'mono' },
      ]"
      :filas="cuentaStore.cargosAbiertos"
      :clave-fila="(c, i) => c.id ?? i"
      vacio="Sin cargos pendientes."
    >
      <template #celda-categoria="{ fila }">
        <UBadge :color="fila.categoria === 'interes' ? 'error' : 'neutral'" variant="subtle">{{ fila.categoria }}</UBadge>
      </template>
      <template #celda-pendiente="{ fila }">$ {{ Number(fila.monto_pendiente).toLocaleString('es-CO') }}</template>
      <template #celda-desde="{ fila }">{{ fila.created_at?.slice(0, 10) }}</template>
    </UiTabla>

    <UiTabla
      v-else-if="subTab === 'pagos'"
      :columnas="[
        { clave: 'fecha_pago', etiqueta: 'Fecha', claseCelda: 'mono' },
        { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha', claseCelda: 'mono' },
        { clave: 'forma_pago_nombre', etiqueta: 'Forma de pago' },
        { clave: 'recibo_folio', etiqueta: 'Recibo' },
        { clave: 'estado', etiqueta: 'Estado' },
        { clave: 'acciones', etiqueta: '' },
      ]"
      :filas="recaudoStore.pagos"
      :clave-fila="(p) => p.id"
      vacio="Sin pagos registrados."
    >
      <template #celda-monto="{ fila }">
        <span :class="{ 'text-error-600': fila.es_reversa }">$ {{ fila.monto.toLocaleString('es-CO') }}</span>
      </template>
      <template #celda-recibo_folio="{ fila }">
        <span v-if="fila.recibo_folio" class="font-mono text-xs">{{ fila.recibo_folio }}</span>
        <span v-else class="text-neutral-400 text-xs">—</span>
      </template>
      <template #celda-estado="{ fila }">
        <UBadge v-if="fila.es_reversa" color="error" variant="subtle" size="sm">Reversa</UBadge>
        <UBadge v-else-if="fila.esta_anulado" color="warning" variant="subtle" size="sm">Anulado</UBadge>
        <UBadge v-else color="success" variant="subtle" size="sm">Vigente</UBadge>
      </template>
      <template #celda-acciones="{ fila }">
        <div class="flex justify-end gap-1">
          <UButton
            v-if="fila.recibo_id"
            size="xs"
            variant="ghost"
            icon="i-lucide-file-text"
            title="Ver recibo"
            @click="irARecibo(fila.recibo_id)"
          />
          <UButton
            v-if="fila.recibo_id"
            size="xs"
            variant="ghost"
            icon="i-lucide-send"
            title="Reenviar recibo por correo"
            :loading="reenviando === fila.recibo_id"
            @click="reenviar(fila.recibo_id)"
          />
          <UButton
            v-if="!fila.es_reversa && !fila.esta_anulado"
            size="xs"
            variant="ghost"
            color="error"
            icon="i-lucide-ban"
            title="Anular pago"
            @click="abrirAnular(fila)"
          />
        </div>
      </template>
    </UiTabla>

    <InmueblesInmuebleLiquidaciones v-else :inmueble-id="inmuebleId" />

    <UModal
      :open="modalAnularAbierto"
      title="Anular pago"
      @update:open="(abierto) => { if (!abierto) modalAnularAbierto = false }"
    >
      <template #body>
        <div class="space-y-4 text-sm">
          <p v-if="pagoAnulando" class="text-neutral-600">
            Vas a anular el pago de <strong>$ {{ pagoAnulando.monto.toLocaleString('es-CO') }}</strong>
            del {{ pagoAnulando.fecha_pago }}. Se registrará como una reversa — el pago original
            no se borra.
          </p>
          <UFormField label="Motivo" name="motivo" required>
            <UTextarea v-model="motivoAnulacion" :rows="2" autoresize placeholder="ej. Cheque devuelto por el banco" class="w-full" />
          </UFormField>
          <UAlert v-if="errorAnulacion" color="error" variant="soft" :title="errorAnulacion" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="modalAnularAbierto = false">Cancelar</UButton>
          <UButton color="error" :loading="anulando" :disabled="!motivoAnulacion.trim()" @click="confirmarAnular">
            Anular pago
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
