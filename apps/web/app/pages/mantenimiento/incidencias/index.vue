<script setup lang="ts">
// MANT-4 §3.1/§3.6: listado de incidencias + alta. AD-26: el reportante es siempre texto libre
// (reportante_ref/reportante_contacto) — quien registra el INSERT es siempre un usuario con
// sesión (auxiliar/administrador), nunca el propio reportante.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const incidenciasStore = useMantenimientoIncidenciasStore()
const activosStore = useActivosStore()
const agrupacionesStore = useAgrupacionesStore()
const zonasComunesStore = useZonasComunesStore()

const tiposIncidencia = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const origenes = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const severidades = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const nombreTipo = computed(() => new Map(tiposIncidencia.value.map((t) => [t.id, t.nombre])))

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    incidenciasStore.cargarIncidencias(tenantId),
    activosStore.cargarActivos(tenantId),
    agrupacionesStore.cargarAgrupaciones(tenantId),
    zonasComunesStore.cargarZonasComunes(tenantId),
    tiposIncidencia.value.length === 0
      ? cargarListaTipos(tenantId, 'TIPO_INCIDENCIA').then((d) => { tiposIncidencia.value = d })
      : Promise.resolve(),
    origenes.value.length === 0
      ? cargarListaTipos(tenantId, 'ORIGEN_REPORTE').then((d) => { origenes.value = d })
      : Promise.resolve(),
    severidades.value.length === 0
      ? cargarListaTipos(tenantId, 'SEVERIDAD_INCIDENCIA').then((d) => { severidades.value = d })
      : Promise.resolve(),
  ])
}
onMounted(cargar)

const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'primary'> = {
  reportada: 'neutral', en_evaluacion: 'warning', convertida: 'primary', resuelta: 'success', descartada: 'error',
}

type Ubicacion = 'ninguna' | 'activo' | 'zona_comun' | 'agrupacion'
const drawerAbierto = ref(false)
const form = reactive({
  titulo: '', descripcion: '', tipoId: undefined as number | undefined, origenId: undefined as number | undefined,
  severidadId: undefined as number | undefined,
  ubicacion: 'ninguna' as Ubicacion,
  activoId: null as string | null, zonaComunId: null as string | null, agrupacionId: null as string | null,
  reportanteRef: '', reportanteContacto: '',
})
const errorGuardar = ref<string | null>(null)

