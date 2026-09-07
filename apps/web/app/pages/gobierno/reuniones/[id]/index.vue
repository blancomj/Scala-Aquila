<script setup lang="ts">
// GOB-2 §4.5: encabezado + orden del día (editable antes de instalar) + registro de asistencia
// optimizado para la puerta de la asamblea (indicador de coeficiente en tiempo real) + poderes +
// convocatoria. No implementa quórum ni votación (GOB-3).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']
type MiembroRow = Database['public']['Tables']['gobierno_miembros']['Row']
type InmuebleOpcion = { id: string; codigo: string }

const route = useRoute()
const reunionId = route.params.id as string
const tenantStore = useTenantStore()
const reunionesStore = useGobiernoReunionesStore()
const tercerosStore = useTercerosStore()

const reunion = computed(() => reunionesStore.reuniones.find((r) => r.id === reunionId))
const miembrosOrgano = ref<(MiembroRow & { rol: { codigo: string; nombre: string } | null })[]>([])
const inmuebles = ref<InmuebleOpcion[]>([])
const tiposAtribucion = ref<ListaTipoRow[]>([])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const cliente = useSupabaseClient<Database>()
  await reunionesStore.cargarReuniones(tenantId)
  await reunionesStore.cargarDetalle(reunionId)
  const organoId = reunion.value?.organo_id
  const [{ data: miembrosFilas }, { data: inmueblesFilas }, tiposAtribucionFilas] = await Promise.all([
    organoId
      ? cliente.from('gobierno_miembros').select('*, rol:rol_id(codigo, nombre)').eq('organo_id', organoId).is('hasta', null)
      : Promise.resolve({ data: [] }),
    cliente.from('inmuebles').select('id, codigo').eq('tenant_id', tenantId).order('codigo'),
    cargarListaTipos(tenantId, 'ATRIBUCION_ORGANO'),
    tercerosStore.cargarTerceros(tenantId),
  ])
  miembrosOrgano.value = (miembrosFilas ?? []) as (MiembroRow & { rol: { codigo: string; nombre: string } | null })[]
  inmuebles.value = inmueblesFilas ?? []
  tiposAtribucion.value = tiposAtribucionFilas
}
onMounted(cargar)
onUnmounted(() => reunionesStore.limpiarDetalle())

const opcionesTercero = computed(() =>
  tercerosStore.terceros.map((t) => ({ valor: t.id, etiqueta: `${t.nombre_completo} · ${t.numero_documento}` })),
)
const opcionesInmueble = computed(() => inmuebles.value.map((i) => ({ valor: i.id, etiqueta: i.codigo })))
const opcionesAtribucion = computed(() => tiposAtribucion.value.map((a) => ({ valor: a.id, etiqueta: a.nombre })))
const opcionesPresidente = computed(() =>
  miembrosOrgano.value.filter((m) => m.rol?.codigo === 'presidente').map((m) => ({ valor: m.id, etiqueta: m.rol?.nombre ?? '' })),
)
const opcionesSecretario = computed(() =>
  miembrosOrgano.value.filter((m) => m.rol?.codigo === 'secretario').map((m) => ({ valor: m.id, etiqueta: m.rol?.nombre ?? '' })),
)

const estadoColor: Record<string, 'neutral' | 'primary' | 'success' | 'error'> = {
  convocada: 'neutral', instalada: 'primary', cerrada: 'success', cancelada: 'error',
}

// ── Instalar / cerrar / cancelar ────────────────────────────────────────────
const error = ref<string | null>(null)
const presidenteSeleccionado = ref<string | null>(null)
const secretarioSeleccionado = ref<string | null>(null)

async function instalar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !presidenteSeleccionado.value || !secretarioSeleccionado.value) return
  error.value = null
  try {
    await reunionesStore.instalarReunion(reunionId, tenantId, presidenteSeleccionado.value, secretarioSeleccionado.value)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo instalar la reunión.')
  }
}
async function cerrar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await reunionesStore.cerrarReunion(reunionId, tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cerrar la reunión.')
  }
}
const motivoCancelacion = ref('')
async function cancelar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !motivoCancelacion.value.trim()) return
  error.value = null
  try {
    await reunionesStore.cancelarReunion(reunionId, tenantId, motivoCancelacion.value.trim())
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cancelar la reunión.')
  }
}

