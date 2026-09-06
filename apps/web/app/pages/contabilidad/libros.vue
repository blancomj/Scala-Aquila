<script setup lang="ts">
// CO-4 · Libros oficiales de contabilidad — Diario, Mayor, Balance de prueba,
// Inventarios y Balances (§3 del corte).
//
// Los cuatro son vistas de solo lectura sobre lo ya persistido
// (contable_comprobante/detalle, CO-2/CO-3) — nada se digita aquí, igual que
// movimientos.vue (PC-5/CO-3) con la proyección. La diferencia es la fuente:
// movimientos.vue lee la proyección (contable_movimientos, previa a
// materializar); estos cuatro leen el libro ya contabilizado.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const contabilidadStore = useContabilidadStore()
const librosStore = useLibrosStore()
const route = useRoute()

const hoy = new Date()
const desde = ref(`${hoy.getFullYear()}-01-01`)
const hasta = ref(`${hoy.getFullYear()}-12-31`)
const fechaCorte = ref(hasta.value)
const nivel = ref(5)
// Prefiltro por query (?cuenta=<uuid>) — así FIN-1 (posicion.vue) puede enlazar el saldo de una
// cuenta bancaria directo al Mayor filtrado, sin que esta página deje de funcionar sin el query.
const cuentaFiltro = ref(typeof route.query.cuenta === 'string' ? route.query.cuenta : '')

const pestanaActiva = ref<'diario' | 'mayor' | 'balance' | 'inventarios'>(
  cuentaFiltro.value ? 'mayor' : 'diario',
)
const PESTANAS = [
  { label: 'Diario', value: 'diario' as const },
  { label: 'Mayor', value: 'mayor' as const },
  { label: 'Balance de prueba', value: 'balance' as const },
  { label: 'Inventarios y Balances', value: 'inventarios' as const },
]

const error = ref<string | null>(null)
const exportando = ref(false)

const formatoMoneda = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
})
function moneda(valor: number | string | null): string {
  const n = Number(valor ?? 0)
  return n === 0 ? '—' : formatoMoneda.format(n)
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await contabilidadStore.cargarMarcoContable(tenantId)
    if (pestanaActiva.value === 'diario') {
      await librosStore.cargarDiario(tenantId, desde.value, hasta.value)
    } else if (pestanaActiva.value === 'mayor') {
      await librosStore.cargarMayor(tenantId, desde.value, hasta.value, cuentaFiltro.value || undefined)
    } else if (pestanaActiva.value === 'balance') {
      await librosStore.cargarBalance(tenantId, desde.value, hasta.value, nivel.value)
    } else {
      await librosStore.cargarInventariosBalances(tenantId, fechaCorte.value)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al cargar el libro'
  }
}

watch(pestanaActiva, () => { void cargar() })

onMounted(() => { void cargar() })

const cuadre = computed(() =>
  librosStore.inventarios.find((f) => f.codigo === 'CUADRE') ?? null,
)
const filasBalanceSaldo = computed(() => {
  const sumaDebito = librosStore.balance.reduce(
    (s, f) => s + (f.naturaleza === 'debito' ? Math.max(f.saldo_final, 0) : Math.max(-f.saldo_final, 0)), 0,
  )
  const sumaCredito = librosStore.balance.reduce(
    (s, f) => s + (f.naturaleza === 'credito' ? Math.max(f.saldo_final, 0) : Math.max(-f.saldo_final, 0)), 0,
  )
  return { sumaDebito, sumaCredito }
})

/** Mismo patrón que movimientos.vue (PC-5): xlsx por import dinámico, para que solo pese en el
 * bundle de quien exporta. */
