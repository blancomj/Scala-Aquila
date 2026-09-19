// `toRaw` se importa explícito (a diferencia de `ref`/`computed` más abajo, que son globales
// auto-importados por Nuxt) porque lo usa `clonar()`, una función pura que SÍ se prueba
// directamente fuera de contexto de app — ver el comentario sobre `useFiltros()` más abajo.
import { toRaw } from 'vue'
import { formatoMoneda } from '~/utils/formato'

/**
 * Patrón de filtros reutilizable para listados con varias dimensiones de filtro — evaluado
 * contra VecindApp/Vecitienda (2026-09-18) y generalizado como convención transversal (ver
 * CLAUDE.md, "Panel de filtros reutilizable"). Idea central: estado "borrador" editable en un
 * panel (`UiPanelFiltros`), separado del estado "aplicado" que de verdad dispara la consulta —
 * nada cambia hasta `aplicar()`. La barra de chips (`UiChipsFiltros`) lee solo `aplicados`.
 *
 * No reemplaza la barra de USelect en línea que ya usan pantallas con 2-4 filtros simples
 * (inmuebles/index.vue, mantenimiento/activos/index.vue, etc.) — esa sigue siendo la opción por
 * defecto para pocos filtros que caben en una fila. Este composable es para cuando el listado
 * necesita más dimensiones de las que caben en línea, o al menos un filtro multiselección sobre
 * catálogo (el equivalente al filtro de ciudades de VecindApp).
 */

export interface OpcionFiltro {
  /** `null` es válido acá SOLO para la opción "Todos/Todas..." de un campo `select` — debe
   * coincidir con el valor inicial de ese campo en `useFiltros()` para que "quitar"/"limpiar"
   * la seleccionen de vuelta correctamente. Un campo `multiselect` nunca debería declarar una
   * opción con `valor: null` (no tiene sentido multiseleccionar "ninguno"). */
  valor: string | number | null
  etiqueta: string
}

export interface RangoFiltro {
  min: number | null
  max: number | null
}

export type ValorFiltro = boolean | string | number | null | Array<string | number> | RangoFiltro

interface CampoFiltroBase {
  clave: string
  etiqueta: string
  icono?: string
}

export interface CampoFiltroBooleano extends CampoFiltroBase {
  tipo: 'boolean'
}

export interface CampoFiltroSelect extends CampoFiltroBase {
  tipo: 'select'
  /** Incluye el propio autor del schema la opción "Todos/Todas..." (con el mismo `valor` que el
   * inicial de `useFiltros`) — el componente no inventa esa redacción por campo. */
  opciones: OpcionFiltro[]
  /** Catálogo largo (unas 15-20 opciones o más) → combobox buscable en vez de USelect nativo,
   * mismo criterio que "Selectores de catálogo" en CLAUDE.md. */
  buscable?: boolean
}

export interface CampoFiltroMultiselect extends CampoFiltroBase {
  tipo: 'multiselect'
  opciones: OpcionFiltro[]
  /** Texto cuando `opciones` está vacío. Sin este dato el componente no puede saber SI el vacío
   * es normal (catálogo fijo que nunca debería estarlo) o esperable (catálogo derivado de datos
   * reales que el tenant simplemente no tiene aún, ej. "ubicación" antes de registrar activos) —
   * quien declara el schema es quien conoce esa diferencia. Por defecto un genérico neutro. */
  mensajeVacio?: string
}

export interface CampoFiltroRango extends CampoFiltroBase {
  tipo: 'rango'
  /** Cómo se formatea el valor en el chip/placeholder — puramente de presentación (nunca
   * aritmética): 'moneda' usa el único formateador de moneda del repo (formatoMoneda). */
  formato?: 'moneda' | 'numero'
}

export interface CampoFiltroTexto extends CampoFiltroBase {
  tipo: 'texto'
}

export type CampoFiltro =
  | CampoFiltroBooleano
  | CampoFiltroSelect
  | CampoFiltroMultiselect
  | CampoFiltroRango
  | CampoFiltroTexto

export interface ChipFiltro {
  clave: string
  etiqueta: string
}

