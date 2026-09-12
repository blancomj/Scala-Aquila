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

  /** `inmuebleId` null = documentos de la copropiedad misma, no de un inmueble puntual.
   * `casoJuridicoId`/`envioId`, si vienen, reemplazan el alcance por el expediente de ese
   * caso jurídico (CAR §15.4) o por ese envío de cobranza (PRQ-CAR-022) — `inmuebleId` se
   * ignora en ese caso. Prioridad envioId > casoJuridicoId > inmuebleId, mismo orden que
   * subir-documento/index.ts resuelve el tenant. */
  async function cargarDocumentos(
    tenantId: string,
    inmuebleId: string | null,
    casoJuridicoId?: string | null,
    envioId?: string | null,
  ): Promise<DocumentoVigenteRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      let consulta = cliente.from('v_documento_vigente').select('*').eq('tenant_id', tenantId)
      consulta =
        envioId != null
          ? consulta.eq('envio_id', envioId)
          : casoJuridicoId != null
            ? consulta.eq('caso_juridico_id', casoJuridicoId)
            : inmuebleId === null
              ? consulta.is('inmueble_id', null)
              : consulta.eq('inmueble_id', inmuebleId)
      const { data, error: errorDocumentos } = await consulta.order('created_at', { ascending: false })
      if (errorDocumentos) throw errorDocumentos
      documentos.value = data ?? []
      return documentos.value
    } finally {
      loading.value = false
    }
  }

  /** EXS-6 — las fotos de un aviso del marketplace. Consulta aparte y no un parámetro más de
   * `cargarDocumentos` porque su semántica es distinta: aquí se esperan VARIAS filas (una
   * galería), mientras que los demás alcances devuelven la versión vigente de cada grupo. */
  async function cargarFotosPublicacion(
    tenantId: string,
    publicacionId: string,
  ): Promise<DocumentoVigenteRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorFotos } = await cliente
        .from('v_documento_vigente')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('publicacion_id', publicacionId)
        .order('created_at', { ascending: true })
      if (errorFotos) throw errorFotos
      documentos.value = data ?? []
      return documentos.value
    } finally {
      loading.value = false
    }
  }

  /** `inmuebleId` null = sube un documento de la copropiedad misma — la Edge
   * Function exige entonces `tenant_id` explícito (verificado ahí contra la
   * membresía real del actor, ver subir-documento/index.ts). `casoJuridicoId`/
   * `envioId`, si vienen, reemplazan el alcance (mismo orden de prioridad que
   * cargarDocumentos) — `inmuebleId` se ignora en ese caso. */
  async function subirDocumento(params: {
    tenantId: string
    inmuebleId: string | null
    tipoDocumentoId: number
    archivo: File
    fechaVencimiento?: string
    descripcion?: string
    /** RC-7: adjunta el documento a un pago concreto (comprobante escaneado). */
    pagoId?: string
    casoJuridicoId?: string
    /** PRQ-CAR-022: adjunta el documento a un envío puntual de cobranza (constancia de
     * entrega, acuse firmado del canal físico). */
    envioId?: string
    /** EXS-6: foto de un aviso del marketplace. A diferencia de los demás alcances, una
     * publicación tiene VARIAS fotos, así que la Edge Function no las versiona entre sí —
     * cada foto es un documento propio, no la corrección de la anterior. */
    publicacionId?: string
  }): Promise<DocumentoVigenteRow> {
    subiendo.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const form = new FormData()
      if (params.publicacionId) {
        form.set('publicacion_id', params.publicacionId)
      } else if (params.envioId) {
        form.set('envio_id', params.envioId)
      } else if (params.casoJuridicoId) {
        form.set('caso_juridico_id', params.casoJuridicoId)
      } else if (params.inmuebleId !== null) {
        form.set('inmueble_id', params.inmuebleId)
      } else {
        form.set('tenant_id', params.tenantId)
      }
      form.set('tipo_documento_id', String(params.tipoDocumentoId))
      form.set('archivo', params.archivo)
      if (params.fechaVencimiento) form.set('fecha_vencimiento', params.fechaVencimiento)
      if (params.descripcion) form.set('descripcion', params.descripcion)
      if (params.pagoId) form.set('pago_id', params.pagoId)

      const { data, error: errorFuncion } = await cliente.functions.invoke<DocumentoVigenteRow>('subir-documento', {
        body: form,
      })
      if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)

      if (params.publicacionId) {
        await cargarFotosPublicacion(params.tenantId, params.publicacionId)
      } else {
        await cargarDocumentos(params.tenantId, params.inmuebleId, params.casoJuridicoId, params.envioId)
      }
      return data!
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

  /** Documento exacto por id, sin pasar por v_documento_vigente — esa vista solo expone la
   * última versión de cada grupo_id, así que una referencia FK a una versión ya superada (ej.
   * fondo_movimientos.documento_id) queda invisible ahí aunque siga siendo un documento real y
   * legible por RLS (documentos_select_agent_auditor no filtra por versión). Un movimiento
   * financiero append-only necesita poder resolver siempre el soporte exacto que citó, sin
   * importar qué se suba después con el mismo nombre. */
  async function documentoPorId(
    id: string,
  ): Promise<Pick<Database['public']['Tables']['documentos']['Row'], 'nombre_archivo' | 'storage_path'> | null> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('documentos')
      .select('nombre_archivo, storage_path')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data
  }

  function limpiar(): void {
    documentos.value = []
  }

  return {
    documentos,
    loading,
    subiendo,
    cargarDocumentos,
    cargarFotosPublicacion,
    subirDocumento,
    urlDescarga,
    documentoPorId,
    limpiar,
  }
})
