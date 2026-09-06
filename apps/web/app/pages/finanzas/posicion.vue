<script setup lang="ts">
// FIN-1 · Posición de tesorería y disponibilidad bancaria (§3.3-§3.5).
//
// Pura consulta sobre lo que otros módulos ya persisten (fn_cuenta_bancaria_disponible,
// fn_fondo_saldos, contable_libro_mayor, fn_posicion_cartera, presupuesto_ejecucion) — no hay
// aquí ningún dato que esta pantalla origine, salvo la política de "utilizable" misma.
//
// Sin política de tesorería vigente, finanzas_posicion_tesoreria marca utilizable=false en
// todo (cero valores por defecto, APENDICE_FIN.md) — la pantalla lo advierte en vez de estimar.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type PosicionFila = Database['public']['Functions']['finanzas_posicion_tesoreria']['Returns'][number]

const tenantStore = useTenantStore()
const posicionStore = usePosicionTesoreriaStore()

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([posicionStore.cargarPosicion(tenantId), posicionStore.cargarPoliticas(tenantId)])
}
onMounted(cargar)

function moneda(valor: number | string | null | undefined): string {
  return formatoMoneda(valor ?? 0)
}

// ── agrupación por dimensión (§3.5: "tarjetas por dimensión") ────────────────────────────────
const bancos = computed(() => posicionStore.posicion.filter((f) => f.concepto === 'bancos'))
const fondosFilas = computed(() => posicionStore.posicion.filter((f) => f.concepto.startsWith('fondo:')))
const caja = computed<PosicionFila | null>(() => posicionStore.posicion.find((f) => f.concepto === 'caja') ?? null)
const anticipos = computed<PosicionFila | null>(
  () => posicionStore.posicion.find((f) => f.concepto === 'anticipos') ?? null,
)
const carteraTotal = computed<PosicionFila | null>(
  () => posicionStore.posicion.find((f) => f.concepto === 'cartera_total') ?? null,
)
const carteraVencida = computed<PosicionFila | null>(
  () => posicionStore.posicion.find((f) => f.concepto === 'cartera_vencida') ?? null,
)
const cxp = computed<PosicionFila | null>(() => posicionStore.posicion.find((f) => f.concepto === 'cxp') ?? null)

function sumar(filas: PosicionFila[], campo: 'monto_total' | 'monto_comprometido' | 'monto_disponible'): number {
  return filas.reduce((acc, f) => acc + Number(f[campo] ?? 0), 0)
}

const tarjetas = computed(() => [
  { titulo: 'Bancos', icono: 'i-lucide-landmark', total: sumar(bancos.value, 'monto_total'), comprometido: sumar(bancos.value, 'monto_comprometido'), disponible: sumar(bancos.value, 'monto_disponible') },
  { titulo: 'Caja', icono: 'i-lucide-wallet', total: Number(caja.value?.monto_total ?? 0), comprometido: 0, disponible: Number(caja.value?.monto_disponible ?? 0) },
  { titulo: 'Fondos', icono: 'i-lucide-shield', total: sumar(fondosFilas.value, 'monto_total'), comprometido: sumar(fondosFilas.value, 'monto_comprometido'), disponible: sumar(fondosFilas.value, 'monto_disponible') },
  { titulo: 'Anticipos sin aplicar', icono: 'i-lucide-arrow-down-left', total: Number(anticipos.value?.monto_total ?? 0), comprometido: 0, disponible: Number(anticipos.value?.monto_disponible ?? 0) },
  { titulo: 'Cartera total', icono: 'i-lucide-file-text', total: Number(carteraTotal.value?.monto_total ?? 0), comprometido: 0, disponible: Number(carteraTotal.value?.monto_disponible ?? 0) },
  { titulo: 'Cartera vencida', icono: 'i-lucide-alert-triangle', total: Number(carteraVencida.value?.monto_total ?? 0), comprometido: 0, disponible: Number(carteraVencida.value?.monto_disponible ?? 0) },
  { titulo: 'Cuentas por pagar', icono: 'i-lucide-file-minus', total: Number(cxp.value?.monto_total ?? 0), comprometido: 0, disponible: Number(cxp.value?.monto_disponible ?? 0) },
])

