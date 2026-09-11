<script setup lang="ts">
// MANT-10 · Reservas de zonas comunes. "Reservas" es la pestaña por defecto — es el panel
// operativo del día a día; "Reglas por zona" es configuración, se visita con menos frecuencia.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const reservasStore = useMantenimientoReservasStore()
const zonasStore = useZonasComunesStore()
const conceptoStore = useConceptoStore()

const inmuebles = ref<{ id: string; codigo: string }[]>([])
const error = ref<string | null>(null)

async function cargarTodo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const cliente = useSupabaseClient<Database>()
  const [, , , { data: filasInmuebles }] = await Promise.all([
    reservasStore.cargarReglas(tenantId),
    reservasStore.cargarReservas(tenantId),
    zonasStore.cargarZonasComunes(tenantId),
    cliente.from('inmuebles').select('id, codigo').eq('tenant_id', tenantId).order('codigo'),
    conceptoStore.cargarConceptos(tenantId),
  ])
  inmuebles.value = filasInmuebles ?? []
}
onMounted(cargarTodo)

const nombreZona = computed(() => new Map(zonasStore.zonasComunes.map((z) => [z.id, z.nombre])))
const nombreInmueble = computed(() => new Map(inmuebles.value.map((i) => [i.id, i.codigo])))
const conceptosFijos = computed(() =>
  conceptoStore.conceptos.filter((c) => c.modo_valor === 'fijo' && c.estado === 'activo'),
)

type Tab = 'reservas' | 'reglas'
const tabActiva = ref<Tab>('reservas')

const estadoColor: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  solicitada: 'warning',
  aprobada: 'success',
  rechazada: 'error',
  cancelada: 'neutral',
  completada: 'neutral',
  no_show: 'error',
}

function formatoFecha(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-CO')
}

// ── nueva reserva ──
const drawerReserva = ref(false)
const nuevaZonaId = ref<string | null>(null)
const nuevoInmuebleId = ref<string | null>(null)
const nuevaFecha = ref('')
const nuevaHoraInicio = ref('')
const nuevaHoraFin = ref('')

function abrirNuevaReserva(): void {
  nuevaZonaId.value = null
  nuevoInmuebleId.value = null
  nuevaFecha.value = ''
  nuevaHoraInicio.value = ''
  nuevaHoraFin.value = ''
  error.value = null
  drawerReserva.value = true
}

async function guardarReserva(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nuevaZonaId.value || !nuevoInmuebleId.value || !nuevaFecha.value
    || !nuevaHoraInicio.value || !nuevaHoraFin.value) return
  error.value = null
  try {
    // `useSupabaseUser()` se puebla con getClaims() (sub, no id) — el id confiable sale de
    // getUser() (ver stores/auth.ts).
    const cliente = useSupabaseClient<Database>()
    const {
      data: { user },
    } = await cliente.auth.getUser()
    if (!user) return
    await reservasStore.crearReserva({
      tenant_id: tenantId,
      zona_comun_id: nuevaZonaId.value,
      inmueble_id: nuevoInmuebleId.value,
      fecha: nuevaFecha.value,
      hora_inicio: nuevaHoraInicio.value,
      hora_fin: nuevaHoraFin.value,
      solicitante_origen: 'staff',
      solicitante_ref: user.id,
    })
    drawerReserva.value = false
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear la reserva.')
  }
}

// ── aprobar / rechazar ──
async function aprobar(id: string): Promise<void> {
  error.value = null
  try {
    await reservasStore.aprobar(id)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo aprobar la reserva.')
  }
}

const drawerRechazarId = ref<string | null>(null)
const motivoRechazo = ref('')
async function rechazar(): Promise<void> {
  if (!drawerRechazarId.value) return
  error.value = null
  try {
    await reservasStore.rechazar(drawerRechazarId.value, motivoRechazo.value)
    drawerRechazarId.value = null
    motivoRechazo.value = ''
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo rechazar la reserva.')
  }
}

