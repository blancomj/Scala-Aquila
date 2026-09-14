<script setup lang="ts">
// F9: dashboard base con métricas de tenant. Las métricas de dominio (presupuesto, cartera, etc.)
// llegan cuando exista esa capa — por ahora, lo único que hay datos reales para mostrar es
// tenancy/auditoría, que ya existen desde E3-E6.
//
// Fase 1 de Gobierno (GAP-23, INFORME_INVENTARIO_REPORTES_MODULOS_EXISTENTES.md): esa capa ya
// existe hoy en Cartera/Presupuesto/Fondos/Auditoría, cada una calculando sus propios números en
// su propia pantalla — nadie los consolidaba. "Resumen general" abajo es esa consolidación, sin
// tabla nueva: solo lee lo que cada módulo ya expone. cargado con Promise.allSettled (no
// Promise.all) — si una fuente falla, su tarjeta muestra "—" y las demás igual se muestran; el
// dashboard principal no puede depender de que las 4 fuentes respondan a la vez.
definePageMeta({ layout: 'default', middleware: ['tenant'] })

const usuario = useSupabaseUser()
const authStore = useAuthStore()
const tenantStore = useTenantStore()
const membersStore = useMembersStore()
const auditStore = useAuditStore()
const onboardingStore = useOnboardingStore()
const carteraStore = useCarteraStore()
const presupuestoStore = usePresupuestoStore()
const fondosStore = useFondosStore()
const auditoriaStore = useAuditoriaStore()

