<script setup lang="ts">
// PC-5 · "Movimientos contables" — la primera pantalla del bloque contable.
//
// No muestra una tabla propia: muestra la PROYECCIÓN que contable_movimientos() deriva de los
// hechos que otros módulos ya registraron (cargos, recaudos, ejecución presupuestal, fondos).
// Por eso no hay aquí ningún botón de "crear asiento": no existe nada que crear.
//
// Antes de la tabla van dos bloques que importan más que la tabla misma:
//   • el cuadre (débito, crédito, diferencia), que debe dar 0 siempre porque el cuadre es
//     estructural en la función, no una validación posterior;
//   • los pendientes de parametrización, porque una exportación con cuentas sin resolver es
//     peor que no exportar — sale incompleta sin avisar.
// Exportar se bloquea mientras haya pendientes: es la regla del prompt maestro §55 (error de
// parametrización explícito, nunca fallo silencioso) aplicada a la salida.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

type MovimientoContable =
  Database['public']['Functions']['contable_movimientos']['Returns'][number]
type Cuadre = Database['public']['Functions']['contable_cuadre']['Returns'][number]
type Pendiente =
  Database['public']['Functions']['contable_parametrizacion_pendiente']['Returns'][number]
type ResumenMaterializacion =
  Database['public']['Functions']['fn_contabilizar_periodo']['Returns'][number]
type DiferenciaConciliacion =
  Database['public']['Functions']['contable_conciliacion_proyeccion']['Returns'][number]
type PeriodoRow = Database['public']['Tables']['periodos']['Row']

const tenantStore = useTenantStore()
const comprobantesStore = useComprobantesStore()

const hoy = new Date()
const desde = ref(`${hoy.getFullYear()}-01-01`)
const hasta = ref(`${hoy.getFullYear()}-12-31`)

const error = ref<string | null>(null)

const formatoMoneda = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

function moneda(valor: number | string): string {
  const n = Number(valor)
  return n === 0 ? '—' : formatoMoneda.format(n)
}

/** El resultado se devuelve desde useAsyncData en vez de escribirse en refs locales: solo lo
 * que retorna el handler viaja en el payload de SSR al cliente. Con refs locales el servidor
 * pintaba la tabla y el cliente arrancaba vacío — mismatch de hidratación (detectado al
 * verificar esta página en el navegador). Las páginas que cargan a un store de Pinia no tienen
 * el problema porque el store sí se serializa; esta no usa store, así que devuelve los datos. */
/** Un mapa `origen_entidad:origen_id` → `comprobante_id`, para poder enlazar cada línea de la
 * proyección al comprobante persistido que la contabilizó (CO-3 §4.5, trazabilidad bidireccional
 * del §57 del prompt maestro) — dos consultas en vez de un embed, para no depender de que
 * PostgREST descubra la FK de contable_comprobante_detalle hacia contable_comprobante. */
async function cargarMapaComprobantes(
  cliente: ReturnType<typeof useSupabaseClient<Database>>,
  tenantId: string,
): Promise<Map<string, string>> {
  const { data: comps, error: errComps } = await cliente
    .from('contable_comprobante')
    .select('id')
    .eq('tenant_id', tenantId)
    .gte('fecha', desde.value)
    .lte('fecha', hasta.value)
  if (errComps) throw errComps
  const idsComprobantes = (comps ?? []).map((c) => c.id)
  if (idsComprobantes.length === 0) return new Map()

  const { data: detalles, error: errDetalles } = await cliente
    .from('contable_comprobante_detalle')
    .select('origen_entidad, origen_id, comprobante_id')
    .in('comprobante_id', idsComprobantes)
    .not('origen_entidad', 'is', null)
  if (errDetalles) throw errDetalles

  const mapa = new Map<string, string>()
  for (const d of detalles ?? []) {
    if (d.origen_entidad && d.origen_id) mapa.set(`${d.origen_entidad}:${d.origen_id}`, d.comprobante_id)
  }
  return mapa
}