// ── reglas por zona ──
const drawerRegla = ref(false)
const reglaEditando = ref<Awaited<ReturnType<typeof reservasStore.crearRegla>> | null>(null)
const reglaZonaId = ref<string | null>(null)
const reglaRequiereAprobacion = ref(true)
const reglaCupoSimultaneo = ref(1)
const reglaDuracionMaxima = ref<number | null>(null)
const reglaAnticipacionMinima = ref<number | null>(null)
const reglaAnticipacionMaxima = ref<number | null>(null)
const reglaMaximoActivasInmueble = ref<number | null>(null)
const reglaGeneraCargo = ref(false)
const reglaConceptoId = ref<string | undefined>(undefined)
const reglaPenalidadHoras = ref<number | null>(null)

function abrirNuevaRegla(): void {
  reglaEditando.value = null
  reglaZonaId.value = null
  reglaRequiereAprobacion.value = true
  reglaCupoSimultaneo.value = 1
  reglaDuracionMaxima.value = null
  reglaAnticipacionMinima.value = null
  reglaAnticipacionMaxima.value = null
  reglaMaximoActivasInmueble.value = null
  reglaGeneraCargo.value = false
  reglaConceptoId.value = undefined
  reglaPenalidadHoras.value = null
  error.value = null
  drawerRegla.value = true
}

function abrirEditarRegla(fila: NonNullable<typeof reglaEditando.value>): void {
  reglaEditando.value = fila
  reglaZonaId.value = fila.zona_comun_id
  reglaRequiereAprobacion.value = fila.requiere_aprobacion
  reglaCupoSimultaneo.value = fila.cupo_simultaneo
  reglaDuracionMaxima.value = fila.duracion_maxima_minutos
  reglaAnticipacionMinima.value = fila.anticipacion_minima_horas
  reglaAnticipacionMaxima.value = fila.anticipacion_maxima_dias
  reglaMaximoActivasInmueble.value = fila.maximo_activas_por_inmueble
  reglaGeneraCargo.value = fila.genera_cargo
  reglaConceptoId.value = fila.concepto_id ?? undefined
  reglaPenalidadHoras.value = fila.penalidad_cancelacion_tardia_horas
  error.value = null
  drawerRegla.value = true
}

