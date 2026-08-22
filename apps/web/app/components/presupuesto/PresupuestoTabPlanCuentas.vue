<script setup lang="ts">
// Pestaña "Plan de cuentas" — fusión de lo que antes eran dos pestañas casi
// idénticas: "Catálogo de cuentas" (administrar el árbol: crear/editar/
// activar) y "Componentes presupuestales" (asignarle montos vía rubros).
// Mismo árbol de presupuesto_cuenta (E8) visto desde dos ángulos — mockup
// "Libro Presupuestal": un toggle "Ver montos / Editar estructura" en vez
// de dos pantallas con el mismo árbol y el mismo botón "Nueva cuenta"
// duplicado.
//
// "Ver montos" es el modo por defecto (para qué entra la mayoría de las
// veces) y muestra egresos/ingresos separados igual que el Estado de
// Resultado Integral real revisado (Casos de uso/Presupuesto), con el
// panel de reconciliación (Σ rubros de egreso vs. monto_total) como barra
// de progreso en vez de una línea de texto — es el desajuste más común y
// el que bloquea activar el presupuesto.
//
// "Editar estructura" es exactamente el contenido de la antigua página
// /presupuesto/cuentas (luego PresupuestoTabCuentas.vue) — administración
// del árbol, sin cambios de lógica, solo de ubicación.
const props = defineProps<{ presupuestoId: string | null }>()

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()
const fundamentoStore = useFundamentoNormativoStore()
const conceptoStore = useConceptoStore()

const modoVista = ref<'montos' | 'estructura'>('montos')

watch(
  () => props.presupuestoId,
  async (id) => {
    if (id) await Promise.all([presupuestoStore.cargarRubros(id), presupuestoStore.cargarTotalesCuenta(id)])
  },
  { immediate: true },
)

// Siempre recarga, sin el atajo `length === 0` que usan otras pestañas: esta vista decide qué
// cuenta es "cobro automático" (cuentasConConceptoAutomatico, abajo) a partir de
// conceptoStore.conceptos — un conceptoStore ya poblado por otra pestaña visitada antes en la
// misma sesión (ej. estado-cuenta/conceptos) podía quedar desactualizado tras editar el vínculo
// concepto↔cuenta en otra pestaña/sesión, mostrando el botón de asignar monto sobre una cuenta
// que en realidad ya no admite escritura manual (CUENTA_CONCEPTO_AUTOMATICO).
onMounted(() => {
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) conceptoStore.cargarConceptos(tenantId)
})

const presupuestoSeleccionado = computed(
  () => presupuestoStore.presupuestos.find((p) => p.id === props.presupuestoId) ?? null,
)

const fundamentoPorId = computed(
  () => new Map(fundamentoStore.fundamentos.map((f) => [f.id, f.norma])),
)

const cuentaPorId = computed(() => new Map(presupuestoStore.cuentas.map((c) => [c.id, c])))

const totalPorCuenta = computed(
  () => new Map(presupuestoStore.totalesCuenta.map((t) => [t.cuenta_id, Number(t.monto_acumulado)])),
)

/** Qué cuentas reciben su ingreso automáticamente de un concepto (dirección invertida,
 * 20260830200000: el vínculo vive en conceptos.presupuesto_cuenta_id) — mismo criterio que
 * PresupuestoTabEjecucion.vue. */
const cuentasConConceptoAutomatico = computed(
  () =>
    new Set(
      conceptoStore.conceptos
        .map((c) => c.presupuesto_cuenta_id)
        .filter((id): id is string => id !== null),
    ),
)

/** `ruta` es un path materializado zero-padded (ej. "0005.0001") — el
 * orden lexicográfico ya coincide con el orden del árbol, sin necesitar
 * una consulta recursiva en el cliente (mismo criterio que el store). */
function arbol(naturaleza: 'ingreso' | 'egreso') {
  return presupuestoStore.cuentas
    .filter((c) => c.naturaleza === naturaleza)
    .slice()
    .sort((a, b) => a.ruta.localeCompare(b.ruta))
}

const arbolEgresos = computed(() => arbol('egreso'))
const arbolIngresos = computed(() => arbol('ingreso'))

// ── Colapsar/expandir cuentas de grupo ───────────────────────────────────
// El árbol se renderiza como una lista plana ordenada por `ruta`, así que
// "colapsar" es esconder los descendientes, no anidar el DOM. El monto del
// grupo ya es un rollup (presupuesto_cuenta_totales), así que una rama
// contraída sigue mostrando su subtotal correcto — que es justo la utilidad
// de contraerla.
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

