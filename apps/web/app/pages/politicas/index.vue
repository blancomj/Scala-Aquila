<script setup lang="ts">
// Políticas financieras — PLAN §4.3. Pantalla pequeña: listar versiones,
// crear una nueva en borrador o ver una existente (drawer,
// components/politicas/PoliticasVersionDrawer.vue), activar. No soporta
// reemplazar una política ya vigente (guard_politica_inmutable no lo
// permite hoy — ver stores/politicaFinanciera.ts).
//
// Rediseñada (23-08-2026) siguiendo el mismo patrón que CoeficientesPanel.vue
// (drawer para "nueva versión"/"ver versión" en vez de formulario inline
// permanente sin forma de inspeccionar una fila) y agregando lo que faltaba
// para una pantalla de configuración financiera: la política vigente como
// resumen legible arriba (no una fila más en la tabla) y confirmación antes
// de "Activar" (retira la vigente actual sin deshacer, ver
// activarPolitica() en el store).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const politicaStore = usePoliticaFinancieraStore()

const error = ref<string | null>(null)
const activandoId = ref<string | null>(null)
const drawerAbierto = ref(false)
const politicaIdAbierta = ref<string | undefined>(undefined)
const confirmandoId = ref<string | null>(null)

await useAsyncData('politicas-financieras', () => {
  const tenantId = tenantStore.activeTenant?.id
  return tenantId ? politicaStore.cargarPoliticas(tenantId) : Promise.resolve([])
})

const politicaVigente = computed(() => politicaStore.politicas.find((p) => p.estado === 'vigente'))
const politicaConfirmando = computed(() =>
  politicaStore.politicas.find((p) => p.id === confirmandoId.value),
)

const ETIQUETA_ESTADO: Record<string, string> = {
  vigente: 'Vigente',
  borrador: 'Borrador',
  historica: 'Histórica',
}
const COLOR_ESTADO: Record<string, 'success' | 'neutral'> = {
  vigente: 'success',
  borrador: 'neutral',
  historica: 'neutral',
}

function abrirNuevaVersion(): void {
  politicaIdAbierta.value = undefined
  drawerAbierto.value = true
}

function abrirVersion(id: string): void {
  politicaIdAbierta.value = id
  drawerAbierto.value = true
}

async function cerrarDrawer(recargar: boolean): Promise<void> {
  drawerAbierto.value = false
  if (!recargar) return
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) await politicaStore.cargarPoliticas(tenantId)
}

