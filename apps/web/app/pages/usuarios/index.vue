<script setup lang="ts">
// Placeholder mínimo para probar invite-user/revoke-invitation de punta a
// punta (E5) — la gestión completa de usuarios (editar rol, revocar
// membership existente) es dominio de una rebanada posterior.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'users:invite' })

const tenantStore = useTenantStore()
const invitationsStore = useInvitationsStore()

const email = ref('')
const role = ref<'agent' | 'auditor'>('auditor')
const cargando = ref(false)
const error = ref<string | null>(null)
const exito = ref<string | null>(null)

await useAsyncData('invitaciones-pendientes', () => {
  const tenantId = tenantStore.activeTenant?.id
  return tenantId ? invitationsStore.cargarPendientes(tenantId) : Promise.resolve([])
})

async function invitar(): Promise<void> {
  error.value = null
  exito.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  cargando.value = true
  try {
    await invitationsStore.invitar(tenantId, email.value, role.value)
    exito.value = `Invitación enviada a ${email.value}.`
    email.value = ''
  } catch (excepcion) {
    error.value = excepcion instanceof Error ? excepcion.message : 'No se pudo enviar la invitación.'
  } finally {
    cargando.value = false
  }
}

async function revocar(invitationId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await invitationsStore.revocar(invitationId, tenantId)
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold">Invitar usuario</h1>

    <form class="space-y-4 max-w-sm" @submit.prevent="invitar">
      <UFormField label="Correo electrónico" name="email">
        <UInput v-model="email" type="email" required class="w-full" />
      </UFormField>

      <UFormField label="Rol" name="role">
        <select v-model="role" class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5">
          <option value="agent">Administrador (agent)</option>
          <option value="auditor">Auditor (auditor)</option>
        </select>
      </UFormField>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />
      <UAlert v-if="exito" color="success" variant="soft" :title="exito" />

      <UButton type="submit" :loading="cargando">Invitar</UButton>
    </form>

    <div>
      <h2 class="text-lg font-semibold mb-2">Invitaciones pendientes</h2>
      <p v-if="invitationsStore.pendientes.length === 0" class="text-gray-500 text-sm">Ninguna.</p>
      <ul v-else class="space-y-2">
        <li
          v-for="invitacion in invitationsStore.pendientes"
          :key="invitacion.id"
          class="flex items-center justify-between text-sm border-b border-gray-200 dark:border-gray-800 pb-2"
        >
          <span>{{ invitacion.email }} — {{ invitacion.role }}</span>
          <UButton size="xs" variant="ghost" color="error" @click="revocar(invitacion.id)">Revocar</UButton>
        </li>
      </ul>
    </div>
  </div>
</template>
