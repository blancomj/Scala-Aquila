<script setup lang="ts">
// Bandeja de acciones de cobranza (CAR §23.5, bloque 16) — la cola de
// trabajo del administrador y la puerta de entrada a todo lo construido en
// F4-F7 y §34, que hasta ahora solo se podía operar invocando funciones a
// mano.
//
// Tres cosas que esta pantalla tiene que dejar claras, porque son el
// corazón del módulo y se confunden con facilidad:
//
//   1. APROBAR no es EJECUTAR. El maker-checker del art. 48 exige que
//      alguien identificado autorice lo de alto impacto ANTES de que salga.
//   2. EJECUTADA no es RECIBIDA. `ejecutada` significa despachada al
//      proveedor (REC-CAR-016); la entrega llega después por acuse.
//   3. ACREDITADA es lo único que sirve ante un juez, y se DERIVA de los
//      acuses (§34.4) — por eso la columna "Prueba" es una columna propia
//      y no un adorno del estado.
//
// Las reglas duras las impone la base (guard_accion_cobranza_transicion:
// rol administrador, prohibición de autoaprobación, transiciones válidas).
// Aquí se replican solo para no ofrecer botones que van a fallar, y cuando
// el botón se deshabilita se dice POR QUÉ — un botón gris sin explicación
// es peor que un error.
import type { Database } from '@aquila/shared'
import { formatoMoneda } from '~/utils/formato'
import type { AccionBandeja, EnvioDetalle } from '~/stores/cobranza'
import { CANALES_AUTOMATICOS, ETIQUETA_CANAL, textoLegible } from '~/utils/mensaje-cobranza'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type EstadoAccion = AccionBandeja['estado']
type DocumentoRow = Database['public']['Views']['v_documento_vigente']['Row']

const tenantStore = useTenantStore()
const cobranzaStore = useCobranzaStore()
const documentosStore = useDocumentosStore()
const toast = useToast()
const authStore = useAuthStore()

const errorCarga = ref<string | null>(null)
const filtroEstado = ref<EstadoAccion | 'todas'>('todas')
const busqueda = ref('')
const procesando = ref<string | null>(null)
const resumenExpandido = ref(true)

// ── detalle probatorio ────────────────────────────────────────────────
const detalleAbierto = ref(false)
const accionDetalle = ref<AccionBandeja | null>(null)
const enviosDetalle = ref<EnvioDetalle[]>([])
const cargandoDetalle = ref(false)

// ── confirmación de despacho (impeccable critique P0) — despachar pone un
// mensaje en manos de un deudor real y no se puede deshacer; a diferencia
// de aprobar/rechazar (reversible mientras no se despache), esto sí merece
// una pausa deliberada antes del clic que dispara el envío.
const modalDespacharAbierto = ref(false)
const accionDespachando = ref<AccionBandeja | null>(null)

// ── evidencia manual por envío (PRQ-CAR-022) — constancia de entrega o
// acuse firmado, sobre todo para el canal físico, donde no hay webhook
// de proveedor que lo aporte solo. Mapas por envioId porque varios
// intentos conviven en el mismo drawer y cada uno guarda su propia
// evidencia (mismo criterio que "el intento 1 rebota, el 2 entrega" en
// la cabecera de 20260906100000).
const opcionesTipoDocumentoEvidencia = ref<{ valor: number; etiqueta: string }[]>([])
const tipoEvidenciaPorEnvio = ref<Record<string, number | null>>({})
const archivoEvidenciaPorEnvio = ref<Record<string, File | null>>({})
const documentosPorEnvio = ref<Record<string, DocumentoRow[]>>({})
const subiendoEvidenciaEnvioId = ref<string | null>(null)
const descargandoEvidencia = ref<string | null>(null)

const ESTADOS_FILTRO: { valor: EstadoAccion | 'todas'; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'pendiente_aprobacion', etiqueta: 'Esperan aprobación' },
  { valor: 'aprobada', etiqueta: 'Aprobadas' },
  { valor: 'programada', etiqueta: 'Programadas' },
  { valor: 'ejecutada', etiqueta: 'Despachadas' },
  { valor: 'fallida', etiqueta: 'Fallidas' },
  { valor: 'rechazada', etiqueta: 'Rechazadas' },
]

