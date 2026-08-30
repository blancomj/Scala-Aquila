/**
 * Registro de procedencia del dato de contacto de un tercero (CJ-9,
 * CAR_10_Consulta_Juridica.md pregunta 4, 20260908150000) — bitácora
 * factual de de dónde salió cada email/teléfono, cuándo y quién lo
 * declaró. NO decide licitud de uso ni condiciona ningún envío — CJ-9
 * sigue sin asignar. guard_contacto_procedencia_insert ya valida
 * tercero/tenant/origen y estampa registrado_por — sin Edge Function,
 * mismo criterio que inmuebleTransferencias.ts/prescripcion.ts.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { mensajeError } from '~/utils/error-message'

export type ContactoProcedencia = Database['public']['Tables']['terceros_contacto_procedencia']['Row']

export interface RegistrarProcedenciaInput {
  terceroId: string
  campo: 'email' | 'telefono'
  valor: string
  origenId: number
  descripcion?: string
  documentoId?: string
}

export const useTercerosContactoProcedenciaStore = defineStore('tercerosContactoProcedencia', () => {
  const procedencias = ref<ContactoProcedencia[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarProcedencia(tenantId: string, terceroId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('terceros_contacto_procedencia')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('tercero_id', terceroId)
        .order('created_at', { ascending: false })
      if (error) throw new Error(mensajeError(error, 'No se pudo cargar la procedencia de contacto.'))
      procedencias.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function registrarProcedencia(tenantId: string, input: RegistrarProcedenciaInput): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      // registrado_por es NOT NULL sin default — guard_contacto_procedencia_insert lo
      // reemplaza siempre por auth.uid() (SECURITY DEFINER), este valor nunca se
      // persiste; se envía solo para satisfacer el tipo Insert generado.
      const actorId = useAuthStore().profile?.id ?? ''
      const { error } = await cliente.from('terceros_contacto_procedencia').insert({
        tenant_id: tenantId,
        tercero_id: input.terceroId,
        campo: input.campo,
        valor: input.valor,
        origen_id: input.origenId,
        descripcion: input.descripcion ?? null,
        documento_id: input.documentoId ?? null,
        registrado_por: actorId,
      })
      if (error) throw new Error(mensajeError(error, 'No se pudo registrar la procedencia del contacto.'))
      await cargarProcedencia(tenantId, input.terceroId)
    } finally {
      guardando.value = false
    }
  }

  function limpiar(): void {
    procedencias.value = []
  }

  return { procedencias, loading, guardando, cargarProcedencia, registrarProcedencia, limpiar }
})
