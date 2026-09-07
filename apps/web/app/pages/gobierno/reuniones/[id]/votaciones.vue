<script setup lang="ts">
// GOB-3 §4.5: panel de quórum en vivo (con advertencia de pluralidad), selector de materia que
// muestra mayoría/base/restricciones ANTES de abrir, registro de votos con coeficiente acumulado
// en tiempo real, y resultado desglosado citando la regla aplicada. No implementa envío de
// convocatoria ni edición de asistencia (GOB-2, en la página hermana [id]/index.vue).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const route = useRoute()
const reunionId = route.params.id as string
const tenantStore = useTenantStore()
const reunionesStore = useGobiernoReunionesStore()
const votacionesStore = useGobiernoVotacionesStore()

const reunion = computed(() => reunionesStore.reuniones.find((r) => r.id === reunionId))
const error = ref<string | null>(null)

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    reunionesStore.cargarReuniones(tenantId),
    reunionesStore.cargarDetalle(reunionId),
    votacionesStore.cargarMaterias(),
    votacionesStore.cargarReglas(tenantId),
    votacionesStore.cargarVotaciones(reunionId),
  ])
  if (reunion.value?.estado === 'instalada') {
    try {
      await votacionesStore.cargarQuorum(reunionId)
    } catch {
      // La reunión puede no estar instalada todavía en el primer render — se reintenta al recargar.
    }
  }
}
onMounted(cargar)
onUnmounted(() => {
  reunionesStore.limpiarDetalle()
  votacionesStore.limpiar()
})

const estadoReunionColor: Record<string, 'neutral' | 'primary' | 'success' | 'error'> = {
  convocada: 'neutral', instalada: 'primary', cerrada: 'success', cancelada: 'error',
}
const estadoVotacionColor: Record<string, 'primary' | 'success' | 'error'> = {
  abierta: 'primary', cerrada: 'success', anulada: 'error',
}
const resultadoColor: Record<string, 'success' | 'error' | 'warning'> = {
  aprobada: 'success', rechazada: 'error', sin_quorum: 'warning',
}
const mayoriaTipoEtiqueta: Record<string, string> = {
  ordinaria: 'ordinaria (mitad + uno de representados, art. 45)',
  calificada_70: 'calificada (70% de los coeficientes totales, art. 46)',
  unanimidad: 'unanimidad',
}
const baseCalculoEtiqueta: Record<string, string> = {
  coeficientes_representados: 'sobre los coeficientes representados',
  coeficientes_totales: 'sobre los coeficientes totales del edificio',
}

// ── Quórum en vivo ───────────────────────────────────────────────────────
async function refrescarQuorum(): Promise<void> {
  error.value = null
  try {
    await votacionesStore.cargarQuorum(reunionId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo calcular el quórum.')
  }
}

// ── Reglas de mayoría ────────────────────────────────────────────────────
const drawerReglaAbierto = ref(false)
const formRegla = reactive({ materiaId: null as number | null, quorumMinimoPct: 50, mayoriaPct: 50, reglamentoReferencia: '' })
function abrirRegla(materiaId: number): void {
  const materia = votacionesStore.materias.find((m) => m.id === materiaId)
  formRegla.materiaId = materiaId
  formRegla.quorumMinimoPct = 50
  formRegla.mayoriaPct = materia?.mayoria_tipo === 'calificada_70' ? 70 : materia?.mayoria_tipo === 'unanimidad' ? 100 : 50
  formRegla.reglamentoReferencia = ''
  drawerReglaAbierto.value = true
}
async function guardarRegla(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !formRegla.materiaId) return
  error.value = null
  try {
    await votacionesStore.crearRegla({
      tenant_id: tenantId, materia_id: formRegla.materiaId,
      quorum_minimo_pct: formRegla.quorumMinimoPct, mayoria_pct: formRegla.mayoriaPct,
      reglamento_referencia: formRegla.reglamentoReferencia.trim() || null,
      vigente_desde: new Date().toISOString().slice(0, 10),
    })
    drawerReglaAbierto.value = false
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo configurar la mayoría.')
  }
}
function reglaDe(materiaId: number) {
  return votacionesStore.reglas.find((r) => r.materia_id === materiaId)
}

