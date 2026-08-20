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

await useAsyncData('seguridad-miembros', () => {
  const tenantId = tenantStore.activeTenant?.id
  return tenantId ? membersStore.cargarMiembros(tenantId) : Promise.resolve([])
})
await useAsyncData('seguridad-catalogo', () => membersStore.cargarCatalogoRolesFuncionalesConModulos())

const MODULO_ETIQUETA: Record<string, string> = {
  financiero: 'Financiero',
  cartera_cobranza: 'Cartera / Cobranza',
  juridico: 'Jurídico',
  estado_cuenta: 'Estado de cuenta',
  mantenimiento: 'Mantenimiento',
}

const modulosCubiertos = computed(
  () => new Set(membersStore.rolesFuncionalesConModulos.flatMap((rol) => rol.modulos)).size,
)
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Seguridad</h1>
      <p class="text-sm text-gray-500">Usuarios, roles y trazabilidad de acceso de esta copropiedad.</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="rounded-lg border border-gray-200 p-4">
        <p class="text-2xl font-semibold">{{ membersStore.miembros.length }}</p>
        <p class="text-sm text-gray-500">Miembros activos</p>
      </div>
      <div class="rounded-lg border border-gray-200 p-4">
        <p class="text-2xl font-semibold">{{ membersStore.rolesFuncionalesConModulos.length }}</p>
        <p class="text-sm text-gray-500">Roles funcionales definidos</p>
      </div>
      <div class="rounded-lg border border-gray-200 p-4">
        <p class="text-2xl font-semibold">{{ modulosCubiertos }}</p>
        <p class="text-sm text-gray-500">Módulos con acceso restringible</p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <NuxtLink to="/usuarios" class="block rounded-lg border border-gray-200 p-4 hover:border-indigo-500">
        <p class="font-medium">Usuarios</p>
        <p class="text-sm text-gray-500">
          Invitar miembros y asignar rol de sistema y roles funcionales.
        </p>
      </NuxtLink>
      <NuxtLink to="/auditoria" class="block rounded-lg border border-gray-200 p-4 hover:border-indigo-500">
        <p class="font-medium">Auditoría</p>
        <p class="text-sm text-gray-500">Historial de cambios de acceso y otros eventos.</p>
      </NuxtLink>
    </div>

    <div>
      <h2 class="text-base font-semibold mb-2">Roles funcionales</h2>
      <p class="text-sm text-gray-500 mb-3">
        Catálogo de plataforma, de solo lectura aquí — se asignan a cada miembro desde Usuarios.
      </p>
      <UiTabla
        :columnas="[
          { clave: 'nombre', etiqueta: 'Rol funcional' },
          { clave: 'modulos', etiqueta: 'Módulos que cubre' },
        ]"
        :filas="membersStore.rolesFuncionalesConModulos"
        :clave-fila="(fila) => fila.id"
      >
        <template #celda-nombre="{ fila }">{{ fila.nombre }}</template>
        <template #celda-modulos="{ fila }">
          <span class="text-gray-500">
            {{ fila.modulos.map((m) => MODULO_ETIQUETA[m] ?? m).join(', ') }}
          </span>
        </template>
      </UiTabla>
    </div>
  </div>
</template>
