<script setup lang="ts">
// Configuración del módulo de cartera (CAR §8 y §9, bloque 23).
//
// Es la puerta de entrada que faltaba. Sin política de clasificación
// vigente, el job diario aborta por PH-C26/I-C14 y no ocurre absolutamente
// nada: ni clasificación, ni acciones, ni cobranza. Hasta ahora esa
// configuración solo existía si alguien la escribía en SQL, así que una
// copropiedad nueva no podía encender el módulo sin un desarrollador.
//
// La pantalla hace cuatro cosas, en orden de lo que hace falta primero:
//   1. Sembrar la configuración sugerida por el rector (§8.4/§9.4) de un
//      clic, para copropiedades que empiezan de cero.
//   2. Mostrar qué está vigente: tramos y estrategias, con sus reglas.
//   3. Dejar encender y apagar estrategias sin tocar la política.
//   4. Crear una versión nueva para editar los tramos (§8.5, bloque 23): una
//      política vigente es INMUTABLE, así que corregirla clona la vigente en
//      un borrador editable, se compara contra la vigente lado a lado, y se
//      activa cuando queda lista — ahí es cuando retira a la anterior.
import {
  useCarteraConfigStore,
  type EstrategiaCobranza,
  type NuevaEstrategia,
  type NuevoTramo,
  type TramoClasificacion,
} from '~/stores/carteraConfig'
import { CANALES_AUTOMATICOS, ETIQUETA_CANAL } from '~/utils/mensaje-cobranza'
import { formatoMoneda } from '~/utils/formato'
import type { Database } from '@aquila/shared'

type NivelRiesgo = Database['public']['Enums']['nivel_riesgo_t']
type EtapaCobranza = Database['public']['Enums']['etapa_cobranza_t']
type TipoAccion = Database['public']['Enums']['tipo_accion_cobranza_t']
type Canal = Database['public']['Enums']['canal_cobranza_t']
type RolMinimo = Database['public']['Enums']['tenant_role_t']

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const configStore = useCarteraConfigStore()
const toast = useToast()

const errorCarga = ref<string | null>(null)
const sembrando = ref(false)
const activando = ref<string | null>(null)
const cambiando = ref<string | null>(null)
const creandoVersion = ref(false)
const guardandoTramoId = ref<string | null>(null)
const eliminandoTramoId = ref<string | null>(null)
const confirmandoEliminarId = ref<string | null>(null)
const creandoTramo = ref(false)

const ETIQUETA_ETAPA: Record<string, string> = {
  preventiva: 'Preventiva',
  administrativa: 'Administrativa',
  prejuridica: 'Prejurídica',
  juridica: 'Jurídica',
  judicial: 'Judicial',
}

const COLOR_RIESGO: Record<string, 'neutral' | 'success' | 'warning' | 'error'> = {
  ninguno: 'success',
  bajo: 'neutral',
  medio: 'warning',
  alto: 'error',
  critico: 'error',
}

const OPCIONES_RIESGO: { label: string; value: NivelRiesgo }[] = [
  { label: 'Ninguno', value: 'ninguno' },
  { label: 'Bajo', value: 'bajo' },
  { label: 'Medio', value: 'medio' },
  { label: 'Alto', value: 'alto' },
  { label: 'Crítico', value: 'critico' },
]

const OPCIONES_ETAPA: { label: string; value: EtapaCobranza }[] = [
  { label: 'Preventiva', value: 'preventiva' },
  { label: 'Administrativa', value: 'administrativa' },
  { label: 'Prejurídica', value: 'prejuridica' },
  { label: 'Jurídica', value: 'juridica' },
  { label: 'Judicial', value: 'judicial' },
]

const OPCIONES_TIPO_ACCION: { label: string; value: TipoAccion }[] = [
  { label: 'Correo', value: 'email' },
  { label: 'SMS', value: 'sms' },
  { label: 'WhatsApp', value: 'whatsapp' },
  { label: 'Llamada', value: 'llamada' },
  { label: 'Carta', value: 'carta' },
  { label: 'Requerimiento formal', value: 'requerimiento_formal' },
  { label: 'Aviso prejurídico', value: 'aviso_prejuridico' },
  { label: 'Publicación de morosos', value: 'publicacion_morosos' },
  { label: 'Restricción de servicios', value: 'restriccion_servicios' },
  { label: 'Visita', value: 'visita' },
  { label: 'Asignación de abogado', value: 'asignacion_abogado' },
  { label: 'Remisión jurídica', value: 'remision_juridica' },
  { label: 'Propuesta de acuerdo', value: 'propuesta_acuerdo' },
  { label: 'Revisión manual', value: 'revision_manual' },
]

const OPCIONES_CANAL: { label: string; value: Canal }[] = [
  { label: 'Correo', value: 'email' },
  { label: 'SMS', value: 'sms' },
  { label: 'WhatsApp', value: 'whatsapp' },
  { label: 'Teléfono', value: 'telefono' },
  { label: 'Físico', value: 'fisico' },
  { label: 'Interno', value: 'interno' },
]

const OPCIONES_ROL: { label: string; value: RolMinimo }[] = [
  { label: 'Auxiliar', value: 'auxiliar' },
  { label: 'Auditor', value: 'auditor' },
  { label: 'Administrador', value: 'administrador' },
]

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  try {
    await configStore.cargar(tenantId)
  } catch (excepcion) {
    errorCarga.value = excepcion instanceof Error ? excepcion.message : 'No se pudo cargar la configuración.'
  }
}

await useAsyncData('cartera-configuracion-inicial', async () => {
  await cargar()
  return null
})

watch(() => tenantStore.activeTenant?.id, cargar)

const politica = computed(() => configStore.politicaActual)
const esBorrador = computed(() => politica.value?.estado === 'borrador')
const sinConfigurar = computed(() => politica.value === null)

/** Vigente + un borrador ya en edición (§8.5): el caso que la vía "editar tramos"
 * resuelve, distinto del primer borrador antes de tener nunca una vigente. */
