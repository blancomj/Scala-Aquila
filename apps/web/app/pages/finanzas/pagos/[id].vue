<script setup lang="ts">
// FIN-3 §3.5/§3.6/§3.7: ficha del lote — armado (facturas pagables + disponibilidad en vivo),
// transición de estado, comprobante de pago imprimible, conciliación con el motor de bancos
// (confirmación explícita del usuario, nunca automática).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const route = useRoute()
const loteId = route.params.id as string

const tenantStore = useTenantStore()
const lotesStore = useFinanzasLotesPagoStore()
const copropiedadStore = useCopropiedadStore()

const disponible = ref<{ saldo_contable: number; comprometido_reservado: number; disponible: number } | null>(null)

async function cargarDisponible(): Promise<void> {
  if (!lotesStore.loteActual) return
  const cliente = useSupabaseClient<Database>()
  const { data } = await cliente
    .rpc('fn_cuenta_bancaria_disponible', { p_cuenta_bancaria_id: lotesStore.loteActual.cuenta_bancaria_id })
    .single<{ saldo_contable: number; comprometido_reservado: number; comprometido_proyectado: number; disponible: number }>()
  disponible.value = data
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    lotesStore.cargarLote(loteId),
    lotesStore.cargarFacturasPagables(tenantId, new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString().slice(0, 10)),
    copropiedadStore.cargarCuentasBancarias(tenantId),
  ])
  await cargarDisponible()
}
onMounted(cargar)
onBeforeUnmount(() => lotesStore.limpiarActual())

const lote = computed(() => lotesStore.loteActual)
const nombreCuenta = computed(() =>
  new Map(copropiedadStore.cuentasBancarias.map((c) => [c.id, c.numero_cuenta])),
)

const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'primary'> = {
  borrador: 'neutral', programado: 'primary', aprobado: 'primary',
  ejecutado: 'success', conciliado: 'success', anulado: 'error',
}

const puedeEditarItems = computed(() => lote.value?.estado === 'borrador' || lote.value?.estado === 'programado')
const errorAccion = ref<string | null>(null)

// ── Agregar factura ──
const idsYaEnLote = computed(() => new Set(lotesStore.items.map((i) => i.factura_id)))
const facturaSeleccionada = ref<string | null>(null)
const montoAPagar = ref<number | null>(null)
const esPagoParcial = ref(false)

const opcionesFactura = computed(() =>
  lotesStore.facturasPagables
    .filter((f) => !f.ya_en_lote && !idsYaEnLote.value.has(f.factura_id))
    .map((f) => ({ valor: f.factura_id, etiqueta: `${f.numero_documento} · ${f.proveedor_nombre} · ${f.total_neto_pagar}` })),
)

watch(facturaSeleccionada, (id) => {
  const fila = lotesStore.facturasPagables.find((f) => f.factura_id === id)
  montoAPagar.value = fila?.total_neto_pagar ?? null
  esPagoParcial.value = false
})

async function agregar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !lote.value || !facturaSeleccionada.value || montoAPagar.value === null) return
  errorAccion.value = null
  try {
    await lotesStore.agregarItem({
      tenant_id: tenantId, lote_id: lote.value.id, factura_id: facturaSeleccionada.value,
      monto_a_pagar: montoAPagar.value, es_pago_parcial: esPagoParcial.value,
    })
    facturaSeleccionada.value = null
    montoAPagar.value = null
    esPagoParcial.value = false
    await cargarDisponible()
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo agregar la factura al lote.')
  }
}

async function quitar(itemId: string): Promise<void> {
  if (!lote.value) return
  errorAccion.value = null
  try {
    await lotesStore.quitarItem(itemId, lote.value.id)
    await cargarDisponible()
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo quitar el ítem.')
  }
}

// ── Transiciones ──
const justificacion = ref('')
const motivoAnulacion = ref('')
const fechaEjecucion = ref(new Date().toISOString().slice(0, 10))

async function programar(): Promise<void> {
  if (!lote.value) return
  errorAccion.value = null
  try {
    await lotesStore.programarLote(lote.value.id)
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo pasar el lote a programado.')
  }
}

async function aprobar(): Promise<void> {
  if (!lote.value) return
  errorAccion.value = null
  try {
    await lotesStore.aprobarLote(lote.value.id, justificacion.value.trim() || undefined)
    await lotesStore.cargarLote(lote.value.id)
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo aprobar el lote.')
  }
}

async function ejecutar(): Promise<void> {
  if (!lote.value) return
  errorAccion.value = null
  try {
    await lotesStore.ejecutarLote(lote.value.id, fechaEjecucion.value)
    await cargarDisponible()
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo ejecutar el lote.')
  }
}

