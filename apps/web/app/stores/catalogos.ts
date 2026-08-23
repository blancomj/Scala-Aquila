/**
 * Mantenimiento de `tipos`/`lista_tipos` — pantalla /configuracion/catalogos.
 * Distinto de `composables/useListaTipos.ts` (que sigue siendo la única
 * fuente para los <select> de catálogo del resto de la app, solo lectura):
 * este store es exclusivo de la pantalla de mantenimiento y sí escribe.
 *
 * `tipos` (familias) no tiene política INSERT — son fijas, nunca se crean
 * desde acá. `lista_tipos` sí tiene INSERT/UPDATE para `agent` scoped a
 * tenant_id is not null (20260814160000_tipos_lista_tipos.sql) — un tenant
 * nunca puede escribir sobre una fila de plataforma (tenant_id null), la
 * política ya lo impide sola. `actualizarValor` nunca envía `codigo` —
 * restricción de UI/store, no de RLS (mismo criterio que
 * nit_digito_verificacion en copropiedad.ts, que tampoco se envía nunca).
 *
 * `ocultarValor`/`mostrarValor` operan sobre `lista_tipos_ocultos`
 * (20260830360000) — la única forma de "editar" una fila de plataforma
 * desde acá, y solo afecta a este tenant (RLS scoped a tenant_id, igual que
 * el resto de la tabla).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type FamiliaRow = Database['public']['Tables']['tipos']['Row']
type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']

export const useCatalogosStore = defineStore('catalogos', () => {
  const familias = shallowRef<FamiliaRow[]>([])
  const valores = shallowRef<ListaTipoRow[]>([])
  const ocultosIds = shallowRef<Set<number>>(new Set())
  const loading = ref(false)

  async function cargarFamilias(): Promise<FamiliaRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.from('tipos').select('*').order('nombre')
    if (error) throw error
    familias.value = data ?? []
    return familias.value
  }

  /** Plataforma (tenant_id null) + propios del tenant, de todas las familias
   * a la vez — la pantalla filtra por familia en el cliente, mismo criterio
   * que tercerosStore.personasTenant para Personas vinculadas/Consejo. */
  async function cargarValores(tenantId: string): Promise<ListaTipoRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('lista_tipos')
        .select('*')
        .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
        .order('tipo')
        .order('orden')
      if (error) throw error
      valores.value = data ?? []
      return valores.value
    } finally {
      loading.value = false
    }
  }

  async function crearValor(params: {
    tenantId: string
    tipo: string
    codigo: string
    nombre: string
    orden: number
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('lista_tipos').insert({
      tenant_id: params.tenantId,
      tipo: params.tipo,
      codigo: params.codigo,
      nombre: params.nombre,
      orden: params.orden,
    })
    if (error) throw error
    await cargarValores(params.tenantId)
  }

  /** Nunca recibe `codigo` — ver comentario de cabecera. */
  async function actualizarValor(
    id: number,
    tenantId: string,
    cambios: { nombre: string; orden: number },
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('lista_tipos').update(cambios).eq('id', id)
    if (error) throw error
    await cargarValores(tenantId)
  }

  async function cambiarActivo(id: number, tenantId: string, activo: boolean): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('lista_tipos').update({ activo }).eq('id', id)
    if (error) throw error
    await cargarValores(tenantId)
  }

  async function cargarOcultos(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('lista_tipos_ocultos')
      .select('lista_tipos_id')
      .eq('tenant_id', tenantId)
    if (error) throw error
    ocultosIds.value = new Set((data ?? []).map((o) => o.lista_tipos_id))
  }

  async function ocultarValor(id: number, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('lista_tipos_ocultos').insert({ lista_tipos_id: id, tenant_id: tenantId })
    if (error) throw error
    await cargarOcultos(tenantId)
  }

  async function mostrarValor(id: number, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('lista_tipos_ocultos')
      .delete()
      .eq('lista_tipos_id', id)
      .eq('tenant_id', tenantId)
    if (error) throw error
    await cargarOcultos(tenantId)
  }

  function limpiar(): void {
    familias.value = []
    valores.value = []
    ocultosIds.value = new Set()
  }

  return {
    familias,
    valores,
    ocultosIds,
    loading,
    cargarFamilias,
    cargarValores,
    crearValor,
    actualizarValor,
    cambiarActivo,
    cargarOcultos,
    ocultarValor,
    mostrarValor,
    limpiar,
  }
})
