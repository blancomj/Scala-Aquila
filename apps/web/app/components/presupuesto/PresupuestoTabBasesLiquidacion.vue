<script setup lang="ts">
// Pestaña "Bases de Liquidación" — cross-link, no una funcionalidad
// nueva. El término "bases de liquidación" no existe en el sistema real;
// lo que hoy calcula y factura cada cobro son los Conceptos (fórmulas
// AEL, ya tienen su propio módulo completo en /conceptos). Esta pestaña
// solo lista los conceptos vigentes (estado='activo') de solo lectura y
// enlaza al módulo real — decisión ya tomada, no se reimplementa nada
// de /conceptos aquí.
const tenantStore = useTenantStore()
const conceptoStore = useConceptoStore()

const cargando = ref(false)

onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || conceptoStore.conceptos.length > 0) return
  cargando.value = true
  try {
    await conceptoStore.cargarConceptos(tenantId)
  } finally {
    cargando.value = false
  }
})

const conceptosActivos = computed(() =>
  conceptoStore.conceptos.filter((c) => c.estado === 'activo'),
)
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-lg border border-gray-200 dark:border-gray-800 p-4 flex items-start gap-4">
      <div>
        <h2 class="text-lg font-semibold mb-1">Bases de liquidación</h2>
        <p class="text-sm text-gray-500 mb-3">
          Lo que este mockup llama "bases de liquidación" corresponde, en el sistema real, a los
          <strong>conceptos de cobro</strong>: reglas AEL que determinan cómo se calcula y factura
          cada ítem. Ya tienen su propio editor de fórmulas, pruebas, versionado y publicación en el
          Motor de Conceptos.
        </p>
        <UButton to="/conceptos" size="xs">Ir a Conceptos de cobro →</UButton>
      </div>
    </div>

    <div>
      <h3 class="text-sm font-medium mb-2">Conceptos vigentes</h3>
      <UiTabla
        :columnas="[
          { clave: 'codigo', etiqueta: 'Código' },
          { clave: 'nombre', etiqueta: 'Nombre' },
          { clave: 'tipoBase', etiqueta: 'Tipo base' },
          { clave: 'modoCalculo', etiqueta: 'Modo de cálculo' },
        ]"
        :filas="conceptosActivos"
        :clave-fila="(fila) => fila.id"
        :vacio="cargando ? 'Cargando…' : 'Esta copropiedad todavía no tiene conceptos activos.'"
      >
        <template #celda-codigo="{ fila }">{{ fila.codigo }}</template>
        <template #celda-nombre="{ fila }">{{ fila.nombre }}</template>
        <template #celda-tipoBase="{ fila }"
          ><span class="text-gray-500">{{ fila.tipo_base }}</span></template
        >
        <template #celda-modoCalculo="{ fila }"
          ><span class="text-gray-500">{{ fila.modo_calculo }}</span></template
        >
      </UiTabla>
    </div>
  </div>
</template>
