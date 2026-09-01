<script setup lang="ts">
const tenantStore = useTenantStore()
const auditoriaStore = useAuditoriaStore()

const puedeEscribir = computed(() => tenantStore.role === 'auditor' || tenantStore.role === 'administrador')

const modalAbierto = ref(false)
const guardando = ref(false)
const errorGuardado = ref<string | null>(null)

const nombre = ref('')
const objetivo = ref('')
const proceso = ref('')
const riesgoId = ref<string | undefined>(undefined)
const tipo = ref<'PREVENTIVO' | 'DETECTIVO' | 'CORRECTIVO'>('PREVENTIVO')
const automatizado = ref(false)
const manual = ref(true)
const frecuencia = ref('')
const responsable = ref('')
type CodigoAutomatico = (typeof CONTROLES_AUTOMATICOS)[number]['value']
const codigoAutomatico = ref<CodigoAutomatico | undefined>(undefined)

const TIPO_ITEMS = [
  { label: 'Preventivo', value: 'PREVENTIVO' },
  { label: 'Detectivo', value: 'DETECTIVO' },
  { label: 'Correctivo', value: 'CORRECTIVO' },
]

const CODIGO_AUTOMATICO_ITEMS = CONTROLES_AUTOMATICOS.map((c) => ({ label: c.label, value: c.value }))

const riesgoItems = computed(() =>
  auditoriaStore.riesgos.map((r) => ({ label: r.nombre, value: r.id })),
)
const engagementItems = computed(() =>
  auditoriaStore.engagements.map((e) => ({ label: e.nombre, value: e.id })),
)

function etiquetaControlAutomatico(codigo: string | null): string {
  return CONTROLES_AUTOMATICOS.find((c) => c.value === codigo)?.label ?? codigo ?? ''
}

function abrirModal(): void {
  nombre.value = ''
  objetivo.value = ''
  proceso.value = ''
  riesgoId.value = auditoriaStore.riesgos[0]?.id
  tipo.value = 'PREVENTIVO'
  automatizado.value = false
  manual.value = true
  frecuencia.value = ''
  responsable.value = ''
  codigoAutomatico.value = undefined
  errorGuardado.value = null
  modalAbierto.value = true
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nombre.value.trim() || !riesgoId.value) return
  guardando.value = true
  errorGuardado.value = null
  try {
    await auditoriaStore.crearControl(tenantId, {
      riesgo_id: riesgoId.value,
      nombre: nombre.value.trim(),
      objetivo: objetivo.value.trim() || null,
      proceso: proceso.value.trim() || null,
      tipo: tipo.value,
      automatizado: automatizado.value,
      manual: manual.value,
      frecuencia: frecuencia.value.trim() || null,
      responsable: responsable.value.trim() || null,
      evidencia: null,
      codigo_automatico: automatizado.value ? (codigoAutomatico.value ?? null) : null,
    })
    modalAbierto.value = false
  } catch (error) {
    errorGuardado.value = mensajeError(error, 'No se pudo guardar el control.')
  } finally {
    guardando.value = false
  }
}

// ── Ejecución de controles automáticos (Continuous Control Monitoring) ────
const engagementSeleccionado = reactive<Record<string, string | undefined>>({})
const ejecutando = reactive<Record<string, boolean>>({})
const ultimoResultado = reactive<Record<string, ResultadoEjecucionControl | undefined>>({})
const errorEjecucion = reactive<Record<string, string>>({})

