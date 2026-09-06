<script setup lang="ts">
// MANT-1 §3.7: lista mínima de activos — MANT-0 no construyó esta pantalla (ver "Qué NO se
// implementó" en MANT_01_INFORME.md); se agrega aquí lo justo para llegar a la ficha y su
// pestaña Técnico, no un CRUD completo de todos los campos de MANT-0.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const activosStore = useActivosStore()

const tipos = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const nombreTipo = computed(() => new Map(tipos.value.map((t) => [t.id, t.nombre])))

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    activosStore.cargarActivos(tenantId),
    cargarListaTipos(tenantId, 'TIPO_ACTIVO').then((data) => { tipos.value = data }),
  ])
}

onMounted(cargar)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Activos</h1>
        </template>
        <template #descripcion>
          Atributos técnicos y criticidad de cada activo (MANT-1). El registro completo del
          activo (ficha contable, ciclo de vida, depreciación) se gestiona por ahora vía datos.
        </template>
      </UiTituloDescripcion>
      <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="activosStore.loading" @click="cargar()">
        Actualizar
      </UButton>
    </div>

    <div class="rounded-lg border border-default divide-y divide-default">
      <NuxtLink
        v-for="a in activosStore.activos" :key="a.id" :to="`/mantenimiento/activos/${a.id}`"
        class="flex items-center justify-between gap-4 p-3 hover:bg-elevated transition-colors"
      >
        <div>
          <p class="font-medium">{{ a.nombre }}</p>
          <p class="text-sm text-muted">{{ a.codigo }} · {{ nombreTipo.get(a.tipo_id) ?? '—' }}</p>
        </div>
        <UBadge variant="soft" size="sm" class="capitalize">{{ a.estado.replace('_', ' ') }}</UBadge>
      </NuxtLink>
      <p v-if="activosStore.activos.length === 0 && !activosStore.loading" class="p-6 text-sm text-muted text-center">
        Sin activos registrados.
      </p>
    </div>
  </div>
</template>
