<script setup lang="ts">
// Drawer "Registrar fuente de financiación" — contenedor UiDrawer (igual
// que el resto), contenido en componentes Nuxt UI (UFormField/UInput/
// USelect/UButton), no `.field`/`<select>` plano — mismo criterio que
// politicas/PoliticasVersionDrawer.vue (23-08-2026). A diferencia
// de crear presupuesto/rubro (RLS directa), esto invoca la Edge Function
// presupuesto-financiacion (guard trigger + resolución de tenant_id
// server-side) — ver stores/presupuesto.ts::registrarFuenteFinanciacion.
//
// "Tipo" pasó de un <select> con 4 valores fijos (enum Postgres) a un
// catálogo lista_tipos (familia TIPO_FUENTE_FINANCIACION, 20260830210000)
// — se retiró 'saldo_aplicable' (sin respaldo en los presupuestos reales
// investigados, ver sesión de diseño) y el catálogo ahora es ampliable por
// tenant sin migración nueva.
const props = defineProps<{ presupuestoId: string; tenantId: string }>()
const emit = defineEmits<{ cerrar: []; creado: [] }>()

const presupuestoStore = usePresupuestoStore()
const fundamentoStore = useFundamentoNormativoStore()

const tipoId = ref<number | undefined>(undefined)
const valorDisponible = ref<number | null>(null)
const valorAplicado = ref<number | null>(null)
const descripcion = ref('')
const fundamentoNormativoId = ref<number | null>(null)
const guardando = ref(false)
const error = ref<string | null>(null)

const opcionesTipo = computed(() =>
  presupuestoStore.tiposFuente.map((t) => ({ label: t.nombre, value: t.id })),
)
const opcionesFundamento = computed(() => [
  { label: '— Ninguno —', value: null },
  ...fundamentoStore.fundamentos.map((f) => ({ label: f.norma, value: f.id })),
])

onMounted(async () => {
  if (presupuestoStore.tiposFuente.length === 0) await presupuestoStore.cargarTiposFuente(props.tenantId)
  if (tipoId.value === undefined) tipoId.value = presupuestoStore.tiposFuente[0]?.id
})

async function guardar(): Promise<void> {
  error.value = null
  if (valorDisponible.value === null || tipoId.value === undefined) {
    error.value = 'Completa el tipo y el valor disponible.'
    return
  }

  guardando.value = true
  try {
    await presupuestoStore.registrarFuenteFinanciacion({
      presupuestoId: props.presupuestoId,
      tipoId: tipoId.value,
      valorDisponible: valorDisponible.value,
      valorAplicado: valorAplicado.value ?? 0,
      descripcion: descripcion.value || undefined,
      fundamentoNormativoId: fundamentoNormativoId.value ?? undefined,
    })
    emit('creado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar la fuente de financiación.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer :abierto="true" titulo="Registrar fuente de financiación" @cerrar="emit('cerrar')">
      <div class="grid grid-cols-2 gap-4 text-sm">
        <UFormField label="Tipo" name="tipo_id" class="col-span-2">
          <USelect v-model="tipoId" :items="opcionesTipo" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="Valor disponible" name="valor_disponible">
          <UInput v-model.number="valorDisponible" type="number" min="0" class="w-full" />
        </UFormField>
        <UFormField label="Valor aplicado" name="valor_aplicado">
          <UInput v-model.number="valorAplicado" type="number" min="0" class="w-full" />
        </UFormField>
        <UFormField label="Descripción" name="descripcion" class="col-span-2">
          <UInput v-model="descripcion" type="text" class="w-full" />
        </UFormField>
        <UFormField label="Fundamento normativo" name="fundamento_normativo_id" class="col-span-2">
          <USelect v-model="fundamentoNormativoId" :items="opcionesFundamento" value-key="value" class="w-full" />
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
