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

// ── detalle probatorio ────────────────────────────────────────────────
const detalleAbierto = ref(false)
const accionDetalle = ref<AccionBandeja | null>(null)
const enviosDetalle = ref<EnvioDetalle[]>([])
const cargandoDetalle = ref(false)

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
    <div>
      <h1 class="text-xl font-semibold mb-2">Acciones de cobranza</h1>
      <p class="text-sm text-neutral-500">
        Cola de gestión: qué se va a enviar, quién lo autorizó y qué quedó probado.
      </p>
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
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
      <button
        type="button"
        class="text-left rounded-md border p-3 transition-colors"
        :class="filtroEstado === 'pendiente_aprobacion'
          ? 'border-warning-400 bg-warning-50 dark:bg-warning-950/30'
          : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300'"
        @click="filtroEstado = filtroEstado === 'pendiente_aprobacion' ? 'todas' : 'pendiente_aprobacion'"
      >
        <p class="text-xs text-neutral-500">Esperan aprobación</p>
        <p class="text-2xl font-semibold tabular-nums">{{ resumen.esperanAprobacion }}</p>
      </button>

      <div class="rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
        <p class="text-xs text-neutral-500">Listas para enviar</p>
        <p class="text-2xl font-semibold tabular-nums">{{ resumen.listasParaEnviar }}</p>
      </div>

      <div class="rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
        <p class="text-xs text-neutral-500">Despachadas sin acuse</p>
        <p class="text-2xl font-semibold tabular-nums">{{ resumen.despachadasSinAcuse }}</p>
      </div>

      <div class="rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
        <p class="text-xs text-neutral-500">Acreditadas</p>
        <p class="text-2xl font-semibold tabular-nums text-success-600 dark:text-success-400">
          {{ resumen.acreditadas }}
        </p>
      </div>

      <div class="rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
        <p class="text-xs text-neutral-500">Fallidas</p>
        <p class="text-2xl font-semibold tabular-nums">{{ resumen.fallidas }}</p>
      </div>
    </div>

    <!-- ── filtros ──────────────────────────────────────────────────── -->
    <div class="flex flex-wrap items-center gap-2">
      <UButton
        v-for="opcion in ESTADOS_FILTRO"
        :key="opcion.valor"
        size="xs"
        :variant="filtroEstado === opcion.valor ? 'solid' : 'outline'"
        :color="filtroEstado === opcion.valor ? 'primary' : 'neutral'"
        @click="filtroEstado = opcion.valor"
      >
        {{ opcion.etiqueta }}
      </UButton>

      <UInput
        v-model="busqueda"
        placeholder="Buscar unidad o destinatario"
        icon="i-lucide-search"
        size="sm"
        class="ml-auto w-64"
      />
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

    <p v-if="!esAdministrador" class="text-xs text-neutral-500 flex items-center gap-1.5">
      <UIcon name="i-lucide-info" class="size-3.5 shrink-0" />
      Tu rol permite ver la cola, pero aprobar o rechazar una acción de cobranza requiere rol
      administrador — el art. 48 exige un firmante identificado.
    </p>

    <!-- ── tabla ────────────────────────────────────────────────────── -->
    <p v-if="filas.length === 0 && !cobranzaStore.loading" class="text-sm text-neutral-500">
      No hay acciones que coincidan con el filtro.
    </p>

    <UiTabla
      v-else
      variante="tailwind"
      :columnas="[
        { clave: 'unidad', etiqueta: 'Unidad' },
        { clave: 'accion', etiqueta: 'Acción' },
        { clave: 'destinatario', etiqueta: 'Destinatario' },
        { clave: 'mora', etiqueta: 'Mora', alinear: 'derecha' },
        { clave: 'deuda', etiqueta: 'Deuda', alinear: 'derecha' },
        { clave: 'estado', etiqueta: 'Estado' },
        { clave: 'prueba', etiqueta: 'Prueba' },
        { clave: 'operaciones', etiqueta: '' },
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
        <UBadge :color="COLOR_ESTADO[fila.estado] ?? 'neutral'" variant="subtle" size="sm">
          {{ ETIQUETA_ESTADO[fila.estado] ?? fila.estado }}
        </UBadge>
      </template>

      <!-- Columna propia, no un matiz del estado: es la única que dice si
           la gestión sirve ante un juez (§34.4). -->
      <template #celda-prueba="{ fila }">
        <UBadge v-if="fila.acreditada" color="success" variant="subtle" size="sm">
          Acreditada
        </UBadge>
        <UBadge v-else-if="fila.enviosTotal > 0" color="warning" variant="subtle" size="sm">
          {{ fila.ultimoEstadoAcuse ? ETIQUETA_ACUSE[fila.ultimoEstadoAcuse] : 'Sin acuse' }}
        </UBadge>
        <span v-else class="text-xs text-neutral-400">Sin enviar</span>
      </template>

      <template #celda-operaciones="{ fila }">
        <div class="flex items-center justify-end gap-1">
          <template v-if="fila.estado === 'pendiente_aprobacion'">
            <UButton
              size="xs"
              color="primary"
              :disabled="motivoNoPuedeDecidir(fila) !== null"
              :loading="procesando === fila.accionId"
              :title="motivoNoPuedeDecidir(fila) ?? 'Autorizar el envío'"
              @click="decidir(fila, 'aprobada')"
            >
              Aprobar
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              :disabled="motivoNoPuedeDecidir(fila) !== null"
              :loading="procesando === fila.accionId"
              :title="motivoNoPuedeDecidir(fila) ?? 'Rechazar el envío'"
              @click="decidir(fila, 'rechazada')"
            >
              Rechazar
            </UButton>
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
              @click="despachar(fila)"
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
          <div>
            <h3 class="text-sm font-semibold mb-2">Contexto del momento</h3>
            <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt class="text-neutral-500">Tipo</dt>
              <dd>{{ ETIQUETA_ACCION[accionDetalle.tipoAccion] ?? accionDetalle.tipoAccion }}</dd>
              <dt class="text-neutral-500">Clasificación</dt>
              <dd>{{ accionDetalle.clasificacionCodigo }}</dd>
              <dt class="text-neutral-500">Días de mora</dt>
              <dd class="tabular-nums">{{ accionDetalle.diasMora }}</dd>
              <dt class="text-neutral-500">Deuda</dt>
              <dd class="tabular-nums">{{ formatoMoneda(accionDetalle.deudaTotal) }}</dd>
              <dt class="text-neutral-500">Destinatario</dt>
              <dd>{{ accionDetalle.destinatarioNombre ?? '—' }} ({{ accionDetalle.destinatarioRol }})</dd>
              <dt class="text-neutral-500">Origen</dt>
              <dd>{{ accionDetalle.creadaPor === 'job' ? 'Corrida automática' : 'Creada a mano' }}</dd>
              <template v-if="accionDetalle.aprobadaAt">
                <dt class="text-neutral-500">Decidida</dt>
                <dd>{{ fechaHora(accionDetalle.aprobadaAt) }}</dd>
              </template>
            </dl>
            <p v-if="accionDetalle.grupoEnvioId" class="text-xs text-neutral-500 mt-2">
              Esta unidad tiene varios copropietarios: se notificó a cada uno por separado, y cada
              notificación conserva su propia prueba.
            </p>
          </div>

          <!-- evidencia (§34.3) -->
          <div>
            <h3 class="text-sm font-semibold mb-2">Evidencia del envío</h3>

            <p v-if="cargandoDetalle" class="text-sm text-neutral-500">Cargando…</p>

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
  </div>
</template>