/** Oculta si CUALQUIER ancestro está contraído, no solo el padre directo — sube por parent_id
 * en vez de comparar prefijos de `ruta` porque parent_id es la relación autoritativa (la ruta
 * es un path de orden). El árbol está acotado a 4 niveles, así que el ascenso es corto. */
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

/** Cuántas cuentas esconde una rama contraída — se muestra en la fila del grupo para que
 * contraer no oculte que ahí abajo hay algo. */
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

/** Grupos con exactamente un hijo directo — el anti-patrón que ya corregimos una vez a mano
 * (el "Operacionales" que envolvía las 6 cuentas de egreso sin ninguna hermana). Comparado
 * contra un estado de resultado integral real (Casos de uso/Presupuesto/Ejemplo de
 * presupuesto.pdf, Conjunto Residencial Almendro P.H.): el propio documento tiene el mismo
 * defecto ("Seguros → Vida colectiva → Seguros copropiedad", un grupo de 3 niveles para una
 * sola cifra) — confirma que el problema es el grupo-de-un-solo-hijo, no la profundidad de 4
 * niveles (esa sí tiene respaldo real: "Energía eléctrica torres" → Torre 1..19). Se advierte,
 * no se bloquea — a veces un solo hijo hoy es el primero de varios que vendrán después. */
const gruposDeUnSoloHijo = computed(() => {
  const hijosPorPadre = new Map<string, number>()
  for (const cuenta of presupuestoStore.cuentas) {
    if (!cuenta.parent_id) continue
    hijosPorPadre.set(cuenta.parent_id, (hijosPorPadre.get(cuenta.parent_id) ?? 0) + 1)
  }
  const advertidos = new Set<string>()
  for (const [padreId, cantidad] of hijosPorPadre) {
    if (cantidad === 1) advertidos.add(padreId)
  }
  return advertidos
})

const sumaEgresos = computed(() =>
  presupuestoStore.rubros
    .filter((r) => cuentaPorId.value.get(r.cuenta_id)?.naturaleza === 'egreso')
    .reduce((acc, r) => acc + Number(r.monto_anual), 0),
)

const montoTotal = computed(() =>
  presupuestoSeleccionado.value ? Number(presupuestoSeleccionado.value.monto_total) : 0,
)

const faltante = computed(() => Math.max(montoTotal.value - sumaEgresos.value, 0))
const reconciliado = computed(() => sumaEgresos.value === montoTotal.value)
const porcentajeAsignado = computed(() =>
  montoTotal.value === 0 ? 0 : Math.min((sumaEgresos.value / montoTotal.value) * 100, 100),
)

function formatoMoneda(valor: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(valor))
}

function porcentajeDelTotal(cuentaId: string): string {
  if (montoTotal.value === 0) return '—'
  const monto = totalPorCuenta.value.get(cuentaId) ?? 0
  return `${((monto / montoTotal.value) * 100).toFixed(1)}%`
}

/** Rubros de una cuenta hoja puntual — las cuentas de grupo no tienen
 * rubros propios (guard_presupuesto_rubro_cuenta lo impide), así que no
 * hace falta acumular hacia hijos aquí. */
function rubrosDeCuenta(cuentaId: string) {
  return presupuestoStore.rubros.filter((r) => r.cuenta_id === cuentaId)
}

/** El detalle de rubros de una cuenta (tabla Código/Nombre/Monto/Fundamento debajo del árbol)
 * solo aporta algo cuando muestra información que la fila del árbol no muestra ya — con la
 * edición en línea del monto (más arriba), un solo rubro cuyo código/nombre coinciden con los
 * de la cuenta y sin fundamento es un duplicado exacto de esa fila, no un detalle. Se muestra
 * solo si: hay más de un rubro (la suma en el árbol es ambigua sin desglosarla), o el único
 * rubro tiene fundamento normativo, o su código/nombre difieren de los de la cuenta (el caso
 * documentado de una hoja que ganó hijos y conservó rubros propios con su propio código, E8). */
function detalleRubrosRelevante(cuenta: CuentaFila): boolean {
  const rubros = rubrosDeCuenta(cuenta.id)
  if (rubros.length > 1) return true
  const unico = rubros[0]
  if (!unico) return false
  return unico.fundamento_normativo_id !== null || unico.codigo !== cuenta.codigo || unico.nombre !== cuenta.nombre
}

