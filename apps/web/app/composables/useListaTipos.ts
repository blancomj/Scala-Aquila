/**
 * Lectura de una familia de `lista_tipos` (catálogo genérico, 20260814160000).
 * Reutilizado por cualquier `<select>` contra un catálogo — nunca CRUD de
 * `tipos`/`lista_tipos` en sí (fuera de alcance, Configuración → Catálogos).
 */
import type { Database } from '@aquila/shared'

type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']

export async function cargarListaTipos(tenantId: string, familia: string): Promise<ListaTipoRow[]> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente
    .from('lista_tipos')
    .select('*')
    .eq('tipo', familia)
    .eq('activo', true)
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .order('orden')
  if (error) throw error
  return data ?? []
}
