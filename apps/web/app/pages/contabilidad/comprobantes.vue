<script setup lang="ts">
// CO-2 · Núcleo del libro contable — comprobante con partida doble persistida.
//
// Todavía no contabiliza ninguna operación real de cartera/presupuesto/fondos (CO-3 conecta
// eso); aquí solo existe la captura manual y el ciclo borrador → contabilizado → anulado, más
// la reversión. `numero` nunca se edita aquí: lo asigna fn_contabilizar_comprobante.
import type { Database } from '@aquila/shared'
import type { NuevaLineaDetalle } from '~/stores/comprobantes'

type ComprobanteRow = Database['public']['Tables']['contable_comprobante']['Row']
type EstadoComprobante = Database['public']['Enums']['contable_comprobante_estado_t']

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const comprobantesStore = useComprobantesStore()
const contabilidadStore = useContabilidadStore()

const error = ref<string | null>(null)
const aviso = ref<string | null>(null)
const trabajando = ref(false)

// ── filtros ────────────────────────────────────────────────────────────
const filtroPeriodo = ref<string | null>(null)
const filtroTipo = ref<number | null>(null)
const filtroEstado = ref<EstadoComprobante | null>(null)

await useAsyncData('contable-comprobantes', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
  await Promise.all([
    comprobantesStore.cargarTipos(),
    comprobantesStore.cargarPeriodos(tenantId),
    comprobantesStore.cargarComprobantes(tenantId),
    contabilidadStore.cargarPlan(tenantId),
  ])
  return true
})

async function refrescar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await comprobantesStore.cargarComprobantes(tenantId, {
    periodoId: filtroPeriodo.value ?? undefined,
    tipoId: filtroTipo.value ?? undefined,
    estado: filtroEstado.value ?? undefined,
  })
}

const periodoPorId = computed(() => new Map(comprobantesStore.periodos.map((p) => [p.id, p])))
const tipoPorId = computed(() => new Map(comprobantesStore.tipos.map((t) => [t.id, t])))

function numeroFormateado(c: ComprobanteRow): string {
  const tipo = tipoPorId.value.get(c.tipo_id)
  const codigo = tipo?.codigo ?? '?'
  if (c.numero === null) return `${codigo}-${c.anio}-(borrador)`
  return `${codigo}-${c.anio}-${String(c.numero).padStart(6, '0')}`
}

const ETIQUETA_ESTADO: Record<EstadoComprobante, string> = {
  borrador: 'Borrador',
  contabilizado: 'Contabilizado',
  anulado: 'Anulado',
}
const COLOR_ESTADO: Record<EstadoComprobante, 'neutral' | 'success' | 'error'> = {
  borrador: 'neutral',
  contabilizado: 'success',
  anulado: 'error',
}

// ── detalle / drawer ──────────────────────────────────────────────────────
const comprobanteAbierto = ref<ComprobanteRow | null>(null)
const motivoAccion = ref('')
const periodoReversion = ref<string | null>(null)

async function abrirDetalle(c: ComprobanteRow): Promise<void> {
  comprobanteAbierto.value = c
  motivoAccion.value = ''
  periodoReversion.value = null
  await comprobantesStore.cargarDetalle(c.id)
}
function cerrarDetalle(): void {
  comprobanteAbierto.value = null
}

// Enlace entrante desde movimientos.vue (CO-3 §4.5, trazabilidad bidireccional): ?comprobante=<id>
// abre el drawer directamente, sin que el usuario tenga que buscarlo en la tabla.
const route = useRoute()
onMounted(async () => {
  const idDesdeUrl = route.query.comprobante
  if (typeof idDesdeUrl !== 'string') return
  const encontrado = comprobantesStore.comprobantes.find((c) => c.id === idDesdeUrl)
  if (encontrado) await abrirDetalle(encontrado)
})


const totalDebito = computed(() =>
  comprobantesStore.detalle.reduce((s, l) => s + Number(l.debito), 0),
)
const totalCredito = computed(() =>
  comprobantesStore.detalle.reduce((s, l) => s + Number(l.credito), 0),
)
const diferencia = computed(() => totalDebito.value - totalCredito.value)

const reversaOrigen = computed(() => {
  const id = comprobanteAbierto.value?.reversa_comprobante_id
  return id ? comprobantesStore.comprobantes.find((c) => c.id === id) : null
})
const reversadoPor = computed(() => {
  const id = comprobanteAbierto.value?.reversado_por_id
  return id ? comprobantesStore.comprobantes.find((c) => c.id === id) : null
})

async function accionContabilizar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !comprobanteAbierto.value) return
  trabajando.value = true
  error.value = null
  try {
    await comprobantesStore.contabilizar(tenantId, comprobanteAbierto.value.id)
    aviso.value = 'Comprobante contabilizado.'
    cerrarDetalle()
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo contabilizar.')
  } finally {
    trabajando.value = false
  }
}

