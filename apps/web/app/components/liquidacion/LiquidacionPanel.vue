<script setup lang="ts">
// El panel de un periodo: la pantalla donde ocurre el flujo de dos tiempos
// (plan 2026-08-24 §5).
//
// ═══ UNA PANTALLA, DOS ACTORES ═══
//
// No hay una vista para el auxiliar y otra para el administrador: hay una
// que se adapta al estado de la liquidación y al rol de quien mira. Quien
// prepara ve "Solicitar aplicación"; quien aprueba ve "Aprobar y aplicar".
// Repartirlo en dos pantallas obligaría a mantener dos veces la misma
// información y a explicar cuál mirar.
//
// El rol solo decide qué se PINTA. La barrera real está en
// guard_liquidacion_transicion: un auxiliar que llame la API directamente
// recibe LIQUIDACION_REQUIERE_ADMINISTRADOR de la base. Aquí se evita
// mostrarle un botón que le va a fallar, nada más.
import type { Database } from '@aquila/shared'
import type { AvisoAlcance, HallazgoPrevuelo } from '~/stores/liquidacion'
import { MESES, ESTADO_UI } from '~/config/liquidacion-ui'

type PeriodoRow = Database['public']['Tables']['periodos']['Row']
type LiquidacionRow = Database['public']['Tables']['liquidaciones']['Row']

const props = defineProps<{
  periodo: PeriodoRow
  liquidacion: LiquidacionRow | null
}>()
const emit = defineEmits<{ cambio: [] }>()

const tenantStore = useTenantStore()
const liquidacionStore = useLiquidacionStore()
const toast = useToast()

const esAdministrador = computed(() => tenantStore.role === 'administrador')

const hallazgos = ref<HallazgoPrevuelo[]>([])
// ADC-01 — de la ÚLTIMA simulación de esta sesión de pantalla, no de la base:
// a diferencia de `hallazgos` (siempre recalculado en vivo vía RPC), el motor
// no tiene un endpoint liviano de solo-lectura — se pierde al recargar la
// página hasta que se vuelva a simular. Se congela de verdad recién al
// aplicar (avisos_aceptados, ver informe ADC-01 §3.2/apéndice UI).
const avisosAlcance = ref<AvisoAlcance[]>([])
const hallazgosConAlcance = computed<HallazgoPrevuelo[]>(() => [
  ...hallazgos.value,
  ...avisosAlcance.value.map((a) => ({ ...a, severidad: 'aviso' as const })),
])
const cargandoPrevuelo = ref(false)
const trabajando = ref(false)
const error = ref<string | null>(null)
const aviso = ref<string | null>(null)
const lineas = ref<Awaited<ReturnType<typeof liquidacionStore.cargarLineasDeLiquidacion>>>([])

const dialogo = ref<'aplicar' | 'anular' | 'solicitar' | 'rechazar' | null>(null)
const notaSolicitud = ref(
  import.meta.client ? (localStorage.getItem(`liq-nota-${props.periodo.id}`) ?? '') : '',
)
const motivoRechazo = ref(
  import.meta.client ? (localStorage.getItem(`liq-motivo-${props.periodo.id}`) ?? '') : '',
)

watch(notaSolicitud, (v) => {
  if (import.meta.client) {
    const key = `liq-nota-${props.periodo.id}`
    if (v) localStorage.setItem(key, v)
    else localStorage.removeItem(key)
  }
})
watch(motivoRechazo, (v) => {
  if (import.meta.client) {
    const key = `liq-motivo-${props.periodo.id}`
    if (v) localStorage.setItem(key, v)
    else localStorage.removeItem(key)
  }
})

// Mensaje de divulgación — llega a todos los destinatarios en el estado de
// cuenta de este periodo (20260902130000). Editable solo mientras el
// periodo esté abierto: una vez liquidado, los documentos ya emitidos
// quedan sellados con lo que tenían al momento de aplicar.
const mensajeDivulgacion = ref(props.periodo.mensaje_divulgacion ?? '')
const guardandoMensaje = ref(false)
const mensajeDivulgacionCambio = computed(
  () => mensajeDivulgacion.value.trim() !== (props.periodo.mensaje_divulgacion ?? '').trim(),
)

const etiquetaPeriodo = computed(
  () => `${MESES[props.periodo.mes - 1]} ${props.periodo.anio}`,
)
const confirmacionPeriodo = computed(() => etiquetaPeriodo.value.toUpperCase())

