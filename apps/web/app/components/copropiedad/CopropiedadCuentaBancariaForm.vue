<script setup lang="ts">
// Modal "Agregar cuenta" — Cuentas bancarias de la copropiedad
// (PROMPT_FICHA_COPROPIEDAD.md §7.2). entidad_financiera_id viene del
// catálogo ENTIDAD_FINANCIERA (20260822170000/20260822171000) — cierra el
// gap que antes dejaba "banco" como texto libre.
//
// Contenido en Nuxt UI (UFormField/UInput/USelect/UButton), mismo criterio
// que politicas/PoliticasVersionDrawer.vue (23-08-2026). De paso se agrega
// el <div class="ficha-inmueble"> que faltaba alrededor de <UiDrawer> — sin
// ese ancestro el drawer se renderiza sin estilo (bug documentado en
// MiembroDrawer.vue); CopropiedadDatosBasicos.vue, quien monta este
// componente, tampoco lo envuelve, así que faltaba en toda la cadena.
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
    error.value = mensajeError(excepcion, 'No se pudo crear la cuenta bancaria.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      titulo="Agregar cuenta"
      subtitulo="Cuenta bancaria de la copropiedad"
      @cerrar="emit('cerrar')"
    >
      <div class="space-y-4 text-sm">
        <UFormField label="Banco" name="entidad_financiera_id">
          <UiSelectorBuscable
            v-model="entidadFinancieraId"
            :opciones="opcionesEntidadFinanciera"
            placeholder="Buscar entidad…"
          />
        </UFormField>
        <UFormField label="Tipo de cuenta" name="tipo_cuenta">
          <USelect
            v-model="tipoCuenta"
            :items="[
              { label: 'Ahorros', value: 'ahorros' },
              { label: 'Corriente', value: 'corriente' },
              { label: 'Billetera digital', value: 'billetera' },
            ]"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Número de cuenta" name="numero_cuenta">
          <UInput v-model="numeroCuenta" type="text" placeholder="1234567890" class="w-full" />
        </UFormField>
        <UFormField label="Titular (opcional)" name="titular">
          <UInput v-model="titular" type="text" placeholder="Conjunto Residencial DAM5" class="w-full" />
        </UFormField>
      </div>
      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="guardando" @click="guardar">Guardar</UButton>
      </template>
    </UiDrawer>
  </div>
</template>