const drawerRubroAbierto = ref(false)
const rubroEnEdicion = ref<(typeof presupuestoStore.rubros)[number] | null>(null)
const cuentaIdParaNuevoRubro = ref<string | undefined>(undefined)

function abrirNuevoRubro(): void {
  rubroEnEdicion.value = null
  cuentaIdParaNuevoRubro.value = undefined
  drawerRubroAbierto.value = true
}

function abrirEdicionRubro(rubro: (typeof presupuestoStore.rubros)[number]): void {
  rubroEnEdicion.value = rubro
  cuentaIdParaNuevoRubro.value = undefined
  drawerRubroAbierto.value = true
}

// ── Monto anual editable en la propia fila de la cuenta ──────────────────
// El monto vive en presupuesto_rubros, no en presupuesto_cuenta (E8: la cuenta persiste año a
// año, el monto cambia por versión), pero para el caso normal —una cuenta hoja con un solo
// monto anual— pedir código/nombre/cuenta en un drawer es fricción pura: la cuenta ya tiene
// código y nombre propios. Aquí se escribe el número directo sobre la fila y el rubro se crea
// (o se actualiza) derivando código/nombre de la cuenta. presupuesto_cuenta.codigo es único por
// tenant y esta ruta crea a lo sumo un rubro por cuenta, así que nunca choca con
// presupuesto_rubros_codigo_unico (presupuesto_id, codigo).
//
// El drawer completo sigue existiendo para lo que esto no cubre: varios rubros bajo una misma
// cuenta, o un rubro con fundamento normativo / código y nombre propios.
type CuentaFila = (typeof presupuestoStore.cuentas)[number]

const montoEditandoCuentaId = ref<string | null>(null)
const montoBorrador = ref<number | null>(null)
const guardandoMontoId = ref<string | null>(null)
const errorMonto = ref<string | null>(null)

/** Con más de un rubro el monto de la cuenta es una suma — cuál de los dos se edita sería
 * ambiguo, así que ese caso se resuelve en la tabla de detalle de abajo, rubro por rubro. */
function montoEditable(cuenta: CuentaFila): boolean {
  return (
    cuenta.es_hoja &&
    presupuestoSeleccionado.value?.estado === 'borrador' &&
    !cuentasConConceptoAutomatico.value.has(cuenta.id) &&
    rubrosDeCuenta(cuenta.id).length <= 1
  )
}

function iniciarEdicionMonto(cuenta: CuentaFila): void {
  errorMonto.value = null
  montoBorrador.value = totalPorCuenta.value.get(cuenta.id) ?? 0
  montoEditandoCuentaId.value = cuenta.id
}

function cancelarEdicionMonto(): void {
  montoEditandoCuentaId.value = null
  montoBorrador.value = null
}

/** Código libre para un rubro nuevo derivado de la cuenta. presupuesto_cuenta.codigo es único
 * por tenant, así que el caso normal nunca colisiona; el sufijo cubre el borde de que alguien
 * haya tecleado ese mismo código a mano desde el drawer (presupuesto_rubros_codigo_unico es
 * sobre presupuesto_id + codigo, sin mirar la cuenta). */
function codigoLibre(base: string, rubrosDelPresupuesto: readonly { codigo: string }[]): string {
  const tomados = new Set(rubrosDelPresupuesto.map((r) => r.codigo))
  if (!tomados.has(base)) return base
  let sufijo = 2
  while (tomados.has(`${base}-${sufijo}`)) sufijo += 1
  return `${base}-${sufijo}`
}

/** Se llama tanto desde Enter como desde blur — deshabilitar el input mientras guarda dispara
 * su propio blur, de ahí el guardia por guardandoMontoId (no un doble guardado).
 *
 * Relee los rubros del presupuesto antes de decidir crear vs. actualizar: decidirlo con la
 * copia en memoria hacía que una pestaña abierta desde antes de que otra sesión creara el
 * rubro intentara crearlo de nuevo y chocara contra presupuesto_rubros_codigo_unico. */
