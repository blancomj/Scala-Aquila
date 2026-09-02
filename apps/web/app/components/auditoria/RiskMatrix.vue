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
      prioridad: null,
      version: 1,
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

// ── Reincidencia (§61) — cuenta hallazgos reincidentes por riesgo, vía
// riesgo_id directo o vía el control que los generó, para avisar que la
// prioridad del riesgo probablemente deba subir. Nunca se sube sola.
const reincidenciasPorRiesgo = computed(() => {
  const mapa = new Map<string, number>()
  for (const h of auditoriaStore.hallazgos) {
    if (!h.reincidente) continue
    const riesgoId = h.riesgo_id ?? auditoriaStore.controles.find((c) => c.id === h.control_id)?.riesgo_id
    if (!riesgoId) continue
    mapa.set(riesgoId, (mapa.get(riesgoId) ?? 0) + 1)
  }
  return mapa
})

const PRIORIDAD_ITEMS = [
  { label: 'Alta', value: 'ALTA' },
  { label: 'Media', value: 'MEDIA' },
  { label: 'Baja', value: 'BAJA' },
]

const COLOR_PRIORIDAD: Record<string, 'error' | 'warning' | 'neutral'> = {
  ALTA: 'error',
  MEDIA: 'warning',
  BAJA: 'neutral',
}

// ── Editar riesgo (probabilidad/impacto/prioridad) ─────────────────────
const modalEditarAbierto = ref(false)
const riesgoEditandoId = ref<string | null>(null)
const probEdit = ref(3)
const impactoEdit = ref(3)
const prioridadEdit = ref<'ALTA' | 'MEDIA' | 'BAJA' | undefined>(undefined)
const guardandoEdit = ref(false)
const errorEdit = ref<string | null>(null)

function abrirModalEditar(riesgo: (typeof auditoriaStore.riesgos)[number]): void {
  riesgoEditandoId.value = riesgo.id
  probEdit.value = riesgo.probabilidad
  impactoEdit.value = riesgo.impacto
  prioridadEdit.value = (riesgo.prioridad as 'ALTA' | 'MEDIA' | 'BAJA' | null) ?? undefined
  errorEdit.value = null
  modalEditarAbierto.value = true
}

async function guardarEdit(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !riesgoEditandoId.value) return
  guardandoEdit.value = true
  errorEdit.value = null
  try {
    await auditoriaStore.actualizarRiesgo(tenantId, riesgoEditandoId.value, {
      probabilidad: probEdit.value,
      impacto: impactoEdit.value,
      prioridad: prioridadEdit.value ?? null,
    })
    modalEditarAbierto.value = false
  } catch (error) {
    errorEdit.value = mensajeError(error, 'No se pudo actualizar el riesgo.')
  } finally {
    guardandoEdit.value = false
  }
}

// ── Riesgo residual (§63) — historial insert-only, nunca se sobrescribe ──
const riesgoResidualAbierto = ref<string | null>(null)
const cargandoResidual = ref(false)

async function alternarResidual(riesgoId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (riesgoResidualAbierto.value === riesgoId) {
    riesgoResidualAbierto.value = null
    return
  }
  riesgoResidualAbierto.value = riesgoId
  if (!tenantId) return
  cargandoResidual.value = true
  try {
    await auditoriaStore.cargarResidualHistorial(tenantId, riesgoId)
  } finally {
    cargandoResidual.value = false
  }
}

/** Acciones ya cerradas de este riesgo — para vincular el recálculo a la que lo motivó (§63, trazabilidad hacia §91). */
function accionesCerradasDelRiesgo(riesgoId: string) {
  const hallazgoIds = new Set(
    auditoriaStore.hallazgos
      .filter((h) => h.riesgo_id === riesgoId || auditoriaStore.controles.find((c) => c.id === h.control_id)?.riesgo_id === riesgoId)
      .map((h) => h.id),
  )
  return auditoriaStore.acciones.filter((a) => hallazgoIds.has(a.hallazgo_id) && a.estado === 'CERRADA')
}

const modalResidualAbierto = ref(false)
const probResidual = ref(3)
const impactoResidual = ref(3)
const motivoResidual = ref('')
const accionResidualId = ref<string | undefined>(undefined)
const guardandoResidual = ref(false)
const errorResidual = ref<string | null>(null)

function abrirModalResidual(riesgo: (typeof auditoriaStore.riesgos)[number]): void {
  probResidual.value = riesgo.probabilidad
  impactoResidual.value = riesgo.impacto
  motivoResidual.value = ''
  accionResidualId.value = undefined
  errorResidual.value = null
  modalResidualAbierto.value = true
}

