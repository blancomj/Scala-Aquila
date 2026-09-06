<script setup lang="ts">
// CO-5 · Estados financieros y notas (§4.4 del corte).
//
// La estructura de cada estado vive en contable_estado_plantilla/_linea (CO-5 §4.1) — esta
// página solo renderiza lo que contable_estado_financiero() devuelve, nivel por nivel. Las
// pestañas salen de tenant_marco_contable().estados_requeridos: un Grupo 3 nunca ve ECP ni EFE.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const contabilidadStore = useContabilidadStore()
const estadosStore = useEstadosFinancierosStore()

type CodigoEstado = 'estado_situacion_financiera' | 'estado_resultados' | 'estado_cambios_patrimonio' | 'estado_flujos_efectivo'

const ETIQUETAS_ESTADO: Record<CodigoEstado, string> = {
  estado_situacion_financiera: 'Situación financiera',
  estado_resultados: 'Resultados',
  estado_cambios_patrimonio: 'Cambios en el patrimonio',
  estado_flujos_efectivo: 'Flujos de efectivo',
}

const hoy = new Date()
const ejercicio = ref(hoy.getFullYear())
const fechaCorte = ref(`${String(ejercicio.value)}-12-31`)
const comparativo = ref(true)
const pestanaActiva = ref<CodigoEstado | 'notas'>('estado_situacion_financiera')
const error = ref<string | null>(null)
const exportando = ref(false)
const notaEditando = ref<string | null>(null)
const borradorNota = ref('')

const estadosRequeridos = computed<CodigoEstado[]>(() =>
  (contabilidadStore.marcoContable?.estados_requeridos ?? []).filter((c): c is CodigoEstado => c !== 'notas'),
)
const PESTANAS = computed(() => [
  ...estadosRequeridos.value.map((c) => ({ label: ETIQUETAS_ESTADO[c], value: c })),
  { label: 'Notas', value: 'notas' as const },
])

const formatoMoneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
function moneda(valor: number | null): string {
  if (valor === null) return ''
  return formatoMoneda.format(valor)
}
function porcentaje(valor: number | null): string {
  if (valor === null) return ''
  return `${valor.toFixed(2)}%`
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await contabilidadStore.cargarMarcoContable(tenantId)
    if (pestanaActiva.value === 'notas') {
      await estadosStore.cargarNotas(tenantId, ejercicio.value)
    } else {
      await estadosStore.cargarEstado(tenantId, pestanaActiva.value, fechaCorte.value, comparativo.value)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al cargar el estado financiero'
  }
}

watch([pestanaActiva, comparativo], () => { void cargar() })
watch(ejercicio, (v) => { fechaCorte.value = `${String(v)}-12-31` })

onMounted(() => { void cargar() })

const filasActuales = computed(() =>
  pestanaActiva.value === 'notas' ? [] : (estadosStore.filasPorCodigo[pestanaActiva.value] ?? []),
)

/** Indicador de descuadre (§4.4) — visible mientras exista diferencia, sin botón para
 * descartarlo (no hay ningún v-if que lo cierre a voluntad del usuario, solo cuando cuadra). */
const descuadre = computed(() => {
  const filas = estadosStore.filasPorCodigo.estado_situacion_financiera
  if (!filas) return null
  const activo = filas.find((f) => f.codigo === 'total_activo')?.valor
  const pasivoPatrimonio = filas.find((f) => f.codigo === 'total_pasivo_mas_patrimonio')?.valor
  if (activo == null || pasivoPatrimonio == null) return null
  const diferencia = Math.round(activo - pasivoPatrimonio)
  return { cuadra: diferencia === 0, diferencia }
})

async function generarNotas(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await estadosStore.generarNotas(tenantId, ejercicio.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al generar las notas'
  }
}

function empezarEdicion(notaId: string, cuerpoActual: string): void {
  notaEditando.value = notaId
  borradorNota.value = cuerpoActual
}
function cancelarEdicion(): void {
  notaEditando.value = null
  borradorNota.value = ''
}
async function guardarEdicion(notaId: string): Promise<void> {
  error.value = null
  try {
    await estadosStore.editarNota(notaId, borradorNota.value)
    notaEditando.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al guardar la nota'
  }
}

/** Mismo criterio que apps/web/app/pages/contabilidad/libros.vue: color de tema resuelto en
 * runtime (D-26 prohíbe un hex hardcodeado), pdfmake/xlsx por import dinámico. */
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

