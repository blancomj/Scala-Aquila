/**
 * Agrupaciones de inmuebles — árbol por copropiedad (20260830250000).
 *
 * Lectura/escritura directa por RLS (`agrupaciones_*_agent`), mismo criterio
 * que presupuesto.ts para el árbol de cuentas: no hay efecto colateral
 * atómico que exija una Edge Function — las invariantes (familia del tipo,
 * tenant del padre, ciclos, profundidad, hermanos con nombre único) las
 * impone `guard_agrupacion_arbol` + la constraint `agrupaciones_hermano_unico`
 * en la base, y sus errores llegan tal cual en `error.message`.
 *
 * El árbol se carga ENTERO (es chico: decenas de nodos por copropiedad) y
 * `nivel` / la ruta legible se derivan aquí en el cliente. Ese fue el motivo
 * de no materializarlas en BD — ver cabecera de la migración.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type AgrupacionRow = Database['public']['Tables']['agrupaciones']['Row']
type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']

/** Nodo del árbol con lo derivado ya resuelto, para no recalcularlo en cada
 * componente que lo pinte. */
export interface AgrupacionNodo extends AgrupacionRow {
  readonly nivel: number
  /** "Edificio A / Piso 3" — se compone con el nombre del tipo, no se
   * almacena duplicada en BD. */
  readonly ruta: string
  readonly tipoNombre: string
  readonly hijos: AgrupacionNodo[]
}

