<script setup lang="ts">
// Ficha de la copropiedad — reemplaza el placeholder (F4/E4). 4 tabs:
// Datos básicos, Documentos y Configuración se construyen (PROMPT_FICHA_COPROPIEDAD.md
// §1.1, C1-C5). Documentos reutiliza documentos/CopropiedadDocumentos.vue —
// mismo patrón que InmuebleDocumentos.vue, inmueble_id null = pertenece al
// tenant (§8.1, resuelto por decisión explícita del usuario: reusar el
// mismo tab del inmueble en vez de tablas paralelas). Histórico sigue
// bloqueado — depende de v_inmueble_historico, decisión de arquitectura sin
// resolver aparte. Un mockup con datos de ejemplo no es autorización de
// alcance (§3).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const copropiedadStore = useCopropiedadStore()
const tercerosStore = useTercerosStore()
const cuentaStore = useCuentaCorrienteStore()
const supabase = useSupabaseClient()

type Tab = 'basicos' | 'documentos' | 'configuracion' | 'historico'
const TABS: ReadonlyArray<{ id: Tab; etiqueta: string; deshabilitada?: boolean }> = [
  { id: 'basicos', etiqueta: 'Datos básicos' },
  { id: 'documentos', etiqueta: 'Documentos' },
  { id: 'configuracion', etiqueta: 'Configuración' },
  { id: 'historico', etiqueta: 'Histórico', deshabilitada: true },
]
const tabActiva = ref<Tab>('basicos')

function irATab(tab: Tab, deshabilitada?: boolean): void {
  if (deshabilitada) return
  tabActiva.value = tab
}

const ESTADO_LABEL: Record<string, string> = { active: 'Activo', suspended: 'Suspendido', deleted: 'Eliminado' }
const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'error'> = {
  active: 'success',
  suspended: 'warning',
  deleted: 'error',
}

const tabItems = computed(() =>
  TABS.map((tab) => ({ label: tab.etiqueta, value: tab.id, disabled: tab.deshabilitada })),
)

watchEffect(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    copropiedadStore.cargarTenant(tenantId),
    copropiedadStore.cargarTiposDivision(tenantId),
    copropiedadStore.cargarCuentasBancarias(tenantId),
    copropiedadStore.cargarEntidadesFinancieras(tenantId),
    cuentaStore.cargarInmuebles(tenantId),
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

const logoUrl = computed(() => {
  const path = copropiedadStore.tenant?.logo_path
  if (!path) return null
  const { data } = supabase.storage.from('logo-copropiedad').getPublicUrl(path)
  return data.publicUrl
})

const inmueblesActivos = computed(
  () => cuentaStore.inmuebles.filter((i) => i.estado === 'activo').length,
)

const cuentaRecaudo = computed(() => copropiedadStore.cuentasBancarias.find((c) => c.es_recaudo) ?? null)

function nombreEntidadFinanciera(id: number): string {
  return copropiedadStore.entidadesFinancieras.find((e) => e.id === id)?.nombre ?? '—'
}

const personasVinculadasActivas = computed(
  () => tercerosStore.personasTenant.filter((p) => !p.vigente_hasta).length,
)
</script>

<template>
  <div class="ficha-inmueble">
    <div class="sheet">
      <p class="breadcrumb">Configuración <span>›</span> <strong>Copropiedad</strong></p>

      <div class="masthead">
        <div class="masthead-id">
          <div class="logo-circle">
            <img v-if="logoUrl" :src="logoUrl" alt="Logo de la copropiedad">
            <template v-else>{{ iniciales || '—' }}</template>
          </div>
          <div>
            <p class="eyebrow">Ficha de la copropiedad</p>
            <div class="title-row">
              <h1>{{ copropiedadStore.tenant?.name ?? '…' }}</h1>
              <UBadge v-if="copropiedadStore.tenant" :color="ESTADO_COLOR[copropiedadStore.tenant.status] ?? 'neutral'" variant="subtle">
                {{ ESTADO_LABEL[copropiedadStore.tenant.status] ?? copropiedadStore.tenant.status }}
              </UBadge>
            </div>
            <p class="sub">NIT {{ copropiedadStore.tenant?.nit ?? '—' }}</p>
          </div>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat">
          <p class="stat-label">Inmuebles activos</p>
          <p class="stat-value">{{ inmueblesActivos }}</p>
        </div>
        <div class="stat">
          <p class="stat-label">Cuenta de recaudo</p>
          <p class="stat-value" style="font-size: 15px">
            {{ cuentaRecaudo ? nombreEntidadFinanciera(cuentaRecaudo.entidad_financiera_id) : 'Sin definir' }}
          </p>
        </div>
        <div class="stat">
          <p class="stat-label">Moneda</p>
          <p class="stat-value">{{ copropiedadStore.tenant?.moneda ?? '—' }}</p>
        </div>
        <div class="stat">
          <p class="stat-label">Personas vinculadas</p>
          <p class="stat-value">{{ personasVinculadasActivas }}</p>
        </div>
      </div>

      <div class="rule-double" />

      <UTabs
        :items="tabItems"
        :model-value="tabActiva"
        variant="link"
        :content="false"
        class="w-full"
        @update:model-value="(v) => irATab(v as Tab, TABS.find((t) => t.id === v)?.deshabilitada)"
      />
      <p class="note" style="margin: 8px 0 0">
        <strong>Histórico</strong> todavía no está disponible para la copropiedad completa.
      </p>

      <div class="panels">
        <section v-if="tabActiva === 'basicos'">
          <CopropiedadDatosBasicos />
        </section>
        <section v-else-if="tabActiva === 'documentos'">
          <CopropiedadDocumentos />
        </section>
        <section v-else-if="tabActiva === 'configuracion'">
          <CopropiedadConfiguracion />
        </section>
      </div>
    </div>
  </div>
</template>
