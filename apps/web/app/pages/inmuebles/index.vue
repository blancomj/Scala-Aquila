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
    <table v-else class="w-full text-sm">
      <thead>
        <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
          <th class="py-1 font-medium">Código</th>
          <th class="py-1 font-medium">Tipo</th>
          <th class="py-1 font-medium">Estado</th>
          <th class="py-1 font-medium" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="inmueble in cuentaStore.inmuebles"
          :key="inmueble.id"
          class="border-b border-gray-100 dark:border-gray-900"
        >
          <td class="py-1.5">{{ inmueble.codigo }}</td>
          <td class="py-1.5 text-gray-500">{{ nombreTipo(inmueble.tipo_id) }}</td>
          <td class="py-1.5 text-gray-500">{{ inmueble.estado }}</td>
          <td class="py-1.5">
            <UButton size="xs" variant="soft" :to="`/inmuebles/${inmueble.id}`">Ver ficha</UButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
