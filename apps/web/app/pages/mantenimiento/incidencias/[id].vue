<script setup lang="ts">
// MANT-4 §3.1/§3.2/§3.6: ficha de incidencia — evaluación, prioridad (sugerida vs. sobrescrita),
// bitácora append-only y conversión a OT. La máquina de estados vive en guard_mant_incidencia;
// esta pantalla solo ofrece los botones que la BD permitiría en cada estado.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const route = useRoute()
const router = useRouter()
const incidenciaId = route.params.id as string

const tenantStore = useTenantStore()
const incidenciasStore = useMantenimientoIncidenciasStore()
const tercerosStore = useTercerosStore()
const membersStore = useMembersStore()

const tiposMantenimiento = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const prioridades = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const terceros = ref<Awaited<ReturnType<typeof tercerosStore.cargarTerceros>>>([])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    incidenciasStore.cargarIncidencia(tenantId, incidenciaId),
    membersStore.cargarMiembros(tenantId),
    tiposMantenimiento.value.length === 0
      ? cargarListaTipos(tenantId, 'TIPO_MANTENIMIENTO').then((d) => { tiposMantenimiento.value = d })
      : Promise.resolve(),
    prioridades.value.length === 0
      ? cargarListaTipos(tenantId, 'PRIORIDAD').then((d) => { prioridades.value = d })
      : Promise.resolve(),
    terceros.value.length === 0
      ? tercerosStore.cargarTerceros(tenantId).then((t) => { terceros.value = t })
      : Promise.resolve(),
  ])
}
onMounted(cargar)
onBeforeUnmount(() => incidenciasStore.limpiarActual())

const inc = computed(() => incidenciasStore.incidenciaActual)

const nombrePrioridad = computed(() => new Map(prioridades.value.map((p) => [p.id, p.nombre])))

const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'primary'> = {
  reportada: 'neutral', en_evaluacion: 'warning', convertida: 'primary', resuelta: 'success', descartada: 'error',
}

const errorAccion = ref<string | null>(null)

async function marcarEnEvaluacion(): Promise<void> {
  if (!inc.value) return
  errorAccion.value = null
  try {
    await incidenciasStore.actualizarIncidencia(inc.value.id, { estado: 'en_evaluacion' })
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo cambiar el estado.')
  }
}

async function marcarResuelta(): Promise<void> {
  if (!inc.value) return
  errorAccion.value = null
  try {
    await incidenciasStore.actualizarIncidencia(inc.value.id, { estado: 'resuelta' })
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo marcar como resuelta.')
  }
}

// ── Descartar (exige motivo) ──
const drawerDescarte = ref(false)
const motivoDescarte = ref('')
async function descartar(): Promise<void> {
  if (!inc.value || !motivoDescarte.value.trim()) return
  errorAccion.value = null
  try {
    await incidenciasStore.actualizarIncidencia(inc.value.id, {
      estado: 'descartada', descartada_motivo: motivoDescarte.value.trim(),
    })
    drawerDescarte.value = false
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo descartar la incidencia.')
  }
}

// ── Sobrescribir prioridad (exige motivo si difiere de la sugerida) ──
const prioridadEditando = ref<number | undefined>(undefined)
const motivoSobrescritura = ref('')
watch(inc, (nueva) => { prioridadEditando.value = nueva?.prioridad_id ?? undefined }, { immediate: true })
const prioridadDifiereDeSugerida = computed(() =>
  inc.value?.prioridad_sugerida_id != null
  && prioridadEditando.value !== inc.value.prioridad_sugerida_id,
)
async function guardarPrioridad(): Promise<void> {
  if (!inc.value) return
  errorAccion.value = null
  try {
    await incidenciasStore.actualizarIncidencia(inc.value.id, {
      prioridad_id: prioridadEditando.value ?? null,
      prioridad_sobrescrita_motivo: prioridadDifiereDeSugerida.value ? motivoSobrescritura.value.trim() : null,
    })
    motivoSobrescritura.value = ''
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo actualizar la prioridad.')
  }
}

// ── Nota manual ──
const notaTexto = ref('')
async function agregarNota(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !inc.value || !notaTexto.value.trim()) return
  await incidenciasStore.agregarNota(tenantId, inc.value.id, notaTexto.value.trim())
  notaTexto.value = ''
}