async function guardarMonto(cuenta: CuentaFila): Promise<void> {
  if (guardandoMontoId.value !== null || montoEditandoCuentaId.value !== cuenta.id) return

  const nuevoMonto = montoBorrador.value
  const montoActual = totalPorCuenta.value.get(cuenta.id) ?? 0
  const tenantId = tenantStore.activeTenant?.id
  if (
    nuevoMonto === null ||
    Number.isNaN(nuevoMonto) ||
    nuevoMonto < 0 ||
    nuevoMonto === montoActual ||
    !props.presupuestoId ||
    !tenantId
  ) {
    cancelarEdicionMonto()
    return
  }

  errorMonto.value = null
  guardandoMontoId.value = cuenta.id
  try {
    const rubrosFrescos = await presupuestoStore.cargarRubros(props.presupuestoId)
    const propios = rubrosFrescos.filter((r) => r.cuenta_id === cuenta.id)

    if (propios.length > 1) {
      errorMonto.value =
        `"${cuenta.nombre}" tiene varios rubros y su monto es la suma de todos — edítalos uno ` +
        'por uno en el detalle de abajo.'
      cancelarEdicionMonto()
      return
    }

    if (propios[0]) {
      await presupuestoStore.actualizarRubro({
        id: propios[0].id,
        presupuestoId: props.presupuestoId,
        montoAnual: nuevoMonto,
      })
    } else {
      await presupuestoStore.crearRubro({
        presupuestoId: props.presupuestoId,
        tenantId,
        codigo: codigoLibre(cuenta.codigo, rubrosFrescos),
        nombre: cuenta.nombre,
        cuentaId: cuenta.id,
        montoAnual: nuevoMonto,
      })
    }
    await presupuestoStore.cargarTotalesCuenta(props.presupuestoId)
    cancelarEdicionMonto()
  } catch (excepcion) {
    errorMonto.value = mensajeError(excepcion, 'No se pudo guardar el monto.')
  } finally {
    guardandoMontoId.value = null
  }
}

/** Foco + selección al aparecer el input, para poder teclear el monto nuevo de una vez. El
 * guardia contra activeElement evita robar el cursor si Vue vuelve a llamar la ref en un
 * re-render mientras se está escribiendo. */
function enfocarMonto(el: unknown): void {
  if (el instanceof HTMLInputElement && document.activeElement !== el) {
    el.focus()
    el.select()
  }
}

function cerrarDrawerRubro(): void {
  drawerRubroAbierto.value = false
  rubroEnEdicion.value = null
  cuentaIdParaNuevoRubro.value = undefined
}

function onRubroGuardado(): void {
  cerrarDrawerRubro()
  if (props.presupuestoId) presupuestoStore.cargarTotalesCuenta(props.presupuestoId)
}

// ── "Editar estructura" — administración del árbol (antes /presupuesto/cuentas) ──
const arbolCompleto = computed(() =>
  [...presupuestoStore.cuentas].sort((a, b) => a.ruta.localeCompare(b.ruta)),
)

const drawerCuentaAbierto = ref(false)
const cuentaEnEdicion = ref<(typeof presupuestoStore.cuentas)[number] | null>(null)
const parentIdParaNueva = ref<string | undefined>(undefined)

function abrirNuevaCuenta(parentId?: string): void {
  cuentaEnEdicion.value = null
  parentIdParaNueva.value = parentId
  drawerCuentaAbierto.value = true
}

function abrirEdicionCuenta(cuenta: (typeof presupuestoStore.cuentas)[number]): void {
  cuentaEnEdicion.value = cuenta
  parentIdParaNueva.value = undefined
  drawerCuentaAbierto.value = true
}

function cerrarDrawerCuenta(): void {
  drawerCuentaAbierto.value = false
  cuentaEnEdicion.value = null
}

const cambiandoActivaId = ref<string | null>(null)
const errorActiva = ref<string | null>(null)

async function alternarActiva(cuenta: (typeof presupuestoStore.cuentas)[number]): Promise<void> {
  errorActiva.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  cambiandoActivaId.value = cuenta.id
  try {
    await presupuestoStore.actualizarCuenta({
      id: cuenta.id,
      tenantId,
      activa: !cuenta.activa,
    })
  } catch (excepcion) {
    errorActiva.value = mensajeError(excepcion, 'No se pudo cambiar el estado.')
  } finally {
    cambiandoActivaId.value = null
  }
}
</script>

