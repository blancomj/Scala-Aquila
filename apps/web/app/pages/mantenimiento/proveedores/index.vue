<script setup lang="ts">
// MANT-5 §4.1/§4.6: proveedores/contratistas — cero tablas de proveedor nuevas, esto lista
// terceros que ya tienen el rol proveedor/contratista (tenant_tercero_rol, useTercerosStore) y
// enlaza a la ficha con el semáforo de habilitación (lo primero que debe verse, antes que la
// calificación).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const tercerosStore = useTercerosStore()

const CODIGOS_PROVEEDOR = new Set(['proveedor', 'contratista'])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    tercerosStore.cargarPersonasTenant(tenantId),
    tercerosStore.cargarCatalogos(tenantId),
    tercerosStore.cargarTerceros(tenantId),
  ])
}
onMounted(cargar)

const proveedores = computed(() =>
  tercerosStore.personasTenant.filter(
    (p) => CODIGOS_PROVEEDOR.has(p.rol?.codigo ?? '') && (p.vigente_hasta === null || new Date(p.vigente_hasta) >= new Date()),
  ),
)

const rolesProveedor = computed(() =>
  tercerosStore.rolesPersonaCopropiedad.filter((r) => CODIGOS_PROVEEDOR.has(r.codigo)),
)

const drawerAbierto = ref(false)
const form = reactive({
  terceroId: null as string | null,
  rolId: undefined as number | undefined,
  vigenteDesde: new Date().toISOString().slice(0, 10),
})
const errorGuardar = ref<string | null>(null)

const opcionesTercero = computed(() =>
  tercerosStore.terceros
    .filter((t) => !proveedores.value.some((p) => p.tercero_id === t.id))
    .map((t) => ({ valor: t.id, etiqueta: `${t.nombre_completo} — ${t.numero_documento}` })),
)

function abrirVincular(): void {
  form.terceroId = null
  form.rolId = undefined
  form.vigenteDesde = new Date().toISOString().slice(0, 10)
  errorGuardar.value = null
  drawerAbierto.value = true
}

async function vincular(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !form.terceroId || !form.rolId) return
  errorGuardar.value = null
  try {
    await tercerosStore.asociarTerceroTenant({
      tenantId, terceroId: form.terceroId, rolId: form.rolId,
      vigenteDesde: form.vigenteDesde, recibeNotificaciones: true,
    })
    drawerAbierto.value = false
  } catch (excepcion) {
    errorGuardar.value = mensajeError(excepcion, 'No se pudo vincular el proveedor.')
  }
}

type PersonaTenant = Database['public']['Tables']['tenant_tercero_rol']['Row'] & {
  tercero: Database['public']['Tables']['terceros']['Row'] | null
  rol: Database['public']['Tables']['lista_tipos']['Row'] | null
}
function tercero(p: PersonaTenant) { return p.tercero }
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Proveedores y contratistas</h1>
        </template>
        <template #descripcion>
          A quién puede dejarse entrar a trabajar. La habilitación (afiliación, pólizas,
          certificaciones) va antes que la calificación — sin ella, una orden de trabajo queda
          bloqueada.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-center gap-2">
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="tercerosStore.loading" @click="cargar()">
          Actualizar
        </UButton>
        <UButton icon="i-lucide-plus" @click="abrirVincular()">Vincular proveedor</UButton>
      </div>
    </div>

    <div class="rounded-lg border border-default divide-y divide-default">
      <NuxtLink
        v-for="p in proveedores" :key="p.id" :to="`/mantenimiento/proveedores/${p.tercero_id}`"
        class="flex items-center justify-between gap-4 p-3 hover:bg-elevated transition-colors"
      >
        <div>
          <p class="font-medium">{{ tercero(p as PersonaTenant)?.nombre_completo ?? '—' }}</p>
          <p class="text-sm text-muted">{{ tercero(p as PersonaTenant)?.numero_documento }}</p>
        </div>
        <UBadge variant="soft" class="capitalize">{{ p.rol?.nombre }}</UBadge>
      </NuxtLink>
      <p v-if="proveedores.length === 0 && !tercerosStore.loading" class="p-6 text-sm text-muted text-center">
        Ningún tercero tiene todavía rol de proveedor o contratista.
      </p>
    </div>

    <UiDrawer :abierto="drawerAbierto" titulo="Vincular proveedor/contratista" @cerrar="drawerAbierto = false">
      <div class="space-y-3">
        <UAlert v-if="errorGuardar" color="error" variant="soft" :title="errorGuardar" />
        <UFormField label="Tercero" name="tercero">
          <UiSelectorBuscable v-model="form.terceroId" :opciones="opcionesTercero" placeholder="Selecciona un tercero existente" />
        </UFormField>
        <UFormField label="Rol" name="rol">
          <USelect v-model="form.rolId" class="w-48" :items="rolesProveedor.map((r) => ({ label: r.nombre, value: r.id }))" />
        </UFormField>
        <UFormField label="Vigente desde" name="vigenteDesde">
          <UInput v-model="form.vigenteDesde" type="date" class="w-full" />
        </UFormField>
        <p class="text-xs text-muted">
          ¿El tercero no existe todavía? Créalo primero en
          <NuxtLink to="/terceros" class="text-primary underline">Terceros</NuxtLink>.
        </p>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerAbierto = false">Cancelar</UButton>
          <UButton :disabled="!form.terceroId || !form.rolId" :loading="tercerosStore.loading" @click="vincular()">
            Vincular
          </UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