// ── Convertir a OT ──
const drawerConvertir = ref(false)
const formConvertir = reactive({
  tipoMantenimientoId: undefined as number | undefined,
  titulo: '',
  asignadoTerceroId: undefined as string | undefined,
  asignadoUsuarioId: undefined as string | undefined,
})
function abrirConvertir(): void {
  formConvertir.tipoMantenimientoId = undefined
  formConvertir.titulo = inc.value?.titulo ?? ''
  formConvertir.asignadoTerceroId = undefined
  formConvertir.asignadoUsuarioId = undefined
  errorAccion.value = null
  drawerConvertir.value = true
}
async function convertir(): Promise<void> {
  if (!inc.value || !formConvertir.tipoMantenimientoId) return
  errorAccion.value = null
  try {
    const otId = await incidenciasStore.convertirAOt({
      incidenciaId: inc.value.id,
      tipoMantenimientoId: formConvertir.tipoMantenimientoId,
      titulo: formConvertir.titulo.trim() || undefined,
      asignadoTerceroId: formConvertir.asignadoTerceroId,
      asignadoUsuarioId: formConvertir.asignadoUsuarioId,
    })
    drawerConvertir.value = false
    await router.push(`/mantenimiento/ordenes-trabajo/${otId}`)
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo convertir la incidencia en OT.')
  }
}
</script>

