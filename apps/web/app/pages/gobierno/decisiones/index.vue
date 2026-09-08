<script setup lang="ts">
// GOB-5 §4.6: listado de decisiones con filtros por órgano, estado, materia y semáforo de
// ejecución. El semáforo NUNCA vive en gobierno_decisiones — se pide para cada fila a
// gobierno_decision_ejecucion() (marco §6.3), aceptable a la escala de una sola copropiedad
// (AD-24: no hay portafolio de tenants que paginar aquí).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type OrganoRow = Database['public']['Tables']['gobierno_organos']['Row']
type MateriaRow = Database['public']['Tables']['gobierno_materia_decision']['Row']

const tenantStore = useTenantStore()
const decisionesStore = useGobiernoDecisionesStore()

const organos = ref<(OrganoRow & { tipo: { nombre: string } | null })[]>([])
const materias = ref<MateriaRow[]>([])
const ejecucionPorDecision = ref<Record<string, string>>({}) // decision_id -> semaforo

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const cliente = useSupabaseClient<Database>()
  const [{ data: organosFilas }, { data: materiasFilas }] = await Promise.all([
    cliente.from('gobierno_organos').select('*, tipo:tipo_id(nombre)').eq('tenant_id', tenantId).is('vigente_hasta', null),
    cliente.from('gobierno_materia_decision').select('*').order('numeral_articulo'),
    decisionesStore.cargarDecisiones(tenantId),
  ])
  organos.value = (organosFilas ?? []) as (OrganoRow & { tipo: { nombre: string } | null })[]
  materias.value = materiasFilas ?? []

  const mapa: Record<string, string> = {}
  await Promise.all(decisionesStore.decisiones.map(async (d) => {
    try {
      const { data } = await cliente.rpc('gobierno_decision_ejecucion', { p_decision_id: d.id }).single()
      if (data) mapa[d.id] = data.semaforo
    } catch {
      // Si falla para una fila puntual, simplemente no se muestra su semáforo.
    }
  }))
  ejecucionPorDecision.value = mapa
}
onMounted(cargar)

const filtroOrgano = ref<string | null>(null)
const filtroEstado = ref<string | undefined>(undefined)
const filtroMateria = ref<number | null>(null)
const filtroSemaforo = ref<string | undefined>(undefined)

const decisionesFiltradas = computed(() =>
  decisionesStore.decisiones.filter((d) => {
    if (filtroOrgano.value && d.organo_id !== filtroOrgano.value) return false
    if (filtroEstado.value && d.estado !== filtroEstado.value) return false
    if (filtroMateria.value && d.materia_id !== filtroMateria.value) return false
    if (filtroSemaforo.value && ejecucionPorDecision.value[d.id] !== filtroSemaforo.value) return false
    return true
  }),
)

const estadoColor: Record<string, 'success' | 'error' | 'warning' | 'neutral'> = {
  vigente: 'success', anulada: 'error', revocada: 'neutral', impugnada: 'warning',
}
const semaforoColor: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  en_plazo: 'success', proximo_vencer: 'warning', vencido: 'error', bloqueado: 'error',
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Decisiones</h1>
        </template>
        <template #descripcion>
          Cada decisión nace de una votación cerrada y aprobada — su avance de ejecución se calcula
          en vivo desde sus compromisos, nunca se almacena.
        </template>
      </UiTituloDescripcion>
      <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="decisionesStore.loading" @click="cargar()">
        Actualizar
      </UButton>
    </div>

    <div class="grid gap-3 sm:grid-cols-4">
      <UiSelectorBuscable
        v-model="filtroOrgano" placeholder="Órgano (todos)"
        :opciones="organos.map((o) => ({ valor: o.id, etiqueta: o.nombre || o.tipo?.nombre || o.id }))"
      />
      <USelect
        v-model="filtroEstado" placeholder="Estado (todos)" class="w-full"
        :items="[
          { label: 'Vigente', value: 'vigente' }, { label: 'Anulada', value: 'anulada' },
          { label: 'Revocada', value: 'revocada' }, { label: 'Impugnada', value: 'impugnada' },
        ]"
      />
      <UiSelectorBuscable
        v-model="filtroMateria" placeholder="Materia (todas)"
        :opciones="materias.map((m) => ({ valor: m.id, etiqueta: m.nombre }))"
      />
      <USelect
        v-model="filtroSemaforo" placeholder="Semáforo (todos)" class="w-full"
        :items="[
          { label: 'En plazo', value: 'en_plazo' }, { label: 'Próximo a vencer', value: 'proximo_vencer' },
          { label: 'Vencido', value: 'vencido' }, { label: 'Bloqueado', value: 'bloqueado' },
        ]"
      />
    </div>

    <div class="rounded-lg border border-default divide-y divide-default">
      <NuxtLink
        v-for="d in decisionesFiltradas" :key="d.id" :to="`/gobierno/decisiones/${d.id}`"
        class="flex items-center justify-between gap-4 p-3 hover:bg-elevated/50"
      >
        <div>
          <p class="font-medium">{{ d.numero }}/{{ d.anio }} · {{ d.titulo }}</p>
          <p class="text-xs text-muted">{{ d.organo?.nombre }} · {{ d.materia?.nombre }}</p>
        </div>
        <div class="flex items-center gap-1">
          <UBadge v-if="ejecucionPorDecision[d.id]" :color="semaforoColor[ejecucionPorDecision[d.id]!] ?? 'neutral'" variant="soft" size="xs">
            {{ ejecucionPorDecision[d.id] }}
          </UBadge>
          <UBadge :color="estadoColor[d.estado] ?? 'neutral'" variant="soft">{{ d.estado }}</UBadge>
        </div>
      </NuxtLink>
      <p v-if="decisionesFiltradas.length === 0 && !decisionesStore.loading" class="text-sm text-muted p-4">
        Todavía no hay decisiones registradas. Se crean desde una votación cerrada y aprobada, en
        el detalle de la reunión.
      </p>
    </div>
  </div>
</template>
