<script setup lang="ts">
// Pestaña "Ejecución presupuestal" (E9) — presupuestado vs. ejecutado por cuenta, mismo criterio
// de secciones Egresos/Ingresos que PresupuestoTabPlanCuentas.vue. El rollup viene siempre de
// presupuesto_cuenta_ejecucion (BD) vía cargarComparativoCuenta — la variación (con prorrateo
// mensual, E9 seguimiento) se calcula aquí (capa de presentación, por diseño de la función).
import type { Database } from '@aquila/shared'

type PresupuestoEjecucionRow = Database['public']['Tables']['presupuesto_ejecucion']['Row']

const props = defineProps<{ presupuestoId: string | null }>()

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()
const liquidacionStore = useLiquidacionStore()
const conceptoStore = useConceptoStore()
const toast = useToast()

watch(
  () => props.presupuestoId,
  async (id) => {
    const tenantId = tenantStore.activeTenant?.id
    if (id && tenantId) {
      await Promise.all([
        presupuestoStore.cargarComparativoCuenta(id),
        presupuestoStore.cargarEjecuciones(tenantId),
        presupuestoStore.cargarRubros(id),
        liquidacionStore.cargarPeriodos(tenantId),
        conceptoStore.cargarConceptos(tenantId),
        presupuestoStore.tiposCentroCosto.length === 0
          ? presupuestoStore.cargarTiposCentroCosto(tenantId)
          : Promise.resolve(),
      ])
    }
  },
  { immediate: true },
)

const centroCostoPorId = computed(
  () => new Map(presupuestoStore.tiposCentroCosto.map((t) => [t.id, t.nombre])),
)

/** Compartido entre "Cuentas" y "Movimientos" — mismo filtro, se mantiene al cambiar de vista.
 * En "Cuentas" recalcula presupuestado/ejecutado en cliente (ver más abajo); en "Movimientos"
 * filtra directamente las filas. */
const filtroCentroCosto = ref<number | null>(null)

const opcionesFiltroCentroCosto = computed(() => [
  { label: 'Todos los centros de costo', value: null },
  ...presupuestoStore.tiposCentroCosto.map((t) => ({ label: t.nombre, value: t.id })),
])

/** Qué cuentas reciben su ejecutado automáticamente de al menos un concepto (dirección
 * invertida, 20260830200000: el vínculo vive en conceptos.presupuesto_cuenta_id, no en la
 * cuenta) — para el badge "(automático)" de más abajo. */
const cuentasConConceptoAutomatico = computed(
  () =>
    new Set(
      conceptoStore.conceptos
        .map((c) => c.presupuesto_cuenta_id)
        .filter((id): id is string => id !== null),
    ),
)

const comparativoPorCuenta = computed(
  () => new Map(presupuestoStore.comparativoCuenta.map((c) => [c.cuenta_id, c])),
)

/** Mismo orden lexicográfico sobre `ruta` que PresupuestoTabPlanCuentas.vue. */
function arbol(naturaleza: 'ingreso' | 'egreso') {
  return presupuestoStore.cuentas
    .filter((c) => c.naturaleza === naturaleza)
    .slice()
    .sort((a, b) => a.ruta.localeCompare(b.ruta))
}

const arbolEgresos = computed(() => arbol('egreso'))
const arbolIngresos = computed(() => arbol('ingreso'))

const cuentaPorId = computed(() => new Map(presupuestoStore.cuentas.map((c) => [c.id, c])))
const periodoPorId = computed(() => new Map(liquidacionStore.periodos.map((p) => [p.id, p])))

// ── "Cuentas" / "Movimientos" — mismo criterio de toggle que PresupuestoTabPlanCuentas.vue
// (modoVista): la tabla de movimientos competía por espacio con el árbol de cuentas y quedaba
// siempre al fondo de la página (feedback de usuario). Separarla en su propia vista le da
// espacio propio para buscador y agrupar cada corrección bajo lo que corrige.
const modoVista = ref<'cuentas' | 'movimientos'>('cuentas')

