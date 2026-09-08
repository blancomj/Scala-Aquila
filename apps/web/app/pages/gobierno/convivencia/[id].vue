<script setup lang="ts">
// GOB-6 §4.7: detalle de un expediente de convivencia — línea de tiempo por etapas (con lo que
// falta para avanzar y el artículo que lo exige en cada bloqueo), registro de actuaciones,
// archivo, y la propuesta de sanción con vista previa (tope individual, acumulado disponible,
// órgano competente, tipificación) ANTES de imponerla — gobierno_imponer_sancion() aplica los
// mismos 5 guards en el servidor; esta vista solo los anticipa para no descubrirlos con un error.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type ZonaComunOpcion = { id: string; nombre: string; es_esencial: boolean }
type DecisionOpcion = {
  id: string; numero: number; anio: number; titulo: string; organo_id: string
  reunion: { fecha_hora: string } | null
}

const ETAPAS_ORDEN = [
  'reportado', 'conciliacion_comite', 'requerimiento_escrito', 'descargos',
  'decision_organo', 'sancion_impuesta', 'archivado', 'impugnacion', 'firme',
] as const
const ETAPA_ETIQUETA: Record<string, string> = {
  reportado: 'Reportado', conciliacion_comite: 'Conciliación (comité)', requerimiento_escrito: 'Requerimiento escrito',
  descargos: 'Descargos', decision_organo: 'Decisión del órgano', sancion_impuesta: 'Sanción impuesta',
  archivado: 'Archivado', impugnacion: 'Impugnación', firme: 'Firme',
}
const ETAPAS_TERMINALES = ['archivado', 'firme']
const ETAPAS_REGISTRABLES = ['conciliacion_comite', 'requerimiento_escrito', 'descargos'] as const

const route = useRoute()
const expedienteId = route.params.id as string
const tenantStore = useTenantStore()
const convivenciaStore = useGobiernoConvivenciaStore()
const documentosStore = useDocumentosStore()

const error = ref<string | null>(null)
const zonasComunes = ref<ZonaComunOpcion[]>([])
const decisiones = ref<DecisionOpcion[]>([])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await convivenciaStore.cargarExpediente(expedienteId)
    if (convivenciaStore.clasesSancion.length === 0) await convivenciaStore.cargarClasesSancion()
    const cliente = useSupabaseClient<Database>()
    const [{ data: zonasFilas }, { data: decisionesFilas }] = await Promise.all([
      cliente.from('zonas_comunes').select('id, nombre, es_esencial').eq('tenant_id', tenantId).order('nombre'),
      cliente
        .from('gobierno_decisiones')
        .select('id, numero, anio, titulo, organo_id, reunion:reunion_id(fecha_hora)')
        .eq('tenant_id', tenantId).eq('estado', 'vigente')
        .order('anio', { ascending: false }).order('numero', { ascending: false }),
    ])
    zonasComunes.value = zonasFilas ?? []
    decisiones.value = (decisionesFilas ?? []) as unknown as DecisionOpcion[]
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cargar el expediente.')
  }
}
onMounted(cargar)
onUnmounted(() => convivenciaStore.limpiar())

const etapaColor: Record<string, 'neutral' | 'primary' | 'warning' | 'success' | 'error'> = {
  reportado: 'neutral', conciliacion_comite: 'primary', requerimiento_escrito: 'primary',
  descargos: 'primary', decision_organo: 'warning', sancion_impuesta: 'success',
  archivado: 'neutral', impugnacion: 'warning', firme: 'success',
}

const etapasCumplidas = computed(() => {
  const set = new Set<string>(['reportado'])
  for (const a of convivenciaStore.actuaciones) set.add(a.etapa)
  return set
})
const tieneRequerimiento = computed(() => etapasCumplidas.value.has('requerimiento_escrito'))
const tieneDescargos = computed(() => etapasCumplidas.value.has('descargos'))
const esTerminal = computed(() => !!convivenciaStore.expediente && ETAPAS_TERMINALES.includes(convivenciaStore.expediente.etapa))

