<script setup lang="ts">
// Pestaña "Simulación de cobro" — antes "Aplicación de bases". Simula cómo
// quedaría el reparto por coeficiente sin liquidar nada, vía la Edge
// Function presupuesto-previsualizar (cero lógica nueva, mismo
// presupuestoStore.previsualizarDistribucion). "Fuentes de financiación"
// se separó a su propia pestaña (PresupuestoTabFuentes.vue) — mockup
// "Libro Presupuestal".
//
// La cuota mensual (valor_asignado / 12) es una estimación de presentación
// para esta simulación puntual, no el cálculo real de liquidación — el
// doble redondeo anual→mensual real (PLAN_MAESTRO §6.5, residuo
// redistribuido para que Σ 12 cuotas = monto anual exacto) solo lo aplica
// liquidar-periodo contra un periodo real. Se etiqueta "estimada" para no
// confundir una con otra.
const props = defineProps<{ presupuestoId: string | null }>()

const presupuestoStore = usePresupuestoStore()

const previsualizacion = ref<Awaited<
  ReturnType<typeof presupuestoStore.previsualizarDistribucion>
> | null>(null)
const previsualizando = ref(false)
const errorPrevisualizacion = ref<string | null>(null)

watch(
  () => props.presupuestoId,
  () => {
    previsualizacion.value = null
    errorPrevisualizacion.value = null
  },
  { immediate: true },
)


function cuotaMensualEstimada(valorAnual: string | number): number {
  return Number(valorAnual) / 12
}

async function previsualizar(): Promise<void> {
  errorPrevisualizacion.value = null
  const presupuestoId = props.presupuestoId
  if (!presupuestoId) return

  previsualizando.value = true
  try {
    previsualizacion.value = await presupuestoStore.previsualizarDistribucion(presupuestoId)
  } catch (excepcion) {
    errorPrevisualizacion.value = mensajeError(excepcion, 'No se pudo previsualizar la distribución.')
  } finally {
    previsualizando.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold">Simulación de cobro</h2>
        <p class="text-sm text-neutral-500">
          Cómo quedaría la cuota de cada unidad con la estructura actual — no liquida ni cobra
          nada todavía.
        </p>
      </div>
      <UButton size="xs" :loading="previsualizando" @click="previsualizar">
        {{ previsualizacion ? 'Actualizar simulación' : 'Simular' }}
      </UButton>
    </div>

    <UAlert v-if="errorPrevisualizacion" color="error" variant="soft" :title="errorPrevisualizacion" />

    <p v-if="!previsualizacion && !errorPrevisualizacion" class="text-sm text-neutral-500">
      Pulsa "Simular" para ver la necesidad financiera y la cuota estimada por unidad con los
      rubros y fuentes registrados hasta ahora.
    </p>

    <template v-if="previsualizacion">
      <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/20 p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-xs text-neutral-500 uppercase tracking-wide mb-1">Necesidad financiera anual</p>
          <p class="text-2xl font-semibold tabular-nums">
            {{ formatoMoneda(previsualizacion.necesidad_financiera) }}
          </p>
        </div>
        <p class="text-xs text-neutral-500 tabular-nums">
          {{ formatoMoneda(previsualizacion.monto_total) }} − otros ingresos
          {{ formatoMoneda(previsualizacion.otros_ingresos_aplicados) }}
        </p>
      </div>

      <UiTabla
        :columnas="[
          { clave: 'inmueble', etiqueta: 'Inmueble' },
          { clave: 'coeficiente', etiqueta: 'Coeficiente', alinear: 'derecha' },
          { clave: 'valorAsignado', etiqueta: 'Valor anual asignado', alinear: 'derecha' },
          { clave: 'cuotaMensual', etiqueta: 'Cuota mensual (estimada)', alinear: 'derecha' },
        ]"
        :filas="previsualizacion.distribucion"
        :clave-fila="(fila) => fila.inmueble_id"
        vacio="Sin distribución para este presupuesto."
      >
        <template #celda-inmueble="{ fila }">{{ fila.codigo }}</template>
        <template #celda-coeficiente="{ fila }"
          ><span class="text-neutral-500 tabular-nums">{{ fila.coeficiente ?? '—' }}</span></template
        >
        <template #celda-valorAsignado="{ fila }">
          <span class="tabular-nums">{{ formatoMoneda(fila.valor_asignado) }}</span>
        </template>
        <template #celda-cuotaMensual="{ fila }">
          <span class="font-medium tabular-nums">{{ formatoMoneda(cuotaMensualEstimada(fila.valor_asignado)) }}</span>
        </template>
      </UiTabla>

      <p class="text-xs text-neutral-500">
        La cuota mensual es un estimado (valor anual ÷ 12) para esta simulación — el cálculo real
        de liquidación redistribuye el residuo del redondeo para que la suma de las 12 cuotas
        cuadre exacto con el valor anual.
      </p>
    </template>
  </div>
</template>
