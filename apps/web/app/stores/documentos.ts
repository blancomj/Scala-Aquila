/**
 * Documentos del inmueble (PROMPT_FICHA_INMUEBLE.md §4.2, §8.1). Lee
 * `v_documento_vigente` (última versión de cada grupo_id). La escritura
 * pasa por la Edge Function subir-documento — documentos_inmueble no tiene
 * política INSERT para `authenticated` (mismo criterio que pagos), así que
 * este store nunca hace un insert directo.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type DocumentoVigenteRow = Database['public']['Views']['v_documento_vigente']['Row']

const BUCKET = 'documentos-inmueble'

export const useDocumentosStore = defineStore('documentos', () => {
  const documentos = shallowRef<DocumentoVigenteRow[]>([])
  const loading = ref(false)
  const subiendo = ref(false)

  async function cargarDocumentos(tenantId: string, inmuebleId: string): Promise<DocumentoVigenteRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorDocumentos } = await cliente
        .from('v_documento_vigente')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('inmueble_id', inmuebleId)
        .order('created_at', { ascending: false })
      if (errorDocumentos) throw errorDocumentos
      documentos.value = data ?? []
      return documentos.value
    } finally {
      loading.value = false
    }
  }

  async function subirDocumento(params: {
    tenantId: string
    inmuebleId: string
    tipoDocumentoId: number
    archivo: File
    fechaVencimiento?: string
  }): Promise<void> {
    subiendo.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const form = new FormData()
      form.set('inmueble_id', params.inmuebleId)
      form.set('tipo_documento_id', String(params.tipoDocumentoId))
      form.set('archivo', params.archivo)
      if (params.fechaVencimiento) form.set('fecha_vencimiento', params.fechaVencimiento)

      const { error: errorFuncion } = await cliente.functions.invoke('subir-documento', {
        body: form,
      })
      if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)

      await cargarDocumentos(params.tenantId, params.inmuebleId)
    } finally {
      subiendo.value = false
    }
  }

  /** Signed URL de corta duración — el bucket es privado (RLS por tenant). */
  async function urlDescarga(storagePath: string): Promise<string> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.storage.from(BUCKET).createSignedUrl(storagePath, 60)
    if (error) throw error
    return data.signedUrl
  }

  function limpiar(): void {
    documentos.value = []
  }

  return { documentos, loading, subiendo, cargarDocumentos, subirDocumento, urlDescarga, limpiar }
})