<template>
  <div v-if="inc" class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <UButton variant="link" icon="i-lucide-arrow-left" to="/mantenimiento/incidencias" class="px-0 mb-1">
          Incidencias
        </UButton>
        <h1 class="text-xl font-semibold">{{ inc.anio }}-{{ inc.numero }} · {{ inc.titulo }}</h1>
      </div>
      <UBadge :color="ESTADO_COLOR[inc.estado] ?? 'neutral'" variant="soft" size="lg" class="capitalize">
        {{ inc.estado.replace('_', ' ') }}
      </UBadge>
    </div>

    <UAlert v-if="errorAccion" color="error" variant="soft" :title="errorAccion" />

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6">
        <section class="rounded-lg border border-default p-4 space-y-3">
          <p class="text-sm text-muted whitespace-pre-line">{{ inc.descripcion || 'Sin descripción.' }}</p>
          <div class="grid grid-cols-2 gap-3 text-sm pt-2 border-t border-default">
            <div>
              <p class="text-muted">Reportante</p>
              <p>{{ inc.reportante_ref || '—' }}</p>
            </div>
            <div>
              <p class="text-muted">Contacto</p>
              <p>{{ inc.reportante_contacto || '—' }}</p>
            </div>
            <div>
              <p class="text-muted">Reportada</p>
              <p>{{ new Date(inc.reportada_at).toLocaleString() }}</p>
            </div>
            <div v-if="inc.orden_trabajo_id">
              <p class="text-muted">Orden de trabajo</p>
              <NuxtLink :to="`/mantenimiento/ordenes-trabajo/${inc.orden_trabajo_id}`" class="text-primary underline">
                Ver OT
              </NuxtLink>
            </div>
          </div>
        </section>

        <section class="rounded-lg border border-default p-4 space-y-3">
          <h2 class="font-medium">Prioridad</h2>
          <p v-if="inc.prioridad_sugerida_id" class="text-sm text-muted">
            Sugerida por criticidad del activo: <strong>{{ nombrePrioridad.get(inc.prioridad_sugerida_id) }}</strong>
          </p>
          <p v-else class="text-sm text-muted">Sin sugerencia calculada (activo sin criticidad o sin matriz configurada).</p>
          <div class="flex items-end gap-3 flex-wrap">
            <UFormField label="Prioridad final" name="prioridad">
              <USelect
                v-model="prioridadEditando"
                :items="prioridades.map((p) => ({ label: p.nombre, value: p.id }))"
                class="w-48"
              />
            </UFormField>
            <UFormField v-if="prioridadDifiereDeSugerida" label="Motivo de la sobrescritura" name="motivo" class="flex-1 min-w-48">
              <UInput v-model="motivoSobrescritura" class="w-full" />
            </UFormField>
            <UButton :loading="incidenciasStore.guardando" @click="guardarPrioridad()">Guardar</UButton>
          </div>
        </section>

        <section class="rounded-lg border border-default p-4 space-y-3">
          <h2 class="font-medium">Bitácora</h2>
          <div class="divide-y divide-default">
            <div v-for="a in incidenciasStore.actuaciones" :key="a.id" class="py-2 text-sm">
              <p class="text-muted text-xs">{{ new Date(a.created_at).toLocaleString() }} · {{ a.tipo_actuacion }}</p>
              <p>{{ a.descripcion }}</p>
            </div>
            <p v-if="incidenciasStore.actuaciones.length === 0" class="py-4 text-sm text-muted text-center">
              Sin actuaciones registradas.
            </p>
          </div>
          <div class="flex items-end gap-2 pt-2 border-t border-default">
            <UTextarea v-model="notaTexto" class="w-full" :rows="2" placeholder="Agregar una nota…" />
            <UButton :loading="incidenciasStore.guardando" @click="agregarNota()">Agregar</UButton>
          </div>
        </section>
      </div>

      <div class="space-y-3">
        <section class="rounded-lg border border-default p-4 space-y-2">
          <h2 class="font-medium mb-1">Acciones</h2>
          <UButton v-if="inc.estado === 'reportada'" block @click="marcarEnEvaluacion()">
            Marcar en evaluación
          </UButton>
          <UButton v-if="inc.estado === 'en_evaluacion'" block icon="i-lucide-wrench" @click="abrirConvertir()">
            Convertir a OT
          </UButton>
          <UButton v-if="['en_evaluacion', 'convertida'].includes(inc.estado)" block variant="soft" color="success" @click="marcarResuelta()">
            Marcar resuelta
          </UButton>
          <UButton
            v-if="['reportada', 'en_evaluacion'].includes(inc.estado)" block variant="soft" color="error"
            @click="motivoDescarte = ''; drawerDescarte = true"
          >
            Descartar
          </UButton>
          <p v-if="['resuelta', 'descartada'].includes(inc.estado)" class="text-sm text-muted">
            Estado terminal — sin más acciones.
          </p>
        </section>
      </div>
    </div>

    <UiDrawer :abierto="drawerDescarte" titulo="Descartar incidencia" @cerrar="drawerDescarte = false">
      <UFormField label="Motivo (obligatorio)" name="motivo">
        <UTextarea v-model="motivoDescarte" class="w-full" :rows="3" />
      </UFormField>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerDescarte = false">Cancelar</UButton>
          <UButton color="error" :disabled="!motivoDescarte.trim()" :loading="incidenciasStore.guardando" @click="descartar()">
            Descartar
          </UButton>
        </div>
      </template>
    </UiDrawer>

    <UiDrawer :abierto="drawerConvertir" titulo="Convertir a orden de trabajo" @cerrar="drawerConvertir = false">
      <div class="space-y-3">
        <UFormField label="Tipo de mantenimiento" name="tipo">
          <USelect v-model="formConvertir.tipoMantenimientoId" class="w-48" :items="tiposMantenimiento.map((t) => ({ label: t.nombre, value: t.id }))" />
        </UFormField>
        <UFormField label="Título de la OT" name="titulo">
          <UInput v-model="formConvertir.titulo" class="w-full" />
        </UFormField>
        <UFormField label="Asignar a tercero (opcional)" name="tercero">
          <USelect
            v-model="formConvertir.asignadoTerceroId"
            class="w-64"
            :items="[{ label: 'Sin asignar', value: undefined }, ...terceros.map((t) => ({ label: t.nombre_completo ?? t.razon_social ?? '—', value: t.id }))]"
          />
        </UFormField>
        <UFormField label="Asignar a personal interno (opcional)" name="usuario">
          <USelect
            v-model="formConvertir.asignadoUsuarioId"
            class="w-64"
            :items="[
              { label: 'Sin asignar', value: undefined },
              ...membersStore.miembros.map((m) => ({ label: m.profile?.full_name ?? m.user_id, value: m.user_id })),
            ]"
          />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerConvertir = false">Cancelar</UButton>
          <UButton :disabled="!formConvertir.tipoMantenimientoId" :loading="incidenciasStore.guardando" @click="convertir()">
            Crear orden de trabajo
          </UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
  <p v-else class="text-sm text-muted p-6 text-center">Cargando…</p>
</template>
