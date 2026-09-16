<script setup lang="ts">
/**
 * Reportes programados — RPT-05 (PLAN_MOTOR_REPORTES.md §6).
 *
 * Tres cosas que la pantalla tiene que dejar claras, porque son las que
 * generan llamadas cuando no se ven:
 *
 * · **Cuándo vuelve a correr**, en la hora de la copropiedad. `proxima_at`
 *   no se calcula aquí: lo mantiene un disparador en la base, y esta
 *   pantalla solo lo muestra. Duplicar el calendario en el cliente sería la
 *   misma regla en dos sitios.
 * · **Quién lo recibe.** Solo miembros activos: lo impone la política, no la
 *   UI, pero el selector ofrece únicamente miembros para que el usuario no
 *   descubra la regla a golpe de error.
 * · **Si llegó.** La bitácora de entregas responde «a mí nunca me llegó»
 *   con evidencia, incluido el motivo cuando falló.
 */
import { formatearValor } from '@aquila/reporting'
import {
  useReportesStore,
  type EntregaReporte,
  type ProgramacionReporte,
  type ReporteListado,
} from '~/stores/reportes'

useHead({ title: 'Reportes programados' })

const store = useReportesStore()
const tenantStore = useTenantStore()
const authStore = useAuthStore()
const membersStore = useMembersStore()
const toast = useToast()

await useAsyncData('perfil', () => authStore.cargarPerfil())
await useAsyncData('memberships', () => tenantStore.cargarMemberships())

const puedeProgramar = computed(() => tenantStore.puede('settings:manage'))

await useAsyncData(
  'reportes-programaciones',
  async () => {
    const tenantId = tenantStore.activeTenant?.id
    if (!tenantId) return null
    await Promise.all([
      store.cargar(tenantId),
      store.cargarProgramaciones(tenantId),
      membersStore.cargarMiembros(tenantId),
    ])
    return true
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)

// Solo se puede programar un reporte con versión publicada: programar un
// borrador dejaría una corrida que nunca podría ejecutarse (lo rechaza
// también la política, aquí solo se refleja).
const programables = computed<ReporteListado[]>(() =>
  store.reportes.filter((r) => r.versionPublicada !== null),
)

const miembros = computed(() =>
  membersStore.miembros.map((m) => ({
    value: m.user_id,
    label: m.profile?.full_name || m.profile?.email || m.user_id,
  })),
)

// ── Alta ────────────────────────────────────────────────────────────────
const creando = ref(false)
const guardando = ref(false)
const DIAS_SEMANA = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
]

function programacionEnBlanco() {
  return {
    reporteId: '',
    nombre: '',
    frecuencia: 'semanal' as ProgramacionReporte['frecuencia'],
    diaSemana: 1,
    // El tope es 28: los días 29-31 no existen todos los meses y «el último
    // día» es otra regla que nadie ha pedido (lo impone el CHECK).
    diaMes: 1,
    fechaUnica: '',
    hora: '07:00',
    formato: 'xlsx' as ProgramacionReporte['formato'],
  }
}
const nueva = ref(programacionEnBlanco())

function abrirNueva(): void {
  nueva.value = programacionEnBlanco()
  nueva.value.reporteId = programables.value[0]?.id ?? ''
  creando.value = true
}

const reporteElegido = computed(() =>
  programables.value.find((r) => r.id === nueva.value.reporteId),
)

/**
 * Los parámetros se congelan al programar: un reporte que se envía solo no
 * puede pedirle una fecha a nadie. Se toman los valores sugeridos de la
 * definición, que es lo mismo que la pantalla ofrece al ejecutarlo a mano.
 */
const parametrosCongelados = computed<Record<string, string>>(() => {
  const definicion = reporteElegido.value?.versionPublicada?.definicion
  return definicion ? store.parametrosIniciales(definicion) : {}
})

