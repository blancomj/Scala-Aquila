<script setup lang="ts">
// E5 (invitar) + E6 (gestión de miembros: editar perfil, revocar, reenviar
// invitación). Una sola tabla: miembros activos e invitaciones pendientes
// mezclados (fila.tipo distingue cuál es cuál para decidir qué acciones
// mostrar) — decisión explícita del usuario, antes eran dos tablas
// separadas. Crear/editar vive en MiembroDrawer.vue.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'users:manage' })

const tenantStore = useTenantStore()
const invitationsStore = useInvitationsStore()
const membersStore = useMembersStore()
const authStore = useAuthStore()

type EstadoFila = 'activo' | 'inactivo' | 'por_confirmar'

interface FilaUsuario {
  id: string
  tipo: 'miembro' | 'invitacion'
  correo: string
  nombre: string | null
  telefono: string | null
  rol: string
  estado: EstadoFila
  vigencia: string | null
  esPropia: boolean
}

const ESTADO_ETIQUETA: Record<EstadoFila, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  por_confirmar: 'Por confirmar',
}
const ESTADO_COLOR: Record<EstadoFila, 'success' | 'neutral' | 'warning'> = {
  activo: 'success',
  inactivo: 'neutral',
  por_confirmar: 'warning',
}

const filasUsuarios = computed<FilaUsuario[]>(() => [
  ...membersStore.miembros.map((miembro) => ({
    id: miembro.id,
    tipo: 'miembro' as const,
    correo: miembro.profile?.email ?? miembro.user_id,
    nombre: miembro.profile?.full_name ?? null,
    telefono: miembro.profile?.phone ?? null,
    rol: miembro.role,
    estado: (miembro.profile?.status === 'suspended' ? 'inactivo' : 'activo') as EstadoFila,
    vigencia: null,
    esPropia: miembro.user_id === authStore.profile?.id,
  })),
  ...invitationsStore.pendientes.map((invitacion) => ({
    id: invitacion.id,
    tipo: 'invitacion' as const,
    correo: invitacion.email,
    nombre: null,
    telefono: null,
    rol: invitacion.role,
    estado: 'por_confirmar' as EstadoFila,
    vigencia: new Date(invitacion.expires_at).toLocaleString(),
    esPropia: false,
  })),
])

const error = ref<string | null>(null)
const reenviandoId = ref<string | null>(null)

const drawerAbierto = ref(false)
const membresiaEditando = ref<string | undefined>(undefined)

await useAsyncData('invitaciones-pendientes', () => {
  const tenantId = tenantStore.activeTenant?.id
  return tenantId ? invitationsStore.cargarPendientes(tenantId) : Promise.resolve([])
})
await useAsyncData('miembros-activos', () => {
  const tenantId = tenantStore.activeTenant?.id
  return tenantId ? membersStore.cargarMiembros(tenantId) : Promise.resolve([])
})

function abrirInvitar(): void {
  membresiaEditando.value = undefined
  drawerAbierto.value = true
}

function abrirEditar(membershipId: string): void {
  membresiaEditando.value = membershipId
  drawerAbierto.value = true
}

function cerrarDrawer(): void {
  drawerAbierto.value = false
}

async function revocarInvitacion(invitationId: string): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  try {
    await invitationsStore.revocar(invitationId, tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo revocar la invitación.')
  }
}

async function reenviarInvitacion(invitationId: string): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  reenviandoId.value = invitationId
  try {
    await invitationsStore.reenviar(invitationId, tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo reenviar la invitación.')
  } finally {
    reenviandoId.value = null
  }
}

async function revocarMiembro(membershipId: string): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  try {
    await membersStore.revocar(membershipId, tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo revocar.')
  }
}
</script>

<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold mb-2">Miembros</h1>
        <p class="text-sm text-neutral-500">Usuarios con acceso a esta copropiedad.</p>
      </div>
      <UButton @click="abrirInvitar">Invitar usuario</UButton>
    </div>

    <div>
      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mb-2" />
      <UiTabla
        :columnas="[
          { clave: 'correo', etiqueta: 'Correo' },
          { clave: 'nombre', etiqueta: 'Nombre' },
          { clave: 'telefono', etiqueta: 'Teléfono' },
          { clave: 'rol', etiqueta: 'Rol' },
          { clave: 'estado', etiqueta: 'Estado' },
          { clave: 'acciones', etiqueta: '' },
        ]"
        :filas="filasUsuarios"
        :clave-fila="(fila) => `${fila.tipo}-${fila.id}`"
      >
        <template #celda-correo="{ fila }">{{ fila.correo }}</template>
        <template #celda-nombre="{ fila }">
          <span class="text-neutral-500">{{ fila.nombre ?? '—' }}</span>
        </template>
        <template #celda-telefono="{ fila }">
          <span class="text-neutral-500">{{ fila.telefono ?? '—' }}</span>
        </template>
        <template #celda-rol="{ fila }"><span class="text-neutral-500">{{ fila.rol }}</span></template>
        <template #celda-estado="{ fila }">
          <div class="flex flex-col items-start gap-0.5">
            <UBadge :color="ESTADO_COLOR[fila.estado]" variant="subtle" size="sm">
              {{ ESTADO_ETIQUETA[fila.estado] }}
            </UBadge>
            <span v-if="fila.vigencia" class="text-xs text-neutral-500">Vence {{ fila.vigencia }}</span>
          </div>
        </template>
        <template #celda-acciones="{ fila }">
          <div class="flex justify-end gap-2">
            <template v-if="fila.tipo === 'miembro'">
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-pencil"
                :disabled="fila.esPropia"
                :title="fila.esPropia ? 'No puedes editar tu propia membresía' : undefined"
                @click="abrirEditar(fila.id)"
              >
                Editar
              </UButton>
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-user-x"
                :disabled="fila.esPropia"
                :title="fila.esPropia ? 'No puedes revocar tu propia membresía' : undefined"
                @click="revocarMiembro(fila.id)"
              >
                Revocar
              </UButton>
            </template>
            <template v-else>
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-send"
                :loading="reenviandoId === fila.id"
                @click="reenviarInvitacion(fila.id)"
              >
                Reenviar
              </UButton>
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-x"
                @click="revocarInvitacion(fila.id)"
              >
                Revocar
              </UButton>
            </template>
          </div>
        </template>
      </UiTabla>
    </div>

    <UsuariosMiembroDrawer
      v-if="drawerAbierto"
      :membresia-id="membresiaEditando"
      @cerrar="cerrarDrawer"
      @guardado="cerrarDrawer"
    />
  </div>
</template>
