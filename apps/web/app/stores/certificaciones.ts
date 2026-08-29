/**
 * Certificaciones de deuda (CAR §15.2, bloque 21) — el artefacto del art.
 * 48 Ley 675. Emitir pasa por la Edge Function cartera-certificar-deuda
 * (arma el desglose y el hash, RC-3 le da el consecutivo); anular es un
 * UPDATE directo por RLS, igual que decidirAccion/cancelarAccion en
 * cobranza.ts — guard_certificacion_transicion (20260822340000) ya exige
 * rol administrador y un motivo, no hay nada que una función intermedia
 * añadiera.
 *
 * El selector de inmueble reutiliza cuentaCorriente.ts::cargarInmuebles —
 * mismo listado que ya carga RegistrarPagoForm.vue, no se duplica la
 * consulta aquí.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'
import { mensajeError } from '~/utils/error-message'

export type CertificacionDeuda = Database['public']['Tables']['certificaciones_deuda']['Row']

/**
 * La lista no necesita detalle_cargos (jsonb pesado, y su tipo Json es
 * recursivo) — traerlo revienta el genérico de UiTabla con "Type
 * instantiation is excessively deep". La ficha completa (obtenerPorId) sí
 * lo trae, para el documento imprimible.
 */
export type CertificacionResumen = Pick<
  CertificacionDeuda,
  'id' | 'tenant_id' | 'inmueble_id' | 'consecutivo' | 'fecha_expedicion' | 'fecha_corte' | 'monto_total' | 'estado'
>

export interface EmitirCertificacionInput {
  inmuebleId: string
  fechaCorte: string
  fechaExpedicion: string
  cargoFirmante: string
}

export interface EmitirCertificacionResultado {
  certificacionId: string
  consecutivo: string
  hash: string
}

export const useCertificacionesStore = defineStore('certificaciones', () => {
  const certificaciones = ref<CertificacionResumen[]>([])
  const loading = ref(false)
  const emitiendo = ref(false)

  async function cargar(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('certificaciones_deuda')
        .select('id, tenant_id, inmueble_id, consecutivo, fecha_expedicion, fecha_corte, monto_total, estado')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
      if (error) throw new Error(mensajeError(error, 'No se pudieron cargar las certificaciones.'))
      certificaciones.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function emitir(tenantId: string, input: EmitirCertificacionInput): Promise<EmitirCertificacionResultado> {
    emitiendo.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.functions.invoke<EmitirCertificacionResultado>(
        'cartera-certificar-deuda',
        {
          body: {
            tenant_id: tenantId,
            inmueble_id: input.inmuebleId,
            fecha_corte: input.fechaCorte,
            fecha_expedicion: input.fechaExpedicion,
            cargo_firmante: input.cargoFirmante,
          },
        },
      )
      if (error) throw await extraerErrorFuncion(error)
      if (!data) throw new Error('La función no devolvió resultado.')
      return data
    } finally {
      emitiendo.value = false
    }
  }

  async function anular(certificacionId: string, motivo: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('certificaciones_deuda')
      .update({ estado: 'anulada', anulada_motivo: motivo })
      .eq('id', certificacionId)
    if (error) throw new Error(mensajeError(error, 'No se pudo anular la certificación.'))
  }

  async function obtenerPorId(certificacionId: string): Promise<CertificacionDeuda | null> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('certificaciones_deuda')
      .select('*')
      .eq('id', certificacionId)
      .maybeSingle()
    if (error) throw new Error(mensajeError(error, 'No se pudo cargar la certificación.'))
    return data
  }

  return {
    certificaciones,
    loading,
    emitiendo,
    cargar,
    emitir,
    anular,
    obtenerPorId,
  }
})
