/**
 * GOB-4 §4: el acta se genera, no se adjunta (Ley 675 art. 47). contenido_generado es jsonb
 * (tipo Json recursivo) — se tipa a mano como ActaContenido en vez de dejar que tsc lo infiera
 * del esquema generado (mismo problema ya documentado en stores/certificaciones.ts/
 * gobiernoReuniones.ts: "Type instantiation is excessively deep"). Todas las escrituras pasan por
 * RPC (gobierno_actas no tiene policy insert/update para authenticated, mismo criterio que
 * `documentos`) — nunca un insert/update directo desde este store.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

export interface ActaCaracter {
  codigo: string
  nombre: string
  caracter: 'ordinaria' | 'extraordinaria' | null
}
export interface ActaConvocatoria {
  regimen: string
  emitida_at: string | null
  fecha_limite_respuesta?: string | null
  documento_id?: string | null
}
export interface ActaAgendaPunto {
  orden: number
  titulo: string
  descripcion: string | null
}
export interface ActaAsistente {
  nombre: string
  calidad: string
  inmueble_codigo: string | null
  coeficiente: number
  ingreso_at: string
  salida_at: string | null
}
export interface ActaPoder {
  inmueble_codigo: string
  otorgante: string
  apoderado: string
  validado: boolean
}
export interface ActaQuorum {
  coeficiente_total: number
  coeficiente_presente: number
  pct_presente: number
  hay_pluralidad: boolean
  quorum_deliberatorio: boolean
}
export interface ActaVotoNominal {
  inmueble_codigo: string | null
  nombre: string
  sentido: string | null
  coeficiente: number
}
export interface ActaVotacion {
  pregunta: string
  materia: string
  estado: string
  resultado: string | null
  coeficiente_total: number | null
  coeficiente_representado: number | null
  favor: number | null
  contra: number | null
  abstencion: number | null
  votos_nominales: ActaVotoNominal[]
}
export interface ActaContenido {
  caracter: ActaCaracter
  convocatoria: ActaConvocatoria
  orden_del_dia: ActaAgendaPunto[]
  asistentes: ActaAsistente[]
  poderes: ActaPoder[]
  quorum: ActaQuorum
  votaciones: ActaVotacion[]
}

type ActaRowGenerado = Database['public']['Tables']['gobierno_actas']['Row']
export type ActaRow = Omit<ActaRowGenerado, 'contenido_generado'> & { contenido_generado: ActaContenido }
export type VerificadorRow = Database['public']['Tables']['gobierno_acta_verificadores']['Row']
export type EntregaRow = Database['public']['Tables']['gobierno_acta_entregas']['Row']

export interface VerificadorConDetalle extends VerificadorRow {
  tercero: { nombre_completo: string } | null
}
export interface EntregaConDetalle extends EntregaRow {
  solicitante: { nombre_completo: string } | null
}

const ACTA_COLUMNAS =
  'id, tenant_id, reunion_id, numero, anio, estado, contenido_generado, narrativa, incluye_voto_nominal, '
  + 'presidente_miembro_id, secretario_miembro_id, suscrita_at, suscrita_por, documento_id, hash_contenido, '
  + 'plazo_disposicion_limite, puesta_a_disposicion_at, created_at, updated_at'

export const useGobiernoActasStore = defineStore('gobiernoActas', () => {
  const acta = ref<ActaRow | null>(null)
  const verificadores = shallowRef<VerificadorConDetalle[]>([])
  const entregas = shallowRef<EntregaConDetalle[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  /** Devuelve el acta_id de una reunión si ya se generó, o null. Para decidir "Generar acta" vs "Ver acta". */
  async function idPorReunion(reunionId: string): Promise<string | null> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.from('gobierno_actas').select('id').eq('reunion_id', reunionId).maybeSingle<{ id: string }>()
    if (error) throw error
    return data?.id ?? null
  }

  async function cargarActa(actaId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data: actaFila, error: errActa } = await cliente
        .from('gobierno_actas').select(ACTA_COLUMNAS).eq('id', actaId).single<ActaRow>()
      if (errActa) throw errActa
      acta.value = actaFila

      const { data: verificadoresFilas, error: errVerif } = await cliente
        .from('gobierno_acta_verificadores')
        .select('*, tercero:tercero_id(nombre_completo)')
        .eq('acta_id', actaId).order('created_at', { ascending: true })
      if (errVerif) throw errVerif
      verificadores.value = (verificadoresFilas ?? []) as VerificadorConDetalle[]

      const { data: entregasFilas, error: errEntregas } = await cliente
        .from('gobierno_acta_entregas')
        .select('*, solicitante:solicitante_ref(nombre_completo)')
        .eq('acta_id', actaId).order('fecha', { ascending: false })
      if (errEntregas) throw errEntregas
      entregas.value = (entregasFilas ?? []) as EntregaConDetalle[]
    } finally {
      loading.value = false
    }
  }

  async function generarActa(reunionId: string): Promise<ActaRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('gobierno_generar_acta', { p_reunion_id: reunionId }).single<ActaRow>()
      if (error) throw error
      acta.value = data
      return data
    } finally {
      guardando.value = false
    }
  }

  async function actualizarNarrativa(actaId: string, narrativa: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('fn_gobierno_actualizar_narrativa', { p_acta_id: actaId, p_narrativa: narrativa }).single<ActaRow>()
      if (error) throw error
      acta.value = data
    } finally {
      guardando.value = false
    }
  }

  async function suscribirActa(actaId: string, presidenteMiembroId: string, secretarioMiembroId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('fn_gobierno_suscribir_acta', {
          p_acta_id: actaId, p_presidente_miembro_id: presidenteMiembroId, p_secretario_miembro_id: secretarioMiembroId,
        })
        .single<ActaRow>()
      if (error) throw error
      acta.value = data
    } finally {
      guardando.value = false
    }
  }

  async function vincularDocumento(actaId: string, documentoId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('fn_gobierno_vincular_documento_acta', { p_acta_id: actaId, p_documento_id: documentoId }).single<ActaRow>()
      if (error) throw error
      acta.value = data
    } finally {
      guardando.value = false
    }
  }

  async function designarVerificador(tenantId: string, actaId: string, terceroId: string, plazoLimite: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('gobierno_acta_verificadores')
        .insert({ tenant_id: tenantId, acta_id: actaId, tercero_id: terceroId, plazo_limite: plazoLimite })
      if (error) throw error
      await cargarActa(actaId)
    } finally {
      guardando.value = false
    }
  }

  async function marcarVerificado(id: string, actaId: string, observaciones: string | null): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('gobierno_acta_verificadores').update({ verificado_at: new Date().toISOString(), observaciones }).eq('id', id)
      if (error) throw error
      await cargarActa(actaId)
    } finally {
      guardando.value = false
    }
  }

  async function registrarEntrega(
    tenantId: string, actaId: string, tipo: 'solicitud' | 'entrega' | 'negativa',
    opciones: { solicitanteRef?: string | null; motivoNegativa?: string; observaciones?: string } = {},
  ): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('gobierno_acta_entregas')
        .insert({
          tenant_id: tenantId, acta_id: actaId, tipo,
          solicitante_ref: opciones.solicitanteRef ?? null,
          motivo_negativa: opciones.motivoNegativa ?? null,
          observaciones: opciones.observaciones ?? null,
        })
      if (error) throw error
      await cargarActa(actaId)
    } finally {
      guardando.value = false
    }
  }

  /** Positivo: días hábiles restantes hasta el plazo. Negativo: vencido hace esos días hábiles. */
  async function diasHabilesRestantes(plazoLimite: string): Promise<number> {
    const cliente = useSupabaseClient<Database>()
    const hoy = new Date().toISOString().slice(0, 10)
    const { data, error } = await cliente.rpc('gobierno_dias_habiles_entre', { p_desde: hoy, p_hasta: plazoLimite })
    if (error) throw error
    return data ?? 0
  }

  /** GOB-0: enlace de consulta con token, genérico para cualquier documento_id — reutilizado tal cual. */
  async function generarEnlaceConsulta(documentoId: string, vigenciaDias = 30): Promise<{ token: string; expira_en: string }> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.functions.invoke<{ token: string; expira_en: string }>(
      'generar-enlace-documento', { body: { documento_id: documentoId, vigencia_dias: vigenciaDias } },
    )
    if (error) throw error
    return data!
  }

  function limpiar(): void {
    acta.value = null
    verificadores.value = []
    entregas.value = []
  }

  return {
    acta, verificadores, entregas, loading, guardando,
    idPorReunion, cargarActa, generarActa, actualizarNarrativa, suscribirActa, vincularDocumento,
    designarVerificador, marcarVerificado, registrarEntrega, diasHabilesRestantes, generarEnlaceConsulta, limpiar,
  }
})
