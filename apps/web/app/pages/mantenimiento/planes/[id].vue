<script setup lang="ts">
// MANT-3 §3.5: editor de plan — datos generales, alcance (con previsualización de cobertura
// antes de guardar), tareas ordenadas, activación y el calendario propio de este plan.
// `route.params.id === 'nuevo'` es creación; cualquier otro valor es edición.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type PlanRow = Database['public']['Tables']['mant_planes']['Row']
type PlanInsert = Database['public']['Tables']['mant_planes']['Insert']
type Alcance = Database['public']['Enums']['plan_alcance_t']
type FrecuenciaOrigen = Database['public']['Enums']['plan_frecuencia_origen_t']

const route = useRoute()
const router = useRouter()
const tenantStore = useTenantStore()
const planesStore = useMantenimientoPlanesStore()
const configStore = useMantenimientoConfiguracionStore()
const activosStore = useActivosStore()
const agrupacionesStore = useAgrupacionesStore()
const zonasComunesStore = useZonasComunesStore()

const planId = route.params.id as string
const esNuevo = computed(() => planId === 'nuevo')

const tiposMantenimiento = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const tiposActivo = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const categoriasActivo = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])

const form = reactive({
  codigo: '',
  nombre: '',
  descripcion: '',
  tipoMantenimientoId: undefined as number | undefined,
  requisitoId: undefined as string | undefined,
  alcance: 'categoria' as Alcance,
  alcanceActivoId: null as string | null,
  alcanceTipoActivoId: undefined as number | undefined,
  alcanceCategoriaId: undefined as number | undefined,
  ubicacionModo: 'agrupacion' as 'agrupacion' | 'zona_comun',
  alcanceAgrupacionId: null as string | null,
  alcanceZonaComunId: null as string | null,
  frecuenciaMeses: 6,
  frecuenciaOrigen: 'propia' as FrecuenciaOrigen,
  ventanaDias: 15,
  horizonteMeses: 6,
  encadenarDesdeEjecucionReal: true,
  requiereParadaServicio: false,
  duracionEstimadaMin: undefined as number | undefined,
  vigenteDesde: new Date().toISOString().slice(0, 10),
  vigenteHasta: '',
})

function sincronizarForm(p: PlanRow): void {
  form.codigo = p.codigo
  form.nombre = p.nombre
  form.descripcion = p.descripcion ?? ''
  form.tipoMantenimientoId = p.tipo_mantenimiento_id
  form.requisitoId = p.requisito_id ?? undefined
  form.alcance = p.alcance
  form.alcanceActivoId = p.alcance_activo_id
  form.alcanceTipoActivoId = p.alcance_tipo_activo_id ?? undefined
  form.alcanceCategoriaId = p.alcance_categoria_id ?? undefined
  form.alcanceAgrupacionId = p.alcance_agrupacion_id
  form.alcanceZonaComunId = p.alcance_zona_comun_id
  form.ubicacionModo = p.alcance_zona_comun_id ? 'zona_comun' : 'agrupacion'
  form.frecuenciaMeses = p.frecuencia_meses
  form.frecuenciaOrigen = p.frecuencia_origen
  form.ventanaDias = p.ventana_dias
  form.horizonteMeses = p.horizonte_meses
  form.encadenarDesdeEjecucionReal = p.encadenar_desde_ejecucion_real
  form.requiereParadaServicio = p.requiere_parada_servicio
  form.duracionEstimadaMin = p.duracion_estimada_min ?? undefined
  form.vigenteDesde = p.vigente_desde
  form.vigenteHasta = p.vigente_hasta ?? ''
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    tiposMantenimiento.value.length === 0
      ? cargarListaTipos(tenantId, 'TIPO_MANTENIMIENTO').then((d) => { tiposMantenimiento.value = d })
      : Promise.resolve(),
    tiposActivo.value.length === 0
      ? cargarListaTipos(tenantId, 'TIPO_ACTIVO').then((d) => { tiposActivo.value = d })
      : Promise.resolve(),
    categoriasActivo.value.length === 0
      ? cargarListaTipos(tenantId, 'CATEGORIA_ACTIVO').then((d) => { categoriasActivo.value = d })
      : Promise.resolve(),
    configStore.cargarRequisitos(tenantId),
    activosStore.cargarActivos(tenantId),
    agrupacionesStore.cargarAgrupaciones(tenantId),
    zonasComunesStore.cargarZonasComunes(tenantId),
    esNuevo.value ? Promise.resolve() : planesStore.cargarPlan(tenantId, planId),
  ])
  if (!esNuevo.value && planesStore.planActual) sincronizarForm(planesStore.planActual)
}
onMounted(cargar)
onBeforeUnmount(() => planesStore.limpiarPlanActual())

