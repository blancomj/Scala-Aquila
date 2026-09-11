<script setup lang="ts">
// MANT-9 · Comparador reparar/reemplazar/mantener (§3.3) — supuestos explícitos y editables,
// cada uno con su origen a la vista. PROHIBIDO cualquier campo de recomendación única: el
// resultado es una comparación de totales y su sensibilidad, nunca un veredicto.
import type { Database, Json } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const route = useRoute()
const tenantStore = useTenantStore()
const saludStore = useMantenimientoSaludStore()
const activosStore = useActivosStore()

const activoSeleccionadoId = ref<string | null>(
  typeof route.query.activo === 'string' ? route.query.activo : null,
)
const cargando = ref(false)
const errorCarga = ref<string | null>(null)

async function cargarBase(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await activosStore.cargarActivos(tenantId)
}

onMounted(cargarBase)

const opcionesActivo = computed(() =>
  activosStore.activos.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} — ${a.nombre}` })),
)

async function cargarEscenariosDelActivo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !activoSeleccionadoId.value) return
  errorCarga.value = null
  cargando.value = true
  try {
    await saludStore.cargarEscenarios(tenantId, activoSeleccionadoId.value)
  } catch (e) {
    errorCarga.value = mensajeError(e, 'No se pudieron cargar los escenarios.')
  } finally {
    cargando.value = false
  }
}
watch(activoSeleccionadoId, cargarEscenariosDelActivo, { immediate: true })

// ── Crear escenario ──────────────────────────────────────────────────────
const drawerAbierto = ref(false)
const nuevo = reactive({ nombre: '', tipo: 'reparar' as Database['public']['Enums']['escenario_tipo_t'] })
const errorGuardar = ref<string | null>(null)

async function crear(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !activoSeleccionadoId.value) return
  errorGuardar.value = null
  try {
    await saludStore.crearEscenario({
      tenant_id: tenantId, activo_id: activoSeleccionadoId.value,
      nombre: nuevo.nombre, tipo: nuevo.tipo,
    })
    drawerAbierto.value = false
    nuevo.nombre = ''
  } catch (e) {
    errorGuardar.value = mensajeError(e, 'No se pudo crear el escenario.')
  }
}

// ── Supuestos de origen usuario por tipo (§3.3) — sin valor por defecto ──
const SUPUESTOS_POR_TIPO: Record<string, Array<{ clave: string; etiqueta: string; unidad: string }>> = {
  reparar: [
    { clave: 'costo_reparacion_mayor', etiqueta: 'Costo de la reparación mayor', unidad: 'COP' },
    { clave: 'costo_indisponibilidad', etiqueta: 'Costo de indisponibilidad', unidad: 'COP' },
    { clave: 'vida_util_restante_anios', etiqueta: 'Vida útil restante estimada', unidad: 'años' },
  ],
  reemplazar: [
    { clave: 'costo_reemplazo', etiqueta: 'Costo de reemplazo', unidad: 'COP' },
    { clave: 'costo_indisponibilidad', etiqueta: 'Costo de indisponibilidad', unidad: 'COP' },
  ],
  mantener: [
    { clave: 'vida_util_restante_anios', etiqueta: 'Vida útil restante estimada', unidad: 'años' },
  ],
}

const valoresSupuestos = reactive<Record<string, Record<string, number | undefined>>>({})

// Precarga los supuestos ya guardados apenas llega la lista, para que el input arranque con el
// valor existente (v-model.number simple, sin lógica de fallback en el template).
watch(
  () => saludStore.escenarios,
  (lista) => {
    for (const e of lista) {
      valoresSupuestos[e.id] ??= {}
      const requeridos = SUPUESTOS_POR_TIPO[e.tipo] ?? []
      const supuestos = (e.supuestos as Record<string, { valor?: number }>) ?? {}
      for (const s of requeridos) {
        if (valoresSupuestos[e.id]![s.clave] === undefined) {
          valoresSupuestos[e.id]![s.clave] = supuestos[s.clave]?.valor
        }
      }
    }
  },
  { immediate: true },
)

async function guardarSupuestos(escenario: (typeof saludStore.escenarios)[number]): Promise<void> {
  const requeridos = SUPUESTOS_POR_TIPO[escenario.tipo] ?? []
  const supuestos: Record<string, Json> = { ...(escenario.supuestos as Record<string, Json>) }
  for (const s of requeridos) {
    const v = valoresSupuestos[escenario.id]?.[s.clave]
    if (v !== undefined) supuestos[s.clave] = { valor: v, unidad: s.unidad, origen: 'usuario', editable: true }
  }
  await saludStore.actualizarSupuestos(escenario.id, supuestos)
}

const errorEvaluar = reactive<Record<string, string | null>>({})
async function evaluar(escenario: (typeof saludStore.escenarios)[number]): Promise<void> {
  errorEvaluar[escenario.id] = null
  try {
    await guardarSupuestos(escenario)
    await saludStore.evaluarEscenario(escenario.id)
  } catch (e) {
    errorEvaluar[escenario.id] = mensajeError(e, 'No se pudo evaluar el escenario.')
  }
}

function supuestosFaltantes(escenario: (typeof saludStore.escenarios)[number]): string[] {
  const requeridos = SUPUESTOS_POR_TIPO[escenario.tipo] ?? []
  return requeridos.filter((s) => valoresSupuestos[escenario.id]?.[s.clave] === undefined).map((s) => s.etiqueta)
}

// ── Exportar a PDF — reutiliza pdfmake, ya dependencia (gobierno/actas, estados-financieros) ──
const exportando = ref<string | null>(null)
async function exportarPdf(escenario: (typeof saludStore.escenarios)[number]): Promise<void> {
  exportando.value = escenario.id
  try {
    const pdfMake = (await import('pdfmake/build/pdfmake')).default
    const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default as unknown as {
      pdfMake?: { vfs: Record<string, string> }; vfs?: Record<string, string>
    }
    pdfMake.vfs = pdfFonts.pdfMake?.vfs ?? pdfFonts.vfs ?? {}
    const activo = activosStore.activos.find((a) => a.id === escenario.activo_id)
    const resultado = escenario.resultado as {
      total: number; componentes: Array<{ concepto: string; origen: string; monto: number }>
      sensibilidad: Array<{ concepto: string; participacion_pct: number }>
    } | null
    const supuestos = (escenario.supuestos as Record<string, { valor: number; unidad: string; origen: string }>) ?? {}

    const contenido: import('pdfmake/interfaces').Content[] = [
      { text: escenario.nombre, style: 'titulo' },
      { text: `Copropiedad: ${tenantStore.activeTenant?.name ?? ''}`, style: 'sub' },
      { text: `Activo: ${activo ? `${activo.codigo} — ${activo.nombre}` : escenario.activo_id}`, style: 'sub' },
      { text: `Tipo de escenario: ${escenario.tipo}`, style: 'sub' },
      { text: 'Supuestos (con su origen)', style: 'seccion' },
      {
        table: {
          headerRows: 1, widths: ['*', 'auto', 'auto'],
          body: [
            ['Supuesto', 'Valor', 'Origen'],
            ...Object.entries(supuestos).map(([clave, s]) => [clave, `${s.valor} ${s.unidad}`, s.origen]),
          ],
        },
      },
      { text: 'Resultado', style: 'seccion' },
      resultado
        ? {
            table: {
              headerRows: 1, widths: ['*', 'auto', 'auto'],
              body: [
                ['Componente', 'Origen', 'Monto'],
                ...resultado.componentes.map((c) => [c.concepto, c.origen, formatoMoneda(c.monto)]),
                ['Total', '', formatoMoneda(resultado.total)],
              ],
            },
          }
        : { text: 'Sin evaluar todavía.', style: 'sub' },
      { text: 'Esta comparación no incluye una recomendación — la decisión la toma el órgano competente.', style: 'sub', margin: [0, 12, 0, 0] },
    ]
    pdfMake.createPdf({
      content: contenido,
      styles: {
        titulo: { fontSize: 16, bold: true, margin: [0, 0, 0, 8] },
        seccion: { fontSize: 11, bold: true, margin: [0, 10, 0, 4] },
        sub: { fontSize: 9, margin: [0, 0, 0, 2] },
      },
      footer: (paginaActual: number, totalPaginas: number) => ({
        text: `Página ${paginaActual} de ${totalPaginas}`, alignment: 'center', fontSize: 8,
      }),
    }).download(`escenario-${escenario.nombre.replace(/\s+/g, '-')}.pdf`)
  } finally {
    exportando.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 mt-1">
      <template #titulo>
        <h1 class="text-xl font-semibold">Escenarios: reparar o reemplazar</h1>
      </template>
      <template #descripcion>
        Comparación con supuestos explícitos y su origen, nunca una recomendación cerrada — cada
        escenario se puede exportar a PDF como soporte de una decisión.
      </template>
    </UiTituloDescripcion>

    <div class="flex items-center gap-3">
      <UiSelectorBuscable v-model="activoSeleccionadoId" :opciones="opcionesActivo" placeholder="Selecciona un activo" class="w-96" />
      <UButton v-if="activoSeleccionadoId" size="xs" @click="drawerAbierto = true">Nuevo escenario</UButton>
    </div>

    <UAlert v-if="errorCarga" color="error" variant="soft" :title="errorCarga" />

    <div v-if="!activoSeleccionadoId" class="text-sm text-neutral-400">Selecciona un activo para ver o crear sus escenarios.</div>
    <div v-else-if="cargando" class="text-sm text-neutral-400">Cargando…</div>

    <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div v-for="e in saludStore.escenarios" :key="e.id" class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-medium">{{ e.nombre }}</h3>
          <UBadge size="xs" variant="subtle">{{ e.tipo }}</UBadge>
        </div>

        <UAlert v-if="errorEvaluar[e.id]" color="error" variant="soft" :title="errorEvaluar[e.id]!" />

        <div class="space-y-2">
          <div v-for="s in SUPUESTOS_POR_TIPO[e.tipo]" :key="s.clave" class="flex items-center gap-2">
            <span class="w-56 shrink-0 text-xs text-neutral-500">{{ s.etiqueta }} ({{ s.unidad }})</span>
            <UInput
              v-model.number="valoresSupuestos[e.id]![s.clave]"
              type="number"
              class="flex-1"
              size="xs"
            />
          </div>
        </div>

        <p v-if="supuestosFaltantes(e).length > 0" class="text-xs text-warning-600">
          Faltan: {{ supuestosFaltantes(e).join(', ') }}
        </p>

        <div class="flex items-center gap-2">
          <UButton size="xs" :loading="saludStore.guardando" @click="evaluar(e)">Evaluar</UButton>
          <UButton
            v-if="e.resultado"
            size="xs" variant="soft" :loading="exportando === e.id"
            @click="exportarPdf(e)"
          >
            Exportar PDF
          </UButton>
        </div>

        <template v-if="e.resultado">
          <div class="border-t border-neutral-100 pt-2 dark:border-neutral-800">
            <p class="text-xs uppercase tracking-wide text-neutral-400">Total</p>
            <p class="text-lg font-semibold tabular-nums">
              {{ formatoMoneda((e.resultado as { total: number }).total) }}
            </p>
            <ul class="mt-2 space-y-1 text-xs text-neutral-500">
              <li v-for="c in (e.resultado as { componentes: Array<{ concepto: string; monto: number }> }).componentes" :key="c.concepto" class="flex justify-between">
                <span>{{ c.concepto }}</span>
                <span class="tabular-nums">{{ formatoMoneda(c.monto) }}</span>
              </li>
            </ul>
          </div>
        </template>
      </div>
      <p v-if="saludStore.escenarios.length === 0" class="text-sm text-neutral-400">Sin escenarios para este activo todavía.</p>
    </div>

    <UiDrawer :abierto="drawerAbierto" titulo="Nuevo escenario" @cerrar="drawerAbierto = false">
      <div class="space-y-4">
        <UAlert v-if="errorGuardar" color="error" variant="soft" :title="errorGuardar" />
        <UFormField label="Nombre"><UInput v-model="nuevo.nombre" class="w-full" /></UFormField>
        <UFormField label="Tipo">
          <USelect
            v-model="nuevo.tipo"
            :items="[
              { label: 'Reparar', value: 'reparar' },
              { label: 'Reemplazar', value: 'reemplazar' },
              { label: 'Mantener', value: 'mantener' },
            ]"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UButton block :loading="saludStore.guardando" @click="crear">Crear escenario</UButton>
      </div>
    </UiDrawer>
  </div>
</template>
