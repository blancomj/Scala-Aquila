<script setup lang="ts">
// MANT-5 §4.3: contratos con terceros (mantenimiento preventivo, obra civil, vigilancia, aseo…).
// El estado que se muestra por fila es el CALCULADO (mant_contrato_estado_visible: puede leer
// "por_vencer"/"vencido" sobre un contrato vigente) — nunca el estado crudo de la columna.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const contratosStore = useMantenimientoContratosStore()
const tercerosStore = useTercerosStore()
const contabilidadStore = useContabilidadStore()

const tiposContrato = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const periodicidades = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    contratosStore.cargarContratos(tenantId),
    tercerosStore.cargarTerceros(tenantId),
    contabilidadStore.cargarCuentasPresupuestales(tenantId),
    tiposContrato.value.length === 0
      ? cargarListaTipos(tenantId, 'TIPO_CONTRATO').then((d) => { tiposContrato.value = d })
      : Promise.resolve(),
    periodicidades.value.length === 0
      ? cargarListaTipos(tenantId, 'PERIODICIDAD_CONTRATO').then((d) => { periodicidades.value = d })
      : Promise.resolve(),
  ])
}
onMounted(cargar)

const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  borrador: 'neutral', vigente: 'success', por_vencer: 'warning', suspendido: 'warning',
  vencido: 'error', terminado: 'error',
}

const nombreTercero = computed(() => new Map(tercerosStore.terceros.map((t) => [t.id, t.nombre_completo])))
const opcionesTercero = computed(() =>
  tercerosStore.terceros.map((t) => ({ valor: t.id, etiqueta: `${t.nombre_completo} — ${t.numero_documento}` })),
)
const opcionesCuenta = computed(() =>
  contabilidadStore.cuentasPresupuestales
    .filter((c) => c.es_hoja && c.activa)
    .map((c) => ({ valor: c.id, etiqueta: `${c.codigo} · ${c.nombre}` })),
)

const drawerAbierto = ref(false)
const form = reactive({
  codigo: '', terceroId: null as string | null, tipoId: undefined as number | undefined,
  objeto: '', fechaInicio: new Date().toISOString().slice(0, 10), fechaFin: '',
  valorTotal: null as number | null, valorPeriodico: null as number | null,
  periodicidadId: undefined as number | undefined, formaPago: '',
  slaRespuestaHoras: null as number | null, slaSolucionHoras: null as number | null,
  presupuestoCuentaId: null as string | null,
})
const errorGuardar = ref<string | null>(null)