const ETIQUETA_ESTADO: Record<string, string> = {
  programada: 'Programada',
  pendiente_aprobacion: 'Espera aprobación',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  ejecutando: 'Despachando',
  ejecutada: 'Despachada',
  fallida: 'Fallida',
  cancelada: 'Cancelada',
}

const COLOR_ESTADO: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'error'> = {
  programada: 'neutral',
  pendiente_aprobacion: 'warning',
  aprobada: 'primary',
  rechazada: 'neutral',
  ejecutando: 'primary',
  ejecutada: 'success',
  fallida: 'error',
  cancelada: 'neutral',
}

const ETIQUETA_ACCION: Record<string, string> = {
  email: 'Correo',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  llamada: 'Llamada',
  carta: 'Carta',
  requerimiento_formal: 'Requerimiento formal',
  aviso_prejuridico: 'Aviso prejurídico',
  publicacion_morosos: 'Publicación de morosos',
  restriccion_servicios: 'Restricción de servicios',
  visita: 'Visita',
  asignacion_abogado: 'Asignación de abogado',
  remision_juridica: 'Remisión jurídica',
  propuesta_acuerdo: 'Propuesta de acuerdo',
  revision_manual: 'Revisión manual',
}

const ETIQUETA_ACUSE: Record<string, string> = {
  encolado: 'En cola del proveedor',
  entregado: 'Entregado',
  leido: 'Leído',
  rebotado: 'Rebotado',
  fallido: 'Fallido',
  no_entregable: 'No entregable',
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  try {
    await cobranzaStore.cargarBandeja(tenantId)
  } catch (excepcion) {
    errorCarga.value = excepcion instanceof Error ? excepcion.message : 'No se pudo cargar la bandeja.'
  }
}

// useAsyncData y no un `await cargar()` suelto: tras un await a nivel de
// setup se pierde el contexto de Nuxt, y el store deja de encontrar Pinia
// en SSR. Mismo patrón que cartera/index.vue.
await useAsyncData('cartera-acciones-inicial', async () => {
  await cargar()
  return null
})

watch(() => tenantStore.activeTenant?.id, cargar)

const acciones = computed(() => cobranzaStore.acciones)

/** Conteos por estado — la cola que importa es la primera. */
const resumen = computed(() => {
  const filas = acciones.value
  return {
    esperanAprobacion: filas.filter((a) => a.estado === 'pendiente_aprobacion').length,
    listasParaEnviar: filas.filter((a) => a.estado === 'aprobada' || a.estado === 'programada').length,
    despachadasSinAcuse: filas.filter((a) => a.estado === 'ejecutada' && !a.acreditada).length,
    acreditadas: filas.filter((a) => a.acreditada).length,
    fallidas: filas.filter((a) => a.estado === 'fallida').length,
  }
})

const filas = computed(() => {
  const termino = busqueda.value.trim().toLowerCase()
  return acciones.value.filter((a) => {
    if (filtroEstado.value !== 'todas' && a.estado !== filtroEstado.value) return false
    if (!termino) return true
    return (
      a.inmuebleCodigo.toLowerCase().includes(termino) ||
      (a.destinatarioNombre ?? '').toLowerCase().includes(termino)
    )
  })
})

const esAdministrador = computed(() => tenantStore.role === 'administrador')

/**
 * Por qué NO se puede decidir sobre esta acción, en palabras. null = sí se
 * puede. El mismo criterio que aplica el trigger en la base.
 */
function motivoNoPuedeDecidir(accion: AccionBandeja): string | null {
  if (accion.estado !== 'pendiente_aprobacion') return 'Esta acción no está esperando aprobación.'
  if (!esAdministrador.value) return 'Aprobar o rechazar una acción de cobranza requiere rol administrador (art. 48).'
  if (accion.propuestaPor && accion.propuestaPor === authStore.profile?.id) {
    return 'No puedes aprobar una acción que tú mismo propusiste.'
  }
  return null
}

/** Igual, para el despacho. */
function motivoNoPuedeDespachar(accion: AccionBandeja): string | null {
  if (accion.estado !== 'aprobada' && accion.estado !== 'programada') {
    return 'Solo se despacha lo que está programado o aprobado.'
  }
  if (!CANALES_AUTOMATICOS.has(accion.canal)) {
    return `El canal ${ETIQUETA_CANAL[accion.canal] ?? accion.canal} se gestiona a mano: no hay despacho automático.`
  }
  return null
}

