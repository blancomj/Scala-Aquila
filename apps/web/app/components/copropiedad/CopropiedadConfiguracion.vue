<script setup lang="ts">
// Tab "Configuración" — moneda + zona horaria (PROMPT_FICHA_COPROPIEDAD.md
// §7.4). Solo estos dos campos: son los únicos que el propio código ya
// señalaba como pendientes en el placeholder original de
// pages/configuracion/index.vue. Nada más sin decisión explícita del
// usuario (tenants.settings es jsonb sin forma definida, no se le inventa
// estructura aquí).
const tenantStore = useTenantStore()
const copropiedadStore = useCopropiedadStore()

const moneda = ref('COP')
const zonaHoraria = ref('America/Bogota')

const guardando = ref(false)
const error = ref<string | null>(null)

watch(
  () => copropiedadStore.tenant,
  (t) => {
    if (!t) return
    moneda.value = t.moneda
    zonaHoraria.value = t.zona_horaria
  },
  { immediate: true },
)

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  error.value = null
  guardando.value = true
  try {
    await copropiedadStore.actualizarTenant(tenantId, {
      moneda: moneda.value,
      zona_horaria: zonaHoraria.value,
    })
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div>
    <div class="form-grid">
      <div class="field">
        <label for="f-moneda">Moneda</label>
        <select id="f-moneda" v-model="moneda">
          <option value="COP">COP — Peso colombiano</option>
        </select>
        <span class="field-hint">Sin más monedas habilitadas por ahora.</span>
      </div>
      <div class="field">
        <label for="f-zona-horaria">Zona horaria</label>
        <select id="f-zona-horaria" v-model="zonaHoraria">
          <option value="America/Bogota">América/Bogotá (UTC-5)</option>
        </select>
      </div>
    </div>
    <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>
    <div style="margin-top: 12px">
      <button type="button" class="btn btn--primary" :disabled="guardando" @click="guardar">
        {{ guardando ? 'Guardando…' : 'Guardar cambios' }}
      </button>
    </div>
  </div>
</template>