// ── Colapsar/expandir cuentas de grupo — mismo patrón que PresupuestoTabPlanCuentas.vue ──
const gruposColapsados = ref(new Set<string>())

function alternarGrupo(cuentaId: string): void {
  const siguiente = new Set(gruposColapsados.value)
  if (!siguiente.delete(cuentaId)) siguiente.add(cuentaId)
  gruposColapsados.value = siguiente
}

const idsGrupo = computed(() =>
  presupuestoStore.cuentas.filter((c) => !c.es_hoja).map((c) => c.id),
)
const todoContraido = computed(
  () => idsGrupo.value.length > 0 && idsGrupo.value.every((id) => gruposColapsados.value.has(id)),
)

function alternarTodo(): void {
  gruposColapsados.value = todoContraido.value ? new Set() : new Set(idsGrupo.value)
}

/** Oculta si CUALQUIER ancestro está contraído — sube por parent_id (relación autoritativa). */
const idsOcultos = computed(() => {
  const ocultos = new Set<string>()
  if (gruposColapsados.value.size === 0) return ocultos
  for (const cuenta of presupuestoStore.cuentas) {
    let ancestroId = cuenta.parent_id
    while (ancestroId) {
      if (gruposColapsados.value.has(ancestroId)) {
        ocultos.add(cuenta.id)
        break
      }
      ancestroId = cuentaPorId.value.get(ancestroId)?.parent_id ?? null
    }
  }
  return ocultos
})

function visibles<T extends { id: string }>(filas: readonly T[]): T[] {
  return filas.filter((f) => !idsOcultos.value.has(f.id))
}

/** Cuántas cuentas esconde una rama contraída — se muestra en la fila del grupo. */
const conteoDescendientes = computed(() => {
  const hijosPorPadre = new Map<string, string[]>()
  for (const cuenta of presupuestoStore.cuentas) {
    if (!cuenta.parent_id) continue
    const hermanos = hijosPorPadre.get(cuenta.parent_id) ?? []
    hermanos.push(cuenta.id)
    hijosPorPadre.set(cuenta.parent_id, hermanos)
  }
  const conteo = new Map<string, number>()
  function contar(id: string): number {
    const memo = conteo.get(id)
    if (memo !== undefined) return memo
    let total = 0
    for (const hijoId of hijosPorPadre.get(id) ?? []) total += 1 + contar(hijoId)
    conteo.set(id, total)
    return total
  }
  for (const cuenta of presupuestoStore.cuentas) contar(cuenta.id)
  return conteo
})


const presupuestoSeleccionado = computed(
  () => presupuestoStore.presupuestos.find((p) => p.id === props.presupuestoId) ?? null,
)

/** Todas las cuentas hoja bajo una cuenta (ella misma si ya es hoja) — para recalcular
 * presupuestado/ejecutado filtrado por centro de costo en el cliente: presupuesto_cuenta_ejecucion
 * (el rollup de BD que alimenta comparativoCuenta) no conoce centro_costo_id, así que el filtro
 * solo puede aplicarse recorriendo rubros/ejecuciones directamente. */
const hojasPorCuenta = computed(() => {
  const hijosPorPadre = new Map<string, string[]>()
  for (const c of presupuestoStore.cuentas) {
    if (!c.parent_id) continue
    const hermanos = hijosPorPadre.get(c.parent_id) ?? []
    hermanos.push(c.id)
    hijosPorPadre.set(c.parent_id, hermanos)
  }
  const memo = new Map<string, string[]>()
  function hojas(id: string): string[] {
    const cacheado = memo.get(id)
    if (cacheado) return cacheado
    const resultado = cuentaPorId.value.get(id)?.es_hoja
      ? [id]
      : (hijosPorPadre.get(id) ?? []).flatMap((hijoId) => hojas(hijoId))
    memo.set(id, resultado)
    return resultado
  }
  const salida = new Map<string, string[]>()
  for (const c of presupuestoStore.cuentas) salida.set(c.id, hojas(c.id))
  return salida
})