const enEdicion = computed(() => configStore.politicaBorradorEnEdicion)

/** Estrategias agrupadas por tramo, en el orden en que escala la mora. */
const porTramo = computed(() =>
  configStore.tramos.map((tramo) => ({
    tramo,
    estrategias: configStore.estrategias.filter((e) => e.tramoId === tramo.id),
  })),
)

function rangoDias(diasMin: number, diasMax: number | null): string {
  if (diasMax === null) return `${String(diasMin)} días o más`
  if (diasMin === diasMax) return diasMin === 0 ? 'Sin mora' : `${String(diasMin)} días`
  return `${String(diasMin)} a ${String(diasMax)} días`
}

// ── edición de tramos del borrador en edición ─────────────────────────
interface DraftTramo {
  nombre: string
  diasMin: number
  sinTope: boolean
  diasMax: number
  nivelRiesgo: NivelRiesgo
  etapaCobranza: EtapaCobranza
  orden: number
}

const draftsTramo = ref<Record<string, DraftTramo>>({})

function draftDesde(tramo: TramoClasificacion): DraftTramo {
  return {
    nombre: tramo.nombre,
    diasMin: tramo.diasMin,
    sinTope: tramo.diasMax === null,
    diasMax: tramo.diasMax ?? tramo.diasMin,
    nivelRiesgo: tramo.nivelRiesgo as NivelRiesgo,
    etapaCobranza: tramo.etapaCobranza as EtapaCobranza,
    orden: tramo.orden,
  }
}

watch(
  () => configStore.tramosBorrador,
  (lista) => {
    const siguiente: Record<string, DraftTramo> = {}
    for (const tramo of lista) {
      siguiente[tramo.id] = draftsTramo.value[tramo.id] ?? draftDesde(tramo)
    }
    draftsTramo.value = siguiente
  },
  { immediate: true },
)

const nuevoTramo = ref<{ codigo: string; nombre: string; diasMin: number; sinTope: boolean; diasMax: number; nivelRiesgo: NivelRiesgo; etapaCobranza: EtapaCobranza }>({
  codigo: '',
  nombre: '',
  diasMin: 0,
  sinTope: false,
  diasMax: 0,
  nivelRiesgo: 'bajo',
  etapaCobranza: 'administrativa',
})

// ── edición de estrategias (§9.3): sin guard de inmutabilidad, funciona
// igual con la política vigente que con un borrador ────────────────────
interface DraftEstrategia {
  nombre: string
  tipoAccion: TipoAccion
  canal: Canal
  diasDesdeClasificacion: number
  sinFrecuencia: boolean
  frecuenciaDias: number
  maxIntentos: number
  plantillaCodigo: string
  rolMinimo: RolMinimo
  requiereAprobacion: boolean
  sinMontoMinimo: boolean
  montoMinimoDeuda: number
  orden: number
}

const editandoEstrategiaId = ref<string | null>(null)
const draftsEstrategia = ref<Record<string, DraftEstrategia>>({})
const guardandoEstrategiaId = ref<string | null>(null)
const eliminandoEstrategiaId = ref<string | null>(null)
const confirmandoEliminarEstrategiaId = ref<string | null>(null)
const agregandoEstrategia = ref(false)
const creandoEstrategia = ref(false)

function draftEstrategiaDesde(estrategia: EstrategiaCobranza): DraftEstrategia {
  return {
    nombre: estrategia.nombre,
    tipoAccion: estrategia.tipoAccion as TipoAccion,
    canal: estrategia.canal as Canal,
    diasDesdeClasificacion: estrategia.diasDesdeClasificacion,
    sinFrecuencia: estrategia.frecuenciaDias === null,
    frecuenciaDias: estrategia.frecuenciaDias ?? 15,
    maxIntentos: estrategia.maxIntentos,
    plantillaCodigo: estrategia.plantillaCodigo ?? '',
    rolMinimo: estrategia.rolMinimo as RolMinimo,
    requiereAprobacion: estrategia.requiereAprobacion,
    sinMontoMinimo: estrategia.montoMinimoDeuda === null,
    montoMinimoDeuda: estrategia.montoMinimoDeuda ?? 0,
    orden: estrategia.orden,
  }
}

function editarEstrategia(estrategia: EstrategiaCobranza): void {
  draftsEstrategia.value[estrategia.id] = draftEstrategiaDesde(estrategia)
  editandoEstrategiaId.value = estrategia.id
}

function nuevaEstrategiaVacia(tramoId: string): NuevaEstrategia & { sinFrecuencia: boolean; sinMontoMinimo: boolean } {
  return {
    tramoId,
    codigo: '',
    nombre: '',
    tipoAccion: 'email',
    canal: 'email',
    diasDesdeClasificacion: 0,
    sinFrecuencia: true,
    frecuenciaDias: 15,
    maxIntentos: 1,
    plantillaCodigo: null,
    rolMinimo: 'auxiliar',
    requiereAprobacion: false,
    sinMontoMinimo: true,
    montoMinimoDeuda: 0,
    activa: true,
    orden: 0,
  }
}

const nuevaEstrategia = ref<ReturnType<typeof nuevaEstrategiaVacia> | null>(null)

// ── pestañas: Tramos de mora / Estrategias de cobranza ─────────────────
// Mismo patrón que pages/presupuesto/index.vue (tablist + tabindex itinerante,
// WAI-ARIA APG) — sin sincronizar con el hash de la URL porque acá es un
// selector de sección dentro de la página, no navegación entre pantallas.
type SeccionConfig = 'tramos' | 'estrategias'
const SECCIONES_CONFIG: ReadonlyArray<{ id: SeccionConfig; etiqueta: string }> = [
  { id: 'tramos', etiqueta: 'Tramos de mora' },
  { id: 'estrategias', etiqueta: 'Estrategias de cobranza' },
]
const seccionActiva = ref<SeccionConfig>('tramos')
const botonesSeccion = ref<(HTMLButtonElement | null)[]>([])