async function confirmarNueva(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nueva.value.nombre.trim() || !nueva.value.reporteId) return

  guardando.value = true
  const id = await store.crearProgramacion(tenantId, {
    reporteId: nueva.value.reporteId,
    nombre: nueva.value.nombre.trim(),
    frecuencia: nueva.value.frecuencia,
    diaSemana: nueva.value.frecuencia === 'semanal' ? nueva.value.diaSemana : null,
    diaMes: nueva.value.frecuencia === 'mensual' ? nueva.value.diaMes : null,
    fechaUnica: nueva.value.frecuencia === 'una_vez' ? nueva.value.fechaUnica : null,
    hora: nueva.value.hora,
    formato: nueva.value.formato,
    parametros: parametrosCongelados.value,
  })
  guardando.value = false

  if (!id) {
    toast.add({ title: store.error ?? 'No se pudo programar', color: 'error' })
    return
  }
  creando.value = false
  await store.cargarProgramaciones(tenantId)
}

// ── Acciones sobre una programación ─────────────────────────────────────
async function recargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) await store.cargarProgramaciones(tenantId)
}

async function alternar(programacion: ProgramacionReporte): Promise<void> {
  const ok = await store.alternarProgramacion(programacion.id, !programacion.activa)
  if (!ok) toast.add({ title: store.error ?? 'No se pudo cambiar', color: 'error' })
  await recargar()
}

async function eliminar(programacion: ProgramacionReporte): Promise<void> {
  const ok = await store.eliminarProgramacion(programacion.id)
  if (!ok) toast.add({ title: store.error ?? 'No se pudo eliminar', color: 'error' })
  await recargar()
}

const suscribiendo = ref<string | null>(null)
const nuevoSuscriptor = ref('')

async function agregarSuscriptor(programacion: ProgramacionReporte): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nuevoSuscriptor.value) return
  const ok = await store.suscribir(tenantId, programacion.id, nuevoSuscriptor.value)
  if (!ok) toast.add({ title: store.error ?? 'No se pudo suscribir', color: 'error' })
  nuevoSuscriptor.value = ''
  suscribiendo.value = null
  await recargar()
}

async function quitarSuscriptor(programacionId: string, profileId: string): Promise<void> {
  await store.desuscribir(programacionId, profileId)
  await recargar()
}

// ── Entregas ────────────────────────────────────────────────────────────
const entregasDe = ref<string | null>(null)
const entregas = ref<EntregaReporte[]>([])

async function verEntregas(programacion: ProgramacionReporte): Promise<void> {
  if (entregasDe.value === programacion.id) {
    entregasDe.value = null
    return
  }
  entregas.value = await store.cargarEntregas(programacion.id)
  entregasDe.value = programacion.id
}

// ── Presentación ────────────────────────────────────────────────────────
function cadencia(p: ProgramacionReporte): string {
  const hora = p.hora.slice(0, 5)
  switch (p.frecuencia) {
    case 'diaria':
      return `Todos los días a las ${hora}`
    case 'semanal':
      return `Cada ${DIAS_SEMANA.find((d) => d.value === p.diaSemana)?.label ?? '—'} a las ${hora}`
    case 'mensual':
      return `El día ${String(p.diaMes)} de cada mes a las ${hora}`
    case 'una_vez':
      return `Una vez: ${formatearValor(p.fechaUnica, 'fecha')} a las ${hora}`
  }
}