function esRango(valor: ValorFiltro): valor is RangoFiltro {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/** Función pura (sin composables de Nuxt) — comparable directo contra el valor inicial de cada
 * campo, usado tanto para decidir si un chip existe como si "hay filtros activos". */
export function esValorInicial(valor: ValorFiltro, inicial: ValorFiltro): boolean {
  if (esRango(valor) && esRango(inicial)) return valor.min === inicial.min && valor.max === inicial.max
  if (Array.isArray(valor) && Array.isArray(inicial)) {
    return valor.length === inicial.length && valor.every((v) => inicial.includes(v))
  }
  return valor === inicial
}

function formatoNumero(valor: number, formato: 'moneda' | 'numero'): string {
  return formato === 'moneda' ? formatoMoneda(valor) : new Intl.NumberFormat('es-CO').format(valor)
}

/** Función pura — arma el texto de un chip a partir del campo del schema y su valor aplicado.
 * Separada de `generarChips` para poder probarla por tipo de campo sin construir un schema
 * completo cada vez. */
export function etiquetaValorFiltro(campo: CampoFiltro, valor: ValorFiltro): string {
  switch (campo.tipo) {
    case 'boolean':
      return campo.etiqueta
    case 'select': {
      const opcion = campo.opciones.find((o) => o.valor === valor)
      return `${campo.etiqueta}: ${opcion?.etiqueta ?? String(valor)}`
    }
    case 'multiselect': {
      const valores = (valor as Array<string | number>).map(
        (v) => campo.opciones.find((o) => o.valor === v)?.etiqueta ?? String(v),
      )
      return `${campo.etiqueta}: ${valores.join(', ')}`
    }
    case 'rango': {
      const rango = valor as RangoFiltro
      const formato = campo.formato ?? 'numero'
      if (rango.min !== null && rango.max !== null) {
        return `${campo.etiqueta}: ${formatoNumero(rango.min, formato)} - ${formatoNumero(rango.max, formato)}`
      }
      if (rango.min !== null) return `${campo.etiqueta}: desde ${formatoNumero(rango.min, formato)}`
      if (rango.max !== null) return `${campo.etiqueta}: hasta ${formatoNumero(rango.max, formato)}`
      return campo.etiqueta
    }
    case 'texto':
      return `${campo.etiqueta}: "${String(valor)}"`
  }
}

/** Un chip por cada campo cuyo valor aplicado difiere del inicial — alimenta `UiChipsFiltros`,
 * que vive fuera de `UiPanelFiltros` y no conoce el schema completo por sí sola. */
export function generarChips<TFiltros extends Record<string, ValorFiltro>>(
  schema: CampoFiltro[],
  aplicados: TFiltros,
  iniciales: TFiltros,
): ChipFiltro[] {
  const chips: ChipFiltro[] = []
  for (const campo of schema) {
    const valor = aplicados[campo.clave]
    if (valor === undefined || esValorInicial(valor, iniciales[campo.clave]!)) continue
    chips.push({ clave: campo.clave, etiqueta: etiquetaValorFiltro(campo, valor) })
  }
  return chips
}

export function hayFiltrosActivos<TFiltros extends Record<string, ValorFiltro>>(
  aplicados: TFiltros,
  iniciales: TFiltros,
): boolean {
  return Object.keys(iniciales).some((clave) => !esValorInicial(aplicados[clave]!, iniciales[clave]!))
}

/** `structuredClone` directo revienta con `DataCloneError` en cuanto `valores` trae un Proxy
 * reactivo de Vue anidado (un `multiselect`/`rango` cuyo valor pasó por un `borrador` reactivo
 * en algún momento) — confirmado en el navegador migrando mantenimiento/activos/index.vue:
 * `borrador.value` es un Ref, pero sus campos array/objeto anidados quedan envueltos en un Proxy
 * en cuanto se leen a través de él. `toRaw` + copia campo por campo evita clonar un Proxy: cada
 * `ValorFiltro` es como mucho un nivel de anidación (array de primitivos u {min,max}), así que no
 * hace falta recursión genérica. */
function clonarValor(valor: ValorFiltro): ValorFiltro {
  if (Array.isArray(valor)) return [...toRaw(valor)]
  if (valor !== null && typeof valor === 'object') return { ...toRaw(valor) } as RangoFiltro
  return valor
}

/** Exportada solo para el test de regresión del bug de `DataCloneError` (ver arriba) — no es
 * parte de la API pensada para consumidores de `useFiltros`. */
export function clonar<TFiltros extends Record<string, ValorFiltro>>(valores: TFiltros): TFiltros {
  const crudo = toRaw(valores)
  const copia = {} as TFiltros
  for (const clave of Object.keys(crudo) as Array<keyof TFiltros>) {
    copia[clave] = clonarValor(crudo[clave]!) as TFiltros[keyof TFiltros]
  }
  return copia
}

/**
 * `iniciales` es a la vez el schema de valores por defecto Y el valor "vacío" de cada campo (lo
 * que queda tras `limpiarTodo()` o al quitar un chip individual con `quitar()`) — no hay un
 * segundo concepto de "default" distinto en este composable.
 *
 * `ref`/`computed` son globales auto-importados por Nuxt (igual que el resto de composables de
 * este directorio) — por eso la lógica que sí necesita probarse aislada vive en las funciones
 * puras de arriba, no aquí.
 */
export function useFiltros<TFiltros extends Record<string, ValorFiltro>>(iniciales: TFiltros) {
  const borrador = ref<TFiltros>(clonar(iniciales))
  const aplicados = ref<TFiltros>(clonar(iniciales))

  function aplicar(): void {
    aplicados.value = clonar(borrador.value)
  }

  function limpiarTodo(): void {
    borrador.value = clonar(iniciales)
    aplicados.value = clonar(iniciales)
  }

  /** Cambia un único campo de una — en `borrador` Y `aplicados` a la vez, sin pasar por el
   * ciclo borrador→`aplicar()`. Pensado para los "hasta 3 filtros fijos" que una página deja
   * fuera del panel, visibles siempre en la barra (mismo comportamiento instantáneo que tenían
   * antes de adoptar este patrón) — ver CLAUDE.md, "Panel de filtros reutilizable". Mantener
   * ambos sincronizados evita que abrir el panel después muestre un valor viejo para ese campo.
   * `clonar(...)`, no un spread directo de `borrador.value`/`aplicados.value` — mismo riesgo de
   * Proxy anidado que `actualizarCampo` en UiPanelFiltros.vue (ver el comentario de `clonar()`
   * arriba). */
  function actualizarInmediato<TClave extends keyof TFiltros>(clave: TClave, valor: TFiltros[TClave]): void {
    borrador.value = { ...clonar(borrador.value), [clave]: valor }
    aplicados.value = { ...clonar(aplicados.value), [clave]: valor }
  }

  /** Quita un único filtro sin pasar por el panel — usado por el botón "✕" de cada chip en
   * `UiChipsFiltros`. */
  function quitar(clave: keyof TFiltros): void {
    actualizarInmediato(clave, iniciales[clave])
  }

  const activos = computed(() => hayFiltrosActivos(aplicados.value, iniciales))

  return { borrador, aplicados, aplicar, limpiarTodo, quitar, actualizarInmediato, activos }
}