const opcionesActivo = computed(() => activosStore.activos.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} — ${a.nombre}` })))
const opcionesAgrupacion = computed(() => agrupacionesStore.arbolPlano.map((a) => ({ valor: a.id, etiqueta: a.ruta })))
const opcionesZonaComun = computed(() => zonasComunesStore.zonasComunes.map((z) => ({ valor: z.id, etiqueta: `${z.codigo} — ${z.nombre}` })))

function abrirNueva(): void {
  form.titulo = ''; form.descripcion = ''; form.tipoId = undefined; form.origenId = undefined
  form.severidadId = undefined; form.ubicacion = 'ninguna'
  form.activoId = null; form.zonaComunId = null; form.agrupacionId = null
  form.reportanteRef = ''; form.reportanteContacto = ''
  errorGuardar.value = null
  drawerAbierto.value = true
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !form.tipoId || !form.origenId) return
  errorGuardar.value = null
  const fila: Database['public']['Tables']['mant_incidencias']['Insert'] = {
    tenant_id: tenantId, titulo: form.titulo.trim(), descripcion: form.descripcion.trim() || null,
    tipo_id: form.tipoId, origen_id: form.origenId, severidad_id: form.severidadId ?? null,
    activo_id: form.ubicacion === 'activo' ? form.activoId : null,
    zona_comun_id: form.ubicacion === 'zona_comun' ? form.zonaComunId : null,
    agrupacion_id: form.ubicacion === 'agrupacion' ? form.agrupacionId : null,
    reportante_ref: form.reportanteRef.trim() || null,
    reportante_contacto: form.reportanteContacto.trim() || null,
  }
  try {
    await incidenciasStore.crearIncidencia(fila)
    await incidenciasStore.cargarIncidencias(tenantId)
    drawerAbierto.value = false
  } catch (excepcion) {
    errorGuardar.value = mensajeError(excepcion, 'No se pudo crear la incidencia.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Incidencias</h1>
        </template>
        <template #descripcion>
          Lo que se rompe y lo que se hace al respecto. El reportante (residente, vigilancia) queda
          registrado como dato — quien registra la incidencia siempre es alguien con sesión.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-center gap-2">
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="incidenciasStore.loading" @click="cargar()">
          Actualizar
        </UButton>
        <UButton icon="i-lucide-plus" @click="abrirNueva()">Nueva incidencia</UButton>
      </div>
    </div>

    <div class="rounded-lg border border-default divide-y divide-default">
      <NuxtLink
        v-for="inc in incidenciasStore.incidencias" :key="inc.id" :to="`/mantenimiento/incidencias/${inc.id}`"
        class="flex items-center justify-between gap-4 p-3 hover:bg-elevated transition-colors"
      >
        <div>
          <p class="font-medium">{{ inc.anio }}-{{ inc.numero }} · {{ inc.titulo }}</p>
          <p class="text-sm text-muted">{{ nombreTipo.get(inc.tipo_id) ?? '—' }}</p>
        </div>
        <UBadge :color="ESTADO_COLOR[inc.estado] ?? 'neutral'" variant="soft" class="capitalize">
          {{ inc.estado.replace('_', ' ') }}
        </UBadge>
      </NuxtLink>
      <p v-if="incidenciasStore.incidencias.length === 0 && !incidenciasStore.loading" class="p-6 text-sm text-muted text-center">
        Sin incidencias registradas.
      </p>
    </div>

    <UiDrawer :abierto="drawerAbierto" titulo="Nueva incidencia" @cerrar="drawerAbierto = false">
      <div class="space-y-3">
        <UAlert v-if="errorGuardar" color="error" variant="soft" :title="errorGuardar" />
        <UFormField label="Título" name="titulo"><UInput v-model="form.titulo" class="w-full" /></UFormField>
        <UFormField label="Descripción" name="descripcion"><UTextarea v-model="form.descripcion" class="w-full" /></UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Tipo" name="tipo">
            <USelect v-model="form.tipoId" :items="tiposIncidencia.map((t) => ({ label: t.nombre, value: t.id }))" />
          </UFormField>
          <UFormField label="Origen del reporte" name="origen">
            <USelect v-model="form.origenId" :items="origenes.map((o) => ({ label: o.nombre, value: o.id }))" />
          </UFormField>
          <UFormField label="Severidad (opcional)" name="severidad">
            <USelect
              v-model="form.severidadId"
              :items="[{ label: 'Sin evaluar', value: undefined }, ...severidades.map((s) => ({ label: s.nombre, value: s.id }))]"
            />
          </UFormField>
          <UFormField label="Dónde ocurrió" name="ubicacion">
            <USelect
              v-model="form.ubicacion"
              :items="[
                { label: 'Sin especificar', value: 'ninguna' },
                { label: 'Un activo', value: 'activo' },
                { label: 'Una zona común', value: 'zona_comun' },
                { label: 'Una agrupación', value: 'agrupacion' },
              ]"
            />
          </UFormField>
        </div>
        <UiSelectorBuscable v-if="form.ubicacion === 'activo'" v-model="form.activoId" :opciones="opcionesActivo" placeholder="Selecciona el activo" />
        <UiSelectorBuscable v-if="form.ubicacion === 'zona_comun'" v-model="form.zonaComunId" :opciones="opcionesZonaComun" placeholder="Selecciona la zona común" />
        <UiSelectorBuscable v-if="form.ubicacion === 'agrupacion'" v-model="form.agrupacionId" :opciones="opcionesAgrupacion" placeholder="Selecciona la agrupación" />

        <div class="grid grid-cols-2 gap-3 pt-2 border-t border-default">
          <UFormField label="Reportante (texto libre, sin cuenta)" name="reportanteRef">
            <UInput v-model="form.reportanteRef" class="w-full" placeholder="ej. Residente apto 302" />
          </UFormField>
          <UFormField label="Contacto del reportante" name="reportanteContacto">
            <UInput v-model="form.reportanteContacto" class="w-full" placeholder="ej. teléfono o correo" />
          </UFormField>
        </div>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerAbierto = false">Cancelar</UButton>
          <UButton :loading="incidenciasStore.guardando" @click="guardar()">Crear incidencia</UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