async function confirmarActivar(): Promise<void> {
  const id = confirmandoId.value
  if (!id) return
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  activandoId.value = id
  try {
    await politicaStore.activarPolitica(id, tenantId)
    confirmandoId.value = null
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo activar la política.')
  } finally {
    activandoId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold mb-2">Políticas financieras</h1>
      <p class="text-sm text-neutral-500">
        Redondeo, residual, intereses y fondo de imprevistos — versionadas (PLAN §4.3).
      </p>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <section class="rounded-lg border border-neutral-200 dark:border-neutral-800">
      <header
        class="px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40"
      >
        <h2 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">Vigente</h2>
      </header>
      <div class="p-4">
        <p v-if="!politicaVigente" class="text-sm text-neutral-500">
          Esta copropiedad todavía no tiene una política financiera vigente.
        </p>
        <dl v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <dt class="text-xs text-neutral-500 mb-0.5">Versión</dt>
            <dd class="font-medium">v{{ politicaVigente.version }} · desde {{ politicaVigente.vigente_desde }}</dd>
          </div>
          <div>
            <dt class="text-xs text-neutral-500 mb-0.5">Redondeo</dt>
            <dd class="font-medium">{{ politicaVigente.redondeo_modo }} · escala {{ politicaVigente.redondeo_escala }}</dd>
          </div>
          <div>
            <dt class="text-xs text-neutral-500 mb-0.5">Interés mensual</dt>
            <dd class="font-medium">
              {{ politicaVigente.interes_tasa_mensual !== null ? `${politicaVigente.interes_tasa_mensual}%` : '—' }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-neutral-500 mb-0.5">Fondo de imprevistos</dt>
            <dd class="font-medium">
              {{ politicaVigente.fondo_imprevistos_porcentaje !== null ? `${politicaVigente.fondo_imprevistos_porcentaje}%` : 'Sin fondo' }}
            </dd>
          </div>
        </dl>
      </div>
    </section>

    <section class="rounded-lg border border-neutral-200 dark:border-neutral-800">
      <header
        class="px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 flex items-center justify-between"
      >
        <h2 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">Versiones</h2>
        <UButton size="xs" @click="abrirNuevaVersion">Nueva versión</UButton>
      </header>
      <div class="p-4">
        <p v-if="politicaStore.politicas.length === 0" class="text-neutral-500 text-sm">
          Esta copropiedad todavía no tiene una política financiera.
        </p>
        <UiTabla
          v-else
          :columnas="[
            { clave: 'version', etiqueta: 'Versión' },
            { clave: 'estado', etiqueta: 'Estado' },
            { clave: 'redondeo', etiqueta: 'Redondeo' },
            { clave: 'interes', etiqueta: 'Interés' },
            { clave: 'suma', etiqueta: 'Σ coeficientes' },
            { clave: 'acciones', etiqueta: '' },
          ]"
          :filas="politicaStore.politicas"
          :clave-fila="(politica) => politica.id"
        >
          <template #celda-version="{ fila }">v{{ fila.version }}</template>
          <template #celda-estado="{ fila }">
            <UBadge :color="COLOR_ESTADO[fila.estado]" variant="subtle" size="sm">
              {{ ETIQUETA_ESTADO[fila.estado] ?? fila.estado }}
            </UBadge>
          </template>
          <template #celda-redondeo="{ fila }">
            <span class="text-neutral-500">{{ fila.redondeo_modo }} · escala {{ fila.redondeo_escala }}</span>
          </template>
          <template #celda-interes="{ fila }">
            <span class="text-neutral-500">{{ fila.interes_day_count }} · {{ fila.interes_descuento_orden }}</span>
          </template>
          <template #celda-suma="{ fila }"><span class="text-neutral-500">{{ fila.coeficientes_suma_esperada }}</span></template>
          <template #celda-acciones="{ fila }">
            <div class="flex justify-end gap-1">
              <UButton size="xs" variant="ghost" @click="abrirVersion(fila.id)">Ver</UButton>
              <UButton
                v-if="fila.estado === 'borrador'"
                size="xs"
                variant="soft"
                :loading="activandoId === fila.id"
                @click="confirmandoId = fila.id"
              >
                Activar
              </UButton>
            </div>
          </template>
        </UiTabla>
      </div>
    </section>

    <PoliticasVersionDrawer
      v-if="drawerAbierto"
      :politica-id="politicaIdAbierta"
      @cerrar="cerrarDrawer(false)"
      @creado="cerrarDrawer(true)"
    />

    <UModal
      :open="confirmandoId !== null"
      title="¿Activar esta versión?"
      @update:open="(abierto) => { if (!abierto) confirmandoId = null }"
    >
      <template #body>
        <div v-if="politicaConfirmando" class="space-y-3 text-sm">
          <p>
            Vas a activar la <strong>v{{ politicaConfirmando.version }}</strong>
            <template v-if="politicaVigente"> — retira la <strong>v{{ politicaVigente.version }}</strong>, hoy vigente</template>.
          </p>
          <p class="text-neutral-500">
            Desde ese momento el motor de liquidación usa estos parámetros. No se puede deshacer —
            si algo queda mal habría que crear una versión nueva y activarla.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="confirmandoId = null">Cancelar</UButton>
          <UButton :loading="activandoId !== null" @click="confirmarActivar">Activar</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
