<script setup lang="ts">
// F11: consola de plataforma, solo metadatos (AD-09, SEC-10). No lleva
// middleware `tenant`/`rbac` — is_platform_admin es un plano de
// autorización totalmente aparte del rol de tenant (§7.1).
definePageMeta({ layout: 'default', middleware: ['platform'] })

const platformStore = usePlatformStore()

await useAsyncData('plataforma-tenants', () => platformStore.cargarTenants())
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold mb-4">Consola de plataforma</h1>
    <p class="text-sm text-gray-500 mb-4">
      Solo metadatos — ningún dato operativo de las copropiedades.
    </p>

    <p v-if="platformStore.tenants.length === 0" class="text-gray-500 text-sm">
      Sin copropiedades.
    </p>
    <UiTabla
      v-else
      :columnas="[
        { clave: 'nombre', etiqueta: 'Nombre' },
        { clave: 'slug', etiqueta: 'Slug' },
        { clave: 'estado', etiqueta: 'Estado' },
        { clave: 'miembros', etiqueta: 'Miembros' },
        { clave: 'ultimaActividad', etiqueta: 'Última actividad' },
      ]"
      :filas="platformStore.tenants"
      :clave-fila="(tenant) => tenant.id ?? tenant.slug ?? ''"
    >
      <template #celda-nombre="{ fila }">{{ fila.name }}</template>
      <template #celda-slug="{ fila }"><span class="text-gray-500">{{ fila.slug }}</span></template>
      <template #celda-estado="{ fila }">{{ fila.status }}</template>
      <template #celda-miembros="{ fila }">{{ fila.member_count }}</template>
      <template #celda-ultimaActividad="{ fila }">
        <span class="whitespace-nowrap">
          {{ fila.last_activity_at ? new Date(fila.last_activity_at).toLocaleString('es-CO') : '—' }}
        </span>
      </template>
    </UiTabla>
  </div>
</template>