/** Acotado al año fiscal del presupuesto, igual criterio que presupuesto_cuenta_ejecucion (BD). */
function presupuestadoFiltrado(cuentaId: string, centroCostoId: number): number {
  const hojas = new Set(hojasPorCuenta.value.get(cuentaId) ?? [cuentaId])
  return presupuestoStore.rubros
    .filter((r) => hojas.has(r.cuenta_id) && r.centro_costo_id === centroCostoId)
    .reduce((acc, r) => acc + Number(r.monto_anual), 0)
}

function ejecutadoFiltrado(cuentaId: string, centroCostoId: number): number {
  const hojas = new Set(hojasPorCuenta.value.get(cuentaId) ?? [cuentaId])
  const anio = presupuestoSeleccionado.value?.anio
  return presupuestoStore.ejecuciones
    .filter(
      (e) =>
        hojas.has(e.cuenta_id) &&
        e.centro_costo_id === centroCostoId &&
        periodoPorId.value.get(e.periodo_id)?.anio === anio,
    )
    .reduce((acc, e) => acc + Number(e.monto), 0)
}

function presupuestado(cuentaId: string): number {
  if (filtroCentroCosto.value !== null) return presupuestadoFiltrado(cuentaId, filtroCentroCosto.value)
  return Number(comparativoPorCuenta.value.get(cuentaId)?.presupuestado ?? 0)
}

function ejecutado(cuentaId: string): number {
  if (filtroCentroCosto.value !== null) return ejecutadoFiltrado(cuentaId, filtroCentroCosto.value)
  return Number(comparativoPorCuenta.value.get(cuentaId)?.ejecutado ?? 0)
}

/** Meses transcurridos del año fiscal del presupuesto — capa de presentación (E9 seguimiento):
 * un año ya cerrado cuenta como completo (12), uno futuro como 0 (todavía no arranca), el año
 * en curso usa el mes calendario actual. Sin esto, la variación comparaba ejecutado-a-la-fecha
 * contra el presupuesto ANUAL completo — en enero, gastar 1/12 del presupuesto se veía como
 * "-91.7%" (alarmante) cuando en realidad iba exactamente en línea. */
const mesesTranscurridos = computed(() => {
  const anio = presupuestoSeleccionado.value?.anio
  if (anio === undefined) return 0
  const ahora = new Date()
  const anioActual = ahora.getFullYear()
  if (anio < anioActual) return 12
  if (anio > anioActual) return 0
  return ahora.getMonth() + 1
})

function presupuestadoALaFecha(cuentaId: string): number {
  return (presupuestado(cuentaId) * mesesTranscurridos.value) / 12
}

function variacionPct(cuentaId: string): string {
  const p = presupuestadoALaFecha(cuentaId)
  if (p === 0) return '—'
  return `${(((ejecutado(cuentaId) - p) / p) * 100).toFixed(1)}%`
}

/** Excedente/pérdida del ejercicio (Σ ingresos − Σ egresos) — la cifra de cierre del Estado de
 * Resultado real revisado (Casos de uso/Presupuesto). Sumar solo nodos nivel 1 basta: son
 * subárboles disjuntos, así que equivale a sumar todas las hojas sin riesgo de doble conteo. */
const excedente = computed(() => {
  const raices = presupuestoStore.cuentas.filter((c) => c.nivel === 1)
  const sumar = (naturaleza: 'ingreso' | 'egreso', campo: 'presupuestado' | 'ejecutado') =>
    raices
      .filter((c) => c.naturaleza === naturaleza)
      .reduce((acc, c) => acc + (campo === 'presupuestado' ? presupuestado(c.id) : ejecutado(c.id)), 0)

  return {
    presupuestado: sumar('ingreso', 'presupuestado') - sumar('egreso', 'presupuestado'),
    ejecutado: sumar('ingreso', 'ejecutado') - sumar('egreso', 'ejecutado'),
  }
})

