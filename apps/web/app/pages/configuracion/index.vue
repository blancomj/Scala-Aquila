<script setup lang="ts">
// Ficha de la copropiedad — reemplaza el placeholder (F4/E4). 4 tabs:
// Datos básicos y Configuración se construyen (PROMPT_FICHA_COPROPIEDAD.md
// §1.1, C1-C5); Documentos e Histórico renderizan "Próximamente" — es una
// decisión de arquitectura sin resolver (§8.1: tablas paralelas vs.
// generalizar documentos_inmueble/v_inmueble_historico), no un gap que se
// resuelve con un default razonable. Un mockup con datos de ejemplo no es
// autorización de alcance (§3).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const copropiedadStore = useCopropiedadStore()
const tercerosStore = useTercerosStore()

type Tab = 'basicos' | 'documentos' | 'configuracion' | 'historico'
const TABS: ReadonlyArray<{ id: Tab; etiqueta: string }> = [
  { id: 'basicos', etiqueta: 'Datos básicos' },
  { id: 'documentos', etiqueta: 'Documentos' },
  { id: 'configuracion', etiqueta: 'Configuración' },
  { id: 'historico', etiqueta: 'Histórico' },
]
const tabActiva = ref<Tab>('basicos')

const ESTADO_LABEL: Record<string, string> = { active: 'Activo', suspended: 'Suspendido', deleted: 'Eliminado' }

watchEffect(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    copropiedadStore.cargarTenant(tenantId),
    copropiedadStore.cargarTiposDivision(tenantId),
    copropiedadStore.cargarCuentasBancarias(tenantId),
    tercerosStore.cargarTerceros(tenantId),
    tercerosStore.cargarCatalogos(tenantId),
    tercerosStore.cargarPersonasTenant(tenantId),
  ])
})

const iniciales = computed(() => {
  const nombre = copropiedadStore.tenant?.name ?? ''
  return nombre
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
})
</script>

<template>
  <div class="ficha-inmueble">
    <div class="sheet">
      <p class="breadcrumb">Configuración <span>›</span> <strong>Copropiedad</strong></p>

      <div class="masthead">
        <div class="masthead-id">
          <div class="logo-circle">{{ iniciales || '—' }}</div>
          <div>
            <p class="eyebrow">Ficha de la copropiedad</p>
            <div class="title-row">
              <h1>{{ copropiedadStore.tenant?.name ?? '…' }}</h1>
              <span v-if="copropiedadStore.tenant" class="tag">
                {{ ESTADO_LABEL[copropiedadStore.tenant.status] ?? copropiedadStore.tenant.status }}
              </span>
            </div>
            <p class="sub">NIT {{ copropiedadStore.tenant?.nit ?? '—' }}</p>
          </div>
        </div>
      </div>

      <div class="rule-double" />

      <nav class="tabs">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          type="button"
          class="tab"
          :class="{ 'is-active': tabActiva === tab.id }"
          @click="tabActiva = tab.id"
        >
          {{ tab.etiqueta }}
        </button>
      </nav>

      <div class="panels">
        <section v-if="tabActiva === 'basicos'">
          <CopropiedadDatosBasicos />
        </section>
        <section v-else-if="tabActiva === 'documentos'">
          <p class="empty-state">
            Próximamente — decisión de arquitectura pendiente (tablas paralelas vs.
            generalizar documentos_inmueble), PROMPT_FICHA_COPROPIEDAD.md §8.1.
          </p>
        </section>
        <section v-else-if="tabActiva === 'configuracion'">
          <CopropiedadConfiguracion />
        </section>
        <section v-else-if="tabActiva === 'historico'">
          <p class="empty-state">
            Próximamente — mismo bloqueo que Documentos (§8.1).
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
