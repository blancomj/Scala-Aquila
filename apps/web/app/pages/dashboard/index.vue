<script setup lang="ts">
// F9: dashboard base con métricas de tenant. Las métricas de dominio
// (presupuesto, cartera, etc.) llegan cuando exista esa capa — por ahora,
// lo único que hay datos reales para mostrar es tenancy/auditoría, que ya
// existen desde E3-E6.
definePageMeta({ layout: 'default', middleware: ['tenant'] })

const usuario = useSupabaseUser()
const authStore = useAuthStore()
const tenantStore = useTenantStore()
const membersStore = useMembersStore()
const auditStore = useAuditStore()
const onboardingStore = useOnboardingStore()

await useAsyncData('perfil', () => authStore.cargarPerfil())
await useAsyncData('memberships', () => tenantStore.cargarMemberships())
await useAsyncData('miembros-activos', () => {
  const tenantId = tenantStore.activeTenant?.id
  return tenantId ? membersStore.cargarMiembros(tenantId) : Promise.resolve([])
})
await useAsyncData('auditoria-reciente', () => {
  const tenantId = tenantStore.activeTenant?.id
  return tenantId ? auditStore.cargarEventos(tenantId, 5) : Promise.resolve([])
})
await useAsyncData('onboarding-checklist', () => {
  const tenantId = tenantStore.activeTenant?.id
  return tenantId ? onboardingStore.cargarEstado(tenantId) : Promise.resolve()
})
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Bienvenido</h1>
      <p class="text-neutral-500">{{ usuario?.email }}</p>
      <p v-if="authStore.profile" class="text-sm text-neutral-400 mt-1">
        {{ authStore.profile.full_name ?? 'Sin nombre registrado' }}
      </p>
      <p v-if="tenantStore.activeTenant" class="text-sm text-neutral-400 mt-1">
        Copropiedad activa: {{ tenantStore.activeTenant.name }} ({{ tenantStore.role }})
      </p>
    </div>

    <DashboardOnboardingChecklist />

    <div class="grid grid-cols-2 gap-4 max-w-md">
      <div class="rounded-md border border-neutral-200 dark:border-neutral-800 p-4">
        <p class="text-sm text-neutral-500">Miembros activos</p>
        <p class="text-2xl font-semibold">{{ membersStore.miembros.length }}</p>
      </div>
      <div class="rounded-md border border-neutral-200 dark:border-neutral-800 p-4">
        <p class="text-sm text-neutral-500">Eventos recientes</p>
        <p class="text-2xl font-semibold">{{ auditStore.eventos.length }}</p>
      </div>
    </div>

    <div>
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-lg font-semibold">Actividad reciente</h2>
        <NuxtLink to="/auditoria" class="text-sm text-primary hover:underline">Ver todo</NuxtLink>
      </div>
      <p v-if="auditStore.eventos.length === 0" class="text-neutral-500 text-sm">
        Sin actividad todavía.
      </p>
      <ul v-else class="space-y-1 text-sm">
        <li
          v-for="evento in auditStore.eventos"
          :key="evento.id"
          class="text-neutral-600 dark:text-neutral-300"
        >
          {{ evento.action }} — {{ new Date(evento.created_at).toLocaleString('es-CO') }}
        </li>
      </ul>
    </div>
  </div>
</template>
