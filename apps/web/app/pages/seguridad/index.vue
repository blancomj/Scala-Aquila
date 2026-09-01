<script setup lang="ts">
// Hub de Seguridad — cierra el vacío de navegación detectado tras
// construir roles funcionales (20260830120000-170000): existían /usuarios
// y /auditoria como páginas sueltas bajo "Administración", sin nada que
// las uniera ni mostrara el catálogo de roles funcionales fuera del
// drawer de cada miembro. No es el constructor genérico de roles/permisos
// del mockup de referencia (decisión explícita: diferido) — es un hub de
// solo lectura sobre lo que ya existe.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'users:manage' })

const tenantStore = useTenantStore()
const membersStore = useMembersStore()

const { status: statusMiembros, error: errorMiembros } = await useAsyncData('seguridad-miembros', () => {
  const tenantId = tenantStore.activeTenant?.id
  return tenantId ? membersStore.cargarMiembros(tenantId) : Promise.resolve([])
})
const { status: statusCatalogo, error: errorCatalogo } = await useAsyncData('seguridad-catalogo', () => membersStore.cargarCatalogoRolesFuncionalesConModulos())

const cargando = computed(() => statusMiembros.value === 'pending' || statusCatalogo.value === 'pending')
const hayError = computed(() => !!errorMiembros.value || !!errorCatalogo.value)
const mensajeError = computed(() => {
  if (errorMiembros.value) return 'No se pudieron cargar los miembros. Verifica tu conexión.'
  if (errorCatalogo.value) return 'No se pudo cargar el catálogo de roles.'
  return ''
})

const MODULO_ETIQUETA: Record<string, string> = {
  financiero: 'Financiero',
  cartera_cobranza: 'Cartera / Cobranza',
  juridico: 'Jurídico',
  estado_cuenta: 'Estado de cuenta',
  mantenimiento: 'Mantenimiento',
}

const totalMiembros = computed(() => membersStore.miembros.length)
const totalRoles = computed(() => membersStore.rolesFuncionalesConModulos.length)
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-lg font-medium mb-1">Seguridad</h1>
      <p class="text-sm text-neutral-500">Gestiona quién accede y qué puede hacer.</p>
    </div>

    <UAlert
      v-if="hayError"
      icon="i-lucide-alert-circle"
      color="error"
      variant="soft"
      :title="mensajeError"
      :actions="[{ label: 'Reintentar', click: () => { $router.go(0) } }]"
    />

    <!-- Loading skeleton -->
    <div v-if="cargando" class="space-y-3">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <USkeleton class="h-16 rounded-md" />
        <USkeleton class="h-16 rounded-md" />
      </div>
      <USkeleton class="h-40 rounded-md" />
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Navigation cards — datos integrados, sin stat cards decorativas -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <NuxtLink
          to="/usuarios"
          class="group flex items-center justify-between rounded-md border border-neutral-200 px-4 py-4 transition-colors hover:border-primary-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          <div>
            <p class="font-medium text-sm">Usuarios</p>
            <p class="text-xs text-neutral-500">
              <template v-if="totalMiembros > 0">{{ totalMiembros }} miembro{{ totalMiembros !== 1 ? 's' : '' }}</template>
              <template v-else>Invitar miembros y asignar roles</template>
            </p>
          </div>
          <span class="text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </span>
        </NuxtLink>
        <NuxtLink
          to="/auditoria"
          class="group flex items-center justify-between rounded-md border border-neutral-200 px-4 py-4 transition-colors hover:border-primary-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          <div>
            <p class="font-medium text-sm">Auditoría</p>
            <p class="text-xs text-neutral-500">Revisar quién hizo qué y cuándo.</p>
          </div>
          <span class="text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </span>
        </NuxtLink>
      </div>

      <!-- Roles funcionales -->
      <div>
        <UiTituloDescripcion clase-descripcion="text-xs text-neutral-500 mt-0.5 mb-2">
          <template #titulo>
            <h2 class="text-sm font-medium">Roles funcionales</h2>
          </template>
          <template #descripcion>
            Roles disponibles en esta copropiedad. Se asignan desde cada miembro.
          </template>
        </UiTituloDescripcion>

        <!-- Empty state contextual -->
        <div
          v-if="!hayError && totalRoles === 0"
          class="rounded-md border border-dashed border-neutral-300 px-4 py-6 text-center"
        >
          <p class="text-sm text-neutral-600">No hay roles configurados.</p>
          <p class="text-xs text-neutral-500 mt-1">
            Los roles definen qué módulos puede ver cada miembro. Créalos desde Configuración → Roles.
          </p>
        </div>

        <UiTabla
          v-else-if="!hayError"
          :columnas="[
            { clave: 'nombre', etiqueta: 'Rol' },
            { clave: 'modulos', etiqueta: 'Módulos' },
          ]"
          :filas="membersStore.rolesFuncionalesConModulos"
          :clave-fila="(fila) => fila.id"
        >
          <template #celda-nombre="{ fila }">{{ fila.nombre }}</template>
          <template #celda-modulos="{ fila }">
            <div class="flex flex-wrap gap-1">
              <span
                v-for="m in fila.modulos"
                :key="m"
                class="inline-flex items-center rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600"
              >
                {{ MODULO_ETIQUETA[m] ?? m }}
              </span>
            </div>
          </template>
        </UiTabla>
      </div>
    </template>
  </div>
</template>