function irASeccion(indice: number): void {
  const seccion = SECCIONES_CONFIG[indice]
  if (!seccion) return
  seccionActiva.value = seccion.id
  nextTick(() => botonesSeccion.value[indice]?.focus())
}

function onKeydownSeccion(evento: KeyboardEvent, indiceActual: number): void {
  switch (evento.key) {
    case 'ArrowRight':
      evento.preventDefault()
      irASeccion((indiceActual + 1) % SECCIONES_CONFIG.length)
      break
    case 'ArrowLeft':
      evento.preventDefault()
      irASeccion((indiceActual - 1 + SECCIONES_CONFIG.length) % SECCIONES_CONFIG.length)
      break
    case 'Home':
      evento.preventDefault()
      irASeccion(0)
      break
    case 'End':
      evento.preventDefault()
      irASeccion(SECCIONES_CONFIG.length - 1)
      break
  }
}

/** Un solo botón para toda la sección (no uno por tramo): el formulario elige
 * el tramo con un selector. */
const opcionesTramoEstrategia = computed(() => configStore.tramos.map((t) => ({ label: t.nombre, value: t.id })))

function abrirNuevaEstrategia(): void {
  nuevaEstrategia.value = nuevaEstrategiaVacia(configStore.tramos[0]?.id ?? '')
  agregandoEstrategia.value = true
}

function cerrarNuevaEstrategia(): void {
  agregandoEstrategia.value = false
  nuevaEstrategia.value = null
}

async function sembrar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  sembrando.value = true
  try {
    await configStore.sembrarInicial(tenantId)
    toast.add({
      title: 'Configuración creada',
      description: 'Queda en borrador: revísala y actívala cuando la asamblea la respalde.',
      color: 'success',
    })
    await cargar()
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo crear la configuración',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    sembrando.value = false
  }
}

