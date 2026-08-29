/**
 * Registro de actos interruptivos de prescripción (VER-CAR-05 parcial,
 * bloque 13, 20260907140000) — SOLO bitácora factual, sin alerta ni
 * cálculo de plazo: el término y el cómputo siguen sin verificar
 * (regla de §3.5, VER-CAR-05 abierto). guard_prescripcion_acto_insert ya
 * valida inmueble/tenant y estampa registrado_por — no hay Edge Function,
 * mismo criterio que promesasAcuerdos.ts.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { mensajeError } from '~/utils/error-message'

export type ActoInterruptivo = Database['public']['Tables']['prescripcion_actos_interruptivos']['Row']

export interface CrearActoInterruptivoInput {
  inmuebleId: string
  tipoActoId: number
  fechaOcurrencia: string
  descripcion: string
}

export const usePrescripcionStore = defineStore('prescripcion', () => {
  const actos = ref<ActoInterruptivo[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarActos(tenantId: string, inmuebleId?: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      let query = cliente
        .from('prescripcion_actos_interruptivos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('fecha_ocurrencia', { ascending: false })
      if (inmuebleId) query = query.eq('inmueble_id', inmuebleId)
      const { data, error } = await query
      if (error) throw new Error(mensajeError(error, 'No se pudieron cargar los actos interruptivos.'))
      actos.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function crearActo(tenantId: string, input: CrearActoInterruptivoInput): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      // registrado_por es NOT NULL sin default — guard_prescripcion_acto_insert lo
      // reemplaza siempre por auth.uid() (SECURITY DEFINER), este valor nunca se
      // persiste; se envía solo para satisfacer el tipo Insert generado.
      const actorId = useAuthStore().profile?.id ?? ''
      const { error } = await cliente.from('prescripcion_actos_interruptivos').insert({
        tenant_id: tenantId,
        inmueble_id: input.inmuebleId,
        tipo_acto_id: input.tipoActoId,
        fecha_ocurrencia: input.fechaOcurrencia,
        descripcion: input.descripcion,
        registrado_por: actorId,
      })
      if (error) throw new Error(mensajeError(error, 'No se pudo registrar el acto interruptivo.'))
      await cargarActos(tenantId)
    } finally {
      guardando.value = false
    }
  }

  function limpiar(): void {
    actos.value = []
  }

  return { actos, loading, guardando, cargarActos, crearActo, limpiar }
})
