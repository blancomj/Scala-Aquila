<script setup lang="ts">
// Pestaña "Conceptos" — catálogo liviano (lista + editar/archivar +
// nuevo). El editor de fórmulas AEL (texto/bloques/IR, pruebas, versiones)
// no cabe razonablemente en una pestaña — vive en páginas propias
// (/conceptos/nuevo, /conceptos/[id]), ver ConceptosEditor.vue. El flujo
// completo de maker-checker (enviar a revisión/aprobar/rechazar/volver a
// borrador — AEL-004 Fase 4) también se movió a esas páginas, ligado al
// concepto que se está editando; aquí solo queda la acción rápida
// "Archivar" (disponible en borrador/activo, mismo criterio que
// conceptoEsSeleccionable() en la versión anterior de esta pantalla). Las
// acciones en lote (selección múltiple) se retiraron: no tenían sentido
// ya con la lista reducida a editar/archivar/nuevo.
const tenantStore = useTenantStore()
const conceptoStore = useConceptoStore()

const cargando = ref(false)
const cambiandoEstadoId = ref<string | null>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargando.value = true
  try {
    await conceptoStore.cargarConceptos(tenantId)
  } finally {
    cargando.value = false
  }
})

function editar(id: string): void {
  navigateTo(`/conceptos/${id}`)
}

function nuevo(): void {
  navigateTo('/conceptos/nuevo')
}

function esArchivable(concepto: (typeof conceptoStore.conceptos)[number]): boolean {
  return concepto.estado === 'borrador' || concepto.estado === 'activo'
}

async function archivar(concepto: (typeof conceptoStore.conceptos)[number]): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  cambiandoEstadoId.value = concepto.id
  try {
    await conceptoStore.cambiarEstado(concepto.id, 'archivado', tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo archivar.')
  } finally {
    cambiandoEstadoId.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <NuxtLink to="/conceptos/dependencias" class="text-sm text-primary hover:underline">
        Dependencias e impacto →
      </NuxtLink>
      <UButton size="sm" @click="nuevo">Nuevo concepto</UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <p v-if="cargando && conceptoStore.conceptos.length === 0" class="text-gray-500 text-sm">
      Cargando…
    </p>
    <p v-else-if="conceptoStore.conceptos.length === 0" class="text-gray-500 text-sm">
      Esta copropiedad todavía no tiene conceptos registrados.
    </p>
    <UiTabla
      v-else
      :columnas="[
        { clave: 'codigo', etiqueta: 'Código' },
        { clave: 'nombre', etiqueta: 'Nombre' },
        { clave: 'modo', etiqueta: 'Modo' },
        { clave: 'valor', etiqueta: 'Valor' },
        { clave: 'estado', etiqueta: 'Estado' },
        { clave: 'acciones', etiqueta: '' },
      ]"
      :filas="conceptoStore.conceptos"
      :clave-fila="(concepto) => concepto.id"
    >
      <template #celda-codigo="{ fila }">{{ fila.codigo }}</template>
      <template #celda-nombre="{ fila }">{{ fila.nombre }}</template>
      <template #celda-modo="{ fila }"><span class="text-gray-500">{{ fila.modo_calculo }}</span></template>
      <template #celda-valor="{ fila }">
        <UBadge :color="fila.modo_valor === 'fijo' ? 'warning' : 'neutral'" variant="subtle">
          {{ fila.modo_valor === 'fijo' ? 'Fijo' : 'Formulado' }}
        </UBadge>
      </template>
      <template #celda-estado="{ fila }"><span class="text-gray-500">{{ fila.estado }}</span></template>
      <template #celda-acciones="{ fila }">
        <div class="flex justify-end gap-2">
          <UButton size="xs" variant="soft" @click="editar(fila.id)">Editar</UButton>
          <UButton
            v-if="esArchivable(fila)"
            size="xs"
            variant="ghost"
            color="error"
            :loading="cambiandoEstadoId === fila.id"
            @click="archivar(fila)"
          >
            Archivar
          </UButton>
        </div>
      </template>
    </UiTabla>
  </div>
</template>