<template>
  <div class="space-y-6 max-w-[1030px] mx-auto">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-lg font-semibold">Plan de cuentas</h2>
        <p class="text-sm text-gray-500">
          La estructura de cuentas es fija por copropiedad; los montos se asignan por cada
          presupuesto.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-800 p-0.5">
          <UButton
            type="button"
            size="xs"
            :variant="modoVista === 'montos' ? 'solid' : 'ghost'"
            @click="modoVista = 'montos'"
          >
            Ver montos
          </UButton>
          <UButton
            type="button"
            size="xs"
            :variant="modoVista === 'estructura' ? 'solid' : 'ghost'"
            @click="modoVista = 'estructura'"
          >
            Editar estructura
          </UButton>
        </div>
        <UButton
          v-if="idsGrupo.length > 0"
          size="xs"
          variant="ghost"
          :icon="todoContraido ? 'i-lucide-chevrons-up-down' : 'i-lucide-chevrons-down-up'"
          @click="alternarTodo()"
        >
          {{ todoContraido ? 'Expandir todo' : 'Contraer todo' }}
        </UButton>
        <UButton
          v-if="modoVista === 'montos' && presupuestoSeleccionado?.estado === 'borrador'"
          size="xs"
          @click="abrirNuevoRubro()"
        >
          Agregar rubro
        </UButton>
        <UButton v-else-if="modoVista === 'estructura'" size="xs" variant="soft" @click="abrirNuevaCuenta()">
          Nueva cuenta
        </UButton>
      </div>
    </div>

    <!-- ══════════════════ Ver montos ══════════════════ -->
    <template v-if="modoVista === 'montos'">
      <div
        v-if="presupuestoSeleccionado"
        class="rounded-lg border p-4"
        :class="
          reconciliado
            ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20'
            : 'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20'
        "
      >
        <div class="flex items-baseline justify-between gap-3 flex-wrap mb-2">
          <p class="text-sm">
            <span class="text-xl font-semibold tabular-nums">{{ formatoMoneda(sumaEgresos) }}</span>
            <span class="text-gray-500"> asignados de {{ formatoMoneda(montoTotal) }} en rubros de egreso</span>
          </p>
        </div>
        <div class="h-1.5 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden mb-2">
          <div
            class="h-full rounded-full transition-all"
            :class="reconciliado ? 'bg-green-500' : 'bg-amber-500'"
            :style="{ width: `${porcentajeAsignado}%` }"
          />
        </div>
        <p class="text-xs" :class="reconciliado ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'">
          <template v-if="reconciliado">
            Los rubros de egreso cuadran con el monto total — este presupuesto puede activarse.
          </template>
          <template v-else>
            Faltan <strong class="tabular-nums">{{ formatoMoneda(faltante) }}</strong> por distribuir. Para
            activar este presupuesto, la suma de los rubros de egreso debe igualar el monto total
            aprobado en asamblea.
          </template>
        </p>
      </div>

      <UAlert v-if="errorMonto" color="error" variant="soft" :title="errorMonto" />

      <p v-if="presupuestoSeleccionado?.estado === 'borrador'" class="text-xs text-gray-500">
        Haz clic sobre el monto de una cuenta para escribir su valor anual.
      </p>

      <section
        v-for="seccion in [{ titulo: 'Egresos', filas: arbolEgresos }, { titulo: 'Ingresos', filas: arbolIngresos }]"
        :key="seccion.titulo"
      >
        <h3 class="text-sm font-semibold mb-2">{{ seccion.titulo }}</h3>
        <!-- claseCelda 'w-px whitespace-nowrap' en monto/porcentaje: sin table-layout:fixed, una
             tabla HTML reparte el ancho sobrante entre las columnas sin restricción — con solo
             3 columnas y nombres de cuenta cortos (grupos contraídos), esa sobra caía sobre
             "Monto" y separaba la cifra del "% del total" (screenshot del usuario). `width: 1%`
             es el truco estándar para que una columna se ajuste a su contenido y toda la
             sobra la absorba la única columna sin esa clase ("Cuenta"). -->
        <UiTabla
          :columnas="[
            { clave: 'nombre', etiqueta: 'Cuenta' },
            { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha', claseCelda: 'w-px whitespace-nowrap' },
            { clave: 'porcentaje', etiqueta: '% del total', alinear: 'derecha', claseCelda: 'w-px whitespace-nowrap' },
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
                class="flex size-5 shrink-0 items-center justify-center rounded border border-gray-300 text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800 dark:hover:text-white"
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
              <span v-if="!fila.es_hoja && gruposColapsados.has(fila.id)" class="text-xs text-gray-400">
                ({{ conteoDescendientes.get(fila.id) ?? 0 }})
              </span>
              <UBadge v-if="fila.es_hoja && cuentasConConceptoAutomatico.has(fila.id)" size="xs" variant="subtle">
                cobro automático
              </UBadge>
            </div>
          </template>
          <template #celda-monto="{ fila }">
            <input
              v-if="montoEditandoCuentaId === fila.id"
              :ref="enfocarMonto"
              v-model.number="montoBorrador"
              type="number"
              min="0"
              step="1000"
              :disabled="guardandoMontoId === fila.id"
              :aria-label="`Monto anual de ${fila.nombre}`"
              class="w-36 rounded-md border border-primary bg-white dark:bg-gray-900 px-2 py-0.5 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              @keydown.enter.prevent="guardarMonto(fila)"
              @keydown.esc.prevent="cancelarEdicionMonto()"
              @blur="guardarMonto(fila)"
            />
            <button
              v-else-if="montoEditable(fila)"
              type="button"
              class="group inline-flex items-center justify-end gap-1.5 rounded-md px-2 py-0.5 -mr-2 tabular-nums transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
              :title="`Editar el monto anual de ${fila.nombre}`"
              @click="iniciarEdicionMonto(fila)"
            >
              {{ formatoMoneda(totalPorCuenta.get(fila.id) ?? 0) }}
              <UIcon
                name="i-lucide-pencil"
                class="size-3 shrink-0 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100"
              />
            </button>
            <span v-else class="tabular-nums">{{ formatoMoneda(totalPorCuenta.get(fila.id) ?? 0) }}</span>
          </template>
          <template #celda-porcentaje="{ fila }">
            <span class="text-gray-500 tabular-nums">{{ porcentajeDelTotal(fila.id) }}</span>
          </template>
        </UiTabla>

        <!-- No se filtra por es_hoja: una cuenta que era hoja y ganó hijos después conserva los
             rubros que ya tenía directamente (E8, caso real verificado en dev) — siguen contando
             en su subtotal, así que también deben verse en el detalle si es relevante (ver
             detalleRubrosRelevante: oculta el caso común de un solo rubro que ya es un
             duplicado exacto de la fila del árbol de arriba). -->
        <div v-for="cuenta in visibles(seccion.filas).filter(detalleRubrosRelevante)" :key="cuenta.id" class="mt-3">
          <h4 class="text-xs font-medium text-gray-500 mb-1" :style="{ paddingLeft: `${(cuenta.nivel - 1) * 16}px` }">
            {{ cuenta.nombre }}
          </h4>
          <UiTabla
            :columnas="[
              { clave: 'codigo', etiqueta: 'Código' },
              { clave: 'nombre', etiqueta: 'Nombre' },
              { clave: 'montoAnual', etiqueta: 'Monto anual', alinear: 'derecha' },
              { clave: 'fundamento', etiqueta: 'Fundamento' },
              { clave: 'acciones', etiqueta: '' },
            ]"
            :filas="rubrosDeCuenta(cuenta.id)"
            :clave-fila="(rubro) => rubro.id"
          >
            <template #celda-codigo="{ fila }">{{ fila.codigo }}</template>
            <template #celda-nombre="{ fila }">{{ fila.nombre }}</template>
            <template #celda-montoAnual="{ fila }">
              <span class="tabular-nums">{{ formatoMoneda(fila.monto_anual) }}</span>
            </template>
            <template #celda-fundamento="{ fila }">
              <span class="text-gray-500">
                {{ fila.fundamento_normativo_id ? fundamentoPorId.get(fila.fundamento_normativo_id) : '—' }}
              </span>
            </template>
            <template #celda-acciones="{ fila }">
              <div class="flex justify-end">
                <UButton
                  v-if="presupuestoSeleccionado?.estado === 'borrador'"
                  size="xs"
                  variant="soft"
                  icon="i-lucide-pencil"
                  aria-label="Editar rubro"
                  @click="abrirEdicionRubro(fila)"
                />
              </div>
            </template>
          </UiTabla>
        </div>
      </section>

      <p v-if="cuentasConConceptoAutomatico.size > 0" class="text-xs text-gray-500">
        <UBadge size="xs" variant="subtle">cobro automático</UBadge>
        el valor de esta cuenta se toma directamente de lo facturado por el concepto vinculado —
        no se digita a mano ni se puede editar aquí.
      </p>

      <PresupuestoRubroDrawer
        v-if="drawerRubroAbierto && presupuestoId"
        :presupuesto-id="presupuestoId"
        :rubro="rubroEnEdicion ?? undefined"
        :cuenta-id-inicial="cuentaIdParaNuevoRubro"
        @cerrar="cerrarDrawerRubro"
        @creado="onRubroGuardado"
        @editado="onRubroGuardado"
      />
    </template>

    <!-- ══════════════════ Editar estructura ══════════════════ -->
    <template v-else>
      <UAlert v-if="errorActiva" color="error" variant="soft" :title="errorActiva" />

      <p v-if="arbolCompleto.length === 0" class="text-gray-500 text-sm">
        Esta copropiedad todavía no tiene cuentas presupuestales.
      </p>

      <UiTabla
        v-else
        :columnas="[
          { clave: 'nombre', etiqueta: 'Cuenta' },
          { clave: 'codigo', etiqueta: 'Código' },
          { clave: 'naturaleza', etiqueta: 'Naturaleza' },
          { clave: 'tipo', etiqueta: 'Tipo' },
          { clave: 'orden', etiqueta: 'Orden', alinear: 'derecha' },
          { clave: 'estado', etiqueta: 'Estado' },
          { clave: 'acciones', etiqueta: '' },
        ]"
        :filas="visibles(arbolCompleto)"
        :clave-fila="(fila) => fila.id"
      >
        <template #celda-nombre="{ fila }">
          <div class="flex items-center gap-1" :style="{ paddingLeft: `${(fila.nivel - 1) * 16}px` }">
            <button
              v-if="!fila.es_hoja"
              type="button"
              class="flex size-5 shrink-0 items-center justify-center rounded border border-gray-300 text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800 dark:hover:text-white"
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
            <span v-if="!fila.es_hoja && gruposColapsados.has(fila.id)" class="text-xs text-gray-400">
              ({{ conteoDescendientes.get(fila.id) ?? 0 }})
            </span>
            <UIcon
              v-if="!fila.es_hoja && gruposDeUnSoloHijo.has(fila.id)"
              name="i-lucide-triangle-alert"
              class="size-3.5 shrink-0 text-amber-500"
              :title="`«${fila.nombre}» agrupa un solo elemento — considera moverlo directo a su padre en vez de mantener este grupo`"
            />
          </div>
        </template>
        <template #celda-codigo="{ fila }"><span class="font-mono text-xs">{{ fila.codigo }}</span></template>
        <template #celda-naturaleza="{ fila }">
          <span class="text-gray-500">{{ fila.naturaleza === 'egreso' ? 'Egreso' : 'Ingreso' }}</span>
        </template>
        <template #celda-tipo="{ fila }">
          <span class="text-gray-500">{{ fila.es_hoja ? 'Hoja' : 'Grupo' }}</span>
        </template>
        <template #celda-orden="{ fila }"><span class="text-gray-500 tabular-nums">{{ fila.orden }}</span></template>
        <template #celda-estado="{ fila }">
          <span :class="fila.activa ? 'text-green-600' : 'text-gray-400'">
            {{ fila.activa ? 'Activa' : 'Inactiva' }}
          </span>
        </template>
        <template #celda-acciones="{ fila }">
          <div class="flex justify-end gap-2">
            <UButton
              size="xs"
              variant="soft"
              icon="i-lucide-pencil"
              aria-label="Editar"
              @click="abrirEdicionCuenta(fila)"
            />
            <UButton
              size="xs"
              variant="soft"
              icon="i-lucide-plus"
              aria-label="Agregar subcuenta"
              @click="abrirNuevaCuenta(fila.id)"
            />
            <UButton
              size="xs"
              variant="ghost"
              :color="fila.activa ? 'error' : 'primary'"
              :icon="fila.activa ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              :aria-label="fila.activa ? 'Desactivar' : 'Activar'"
              :loading="cambiandoActivaId === fila.id"
              @click="alternarActiva(fila)"
            />
          </div>
        </template>
      </UiTabla>

      <PresupuestoCuentaDrawer
        v-if="drawerCuentaAbierto && tenantStore.activeTenant"
        :tenant-id="tenantStore.activeTenant.id"
        :cuenta="cuentaEnEdicion ?? undefined"
        :parent-id-inicial="parentIdParaNueva"
        @cerrar="cerrarDrawerCuenta"
        @creada="cerrarDrawerCuenta"
        @editada="cerrarDrawerCuenta"
      />
    </template>
  </div>
</template>
