<script setup lang="ts">
// Tab Históricos — línea de tiempo unificada (PROMPT_FICHA_INMUEBLE.md
// §1.1 I8, §7.5). Composición en cliente de varias fuentes, ya resuelta y
// ordenada por inmuebles.ts::cargarHistorico — este componente solo pinta.
const props = defineProps<{ inmuebleId: string }>()

const tenantStore = useTenantStore()
const inmueblesStore = useInmueblesStore()

type Filtro = 'todos' | 'persona' | 'novedad' | 'pago' | 'liquidacion'
const filtro = ref<Filtro>('todos')

const eventosFiltrados = computed(() =>
  filtro.value === 'todos'
    ? inmueblesStore.historico
    : inmueblesStore.historico.filter((e) => e.tipo === filtro.value),
)

const ICONO_POR_TIPO: Record<string, string> = {
  inmueble: '🏠',
  persona: '👤',
  novedad: '🔔',
  pago: '$',
  liquidacion: '≡',
}

watchEffect(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await inmueblesStore.cargarHistorico(tenantId, props.inmuebleId)
})
</script>

<template>
  <div>
    <div class="panel-head">
      <div>
        <h2>Históricos</h2>
        <p class="panel-sub">Línea de tiempo de eventos: propiedad, personas, novedades, pagos y liquidaciones.</p>
      </div>
      <select v-model="filtro" class="cat-select">
        <option value="todos">Todos los eventos</option>
        <option value="persona">Personas</option>
        <option value="novedad">Novedades</option>
        <option value="pago">Cartera</option>
        <option value="liquidacion">Liquidaciones</option>
      </select>
    </div>

    <div v-if="eventosFiltrados.length > 0" class="timeline">
      <div v-for="(e, i) in eventosFiltrados" :key="i" class="tl-item">
        <span class="tl-dot">{{ ICONO_POR_TIPO[e.tipo] ?? '•' }}</span>
        <p class="tl-date">{{ new Date(e.fecha).toLocaleString('es-CO') }}</p>
        <p class="tl-desc">{{ e.descripcion }}</p>
        <p class="tl-by">{{ e.actor ?? 'Sistema' }}</p>
      </div>
    </div>
    <p v-else class="empty-state">Sin eventos para este filtro.</p>
  </div>
</template>
