/**
 * Documentos del inmueble o de la copropiedad misma (PROMPT_FICHA_INMUEBLE.md
 * §4.2, §8.1; generalización a la copropiedad en PROMPT_FICHA_COPROPIEDAD.md
 * §8.1, migración 20260822130000: inmueble_id nullable, null = documento del
 * tenant). Lee `v_documento_vigente` (última versión de cada grupo_id). La
 * escritura pasa por la Edge Function subir-documento — documentos no tiene
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

  /** `inmuebleId` null = documentos de la copropiedad misma, no de un inmueble puntual. */
  async function cargarDocumentos(
    tenantId: string,
    inmuebleId: string | null,
  ): Promise<DocumentoVigenteRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      let consulta = cliente.from('v_documento_vigente').select('*').eq('tenant_id', tenantId)
      consulta = inmuebleId === null ? consulta.is('inmueble_id', null) : consulta.eq('inmueble_id', inmuebleId)
      const { data, error: errorDocumentos } = await consulta.order('created_at', { ascending: false })
      if (errorDocumentos) throw errorDocumentos
      documentos.value = data ?? []
      return documentos.value
    } finally {
      loading.value = false
    }
  }

  /** `inmuebleId` null = sube un documento de la copropiedad misma — la Edge
   * Function exige entonces `tenant_id` explícito (verificado ahí contra la
   * membresía real del actor, ver subir-documento/index.ts). */
  async function subirDocumento(params: {
    tenantId: string
    inmuebleId: string | null
    tipoDocumentoId: number
    archivo: File
    fechaVencimiento?: string
    descripcion?: string
    /** RC-7: adjunta el documento a un pago concreto (comprobante escaneado). */
    pagoId?: string
  }): Promise<void> {
    subiendo.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const form = new FormData()
      if (params.inmuebleId !== null) {
        form.set('inmueble_id', params.inmuebleId)
      } else {
        form.set('tenant_id', params.tenantId)
      }
      form.set('tipo_documento_id', String(params.tipoDocumentoId))
      form.set('archivo', params.archivo)
      if (params.fechaVencimiento) form.set('fecha_vencimiento', params.fechaVencimiento)
      if (params.descripcion) form.set('descripcion', params.descripcion)
      if (params.pagoId) form.set('pago_id', params.pagoId)

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
