<script setup lang="ts">
// FIN-4 · Tablero de finanzas (§3.6): una sola pantalla — posición hoy (FIN-1), flujo proyectado
// a 30 días, CxP vencidas por programar y facturas próximas a vencer (FIN-2), compromisos por
// cuenta bancaria (FIN-1), alertas activas (este corte). Ninguna cifra nueva: cada una viene de
// una función ya expuesta, con su fuente navegable — esta pantalla no consulta tablas directo.
import type { Database, Explicacion } from '@aquila/shared'
import type { ResultadoRedaccionIa } from '~/types/ia-redaccion'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type FacturaPagable = Database['public']['Functions']['finanzas_facturas_pagables']['Returns'][number]

const tenantStore = useTenantStore()
const posicionStore = usePosicionTesoreriaStore()
const flujoStore = useFinanzasFlujoStore()

const facturasPagables = ref<FacturaPagable[]>([])
const cargando = ref(true)

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargando.value = true
  try {
    const cliente = useSupabaseClient<Database>()
    const hasta30 = new Date()
    hasta30.setUTCDate(hasta30.getUTCDate() + 30)
    const [, , , facturas] = await Promise.all([
      posicionStore.cargarPosicion(tenantId),
      posicionStore.cargarPoliticas(tenantId),
      flujoStore.cargarFlujo(tenantId, 30, 'base'),
      cliente.rpc('finanzas_facturas_pagables', {
        p_tenant_id: tenantId, p_hasta: hasta30.toISOString().slice(0, 10),
      }),
      flujoStore.cargarAlertaReglas(tenantId),
      flujoStore.cargarAlertasEmitidas(tenantId),
    ])
    facturasPagables.value = facturas.data ?? []
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

function moneda(v: number | string | null | undefined): string {
  return formatoMoneda(v ?? 0)
}

const liquidezUtilizable = computed(() =>
  posicionStore.posicion.filter((f) => f.utilizable).reduce((acc, f) => acc + Number(f.monto_disponible ?? 0), 0),
)
const ultimaFila = computed(() => flujoStore.filas[flujoStore.filas.length - 1] ?? null)
const cxpVencidasSinLote = computed(() => facturasPagables.value.filter((f) => f.dias_vencido > 0 && !f.ya_en_lote))
const facturasProximas = computed(() => facturasPagables.value.filter((f) => f.dias_vencido <= 0).slice(0, 5))
const totalCxpVencida = computed(() => cxpVencidasSinLote.value.reduce((acc, f) => acc + Number(f.total_neto_pagar), 0))

const compromisosPorCuenta = computed(() => {
  const bancos = posicionStore.posicion.filter((f) => f.concepto === 'bancos')
  return bancos.map((b) => ({
    nombre: b.detalle_nombre, total: Number(b.monto_total ?? 0), comprometido: Number(b.monto_comprometido ?? 0), disponible: Number(b.monto_disponible ?? 0),
  }))
})

// ── Redactar con IA (Ola 3, segunda rebanada — mismo botón de cartera, D-134) ───────────────────
// Estado por alerta (puede haber varias en la lista) — nunca automático al cargar la página.
const redactandoIa = ref<Record<string, boolean>>({})
const resultadosIa = ref<Record<string, ResultadoRedaccionIa>>({})

const MOTIVO_IA_LABEL: Record<string, string> = {
  IA_NO_ACTIVA: 'no hay un proveedor de IA activo en esta copropiedad — actívalo en Configuración',
  PRESUPUESTO_AGOTADO: 'se agotó el presupuesto mensual de IA de esta copropiedad',
  IA_CREDENCIAL_FALTANTE: 'la credencial del proveedor no está disponible',
  IA_TIMEOUT: 'el proveedor tardó demasiado en responder',
  IA_PROVEEDOR_ERROR: 'el proveedor de IA no pudo responder',
}

async function redactarConIa(alertaId: string, explicacion: Explicacion): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  redactandoIa.value = { ...redactandoIa.value, [alertaId]: true }
  try {
    resultadosIa.value = { ...resultadosIa.value, [alertaId]: await flujoStore.redactarConIa(tenantId, explicacion) }
  } catch {
    resultadosIa.value = { ...resultadosIa.value, [alertaId]: { texto: null, degradado: true, motivo: 'IA_PROVEEDOR_ERROR' } }
  } finally {
    redactandoIa.value = { ...redactandoIa.value, [alertaId]: false }
  }
}