export const useAgrupacionesStore = defineStore('agrupaciones', () => {
  const agrupaciones = shallowRef<AgrupacionRow[]>([])
  const tiposAgrupacion = shallowRef<ListaTipoRow[]>([])
  const loading = ref(false)

  /** Catálogo AGRUPACION_PREDIOS (Bloque, Edificio, Zona, Sector, Manzana,
   * Piso, Etapa, Nivel, Lote). Solo los activos: 'unidad' se desactivó en
   * 20260830250000 porque en la práctica "Unidad" ES el inmueble. */
  async function cargarTiposAgrupacion(tenantId: string): Promise<ListaTipoRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorTipos } = await cliente
      .from('lista_tipos')
      .select('*')
      .eq('tipo', 'AGRUPACION_PREDIOS')
      .eq('activo', true)
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order('orden')
    if (errorTipos) throw errorTipos
    tiposAgrupacion.value = data ?? []
    return tiposAgrupacion.value
  }

  async function cargarAgrupaciones(tenantId: string): Promise<AgrupacionRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorAgrupaciones } = await cliente
        .from('agrupaciones')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('orden')
        .order('nombre')
      if (errorAgrupaciones) throw errorAgrupaciones
      agrupaciones.value = data ?? []
      return agrupaciones.value
    } finally {
      loading.value = false
    }
  }

  const tipoPorId = computed(() => new Map(tiposAgrupacion.value.map((t) => [t.id, t.nombre])))

  /** Árbol armado desde la lista plana. Un nodo cuyo padre no esté en la
   * lista (no debería pasar, pero no se asume) se trata como raíz para no
   * desaparecerlo de la pantalla. */
  const arbol = computed<AgrupacionNodo[]>(() => {
    const porId = new Map(agrupaciones.value.map((a) => [a.id, a]))
    const hijosDe = new Map<string | null, AgrupacionRow[]>()

    for (const fila of agrupaciones.value) {
      const clave = fila.parent_id && porId.has(fila.parent_id) ? fila.parent_id : null
      const lista = hijosDe.get(clave) ?? []
      lista.push(fila)
      hijosDe.set(clave, lista)
    }

    function construir(fila: AgrupacionRow, nivel: number, rutaPadre: string): AgrupacionNodo {
      const tipoNombre = tipoPorId.value.get(fila.tipo_id) ?? ''
      const etiqueta = tipoNombre ? `${tipoNombre} ${fila.nombre}` : fila.nombre
      const ruta = rutaPadre ? `${rutaPadre} / ${etiqueta}` : etiqueta
      return {
        ...fila,
        nivel,
        ruta,
        tipoNombre,
        hijos: (hijosDe.get(fila.id) ?? []).map((h) => construir(h, nivel + 1, ruta)),
      }
    }

    return (hijosDe.get(null) ?? []).map((f) => construir(f, 1, ''))
  })

  /** El árbol aplanado en orden de despliegue — lo que consume la tabla de la
   * pantalla de Ajustes y el selector de la ficha del inmueble. */
  const arbolPlano = computed<AgrupacionNodo[]>(() => {
    const salida: AgrupacionNodo[] = []
    const recorrer = (nodos: AgrupacionNodo[]): void => {
      for (const nodo of nodos) {
        salida.push(nodo)
        recorrer(nodo.hijos)
      }
    }
    recorrer(arbol.value)
    return salida
  })

  async function crearAgrupacion(params: {
    tenantId: string
    tipoId: number
    nombre: string
    parentId: string | null
    descripcion?: string | null
    activa?: boolean
    orden?: number
  }): Promise<AgrupacionRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('agrupaciones')
      .insert({
        tenant_id: params.tenantId,
        tipo_id: params.tipoId,
        nombre: params.nombre.trim(),
        parent_id: params.parentId,
        descripcion: params.descripcion?.trim() || null,
        activa: params.activa ?? true,
        orden: params.orden ?? 0,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarAgrupaciones(params.tenantId)
    return data
  }

  /** Plantilla rápida: crea varios nodos hermanos (mismo tipo, mismo padre)
   * de una vez — "Piso 01..10 dentro de Torre 1" en un solo viaje en vez de
   * repetir el modal de creación N veces. Un solo INSERT: si algún nombre
   * choca con `agrupaciones_hermano_unico` falla todo el lote (todo-o-nada,
   * más simple que reportar aciertos parciales para decenas de filas). */
  async function crearAgrupacionesLote(params: {
    tenantId: string
    tipoId: number
    parentId: string | null
    nombres: string[]
    descripcion?: string | null
  }): Promise<AgrupacionRow[]> {
    if (params.nombres.length === 0) return []
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('agrupaciones')
      .insert(
        params.nombres.map((nombre) => ({
          tenant_id: params.tenantId,
          tipo_id: params.tipoId,
          nombre: nombre.trim(),
          parent_id: params.parentId,
          descripcion: params.descripcion?.trim() || null,
          activa: true,
          orden: 0,
        })),
      )
      .select('*')
    if (errorInsert) throw errorInsert

    await cargarAgrupaciones(params.tenantId)
    return data ?? []
  }

  /** Asignación masiva: mueve varios inmuebles sin agrupar a una agrupación
   * en un solo UPDATE. Quien llama es responsable de recargar la lista de
   * inmuebles después (vive en cuentaCorriente.ts, no aquí). */
  async function asignarInmueblesAAgrupacion(params: {
    tenantId: string
    agrupacionId: string
    inmuebleIds: string[]
  }): Promise<void> {
    if (params.inmuebleIds.length === 0) return
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente
      .from('inmuebles')
      .update({ agrupacion_id: params.agrupacionId })
      .eq('tenant_id', params.tenantId)
      .in('id', params.inmuebleIds)
    if (errorUpdate) throw errorUpdate
  }

  /** `parentId` incluido a propósito: mover un nodo de padre es una edición
   * normal aquí (guard_agrupacion_arbol rechaza el ciclo y la profundidad). */
  async function actualizarAgrupacion(params: {
    id: string
    tenantId: string
    tipoId: number
    nombre: string
    parentId: string | null
    descripcion?: string | null
    activa?: boolean
    orden: number
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente
      .from('agrupaciones')
      .update({
        tipo_id: params.tipoId,
        nombre: params.nombre.trim(),
        parent_id: params.parentId,
        descripcion: params.descripcion?.trim() || null,
        activa: params.activa ?? true,
        orden: params.orden,
      })
      .eq('id', params.id)
    if (errorUpdate) throw errorUpdate

    await cargarAgrupaciones(params.tenantId)
  }

  async function cambiarActiva(id: string, activa: boolean, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente
      .from('agrupaciones')
      .update({ activa })
      .eq('id', id)
    if (errorUpdate) throw errorUpdate

    await cargarAgrupaciones(tenantId)
  }

  /** Solo se puede borrar de verdad si no tiene hijos ni inmuebles — ambas FK
   * son `on delete restrict`, así que la base rechaza el resto. Para retirar
   * una agrupación en uso está `cambiarActiva`. */
  async function eliminarAgrupacion(id: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorDelete } = await cliente.from('agrupaciones').delete().eq('id', id)
    if (errorDelete) throw errorDelete

    await cargarAgrupaciones(tenantId)
  }

  /** Borra una rama completa (el nodo y sus descendientes) cuando ninguno de
   * ellos tiene inmuebles asignados. `ids` debe venir en orden hoja→raíz —
   * quien llama es responsable de ese orden, porque `parent_id` es
   * `on delete restrict` y una fila con hijos vivos rechaza el borrado. */
  async function eliminarAgrupacionSubarbol(ids: string[], tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    for (const id of ids) {
      const { error: errorDelete } = await cliente.from('agrupaciones').delete().eq('id', id)
      if (errorDelete) throw errorDelete
    }
    await cargarAgrupaciones(tenantId)
  }

  function limpiar(): void {
    agrupaciones.value = []
    tiposAgrupacion.value = []
  }

  return {
    agrupaciones,
    tiposAgrupacion,
    loading,
    arbol,
    arbolPlano,
    cargarAgrupaciones,
    cargarTiposAgrupacion,
    crearAgrupacion,
    crearAgrupacionesLote,
    asignarInmueblesAAgrupacion,
    actualizarAgrupacion,
    cambiarActiva,
    eliminarAgrupacion,
    eliminarAgrupacionSubarbol,
    limpiar,
  }
})