async function ejecutar(controlId: string): Promise<void> {
  const engagementId = engagementSeleccionado[controlId]
  if (!engagementId) {
    errorEjecucion[controlId] = 'Selecciona la auditoría a la que se asocia esta ejecución.'
    return
  }
  errorEjecucion[controlId] = ''
  ejecutando[controlId] = true
  try {
    ultimoResultado[controlId] = await auditoriaStore.ejecutarControlAutomatico(controlId, engagementId)
  } catch (error) {
    errorEjecucion[controlId] = mensajeError(error, 'No se pudo ejecutar el control.')
  } finally {
    ejecutando[controlId] = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-end">
      <UButton
        v-if="puedeEscribir"
        icon="i-lucide-plus"
        size="sm"
        :disabled="auditoriaStore.riesgos.length === 0"
        :title="auditoriaStore.riesgos.length === 0 ? 'Registra un riesgo primero' : undefined"
        @click="abrirModal"
      >
        Nuevo control
      </UButton>
    </div>

    <div v-if="auditoriaStore.controles.length === 0" class="text-sm text-neutral-500 py-8 text-center">
      Sin controles definidos. Un control se asocia a un riesgo para mitigarlo.
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="control in auditoriaStore.controles"
        :key="control.id"
        class="border border-neutral-200 dark:border-neutral-800 rounded-md p-4"
      >
        <h3 class="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1">{{ control.nombre }}</h3>
        <p v-if="control.objetivo" class="text-xs text-neutral-500 dark:text-neutral-400 mb-2">{{ control.objetivo }}</p>
        <div class="flex flex-wrap gap-2">
          <UBadge color="neutral" variant="subtle" size="xs">{{ control.tipo }}</UBadge>
          <UBadge :color="control.automatizado ? 'info' : 'neutral'" variant="subtle" size="xs">
            {{ control.automatizado ? 'Automático' : 'Manual' }}
          </UBadge>
          <UBadge v-if="control.frecuencia" color="neutral" variant="subtle" size="xs">{{ control.frecuencia }}</UBadge>
          <UBadge v-if="control.codigo_automatico" color="neutral" variant="subtle" size="xs">
            {{ etiquetaControlAutomatico(control.codigo_automatico) }}
          </UBadge>
        </div>

        <div v-if="puedeEscribir && control.automatizado && control.codigo_automatico" class="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <USelect
              v-model="engagementSeleccionado[control.id]"
              :items="engagementItems"
              value-key="value"
              placeholder="Auditoría..."
              size="xs"
              class="w-56"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              :loading="ejecutando[control.id]"
              @click="ejecutar(control.id)"
            >
              Ejecutar ahora
            </UButton>
            <UBadge
              v-if="ultimoResultado[control.id]"
              :color="ultimoResultado[control.id]!.resultado === 'PASS' ? 'success'
                : ultimoResultado[control.id]!.resultado === 'REVIEW' ? 'warning' : 'error'"
              variant="subtle"
            >
              {{ ultimoResultado[control.id]!.resultado }} · {{ ultimoResultado[control.id]!.conteo }} excepción(es)
            </UBadge>
          </div>
          <p v-if="ultimoResultado[control.id]?.hallazgo_id" class="text-xs text-neutral-500 dark:text-neutral-400">
            Se creó un hallazgo automáticamente — revísalo en la pestaña Hallazgos.
          </p>
          <p v-if="errorEjecucion[control.id]" class="text-xs text-error-600">{{ errorEjecucion[control.id] }}</p>
        </div>
      </div>
    </div>

    <UModal v-model:open="modalAbierto" title="Nuevo control">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Riesgo mitigado" name="riesgoId" required>
            <USelect v-model="riesgoId" :items="riesgoItems" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Nombre" name="nombre" required>
            <UInput v-model="nombre" class="w-full" />
          </UFormField>
          <UFormField label="Objetivo" name="objetivo">
            <UTextarea v-model="objetivo" class="w-full" :rows="2" autoresize />
          </UFormField>
          <UFormField label="Proceso cubierto" name="proceso">
            <UInput v-model="proceso" class="w-full" placeholder="Cartera, Recaudo, Contabilidad..." />
          </UFormField>
          <UFormField label="Tipo" name="tipo" required>
            <USelect v-model="tipo" :items="TIPO_ITEMS" value-key="value" class="w-full" />
          </UFormField>
          <div class="flex items-center gap-6">
            <UCheckbox v-model="automatizado" label="Automatizado" />
            <UCheckbox v-model="manual" label="Manual" />
          </div>
          <UFormField
            v-if="automatizado"
            label="Prueba automática"
            name="codigoAutomatico"
            required
            hint="Continuous Control Monitoring — qué prueba SQL ejecuta este control"
          >
            <USelect v-model="codigoAutomatico" :items="CODIGO_AUTOMATICO_ITEMS" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Frecuencia" name="frecuencia">
            <UInput v-model="frecuencia" class="w-full" placeholder="Diaria, mensual, ad hoc..." />
          </UFormField>
          <UFormField label="Responsable" name="responsable">
            <UInput v-model="responsable" class="w-full" />
          </UFormField>
          <p v-if="errorGuardado" class="text-sm text-error-600">{{ errorGuardado }}</p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="modalAbierto = false">Cancelar</UButton>
        <UButton
          :loading="guardando"
          :disabled="!nombre.trim() || !riesgoId || (automatizado && !codigoAutomatico)"
          @click="guardar"
        >
          Guardar
        </UButton>
      </template>
    </UModal>
  </div>
</template>
