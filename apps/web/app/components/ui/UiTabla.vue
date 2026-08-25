<script setup lang="ts" generic="T">
// Tabla genérica y headless — centraliza <table>/<thead>/<tbody> + estado
// vacío + las dos variantes visuales de la app (mismo criterio que
// UiSelectorBuscable.vue/UiDrawer.vue). Headless en el contenido de cada
// celda a propósito: cada tabla existente tiene su propia lógica de celda
// (badges, botones de acción, montos formateados) — un data-grid 100%
// genérico sería más complicado que las tablas actuales, no menos. El
// consumidor pasa un slot por columna (#celda-<clave>); sin slot, se
// muestra fila[columna.clave] tal cual (suficiente para columnas de texto
// plano).
export interface ColumnaTabla<TFila = unknown> {
  clave: string
  etiqueta: string
  alinear?: 'derecha'
  /** Clase(s) extra para el <td> — p. ej. "mono" para columnas monoespaciadas. */
  claseCelda?: string
  /** Ancho fijo (CSS width, ej. "140px") aplicado a th y td — para alinear columnas entre dos
   * <table> separadas que deben leerse como una sola grilla (p. ej. secciones Egresos/Ingresos
   * de un mismo árbol de cuentas, cada una su propia UiTabla con auto-layout independiente). */
  ancho?: string
  /** Si se define, el encabezado se vuelve clickeable para ordenar por esta
   * columna — extrae el valor comparable de la fila (no siempre es
   * `fila[clave]`: "Tipo" o "Saldo" suelen venir de un catálogo o de un mapa
   * externo, no de un campo plano). Sin esta función la columna no ordena,
   * ni cambia nada del comportamiento actual. */
  ordenar?: (fila: TFila) => string | number | null | undefined
}

/** Estado de orden — se puede dejar que lo maneje la tabla (modo normal) o
 * controlarlo desde afuera pasando `orden` (ver más abajo). */
export interface OrdenTabla {
  clave: string | null
  direccion: 'asc' | 'desc'
}

const props = withDefaults(
  defineProps<{
    columnas: ColumnaTabla<T>[]
    filas: readonly T[]
    claveFila: (fila: T, indice: number) => string | number
    variante?: 'ficha' | 'tailwind'
    vacio?: string
    /** Marca una fila como encabezado de grupo: se pinta con el slot
     * `#grupo` ocupando las primeras `colspanGrupo` columnas, y las columnas
     * restantes siguen usando su `#celda-*` normal (así los totales del
     * grupo quedan alineados bajo su propia columna). */
    esFilaGrupo?: (fila: T) => boolean
    colspanGrupo?: number
    /** Modo controlado: si se pasa, la tabla NO ordena `filas` — solo pinta
     * los encabezados y emite `update:orden`. Lo necesita quien agrupa las
     * filas, porque ahí el orden se aplica dentro de cada grupo y la tabla
     * no puede reordenar el arreglo entero sin romper la jerarquía. */
    orden?: OrdenTabla
    /** Encabezado con más padding vertical — opt-in por tabla, no cambia el
     * default (variante="tailwind" normal) para no afectar el resto de la
     * app. */
    encabezadoAlto?: boolean
    /** table-layout: fixed — opt-in por tabla. El truco `width: 1%` (claseCelda 'w-px') solo
     * funciona en auto-layout como una PISTA de "encoge al contenido"; el navegador puede
     * seguir estirando esa columna si el contenido de otra fila es más ancho (visto en
     * PresupuestoTabPlanCuentas.vue: Tipo/Orden se corrían a la derecha porque "Cuenta" seguía
     * creciendo). Con `fijo`, cada `ancho` es una medida real y la única columna sin `ancho`
     * absorbe el resto de forma determinista — pero entonces TODAS las columnas necesitan un
     * `ancho` explícito salvo esa, porque en table-layout:fixed no hay heurística de contenido. */
    fijo?: boolean
  }>(),
  {
    variante: 'tailwind',
    vacio: 'Sin registros.',
    esFilaGrupo: undefined,
    colspanGrupo: undefined,
    orden: undefined,
    encabezadoAlto: false,
    fijo: false,
  },
)

const emit = defineEmits<{ 'update:orden': [OrdenTabla] }>()

function valorCelda(fila: T, clave: string): unknown {
  return (fila as Record<string, unknown>)[clave]
}

// ── orden por columna ────────────────────────────────────────────────────
// Opt-in por columna (`ordenar`) y sin estado hasta que el usuario haga clic
// — mientras no se toque ningún encabezado, `filasOrdenadas` es exactamente
// `filas` en el mismo orden, así que el índice que reciben los slots
// (`:indice`) no cambia para las tablas que ya lo usan para borrar/editar por
// posición (p. ej. InmuebleDatosBase.vue). Solo se desalinea si la propia
// tabla activa el orden, y ahí es responsabilidad de quien la use no
// depender del índice si también ordena.
const ordenInterno = ref<OrdenTabla>({ clave: null, direccion: 'asc' })

/** El orden vigente sale del prop cuando la tabla es controlada, y del
 * estado propio cuando no. */
const ordenActual = computed<OrdenTabla>(() => props.orden ?? ordenInterno.value)

