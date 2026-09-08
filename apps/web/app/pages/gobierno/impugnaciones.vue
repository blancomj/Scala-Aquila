<script setup lang="ts">
// GOB-7 §4.4: listado transversal de impugnaciones (todas las decisiones y expedientes del
// tenant) — solo seguimiento; el registro y la resolución viven en la sección contextual de
// cada objeto impugnado (GobiernoImpugnacionSeccion, embebida en decisiones/[id] y
// convivencia/[id]).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const store = useGobiernoImpugnacionesStore()

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await store.cargarImpugnaciones(tenantId)
}
onMounted(cargar)

const estadoColor: Record<string, 'success' | 'error' | 'warning' | 'neutral' | 'primary'> = {
  presentada: 'primary', en_tramite: 'warning', resuelta: 'success', desistida: 'neutral',
}

const filtroEstado = ref<string | null>(null)
const impugnacionesFiltradas = computed(() =>
  store.impugnaciones.filter((i) => !filtroEstado.value || i.estado === filtroEstado.value),
)

function destino(i: (typeof store.impugnaciones)[number]): string {
  return i.objeto_tipo === 'decision' ? `/gobierno/decisiones/${i.decision_id}` : `/gobierno/convivencia/${i.expediente_id}`
}
function etiquetaObjeto(i: (typeof store.impugnaciones)[number]): string {
  if (i.objeto_tipo === 'decision' && i.decision) return `Decisión ${i.decision.numero}/${i.decision.anio}`
  if (i.objeto_tipo === 'sancion' && i.expediente) return `Expediente ${i.expediente.numero}/${i.expediente.anio}`
  return i.objeto_tipo
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Impugnaciones</h1>
        </template>
        <template #descripcion>
          AQUILA registra la impugnación de decisiones de asamblea y de sanciones, calcula su
          plazo y marca sus efectos — no la resuelve; quien resuelve es el juez o el órgano que
          corresponda.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-center gap-2">
        <USelect
          :model-value="filtroEstado ?? undefined"
          :items="[
            { label: 'Todos los estados', value: undefined },
            { label: 'Presentada', value: 'presentada' },
            { label: 'En trámite', value: 'en_tramite' },
            { label: 'Resuelta', value: 'resuelta' },
            { label: 'Desistida', value: 'desistida' },
          ]"
          placeholder="Estado"
          @update:model-value="(v) => (filtroEstado = (v as string | undefined) ?? null)"
        />
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="store.loading" @click="cargar()">Actualizar</UButton>
      </div>
    </div>

    <div class="rounded-lg border border-default divide-y divide-default">
      <NuxtLink
        v-for="i in impugnacionesFiltradas" :key="i.id"
        :to="destino(i)"
        class="flex items-center justify-between gap-4 p-3 hover:bg-elevated/50"
      >
        <div>
          <p class="font-medium">
            Impugnación {{ i.numero }}/{{ i.anio }} · {{ etiquetaObjeto(i) }}
          </p>
          <p class="text-xs text-muted">
            {{ i.impugnante?.primer_nombre }} {{ i.impugnante?.primer_apellido }} · plazo {{ i.plazo_limite }}
            <span v-if="!i.presentada_en_plazo" class="text-warning"> · fuera de plazo</span>
          </p>
        </div>
        <div class="flex items-center gap-1">
          <UBadge v-if="i.resultado" variant="soft" size="xs">{{ i.resultado }}</UBadge>
          <UBadge :color="estadoColor[i.estado] ?? 'neutral'" variant="soft">{{ i.estado }}</UBadge>
        </div>
      </NuxtLink>
      <p v-if="impugnacionesFiltradas.length === 0 && !store.loading" class="text-sm text-muted p-4">
        Todavía no hay impugnaciones registradas.
      </p>
    </div>
  </div>
</template>
