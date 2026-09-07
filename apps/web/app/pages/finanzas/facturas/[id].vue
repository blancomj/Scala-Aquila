<script setup lang="ts">
// FIN-2 §3.5: ficha de factura de proveedor. La transición de estado sigue la FSM de
// guard_finanzas_factura_proveedor (borrador→registrada→en_revision→[en_disputa]→aprobada→
// programada→pagada_parcial→pagada; pagada es terminal e inmutable). Aprobar es el ÚNICO camino
// que crea/enlaza presupuesto_ejecucion — pasa siempre por fn_finanzas_aprobar_factura (RPC),
// nunca por un UPDATE directo de este store (Finanzas origina el hecho, CO-3 lo materializa,
// APENDICE_FIN.md).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type FacturaEstado = Database['public']['Enums']['factura_estado_t']

const route = useRoute()
const facturaId = route.params.id as string

const tenantStore = useTenantStore()
const facturasStore = useFinanzasFacturasStore()
const tercerosStore = useTercerosStore()
const contabilidadStore = useContabilidadStore()
const documentosStore = useDocumentosStore()

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    facturasStore.cargarFactura(facturaId),
    facturasStore.cargarPoliticaVigente(tenantId),
    tercerosStore.cargarTerceros(tenantId),
    contabilidadStore.cargarPlan(tenantId),
  ])
}
onMounted(cargar)
onBeforeUnmount(() => facturasStore.limpiarActual())

const factura = computed(() => facturasStore.facturaActual)
const nombreProveedor = computed(() => new Map(tercerosStore.terceros.map((t) => [t.id, t.nombre_completo])))
const cuentaPorId = computed(() => new Map(contabilidadStore.cuentas.map((c) => [c.id, c])))

const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'primary'> = {
  borrador: 'neutral', registrada: 'neutral', en_revision: 'primary', en_disputa: 'warning',
  aprobada: 'success', programada: 'primary', pagada_parcial: 'warning', pagada: 'success', anulada: 'error',
}

const TRANSICIONES: Record<FacturaEstado, FacturaEstado[]> = {
  borrador: ['registrada', 'anulada'],
  registrada: ['en_revision', 'anulada'],
  en_revision: ['en_disputa', 'anulada'],
  en_disputa: ['en_revision', 'anulada'],
  aprobada: ['programada', 'anulada'],
  programada: ['pagada_parcial', 'pagada', 'anulada'],
  pagada_parcial: ['pagada', 'anulada'],
  pagada: [],
  anulada: [],
}
const transicionesDisponibles = computed(() => (factura.value ? TRANSICIONES[factura.value.estado] : []))
const puedeAprobar = computed(() => factura.value?.estado === 'en_revision')

const errorAccion = ref<string | null>(null)
const motivo = ref('')

async function cambiarEstado(nuevo: FacturaEstado): Promise<void> {
  if (!factura.value) return
  errorAccion.value = null
  const patch: Database['public']['Tables']['finanzas_facturas_proveedor']['Update'] = { estado: nuevo }
  if (nuevo === 'anulada') {
    if (!motivo.value.trim()) { errorAccion.value = 'Ingresa el motivo de anulación antes de continuar.'; return }
    patch.motivo_rechazo = motivo.value.trim()
  }
  if (nuevo === 'en_disputa') {
    if (!motivo.value.trim()) { errorAccion.value = 'Ingresa el motivo de la disputa antes de continuar.'; return }
    patch.motivo_disputa = motivo.value.trim()
  }
  try {
    await facturasStore.actualizarFactura(factura.value.id, patch)
    motivo.value = ''
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo cambiar el estado de la factura.')
  }
}

async function aprobar(): Promise<void> {
  if (!factura.value) return
  errorAccion.value = null
  try {
    await facturasStore.aprobarFactura(factura.value.id)
    await facturasStore.cargarFactura(factura.value.id)
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo aprobar la factura.')
  }
}

const urlSoporte = ref<string | null>(null)
watchEffect(async () => {
  urlSoporte.value = null
  const docId = factura.value?.documento_soporte_id
  if (!docId) return
  const documento = await documentosStore.documentoPorId(docId)
  if (documento) urlSoporte.value = await documentosStore.urlDescarga(documento.storage_path)
})
</script>