const drawerAbierto = ref(false)

function onRegistrado(): void {
  drawerAbierto.value = false
  if (props.presupuestoId) presupuestoStore.cargarComparativoCuenta(props.presupuestoId)
  toast.add({ title: 'Movimiento registrado', color: 'success' })
}

const revirtiendoId = ref<string | null>(null)
const errorReversion = ref<string | null>(null)

// ── Movimientos: búsqueda + agrupar cada reversión bajo el movimiento que corrige (filtro de
// centro de costo declarado arriba, compartido con "Cuentas") ──
const busquedaMovimientos = ref('')

const RANGO_DIACRITICOS = new RegExp('[̀-ͯ]', 'g')

function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(RANGO_DIACRITICOS, '').toLowerCase()
}

interface FilaMovimiento {
  movimiento: PresupuestoEjecucionRow
  esReversion: boolean
}

/** presupuestoStore.ejecuciones ya viene ordenado por created_at desc (store). Agrupar cada
 * reversión bajo su original en vez de dejarlas como filas planas evita perder de vista qué
 * corrigió a qué (mockup aprobado: Opción A). Una reversión nunca se puede volver a corregir
 * aquí (ajustar exige !fila.esReversion), así que la anidación tiene como mucho un nivel. */
const filasMovimientos = computed<FilaMovimiento[]>(() => {
  const reversionesPorOriginal = new Map<string, PresupuestoEjecucionRow[]>()
  for (const mov of presupuestoStore.ejecuciones) {
    if (!mov.ajusta_movimiento_id) continue
    const lista = reversionesPorOriginal.get(mov.ajusta_movimiento_id) ?? []
    lista.push(mov)
    reversionesPorOriginal.set(mov.ajusta_movimiento_id, lista)
  }

  const q = normalizarTexto(busquedaMovimientos.value.trim())
  function coincide(mov: PresupuestoEjecucionRow): boolean {
    if (!q) return true
    const cuenta = cuentaPorId.value.get(mov.cuenta_id)?.nombre ?? ''
    return normalizarTexto(cuenta).includes(q) || normalizarTexto(mov.descripcion ?? '').includes(q)
  }

  const filas: FilaMovimiento[] = []
  for (const mov of presupuestoStore.ejecuciones) {
    if (mov.ajusta_movimiento_id) continue
    if (filtroCentroCosto.value !== null && mov.centro_costo_id !== filtroCentroCosto.value) continue
    const reversiones = reversionesPorOriginal.get(mov.id) ?? []
    if (!coincide(mov) && !reversiones.some(coincide)) continue
    filas.push({ movimiento: mov, esReversion: false })
    for (const rev of reversiones) filas.push({ movimiento: rev, esReversion: true })
  }
  return filas
})

/** Corrección de un movimiento mal registrado (E9 seguimiento, 20260823300000): inserta la
 * reversión (monto negativo, misma cuenta/periodo) en vez de editar/borrar — append-only. Una
 * fila que YA es una reversión no se puede volver a corregir aquí (evita cadenas sin sentido). */
async function ajustar(movimiento: PresupuestoEjecucionRow): Promise<void> {
  errorReversion.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  revirtiendoId.value = movimiento.id
  try {
    await presupuestoStore.revertirEjecucion({ tenantId, movimiento })
    if (props.presupuestoId) await presupuestoStore.cargarComparativoCuenta(props.presupuestoId)
    toast.add({ title: 'Movimiento corregido', color: 'success' })
  } catch (excepcion) {
    errorReversion.value = mensajeError(excepcion, 'No se pudo revertir el movimiento.')
  } finally {
    revirtiendoId.value = null
  }
}

