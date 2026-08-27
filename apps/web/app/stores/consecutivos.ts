/**
 * Mantenimiento de `consecutivos_documento` — pantalla /configuracion/
 * consecutivos (RC-3, pedido explícito del usuario: "crear una página en
 * configuración para manejar los consecutivos de documentos y demás con
 * prefijos"). Solo administrador puede escribir (RLS,
 * consecutivos_documento_administrador_todo); auxiliar/auditor solo leen.
 *
 * `fn_siguiente_consecutivo()` crea la fila con default la primera vez que
 * se emite un documento — esta pantalla no necesita "crear" nada, solo
 * ajustar prefijo/dígitos de lo que ya existe (o insertar de antemano si el
 * administrador quiere fijar el prefijo ANTES del primer recibo).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type ConsecutivoRow = Database['public']['Tables']['consecutivos_documento']['Row']

export const ETIQUETA_TIPO_DOCUMENTO: Record<string, string> = {
  recibo_caja: 'Recibo de caja',
}

export const useConsecutivosStore = defineStore('consecutivos', () => {
  const consecutivos = shallowRef<ConsecutivoRow[]>([])
  const loading = ref(false)

  async function cargarConsecutivos(tenantId: string): Promise<ConsecutivoRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('consecutivos_documento')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('tipo_documento')
      if (error) throw error
      consecutivos.value = data ?? []
      return consecutivos.value
    } finally {
      loading.value = false
    }
  }

  /** Crea o ajusta prefijo/dígitos. Si la copropiedad nunca emitió ese tipo
   * de documento, upsert la crea con el siguiente_numero que se indique
   * (por defecto 1) — así el administrador puede fijar el prefijo ANTES del
   * primer recibo. */
  async function guardarConsecutivo(params: {
    tenantId: string
    tipoDocumento: string
    prefijo: string
    digitos: number
    siguienteNumero?: number
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('consecutivos_documento').upsert(
      {
        tenant_id: params.tenantId,
        tipo_documento: params.tipoDocumento,
        prefijo: params.prefijo,
        digitos: params.digitos,
        ...(params.siguienteNumero !== undefined
          ? { siguiente_numero: params.siguienteNumero }
          : {}),
      },
      { onConflict: 'tenant_id,tipo_documento' },
    )
    if (error) throw error
    await cargarConsecutivos(params.tenantId)
  }

  function limpiar(): void {
    consecutivos.value = []
  }

  return { consecutivos, loading, cargarConsecutivos, guardarConsecutivo, limpiar }
})