async function decidir(accion: AccionBandeja, decision: 'aprobada' | 'rechazada'): Promise<void> {
  procesando.value = accion.accionId
  try {
    await cobranzaStore.decidirAccion(accion.accionId, decision)
    toast.add({
      title: decision === 'aprobada' ? 'Acción aprobada' : 'Acción rechazada',
      description: `${ETIQUETA_ACCION[accion.tipoAccion] ?? accion.tipoAccion} · unidad ${accion.inmuebleCodigo}`,
      color: decision === 'aprobada' ? 'success' : 'neutral',
    })
    await cargar()
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo registrar la decisión',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    procesando.value = null
  }
}

function abrirConfirmarDespacho(accion: AccionBandeja): void {
  accionDespachando.value = accion
  modalDespacharAbierto.value = true
}

async function confirmarDespacho(): Promise<void> {
  const accion = accionDespachando.value
  if (!accion) return
  modalDespacharAbierto.value = false
  await despachar(accion)
  accionDespachando.value = null
}

async function despachar(accion: AccionBandeja): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  procesando.value = accion.accionId
  try {
    const resultado = await cobranzaStore.despacharAccion(tenantId, accion.accionId)
    if (resultado.success) {
      toast.add({
        title: 'Mensaje despachado',
        // Se dice explícitamente que despachar no es entregar: es la
        // confusión que el módulo entero intenta evitar.
        description: 'Despachado al proveedor. La entrega se acreditará cuando llegue el acuse.',
        color: 'success',
      })
    } else {
      toast.add({
        title: 'El proveedor rechazó el envío',
        description: resultado.errorMessage ?? 'Sin detalle del proveedor.',
        color: 'error',
      })
    }
    if (!resultado.evidenciaRegistrada) {
      toast.add({
        title: 'Atención: envío sin evidencia',
        description: 'El mensaje salió pero no se pudo registrar su prueba. Revísalo antes de escalar el caso.',
        color: 'warning',
      })
    }
    await cargar()
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo despachar',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    procesando.value = null
  }
}

async function verDetalle(accion: AccionBandeja): Promise<void> {
  accionDetalle.value = accion
  detalleAbierto.value = true
  enviosDetalle.value = []
  documentosPorEnvio.value = {}
  tipoEvidenciaPorEnvio.value = {}
  archivoEvidenciaPorEnvio.value = {}
  cargandoDetalle.value = true
  try {
    enviosDetalle.value = await cobranzaStore.cargarEnvios(accion.accionId)

    const tenantId = tenantStore.activeTenant?.id
    if (tenantId && enviosDetalle.value.length > 0) {
      if (opcionesTipoDocumentoEvidencia.value.length === 0) {
        const tipos = await cargarListaTipos(tenantId, 'TIPO_DOCUMENTO')
        opcionesTipoDocumentoEvidencia.value = tipos.map((t) => ({ valor: t.id, etiqueta: t.nombre }))
      }
      const pares = await Promise.all(
        enviosDetalle.value.map(async (envio) => {
          const documentos = await documentosStore.cargarDocumentos(tenantId, null, undefined, envio.envioId)
          return [envio.envioId, documentos] as const
        }),
      )
      documentosPorEnvio.value = Object.fromEntries(pares)
    }
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo cargar la evidencia',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    cargandoDetalle.value = false
  }
}

const MIME_EVIDENCIA_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const TAMANO_EVIDENCIA_MAXIMO = 15 * 1024 * 1024

function elegirArchivoEvidencia(envioId: string, evento: Event): void {
  const input = evento.target as HTMLInputElement
  const archivo = input.files?.[0] ?? null
  if (archivo && (!MIME_EVIDENCIA_PERMITIDOS.has(archivo.type) || archivo.size > TAMANO_EVIDENCIA_MAXIMO)) {
    toast.add({ title: 'Archivo inválido', description: 'Solo PDF, JPG o PNG, hasta 15 MB.', color: 'warning' })
    input.value = ''
    return
  }
  archivoEvidenciaPorEnvio.value[envioId] = archivo
}

