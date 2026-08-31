<script setup lang="ts">
// Detalle de un caso jurídico (CAR §15.3-16, bloque 20/22): datos
// generales, cierre (exige administrador, guard_caso_juridico_transicion),
// bitácora de actuaciones (append-only) y costas judiciales. Sin matriz de
// transiciones para estado — decisión deliberada de la migración
// 20260822340000: el trámite judicial real no sigue un único orden lineal.
import {
  useCasosJuridicosStore,
  ESTADOS_CIERRE,
  type CasoJuridico,
  type EstadoCasoJuridico,
  type TipoCosta,
  type EstadoCosta,
} from '~/stores/casosJuridicos'
import { formatoMoneda } from '~/utils/formato'

const props = defineProps<{
  caso: CasoJuridico
  opcionesAbogado: { valor: string | null; etiqueta: string }[]
  inmuebleCodigo: string
}>()
const emit = defineEmits<{ cerrar: []; actualizado: [] }>()

const tenantStore = useTenantStore()
const casosStore = useCasosJuridicosStore()
const documentosStore = useDocumentosStore()
const toast = useToast()

const esAdministrador = computed(() => tenantStore.role === 'administrador')

function hoyISO(): string {
  const d = new Date()
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ETIQUETA_ESTADO: Record<EstadoCasoJuridico, string> = {
  remitido: 'Remitido',
  documentacion: 'Reuniendo documentación',
  radicado: 'Radicado',
  admitido: 'Admitido',
  en_tramite: 'En trámite',
  medidas_cautelares: 'Medidas cautelares',
  conciliacion: 'Conciliación',
  sentencia: 'Sentencia',
  ejecucion: 'Ejecución',
  terminado: 'Terminado',
  desistido: 'Desistido',
  archivado: 'Archivado',
}
const OPCIONES_ESTADO = Object.entries(ETIQUETA_ESTADO).map(([value, label]) => ({ value, label }))
const OPCIONES_ESTADO_CIERRE = ESTADOS_CIERRE.map((v) => ({ value: v, label: ETIQUETA_ESTADO[v] }))

const ETIQUETA_TIPO_COSTA: Record<TipoCosta, string> = {
  gasto_proceso: 'Gasto del proceso',
  agencias_en_derecho: 'Agencias en derecho',
  honorario_auxiliar: 'Honorario de auxiliar de la justicia',
  otro_costo_aprobado: 'Otro costo aprobado',
}
const OPCIONES_TIPO_COSTA = Object.entries(ETIQUETA_TIPO_COSTA).map(([value, label]) => ({ value, label }))

const ETIQUETA_ESTADO_COSTA: Record<EstadoCosta, string> = {
  liquidada: 'Liquidada',
  impugnada: 'Impugnada',
  en_firme: 'En firme',
  recuperada: 'Recuperada',
  no_recuperable: 'No recuperable',
}
const OPCIONES_ESTADO_COSTA = Object.entries(ETIQUETA_ESTADO_COSTA).map(([value, label]) => ({ value, label }))

const casoEstaCerrado = computed(() => ESTADOS_CIERRE.includes(props.caso.estado))

// ── datos generales ──────────────────────────────────────────────────
const estado = ref<EstadoCasoJuridico>(props.caso.estado)
const abogadoTerceroId = ref<string | null>(props.caso.abogado_tercero_id)
const numeroRadicado = ref(props.caso.numero_radicado ?? '')
const juzgado = ref(props.caso.juzgado ?? '')
const ciudad = ref(props.caso.ciudad ?? '')
const fechaApertura = ref(props.caso.fecha_apertura ?? '')
const fechaUltimaActuacion = ref(props.caso.fecha_ultima_actuacion ?? '')
const fechaProximaActuacion = ref(props.caso.fecha_proxima_actuacion ?? '')
const guardandoDatos = ref(false)

async function guardarDatos(): Promise<void> {
  guardandoDatos.value = true
  try {
    await casosStore.actualizarCaso(props.caso.id, {
      estado: estado.value,
      abogadoTerceroId: abogadoTerceroId.value,
      numeroRadicado: numeroRadicado.value.trim() || null,
      juzgado: juzgado.value.trim() || null,
      ciudad: ciudad.value.trim() || null,
      fechaApertura: fechaApertura.value || null,
      fechaUltimaActuacion: fechaUltimaActuacion.value || null,
      fechaProximaActuacion: fechaProximaActuacion.value || null,
    })
    toast.add({ title: 'Caso actualizado', color: 'success' })
    emit('actualizado')
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo guardar',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    guardandoDatos.value = false
  }
}

// ── cerrar caso ───────────────────────────────────────────────────────
const cierreEstado = ref<EstadoCasoJuridico>('terminado')
const cierreFecha = ref(hoyISO())
const cierreMotivo = ref('')
const cierreMontoRecuperado = ref<number>(0)
const cerrando = ref(false)

async function cerrarCaso(): Promise<void> {
  if (cierreMotivo.value.trim().length === 0) return
  cerrando.value = true
  try {
    await casosStore.cerrarCaso(props.caso.id, {
      estado: cierreEstado.value,
      fechaCierre: cierreFecha.value,
      motivoCierre: cierreMotivo.value.trim(),
      montoRecuperado: cierreMontoRecuperado.value,
    })
    toast.add({ title: 'Caso cerrado', color: 'success' })
    emit('actualizado')
    emit('cerrar')
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo cerrar el caso',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    cerrando.value = false
  }
}

// ── actuaciones ───────────────────────────────────────────────────────
const tiposActuacion = ref<{ id: number; nombre: string }[]>([])
const nuevaActuacionFecha = ref(hoyISO())
const nuevaActuacionTipoId = ref<number | null>(null)
const nuevaActuacionDescripcion = ref('')
const nuevaActuacionDocumentoId = ref<string | null>(null)
const registrandoActuacion = ref(false)

// El auto o la sentencia que respalda la actuación — se sube en la librería
// del expediente de arriba (mismo alcance casoJuridicoId, misma
// documentosStore compartida) y aquí solo se ELIGE de lo ya subido, igual
// que "Actuación que respalda la costa" más abajo. Cierra el hueco que
// roadmap §3.2 dejaba abierto (documentoId siempre null).
const opcionesDocumentoCaso = computed(() =>
  documentosStore.documentos.map((d) => ({
    valor: d.id,
    etiqueta: `${d.nombre_archivo} · v${d.version}`,
  })),
)

async function registrarActuacion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || nuevaActuacionTipoId.value === null || nuevaActuacionDescripcion.value.trim().length === 0) return
  registrandoActuacion.value = true
  try {
    await casosStore.registrarActuacion(tenantId, props.caso.id, {
      fecha: nuevaActuacionFecha.value,
      tipoActuacionId: nuevaActuacionTipoId.value,
      descripcion: nuevaActuacionDescripcion.value.trim(),
      estadoDesde: null,
      estadoHasta: null,
      documentoId: nuevaActuacionDocumentoId.value,
    })
    nuevaActuacionDescripcion.value = ''
    nuevaActuacionDocumentoId.value = null
    toast.add({ title: 'Actuación registrada', color: 'success' })
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo registrar la actuación',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    registrandoActuacion.value = false
  }
}

