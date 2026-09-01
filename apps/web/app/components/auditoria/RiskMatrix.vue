<script setup lang="ts">
const tenantStore = useTenantStore()
const auditoriaStore = useAuditoriaStore()

const puedeEscribir = computed(() => tenantStore.role === 'auditor' || tenantStore.role === 'administrador')

const modalAbierto = ref(false)
const guardando = ref(false)
const errorGuardado = ref<string | null>(null)

const nombre = ref('')
const descripcion = ref('')
const categoria = ref('OPERATIVO')
const probabilidad = ref(3)
const impacto = ref(3)

const CATEGORIAS = [
  'FINANCIERO', 'CONTABLE', 'TRIBUTARIO', 'OPERATIVO', 'FRAUDE', 'CORRUPCION', 'ERROR',
  'CARTERA', 'LIQUIDACION', 'TESORERIA', 'TECNOLOGICO', 'CIBERSEGURIDAD', 'ACCESO', 'DATOS',
  'DOCUMENTAL', 'CUMPLIMIENTO', 'REPUTACIONAL', 'LEGAL', 'GOBIERNO',
].map((v) => ({ label: v, value: v }))

const ESCALA_ITEMS = [1, 2, 3, 4, 5].map((n) => ({
  label: `${n} · ${{ 1: 'Muy bajo', 2: 'Bajo', 3: 'Medio', 4: 'Alto', 5: 'Crítico' }[n]}`,
  value: n,
}))

function abrirModal(): void {
  nombre.value = ''
  descripcion.value = ''
  categoria.value = 'OPERATIVO'
  probabilidad.value = 3
  impacto.value = 3
  errorGuardado.value = null
  modalAbierto.value = true
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nombre.value.trim()) return
  guardando.value = true
  errorGuardado.value = null
  try {
    await auditoriaStore.crearRiesgo(tenantId, {
      nombre: nombre.value.trim(),
      descripcion: descripcion.value.trim() || null,
      categoria: categoria.value,
      probabilidad: probabilidad.value,
      impacto: impacto.value,
    })
    modalAbierto.value = false
  } catch (error) {
    errorGuardado.value = mensajeError(error, 'No se pudo guardar el riesgo.')
  } finally {
    guardando.value = false
  }
}

function colorRiesgo(riesgoInherente: number | null): 'error' | 'warning' | 'neutral' | 'success' {
  const valor = riesgoInherente ?? 0
  if (valor >= 16) return 'error'
  if (valor >= 9) return 'warning'
  if (valor >= 4) return 'neutral'
  return 'success'
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-end">
      <UButton v-if="puedeEscribir" icon="i-lucide-plus" size="sm" @click="abrirModal">
        Nuevo riesgo
      </UButton>
    </div>

    <div v-if="auditoriaStore.riesgos.length === 0" class="text-sm text-neutral-500 py-8 text-center">
      Sin riesgos registrados. Identificar riesgos es el primer paso del circuito de auditoría (Gobierno → Riesgo → Control).
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="riesgo in auditoriaStore.riesgos"
        :key="riesgo.id"
        class="border border-neutral-200 dark:border-neutral-800 rounded-md p-4"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <h3 class="text-sm font-medium text-neutral-900 dark:text-neutral-100">{{ riesgo.nombre }}</h3>
            <p v-if="riesgo.descripcion" class="text-xs text-neutral-500 dark:text-neutral-400">{{ riesgo.descripcion }}</p>
            <UBadge color="neutral" variant="subtle" size="xs">{{ riesgo.categoria }}</UBadge>
          </div>
          <UBadge :color="colorRiesgo(riesgo.riesgo_inherente)" variant="subtle">
            {{ riesgo.riesgo_inherente ?? riesgo.probabilidad * riesgo.impacto }}
          </UBadge>
        </div>
      </div>
    </div>

    <UModal v-model:open="modalAbierto" title="Nuevo riesgo">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Nombre" name="nombre" required>
            <UInput v-model="nombre" class="w-full" />
          </UFormField>
          <UFormField label="Descripción" name="descripcion">
            <UTextarea v-model="descripcion" class="w-full" :rows="3" autoresize />
          </UFormField>
          <UFormField label="Categoría" name="categoria" required>
            <USelect v-model="categoria" :items="CATEGORIAS" value-key="value" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Probabilidad" name="probabilidad" required>
              <USelect v-model="probabilidad" :items="ESCALA_ITEMS" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Impacto" name="impacto" required>
              <USelect v-model="impacto" :items="ESCALA_ITEMS" value-key="value" class="w-full" />
            </UFormField>
          </div>
          <p v-if="errorGuardado" class="text-sm text-error-600">{{ errorGuardado }}</p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="modalAbierto = false">Cancelar</UButton>
        <UButton :loading="guardando" :disabled="!nombre.trim()" @click="guardar">Guardar</UButton>
      </template>
    </UModal>
  </div>
</template>