// ── Exportar a Excel — .xlsx real (SheetJS, carga dinámica: solo pesa en el bundle si el
// usuario efectivamente exporta). Exporta la vista activa (Cuentas o Movimientos), respetando
// el filtro de búsqueda cuando aplica — mismo criterio de "lo que está filtrado en pantalla"
// que pages/inmuebles/index.vue (exportarCSV), pero como libro real en vez de texto plano.
async function exportarCuentas(): Promise<void> {
  const XLSX = await import('xlsx')
  const encabezados = [
    'Cuenta',
    'Naturaleza',
    'Presupuestado (anual)',
    'Presupuestado (a la fecha)',
    'Ejecutado',
    'Variación',
  ]
  const filas = [...arbolEgresos.value, ...arbolIngresos.value].map((c) => [
    '  '.repeat(c.nivel - 1) + c.nombre,
    c.naturaleza === 'egreso' ? 'Egreso' : 'Ingreso',
    Math.round(presupuestado(c.id)),
    Math.round(presupuestadoALaFecha(c.id)),
    Math.round(ejecutado(c.id)),
    variacionPct(c.id),
  ])
  const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas])
  hoja['!cols'] = [{ wch: 40 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 16 }, { wch: 12 }]
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Ejecución presupuestal')
  XLSX.writeFile(libro, `ejecucion-presupuestal-${presupuestoSeleccionado.value?.anio ?? ''}.xlsx`)
}

async function exportarMovimientos(): Promise<void> {
  const XLSX = await import('xlsx')
  const encabezados = ['Cuenta', 'Periodo', 'Monto', 'Descripción', 'Centro de costo', 'Tipo']
  const filas = filasMovimientos.value.map(({ movimiento, esReversion }) => {
    const periodo = periodoPorId.value.get(movimiento.periodo_id)
    return [
      cuentaPorId.value.get(movimiento.cuenta_id)?.nombre ?? '',
      periodo ? `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}` : '',
      Math.round(Number(movimiento.monto)),
      movimiento.descripcion ?? '',
      movimiento.centro_costo_id ? (centroCostoPorId.value.get(movimiento.centro_costo_id) ?? '') : '',
      esReversion ? 'Reversión' : 'Original',
    ]
  })
  const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas])
  hoja['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 16 }, { wch: 40 }, { wch: 20 }, { wch: 12 }]
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Movimientos')
  XLSX.writeFile(libro, 'movimientos-ejecucion.xlsx')
}