// ── registrar actuación ───────────────────────────────────────────────
const formActuacion = reactive({
  etapa: 'requerimiento_escrito' as typeof ETAPAS_REGISTRABLES[number],
  fecha: new Date().toISOString().slice(0, 10), descripcion: '', archivo: null as File | null, plazoDias: null as number | null,
})
async function registrarActuacion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !formActuacion.descripcion.trim()) return
  error.value = null
  try {
    let documentoId: string | null = null
    if (formActuacion.archivo) {
      const tiposDoc = await cargarListaTipos(tenantId, 'TIPO_DOCUMENTO')
      const tipoId = tiposDoc.find((t) => t.codigo === 'soporte_convivencia')?.id
      if (!tipoId) throw new Error('No se encontró el tipo de documento "soporte de expediente de convivencia".')
      const documento = await documentosStore.subirDocumento({ tenantId, inmuebleId: null, tipoDocumentoId: tipoId, archivo: formActuacion.archivo })
      documentoId = documento.id
    }
    await convivenciaStore.registrarActuacion({
      expedienteId, etapa: formActuacion.etapa, fecha: formActuacion.fecha, descripcion: formActuacion.descripcion.trim(),
      documentoId, plazoDias: formActuacion.plazoDias,
    })
    formActuacion.descripcion = ''
    formActuacion.archivo = null
    formActuacion.plazoDias = null
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar la actuación.')
  }
}

// ── archivar ──────────────────────────────────────────────────────────
const motivoArchivo = ref('')
async function archivar(): Promise<void> {
  if (!motivoArchivo.value.trim()) return
  error.value = null
  try {
    await convivenciaStore.archivarExpediente(expedienteId, motivoArchivo.value.trim())
    motivoArchivo.value = ''
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo archivar el expediente.')
  }
}

// ── proponer sanción: vista previa ANTES de imponer (§4.7) ──────────────
const clasesPermitidas = computed(() => {
  const permitidas = new Set(convivenciaStore.expediente?.infraccion?.clases_sancion_permitidas ?? [])
  return convivenciaStore.clasesSancion.filter((c) => permitidas.has(c.codigo))
})
const formSancion = reactive({
  claseSancionCodigo: null as string | null, decisionId: null as string | null,
  monto: null as number | null, zonaComunId: null as string | null,
})
const claseSeleccionada = computed(() => convivenciaStore.clasesSancion.find((c) => c.codigo === formSancion.claseSancionCodigo) ?? null)
const zonaSeleccionada = computed(() => zonasComunes.value.find((z) => z.id === formSancion.zonaComunId) ?? null)
const decisionSeleccionada = computed(() => decisiones.value.find((d) => d.id === formSancion.decisionId) ?? null)

const expensaMensual = ref<number | null>(null)
const acumuladoPrevio = ref<number>(0)
watchEffect(async () => {
  if (formSancion.claseSancionCodigo !== 'multa' || !convivenciaStore.expediente) return
  const [ex, ac] = await Promise.all([
    convivenciaStore.previsualizarExpensaMensual(convivenciaStore.expediente.inmueble_id),
    convivenciaStore.acumuladoMultasPrevias(convivenciaStore.expediente.tenant_id, convivenciaStore.expediente.presunto_infractor_ref),
  ])
  expensaMensual.value = ex
  acumuladoPrevio.value = ac
})

const topeIndividual = computed(() => (
  claseSeleccionada.value?.tope_multiplo_expensas && expensaMensual.value !== null
    ? claseSeleccionada.value.tope_multiplo_expensas * expensaMensual.value
    : null
))
const topeAcumulado = computed(() => (
  claseSeleccionada.value?.tope_acumulado_multiplo && expensaMensual.value !== null
    ? claseSeleccionada.value.tope_acumulado_multiplo * expensaMensual.value
    : null
))
const acumuladoDisponible = computed(() => (topeAcumulado.value !== null ? topeAcumulado.value - acumuladoPrevio.value : null))
const excedeTopeIndividual = computed(() => !!(formSancion.monto && topeIndividual.value !== null && formSancion.monto > topeIndividual.value))
const excedeTopeAcumulado = computed(() => !!(formSancion.monto && topeAcumulado.value !== null && acumuladoPrevio.value + formSancion.monto > topeAcumulado.value))