const tipoActuacionPorId = computed(() => new Map(tiposActuacion.value.map((t) => [t.id, t.nombre])))

// ── costas ────────────────────────────────────────────────────────────
const nuevaCostaTipo = ref<TipoCosta>('gasto_proceso')
const nuevaCostaMonto = ref<number | null>(null)
const nuevaCostaDocumento = ref('')
const nuevaCostaFecha = ref(hoyISO())
const nuevaCostaAutoridad = ref('')
const nuevaCostaActuacionId = ref<string | null>(null)
const registrandoCosta = ref(false)

// La actuación es normalmente el soporte real de la costa (CAR §16, roadmap
// §3.2) — se ofrece como opcional, no se exige: no toda costa nace con la
// actuación exacta ya identificada en pantalla.
const actuacionEtiquetaPorId = computed(() => {
  const mapa = new Map<string, string>()
  for (const a of casosStore.actuaciones) {
    mapa.set(a.id, `${a.fecha} · ${tipoActuacionPorId.value.get(a.tipo_actuacion_id) ?? '—'}`)
  }
  return mapa
})
const opcionesActuacionCosta = computed(() =>
  casosStore.actuaciones.map((a) => ({ valor: a.id, etiqueta: actuacionEtiquetaPorId.value.get(a.id) ?? '—' })),
)

async function registrarCosta(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (
    !tenantId ||
    !nuevaCostaMonto.value ||
    nuevaCostaMonto.value <= 0 ||
    nuevaCostaDocumento.value.trim().length === 0 ||
    nuevaCostaAutoridad.value.trim().length === 0
  ) {
    return
  }
  registrandoCosta.value = true
  try {
    await casosStore.registrarCosta(tenantId, props.caso.id, {
      tipoCosta: nuevaCostaTipo.value,
      monto: nuevaCostaMonto.value,
      documentoFuente: nuevaCostaDocumento.value.trim(),
      fechaDecision: nuevaCostaFecha.value,
      autoridad: nuevaCostaAutoridad.value.trim(),
      actuacionId: nuevaCostaActuacionId.value,
    })
    nuevaCostaMonto.value = null
    nuevaCostaDocumento.value = ''
    nuevaCostaAutoridad.value = ''
    nuevaCostaActuacionId.value = null
    toast.add({ title: 'Costa registrada', color: 'success' })
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo registrar la costa',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    registrandoCosta.value = false
  }
}

