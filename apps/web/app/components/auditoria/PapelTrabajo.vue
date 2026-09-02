<script setup lang="ts">
// Papel de trabajo (PROMPT AUDITORÍA §35): "cada procedimiento debe generar
// un workpaper mínimo": Objetivo, Criterio, Procedimiento, Muestra,
// Resultado, Evidencia, Conclusión.
const tenantStore = useTenantStore()
const auditoriaStore = useAuditoriaStore()

const puedeEscribir = computed(() => tenantStore.role === 'auditor' || tenantStore.role === 'administrador')

const PRUEBA_TYPE_ITEMS = [
  { label: 'Inspección', value: 'INSPECCION' },
  { label: 'Observación', value: 'OBSERVACION' },
  { label: 'Confirmación', value: 'CONFIRMACION' },
  { label: 'Recálculo', value: 'RECALCULO' },
  { label: 'Reconciliación', value: 'RECONCILIACION' },
  { label: 'Analítica', value: 'ANALITICA' },
  { label: 'Revisión documental', value: 'REVISION_DOCUMENTAL' },
  { label: 'Prueba de control', value: 'PRUEBA_DE_CONTROL' },
  { label: 'Prueba sustantiva', value: 'PRUEBA_SUSTANTIVA' },
]

const CRITERIO_MUESTREO_ITEMS = [
  { label: 'Aleatorio', value: 'ALEATORIO' },
  { label: 'Por riesgo', value: 'POR_RIESGO' },
  { label: 'Por importe', value: 'POR_IMPORTE' },
  { label: 'Por excepción', value: 'POR_EXCEPCION' },
  { label: 'Dirigido', value: 'DIRIGIDO' },
]

const RESULTADO_ITEMS = [
  { label: 'Pass', value: 'PASS' },
  { label: 'Fail', value: 'FAIL' },
  { label: 'Review', value: 'REVIEW' },
]

const COLOR_RESULTADO: Record<string, 'success' | 'error' | 'warning' | 'neutral'> = {
  PASS: 'success',
  FAIL: 'error',
  REVIEW: 'warning',
}

// ── Control → Procedimientos ────────────────────────────────────────────
const controlId = ref<string | undefined>(undefined)
const cargandoProcedimientos = ref(false)

const controlItems = computed(() =>
  auditoriaStore.controles.map((c) => ({ label: c.nombre, value: c.id })),
)

async function seleccionarControl(id: string | undefined): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  controlId.value = id
  procedimientoSeleccionado.value = null
  if (!tenantId || !id) return
  cargandoProcedimientos.value = true
  try {
    await auditoriaStore.cargarProcedimientosPorControl(tenantId, id)
  } finally {
    cargandoProcedimientos.value = false
  }
}

// ── Nuevo procedimiento ─────────────────────────────────────────────────
const modalProcedimientoAbierto = ref(false)
const nombreProc = ref('')
const objetivoProc = ref('')
const criterioProc = ref('')
const pruebaType = ref<string | undefined>(undefined)
const criterioMuestreo = ref<string | undefined>(undefined)
const guardandoProc = ref(false)
const errorProc = ref<string | null>(null)

function abrirModalProcedimiento(): void {
  nombreProc.value = ''
  objetivoProc.value = ''
  criterioProc.value = ''
  pruebaType.value = undefined
  criterioMuestreo.value = undefined
  errorProc.value = null
  modalProcedimientoAbierto.value = true
}

async function guardarProcedimiento(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !controlId.value || !nombreProc.value.trim() || !criterioProc.value.trim() || !pruebaType.value) return
  guardandoProc.value = true
  errorProc.value = null
  try {
    await auditoriaStore.crearProcedimiento(tenantId, {
      control_id: controlId.value,
      nombre: nombreProc.value.trim(),
      objetivo: objetivoProc.value.trim() || null,
      criterio: criterioProc.value.trim(),
      prueba_type: pruebaType.value as never,
      criterio_muestreo: criterioMuestreo.value ?? null,
    })
    modalProcedimientoAbierto.value = false
  } catch (error) {
    errorProc.value = mensajeError(error, 'No se pudo guardar el procedimiento.')
  } finally {
    guardandoProc.value = false
  }
}

