<script setup lang="ts">
const tenantStore = useTenantStore()
const auditoriaStore = useAuditoriaStore()

const puedeEscribir = computed(() => tenantStore.role === 'auditor' || tenantStore.role === 'administrador')

const modalAbierto = ref(false)
const guardando = ref(false)
const errorGuardado = ref<string | null>(null)
const erroresCierre = reactive<Record<string, string>>({})

const engagementId = ref<string | undefined>(undefined)
const proceso = ref('')
const riesgoId = ref<string | undefined>(undefined)
const criterio = ref('')
const condicion = ref('')
const causa = ref('')
const efecto = ref('')
const nivel = ref<'CRITICO' | 'ALTO' | 'MEDIO' | 'BAJO' | 'OBSERVACION'>('MEDIO')
const recomendacion = ref('')
const reincidente = ref(false)
const hallazgoAnteriorId = ref<string | undefined>(undefined)
const causaComun = ref('')

const NIVEL_ITEMS = [
  { label: 'Crítico', value: 'CRITICO' },
  { label: 'Alto', value: 'ALTO' },
  { label: 'Medio', value: 'MEDIO' },
  { label: 'Bajo', value: 'BAJO' },
  { label: 'Observación', value: 'OBSERVACION' },
]

const engagementItems = computed(() =>
  auditoriaStore.engagements.map((e) => ({ label: e.nombre, value: e.id })),
)
const riesgoItems = computed(() => [
  { label: 'Sin riesgo asociado', value: undefined },
  ...auditoriaStore.riesgos.map((r) => ({ label: r.nombre, value: r.id })),
])
const hallazgoAnteriorItems = computed(() =>
  auditoriaStore.hallazgos.map((h) => ({ label: `${h.proceso}${h.condicion ? ' · ' + h.condicion : ''}`, value: h.id })),
)

const COLOR_NIVEL: Record<string, 'error' | 'warning' | 'neutral' | 'success'> = {
  CRITICO: 'error',
  ALTO: 'warning',
  MEDIO: 'neutral',
  BAJO: 'success',
  OBSERVACION: 'neutral',
}

function abrirModal(): void {
  engagementId.value = auditoriaStore.engagements[0]?.id
  proceso.value = ''
  riesgoId.value = undefined
  criterio.value = ''
  condicion.value = ''
  causa.value = ''
  efecto.value = ''
  nivel.value = 'MEDIO'
  recomendacion.value = ''
  reincidente.value = false
  hallazgoAnteriorId.value = undefined
  causaComun.value = ''
  errorGuardado.value = null
  modalAbierto.value = true
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !engagementId.value || !proceso.value.trim()) return
  if (reincidente.value && (!hallazgoAnteriorId.value || !causaComun.value.trim())) return
  guardando.value = true
  errorGuardado.value = null
  try {
    await auditoriaStore.crearHallazgo(tenantId, {
      engagement_id: engagementId.value,
      proceso: proceso.value.trim(),
      riesgo_id: riesgoId.value ?? null,
      // Solo auditoria_control_ejecutar() lo llena (§76-79) — un hallazgo
      // creado a mano por un auditor no viene de un control automático.
      control_id: null,
      criterio: criterio.value.trim() || null,
      condicion: condicion.value.trim() || null,
      causa: causa.value.trim() || null,
      efecto: efecto.value.trim() || null,
      nivel: nivel.value,
      recomendacion: recomendacion.value.trim() || null,
      responsable: null,
      fecha_compromiso: null,
      estado: 'ABIERTO',
      evidencia: null,
      // HALLAZGO_REINCIDENTE (§61) — lo marca el auditor, no se infiere.
      reincidente: reincidente.value,
      hallazgo_anterior_id: reincidente.value ? (hallazgoAnteriorId.value ?? null) : null,
      causa_comun: reincidente.value ? causaComun.value.trim() : null,
    })
    modalAbierto.value = false
  } catch (error) {
    errorGuardado.value = mensajeError(error, 'No se pudo guardar el hallazgo.')
  } finally {
    guardando.value = false
  }
}

