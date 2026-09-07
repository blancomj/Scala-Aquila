<script setup lang="ts">
// GOB-2 §4.5: listado de reuniones de todos los órganos, con acceso al detalle donde vive el
// registro de asistencia, convocatoria, agenda y poderes.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']
type OrganoRow = Database['public']['Tables']['gobierno_organos']['Row']

const tenantStore = useTenantStore()
const reunionesStore = useGobiernoReunionesStore()

const organos = ref<(OrganoRow & { tipo: { nombre: string } | null })[]>([])
const tiposReunion = ref<ListaTipoRow[]>([])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const cliente = useSupabaseClient<Database>()
  const [{ data: organosFilas }, tiposReunionFilas] = await Promise.all([
    cliente.from('gobierno_organos').select('*, tipo:tipo_id(nombre)').eq('tenant_id', tenantId).is('vigente_hasta', null),
    cargarListaTipos(tenantId, 'TIPO_REUNION'),
    reunionesStore.cargarReuniones(tenantId),
  ])
  organos.value = (organosFilas ?? []) as (OrganoRow & { tipo: { nombre: string } | null })[]
  tiposReunion.value = tiposReunionFilas
}
onMounted(cargar)

const estadoColor: Record<string, 'neutral' | 'primary' | 'success' | 'error'> = {
  convocada: 'neutral', instalada: 'primary', cerrada: 'success', cancelada: 'error',
}

// ── Drawer: nueva reunión ──────────────────────────────────────────────────
const drawerAbierto = ref(false)
const form = reactive({
  organoId: null as string | null, tipoId: null as number | null,
  modalidad: 'presencial' as 'presencial' | 'no_presencial' | 'mixta',
  convocatoriaRegimen: 'primera' as 'primera' | 'segunda' | 'universal_sin_convocatoria',
  convocatoriaAntecedenteId: null as string | null,
  fechaHora: new Date().toISOString().slice(0, 16),
  lugar: '', medio: '',
})
const error = ref<string | null>(null)
const opcionesOrgano = computed(() => organos.value.map((o) => ({ valor: o.id, etiqueta: o.nombre || o.tipo?.nombre || o.id })))
const opcionesTipo = computed(() => tiposReunion.value.map((t) => ({ valor: t.id, etiqueta: t.nombre })))
const opcionesAntecedente = computed(() =>
  reunionesStore.reuniones
    .filter((r) => r.convocatoria_regimen === 'primera')
    .map((r) => ({ valor: r.id, etiqueta: `${r.tipo?.nombre ?? ''} · ${r.fecha_hora}` })),
)