/** Liquidez utilizable: suma de monto_disponible de toda fila marcada utilizable=true por la
 * política vigente (solo bancos/fondos/caja pueden llegar marcados así — anticipos, cartera y
 * CxP siempre utilizable=false, §3.3). */
const liquidezUtilizable = computed(() =>
  posicionStore.posicion.filter((f) => f.utilizable).reduce((acc, f) => acc + Number(f.monto_disponible ?? 0), 0),
)

// ── detalle expandible por cuenta bancaria (§3.5) ────────────────────────────────────────────
const cuentaExpandida = ref<string | null>(null)
async function alternarDetalle(cuentaBancariaId: string): Promise<void> {
  if (cuentaExpandida.value === cuentaBancariaId) {
    cuentaExpandida.value = null
    return
  }
  cuentaExpandida.value = cuentaBancariaId
  if (!posicionStore.compromisosPorCuenta[cuentaBancariaId]) {
    await posicionStore.cargarCompromisosCuenta(cuentaBancariaId)
  }
}
const ORIGEN_LABEL: Record<string, string> = {
  factura_proveedor: 'Factura de proveedor', lote_pago: 'Lote de pago', manual: 'Manual',
}
const ESTADO_COMPROMISO_LABEL: Record<string, string> = {
  proyectado: 'Proyectado', reservado: 'Reservado', ejecutado: 'Ejecutado', liberado: 'Liberado', anulado: 'Anulado',
}
const ESTADO_COMPROMISO_COLOR: Record<string, 'neutral' | 'warning' | 'success' | 'error'> = {
  proyectado: 'neutral', reservado: 'warning', ejecutado: 'success', liberado: 'neutral', anulado: 'error',
}

/** "Click en el saldo de una cuenta bancaria abre el libro mayor filtrado" (§3.5) — resuelve la
 * cuenta contable enlazada y navega con el query que libros.vue ya sabe leer. */
async function abrirEnLibroMayor(cuentaBancariaId: string): Promise<void> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente
    .from('cuentas_bancarias')
    .select('contable_cuenta_id')
    .eq('id', cuentaBancariaId)
    .single()
  if (error || !data?.contable_cuenta_id) return
  await navigateTo({ path: '/contabilidad/libros', query: { cuenta: data.contable_cuenta_id } })
}

// ── política de "utilizable" (§3.4), con simulación antes de guardar ─────────────────────────
const drawerPoliticaAbierto = ref(false)
const bancosSeleccionados = ref<Set<string>>(new Set())
const fondosSeleccionados = ref<Set<string>>(new Set())
const incluirCaja = ref(false)
const actaReferencia = ref('')
const errorPolitica = ref<string | null>(null)

function abrirConfiguracionPolitica(): void {
  const vigente = posicionStore.politicaVigente
  bancosSeleccionados.value = new Set(vigente?.bancos_utilizables ?? [])
  fondosSeleccionados.value = new Set(vigente?.fondos_utilizables ?? [])
  incluirCaja.value = vigente?.incluir_caja ?? false
  actaReferencia.value = vigente?.acta_referencia ?? ''
  errorPolitica.value = null
  drawerPoliticaAbierto.value = true
}

function alternarSeleccion(conjunto: Set<string>, id: string): void {
  if (conjunto.has(id)) conjunto.delete(id)
  else conjunto.add(id)
}

/** Recalcula la liquidez utilizable sobre la selección EN PANTALLA, todavía sin guardar — la
 * simulación que pide §3.5 ("cómo cambia... antes de guardar"). */
const liquidezSimulada = computed(() => {
  let total = 0
  for (const b of bancos.value) if (bancosSeleccionados.value.has(b.detalle_id ?? '')) total += Number(b.monto_disponible ?? 0)
  for (const f of fondosFilas.value) if (fondosSeleccionados.value.has(f.detalle_id ?? '')) total += Number(f.monto_disponible ?? 0)
  if (incluirCaja.value) total += Number(caja.value?.monto_disponible ?? 0)
  return total
})