async function cerrar(hallazgoId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  erroresCierre[hallazgoId] = ''
  try {
    await auditoriaStore.cerrarHallazgo(tenantId, hallazgoId)
  } catch (error) {
    const mensaje = mensajeError(error, 'No se pudo cerrar el hallazgo.')
    erroresCierre[hallazgoId] = mensaje.includes('AUD-SOD')
      ? 'Quien crea un hallazgo no puede cerrarlo — pide a otra persona con rol auditor/administrador que lo revise.'
      : mensaje.includes('AUD-CIERRE')
        ? 'No se puede cerrar sin evidencia registrada.'
        : mensaje
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
        :disabled="auditoriaStore.engagements.length === 0"
        :title="auditoriaStore.engagements.length === 0 ? 'Crea una auditoría primero' : undefined"
        @click="abrirModal"
      >
        Nuevo hallazgo
      </UButton>
    </div>

    <div v-if="auditoriaStore.hallazgos.length === 0" class="text-sm text-neutral-500 py-8 text-center">
      Sin hallazgos registrados. Un hallazgo se crea al ejecutar una auditoría o detectar una excepción.
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="hallazgo in auditoriaStore.hallazgos"
        :key="hallazgo.id"
        class="border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-2"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1 flex-1">
            <h3 class="text-sm font-medium text-neutral-900 dark:text-neutral-100">{{ hallazgo.proceso }}</h3>
            <p v-if="hallazgo.condicion" class="text-xs text-neutral-500 dark:text-neutral-400">{{ hallazgo.condicion }}</p>
          </div>
          <UBadge :color="COLOR_NIVEL[hallazgo.nivel]" variant="subtle">{{ hallazgo.nivel }}</UBadge>
        </div>
        <div class="flex items-center gap-x-4">
          <span class="text-xs text-neutral-500 dark:text-neutral-400">
            Fecha límite: {{ hallazgo.fecha_compromiso ? new Date(hallazgo.fecha_compromiso).toLocaleDateString('es-CO') : 'No definida' }}
          </span>
          <UBadge color="neutral" variant="subtle" size="xs">{{ hallazgo.estado.replace('_', ' ') }}</UBadge>
          <UBadge v-if="hallazgo.reincidente" color="error" variant="subtle" size="xs">Reincidente</UBadge>
        </div>
        <p v-if="hallazgo.reincidente && hallazgo.causa_comun" class="text-xs text-neutral-500 dark:text-neutral-400">
          Causa común: {{ hallazgo.causa_comun }}
        </p>
        <div v-if="puedeEscribir && hallazgo.estado !== 'CERRADO' && hallazgo.estado !== 'RECHAZADO'" class="pt-1">
          <UButton size="xs" color="neutral" variant="outline" @click="cerrar(hallazgo.id)">Cerrar hallazgo</UButton>
          <p v-if="erroresCierre[hallazgo.id]" class="text-xs text-error-600 mt-1">{{ erroresCierre[hallazgo.id] }}</p>
        </div>
      </div>
    </div>

    <UModal v-model:open="modalAbierto" title="Nuevo hallazgo">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Auditoría" name="engagementId" required>
            <USelect v-model="engagementId" :items="engagementItems" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Proceso" name="proceso" required>
            <UInput v-model="proceso" class="w-full" placeholder="Cartera, Recaudo, Contabilidad..." />
          </UFormField>
          <UFormField label="Riesgo asociado" name="riesgoId">
            <USelect v-model="riesgoId" :items="riesgoItems" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Criterio" name="criterio">
            <UTextarea v-model="criterio" class="w-full" :rows="2" autoresize placeholder="Norma, política o procedimiento aplicable" />
          </UFormField>
          <UFormField label="Condición" name="condicion">
            <UTextarea v-model="condicion" class="w-full" :rows="2" autoresize placeholder="Lo que se encontró" />
          </UFormField>
          <UFormField label="Causa" name="causa">
            <UTextarea v-model="causa" class="w-full" :rows="2" autoresize />
          </UFormField>
          <UFormField label="Efecto" name="efecto">
            <UTextarea v-model="efecto" class="w-full" :rows="2" autoresize />
          </UFormField>
          <UFormField label="Nivel" name="nivel" required>
            <USelect v-model="nivel" :items="NIVEL_ITEMS" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Recomendación" name="recomendacion">
            <UTextarea v-model="recomendacion" class="w-full" :rows="2" autoresize />
          </UFormField>
          <UCheckbox v-model="reincidente" label="Es reincidencia de un hallazgo anterior (HALLAZGO_REINCIDENTE, §61)" />
          <template v-if="reincidente">
            <UFormField label="Hallazgo anterior" name="hallazgoAnteriorId" required>
              <USelect v-model="hallazgoAnteriorId" :items="hallazgoAnteriorItems" value-key="value" class="w-full" />
            </UFormField>
            <UFormField
              label="Causa común"
              name="causaComun"
              required
              help="La recurrencia debe subir la prioridad del riesgo — revísala en la pestaña Riesgos."
            >
              <UTextarea v-model="causaComun" class="w-full" :rows="2" autoresize />
            </UFormField>
          </template>
          <p v-if="errorGuardado" class="text-sm text-error-600">{{ errorGuardado }}</p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="modalAbierto = false">Cancelar</UButton>
        <UButton
          :loading="guardando"
          :disabled="!engagementId || !proceso.trim() || (reincidente && (!hallazgoAnteriorId || !causaComun.trim()))"
          @click="guardar"
        >
          Guardar
        </UButton>
      </template>
    </UModal>
  </div>
</template>
