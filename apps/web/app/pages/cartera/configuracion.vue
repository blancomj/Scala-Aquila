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
    <div>
      <h1 class="text-xl font-semibold mb-2">Configuración de cartera</h1>
      <p class="text-sm text-neutral-500">
        Cómo se clasifica la mora y qué gestión corresponde a cada tramo.
      </p>
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
    <div v-if="sinConfigurar && !configStore.loading" class="rounded-md border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
      <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 mt-1 max-w-2xl">
        <template #titulo>
          <h2 class="font-semibold">Esta copropiedad todavía no tiene política de cartera</h2>
        </template>
        <template #descripcion>
          Sin política de clasificación, la corrida diaria no clasifica nada ni genera gestión de
          cobro: el módulo queda inactivo. Puedes partir de la configuración sugerida —ocho tramos
          de mora y las estrategias de cobranza correspondientes— y ajustarla antes de activarla.
        </template>
      </UiTituloDescripcion>
      <UButton icon="i-lucide-sparkles" :loading="sembrando" @click="sembrar">
        Crear configuración sugerida
      </UButton>
      <p class="text-xs text-neutral-400">
        Se crea en borrador. Nada empieza a funcionar hasta que la actives.
      </p>
    </div>

    <template v-else-if="politica">
      <!-- ── estado de la política ──────────────────────────────────── -->
      <div class="rounded-md border border-neutral-200 dark:border-neutral-800 p-4 flex flex-wrap items-center gap-3">
        <div class="flex-1 min-w-64">
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ politica.nombre }}</span>
            <UBadge size="sm" variant="subtle" :color="esBorrador ? 'warning' : 'success'">
              {{ esBorrador ? 'Borrador' : 'Vigente' }}
            </UBadge>
            <span class="text-xs text-neutral-400">versión {{ politica.version }}</span>
          </div>
          <p v-if="esBorrador" class="text-sm text-neutral-500 mt-1">
            Todavía no rige. La corrida diaria seguirá sin clasificar hasta que la actives.
          </p>
          <p v-else class="text-sm text-neutral-500 mt-1">
            Una política vigente no se puede modificar: corregirla es crear una versión nueva.
          </p>
        </div>
        <UButton
          v-if="esBorrador"
          icon="i-lucide-check"
          :loading="activando === politica.id"
          @click="activar(politica.id)"
        >
          Activar política
        </UButton>
        <UButton
          v-else-if="!enEdicion"
          icon="i-lucide-git-branch-plus"
          variant="outline"
          :loading="creandoVersion"
          @click="crearVersion"
        >
          Crear versión nueva para editar
        </UButton>
      </div>

      <!-- ── nueva versión en edición (§8.5, bloque 23) ─────────────────── -->
      <div v-if="enEdicion" class="rounded-md border border-primary-300 dark:border-primary-800 p-4 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ enEdicion.nombre }}</span>
              <UBadge size="sm" variant="subtle" color="warning">Borrador — versión {{ enEdicion.version }}</UBadge>
            </div>
            <p class="text-sm text-neutral-500 mt-1">
              Edita sus tramos y compáralos contra la vigente. Nada cambia para la vigente hasta que
              actives esta versión.
            </p>
          </div>
          <UButton icon="i-lucide-check" :loading="activando === enEdicion.id" @click="activar(enEdicion.id)">
            Activar esta versión
          </UButton>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 class="text-xs font-semibold text-neutral-500 mb-2">Vigente hoy (solo lectura)</h3>
            <div class="space-y-1.5">
              <div
                v-for="tramo in configStore.tramos"
                :key="tramo.id"
                class="rounded-md border border-neutral-200 dark:border-neutral-800 p-2.5 text-sm"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="font-medium">{{ tramo.nombre }}</span>
                  <UBadge size="sm" variant="subtle" :color="COLOR_RIESGO[tramo.nivelRiesgo] ?? 'neutral'">
                    {{ tramo.nivelRiesgo }}
                  </UBadge>
                </div>
                <p class="text-xs text-neutral-400">
                  {{ rangoDias(tramo.diasMin, tramo.diasMax) }} · {{ ETIQUETA_ETAPA[tramo.etapaCobranza] ?? tramo.etapaCobranza }}
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 class="text-xs font-semibold text-neutral-500 mb-2">Borrador (editable)</h3>
            <div class="space-y-2">
              <div
                v-for="tramo in configStore.tramosBorrador"
                :key="tramo.id"
                class="rounded-md border border-neutral-200 dark:border-neutral-800 p-2.5 space-y-2"
              >
                <div v-if="draftsTramo[tramo.id]" class="space-y-2">
                  <div class="flex gap-2">
                    <UInput v-model="draftsTramo[tramo.id]!.nombre" size="xs" class="flex-1" placeholder="Nombre" />
                    <span class="text-xs text-neutral-400 self-center">{{ tramo.codigo }}</span>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <UInput v-model.number="draftsTramo[tramo.id]!.diasMin" type="number" size="xs" class="w-20" />
                    <span class="text-xs text-neutral-400">a</span>
                    <UInput
                      v-model.number="draftsTramo[tramo.id]!.diasMax"
                      type="number"
                      size="xs"
                      class="w-20"
                      :disabled="draftsTramo[tramo.id]!.sinTope"
                    />
                    <label class="flex items-center gap-1 text-xs text-neutral-500">
                      <UCheckbox v-model="draftsTramo[tramo.id]!.sinTope" />
                      Sin tope
                    </label>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <USelect
                      v-model="draftsTramo[tramo.id]!.nivelRiesgo"
                      :items="OPCIONES_RIESGO"
                      size="xs"
                      class="w-28"
                    />
                    <USelect
                      v-model="draftsTramo[tramo.id]!.etapaCobranza"
                      :items="OPCIONES_ETAPA"
                      size="xs"
                      class="w-36"
                    />
                  </div>
                  <div class="flex items-center gap-2">
                    <UButton
                      size="xs"
                      icon="i-lucide-save"
                      :loading="guardandoTramoId === tramo.id"
                      @click="guardarTramo(tramo.id)"
                    >
                      Guardar
                    </UButton>
                    <template v-if="confirmandoEliminarId === tramo.id">
                      <span class="text-xs text-neutral-500">¿Eliminar este tramo?</span>
                      <UButton
                        size="xs"
                        color="error"
                        variant="outline"
                        :loading="eliminandoTramoId === tramo.id"
                        @click="eliminarTramo(tramo.id)"
                      >
                        Sí, eliminar
                      </UButton>
                      <UButton size="xs" variant="ghost" color="neutral" @click="confirmandoEliminarId = null">
                        Cancelar
                      </UButton>
                    </template>
                    <UButton
                      v-else
                      size="xs"
                      variant="ghost"
                      color="error"
                      icon="i-lucide-trash-2"
                      @click="confirmandoEliminarId = tramo.id"
                    >
                      Eliminar
                    </UButton>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── agregar tramo ─────────────────────────────────────── -->
            <div class="rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 p-2.5 space-y-2 mt-2">
              <p class="text-xs font-medium text-neutral-500">Agregar tramo</p>
              <div class="flex gap-2">
                <UInput v-model="nuevoTramo.codigo" size="xs" class="w-28" placeholder="Código" />
                <UInput v-model="nuevoTramo.nombre" size="xs" class="flex-1" placeholder="Nombre" />
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <UInput v-model.number="nuevoTramo.diasMin" type="number" size="xs" class="w-20" placeholder="Desde" />
                <span class="text-xs text-neutral-400">a</span>
                <UInput
                  v-model.number="nuevoTramo.diasMax"
                  type="number"
                  size="xs"
                  class="w-20"
                  :disabled="nuevoTramo.sinTope"
                  placeholder="Hasta"
                />
                <label class="flex items-center gap-1 text-xs text-neutral-500">
                  <UCheckbox v-model="nuevoTramo.sinTope" />
                  Sin tope
                </label>
              </div>
              <div class="flex flex-wrap gap-2">
                <USelect v-model="nuevoTramo.nivelRiesgo" :items="OPCIONES_RIESGO" size="xs" class="w-28" />
                <USelect v-model="nuevoTramo.etapaCobranza" :items="OPCIONES_ETAPA" size="xs" class="w-36" />
              </div>
              <UButton size="xs" icon="i-lucide-plus" :loading="creandoTramo" @click="agregarTramo">
                Agregar
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
            <span class="text-sm tabular-nums">
              {{ fila.estrategias.filter((e) => e.activa).length }} activa(s)
            </span>
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
          class="rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 p-3 space-y-2 mb-4"
        >
          <div class="flex flex-wrap gap-2">
            <USelect v-model="nuevaEstrategia.tramoId" :items="opcionesTramoEstrategia" size="xs" class="w-48" placeholder="Tramo" />
            <UInput v-model="nuevaEstrategia.codigo" size="xs" class="w-28" placeholder="Código" />
            <UInput v-model="nuevaEstrategia.nombre" size="xs" class="flex-1 min-w-40" placeholder="Nombre" />
          </div>
          <div class="flex flex-wrap gap-2">
            <USelect v-model="nuevaEstrategia.tipoAccion" :items="OPCIONES_TIPO_ACCION" size="xs" class="w-48" />
            <USelect v-model="nuevaEstrategia.canal" :items="OPCIONES_CANAL" size="xs" class="w-32" />
            <USelect v-model="nuevaEstrategia.rolMinimo" :items="OPCIONES_ROL" size="xs" class="w-32" />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-neutral-500">Días desde clasificar</span>
            <UInput v-model.number="nuevaEstrategia.diasDesdeClasificacion" type="number" size="xs" class="w-20" />
            <span class="text-xs text-neutral-500">Frecuencia</span>
            <UInput
              v-model.number="nuevaEstrategia.frecuenciaDias"
              type="number"
              size="xs"
              class="w-20"
              :disabled="nuevaEstrategia.sinFrecuencia"
            />
            <label class="flex items-center gap-1 text-xs text-neutral-500">
              <UCheckbox v-model="nuevaEstrategia.sinFrecuencia" />
              Una sola vez
            </label>
            <span class="text-xs text-neutral-500">Máx. intentos</span>
            <UInput v-model.number="nuevaEstrategia.maxIntentos" type="number" size="xs" class="w-16" min="1" />
          </div>
          <label class="flex items-center gap-1 text-xs text-neutral-500">
            <UCheckbox v-model="nuevaEstrategia.requiereAprobacion" />
            Exige aprobación
          </label>
          <div class="flex items-center gap-2">
            <UButton size="xs" icon="i-lucide-plus" :loading="creandoEstrategia" @click="agregarEstrategia">
              Agregar
            </UButton>
            <UButton size="xs" variant="ghost" color="neutral" @click="cerrarNuevaEstrategia">
              Cancelar
            </UButton>
          </div>
        </div>

        <div class="space-y-4">
          <div v-for="grupo in porTramo" :key="grupo.tramo.id">
            <p class="text-xs font-medium text-neutral-500 mb-1.5">
              {{ grupo.tramo.nombre }} · {{ rangoDias(grupo.tramo.diasMin, grupo.tramo.diasMax) }}
            </p>

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
                        size="sm"
                        variant="subtle"
                        color="neutral"
                        title="La acción se crea igual y queda en la bandeja; el envío se gestiona a mano."
                      >
                        Gestión manual
                      </UBadge>
                    </div>
                    <p class="text-xs text-neutral-400 mt-0.5">
                      A los {{ estrategia.diasDesdeClasificacion }} día(s) de clasificar ·
                      {{ estrategia.frecuenciaDias === null ? 'una sola vez' : `cada ${String(estrategia.frecuenciaDias)} días` }}
                      · máximo {{ estrategia.maxIntentos }} intento(s)
                      <template v-if="estrategia.montoMinimoDeuda !== null">
                        · desde {{ formatoMoneda(estrategia.montoMinimoDeuda) }}
                      </template>
                      · rol mínimo {{ estrategia.rolMinimo }}
                    </p>
                  </div>

                  <div class="flex items-center gap-1.5">
                    <UButton
                      size="xs"
                      :variant="estrategia.activa ? 'outline' : 'solid'"
                      :color="estrategia.activa ? 'neutral' : 'primary'"
                      :loading="cambiando === estrategia.id"
                      @click="alternar(estrategia)"
                    >
                      {{ estrategia.activa ? 'Desactivar' : 'Activar' }}
                    </UButton>
                    <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="editarEstrategia(estrategia)">
                      Editar
                    </UButton>
                    <template v-if="confirmandoEliminarEstrategiaId === estrategia.id">
                      <span class="text-xs text-neutral-500">¿Eliminar?</span>
                      <UButton
                        size="xs"
                        color="error"
                        variant="outline"
                        :loading="eliminandoEstrategiaId === estrategia.id"
                        @click="eliminarEstrategia(estrategia.id)"
                      >
                        Sí
                      </UButton>
                      <UButton size="xs" variant="ghost" color="neutral" @click="confirmandoEliminarEstrategiaId = null">
                        No
                      </UButton>
                    </template>
                    <UButton
                      v-else
                      size="xs"
                      variant="ghost"
                      color="error"
                      icon="i-lucide-trash-2"
                      @click="confirmandoEliminarEstrategiaId = estrategia.id"
                    >
                      Eliminar
                    </UButton>
                  </div>
                </div>

                <!-- ── edición ────────────────────────────────────────── -->
                <div v-else-if="draftsEstrategia[estrategia.id]" class="space-y-2">
                  <div class="flex gap-2">
                    <UInput v-model="draftsEstrategia[estrategia.id]!.nombre" size="xs" class="flex-1" placeholder="Nombre" />
                    <span class="text-xs text-neutral-400 self-center">{{ estrategia.codigo }}</span>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <USelect v-model="draftsEstrategia[estrategia.id]!.tipoAccion" :items="OPCIONES_TIPO_ACCION" size="xs" class="w-48" />
                    <USelect v-model="draftsEstrategia[estrategia.id]!.canal" :items="OPCIONES_CANAL" size="xs" class="w-32" />
                    <USelect v-model="draftsEstrategia[estrategia.id]!.rolMinimo" :items="OPCIONES_ROL" size="xs" class="w-32" />
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-xs text-neutral-500">Días desde clasificar</span>
                    <UInput v-model.number="draftsEstrategia[estrategia.id]!.diasDesdeClasificacion" type="number" size="xs" class="w-20" />
                    <span class="text-xs text-neutral-500">Frecuencia</span>
                    <UInput
                      v-model.number="draftsEstrategia[estrategia.id]!.frecuenciaDias"
                      type="number"
                      size="xs"
                      class="w-20"
                      :disabled="draftsEstrategia[estrategia.id]!.sinFrecuencia"
                    />
                    <label class="flex items-center gap-1 text-xs text-neutral-500">
                      <UCheckbox v-model="draftsEstrategia[estrategia.id]!.sinFrecuencia" />
                      Una sola vez
                    </label>
                    <span class="text-xs text-neutral-500">Máx. intentos</span>
                    <UInput v-model.number="draftsEstrategia[estrategia.id]!.maxIntentos" type="number" size="xs" class="w-16" min="1" />
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-xs text-neutral-500">Monto mínimo de deuda</span>
                    <UInput
                      v-model.number="draftsEstrategia[estrategia.id]!.montoMinimoDeuda"
                      type="number"
                      size="xs"
                      class="w-28"
                      :disabled="draftsEstrategia[estrategia.id]!.sinMontoMinimo"
                    />
                    <label class="flex items-center gap-1 text-xs text-neutral-500">
                      <UCheckbox v-model="draftsEstrategia[estrategia.id]!.sinMontoMinimo" />
                      Sin mínimo
                    </label>
                    <label class="flex items-center gap-1 text-xs text-neutral-500">
                      <UCheckbox v-model="draftsEstrategia[estrategia.id]!.requiereAprobacion" />
                      Exige aprobación
                    </label>
                  </div>
                  <UInput
                    v-model="draftsEstrategia[estrategia.id]!.plantillaCodigo"
                    size="xs"
                    class="w-full"
                    placeholder="Código de plantilla (opcional)"
                  />
                  <div class="flex items-center gap-2">
                    <UButton
                      size="xs"
                      icon="i-lucide-save"
                      :loading="guardandoEstrategiaId === estrategia.id"
                      @click="guardarEstrategia(estrategia.id)"
                    >
                      Guardar
                    </UButton>
                    <UButton size="xs" variant="ghost" color="neutral" @click="editandoEstrategiaId = null">
                      Cancelar
                    </UButton>
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
