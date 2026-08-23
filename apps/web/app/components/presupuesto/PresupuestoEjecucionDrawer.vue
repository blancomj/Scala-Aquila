<script setup lang="ts">
// Drawer "Registrar movimiento" (E9) — mismo criterio que PresupuestoRubroDrawer.vue: solo
// cuentas hoja (guard_presupuesto_ejecucion_cuenta rechaza cualquier otra), USelect para
// periodo (lista corta, no necesita búsqueda). Contenido en Nuxt UI (23-08-2026).
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
  return [
    { label: '— Elegir —', value: null },
    ...presupuestoStore.cuentas
      .filter((c) => c.es_hoja)
      .map((c) => ({ value: c.id, label: `${rutaNombres(c)} (${c.naturaleza})` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ]
})

const opcionesPeriodo = computed(() => [
  { label: '— Elegir —', value: null },
  ...liquidacionStore.periodos
    .slice()
    .sort((a, b) => b.anio - a.anio || b.mes - a.mes)
    .map((p) => ({ value: p.id, label: `${p.anio}-${String(p.mes).padStart(2, '0')} (${p.estado})` })),
])

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
      <div class="space-y-4 text-sm">
        <UFormField label="Cuenta" name="cuenta_id">
          <USelect v-model="cuentaId" :items="cuentasHoja" value-key="value" class="w-full" />
        </UFormField>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Periodo" name="periodo_id">
            <USelect v-model="periodoId" :items="opcionesPeriodo" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Monto" name="monto">
            <UInput v-model.number="monto" type="number" min="0" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Descripción" name="descripcion">
          <UInput v-model="descripcion" type="text" class="w-full" />
        </UFormField>
        <UFormField label="Referencia / comprobante" name="referencia">
          <UInput v-model="referencia" type="text" class="w-full" />
        </UFormField>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="guardando" @click="guardar">Registrar movimiento</UButton>
      </template>
    </UiDrawer>
  </div>
</template>