function abrirNuevo(): void {
  form.codigo = ''; form.terceroId = null; form.tipoId = undefined; form.objeto = ''
  form.fechaInicio = new Date().toISOString().slice(0, 10); form.fechaFin = ''
  form.valorTotal = null; form.valorPeriodico = null; form.periodicidadId = undefined
  form.formaPago = ''; form.slaRespuestaHoras = null; form.slaSolucionHoras = null
  form.presupuestoCuentaId = null
  errorGuardar.value = null
  drawerAbierto.value = true
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !form.codigo.trim() || !form.terceroId || !form.tipoId || !form.objeto.trim()) return
  errorGuardar.value = null
  const fila: Database['public']['Tables']['mant_contratos']['Insert'] = {
    tenant_id: tenantId, codigo: form.codigo.trim(), tercero_id: form.terceroId, tipo_id: form.tipoId,
    objeto: form.objeto.trim(), fecha_inicio: form.fechaInicio, fecha_fin: form.fechaFin || null,
    valor_total: form.valorTotal, valor_periodico: form.valorPeriodico,
    periodicidad_id: form.periodicidadId ?? null, forma_pago: form.formaPago.trim() || null,
    sla_respuesta_horas: form.slaRespuestaHoras, sla_solucion_horas: form.slaSolucionHoras,
    presupuesto_cuenta_id: form.presupuestoCuentaId,
  }
  try {
    const creado = await contratosStore.crearContrato(fila)
    drawerAbierto.value = false
    await navigateTo(`/mantenimiento/contratos/${creado.id}`)
  } catch (excepcion) {
    errorGuardar.value = mensajeError(excepcion, 'No se pudo crear el contrato.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Contratos</h1>
        </template>
        <template #descripcion>
          Contratos vigentes con proveedores y contratistas: valor pactado, SLA de atención y a
          qué cuenta presupuestal se carga su ejecución.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-center gap-2">
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="contratosStore.loading" @click="cargar()">
          Actualizar
        </UButton>
        <UButton icon="i-lucide-plus" @click="abrirNuevo()">Nuevo contrato</UButton>
      </div>
    </div>

    <div class="rounded-lg border border-default divide-y divide-default">
      <NuxtLink
        v-for="c in contratosStore.contratos" :key="c.id" :to="`/mantenimiento/contratos/${c.id}`"
        class="flex items-center justify-between gap-4 p-3 hover:bg-elevated transition-colors"
      >
        <div>
          <p class="font-medium">{{ c.codigo }} · {{ nombreTercero.get(c.tercero_id) ?? '—' }}</p>
          <p class="text-sm text-muted truncate max-w-md">{{ c.objeto }}</p>
        </div>
        <UBadge :color="ESTADO_COLOR[contratosStore.estadosVisibles[c.id] ?? c.estado] ?? 'neutral'" variant="soft" class="capitalize">
          {{ (contratosStore.estadosVisibles[c.id] ?? c.estado).replace(/_/g, ' ') }}
        </UBadge>
      </NuxtLink>
      <p v-if="contratosStore.contratos.length === 0 && !contratosStore.loading" class="p-6 text-sm text-muted text-center">
        Sin contratos registrados.
      </p>
    </div>

    <UiDrawer :abierto="drawerAbierto" titulo="Nuevo contrato" @cerrar="drawerAbierto = false">
      <div class="space-y-3">
        <UAlert v-if="errorGuardar" color="error" variant="soft" :title="errorGuardar" />
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Código" name="codigo"><UInput v-model="form.codigo" class="w-full" /></UFormField>
          <UFormField label="Tipo de contrato" name="tipo">
            <USelect v-model="form.tipoId" class="w-full" :items="tiposContrato.map((t) => ({ label: t.nombre, value: t.id }))" />
          </UFormField>
        </div>
        <UFormField label="Tercero (proveedor/contratista)" name="tercero">
          <TercerosSelectorTercero v-model="form.terceroId" :opciones="opcionesTercero" placeholder="Selecciona un tercero" permite-crear />
        </UFormField>
        <UFormField label="Objeto" name="objeto"><UTextarea v-model="form.objeto" class="w-full" /></UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Fecha de inicio" name="fechaInicio"><UInput v-model="form.fechaInicio" type="date" class="w-full" /></UFormField>
          <UFormField label="Fecha de fin (opcional)" name="fechaFin"><UInput v-model="form.fechaFin" type="date" class="w-full" /></UFormField>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Valor total" name="valorTotal">
            <UInput v-model.number="form.valorTotal" type="number" min="0" class="w-full" />
          </UFormField>
          <UFormField label="Valor periódico (opcional)" name="valorPeriodico">
            <UInput v-model.number="form.valorPeriodico" type="number" min="0" class="w-full" />
          </UFormField>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Periodicidad (si aplica)" name="periodicidad">
            <USelect v-model="form.periodicidadId" class="w-full" :items="periodicidades.map((p) => ({ label: p.nombre, value: p.id }))" />
          </UFormField>
          <UFormField label="Forma de pago (términos)" name="formaPago">
            <UInput v-model="form.formaPago" placeholder="ej. 45 días fecha factura" class="w-full" />
          </UFormField>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="SLA de respuesta (horas, opcional)" name="slaRespuesta">
            <UInput v-model.number="form.slaRespuestaHoras" type="number" min="0" class="w-full" />
          </UFormField>
          <UFormField label="SLA de solución (horas, opcional)" name="slaSolucion">
            <UInput v-model.number="form.slaSolucionHoras" type="number" min="0" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Cuenta presupuestal (opcional)" name="cuenta">
          <UiSelectorBuscable v-model="form.presupuestoCuentaId" :opciones="opcionesCuenta" placeholder="Cuenta hoja del plan presupuestal" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerAbierto = false">Cancelar</UButton>
          <UButton
            :loading="contratosStore.guardando"
            :disabled="!form.codigo.trim() || !form.terceroId || !form.tipoId || !form.objeto.trim()"
            @click="guardar()"
          >
            Crear contrato
          </UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
