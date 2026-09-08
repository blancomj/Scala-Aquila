<script setup lang="ts">
// MANT-4 §3.3: listado de órdenes de trabajo. La mayoría nace de una programación (MANT-3) o de
// una incidencia convertida (mantenimiento/incidencias) — "Nueva OT" aquí es solo el origen manual.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const ordenesStore = useMantenimientoOrdenesTrabajoStore()
const activosStore = useActivosStore()

const tiposMantenimiento = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const nombreTipo = computed(() => new Map(tiposMantenimiento.value.map((t) => [t.id, t.nombre])))

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    ordenesStore.cargarOrdenes(tenantId),
    activosStore.cargarActivos(tenantId),
    tiposMantenimiento.value.length === 0
      ? cargarListaTipos(tenantId, 'TIPO_MANTENIMIENTO').then((d) => { tiposMantenimiento.value = d })
      : Promise.resolve(),
  ])
}
onMounted(cargar)

const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'primary'> = {
  borrador: 'neutral', programada: 'neutral', asignada: 'primary', en_ejecucion: 'primary',
  ejecutada: 'warning', pendiente_aprobacion: 'warning', cerrada: 'success', cancelada: 'error',
}

const filtroEstado = ref<string | null>(null)
const ordenesFiltradas = computed(() =>
  ordenesStore.ordenes.filter((o) => !filtroEstado.value || o.estado === filtroEstado.value),
)

const opcionesActivo = computed(() => activosStore.activos.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} — ${a.nombre}` })))

const drawerAbierto = ref(false)
const form = reactive({
  titulo: '', descripcion: '', tipoMantenimientoId: undefined as number | undefined,
  activoId: null as string | null, requiereParadaServicio: false, costoEstimado: null as number | null,
})
const errorGuardar = ref<string | null>(null)

function abrirNueva(): void {
  form.titulo = ''; form.descripcion = ''; form.tipoMantenimientoId = undefined
  form.activoId = null; form.requiereParadaServicio = false; form.costoEstimado = null
  errorGuardar.value = null
  drawerAbierto.value = true
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !form.tipoMantenimientoId || !form.titulo.trim()) return
  errorGuardar.value = null
  const fila: Database['public']['Tables']['mant_ordenes_trabajo']['Insert'] = {
    tenant_id: tenantId, origen: 'manual', tipo_mantenimiento_id: form.tipoMantenimientoId,
    titulo: form.titulo.trim(), descripcion: form.descripcion.trim() || null,
    activo_id: form.activoId, requiere_parada_servicio: form.requiereParadaServicio,
    costo_estimado: form.costoEstimado,
  }
  try {
    const creada = await ordenesStore.crearOt(fila)
    drawerAbierto.value = false
    await navigateTo(`/mantenimiento/ordenes-trabajo/${creada.id}`)
  } catch (excepcion) {
    errorGuardar.value = mensajeError(excepcion, 'No se pudo crear la orden de trabajo.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Órdenes de trabajo</h1>
        </template>
        <template #descripcion>
          El trabajo real: tareas, mediciones y evidencia. Nacen de un plan (programación), de una
          incidencia convertida, o manuales. Cerrar una OT siempre valida que lo obligatorio quedó
          hecho.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-center gap-2">
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="ordenesStore.loading" @click="cargar()">
          Actualizar
        </UButton>
        <UButton icon="i-lucide-plus" @click="abrirNueva()">Nueva OT manual</UButton>
      </div>
    </div>

    <div class="flex justify-end">
      <USelect
        v-model="filtroEstado"
        :items="[
          { label: 'Todos los estados', value: null },
          { label: 'Borrador', value: 'borrador' },
          { label: 'Programada', value: 'programada' },
          { label: 'Asignada', value: 'asignada' },
          { label: 'En ejecución', value: 'en_ejecucion' },
          { label: 'Ejecutada', value: 'ejecutada' },
          { label: 'Pendiente aprobación', value: 'pendiente_aprobacion' },
          { label: 'Cerrada', value: 'cerrada' },
          { label: 'Cancelada', value: 'cancelada' },
        ]"
        class="w-52"
      />
    </div>

    <div class="rounded-lg border border-default divide-y divide-default">
      <NuxtLink
        v-for="ot in ordenesFiltradas" :key="ot.id" :to="`/mantenimiento/ordenes-trabajo/${ot.id}`"
        class="flex items-center justify-between gap-4 p-3 hover:bg-elevated transition-colors"
      >
        <div>
          <p class="font-medium">{{ ot.anio }}-{{ ot.numero }} · {{ ot.titulo }}</p>
          <p class="text-sm text-muted">{{ nombreTipo.get(ot.tipo_mantenimiento_id) ?? '—' }} · {{ ot.origen }}</p>
        </div>
        <UBadge :color="ESTADO_COLOR[ot.estado] ?? 'neutral'" variant="soft" class="capitalize">
          {{ ot.estado.replace('_', ' ') }}
        </UBadge>
      </NuxtLink>
      <p v-if="ordenesFiltradas.length === 0 && !ordenesStore.loading" class="p-6 text-sm text-muted text-center">
        Sin órdenes de trabajo con este filtro.
      </p>
    </div>

    <UiDrawer :abierto="drawerAbierto" titulo="Nueva OT manual" @cerrar="drawerAbierto = false">
      <div class="space-y-3">
        <UAlert v-if="errorGuardar" color="error" variant="soft" :title="errorGuardar" />
        <UFormField label="Título" name="titulo"><UInput v-model="form.titulo" class="w-full" /></UFormField>
        <UFormField label="Descripción" name="descripcion"><UTextarea v-model="form.descripcion" class="w-full" /></UFormField>
        <UFormField label="Tipo de mantenimiento" name="tipo">
          <USelect v-model="form.tipoMantenimientoId" class="w-48" :items="tiposMantenimiento.map((t) => ({ label: t.nombre, value: t.id }))" />
        </UFormField>
        <UFormField label="Activo (opcional)" name="activo">
          <UiSelectorBuscable v-model="form.activoId" :opciones="opcionesActivo" placeholder="Selecciona el activo" />
        </UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Costo estimado (opcional)" name="costo">
            <UInput v-model.number="form.costoEstimado" type="number" min="0" class="w-full" />
          </UFormField>
          <UFormField label="Requiere parada de servicio" name="parada">
            <USwitch v-model="form.requiereParadaServicio" />
          </UFormField>
        </div>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerAbierto = false">Cancelar</UButton>
          <UButton :loading="ordenesStore.guardando" @click="guardar()">Crear OT</UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
