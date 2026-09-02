<script setup lang="ts">
// Normativa (PROMPT AUDITORÍA §65): cada auditoría de cumplimiento registra
// norma + artículo (vía fundamento_normativo, "la matriz normativa de Fase
// 18 de contabilidad") + vigencia + criterio + evidencia + resultado.
const tenantStore = useTenantStore()
const auditoriaStore = useAuditoriaStore()
const fundamentoStore = useFundamentoNormativoStore()

const puedeEscribir = computed(() => tenantStore.role === 'auditor' || tenantStore.role === 'administrador')
const puedeEliminar = computed(() => tenantStore.role === 'administrador')

const engagementsCumplimiento = computed(() =>
  auditoriaStore.engagements.filter((e) => e.tipo === 'CUMPLIMIENTO'),
)

const engagementSeleccionado = ref<string | null>(null)
const engagement = computed(() => auditoriaStore.engagements.find((e) => e.id === engagementSeleccionado.value) ?? null)

const cargandoItems = ref(false)
async function seleccionarEngagement(engagementId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  engagementSeleccionado.value = engagementId
  cargandoItems.value = true
  try {
    await auditoriaStore.cargarNormativaPorEngagement(tenantId, engagementId)
  } finally {
    cargandoItems.value = false
  }
}

onMounted(() => {
  if (fundamentoStore.fundamentos.length === 0) void fundamentoStore.cargarFundamentos()
})

function fundamento(id: number) {
  return fundamentoStore.fundamentos.find((f) => f.id === id) ?? null
}

// ── Agregar ítem ────────────────────────────────────────────────────────
const modalAbierto = ref(false)
const fundamentoId = ref<number | undefined>(undefined)
const vigencia = ref('')
const criterio = ref('')
const evidenciaTexto = ref('')
const guardando = ref(false)
const errorGuardado = ref<string | null>(null)

const opcionesFundamento = computed(() =>
  fundamentoStore.fundamentos.map((f) => ({
    label: f.articulo ? `${f.norma} · art. ${f.articulo}` : f.norma,
    value: f.id,
  })),
)

function abrirModal(): void {
  fundamentoId.value = opcionesFundamento.value[0]?.value
  vigencia.value = ''
  criterio.value = ''
  evidenciaTexto.value = ''
  errorGuardado.value = null
  modalAbierto.value = true
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !engagement.value || fundamentoId.value === undefined || !vigencia.value || !criterio.value.trim()) return
  guardando.value = true
  errorGuardado.value = null
  try {
    await auditoriaStore.crearNormativa(tenantId, {
      engagement_id: engagement.value.id,
      fundamento_normativo_id: fundamentoId.value,
      vigencia: vigencia.value,
      criterio: criterio.value.trim(),
      evidencia: evidenciaTexto.value.trim() ? evidenciaTexto.value.split(',').map((s) => s.trim()).filter(Boolean) : null,
      resultado: 'PENDIENTE',
      observaciones: null,
    })
    modalAbierto.value = false
  } catch (error) {
    errorGuardado.value = mensajeError(error, 'No se pudo guardar el ítem normativo.')
  } finally {
    guardando.value = false
  }
}

async function cambiarResultado(normativaId: string, resultado: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await auditoriaStore.actualizarNormativa(tenantId, normativaId, { resultado })
}

async function eliminarItem(normativaId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await auditoriaStore.eliminarNormativa(tenantId, normativaId)
}

const RESULTADO_ITEMS = [
  { label: 'Pendiente', value: 'PENDIENTE' },
  { label: 'Cumple', value: 'CUMPLE' },
  { label: 'Parcial', value: 'PARCIAL' },
  { label: 'No cumple', value: 'NO_CUMPLE' },
]

const COLOR_RESULTADO: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  CUMPLE: 'success',
  PARCIAL: 'warning',
  NO_CUMPLE: 'error',
  PENDIENTE: 'neutral',
}