const bloqueado = computed(() => hallazgos.value.some((h) => h.severidad === 'bloqueo'))
const estado = computed(() => props.liquidacion?.estado ?? null)

// Qué se puede hacer, según en qué punto del flujo está y quién mira.
const puedeSimular = computed(
  () => props.periodo.estado === 'abierto' && estado.value !== 'pendiente_aprobacion',
)
// Se MUESTRA en cuanto hay algo que solicitar, y se deshabilita si hay
// bloqueos — no se esconde. Un botón ausente deja al usuario preguntándose
// qué le falta; uno deshabilitado con su motivo al lado responde solo.
const puedeSolicitar = computed(
  () => estado.value === 'pre_liquidada' || estado.value === 'rechazada',
)

// El motivo va como texto junto al botón, no como `title`: un tooltip sobre
// un control deshabilitado muchas veces no llega a mostrarse, y además
// sustituía el nombre accesible del botón — un lector de pantalla anunciaba
// el motivo en lugar de «Solicitar aplicación».
const motivoBloqueo = computed(() =>
  bloqueado.value
    ? hallazgos.value
        .filter((h) => h.severidad === 'bloqueo')
        .map((h) => h.titulo)
        .join(' · ')
    : null,
)
const puedeAprobar = computed(() => estado.value === 'pendiente_aprobacion' && esAdministrador.value)
const puedeAnular = computed(() => estado.value === 'aplicada' && esAdministrador.value)
const esperandoOtro = computed(
  () => estado.value === 'pendiente_aprobacion' && !esAdministrador.value,
)


async function refrescarPrevuelo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargandoPrevuelo.value = true
  try {
    hallazgos.value = await liquidacionStore.cargarPrevuelo(
      tenantId,
      props.periodo.id,
      props.liquidacion?.id,
    )
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo verificar el periodo.')
  } finally {
    cargandoPrevuelo.value = false
  }
}

async function refrescarLineas(): Promise<void> {
  if (!props.liquidacion) {
    lineas.value = []
    return
  }
  try {
    lineas.value = await liquidacionStore.cargarLineasDeLiquidacion(props.liquidacion.id)
  } catch {
    lineas.value = []
    error.value = 'No se pudo cargar el detalle de líneas.'
  }
}

watch(
  () => [props.periodo.id, props.liquidacion?.id, props.liquidacion?.estado],
  async () => {
    await Promise.all([refrescarPrevuelo(), refrescarLineas()])
  },
  { immediate: true },
)

// Aparte del watch de arriba: avisosAlcance solo se descarta al cambiar de
// PERIODO (una simulación vieja no describe un periodo distinto). No se
// engancha al watch de arriba porque ese también reacciona a liquidacion?.id
// y liquidacion?.estado, que cambian como EFECTO del propio simular() —
// limpiarlo ahí borraba el aviso recién recibido antes de que se alcanzara
// a pintar (carrera con cargarLiquidaciones() dentro de simular()).
watch(
  () => props.periodo.id,
  () => {
    avisosAlcance.value = []
  },
)

/** Envuelve una acción: limpia mensajes, marca ocupado y refresca al final.
 * Todas las acciones del panel siguen el mismo ciclo, así que se escribe una
 * vez en lugar de repetir el try/finally en cada una. */
async function ejecutar(accion: () => Promise<string>): Promise<void> {
  error.value = null
  aviso.value = null
  trabajando.value = true
  try {
    aviso.value = await accion()
    dialogo.value = null
    emit('cambio')
    await refrescarPrevuelo()
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo completar la operación.')
  } finally {
    trabajando.value = false
  }
}

function simular(): void {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  void ejecutar(async () => {
    const r = await liquidacionStore.simular(props.periodo.id, tenantId)
    avisosAlcance.value = r.avisos_alcance
    return r.descarto_anteriores > 0
      ? `Pre-Liquidación recalculada: ${r.lineas} líneas por ${formatoMoneda(r.tenant_total)}.`
      : `Pre-Liquidación lista: ${r.lineas} líneas por ${formatoMoneda(r.tenant_total)}.`
  })
}

function solicitar(): void {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !props.liquidacion) return
  void ejecutar(async () => {
    await liquidacionStore.solicitarAplicacion(props.liquidacion!.id, tenantId, notaSolicitud.value)
    notaSolicitud.value = ''
    return 'Enviada a aprobación. Un administrador debe autorizarla.'
  })
}

