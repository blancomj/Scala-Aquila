<script setup lang="ts">
// Listado mínimo de inmuebles — primera carpeta de rutas dinámicas del
// proyecto, sin dueño previo que extender (PROMPT_FICHA_INMUEBLE.md §6.4,
// §8.2). Reutiliza cuentaCorriente.ts::cargarInmuebles (Anti-Redundancia,
// ya existía para el selector de "Probar fórmula" en conceptos) en vez de
// duplicar el loader en inmuebles.ts.

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const cuentaStore = useCuentaCorrienteStore()

function nombreTipo(tipoId: number): string {
  return tipos.value?.find((t) => t.id === tipoId)?.nombre ?? '—'
}

// No side effects dentro del handler: useAsyncData solo serializa/hidrata su
// valor de retorno, no refs externas asignadas como efecto secundario (esas
// asignaciones se pierden en la hidratación del cliente porque el handler no
// se re-ejecuta si el payload de SSR ya trae los datos).
const { data: tipos } = await useAsyncData('inmuebles-tipos', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  return cargarListaTipos(tenantId, 'TIPO_INMUEBLE')
})

await useAsyncData('inmuebles-listado', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  return cuentaStore.cargarInmuebles(tenantId)
})
</script>

<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold mb-2">Inmuebles</h1>
        <p class="text-sm text-gray-500">Unidades de la copropiedad — destino de cobro y prorrateo.</p>
      </div>
      <UButton to="/inmuebles/nuevo">Nuevo inmueble</UButton>
    </div>

    <p v-if="cuentaStore.inmuebles.length === 0" class="text-gray-500 text-sm">Ninguno.</p>
    <UiTabla
      v-else
      :columnas="[
        { clave: 'codigo', etiqueta: 'Código' },
        { clave: 'tipo', etiqueta: 'Tipo' },
        { clave: 'estado', etiqueta: 'Estado' },
        { clave: 'acciones', etiqueta: '' },
      ]"
      :filas="cuentaStore.inmuebles"
      :clave-fila="(inmueble) => inmueble.id"
    >
      <template #celda-codigo="{ fila }">{{ fila.codigo }}</template>
      <template #celda-tipo="{ fila }"><span class="text-gray-500">{{ nombreTipo(fila.tipo_id) }}</span></template>
      <template #celda-estado="{ fila }"><span class="text-gray-500">{{ fila.estado }}</span></template>
      <template #celda-acciones="{ fila }">
        <UButton size="xs" variant="soft" :to="`/inmuebles/${fila.id}`">Ver ficha</UButton>
      </template>
    </UiTabla>
  </div>
</template>