async function accionAnular(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !comprobanteAbierto.value) return
  if (!motivoAccion.value.trim()) {
    error.value = 'El motivo de anulación es obligatorio.'
    return
  }
  trabajando.value = true
  error.value = null
  try {
    await comprobantesStore.anular(tenantId, comprobanteAbierto.value.id, motivoAccion.value)
    aviso.value = 'Comprobante anulado.'
    cerrarDetalle()
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo anular.')
  } finally {
    trabajando.value = false
  }
}

async function accionReversar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !comprobanteAbierto.value) return
  if (!periodoReversion.value) {
    error.value = 'Selecciona el periodo destino de la reversión.'
    return
  }
  if (!motivoAccion.value.trim()) {
    error.value = 'El motivo de la reversión es obligatorio.'
    return
  }
  trabajando.value = true
  error.value = null
  try {
    await comprobantesStore.reversar(
      tenantId,
      comprobanteAbierto.value.id,
      periodoReversion.value,
      motivoAccion.value,
    )
    aviso.value = 'Comprobante reversado.'
    cerrarDetalle()
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo reversar.')
  } finally {
    trabajando.value = false
  }
}

async function accionEliminar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !comprobanteAbierto.value) return
  trabajando.value = true
  error.value = null
  try {
    await comprobantesStore.eliminarComprobante(tenantId, comprobanteAbierto.value.id)
    aviso.value = 'Borrador eliminado.'
    cerrarDetalle()
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo eliminar.')
  } finally {
    trabajando.value = false
  }
}

// ── formulario de comprobante manual ──────────────────────────────────────
const creando = ref(false)
const nuevoPeriodoId = ref<string | null>(null)
const nuevoTipoId = ref<number | null>(null)
const nuevaFecha = ref(new Date().toISOString().slice(0, 10))
const nuevaDescripcion = ref('')
const nuevasLineas = ref<NuevaLineaDetalle[]>([
  { cuentaId: '', debito: 0, credito: 0 },
  { cuentaId: '', debito: 0, credito: 0 },
])

const opcionesCuenta = computed(() =>
  contabilidadStore.cuentasDeMovimiento.map((c) => ({
    valor: c.id,
    etiqueta: `${c.codigo} — ${c.nombre}`,
  })),
)

function agregarLinea(): void {
  nuevasLineas.value = [...nuevasLineas.value, { cuentaId: '', debito: 0, credito: 0 }]
}
function quitarLinea(i: number): void {
  if (nuevasLineas.value.length <= 2) return
  nuevasLineas.value = nuevasLineas.value.filter((_, idx) => idx !== i)
}

const nuevoTotalDebito = computed(() =>
  nuevasLineas.value.reduce((s, l) => s + (Number(l.debito) || 0), 0),
)
const nuevoTotalCredito = computed(() =>
  nuevasLineas.value.reduce((s, l) => s + (Number(l.credito) || 0), 0),
)
const nuevoCuadrado = computed(
  () => nuevoTotalDebito.value === nuevoTotalCredito.value && nuevoTotalDebito.value > 0,
)

function abrirCreacion(): void {
  creando.value = true
  nuevoPeriodoId.value = comprobantesStore.periodos[0]?.id ?? null
  nuevoTipoId.value = comprobantesStore.tiposCaptura[0]?.id ?? null
  nuevaFecha.value = new Date().toISOString().slice(0, 10)
  nuevaDescripcion.value = ''
  nuevasLineas.value = [
    { cuentaId: '', debito: 0, credito: 0 },
    { cuentaId: '', debito: 0, credito: 0 },
  ]
}
function cerrarCreacion(): void {
  creando.value = false
}