// ── Agenda ───────────────────────────────────────────────────────────────
const drawerAgendaAbierto = ref(false)
const formAgenda = reactive({ titulo: '', descripcion: '', requiereDecision: false, atribucionId: null as number | null })
function abrirAgenda(): void {
  formAgenda.titulo = ''
  formAgenda.descripcion = ''
  formAgenda.requiereDecision = false
  formAgenda.atribucionId = null
  drawerAgendaAbierto.value = true
}
async function guardarAgenda(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !formAgenda.titulo.trim()) return
  error.value = null
  try {
    await reunionesStore.agregarAgendaPunto({
      tenant_id: tenantId, reunion_id: reunionId, orden: reunionesStore.agenda.length + 1,
      titulo: formAgenda.titulo.trim(), descripcion: formAgenda.descripcion.trim() || null,
      requiere_decision: formAgenda.requiereDecision, atribucion_id: formAgenda.atribucionId,
    })
    drawerAgendaAbierto.value = false
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo agregar el punto de agenda.')
  }
}
async function eliminarPunto(id: string): Promise<void> {
  try {
    await reunionesStore.eliminarAgendaPunto(id, reunionId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo eliminar el punto de agenda.')
  }
}

// ── Convocatoria ─────────────────────────────────────────────────────────
const drawerConvocatoriaAbierto = ref(false)
const formConvocatoria = reactive({ fechaLimiteRespuesta: '' })
async function guardarConvocatoria(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await reunionesStore.crearConvocatoria({
      tenant_id: tenantId, reunion_id: reunionId,
      fecha_limite_respuesta: formConvocatoria.fechaLimiteRespuesta
        ? new Date(formConvocatoria.fechaLimiteRespuesta).toISOString() : null,
      orden_del_dia_congelado: reunionesStore.agenda.map((p) => ({ orden: p.orden, titulo: p.titulo })),
    })
    drawerConvocatoriaAbierto.value = false
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear la convocatoria.')
  }
}
const drawerEnvioAbierto = ref(false)
const formEnvio = reactive({ destinatarioRef: null as string | null, canal: 'email' as 'email' | 'sms' })
async function guardarEnvio(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !reunionesStore.convocatoria || !formEnvio.destinatarioRef) return
  error.value = null
  try {
    await reunionesStore.registrarEnvio({
      tenant_id: tenantId, convocatoria_id: reunionesStore.convocatoria.id,
      destinatario_ref: formEnvio.destinatarioRef, canal: formEnvio.canal, enviado_at: new Date().toISOString(),
    }, reunionId)
    drawerEnvioAbierto.value = false
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar el envío.')
  }
}

