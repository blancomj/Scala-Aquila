/**
 * Comunicaciones (COM-1) — histórico unificado de correo enviado desde
 * cualquier módulo: Cobranza, Gobierno (GOB-9), Compositor de correo,
 * Estado de cuenta y Recibo de caja. Todos escriben en la misma tabla
 * generalizada por GOB-9 (acciones_cobranza_envios/acuses) — esta pantalla
 * es la vista transversal que faltaba construir sobre ella.
 *
 * Solo lectura: el registro real ocurre siempre en las Edge Functions con
 * service_role (§34.3 — "un envío registrado a mano sin haber despachado
 * nada sería prueba fabricada"), nunca desde el cliente.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { mensajeError } from '~/utils/error-message'

type EstadoAcuse = Database['public']['Enums']['estado_acuse_t']
type Canal = Database['public']['Enums']['canal_cobranza_t']

export interface AcuseComunicacion {
  estado: EstadoAcuse
  ocurridoAt: string
  origen: string
  motivo: string | null
}

export interface ComunicacionEnvio {
  envioId: string
  canal: Canal
  destinatarioContacto: string
  destinatarioTerceroId: string | null
  plantillaCodigo: string
  asunto: string | null
  contenidoRenderizado: string
  enviadoAt: string
  enviadoPor: string | null
  proveedor: string
  referenciaExterna: string | null
  esAutomatico: boolean
  /** Cobranza clásica (accion_id) vs. cualquier otro módulo (origen_*) — mutuamente excluyentes
   * por envio_origen_exclusivo. */
  accionId: string | null
  origenModulo: string | null
  origenEntidad: string | null
  origenId: string | null
  origenEvento: string | null
  acuses: AcuseComunicacion[]
  ultimoAcuse: AcuseComunicacion | null
}

interface FilaComunicacionDb {
  id: string
  canal: Canal
  destinatario_contacto: string
  destinatario_tercero_id: string | null
  plantilla_codigo: string
  asunto: string | null
  contenido_renderizado: string
  enviado_at: string
  enviado_por: string | null
  proveedor: string
  referencia_externa: string | null
  es_automatico: boolean
  accion_id: string | null
  origen_modulo: string | null
  origen_entidad: string | null
  origen_id: string | null
  origen_evento: string | null
  acciones_cobranza_acuses: {
    estado: EstadoAcuse
    ocurrido_at: string
    origen: string
    motivo: string | null
  }[]
}

/** Etiqueta legible por módulo — 'cobranza' es el único que no viaja en origen_modulo (usa
 * accion_id en su lugar); el resto son los valores literales que declara cada Edge Function. */
export const ETIQUETA_MODULO: Record<string, string> = {
  cobranza: 'Cobranza',
  gobierno: 'Gobierno',
  compositor: 'Compositor de correo',
  estado_cuenta: 'Estado de cuenta',
  recibo_caja: 'Recibo de caja',
}

const LIMITE_FILAS = 500

export const useComunicacionesStore = defineStore('comunicaciones', () => {
  const envios = shallowRef<ComunicacionEnvio[]>([])
  const loading = ref(false)

  async function cargarComunicaciones(): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('acciones_cobranza_envios')
        .select(
          'id, canal, destinatario_contacto, destinatario_tercero_id, plantilla_codigo, asunto, contenido_renderizado, enviado_at, enviado_por, proveedor, referencia_externa, es_automatico, accion_id, origen_modulo, origen_entidad, origen_id, origen_evento, acciones_cobranza_acuses(estado, ocurrido_at, origen, motivo)',
        )
        .order('enviado_at', { ascending: false })
        .limit(LIMITE_FILAS)
      if (error) throw new Error(mensajeError(error, 'No se pudo cargar el histórico de comunicaciones.'))

      envios.value = (data as unknown as FilaComunicacionDb[]).map((f) => {
        const acuses = [...f.acciones_cobranza_acuses]
          .sort((a, b) => a.ocurrido_at.localeCompare(b.ocurrido_at))
          .map((a) => ({ estado: a.estado, ocurridoAt: a.ocurrido_at, origen: a.origen, motivo: a.motivo }))
        return {
          envioId: f.id,
          canal: f.canal,
          destinatarioContacto: f.destinatario_contacto,
          destinatarioTerceroId: f.destinatario_tercero_id,
          plantillaCodigo: f.plantilla_codigo,
          asunto: f.asunto,
          contenidoRenderizado: f.contenido_renderizado,
          enviadoAt: f.enviado_at,
          enviadoPor: f.enviado_por,
          proveedor: f.proveedor,
          referenciaExterna: f.referencia_externa,
          esAutomatico: f.es_automatico,
          accionId: f.accion_id,
          origenModulo: f.origen_modulo,
          origenEntidad: f.origen_entidad,
          origenId: f.origen_id,
          origenEvento: f.origen_evento,
          acuses,
          ultimoAcuse: acuses.length > 0 ? acuses[acuses.length - 1]! : null,
        }
      })
    } finally {
      loading.value = false
    }
  }

  return { envios, loading, cargarComunicaciones }
})