await useAsyncData('perfil', () => authStore.cargarPerfil())
await useAsyncData('memberships', () => tenantStore.cargarMemberships())
// `watch: [...]` en las tres llamadas gateadas por activeTenant?.id: en la
// carga en frío de la página, tenantStore.activeTenant puede seguir sin
// resolver en el instante exacto en que corre este setup — sin esa opción,
// la lectura fallida del id se queda así para siempre. La opción reintenta
// sola en cuanto el id esté disponible, sin importar cuándo (mismo espíritu
// que feedback_useasyncdata_ref_pagina_no_hidrata / configuracion/ia.vue).
await useAsyncData(
  'miembros-activos',
  () => {
    const tenantId = tenantStore.activeTenant?.id
    return tenantId ? membersStore.cargarMiembros(tenantId) : Promise.resolve([])
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)
await useAsyncData(
  'auditoria-reciente',
  () => {
    const tenantId = tenantStore.activeTenant?.id
    return tenantId ? auditStore.cargarEventos(tenantId, 5) : Promise.resolve([])
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)
await useAsyncData(
  'onboarding-checklist',
  async () => {
    const tenantId = tenantStore.activeTenant?.id
    if (tenantId) await onboardingStore.cargarEstado(tenantId)
    return null
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)

const resumenExpandido = useCookie<boolean>('dashboard-resumen-expandido', { default: () => true })

function formatoPct(valor: number): string {
  return `${valor.toFixed(1)}%`
}

const carteraVencida = ref<number | null>(null)
const carteraTotal = ref<number | null>(null)
const pctCarteraVencida = computed(() =>
  carteraTotal.value && carteraTotal.value > 0 ? ((carteraVencida.value ?? 0) / carteraTotal.value) * 100 : 0,
)

const pctEjecucionPresupuesto = ref<number | null>(null)
const anioPresupuestoVigente = ref<number | null>(null)

const saldoFondos = ref<number | null>(null)
const cantidadFondos = ref<number | null>(null)

const hallazgosAbiertos = ref<number | null>(null)
const accionesVencidas = ref<number | null>(null)

// Fase 1 de Gobierno: estas 8 refs son estado de página, no de un store Pinia — solo
// `onMounted` + `watch` hidratan correctamente refs de página (useAsyncData que las muta como
// efecto secundario produce mismatch de hidratación, ver feedback_useasyncdata_ref_pagina_no_hidrata).
async function cargarResumenGerencial(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const hoy = new Date().toISOString().slice(0, 10)

  const [carteraR, presupuestoR, fondosR, auditoriaR] = await Promise.allSettled([
    carteraStore.cargarDashboard(tenantId, hoy),
    (async () => {
      const presupuestos = await presupuestoStore.cargarPresupuestos(tenantId)
      const vigente = presupuestos.find((p) => p.estado === 'vigente')
      if (!vigente) return null
      const [cuentas, comparativo] = await Promise.all([
        presupuestoStore.cargarCuentas(tenantId),
        presupuestoStore.cargarComparativoCuenta(vigente.id),
      ])
      const naturalezaPorCuenta = new Map(cuentas.map((c) => [c.id, c.naturaleza]))
      let presupuestadoEgreso = 0
      let ejecutadoEgreso = 0
      for (const fila of comparativo) {
        if (naturalezaPorCuenta.get(fila.cuenta_id) !== 'egreso') continue
        presupuestadoEgreso += Number(fila.presupuestado)
        ejecutadoEgreso += Number(fila.ejecutado)
      }
      return { anio: vigente.anio, pct: presupuestadoEgreso > 0 ? (ejecutadoEgreso / presupuestadoEgreso) * 100 : 0 }
    })(),
    fondosStore.cargarFondos(tenantId),
    auditoriaStore.cargarResumenLigero(tenantId),
  ])

  if (carteraR.status === 'fulfilled') {
    carteraVencida.value = Number(carteraR.value.tarjetas.carteraVencida)
    carteraTotal.value = Number(carteraR.value.tarjetas.carteraTotal)
  }
  if (presupuestoR.status === 'fulfilled' && presupuestoR.value) {
    pctEjecucionPresupuesto.value = presupuestoR.value.pct
    anioPresupuestoVigente.value = presupuestoR.value.anio
  }
  if (fondosR.status === 'fulfilled') {
    cantidadFondos.value = fondosR.value.length
    saldoFondos.value = fondosR.value.reduce(
      (acc, f) => acc + (fondosStore.saldosPorFondo[f.id]?.saldo ?? 0),
      0,
    )
  }
  if (auditoriaR.status === 'fulfilled') {
    hallazgosAbiertos.value = auditoriaR.value.hallazgosAbiertos
    accionesVencidas.value = auditoriaR.value.accionesVencidas
  }
}
onMounted(cargarResumenGerencial)
// activeTenant puede no estar resuelto en el instante exacto en que corre `onMounted` en la
// carga en frío — este watch reintenta sola en cuanto el id esté disponible, mismo patrón que
// cartera/index.vue.
watch(() => tenantStore.activeTenant?.id, cargarResumenGerencial)
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Bienvenido</h1>
      <p class="text-neutral-500">{{ usuario?.email }}</p>
      <p v-if="authStore.profile" class="text-sm text-neutral-400 mt-1">
        {{ authStore.profile.full_name ?? 'Sin nombre registrado' }}
      </p>
      <p v-if="tenantStore.activeTenant" class="text-sm text-neutral-400 mt-1">
        Copropiedad activa: {{ tenantStore.activeTenant.name }} ({{ tenantStore.role }})
      </p>
    </div>

    <DashboardOnboardingChecklist />

    <div>
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-lg font-semibold">Resumen general</h2>
        <button
          type="button"
          class="flex items-center gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300"
          @click="resumenExpandido = !resumenExpandido"
        >
          <UIcon :name="resumenExpandido ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" />
          {{ resumenExpandido ? 'Cerrar resumen' : 'Ver resumen' }}
        </button>
      </div>

      <div v-if="resumenExpandido" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink to="/cartera" class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <div>
            <p class="text-sm text-neutral-500">Cartera vencida</p>
            <p class="text-2xl font-semibold">{{ carteraVencida !== null ? formatoMoneda(carteraVencida) : '—' }}</p>
            <p class="mt-1 text-xs text-neutral-400">{{ carteraVencida !== null ? formatoPct(pctCarteraVencida) : '—' }} del total</p>
          </div>
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-50 text-warning-600 dark:bg-warning-950 dark:text-warning-400">
            <UIcon name="i-lucide-clock" class="h-5 w-5" />
          </span>
        </NuxtLink>

        <NuxtLink to="/presupuesto" class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <div>
            <p class="text-sm text-neutral-500">Ejecución presupuestal</p>
            <p class="text-2xl font-semibold">{{ pctEjecucionPresupuesto !== null ? formatoPct(pctEjecucionPresupuesto) : '—' }}</p>
            <p class="mt-1 text-xs text-neutral-400">
              {{ anioPresupuestoVigente !== null ? `Presupuesto ${anioPresupuestoVigente}` : 'Sin presupuesto vigente' }}
            </p>
          </div>
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-400">
            <UIcon name="i-lucide-percent" class="h-5 w-5" />
          </span>
        </NuxtLink>

        <NuxtLink to="/fondos" class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <div>
            <p class="text-sm text-neutral-500">Saldo de fondos</p>
            <p class="text-2xl font-semibold">{{ saldoFondos !== null ? formatoMoneda(saldoFondos) : '—' }}</p>
            <p class="mt-1 text-xs text-neutral-400">{{ cantidadFondos !== null ? `${cantidadFondos} fondos` : '—' }}</p>
          </div>
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-600 dark:bg-success-950 dark:text-success-400">
            <UIcon name="i-lucide-piggy-bank" class="h-5 w-5" />
          </span>
        </NuxtLink>

        <NuxtLink to="/auditoria" class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <div>
            <p class="text-sm text-neutral-500">Hallazgos de auditoría abiertos</p>
            <p class="text-2xl font-semibold">{{ hallazgosAbiertos !== null ? hallazgosAbiertos : '—' }}</p>
            <p class="mt-1 text-xs text-neutral-400">{{ accionesVencidas !== null ? `${accionesVencidas} acciones vencidas` : '—' }}</p>
          </div>
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-50 text-error-600 dark:bg-error-950 dark:text-error-400">
            <UIcon name="i-lucide-shield-alert" class="h-5 w-5" />
          </span>
        </NuxtLink>

        <div class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <div>
            <p class="text-sm text-neutral-500">Miembros activos</p>
            <p class="text-2xl font-semibold">{{ membersStore.miembros.length }}</p>
          </div>
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            <UIcon name="i-lucide-users" class="h-5 w-5" />
          </span>
        </div>

        <NuxtLink to="/auditoria" class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <div>
            <p class="text-sm text-neutral-500">Eventos recientes</p>
            <p class="text-2xl font-semibold">{{ auditStore.eventos.length }}</p>
          </div>
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            <UIcon name="i-lucide-activity" class="h-5 w-5" />
          </span>
        </NuxtLink>
      </div>
    </div>

    <div>
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-lg font-semibold">Actividad reciente</h2>
        <NuxtLink to="/auditoria" class="text-sm text-primary hover:underline">Ver todo</NuxtLink>
      </div>
      <p v-if="auditStore.eventos.length === 0" class="text-neutral-500 text-sm">
        Sin actividad todavía.
      </p>
      <ul v-else class="space-y-1 text-sm">
        <li
          v-for="evento in auditStore.eventos"
          :key="evento.id"
          class="text-neutral-600 dark:text-neutral-300"
        >
          {{ evento.action }} — {{ new Date(evento.created_at).toLocaleString('es-CO') }}
        </li>
      </ul>
    </div>
  </div>
</template>
