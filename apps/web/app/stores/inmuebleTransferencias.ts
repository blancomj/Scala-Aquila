/**
 * Registro de transferencias de propiedad (CJ-8, PROMPT-CAR-JUR-001 §15,
 * 20260908100000) — bitácora factual de POR QUÉ cambió el titular de un
 * inmueble (tipo, evidencia, deuda conocida a la fecha). NO reasigna deuda
 * ni dispara ningún cálculo: el QUIÉN/CUÁNDO del titular vigente lo sigue
 * resolviendo inmueble_persona_rol (stores/terceros.ts), esta tabla solo
 * complementa con el contexto evidencial que ese modelo no captura.
 * guard_inmueble_transferencia_insert ya valida inmueble/tenant/terceros y
 * estampa registrado_por — sin Edge Function, mismo criterio que
 * prescripcion.ts.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { mensajeError } from '~/utils/error-message'

export type Transferencia = Database['public']['Tables']['inmueble_transferencias']['Row']

export interface CrearTransferenciaInput {
  inmuebleId: string
  tipoTransferenciaId: number
  fechaTransferencia: string
  descripcion: string
  propietarioAnteriorId?: string
  propietarioNuevoId: string
  documentoId?: string
  deudaALaFecha?: number
}

export const useInmuebleTransferenciasStore = defineStore('inmuebleTransferencias', () => {
  const transferencias = ref<Transferencia[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarTransferencias(tenantId: string, inmuebleId?: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      let query = cliente
        .from('inmueble_transferencias')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('fecha_transferencia', { ascending: false })
      if (inmuebleId) query = query.eq('inmueble_id', inmuebleId)
      const { data, error } = await query
      if (error) throw new Error(mensajeError(error, 'No se pudieron cargar las transferencias.'))
      transferencias.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function crearTransferencia(tenantId: string, input: CrearTransferenciaInput): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      // registrado_por es NOT NULL sin default — guard_inmueble_transferencia_insert lo
      // reemplaza siempre por auth.uid() (SECURITY DEFINER), este valor nunca se
      // persiste; se envía solo para satisfacer el tipo Insert generado.
      const actorId = useAuthStore().profile?.id ?? ''
      const { error } = await cliente.from('inmueble_transferencias').insert({
        tenant_id: tenantId,
        inmueble_id: input.inmuebleId,
        tipo_transferencia_id: input.tipoTransferenciaId,
        fecha_transferencia: input.fechaTransferencia,
        descripcion: input.descripcion,
        propietario_anterior_id: input.propietarioAnteriorId ?? null,
        propietario_nuevo_id: input.propietarioNuevoId,
        documento_id: input.documentoId ?? null,
        deuda_a_la_fecha: input.deudaALaFecha ?? null,
        registrado_por: actorId,
      })
      if (error) throw new Error(mensajeError(error, 'No se pudo registrar la transferencia.'))
      await cargarTransferencias(tenantId)
    } finally {
      guardando.value = false
    }
  }

  function limpiar(): void {
    transferencias.value = []
  }

  return { transferencias, loading, guardando, cargarTransferencias, crearTransferencia, limpiar }
})