async function guardarBorrador(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nuevoPeriodoId.value || !nuevoTipoId.value) return
  const periodo = periodoPorId.value.get(nuevoPeriodoId.value)
  if (!periodo) return
  trabajando.value = true
  error.value = null
  try {
    await comprobantesStore.crearComprobante({
      tenantId,
      periodoId: nuevoPeriodoId.value,
      tipoId: nuevoTipoId.value,
      anio: periodo.anio,
      fecha: nuevaFecha.value,
      descripcion: nuevaDescripcion.value,
      lineas: nuevasLineas.value.filter((l) => l.cuentaId),
    })
    aviso.value = 'Borrador creado.'
    cerrarCreacion()
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear el comprobante.')
  } finally {
    trabajando.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion>
        <template #titulo>
          <h1 class="text-xl font-semibold">Comprobantes contables</h1>
        </template>
        <template #descripcion>
          Comprobante con partida doble persistida. Un comprobante contabilizado es inmutable;
          se corrige con una reversión, nunca editándolo.
        </template>
      </UiTituloDescripcion>
      <UButton icon="i-lucide-plus" @click="abrirCreacion">Nuevo comprobante</UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />
    <UAlert v-if="aviso" color="success" variant="soft" :title="aviso" />

    <div class="flex items-center gap-2 flex-wrap">
      <USelect
        :model-value="filtroPeriodo ?? undefined"
        :items="comprobantesStore.periodos.map((p) => ({ label: `${p.anio}-${String(p.mes).padStart(2, '0')}`, value: p.id }))"
        placeholder="Todos los periodos"
        class="w-40"
        @update:model-value="(v) => { filtroPeriodo = (v as string) ?? null; refrescar() }"
      />
      <USelect
        :model-value="filtroTipo ?? undefined"
        :items="comprobantesStore.tipos.map((t) => ({ label: t.nombre, value: t.id }))"
        placeholder="Todos los tipos"
        class="w-48"
        @update:model-value="(v) => { filtroTipo = (v as number) ?? null; refrescar() }"
      />
      <USelect
        :model-value="filtroEstado ?? undefined"
        :items="[
          { label: 'Borrador', value: 'borrador' },
          { label: 'Contabilizado', value: 'contabilizado' },
          { label: 'Anulado', value: 'anulado' },
        ]"
        placeholder="Todos los estados"
        class="w-40"
        @update:model-value="(v) => { filtroEstado = (v as EstadoComprobante) ?? null; refrescar() }"
      />
    </div>

    <UiTabla
      :columnas="[
        { clave: 'numero', etiqueta: 'Número' },
        { clave: 'fecha', etiqueta: 'Fecha' },
        { clave: 'descripcion', etiqueta: 'Descripción' },
        { clave: 'estado', etiqueta: 'Estado' },
      ]"
      :filas="comprobantesStore.comprobantes"
      :clave-fila="(fila) => fila.id"
      :vacio="'Sin comprobantes.'"
    >
      <template #celda-numero="{ fila }">
        <button type="button" class="hover:underline font-medium tabular-nums" @click="abrirDetalle(fila)">
          {{ numeroFormateado(fila) }}
        </button>
      </template>
      <template #celda-estado="{ fila }">
        <UBadge :color="COLOR_ESTADO[fila.estado]" variant="subtle" size="xs">
          {{ ETIQUETA_ESTADO[fila.estado] }}
        </UBadge>
      </template>
    </UiTabla>

    <!-- ── Detalle ── -->
    <UiDrawer :abierto="!!comprobanteAbierto" titulo="Comprobante" ancho="ancho" @cerrar="cerrarDetalle">
      <div v-if="comprobanteAbierto" class="space-y-4">
        <div class="flex items-center gap-2">
          <span class="font-medium tabular-nums">{{ numeroFormateado(comprobanteAbierto) }}</span>
          <UBadge :color="COLOR_ESTADO[comprobanteAbierto.estado]" variant="subtle" size="xs">
            {{ ETIQUETA_ESTADO[comprobanteAbierto.estado] }}
          </UBadge>
        </div>
        <p class="text-sm">{{ comprobanteAbierto.descripcion }}</p>
        <p v-if="reversaOrigen" class="text-xs text-muted">
          Reversa a
          <button class="underline" @click="abrirDetalle(reversaOrigen)">
            {{ numeroFormateado(reversaOrigen) }}
          </button>
        </p>
        <p v-if="reversadoPor" class="text-xs text-muted">
          Reversado por
          <button class="underline" @click="abrirDetalle(reversadoPor)">
            {{ numeroFormateado(reversadoPor) }}
          </button>
        </p>

        <UiTabla
          :columnas="[
            { clave: 'linea', etiqueta: '#' },
            { clave: 'cuenta', etiqueta: 'Cuenta' },
            { clave: 'debito', etiqueta: 'Débito', alinear: 'derecha' },
            { clave: 'credito', etiqueta: 'Crédito', alinear: 'derecha' },
          ]"
          :filas="comprobantesStore.detalle"
          :clave-fila="(fila) => fila.id"
        >
          <template #celda-cuenta="{ fila }">
            {{ contabilidadStore.cuentas.find((c) => c.id === fila.cuenta_id)?.codigo ?? fila.cuenta_id }}
          </template>
          <template #celda-debito="{ fila }">
            <span class="tabular-nums">{{ Number(fila.debito) > 0 ? formatoMoneda(fila.debito) : '—' }}</span>
          </template>
          <template #celda-credito="{ fila }">
            <span class="tabular-nums">{{ Number(fila.credito) > 0 ? formatoMoneda(fila.credito) : '—' }}</span>
          </template>
        </UiTabla>

        <div class="flex items-center justify-end gap-4 text-sm tabular-nums">
          <span>Débito: {{ formatoMoneda(totalDebito) }}</span>
          <span>Crédito: {{ formatoMoneda(totalCredito) }}</span>
          <span :class="diferencia === 0 ? 'text-muted' : 'text-error font-semibold'">
            Diferencia: {{ formatoMoneda(diferencia) }}
          </span>
        </div>

        <div v-if="comprobanteAbierto.estado === 'borrador'" class="flex items-center gap-2">
          <UButton :loading="trabajando" :disabled="diferencia !== 0" @click="accionContabilizar">
            Contabilizar
          </UButton>
          <UButton variant="ghost" color="error" :loading="trabajando" @click="accionEliminar">
            Eliminar borrador
          </UButton>
        </div>

        <div v-else-if="comprobanteAbierto.estado === 'contabilizado'" class="space-y-3 border-t border-default pt-3">
          <UTextarea v-model="motivoAccion" placeholder="Motivo (obligatorio)" :rows="2" class="w-full" />
          <div class="flex items-center gap-2 flex-wrap">
            <USelect
              :model-value="periodoReversion ?? undefined"
              :items="comprobantesStore.periodos.map((p) => ({ label: `${p.anio}-${String(p.mes).padStart(2, '0')}`, value: p.id }))"
              placeholder="Periodo destino de la reversión"
              class="w-56"
              @update:model-value="(v) => (periodoReversion = (v as string) ?? null)"
            />
            <UButton variant="soft" :loading="trabajando" @click="accionReversar">Reversar</UButton>
            <UButton variant="ghost" color="error" :loading="trabajando" @click="accionAnular">Anular</UButton>
          </div>
        </div>
      </div>
    </UiDrawer>

    <!-- ── Crear ── -->
    <UiDrawer :abierto="creando" titulo="Nuevo comprobante" ancho="ancho" @cerrar="cerrarCreacion">
      <form class="space-y-4" @submit.prevent="guardarBorrador">
        <div class="grid gap-3 sm:grid-cols-3">
          <UFormField label="Periodo">
            <USelect
              :model-value="nuevoPeriodoId ?? undefined"
              :items="comprobantesStore.periodos.map((p) => ({ label: `${p.anio}-${String(p.mes).padStart(2, '0')}`, value: p.id }))"
              @update:model-value="(v) => (nuevoPeriodoId = (v as string) ?? null)"
            />
          </UFormField>
          <UFormField label="Tipo">
            <USelect
              :model-value="nuevoTipoId ?? undefined"
              :items="comprobantesStore.tiposCaptura.map((t) => ({ label: t.nombre, value: t.id }))"
              @update:model-value="(v) => (nuevoTipoId = (v as number) ?? null)"
            />
          </UFormField>
          <UFormField label="Fecha">
            <UInput v-model="nuevaFecha" type="date" />
          </UFormField>
        </div>
        <UFormField label="Descripción">
          <UInput v-model="nuevaDescripcion" class="w-full" />
        </UFormField>

        <div class="space-y-2">
          <div v-for="(linea, i) in nuevasLineas" :key="i" class="flex items-center gap-2">
            <UiSelectorBuscable
              v-model="linea.cuentaId"
              :opciones="opcionesCuenta"
              placeholder="Cuenta…"
              class="flex-1"
            />
            <UInput v-model.number="linea.debito" type="number" step="0.01" placeholder="Débito" class="w-32" />
            <UInput v-model.number="linea.credito" type="number" step="0.01" placeholder="Crédito" class="w-32" />
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-trash-2"
              :disabled="nuevasLineas.length <= 2"
              @click="quitarLinea(i)"
            />
          </div>
          <UButton size="xs" variant="ghost" icon="i-lucide-plus" @click="agregarLinea">
            Agregar línea
          </UButton>
        </div>

        <div class="flex items-center justify-end gap-4 text-sm tabular-nums">
          <span>Débito: {{ formatoMoneda(nuevoTotalDebito) }}</span>
          <span>Crédito: {{ formatoMoneda(nuevoTotalCredito) }}</span>
          <span :class="nuevoCuadrado ? 'text-muted' : 'text-error font-semibold'">
            Diferencia: {{ formatoMoneda(nuevoTotalDebito - nuevoTotalCredito) }}
          </span>
        </div>

        <UButton type="submit" :loading="trabajando">Guardar borrador</UButton>
        <p class="text-xs text-muted">
          El borrador se guarda aunque no cuadre. Para contabilizarlo (asignarle número), ábrelo
          desde la lista una vez cuadrado.
        </p>
      </form>
    </UiDrawer>
  </div>
</template>
