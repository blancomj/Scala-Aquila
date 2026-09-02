<script setup lang="ts">
// Plan anual de auditoría (PROMPT AUDITORÍA §30): año + riesgos/procesos +
// prioridad/frecuencia/responsable/período, sugerido con señales reales
// (riesgo_inherente, historial de hallazgos, control automático) pero nunca
// aprobado automáticamente — la aprobación es un UPDATE explícito aparte.
import type { SugerenciaPlanAnual } from '~/stores/auditoria'

const tenantStore = useTenantStore()
const auditoriaStore = useAuditoriaStore()

const puedeEscribir = computed(() => tenantStore.role === 'auditor' || tenantStore.role === 'administrador')
const puedeAprobar = puedeEscribir

const planSeleccionado = ref<string | null>(null)
const plan = computed(() => auditoriaStore.planes.find((p) => p.id === planSeleccionado.value) ?? null)
const items = computed(() => auditoriaStore.planItems.filter((i) => i.plan_id === planSeleccionado.value))

const cargandoItems = ref(false)
async function seleccionarPlan(planId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  planSeleccionado.value = planId
  cargandoItems.value = true
  try {
    await auditoriaStore.cargarPlanItems(tenantId, planId)
  } finally {
    cargandoItems.value = false
  }
}

// ── Nuevo plan ──────────────────────────────────────────────────────────
const modalPlanAbierto = ref(false)
const anioNuevo = ref(new Date().getFullYear() + 1)
const guardandoPlan = ref(false)
const errorPlan = ref<string | null>(null)

function abrirModalPlan(): void {
  anioNuevo.value = new Date().getFullYear() + 1
  errorPlan.value = null
  modalPlanAbierto.value = true
}

async function guardarPlan(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !anioNuevo.value) return
  guardandoPlan.value = true
  errorPlan.value = null
  try {
    const nuevo = await auditoriaStore.crearPlan(tenantId, anioNuevo.value)
    modalPlanAbierto.value = false
    await seleccionarPlan(nuevo.id)
  } catch (error) {
    errorPlan.value = mensajeError(error, 'No se pudo crear el plan.')
  } finally {
    guardandoPlan.value = false
  }
}

const aprobando = ref(false)
async function aprobarPlan(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !plan.value) return
  aprobando.value = true
  try {
    await auditoriaStore.aprobarPlan(tenantId, plan.value.id)
  } finally {
    aprobando.value = false
  }
}

// ── Ítems del plan ──────────────────────────────────────────────────────
const modalItemAbierto = ref(false)
const sugerencias = ref<SugerenciaPlanAnual[]>([])
const cargandoSugerencias = ref(false)
const riesgoElegido = ref<string | null>(null)
const proceso = ref('')
const prioridad = ref<'ALTA' | 'MEDIA' | 'BAJA'>('MEDIA')
const frecuencia = ref('')
const periodo = ref('')
const guardandoItem = ref(false)
const errorItem = ref<string | null>(null)

const PRIORIDAD_ITEMS = [
  { label: 'Alta', value: 'ALTA' },
  { label: 'Media', value: 'MEDIA' },
  { label: 'Baja', value: 'BAJA' },
]

const riesgoItems = computed(() => [
  { label: 'Sin riesgo del catálogo (proceso libre)', value: null },
  ...sugerencias.value.map((s) => ({
    label: `${s.riesgo_nombre} · riesgo ${s.riesgo_inherente} · score ${s.score}`,
    value: s.riesgo_id,
  })),
])

function aplicarSugerencia(riesgoId: string | null): void {
  const sugerencia = sugerencias.value.find((s) => s.riesgo_id === riesgoId)
  proceso.value = sugerencia?.procesos ?? ''
  frecuencia.value = sugerencia?.frecuencias ?? ''
}

async function abrirModalItem(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  riesgoElegido.value = null
  proceso.value = ''
  prioridad.value = 'MEDIA'
  frecuencia.value = ''
  periodo.value = plan.value ? String(plan.value.anio) : ''
  errorItem.value = null
  modalItemAbierto.value = true
  cargandoSugerencias.value = true
  try {
    sugerencias.value = await auditoriaStore.sugerirPlanAnual(tenantId)
  } catch {
    sugerencias.value = []
  } finally {
    cargandoSugerencias.value = false
  }
}

async function guardarItem(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !plan.value || !proceso.value.trim()) return
  guardandoItem.value = true
  errorItem.value = null
  try {
    await auditoriaStore.crearPlanItem(tenantId, {
      plan_id: plan.value.id,
      riesgo_id: riesgoElegido.value,
      proceso: proceso.value.trim(),
      prioridad: prioridad.value,
      frecuencia: frecuencia.value.trim() || null,
      responsable: null,
      periodo: periodo.value.trim() || null,
      engagement_id: null,
    })
    modalItemAbierto.value = false
  } catch (error) {
    errorItem.value = mensajeError(error, 'No se pudo agregar el ítem al plan.')
  } finally {
    guardandoItem.value = false
  }
}

async function eliminarItem(itemId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await auditoriaStore.eliminarPlanItem(tenantId, itemId)
}

const COLOR_PRIORIDAD: Record<string, 'error' | 'warning' | 'neutral'> = {
  ALTA: 'error',
  MEDIA: 'warning',
  BAJA: 'neutral',
}

