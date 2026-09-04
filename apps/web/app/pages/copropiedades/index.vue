<script setup lang="ts">
// Mis copropiedades — lista de las copropiedades que administra el usuario
// actual (memberships activas), inspirada en el patrón "Tenants" de
// Buildium pero mapeada al dominio real: no hay unit/resident-center aquí,
// solo identidad de la copropiedad + el rol del usuario en cada una. Reutiliza
// tenantStore.memberships (misma key 'memberships' que layouts/default.vue,
// Nuxt dedupe evita una segunda consulta) — no crea un store nuevo ni toca
// platform_tenant_overview (esa vista es SOLO para is_platform_admin, SEC-10,
// ver supabase/migrations/20260813190500_platform_view.sql).
definePageMeta({ layout: 'default' })

const tenantStore = useTenantStore()

await useAsyncData('memberships', () => tenantStore.cargarMemberships())

const ESTADO_LABEL: Record<string, string> = {
  active: 'Activa',
  suspended: 'Suspendida',
  deleted: 'Eliminada',
}

const cambiandoA = ref<string | null>(null)
const error = ref<string | null>(null)

async function irACopropiedad(tenantId: string): Promise<void> {
  error.value = null
  cambiandoA.value = tenantId
  try {
    await tenantStore.cambiarTenant(tenantId)
    // Recarga completa, no router.push: mismo motivo que NavTenantSwitcher.vue
    // — evita instantáneas viejas en stores de otros dominios que no se
    // invalidan al cambiar de copropiedad. /dashboard muestra el checklist de
    // onboarding inline si esa copropiedad todavía no lo completó.
    window.location.href = '/dashboard'
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cambiar de copropiedad.')
    cambiandoA.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold mb-2">Mis copropiedades</h1>
        <p class="text-sm text-neutral-500">
          Copropiedades donde tienes una membresía activa. Elige una para entrar.
        </p>
      </div>
      <UButton to="/onboarding/create-tenant" icon="i-lucide-plus">Crear copropiedad</UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <div v-if="tenantStore.memberships.length === 0" class="space-y-3">
      <p class="text-neutral-500 text-sm">No perteneces a ninguna copropiedad todavía.</p>
      <UButton to="/onboarding/create-tenant" icon="i-lucide-plus">Crear copropiedad</UButton>
    </div>
    <UiTabla
      v-else
      :columnas="[
        { clave: 'nombre', etiqueta: 'Nombre' },
        { clave: 'nit', etiqueta: 'NIT' },
        { clave: 'direccion', etiqueta: 'Dirección' },
        { clave: 'rol', etiqueta: 'Mi rol' },
        { clave: 'estado', etiqueta: 'Estado' },
      ]"
      :filas="tenantStore.memberships"
      :clave-fila="(membresia) => membresia.tenant_id"
    >
      <template #celda-nombre="{ fila }">
        <button
          type="button"
          class="text-primary hover:underline disabled:no-underline disabled:opacity-50"
          :disabled="cambiandoA === fila.tenant_id || fila.tenant.status !== 'active'"
          :title="fila.tenant.status !== 'active' ? `No puedes entrar a una copropiedad ${ESTADO_LABEL[fila.tenant.status]?.toLowerCase() ?? fila.tenant.status}` : undefined"
          @click="irACopropiedad(fila.tenant_id)"
        >
          {{ fila.tenant.name }}
        </button>
      </template>
      <template #celda-nit="{ fila }"><span class="text-neutral-500">{{ fila.tenant.nit ?? '—' }}</span></template>
      <template #celda-direccion="{ fila }"><span class="text-neutral-500">{{ fila.tenant.direccion ?? '—' }}</span></template>
      <template #celda-rol="{ fila }"><span class="text-neutral-500 capitalize">{{ fila.role }}</span></template>
      <template #celda-estado="{ fila }">
        <span class="text-neutral-500">{{ ESTADO_LABEL[fila.tenant.status] ?? fila.tenant.status }}</span>
      </template>
    </UiTabla>
  </div>
</template>