function alternarOrden(col: ColumnaTabla<T>): void {
  if (!col.ordenar) return
  const actual = ordenActual.value
  const siguiente: OrdenTabla =
    actual.clave === col.clave
      ? { clave: col.clave, direccion: actual.direccion === 'asc' ? 'desc' : 'asc' }
      : { clave: col.clave, direccion: 'asc' }
  ordenInterno.value = siguiente
  emit('update:orden', siguiente)
}

const filasOrdenadas = computed(() => {
  // Controlada: quien la usa ya entregó las filas en el orden que quiere.
  if (props.orden !== undefined) return props.filas

  const col = props.columnas.find((c) => c.clave === ordenInterno.value.clave)
  if (!col?.ordenar) return props.filas

  const extraer = col.ordenar
  const signo = ordenInterno.value.direccion === 'asc' ? 1 : -1
  return [...props.filas].sort((a, b) => {
    const va = extraer(a)
    const vb = extraer(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * signo
    return (va < vb ? -1 : va > vb ? 1 : 0) * signo
  })
})

/** Columnas que sobreviven al colspan de una fila de grupo. */
const columnasTrasGrupo = computed(() =>
  props.columnas.slice(props.colspanGrupo ?? props.columnas.length),
)
</script>

<template>
  <table
    v-if="filas.length > 0"
    :class="variante === 'tailwind' ? ['w-full text-sm', fijo ? 'table-fixed' : ''] : undefined"
  >
    <thead>
      <tr
        :class="
          variante === 'tailwind' ? 'text-left text-gray-500 border-b border-gray-200 dark:border-gray-800' : undefined
        "
      >
        <th
          v-for="col in columnas"
          :key="col.clave"
          :style="col.ancho ? { width: col.ancho } : undefined"
          :class="[
            col.alinear === 'derecha' && variante === 'ficha' ? 'num' : '',
            variante === 'tailwind'
              ? [encabezadoAlto ? 'py-2.5' : 'py-1', 'px-3 font-medium', col.alinear === 'derecha' ? 'text-right' : '']
              : '',
          ]"
        >
          <button
            v-if="col.ordenar"
            type="button"
            class="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300"
            :class="col.alinear === 'derecha' ? 'flex-row-reverse' : ''"
            @click="alternarOrden(col)"
          >
            <slot :name="`encabezado-${col.clave}`">{{ col.etiqueta }}</slot>
            <UIcon
              :name="
                ordenActual.clave === col.clave
                  ? ordenActual.direccion === 'asc'
                    ? 'i-lucide-chevron-up'
                    : 'i-lucide-chevron-down'
                  : 'i-lucide-chevrons-up-down'
              "
              class="size-3.5"
              :class="ordenActual.clave === col.clave ? '' : 'opacity-40'"
            />
          </button>
          <slot v-else :name="`encabezado-${col.clave}`">{{ col.etiqueta }}</slot>
        </th>
      </tr>
    </thead>
    <tbody>
      <template v-for="(fila, indice) in filasOrdenadas" :key="claveFila(fila, indice)">
        <tr
          v-if="esFilaGrupo && esFilaGrupo(fila)"
          :class="
            variante === 'tailwind'
              ? 'group border-b border-gray-100 dark:border-gray-900 bg-gray-50 dark:bg-gray-900/50'
              : 'group'
          "
        >
          <td
            :colspan="colspanGrupo ?? columnas.length"
            :class="variante === 'tailwind' ? 'py-1.5 px-3' : undefined"
          >
            <slot name="grupo" :fila="fila" :indice="indice" />
          </td>
          <td
            v-for="col in columnasTrasGrupo"
            :key="col.clave"
            :style="col.ancho ? { width: col.ancho } : undefined"
            :class="[
              col.alinear === 'derecha' && variante === 'ficha' ? 'num' : '',
              variante === 'tailwind' ? ['py-1.5 px-3', col.alinear === 'derecha' ? 'text-right' : ''] : '',
              col.claseCelda,
            ]"
          >
            <slot :name="`celda-${col.clave}`" :fila="fila" :indice="indice">{{ valorCelda(fila, col.clave) }}</slot>
          </td>
        </tr>
        <tr
          v-else
          :class="variante === 'tailwind' ? 'group border-b border-gray-100 dark:border-gray-900' : 'group'"
        >
          <td
            v-for="col in columnas"
            :key="col.clave"
            :style="col.ancho ? { width: col.ancho } : undefined"
            :class="[
              col.alinear === 'derecha' && variante === 'ficha' ? 'num' : '',
              variante === 'tailwind' ? ['py-1.5 px-3', col.alinear === 'derecha' ? 'text-right' : ''] : '',
              col.claseCelda,
            ]"
          >
            <slot :name="`celda-${col.clave}`" :fila="fila" :indice="indice">{{ valorCelda(fila, col.clave) }}</slot>
          </td>
        </tr>
      </template>
    </tbody>
  </table>
  <p v-else :class="variante === 'ficha' ? 'empty-state' : 'text-gray-500 text-sm'">
    <slot name="vacio">{{ vacio }}</slot>
  </p>
</template>