async function guardarResidual(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const riesgoId = riesgoResidualAbierto.value
  if (!tenantId || !riesgoId || !motivoResidual.value.trim()) return
  guardandoResidual.value = true
  errorResidual.value = null
  try {
    await auditoriaStore.registrarResidual(tenantId, {
      riesgo_id: riesgoId,
      probabilidad: probResidual.value,
      impacto: impactoResidual.value,
      motivo: motivoResidual.value.trim(),
      accion_id: accionResidualId.value ?? null,
    })
    modalResidualAbierto.value = false
  } catch (error) {
    errorResidual.value = mensajeError(error, 'No se pudo registrar el riesgo residual.')
  } finally {
    guardandoResidual.value = false
  }
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
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
        class="border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-2"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <h3 class="text-sm font-medium text-neutral-900 dark:text-neutral-100">{{ riesgo.nombre }}</h3>
            <p v-if="riesgo.descripcion" class="text-xs text-neutral-500 dark:text-neutral-400">{{ riesgo.descripcion }}</p>
            <div class="flex flex-wrap gap-1.5">
              <UBadge color="neutral" variant="subtle" size="xs">{{ riesgo.categoria }}</UBadge>
              <UBadge color="neutral" variant="subtle" size="xs">v{{ riesgo.version }}</UBadge>
              <UBadge v-if="riesgo.prioridad" :color="COLOR_PRIORIDAD[riesgo.prioridad] ?? 'neutral'" variant="subtle" size="xs">
                Prioridad {{ riesgo.prioridad }}
              </UBadge>
              <UBadge v-if="reincidenciasPorRiesgo.get(riesgo.id)" color="error" variant="subtle" size="xs">
                {{ reincidenciasPorRiesgo.get(riesgo.id) }} reincidencia(s) — revisar prioridad
              </UBadge>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UBadge :color="colorRiesgo(riesgo.riesgo_inherente)" variant="subtle">
              {{ riesgo.riesgo_inherente ?? riesgo.probabilidad * riesgo.impacto }}
            </UBadge>
            <UButton v-if="puedeEscribir" icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" @click="abrirModalEditar(riesgo)" />
          </div>
        </div>

        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-history" @click="alternarResidual(riesgo.id)">
          Riesgo residual
        </UButton>

        <div v-if="riesgoResidualAbierto === riesgo.id" class="pt-2 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
          <div v-if="cargandoResidual" class="text-xs text-neutral-500 py-2 text-center">Cargando…</div>
          <template v-else>
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs text-neutral-500 dark:text-neutral-400">
                <span v-if="auditoriaStore.residualHistorial.length === 0">Sin evaluación de riesgo residual todavía.</span>
                <span v-else>
                  Residual vigente:
                  <span class="font-medium text-neutral-900 dark:text-neutral-100">{{ auditoriaStore.residualHistorial[0]!.riesgo_residual }}</span>
                  ({{ fecha(auditoriaStore.residualHistorial[0]!.created_at) }})
                </span>
              </p>
              <UButton v-if="puedeEscribir" size="xs" variant="outline" @click="abrirModalResidual(riesgo)">Recalcular</UButton>
            </div>
            <div v-if="auditoriaStore.residualHistorial.length > 1" class="space-y-1">
              <p class="text-[11px] uppercase tracking-wide text-neutral-400">Historial (nunca se borra)</p>
              <div
                v-for="entrada in auditoriaStore.residualHistorial.slice(1)"
                :key="entrada.id"
                class="text-xs text-neutral-500 dark:text-neutral-400 flex items-center justify-between gap-2"
              >
                <span>{{ entrada.riesgo_residual }} · {{ entrada.motivo }}</span>
                <span>{{ fecha(entrada.created_at) }}</span>
              </div>
            </div>
          </template>
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

    <UModal v-model:open="modalEditarAbierto" title="Editar riesgo">
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Probabilidad" name="probEdit" required>
              <USelect v-model="probEdit" :items="ESCALA_ITEMS" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Impacto" name="impactoEdit" required>
              <USelect v-model="impactoEdit" :items="ESCALA_ITEMS" value-key="value" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Prioridad" name="prioridadEdit" help="Súbela cuando el riesgo tenga hallazgos reincidentes (§61).">
            <USelect v-model="prioridadEdit" :items="PRIORIDAD_ITEMS" value-key="value" class="w-full" />
          </UFormField>
          <p v-if="errorEdit" class="text-sm text-error-600">{{ errorEdit }}</p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="modalEditarAbierto = false">Cancelar</UButton>
        <UButton :loading="guardandoEdit" @click="guardarEdit">Guardar</UButton>
      </template>
    </UModal>

    <UModal v-model:open="modalResidualAbierto" title="Recalcular riesgo residual">
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Probabilidad" name="probResidual" required>
              <USelect v-model="probResidual" :items="ESCALA_ITEMS" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Impacto" name="impactoResidual" required>
              <USelect v-model="impactoResidual" :items="ESCALA_ITEMS" value-key="value" class="w-full" />
            </UFormField>
          </div>
          <UFormField
            label="Motivo"
            name="motivoResidual"
            required
            help="Qué cambió — típicamente qué acciones se cerraron y por qué eso reduce (o no) el riesgo."
          >
            <UTextarea v-model="motivoResidual" class="w-full" :rows="3" autoresize />
          </UFormField>
          <UFormField
            v-if="riesgoResidualAbierto && accionesCerradasDelRiesgo(riesgoResidualAbierto).length > 0"
            label="Acción que motiva el recálculo"
            name="accionResidualId"
          >
            <USelect
              v-model="accionResidualId"
              :items="accionesCerradasDelRiesgo(riesgoResidualAbierto).map((a) => ({ label: a.accion, value: a.id }))"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <p v-if="errorResidual" class="text-sm text-error-600">{{ errorResidual }}</p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="modalResidualAbierto = false">Cancelar</UButton>
        <UButton :loading="guardandoResidual" :disabled="!motivoResidual.trim()" @click="guardarResidual">Guardar</UButton>
      </template>
    </UModal>
  </div>
</template>
