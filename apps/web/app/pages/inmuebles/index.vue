<script setup lang="ts">
// Página principal de Inmuebles — rediseño con resumen, filtros y acciones
// en lote (mockup validado con el usuario, 2026-08-22). El listado mínimo
// original (código/tipo/estado) se queda corto para navegar 60+ unidades:
// esta versión agrega contexto (tarjetas), navegación (buscador + filtros)
// y una acción productiva real (asignar agrupación a varias unidades a la
// vez, reutilizando agrupacionesStore.asignarInmueblesAAgrupacion — la misma
// función que ya usa /configuracion/agrupaciones).
//
// "Cambiar estado" en lote quedó fuera a propósito (decisión del usuario):
// afecta liquidación y es infrecuente — se mantiene solo en la ficha
// individual. El saldo por inmueble SÍ se carga siempre (66 unidades es
// trivial; si la copropiedad crece a miles, ese costo habría que revisarlo,
// pero no antes).
import type { OrdenTabla } from '~/components/ui/UiTabla.vue'
import { generarChips, type CampoFiltro, type ValorFiltro } from '~/composables/useFiltros'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const cuentaStore = useCuentaCorrienteStore()
const agrupacionesStore = useAgrupacionesStore()
const coeficientesStore = useCoeficientesStore()

// `watch: [...]` en las llamadas gateadas por activeTenant?.id: en la carga
// en frío, activeTenant puede no estar resuelto en el instante exacto de
// este setup — la opción reintenta sola en cuanto el id esté disponible
// (mismo espíritu que configuracion/ia.vue).
const { data: tipos } = await useAsyncData(
  'inmuebles-tipos',
  async () => {
    const tenantId = tenantStore.activeTenant?.id
    if (!tenantId) return []
    return cargarListaTipos(tenantId, 'TIPO_INMUEBLE')
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)

/** Uso del predio (USO_PREDIO) y estado físico/habitabilidad
 * (HABITABILIDAD_PREDIO) — mismos catálogos que ya usa la ficha
 * (InmuebleDatosBase.vue) para `uso_predio_id`/`habitabilidad_id`, ambos
 * columnas reales de `inmuebles`. Aquí solo sirven para filtrar el listado. */
const { data: usosPredio } = await useAsyncData(
  'inmuebles-usos-predio',
  async () => {
    const tenantId = tenantStore.activeTenant?.id
    if (!tenantId) return []
    return cargarListaTipos(tenantId, 'USO_PREDIO')
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)
const { data: habitabilidades } = await useAsyncData(
  'inmuebles-habitabilidad',
  async () => {
    const tenantId = tenantStore.activeTenant?.id
    if (!tenantId) return []
    return cargarListaTipos(tenantId, 'HABITABILIDAD_PREDIO')
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)
/** Estado legal (ESTADO_LEGAL_PREDIO) y tipo de gravamen (TIPO_GRAVAMEN) — mismos catálogos que
 * InmuebleDatosBase.vue para `estado_legal_id`/`gravamen_tipo_id`. Antes solo se veían en la
 * ficha individual; acá pasan a ser filtro del panel (ver CLAUDE.md, "Panel de filtros
 * reutilizable"). */
const { data: estadosLegales } = await useAsyncData(
  'inmuebles-estados-legales',
  async () => {
    const tenantId = tenantStore.activeTenant?.id
    if (!tenantId) return []
    return cargarListaTipos(tenantId, 'ESTADO_LEGAL_PREDIO')
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)
const { data: tiposGravamen } = await useAsyncData(
  'inmuebles-tipos-gravamen',
  async () => {
    const tenantId = tenantStore.activeTenant?.id
    if (!tenantId) return []
    return cargarListaTipos(tenantId, 'TIPO_GRAVAMEN')
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)

await useAsyncData(
  'inmuebles-base',
  async () => {
    const tenantId = tenantStore.activeTenant?.id
    if (!tenantId) return null
    await Promise.all([
      cuentaStore.cargarInmuebles(tenantId),
      cuentaStore.cargarPropietarios(tenantId),
      cuentaStore.cargarCargosAbiertos(tenantId),
      agrupacionesStore.cargarTiposAgrupacion(tenantId),
      agrupacionesStore.cargarAgrupaciones(tenantId),
      coeficientesStore.cargarCoeficienteSets(tenantId),
    ])
    await coeficientesStore.cargarValoresVigentes(tenantId)
    return null
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)

function nombreTipo(tipoId: number): string {
  return tipos.value?.find((t) => t.id === tipoId)?.nombre ?? '—'
}

const rutaPorAgrupacion = computed(
  () => new Map(agrupacionesStore.arbolPlano.map((n) => [n.id, n.ruta])),
)

/** Σ de `monto_pendiente` por inmueble — v_cargo_saldo ya viene filtrada a
 * cargos con saldo > 0, así que solo hay que agrupar. */
const saldoPorInmueble = computed(() => {
  const mapa = new Map<string, number>()
  for (const cargo of cuentaStore.cargosAbiertos) {
    if (!cargo.inmueble_id) continue
    mapa.set(cargo.inmueble_id, (mapa.get(cargo.inmueble_id) ?? 0) + Number(cargo.monto_pendiente ?? 0))
  }
  return mapa
})

function formatoCoeficiente(valor: number): string {
  return valor.toFixed(6)
}

// ── resumen (tarjetas, plegable) ─────────────────────────────────────────
// Cookie, no localStorage: localStorage produce hydration mismatch porque
// el servidor no puede leerlo en el primer render (mismo criterio que el
// colapso del sidebar en NavSidebar.vue).
const resumenExpandido = useCookie<boolean>('inmuebles-resumen-expandido', { default: () => true })

const setVigente = computed(() =>
  coeficientesStore.coeficienteSets.find((s) => s.estado === 'vigente'),
)

const resumen = computed(() => {
  const activos = cuentaStore.inmuebles.filter((i) => i.estado === 'activo').length
  return {
    total: cuentaStore.inmuebles.length,
    activos,
    inactivos: cuentaStore.inmuebles.length - activos,
    conSaldo: cuentaStore.inmuebles.filter((i) => (saldoPorInmueble.value.get(i.id) ?? 0) > 0).length,
    sinAgrupar: cuentaStore.inmuebles.filter((i) => !i.agrupacion_id).length,
  }
})

// ── filtros ──────────────────────────────────────────────────────────────
// Migrado al panel de filtros reutilizable (ver CLAUDE.md, "Panel de filtros reutilizable") —
// esta pantalla ya tenía 5 controles (búsqueda + 4 selects) compartiendo fila con el menú
// "Acciones", y le sobraban 6 dimensiones reales sin explotar: Estado (activo/inactivo, hoy solo
// KPI de solo lectura), Estado legal y Gravamen (solo visibles en la ficha individual, nunca
// filtrables en el listado) y 3 rangos numéricos (saldo pendiente, Σ coeficiente, área privada)
// que hoy solo se ven sumados/leídos, nunca acotan la tabla.
const SIN_AGRUPAR = '__sin_agrupar__'
const busqueda = ref('')

interface FiltrosInmuebles extends Record<string, ValorFiltro> {
  tipo: number | null
  agrupacion: string | null
  usoPredio: Array<string | number>
  habitabilidad: Array<string | number>
  estado: Array<string | number>
  estadoLegal: Array<string | number>
  gravamen: Array<string | number>
  saldo: { min: number | null; max: number | null }
  coeficiente: { min: number | null; max: number | null }
  areaPrivada: { min: number | null; max: number | null }
}

const FILTROS_INICIALES: FiltrosInmuebles = {
  tipo: null,
  agrupacion: null,
  usoPredio: [],
  habitabilidad: [],
  estado: [],
  estadoLegal: [],
  gravamen: [],
  saldo: { min: null, max: null },
  coeficiente: { min: null, max: null },
  areaPrivada: { min: null, max: null },
}

const filtros = useFiltros<FiltrosInmuebles>(FILTROS_INICIALES)
const panelFiltrosAbierto = ref(false)

// Tipo y Agrupación quedan fijos fuera del panel, instantáneos, como antes de migrar — los 2
// más usados para ubicar una unidad. Agrupación de paso pasa de USelect a UiSelectorBuscable:
// `arbolPlano` son rutas largas (Torre > Piso > Unidad), exactamente el catálogo largo que la
// regla "Selectores de catálogo" de CLAUDE.md ya pedía no dejar en un USelect nativo.
const filtroTipoId = computed({
  get: () => filtros.aplicados.value.tipo,
  set: (v: number | null) => filtros.actualizarInmediato('tipo', v),
})
const filtroAgrupacionId = computed({
  get: () => filtros.aplicados.value.agrupacion,
  set: (v: string | null) => filtros.actualizarInmediato('agrupacion', v),
})
const opcionesAgrupacion = computed(() => [
  { valor: null, etiqueta: 'Toda agrupación' },
  { valor: SIN_AGRUPAR, etiqueta: 'Sin agrupar' },
  ...agrupacionesStore.arbolPlano.map((n) => ({ valor: n.id, etiqueta: n.ruta })),
])

// Estado (activo/inactivo) es un enum fijo de 2 valores → checkbox en el panel. El resto son
// catálogos lista_tipos reales, igual que Uso de predio/Habitabilidad.
const OPCIONES_ESTADO_INMUEBLE = [
  { valor: 'activo', etiqueta: 'Activo' },
  { valor: 'inactivo', etiqueta: 'Inactivo' },
]

const schemaFiltros = computed<CampoFiltro[]>(() => [
  {
    clave: 'usoPredio', etiqueta: 'Uso de predio', tipo: 'multiselect', icono: 'i-lucide-home',
    opciones: (usosPredio.value ?? []).map((u) => ({ valor: u.id, etiqueta: u.nombre })),
  },
  {
    clave: 'habitabilidad', etiqueta: 'Estado físico', tipo: 'multiselect', icono: 'i-lucide-hammer',
    opciones: (habitabilidades.value ?? []).map((h) => ({ valor: h.id, etiqueta: h.nombre })),
  },
  { clave: 'estado', etiqueta: 'Estado', tipo: 'multiselect', icono: 'i-lucide-power', opciones: OPCIONES_ESTADO_INMUEBLE },
  {
    clave: 'estadoLegal', etiqueta: 'Estado legal', tipo: 'multiselect', icono: 'i-lucide-scale',
    opciones: (estadosLegales.value ?? []).map((e) => ({ valor: e.id, etiqueta: e.nombre })),
  },
  {
    clave: 'gravamen', etiqueta: 'Gravamen', tipo: 'multiselect', icono: 'i-lucide-lock',
    opciones: (tiposGravamen.value ?? []).map((g) => ({ valor: g.id, etiqueta: g.nombre })),
  },
  { clave: 'saldo', etiqueta: 'Saldo pendiente', tipo: 'rango', icono: 'i-lucide-circle-dollar-sign', formato: 'moneda' },
  { clave: 'coeficiente', etiqueta: 'Σ Coeficiente', tipo: 'rango', icono: 'i-lucide-percent', formato: 'numero' },
  { clave: 'areaPrivada', etiqueta: 'Área privada (m²)', tipo: 'rango', icono: 'i-lucide-ruler', formato: 'numero' },
])

// Solo cubre los campos del panel a propósito: Tipo/Agrupación ya están siempre visibles en su
// propio control — un chip para ellos sería redundante (mismo criterio que en
// mantenimiento/activos/index.vue y comunicaciones/index.vue).
const chipsFiltros = computed(() => generarChips(schemaFiltros.value, filtros.aplicados.value, FILTROS_INICIALES))

const hayFiltrosActivos = computed(() => busqueda.value.trim().length > 0 || filtros.activos.value)

function limpiarFiltros(): void {
  busqueda.value = ''
  filtros.limpiarTodo()
}

const filasFiltradas = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  const f = filtros.aplicados.value
  return cuentaStore.inmuebles.filter((i) => {
    if (f.tipo !== null && i.tipo_id !== f.tipo) return false
    if (f.agrupacion === SIN_AGRUPAR) {
      if (i.agrupacion_id) return false
    } else if (f.agrupacion && i.agrupacion_id !== f.agrupacion) {
      return false
    }
    if (f.usoPredio.length > 0 && (i.uso_predio_id === null || !f.usoPredio.includes(i.uso_predio_id))) return false
    if (f.habitabilidad.length > 0 && (i.habitabilidad_id === null || !f.habitabilidad.includes(i.habitabilidad_id))) {
      return false
    }
    if (f.estado.length > 0 && !f.estado.includes(i.estado)) return false
    if (f.estadoLegal.length > 0 && (i.estado_legal_id === null || !f.estadoLegal.includes(i.estado_legal_id))) {
      return false
    }
    if (f.gravamen.length > 0 && (i.gravamen_tipo_id === null || !f.gravamen.includes(i.gravamen_tipo_id))) {
      return false
    }
    const saldo = saldoPorInmueble.value.get(i.id) ?? 0
    if (f.saldo.min !== null && saldo < f.saldo.min) return false
    if (f.saldo.max !== null && saldo > f.saldo.max) return false
    const coeficiente = coeficientesStore.valoresVigentes.get(i.id) ?? 0
    if (f.coeficiente.min !== null && coeficiente < f.coeficiente.min) return false
    if (f.coeficiente.max !== null && coeficiente > f.coeficiente.max) return false
    if (f.areaPrivada.min !== null && (i.area_privada === null || i.area_privada < f.areaPrivada.min)) return false
    if (f.areaPrivada.max !== null && (i.area_privada === null || i.area_privada > f.areaPrivada.max)) return false
    if (q) {
      const propietario = cuentaStore.propietariosPorInmueble.get(i.id) ?? ''
      if (!i.codigo.toLowerCase().includes(q) && !propietario.toLowerCase().includes(q)) return false
    }
    return true
  })
})

const sumaCoeficienteFiltrado = computed(() =>
  filasFiltradas.value.reduce(
    (acc, i) => acc + (coeficientesStore.valoresVigentes.get(i.id) ?? 0),
    0,
  ),
)

// ── vista agrupada ───────────────────────────────────────────────────────
// "Ver agrupado" reusa el mismo árbol de /configuracion/agrupaciones, pero
// el último nivel son los inmuebles. Los totales del grupo (Σ coeficiente y
// saldo) se pintan alineados bajo su propia columna, no como texto suelto:
// un total que no está alineado con su columna se lee, pero no se compara.
type InmuebleFila = (typeof cuentaStore.inmuebles)[number]

interface FilaGrupoInmuebles {
  esGrupo: true
  id: string
  nivel: number
  tipoNombre: string
  nombre: string
  unidades: number
  coeficiente: number
  saldo: number
  colapsable: boolean
}
type FilaInmueble = InmuebleFila & { esGrupo: false; nivelGrupo: number }
type FilaLista = FilaGrupoInmuebles | FilaInmueble

const verAgrupado = useCookie<boolean>('inmuebles-ver-agrupado', { default: () => false })
const gruposColapsados = ref<Set<string>>(new Set())
const orden = ref<OrdenTabla>({ clave: null, direccion: 'asc' })

function alternarGrupo(id: string): void {
  const set = new Set(gruposColapsados.value)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  gruposColapsados.value = set
}

/** Accesores de orden por columna — viven aquí (y no solo en las columnas
 * de la tabla) porque en modo agrupado el orden se aplica DENTRO de cada
 * grupo, así que lo resuelve la página y no UiTabla. */
const ACCESORES_ORDEN: Record<string, (i: InmuebleFila) => string | number | null> = {
  codigo: (i) => i.codigo,
  tipo: (i) => nombreTipo(i.tipo_id),
  agrupacion: (i) => (i.agrupacion_id ? rutaPorAgrupacion.value.get(i.agrupacion_id) ?? null : null),
  coeficiente: (i) => coeficientesStore.valoresVigentes.get(i.id) ?? 0,
  saldo: (i) => saldoPorInmueble.value.get(i.id) ?? 0,
}

function aplicarOrden(lista: InmuebleFila[]): InmuebleFila[] {
  const extraer = orden.value.clave ? ACCESORES_ORDEN[orden.value.clave] : undefined
  if (!extraer) return lista

  const signo = orden.value.direccion === 'asc' ? 1 : -1
  return [...lista].sort((a, b) => {
    const va = extraer(a)
    const vb = extraer(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * signo
    return (va < vb ? -1 : va > vb ? 1 : 0) * signo
  })
}

const inmueblesPorAgrupacion = computed(() => {
  const mapa = new Map<string, InmuebleFila[]>()
  for (const inmueble of filasFiltradas.value) {
    if (!inmueble.agrupacion_id) continue
    const lista = mapa.get(inmueble.agrupacion_id) ?? []
    lista.push(inmueble)
    mapa.set(inmueble.agrupacion_id, lista)
  }
  return mapa
})

const filasTabla = computed<FilaLista[]>(() => {
  if (!verAgrupado.value) {
    return aplicarOrden(filasFiltradas.value).map((i) => ({ ...i, esGrupo: false as const, nivelGrupo: 0 }))
  }

  const salida: FilaLista[] = []

  /** Totales del subárbol — un Edificio responde por sus pisos, mismo
   * criterio que el conteo de /configuracion/agrupaciones. */
  const totales = (nodo: { id: string; hijos: readonly unknown[] }): {
    unidades: number
    coeficiente: number
    saldo: number
  } => {
    const directos = inmueblesPorAgrupacion.value.get(nodo.id) ?? []
    let unidades = directos.length
    let coeficiente = directos.reduce(
      (acc, i) => acc + (coeficientesStore.valoresVigentes.get(i.id) ?? 0),
      0,
    )
    let saldo = directos.reduce((acc, i) => acc + (saldoPorInmueble.value.get(i.id) ?? 0), 0)
    for (const hijo of nodo.hijos as { id: string; hijos: readonly unknown[] }[]) {
      const t = totales(hijo)
      unidades += t.unidades
      coeficiente += t.coeficiente
      saldo += t.saldo
    }
    return { unidades, coeficiente, saldo }
  }

  const recorrer = (nodos: readonly (typeof agrupacionesStore.arbol)[number][]): void => {
    for (const nodo of nodos) {
      const t = totales(nodo)
      // Sin filtros se muestra el árbol completo (un grupo vacío es
      // información: está ahí para asignarle unidades). Con filtros activos
      // se ocultan los vacíos — si no, filtrar a 6 resultados deja 23 filas
      // de grupo en cero que solo estorban.
      if (hayFiltrosActivos.value && t.unidades === 0) continue
      const directos = aplicarOrden(inmueblesPorAgrupacion.value.get(nodo.id) ?? [])
      salida.push({
        esGrupo: true,
        id: nodo.id,
        nivel: nodo.nivel,
        tipoNombre: nodo.tipoNombre,
        nombre: nodo.nombre,
        unidades: t.unidades,
        coeficiente: t.coeficiente,
        saldo: t.saldo,
        colapsable: directos.length > 0 || nodo.hijos.length > 0,
      })
      if (gruposColapsados.value.has(nodo.id)) continue
      for (const inmueble of directos) {
        salida.push({ ...inmueble, esGrupo: false as const, nivelGrupo: nodo.nivel })
      }
      recorrer(nodo.hijos)
    }
  }
  recorrer(agrupacionesStore.arbol)

  // "Sin agrupar" va último: es un grupo más, no un caso de error.
  const sueltos = aplicarOrden(filasFiltradas.value.filter((i) => !i.agrupacion_id))
  if (hayFiltrosActivos.value && sueltos.length === 0) return salida
  salida.push({
    esGrupo: true,
    id: SIN_AGRUPAR,
    nivel: 1,
    tipoNombre: '',
    nombre: 'Sin agrupar',
    unidades: sueltos.length,
    coeficiente: sueltos.reduce((acc, i) => acc + (coeficientesStore.valoresVigentes.get(i.id) ?? 0), 0),
    saldo: sueltos.reduce((acc, i) => acc + (saldoPorInmueble.value.get(i.id) ?? 0), 0),
    colapsable: sueltos.length > 0,
  })
  if (!gruposColapsados.value.has(SIN_AGRUPAR)) {
    for (const inmueble of sueltos) {
      salida.push({ ...inmueble, esGrupo: false as const, nivelGrupo: 1 })
    }
  }

  return salida
})

// ── selección múltiple ────────────────────────────────────────────────────
const seleccion = ref<Set<string>>(new Set())

function alternarSeleccion(id: string): void {
  const set = new Set(seleccion.value)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  seleccion.value = set
}

const todosVisiblesSeleccionados = computed(
  () => filasFiltradas.value.length > 0 && filasFiltradas.value.every((i) => seleccion.value.has(i.id)),
)

function alternarSeleccionTodos(): void {
  seleccion.value = todosVisiblesSeleccionados.value
    ? new Set()
    : new Set(filasFiltradas.value.map((i) => i.id))
}

function limpiarSeleccion(): void {
  seleccion.value = new Set()
}

// ── asignar agrupación en lote ─────────────────────────────────────────────
const asignarAbierto = ref(false)
const asignarAgrupacionId = ref<string | null>(null)
const asignarGuardando = ref(false)
const asignarError = ref<string | null>(null)

function abrirAsignar(): void {
  asignarAgrupacionId.value = null
  asignarError.value = null
  asignarAbierto.value = true
}

async function confirmarAsignar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !asignarAgrupacionId.value || seleccion.value.size === 0) return

  asignarError.value = null
  asignarGuardando.value = true
  try {
    await agrupacionesStore.asignarInmueblesAAgrupacion({
      tenantId,
      agrupacionId: asignarAgrupacionId.value,
      inmuebleIds: [...seleccion.value],
    })
    await cuentaStore.cargarInmuebles(tenantId)
    limpiarSeleccion()
    asignarAbierto.value = false
  } catch (excepcion) {
    asignarError.value = mensajeError(excepcion, 'No se pudieron asignar los inmuebles.')
  } finally {
    asignarGuardando.value = false
  }
}

// ── importar desde Excel (onboarding guiado, Doc 3 auditoría #1) ──────────
const importarAbierto = ref(false)

// ── menú de acciones (Nuevo/Importar/Exportar) ─────────────────────────────
// Antes 3 botones sueltos en el header — poco uso individual (pedido del
// usuario, 2026-08-26) para justificar ocupar espacio permanente en la
// barra; se agrupan en un solo desplegable. "Nuevo inmueble" sigue siendo
// la acción más común, pero ya no amerita ser el único botón sólido de la
// página — coherente con agruparla también.
const menuAcciones = computed(() => [
  [
    { label: 'Nuevo inmueble', icon: 'i-lucide-plus', to: '/inmuebles/nuevo' },
    { label: 'Importar desde Excel', icon: 'i-lucide-upload', onSelect: () => { importarAbierto.value = true } },
    ...(cuentaStore.inmuebles.length > 0
      ? [{ label: 'Exportar', icon: 'i-lucide-download', onSelect: exportarCSV }]
      : []),
  ],
])

async function alImportar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  importarAbierto.value = false
  if (!tenantId) return
  await Promise.all([cuentaStore.cargarInmuebles(tenantId), cuentaStore.cargarPropietarios(tenantId)])
}

// ── exportar CSV (lo que está filtrado en pantalla) ────────────────────────
function exportarCSV(): void {
  const encabezados = ['Código', 'Tipo', 'Propietario', 'Agrupación', 'Coeficiente', 'Saldo', 'Estado']
  const filas = filasFiltradas.value.map((i) => [
    i.codigo,
    nombreTipo(i.tipo_id),
    cuentaStore.propietariosPorInmueble.get(i.id) ?? '',
    (i.agrupacion_id && rutaPorAgrupacion.value.get(i.agrupacion_id)) || '',
    formatoCoeficiente(coeficientesStore.valoresVigentes.get(i.id) ?? 0),
    String(Math.round(saldoPorInmueble.value.get(i.id) ?? 0)),
    i.estado,
  ])
  const csv = [encabezados, ...filas]
    .map((fila) => fila.map((valor) => `"${String(valor).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = 'inmuebles.csv'
  enlace.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold mb-2">Inmuebles</h1>
      <p class="text-sm text-neutral-500 flex items-center gap-2 flex-wrap">
        Unidades de la copropiedad — destino de cobro y prorrateo.
        <button
          type="button"
          class="flex items-center gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300"
          @click="resumenExpandido = !resumenExpandido"
        >
          <UIcon :name="resumenExpandido ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" />
          {{ resumenExpandido ? 'Cerrar resumen' : 'Ver resumen' }}
        </button>
      </p>
    </div>

    <!-- ── acciones (siempre visibles — es el paso 1 del onboarding guiado,
         nunca puede quedar oculto detrás del estado vacío). Sin inmuebles
         todavía no hay fila de filtros donde meterlo, así que va en su
         propia línea junto al texto vacío; con datos se une a la fila de
         filtros más abajo. ────────────────────────────────────────────── -->
    <div v-if="cuentaStore.inmuebles.length === 0" class="flex items-center justify-between gap-2">
      <p class="text-neutral-500 text-sm">
        Todavía no hay inmuebles registrados. Importa un lote desde Excel o crea el primero manualmente.
      </p>
      <UDropdownMenu :items="menuAcciones">
        <UButton size="sm" variant="soft" trailing-icon="i-lucide-chevron-down">Acciones</UButton>
      </UDropdownMenu>
    </div>

    <template v-else>
      <!-- ── resumen ──────────────────────────────────────────────────── -->
      <div v-if="resumenExpandido" class="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div class="bg-neutral-50 dark:bg-neutral-900 rounded-md p-3">
          <p class="text-xs text-neutral-500 mb-1">Total unidades</p>
          <p class="text-2xl font-medium">{{ resumen.total }}</p>
        </div>
        <div class="bg-neutral-50 dark:bg-neutral-900 rounded-md p-3">
          <p class="text-xs text-neutral-500 mb-1">Activas</p>
          <p class="text-2xl font-medium">
            {{ resumen.activos }}
            <span class="text-sm text-neutral-400 font-normal">/ {{ resumen.inactivos }} inact.</span>
          </p>
        </div>
        <div class="bg-neutral-50 dark:bg-neutral-900 rounded-md p-3">
          <p class="text-xs text-neutral-500 mb-1">Con saldo</p>
          <p class="text-2xl font-medium" :class="resumen.conSaldo > 0 ? 'text-error-600 dark:text-error-400' : ''">
            {{ resumen.conSaldo }}
          </p>
        </div>
        <div class="bg-neutral-50 dark:bg-neutral-900 rounded-md p-3">
          <p class="text-xs text-neutral-500 mb-1">Sin agrupar</p>
          <p
            class="text-2xl font-medium"
            :class="resumen.sinAgrupar > 0 ? 'text-warning-600 dark:text-warning-400' : ''"
          >
            {{ resumen.sinAgrupar }}
          </p>
        </div>
        <div class="bg-neutral-50 dark:bg-neutral-900 rounded-md p-3">
          <p class="text-xs text-neutral-500 mb-1">Σ coeficiente</p>
          <p class="text-2xl font-medium">
            {{ setVigente ? formatoCoeficiente(Number(setVigente.suma_total)) : '—' }}
          </p>
        </div>
      </div>

      <!-- ── filtros (mismo patrón que mantenimiento/activos/index.vue y
           comunicaciones/index.vue — ver CLAUDE.md, "Panel de filtros reutilizable"):
           Tipo/Agrupación fijos e instantáneos, el resto al panel. ──────── -->
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="flex items-center gap-2 flex-wrap">
          <UInput
            v-model="busqueda"
            size="sm"
            icon="i-lucide-search"
            placeholder="Buscar por código o propietario…"
            class="w-56"
          >
            <template v-if="busqueda" #trailing>
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-x"
                title="Limpiar búsqueda"
                @click="busqueda = ''"
              />
            </template>
          </UInput>

          <USelect
            v-model="filtroTipoId"
            :items="[{ label: 'Todos los tipos', value: null }, ...(tipos ?? []).map((t) => ({ label: t.nombre, value: t.id }))]"
            value-key="value"
            size="sm"
            class="w-36"
          />

          <UiSelectorBuscable
            v-model="filtroAgrupacionId"
            :opciones="opcionesAgrupacion"
            class="w-40"
          />

          <UButton variant="outline" size="sm" icon="i-lucide-sliders-horizontal" @click="panelFiltrosAbierto = true">
            Filtros
            <UBadge v-if="chipsFiltros.length > 0" size="xs" color="primary" variant="solid">{{ chipsFiltros.length }}</UBadge>
          </UButton>

          <UButton
            v-if="hayFiltrosActivos"
            size="sm"
            variant="ghost"
            icon="i-lucide-x"
            title="Limpiar filtros"
            @click="limpiarFiltros"
          />
        </div>

        <UDropdownMenu :items="menuAcciones">
          <UButton size="sm" variant="soft" trailing-icon="i-lucide-chevron-down">Acciones</UButton>
        </UDropdownMenu>
      </div>

      <UiChipsFiltros
        :chips="chipsFiltros"
        :total="filasFiltradas.length"
        @quitar="filtros.quitar($event as keyof FiltrosInmuebles)"
        @limpiar="filtros.limpiarTodo()"
      />

      <UiPanelFiltros
        v-model:abierto="panelFiltrosAbierto"
        v-model="filtros.borrador.value"
        :schema="schemaFiltros"
        titulo="Filtros de inmuebles"
        @aplicar="filtros.aplicar()"
        @limpiar="filtros.limpiarTodo()"
      />

      <!-- ── barra de selección ───────────────────────────────────────── -->
      <div
        v-if="seleccion.size > 0"
        class="flex items-center justify-between gap-3 bg-primary/5 border border-primary/20 rounded-md px-3 py-2 text-sm"
      >
        <span>{{ seleccion.size }} unidad(es) seleccionada(s).</span>
        <div class="flex items-center gap-2">
          <UButton size="xs" variant="soft" @click="abrirAsignar">Asignar agrupación</UButton>
          <UButton size="xs" variant="ghost" @click="limpiarSeleccion">Cancelar</UButton>
        </div>
      </div>

      <p v-if="filasFiltradas.length === 0" class="text-neutral-500 text-sm">
        Sin resultados para los filtros actuales.
      </p>

      <UiTabla
        v-else
        :columnas="[
          { clave: 'seleccion', etiqueta: '' },
          { clave: 'codigo', etiqueta: 'Unidad', ordenar: () => null },
          { clave: 'tipo', etiqueta: 'Tipo', ordenar: () => null },
          { clave: 'agrupacion', etiqueta: 'Agrupación', ordenar: () => null },
          { clave: 'coeficiente', etiqueta: 'Coef.', alinear: 'derecha', ordenar: () => null },
          { clave: 'saldo', etiqueta: 'Saldo', alinear: 'derecha', ordenar: () => null },
        ]"
        :filas="filasTabla"
        :clave-fila="(fila) => fila.id"
        :es-fila-grupo="(fila) => fila.esGrupo"
        :colspan-grupo="4"
        :orden="orden"
        @update:orden="orden = $event"
      >
        <template #encabezado-seleccion>
          <UCheckbox
            :model-value="todosVisiblesSeleccionados"
            aria-label="Seleccionar todas las visibles"
            @update:model-value="alternarSeleccionTodos"
          />
        </template>
        <template #encabezado-agrupacion>
          <UCheckbox v-model="verAgrupado">
            <template #label>
              <span :class="verAgrupado ? 'text-neutral-700 dark:text-neutral-300 font-medium' : ''">
                Ver agrupado
              </span>
            </template>
          </UCheckbox>
        </template>

        <!-- fila de encabezado de grupo (solo en vista agrupada) -->
        <template #grupo="{ fila }">
          <div
            v-if="fila.esGrupo"
            class="flex items-center gap-2"
            :style="{ paddingLeft: `${(fila.nivel - 1) * 24}px` }"
          >
            <button
              v-if="fila.colapsable"
              type="button"
              class="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              :title="gruposColapsados.has(fila.id) ? 'Desplegar' : 'Contraer'"
              @click="alternarGrupo(fila.id)"
            >
              <UIcon
                :name="gruposColapsados.has(fila.id) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
                class="size-4"
              />
            </button>
            <span v-else class="w-4 shrink-0" />
            <UBadge
              v-if="fila.tipoNombre"
              :color="fila.nivel === 1 ? 'primary' : 'neutral'"
              variant="subtle"
              size="sm"
            >
              {{ fila.tipoNombre }}
            </UBadge>
            <span class="font-medium">{{ fila.nombre }}</span>
            <span class="text-xs text-neutral-400">{{ fila.unidades }} unidad(es)</span>
          </div>
        </template>

        <template #celda-seleccion="{ fila }">
          <UCheckbox
            v-if="!fila.esGrupo"
            :model-value="seleccion.has(fila.id)"
            :aria-label="`Seleccionar ${fila.codigo}`"
            @update:model-value="alternarSeleccion(fila.id)"
          />
        </template>
        <template #celda-codigo="{ fila }">
          <div
            v-if="!fila.esGrupo"
            :style="verAgrupado ? { paddingLeft: `${fila.nivelGrupo * 24}px` } : undefined"
          >
            <NuxtLink :to="`/inmuebles/${fila.id}`" class="font-medium text-primary hover:underline">
              {{ fila.codigo }}
            </NuxtLink>
            <UBadge v-if="fila.estado === 'inactivo'" color="neutral" variant="subtle" size="sm">
              Inactivo
            </UBadge>
            <p class="text-xs text-neutral-500">
              {{ cuentaStore.propietariosPorInmueble.get(fila.id) ?? 'Sin propietario' }}
            </p>
          </div>
        </template>
        <template #celda-tipo="{ fila }">
          <span v-if="!fila.esGrupo" class="text-neutral-500">{{ nombreTipo(fila.tipo_id) }}</span>
        </template>
        <template #celda-agrupacion="{ fila }">
          <!-- En vista agrupada la ruta es redundante: la fila de grupo de
               arriba ya ubica al inmueble. -->
          <span v-if="!fila.esGrupo && !verAgrupado" class="text-neutral-500">
            {{ fila.agrupacion_id ? rutaPorAgrupacion.get(fila.agrupacion_id) ?? '—' : '—' }}
          </span>
        </template>
        <template #celda-coeficiente="{ fila }">
          <span
            class="tabular-nums"
            :class="fila.esGrupo ? 'font-medium' : 'text-neutral-500'"
          >
            <template v-if="!setVigente">—</template>
            <template v-else-if="fila.esGrupo">{{ formatoCoeficiente(fila.coeficiente) }}</template>
            <template v-else>
              {{ formatoCoeficiente(coeficientesStore.valoresVigentes.get(fila.id) ?? 0) }}
            </template>
          </span>
        </template>
        <template #celda-saldo="{ fila }">
          <span
            class="tabular-nums"
            :class="[
              (fila.esGrupo ? fila.saldo : saldoPorInmueble.get(fila.id) ?? 0) > 0
                ? 'text-error-600 dark:text-error-400 font-medium'
                : 'text-neutral-400',
              fila.esGrupo ? 'font-medium' : '',
            ]"
          >
            {{ formatoMoneda(fila.esGrupo ? fila.saldo : saldoPorInmueble.get(fila.id) ?? 0) }}
          </span>
        </template>
      </UiTabla>

      <p class="text-xs text-neutral-400">
        Mostrando {{ filasFiltradas.length }} de {{ cuentaStore.inmuebles.length }} unidades
        <template v-if="setVigente">
          · Σ coeficiente filtrado {{ formatoCoeficiente(sumaCoeficienteFiltrado) }}
        </template>
      </p>
    </template>

    <!-- ── asignar agrupación en lote ───────────────────────────────── -->
    <UModal
      :open="asignarAbierto"
      title="Asignar agrupación"
      @update:open="(abierto) => { if (!abierto) asignarAbierto = false }"
    >
      <template #body>
        <div class="space-y-3 text-sm">
          <p class="text-neutral-500">{{ seleccion.size }} unidad(es) seleccionada(s).</p>
          <UFormField label="Agrupación destino" name="agrupacionDestino">
            <USelect
              v-model="asignarAgrupacionId"
              :items="[{ label: '— Selecciona —', value: null }, ...agrupacionesStore.arbolPlano.map((n) => ({ label: n.ruta, value: n.id }))]"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UAlert v-if="asignarError" color="error" variant="soft" :title="asignarError" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="asignarAbierto = false">Cancelar</UButton>
          <UButton
            :loading="asignarGuardando"
            :disabled="!asignarAgrupacionId"
            @click="confirmarAsignar"
          >
            Asignar
          </UButton>
        </div>
      </template>
    </UModal>

    <InmueblesImportarModal
      v-if="tenantStore.activeTenant"
      :abierto="importarAbierto"
      :tenant-id="tenantStore.activeTenant.id"
      :codigos-existentes="cuentaStore.inmuebles.map((i) => i.codigo)"
      @cerrar="importarAbierto = false"
      @importado="alImportar"
    />
  </div>
</template>