// ── Procedimiento → Ejecuciones (workpapers) ────────────────────────────
const procedimientoSeleccionado = ref<string | null>(null)
const cargandoEjecuciones = ref(false)

async function seleccionarProcedimiento(id: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  procedimientoSeleccionado.value = id
  if (!tenantId) return
  cargandoEjecuciones.value = true
  try {
    await auditoriaStore.cargarEjecucionesPorProcedimiento(tenantId, id)
  } finally {
    cargandoEjecuciones.value = false
  }
}

// ── Nueva ejecución (registra el workpaper) ─────────────────────────────
const modalEjecucionAbierto = ref(false)
const engagementId = ref<string | undefined>(undefined)
const resultado = ref<string | undefined>(undefined)
const observaciones = ref('')
const conclusion = ref('')
const evidenciaTexto = ref('')
const guardandoEjec = ref(false)
const errorEjec = ref<string | null>(null)

const engagementItems = computed(() =>
  auditoriaStore.engagements.map((e) => ({ label: e.nombre, value: e.id })),
)

function abrirModalEjecucion(): void {
  engagementId.value = engagementItems.value[0]?.value
  resultado.value = undefined
  observaciones.value = ''
  conclusion.value = ''
  evidenciaTexto.value = ''
  errorEjec.value = null
  modalEjecucionAbierto.value = true
}

async function guardarEjecucion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !procedimientoSeleccionado.value || !engagementId.value) return
  guardandoEjec.value = true
  errorEjec.value = null
  try {
    await auditoriaStore.registrarEjecucion(tenantId, {
      procedimiento_id: procedimientoSeleccionado.value,
      engagement_id: engagementId.value,
      resultado: resultado.value ?? null,
      observaciones: observaciones.value.trim() || null,
      conclusion: conclusion.value.trim() || null,
      evidencia: evidenciaTexto.value.trim() ? evidenciaTexto.value.split(',').map((s) => s.trim()).filter(Boolean) : null,
      ejecutado_at: new Date().toISOString(),
      origen: 'manual',
    })
    modalEjecucionAbierto.value = false
  } catch (error) {
    errorEjec.value = mensajeError(error, 'No se pudo registrar la ejecución.')
  } finally {
    guardandoEjec.value = false
  }
}

// ── Ejecución → Muestra ─────────────────────────────────────────────────
const ejecucionMuestraAbierta = ref<string | null>(null)
const muestrasPorEjecucion = reactive<Record<string, Awaited<ReturnType<typeof auditoriaStore.cargarMuestrasPorEjecucion>>>>({})
const poblacion = ref<number | undefined>(undefined)
const cantidad = ref<number | undefined>(undefined)
const criterioMuestra = ref<'ALEATORIO' | 'POR_RIESGO' | 'POR_IMPORTE' | 'POR_EXCEPCION' | 'DIRIGIDO'>('ALEATORIO')
const semilla = ref<number | undefined>(undefined)
const guardandoMuestra = ref(false)
const errorMuestra = ref<string | null>(null)

async function abrirModalMuestra(ejecucionId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  ejecucionMuestraAbierta.value = ejecucionId
  poblacion.value = undefined
  cantidad.value = undefined
  criterioMuestra.value = 'ALEATORIO'
  semilla.value = undefined
  errorMuestra.value = null
  if (!tenantId) return
  muestrasPorEjecucion[ejecucionId] = await auditoriaStore.cargarMuestrasPorEjecucion(tenantId, ejecucionId)
}

async function guardarMuestra(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const ejecucionId = ejecucionMuestraAbierta.value
  if (!tenantId || !ejecucionId || poblacion.value === undefined || cantidad.value === undefined) return
  if (criterioMuestra.value === 'ALEATORIO' && semilla.value === undefined) {
    errorMuestra.value = 'La semilla es obligatoria cuando el criterio es Aleatorio (para que la selección sea reproducible).'
    return
  }
  guardandoMuestra.value = true
  errorMuestra.value = null
  try {
    await auditoriaStore.registrarMuestra(tenantId, {
      ejecucion_id: ejecucionId,
      poblacion: poblacion.value,
      cantidad: cantidad.value,
      criterio: criterioMuestra.value,
      seleccion: null,
      semilla: criterioMuestra.value === 'ALEATORIO' ? (semilla.value ?? null) : null,
    })
    muestrasPorEjecucion[ejecucionId] = await auditoriaStore.cargarMuestrasPorEjecucion(tenantId, ejecucionId)
    ejecucionMuestraAbierta.value = null
  } catch (error) {
    errorMuestra.value = mensajeError(error, 'No se pudo registrar la muestra.')
  } finally {
    guardandoMuestra.value = false
  }
}