async function guardarRegla(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !reglaZonaId.value) return
  error.value = null
  try {
    const payload = {
      requiere_aprobacion: reglaRequiereAprobacion.value,
      cupo_simultaneo: reglaCupoSimultaneo.value,
      duracion_maxima_minutos: reglaDuracionMaxima.value,
      anticipacion_minima_horas: reglaAnticipacionMinima.value,
      anticipacion_maxima_dias: reglaAnticipacionMaxima.value,
      maximo_activas_por_inmueble: reglaMaximoActivasInmueble.value,
      genera_cargo: reglaGeneraCargo.value,
      concepto_id: reglaGeneraCargo.value ? (reglaConceptoId.value ?? null) : null,
      penalidad_cancelacion_tardia_horas: reglaPenalidadHoras.value,
    }
    if (reglaEditando.value) {
      await reservasStore.actualizarRegla(reglaEditando.value.id, payload)
    } else {
      await reservasStore.crearRegla({ tenant_id: tenantId, zona_comun_id: reglaZonaId.value, ...payload })
    }
    drawerRegla.value = false
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar la regla.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Reservas de zonas comunes</h1>
      </template>
      <template #descripcion>
        Reserva de salón social, cancha, zona BBQ y otras zonas de uso exclusivo o cupo limitado,
        con reglas propias por zona y sin traslapes — garantizado por la base de datos, no por
        esta pantalla.
      </template>
    </UiTituloDescripcion>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <nav
      class="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto"
      role="tablist"
      aria-label="Secciones de Reservas"
    >
      <button
        v-for="tab in [{ id: 'reservas', etiqueta: 'Reservas' }, { id: 'reglas', etiqueta: 'Reglas por zona' }] as const"
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
      <!-- Reservas -->
      <div v-if="tabActiva === 'reservas'" class="space-y-3">
        <div class="flex justify-end">
          <UButton icon="i-lucide-plus" @click="abrirNuevaReserva()">Nueva reserva</UButton>
        </div>
        <UiTabla
          :columnas="[
            { clave: 'zona', etiqueta: 'Zona' },
            { clave: 'inmueble', etiqueta: 'Inmueble' },
            { clave: 'fecha', etiqueta: 'Fecha' },
            { clave: 'horario', etiqueta: 'Horario' },
            { clave: 'estado', etiqueta: 'Estado' },
            { clave: 'acciones', etiqueta: '' },
          ]"
          :filas="reservasStore.reservas"
          :clave-fila="(r) => r.id"
          vacio="Sin reservas registradas."
        >
          <template #celda-zona="{ fila }">{{ nombreZona.get(fila.zona_comun_id) ?? '—' }}</template>
          <template #celda-inmueble="{ fila }">{{ nombreInmueble.get(fila.inmueble_id) ?? '—' }}</template>
          <template #celda-fecha="{ fila }">{{ formatoFecha(fila.fecha) }}</template>
          <template #celda-horario="{ fila }">{{ fila.hora_inicio.slice(0, 5) }} – {{ fila.hora_fin.slice(0, 5) }}</template>
          <template #celda-estado="{ fila }">
            <UBadge :color="estadoColor[fila.estado]" variant="soft" class="capitalize">{{
              fila.estado.replace('_', ' ')
            }}</UBadge>
            <span v-if="fila.penalizada" class="ml-1 text-xs text-error">(penalizada)</span>
          </template>
          <template #celda-acciones="{ fila }">
            <div v-if="fila.estado === 'solicitada'" class="flex gap-1">
              <UButton size="xs" color="success" variant="soft" @click="aprobar(fila.id)">Aprobar</UButton>
              <UButton size="xs" color="error" variant="soft" @click="drawerRechazarId = fila.id">Rechazar</UButton>
            </div>
          </template>
        </UiTabla>
      </div>

      <!-- Reglas por zona -->
      <div v-else-if="tabActiva === 'reglas'" class="space-y-3">
        <div class="flex justify-end">
          <UButton icon="i-lucide-plus" @click="abrirNuevaRegla()">Nueva regla</UButton>
        </div>
        <UiTabla
          :columnas="[
            { clave: 'zona', etiqueta: 'Zona' },
            { clave: 'aprobacion', etiqueta: 'Aprobación' },
            { clave: 'cupo', etiqueta: 'Cupo simultáneo', alinear: 'derecha' },
            { clave: 'cargo', etiqueta: 'Genera cargo' },
            { clave: 'vigencia', etiqueta: 'Vigencia' },
            { clave: 'acciones', etiqueta: '' },
          ]"
          :filas="reservasStore.reglas"
          :clave-fila="(r) => r.id"
          vacio="Sin reglas configuradas — ninguna zona admite reservas todavía."
        >
          <template #celda-zona="{ fila }">{{ nombreZona.get(fila.zona_comun_id) ?? '—' }}</template>
          <template #celda-aprobacion="{ fila }">{{ fila.requiere_aprobacion ? 'Requiere aprobación' : 'Auto-confirmada' }}</template>
          <template #celda-cupo="{ fila }"><span class="tabular-nums">{{ fila.cupo_simultaneo }}</span></template>
          <template #celda-cargo="{ fila }">{{ fila.genera_cargo ? 'Sí' : 'No' }}</template>
          <template #celda-vigencia="{ fila }">
            {{ formatoFecha(fila.vigente_desde) }}<span v-if="fila.vigente_hasta"> – {{ formatoFecha(fila.vigente_hasta) }}</span>
          </template>
          <template #celda-acciones="{ fila }">
            <UButton size="xs" variant="ghost" @click="abrirEditarRegla(fila)">Editar</UButton>
          </template>
        </UiTabla>
      </div>
    </div>

    <!-- Drawer: nueva reserva -->
    <UiDrawer :abierto="drawerReserva" titulo="Nueva reserva" @cerrar="drawerReserva = false">
      <div class="space-y-4">
        <UFormField label="Zona">
          <UiSelectorBuscable
            v-model="nuevaZonaId"
            :opciones="zonasStore.zonasComunes.map((z) => ({ valor: z.id, etiqueta: z.nombre }))"
          />
        </UFormField>
        <UFormField label="Inmueble">
          <UiSelectorBuscable
            v-model="nuevoInmuebleId"
            :opciones="inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo }))"
          />
        </UFormField>
        <div class="grid grid-cols-3 gap-3">
          <UFormField label="Fecha">
            <UInput v-model="nuevaFecha" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Hora inicio">
            <UInput v-model="nuevaHoraInicio" type="time" class="w-full" />
          </UFormField>
          <UFormField label="Hora fin">
            <UInput v-model="nuevaHoraFin" type="time" class="w-full" />
          </UFormField>
        </div>
        <UAlert v-if="error" color="error" variant="soft" :title="error" />
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerReserva = false">Cancelar</UButton>
          <UButton
            :loading="reservasStore.guardando"
            :disabled="!nuevaZonaId || !nuevoInmuebleId || !nuevaFecha || !nuevaHoraInicio || !nuevaHoraFin"
            @click="guardarReserva()"
          >
            Guardar
          </UButton>
        </div>
      </template>
    </UiDrawer>

    <!-- Drawer: rechazar -->
    <UiDrawer :abierto="drawerRechazarId !== null" titulo="Rechazar reserva" @cerrar="drawerRechazarId = null">
      <div class="space-y-4">
        <UFormField label="Motivo">
          <UTextarea v-model="motivoRechazo" :rows="3" class="w-full" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerRechazarId = null">Cancelar</UButton>
          <UButton color="error" :loading="reservasStore.guardando" :disabled="!motivoRechazo.trim()" @click="rechazar()">
            Rechazar
          </UButton>
        </div>
      </template>
    </UiDrawer>

    <!-- Drawer: regla por zona -->
    <UiDrawer
      :abierto="drawerRegla"
      :titulo="reglaEditando ? `Regla: ${nombreZona.get(reglaEditando.zona_comun_id) ?? ''}` : 'Nueva regla de reserva'"
      @cerrar="drawerRegla = false"
    >
      <div class="space-y-4">
        <UFormField label="Zona">
          <UiSelectorBuscable
            v-model="reglaZonaId"
            :deshabilitado="!!reglaEditando"
            :opciones="zonasStore.zonasComunes.map((z) => ({ valor: z.id, etiqueta: z.nombre }))"
          />
        </UFormField>
        <UCheckbox v-model="reglaRequiereAprobacion" label="Requiere aprobación (si no, la reserva nace confirmada)" />
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Cupo simultáneo (1 = uso exclusivo)">
            <UInput v-model.number="reglaCupoSimultaneo" type="number" min="1" class="w-full" />
          </UFormField>
          <UFormField label="Duración máxima (minutos, opcional)">
            <UInput v-model.number="reglaDuracionMaxima" type="number" min="1" class="w-full" />
          </UFormField>
          <UFormField label="Anticipación mínima (horas, opcional)">
            <UInput v-model.number="reglaAnticipacionMinima" type="number" min="0" class="w-full" />
          </UFormField>
          <UFormField label="Anticipación máxima (días, opcional)">
            <UInput v-model.number="reglaAnticipacionMaxima" type="number" min="0" class="w-full" />
          </UFormField>
          <UFormField label="Máximo activas por inmueble (opcional)">
            <UInput v-model.number="reglaMaximoActivasInmueble" type="number" min="1" class="w-full" />
          </UFormField>
          <UFormField label="Penalidad por cancelación tardía (horas, opcional)">
            <UInput v-model.number="reglaPenalidadHoras" type="number" min="0" class="w-full" />
          </UFormField>
        </div>
        <UCheckbox v-model="reglaGeneraCargo" label="Genera cargo al aprobar" />
        <UFormField v-if="reglaGeneraCargo" label="Concepto (debe tener valor fijo)">
          <USelect
            v-model="reglaConceptoId"
            class="w-full"
            :items="conceptosFijos.map((c) => ({ label: `${c.nombre} (${c.codigo})`, value: c.id }))"
          />
        </UFormField>
        <UAlert v-if="error" color="error" variant="soft" :title="error" />
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerRegla = false">Cancelar</UButton>
          <UButton
            :loading="reservasStore.guardando"
            :disabled="!reglaZonaId || (reglaGeneraCargo && !reglaConceptoId)"
            @click="guardarRegla()"
          >
            Guardar
          </UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
