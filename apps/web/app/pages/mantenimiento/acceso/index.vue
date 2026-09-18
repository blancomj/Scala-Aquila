<script setup lang="ts">
// MANT-11 · Visitantes y control de acceso. "Portería" es la pestaña por defecto — es el panel
// operativo del día a día; "Autorizaciones" (crear/revocar/historial) se visita con menos
// frecuencia. Sin cámara ni hardware de escaneo (spec §5): el código del QR se ingresa como
// texto — quien lo imprime/comparte decide el formato físico.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const accesoStore = useMantenimientoAccesoStore()

const inmuebles = ref<{ id: string; codigo: string }[]>([])
const tiposVisita = ref<{ id: number; nombre: string }[]>([])
const error = ref<string | null>(null)

async function cargarTodo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const cliente = useSupabaseClient<Database>()
  const [, , { data: filasInmuebles }, { data: filasTipos }] = await Promise.all([
    accesoStore.cargarAutorizaciones(tenantId),
    accesoStore.cargarRegistros(tenantId),
    cliente.from('inmuebles').select('id, codigo').eq('tenant_id', tenantId).order('codigo'),
    cliente.from('lista_tipos').select('id, nombre').eq('tipo', 'TIPO_VISITA').eq('activo', true)
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`).order('orden'),
  ])
  inmuebles.value = filasInmuebles ?? []
  tiposVisita.value = filasTipos ?? []
}
onMounted(cargarTodo)

const nombreInmueble = computed(() => new Map(inmuebles.value.map((i) => [i.id, i.codigo])))

type Tab = 'porteria' | 'autorizaciones'
const tabActiva = ref<Tab>('porteria')

// EXT-09 (Ola 2, M14): una autorización permanente no tiene fecha_prevista (CHECK de la
// migración 20260943000000) — mostrar eso como "Invalid Date" sería un defecto visible, no un
// crash, pero igual de real; "Permanente" comunica la semántica correcta.
function formatoFecha(fecha: string | null): string {
  if (!fecha) return 'Permanente'
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-CO')
}
function formatoFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO')
}

const estadoColor: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  vigente: 'success',
  usada: 'neutral',
  vencida: 'warning',
  revocada: 'error',
}

// ── validar / consumir QR ──
const codigoQr = ref('')
const autorizacionValidada = ref<Awaited<ReturnType<typeof accesoStore.validarQr>> | null>(null)
const observacionesConsumo = ref('')
// EXT-09 (Ola 2, M14): visitas-fotos es un bucket privado — la policy de SELECT existe solo para
// miembros del tenant (staff), así que portería necesita una signed URL, nunca la ruta cruda.
const fotoValidadaUrl = ref<string | null>(null)

async function validar(): Promise<void> {
  error.value = null
  autorizacionValidada.value = null
  fotoValidadaUrl.value = null
  try {
    autorizacionValidada.value = await accesoStore.validarQr(codigoQr.value.trim())
    if (autorizacionValidada.value.foto_url) {
      const cliente = useSupabaseClient<Database>()
      const { data } = await cliente.storage
        .from('visitas-fotos')
        .createSignedUrl(autorizacionValidada.value.foto_url, 300)
      fotoValidadaUrl.value = data?.signedUrl ?? null
    }
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo validar el código.')
  }
}

async function consumir(): Promise<void> {
  error.value = null
  try {
    await accesoStore.consumirQr(codigoQr.value.trim(), observacionesConsumo.value || undefined)
    codigoQr.value = ''
    autorizacionValidada.value = null
    observacionesConsumo.value = ''
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar el ingreso.')
  }
}

async function registrarEgreso(id: string): Promise<void> {
  error.value = null
  try {
    await accesoStore.registrarEgreso(id)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar el egreso.')
  }
}

// ── acceso sin autorización previa (walk-in) ──
const drawerWalkIn = ref(false)
const walkInInmuebleId = ref<string | null>(null)
const walkInNombre = ref('')
const walkInDocumento = ref('')
const walkInObservaciones = ref('')

function abrirWalkIn(): void {
  walkInInmuebleId.value = null
  walkInNombre.value = ''
  walkInDocumento.value = ''
  walkInObservaciones.value = ''
  error.value = null
  drawerWalkIn.value = true
}

async function guardarWalkIn(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !walkInInmuebleId.value || !walkInNombre.value.trim()) return
  error.value = null
  try {
    // `useSupabaseUser()` se puebla con getClaims() (sub, no id) — el id confiable sale de
    // getUser() (ver stores/auth.ts).
    const cliente = useSupabaseClient<Database>()
    const {
      data: { user },
    } = await cliente.auth.getUser()
    if (!user) return
    await accesoStore.registrarAccesoDirecto({
      tenant_id: tenantId,
      inmueble_destino_id: walkInInmuebleId.value,
      visitante_nombre: walkInNombre.value.trim(),
      visitante_documento: walkInDocumento.value.trim() || null,
      registrado_por: user.id,
      observaciones: walkInObservaciones.value.trim() || null,
    })
    drawerWalkIn.value = false
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar el acceso.')
  }
}

// ── nueva autorización ──
const drawerAutorizacion = ref(false)
const nuevaInmuebleId = ref<string | null>(null)
const nuevoVisitanteNombre = ref('')
const nuevoVisitanteDocumento = ref('')
const nuevoTipoId = ref<number | undefined>(undefined)
const nuevaFechaPrevista = ref('')
const nuevaHoraDesde = ref('')
const nuevaHoraHasta = ref('')
const autorizacionCreada = ref<Awaited<ReturnType<typeof accesoStore.crearAutorizacion>> | null>(null)

function abrirNuevaAutorizacion(): void {
  nuevaInmuebleId.value = null
  nuevoVisitanteNombre.value = ''
  nuevoVisitanteDocumento.value = ''
  nuevoTipoId.value = undefined
  nuevaFechaPrevista.value = ''
  nuevaHoraDesde.value = ''
  nuevaHoraHasta.value = ''
  autorizacionCreada.value = null
  error.value = null
  drawerAutorizacion.value = true
}

async function guardarAutorizacion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nuevaInmuebleId.value || !nuevoVisitanteNombre.value.trim() || !nuevaFechaPrevista.value) return
  error.value = null
  try {
    autorizacionCreada.value = await accesoStore.crearAutorizacion({
      tenant_id: tenantId,
      inmueble_id: nuevaInmuebleId.value,
      visitante_nombre: nuevoVisitanteNombre.value.trim(),
      visitante_documento: nuevoVisitanteDocumento.value.trim() || undefined,
      tipo_id: nuevoTipoId.value,
      fecha_prevista: nuevaFechaPrevista.value,
      hora_desde: nuevaHoraDesde.value || undefined,
      hora_hasta: nuevaHoraHasta.value || undefined,
    })
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear la autorización.')
  }
}

async function revocar(id: string): Promise<void> {
  error.value = null
  try {
    await accesoStore.revocar(id)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo revocar la autorización.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Visitantes y acceso</h1>
      </template>
      <template #descripcion>
        Autorización de visitas con anticipación y registro de ingreso por portería — el
        documento del visitante nunca se guarda en una segunda base de identidad ni aparece en
        listados, solo en el detalle de un registro puntual.
      </template>
    </UiTituloDescripcion>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <nav
      class="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto"
      role="tablist"
      aria-label="Secciones de Visitantes y acceso"
    >
      <button
        v-for="tab in [{ id: 'porteria', etiqueta: 'Portería' }, { id: 'autorizaciones', etiqueta: 'Autorizaciones' }] as const"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="tabActiva === tab.id"
        class="px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors"
        :class="
          tabActiva === tab.id
            ? 'border-primary text-primary font-medium'
            : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
        "
        @click="tabActiva = tab.id"
      >
        {{ tab.etiqueta }}
      </button>
    </nav>

    <div role="tabpanel">
      <!-- Portería -->
      <div v-if="tabActiva === 'porteria'" class="space-y-6">
        <div class="rounded-md border border-default p-4 space-y-3">
          <p class="font-medium">Validar / registrar ingreso</p>
          <div class="flex gap-2">
            <UInput v-model="codigoQr" placeholder="Código de la autorización" class="flex-1" />
            <UButton variant="soft" @click="validar()">Validar</UButton>
          </div>
          <div v-if="autorizacionValidada" class="rounded border border-default p-3 space-y-2 text-sm">
            <p><span class="text-muted">Visitante:</span> {{ autorizacionValidada.visitante_nombre }}</p>
            <p><span class="text-muted">Inmueble:</span> {{ nombreInmueble.get(autorizacionValidada.inmueble_id) ?? '—' }}</p>
            <p><span class="text-muted">Fecha:</span> {{ formatoFecha(autorizacionValidada.fecha_prevista) }}</p>
            <img
              v-if="fotoValidadaUrl" :src="fotoValidadaUrl" alt="Foto del visitante"
              class="h-32 w-32 rounded-lg object-cover"
            >
            <UFormField label="Observaciones (opcional)">
              <UInput v-model="observacionesConsumo" class="w-full" />
            </UFormField>
            <UButton :loading="accesoStore.guardando" @click="consumir()">Registrar ingreso</UButton>
          </div>
        </div>

        <div class="flex justify-end">
          <UButton variant="outline" @click="abrirWalkIn()">Acceso sin autorización previa</UButton>
        </div>

        <div class="space-y-3">
          <p class="font-medium">Bandeja de accesos</p>
          <UiTabla
            :columnas="[
              { clave: 'inmueble', etiqueta: 'Inmueble' },
              { clave: 'visitante', etiqueta: 'Visitante' },
              { clave: 'ingreso', etiqueta: 'Ingreso' },
              { clave: 'egreso', etiqueta: 'Egreso' },
              { clave: 'acciones', etiqueta: '' },
            ]"
            :filas="accesoStore.registros"
            :clave-fila="(r) => r.id ?? ''"
            vacio="Sin accesos registrados."
          >
            <!-- Columnas de mant_registros_acceso_resumen (vista): nullable solo porque
                 PostgREST no expresa la nulabilidad real de una vista — la tabla base las
                 exige NOT NULL, así que aquí siempre vienen pobladas. -->
            <template #celda-inmueble="{ fila }">{{ nombreInmueble.get(fila.inmueble_destino_id ?? '') ?? '—' }}</template>
            <template #celda-visitante="{ fila }">{{ fila.visitante_nombre }}</template>
            <template #celda-ingreso="{ fila }">{{ fila.ingreso_at ? formatoFechaHora(fila.ingreso_at) : '—' }}</template>
            <template #celda-egreso="{ fila }">{{ fila.egreso_at ? formatoFechaHora(fila.egreso_at) : '—' }}</template>
            <template #celda-acciones="{ fila }">
              <UButton v-if="!fila.egreso_at" size="xs" variant="ghost" @click="registrarEgreso(fila.id ?? '')">Registrar egreso</UButton>
            </template>
          </UiTabla>
        </div>
      </div>

      <!-- Autorizaciones -->
      <div v-else-if="tabActiva === 'autorizaciones'" class="space-y-3">
        <div class="flex justify-end">
          <UButton icon="i-lucide-plus" @click="abrirNuevaAutorizacion()">Nueva autorización</UButton>
        </div>
        <UiTabla
          :columnas="[
            { clave: 'inmueble', etiqueta: 'Inmueble' },
            { clave: 'visitante', etiqueta: 'Visitante' },
            { clave: 'fecha', etiqueta: 'Fecha' },
            { clave: 'estado', etiqueta: 'Estado' },
            { clave: 'acciones', etiqueta: '' },
          ]"
          :filas="accesoStore.autorizaciones"
          :clave-fila="(a) => a.id"
          vacio="Sin autorizaciones registradas."
        >
          <template #celda-inmueble="{ fila }">{{ nombreInmueble.get(fila.inmueble_id) ?? '—' }}</template>
          <template #celda-visitante="{ fila }">{{ fila.visitante_nombre }}</template>
          <template #celda-fecha="{ fila }">{{ formatoFecha(fila.fecha_prevista) }}</template>
          <template #celda-estado="{ fila }">
            <UBadge :color="estadoColor[fila.estado]" variant="soft" class="capitalize">{{ fila.estado }}</UBadge>
          </template>
          <template #celda-acciones="{ fila }">
            <UButton v-if="fila.estado === 'vigente'" size="xs" color="error" variant="ghost" @click="revocar(fila.id)">Revocar</UButton>
          </template>
        </UiTabla>
      </div>
    </div>

    <!-- Drawer: acceso sin autorización -->
    <UiDrawer :abierto="drawerWalkIn" titulo="Registrar acceso sin autorización previa" @cerrar="drawerWalkIn = false">
      <div class="space-y-4">
        <UFormField label="Inmueble destino">
          <UiSelectorBuscable v-model="walkInInmuebleId" :opciones="inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo }))" />
        </UFormField>
        <UFormField label="Nombre del visitante">
          <UInput v-model="walkInNombre" class="w-full" />
        </UFormField>
        <UFormField label="Documento (opcional)">
          <UInput v-model="walkInDocumento" class="w-full" />
        </UFormField>
        <UFormField label="Observaciones (cómo se confirmó el acceso)">
          <UTextarea v-model="walkInObservaciones" :rows="2" class="w-full" />
        </UFormField>
        <UAlert v-if="error" color="error" variant="soft" :title="error" />
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerWalkIn = false">Cancelar</UButton>
          <UButton
            :loading="accesoStore.guardando"
            :disabled="!walkInInmuebleId || !walkInNombre.trim()"
            @click="guardarWalkIn()"
          >
            Registrar
          </UButton>
        </div>
      </template>
    </UiDrawer>

    <!-- Drawer: nueva autorización -->
    <UiDrawer :abierto="drawerAutorizacion" titulo="Nueva autorización de visita" @cerrar="drawerAutorizacion = false">
      <div class="space-y-4">
        <template v-if="!autorizacionCreada">
          <UFormField label="Inmueble">
            <UiSelectorBuscable v-model="nuevaInmuebleId" :opciones="inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo }))" />
          </UFormField>
          <UFormField label="Nombre del visitante">
            <UInput v-model="nuevoVisitanteNombre" class="w-full" />
          </UFormField>
          <UFormField label="Documento (opcional)">
            <UInput v-model="nuevoVisitanteDocumento" class="w-full" />
          </UFormField>
          <UFormField label="Tipo de visita (opcional)">
            <USelect v-model="nuevoTipoId" class="w-full" :items="tiposVisita.map((t) => ({ label: t.nombre, value: t.id }))" />
          </UFormField>
          <div class="grid grid-cols-3 gap-3">
            <UFormField label="Fecha prevista">
              <UInput v-model="nuevaFechaPrevista" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Desde (opcional)">
              <UInput v-model="nuevaHoraDesde" type="time" class="w-full" />
            </UFormField>
            <UFormField label="Hasta (opcional)">
              <UInput v-model="nuevaHoraHasta" type="time" class="w-full" />
            </UFormField>
          </div>
          <UAlert v-if="error" color="error" variant="soft" :title="error" />
        </template>
        <template v-else>
          <UAlert color="success" variant="soft" title="Autorización creada" />
          <UFormField label="Código para el visitante (compartir por el medio que prefiera la copropiedad)">
            <UTextarea :model-value="autorizacionCreada.qr_token ?? ''" readonly :rows="3" class="w-full font-mono text-xs" />
          </UFormField>
          <p class="text-xs text-muted">Válido hasta {{ autorizacionCreada.qr_expira_at ? formatoFechaHora(autorizacionCreada.qr_expira_at) : '—' }}.</p>
        </template>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton v-if="!autorizacionCreada" variant="ghost" @click="drawerAutorizacion = false">Cancelar</UButton>
          <UButton v-if="!autorizacionCreada"
            :loading="accesoStore.guardando"
            :disabled="!nuevaInmuebleId || !nuevoVisitanteNombre.trim() || !nuevaFechaPrevista"
            @click="guardarAutorizacion()"
          >
            Crear
          </UButton>
          <UButton v-else @click="drawerAutorizacion = false">Cerrar</UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