const organosCompetentes = ref<{ organo_id: string; organo_tipo_codigo: string }[]>([])
watchEffect(async () => {
  const tenantId = tenantStore.activeTenant?.id
  const decision = decisionSeleccionada.value
  if (!tenantId || !decision?.reunion?.fecha_hora) { organosCompetentes.value = []; return }
  organosCompetentes.value = await convivenciaStore.organosCompetentesImponerSancion(tenantId, decision.reunion.fecha_hora.slice(0, 10))
})
const organoEsCompetente = computed(() => (
  decisionSeleccionada.value ? organosCompetentes.value.some((o) => o.organo_id === decisionSeleccionada.value!.organo_id) : null
))

async function imponerSancion(): Promise<void> {
  if (!formSancion.claseSancionCodigo || !formSancion.decisionId) return
  error.value = null
  try {
    await convivenciaStore.imponerSancion({
      expedienteId, claseSancionCodigo: formSancion.claseSancionCodigo, decisionId: formSancion.decisionId,
      monto: formSancion.claseSancionCodigo === 'multa' ? formSancion.monto : null,
      zonaComunId: formSancion.claseSancionCodigo === 'restriccion_uso' ? formSancion.zonaComunId : null,
    })
    formSancion.claseSancionCodigo = null
    formSancion.decisionId = null
    formSancion.monto = null
    formSancion.zonaComunId = null
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo imponer la sanción.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div v-if="convivenciaStore.expediente" class="space-y-6">
      <NuxtLink to="/gobierno/convivencia" class="text-xs text-muted hover:underline">← Volver a convivencia</NuxtLink>
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-xl font-semibold">
            Expediente {{ convivenciaStore.expediente.numero }}/{{ convivenciaStore.expediente.anio }} ·
            {{ convivenciaStore.expediente.infraccion?.nombre }}
          </h1>
          <p class="text-sm text-muted">
            {{ convivenciaStore.expediente.inmueble?.codigo }} ·
            {{ convivenciaStore.expediente.presunto_infractor?.primer_nombre }} {{ convivenciaStore.expediente.presunto_infractor?.primer_apellido }}
            ({{ convivenciaStore.expediente.calidad }}) · hechos del {{ convivenciaStore.expediente.fecha_hechos }}
          </p>
        </div>
        <UBadge :color="etapaColor[convivenciaStore.expediente.etapa] ?? 'neutral'" variant="soft" size="lg">
          {{ ETAPA_ETIQUETA[convivenciaStore.expediente.etapa] ?? convivenciaStore.expediente.etapa }}
        </UBadge>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <p class="text-sm">{{ convivenciaStore.expediente.descripcion_hechos }}</p>

      <!-- ── Línea de tiempo ──────────────────────────────────────────── -->
      <section class="rounded-lg border border-default p-4 space-y-3">
        <p class="font-medium">Línea de tiempo del debido proceso</p>
        <ol class="flex flex-wrap gap-2 text-xs">
          <li
            v-for="e in ETAPAS_ORDEN" :key="e"
            class="px-2 py-1 rounded"
            :class="etapasCumplidas.has(e) ? 'bg-primary/10 text-primary font-medium' : 'bg-elevated text-muted'"
          >
            {{ ETAPA_ETIQUETA[e] }}
          </li>
        </ol>
        <div v-if="!esTerminal" class="text-xs space-y-1">
          <p v-if="!tieneRequerimiento" class="text-warning">
            Falta el requerimiento escrito previo (art. 59) — bloquea imponer cualquier sanción
            (<code>SANCION_SIN_REQUERIMIENTO_PREVIO</code>).
          </p>
          <p v-if="tieneRequerimiento && !tieneDescargos" class="text-warning">
            Falta la etapa de descargos (art. 2 num. 5 y art. 60 — derecho de defensa, aunque el
            infractor no responda) (<code>SANCION_SIN_DEBIDO_PROCESO</code>).
          </p>
          <p v-if="tieneRequerimiento && tieneDescargos" class="text-success">
            El debido proceso está completo — puede proponerse una sanción abajo.
          </p>
        </div>
      </section>

      <!-- ── Actuaciones ──────────────────────────────────────────────── -->
      <section class="rounded-lg border border-default p-4 space-y-3">
        <p class="font-medium">Bitácora de actuaciones (append-only)</p>
        <ul class="text-sm space-y-2">
          <li v-for="a in convivenciaStore.actuaciones" :key="a.id" class="border-b border-default pb-2 last:border-0">
            <p>{{ a.fecha }} · <span class="font-medium">{{ ETAPA_ETIQUETA[a.etapa] ?? a.etapa }}</span></p>
            <p class="text-muted">{{ a.descripcion }}</p>
            <p v-if="a.plazo_dias" class="text-xs text-muted">Plazo: {{ a.plazo_dias }} días · vence {{ a.fecha_limite }}</p>
          </li>
        </ul>
        <p v-if="convivenciaStore.actuaciones.length === 0" class="text-sm text-muted">Sin actuaciones registradas todavía.</p>

        <div v-if="!esTerminal" class="pt-2 border-t border-default space-y-2">
          <div class="grid gap-2 sm:grid-cols-3">
            <UFormField label="Etapa">
              <USelect
                v-model="formActuacion.etapa"
                :items="ETAPAS_REGISTRABLES.map((e) => ({ label: ETAPA_ETIQUETA[e], value: e }))"
              />
            </UFormField>
            <UFormField label="Fecha"><UInput v-model="formActuacion.fecha" type="date" class="w-full" /></UFormField>
            <UFormField label="Plazo otorgado (días, opcional)"><UInput v-model.number="formActuacion.plazoDias" type="number" class="w-full" /></UFormField>
          </div>
          <UFormField label="Descripción"><UTextarea v-model="formActuacion.descripcion" class="w-full" :rows="2" /></UFormField>
          <UFormField label="Documento de soporte (opcional)">
            <input type="file" @change="(e) => (formActuacion.archivo = (e.target as HTMLInputElement).files?.[0] ?? null)">
          </UFormField>
          <UButton :loading="convivenciaStore.guardando" :disabled="!formActuacion.descripcion.trim()" @click="registrarActuacion()">
            Registrar actuación
          </UButton>
        </div>
      </section>

      <!-- ── Sanciones ya impuestas ───────────────────────────────────── -->
      <section v-if="convivenciaStore.sanciones.length > 0" class="rounded-lg border border-default p-4 space-y-2">
        <p class="font-medium">Sanciones impuestas</p>
        <ul class="text-sm space-y-1">
          <li v-for="s in convivenciaStore.sanciones" :key="s.id">
            {{ s.impuesta_at?.slice(0, 10) }} · monto: {{ s.monto ?? '—' }}
          </li>
        </ul>
      </section>

      <!-- Impugnación (GOB-7 §4.4) -->
      <GobiernoImpugnacionSeccion
        v-if="tenantStore.activeTenant"
        :objeto-tipo="'sancion'" :objeto-id="convivenciaStore.expediente.id" :tenant-id="tenantStore.activeTenant.id"
        :impugnable="convivenciaStore.expediente.etapa === 'sancion_impuesta'"
      />

      <!-- ── Proponer sanción ─────────────────────────────────────────── -->
      <section v-if="!esTerminal" class="rounded-lg border border-default p-4 space-y-3">
        <p class="font-medium">Proponer sanción</p>
        <p class="text-xs text-muted">
          Imponer una sanción exige rol administrador — el sistema muestra el tope y la
          competencia del órgano antes de intentarlo, pero el servidor vuelve a validar los 5
          guards igual.
        </p>
        <div class="grid gap-2 sm:grid-cols-2">
          <UFormField label="Clase de sanción">
            <USelect
              :model-value="formSancion.claseSancionCodigo ?? undefined"
              :items="clasesPermitidas.map((c) => ({ label: `${c.nombre} (${c.numeral_articulo})`, value: c.codigo }))"
              placeholder="Selecciona…"
              @update:model-value="(v) => (formSancion.claseSancionCodigo = v as string)"
            />
          </UFormField>
          <UFormField label="Decisión que la autoriza (GOB-5)">
            <UiSelectorBuscable
              v-model="formSancion.decisionId"
              :opciones="decisiones.map((d) => ({ valor: d.id, etiqueta: `${d.numero}/${d.anio} · ${d.titulo}` }))"
            />
          </UFormField>
        </div>
        <p v-if="clasesPermitidas.length === 0" class="text-xs text-warning">
          Esta infracción no tiene ninguna clase de sanción permitida configurada.
        </p>

        <template v-if="formSancion.claseSancionCodigo === 'multa'">
          <UFormField label="Monto de la multa">
            <UInput v-model.number="formSancion.monto" type="number" class="w-full" />
          </UFormField>
          <div class="rounded border border-default p-3 text-sm space-y-1">
            <p>Expensa necesaria mensual: <span class="font-medium">{{ expensaMensual ?? '— (sin configurar)' }}</span></p>
            <p>Tope individual (2×): <span class="font-medium">{{ topeIndividual ?? '—' }}</span></p>
            <p>Acumulado previo de este infractor: <span class="font-medium">{{ acumuladoPrevio }}</span></p>
            <p>Acumulado disponible (hasta 10×): <span class="font-medium">{{ acumuladoDisponible ?? '—' }}</span></p>
            <p v-if="excedeTopeIndividual" class="text-error">Supera el tope individual — MULTA_EXCEDE_TOPE_INDIVIDUAL.</p>
            <p v-if="excedeTopeAcumulado" class="text-error">Supera el tope acumulado — MULTA_EXCEDE_TOPE_ACUMULADO.</p>
          </div>
        </template>

        <template v-if="formSancion.claseSancionCodigo === 'restriccion_uso'">
          <UFormField label="Zona común a restringir">
            <UiSelectorBuscable v-model="formSancion.zonaComunId" :opciones="zonasComunes.map((z) => ({ valor: z.id, etiqueta: z.nombre }))" />
          </UFormField>
          <p v-if="zonaSeleccionada?.es_esencial" class="text-xs text-error">
            {{ zonaSeleccionada.nombre }} es un bien común esencial — no puede restringirse su uso
            (art. 59 num. 3, SANCION_BIEN_COMUN_ESENCIAL).
          </p>
        </template>

        <div v-if="formSancion.decisionId" class="text-xs">
          <p v-if="organoEsCompetente === true" class="text-success">El órgano de esta decisión es competente para imponer sanciones a esa fecha.</p>
          <p v-else-if="organoEsCompetente === false" class="text-error">
            El órgano de esta decisión NO tiene la atribución "imponer sanciones" vigente a esa fecha — SANCION_ORGANO_INCOMPETENTE.
          </p>
        </div>

        <UButton
          color="error"
          :loading="convivenciaStore.guardando"
          :disabled="!formSancion.claseSancionCodigo || !formSancion.decisionId || !tieneRequerimiento || !tieneDescargos"
          @click="imponerSancion()"
        >
          Imponer sanción
        </UButton>
      </section>

      <!-- ── Archivar ─────────────────────────────────────────────────── -->
      <section v-if="!esTerminal" class="rounded-lg border border-default p-4 space-y-2">
        <p class="font-medium">Archivar sin sanción</p>
        <div class="flex gap-2">
          <UInput v-model="motivoArchivo" placeholder="Motivo del archivo" class="flex-1" />
          <UButton variant="soft" :loading="convivenciaStore.guardando" :disabled="!motivoArchivo.trim()" @click="archivar()">
            Archivar
          </UButton>
        </div>
      </section>

      <p v-if="convivenciaStore.expediente.estado_final" class="text-sm text-muted">
        Cerrado: {{ convivenciaStore.expediente.estado_final }}
      </p>
    </div>
    <p v-else-if="!convivenciaStore.loading" class="text-sm text-muted">Expediente no encontrado.</p>
  </div>
</template>
