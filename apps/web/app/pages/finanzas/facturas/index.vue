<script setup lang="ts">
// FIN-2 §3.5: bandeja de facturas de proveedor por estado, con alta (documento soporte,
// desglose subtotal/IVA/retenciones/neto visible antes de guardar).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const facturasStore = useFinanzasFacturasStore()
const tercerosStore = useTercerosStore()
const contabilidadStore = useContabilidadStore()
const documentosStore = useDocumentosStore()

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    facturasStore.cargarFacturas(tenantId),
    tercerosStore.cargarTerceros(tenantId),
    tercerosStore.cargarPersonasTenant(tenantId),
    contabilidadStore.cargarCuentasPresupuestales(tenantId),
  ])
}
onMounted(cargar)

// Solo terceros con rol vigente proveedor/contratista (mismo criterio que
// mantenimiento/proveedores/index.vue) — no cualquier tercero de la copropiedad.
const CODIGOS_PROVEEDOR = new Set(['proveedor', 'contratista'])

const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'primary'> = {
  borrador: 'neutral', registrada: 'neutral', en_revision: 'primary', en_disputa: 'warning',
  aprobada: 'success', programada: 'primary', pagada_parcial: 'warning', pagada: 'success', anulada: 'error',
}

const filtroEstado = ref<string | null>(null)
const facturasFiltradas = computed(() =>
  facturasStore.facturas.filter((f) => !filtroEstado.value || f.estado === filtroEstado.value),
)
const nombreProveedor = computed(() => new Map(tercerosStore.terceros.map((t) => [t.id, t.nombre_completo])))

const opcionesProveedor = computed(() => {
  const vistos = new Set<string>()
  const opciones: { valor: string; etiqueta: string }[] = []
  for (const p of tercerosStore.personasTenant) {
    if (!CODIGOS_PROVEEDOR.has(p.rol?.codigo ?? '')) continue
    if (p.vigente_hasta !== null && new Date(p.vigente_hasta) < new Date()) continue
    if (vistos.has(p.tercero_id)) continue
    vistos.add(p.tercero_id)
    opciones.push({ valor: p.tercero_id, etiqueta: `${p.tercero.nombre_completo} — ${p.tercero.numero_documento}` })
  }
  return opciones
})
const opcionesCuenta = computed(() =>
  contabilidadStore.cuentasPresupuestales
    .filter((c) => c.es_hoja && c.activa && c.naturaleza === 'egreso')
    .map((c) => ({ valor: c.id, etiqueta: `${c.codigo} · ${c.nombre}` })),
)

const drawerAbierto = ref(false)
const archivoSoporte = ref<File | null>(null)
const form = reactive({
  proveedorId: null as string | null, presupuestoCuentaId: null as string | null,
  numeroDocumento: '', fechaEmision: new Date().toISOString().slice(0, 10), fechaVencimiento: '',
  subtotal: null as number | null, ivaGenerado: 0, ivaDescontable: 0,
})
const errorGuardar = ref<string | null>(null)

const totalBruto = computed(() => (form.subtotal ?? 0) + form.ivaGenerado)
const totalNeto = computed(() => totalBruto.value)

function elegirArchivo(evento: Event): void {
  archivoSoporte.value = (evento.target as HTMLInputElement).files?.[0] ?? null
}

