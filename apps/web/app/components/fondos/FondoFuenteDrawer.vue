<script setup lang="ts">
// Drawer "Registrar fuente de alimentación" — de dónde provienen los recursos que alimentan
// el fondo (Modelo §9). fondo_fuentes_porcentaje_o_valor exige al menos uno de los dos; se
// deja elegir cuál informar, no los dos a la vez, para no sugerir que ambos aplican siempre.
const props = defineProps<{ fondoId: string; autorizaciones: { valor: string; etiqueta: string }[] }>()
const emit = defineEmits<{ cerrar: []; creado: [] }>()

const tenantStore = useTenantStore()
const fondosStore = useFondosStore()

const tipos = ref<{ valor: number; etiqueta: string }[]>([])
onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const catalogo = await cargarListaTipos(tenantId, 'TIPO_FUENTE_ALIMENTACION_FONDO')
  tipos.value = catalogo.map((t) => ({ valor: t.id, etiqueta: t.nombre }))
})

const tipoId = ref<number | null>(null)
const modoValor = ref<'porcentaje' | 'valor'>('porcentaje')
const porcentaje = ref<number | null>(null)
const valor = ref<number | null>(null)
const baseCalculo = ref('')
const periodicidad = ref('')
const autorizacionId = ref<string | null>(null)
const guardando = ref(false)
const error = ref<string | null>(null)

async function guardar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  const montoInformado = modoValor.value === 'porcentaje' ? porcentaje.value : valor.value
  if (!tenantId || tipoId.value === null || montoInformado === null) {
    error.value = `Completa el tipo de fuente y el ${modoValor.value === 'porcentaje' ? 'porcentaje' : 'valor'}.`
    return
  }

  guardando.value = true
  try {
    await fondosStore.registrarFuente({
      tenantId,
      fondoId: props.fondoId,
      tipoId: tipoId.value,
      porcentaje: modoValor.value === 'porcentaje' ? (porcentaje.value ?? undefined) : undefined,
      valor: modoValor.value === 'valor' ? (valor.value ?? undefined) : undefined,
      baseCalculo: baseCalculo.value.trim() || undefined,
      periodicidad: periodicidad.value.trim() || undefined,
      autorizacionId: autorizacionId.value ?? undefined,
    })
    emit('creado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar la fuente.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      titulo="Registrar fuente de alimentación"
      subtitulo="De dónde provienen los recursos que alimentan este fondo"
      @cerrar="emit('cerrar')"
    >
      <div class="grid grid-cols-2 gap-4 text-sm">
        <UFormField label="Tipo de fuente" name="tipo_id" class="col-span-2">
          <UiSelectorBuscable v-model="tipoId" :opciones="tipos" />
        </UFormField>

        <UFormField label="Se informa como" name="modo_valor" class="col-span-2">
          <URadioGroup
            v-model="modoValor"
            orientation="horizontal"
            :items="[
              { label: 'Porcentaje', value: 'porcentaje' },
              { label: 'Valor fijo', value: 'valor' },
            ]"
          />
        </UFormField>
        <UFormField v-if="modoValor === 'porcentaje'" label="Porcentaje (0–100)" name="porcentaje">
          <UInput v-model.number="porcentaje" type="number" min="0" max="100" step="0.01" class="w-full" />
        </UFormField>
        <UFormField v-else label="Valor" name="valor">
          <UInput v-model.number="valor" type="number" min="0" class="w-full" />
        </UFormField>

        <UFormField label="Base de cálculo (opcional)" name="base_calculo">
          <UInput v-model="baseCalculo" class="w-full" placeholder="Presupuesto anual" />
        </UFormField>
        <UFormField label="Periodicidad (opcional)" name="periodicidad">
          <UInput v-model="periodicidad" class="w-full" placeholder="Mensual" />
        </UFormField>
        <UFormField
          v-if="autorizaciones.length > 0"
          label="Autorización que la respalda (opcional)"
          name="autorizacion_id"
          class="col-span-2"
        >
          <UiSelectorBuscable v-model="autorizacionId" :opciones="autorizaciones" />
        </UFormField>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="guardando" @click="guardar">Registrar</UButton>
      </template>
    </UiDrawer>
  </div>
</template>
