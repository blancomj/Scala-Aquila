<script setup lang="ts">
// Drawer "Registrar fuente de financiación" — mismo criterio de drawer
// que el resto (.ficha-inmueble + .form-grid/.field/.btn). A diferencia
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

const tipoId = ref<number | null>(null)
const valorDisponible = ref<number | null>(null)
const valorAplicado = ref<number | null>(null)
const descripcion = ref('')
const fundamentoNormativoId = ref<number | null>(null)
const guardando = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  if (presupuestoStore.tiposFuente.length === 0) await presupuestoStore.cargarTiposFuente(props.tenantId)
  if (tipoId.value === null) tipoId.value = presupuestoStore.tiposFuente[0]?.id ?? null
})

async function guardar(): Promise<void> {
  error.value = null
  if (valorDisponible.value === null || tipoId.value === null) {
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
      <div class="form-grid">
        <div class="field">
          <label for="f-tipo">Tipo</label>
          <select id="f-tipo" v-model="tipoId">
            <option v-for="t in presupuestoStore.tiposFuente" :key="t.id" :value="t.id">
              {{ t.nombre }}
            </option>
          </select>
        </div>
        <div class="field">
          <label for="f-disponible">Valor disponible</label>
          <input id="f-disponible" v-model.number="valorDisponible" type="number" min="0" />
        </div>
        <div class="field">
          <label for="f-aplicado">Valor aplicado</label>
          <input id="f-aplicado" v-model.number="valorAplicado" type="number" min="0" />
        </div>
        <div class="field span-2">
          <label for="f-descripcion">Descripción</label>
          <input id="f-descripcion" v-model="descripcion" type="text" />
        </div>
        <div class="field span-2">
          <label for="f-fundamento">Fundamento normativo</label>
          <select id="f-fundamento" v-model="fundamentoNormativoId">
            <option :value="null">— Ninguno —</option>
            <option v-for="f in fundamentoStore.fundamentos" :key="f.id" :value="f.id">
              {{ f.norma }}
            </option>
          </select>
        </div>
      </div>

      <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>

      <template #foot>
        <button type="button" class="btn btn--ghost" @click="emit('cerrar')">Cancelar</button>
        <button type="button" class="btn btn--primary" :disabled="guardando" @click="guardar">
          {{ guardando ? 'Registrando…' : 'Registrar' }}
        </button>
      </template>
    </UiDrawer>
  </div>
</template>
