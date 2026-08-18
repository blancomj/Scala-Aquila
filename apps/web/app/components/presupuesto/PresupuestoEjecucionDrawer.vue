<script setup lang="ts">
// Drawer "Registrar movimiento" (E9) — mismo criterio que PresupuestoRubroDrawer.vue: solo
// cuentas hoja (guard_presupuesto_ejecucion_cuenta rechaza cualquier otra), select plano para
// periodo (lista corta, no necesita búsqueda).
const props = defineProps<{ tenantId: string }>()
const emit = defineEmits<{ cerrar: []; registrado: [] }>()

const presupuestoStore = usePresupuestoStore()
const liquidacionStore = useLiquidacionStore()

const cuentaId = ref<string | null>(null)
const periodoId = ref<string | null>(null)
const monto = ref<number | null>(null)
const descripcion = ref('')
const referencia = ref('')
const guardando = ref(false)
const error = ref<string | null>(null)

await useAsyncData('periodos-ejecucion', () => liquidacionStore.cargarPeriodos(props.tenantId))

/** Misma construcción de ruta legible que PresupuestoRubroDrawer.vue (parent_id, no `ruta`). */
const cuentasHoja = computed(() => {
  const porId = new Map(presupuestoStore.cuentas.map((c) => [c.id, c]))
  function rutaNombres(cuenta: (typeof presupuestoStore.cuentas)[number]): string {
    const segmentos = [cuenta.nombre]
    let actual = cuenta
    while (actual.parent_id) {
      const padre = porId.get(actual.parent_id)
      if (!padre) break
      segmentos.unshift(padre.nombre)
      actual = padre
    }
    return segmentos.join(' › ')
  }
  return presupuestoStore.cuentas
    .filter((c) => c.es_hoja)
    .map((c) => ({ id: c.id, etiqueta: `${rutaNombres(c)} (${c.naturaleza})` }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))
})

const opcionesPeriodo = computed(() =>
  liquidacionStore.periodos
    .slice()
    .sort((a, b) => b.anio - a.anio || b.mes - a.mes)
    .map((p) => ({ id: p.id, etiqueta: `${p.anio}-${String(p.mes).padStart(2, '0')} (${p.estado})` })),
)

async function guardar(): Promise<void> {
  error.value = null
  if (cuentaId.value === null || periodoId.value === null || monto.value === null) {
    error.value = 'Completa cuenta, periodo y monto.'
    return
  }

  guardando.value = true
  try {
    await presupuestoStore.registrarEjecucion({
      tenantId: props.tenantId,
      cuentaId: cuentaId.value,
      periodoId: periodoId.value,
      monto: monto.value,
      descripcion: descripcion.value || undefined,
      referencia: referencia.value || undefined,
    })
    emit('registrado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar el movimiento.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer :abierto="true" titulo="Registrar movimiento" @cerrar="emit('cerrar')">
      <div class="form-grid">
        <div class="field span-2">
          <label for="e-cuenta">Cuenta</label>
          <select id="e-cuenta" v-model="cuentaId">
            <option :value="null">— Elegir —</option>
            <option v-for="c in cuentasHoja" :key="c.id" :value="c.id">
              {{ c.etiqueta }}
            </option>
          </select>
        </div>
        <div class="field">
          <label for="e-periodo">Periodo</label>
          <select id="e-periodo" v-model="periodoId">
            <option :value="null">— Elegir —</option>
            <option v-for="p in opcionesPeriodo" :key="p.id" :value="p.id">
              {{ p.etiqueta }}
            </option>
          </select>
        </div>
        <div class="field">
          <label for="e-monto">Monto</label>
          <input id="e-monto" v-model.number="monto" type="number" min="0" />
        </div>
        <div class="field span-2">
          <label for="e-descripcion">Descripción</label>
          <input id="e-descripcion" v-model="descripcion" type="text" />
        </div>
        <div class="field span-2">
          <label for="e-referencia">Referencia / comprobante</label>
          <input id="e-referencia" v-model="referencia" type="text" />
        </div>
      </div>

      <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>

      <template #foot>
        <button type="button" class="btn btn--ghost" @click="emit('cerrar')">Cancelar</button>
        <button type="button" class="btn btn--primary" :disabled="guardando" @click="guardar">
          {{ guardando ? 'Registrando…' : 'Registrar movimiento' }}
        </button>
      </template>
    </UiDrawer>
  </div>
</template>