/** Siempre en la zona de la copropiedad: es la hora que el usuario pidió. */
function cuando(iso: string | null, zona: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', { timeZone: zona })
}
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-6">
    <div class="flex items-start justify-between gap-3">
      <UiTituloDescripcion clase-descripcion="text-sm text-slate-500 dark:text-slate-400">
        <template #titulo>
          <h1 class="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Reportes programados
          </h1>
        </template>
        <template #descripcion>
          Un reporte programado se ejecuta y se envía solo, a la hora de esta copropiedad. Los
          parámetros quedan <strong>congelados al programarlo</strong>: un informe que se manda solo
          no puede pedirle una fecha a nadie. Solo se puede suscribir a miembros activos.
        </template>
      </UiTituloDescripcion>

      <div class="flex shrink-0 gap-2">
        <UButton to="/reportes" icon="i-lucide-arrow-left" variant="ghost" color="neutral">
          Volver
        </UButton>
        <UButton v-if="puedeProgramar" icon="i-lucide-plus" @click="abrirNueva()">
          Programar
        </UButton>
      </div>
    </div>

    <!-- Alta -->
    <UModal v-model:open="creando" title="Programar un reporte">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Reporte" required>
            <USelect
              v-model="nueva.reporteId"
              class="w-full"
              :items="programables.map((r) => ({ value: r.id, label: r.nombre }))"
            />
          </UFormField>

          <p v-if="programables.length === 0" class="text-sm text-amber-600 dark:text-amber-400">
            No hay ningún reporte con versión publicada. Publica uno antes de programarlo.
          </p>

          <UFormField label="Nombre del envío" required>
            <UInput v-model="nueva.nombre" placeholder="Cartera de los lunes" class="w-full" />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Frecuencia">
              <USelect
                v-model="nueva.frecuencia"
                class="w-full"
                :items="[
                  { value: 'diaria', label: 'Diaria' },
                  { value: 'semanal', label: 'Semanal' },
                  { value: 'mensual', label: 'Mensual' },
                  { value: 'una_vez', label: 'Una sola vez' },
                ]"
              />
            </UFormField>

            <UFormField label="Hora">
              <UInput v-model="nueva.hora" type="time" class="w-full" />
            </UFormField>
          </div>

          <UFormField v-if="nueva.frecuencia === 'semanal'" label="Día de la semana">
            <USelect v-model="nueva.diaSemana" class="w-full" :items="DIAS_SEMANA" />
          </UFormField>

          <UFormField
            v-if="nueva.frecuencia === 'mensual'"
            label="Día del mes"
            help="Del 1 al 28: los días 29-31 no existen todos los meses."
          >
            <UInput v-model.number="nueva.diaMes" type="number" min="1" max="28" class="w-full" />
          </UFormField>

          <UFormField v-if="nueva.frecuencia === 'una_vez'" label="Fecha" required>
            <UInput v-model="nueva.fechaUnica" type="date" class="w-full" />
          </UFormField>

          <UFormField
            label="Formato"
            help="El PDF no se puede generar en el servidor todavía; se descarga desde el Centro."
          >
            <USelect
              v-model="nueva.formato"
              class="w-full"
              :items="[
                { value: 'xlsx', label: 'Excel (.xlsx)' },
                { value: 'csv', label: 'CSV' },
              ]"
            />
          </UFormField>

          <div
            v-if="Object.keys(parametrosCongelados).length > 0"
            class="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700"
          >
            <p class="mb-1 font-medium text-slate-700 dark:text-slate-200">
              Parámetros que quedarán fijos
            </p>
            <p
              v-for="(valor, clave) in parametrosCongelados"
              :key="clave"
              class="text-slate-500 dark:text-slate-400"
            >
              {{ clave }}: {{ valor || '(vacío)' }}
            </p>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="creando = false">Cancelar</UButton>
          <UButton
            :loading="guardando"
            :disabled="!nueva.nombre.trim() || !nueva.reporteId"
            @click="confirmarNueva"
          >
            Programar
          </UButton>
        </div>
      </template>
    </UModal>

    <div v-if="store.cargandoProgramaciones" class="mt-8 text-sm text-slate-500">
      Cargando programaciones…
    </div>

    <p
      v-else-if="store.programaciones.length === 0"
      class="mt-8 text-sm text-slate-500 dark:text-slate-400"
    >
      Todavía no hay ningún reporte programado en esta copropiedad.
    </p>

    <ul v-else class="mt-6 space-y-3">
      <li
        v-for="programacion in store.programaciones"
        :key="programacion.id"
        class="rounded-lg border border-slate-200 p-4 dark:border-slate-700"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-slate-900 dark:text-slate-100">
              {{ programacion.nombre }}
              <UBadge
                :color="programacion.activa ? 'success' : 'neutral'"
                variant="subtle"
                size="xs"
                class="ml-1 align-middle"
              >
                {{ programacion.activa ? 'activa' : 'pausada' }}
              </UBadge>
              <UBadge variant="subtle" size="xs" class="ml-1 align-middle">
                {{ programacion.formato === 'xlsx' ? 'Excel' : 'CSV' }}
              </UBadge>
            </p>
            <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {{ programacion.reporteNombre }} · {{ cadencia(programacion) }}
              ({{ programacion.zonaHoraria }})
            </p>
            <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Próximo envío:
              <strong>{{ cuando(programacion.proximaAt, programacion.zonaHoraria) }}</strong>
              <span v-if="programacion.ultimaAt" class="text-slate-400">
                · último: {{ cuando(programacion.ultimaAt, programacion.zonaHoraria) }}
              </span>
            </p>
          </div>

          <div v-if="puedeProgramar" class="flex gap-1.5">
            <UButton size="xs" variant="outline" color="neutral" @click="alternar(programacion)">
              {{ programacion.activa ? 'Pausar' : 'Reanudar' }}
            </UButton>
            <UButton size="xs" variant="ghost" color="neutral" @click="verEntregas(programacion)">
              Entregas
            </UButton>
            <!-- Una programación que ya envió NO se puede borrar: arrastraría
                 su bitácora de entregas, que es append-only (SEC-14). En vez
                 de ofrecer un botón que va a fallar, se dice por qué. -->
            <UButton
              v-if="programacion.entregas === 0"
              size="xs"
              variant="ghost"
              color="error"
              @click="eliminar(programacion)"
            >
              Eliminar
            </UButton>
            <span
              v-else
              class="self-center text-xs text-slate-400"
              title="Borrarla perdería la evidencia de los envíos ya hechos. Púsala en pausa."
            >
              {{ programacion.entregas }} envío{{ programacion.entregas === 1 ? '' : 's' }}
              registrado{{ programacion.entregas === 1 ? '' : 's' }}
            </span>
          </div>
        </div>

        <!-- Suscriptores -->
        <div class="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Reciben</p>
          <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
            <UBadge
              v-for="suscriptor in programacion.suscriptores"
              :key="suscriptor.profileId"
              variant="subtle"
              color="neutral"
            >
              {{ suscriptor.nombre }}
              <button
                v-if="puedeProgramar"
                type="button"
                class="ml-1 text-slate-400 hover:text-red-500"
                :aria-label="`Quitar a ${suscriptor.nombre}`"
                @click="quitarSuscriptor(programacion.id, suscriptor.profileId)"
              >
                ×
              </button>
            </UBadge>

            <span
              v-if="programacion.suscriptores.length === 0"
              class="text-xs text-amber-600 dark:text-amber-400"
            >
              Nadie: este envío no llegará a ninguna parte.
            </span>

            <UButton
              v-if="puedeProgramar && suscribiendo !== programacion.id"
              size="xs"
              variant="ghost"
              color="neutral"
              @click="suscribiendo = programacion.id"
            >
              + Añadir
            </UButton>
          </div>

          <div v-if="suscribiendo === programacion.id" class="mt-2 flex items-center gap-2">
            <USelect
              v-model="nuevoSuscriptor"
              class="w-64"
              placeholder="Elige un miembro"
              :items="miembros"
            />
            <UButton size="xs" :disabled="!nuevoSuscriptor" @click="agregarSuscriptor(programacion)">
              Suscribir
            </UButton>
            <UButton size="xs" variant="ghost" color="neutral" @click="suscribiendo = null">
              Cancelar
            </UButton>
          </div>
        </div>

        <!-- Entregas: la respuesta a «a mí nunca me llegó» -->
        <div
          v-if="entregasDe === programacion.id"
          class="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800"
        >
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Entregas</p>
          <p v-if="entregas.length === 0" class="mt-1 text-xs text-slate-500">
            Todavía no se ha intentado ningún envío.
          </p>
          <ul v-else class="mt-1.5 space-y-1">
            <li v-for="entrega in entregas" :key="entrega.id" class="text-xs">
              <span class="text-slate-500">
                {{ cuando(entrega.intentadaAt, programacion.zonaHoraria) }}
              </span>
              · <span class="text-slate-700 dark:text-slate-200">{{ entrega.destinatario }}</span>
              ·
              <span
                :class="
                  entrega.estado === 'enviada'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                "
              >
                {{ entrega.estado }}
              </span>
              <span v-if="entrega.detalle" class="text-slate-400"> — {{ entrega.detalle }}</span>
            </li>
          </ul>
        </div>
      </li>
    </ul>
  </div>
</template>