// ── Abrir votación ───────────────────────────────────────────────────────
const drawerVotacionAbierto = ref(false)
const formVotacion = reactive({ materiaId: null as number | null, pregunta: '' })
const opcionesMateria = computed(() =>
  votacionesStore.materias.map((m) => ({ valor: m.id, etiqueta: m.numeral_articulo ? `${m.nombre} (art. ${m.numeral_articulo})` : m.nombre })),
)
const materiaSeleccionada = computed(() => votacionesStore.materias.find((m) => m.id === formVotacion.materiaId) ?? null)
function abrirDrawerVotacion(): void {
  formVotacion.materiaId = null
  formVotacion.pregunta = ''
  drawerVotacionAbierto.value = true
}
async function guardarVotacion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !formVotacion.materiaId || !formVotacion.pregunta.trim()) return
  error.value = null
  try {
    const votacion = await votacionesStore.abrirVotacion({
      tenant_id: tenantId, reunion_id: reunionId, materia_id: formVotacion.materiaId, pregunta: formVotacion.pregunta.trim(),
    })
    drawerVotacionAbierto.value = false
    seleccionarVotacion(votacion.id)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo abrir la votación.')
  }
}

// ── Detalle de una votación ──────────────────────────────────────────────
const votacionSeleccionadaId = ref<string | null>(null)
const votacionSeleccionada = computed(() => votacionesStore.votaciones.find((v) => v.id === votacionSeleccionadaId.value) ?? null)
async function seleccionarVotacion(id: string): Promise<void> {
  votacionSeleccionadaId.value = id
  error.value = null
  try {
    await votacionesStore.cargarVotos(id)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudieron cargar los votos.')
  }
}

const asistenciaPresente = computed(() => reunionesStore.asistencia.filter((a) => !a.salida_at && a.calidad !== 'invitado'))
const asistenciaYaVoto = computed(() => new Set(votacionesStore.votos.map((v) => v.asistencia_id)))
const asistenciaDisponibleParaVotar = computed(() =>
  asistenciaPresente.value.filter((a) => !asistenciaYaVoto.value.has(a.id)),
)
const opcionesAsistente = computed(() =>
  asistenciaDisponibleParaVotar.value.map((a) => ({
    valor: a.id, etiqueta: `${a.inmueble?.codigo ?? 'órgano'} · ${a.asistente?.nombre_completo ?? ''}`,
  })),
)
const asistenciaSeleccionada = ref<string | null>(null)
async function emitirVoto(sentido: 'favor' | 'contra' | 'abstencion'): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !votacionSeleccionada.value || !asistenciaSeleccionada.value) return
  error.value = null
  try {
    await votacionesStore.emitirVoto(votacionSeleccionada.value.id, tenantId, reunionId, asistenciaSeleccionada.value, sentido)
    asistenciaSeleccionada.value = null
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar el voto.')
  }
}
const coeficienteAcumulado = computed(() => {
  let favor = 0, contra = 0, abstencion = 0
  for (const v of votacionesStore.votos) {
    if (v.sentido === 'favor') favor += Number(v.coeficiente)
    else if (v.sentido === 'contra') contra += Number(v.coeficiente)
    else if (v.sentido === 'abstencion') abstencion += Number(v.coeficiente)
  }
  return { favor, contra, abstencion }
})