/** Exporta el juego completo (todos los estados requeridos + notas) a un solo PDF — el
 * documento que va al acta de asamblea (§4.4). Bloquea si alguna nota obligatoria sigue vacía
 * (contable_validar_notas_completas, §4.5). */
async function exportarPdf(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  exportando.value = true
  try {
    const errorValidacion = await estadosStore.validarNotasCompletas(tenantId, ejercicio.value)
    if (errorValidacion) {
      error.value = errorValidacion
      return
    }

    for (const codigo of estadosRequeridos.value) {
      await estadosStore.cargarEstado(tenantId, codigo, fechaCorte.value, comparativo.value)
    }
    await estadosStore.cargarNotas(tenantId, ejercicio.value)

    const pdfMake = (await import('pdfmake/build/pdfmake')).default
    const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default as unknown as { pdfMake?: { vfs: Record<string, string> }; vfs?: Record<string, string> }
    pdfMake.vfs = pdfFonts.pdfMake?.vfs ?? pdfFonts.vfs ?? {}

    const marco = contabilidadStore.marcoContable
    const contenido: import('pdfmake/interfaces').Content[] = [
      { text: tenantStore.activeTenant?.name ?? '', style: 'titulo' },
      { text: `Estados financieros — ejercicio ${String(ejercicio.value)}`, style: 'sub' },
      { text: `Fecha de corte: ${fechaCorte.value}`, style: 'sub' },
      {
        text: marco?.clasificado ? `Marco de información financiera: ${marco.marco_grupo ?? ''}` : 'ADVERTENCIA: copropiedad sin clasificar',
        style: marco?.clasificado ? 'sub' : 'advertencia',
      },
      { text: `Generado: ${new Date().toLocaleString('es-CO')}`, style: 'sub', margin: [0, 0, 0, 12] },
    ]

    for (const codigo of estadosRequeridos.value) {
      const filas = estadosStore.filasPorCodigo[codigo] ?? []
      contenido.push({ text: ETIQUETAS_ESTADO[codigo], style: 'encabezadoEstado', pageBreak: contenido.length > 5 ? 'before' : undefined })
      contenido.push({
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto'],
          body: [
            ['Concepto', 'Valor', 'Ejercicio anterior'],
            ...filas
              .filter((f) => f.tipo_linea !== 'grupo')
              .map((f) => [
                '  '.repeat(Math.max(f.nivel - 1, 0)) + f.etiqueta,
                moneda(f.valor),
                comparativo.value ? moneda(f.valor_anterior) : '',
              ]),
          ],
        },
        margin: [0, 4, 0, 12],
      })
    }

    contenido.push({ text: 'Notas a los estados financieros', style: 'encabezadoEstado', pageBreak: 'before' })
    for (const nota of estadosStore.notas) {
      contenido.push({ text: `${String(nota.numero)}. ${nota.titulo}`, style: 'notaTitulo', margin: [0, 8, 0, 2] })
      contenido.push({ text: nota.cuerpo, style: 'notaCuerpo' })
    }

    pdfMake.createPdf({
      content: contenido,
      styles: {
        titulo: { fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
        sub: { fontSize: 9, margin: [0, 0, 0, 2] },
        advertencia: { fontSize: 9, bold: true, color: colorTemaComputado('text-error-600'), margin: [0, 0, 0, 2] },
        encabezadoEstado: { fontSize: 13, bold: true, margin: [0, 8, 0, 4] },
        notaTitulo: { fontSize: 10, bold: true },
        notaCuerpo: { fontSize: 9 },
      },
      footer: (paginaActual: number, totalPaginas: number) => ({
        text: `Página ${String(paginaActual)} de ${String(totalPaginas)}`, alignment: 'center', fontSize: 8, margin: [0, 4, 0, 0],
      }),
    }).download(`estados-financieros-${String(ejercicio.value)}.pdf`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al exportar el PDF'
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
          <h1 class="text-xl font-semibold">Estados financieros</h1>
        </template>
        <template #descripcion>
          Situación financiera, resultados, cambios en el patrimonio y flujos de efectivo — con
          sus 14 notas obligatorias, generadas con cifras reales del ejercicio y editables.
        </template>
      </UiTituloDescripcion>
    </div>

    <ContabilidadBannerSinClasificar :clasificado="contabilidadStore.marcoContable?.clasificado ?? false" />

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <div
v-if="descuadre && !descuadre.cuadra" class="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
      <p class="text-sm font-semibold">
        Descuadre: activo ≠ pasivo + patrimonio (diferencia de {{ moneda(descuadre.diferencia) }})
      </p>
    </div>

    <UTabs
:items="PESTANAS" :model-value="pestanaActiva" variant="link" :content="false" class="w-full"
      @update:model-value="(v) => (pestanaActiva = v as typeof pestanaActiva)" />

    <div class="flex items-end gap-2 flex-wrap">
      <UFormField label="Ejercicio" name="ejercicio">
        <UInput v-model.number="ejercicio" type="number" class="w-28" @change="cargar()" />
      </UFormField>
      <template v-if="pestanaActiva !== 'notas'">
        <UFormField label="Fecha de corte" name="fechaCorte">
          <UInput v-model="fechaCorte" type="date" @change="cargar()" />
        </UFormField>
        <UFormField label="Comparativo" name="comparativo">
          <USwitch v-model="comparativo" />
        </UFormField>
      </template>
      <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="estadosStore.loading || estadosStore.loadingNotas" @click="cargar()">
        Actualizar
      </UButton>
      <UButton v-if="pestanaActiva === 'notas'" icon="i-lucide-sparkles" :loading="estadosStore.loadingNotas" @click="generarNotas()">
        Generar notas
      </UButton>
      <UButton icon="i-lucide-file-down" :loading="exportando" @click="exportarPdf()">
        Exportar juego completo a PDF
      </UButton>
    </div>

    <!-- Estado financiero -->
    <div v-if="pestanaActiva !== 'notas'" class="overflow-x-auto rounded-lg border border-default">
      <table class="w-full text-sm">
        <thead class="bg-muted/30">
          <tr>
            <th class="p-2 text-left">Concepto</th>
            <th class="p-2 text-right">Valor</th>
            <template v-if="comparativo">
              <th class="p-2 text-right">Ejercicio anterior</th>
              <th class="p-2 text-right">Variación</th>
              <th class="p-2 text-right">Variación %</th>
            </template>
          </tr>
        </thead>
        <tbody>
          <tr
v-for="f in filasActuales" :key="f.codigo" class="border-t border-default"
            :class="f.tipo_linea === 'total' ? 'font-semibold bg-muted/20' : ''">
            <td class="p-2" :style="{ paddingLeft: `${String(0.5 + Math.max(f.nivel - 1, 0) * 1.25)}rem` }">
              {{ f.etiqueta }}
              <sup v-if="f.nota_referencia" class="text-primary">{{ f.nota_referencia }}</sup>
            </td>
            <td class="p-2 text-right">{{ f.tipo_linea === 'grupo' ? '' : moneda(f.valor) }}</td>
            <template v-if="comparativo">
              <td class="p-2 text-right">{{ f.tipo_linea === 'grupo' ? '' : moneda(f.valor_anterior) }}</td>
              <td class="p-2 text-right">{{ f.tipo_linea === 'grupo' ? '' : moneda(f.variacion_absoluta) }}</td>
              <td class="p-2 text-right">{{ f.tipo_linea === 'grupo' ? '' : porcentaje(f.variacion_relativa) }}</td>
            </template>
          </tr>
          <tr v-if="filasActuales.length === 0"><td colspan="5" class="p-4 text-center text-muted">Sin datos a la fecha de corte.</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Notas -->
    <div v-else class="space-y-3">
      <div v-for="nota in estadosStore.notas" :key="nota.id" class="rounded-lg border border-default p-4 space-y-2">
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-medium">{{ nota.numero }}. {{ nota.titulo }}</h3>
          <UBadge :color="nota.estado === 'editada' ? 'warning' : 'neutral'" variant="soft">
            {{ nota.estado === 'editada' ? 'Editada' : 'Generada' }}
          </UBadge>
        </div>
        <template v-if="notaEditando === nota.id">
          <UTextarea v-model="borradorNota" :rows="4" class="w-full" />
          <div class="flex gap-2">
            <UButton size="xs" @click="guardarEdicion(nota.id)">Guardar</UButton>
            <UButton size="xs" variant="ghost" @click="cancelarEdicion()">Cancelar</UButton>
          </div>
        </template>
        <template v-else>
          <p class="text-sm whitespace-pre-wrap">{{ nota.cuerpo || '(vacía)' }}</p>
          <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="empezarEdicion(nota.id, nota.cuerpo)">
            Editar
          </UButton>
        </template>
      </div>
      <p v-if="estadosStore.notas.length === 0" class="text-center text-muted p-4">
        Sin notas generadas para este ejercicio — usa "Generar notas".
      </p>
    </div>
  </div>
</template>