function abrirNueva(): void {
  form.proveedorId = null; form.presupuestoCuentaId = null; form.numeroDocumento = ''
  form.fechaEmision = new Date().toISOString().slice(0, 10); form.fechaVencimiento = ''
  form.subtotal = null; form.ivaGenerado = 0; form.ivaDescontable = 0
  archivoSoporte.value = null
  errorGuardar.value = null
  drawerAbierto.value = true
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !form.proveedorId || !form.presupuestoCuentaId || !form.numeroDocumento.trim()
      || !form.fechaVencimiento || form.subtotal === null || !archivoSoporte.value) return
  errorGuardar.value = null
  try {
    const tipoDoc = await cargarListaTipos(tenantId, 'TIPO_DOCUMENTO')
    const tipoDocFactura = tipoDoc.find((t) => t.codigo === 'factura_proveedor')
    if (!tipoDocFactura) throw new Error('No se encontró el tipo de documento "factura_proveedor".')
    const documento = await documentosStore.subirDocumento({
      tenantId, inmuebleId: null, tipoDocumentoId: tipoDocFactura.id, archivo: archivoSoporte.value,
    })
    const fila: Database['public']['Tables']['finanzas_facturas_proveedor']['Insert'] = {
      tenant_id: tenantId, proveedor_id: form.proveedorId, presupuesto_cuenta_id: form.presupuestoCuentaId,
      documento_soporte_id: documento.id, numero_documento: form.numeroDocumento.trim(),
      fecha_emision: form.fechaEmision, fecha_vencimiento: form.fechaVencimiento,
      subtotal: form.subtotal, iva_generado: form.ivaGenerado, iva_descontable: form.ivaDescontable,
      total_bruto: totalBruto.value, total_retenciones: 0, total_neto_pagar: totalNeto.value,
    }
    const creada = await facturasStore.crearFactura(fila)
    drawerAbierto.value = false
    await navigateTo(`/finanzas/facturas/${creada.id}`)
  } catch (excepcion) {
    errorGuardar.value = mensajeError(excepcion, 'No se pudo registrar la factura.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Facturas de proveedor</h1>
        </template>
        <template #descripcion>
          El documento recibido del proveedor: subtotal, IVA descontable y retenciones. Aprobarla
          origina el compromiso en <code>presupuesto_ejecucion</code> — nunca contabiliza por sí
          misma, eso lo hace la materialización contable del periodo.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-center gap-2">
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="facturasStore.loading" @click="cargar()">
          Actualizar
        </UButton>
        <UButton icon="i-lucide-plus" @click="abrirNueva()">Nueva factura</UButton>
      </div>
    </div>

    <div class="flex justify-end">
      <USelect
        v-model="filtroEstado"
        :items="[
          { label: 'Todos los estados', value: null },
          { label: 'Borrador', value: 'borrador' },
          { label: 'Registrada', value: 'registrada' },
          { label: 'En revisión', value: 'en_revision' },
          { label: 'En disputa', value: 'en_disputa' },
          { label: 'Aprobada', value: 'aprobada' },
          { label: 'Programada', value: 'programada' },
          { label: 'Pagada parcial', value: 'pagada_parcial' },
          { label: 'Pagada', value: 'pagada' },
          { label: 'Anulada', value: 'anulada' },
        ]"
        class="w-52"
      />
    </div>

    <div class="rounded-lg border border-default divide-y divide-default">
      <NuxtLink
        v-for="f in facturasFiltradas" :key="f.id" :to="`/finanzas/facturas/${f.id}`"
        class="flex items-center justify-between gap-4 p-3 hover:bg-elevated transition-colors"
      >
        <div>
          <p class="font-medium">{{ f.numero_documento }} · {{ nombreProveedor.get(f.proveedor_id) ?? '—' }}</p>
          <p class="text-sm text-muted">
            Emisión {{ f.fecha_emision }} · vence {{ f.fecha_vencimiento }} · neto {{ f.total_neto_pagar }}
          </p>
        </div>
        <UBadge :color="ESTADO_COLOR[f.estado] ?? 'neutral'" variant="soft" class="capitalize">
          {{ f.estado.replace(/_/g, ' ') }}
        </UBadge>
      </NuxtLink>
      <p v-if="facturasFiltradas.length === 0 && !facturasStore.loading" class="p-6 text-sm text-muted text-center">
        Sin facturas con este filtro.
      </p>
    </div>

    <UiDrawer :abierto="drawerAbierto" titulo="Nueva factura de proveedor" @cerrar="drawerAbierto = false">
      <div class="space-y-3">
        <UAlert v-if="errorGuardar" color="error" variant="soft" :title="errorGuardar" />
        <UFormField label="Proveedor" name="proveedor">
          <UiSelectorBuscable v-model="form.proveedorId" :opciones="opcionesProveedor" placeholder="Selecciona un proveedor" />
        </UFormField>
        <UFormField label="Cuenta presupuestal (rubro del gasto)" name="cuenta">
          <UiSelectorBuscable v-model="form.presupuestoCuentaId" :opciones="opcionesCuenta" placeholder="Cuenta hoja del plan presupuestal" />
        </UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Número de la factura" name="numero"><UInput v-model="form.numeroDocumento" class="w-full" /></UFormField>
          <UFormField label="Fecha de emisión" name="fechaEmision"><UInput v-model="form.fechaEmision" type="date" class="w-full" /></UFormField>
        </div>
        <UFormField label="Fecha de vencimiento" name="fechaVencimiento">
          <UInput v-model="form.fechaVencimiento" type="date" class="w-full" />
        </UFormField>
        <div class="grid grid-cols-3 gap-3">
          <UFormField label="Subtotal" name="subtotal">
            <UInput v-model.number="form.subtotal" type="number" min="0" class="w-full" />
          </UFormField>
          <UFormField label="IVA generado" name="ivaGenerado">
            <UInput v-model.number="form.ivaGenerado" type="number" min="0" class="w-full" />
          </UFormField>
          <UFormField label="IVA descontable" name="ivaDescontable">
            <UInput v-model.number="form.ivaDescontable" type="number" min="0" class="w-full" />
          </UFormField>
        </div>
        <div class="rounded-md bg-elevated p-3 text-sm space-y-1">
          <div class="flex justify-between"><span class="text-muted">Total bruto</span><span>{{ totalBruto }}</span></div>
          <div class="flex justify-between font-medium"><span>Neto a pagar</span><span>{{ totalNeto }}</span></div>
        </div>
        <UFormField label="Documento soporte (obligatorio para aprobar)" name="soporte">
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" class="text-sm" @change="elegirArchivo">
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerAbierto = false">Cancelar</UButton>
          <UButton
            :loading="facturasStore.guardando"
            :disabled="!form.proveedorId || !form.presupuestoCuentaId || !form.numeroDocumento.trim() || !form.fechaVencimiento || form.subtotal === null || !archivoSoporte"
            @click="guardar()"
          >
            Registrar factura
          </UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
