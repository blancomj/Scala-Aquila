<script setup lang="ts">
// GOB-5 §4.6: tablero de compromisos por responsable, ordenado por urgencia — la pantalla que
// usa la administración a diario. El semáforo por fila es una lectura de conveniencia (fecha
// límite vs. hoy); el semáforo con validez normativa vive en gobierno_decision_ejecucion, a
// nivel de decisión (marco §6.3).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const decisionesStore = useGobiernoDecisionesStore()

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await decisionesStore.cargarCompromisosTenant(tenantId)
}
onMounted(cargar)

const DIAS_PROXIMO_VENCER = 5 // mismo default que gobierno_decision_ejecucion sin política vigente

function urgencia(c: (typeof decisionesStore.compromisos)[number]): 'bloqueado' | 'vencido' | 'proximo_vencer' | 'en_plazo' | null {
  if (c.estado === 'cumplido' || c.estado === 'cancelado') return null
  if (c.estado === 'bloqueado') return 'bloqueado'
  if (!c.fecha_limite) return 'en_plazo'
  const hoy = new Date().toISOString().slice(0, 10)
  if (c.fecha_limite < hoy) return 'vencido'
  const limiteProximo = new Date(Date.now() + DIAS_PROXIMO_VENCER * 86_400_000).toISOString().slice(0, 10)
  if (c.fecha_limite <= limiteProximo) return 'proximo_vencer'
  return 'en_plazo'
}
const urgenciaColor: Record<string, 'error' | 'warning' | 'success' | 'neutral'> = {
  bloqueado: 'error', vencido: 'error', proximo_vencer: 'warning', en_plazo: 'success',
}
const urgenciaOrden: Record<string, number> = { bloqueado: 0, vencido: 1, proximo_vencer: 2, en_plazo: 3 }

function nombreResponsable(c: (typeof decisionesStore.compromisos)[number]): string {
  const miembro = c.responsable_miembro?.tercero
  if (miembro) return `${miembro.primer_nombre} ${miembro.primer_apellido}`
  if (c.responsable_tercero) return `${c.responsable_tercero.primer_nombre} ${c.responsable_tercero.primer_apellido}`
  return 'La administración'
}

const filtroResponsable = ref<string | null>(null)
const responsables = computed(() => Array.from(new Set(decisionesStore.compromisos.map((c) => nombreResponsable(c)))).sort())

const compromisosOrdenados = computed(() =>
  decisionesStore.compromisos
    .filter((c) => !filtroResponsable.value || nombreResponsable(c) === filtroResponsable.value)
    .map((c) => ({ compromiso: c, urgencia: urgencia(c) }))
    .sort((a, b) => {
      const oa = a.urgencia ? urgenciaOrden[a.urgencia]! : 4
      const ob = b.urgencia ? urgenciaOrden[b.urgencia]! : 4
      return oa - ob
    }),
)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Compromisos</h1>
        </template>
        <template #descripcion>
          Todos los compromisos del tenant, de todas las decisiones, ordenados por urgencia — sin
          filtrar por decisión.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-center gap-2">
        <UiSelectorBuscable
          v-model="filtroResponsable" placeholder="Responsable (todos)"
          :opciones="responsables.map((r) => ({ valor: r, etiqueta: r }))"
        />
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="decisionesStore.loading" @click="cargar()">
          Actualizar
        </UButton>
      </div>
    </div>

    <div class="rounded-lg border border-default divide-y divide-default">
      <NuxtLink
        v-for="fila in compromisosOrdenados" :key="fila.compromiso.id"
        :to="`/gobierno/decisiones/${fila.compromiso.decision_id}`"
        class="flex items-center justify-between gap-4 p-3 hover:bg-elevated/50"
      >
        <div>
          <p class="font-medium">{{ fila.compromiso.titulo }}</p>
          <p class="text-xs text-muted">
            {{ nombreResponsable(fila.compromiso) }} ·
            Decisión {{ fila.compromiso.decision?.numero }}/{{ fila.compromiso.decision?.anio }}
            <span v-if="fila.compromiso.fecha_limite"> · vence {{ fila.compromiso.fecha_limite }}</span>
          </p>
        </div>
        <div class="flex items-center gap-1">
          <UBadge v-if="fila.urgencia" :color="urgenciaColor[fila.urgencia]" variant="soft" size="xs">{{ fila.urgencia }}</UBadge>
          <UBadge variant="soft">{{ fila.compromiso.estado }}</UBadge>
        </div>
      </NuxtLink>
      <p v-if="compromisosOrdenados.length === 0 && !decisionesStore.loading" class="text-sm text-muted p-4">
        Todavía no hay compromisos registrados.
      </p>
    </div>
  </div>
</template>