// ── Asistencia ───────────────────────────────────────────────────────────
const formAsistencia = reactive({
  inmuebleId: null as string | null, asistenteRef: null as string | null,
  calidad: 'propietario' as 'propietario' | 'apoderado' | 'invitado' | 'organo',
  poderId: null as string | null,
})
const poderesDisponibles = computed(() =>
  reunionesStore.poderes
    .filter((p) => p.validado_at && p.inmueble_id === formAsistencia.inmuebleId && p.apoderado_ref === formAsistencia.asistenteRef)
    .map((p) => ({ valor: p.id, etiqueta: `${p.otorgante?.nombre_completo ?? ''} → ${p.apoderado?.nombre_completo ?? ''}` })),
)
async function registrarAsistencia(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  // Un miembro de órgano (consejo, art. 54) no necesariamente posee un inmueble — GOB-3 volvió
  // inmueble_id nullable para calidad='organo' (20260931490000); el resto sí lo exige.
  if (!tenantId || !formAsistencia.asistenteRef) return
  if (formAsistencia.calidad !== 'organo' && !formAsistencia.inmuebleId) return
  error.value = null
  try {
    await reunionesStore.registrarAsistencia({
      tenant_id: tenantId, reunion_id: reunionId,
      inmueble_id: formAsistencia.calidad === 'organo' ? null : formAsistencia.inmuebleId,
      asistente_ref: formAsistencia.asistenteRef, calidad: formAsistencia.calidad,
      poder_id: formAsistencia.calidad === 'apoderado' ? formAsistencia.poderId : null,
    })
    formAsistencia.inmuebleId = null
    formAsistencia.asistenteRef = null
    formAsistencia.calidad = 'propietario'
    formAsistencia.poderId = null
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar la asistencia.')
  }
}
async function registrarSalida(id: string): Promise<void> {
  try {
    await reunionesStore.registrarSalida(id, reunionId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar la salida.')
  }
}
const asistenciaPresente = computed(() => reunionesStore.asistencia.filter((a) => !a.salida_at))
const asistenciaRetirada = computed(() => reunionesStore.asistencia.filter((a) => a.salida_at))
// Asistencia y poderes son inmutables una vez cerrada/cancelada la reunión (ASISTENCIA_REUNION_
// CERRADA/PODER_REUNION_CERRADA) — oculta los formularios de alta en vez de dejar que el guard
// los rechace.
const reunionAbierta = computed(() => !!reunion.value && !['cerrada', 'cancelada'].includes(reunion.value.estado))

// ── Poderes ──────────────────────────────────────────────────────────────
const drawerPoderAbierto = ref(false)
const formPoder = reactive({
  otorganteRef: null as string | null, inmuebleId: null as string | null, apoderadoRef: null as string | null,
  alcance: '',
})
function abrirPoder(): void {
  formPoder.otorganteRef = null
  formPoder.inmuebleId = null
  formPoder.apoderadoRef = null
  formPoder.alcance = ''
  drawerPoderAbierto.value = true
}
async function guardarPoder(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !formPoder.otorganteRef || !formPoder.inmuebleId || !formPoder.apoderadoRef) return
  error.value = null
  try {
    await reunionesStore.crearPoder({
      tenant_id: tenantId, reunion_id: reunionId, otorgante_ref: formPoder.otorganteRef,
      inmueble_id: formPoder.inmuebleId, apoderado_ref: formPoder.apoderadoRef,
      alcance: formPoder.alcance.trim() || null,
    })
    drawerPoderAbierto.value = false
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear el poder.')
  }
}
const documentoValidacion = ref<Record<string, string>>({})
async function validarPoder(id: string): Promise<void> {
  const documentoId = documentoValidacion.value[id]
  if (!documentoId) return
  try {
    await reunionesStore.validarPoder(id, reunionId, documentoId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo validar el poder.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div v-if="reunion" class="space-y-6">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-xl font-semibold">
            {{ reunion.organo?.nombre || reunion.organo?.tipo?.nombre }} · {{ reunion.tipo?.nombre }}
          </h1>
          <p class="text-sm text-muted">
            {{ reunion.fecha_hora }} · {{ reunion.modalidad }} · {{ reunion.convocatoria_regimen }}
            <span v-if="reunion.lugar"> · {{ reunion.lugar }}</span>
            <span v-if="reunion.medio"> · {{ reunion.medio }}</span>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            v-if="reunion.estado === 'instalada'" size="sm" variant="soft" icon="i-lucide-vote"
            :to="`/gobierno/reuniones/${reunionId}/votaciones`"
          >
            Quórum y votación
          </UButton>
          <UBadge :color="estadoColor[reunion.estado] ?? 'neutral'" variant="soft" size="lg">{{ reunion.estado }}</UBadge>
        </div>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <div v-if="reunion.estado === 'instalada'" class="rounded-lg border border-default p-4">
        <p class="text-xs font-medium text-muted uppercase mb-1">Coeficiente presente ahora</p>
        <p class="text-2xl font-semibold">{{ reunionesStore.coeficienteActual }}</p>
      </div>

      <!-- Orden del día -->
      <section class="rounded-lg border border-default p-4 space-y-2">
        <div class="flex items-center justify-between">
          <p class="font-medium">Orden del día</p>
          <UButton
            v-if="reunion.estado === 'convocada'" size="xs" variant="ghost" icon="i-lucide-plus" @click="abrirAgenda()"
          >
            Agregar punto
          </UButton>
        </div>
        <ol class="space-y-1 list-decimal list-inside">
          <li v-for="p in reunionesStore.agenda" :key="p.id" class="flex items-center justify-between gap-2 text-sm">
            <span>{{ p.titulo }}<span v-if="p.atribucion"> · {{ p.atribucion.nombre }}</span></span>
            <UButton
              v-if="reunion.estado === 'convocada'" size="xs" variant="ghost" color="error"
              @click="eliminarPunto(p.id)"
            >
              Quitar
            </UButton>
          </li>
        </ol>
        <p v-if="reunionesStore.agenda.length === 0" class="text-sm text-muted">Sin puntos todavía.</p>
      </section>

      <!-- Convocatoria -->
      <section class="rounded-lg border border-default p-4 space-y-2">
        <div class="flex items-center justify-between">
          <p class="font-medium">Convocatoria</p>
          <UButton
            v-if="!reunionesStore.convocatoria && reunion.estado === 'convocada'" size="xs" variant="ghost"
            icon="i-lucide-plus" @click="drawerConvocatoriaAbierto = true"
          >
            Emitir convocatoria
          </UButton>
        </div>
        <div v-if="reunionesStore.convocatoria" class="text-sm space-y-2">
          <p class="text-muted">Emitida {{ reunionesStore.convocatoria.emitida_at }}</p>
          <UButton size="xs" variant="ghost" icon="i-lucide-send" @click="drawerEnvioAbierto = true">
            Registrar envío
          </UButton>
          <ul class="space-y-1">
            <li v-for="e in reunionesStore.envios" :key="e.id" class="flex items-center justify-between gap-2">
              <span>{{ e.canal }} · {{ e.enviado_at ?? 'sin enviar' }} · acuse: {{ e.acuse_at ?? 'pendiente' }}</span>
              <UButton v-if="!e.acuse_at" size="xs" variant="ghost" @click="reunionesStore.marcarAcuseEnvio(e.id, reunionId)">
                Marcar acuse
              </UButton>
            </li>
          </ul>
        </div>
        <p v-else class="text-sm text-muted">Sin convocatoria emitida.</p>
      </section>

      <!-- Poderes -->
      <section class="rounded-lg border border-default p-4 space-y-2">
        <div class="flex items-center justify-between">
          <p class="font-medium">Poderes</p>
          <UButton v-if="reunionAbierta" size="xs" variant="ghost" icon="i-lucide-plus" @click="abrirPoder()">
            Nuevo poder
          </UButton>
        </div>
        <ul class="space-y-1 text-sm">
          <li v-for="p in reunionesStore.poderes" :key="p.id" class="flex items-center justify-between gap-2">
            <span>
              {{ p.inmueble?.codigo }} · {{ p.otorgante?.nombre_completo }} → {{ p.apoderado?.nombre_completo }}
              <UBadge size="xs" :color="p.validado_at ? 'success' : 'neutral'" variant="soft" class="ml-1">
                {{ p.validado_at ? 'validado' : 'sin validar' }}
              </UBadge>
            </span>
            <div v-if="!p.validado_at" class="flex items-center gap-1">
              <UInput v-model="documentoValidacion[p.id]" placeholder="id del documento" size="xs" />
              <UButton size="xs" variant="ghost" @click="validarPoder(p.id)">Validar</UButton>
            </div>
          </li>
        </ul>
        <p v-if="reunionesStore.poderes.length === 0" class="text-sm text-muted">Sin poderes registrados.</p>
      </section>

      <!-- Asistencia -->
      <section class="rounded-lg border border-default p-4 space-y-3">
        <p class="font-medium">Asistencia</p>
        <div v-if="reunionAbierta" class="grid gap-2 sm:grid-cols-4 items-end">
          <UFormField v-if="formAsistencia.calidad !== 'organo'" label="Inmueble">
            <UiSelectorBuscable v-model="formAsistencia.inmuebleId" :opciones="opcionesInmueble" placeholder="Inmueble" />
          </UFormField>
          <UFormField label="Asistente">
            <UiSelectorBuscable v-model="formAsistencia.asistenteRef" :opciones="opcionesTercero" placeholder="Tercero" />
          </UFormField>
          <UFormField label="Calidad">
            <USelect
              v-model="formAsistencia.calidad"
              :items="[
                { label: 'Propietario', value: 'propietario' },
                { label: 'Apoderado', value: 'apoderado' },
                { label: 'Invitado', value: 'invitado' },
                { label: 'Órgano', value: 'organo' },
              ]"
            />
          </UFormField>
          <UFormField v-if="formAsistencia.calidad === 'apoderado'" label="Poder">
            <UiSelectorBuscable v-model="formAsistencia.poderId" :opciones="poderesDisponibles" placeholder="Poder validado" />
          </UFormField>
          <UButton :loading="reunionesStore.guardando" @click="registrarAsistencia()">Registrar ingreso</UButton>
        </div>

        <div>
          <p class="text-xs font-medium text-muted uppercase mb-1">Presentes ({{ asistenciaPresente.length }})</p>
          <ul class="space-y-1 text-sm">
            <li v-for="a in asistenciaPresente" :key="a.id" class="flex items-center justify-between gap-2">
              <span>{{ a.inmueble?.codigo }} · {{ a.asistente?.nombre_completo }} · {{ a.calidad }} · {{ a.coeficiente }}</span>
              <UButton v-if="reunionAbierta" size="xs" variant="ghost" @click="registrarSalida(a.id)">
                Registrar salida
              </UButton>
            </li>
          </ul>
        </div>
        <details v-if="asistenciaRetirada.length > 0">
          <summary class="cursor-pointer text-xs font-medium text-muted uppercase">
            Retirados ({{ asistenciaRetirada.length }})
          </summary>
          <ul class="mt-1 space-y-1 text-sm text-muted">
            <li v-for="a in asistenciaRetirada" :key="a.id">
              {{ a.inmueble?.codigo }} · {{ a.asistente?.nombre_completo }} · salida {{ a.salida_at }}
            </li>
          </ul>
        </details>
      </section>

      <!-- Transiciones -->
      <section v-if="reunion.estado === 'convocada'" class="rounded-lg border border-default p-4 space-y-3">
        <p class="font-medium">Instalar reunión</p>
        <div class="grid gap-2 sm:grid-cols-3 items-end">
          <UFormField label="Presidente">
            <UiSelectorBuscable v-model="presidenteSeleccionado" :opciones="opcionesPresidente" placeholder="Presidente" />
          </UFormField>
          <UFormField label="Secretario">
            <UiSelectorBuscable v-model="secretarioSeleccionado" :opciones="opcionesSecretario" placeholder="Secretario" />
          </UFormField>
          <UButton
            :loading="reunionesStore.guardando" :disabled="!presidenteSeleccionado || !secretarioSeleccionado"
            @click="instalar()"
          >
            Instalar
          </UButton>
        </div>
        <div class="flex items-end gap-2">
          <UFormField label="Motivo de cancelación">
            <UInput v-model="motivoCancelacion" class="w-full" />
          </UFormField>
          <UButton variant="ghost" color="error" :disabled="!motivoCancelacion.trim()" @click="cancelar()">
            Cancelar reunión
          </UButton>
        </div>
      </section>
      <section v-if="reunion.estado === 'instalada'" class="rounded-lg border border-default p-4">
        <UButton :loading="reunionesStore.guardando" @click="cerrar()">Cerrar reunión</UButton>
      </section>
    </div>
    <p v-else-if="!reunionesStore.loading" class="text-sm text-muted">Reunión no encontrada.</p>

    <UiDrawer :abierto="drawerAgendaAbierto" titulo="Agregar punto de agenda" @cerrar="drawerAgendaAbierto = false">
      <div class="space-y-3">
        <UFormField label="Título" name="titulo">
          <UInput v-model="formAgenda.titulo" class="w-full" />
        </UFormField>
        <UFormField label="Descripción" name="descripcion">
          <UTextarea v-model="formAgenda.descripcion" class="w-full" />
        </UFormField>
        <UFormField label="Atribución que ejerce (opcional)" name="atribucion">
          <UiSelectorBuscable v-model="formAgenda.atribucionId" :opciones="opcionesAtribucion" placeholder="Atribución" />
        </UFormField>
        <UCheckbox v-model="formAgenda.requiereDecision" label="Requiere decisión" />
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerAgendaAbierto = false">Cancelar</UButton>
          <UButton :loading="reunionesStore.guardando" :disabled="!formAgenda.titulo.trim()" @click="guardarAgenda()">
            Agregar
          </UButton>
        </div>
      </template>
    </UiDrawer>

    <UiDrawer :abierto="drawerConvocatoriaAbierto" titulo="Emitir convocatoria" @cerrar="drawerConvocatoriaAbierto = false">
      <div class="space-y-3">
        <UFormField label="Fecha límite de respuesta (opcional)" name="fechaLimite">
          <UInput v-model="formConvocatoria.fechaLimiteRespuesta" type="datetime-local" class="w-full" />
        </UFormField>
        <p class="text-xs text-muted">
          El orden del día se congela con lo que hay registrado ahora mismo ({{ reunionesStore.agenda.length }} puntos).
        </p>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerConvocatoriaAbierto = false">Cancelar</UButton>
          <UButton :loading="reunionesStore.guardando" @click="guardarConvocatoria()">Emitir</UButton>
        </div>
      </template>
    </UiDrawer>

    <UiDrawer :abierto="drawerEnvioAbierto" titulo="Registrar envío" @cerrar="drawerEnvioAbierto = false">
      <div class="space-y-3">
        <UFormField label="Destinatario" name="destinatario">
          <UiSelectorBuscable v-model="formEnvio.destinatarioRef" :opciones="opcionesTercero" placeholder="Tercero" />
        </UFormField>
        <UFormField label="Canal" name="canal">
          <USelect v-model="formEnvio.canal" :items="[{ label: 'Email', value: 'email' }, { label: 'SMS', value: 'sms' }]" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerEnvioAbierto = false">Cancelar</UButton>
          <UButton :loading="reunionesStore.guardando" :disabled="!formEnvio.destinatarioRef" @click="guardarEnvio()">
            Registrar
          </UButton>
        </div>
      </template>
    </UiDrawer>

    <UiDrawer :abierto="drawerPoderAbierto" titulo="Nuevo poder" @cerrar="drawerPoderAbierto = false">
      <div class="space-y-3">
        <UFormField label="Inmueble" name="inmueble">
          <UiSelectorBuscable v-model="formPoder.inmuebleId" :opciones="opcionesInmueble" placeholder="Inmueble" />
        </UFormField>
        <UFormField label="Otorgante (propietario)" name="otorgante">
          <UiSelectorBuscable v-model="formPoder.otorganteRef" :opciones="opcionesTercero" placeholder="Otorgante" />
        </UFormField>
        <UFormField label="Apoderado" name="apoderado">
          <UiSelectorBuscable v-model="formPoder.apoderadoRef" :opciones="opcionesTercero" placeholder="Apoderado" />
        </UFormField>
        <UFormField label="Alcance (opcional)" name="alcance">
          <UTextarea v-model="formPoder.alcance" class="w-full" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerPoderAbierto = false">Cancelar</UButton>
          <UButton
            :loading="reunionesStore.guardando"
            :disabled="!formPoder.otorganteRef || !formPoder.inmuebleId || !formPoder.apoderadoRef"
            @click="guardarPoder()"
          >
            Crear poder
          </UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
