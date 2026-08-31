<script setup lang="ts">
// Pestaña "Plan de cuentas" — una sola tabla para estructura y montos, en vez del toggle
// "Ver montos / Editar estructura" que tenía antes (dos pantallas casi idénticas del mismo
// árbol de presupuesto_cuenta, E8). Fusión pedida por el usuario (2026-08-24) siguiendo la
// misma filosofía ya aplicada en el plan de cuentas contable: el nombre es un link que edita
// la cuenta, y un único "+" que solo aparece al pasar el ratón sobre el nombre agrega una
// subcuenta (feedback de usuario, 2026-08-24: un "+" también junto al monto confundía — debe
// haber uno solo por fila).
//
// Columnas fusionadas: Cuenta, Tipo, Orden, Monto, % del total, Activa. Código se quitó
// (decisión explícita del usuario, 2026-08-24) — sigue viajando dentro de la cuenta y visible
// al editarla, solo deja de ocupar columna propia. "Estado" (texto Activa/Inactiva) y
// "Acciones" (el botón de activar/desactivar) eran dos columnas separadas en la antigua
// "Editar estructura" — se fusionan en una sola ("Activa"): el icono/color del botón ya
// comunica el estado, no hace falta repetirlo en texto aparte.
//
// El botón genérico "Agregar rubro" de la cabecera se quitó (decisión explícita del usuario):
// el "+" por fila ya cubre el caso con la cuenta preseleccionada, que es estrictamente mejor
// que abrir el drawer y tener que elegirla a mano.
const props = defineProps<{ presupuestoId: string | null }>()

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()
const fundamentoStore = useFundamentoNormativoStore()
const conceptoStore = useConceptoStore()
const toast = useToast()