function nombreEngagement(id: string): string {
  return auditoriaStore.engagements.find((e) => e.id === id)?.nombre ?? '—'
}
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-neutral-500 dark:text-neutral-400">
      Cada procedimiento genera un workpaper: objetivo, criterio, procedimiento, muestra, resultado, evidencia y conclusión (§35).
    </p>

    <UFormField label="Control" name="control">
      <USelect
        :model-value="controlId"
        :items="controlItems"
        value-key="value"
        placeholder="Selecciona un control..."
        class="w-full sm:w-96"
        @update:model-value="seleccionarControl"
      />
    </UFormField>

    <div v-if="!controlId" class="text-sm text-neutral-500 py-8 text-center">
      Selecciona un control para ver o registrar sus procedimientos.
    </div>

    <template v-else>
      <div class="flex justify-end">
        <UButton v-if="puedeEscribir" icon="i-lucide-plus" size="sm" @click="abrirModalProcedimiento">
          Nuevo procedimiento
        </UButton>
      </div>

      <div v-if="cargandoProcedimientos" class="text-sm text-neutral-500 py-8 text-center">Cargando…</div>
      <div v-else-if="auditoriaStore.procedimientos.length === 0" class="text-sm text-neutral-500 py-8 text-center">
        Sin procedimientos definidos para este control.
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="p in auditoriaStore.procedimientos"
          :key="p.id"
          class="border border-neutral-200 dark:border-neutral-800 rounded-md overflow-hidden"
        >
          <button
            type="button"
            class="w-full text-left p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 flex items-center justify-between gap-3"
            @click="seleccionarProcedimiento(p.id === procedimientoSeleccionado ? '' : p.id)"
          >
            <div>
              <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">{{ p.nombre }}</p>
              <p class="text-xs text-neutral-500 dark:text-neutral-400">{{ p.criterio }}</p>
            </div>
            <UBadge color="neutral" variant="subtle" size="xs">{{ p.prueba_type.replace('_', ' ') }}</UBadge>
          </button>

          <div v-if="procedimientoSeleccionado === p.id" class="border-t border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
            <div class="flex justify-end">
              <UButton v-if="puedeEscribir" icon="i-lucide-plus" size="xs" variant="outline" @click="abrirModalEjecucion">
                Registrar ejecución
              </UButton>
            </div>

            <div v-if="cargandoEjecuciones" class="text-sm text-neutral-500 py-4 text-center">Cargando…</div>
            <div v-else-if="auditoriaStore.ejecuciones.filter((e) => e.procedimiento_id === p.id).length === 0" class="text-sm text-neutral-500 py-4 text-center">
              Sin ejecuciones registradas todavía.
            </div>
            <div
              v-for="ejec in auditoriaStore.ejecuciones.filter((e) => e.procedimiento_id === p.id)"
              :key="ejec.id"
              class="border border-neutral-200 dark:border-neutral-800 rounded-md p-3 space-y-2 bg-neutral-50 dark:bg-neutral-900/40"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-neutral-500 dark:text-neutral-400">{{ nombreEngagement(ejec.engagement_id) }}</span>
                <UBadge v-if="ejec.resultado" :color="COLOR_RESULTADO[ejec.resultado] ?? 'neutral'" variant="subtle">
                  {{ ejec.resultado }}
                </UBadge>
              </div>
              <p v-if="ejec.conclusion" class="text-sm text-neutral-700 dark:text-neutral-300">
                <span class="font-medium">Conclusión:</span> {{ ejec.conclusion }}
              </p>
              <div v-if="ejec.evidencia?.length" class="flex flex-wrap gap-1">
                <UBadge v-for="(e, i) in ejec.evidencia" :key="i" color="neutral" variant="subtle" size="xs">{{ e }}</UBadge>
              </div>

              <div v-if="muestrasPorEjecucion[ejec.id]?.length" class="text-xs text-neutral-500 dark:text-neutral-400">
                Muestra: {{ muestrasPorEjecucion[ejec.id]![0]!.cantidad }} de {{ muestrasPorEjecucion[ejec.id]![0]!.poblacion }}
                ({{ muestrasPorEjecucion[ejec.id]![0]!.criterio }})
              </div>
              <UButton
                v-else-if="puedeEscribir"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-list-checks"
                @click="abrirModalMuestra(ejec.id)"
              >
                Agregar muestra
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </template>

    <UModal v-model:open="modalProcedimientoAbierto" title="Nuevo procedimiento">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Nombre" name="nombre" required>
            <UInput v-model="nombreProc" class="w-full" />
          </UFormField>
          <UFormField label="Objetivo" name="objetivo">
            <UTextarea v-model="objetivoProc" class="w-full" :rows="2" autoresize />
          </UFormField>
          <UFormField label="Criterio" name="criterio" required help="La norma/política/estándar contra el que se prueba.">
            <UTextarea v-model="criterioProc" class="w-full" :rows="2" autoresize />
          </UFormField>
          <UFormField label="Tipo de prueba" name="pruebaType" required>
            <USelect v-model="pruebaType" :items="PRUEBA_TYPE_ITEMS" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Criterio de muestreo" name="criterioMuestreo">
            <USelect v-model="criterioMuestreo" :items="CRITERIO_MUESTREO_ITEMS" value-key="value" class="w-full" />
          </UFormField>
          <p v-if="errorProc" class="text-sm text-error-600">{{ errorProc }}</p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="modalProcedimientoAbierto = false">Cancelar</UButton>
        <UButton
          :loading="guardandoProc"
          :disabled="!nombreProc.trim() || !criterioProc.trim() || !pruebaType"
          @click="guardarProcedimiento"
        >
          Guardar
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="modalEjecucionAbierto" title="Registrar ejecución">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Auditoría" name="engagementId" required>
            <USelect v-model="engagementId" :items="engagementItems" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Resultado" name="resultado">
            <USelect v-model="resultado" :items="RESULTADO_ITEMS" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Observaciones" name="observaciones">
            <UTextarea v-model="observaciones" class="w-full" :rows="2" autoresize />
          </UFormField>
          <UFormField label="Conclusión" name="conclusion">
            <UTextarea v-model="conclusion" class="w-full" :rows="2" autoresize />
          </UFormField>
          <UFormField label="Evidencia" name="evidencia" help="Separada por comas.">
            <UInput v-model="evidenciaTexto" class="w-full" placeholder="Captura de pantalla, reporte..." />
          </UFormField>
          <p v-if="errorEjec" class="text-sm text-error-600">{{ errorEjec }}</p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="modalEjecucionAbierto = false">Cancelar</UButton>
        <UButton :loading="guardandoEjec" :disabled="!engagementId" @click="guardarEjecucion">Guardar</UButton>
      </template>
    </UModal>

    <UModal :open="ejecucionMuestraAbierta !== null" title="Agregar muestra" @update:open="(v) => { if (!v) ejecucionMuestraAbierta = null }">
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Población" name="poblacion" required>
              <UInputNumber v-model="poblacion" class="w-full" :min="0" />
            </UFormField>
            <UFormField label="Cantidad" name="cantidad" required>
              <UInputNumber v-model="cantidad" class="w-full" :min="0" :max="poblacion" />
            </UFormField>
          </div>
          <UFormField label="Criterio" name="criterioMuestra" required>
            <USelect v-model="criterioMuestra" :items="CRITERIO_MUESTREO_ITEMS" value-key="value" class="w-full" />
          </UFormField>
          <UFormField
            v-if="criterioMuestra === 'ALEATORIO'"
            label="Semilla"
            name="semilla"
            required
            help="Obligatoria para que la selección aleatoria sea reproducible."
          >
            <UInputNumber v-model="semilla" class="w-full" />
          </UFormField>
          <p v-if="errorMuestra" class="text-sm text-error-600">{{ errorMuestra }}</p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="ejecucionMuestraAbierta = null">Cancelar</UButton>
        <UButton :loading="guardandoMuestra" :disabled="poblacion === undefined || cantidad === undefined" @click="guardarMuestra">
          Guardar
        </UButton>
      </template>
    </UModal>
  </div>
</template>