function exportar(): void {
  if (modoVista.value === 'cuentas') exportarCuentas()
  else exportarMovimientos()
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="flex items-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-800 p-0.5">
        <UButton
          type="button"
          size="xs"
          :variant="modoVista === 'cuentas' ? 'solid' : 'ghost'"
          @click="modoVista = 'cuentas'"
        >
          Cuentas
        </UButton>
        <UButton
          type="button"
          size="xs"
          :variant="modoVista === 'movimientos' ? 'solid' : 'ghost'"
          @click="modoVista = 'movimientos'"
        >
          Movimientos
        </UButton>
      </div>
      <div class="flex items-center gap-2">
        <UButton size="xs" variant="ghost" icon="i-lucide-file-down" @click="exportar()">
          Exportar a Excel
        </UButton>
        <UButton size="xs" @click="drawerAbierto = true">Registrar movimiento</UButton>
      </div>
    </div>

    <!-- ══════════════════ Cuentas ══════════════════ -->
    <template v-if="modoVista === 'cuentas'">
      <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 flex items-center gap-16 flex-wrap">
        <div class="flex gap-8">
          <div>
            <p class="text-xs text-neutral-500 uppercase tracking-wide">Excedente / pérdida presupuestado</p>
            <p class="text-lg font-semibold tabular-nums" :class="excedente.presupuestado < 0 ? 'text-warning-500' : ''">
              {{ formatoMoneda(excedente.presupuestado) }}
            </p>
          </div>
          <div>
            <p class="text-xs text-neutral-500 uppercase tracking-wide">Excedente / pérdida ejecutado</p>
            <p class="text-lg font-semibold tabular-nums" :class="excedente.ejecutado < 0 ? 'text-warning-500' : ''">
              {{ formatoMoneda(excedente.ejecutado) }}
            </p>
          </div>
        </div>
        <p class="text-xs text-neutral-500 max-w-md ml-auto">
          Presupuestado (anual) vs. ejecutado (acumulado del año) por cuenta. La variación compara
          el ejecutado contra el presupuesto <strong>prorrateado a la fecha</strong> ({{ mesesTranscurridos }}
          de 12 meses) — no contra el anual completo.
        </p>
      </div>

      <section v-for="seccion in [{ titulo: 'Egresos', filas: arbolEgresos }, { titulo: 'Ingresos', filas: arbolIngresos }]" :key="seccion.titulo">
        <div class="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-semibold">{{ seccion.titulo }}</h3>
            <UButton
              v-if="seccion.titulo === 'Egresos' && idsGrupo.length > 0"
              size="xs"
              variant="ghost"
              :icon="todoContraido ? 'i-lucide-chevrons-up-down' : 'i-lucide-chevrons-down-up'"
              @click="alternarTodo()"
            >
              {{ todoContraido ? 'Expandir todo' : 'Contraer todo' }}
            </UButton>
          </div>
          <USelect
            v-if="seccion.titulo === 'Egresos'"
            v-model="filtroCentroCosto"
            :items="opcionesFiltroCentroCosto"
            value-key="value"
            class="w-52"
          />
        </div>
        <UiTabla
          :columnas="[
            { clave: 'nombre', etiqueta: 'Cuenta' },
            { clave: 'presupuestado', etiqueta: 'Presupuestado (anual)', alinear: 'derecha', ancho: '230px' },
            { clave: 'aLaFecha', etiqueta: 'Presupuestado (a la fecha)', alinear: 'derecha', ancho: '240px' },
            { clave: 'ejecutado', etiqueta: 'Ejecutado', alinear: 'derecha', ancho: '190px' },
            { clave: 'variacion', etiqueta: 'Variación', alinear: 'derecha', ancho: '150px' },
          ]"
          :filas="visibles(seccion.filas)"
          :clave-fila="(fila) => fila.id"
          vacio="Sin cuentas todavía."
        >
          <template #celda-nombre="{ fila }">
            <div class="flex items-center gap-1" :style="{ paddingLeft: `${(fila.nivel - 1) * 16}px` }">
              <button
                v-if="!fila.es_hoja"
                type="button"
                class="flex size-5 shrink-0 items-center justify-center rounded border border-neutral-300 text-neutral-600 transition-colors hover:border-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-white"
                :aria-expanded="!gruposColapsados.has(fila.id)"
                :aria-label="`${gruposColapsados.has(fila.id) ? 'Expandir' : 'Contraer'} ${fila.nombre}`"
                @click="alternarGrupo(fila.id)"
              >
                <UIcon
                  :name="gruposColapsados.has(fila.id) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
                  class="size-4"
                />
              </button>
              <span v-else class="size-5 shrink-0" aria-hidden="true" />
              <span :class="{ 'font-medium': fila.nivel === 1 }">{{ fila.nombre }}</span>
              <span v-if="!fila.es_hoja && gruposColapsados.has(fila.id)" class="text-xs text-neutral-400">
                ({{ conteoDescendientes.get(fila.id) ?? 0 }})
              </span>
              <UBadge v-else-if="fila.es_hoja && cuentasConConceptoAutomatico.has(fila.id)" size="xs" variant="subtle">
                cobro automático
              </UBadge>
            </div>
          </template>
          <template #celda-presupuestado="{ fila }">
            <span class="tabular-nums">{{ formatoMoneda(presupuestado(fila.id)) }}</span>
          </template>
          <template #celda-aLaFecha="{ fila }">
            <span class="text-neutral-500 tabular-nums">{{ formatoMoneda(presupuestadoALaFecha(fila.id)) }}</span>
          </template>
          <template #celda-ejecutado="{ fila }">
            <span class="tabular-nums">{{ formatoMoneda(ejecutado(fila.id)) }}</span>
          </template>
          <template #celda-variacion="{ fila }">
            <span
              class="tabular-nums"
              :class="
                ejecutado(fila.id) > presupuestadoALaFecha(fila.id) && fila.naturaleza === 'egreso'
                  ? 'text-warning-500'
                  : 'text-neutral-500'
              "
            >
              {{ variacionPct(fila.id) }}
            </span>
          </template>
        </UiTabla>
      </section>
    </template>

    <!-- ══════════════════ Movimientos ══════════════════ -->
    <template v-else>
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2">
          <UInput
            v-model="busquedaMovimientos"
            icon="i-lucide-search"
            placeholder="Buscar por cuenta o descripción"
            class="w-80"
          >
            <template v-if="busquedaMovimientos" #trailing>
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-x"
                aria-label="Limpiar búsqueda"
                title="Limpiar búsqueda"
                @click="busquedaMovimientos = ''"
              />
            </template>
          </UInput>
          <USelect
            v-model="filtroCentroCosto"
            :items="opcionesFiltroCentroCosto"
            value-key="value"
            class="w-52"
          />
        </div>
        <p class="text-xs text-neutral-500 text-right">
          Un monto mal registrado no se edita ni se borra — se corrige con "Ajustar", que aparece
          agrupado justo debajo del movimiento original.
        </p>
      </div>
      <UAlert v-if="errorReversion" color="error" variant="soft" :title="errorReversion" />
      <UiTabla
        :columnas="[
          { clave: 'cuenta', etiqueta: 'Cuenta' },
          { clave: 'periodo', etiqueta: 'Periodo' },
          { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha' },
          { clave: 'descripcion', etiqueta: 'Descripción' },
          { clave: 'centroCosto', etiqueta: 'Centro de costo' },
          { clave: 'acciones', etiqueta: '' },
        ]"
        :filas="filasMovimientos"
        :clave-fila="(fila) => fila.movimiento.id"
        :vacio="busquedaMovimientos ? 'Sin resultados.' : 'Sin movimientos registrados todavía.'"
      >
        <template #celda-cuenta="{ fila }">
          <span :class="{ 'pl-4 text-xs text-neutral-400': fila.esReversion }">
            <template v-if="fila.esReversion">↳ </template>{{ cuentaPorId.get(fila.movimiento.cuenta_id)?.nombre ?? '—' }}
          </span>
        </template>
        <template #celda-periodo="{ fila }">
          <span v-if="periodoPorId.get(fila.movimiento.periodo_id)">
            {{ periodoPorId.get(fila.movimiento.periodo_id)!.anio }}-{{
              String(periodoPorId.get(fila.movimiento.periodo_id)!.mes).padStart(2, '0')
            }}
          </span>
          <span v-else>—</span>
        </template>
        <template #celda-monto="{ fila }">
          <span class="tabular-nums" :class="Number(fila.movimiento.monto) < 0 ? 'text-warning-500' : ''">
            {{ formatoMoneda(fila.movimiento.monto) }}
          </span>
        </template>
        <template #celda-descripcion="{ fila }">
          <span class="text-neutral-500">{{ fila.movimiento.descripcion ?? '—' }}</span>
        </template>
        <template #celda-centroCosto="{ fila }">
          <span class="text-neutral-500">
            {{ fila.movimiento.centro_costo_id ? centroCostoPorId.get(fila.movimiento.centro_costo_id) ?? '—' : '—' }}
          </span>
        </template>
        <template #celda-acciones="{ fila }">
          <UButton
            v-if="!fila.esReversion"
            size="xs"
            variant="ghost"
            :loading="revirtiendoId === fila.movimiento.id"
            @click="ajustar(fila.movimiento)"
          >
            Ajustar
          </UButton>
        </template>
      </UiTabla>
    </template>

    <PresupuestoEjecucionDrawer
      v-if="drawerAbierto && tenantStore.activeTenant"
      :tenant-id="tenantStore.activeTenant.id"
      @cerrar="drawerAbierto = false"
      @registrado="onRegistrado"
    />
  </div>
</template>