const opcionesActivo = computed(() =>
  activosStore.activos.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} — ${a.nombre}` })),
)
const opcionesAgrupacion = computed(() =>
  agrupacionesStore.arbolPlano.map((a) => ({ valor: a.id, etiqueta: a.ruta })),
)
const opcionesZonaComun = computed(() =>
  zonasComunesStore.zonasComunes.map((z) => ({ valor: z.id, etiqueta: `${z.codigo} — ${z.nombre}` })),
)

function payload(tenantId: string): PlanInsert {
  return {
    tenant_id: tenantId,
    codigo: form.codigo.trim(),
    nombre: form.nombre.trim(),
    descripcion: form.descripcion.trim() || null,
    tipo_mantenimiento_id: form.tipoMantenimientoId!,
    requisito_id: form.requisitoId ?? null,
    alcance: form.alcance,
    alcance_activo_id: form.alcance === 'activo' ? form.alcanceActivoId : null,
    alcance_tipo_activo_id: form.alcance === 'tipo_activo' ? (form.alcanceTipoActivoId ?? null) : null,
    alcance_categoria_id: form.alcance === 'categoria' ? (form.alcanceCategoriaId ?? null) : null,
    alcance_agrupacion_id:
      form.alcance === 'ubicacion' && form.ubicacionModo === 'agrupacion' ? form.alcanceAgrupacionId : null,
    alcance_zona_comun_id:
      form.alcance === 'ubicacion' && form.ubicacionModo === 'zona_comun' ? form.alcanceZonaComunId : null,
    frecuencia_meses: form.frecuenciaMeses,
    frecuencia_origen: form.frecuenciaOrigen,
    ventana_dias: form.ventanaDias,
    horizonte_meses: form.horizonteMeses,
    encadenar_desde_ejecucion_real: form.encadenarDesdeEjecucionReal,
    requiere_parada_servicio: form.requiereParadaServicio,
    duracion_estimada_min: form.duracionEstimadaMin ?? null,
    vigente_desde: form.vigenteDesde,
    vigente_hasta: form.vigenteHasta || null,
  }
}

const errorGuardar = ref<string | null>(null)
const guardadoOk = ref(false)

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorGuardar.value = null
  guardadoOk.value = false
  try {
    if (esNuevo.value) {
      const nuevo = await planesStore.crearPlan(payload(tenantId))
      await router.replace(`/mantenimiento/planes/${nuevo.id}`)
    } else {
      await planesStore.actualizarPlan(planId, payload(tenantId))
      guardadoOk.value = true
    }
  } catch (e) {
    errorGuardar.value = e instanceof Error ? e.message : 'No se pudo guardar'
  }
}

const previsualizacion = ref<number | null>(null)
const previsualizando = ref(false)

async function previsualizar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  previsualizando.value = true
  try {
    previsualizacion.value = await planesStore.previsualizarAlcance({
      p_tenant_id: tenantId,
      p_alcance: form.alcance,
      p_activo_id: form.alcance === 'activo' ? (form.alcanceActivoId ?? undefined) : undefined,
      p_tipo_activo_id: form.alcance === 'tipo_activo' ? form.alcanceTipoActivoId : undefined,
      p_categoria_id: form.alcance === 'categoria' ? form.alcanceCategoriaId : undefined,
      p_agrupacion_id:
        form.alcance === 'ubicacion' && form.ubicacionModo === 'agrupacion'
          ? (form.alcanceAgrupacionId ?? undefined) : undefined,
      p_zona_comun_id:
        form.alcance === 'ubicacion' && form.ubicacionModo === 'zona_comun'
          ? (form.alcanceZonaComunId ?? undefined) : undefined,
    })
  } finally {
    previsualizando.value = false
  }
}

// ── Tareas (solo con el plan ya creado: necesitan plan_id) ──
const nuevaTarea = reactive({
  descripcion: '', duracionEstimadaMin: undefined as number | undefined,
  requiereMedicion: false, requiereEvidenciaFoto: false,
})

async function agregarTarea(): Promise<void> {
  const plan = planesStore.planActual
  if (!plan || !nuevaTarea.descripcion.trim()) return
  const orden = (planesStore.tareas.at(-1)?.orden ?? 0) + 1
  await planesStore.agregarTarea({
    tenant_id: plan.tenant_id, plan_id: plan.id, orden,
    descripcion: nuevaTarea.descripcion.trim(),
    duracion_estimada_min: nuevaTarea.duracionEstimadaMin ?? null,
    requiere_medicion: nuevaTarea.requiereMedicion,
    requiere_evidencia_foto: nuevaTarea.requiereEvidenciaFoto,
  })
  nuevaTarea.descripcion = ''
  nuevaTarea.duracionEstimadaMin = undefined
  nuevaTarea.requiereMedicion = false
  nuevaTarea.requiereEvidenciaFoto = false
}

async function quitarTarea(id: string): Promise<void> {
  const plan = planesStore.planActual
  if (!plan) return
  await planesStore.eliminarTarea(id, plan.id)
}

// ── Activación y generación ──
const errorActivar = ref<string | null>(null)

async function activar(): Promise<void> {
  const plan = planesStore.planActual
  if (!plan) return
  errorActivar.value = null
  try {
    await planesStore.activarPlan(plan.id)
  } catch (e) {
    errorActivar.value = e instanceof Error ? e.message : 'No se pudo activar'
  }
}

async function generarAhora(): Promise<void> {
  const plan = planesStore.planActual
  if (!plan) return
  await planesStore.generarProgramaciones(plan.id)
}

const motivoOmision = reactive<Record<string, string>>({})

async function omitir(progId: string): Promise<void> {
  const plan = planesStore.planActual
  if (!plan || !motivoOmision[progId]?.trim()) return
  await planesStore.omitirProgramacion(progId, motivoOmision[progId]!.trim(), plan.id)
  motivoOmision[progId] = ''
}

async function cancelar(progId: string): Promise<void> {
  const plan = planesStore.planActual
  if (!plan) return
  await planesStore.cancelarProgramacion(progId, plan.id)
}

const ESTADO_PROG_COLOR: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  pendiente: 'neutral', generada: 'success', omitida: 'warning', cancelada: 'error',
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">{{ esNuevo ? 'Nuevo plan de mantenimiento' : (planesStore.planActual?.nombre ?? 'Plan') }}</h1>
        </template>
        <template #descripcion>
          <span v-if="!esNuevo && planesStore.planActual">
            {{ planesStore.planActual.activo ? 'Activo' : 'Borrador' }} ·
            {{ planesStore.planActual.frecuencia_origen === 'heredada_requisito' ? 'Frecuencia heredada de un requisito legal' : 'Frecuencia propia' }}
          </span>
          <span v-else>Se activa una vez tenga al menos una tarea.</span>
        </template>
      </UiTituloDescripcion>
      <UButton variant="ghost" icon="i-lucide-arrow-left" to="/mantenimiento/planes">Volver al listado</UButton>
    </div>

    <!-- Datos generales -->
    <section class="space-y-4 rounded-lg border border-default p-4">
      <h2 class="font-medium">Datos generales</h2>
      <div class="grid sm:grid-cols-2 gap-4">
        <UFormField label="Código" name="codigo"><UInput v-model="form.codigo" class="w-full" /></UFormField>
        <UFormField label="Nombre" name="nombre"><UInput v-model="form.nombre" class="w-full" /></UFormField>
        <UFormField label="Tipo de mantenimiento" name="tipo">
          <USelect
            v-model="form.tipoMantenimientoId"
            :items="tiposMantenimiento.map((t) => ({ label: t.nombre, value: t.id }))"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Requisito que lo motiva (opcional)" name="requisito">
          <USelect
            v-model="form.requisitoId"
            :items="[{ label: 'Ninguno — plan propio', value: undefined }, ...configStore.requisitos.map((r) => ({ label: r.nombre, value: r.id }))]"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Descripción" name="descripcion" class="sm:col-span-2">
          <UTextarea v-model="form.descripcion" class="w-full" />
        </UFormField>
      </div>
    </section>

    <!-- Frecuencia y programación -->
    <section class="space-y-4 rounded-lg border border-default p-4">
      <h2 class="font-medium">Frecuencia y programación</h2>
      <UAlert
        v-if="form.requisitoId"
        color="primary" variant="soft"
        title="La frecuencia no puede ser menos exigente que la del requisito seleccionado."
        description="Puedes programar más seguido de lo que exige la norma; nunca menos."
      />
      <div class="grid sm:grid-cols-3 gap-4">
        <UFormField label="Origen de la frecuencia" name="frecuenciaOrigen">
          <USelect
            v-model="form.frecuenciaOrigen"
            :items="[{ label: 'Heredada del requisito', value: 'heredada_requisito' }, { label: 'Propia', value: 'propia' }]"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Frecuencia (meses)" name="frecuenciaMeses">
          <UInput v-model.number="form.frecuenciaMeses" type="number" min="1" class="w-full" />
        </UFormField>
        <UFormField label="Ventana de ejecución (días)" name="ventanaDias">
          <UInput v-model.number="form.ventanaDias" type="number" min="0" class="w-full" />
        </UFormField>
        <UFormField label="Horizonte de generación (meses)" name="horizonteMeses">
          <UInput v-model.number="form.horizonteMeses" type="number" min="1" class="w-full" />
        </UFormField>
        <UFormField label="Duración estimada (min)" name="duracion">
          <UInput v-model.number="form.duracionEstimadaMin" type="number" min="0" class="w-full" />
        </UFormField>
        <UFormField label="Vigente desde" name="vigenteDesde">
          <UInput v-model="form.vigenteDesde" type="date" class="w-full" />
        </UFormField>
      </div>
      <div class="flex items-center gap-6">
        <label class="flex items-center gap-2 text-sm">
          <UCheckbox v-model="form.requiereParadaServicio" />
          Requiere parada de servicio
        </label>
        <label class="flex items-center gap-2 text-sm">
          <UCheckbox v-model="form.encadenarDesdeEjecucionReal" />
          Encadenar la siguiente desde la ejecución real (recomendado)
        </label>
      </div>
    </section>

    <!-- Alcance -->
    <section class="space-y-4 rounded-lg border border-default p-4">
      <h2 class="font-medium">Alcance — a qué activos aplica</h2>
      <USelect
        v-model="form.alcance"
        :items="[
          { label: 'Un activo específico', value: 'activo' },
          { label: 'Un tipo de activo', value: 'tipo_activo' },
          { label: 'Una categoría de activo', value: 'categoria' },
          { label: 'Una ubicación', value: 'ubicacion' },
        ]"
        class="w-64"
      />
      <UiSelectorBuscable v-if="form.alcance === 'activo'" v-model="form.alcanceActivoId" :opciones="opcionesActivo" placeholder="Selecciona el activo" />
      <USelect
        v-else-if="form.alcance === 'tipo_activo'" v-model="form.alcanceTipoActivoId"
        :items="tiposActivo.map((t) => ({ label: t.nombre, value: t.id }))"
        class="w-full"
      />
      <USelect
        v-else-if="form.alcance === 'categoria'" v-model="form.alcanceCategoriaId"
        :items="categoriasActivo.map((c) => ({ label: c.nombre, value: c.id }))"
        class="w-full"
      />
      <template v-else-if="form.alcance === 'ubicacion'">
        <USelect
          v-model="form.ubicacionModo"
          :items="[{ label: 'Agrupación (torre, piso, etapa)', value: 'agrupacion' }, { label: 'Zona común', value: 'zona_comun' }]"
          class="w-64"
        />
        <UiSelectorBuscable v-if="form.ubicacionModo === 'agrupacion'" v-model="form.alcanceAgrupacionId" :opciones="opcionesAgrupacion" placeholder="Selecciona la agrupación" />
        <UiSelectorBuscable v-else v-model="form.alcanceZonaComunId" :opciones="opcionesZonaComun" placeholder="Selecciona la zona común" />
      </template>

      <div class="flex items-center gap-3">
        <UButton variant="soft" :loading="previsualizando" @click="previsualizar()">Ver cuántos activos cubre</UButton>
        <p v-if="previsualizacion !== null" class="text-sm text-muted">
          Cubriría <strong>{{ previsualizacion }}</strong> activo{{ previsualizacion === 1 ? '' : 's' }}.
        </p>
      </div>
    </section>

    <UAlert v-if="errorGuardar" color="error" variant="soft" :title="errorGuardar" />
    <UAlert v-if="guardadoOk" color="success" variant="soft" title="Plan guardado" />
    <UButton :loading="planesStore.guardando" @click="guardar()">
      {{ esNuevo ? 'Crear plan' : 'Guardar cambios' }}
    </UButton>

    <template v-if="!esNuevo && planesStore.planActual">
      <!-- Tareas -->
      <section class="space-y-4 rounded-lg border border-default p-4">
        <h2 class="font-medium">Tareas</h2>
        <div class="divide-y divide-default">
          <div v-for="t in planesStore.tareas" :key="t.id" class="flex items-center justify-between gap-4 py-2">
            <div>
              <p class="text-sm font-medium">{{ t.orden }}. {{ t.descripcion }}</p>
              <p class="text-xs text-muted">
                <span v-if="t.duracion_estimada_min">{{ t.duracion_estimada_min }} min · </span>
                <span v-if="t.requiere_medicion">Requiere medición · </span>
                <span v-if="t.requiere_evidencia_foto">Requiere evidencia fotográfica</span>
              </p>
            </div>
            <UButton variant="ghost" color="error" icon="i-lucide-trash-2" size="sm" @click="quitarTarea(t.id)" />
          </div>
          <p v-if="planesStore.tareas.length === 0" class="py-4 text-sm text-muted text-center">
            Sin tareas todavía — el plan no se puede activar sin al menos una.
          </p>
        </div>
        <div class="flex items-end gap-3 flex-wrap">
          <UFormField label="Nueva tarea" class="flex-1 min-w-64">
            <UInput v-model="nuevaTarea.descripcion" class="w-full" placeholder="ej. Revisar carga y sello" />
          </UFormField>
          <UFormField label="Duración (min)"><UInput v-model.number="nuevaTarea.duracionEstimadaMin" type="number" class="w-28" /></UFormField>
          <label class="flex items-center gap-2 text-sm"><UCheckbox v-model="nuevaTarea.requiereMedicion" />Medición</label>
          <label class="flex items-center gap-2 text-sm"><UCheckbox v-model="nuevaTarea.requiereEvidenciaFoto" />Evidencia foto</label>
          <UButton :loading="planesStore.guardando" @click="agregarTarea()">Agregar</UButton>
        </div>
      </section>

      <!-- Activación -->
      <section class="space-y-3 rounded-lg border border-default p-4">
        <h2 class="font-medium">Activación</h2>
        <UAlert v-if="errorActivar" color="error" variant="soft" :title="errorActivar" />
        <div class="flex items-center gap-3">
          <UButton v-if="!planesStore.planActual.activo" :loading="planesStore.guardando" @click="activar()">
            Activar plan
          </UButton>
          <template v-else>
            <UBadge color="success" variant="soft">Activo</UBadge>
            <UButton variant="soft" :loading="planesStore.guardando" @click="generarAhora()">Generar programaciones ahora</UButton>
          </template>
        </div>
      </section>

      <!-- Calendario del plan -->
      <section v-if="planesStore.planActual.activo" class="space-y-3 rounded-lg border border-default p-4">
        <h2 class="font-medium">Programaciones de este plan</h2>
        <div class="divide-y divide-default">
          <div v-for="prog in planesStore.programaciones" :key="prog.id" class="flex items-center justify-between gap-4 py-2 flex-wrap">
            <div>
              <p class="text-sm font-medium">{{ prog.activos?.codigo ?? '—' }}</p>
              <p class="text-xs text-muted">
                Programada {{ prog.fecha_programada }} · ventana hasta {{ prog.ventana_hasta }}
                <span v-if="prog.omitida_motivo"> — {{ prog.omitida_motivo }}</span>
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UBadge :color="ESTADO_PROG_COLOR[prog.estado] ?? 'neutral'" variant="soft" class="capitalize">{{ prog.estado }}</UBadge>
              <template v-if="prog.estado === 'pendiente'">
                <UInput v-model="motivoOmision[prog.id]" placeholder="Motivo de omisión" size="sm" class="w-40" />
                <UButton size="sm" variant="ghost" @click="omitir(prog.id)">Omitir</UButton>
                <UButton size="sm" variant="ghost" color="error" @click="cancelar(prog.id)">Cancelar</UButton>
              </template>
            </div>
          </div>
          <p v-if="planesStore.programaciones.length === 0" class="py-6 text-sm text-muted text-center">
            Sin programaciones generadas todavía.
          </p>
        </div>
      </section>
    </template>
  </div>
</template>