function aplicar(): void {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !props.liquidacion) return
  void ejecutar(async () => {
    const r = await liquidacionStore.aplicar(props.liquidacion!.id, tenantId)
    return (
      `Aplicada: ${r.cargos_creados} cargos, ${r.estados_emitidos} estados de cuenta emitidos ` +
      `y periodo cerrado.`
    )
  })
}

function rechazar(): void {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !props.liquidacion) return
  void ejecutar(async () => {
    await liquidacionStore.rechazar(props.liquidacion!.id, tenantId, motivoRechazo.value)
    motivoRechazo.value = ''
    return 'Rechazada. Quien la preparó puede corregirla y volver a solicitarla.'
  })
}

function anular(motivo: string): void {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !props.liquidacion) return
  void ejecutar(async () => {
    const r = await liquidacionStore.anular(props.liquidacion!.id, tenantId, motivo)
    return (
      `Anulada: ${r.contra_cargos} contra-cargos emitidos, ${r.estados_retirados} estados ` +
      `retirados y periodo reabierto.`
    )
  })
}

async function guardarMensajeDivulgacion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  guardandoMensaje.value = true
  try {
    await liquidacionStore.actualizarMensajeDivulgacion(
      props.periodo.id,
      tenantId,
      mensajeDivulgacion.value,
    )
    toast.add({ title: 'Mensaje de divulgación guardado.', color: 'success' })
    emit('cambio')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el mensaje de divulgación.')
  } finally {
    guardandoMensaje.value = false
  }
}

function descartar(): void {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !props.liquidacion) return
  void ejecutar(async () => {
    await liquidacionStore.descartar(props.liquidacion!.id, tenantId)
    return 'Pre-Liquidación descartada.'
  })
}
</script>