<template>
  <div v-if="factura" class="space-y-6">
    <div>
      <UButton variant="link" icon="i-lucide-arrow-left" to="/finanzas/facturas" class="px-0 mb-1">
        Facturas de proveedor
      </UButton>
      <div class="flex items-center gap-3 flex-wrap">
        <h1 class="text-xl font-semibold">{{ factura.numero_documento }} · {{ nombreProveedor.get(factura.proveedor_id) ?? '—' }}</h1>
        <UBadge :color="ESTADO_COLOR[factura.estado] ?? 'neutral'" variant="soft" class="capitalize">
          {{ factura.estado.replace(/_/g, ' ') }}
        </UBadge>
      </div>
    </div>

    <UAlert v-if="errorAccion" color="error" variant="soft" :title="errorAccion" />

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6">
        <!-- Desglose -->
        <section class="rounded-lg border border-default p-4 space-y-2">
          <h2 class="font-medium">Desglose</h2>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><p class="text-xs text-muted">Subtotal</p><p class="font-semibold">{{ factura.subtotal }}</p></div>
            <div><p class="text-xs text-muted">IVA generado</p><p class="font-semibold">{{ factura.iva_generado }}</p></div>
            <div><p class="text-xs text-muted">IVA descontable</p><p class="font-semibold">{{ factura.iva_descontable }}</p></div>
            <div><p class="text-xs text-muted">Retenciones</p><p class="font-semibold">{{ factura.total_retenciones }}</p></div>
            <div><p class="text-xs text-muted">Total bruto</p><p class="font-semibold">{{ factura.total_bruto }}</p></div>
            <div><p class="text-xs text-muted">Neto a pagar</p><p class="font-semibold text-lg">{{ factura.total_neto_pagar }}</p></div>
          </div>
        </section>

        <!-- Transición de estado -->
        <section class="rounded-lg border border-default p-4 space-y-3">
          <h2 class="font-medium">Estado</h2>
          <p v-if="puedeAprobar" class="text-xs text-muted">
            Aprobar crea o enlaza el compromiso en <code>presupuesto_ejecucion</code> — la
            materialización contable del periodo la toma de ahí, esta acción nunca contabiliza
            por sí misma.
          </p>
          <div v-if="transicionesDisponibles.length > 0 || puedeAprobar" class="space-y-2">
            <UInput
              v-if="transicionesDisponibles.includes('anulada') || transicionesDisponibles.includes('en_disputa')"
              v-model="motivo" placeholder="Motivo (requerido para anular o poner en disputa)" class="w-full"
            />
            <div class="flex gap-2 flex-wrap">
              <UButton v-if="puedeAprobar" :loading="facturasStore.guardando" @click="aprobar()">Aprobar</UButton>
              <UButton
                v-for="siguiente in transicionesDisponibles" :key="siguiente" variant="outline"
                :loading="facturasStore.guardando" @click="cambiarEstado(siguiente)"
              >
                Pasar a {{ siguiente.replace(/_/g, ' ') }}
              </UButton>
            </div>
          </div>
          <p v-else class="text-sm text-muted">Estado terminal — sin transiciones disponibles.</p>
        </section>

        <!-- Advertencias -->
        <section v-if="facturasStore.advertencias.length > 0" class="rounded-lg border border-warning/40 bg-warning/5 p-4 space-y-2">
          <h2 class="font-medium">Advertencias</h2>
          <div v-for="a in facturasStore.advertencias" :key="a.id" class="text-sm">
            <p class="font-medium">{{ a.codigo }}</p>
            <p class="text-muted">{{ a.mensaje }}</p>
          </div>
        </section>

        <!-- Descomposición contable -->
        <section v-if="factura.presupuesto_ejecucion_id" class="rounded-lg border border-default p-4 space-y-3">
          <h2 class="font-medium">Descomposición contable</h2>
          <p class="text-xs text-muted">
            Vista previa de las líneas que CO-3 materializará para este compromiso —
            <code>finanzas_factura_descomposicion</code>, la misma función que consume la proyección.
          </p>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-muted">
                  <th class="py-1 pr-3">Cuenta</th><th class="py-1 pr-3">Débito</th><th class="py-1">Crédito</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(l, i) in facturasStore.descomposicion" :key="i" class="border-t border-default">
                  <td class="py-1 pr-3">
                    {{ cuentaPorId.get(l.cuenta_id)?.codigo ?? '—' }} · {{ cuentaPorId.get(l.cuenta_id)?.nombre ?? l.descripcion }}
                  </td>
                  <td class="py-1 pr-3">{{ l.debito || '—' }}</td>
                  <td class="py-1">{{ l.credito || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Retenciones -->
        <section class="rounded-lg border border-default p-4 space-y-2">
          <h2 class="font-medium">Retenciones aplicadas</h2>
          <div v-if="facturasStore.retenciones.length > 0" class="divide-y divide-default">
            <div v-for="r in facturasStore.retenciones" :key="r.id" class="flex justify-between py-2 text-sm">
              <span>Concepto {{ r.concepto_id }} · base {{ r.base }} · tarifa {{ r.tarifa }}%</span>
              <span class="font-medium">{{ r.valor }}</span>
            </div>
          </div>
          <p v-else class="text-sm text-muted">
            Sin retenciones registradas — el catálogo tributario (CO-8) todavía no existe en este tenant.
          </p>
        </section>
      </div>

      <div class="space-y-3">
        <section class="rounded-lg border border-default p-4 space-y-2 text-sm">
          <h2 class="font-medium mb-1">Datos del documento</h2>
          <p><span class="text-muted">Emisión:</span> {{ factura.fecha_emision }}</p>
          <p><span class="text-muted">Vencimiento:</span> {{ factura.fecha_vencimiento }}</p>
          <p v-if="factura.contrato_id">
            <span class="text-muted">Contrato:</span>
            <NuxtLink :to="`/mantenimiento/contratos/${factura.contrato_id}`" class="text-primary underline">Ver contrato</NuxtLink>
          </p>
          <p>
            <span class="text-muted">Soporte:</span>
            <a v-if="urlSoporte" :href="urlSoporte" target="_blank" rel="noopener" class="text-primary underline">Ver documento</a>
            <span v-else>—</span>
          </p>
          <p v-if="facturasStore.politicaVigente?.monto_umbral != null">
            <span class="text-muted">Umbral de aprobación vigente:</span> {{ facturasStore.politicaVigente.monto_umbral }}
          </p>
        </section>
      </div>
    </div>
  </div>
  <p v-else class="text-sm text-muted p-6 text-center">Cargando…</p>
</template>