const COLOR_ESTADO_PLAN: Record<string, 'success' | 'neutral'> = {
  APROBADO: 'success',
  BORRADOR: 'neutral',
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="!planSeleccionado" class="space-y-4">
      <div class="flex justify-end">
        <UButton v-if="puedeEscribir" icon="i-lucide-plus" size="sm" @click="abrirModalPlan">
          Nuevo plan anual
        </UButton>
      </div>

      <div v-if="auditoriaStore.planes.length === 0" class="text-sm text-neutral-500 py-8 text-center">
        Sin planes anuales registrados.
      </div>
      <div v-else class="space-y-2">
        <button
          v-for="p in auditoriaStore.planes"
          :key="p.id"
          type="button"
          class="w-full text-left border border-neutral-200 dark:border-neutral-800 rounded-md p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 flex items-center justify-between gap-3"
          @click="seleccionarPlan(p.id)"
        >
          <span class="text-sm font-medium text-neutral-900 dark:text-neutral-100">Plan {{ p.anio }}</span>
          <UBadge :color="COLOR_ESTADO_PLAN[p.estado] ?? 'neutral'" variant="subtle">{{ p.estado }}</UBadge>
        </button>
      </div>
    </div>

    <div v-else class="space-y-4">
      <div class="flex items-center justify-between gap-3">
        <UButton icon="i-lucide-arrow-left" size="sm" color="neutral" variant="ghost" @click="planSeleccionado = null">
          Planes
        </UButton>
        <div class="flex items-center gap-2">
          <UBadge :color="COLOR_ESTADO_PLAN[plan?.estado ?? ''] ?? 'neutral'" variant="subtle">
            {{ plan?.estado }}
          </UBadge>
          <UButton v-if="puedeAprobar && plan?.estado === 'BORRADOR'" :loading="aprobando" size="sm" @click="aprobarPlan">
            Aprobar plan
          </UButton>
        </div>
      </div>

      <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">Plan {{ plan?.anio }}</h3>

      <div class="flex justify-end">
        <UButton v-if="puedeEscribir" icon="i-lucide-plus" size="sm" @click="abrirModalItem">
          Agregar ítem
        </UButton>
      </div>

      <div v-if="cargandoItems" class="text-sm text-neutral-500 py-8 text-center">Cargando…</div>
      <div v-else-if="items.length === 0" class="text-sm text-neutral-500 py-8 text-center">
        Sin ítems en este plan todavía.
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="item in items"
          :key="item.id"
          class="border border-neutral-200 dark:border-neutral-800 rounded-md p-3 flex items-center justify-between gap-3"
        >
          <div>
            <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">{{ item.proceso }}</p>
            <div class="flex flex-wrap gap-2 mt-1">
              <UBadge :color="COLOR_PRIORIDAD[item.prioridad] ?? 'neutral'" variant="subtle" size="xs">
                {{ item.prioridad }}
              </UBadge>
              <UBadge v-if="item.frecuencia" color="neutral" variant="subtle" size="xs">{{ item.frecuencia }}</UBadge>
              <UBadge v-if="item.periodo" color="neutral" variant="subtle" size="xs">{{ item.periodo }}</UBadge>
              <UBadge v-if="item.engagement_id" color="info" variant="subtle" size="xs">Auditoría iniciada</UBadge>
            </div>
          </div>
          <UButton
            v-if="puedeEscribir"
            icon="i-lucide-trash-2"
            size="xs"
            color="error"
            variant="ghost"
            @click="eliminarItem(item.id)"
          />
        </div>
      </div>
    </div>

    <UModal v-model:open="modalPlanAbierto" title="Nuevo plan anual">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Año" name="anio" required>
            <UInputNumber v-model="anioNuevo" class="w-full" :min="2000" :max="2100" />
          </UFormField>
          <p v-if="errorPlan" class="text-sm text-error-600">{{ errorPlan }}</p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="modalPlanAbierto = false">Cancelar</UButton>
        <UButton :loading="guardandoPlan" @click="guardarPlan">Crear</UButton>
      </template>
    </UModal>

    <UModal v-model:open="modalItemAbierto" title="Agregar ítem al plan">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Riesgo sugerido" name="riesgo" help="Sugerencias con señales reales: riesgo inherente, historial de hallazgos, si ya tiene control automatizado.">
            <USelect
              v-model="riesgoElegido"
              :items="riesgoItems"
              value-key="value"
              class="w-full"
              :loading="cargandoSugerencias"
              @update:model-value="aplicarSugerencia"
            />
          </UFormField>
          <UFormField label="Proceso" name="proceso" required>
            <UInput v-model="proceso" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Prioridad" name="prioridad">
              <USelect v-model="prioridad" :items="PRIORIDAD_ITEMS" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Frecuencia" name="frecuencia">
              <UInput v-model="frecuencia" class="w-full" placeholder="Anual, trimestral..." />
            </UFormField>
          </div>
          <UFormField label="Período" name="periodo">
            <UInput v-model="periodo" class="w-full" />
          </UFormField>
          <p v-if="errorItem" class="text-sm text-error-600">{{ errorItem }}</p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="modalItemAbierto = false">Cancelar</UButton>
        <UButton :loading="guardandoItem" :disabled="!proceso.trim()" @click="guardarItem">Guardar</UButton>
      </template>
    </UModal>
  </div>
</template>