async function guardarPolitica(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorPolitica.value = null
  try {
    await posicionStore.guardarPolitica({
      tenantId,
      bancosUtilizables: [...bancosSeleccionados.value],
      fondosUtilizables: [...fondosSeleccionados.value],
      incluirCaja: incluirCaja.value,
      actaReferencia: actaReferencia.value || undefined,
    })
    await posicionStore.cargarPosicion(tenantId)
    drawerPoliticaAbierto.value = false
  } catch (e) {
    errorPolitica.value = e instanceof Error ? e.message : 'No se pudo guardar la política'
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Posición de tesorería</h1>
        </template>
        <template #descripcion>
          Cuánto tiene la copropiedad, cuánto está disponible en cada cuenta descontando
          compromisos, y cuánto es efectivamente utilizable según la política vigente. Se calcula
          al momento — nada de esto se almacena aparte.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-center gap-2">
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="posicionStore.loading" @click="cargar()">
          Actualizar
        </UButton>
        <UButton icon="i-lucide-settings" @click="abrirConfiguracionPolitica()">Configurar política</UButton>
      </div>
    </div>

    <!-- Encabezado: liquidez utilizable en un solo número (§3.5) -->
    <div class="rounded-lg border border-default p-5 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p class="text-sm text-muted">Liquidez utilizable</p>
        <p class="text-3xl font-semibold tabular-nums">{{ moneda(liquidezUtilizable) }}</p>
        <p class="mt-1 text-xs text-muted">Calculado a hoy, {{ new Date().toLocaleDateString('es-CO') }}</p>
      </div>
      <div class="text-sm text-right">
        <template v-if="posicionStore.politicaVigente">
          <p class="font-medium">Política vigente: versión {{ posicionStore.politicaVigente.version }}</p>
          <p class="text-muted">
            Desde {{ posicionStore.politicaVigente.vigente_desde }}
            <span v-if="posicionStore.politicaVigente.acta_referencia"> · acta {{ posicionStore.politicaVigente.acta_referencia }}</span>
          </p>
        </template>
        <UAlert
          v-else color="warning" variant="soft" icon="i-lucide-alert-triangle"
          title="Sin política de tesorería vigente"
          description="No se está calculando liquidez operativa: todo aparece como no utilizable. Configúrala para que este número tenga sentido."
        />
      </div>
    </div>

    <!-- Tarjetas por dimensión -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div v-for="t in tarjetas" :key="t.titulo" class="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <p class="text-sm text-neutral-500">{{ t.titulo }}</p>
          <p class="text-xl font-semibold tabular-nums">{{ moneda(t.total) }}</p>
          <p class="mt-1 text-xs text-neutral-400">
            comprometido {{ moneda(t.comprometido) }} · disponible {{ moneda(t.disponible) }}
          </p>
        </div>
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-400">
          <UIcon :name="t.icono" class="h-5 w-5" />
        </span>
      </div>
    </div>

    <!-- Detalle expandible por cuenta bancaria -->
    <div>
      <h2 class="text-sm font-medium mb-2">Cuentas bancarias</h2>
      <div class="rounded-lg border border-default divide-y divide-default">
        <div v-for="b in bancos" :key="b.detalle_id ?? b.detalle_nombre">
          <div class="flex items-center justify-between gap-4 p-3 flex-wrap">
            <button type="button" class="flex items-center gap-2 text-left" @click="b.detalle_id && alternarDetalle(b.detalle_id)">
              <UIcon :name="cuentaExpandida === b.detalle_id ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-muted" />
              <span class="text-sm font-medium">{{ b.detalle_nombre }}</span>
              <UBadge v-if="b.utilizable" color="success" variant="soft" size="sm">Utilizable</UBadge>
            </button>
            <div class="flex items-center gap-4 text-sm tabular-nums">
              <span>Saldo <button type="button" class="underline decoration-dotted" @click="b.detalle_id && abrirEnLibroMayor(b.detalle_id)">{{ moneda(b.monto_total) }}</button></span>
              <span class="text-muted">comprometido {{ moneda(b.monto_comprometido) }}</span>
              <span class="font-medium">disponible {{ moneda(b.monto_disponible) }}</span>
            </div>
          </div>
          <div v-if="cuentaExpandida === b.detalle_id" class="px-3 pb-3">
            <div v-if="(posicionStore.compromisosPorCuenta[b.detalle_id ?? ''] ?? []).length === 0" class="text-xs text-muted p-2">
              Sin compromisos vigentes.
            </div>
            <table v-else class="w-full text-xs">
              <thead>
                <tr class="text-left text-muted">
                  <th class="font-normal py-1">Origen</th>
                  <th class="font-normal py-1">Estado</th>
                  <th class="font-normal py-1">Fecha esperada</th>
                  <th class="font-normal py-1 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in (posicionStore.compromisosPorCuenta[b.detalle_id ?? ''] ?? [])" :key="c.id" class="border-t border-default">
                  <td class="py-1">{{ ORIGEN_LABEL[c.origen] ?? c.origen }}</td>
                  <td class="py-1">
                    <UBadge :color="ESTADO_COMPROMISO_COLOR[c.estado] ?? 'neutral'" variant="soft" size="sm">
                      {{ ESTADO_COMPROMISO_LABEL[c.estado] ?? c.estado }}
                    </UBadge>
                  </td>
                  <td class="py-1">{{ c.fecha_esperada_ejecucion ?? '—' }}</td>
                  <td class="py-1 text-right tabular-nums">{{ moneda(c.monto) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p v-if="bancos.length === 0" class="p-4 text-sm text-muted text-center">Sin cuentas bancarias activas.</p>
      </div>
    </div>

    <!-- Configuración de política, con simulación antes de guardar -->
    <UiDrawer
      :abierto="drawerPoliticaAbierto" titulo="Política de tesorería"
      subtitulo="Qué cuentas y fondos cuentan como liquidez operativa"
      ancho="ancho" @cerrar="drawerPoliticaAbierto = false"
    >
      <div class="space-y-5">
        <UAlert v-if="errorPolitica" color="error" variant="soft" :title="errorPolitica" />
        <UAlert
          color="info" variant="soft" icon="i-lucide-info"
          title="Sin valores por defecto"
          description="Nada viene preseleccionado — cada copropiedad decide qué cuenta como liquidez operativa. Guardar crea una nueva versión vigente; la anterior queda histórica, nunca se modifica."
        />

        <div class="rounded-md border border-default p-3 flex items-center justify-between">
          <span class="text-sm text-muted">Liquidez utilizable con esta selección</span>
          <span class="text-lg font-semibold tabular-nums">{{ moneda(liquidezSimulada) }}</span>
        </div>

        <div>
          <p class="text-sm font-medium mb-2">Cuentas bancarias</p>
          <div class="space-y-1">
            <label v-for="b in bancos" :key="b.detalle_id ?? ''" class="flex items-center justify-between gap-2 text-sm py-1">
              <span class="flex items-center gap-2">
                <UCheckbox
                  :model-value="bancosSeleccionados.has(b.detalle_id ?? '')"
                  @update:model-value="() => b.detalle_id && alternarSeleccion(bancosSeleccionados, b.detalle_id)"
                />
                {{ b.detalle_nombre }}
              </span>
              <span class="text-muted tabular-nums">{{ moneda(b.monto_disponible) }}</span>
            </label>
            <p v-if="bancos.length === 0" class="text-xs text-muted">Sin cuentas bancarias activas.</p>
          </div>
        </div>

        <div>
          <p class="text-sm font-medium mb-2">Fondos</p>
          <div class="space-y-1">
            <label v-for="f in fondosFilas" :key="f.detalle_id ?? ''" class="flex items-center justify-between gap-2 text-sm py-1">
              <span class="flex items-center gap-2">
                <UCheckbox
                  :model-value="fondosSeleccionados.has(f.detalle_id ?? '')"
                  @update:model-value="() => f.detalle_id && alternarSeleccion(fondosSeleccionados, f.detalle_id)"
                />
                {{ f.detalle_nombre }}
                <UBadge v-if="f.naturaleza === 'restringido'" color="neutral" variant="soft" size="sm">Restringido</UBadge>
              </span>
              <span class="text-muted tabular-nums">{{ moneda(f.monto_disponible) }}</span>
            </label>
            <p v-if="fondosFilas.length === 0" class="text-xs text-muted">Sin fondos activos.</p>
          </div>
        </div>

        <UCheckbox v-model="incluirCaja" label="Incluir caja general" />

        <UFormField label="Acta de referencia (opcional)" name="acta">
          <UInput v-model="actaReferencia" class="w-full" placeholder="ej. Acta de junta directiva N.° 12" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerPoliticaAbierto = false">Cancelar</UButton>
          <UButton :loading="posicionStore.guardando" @click="guardarPolitica()">Guardar y activar</UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