/** El resultado se devuelve desde useAsyncData en vez de escribirse en refs locales: solo lo
 * que retorna el handler viaja en el payload de SSR al cliente. Con refs locales el servidor
 * pintaba la tabla y el cliente arrancaba vacío — mismatch de hidratación (detectado al
 * verificar esta página en el navegador). Las páginas que cargan a un store de Pinia no tienen
 * el problema porque el store sí se serializa; esta no usa store, así que devuelve los datos. */
const { data, pending, refresh } = await useAsyncData(
  'contable-movimientos',
  async () => {
    const tenantId = tenantStore.activeTenant?.id
    if (!tenantId) return null

    if (desde.value > hasta.value) {
      error.value = 'La fecha "Desde" no puede ser posterior a "Hasta".'
      return null
    }

    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const rango = { p_tenant_id: tenantId, p_desde: desde.value, p_hasta: hasta.value }
      const [movs, cuad, pend, conc] = await Promise.all([
        cliente.rpc('contable_movimientos', rango),
        cliente.rpc('contable_cuadre', rango),
        cliente.rpc('contable_parametrizacion_pendiente', { p_tenant_id: tenantId }),
        cliente.rpc('contable_conciliacion_proyeccion', rango),
      ])
      if (movs.error) throw movs.error
      if (cuad.error) throw cuad.error
      if (pend.error) throw pend.error
      if (conc.error) throw conc.error
      const mapaComprobantes = await cargarMapaComprobantes(cliente, tenantId)
      await comprobantesStore.cargarPeriodos(tenantId)

      return {
        movimientos: (movs.data ?? []) as MovimientoContable[],
        cuadre: (cuad.data?.[0] ?? null) as Cuadre | null,
        pendientes: (pend.data ?? []) as Pendiente[],
        conciliacion: (conc.data ?? []) as DiferenciaConciliacion[],
        mapaComprobantes,
      }
    } catch (excepcion) {
      error.value = mensajeError(excepcion, 'No se pudieron cargar los movimientos contables.')
      return null
    }
  },
  // El rango de fechas es parte de la consulta: cambiarlo debe recargar, no solo refiltrar en
  // memoria — la función SQL ya acota por fecha y no tiene sentido traerlo todo.
  { watch: [desde, hasta] },
)

const movimientos = computed(() => data.value?.movimientos ?? [])
const cuadre = computed(() => data.value?.cuadre ?? null)
const pendientes = computed(() => data.value?.pendientes ?? [])
const conciliacion = computed(() => data.value?.conciliacion ?? [])
const mapaComprobantes = computed(() => data.value?.mapaComprobantes ?? new Map<string, string>())

const descuadrado = computed(() => Number(cuadre.value?.diferencia ?? 0) !== 0)
const sinCuenta = computed(() => Number(cuadre.value?.sin_cuenta ?? 0))
const puedeExportar = computed(
  () => movimientos.value.length > 0 && pendientes.value.length === 0 && !descuadrado.value,
)

function comprobanteDe(fila: MovimientoContable): string | null {
  return mapaComprobantes.value.get(`${fila.entidad}:${fila.origen_id}`) ?? null
}
function irAComprobante(comprobanteId: string): void {
  navigateTo({ path: '/contabilidad/comprobantes', query: { comprobante: comprobanteId } })
}

// ── CO-3 · Contabilizar periodo (§4.2/§4.5) ─────────────────────────────────
const periodoId = ref<string | null>(null)
const materializando = ref(false)
const resumenMaterializacion = ref<ResumenMaterializacion[] | null>(null)

