<script setup lang="ts">
// Hub de Seguridad — cierra el vacío de navegación detectado tras
// construir roles funcionales (20260830120000-170000): existían /usuarios
// y /auditoria como páginas sueltas bajo "Administración", sin nada que
// las uniera ni mostrara el catálogo de roles funcionales fuera del
// drawer de cada miembro. No es el constructor genérico de roles/permisos
// del mockup de referencia (decisión explícita: diferido) — es un hub de
// solo lectura sobre lo que ya existe.
import type { RolFuncionalTenant } from '~/stores/members'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'users:manage' })

const tenantStore = useTenantStore()
const membersStore = useMembersStore()

// PROMPT_PERMISOS_CAPA2.md §A3: administrar roles es administrar — no
// basta con el permiso de página (users:manage, que auxiliar también
// tiene). Mismo patrón que cartera/acciones.vue y configuracion/menu.vue.
const esAdministrador = computed(() => tenantStore.role === 'administrador')

// `watch: [...]`: activeTenant puede no estar resuelto en el instante exacto
// de este setup en la carga en frío — la opción reintenta sola en cuanto el
// id esté disponible (mismo espíritu que configuracion/ia.vue).
const { status: statusMiembros, error: errorMiembros } = await useAsyncData(
  'seguridad-miembros',
  () => {
    const tenantId = tenantStore.activeTenant?.id
    return tenantId ? membersStore.cargarMiembros(tenantId) : Promise.resolve([])
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)
const { status: statusCatalogo, error: errorCatalogo } = await useAsyncData(
  'seguridad-catalogo',
  () => {
    const tenantId = tenantStore.activeTenant?.id
    return Promise.all([
      tenantId
        ? membersStore.cargarRolesFuncionalesTenant(tenantId)
        : membersStore.cargarCatalogoRolesFuncionalesConModulos(),
      membersStore.cargarCoberturaModulos(),
    ])
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)

const cargando = computed(() => statusMiembros.value === 'pending' || statusCatalogo.value === 'pending')
const hayError = computed(() => !!errorMiembros.value || !!errorCatalogo.value)
const mensajeError = computed(() => {
  if (errorMiembros.value) return 'No se pudieron cargar los miembros. Verifica tu conexión.'
  if (errorCatalogo.value) return 'No se pudo cargar el catálogo de roles.'
  return ''
})

// Reemplaza el mapa fijo de 5 módulos que tenía esta pantalla (ya
// desactualizado — le faltaban movilidad/marketplace/anuncios/porteria/
// gobierno): ahora sale del catálogo real (A1), no de un literal en el
// componente que hay que recordar mantener sincronizado.
const MODULO_ETIQUETA = computed<Record<string, string>>(() =>
  Object.fromEntries(
    membersStore.coberturaModulos.map((m) => [m.codigo ?? '', m.nombre ?? m.codigo ?? '']),
  ),
)

const modulosSinCobertura = computed(() =>
  membersStore.coberturaModulos.filter((m) => !m.tiene_rol_que_lo_cubre),
)

const roles = computed(() =>
  tenantStore.activeTenant?.id ? membersStore.rolesFuncionalesTenant : membersStore.rolesFuncionalesConModulos,
)
const totalMiembros = computed(() => membersStore.miembros.length)
const totalRoles = computed(() => roles.value.length)

const drawerAbierto = ref(false)
const rolEnEdicion = ref<RolFuncionalTenant | undefined>(undefined)

function abrirCrear(): void {
  rolEnEdicion.value = undefined
  drawerAbierto.value = true
}

function abrirEditar(rol: RolFuncionalTenant): void {
  if (rol.tenantId === null) return // roles de plataforma: solo lectura
  rolEnEdicion.value = rol
  drawerAbierto.value = true
}

async function alGuardar(): Promise<void> {
  drawerAbierto.value = false
  await membersStore.cargarCoberturaModulos()
}
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
      :actions="[{ label: 'Reintentar', onClick: () => { $router.go(0) } }]"
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

      <!-- Módulos sin cobertura — §A3 guarda 3, lo que convierte el defecto -->
      <!-- §1.2 del prompt de auditoría en algo visible y auto-corregible.   -->
      <UAlert
        v-if="!hayError && modulosSinCobertura.length > 0"
        icon="i-lucide-eye-off"
        color="warning"
        variant="soft"
        title="Módulos que solo ven los administradores"
        :description="`Nadie tiene un rol funcional que cubra: ${modulosSinCobertura.map((m) => m.nombre).join(', ')}. Los administradores siempre los ven; el resto, solo si no tiene ningún rol funcional asignado.`"
      />

      <!-- Roles funcionales -->
      <div>
        <div class="flex items-start justify-between gap-3">
          <UiTituloDescripcion clase-descripcion="text-xs text-neutral-500 mt-0.5 mb-2">
            <template #titulo>
              <h2 class="text-sm font-medium">Roles funcionales</h2>
            </template>
            <template #descripcion>
              Roles disponibles en esta copropiedad. Se asignan desde cada miembro. Mientras alguien
              no tenga ningún rol funcional, ve todos los módulos — asignarle el primero es lo que
              empieza a restringirlo.
            </template>
          </UiTituloDescripcion>
          <UButton v-if="esAdministrador" size="sm" icon="i-lucide-plus" @click="abrirCrear">
            Crear rol
          </UButton>
        </div>

        <!-- Empty state contextual -->
        <div
          v-if="!hayError && totalRoles === 0"
          class="rounded-md border border-dashed border-neutral-300 px-4 py-6 text-center"
        >
          <p class="text-sm text-neutral-600">No hay roles configurados.</p>
          <p class="text-xs text-neutral-500 mt-1">
            <template v-if="esAdministrador">Los roles definen qué módulos puede ver cada miembro. Créalos con el botón de arriba.</template>
            <template v-else>Los roles definen qué módulos puede ver cada miembro. Un administrador puede crearlos.</template>
          </p>
        </div>

        <UiTabla
          v-else-if="!hayError"
          :columnas="[
            { clave: 'candado', etiqueta: '', ancho: '28px' },
            { clave: 'nombre', etiqueta: 'Rol' },
            { clave: 'modulos', etiqueta: 'Módulos' },
            { clave: 'estado', etiqueta: 'Estado' },
            ...(esAdministrador ? [{ clave: 'acciones', etiqueta: '' }] : []),
          ]"
          :filas="roles"
          :clave-fila="(fila) => fila.id"
        >
          <template #celda-candado="{ fila }">
            <UIcon
              v-if="!(fila as RolFuncionalTenant).tenantId"
              name="i-lucide-lock"
              class="size-3.5 text-neutral-400"
              title="Rol de plataforma — solo lectura, no se puede editar ni eliminar"
            />
          </template>
          <template #celda-nombre="{ fila }">
            {{ fila.nombre }}
          </template>
          <template #celda-modulos="{ fila }">
            <div class="flex flex-wrap gap-1">
              <span
                v-for="m in fila.modulos"
                :key="m.modulo"
                class="inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600"
                :title="m.accion === 'actuar' ? 'Ve y puede actuar (crear/editar)' : 'Solo ve'"
              >
                <UIcon v-if="m.accion === 'actuar'" name="i-lucide-pencil" class="size-3" />
                {{ MODULO_ETIQUETA[m.modulo] ?? m.modulo }}
              </span>
              <span v-if="fila.modulos.length === 0" class="text-xs text-neutral-400">Ninguno</span>
            </div>
          </template>
          <template #celda-estado="{ fila }">
            <span v-if="(fila as RolFuncionalTenant).activo === false" class="text-xs text-neutral-400">Inactivo</span>
            <span v-else class="text-xs text-neutral-500">Activo</span>
          </template>
          <template v-if="esAdministrador" #celda-acciones="{ fila }">
            <UButton
              v-if="(fila as RolFuncionalTenant).tenantId"
              size="xs"
              variant="ghost"
              icon="i-lucide-pencil"
              @click="abrirEditar(fila as RolFuncionalTenant)"
            >
              Editar
            </UButton>
          </template>
        </UiTabla>
      </div>
    </template>

    <SeguridadRolFuncionalDrawer
      v-if="drawerAbierto"
      :rol="rolEnEdicion"
      @cerrar="drawerAbierto = false"
      @guardado="alGuardar"
    />
  </div>
</template>
