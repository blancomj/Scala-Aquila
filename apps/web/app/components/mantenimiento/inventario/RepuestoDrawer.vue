<script setup lang="ts">
// MANT-6 §4.1: crear/editar un repuesto del catálogo. Repuesto NO es activo — el recuadro
// explicativo vive en la página que lo abre (inventario/index.vue), no aquí.
import type { Database } from '@aquila/shared'

type RepuestoRow = Database['public']['Tables']['mant_repuestos']['Row']
type PoliticaContable = Database['public']['Enums']['politica_contable_repuesto_t']

const props = defineProps<{ repuesto?: RepuestoRow | null }>()
const emit = defineEmits<{ cerrar: []; guardado: [] }>()

const tenantStore = useTenantStore()
const inventarioStore = useMantenimientoInventarioStore()
const contabilidadStore = useContabilidadStore()

const categorias = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const unidades = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])

const sku = ref(props.repuesto?.sku ?? '')
const nombre = ref(props.repuesto?.nombre ?? '')
const descripcion = ref(props.repuesto?.descripcion ?? '')
const categoriaId = ref<number | undefined>(props.repuesto?.categoria_id ?? undefined)
const unidadId = ref<number | undefined>(props.repuesto?.unidad_id ?? undefined)
const stockMinimo = ref<number | null>(props.repuesto?.stock_minimo ?? null)
const stockMaximo = ref<number | null>(props.repuesto?.stock_maximo ?? null)
const puntoReorden = ref<number | null>(props.repuesto?.punto_reorden ?? null)
// MANT-6 Fase 1 (D-127): 'gasto_directo' es el default — sin cambio de comportamiento para
// quien no elige 'inventario'. contableCuentaId solo importa (y solo lo exige el guard) cuando
// la política es 'inventario'.
const politicaContable = ref<PoliticaContable>(props.repuesto?.politica_contable ?? 'gasto_directo')
const contableCuentaId = ref<string | null>(props.repuesto?.contable_cuenta_id ?? null)

const error = ref<string | null>(null)

onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const [cat, uni] = await Promise.all([
    cargarListaTipos(tenantId, 'CATEGORIA_REPUESTO'),
    cargarListaTipos(tenantId, 'UNIDAD_MEDIDA'),
    contabilidadStore.cuentas.length === 0 ? contabilidadStore.cargarPlan(tenantId) : Promise.resolve(),
  ])
  categorias.value = cat
  unidades.value = uni
})

// Guía, no validación: guard_mant_repuesto exige clase 1 cuando politica_contable = 'inventario'
// — se acota la lista a esa clase para no ofrecer una cuenta que el guard va a rechazar de
// todas formas (mismo criterio que ActivoFormDrawer.vue con la clase 15 de PP&E).
const opcionesCuentaExistencias = computed(() =>
  contabilidadStore.cuentasDeMovimiento
    .filter((c) => c.clase === 1)
    .map((c) => ({ valor: c.id, etiqueta: `${c.codigo} — ${c.nombre}` })),
)

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !sku.value.trim() || !nombre.value.trim() || categoriaId.value === undefined)
    return
  error.value = null
  try {
    const bloqueContable = {
      politica_contable: politicaContable.value,
      contable_cuenta_id: politicaContable.value === 'inventario' ? contableCuentaId.value : null,
    }
    if (props.repuesto) {
      await inventarioStore.actualizarRepuesto(props.repuesto.id, {
        sku: sku.value.trim(),
        nombre: nombre.value.trim(),
        descripcion: descripcion.value.trim() || null,
        categoria_id: categoriaId.value,
        unidad_id: unidadId.value ?? null,
        stock_minimo: stockMinimo.value,
        stock_maximo: stockMaximo.value,
        punto_reorden: puntoReorden.value,
        ...bloqueContable,
      })
    } else {
      await inventarioStore.crearRepuesto({
        tenant_id: tenantId,
        sku: sku.value.trim(),
        nombre: nombre.value.trim(),
        descripcion: descripcion.value.trim() || null,
        categoria_id: categoriaId.value,
        unidad_id: unidadId.value ?? null,
        stock_minimo: stockMinimo.value,
        stock_maximo: stockMaximo.value,
        punto_reorden: puntoReorden.value,
        ...bloqueContable,
      })
    }
    emit('guardado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el repuesto.')
  }
}
</script>

<template>
  <UiDrawer
    :abierto="true"
    :titulo="repuesto ? 'Editar repuesto' : 'Nuevo repuesto'"
    @cerrar="emit('cerrar')"
  >
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <UFormField label="SKU" name="sku">
          <UInput v-model="sku" class="w-full" placeholder="PIN-001" />
        </UFormField>
        <UFormField label="Categoría" name="categoria">
          <USelect
            v-model="categoriaId"
            class="w-full"
            :items="categorias.map((c) => ({ label: c.nombre, value: c.id }))"
          />
        </UFormField>
      </div>
      <UFormField label="Nombre" name="nombre">
        <UInput v-model="nombre" class="w-full" />
      </UFormField>
      <UFormField label="Descripción (opcional)" name="descripcion">
        <UTextarea v-model="descripcion" class="w-full" :rows="2" />
      </UFormField>
      <UFormField label="Unidad de medida (opcional)" name="unidad">
        <USelect
          v-model="unidadId"
          class="w-full"
          placeholder="— Sin unidad —"
          :items="unidades.map((u) => ({ label: u.nombre, value: u.id }))"
        />
      </UFormField>
      <div class="grid grid-cols-3 gap-3">
        <UFormField label="Stock mínimo" name="stock_minimo">
          <UInput v-model.number="stockMinimo" type="number" min="0" class="w-full" />
        </UFormField>
        <UFormField label="Punto de reorden" name="punto_reorden">
          <UInput v-model.number="puntoReorden" type="number" min="0" class="w-full" />
        </UFormField>
        <UFormField label="Stock máximo" name="stock_maximo">
          <UInput v-model.number="stockMaximo" type="number" min="0" class="w-full" />
        </UFormField>
      </div>
      <div class="space-y-3 rounded-lg border border-default p-3">
        <UFormField label="Política contable del consumo" name="politica_contable">
          <USelect
            v-model="politicaContable"
            class="w-full"
            :items="[
              { label: 'Gasto directo (sin registro contable al consumir)', value: 'gasto_directo' },
              { label: 'Inventario (existencias — genera comprobante al consumir)', value: 'inventario' },
            ]"
          />
        </UFormField>
        <UFormField
          v-if="politicaContable === 'inventario'"
          label="Cuenta de existencias"
          name="cuenta_existencias"
        >
          <UiSelectorBuscable
            v-model="contableCuentaId"
            :opciones="opcionesCuentaExistencias"
            placeholder="Cuenta de clase 1"
          />
        </UFormField>
      </div>
      <UAlert v-if="error" color="error" variant="soft" :title="error" />
    </div>
    <template #foot>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton
          :loading="inventarioStore.guardando"
          :disabled="
            !sku.trim() ||
            !nombre.trim() ||
            categoriaId === null ||
            (politicaContable === 'inventario' && !contableCuentaId)
          "
          @click="guardar()"
        >
          Guardar
        </UButton>
      </div>
    </template>
  </UiDrawer>
</template>
