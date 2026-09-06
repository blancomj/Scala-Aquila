<script setup lang="ts">
// MANT-3 §3.5: listado de planes (con su origen visible), panel de cobertura (requisitos
// aplicables sin plan, en rojo — "la pantalla que un administrador nuevo debería ver primero") y
// el calendario de próximas programaciones de toda la copropiedad.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const planesStore = useMantenimientoPlanesStore()

const tiposActivo = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const nombreTipoActivo = computed(() => new Map(tiposActivo.value.map((t) => [t.id, t.nombre])))

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    planesStore.cargarPlanes(tenantId),
    planesStore.cargarCobertura(tenantId),
    planesStore.cargarProgramacionesTenant(tenantId),
    tiposActivo.value.length === 0
      ? cargarListaTipos(tenantId, 'TIPO_ACTIVO').then((data) => { tiposActivo.value = data })
      : Promise.resolve(),
  ])
}
onMounted(cargar)

const ESTADO_PROG_COLOR: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  pendiente: 'neutral', generada: 'success', omitida: 'warning', cancelada: 'error',
}

const filtroActivoId = ref<string | null>(null)
const filtroEstado = ref<string | null>(null)
const opcionesActivoFiltro = computed(() => {
  const vistos = new Map<string, string>()
  for (const p of planesStore.programaciones) {
    if (p.activos) vistos.set(p.activo_id, `${p.activos.codigo} — ${p.activos.nombre}`)
  }
  return [...vistos.entries()].map(([valor, etiqueta]) => ({ valor, etiqueta }))
})
const programacionesFiltradas = computed(() =>
  planesStore.programaciones.filter(
    (p) =>
      (!filtroActivoId.value || p.activo_id === filtroActivoId.value)
      && (!filtroEstado.value || p.estado === filtroEstado.value),
  ),
)

const huecosCobertura = computed(() => planesStore.cobertura.filter((c) => !c.cubierto))

const pestanaActiva = ref<'planes' | 'programaciones' | 'cobertura'>('planes')
const PESTANAS = [
  { label: 'Planes', value: 'planes' as const },
  { label: 'Próximas programaciones', value: 'programaciones' as const },
  { label: 'Cobertura de requisitos', value: 'cobertura' as const },
]
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Planes de mantenimiento</h1>
        </template>
        <template #descripcion>
          Convierte las obligaciones —legales, del fabricante, contractuales o internas— en un
          calendario de trabajo. La frecuencia legal vive siempre en el requisito de
          <NuxtLink to="/mantenimiento/cumplimiento" class="text-primary underline">Cumplimiento normativo</NuxtLink>;
          un plan puede ser más exigente, nunca menos.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-center gap-2">
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="planesStore.loading" @click="cargar()">
          Actualizar
        </UButton>
        <UButton icon="i-lucide-plus" to="/mantenimiento/planes/nuevo">Nuevo plan</UButton>
      </div>
    </div>

    <UTabs
      :items="PESTANAS" :model-value="pestanaActiva" variant="link" :content="false" class="w-full"
      @update:model-value="(v) => (pestanaActiva = v as typeof pestanaActiva)"
    />

    <!-- Listado de planes -->
    <section v-if="pestanaActiva === 'planes'" class="space-y-3 rounded-lg border border-default p-4">
      <div class="divide-y divide-default">
        <NuxtLink
          v-for="p in planesStore.planes" :key="p.id" :to="`/mantenimiento/planes/${p.id}`"
          class="flex items-center justify-between gap-4 py-3 hover:bg-elevated transition-colors"
        >
          <div>
            <p class="font-medium">{{ p.nombre }}</p>
            <p class="text-sm text-muted">
              Cada {{ p.frecuencia_meses }} {{ p.frecuencia_meses === 1 ? 'mes' : 'meses' }}
              <span v-if="p.alcance === 'tipo_activo'"> · {{ nombreTipoActivo.get(p.alcance_tipo_activo_id ?? 0) ?? '—' }}</span>
              <span v-else> · {{ p.alcance }}</span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UBadge variant="soft" size="sm" :color="p.frecuencia_origen === 'heredada_requisito' ? 'primary' : 'neutral'">
              {{ p.frecuencia_origen === 'heredada_requisito' ? 'Requisito legal' : 'Propio' }}
            </UBadge>
            <UBadge variant="soft" size="sm" :color="p.activo ? 'success' : 'neutral'">
              {{ p.activo ? 'Activo' : 'Borrador' }}
            </UBadge>
          </div>
        </NuxtLink>
        <p v-if="planesStore.planes.length === 0 && !planesStore.loading" class="p-6 text-sm text-muted text-center">
          Todavía no hay planes registrados.
        </p>
      </div>
    </section>

    <!-- §3.5: calendario de programaciones -->
    <section v-else-if="pestanaActiva === 'programaciones'" class="space-y-3 rounded-lg border border-default p-4">
      <div class="flex items-center justify-end gap-2 flex-wrap">
        <UiSelectorBuscable
          v-model="filtroActivoId" :opciones="opcionesActivoFiltro" placeholder="Filtrar por activo"
          class="w-56"
        />
        <USelect
          v-model="filtroEstado"
          :items="[
            { label: 'Todos los estados', value: null },
            { label: 'Pendiente', value: 'pendiente' },
            { label: 'Generada', value: 'generada' },
            { label: 'Omitida', value: 'omitida' },
            { label: 'Cancelada', value: 'cancelada' },
          ]"
          class="w-44"
        />
      </div>
      <div class="divide-y divide-default">
        <div
          v-for="prog in programacionesFiltradas" :key="prog.id"
          class="flex items-center justify-between gap-4 py-2"
        >
          <div>
            <p class="text-sm font-medium">{{ prog.mant_planes?.nombre ?? '—' }}</p>
            <p class="text-xs text-muted">
              {{ prog.activos?.codigo ?? '—' }} · programada {{ prog.fecha_programada }}
              <span v-if="prog.ventana_hasta !== prog.fecha_programada"> (ventana hasta {{ prog.ventana_hasta }})</span>
            </p>
          </div>
          <UBadge :color="ESTADO_PROG_COLOR[prog.estado] ?? 'neutral'" variant="soft" class="capitalize">
            {{ prog.estado }}
          </UBadge>
        </div>
        <p v-if="programacionesFiltradas.length === 0" class="p-6 text-sm text-muted text-center">
          Sin programaciones con este filtro.
        </p>
      </div>
    </section>

    <!-- §3.4: panel de cobertura — la pantalla que un administrador nuevo debería ver primero -->
    <section v-else class="space-y-3 rounded-lg border border-default p-4">
      <p v-if="huecosCobertura.length === 0 && planesStore.cobertura.length > 0" class="text-sm text-success">
        Todos los requisitos aplicables tienen un plan que los cubre.
      </p>
      <p v-else-if="planesStore.cobertura.length === 0" class="text-sm text-muted">
        Sin requisitos de cumplimiento activos todavía.
      </p>
      <div v-else class="divide-y divide-default">
        <div
          v-for="c in huecosCobertura" :key="`${c.requisito_id}-${c.activo_id ?? 'tenant'}`"
          class="flex items-center justify-between gap-4 py-2"
        >
          <div>
            <p class="text-sm font-medium">{{ c.requisito_nombre }}</p>
            <p class="text-xs text-muted">{{ c.activo_codigo ?? 'Toda la copropiedad' }}</p>
          </div>
          <UBadge color="error" variant="soft">Sin plan que lo cubra</UBadge>
        </div>
      </div>
    </section>
  </div>
</template>