async function anular(): Promise<void> {
  if (!lote.value || !motivoAnulacion.value.trim()) return
  errorAccion.value = null
  try {
    await lotesStore.anularLote(lote.value.id, motivoAnulacion.value.trim())
    await cargarDisponible()
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo anular el lote.')
  }
}

// ── Conciliación ──
const lineaSeleccionada = ref<string | null>(null)
async function cargarLineas(): Promise<void> {
  if (!lote.value) return
  await lotesStore.cargarLineasExtracto(lote.value.cuenta_bancaria_id)
}
watch(() => lote.value?.estado, (estado) => { if (estado === 'ejecutado') cargarLineas() }, { immediate: true })

const opcionesLinea = computed(() =>
  lotesStore.lineasExtracto.map((l) => ({
    valor: l.id, etiqueta: `${l.fecha_movimiento} · ${l.monto} · ${l.descripcion_banco}`,
  })),
)

async function conciliar(): Promise<void> {
  if (!lote.value || !lineaSeleccionada.value) return
  errorAccion.value = null
  try {
    await lotesStore.conciliarLote(lote.value.id, lineaSeleccionada.value)
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo conciliar el lote.')
  }
}

function imprimirComprobante(): void {
  window.print()
}
</script>

<template>
  <div v-if="lote" class="space-y-6">
    <div class="flex items-center gap-3 flex-wrap print:hidden">
      <UButton variant="link" icon="i-lucide-arrow-left" to="/finanzas/pagos" class="px-0">
        Lotes de pago
      </UButton>
    </div>
    <div class="flex items-center gap-3 flex-wrap">
      <h1 class="text-xl font-semibold">Lote {{ lote.anio }}-{{ String(lote.numero).padStart(5, '0') }}</h1>
      <UBadge :color="ESTADO_COLOR[lote.estado] ?? 'neutral'" variant="soft" class="capitalize">{{ lote.estado }}</UBadge>
    </div>

    <UAlert v-if="errorAccion" color="error" variant="soft" :title="errorAccion" class="print:hidden" />

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6 print:hidden">
        <!-- Agregar factura -->
        <section v-if="puedeEditarItems" class="rounded-lg border border-default p-4 space-y-3">
          <h2 class="font-medium">Agregar factura</h2>
          <div class="flex gap-2">
            <UiSelectorBuscable v-model="facturaSeleccionada" :opciones="opcionesFactura" placeholder="Factura pagable" class="flex-1" />
          </div>
          <div v-if="facturaSeleccionada" class="grid grid-cols-2 gap-3">
            <UFormField label="Monto a pagar" name="monto">
              <UInput v-model.number="montoAPagar" type="number" min="0" class="w-full" />
            </UFormField>
            <UFormField label="Pago parcial" name="parcial">
              <USwitch v-model="esPagoParcial" />
            </UFormField>
          </div>
          <UButton :disabled="!facturaSeleccionada || montoAPagar === null" :loading="lotesStore.guardando" @click="agregar()">
            Agregar al lote
          </UButton>
        </section>

        <!-- Ítems -->
        <section class="rounded-lg border border-default p-4 space-y-2">
          <h2 class="font-medium">Facturas del lote</h2>
          <div class="divide-y divide-default">
            <div v-for="i in lotesStore.items" :key="i.id" class="flex items-center justify-between py-2">
              <div>
                <p class="text-sm font-medium">{{ i.factura?.numero_documento }} · {{ i.factura?.proveedor?.nombre_completo ?? '—' }}</p>
                <p class="text-xs text-muted">
                  {{ i.monto_a_pagar }} <span v-if="i.es_pago_parcial">(pago parcial)</span>
                </p>
              </div>
              <UButton v-if="puedeEditarItems" variant="ghost" color="error" icon="i-lucide-x" size="sm" @click="quitar(i.id)" />
            </div>
            <p v-if="lotesStore.items.length === 0" class="py-4 text-sm text-muted text-center">Sin facturas todavía.</p>
          </div>
        </section>

        <!-- Transición -->
        <section class="rounded-lg border border-default p-4 space-y-3">
          <h2 class="font-medium">Estado del lote</h2>
          <UButton v-if="lote.estado === 'borrador'" :disabled="lote.cantidad_pagos === 0" :loading="lotesStore.guardando" @click="programar()">
            Pasar a programado
          </UButton>
          <div v-else-if="lote.estado === 'programado'" class="space-y-2">
            <UInput v-model="justificacion" placeholder="Justificación (solo si hay validaciones no bloqueantes pendientes)" class="w-full" />
            <UButton :loading="lotesStore.guardando" @click="aprobar()">Aprobar</UButton>
          </div>
          <div v-else-if="lote.estado === 'aprobado'" class="flex items-end gap-2">
            <UFormField label="Fecha de ejecución" name="fechaEjecucion">
              <UInput v-model="fechaEjecucion" type="date" class="w-full" />
            </UFormField>
            <UButton :loading="lotesStore.guardando" @click="ejecutar()">Ejecutar pago</UButton>
          </div>
          <div v-else-if="lote.estado === 'ejecutado'" class="space-y-2">
            <p class="text-xs text-muted">
              Confirma la línea del extracto bancario que corresponde a este pago — nunca se
              concilia solo. Si no aparece, no se ha importado todavía el extracto de esta cuenta.
            </p>
            <UiSelectorBuscable v-model="lineaSeleccionada" :opciones="opcionesLinea" placeholder="Línea del extracto" />
            <UButton :disabled="!lineaSeleccionada" :loading="lotesStore.guardando" @click="conciliar()">Confirmar conciliación</UButton>
          </div>
          <p v-else-if="lote.estado === 'conciliado'" class="text-sm text-muted">Lote conciliado — cerrado.</p>

          <div v-if="['borrador', 'programado', 'aprobado'].includes(lote.estado)" class="pt-3 border-t border-default space-y-2">
            <UInput v-model="motivoAnulacion" placeholder="Motivo de anulación" class="w-full" />
            <UButton variant="outline" color="error" :disabled="!motivoAnulacion.trim()" :loading="lotesStore.guardando" @click="anular()">
              Anular lote
            </UButton>
          </div>
        </section>

        <section v-if="lotesStore.advertencias.length > 0" class="rounded-lg border border-warning/40 bg-warning/5 p-4 space-y-2">
          <h2 class="font-medium">Advertencias</h2>
          <div v-for="a in lotesStore.advertencias" :key="a.id" class="text-sm">
            <p class="font-medium">{{ a.codigo }}</p>
            <p class="text-muted">{{ a.mensaje }}</p>
          </div>
        </section>
      </div>

      <div class="space-y-3">
        <section class="rounded-lg border border-default p-4 space-y-2 text-sm print:hidden">
          <h2 class="font-medium mb-1">Cuenta y disponibilidad</h2>
          <p><span class="text-muted">Cuenta:</span> {{ nombreCuenta.get(lote.cuenta_bancaria_id) ?? '—' }}</p>
          <p><span class="text-muted">Programado:</span> {{ lote.fecha_programada }}</p>
          <p v-if="lote.fecha_ejecucion"><span class="text-muted">Ejecutado:</span> {{ lote.fecha_ejecucion }}</p>
          <template v-if="disponible">
            <p><span class="text-muted">Saldo contable:</span> {{ disponible.saldo_contable }}</p>
            <p><span class="text-muted">Reservado:</span> {{ disponible.comprometido_reservado }}</p>
            <p class="font-medium"><span class="text-muted font-normal">Disponible:</span> {{ disponible.disponible }}</p>
          </template>
        </section>

        <section v-if="['ejecutado', 'conciliado'].includes(lote.estado)" class="rounded-lg border border-default p-4 space-y-2 text-sm">
          <div class="flex items-center justify-between print:hidden">
            <h2 class="font-medium">Comprobante de pago</h2>
            <UButton variant="ghost" size="sm" icon="i-lucide-printer" @click="imprimirComprobante()">Imprimir</UButton>
          </div>
          <p class="text-xs text-muted">
            Documento operativo para archivo y para adjuntar al pago real — no es un comprobante
            contable.
          </p>
          <p>Lote {{ lote.anio }}-{{ String(lote.numero).padStart(5, '0') }}</p>
          <p>Cuenta: {{ nombreCuenta.get(lote.cuenta_bancaria_id) ?? '—' }}</p>
          <p>Fecha de ejecución: {{ lote.fecha_ejecucion }}</p>
          <p>Total: {{ lote.monto_total }} ({{ lote.cantidad_pagos }} pago(s))</p>
          <ul class="list-disc list-inside">
            <li v-for="i in lotesStore.items" :key="i.id">
              {{ i.factura?.numero_documento }} — {{ i.factura?.proveedor?.nombre_completo }} — {{ i.monto_a_pagar }}
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
  <p v-else class="text-sm text-muted p-6 text-center">Cargando…</p>
</template>
