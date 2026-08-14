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
    <p class="text-sm text-gray-500 mb-4">Solo metadatos — ningún dato operativo de las copropiedades.</p>

    <p v-if="platformStore.tenants.length === 0" class="text-gray-500 text-sm">Sin copropiedades.</p>
    <table v-else class="w-full text-sm">
      <thead>
        <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
          <th class="py-1 font-medium">Nombre</th>
          <th class="py-1 font-medium">Slug</th>
          <th class="py-1 font-medium">Estado</th>
          <th class="py-1 font-medium">Miembros</th>
          <th class="py-1 font-medium">Última actividad</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="tenant in platformStore.tenants"
          :key="tenant.id ?? tenant.slug ?? undefined"
          class="border-b border-gray-100 dark:border-gray-900"
        >
          <td class="py-1.5">{{ tenant.name }}</td>
          <td class="py-1.5 text-gray-500">{{ tenant.slug }}</td>
          <td class="py-1.5">{{ tenant.status }}</td>
          <td class="py-1.5">{{ tenant.member_count }}</td>
          <td class="py-1.5 whitespace-nowrap">
            {{ tenant.last_activity_at ? new Date(tenant.last_activity_at).toLocaleString('es-CO') : '—' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
