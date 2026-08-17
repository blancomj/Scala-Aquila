<script setup lang="ts">
// Modal "Agregar cuenta" — Cuentas bancarias de la copropiedad
// (PROMPT_FICHA_COPROPIEDAD.md §7.2). entidad_financiera_id viene del
// catálogo ENTIDAD_FINANCIERA (20260822170000/20260822171000) — cierra el
// gap que antes dejaba "banco" como texto libre.
import type { Database } from '@aquila/shared'

type CuentaBancariaTipo = Database['public']['Enums']['cuenta_bancaria_tipo_t']

const emit = defineEmits<{ cerrar: []; guardado: [] }>()

const tenantStore = useTenantStore()
const copropiedadStore = useCopropiedadStore()

const entidadFinancieraId = ref<number | null>(null)
const tipoCuenta = ref<CuentaBancariaTipo>('ahorros')
const numeroCuenta = ref('')
const titular = ref('')

const guardando = ref(false)
const error = ref<string | null>(null)

const opcionesEntidadFinanciera = computed(() =>
  copropiedadStore.entidadesFinancieras.map((e) => ({ valor: e.id, etiqueta: e.nombre })),
)

watchEffect(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await copropiedadStore.cargarEntidadesFinancieras(tenantId)
})

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || entidadFinancieraId.value === null || !numeroCuenta.value.trim()) return

  error.value = null
  guardando.value = true
  try {
    await copropiedadStore.crearCuentaBancaria({
      tenantId,
      entidadFinancieraId: entidadFinancieraId.value,
      tipoCuenta: tipoCuenta.value,
      numeroCuenta: numeroCuenta.value.trim(),
      titular: titular.value.trim() || undefined,
    })
    emit('guardado')
  } catch (excepcion) {
    error.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo crear la cuenta bancaria.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <UiDrawer
    :abierto="true"
    titulo="Agregar cuenta"
    subtitulo="Cuenta bancaria de la copropiedad"
    @cerrar="emit('cerrar')"
  >
    <div class="form-grid" style="grid-template-columns: 1fr">
      <div class="field">
        <label for="cb-banco">Banco</label>
        <UiSelectorBuscable
          id="cb-banco"
          v-model="entidadFinancieraId"
          variante="ficha"
          :opciones="opcionesEntidadFinanciera"
          placeholder="Buscar entidad…"
        />
      </div>
      <div class="field">
        <label for="cb-tipo">Tipo de cuenta</label>
        <select id="cb-tipo" v-model="tipoCuenta">
          <option value="ahorros">Ahorros</option>
          <option value="corriente">Corriente</option>
          <option value="billetera">Billetera digital</option>
        </select>
      </div>
      <div class="field">
        <label for="cb-numero">Número de cuenta</label>
        <input id="cb-numero" v-model="numeroCuenta" type="text" placeholder="1234567890">
      </div>
      <div class="field">
        <label for="cb-titular">Titular (opcional)</label>
        <input id="cb-titular" v-model="titular" type="text" placeholder="Conjunto Residencial DAM5">
      </div>
    </div>
    <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>

    <template #foot>
      <button type="button" class="btn btn--ghost" @click="emit('cerrar')">Cancelar</button>
      <button type="button" class="btn btn--primary" :disabled="guardando" @click="guardar">
        {{ guardando ? 'Guardando…' : 'Guardar' }}
      </button>
    </template>
  </UiDrawer>
</template>