function abrirNueva(): void {
  form.organoId = null
  form.tipoId = null
  form.modalidad = 'presencial'
  form.convocatoriaRegimen = 'primera'
  form.convocatoriaAntecedenteId = null
  form.fechaHora = new Date().toISOString().slice(0, 16)
  form.lugar = ''
  form.medio = ''
  error.value = null
  drawerAbierto.value = true
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !form.organoId || !form.tipoId) return
  error.value = null
  try {
    const reunion = await reunionesStore.crearReunion({
      tenant_id: tenantId, organo_id: form.organoId, tipo_id: form.tipoId,
      modalidad: form.modalidad, convocatoria_regimen: form.convocatoriaRegimen,
      convocatoria_antecedente_id: form.convocatoriaRegimen === 'segunda' ? form.convocatoriaAntecedenteId : null,
      fecha_hora: new Date(form.fechaHora).toISOString(),
      lugar: form.modalidad === 'no_presencial' ? null : (form.lugar.trim() || null),
      medio: form.modalidad === 'presencial' ? null : (form.medio.trim() || null),
    })
    drawerAbierto.value = false
    await navigateTo(`/gobierno/reuniones/${reunion.id}`)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear la reunión.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Reuniones de gobierno</h1>
        </template>
        <template #descripcion>
          Asamblea, consejo, comités — con su modalidad, régimen de convocatoria y asistencia
          registrada. No calcula quórum ni votación todavía: solo registra los insumos que GOB-3
          necesitará.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-center gap-2">
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="reunionesStore.loading" @click="cargar()">
          Actualizar
        </UButton>
        <UButton icon="i-lucide-plus" @click="abrirNueva()">Nueva reunión</UButton>
      </div>
    </div>

    <div class="rounded-lg border border-default divide-y divide-default">
      <NuxtLink
        v-for="r in reunionesStore.reuniones" :key="r.id" :to="`/gobierno/reuniones/${r.id}`"
        class="flex items-center justify-between gap-4 p-3 hover:bg-elevated/50"
      >
        <div>
          <p class="font-medium">{{ r.organo?.nombre || r.organo?.tipo?.nombre }} · {{ r.tipo?.nombre }}</p>
          <p class="text-xs text-muted">{{ r.fecha_hora }} · {{ r.modalidad }} · {{ r.convocatoria_regimen }}</p>
        </div>
        <UBadge :color="estadoColor[r.estado] ?? 'neutral'" variant="soft">{{ r.estado }}</UBadge>
      </NuxtLink>
      <p v-if="reunionesStore.reuniones.length === 0 && !reunionesStore.loading" class="text-sm text-muted p-4">
        Todavía no hay reuniones registradas.
      </p>
    </div>

    <UiDrawer :abierto="drawerAbierto" titulo="Nueva reunión" @cerrar="drawerAbierto = false">
      <div class="space-y-3">
        <UAlert v-if="error" color="error" variant="soft" :title="error" />
        <UFormField label="Órgano" name="organo">
          <UiSelectorBuscable v-model="form.organoId" :opciones="opcionesOrgano" placeholder="Selecciona un órgano" />
        </UFormField>
        <UFormField label="Tipo de reunión" name="tipo">
          <UiSelectorBuscable v-model="form.tipoId" :opciones="opcionesTipo" placeholder="Selecciona un tipo" />
        </UFormField>
        <UFormField label="Modalidad" name="modalidad">
          <USelect
            v-model="form.modalidad"
            :items="[
              { label: 'Presencial', value: 'presencial' },
              { label: 'No presencial', value: 'no_presencial' },
              { label: 'Mixta', value: 'mixta' },
            ]"
          />
        </UFormField>
        <UFormField label="Régimen de convocatoria" name="convocatoriaRegimen">
          <USelect
            v-model="form.convocatoriaRegimen"
            :items="[
              { label: 'Primera convocatoria', value: 'primera' },
              { label: 'Segunda convocatoria', value: 'segunda' },
              { label: 'Universal sin convocatoria (100% de coeficientes)', value: 'universal_sin_convocatoria' },
            ]"
          />
        </UFormField>
        <UFormField
          v-if="form.convocatoriaRegimen === 'segunda'"
          label="Reunión de primera convocatoria que no alcanzó quórum" name="antecedente"
        >
          <UiSelectorBuscable
            v-model="form.convocatoriaAntecedenteId" :opciones="opcionesAntecedente"
            placeholder="Selecciona la reunión antecedente"
          />
        </UFormField>
        <UFormField label="Fecha y hora" name="fechaHora">
          <UInput v-model="form.fechaHora" type="datetime-local" class="w-full" />
        </UFormField>
        <UFormField v-if="form.modalidad !== 'no_presencial'" label="Lugar" name="lugar">
          <UInput v-model="form.lugar" class="w-full" placeholder="Salón comunal" />
        </UFormField>
        <UFormField v-if="form.modalidad !== 'presencial'" label="Medio" name="medio">
          <UInput v-model="form.medio" class="w-full" placeholder="Enlace de videollamada" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerAbierto = false">Cancelar</UButton>
          <UButton
            :loading="reunionesStore.guardando" :disabled="!form.organoId || !form.tipoId"
            @click="guardar()"
          >
            Crear reunión
          </UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