// ── configuración de reglas de alerta ────────────────────────────────────────────────────────
const drawerAlertasAbierto = ref(false)
async function alternarRegla(id: string, activa: boolean): Promise<void> {
  await flujoStore.actualizarAlertaRegla(id, { activa })
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) await flujoStore.cargarAlertaReglas(tenantId)
}
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
      <template #titulo>
        <h1 class="text-xl font-semibold">Tablero de finanzas</h1>
      </template>
      <template #descripcion>
        Lo que un administrador necesita saber por la mañana: la posición hoy, el flujo a 30 días,
        las cuentas por pagar por programar y las alertas activas. Cada cifra lleva a su fuente.
      </template>
    </UiTituloDescripcion>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <NuxtLink to="/finanzas/posicion" class="rounded-lg border border-default p-4 hover:border-primary-300 transition-colors">
        <p class="text-sm text-muted">Liquidez utilizable hoy</p>
        <p class="text-2xl font-semibold tabular-nums mt-1">{{ moneda(liquidezUtilizable) }}</p>
      </NuxtLink>
      <NuxtLink to="/finanzas/flujo-proyectado" class="rounded-lg border border-default p-4 hover:border-primary-300 transition-colors">
        <p class="text-sm text-muted">Saldo proyectado a 30 días</p>
        <p class="text-2xl font-semibold tabular-nums mt-1" :class="ultimaFila && ultimaFila.saldo_acumulado < 0 ? 'text-error' : ''">
          {{ ultimaFila ? moneda(ultimaFila.saldo_acumulado) : '—' }}
        </p>
      </NuxtLink>
      <NuxtLink to="/finanzas/facturas" class="rounded-lg border border-default p-4 hover:border-primary-300 transition-colors">
        <p class="text-sm text-muted">CxP vencidas sin lote</p>
        <p class="text-2xl font-semibold tabular-nums mt-1">{{ moneda(totalCxpVencida) }}</p>
        <p class="text-xs text-muted mt-1">{{ cxpVencidasSinLote.length }} factura(s)</p>
      </NuxtLink>
      <div class="rounded-lg border border-default p-4">
        <p class="text-sm text-muted">Alertas activas</p>
        <p class="text-2xl font-semibold tabular-nums mt-1">{{ flujoStore.alertaReglas.filter((r) => r.activa).length }}</p>
        <button type="button" class="text-xs text-primary-600 dark:text-primary-400 underline decoration-dotted mt-1" @click="drawerAlertasAbierto = true">
          Configurar
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div class="rounded-lg border border-default p-4">
        <p class="text-sm font-medium mb-2">Facturas próximas a vencer</p>
        <div v-if="facturasProximas.length === 0" class="text-sm text-muted">Ninguna en el horizonte.</div>
        <ul v-else class="divide-y divide-default text-sm">
          <li v-for="f in facturasProximas" :key="f.factura_id" class="py-2 flex justify-between gap-2">
            <span>{{ f.proveedor_nombre }} · {{ f.numero_documento }}</span>
            <span class="tabular-nums">{{ moneda(f.total_neto_pagar) }} · {{ f.fecha_vencimiento }}</span>
          </li>
        </ul>
      </div>

      <div class="rounded-lg border border-default p-4">
        <p class="text-sm font-medium mb-2">Compromisos por cuenta bancaria</p>
        <div v-if="compromisosPorCuenta.length === 0" class="text-sm text-muted">Sin cuentas bancarias activas.</div>
        <ul v-else class="divide-y divide-default text-sm">
          <li v-for="c in compromisosPorCuenta" :key="c.nombre" class="py-2 flex justify-between gap-2">
            <span>{{ c.nombre }}</span>
            <span class="tabular-nums">comprometido {{ moneda(c.comprometido) }} · disponible {{ moneda(c.disponible) }}</span>
          </li>
        </ul>
      </div>
    </div>

    <div class="rounded-lg border border-default p-4">
      <p class="text-sm font-medium mb-2">Alertas emitidas recientes</p>
      <div v-if="flujoStore.alertasExplicadas.length === 0" class="text-sm text-muted">Ninguna alerta emitida.</div>
      <ul v-else class="divide-y divide-default text-sm">
        <li v-for="ae in flujoStore.alertasExplicadas" :key="ae.alerta.id" class="py-3 space-y-2">
          <div class="flex justify-between gap-2">
            <span class="font-medium">{{ flujoStore.alertaReglas.find((r) => r.id === ae.alerta.regla_id)?.nombre ?? ae.alerta.regla_id }}</span>
            <span class="text-muted">{{ ae.alerta.fecha_emision }}</span>
          </div>
          <UiAfirmaciones :afirmaciones="ae.explicacion.afirmaciones" />
          <UButton
            size="xs" variant="soft"
            :loading="redactandoIa[ae.alerta.id]"
            @click="redactarConIa(ae.alerta.id, ae.explicacion)"
          >
            Redactar con IA
          </UButton>
          <div
            v-if="resultadosIa[ae.alerta.id]"
            class="rounded-md border p-3 text-sm"
            :class="resultadosIa[ae.alerta.id]!.texto
              ? 'border-primary-200 bg-primary-50 dark:border-primary-900 dark:bg-primary-950'
              : 'border-default'"
          >
            <template v-if="resultadosIa[ae.alerta.id]!.texto">
              <p class="mb-1 text-xs font-medium text-primary-700 dark:text-primary-300">Redactado con IA</p>
              <p>{{ resultadosIa[ae.alerta.id]!.texto }}</p>
            </template>
            <p v-else class="text-xs text-muted">
              No se pudo redactar con IA: {{ MOTIVO_IA_LABEL[resultadosIa[ae.alerta.id]!.motivo ?? ''] ?? resultadosIa[ae.alerta.id]!.motivo }}.
              La explicación de arriba sigue siendo la respuesta.
            </p>
          </div>
        </li>
      </ul>
    </div>

    <!-- Drawer: configuración de reglas de alerta -->
    <UiDrawer :abierto="drawerAlertasAbierto" titulo="Reglas de alerta de liquidez" subtitulo="Alertar es notificar, nunca cambia ningún estado" @cerrar="drawerAlertasAbierto = false">
      <div class="space-y-3">
        <UAlert
          color="info" variant="soft" icon="i-lucide-info"
          description="Las reglas de ejemplo vienen inactivas — actívalas después de revisar el umbral, o crea las tuyas."
        />
        <div v-for="r in flujoStore.alertaReglas" :key="r.id" class="flex items-center justify-between gap-3 rounded-md border border-default p-3">
          <div class="text-sm">
            <p class="font-medium">{{ r.nombre }}</p>
            <p class="text-xs text-muted">
              <span v-if="r.umbral !== null">umbral {{ moneda(r.umbral) }}</span>
              <span v-if="r.semanas_consecutivas !== null">{{ r.semanas_consecutivas }} semanas seguidas</span>
            </p>
          </div>
          <USwitch :model-value="r.activa" @update:model-value="(v: boolean) => alternarRegla(r.id, v)" />
        </div>
        <p v-if="flujoStore.alertaReglas.length === 0" class="text-sm text-muted">Sin reglas configuradas todavía.</p>
      </div>
      <template #foot>
        <div class="flex justify-end w-full">
          <UButton variant="ghost" @click="drawerAlertasAbierto = false">Cerrar</UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