async function activar(politicaId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  activando.value = politicaId
  try {
    await configStore.activarPolitica(politicaId, tenantId)
    toast.add({
      title: 'Política activada',
      description: 'A partir de ahora una corrección exige crear una versión nueva.',
      color: 'success',
    })
  } catch (excepcion) {
    // El trigger dice exactamente qué invariante falta (§8.3): se muestra
    // tal cual, porque es lo único que permite arreglarlo.
    toast.add({
      title: 'No se pudo activar',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    activando.value = null
  }
}

async function alternar(estrategia: EstrategiaCobranza): Promise<void> {
  cambiando.value = estrategia.id
  try {
    await configStore.alternarEstrategia(estrategia.id, !estrategia.activa)
    await cargar()
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo cambiar la estrategia',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    cambiando.value = null
  }
}

async function guardarEstrategia(estrategiaId: string): Promise<void> {
  const draft = draftsEstrategia.value[estrategiaId]
  if (!draft) return
  guardandoEstrategiaId.value = estrategiaId
  try {
    await configStore.actualizarEstrategia(estrategiaId, {
      nombre: draft.nombre,
      tipoAccion: draft.tipoAccion,
      canal: draft.canal,
      diasDesdeClasificacion: draft.diasDesdeClasificacion,
      frecuenciaDias: draft.sinFrecuencia ? null : draft.frecuenciaDias,
      maxIntentos: draft.maxIntentos,
      plantillaCodigo: draft.plantillaCodigo.trim() === '' ? null : draft.plantillaCodigo.trim(),
      rolMinimo: draft.rolMinimo,
      requiereAprobacion: draft.requiereAprobacion,
      montoMinimoDeuda: draft.sinMontoMinimo ? null : draft.montoMinimoDeuda,
      orden: draft.orden,
    })
    toast.add({ title: 'Estrategia guardada', color: 'success' })
    editandoEstrategiaId.value = null
    await cargar()
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo guardar la estrategia',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    guardandoEstrategiaId.value = null
  }
}

async function eliminarEstrategia(estrategiaId: string): Promise<void> {
  eliminandoEstrategiaId.value = estrategiaId
  try {
    await configStore.eliminarEstrategia(estrategiaId)
    confirmandoEliminarEstrategiaId.value = null
    await cargar()
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo eliminar la estrategia',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    eliminandoEstrategiaId.value = null
  }
}

async function agregarEstrategia(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const actual = politica.value
  const borrador = nuevaEstrategia.value
  if (!tenantId || !actual || !borrador) return
  if (!borrador.tramoId) {
    toast.add({ title: 'Selecciona un tramo', color: 'error' })
    return
  }
  if (!borrador.codigo.trim() || !borrador.nombre.trim()) {
    toast.add({ title: 'Falta código o nombre', color: 'error' })
    return
  }
  const orden =
    configStore.estrategias.filter((e) => e.tramoId === borrador.tramoId).reduce((max, e) => Math.max(max, e.orden), -1) + 1
  creandoEstrategia.value = true
  try {
    await configStore.crearEstrategia(actual.id, tenantId, {
      tramoId: borrador.tramoId,
      codigo: borrador.codigo.trim(),
      nombre: borrador.nombre.trim(),
      tipoAccion: borrador.tipoAccion,
      canal: borrador.canal,
      diasDesdeClasificacion: borrador.diasDesdeClasificacion,
      frecuenciaDias: borrador.sinFrecuencia ? null : borrador.frecuenciaDias,
      maxIntentos: borrador.maxIntentos,
      plantillaCodigo: borrador.plantillaCodigo,
      rolMinimo: borrador.rolMinimo,
      requiereAprobacion: borrador.requiereAprobacion,
      montoMinimoDeuda: borrador.sinMontoMinimo ? null : borrador.montoMinimoDeuda,
      activa: borrador.activa,
      orden,
    })
    cerrarNuevaEstrategia()
    await cargar()
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo agregar la estrategia',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    creandoEstrategia.value = false
  }
}

async function crearVersion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const vigente = configStore.politicaVigente
  if (!tenantId || !vigente) return
  creandoVersion.value = true
  try {
    await configStore.crearVersionNueva(vigente.id, tenantId)
    toast.add({
      title: 'Versión nueva creada',
      description: 'Es un borrador editable con los mismos tramos de la vigente. Ajústalos y actívala cuando estén listos.',
      color: 'success',
    })
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo crear la versión nueva',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    creandoVersion.value = false
  }
}

async function guardarTramo(tramoId: string): Promise<void> {
  const draft = draftsTramo.value[tramoId]
  if (!draft) return
  guardandoTramoId.value = tramoId
  try {
    await configStore.actualizarTramo(tramoId, {
      nombre: draft.nombre,
      diasMin: draft.diasMin,
      diasMax: draft.sinTope ? null : draft.diasMax,
      nivelRiesgo: draft.nivelRiesgo,
      etapaCobranza: draft.etapaCobranza,
      orden: draft.orden,
    })
    toast.add({ title: 'Tramo guardado', color: 'success' })
    await cargar()
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo guardar el tramo',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    guardandoTramoId.value = null
  }
}

async function eliminarTramo(tramoId: string): Promise<void> {
  eliminandoTramoId.value = tramoId
  try {
    await configStore.eliminarTramo(tramoId)
    confirmandoEliminarId.value = null
    await cargar()
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo eliminar el tramo',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    eliminandoTramoId.value = null
  }
}

async function agregarTramo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const borrador = enEdicion.value
  if (!tenantId || !borrador) return
  if (!nuevoTramo.value.codigo.trim() || !nuevoTramo.value.nombre.trim()) {
    toast.add({ title: 'Falta código o nombre', color: 'error' })
    return
  }
  const orden = configStore.tramosBorrador.reduce((max, t) => Math.max(max, t.orden), -1) + 1
  const tramo: NuevoTramo = {
    codigo: nuevoTramo.value.codigo.trim(),
    nombre: nuevoTramo.value.nombre.trim(),
    diasMin: nuevoTramo.value.diasMin,
    diasMax: nuevoTramo.value.sinTope ? null : nuevoTramo.value.diasMax,
    nivelRiesgo: nuevoTramo.value.nivelRiesgo,
    etapaCobranza: nuevoTramo.value.etapaCobranza,
    orden,
  }
  creandoTramo.value = true
  try {
    await configStore.crearTramo(borrador.id, tenantId, tramo)
    nuevoTramo.value = { codigo: '', nombre: '', diasMin: 0, sinTope: false, diasMax: 0, nivelRiesgo: 'bajo', etapaCobranza: 'administrativa' }
    await cargar()
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo agregar el tramo',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    creandoTramo.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="mb-8">
      <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 max-w-2xl">
        <template #titulo>
          <h1 class="text-2xl font-semibold tracking-tight">Configuración de cartera</h1>
        </template>
        <template #descripcion>
          Define los criterios de clasificación de la mora y las estrategias de gestión
          correspondientes a cada tramo de antigüedad.
        </template>
      </UiTituloDescripcion>
    </div>

    <UAlert
      v-if="errorCarga"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="No se pudo cargar"
      :description="errorCarga"
    />

    <!-- ── copropiedad sin configurar ───────────────────────────────── -->
    <div
v-if="sinConfigurar && !configStore.loading"
         class="flex flex-col items-center justify-center py-12 px-6 text-center max-w-3xl mx-auto space-y-6">
      <div class="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 text-primary rounded-full flex items-center justify-center mb-2">
        <UIcon name="i-lucide-sparkles" class="w-8 h-8" />
      </div>
      <UiTituloDescripcion clase-descripcion="text-base text-neutral-500 max-w-xl mx-auto">
        <template #titulo>
          <h2 class="text-2xl font-semibold">La copropiedad no tiene política de cartera</h2>
        </template>
        <template #descripcion>
          Sin una política de clasificación, el módulo de cartera permanece inactivo.
          No se clasificará la mora ni se generarán acciones de cobro automáticamente.
        </template>
      </UiTituloDescripcion>
      <div class="flex flex-col items-center gap-3">
        <UButton
          size="lg"
          icon="i-lucide-wand-2"
          :loading="sembrando"
          class="px-8"
          @click="sembrar"
        >
          Crear configuración sugerida
        </UButton>
        <p class="text-xs text-neutral-400">
          Se crea un borrador basado en el rector. Nada se activa hasta que lo revises.
        </p>
      </div>
    </div>

    <template v-else-if="politica">
      <!-- ── estado de la política ──────────────────────────────────── -->
      <div class="bg-neutral-50 dark:bg-neutral-900/50 rounded-xl p-4 border border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="p-2 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm">
            <UIcon
:name="esBorrador ? 'i-lucide-file-edit' : 'i-lucide-shield-check'"
                   :class="esBorrador ? 'text-warning' : 'text-success'"
                   class="w-5 h-5" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="font-semibold text-neutral-900 dark:text-white">{{ politica.nombre }}</span>
              <UBadge size="xs" variant="solid" :color="esBorrador ? 'warning' : 'success'" class="rounded-full px-2">
                {{ esBorrador ? 'Borrador' : 'Vigente' }}
              </UBadge>
              <span class="text-[10px] font-medium uppercase tracking-wider text-neutral-400">versión {{ politica.version }}</span>
            </div>
            <p class="text-xs text-neutral-500 mt-0.5">
              {{ esBorrador
                ? 'La corrida diaria seguirá sin clasificar hasta que actives esta política.'
                : 'Política activa. Para realizar ajustes, debes crear una versión nueva.'
              }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            v-if="esBorrador"
            icon="i-lucide-check"
            size="sm"
            :loading="activando === politica.id"
            class="shadow-sm"
            @click="activar(politica.id)"
          >
            Activar política
          </UButton>
          <UButton
            v-else-if="!enEdicion"
            icon="i-lucide-git-branch-plus"
            size="sm"
            variant="outline"
            :loading="creandoVersion"
            class="shadow-sm"
            @click="crearVersion"
          >
            Crear versión nueva
          </UButton>
        </div>
      </div>

      <!-- ── nueva versión en edición (§8.5, bloque 23) ─────────────────── -->
      <div v-if="enEdicion" class="rounded-xl border border-primary-200 dark:border-primary-900/50 overflow-hidden bg-white dark:bg-neutral-900 shadow-sm">
        <div class="bg-primary-50 dark:bg-primary-900/20 p-4 border-b border-primary-100 dark:border-primary-900/30 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="p-1.5 rounded-md bg-primary-500 text-white">
              <UIcon name="i-lucide-edit-3" class="w-4 h-4" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-semibold text-primary-900 dark:text-primary-100">{{ enEdicion.nombre }}</span>
                <UBadge size="xs" variant="solid" color="warning" class="rounded-full">Borrador v{{ enEdicion.version }}</UBadge>
              </div>
              <p class="text-xs text-primary-600 dark:text-primary-400 mt-0.5">
                Modificando tramos de clasificación. Los cambios no afectan la operación hasta la activación.
              </p>
            </div>
          </div>
          <UButton icon="i-lucide-check" size="sm" :loading="activando === enEdicion.id" class="bg-primary-600 hover:bg-primary-700 text-white" @click="activar(enEdicion.id)">
            Activar versión
          </UButton>
        </div>

        <div class="grid gap-0 lg:grid-cols-2">
          <!-- Vigente: Read-only Pane -->
          <div class="p-4 bg-neutral-50/50 dark:bg-neutral-800/30 border-r border-neutral-100 dark:border-neutral-800">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4 flex items-center gap-2">
              <UIcon name="i-lucide-lock" class="w-3 h-3" />
              Vigente hoy
            </h3>
            <div class="space-y-2">
              <div
                v-for="tramo in configStore.tramos"
                :key="tramo.id"
                class="group rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 bg-white dark:bg-neutral-900 transition-colors hover:border-neutral-300 dark:hover:border-neutral-700"
              >
                <div class="flex items-center justify-between gap-2 mb-1">
                  <span class="font-medium text-sm">{{ tramo.nombre }}</span>
                  <UBadge size="xs" variant="subtle" :color="COLOR_RIESGO[tramo.nivelRiesgo] ?? 'neutral'" class="rounded-md">
                    {{ tramo.nivelRiesgo }}
                  </UBadge>
                </div>
                <div class="flex items-center gap-2 text-[11px] text-neutral-500">
                  <span class="font-medium">{{ rangoDias(tramo.diasMin, tramo.diasMax) }}</span>
                  <span class="text-neutral-300">•</span>
                  <span>{{ ETIQUETA_ETAPA[tramo.etapaCobranza] ?? tramo.etapaCobranza }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Borrador: Workspace Pane -->
          <div class="p-4 bg-white dark:bg-neutral-900">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-primary-500 mb-4 flex items-center gap-2">
              <UIcon name="i-lucide-pencil" class="w-3 h-3" />
              Espacio de trabajo (Editable)
            </h3>
            <div class="space-y-3">
              <div
                v-for="tramo in configStore.tramosBorrador"
                :key="tramo.id"
                class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 transition-all focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500"
              >
                <div v-if="draftsTramo[tramo.id]" class="space-y-3">
                  <div class="flex gap-2 items-center">
                    <UInput v-model="draftsTramo[tramo.id]!.nombre" size="xs" class="flex-1 font-medium" placeholder="Nombre del tramo" />
                    <span class="text-[10px] font-mono text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">{{ tramo.codigo }}</span>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="flex items-center gap-2">
                      <UInput v-model.number="draftsTramo[tramo.id]!.diasMin" type="number" size="xs" class="w-full" placeholder="Min" />
                      <span class="text-xs text-neutral-400">a</span>
                      <UInput
                        v-model.number="draftsTramo[tramo.id]!.diasMax"
                        type="number"
                        size="xs"
                        class="w-full"
                        :disabled="draftsTramo[tramo.id]!.sinTope"
                        placeholder="Max"
                      />
                    </div>
                    <label class="flex items-center gap-2 text-xs text-neutral-500 justify-end">
                      <UCheckbox v-model="draftsTramo[tramo.id]!.sinTope" />
                      Sin tope
                    </label>
                  </div>
                  <div class="flex gap-2">
                    <USelect v-model="draftsTramo[tramo.id]!.nivelRiesgo" :items="OPCIONES_RIESGO" size="xs" class="flex-1" />
                    <USelect v-model="draftsTramo[tramo.id]!.etapaCobranza" :items="OPCIONES_ETAPA" size="xs" class="flex-1" />
                  </div>
                  <div class="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800">
                    <div class="flex items-center gap-1">
                      <UButton
                        size="xs"
                        variant="ghost"
                        color="error"
                        icon="i-lucide-trash-2"
                        @click="confirmandoEliminarId = tramo.id"
                      >
                        Eliminar
                      </UButton>
                      <template v-if="confirmandoEliminarId === tramo.id">
                        <UButton size="xs" variant="solid" color="error" @click="eliminarTramo(tramo.id)">Confirmar</UButton>
                        <UButton size="xs" variant="ghost" @click="confirmandoEliminarId = null">Cancelar</UButton>
                      </template>
                    </div>
                    <UButton
                      size="xs"
                      icon="i-lucide-save"
                      :loading="guardandoTramoId === tramo.id"
                      class="font-medium"
                      @click="guardarTramo(tramo.id)"
                    >
                      Guardar cambios
                    </UButton>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── agregar tramo ─────────────────────────────────────── -->
            <div class="mt-6 p-4 rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-800/20 space-y-3">
              <div class="flex items-center gap-2 mb-1">
                <UIcon name="i-lucide-plus-circle" class="w-4 h-4 text-primary-500" />
                <p class="text-xs font-bold uppercase tracking-wider text-neutral-500">Nuevo Tramo</p>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <UInput v-model="nuevoTramo.codigo" size="xs" placeholder="Cód." class="w-20" />
                <UInput v-model="nuevoTramo.nombre" size="xs" placeholder="Nombre del nuevo tramo" class="flex-1" />
              </div>
              <div class="flex items-center gap-2">
                <UInput v-model.number="nuevoTramo.diasMin" type="number" size="xs" class="w-full" placeholder="Días Min" />
                <span class="text-xs text-neutral-400">a</span>
                <UInput
                  v-model.number="nuevoTramo.diasMax"
                  type="number"
                  size="xs"
                  class="w-full"
                  :disabled="nuevoTramo.sinTope"
                  placeholder="Días Max"
                />
                <label class="flex items-center gap-1 text-xs text-neutral-500 whitespace-nowrap">
                  <UCheckbox v-model="nuevoTramo.sinTope" />
                  Sin tope
                </label>
              </div>
              <div class="flex gap-2">
                <USelect v-model="nuevoTramo.nivelRiesgo" :items="OPCIONES_RIESGO" size="xs" class="flex-1" />
                <USelect v-model="nuevoTramo.etapaCobranza" :items="OPCIONES_ETAPA" size="xs" class="flex-1" />
              </div>
              <UButton size="xs" icon="i-lucide-plus" :loading="creandoTramo" class="w-full justify-center" @click="agregarTramo">
                Añadir a la política
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- ── pestañas: tramos / estrategias ────────────────────────────── -->
      <nav class="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto" role="tablist" aria-label="Configuración de cartera">
        <button
          v-for="(seccion, indice) in SECCIONES_CONFIG"
          :key="seccion.id"
          :ref="(el) => { botonesSeccion[indice] = el as HTMLButtonElement | null }"
          type="button"
          role="tab"
          :aria-selected="seccionActiva === seccion.id"
          :tabindex="seccionActiva === seccion.id ? 0 : -1"
          class="px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors"
          :class="
            seccionActiva === seccion.id
              ? 'border-primary text-primary font-medium'
              : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
          "
          @click="seccionActiva = seccion.id"
          @keydown="onKeydownSeccion($event, indice)"
        >
          {{ seccion.etiqueta }}
        </button>
      </nav>

      <!-- ── tramos ─────────────────────────────────────────────────── -->
      <div v-if="seccionActiva === 'tramos'" role="tabpanel">
        <UiTituloDescripcion clase-descripcion="text-xs text-neutral-500 mt-1 mb-3">
          <template #titulo>
            <h2 class="text-sm font-semibold">Tramos de mora</h2>
          </template>
          <template #descripcion>
            En qué tramo cae cada obligación según sus días de mora, y en qué etapa de cobranza la
            coloca.
          </template>
        </UiTituloDescripcion>
        <UiTabla
          variante="tailwind"
          :columnas="[
            { clave: 'tramo', etiqueta: 'Tramo' },
            { clave: 'dias', etiqueta: 'Días de mora' },
            { clave: 'riesgo', etiqueta: 'Riesgo' },
            { clave: 'etapa', etiqueta: 'Etapa' },
            { clave: 'acciones', etiqueta: 'Gestión', alinear: 'derecha' },
          ]"
          :filas="porTramo"
          :clave-fila="(fila) => fila.tramo.id"
        >
          <template #celda-tramo="{ fila }">
            <div class="flex flex-col">
              <span class="font-medium">{{ fila.tramo.nombre }}</span>
              <span class="text-xs text-neutral-400">{{ fila.tramo.codigo }}</span>
            </div>
          </template>
          <template #celda-dias="{ fila }">
            {{ rangoDias(fila.tramo.diasMin, fila.tramo.diasMax) }}
          </template>
          <template #celda-riesgo="{ fila }">
            <UBadge size="sm" variant="subtle" :color="COLOR_RIESGO[fila.tramo.nivelRiesgo] ?? 'neutral'">
              {{ fila.tramo.nivelRiesgo }}
            </UBadge>
          </template>
          <template #celda-etapa="{ fila }">
            {{ ETIQUETA_ETAPA[fila.tramo.etapaCobranza] ?? fila.tramo.etapaCobranza }}
          </template>
          <template #celda-acciones="{ fila }">
            <div class="flex items-center justify-end gap-2">
              <UBadge size="xs" variant="subtle" color="primary" class="font-medium tabular-nums">
                {{ fila.estrategias.filter((e) => e.activa).length }} activa(s)
              </UBadge>
            </div>
          </template>
        </UiTabla>
      </div>

      <!-- ── estrategias ────────────────────────────────────────────── -->
      <div v-else-if="seccionActiva === 'estrategias'" role="tabpanel">
        <div class="flex items-start justify-between gap-3 mb-1 flex-wrap">
          <UiTituloDescripcion clase-descripcion="text-xs text-neutral-500 mb-3">
            <template #titulo>
              <h2 class="text-sm font-semibold">Estrategias de cobranza</h2>
            </template>
            <template #descripcion>
              Qué se hace en cada tramo. Las de alto impacto exigen aprobación de un administrador:
              el sistema nunca demanda a nadie por su cuenta. A diferencia de los tramos, se pueden
              crear, editar y eliminar aunque la política esté vigente.
            </template>
          </UiTituloDescripcion>
          <UButton v-if="!agregandoEstrategia" size="xs" icon="i-lucide-plus" @click="abrirNuevaEstrategia">
            Agregar estrategia
          </UButton>
        </div>

        <div
          v-if="agregandoEstrategia && nuevaEstrategia"
          class="rounded-xl border border-primary-200 dark:border-primary-900/50 overflow-hidden bg-white dark:bg-neutral-900 shadow-sm mb-6"
        >
          <div class="bg-primary-50 dark:bg-primary-900/20 p-3 border-b border-primary-100 dark:border-primary-900/30 flex items-center gap-3">
            <div class="p-1.5 rounded-md bg-primary-500 text-white">
              <UIcon name="i-lucide-plus-circle" class="w-4 h-4" />
            </div>
            <span class="text-sm font-semibold text-primary-900 dark:text-primary-100">Nueva Estrategia de Gestión</span>
          </div>
          <div class="p-4 space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div class="space-y-1">
                <label class="text-[10px] font-bold uppercase text-neutral-400">Tramo</label>
                <USelect v-model="nuevaEstrategia.tramoId" :items="opcionesTramoEstrategia" size="xs" class="w-full" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-bold uppercase text-neutral-400">Código</label>
                <UInput v-model="nuevaEstrategia.codigo" size="xs" placeholder="Ej: COR-01" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-bold uppercase text-neutral-400">Nombre</label>
                <UInput v-model="nuevaEstrategia.nombre" size="xs" placeholder="Ej: Correo primer aviso" />
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div class="space-y-1">
                <label class="text-[10px] font-bold uppercase text-neutral-400">Tipo de Acción</label>
                <USelect v-model="nuevaEstrategia.tipoAccion" :items="OPCIONES_TIPO_ACCION" size="xs" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-bold uppercase text-neutral-400">Canal</label>
                <USelect v-model="nuevaEstrategia.canal" :items="OPCIONES_CANAL" size="xs" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-bold uppercase text-neutral-400">Rol Mínimo</label>
                <USelect v-model="nuevaEstrategia.rolMinimo" :items="OPCIONES_ROL" size="xs" />
              </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
              <div class="space-y-1">
                <label class="text-[10px] font-bold uppercase text-neutral-400">Días Desde</label>
                <UInput v-model.number="nuevaEstrategia.diasDesdeClasificacion" type="number" size="xs" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-bold uppercase text-neutral-400">Frecuencia</label>
                <div class="flex gap-1">
                  <UInput v-model.number="nuevaEstrategia.frecuenciaDias" type="number" size="xs" :disabled="nuevaEstrategia.sinFrecuencia" />
                  <UCheckbox v-model="nuevaEstrategia.sinFrecuencia" title="Una vez" />
                </div>
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-bold uppercase text-neutral-400">Intentos</label>
                <UInput v-model.number="nuevaEstrategia.maxIntentos" type="number" size="xs" min="1" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-bold uppercase text-neutral-400">Monto Mín.</label>
                <div class="flex gap-1">
                  <UInput v-model.number="nuevaEstrategia.montoMinimoDeuda" type="number" size="xs" :disabled="nuevaEstrategia.sinMontoMinimo" />
                  <UCheckbox v-model="nuevaEstrategia.sinMontoMinimo" title="Sin mín." />
                </div>
              </div>
            </div>
            <div class="flex items-center justify-between pt-4 border-t border-neutral-100 dark:border-neutral-800">
              <label class="flex items-center gap-2 text-xs text-neutral-500">
                <UCheckbox v-model="nuevaEstrategia.requiereAprobacion" />
                Exige aprobación de administrador
              </label>
              <div class="flex gap-2">
                <UButton size="xs" variant="ghost" color="neutral" @click="cerrarNuevaEstrategia">Cancelar</UButton>
                <UButton
                  size="xs"
                  icon="i-lucide-plus"
                  :loading="creandoEstrategia"
                  class="font-medium bg-primary-600 hover:bg-primary-700 text-white"
                  @click="agregarEstrategia"
                >
                  Añadir estrategia
                </UButton>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-8">
          <div v-for="grupo in porTramo" :key="grupo.tramo.id" class="space-y-3">
            <div class="flex items-center gap-2 py-2 border-b border-neutral-200 dark:border-neutral-800">
              <div class="w-1 h-4 bg-primary-500 rounded-full"/>
              <h3 class="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                {{ grupo.tramo.nombre }}
              </h3>
              <UBadge size="xs" variant="subtle" color="neutral" class="ml-1 font-mono">
                {{ rangoDias(grupo.tramo.diasMin, grupo.tramo.diasMax) }}
              </UBadge>
            </div>

            <div v-if="grupo.estrategias.length > 0" class="space-y-1.5 mb-2">
              <div
                v-for="estrategia in grupo.estrategias"
                :key="estrategia.id"
                class="rounded-md border border-neutral-200 dark:border-neutral-800 p-3"
                :class="estrategia.activa ? '' : 'opacity-60'"
              >
                <!-- ── vista ──────────────────────────────────────────── -->
                <div v-if="editandoEstrategiaId !== estrategia.id" class="flex flex-wrap items-center gap-3">
                  <div class="flex-1 min-w-56">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-medium text-sm">{{ estrategia.nombre }}</span>
                      <UBadge size="sm" variant="subtle" color="neutral">
                        {{ ETIQUETA_CANAL[estrategia.canal] ?? estrategia.canal }}
                      </UBadge>
                      <UBadge v-if="estrategia.requiereAprobacion" size="sm" variant="subtle" color="warning">
                        Exige aprobación
                      </UBadge>
                      <!-- Distinción que evita una expectativa falsa: la
                           acción se crea igual, pero el envío es manual. -->
                      <UBadge
                        v-if="!CANALES_AUTOMATICOS.has(estrategia.canal)"
                        size="xs"
                        variant="subtle"
                        color="neutral"
                        class="flex-shrink-0"
                        title="La acción se crea igual y queda en la bandeja; el envío se gestiona a mano."
                      >
                        Gestión manual
                      </UBadge>
                    </div>
                      <div class="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-[11px] text-neutral-500">
                        <div class="flex items-center gap-1">
                          <UIcon name="i-lucide-calendar" class="w-3 h-3 opacity-60" />
                          <span>{{ estrategia.diasDesdeClasificacion }} días</span>
                        </div>
                        <div class="flex items-center gap-1">
                          <UIcon name="i-lucide-repeat" class="w-3 h-3 opacity-60" />
                          <span>{{ estrategia.frecuenciaDias === null ? 'Una sola vez' : `Cada ${String(estrategia.frecuenciaDias)} días` }}</span>
                        </div>
                        <div class="flex items-center gap-1">
                          <UIcon name="i-lucide-list-ordered" class="w-3 h-3 opacity-60" />
                          <span>Máx. {{ estrategia.maxIntentos }} intentos</span>
                        </div>
                        <div v-if="estrategia.montoMinimoDeuda !== null" class="flex items-center gap-1">
                          <UIcon name="i-lucide-circle-dollar-sign" class="w-3 h-3 opacity-60" />
                          <span>Desde {{ formatoMoneda(estrategia.montoMinimoDeuda) }}</span>
                        </div>
                        <div class="flex items-center gap-1">
                          <UIcon name="i-lucide-user-check" class="w-3 h-3 opacity-60" />
                          <span>Rol: {{ estrategia.rolMinimo }}</span>
                        </div>
                      </div>
                  </div>

                  <div class="flex items-center gap-1.5 shrink-0">
                    <UButton
                      size="xs"
                      :variant="estrategia.activa ? 'outline' : 'solid'"
                      :color="estrategia.activa ? 'neutral' : 'primary'"
                      :loading="cambiando === estrategia.id"
                      class="min-w-[80px]"
                      @click="alternar(estrategia)"
                    >
                      {{ estrategia.activa ? 'Desactivar' : 'Activar' }}
                    </UButton>
                    <UButton size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Editar" class="p-1.5" @click="editarEstrategia(estrategia)">
                      <span class="hidden md:inline ml-1">Editar</span>
                    </UButton>
                    <template v-if="confirmandoEliminarEstrategiaId === estrategia.id">
                      <div class="flex items-center gap-1 ml-1">
                        <UButton size="xs" color="error" variant="outline" :loading="eliminandoEstrategiaId === estrategia.id" @click="eliminarEstrategia(estrategia.id)">Sí</UButton>
                        <UButton size="xs" variant="ghost" color="neutral" @click="confirmandoEliminarEstrategiaId = null">No</UButton>
                      </div>
                    </template>
                    <UButton
                      v-else
                      size="xs"
                      variant="ghost"
                      color="error"
                      icon="i-lucide-trash-2"
                      aria-label="Eliminar estrategia"
                      class="p-1.5"
                      @click="confirmandoEliminarEstrategiaId = estrategia.id"
                    />
                  </div>
                </div>

                <!-- ── edición ────────────────────────────────────────── -->
                <div v-else-if="draftsEstrategia[estrategia.id]" class="p-3 space-y-3">
                  <div class="flex gap-2">
                    <UInput v-model="draftsEstrategia[estrategia.id]!.nombre" size="xs" class="flex-1 font-medium" placeholder="Nombre" />
                    <span class="text-xs text-neutral-400 self-center bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">{{ estrategia.codigo }}</span>
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <USelect v-model="draftsEstrategia[estrategia.id]!.tipoAccion" :items="OPCIONES_TIPO_ACCION" size="xs" />
                    <USelect v-model="draftsEstrategia[estrategia.id]!.canal" :items="OPCIONES_CANAL" size="xs" />
                    <USelect v-model="draftsEstrategia[estrategia.id]!.rolMinimo" :items="OPCIONES_ROL" size="xs" />
                  </div>
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                    <div class="space-y-1">
                      <label class="text-[10px] font-bold uppercase text-neutral-400">DíasDesde</label>
                      <UInput v-model.number="draftsEstrategia[estrategia.id]!.diasDesdeClasificacion" type="number" size="xs" />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[10px] font-bold uppercase text-neutral-400">Frecuencia</label>
                      <div class="flex gap-1">
                        <UInput v-model.number="draftsEstrategia[estrategia.id]!.frecuenciaDias" type="number" size="xs" :disabled="draftsEstrategia[estrategia.id]!.sinFrecuencia" />
                        <UCheckbox v-model="draftsEstrategia[estrategia.id]!.sinFrecuencia" title="Una sola vez" />
                      </div>
                    </div>
                    <div class="space-y-1">
                      <label class="text-[10px] font-bold uppercase text-neutral-400">Intentos</label>
                      <UInput v-model.number="draftsEstrategia[estrategia.id]!.maxIntentos" type="number" size="xs" min="1" />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[10px] font-bold uppercase text-neutral-400">Monto Mín.</label>
                      <div class="flex gap-1">
                        <UInput v-model.number="draftsEstrategia[estrategia.id]!.montoMinimoDeuda" type="number" size="xs" :disabled="draftsEstrategia[estrategia.id]!.sinMontoMinimo" />
                        <UCheckbox v-model="draftsEstrategia[estrategia.id]!.sinMontoMinimo" title="Sin mín." />
                      </div>
                    </div>
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold uppercase text-neutral-400">Plantilla de mensaje</label>
                    <UInput v-model="draftsEstrategia[estrategia.id]!.plantillaCodigo" size="xs" placeholder="Código de plantilla (opcional)" />
                  </div>
                  <div class="flex items-center justify-between pt-3 border-t border-neutral-100 dark:border-neutral-800">
                    <label class="flex items-center gap-2 text-xs text-neutral-500">
                      <UCheckbox v-model="draftsEstrategia[estrategia.id]!.requiereAprobacion" />
                      Exige aprobación de administrador
                    </label>
                    <div class="flex gap-2">
                      <UButton size="xs" variant="ghost" color="neutral" @click="editandoEstrategiaId = null">Cancelar</UButton>
                      <UButton
                        size="xs"
                        icon="i-lucide-save"
                        :loading="guardandoEstrategiaId === estrategia.id"
                        class="font-medium"
                        @click="guardarEstrategia(estrategia.id)"
                      >
                        Guardar cambios
                      </UButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
