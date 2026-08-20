<script setup lang="ts">
// Drawer "Nuevo presupuesto" — mismo criterio que MiembroDrawer.vue: el
// contenido va en <div class="ficha-inmueble"> porque las reglas
// .drawer-*/.form-grid/.field de ficha-inmueble.css están scopeadas bajo
// ese selector ancestro (sin él, el drawer se renderiza sin estilo — bug
// real ya documentado ahí). Año + monto total, migrado tal cual del
// formulario inline que tenía presupuesto/index.vue.
const emit = defineEmits<{ cerrar: []; creado: [id: string] }>()

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()

const anio = ref<number | null>(new Date().getFullYear())
const montoTotal = ref<number | null>(null)
const guardando = ref(false)
const error = ref<string | null>(null)

async function guardar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || anio.value === null || montoTotal.value === null) {
    error.value = 'Completa el año y el monto total.'
    return
  }

  guardando.value = true
  try {
    const creado = await presupuestoStore.crearPresupuesto({
      tenantId,
      anio: anio.value,
      montoTotal: montoTotal.value,
    })
    emit('creado', creado.id)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear el presupuesto.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      titulo="Nuevo presupuesto"
      subtitulo="Año y monto total aprobado — los rubros se agregan después, en borrador"
      @cerrar="emit('cerrar')"
    >
      <div class="form-grid">
        <div class="field">
          <label for="p-anio">Año</label>
          <input id="p-anio" v-model.number="anio" type="number" >
        </div>
        <div class="field">
          <label for="p-monto">Monto total</label>
          <input id="p-monto" v-model.number="montoTotal" type="number" min="0" >
        </div>
      </div>

      <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>

      <template #foot>
        <button type="button" class="btn btn--ghost" @click="emit('cerrar')">Cancelar</button>
        <button type="button" class="btn btn--primary" :disabled="guardando" @click="guardar">
          {{ guardando ? 'Creando…' : 'Crear presupuesto' }}
        </button>
      </template>
    </UiDrawer>
  </div>
</template>