async function subirEvidencia(envioId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const tipoDocumentoId = tipoEvidenciaPorEnvio.value[envioId]
  const archivo = archivoEvidenciaPorEnvio.value[envioId]
  if (!tenantId || !tipoDocumentoId || !archivo) return

  subiendoEvidenciaEnvioId.value = envioId
  try {
    await documentosStore.subirDocumento({ tenantId, inmuebleId: null, envioId, tipoDocumentoId, archivo })
    documentosPorEnvio.value[envioId] = await documentosStore.cargarDocumentos(tenantId, null, undefined, envioId)
    archivoEvidenciaPorEnvio.value[envioId] = null
    toast.add({ title: 'Constancia adjuntada', color: 'success' })
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo adjuntar la constancia',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    subiendoEvidenciaEnvioId.value = null
  }
}

async function descargarEvidencia(storagePath: string | null): Promise<void> {
  if (!storagePath) return
  descargandoEvidencia.value = storagePath
  try {
    const url = await documentosStore.urlDescarga(storagePath)
    window.open(url, '_blank', 'noopener')
  } catch {
    toast.add({ title: 'No se pudo generar el enlace de descarga', color: 'error' })
  } finally {
    descargandoEvidencia.value = null
  }
}

function fechaCorta(iso: string | null): string {
  if (!iso) return '—'
  return iso.slice(0, 10)
}

function fechaHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
  <div class="space-y-6">
    <div class="mb-8">
      <div class="flex items-start justify-between gap-4">
        <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 max-w-2xl">
          <template #titulo>
            <h1 class="text-2xl font-semibold tracking-tight">Acciones de cobranza</h1>
          </template>
          <template #descripcion>
            Cola de gestión: supervisión de envíos, autorizaciones de alto impacto
            y acreditación de pruebas para procesos judiciales.
          </template>
        </UiTituloDescripcion>
        <button
          type="button"
          class="mt-1 flex shrink-0 items-center gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300"
          @click="resumenExpandido = !resumenExpandido"
        >
          <UIcon :name="resumenExpandido ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="size-4" />
          {{ resumenExpandido ? 'Cerrar resumen' : 'Ver resumen' }}
        </button>
      </div>
    </div>

    <UAlert
      v-if="errorCarga"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="No se pudo cargar la bandeja"
      :description="errorCarga"
    />

    <!-- ── resumen de colas ─────────────────────────────────────────── -->
    <div v-if="resumenExpandido" class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
      <button
        type="button"
        class="text-left rounded-xl border p-4 transition-all group"
        :class="filtroEstado === 'pendiente_aprobacion'
          ? 'border-warning-500 bg-warning-50 dark:bg-warning-900/20 ring-1 ring-warning-500'
          : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-white dark:bg-neutral-900'"
        @click="filtroEstado = filtroEstado === 'pendiente_aprobacion' ? 'todas' : 'pendiente_aprobacion'"
      >
        <p class="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-300">Esperan aprobación</p>
        <p class="text-3xl font-bold tabular-nums mt-1">{{ resumen.esperanAprobacion }}</p>
      </button>

      <div class="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
        <p class="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Listas para enviar</p>
        <p class="text-3xl font-bold tabular-nums mt-1">{{ resumen.listasParaEnviar }}</p>
      </div>

      <div class="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
        <p class="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Despachadas sin acuse</p>
        <p class="text-3xl font-bold tabular-nums mt-1">{{ resumen.despachadasSinAcuse }}</p>
      </div>

      <div class="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
        <p class="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Acreditadas</p>
        <p class="text-3xl font-bold tabular-nums mt-1 text-success-600 dark:text-success-400">{{ resumen.acreditadas }}</p>
      </div>

      <div class="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
        <p class="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Fallidas</p>
        <p class="text-3xl font-bold tabular-nums mt-1 text-error-600 dark:text-error-400">{{ resumen.fallidas }}</p>
      </div>
    </div>

    <!-- ── filtros ──────────────────────────────────────────────────── -->
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div class="flex items-center gap-2 w-full sm:w-auto order-first sm:order-none">
        <UInput
          v-model="busqueda"
          placeholder="Buscar unidad o destinatario"
          icon="i-lucide-search"
          size="sm"
          class="w-full sm:w-80"
          :ui="{ trailing: 'pr-8' }"
        >
          <template v-if="busqueda" #trailing>
            <button
              type="button"
              class="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              @click="busqueda = ''"
            >
              <UIcon name="i-lucide-x" class="size-3.5" />
            </button>
          </template>
        </UInput>
        <UButton
          icon="i-lucide-refresh-cw"
          size="sm"
          variant="ghost"
          color="neutral"
          :loading="cobranzaStore.loading"
          @click="cargar"
        >
          Actualizar
        </UButton>
      </div>

      <!-- overflow-x-auto en vez de dejar que el flex encoja los botones: en
           375px de ancho las 7 pestañas no caben, y encogerlas trunca el
           texto ("Despachadas" → "De…") en vez de dejarlas leerse con un
           scroll horizontal, que es el patrón esperado para una fila de
           chips en mobile. -->
      <div class="flex gap-0.5 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-x-auto max-w-full">
        <UButton
          v-for="opcion in ESTADOS_FILTRO"
          :key="opcion.valor"
          size="xs"
          variant="ghost"
          class="shrink-0 whitespace-nowrap"
          :class="filtroEstado === opcion.valor
            ? 'bg-white dark:bg-neutral-700 shadow-sm text-primary-600 dark:text-primary-400 font-medium'
            : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'"
          @click="filtroEstado = opcion.valor"
        >
          {{ opcion.etiqueta }}
        </UButton>
      </div>
    </div>

    <p v-if="!esAdministrador" class="text-xs text-neutral-500 flex items-center gap-1.5">
      <UIcon name="i-lucide-info" class="size-3.5 shrink-0" />
      Tu rol permite ver la cola, pero aprobar o rechazar una acción de cobranza requiere rol
      administrador — el art. 48 exige un firmante identificado.
    </p>

    <!-- ── tabla ────────────────────────────────────────────────────── -->
    <div v-if="cobranzaStore.loading && acciones.length === 0" class="space-y-2">
      <USkeleton v-for="i in 5" :key="i" class="h-10 w-full" />
    </div>

    <p v-else-if="filas.length === 0" class="text-sm text-neutral-500">
      No hay acciones que coincidan con el filtro.
    </p>

    <UiTabla
      v-else
      variante="tailwind"
      :columnas="[
        {
          clave: 'unidad',
          etiqueta: 'Unidad',
          // Fijas a los bordes en el scroll horizontal de mobile (8 columnas
          // no caben en 375px): la unidad que se está mirando y el botón que
          // dispara la acción son los dos datos que no se pueden perder de
          // vista mientras se scrollea el resto (mora/deuda/estado/prueba).
          claseCelda: 'sticky left-0 z-10 bg-default border-r border-neutral-100 dark:border-neutral-900',
          claseEncabezado: 'sticky left-0 z-10 bg-default border-r border-neutral-100 dark:border-neutral-900',
        },
        { clave: 'accion', etiqueta: 'Acción' },
        { clave: 'destinatario', etiqueta: 'Destinatario' },
        { clave: 'mora', etiqueta: 'Mora', alinear: 'derecha' },
        { clave: 'deuda', etiqueta: 'Deuda', alinear: 'derecha' },
        { clave: 'estado', etiqueta: 'Estado' },
        { clave: 'prueba', etiqueta: 'Prueba' },
        {
          clave: 'operaciones',
          etiqueta: '',
          claseCelda: 'sticky right-0 z-10 bg-default border-l border-neutral-100 dark:border-neutral-900',
          claseEncabezado: 'sticky right-0 z-10 bg-default border-l border-neutral-100 dark:border-neutral-900',
        },
      ]"
      :filas="filas"
      :clave-fila="(fila) => fila.accionId"
    >
      <template #celda-unidad="{ fila }">
        <div class="flex flex-col">
          <span class="font-medium">{{ fila.inmuebleCodigo }}</span>
          <span class="text-xs text-neutral-400">{{ fila.clasificacionCodigo }}</span>
        </div>
      </template>

      <template #celda-accion="{ fila }">
        <div class="flex flex-col">
          <span>{{ ETIQUETA_ACCION[fila.tipoAccion] ?? fila.tipoAccion }}</span>
          <span class="text-xs text-neutral-400">
            {{ ETIQUETA_CANAL[fila.canal] ?? fila.canal }} · programada {{ fechaCorta(fila.fechaProgramada) }}
          </span>
        </div>
      </template>

      <template #celda-destinatario="{ fila }">
        <div class="flex flex-col">
          <span>{{ fila.destinatarioNombre ?? '—' }}</span>
          <span class="text-xs text-neutral-400">{{ fila.destinatarioContacto ?? 'sin contacto' }}</span>
        </div>
      </template>

      <template #celda-mora="{ fila }">
        <span class="tabular-nums">{{ fila.diasMora }} d</span>
      </template>

      <template #celda-deuda="{ fila }">
        <span class="tabular-nums">{{ formatoMoneda(fila.deudaTotal) }}</span>
      </template>

      <template #celda-estado="{ fila }">
        <div class="flex items-center gap-1.5">
          <div :class="[
            'size-1.5 rounded-full',
            COLOR_ESTADO[fila.estado] === 'success' ? 'bg-success-500' :
            COLOR_ESTADO[fila.estado] === 'warning' ? 'bg-warning-500' :
            COLOR_ESTADO[fila.estado] === 'error' ? 'bg-error-500' : 'bg-neutral-400'
          ]"></div>
          <span class="text-xs font-medium capitalize text-neutral-600 dark:text-neutral-400">
            {{ ETIQUETA_ESTADO[fila.estado] ?? fila.estado }}
          </span>
        </div>
      </template>

      <!-- Columna propia, no un matiz del estado: es la única que dice si
           la gestión sirve ante un juez (§34.4). -->
      <template #celda-prueba="{ fila }">
        <div class="flex items-center gap-1.5">
          <UIcon
            :name="fila.acreditada ? 'i-lucide-shield-check' : (fila.enviosTotal > 0 ? 'i-lucide-file-text' : 'i-lucide-file-x')"
            :class="[
              'size-3.5',
              fila.acreditada ? 'text-success-500' : (fila.enviosTotal > 0 ? 'text-warning-500' : 'text-neutral-300')
            ]"
          />
          <UBadge v-if="fila.acreditada" color="success" variant="subtle" size="xs" class="font-medium">
            Acreditada
          </UBadge>
          <UBadge v-else-if="fila.enviosTotal > 0" color="warning" variant="subtle" size="xs" class="font-medium">
            {{ fila.ultimoEstadoAcuse ? ETIQUETA_ACUSE[fila.ultimoEstadoAcuse] : 'Sin acuse' }}
          </UBadge>
          <span v-else class="text-xs text-neutral-400 italic">Sin enviar</span>
        </div>
      </template>

      <template #celda-operaciones="{ fila }">
        <div class="flex items-center justify-end gap-1">
          <template v-if="fila.estado === 'pendiente_aprobacion'">
            <template v-if="motivoNoPuedeDecidir(fila) === null">
              <UButton
                size="xs"
                color="primary"
                :loading="procesando === fila.accionId"
                title="Autorizar el envío"
                @click="decidir(fila, 'aprobada')"
              >
                Aprobar
              </UButton>
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                :loading="procesando === fila.accionId"
                title="Rechazar el envío"
                @click="decidir(fila, 'rechazada')"
              >
                Rechazar
              </UButton>
            </template>
            <!-- Texto visible, no solo title: el motivo del bloqueo (rol o
                 autoaprobación) tiene que llegar a lectores de pantalla y a
                 quien usa la tabla desde una pantalla táctil, no solo a
                 quien pasa el mouse por encima. -->
            <span v-else class="text-xs text-neutral-400" :title="motivoNoPuedeDecidir(fila) ?? ''">
              {{ esAdministrador ? 'Propuesta por ti' : 'Requiere administrador' }}
            </span>
          </template>

          <template v-else-if="fila.estado === 'aprobada' || fila.estado === 'programada'">
            <UButton
              v-if="motivoNoPuedeDespachar(fila) === null"
              size="xs"
              color="primary"
              variant="outline"
              icon="i-lucide-send"
              :loading="procesando === fila.accionId"
              title="Despachar ahora"
              @click="abrirConfirmarDespacho(fila)"
            >
              Enviar
            </UButton>
            <!-- Un botón gris se lee como "ahora no puedes"; el problema
                 aquí puede ser otro: ese canal no se despacha solo. Decirlo
                 en texto evita que alguien espere un envío que nunca va a
                 ocurrir. -->
            <span v-else class="text-xs text-neutral-400" :title="motivoNoPuedeDespachar(fila) ?? ''">
              {{ CANALES_AUTOMATICOS.has(fila.canal) ? 'No despachable' : 'Gestión manual' }}
            </span>
          </template>

          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-file-text"
            :title="fila.enviosTotal > 0 ? 'Ver la evidencia del envío' : 'Ver el detalle de la acción'"
            @click="verDetalle(fila)"
          />
        </div>
      </template>
    </UiTabla>

    <!-- ── detalle probatorio ───────────────────────────────────────── -->
    <UModal v-model:open="detalleAbierto" :title="`Acción de cobranza · unidad ${accionDetalle?.inmuebleCodigo ?? ''}`">
      <template #body>
        <div v-if="accionDetalle" class="space-y-5">
          <!-- contexto congelado (§10.3): con qué datos se decidió, no los de hoy -->
          <div class="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800">
            <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3 flex items-center gap-2">
              <UIcon name="i-lucide-info" class="size-3" />
              Contexto de la decisión
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6">
              <div class="space-y-1">
                <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Tipo de Acción</p>
                <p class="text-sm font-medium">{{ ETIQUETA_ACCION[accionDetalle.tipoAccion] ?? accionDetalle.tipoAccion }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Clasificación</p>
                <p class="text-sm font-medium">{{ accionDetalle.clasificacionCodigo }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Días de mora</p>
                <p class="text-sm font-medium tabular-nums">{{ accionDetalle.diasMora }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Deuda Total</p>
                <p class="text-sm font-medium tabular-nums">{{ formatoMoneda(accionDetalle.deudaTotal) }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Destinatario</p>
                <p class="text-sm font-medium">{{ accionDetalle.destinatarioNombre ?? '—' }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Rol</p>
                <p class="text-sm font-medium">{{ accionDetalle.destinatarioRol }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Origen</p>
                <p class="text-sm font-medium">{{ accionDetalle.creadaPor === 'job' ? 'Corrida automática' : 'Creada a mano' }}</p>
              </div>
              <template v-if="accionDetalle.aprobadaAt">
                <div class="space-y-1">
                  <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Fecha Decisión</p>
                  <p class="text-sm font-medium">{{ fechaHora(accionDetalle.aprobadaAt) }}</p>
                </div>
              </template>
            </div>
            <p v-if="accionDetalle.grupoEnvioId" class="text-xs text-neutral-400 mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-700 italic">
              Esta unidad tiene varios copropietarios: se notificó a cada uno por separado, y cada
              notificación conserva su propia prueba.
            </p>
          </div>

          <!-- evidencia (§34.3) -->
          <div class="space-y-4">
            <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
              <UIcon name="i-lucide-shield-check" class="size-3" />
              Evidencia del envío
            </h3>

            <div v-if="cargandoDetalle" class="space-y-2">
              <USkeleton v-for="i in 2" :key="i" class="h-24 w-full" />
            </div>

            <p v-else-if="enviosDetalle.length === 0" class="text-sm text-neutral-500">
              Todavía no se ha despachado nada. Una gestión que no puede acreditarse no ocurrió.
            </p>

            <div v-else class="space-y-3">
              <div
                v-for="envio in enviosDetalle"
                :key="envio.envioId"
                class="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 space-y-2"
              >
                <div class="flex items-center justify-between gap-2 text-xs text-neutral-500">
                  <span>Intento {{ envio.intentoNumero }} · {{ envio.canal }} · {{ envio.proveedor }}</span>
                  <span>{{ fechaHora(envio.enviadoAt) }}</span>
                </div>

                <p class="text-xs text-neutral-500">Enviado a {{ envio.destinatarioContacto }}</p>

                <p v-if="envio.asunto" class="text-sm font-medium">Asunto: {{ envio.asunto }}</p>

                <!-- El texto ÍNTEGRO, no su hash: es lo que se aporta al
                     proceso (§34.1). En correo, el texto del HTML que se
                     envió — el HTML íntegro sigue guardado como prueba. -->
                <p class="text-sm whitespace-pre-wrap rounded bg-neutral-50 dark:bg-neutral-900 p-2">
                  {{ textoLegible(envio.canal, envio.contenidoRenderizado) }}
                </p>

                <div v-if="envio.acuses.length > 0" class="flex flex-wrap items-center gap-2">
                  <UBadge
                    v-for="(acuse, indice) in envio.acuses"
                    :key="indice"
                    size="sm"
                    variant="subtle"
                    :color="acuse.estado === 'entregado' || acuse.estado === 'leido' ? 'success' : 'neutral'"
                    :title="acuse.motivo ?? ''"
                  >
                    {{ ETIQUETA_ACUSE[acuse.estado] ?? acuse.estado }} · {{ fechaHora(acuse.ocurridoAt) }}
                  </UBadge>
                </div>
                <p v-else class="text-xs text-neutral-400">Sin acuses del proveedor todavía.</p>

                <!-- constancia manual (PRQ-CAR-022) — sobre todo para el
                     canal físico, sin webhook de proveedor que aporte
                     acuse por sí solo. -->
                <div class="pt-2 border-t border-neutral-100 dark:border-neutral-900 space-y-2">
                  <div v-if="(documentosPorEnvio[envio.envioId]?.length ?? 0) > 0" class="flex flex-wrap gap-1.5">
                    <UButton
                      v-for="doc in documentosPorEnvio[envio.envioId]"
                      :key="doc.id ?? undefined"
                      size="xs"
                      variant="soft"
                      color="neutral"
                      icon="i-lucide-paperclip"
                      :disabled="descargandoEvidencia === doc.storage_path"
                      @click="descargarEvidencia(doc.storage_path)"
                    >
                      {{ doc.nombre_archivo }}
                    </UButton>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <UiSelectorBuscable
                      :model-value="tipoEvidenciaPorEnvio[envio.envioId] ?? null"
                      :opciones="opcionesTipoDocumentoEvidencia"
                      placeholder="Tipo de constancia"
                      class="w-44"
                      @update:model-value="(v) => (tipoEvidenciaPorEnvio[envio.envioId] = v as number | null)"
                    />
                    <UInput
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      size="xs"
                      class="max-w-[180px]"
                      @change="(e: Event) => elegirArchivoEvidencia(envio.envioId, e)"
                    />
                    <UButton
                      size="xs"
                      variant="soft"
                      :loading="subiendoEvidenciaEnvioId === envio.envioId"
                      :disabled="!archivoEvidenciaPorEnvio[envio.envioId] || !tipoEvidenciaPorEnvio[envio.envioId]"
                      @click="subirEvidencia(envio.envioId)"
                    >
                      Adjuntar constancia
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <!-- El expediente es del INMUEBLE, no de esta acción: reúne toda la
             gestión del deudor, que es lo que se radica (§34.5). -->
        <UButton
          v-if="accionDetalle"
          color="neutral"
          variant="outline"
          icon="i-lucide-file-text"
          :to="`/cartera/expediente/${accionDetalle.inmuebleId}`"
        >
          Ver expediente del inmueble
        </UButton>
        <UButton color="neutral" variant="ghost" @click="detalleAbierto = false">Cerrar</UButton>
      </template>
    </UModal>

    <!-- ── confirmación de despacho (impeccable critique P0) ───────────── -->
    <UModal
      :open="modalDespacharAbierto"
      title="Despachar acción de cobranza"
      @update:open="(abierto) => { if (!abierto) modalDespacharAbierto = false }"
    >
      <template #body>
        <p v-if="accionDespachando" class="text-sm text-neutral-600 dark:text-neutral-400">
          Vas a despachar
          <strong>{{ ETIQUETA_ACCION[accionDespachando.tipoAccion] ?? accionDespachando.tipoAccion }}</strong>
          por {{ ETIQUETA_CANAL[accionDespachando.canal] ?? accionDespachando.canal }} a
          <strong>{{ accionDespachando.destinatarioNombre ?? 'sin nombre registrado' }}</strong>
          ({{ accionDespachando.destinatarioContacto ?? 'sin contacto' }}), unidad
          <strong>{{ accionDespachando.inmuebleCodigo }}</strong>. El mensaje sale al proveedor de
          inmediato y no se puede retirar.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="modalDespacharAbierto = false">
            Cancelar
          </UButton>
          <UButton color="primary" icon="i-lucide-send" @click="confirmarDespacho">
            Despachar
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
