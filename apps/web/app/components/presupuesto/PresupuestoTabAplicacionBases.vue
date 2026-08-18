<script setup lang="ts">
// Pestaña "Aplicación de Bases" — traslado directo de la sección
// "Previsualizar distribución" que ya vivía inline en presupuesto/
// index.vue (Fase GAP-19): simula el reparto por coeficiente sin
// liquidar nada, vía la Edge Function presupuesto-previsualizar. Cero
// lógica nueva, solo reubicación bajo su propia pestaña.
//
// También incluye "Fuentes de financiación" (E7): es el insumo directo
// de la previsualización (netea "otros ingresos" contra el total antes
// de repartir), así que vive aquí en vez de en una pestaña aparte que el
// diseño de 7 pestañas no contempla.
const props = defineProps<{ presupuestoId: string | null }>()

const presupuestoStore = usePresupuestoStore()
const fundamentoStore = useFundamentoNormativoStore()

const previsualizacion = ref<Awaited<
  ReturnType<typeof presupuestoStore.previsualizarDistribucion>
> | null>(null)
const previsualizando = ref(false)
const errorPrevisualizacion = ref<string | null>(null)
const drawerFuenteAbierto = ref(false)

watch(
  () => props.presupuestoId,
  async (id) => {
    previsualizacion.value = null
    errorPrevisualizacion.value = null
    if (id) await presupuestoStore.cargarFuentesFinanciacion(id)
  },
  { immediate: true },
)

onMounted(() => {
  if (fundamentoStore.fundamentos.length === 0) fundamentoStore.cargarFundamentos()
})

const fundamentoPorId = computed(
  () => new Map(fundamentoStore.fundamentos.map((f) => [f.id, f.norma])),
)

function onFuenteCreada(): void {
  drawerFuenteAbierto.value = false
}

function formatoMoneda(valor: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(valor))
}

async function previsualizar(): Promise<void> {
  errorPrevisualizacion.value = null
  const presupuestoId = props.presupuestoId
  if (!presupuestoId) return

  previsualizando.value = true
  try {
    previsualizacion.value = await presupuestoStore.previsualizarDistribucion(presupuestoId)
  } catch (excepcion) {
    errorPrevisualizacion.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo previsualizar la distribución.'
  } finally {
    previsualizando.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-lg font-semibold">Fuentes de financiación</h2>
        <UButton size="xs" @click="drawerFuenteAbierto = true">Registrar fuente</UButton>
      </div>
      <UiTabla
        :columnas="[
          { clave: 'tipo', etiqueta: 'Tipo' },
          { clave: 'disponible', etiqueta: 'Disponible' },
          { clave: 'aplicado', etiqueta: 'Aplicado' },
          { clave: 'descripcion', etiqueta: 'Descripción' },
          { clave: 'fundamento', etiqueta: 'Fundamento' },
        ]"
        :filas="presupuestoStore.fuentes"
        :clave-fila="(fuente) => fuente.id"
        vacio="Ninguna."
      >
        <template #celda-tipo="{ fila }">{{ fila.tipo }}</template>
        <template #celda-disponible="{ fila }">{{ formatoMoneda(fila.valor_disponible) }}</template>
        <template #celda-aplicado="{ fila }">{{ formatoMoneda(fila.valor_aplicado) }}</template>
        <template #celda-descripcion="{ fila }"
          ><span class="text-gray-500">{{ fila.descripcion ?? '—' }}</span></template
        >
        <template #celda-fundamento="{ fila }">
          <span class="text-gray-500">
            {{
              fila.fundamento_normativo_id ? fundamentoPorId.get(fila.fundamento_normativo_id) : '—'
            }}
          </span>
        </template>
      </UiTabla>
    </div>

    <div>
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-lg font-semibold">Aplicación de bases</h2>
        <UButton size="xs" variant="soft" :loading="previsualizando" @click="previsualizar">
          Previsualizar
        </UButton>
      </div>
      <p class="text-sm text-gray-500 mb-2">
        Simula cómo quedaría el reparto por coeficiente sin liquidar nada — netea las fuentes de
        tipo "otros ingresos" contra el total antes de repartir.
      </p>

      <UAlert
        v-if="errorPrevisualizacion"
        color="error"
        variant="soft"
        :title="errorPrevisualizacion"
      />

      <template v-if="previsualizacion">
        <p class="text-sm mb-2">
          Necesidad financiera:
          <span class="font-medium">{{
            formatoMoneda(previsualizacion.necesidad_financiera)
          }}</span>
          <span class="text-gray-500">
            ({{ formatoMoneda(previsualizacion.monto_total) }} − otros ingresos
            {{ formatoMoneda(previsualizacion.otros_ingresos_aplicados) }})
          </span>
        </p>
        <UiTabla
          :columnas="[
            { clave: 'inmueble', etiqueta: 'Inmueble' },
            { clave: 'coeficiente', etiqueta: 'Coeficiente' },
            { clave: 'valorAsignado', etiqueta: 'Valor asignado' },
          ]"
          :filas="previsualizacion.distribucion"
          :clave-fila="(fila) => fila.inmueble_id"
          vacio="Sin distribución para este presupuesto."
        >
          <template #celda-inmueble="{ fila }">{{ fila.codigo }}</template>
          <template #celda-coeficiente="{ fila }"
            ><span class="text-gray-500">{{ fila.coeficiente ?? '—' }}</span></template
          >
          <template #celda-valorAsignado="{ fila }">{{
            formatoMoneda(fila.valor_asignado)
          }}</template>
        </UiTabla>
      </template>
    </div>

    <PresupuestoFuenteDrawer
      v-if="drawerFuenteAbierto && presupuestoId"
      :presupuesto-id="presupuestoId"
      @cerrar="drawerFuenteAbierto = false"
      @creado="onFuenteCreada"
    />
  </div>
</template>