async function exportarExcel(
  libro: 'diario' | 'mayor' | 'balance_prueba',
  encabezados: string[],
  filas: (string | number)[][],
  nombreArchivo: string,
): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  exportando.value = true
  try {
    await librosStore.registrarExportacion(tenantId, libro, 'excel', { desde: desde.value, hasta: hasta.value })
    const XLSX = await import('xlsx')
    const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas])
    const libroXlsx = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(libroXlsx, hoja, nombreArchivo.slice(0, 31))
    XLSX.writeFile(libroXlsx, `${nombreArchivo}-${desde.value}-a-${hasta.value}.xlsx`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al exportar'
  } finally {
    exportando.value = false
  }
}

function exportarDiario(): Promise<void> {
  return exportarExcel(
    'diario',
    ['Fecha', 'Comprobante', 'Cuenta', 'Nombre', 'Descripción', 'Débito', 'Crédito'],
    librosStore.diario.map((f) => [f.fecha, f.comprobante, f.cuenta_codigo, f.cuenta_nombre, f.descripcion ?? '', Math.round(f.debito), Math.round(f.credito)]),
    'Libro diario',
  )
}
function exportarMayor(): Promise<void> {
  return exportarExcel(
    'mayor',
    ['Cuenta', 'Nombre', 'Naturaleza', 'Saldo inicial', 'Movimiento débito', 'Movimiento crédito', 'Saldo final'],
    librosStore.mayor.map((f) => [f.cuenta_codigo, f.cuenta_nombre, f.naturaleza, Math.round(f.saldo_inicial), Math.round(f.movimiento_debito), Math.round(f.movimiento_credito), Math.round(f.saldo_final)]),
    'Libro mayor',
  )
}
function exportarBalance(): Promise<void> {
  return exportarExcel(
    'balance_prueba',
    ['Código', 'Nombre', 'Naturaleza', 'Saldo anterior', 'Débitos periodo', 'Créditos periodo', 'Saldo final'],
    librosStore.balance.map((f) => [f.codigo, f.nombre, f.naturaleza, Math.round(f.saldo_anterior), Math.round(f.debitos_periodo), Math.round(f.creditos_periodo), Math.round(f.saldo_final)]),
    'Balance de prueba',
  )
}

/** pdfmake exige un color literal (hex/rgb/nombre), no puede leer variables CSS — D-26 prohíbe
 * un hex hardcodeado en el archivo. Se resuelve en runtime: un elemento oculto con la clase
 * semántica de Nuxt UI (`text-error-600`, ya usada en comprobantes.vue/movimientos.vue) y se lee
 * su color ya computado por el tema activo (claro/oscuro), convertido a hex para pdfmake. Cero
 * hex propio en este archivo — el valor sale siempre del tema, nunca de una constante aquí. */
function colorTemaComputado(claseTailwind: string): string {
  const el = document.createElement('span')
  el.className = claseTailwind
  el.style.position = 'absolute'
  el.style.visibility = 'hidden'
  document.body.appendChild(el)
  const rgb = getComputedStyle(el).color
  document.body.removeChild(el)
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb)
  if (!match) return 'black'
  const componente = (n: string): string => Number(n).toString(16).padStart(2, '0')
  return ['#', componente(match[1]!), componente(match[2]!), componente(match[3]!)].join('')
}

/** PDF para el Libro de Inventarios y Balances (§3.6) — reservado a este libro y a cualquier
 * libro destinado a firma. pdfmake por import dinámico, mismo criterio que xlsx. */
