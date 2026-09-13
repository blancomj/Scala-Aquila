/**
 * Búsqueda global del navbar (Casos de uso/Barra de Busqueda/
 * PROMPT_BUSQUEDA_GLOBAL.md). Llama al RPC `fn_buscar_global`
 * (migraciones 20260822141000/142000/150000) — el prompt lo daba por
 * existente sin estarlo (mismo patrón de esta sesión con otros PROMPT_*.md);
 * se construyó, verificó contra el esquema real (4 nombres de constraint/
 * índice/policy no coincidían, concat_ws en la rama de terceros no es
 * IMMUTABLE) y se aplicó. subtitulo llega ya resuelto desde el RPC (join a
 * lista_tipos) — el store no vuelve a consultar por fila. El store no sabe
 * de tiempos/debounce, eso vive en BusquedaGlobal.vue (§6.3 del prompt).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

export type CategoriaBusqueda =
  | 'tercero'
  | 'inmueble'
  | 'documento'
  | 'novedad'
  | 'concepto'
  | 'cuenta_presupuestal'
  | 'caso_juridico'
  | 'agrupacion'
  | 'zona_comun'
  | 'riesgo'
  | 'control'
  | 'hallazgo'
  | 'evidencia'
  | 'anuncio'
  | 'vehiculo'
  | 'organo_gobierno'
  | 'reunion_gobierno'
  | 'decision_gobierno'
  | 'orden_trabajo'
  | 'hallazgo_mantenimiento'
  | 'accion_cobranza'
  | 'solicitud'

export interface ResultadoBusqueda {
  categoria: CategoriaBusqueda
  entidadId: string
  titulo: string
  subtitulo: string
  inmuebleId: string | null
  rank: number
}

type FilaRpc = Database['public']['Functions']['fn_buscar_global']['Returns'][number]

const CATEGORIAS_VALIDAS = new Set<string>([
  'tercero',
  'inmueble',
  'documento',
  'novedad',
  'concepto',
  'cuenta_presupuestal',
  'caso_juridico',
  'agrupacion',
  'zona_comun',
  'riesgo',
  'control',
  'hallazgo',
  'evidencia',
  'anuncio',
  'vehiculo',
  'organo_gobierno',
  'reunion_gobierno',
  'decision_gobierno',
  'orden_trabajo',
  'hallazgo_mantenimiento',
  'accion_cobranza',
  'solicitud',
])

function esCategoriaValida(valor: string): valor is CategoriaBusqueda {
  return CATEGORIAS_VALIDAS.has(valor)
}

export const useBusquedaStore = defineStore('busqueda', () => {
  const resultados = ref<ResultadoBusqueda[]>([])
  const categoria = ref<CategoriaBusqueda | null>(null)
  const buscando = ref(false)

  async function buscar(
    tenantId: string,
    query: string,
    categoriaFiltro?: CategoriaBusqueda | null,
    limite = 20,
  ): Promise<ResultadoBusqueda[]> {
    categoria.value = categoriaFiltro ?? null
    const q = query.trim()
    if (!q) {
      resultados.value = []
      return resultados.value
    }

    buscando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('fn_buscar_global', {
        p_tenant_id: tenantId,
        p_query: q,
        p_categoria: categoriaFiltro ?? undefined,
        p_limite: limite,
      })
      if (error) throw error
      resultados.value = ((data ?? []) as FilaRpc[])
        .filter((fila) => esCategoriaValida(fila.categoria))
        .map((fila) => ({
          categoria: fila.categoria as CategoriaBusqueda,
          entidadId: fila.entidad_id,
          titulo: fila.titulo,
          subtitulo: fila.subtitulo,
          inmuebleId: fila.inmueble_id,
          rank: fila.rank,
        }))
      return resultados.value
    } finally {
      buscando.value = false
    }
  }

  function limpiar(): void {
    resultados.value = []
    categoria.value = null
  }

  return { resultados, categoria, buscando, buscar, limpiar }
})