const periodosOrdenados = computed(() =>
  [...comprobantesStore.periodos].sort((a, b) => (b.anio - a.anio) || (b.mes - a.mes)),
)
const opcionesPeriodo = computed(() =>
  periodosOrdenados.value.map((p: PeriodoRow) => ({
    value: p.id,
    label: `${p.anio}-${String(p.mes).padStart(2, '0')} — ${p.contable_estado}`,
  })),
)
const puedeContabilizar = computed(
  () => !!periodoId.value && pendientes.value.length === 0 && !materializando.value,
)

const resumenPorCategoria = computed(() => {
  const filas = resumenMaterializacion.value ?? []
  return {
    creado: filas.filter((r) => r.categoria === 'creado'),
    omitido: filas.filter((r) => r.categoria === 'omitido'),
    fallido: filas.filter((r) => r.categoria === 'fallido'),
    sin_contrapartida: filas.filter((r) => r.categoria === 'sin_contrapartida'),
  }
})

async function contabilizarPeriodo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !periodoId.value) return
  materializando.value = true
  error.value = null
  resumenMaterializacion.value = null
  try {
    const cliente = useSupabaseClient<Database>()
    const { data: resumen, error: errMat } = await cliente.rpc('fn_contabilizar_periodo', {
      p_tenant_id: tenantId,
      p_periodo_id: periodoId.value,
    })
    if (errMat) throw errMat
    resumenMaterializacion.value = (resumen ?? []) as ResumenMaterializacion[]
    await refresh()
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo contabilizar el periodo.')
  } finally {
    materializando.value = false
  }
}

const etiquetaOrigen: Record<string, string> = {
  cartera: 'Cartera',
  presupuesto: 'Presupuesto',
  fondos: 'Fondos',
}

/** Mismo patrón que PresupuestoTabEjecucion: SheetJS por carga dinámica, para que xlsx solo
 * pese en el bundle de quien efectivamente exporta. Las columnas siguen el orden que espera un
 * software contable externo al importar un libro diario. */