async function cerrar(): Promise<void> {
  if (!votacionSeleccionada.value) return
  error.value = null
  try {
    await votacionesStore.cerrarVotacion(votacionSeleccionada.value.id, reunionId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cerrar la votación.')
  }
}
const motivoAnulacion = ref('')
async function anular(): Promise<void> {
  if (!votacionSeleccionada.value || !motivoAnulacion.value.trim()) return
  error.value = null
  try {
    await votacionesStore.anularVotacion(votacionSeleccionada.value.id, reunionId, motivoAnulacion.value.trim())
    motivoAnulacion.value = ''
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo anular la votación.')
  }
}

function reglaAplicada(votacion: NonNullable<typeof votacionSeleccionada.value>): Record<string, unknown> | null {
  return (votacion.regla_aplicada as Record<string, unknown> | null) ?? null
}
</script>

<template>
  <div class="space-y-6">
    <div v-if="reunion" class="space-y-6">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <NuxtLink :to="`/gobierno/reuniones/${reunionId}`" class="text-xs text-muted hover:underline">
            ← Volver a la reunión
          </NuxtLink>
          <h1 class="text-xl font-semibold">
            Quórum y votación · {{ reunion.organo?.nombre || reunion.organo?.tipo?.nombre }}
          </h1>
          <p class="text-sm text-muted">{{ reunion.fecha_hora }} · {{ reunion.tipo?.nombre }}</p>
        </div>
        <UBadge :color="estadoReunionColor[reunion.estado] ?? 'neutral'" variant="soft" size="lg">{{ reunion.estado }}</UBadge>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <p v-if="reunion.estado !== 'instalada'" class="text-sm text-muted">
        La reunión debe estar instalada para abrir votaciones.
      </p>

      <template v-else>
        <!-- Quórum en vivo -->
        <section class="rounded-lg border border-default p-4 space-y-2">
          <div class="flex items-center justify-between">
            <p class="font-medium">Quórum en este momento</p>
            <UButton size="xs" variant="ghost" icon="i-lucide-refresh-cw" @click="refrescarQuorum()">Actualizar</UButton>
          </div>
          <div v-if="votacionesStore.quorum" class="grid gap-3 sm:grid-cols-3">
            <div>
              <p class="text-xs text-muted uppercase">Coeficiente presente</p>
              <p class="text-lg font-semibold">
                {{ votacionesStore.quorum.coeficiente_presente }} / {{ votacionesStore.quorum.coeficiente_total }}
                ({{ Number(votacionesStore.quorum.pct_presente).toFixed(1) }}%)
              </p>
            </div>
            <div>
              <p class="text-xs text-muted uppercase">Personas presentes</p>
              <p class="text-lg font-semibold">{{ votacionesStore.quorum.propietarios_presentes }}</p>
            </div>
            <div>
              <p class="text-xs text-muted uppercase">Quórum deliberatorio</p>
              <UBadge :color="votacionesStore.quorum.quorum_deliberatorio ? 'success' : 'error'" variant="soft">
                {{ votacionesStore.quorum.quorum_deliberatorio ? 'sí' : 'no' }}
              </UBadge>
            </div>
          </div>
          <UAlert
            v-if="votacionesStore.quorum && !votacionesStore.quorum.hay_pluralidad"
            color="warning" variant="soft"
            title="Sin pluralidad de propietarios: aunque haya coeficientes suficientes, no hay quórum si es una sola persona presente (art. 45)."
          />
        </section>

        <!-- Materias y mayorías configuradas -->
        <section class="rounded-lg border border-default p-4 space-y-2">
          <p class="font-medium">Materias y mayorías configuradas</p>
          <ul class="space-y-1 text-sm">
            <li v-for="m in votacionesStore.materias" :key="m.id" class="flex items-center justify-between gap-2">
              <span>
                {{ m.nombre }}<span v-if="m.numeral_articulo" class="text-muted"> (art. {{ m.numeral_articulo }})</span>
                · {{ mayoriaTipoEtiqueta[m.mayoria_tipo] }}
              </span>
              <span class="flex items-center gap-2">
                <UBadge v-if="reglaDe(m.id)" color="primary" variant="soft" size="xs">
                  {{ reglaDe(m.id)!.mayoria_pct }}% mayoría · {{ reglaDe(m.id)!.quorum_minimo_pct }}% quórum
                </UBadge>
                <UBadge v-else color="neutral" variant="soft" size="xs">sin configurar (aplica piso legal)</UBadge>
                <UButton size="xs" variant="ghost" @click="abrirRegla(m.id)">Configurar</UButton>
              </span>
            </li>
          </ul>
        </section>

        <!-- Votaciones de esta reunión -->
        <section class="rounded-lg border border-default p-4 space-y-2">
          <div class="flex items-center justify-between">
            <p class="font-medium">Votaciones</p>
            <UButton size="xs" variant="ghost" icon="i-lucide-plus" @click="abrirDrawerVotacion()">Abrir votación</UButton>
          </div>
          <ul class="space-y-1 text-sm">
            <li
              v-for="v in votacionesStore.votaciones" :key="v.id"
              class="flex items-center justify-between gap-2 rounded p-1 cursor-pointer"
              :class="{ 'bg-elevated': votacionSeleccionadaId === v.id }"
              @click="seleccionarVotacion(v.id)"
            >
              <span>{{ v.pregunta }} · {{ v.materia?.nombre }}</span>
              <span class="flex items-center gap-1">
                <UBadge v-if="v.resultado" :color="resultadoColor[v.resultado]" variant="soft" size="xs">{{ v.resultado }}</UBadge>
                <UBadge :color="estadoVotacionColor[v.estado] ?? 'neutral'" variant="soft" size="xs">{{ v.estado }}</UBadge>
              </span>
            </li>
          </ul>
          <p v-if="votacionesStore.votaciones.length === 0" class="text-sm text-muted">Sin votaciones todavía.</p>
        </section>

        <!-- Detalle de la votación seleccionada -->
        <section v-if="votacionSeleccionada" class="rounded-lg border border-default p-4 space-y-3">
          <p class="font-medium">{{ votacionSeleccionada.pregunta }}</p>

          <template v-if="votacionSeleccionada.estado === 'abierta'">
            <div class="grid gap-3 sm:grid-cols-3 text-sm">
              <div><p class="text-xs text-muted uppercase">A favor</p><p class="font-semibold">{{ coeficienteAcumulado.favor }}</p></div>
              <div><p class="text-xs text-muted uppercase">En contra</p><p class="font-semibold">{{ coeficienteAcumulado.contra }}</p></div>
              <div><p class="text-xs text-muted uppercase">Abstención</p><p class="font-semibold">{{ coeficienteAcumulado.abstencion }}</p></div>
            </div>
            <div class="grid gap-2 sm:grid-cols-4 items-end">
              <UFormField label="Asistente" class="sm:col-span-2">
                <UiSelectorBuscable v-model="asistenciaSeleccionada" :opciones="opcionesAsistente" placeholder="Asistente presente" />
              </UFormField>
              <UButton color="success" :loading="votacionesStore.guardando" :disabled="!asistenciaSeleccionada" @click="emitirVoto('favor')">
                A favor
              </UButton>
              <div class="flex gap-2">
                <UButton
                  color="error" variant="soft" :loading="votacionesStore.guardando" :disabled="!asistenciaSeleccionada"
                  @click="emitirVoto('contra')"
                >
                  En contra
                </UButton>
                <UButton
                  color="neutral" variant="soft" :loading="votacionesStore.guardando" :disabled="!asistenciaSeleccionada"
                  @click="emitirVoto('abstencion')"
                >
                  Abstención
                </UButton>
              </div>
            </div>
            <ul class="text-sm space-y-1">
              <li v-for="voto in votacionesStore.votos" :key="voto.id">
                {{ voto.asistencia?.inmueble?.codigo ?? 'órgano' }} · {{ voto.asistencia?.asistente?.nombre_completo }}
                · {{ voto.sentido }} · {{ voto.coeficiente }}
              </li>
            </ul>
            <div class="flex items-center justify-between gap-2 pt-2 border-t border-default">
              <UButton :loading="votacionesStore.guardando" @click="cerrar()">Cerrar votación</UButton>
              <div class="flex items-end gap-2">
                <UFormField label="Motivo de anulación">
                  <UInput v-model="motivoAnulacion" size="sm" />
                </UFormField>
                <UButton variant="ghost" color="error" :disabled="!motivoAnulacion.trim()" @click="anular()">Anular</UButton>
              </div>
            </div>
          </template>

          <template v-else-if="votacionSeleccionada.estado === 'cerrada'">
            <UBadge :color="resultadoColor[votacionSeleccionada.resultado ?? '']" variant="soft" size="lg">
              {{ votacionSeleccionada.resultado }}
            </UBadge>
            <div class="grid gap-3 sm:grid-cols-3 text-sm">
              <div><p class="text-xs text-muted uppercase">Total</p><p class="font-semibold">{{ votacionSeleccionada.coeficiente_total }}</p></div>
              <div><p class="text-xs text-muted uppercase">Representado</p><p class="font-semibold">{{ votacionSeleccionada.coeficiente_representado }}</p></div>
              <div><p class="text-xs text-muted uppercase">A favor</p><p class="font-semibold">{{ votacionSeleccionada.coeficiente_favor }}</p></div>
              <div><p class="text-xs text-muted uppercase">En contra</p><p class="font-semibold">{{ votacionSeleccionada.coeficiente_contra }}</p></div>
              <div><p class="text-xs text-muted uppercase">Abstención</p><p class="font-semibold">{{ votacionSeleccionada.coeficiente_abstencion }}</p></div>
            </div>
            <p v-if="reglaAplicada(votacionSeleccionada)" class="text-xs text-muted">
              Regla aplicada: {{ reglaAplicada(votacionSeleccionada)!.mayoria_pct }}% de mayoría
              {{ baseCalculoEtiqueta[reglaAplicada(votacionSeleccionada)!.base_calculo as string] }}
              (quórum mínimo {{ reglaAplicada(votacionSeleccionada)!.quorum_minimo_pct }}%)
              <span v-if="reglaAplicada(votacionSeleccionada)!.reglamento_referencia">
                — {{ reglaAplicada(votacionSeleccionada)!.reglamento_referencia }}
              </span>
            </p>
          </template>

          <p v-else class="text-sm text-muted">Anulada: {{ votacionSeleccionada.anulada_motivo }}</p>
        </section>
      </template>
    </div>
    <p v-else-if="!reunionesStore.loading" class="text-sm text-muted">Reunión no encontrada.</p>

    <UiDrawer :abierto="drawerReglaAbierto" titulo="Configurar mayoría" @cerrar="drawerReglaAbierto = false">
      <div class="space-y-3">
        <p class="text-sm text-muted">
          El piso y el techo legal los fija automáticamente el tipo de mayoría de la materia — solo
          se puede ajustar dentro de ese rango.
        </p>
        <UFormField label="% de mayoría exigida" name="mayoriaPct">
          <UInput v-model.number="formRegla.mayoriaPct" type="number" class="w-full" />
        </UFormField>
        <UFormField label="% de quórum mínimo" name="quorumMinimoPct">
          <UInput v-model.number="formRegla.quorumMinimoPct" type="number" class="w-full" />
        </UFormField>
        <UFormField label="Referencia en el reglamento (opcional)" name="reglamentoReferencia">
          <UInput v-model="formRegla.reglamentoReferencia" class="w-full" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerReglaAbierto = false">Cancelar</UButton>
          <UButton :loading="votacionesStore.guardando" @click="guardarRegla()">Guardar</UButton>
        </div>
      </template>
    </UiDrawer>

    <UiDrawer :abierto="drawerVotacionAbierto" titulo="Abrir votación" @cerrar="drawerVotacionAbierto = false">
      <div class="space-y-3">
        <UFormField label="Materia" name="materia">
          <UiSelectorBuscable v-model="formVotacion.materiaId" :opciones="opcionesMateria" placeholder="Materia a decidir" />
        </UFormField>
        <div v-if="materiaSeleccionada" class="rounded border border-default p-2 text-xs text-muted space-y-1">
          <p>Mayoría: {{ mayoriaTipoEtiqueta[materiaSeleccionada.mayoria_tipo] }}</p>
          <p>Se calcula {{ baseCalculoEtiqueta[materiaSeleccionada.base_calculo] }}.</p>
          <p v-if="!materiaSeleccionada.admite_no_presencial">No admite reunión no presencial (prohibición absoluta).</p>
          <p v-if="!materiaSeleccionada.admite_segunda_convocatoria">No admite segunda convocatoria.</p>
        </div>
        <UFormField label="Pregunta" name="pregunta">
          <UTextarea v-model="formVotacion.pregunta" class="w-full" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerVotacionAbierto = false">Cancelar</UButton>
          <UButton
            :loading="votacionesStore.guardando" :disabled="!formVotacion.materiaId || !formVotacion.pregunta.trim()"
            @click="guardarVotacion()"
          >
            Abrir
          </UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