async function exportarInventariosPdf(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  exportando.value = true
  try {
    await librosStore.registrarExportacion(tenantId, 'inventarios_balances', 'pdf', { fecha_corte: fechaCorte.value })
    const pdfMake = (await import('pdfmake/build/pdfmake')).default
    const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default as unknown as { pdfMake?: { vfs: Record<string, string> }; vfs?: Record<string, string> }
    pdfMake.vfs = pdfFonts.pdfMake?.vfs ?? pdfFonts.vfs ?? {}

    const marco = contabilidadStore.marcoContable
    const cuerpo = librosStore.inventarios
      .filter((f) => f.codigo !== 'CUADRE')
      .map((f) => [f.codigo, f.nombre, moneda(f.saldo)])

    const contenido: import('pdfmake/interfaces').Content[] = [
      { text: 'Libro de Inventarios y Balances', style: 'titulo' },
      { text: `Copropiedad: ${tenantStore.activeTenant?.name ?? ''}`, style: 'sub' },
      { text: `Fecha de corte: ${fechaCorte.value}`, style: 'sub' },
      {
        text: marco?.clasificado
          ? `Marco de información financiera: ${marco.marco_grupo ?? ''}`
          : 'ADVERTENCIA: copropiedad sin clasificar — marco de información financiera pendiente',
        style: marco?.clasificado ? 'sub' : 'advertencia',
      },
      { text: `Generado: ${new Date().toLocaleString('es-CO')}`, style: 'sub', margin: [0, 0, 0, 12] },
      { table: { headerRows: 1, widths: ['auto', '*', 'auto'], body: [['Código', 'Cuenta', 'Saldo'], ...cuerpo] } },
    ]
    if (cuadre.value) {
      contenido.push({
        text: `CUADRE — Activo = Pasivo + Patrimonio + Resultado: ${cuadre.value.cuadra ? 'cuadra' : `NO cuadra (diferencia ${moneda(cuadre.value.diferencia)})`}`,
        style: cuadre.value.cuadra ? 'sub' : 'advertencia',
        margin: [0, 12, 0, 0],
      })
    }

    pdfMake.createPdf({
      content: contenido,
      styles: {
        titulo: { fontSize: 16, bold: true, margin: [0, 0, 0, 8] },
        sub: { fontSize: 9, margin: [0, 0, 0, 2] },
        advertencia: { fontSize: 9, bold: true, color: colorTemaComputado('text-error-600'), margin: [0, 0, 0, 2] },
      },
    }).download(`inventarios-balances-${fechaCorte.value}.pdf`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al exportar PDF'
  } finally {
    exportando.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Libros oficiales</h1>
        </template>
        <template #descripcion>
          Diario, Mayor, Balance de prueba e Inventarios y Balances — vistas de solo lectura sobre
          lo ya contabilizado. Ningún libro persiste datos nuevos.
        </template>
      </UiTituloDescripcion>
    </div>

    <ContabilidadBannerSinClasificar :clasificado="contabilidadStore.marcoContable?.clasificado ?? false" />

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <UTabs
:items="PESTANAS" :model-value="pestanaActiva" variant="link" :content="false" class="w-full"
      @update:model-value="(v) => (pestanaActiva = v as typeof pestanaActiva)" />

    <div class="flex items-end gap-2 flex-wrap">
      <template v-if="pestanaActiva !== 'inventarios'">
        <UFormField label="Desde" name="desde">
          <UInput v-model="desde" type="date" @change="cargar()" />
        </UFormField>
        <UFormField label="Hasta" name="hasta">
          <UInput v-model="hasta" type="date" @change="cargar()" />
        </UFormField>
      </template>
      <UFormField v-if="pestanaActiva === 'mayor'" label="Cuenta (código, opcional)" name="cuenta">
        <UInput v-model="cuentaFiltro" placeholder="p. ej. 1305" class="w-40" @change="cargar()" />
      </UFormField>
      <UFormField v-if="pestanaActiva === 'balance'" label="Nivel" name="nivel">
        <USelect
          :model-value="nivel"
          :items="[{ label: '1 — Clase', value: 1 }, { label: '2 — Grupo', value: 2 }, { label: '3 — Cuenta', value: 3 }, { label: '4 — Subcuenta', value: 4 }, { label: '5 — Auxiliar', value: 5 }]"
          value-key="value"
          class="w-40"
          @update:model-value="(v) => { nivel = v as number; cargar() }"
        />
      </UFormField>
      <UFormField v-if="pestanaActiva === 'inventarios'" label="Fecha de corte" name="fechaCorte">
        <UInput v-model="fechaCorte" type="date" @change="cargar()" />
      </UFormField>
      <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="librosStore.loading" @click="cargar()">
        Actualizar
      </UButton>
      <UButton v-if="pestanaActiva === 'diario'" icon="i-lucide-file-down" :loading="exportando" :disabled="librosStore.diario.length === 0" @click="exportarDiario()">
        Exportar a Excel
      </UButton>
      <UButton v-if="pestanaActiva === 'mayor'" icon="i-lucide-file-down" :loading="exportando" :disabled="librosStore.mayor.length === 0" @click="exportarMayor()">
        Exportar a Excel
      </UButton>
      <UButton v-if="pestanaActiva === 'balance'" icon="i-lucide-file-down" :loading="exportando" :disabled="librosStore.balance.length === 0" @click="exportarBalance()">
        Exportar a Excel
      </UButton>
      <UButton v-if="pestanaActiva === 'inventarios'" icon="i-lucide-file-down" :loading="exportando" :disabled="librosStore.inventarios.length === 0" @click="exportarInventariosPdf()">
        Exportar a PDF
      </UButton>
    </div>

    <!-- Diario -->
    <div v-if="pestanaActiva === 'diario'" class="overflow-x-auto rounded-lg border border-default">
      <table class="w-full text-sm">
        <thead class="bg-muted/30">
          <tr>
            <th class="p-2 text-left">Fecha</th><th class="p-2 text-left">Comprobante</th>
            <th class="p-2 text-left">Cuenta</th><th class="p-2 text-left">Descripción</th>
            <th class="p-2 text-right">Débito</th><th class="p-2 text-right">Crédito</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(f, i) in librosStore.diario" :key="i" class="border-t border-default">
            <td class="p-2">{{ f.fecha }}</td>
            <td class="p-2">{{ f.comprobante }}</td>
            <td class="p-2">{{ f.cuenta_codigo }} — {{ f.cuenta_nombre }}</td>
            <td class="p-2">{{ f.descripcion }}</td>
            <td class="p-2 text-right">{{ moneda(f.debito) }}</td>
            <td class="p-2 text-right">{{ moneda(f.credito) }}</td>
          </tr>
          <tr v-if="librosStore.diario.length === 0"><td colspan="6" class="p-4 text-center text-muted">Sin movimientos en el rango.</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Mayor -->
    <div v-if="pestanaActiva === 'mayor'" class="overflow-x-auto rounded-lg border border-default">
      <table class="w-full text-sm">
        <thead class="bg-muted/30">
          <tr>
            <th class="p-2 text-left">Cuenta</th><th class="p-2 text-left">Naturaleza</th>
            <th class="p-2 text-right">Saldo inicial</th><th class="p-2 text-right">Mov. débito</th>
            <th class="p-2 text-right">Mov. crédito</th><th class="p-2 text-right">Saldo final</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in librosStore.mayor" :key="f.cuenta_id" class="border-t border-default">
            <td class="p-2">{{ f.cuenta_codigo }} — {{ f.cuenta_nombre }}</td>
            <td class="p-2 capitalize">{{ f.naturaleza }}</td>
            <td class="p-2 text-right">{{ moneda(f.saldo_inicial) }}</td>
            <td class="p-2 text-right">{{ moneda(f.movimiento_debito) }}</td>
            <td class="p-2 text-right">{{ moneda(f.movimiento_credito) }}</td>
            <td class="p-2 text-right font-medium">{{ moneda(f.saldo_final) }}</td>
          </tr>
          <tr v-if="librosStore.mayor.length === 0"><td colspan="6" class="p-4 text-center text-muted">Sin movimientos en el rango.</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Balance de prueba -->
    <div v-if="pestanaActiva === 'balance'" class="space-y-3">
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="rounded-lg border border-default p-4">
          <p class="text-xs text-muted uppercase tracking-wide">Suma saldos débito</p>
          <p class="text-lg font-semibold">{{ moneda(filasBalanceSaldo.sumaDebito) }}</p>
        </div>
        <div
class="rounded-lg border p-4"
          :class="Math.round(filasBalanceSaldo.sumaDebito) === Math.round(filasBalanceSaldo.sumaCredito)
            ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/30'
            : 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30'">
          <p class="text-xs text-muted uppercase tracking-wide">Suma saldos crédito</p>
          <p class="text-lg font-semibold">{{ moneda(filasBalanceSaldo.sumaCredito) }}</p>
        </div>
      </div>
      <div class="overflow-x-auto rounded-lg border border-default">
        <table class="w-full text-sm">
          <thead class="bg-muted/30">
            <tr>
              <th class="p-2 text-left">Código</th><th class="p-2 text-left">Nombre</th>
              <th class="p-2 text-right">Saldo anterior</th><th class="p-2 text-right">Débitos</th>
              <th class="p-2 text-right">Créditos</th><th class="p-2 text-right">Saldo final</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in librosStore.balance" :key="f.codigo" class="border-t border-default">
              <td class="p-2">{{ f.codigo }}</td>
              <td class="p-2">{{ f.nombre }}</td>
              <td class="p-2 text-right">{{ moneda(f.saldo_anterior) }}</td>
              <td class="p-2 text-right">{{ moneda(f.debitos_periodo) }}</td>
              <td class="p-2 text-right">{{ moneda(f.creditos_periodo) }}</td>
              <td class="p-2 text-right font-medium">{{ moneda(f.saldo_final) }}</td>
            </tr>
            <tr v-if="librosStore.balance.length === 0"><td colspan="6" class="p-4 text-center text-muted">Sin movimientos en el rango.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Inventarios y Balances -->
    <div v-if="pestanaActiva === 'inventarios'" class="space-y-4">
      <div
v-if="cuadre" class="rounded-lg border p-4"
        :class="cuadre.cuadra ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/30' : 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30'">
        <p class="text-sm font-medium">
          {{ cuadre.cuadra ? 'Activo = Pasivo + Patrimonio + Resultado del ejercicio' : `Descuadre: diferencia de ${moneda(cuadre.diferencia)}` }}
        </p>
      </div>
      <div
class="rounded-lg border p-4"
        :class="librosStore.conciliacionCartera.length > 0
          ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
          : 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/30'">
        <p class="text-sm font-medium mb-2">
          {{ librosStore.conciliacionCartera.length > 0
            ? `Conciliación de cartera: ${librosStore.conciliacionCartera.length} inmueble(s) con diferencia`
            : 'Conciliación de cartera: el saldo contable cuadra contra el auxiliar' }}
        </p>
        <ul v-if="librosStore.conciliacionCartera.length > 0" class="list-disc pl-5 space-y-1 text-xs">
          <li v-for="c in librosStore.conciliacionCartera" :key="c.inmueble_id">
            Inmueble {{ c.inmueble_id }} — contable {{ moneda(c.saldo_contable) }}, auxiliar {{ moneda(c.saldo_auxiliar) }}, diferencia {{ moneda(c.diferencia) }}
          </li>
        </ul>
      </div>
      <div class="overflow-x-auto rounded-lg border border-default">
        <table class="w-full text-sm">
          <thead class="bg-muted/30"><tr><th class="p-2 text-left">Código</th><th class="p-2 text-left">Nombre</th><th class="p-2 text-right">Saldo</th></tr></thead>
          <tbody>
            <tr v-for="f in librosStore.inventarios.filter((x) => x.codigo !== 'CUADRE')" :key="f.codigo" class="border-t border-default">
              <td class="p-2">{{ f.codigo }}</td>
              <td class="p-2">{{ f.nombre }}</td>
              <td class="p-2 text-right font-medium">{{ moneda(f.saldo) }}</td>
            </tr>
            <tr v-if="librosStore.inventarios.length === 0"><td colspan="3" class="p-4 text-center text-muted">Sin saldos a la fecha de corte.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