async function exportar(): Promise<void> {
  const XLSX = await import('xlsx')
  const encabezados = [
    'Fecha',
    'Cuenta',
    'Nombre de la cuenta',
    'Débito',
    'Crédito',
    'Documento',
    'Descripción',
    'Origen',
    'Entidad de origen',
    'Id de origen',
  ]
  const filas = movimientos.value.map((m) => [
    m.fecha,
    m.cuenta_codigo ?? '',
    m.cuenta_nombre ?? '',
    Math.round(Number(m.debito)),
    Math.round(Number(m.credito)),
    m.documento ?? '',
    m.descripcion ?? '',
    etiquetaOrigen[m.origen] ?? m.origen,
    m.entidad,
    m.origen_id,
  ])
  const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas])
  hoja['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 38 }, { wch: 16 }, { wch: 16 },
    { wch: 18 }, { wch: 40 }, { wch: 14 }, { wch: 22 }, { wch: 38 },
  ]
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Libro diario')
  XLSX.writeFile(libro, `movimientos-contables-${desde.value}-a-${hasta.value}.xlsx`)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Movimientos contables</h1>
        </template>
        <template #descripcion>
          Partida doble derivada de lo que ya está registrado: cuotas causadas, recaudos,
          ejecución presupuestal y movimientos de fondos. No se digita nada aquí — es la misma
          información, leída con criterio contable, lista para exportar a un sistema externo.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-end gap-2 flex-wrap">
        <UFormField label="Desde" name="desde">
          <UInput v-model="desde" type="date" />
        </UFormField>
        <UFormField label="Hasta" name="hasta">
          <UInput v-model="hasta" type="date" />
        </UFormField>
        <UFormField label="Periodo a contabilizar" name="periodo">
          <USelect
            :model-value="periodoId ?? undefined"
            :items="opcionesPeriodo"
            value-key="value"
            class="w-56"
            @update:model-value="(v) => (periodoId = (v as string) ?? null)"
          />
        </UFormField>
        <UButton
          icon="i-lucide-calculator"
          :loading="materializando"
          :disabled="!puedeContabilizar"
          @click="contabilizarPeriodo()"
        >
          Contabilizar periodo
        </UButton>
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="pending" @click="refresh()">
          Actualizar
        </UButton>
        <UButton
          icon="i-lucide-file-down"
          :disabled="!puedeExportar"
          @click="exportar()"
        >
          Exportar a Excel
        </UButton>
      </div>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <!-- Resumen de la última corrida de materialización (CO-3 §4.2/§4.5) -->
    <div v-if="resumenMaterializacion" class="rounded-lg border border-default p-4 space-y-3">
      <p class="text-sm font-medium">Resultado de la materialización</p>
      <div class="grid gap-4 sm:grid-cols-4 text-sm">
        <p>Creados: <span class="font-semibold">{{ resumenPorCategoria.creado.length }}</span></p>
        <p>Omitidos: <span class="font-semibold">{{ resumenPorCategoria.omitido.length }}</span></p>
        <p>
          Sin contrapartida:
          <span class="font-semibold">{{ resumenPorCategoria.sin_contrapartida.length }}</span>
        </p>
        <p>
          <span :class="resumenPorCategoria.fallido.length > 0 ? 'text-error-600 dark:text-error-400' : ''">
            Fallidos: <span class="font-semibold">{{ resumenPorCategoria.fallido.length }}</span>
          </span>
        </p>
      </div>
      <ul v-if="resumenPorCategoria.fallido.length > 0" class="list-disc pl-5 space-y-1 text-xs text-error-600 dark:text-error-400">
        <li v-for="f in resumenPorCategoria.fallido" :key="`${f.hecho_entidad}-${f.hecho_id}`">
          {{ f.hecho_entidad }} ({{ f.hecho_id }}) — {{ f.detalle }}
        </li>
      </ul>
      <ul v-if="resumenPorCategoria.sin_contrapartida.length > 0" class="list-disc pl-5 space-y-1 text-xs text-warning-600 dark:text-warning-400">
        <li v-for="f in resumenPorCategoria.sin_contrapartida" :key="`${f.hecho_entidad}-${f.hecho_id}`">
          {{ f.hecho_entidad }} ({{ f.hecho_id }}) — {{ f.detalle }}
        </li>
      </ul>
    </div>

    <!-- Conciliación proyección vs. persistido (CO-3 §4.3) — debe quedar vacía tras materializar -->
    <div
      class="rounded-lg border p-4"
      :class="conciliacion.length > 0
        ? 'border-error-300 dark:border-error-800 bg-error-50 dark:bg-error-950/30'
        : 'border-success-300 dark:border-success-800 bg-success-50 dark:bg-success-950/30'"
    >
      <p class="text-sm font-medium mb-2">
        {{ conciliacion.length > 0
          ? `Conciliación: ${conciliacion.length} cuenta(s) con diferencia entre lo proyectado y lo persistido`
          : 'Conciliación: la proyección y lo persistido coinciden' }}
      </p>
      <ul v-if="conciliacion.length > 0" class="list-disc pl-5 space-y-1 text-xs">
        <li v-for="c in conciliacion" :key="c.cuenta_codigo ?? 'sin-cuenta'">
          <span class="font-medium">{{ c.cuenta_codigo ?? 'sin cuenta' }}</span>
          — diferencia débito {{ moneda(c.diferencia_debito) }}, diferencia crédito {{ moneda(c.diferencia_credito) }}
        </li>
      </ul>
    </div>

    <!-- Control de cuadre: lo primero que mira un contador -->
    <div v-if="cuadre" class="grid gap-4 sm:grid-cols-4">
      <div class="rounded-lg border border-default p-4">
        <p class="text-xs text-muted uppercase tracking-wide">Líneas</p>
        <p class="text-lg font-semibold">{{ cuadre.lineas }}</p>
      </div>
      <div class="rounded-lg border border-default p-4">
        <p class="text-xs text-muted uppercase tracking-wide">Débitos</p>
        <p class="text-lg font-semibold">{{ moneda(cuadre.total_debito) }}</p>
      </div>
      <div class="rounded-lg border border-default p-4">
        <p class="text-xs text-muted uppercase tracking-wide">Créditos</p>
        <p class="text-lg font-semibold">{{ moneda(cuadre.total_credito) }}</p>
      </div>
      <div
        class="rounded-lg border p-4"
        :class="descuadrado
          ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
          : 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/30'"
      >
        <p class="text-xs text-muted uppercase tracking-wide">Diferencia</p>
        <p class="text-lg font-semibold">
          {{ descuadrado ? moneda(cuadre.diferencia) : 'Cuadrado' }}
        </p>
      </div>
    </div>

    <UAlert
      v-if="pendientes.length > 0"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :title="`Faltan ${pendientes.length} parametrización(es) por resolver`"
    >
      <template #description>
        <p class="mb-2">
          La exportación queda bloqueada: estos movimientos saldrían sin cuenta contable.
        </p>
        <ul class="list-disc pl-5 space-y-1 text-xs">
          <li v-for="(p, i) in pendientes.slice(0, 8)" :key="i">
            <span class="font-medium">{{ p.referencia }}</span> — {{ p.detalle }}
          </li>
        </ul>
        <p v-if="pendientes.length > 8" class="text-xs mt-1">
          …y {{ pendientes.length - 8 }} más.
        </p>
      </template>
    </UAlert>

    <UAlert
      v-else-if="sinCuenta > 0"
      color="warning"
      variant="soft"
      :title="`${sinCuenta} línea(s) sin cuenta contable resoluble`"
    />

    <UiTabla
      :columnas="[
        { clave: 'fecha', etiqueta: 'Fecha' },
        { clave: 'cuenta', etiqueta: 'Cuenta' },
        { clave: 'descripcion', etiqueta: 'Descripción' },
        { clave: 'debito', etiqueta: 'Débito', alinear: 'derecha' },
        { clave: 'credito', etiqueta: 'Crédito', alinear: 'derecha' },
        { clave: 'origen', etiqueta: 'Origen' },
        { clave: 'comprobante', etiqueta: '' },
      ]"
      :filas="movimientos"
      :clave-fila="(fila, indice) => `${fila.origen_id}-${indice}`"
      vacio="No hay movimientos contables en el rango seleccionado."
    >
      <template #celda-fecha="{ fila }">
        <span class="tabular-nums text-xs">{{ fila.fecha }}</span>
      </template>
      <template #celda-cuenta="{ fila }">
        <span v-if="fila.cuenta_codigo" class="tabular-nums">
          <span class="font-medium">{{ fila.cuenta_codigo }}</span>
          <span class="text-muted"> · {{ fila.cuenta_nombre }}</span>
        </span>
        <UBadge v-else color="warning" variant="subtle" size="xs">Sin parametrizar</UBadge>
      </template>
      <template #celda-descripcion="{ fila }">
        <span class="text-xs">{{ fila.descripcion }}</span>
      </template>
      <template #celda-debito="{ fila }">
        <span class="tabular-nums">{{ moneda(fila.debito) }}</span>
      </template>
      <template #celda-credito="{ fila }">
        <span class="tabular-nums">{{ moneda(fila.credito) }}</span>
      </template>
      <template #celda-origen="{ fila }">
        <UBadge variant="subtle" size="xs">{{ etiquetaOrigen[fila.origen] ?? fila.origen }}</UBadge>
      </template>
      <template #celda-comprobante="{ fila }">
        <UButton
          v-if="comprobanteDe(fila)"
          variant="ghost"
          size="xs"
          icon="i-lucide-external-link"
          @click="irAComprobante(comprobanteDe(fila)!)"
        >
          Ver comprobante
        </UButton>
      </template>
    </UiTabla>
  </div>
</template>