async function cambiarEstadoCosta(costaId: string, valor: EstadoCosta): Promise<void> {
  try {
    await casosStore.actualizarCosta(props.caso.id, costaId, { estado: valor })
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo actualizar la costa',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  }
}

onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const tipos = await cargarListaTipos(tenantId, 'TIPO_ACTUACION_JURIDICA')
  tiposActuacion.value = tipos.map((t) => ({ id: t.id, nombre: t.nombre }))
  await Promise.all([
    casosStore.cargarActuaciones(props.caso.id),
    casosStore.cargarCostas(props.caso.id),
    documentosStore.cargarDocumentos(tenantId, null, props.caso.id),
  ])
})
</script>

<template>
  <div class="space-y-6 text-sm">
      <!-- ── datos generales ────────────────────────────────────────── -->
      <section class="space-y-3">
        <h3 class="text-xs font-semibold uppercase text-neutral-400">Datos del caso</h3>
        <UFormField label="Estado" name="estado">
          <USelect v-model="estado" :items="OPCIONES_ESTADO" value-key="value" :disabled="casoEstaCerrado" class="w-full" />
        </UFormField>
        <UFormField label="Abogado" name="abogado">
          <UiSelectorBuscable v-model="abogadoTerceroId" :opciones="opcionesAbogado" placeholder="Sin asignar" />
        </UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Radicado" name="numero_radicado">
            <UInput v-model="numeroRadicado" class="w-full" />
          </UFormField>
          <UFormField label="Juzgado" name="juzgado">
            <UInput v-model="juzgado" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Ciudad" name="ciudad">
          <UInput v-model="ciudad" class="w-full" />
        </UFormField>
        <div class="grid grid-cols-3 gap-3">
          <UFormField label="Fecha de apertura" name="fecha_apertura">
            <UInput v-model="fechaApertura" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Última actuación" name="fecha_ultima_actuacion">
            <UInput v-model="fechaUltimaActuacion" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Próxima actuación" name="fecha_proxima_actuacion">
            <UInput v-model="fechaProximaActuacion" type="date" class="w-full" />
          </UFormField>
        </div>
        <UButton size="sm" :loading="guardandoDatos" :disabled="casoEstaCerrado" @click="guardarDatos">
          Guardar cambios
        </UButton>
        <p v-if="casoEstaCerrado" class="text-xs text-neutral-400">
          Caso {{ ETIQUETA_ESTADO[caso.estado].toLowerCase() }} — {{ caso.motivo_cierre }}
        </p>
      </section>

      <!-- ── cerrar caso ────────────────────────────────────────────── -->
      <section v-if="!casoEstaCerrado" class="space-y-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
        <h3 class="text-xs font-semibold uppercase text-neutral-400">Cerrar caso</h3>
        <p v-if="!esAdministrador" class="text-xs text-neutral-500">
          Cerrar un caso jurídico exige rol administrador (art. 48).
        </p>
        <template v-else>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Resultado" name="cierre_estado">
              <USelect v-model="cierreEstado" :items="OPCIONES_ESTADO_CIERRE" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Fecha de cierre" name="cierre_fecha">
              <UInput v-model="cierreFecha" type="date" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Monto recuperado" name="cierre_monto">
            <UInput v-model.number="cierreMontoRecuperado" type="number" min="0" step="0.01" class="w-full" />
          </UFormField>
          <UFormField label="Motivo del cierre" name="cierre_motivo" required>
            <UTextarea v-model="cierreMotivo" class="w-full" :rows="2" />
          </UFormField>
          <UButton size="sm" color="error" :loading="cerrando" :disabled="cierreMotivo.trim().length === 0" @click="cerrarCaso">
            Cerrar caso
          </UButton>
        </template>
      </section>

      <!-- ── documentos del expediente ──────────────────────────────── -->
      <section class="pt-3 border-t border-neutral-200 dark:border-neutral-800">
        <UiLibreriaDocumentos
          :inmueble-id="null"
          :caso-juridico-id="caso.id"
          descripcion="Memoriales, autos, sentencias y demás piezas del expediente — versionadas por tipo de documento."
        />
      </section>

      <!-- ── actuaciones ────────────────────────────────────────────── -->
      <section class="space-y-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
        <h3 class="text-xs font-semibold uppercase text-neutral-400">Bitácora de actuaciones</h3>
        <div class="space-y-2">
          <div v-for="a in casosStore.actuaciones" :key="a.id" class="rounded-md border border-neutral-200 dark:border-neutral-800 p-2">
            <p class="text-xs text-neutral-400">{{ a.fecha }} · {{ tipoActuacionPorId.get(a.tipo_actuacion_id) ?? '—' }}</p>
            <p>{{ a.descripcion }}</p>
            <p v-if="a.documento_id" class="text-xs text-neutral-400 mt-0.5">
              Soporte: {{ documentosStore.documentos.find((d) => d.id === a.documento_id)?.nombre_archivo ?? a.documento_id }}
            </p>
          </div>
          <p v-if="casosStore.actuaciones.length === 0" class="text-xs text-neutral-400">Sin actuaciones registradas.</p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Fecha" name="actuacion_fecha">
            <UInput v-model="nuevaActuacionFecha" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Tipo de actuación" name="actuacion_tipo">
            <USelect
              :model-value="nuevaActuacionTipoId ?? undefined"
              :items="tiposActuacion.map((t) => ({ value: t.id, label: t.nombre }))"
              value-key="value"
              placeholder="Selecciona…"
              class="w-full"
              @update:model-value="(v) => (nuevaActuacionTipoId = v as number)"
            />
          </UFormField>
        </div>
        <UFormField label="Descripción" name="actuacion_descripcion">
          <UTextarea v-model="nuevaActuacionDescripcion" class="w-full" :rows="2" />
        </UFormField>
        <UFormField
          label="Documento de soporte"
          name="actuacion_documento"
          help="Opcional — el auto o la sentencia, ya subidos en Documentos del expediente arriba"
        >
          <UiSelectorBuscable
            v-model="nuevaActuacionDocumentoId"
            :opciones="opcionesDocumentoCaso"
            placeholder="Sin documento asociado"
          />
        </UFormField>
        <UButton
          size="sm"
          variant="outline"
          :loading="registrandoActuacion"
          :disabled="nuevaActuacionTipoId === null || nuevaActuacionDescripcion.trim().length === 0"
          @click="registrarActuacion"
        >
          Registrar actuación
        </UButton>
      </section>

      <!-- ── costas judiciales ──────────────────────────────────────── -->
      <section class="space-y-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
        <h3 class="text-xs font-semibold uppercase text-neutral-400">Costas judiciales</h3>
        <div class="space-y-2">
          <div v-for="c in casosStore.costas" :key="c.id" class="rounded-md border border-neutral-200 dark:border-neutral-800 p-2 space-y-1">
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium">{{ ETIQUETA_TIPO_COSTA[c.tipo_costa] }}</span>
              <span class="tabular-nums">{{ formatoMoneda(c.monto) }}</span>
            </div>
            <p class="text-xs text-neutral-400">{{ c.documento_fuente }} · {{ c.fecha_decision }} · {{ c.autoridad }}</p>
            <p v-if="c.actuacion_id" class="text-xs text-neutral-400">
              Actuación: {{ actuacionEtiquetaPorId.get(c.actuacion_id) ?? c.actuacion_id }}
            </p>
            <USelect
              :model-value="c.estado"
              :items="OPCIONES_ESTADO_COSTA"
              value-key="value"
              size="xs"
              class="w-40"
              @update:model-value="(v) => cambiarEstadoCosta(c.id, v as EstadoCosta)"
            />
          </div>
          <p v-if="casosStore.costas.length === 0" class="text-xs text-neutral-400">Sin costas registradas.</p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Tipo" name="costa_tipo">
            <USelect v-model="nuevaCostaTipo" :items="OPCIONES_TIPO_COSTA" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Monto" name="costa_monto">
            <UInput v-model.number="nuevaCostaMonto" type="number" min="0" step="0.01" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Documento fuente" name="costa_documento">
          <UInput v-model="nuevaCostaDocumento" class="w-full" placeholder="Auto que liquida agencias en derecho, folio 12" />
        </UFormField>
        <UFormField label="Actuación que la respalda" name="costa_actuacion" help="Opcional — normalmente es el auto que liquida la costa">
          <UiSelectorBuscable
            v-model="nuevaCostaActuacionId"
            :opciones="opcionesActuacionCosta"
            placeholder="Sin actuación asociada"
          />
        </UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Fecha de la decisión" name="costa_fecha">
            <UInput v-model="nuevaCostaFecha" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Autoridad" name="costa_autoridad">
            <UInput v-model="nuevaCostaAutoridad" class="w-full" placeholder="Juzgado 12 Civil Municipal" />
          </UFormField>
        </div>
        <UButton
          size="sm"
          variant="outline"
          :loading="registrandoCosta"
          :disabled="!nuevaCostaMonto || nuevaCostaDocumento.trim().length === 0 || nuevaCostaAutoridad.trim().length === 0"
          @click="registrarCosta"
        >
          Registrar costa
        </UButton>
      </section>
  </div>
</template>
