/**
 * Lectura de una familia de `lista_tipos` (catálogo genérico, 20260814160000).
 * Reutilizado por cualquier `<select>` contra un catálogo — nunca CRUD de
 * `tipos`/`lista_tipos` en sí (fuera de alcance, Configuración → Catálogos).
 *
 * Excluye los valores de plataforma que este tenant ocultó
 * (lista_tipos_ocultos, 20260830360000) — la única barrera de visibilidad
 * está acá, adentro del picker. Los registros ya guardados que usan un
 * valor oculto lo siguen mostrando normal (sus joins van directo a
 * lista_tipos, no pasan por esta función).
 */
import type { Database } from '@aquila/shared'

type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']

export async function cargarListaTipos(tenantId: string, familia: string): Promise<ListaTipoRow[]> {
  const cliente = useSupabaseClient<Database>()
  const [{ data: valores, error: errorValores }, { data: ocultos, error: errorOcultos }] = await Promise.all([
    cliente
      .from('lista_tipos')
      .select('*')
      .eq('tipo', familia)
      .eq('activo', true)
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order('orden'),
    cliente.from('lista_tipos_ocultos').select('lista_tipos_id').eq('tenant_id', tenantId),
  ])
  if (errorValores) throw errorValores
  if (errorOcultos) throw errorOcultos
  const idsOcultos = new Set((ocultos ?? []).map((o) => o.lista_tipos_id))
  return (valores ?? []).filter((v) => !idsOcultos.has(v.id))
}