watch(
  () => props.presupuestoId,
  async (id) => {
    if (id) {
      await Promise.all([
        presupuestoStore.cargarRubros(id),
        presupuestoStore.cargarTotalesCuenta(id),
        presupuestoStore.cargarFuentesFinanciacion(id),
      ])
    }
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
  if (tenantId) {
    conceptoStore.cargarConceptos(tenantId)
    if (presupuestoStore.tiposFuente.length === 0) presupuestoStore.cargarTiposFuente(tenantId)
  }
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

/** Reconciliación con "Fuentes de financiación" (20260830400000, investigación INCP/Ley 675 art.
 * 35/38): una cuenta de Ingresos con monto asignado, que no es cobro automático de un concepto y
 * que ninguna fuente de tipo "otros_ingresos"/"cuota_extraordinaria" vincula, es un aviso —
 * ambas tablas modelan la misma plata desde ángulos distintos y no se reconcilian solas. */
const tipoCodigoPorId = computed(
  () => new Map(presupuestoStore.tiposFuente.map((t) => [t.id, t.codigo])),
)
const cuentasVinculadasDesdeFuente = computed(
  () =>
    new Set(
      presupuestoStore.fuentes
        .filter((f) => {
          const codigo = tipoCodigoPorId.value.get(f.tipo_id)
          return codigo === 'otros_ingresos' || codigo === 'cuota_extraordinaria'
        })
        .map((f) => f.presupuesto_cuenta_id)
        .filter((id): id is string => id !== null),
    ),
)

function sinFuenteVinculada(cuenta: { id: string; naturaleza: string; es_hoja: boolean }): boolean {
  return (
    cuenta.naturaleza === 'ingreso' &&
    cuenta.es_hoja &&
    !cuentasConConceptoAutomatico.value.has(cuenta.id) &&
    !cuentasVinculadasDesdeFuente.value.has(cuenta.id) &&
    (totalPorCuenta.value.get(cuenta.id) ?? 0) > 0
  )
}

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

const montoTotal = computed(() =>
  presupuestoSeleccionado.value ? Number(presupuestoSeleccionado.value.monto_total) : 0,
)

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

// El "+" para crear un rubro nuevo se quitó de la columna Monto (feedback de usuario,
// 2026-08-24: solo debe haber un "+" por fila, junto al nombre, para agregar subcuenta). El
// alta del primer rubro de una cuenta hoja sigue cubierta por la edición en línea del monto
// (guardarMonto, arriba); este drawer ahora solo se abre en modo edición.
const rubroEnEdicion = ref<(typeof presupuestoStore.rubros)[number] | null>(null)

function abrirEdicionRubro(rubro: (typeof presupuestoStore.rubros)[number]): void {
  rubroEnEdicion.value = rubro
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
    toast.add({ title: `Monto de "${cuenta.nombre}" actualizado`, color: 'success' })
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
  rubroEnEdicion.value = null
}

function onRubroGuardado(): void {
  cerrarDrawerRubro()
  if (props.presupuestoId) presupuestoStore.cargarTotalesCuenta(props.presupuestoId)
  toast.add({ title: 'Rubro guardado', color: 'success' })
}

// ── Administración del árbol (antes /presupuesto/cuentas, luego "Editar estructura") ─────────
// Separado en Egresos/Ingresos (arbolEgresos/arbolIngresos, arriba) — antes era una sola tabla
// ordenada por `ruta` sin separar naturaleza, y esos dos árboles pueden interleavarse en el
// orden lexicográfico (feedback de usuario: la tabla mezclaba cuentas de Ingreso y Egreso sin
// ninguna agrupación).
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

function onCuentaCreada(): void {
  cerrarDrawerCuenta()
  toast.add({ title: 'Cuenta creada', color: 'success' })
}

function onCuentaEditada(): void {
  cerrarDrawerCuenta()
  toast.add({ title: 'Cuenta actualizada', color: 'success' })
}

const cambiandoActivaId = ref<string | null>(null)
const errorActiva = ref<string | null>(null)

async function alternarActiva(cuenta: (typeof presupuestoStore.cuentas)[number]): Promise<void> {
  errorActiva.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  cambiandoActivaId.value = cuenta.id
  try {
    const activarla = !cuenta.activa
    await presupuestoStore.actualizarCuenta({
      id: cuenta.id,
      tenantId,
      activa: activarla,
    })
    toast.add({ title: `"${cuenta.nombre}" ${activarla ? 'activada' : 'desactivada'}`, color: 'success' })
  } catch (excepcion) {
    errorActiva.value = mensajeError(excepcion, 'No se pudo cambiar el estado.')
  } finally {
    cambiandoActivaId.value = null
  }
}
</script>

<template>
  <div class="space-y-6 max-w-[1030px] mx-auto">
    <div>
      <h2 class="text-lg font-semibold">Plan de cuentas</h2>
      <p class="text-sm text-neutral-500">
        La estructura de cuentas es fija por copropiedad; los montos se asignan por cada
        presupuesto.
      </p>
    </div>

    <UAlert v-if="errorMonto" color="error" variant="soft" :title="errorMonto" />
    <UAlert v-if="errorActiva" color="error" variant="soft" :title="errorActiva" />

    <section
      v-for="seccion in [{ titulo: 'Egresos', filas: arbolEgresos }, { titulo: 'Ingresos', filas: arbolIngresos }]"
      :key="seccion.titulo"
    >
      <div class="flex items-center justify-between gap-2 mb-2">
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
        <UButton
          v-if="seccion.titulo === 'Egresos'"
          size="xs"
          variant="soft"
          icon="i-lucide-plus"
          @click="abrirNuevaCuenta()"
        >
          Nueva cuenta
        </UButton>
      </div>
      <!-- `fijo` (table-layout: fixed): el truco `width: 1%` (auto-layout) solo insinúa
           "encógete al contenido" — el navegador podía seguir estirando "Cuenta" más allá de lo
           necesario y empujar Tipo/Orden lejos del nombre (feedback de usuario, screenshot).
           Con `fijo`, cada `ancho` es una medida real y solo "Cuenta" queda sin `ancho` para
           absorber el resto de forma determinista. -->
      <UiTabla
        fijo
        :columnas="[
          { clave: 'nombre', etiqueta: 'Cuenta' },
          { clave: 'tipo', etiqueta: 'Tipo', ancho: '90px' },
          { clave: 'orden', etiqueta: 'Orden', alinear: 'derecha', ancho: '70px' },
          { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha', ancho: '200px' },
          { clave: 'porcentaje', etiqueta: '% del total', alinear: 'derecha', ancho: '100px' },
          { clave: 'activa', etiqueta: 'Activa', alinear: 'derecha', ancho: '70px' },
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
            <button
              type="button"
              class="flex items-center gap-1 hover:underline hover:text-primary rounded-sm"
              :title="`Editar ${fila.nombre}`"
              @click="abrirEdicionCuenta(fila)"
            >
              <span :class="{ 'font-medium': fila.nivel === 1 }">{{ fila.nombre }}</span>
            </button>
            <span v-if="!fila.es_hoja && gruposColapsados.has(fila.id)" class="text-xs text-neutral-400">
              ({{ conteoDescendientes.get(fila.id) ?? 0 }})
            </span>
            <UBadge v-if="fila.es_hoja && cuentasConConceptoAutomatico.has(fila.id)" size="xs" variant="subtle">
              cobro automático
            </UBadge>
            <UBadge
              v-else-if="fila.es_hoja && sinFuenteVinculada(fila)"
              size="xs"
              color="warning"
              variant="subtle"
              :title="'Este ingreso no tiene una fuente de financiación vinculada en la pestaña Fuentes de financiación.'"
            >
              sin fuente vinculada
            </UBadge>
            <UIcon
              v-if="!fila.es_hoja && gruposDeUnSoloHijo.has(fila.id)"
              name="i-lucide-triangle-alert"
              class="size-3.5 shrink-0 text-warning-500"
              :title="`«${fila.nombre}» agrupa un solo elemento — considera moverlo directo a su padre en vez de mantener este grupo`"
            />
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-plus"
              aria-label="Agregar subcuenta"
              :title="`Agregar cuenta bajo ${fila.nombre}`"
              class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              @click="abrirNuevaCuenta(fila.id)"
            />
          </div>
        </template>
        <template #celda-tipo="{ fila }">
          <span class="text-neutral-500">{{ fila.es_hoja ? 'Hoja' : 'Grupo' }}</span>
        </template>
        <template #celda-orden="{ fila }"><span class="text-neutral-500 tabular-nums">{{ fila.orden }}</span></template>
        <template #celda-monto="{ fila }">
          <div class="flex items-center justify-end gap-1">
            <input
              v-if="montoEditandoCuentaId === fila.id"
              :ref="enfocarMonto"
              v-model.number="montoBorrador"
              type="number"
              min="0"
              step="1000"
              :disabled="guardandoMontoId === fila.id"
              :aria-label="`Monto anual de ${fila.nombre}`"
              class="w-36 rounded-md border border-primary bg-white dark:bg-neutral-900 px-2 py-0.5 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              @keydown.enter.prevent="guardarMonto(fila)"
              @keydown.esc.prevent="cancelarEdicionMonto()"
              @blur="guardarMonto(fila)"
            />
            <button
              v-else-if="montoEditable(fila)"
              type="button"
              class="group inline-flex items-center justify-end gap-1.5 rounded-md px-2 py-0.5 -mr-2 tabular-nums transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
              :title="`Editar el monto anual de ${fila.nombre}`"
              @click="iniciarEdicionMonto(fila)"
            >
              {{ formatoMoneda(totalPorCuenta.get(fila.id) ?? 0) }}
              <UIcon
                name="i-lucide-pencil"
                class="size-3 shrink-0 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100"
              />
            </button>
            <span v-else class="tabular-nums">{{ formatoMoneda(totalPorCuenta.get(fila.id) ?? 0) }}</span>
          </div>
        </template>
        <template #celda-porcentaje="{ fila }">
          <span class="text-neutral-500 tabular-nums">{{ porcentajeDelTotal(fila.id) }}</span>
        </template>
        <template #celda-activa="{ fila }">
          <div class="flex justify-end">
            <UButton
              size="xs"
              variant="ghost"
              :color="fila.activa ? 'neutral' : 'primary'"
              :icon="fila.activa ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              :aria-label="fila.activa ? 'Desactivar' : 'Activar'"
              :loading="cambiandoActivaId === fila.id"
              @click="alternarActiva(fila)"
            />
          </div>
        </template>
      </UiTabla>

      <!-- No se filtra por es_hoja: una cuenta que era hoja y ganó hijos después conserva los
           rubros que ya tenía directamente (E8, caso real verificado en dev) — siguen contando
           en su subtotal, así que también deben verse en el detalle si es relevante (ver
           detalleRubrosRelevante: oculta el caso común de un solo rubro que ya es un
           duplicado exacto de la fila del árbol de arriba). -->
      <div v-for="cuenta in visibles(seccion.filas).filter(detalleRubrosRelevante)" :key="cuenta.id" class="mt-3">
        <h4 class="text-xs font-medium text-neutral-500 mb-1" :style="{ paddingLeft: `${(cuenta.nivel - 1) * 16}px` }">
          {{ cuenta.nombre }}
        </h4>
        <UiTabla
          :columnas="[
            { clave: 'codigo', etiqueta: 'Código' },
            { clave: 'nombre', etiqueta: 'Nombre' },
            { clave: 'montoAnual', etiqueta: 'Monto anual', alinear: 'derecha' },
            { clave: 'fundamento', etiqueta: 'Fundamento' },
          ]"
          :filas="rubrosDeCuenta(cuenta.id)"
          :clave-fila="(rubro) => rubro.id"
        >
          <template #celda-codigo="{ fila }">{{ fila.codigo }}</template>
          <template #celda-nombre="{ fila }">
            <button
              v-if="presupuestoSeleccionado?.estado === 'borrador'"
              type="button"
              class="hover:underline hover:text-primary rounded-sm"
              :title="`Editar rubro ${fila.nombre}`"
              @click="abrirEdicionRubro(fila)"
            >
              {{ fila.nombre }}
            </button>
            <span v-else>{{ fila.nombre }}</span>
          </template>
          <template #celda-montoAnual="{ fila }">
            <span class="tabular-nums">{{ formatoMoneda(fila.monto_anual) }}</span>
          </template>
          <template #celda-fundamento="{ fila }">
            <span class="text-neutral-500">
              {{ fila.fundamento_normativo_id ? fundamentoPorId.get(fila.fundamento_normativo_id) : '—' }}
            </span>
          </template>
        </UiTabla>
      </div>
    </section>

    <p v-if="cuentasConConceptoAutomatico.size > 0" class="text-xs text-neutral-500">
      <UBadge size="xs" variant="subtle">cobro automático</UBadge>
      el valor de esta cuenta se toma directamente de lo facturado por el concepto vinculado —
      no se digita a mano ni se puede editar aquí.
    </p>

    <PresupuestoRubroDrawer
      v-if="rubroEnEdicion && presupuestoId"
      :presupuesto-id="presupuestoId"
      :rubro="rubroEnEdicion"
      @cerrar="cerrarDrawerRubro"
      @creado="onRubroGuardado"
      @editado="onRubroGuardado"
    />

    <PresupuestoCuentaDrawer
      v-if="drawerCuentaAbierto && tenantStore.activeTenant"
      :tenant-id="tenantStore.activeTenant.id"
      :cuenta="cuentaEnEdicion ?? undefined"
      :parent-id-inicial="parentIdParaNueva"
      @cerrar="cerrarDrawerCuenta"
      @creada="onCuentaCreada"
      @editada="onCuentaEditada"
    />
  </div>
</template>