<template>
  <div class="space-y-5">
    <!-- ── cabecera ─────────────────────────────────────────────────── -->
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-semibold">{{ etiquetaPeriodo }}</h2>
          <UBadge
            v-if="estado"
            :color="ESTADO_UI[estado]?.color ?? 'neutral'"
            variant="subtle"
            size="sm"
          >
            {{ ESTADO_UI[estado]?.etiqueta ?? estado }}
          </UBadge>
          <UBadge v-else color="neutral" variant="subtle" size="sm">Sin liquidar</UBadge>
        </div>
        <p class="text-sm text-muted mt-0.5">
          <template v-if="periodo.fecha_vencimiento">
            Vence el {{ periodo.fecha_vencimiento }} ·
          </template>
          Periodo {{ periodo.estado }}
          <template v-if="liquidacion?.nota_solicitud">
            · «{{ liquidacion.nota_solicitud }}»
          </template>
        </p>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <AuditoriaAuditarAhoraBoton
          v-if="liquidacion"
          origen-tipo="liquidacion"
          :origen-id="liquidacion.id"
          :nombre-sugerido="`Auditoría — ${etiquetaPeriodo}`"
          objetivo-sugerido="Evaluar el proceso, los controles y la evidencia de esta liquidación."
          tipo-sugerido="LIQUIDACION"
          :periodo-sugerido="`${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`"
        />
        <UButton
          v-if="liquidacion && (estado === 'pre_liquidada' || estado === 'rechazada')"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="trabajando"
          @click="descartar"
        >
          Descartar
        </UButton>
        <UButton
          v-if="puedeSimular"
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-refresh-cw"
          :loading="trabajando"
          @click="simular"
        >
          {{ liquidacion ? 'Volver a simular' : 'Simular' }}
        </UButton>
        <UButton
          v-if="puedeSolicitar"
          size="sm"
          :disabled="trabajando || bloqueado"
          @click="dialogo = 'solicitar'"
        >
          Solicitar aplicación
        </UButton>
        <UButton
          v-if="puedeAprobar"
          color="error"
          variant="outline"
          size="sm"
          :disabled="trabajando"
          @click="dialogo = 'rechazar'"
        >
          Rechazar
        </UButton>
        <UButton
          v-if="puedeAprobar"
          size="sm"
          :disabled="trabajando || bloqueado"
          @click="dialogo = 'aplicar'"
        >
          Aprobar y aplicar
        </UButton>
        <UButton
          v-if="puedeAnular"
          color="error"
          variant="outline"
          size="sm"
          icon="i-lucide-undo-2"
          :disabled="trabajando"
          @click="dialogo = 'anular'"
        >
          Anular
        </UButton>
      </div>
    </div>

    <p
      v-if="motivoBloqueo && (puedeSolicitar || puedeAprobar)"
      class="flex items-start gap-1.5 text-xs text-muted -mt-2"
    >
      <UIcon name="i-lucide-info" class="size-3.5 shrink-0 mt-px" />
      <span>Falta resolver: {{ motivoBloqueo }}</span>
    </p>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />
    <UAlert v-if="aviso" color="success" variant="soft" :title="aviso" />

    <!-- ── banda de estado ──────────────────────────────────────────── -->
    <UAlert
      v-if="estado === 'pre_liquidada'"
      color="warning"
      variant="soft"
      icon="i-lucide-flask-conical"
      title="Esta Pre-Liquidación no ha modificado nada todavía"
      description="Puedes simular las veces que necesites. «Solicitar aplicación» tampoco aplica nada — la pasa a un administrador para su autorización."
    />
    <UAlert
      v-else-if="esperandoOtro"
      color="info"
      variant="soft"
      icon="i-lucide-clock"
      title="Esperando aprobación de un administrador"
      description="Ya está solicitada. Solo un administrador puede aplicarla o rechazarla."
    />
    <UAlert
      v-else-if="puedeAprobar"
      color="info"
      variant="soft"
      icon="i-lucide-shield-check"
      title="Pendiente de tu aprobación"
      description="La verificación de abajo se acaba de re-ejecutar. Al aplicar se vuelve a comprobar dentro de la transacción, así que nada puede cambiar entre lo que ves y lo que se escribe."
    />
    <UAlert
      v-else-if="estado === 'aplicada'"
      color="success"
      variant="soft"
      icon="i-lucide-check-check"
      title="Periodo liquidado"
      :description="`Los cargos existen y el periodo está cerrado. Solo puede anularse mientras ningún cargo tenga pagos imputados.`"
    />

    <!-- ── mensaje de divulgación ───────────────────────────────────── -->
    <div class="rounded-md border border-default p-4 space-y-2">
      <div class="flex items-center justify-between gap-2">
        <label class="text-xs font-semibold uppercase tracking-wide text-muted">
          Mensaje de divulgación
        </label>
        <UBadge v-if="periodo.estado !== 'abierto'" color="neutral" variant="subtle" size="xs">
          Solo lectura
        </UBadge>
      </div>
      <p class="text-xs text-muted">
        Llega a todos los propietarios en su estado de cuenta de este periodo — convocatorias,
        cambios de tarifa, avisos de la asamblea, etc.
      </p>
      <UTextarea
        v-model="mensajeDivulgacion"
        :disabled="periodo.estado !== 'abierto' || guardandoMensaje"
        :rows="3"
        autoresize
        :maxrows="8"
        placeholder="Ej: La cuota de parqueadero de visitantes sube a $15.000 desde septiembre, aprobado en asamblea del 20/08."
        class="w-full"
      />
      <div v-if="periodo.estado === 'abierto'" class="flex justify-end">
        <UButton
          size="xs"
          variant="soft"
          :disabled="!mensajeDivulgacionCambio"
          :loading="guardandoMensaje"
          @click="guardarMensajeDivulgacion"
        >
          Guardar mensaje
        </UButton>
      </div>
    </div>

    <!-- ── cifras ───────────────────────────────────────────────────── -->
    <div v-if="liquidacion" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="rounded-md border border-default p-3">
        <p class="text-xs text-muted uppercase tracking-wide">Total</p>
        <p class="text-lg font-semibold tabular-nums">
          {{ formatoMoneda(liquidacion.tenant_total) }}
        </p>
      </div>
      <div class="rounded-md border border-default p-3">
        <p class="text-xs text-muted uppercase tracking-wide">Líneas</p>
        <p class="text-lg font-semibold tabular-nums">{{ lineas.length }}</p>
      </div>
      <div class="rounded-md border border-default p-3">
        <p class="text-xs text-muted uppercase tracking-wide">Unidades</p>
        <p class="text-lg font-semibold tabular-nums">
          {{ new Set(lineas.map((l) => l.inmueble?.id)).size }}
        </p>
      </div>
      <div class="rounded-md border border-default p-3">
        <p class="text-xs text-muted uppercase tracking-wide">Última simulación</p>
        <p class="text-sm font-medium">{{ liquidacion.simulada_at ? new Date(liquidacion.simulada_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—' }}</p>
      </div>
    </div>

    <!-- ── verificación previa ──────────────────────────────────────── -->
    <LiquidacionPrevuelo :hallazgos="hallazgosConAlcance" :cargando="cargandoPrevuelo" />

    <!-- ── detalle por unidad ───────────────────────────────────────── -->
    <section v-if="lineas.length > 0">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
        Detalle por unidad
      </h3>
      <UiTabla
        :columnas="[
          { clave: 'unidad', etiqueta: 'Unidad' },
          { clave: 'concepto', etiqueta: 'Concepto' },
          { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha', ancho: '160px' },
        ]"
        :filas="lineas"
        :clave-fila="(l) => l.id"
      >
        <template #celda-unidad="{ fila }">{{ fila.inmueble?.codigo ?? '—' }}</template>
        <template #celda-concepto="{ fila }">
          <span class="text-muted">{{ fila.concepto?.nombre ?? '—' }}</span>
        </template>
        <template #celda-monto="{ fila }">
          <span class="tabular-nums">{{ formatoMoneda(fila.monto) }}</span>
        </template>
      </UiTabla>
    </section>

    <p v-else-if="liquidacion" class="text-sm text-muted">
      Esta Pre-Liquidación no produjo líneas — revisa que haya conceptos activos configurados.
    </p>

    <!-- ── diálogos ─────────────────────────────────────────────────── -->
    <UModal
      :open="dialogo === 'solicitar'"
      title="Solicitar la aplicación"
      @update:open="(v) => !v && (dialogo = null)"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            Un administrador deberá aprobarla antes de que se aplique. Podrás seguir simulando
            mientras esperas, pero cualquier cambio reemplaza esta solicitud por una nueva.
          </p>
          <UFormField label="Nota para quien aprueba (opcional)" name="nota">
            <UTextarea
              v-model="notaSolicitud"
              :rows="2"
              placeholder="El contexto que no cabe en los números"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="outline" @click="dialogo = null">Cancelar</UButton>
          <UButton :loading="trabajando" @click="solicitar">Enviar a aprobación</UButton>
        </div>
      </template>
    </UModal>

    <UModal
      :open="dialogo === 'rechazar'"
      title="Rechazar la solicitud"
      @update:open="(v) => !v && (dialogo = null)"
    >
      <template #body>
        <UFormField label="Motivo" name="motivo" required>
          <UTextarea
            v-model="motivoRechazo"
            :rows="2"
            placeholder="Qué debe corregirse antes de volver a solicitarla"
            class="w-full"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="outline" @click="dialogo = null">Cancelar</UButton>
          <UButton
            color="error"
            :disabled="motivoRechazo.trim().length < 5"
            :loading="trabajando"
            @click="rechazar"
          >
            Rechazar
          </UButton>
        </div>
      </template>
    </UModal>

    <LiquidacionConfirmar
      :abierto="dialogo === 'aplicar'"
      :titulo="`Aprobar y aplicar ${etiquetaPeriodo}`"
      descripcion="Esta acción no se puede deshacer una vez haya pagos imputados."
      :pasos="[
        { titulo: `Se crean los cargos`, detalle: `${lineas.length} líneas por ${formatoMoneda(liquidacion?.tenant_total ?? 0)}` },
        { titulo: 'Se reconoce el ingreso', detalle: 'Según el modo configurado en la política financiera' },
        { titulo: 'El periodo pasa a cerrado', detalle: 'No admitirá más novedades' },
        { titulo: 'Se emiten los estados de cuenta', detalle: 'Uno por cada unidad activa' },
      ]"
      :confirmacion="confirmacionPeriodo"
      etiqueta-accion="Aplicar definitivamente"
      :cargando="trabajando"
      @cerrar="dialogo = null"
      @confirmar="aplicar"
    />

    <LiquidacionConfirmar
      :abierto="dialogo === 'anular'"
      :titulo="`Anular la liquidación de ${etiquetaPeriodo}`"
      descripcion="Se emitirá el contra-cargo de cada cargo, se retirarán los estados de cuenta y el periodo se reabrirá. Los cargos originales no se borran: quedan con su reverso al lado."
      :pasos="[
        { titulo: 'Se emiten los contra-cargos', detalle: 'El saldo del periodo queda en cero' },
        { titulo: 'Se retiran los estados de cuenta', detalle: 'Dejan de reflejar la realidad' },
        { titulo: 'El periodo se reabre', detalle: 'Podrá volver a liquidarse' },
      ]"
      :confirmacion="confirmacionPeriodo"
      etiqueta-accion="Anular definitivamente"
      peligro
      pedir-motivo
      :cargando="trabajando"
      @cerrar="dialogo = null"
      @confirmar="anular"
    />
  </div>
</template>
