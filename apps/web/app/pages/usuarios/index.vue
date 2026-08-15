<script setup lang="ts">
// E5 (invitar) + E6 (gestión de miembros: cambiar rol, revocar). Placeholder
// de UI mínimo — suficiente para probar el flujo completo, no el diseño
// final de la pantalla de usuarios.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'users:manage' })

const tenantStore = useTenantStore()
const invitationsStore = useInvitationsStore()
const membersStore = useMembersStore()
const authStore = useAuthStore()

const email = ref('')
const role = ref<'agent' | 'auditor'>('auditor')
const cargando = ref(false)
const error = ref<string | null>(null)
const exito = ref<string | null>(null)
const errorMiembros = ref<string | null>(null)

await useAsyncData('invitaciones-pendientes', () => {
  const tenantId = tenantStore.activeTenant?.id
  return tenantId ? invitationsStore.cargarPendientes(tenantId) : Promise.resolve([])
})
await useAsyncData('miembros-activos', () => {
  const tenantId = tenantStore.activeTenant?.id
  return tenantId ? membersStore.cargarMiembros(tenantId) : Promise.resolve([])
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
    error.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo enviar la invitación.'
  } finally {
    cargando.value = false
  }
}

async function revocarInvitacion(invitationId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await invitationsStore.revocar(invitationId, tenantId)
}

async function cambiarRolMiembro(
  membershipId: string,
  nuevoRol: 'agent' | 'auditor',
): Promise<void> {
  errorMiembros.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  try {
    await membersStore.cambiarRol(membershipId, nuevoRol, tenantId)
  } catch (excepcion) {
    errorMiembros.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo cambiar el rol.'
  }
}

async function revocarMiembro(membershipId: string): Promise<void> {
  errorMiembros.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  try {
    await membersStore.revocar(membershipId, tenantId)
  } catch (excepcion) {
    errorMiembros.value = excepcion instanceof Error ? excepcion.message : 'No se pudo revocar.'
  }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Miembros</h1>
      <UAlert
        v-if="errorMiembros"
        color="error"
        variant="soft"
        :title="errorMiembros"
        class="mb-2"
      />
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
            <th class="py-1 font-medium">Correo</th>
            <th class="py-1 font-medium">Rol</th>
            <th class="py-1 font-medium" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="miembro in membersStore.miembros"
            :key="miembro.id"
            class="border-b border-gray-100 dark:border-gray-900"
          >
            <td class="py-1.5">{{ miembro.profile?.email ?? miembro.user_id }}</td>
            <td class="py-1.5">
              <select
                :value="miembro.role"
                :disabled="miembro.user_id === authStore.profile?.id"
                class="rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-1.5 py-1 text-sm"
                @change="
                  cambiarRolMiembro(
                    miembro.id,
                    ($event.target as HTMLSelectElement).value as 'agent' | 'auditor',
                  )
                "
              >
                <option value="agent">agent</option>
                <option value="auditor">auditor</option>
              </select>
            </td>
            <td class="py-1.5 text-right">
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                :disabled="miembro.user_id === authStore.profile?.id"
                @click="revocarMiembro(miembro.id)"
              >
                Revocar
              </UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Invitar usuario</h2>

      <form class="space-y-4 max-w-sm" @submit.prevent="invitar">
        <UFormField label="Correo electrónico" name="email">
          <UInput v-model="email" type="email" required class="w-full" />
        </UFormField>

        <UFormField label="Rol" name="role">
          <select
            v-model="role"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
          >
            <option value="agent">Administrador (agent)</option>
            <option value="auditor">Auditor (auditor)</option>
          </select>
        </UFormField>

        <UAlert v-if="error" color="error" variant="soft" :title="error" />
        <UAlert v-if="exito" color="success" variant="soft" :title="exito" />

        <UButton type="submit" :loading="cargando">Invitar</UButton>
      </form>
    </div>

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
          <UButton size="xs" variant="ghost" color="error" @click="revocarInvitacion(invitacion.id)"
            >Revocar</UButton
          >
        </li>
      </ul>
    </div>
  </div>
</template>