function fecha(iso: string | null): string {
  if (!iso) return '—'
  // vigencia es `date` (sin hora) — parsear con new Date(iso) lo interpreta como
  // medianoche UTC y, en zonas horarias negativas (es-CO), toLocaleDateString
  // lo corre un día atrás. Se arma la fecha en local time desde los componentes.
  const [anio, mes, dia] = iso.split('-').map(Number)
  return new Date(anio!, mes! - 1, dia!).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="!engagementSeleccionado" class="space-y-4">
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        Auditorías de tipo Cumplimiento — cada una documenta norma, artículo, vigencia, criterio, evidencia y resultado (§65).
      </p>
      <div v-if="engagementsCumplimiento.length === 0" class="text-sm text-neutral-500 py-8 text-center">
        Sin auditorías de cumplimiento registradas. Crea una auditoría con tipo "Cumplimiento" en la pestaña Auditorías.
      </div>
      <div v-else class="space-y-2">
        <button
          v-for="e in engagementsCumplimiento"
          :key="e.id"
          type="button"
          class="w-full text-left border border-neutral-200 dark:border-neutral-800 rounded-md p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 flex items-center justify-between gap-3"
          @click="seleccionarEngagement(e.id)"
        >
          <span class="text-sm font-medium text-neutral-900 dark:text-neutral-100">{{ e.nombre }}</span>
          <UBadge color="neutral" variant="subtle">{{ e.estado.replace('_', ' ') }}</UBadge>
        </button>
      </div>
    </div>

    <div v-else class="space-y-4">
      <div class="flex items-center justify-between gap-3">
        <UButton icon="i-lucide-arrow-left" size="sm" color="neutral" variant="ghost" @click="engagementSeleccionado = null">
          Auditorías de cumplimiento
        </UButton>
        <UButton v-if="puedeEscribir" icon="i-lucide-plus" size="sm" @click="abrirModal">
          Agregar ítem
        </UButton>
      </div>

      <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">{{ engagement?.nombre }}</h3>

      <div v-if="cargandoItems" class="text-sm text-neutral-500 py-8 text-center">Cargando…</div>
      <div v-else-if="auditoriaStore.normativa.length === 0" class="text-sm text-neutral-500 py-8 text-center">
        Sin normativa documentada en esta auditoría todavía.
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="item in auditoriaStore.normativa"
          :key="item.id"
          class="border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-2"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {{ fundamento(item.fundamento_normativo_id)?.norma ?? '—' }}
                <span v-if="fundamento(item.fundamento_normativo_id)?.articulo" class="text-neutral-500 font-normal">
                  · art. {{ fundamento(item.fundamento_normativo_id)?.articulo }}
                </span>
              </p>
              <p class="text-xs text-neutral-500 dark:text-neutral-400">Vigencia: {{ fecha(item.vigencia) }}</p>
            </div>
            <UButton
              v-if="puedeEliminar"
              icon="i-lucide-trash-2"
              size="xs"
              color="error"
              variant="ghost"
              @click="eliminarItem(item.id)"
            />
          </div>
          <p class="text-sm text-neutral-700 dark:text-neutral-300">{{ item.criterio }}</p>
          <div v-if="item.evidencia?.length" class="flex flex-wrap gap-1">
            <UBadge v-for="(e, i) in item.evidencia" :key="i" color="neutral" variant="subtle" size="xs">{{ e }}</UBadge>
          </div>
          <div class="flex items-center gap-2">
            <USelect
              v-if="puedeEscribir"
              :model-value="item.resultado"
              :items="RESULTADO_ITEMS"
              value-key="value"
              size="xs"
              class="w-40"
              @update:model-value="(v) => cambiarResultado(item.id, v as string)"
            />
            <UBadge v-else :color="COLOR_RESULTADO[item.resultado] ?? 'neutral'" variant="subtle">
              {{ item.resultado.replace('_', ' ') }}
            </UBadge>
          </div>
        </div>
      </div>
    </div>

    <UModal v-model:open="modalAbierto" title="Agregar ítem normativo">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Norma" name="fundamento_normativo_id" required>
            <USelect v-model="fundamentoId" :items="opcionesFundamento" value-key="value" class="w-full" />
          </UFormField>
          <UFormField
            label="Vigencia"
            name="vigencia"
            required
            help="Fecha/versión concreta contra la que se probó — nunca 'norma vigente' sin especificar (§65)."
          >
            <UInput v-model="vigencia" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Criterio" name="criterio" required>
            <UTextarea v-model="criterio" class="w-full" :rows="2" autoresize placeholder="Qué exige la norma..." />
          </UFormField>
          <UFormField label="Evidencia" name="evidencia" help="Separada por comas.">
            <UInput v-model="evidenciaTexto" class="w-full" placeholder="Acta de asamblea, reglamento firmado..." />
          </UFormField>
          <p v-if="errorGuardado" class="text-sm text-error-600">{{ errorGuardado }}</p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="modalAbierto = false">Cancelar</UButton>
        <UButton
          :loading="guardando"
          :disabled="fundamentoId === undefined || !vigencia || !criterio.trim()"
          @click="guardar"
        >
          Guardar
        </UButton>
      </template>
    </UModal>
  </div>
</template>
