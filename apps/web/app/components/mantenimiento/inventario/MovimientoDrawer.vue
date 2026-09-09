<script setup lang="ts">
// MANT-6 §4.2: registrar un movimiento de inventario. 'entrada'/'salida'/'ajuste' son un INSERT
// directo (el guard de la base valida signo/stock/motivo); 'transferencia' SIEMPRE pasa por
// fn_mant_transferir_repuesto — un INSERT suelto de ese tipo lo rechaza el guard (ver informe).
const emit = defineEmits<{ cerrar: []; guardado: [] }>()

const tenantStore = useTenantStore()
const inventarioStore = useMantenimientoInventarioStore()

type Tipo = 'entrada' | 'salida' | 'ajuste' | 'transferencia'
const TIPOS: ReadonlyArray<{ label: string; value: Tipo }> = [
  { label: 'Entrada', value: 'entrada' },
  { label: 'Salida', value: 'salida' },
  { label: 'Ajuste', value: 'ajuste' },
  { label: 'Transferencia entre almacenes', value: 'transferencia' },
]

const tipo = ref<Tipo>('entrada')
const repuestoId = ref<string | null>(null)
const almacenId = ref<string | undefined>(undefined)
const almacenDestinoId = ref<string | undefined>(undefined)
const cantidad = ref<number | null>(null)
const costoUnitario = ref<number | null>(null)
const direccionAjuste = ref<1 | -1>(1)
const motivo = ref('')
const error = ref<string | null>(null)

const opcionesRepuesto = computed(() =>
  inventarioStore.repuestos.map((r) => ({ valor: r.id, etiqueta: `${r.sku} · ${r.nombre}` })),
)

const puedeGuardar = computed(() => {
  if (!repuestoId.value || !almacenId.value || !cantidad.value || cantidad.value <= 0) return false
  if (tipo.value === 'transferencia')
    return !!almacenDestinoId.value && almacenDestinoId.value !== almacenId.value
  if (tipo.value === 'ajuste') return motivo.value.trim() !== ''
  return true
})

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !puedeGuardar.value || !repuestoId.value || !almacenId.value || !cantidad.value)
    return
  error.value = null
  try {
    if (tipo.value === 'transferencia') {
      await inventarioStore.transferir({
        tenantId,
        repuestoId: repuestoId.value,
        almacenOrigenId: almacenId.value,
        almacenDestinoId: almacenDestinoId.value!,
        cantidad: cantidad.value,
      })
    } else {
      await inventarioStore.registrarMovimiento({
        tenantId,
        repuestoId: repuestoId.value,
        almacenId: almacenId.value,
        tipo: tipo.value,
        cantidad: cantidad.value,
        direccion: tipo.value === 'ajuste' ? direccionAjuste.value : undefined,
        costoUnitario: costoUnitario.value ?? undefined,
        motivo: motivo.value.trim() || undefined,
      })
    }
    emit('guardado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar el movimiento.')
  }
}
</script>

<template>
  <UiDrawer :abierto="true" titulo="Registrar movimiento" @cerrar="emit('cerrar')">
    <div class="space-y-4">
      <UFormField label="Tipo" name="tipo">
        <USelect v-model="tipo" class="w-full" :items="[...TIPOS]" />
      </UFormField>
      <UFormField label="Repuesto" name="repuesto">
        <UiSelectorBuscable
          v-model="repuestoId"
          :opciones="opcionesRepuesto"
          placeholder="Selecciona un repuesto"
        />
      </UFormField>
      <UFormField :label="tipo === 'transferencia' ? 'Almacén origen' : 'Almacén'" name="almacen">
        <USelect
          v-model="almacenId"
          class="w-full"
          placeholder="Selecciona un almacén"
          :items="inventarioStore.almacenes.map((a) => ({ label: a.nombre, value: a.id }))"
        />
      </UFormField>
      <UFormField v-if="tipo === 'transferencia'" label="Almacén destino" name="almacen_destino">
        <USelect
          v-model="almacenDestinoId"
          class="w-full"
          placeholder="Selecciona un almacén"
          :items="
            inventarioStore.almacenes
              .filter((a) => a.id !== almacenId)
              .map((a) => ({ label: a.nombre, value: a.id }))
          "
        />
      </UFormField>
      <div class="grid grid-cols-2 gap-3">
        <UFormField label="Cantidad" name="cantidad">
          <UInput v-model.number="cantidad" type="number" min="0" class="w-full" />
        </UFormField>
        <UFormField
          v-if="tipo !== 'transferencia'"
          label="Costo unitario (opcional)"
          name="costo_unitario"
        >
          <UInput v-model.number="costoUnitario" type="number" min="0" class="w-full" />
        </UFormField>
      </div>
      <UFormField v-if="tipo === 'ajuste'" label="Dirección" name="direccion">
        <USelect
          v-model="direccionAjuste"
          class="w-full"
          :items="[
            { label: 'Sube el stock (+)', value: 1 },
            { label: 'Baja el stock (-)', value: -1 },
          ]"
        />
      </UFormField>
      <UFormField v-if="tipo === 'ajuste'" label="Motivo (obligatorio)" name="motivo">
        <UTextarea v-model="motivo" class="w-full" :rows="2" />
      </UFormField>
      <UAlert v-if="error" color="error" variant="soft" :title="error" />
    </div>
    <template #foot>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="inventarioStore.guardando" :disabled="!puedeGuardar" @click="guardar()"
          >Guardar</UButton
        >
      </div>
    </template>
  </UiDrawer>
</template>
