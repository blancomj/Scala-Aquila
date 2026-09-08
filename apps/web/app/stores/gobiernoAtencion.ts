/**
 * GOB-8 §4: atención al propietario/residente y consulta sin sesión (AD-26, Opción 1 — sin
 * portal, sin cuenta para propietarios/residentes). `solicitudes` nace numerada, avanza solo por
 * `gobierno_registrar_actuacion_solicitud()` (nunca UPDATE directo de `estado`); el SLA
 * (`sla_vence_at`) se calcula, nunca se lee como booleano persistido. El token de consulta por
 * inmueble (`atencion_tokens_consulta`) es la generalización del mecanismo de GOB-0 — se genera
 * vía la Edge Function `generar-enlace-inmueble` y se revoca vía RPC, nunca se lee/escribe la
 * tabla directo desde aquí.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type SolicitudRow = Database['public']['Tables']['solicitudes']['Row']
type SolicitudSlaRow = Database['public']['Tables']['solicitud_sla']['Row']
type ActuacionRow = Database['public']['Tables']['solicitud_actuaciones']['Row']
type TokenConsultaRow = Database['public']['Tables']['atencion_tokens_consulta']['Row']
type SolicitudEstado = Database['public']['Enums']['solicitud_estado_t']

export interface SolicitudConDetalle extends SolicitudRow {
  tipo: { codigo: string; nombre: string } | null
  categoria: { codigo: string; nombre: string } | null
  origen: { codigo: string; nombre: string } | null
  prioridad: { codigo: string; nombre: string } | null
  inmueble: { codigo: string } | null
  solicitante: { primer_nombre: string | null; primer_apellido: string | null } | null
}

export interface TokenConsultaConInmueble extends TokenConsultaRow {
  inmueble: { codigo: string } | null
}

const SELECT_SOLICITUD_DETALLE = '*, '
  + 'tipo:tipo_id(codigo, nombre), categoria:categoria_id(codigo, nombre), '
  + 'origen:origen_id(codigo, nombre), prioridad:prioridad_id(codigo, nombre), '
  + 'inmueble:inmueble_id(codigo), solicitante:solicitante_ref(primer_nombre, primer_apellido)'

export const useGobiernoAtencionStore = defineStore('gobiernoAtencion', () => {
  const solicitudes = shallowRef<SolicitudConDetalle[]>([])
  const solicitud = ref<SolicitudConDetalle | null>(null)
  const actuaciones = shallowRef<ActuacionRow[]>([])
  const configuracionesSla = shallowRef<SolicitudSlaRow[]>([])
  const tokens = shallowRef<TokenConsultaConInmueble[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarSolicitudes(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('solicitudes')
        .select(SELECT_SOLICITUD_DETALLE)
        .eq('tenant_id', tenantId)
        .order('anio', { ascending: false })
        .order('numero', { ascending: false })
      if (error) throw error
      solicitudes.value = (data ?? []) as unknown as SolicitudConDetalle[]
    } finally {
      loading.value = false
    }
  }

  async function cargarSolicitud(id: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('solicitudes').select(SELECT_SOLICITUD_DETALLE).eq('id', id).single()
    if (error) throw error
    solicitud.value = data as unknown as SolicitudConDetalle
    await cargarActuaciones(id)
  }

  async function cargarActuaciones(solicitudId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('solicitud_actuaciones').select('*').eq('solicitud_id', solicitudId).order('created_at')
    if (error) throw error
    actuaciones.value = data ?? []
  }

  async function crearSolicitud(params: {
    tipoId: number; categoriaId: number; origenId: number; prioridadId: number
    solicitanteRef: string; inmuebleId: string; calidad: 'propietario' | 'tenedor' | 'tercero'
    asunto: string; descripcion?: string | null
  }): Promise<SolicitudRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('gobierno_crear_solicitud', {
          p_tipo_id: params.tipoId, p_categoria_id: params.categoriaId, p_origen_id: params.origenId,
          p_prioridad_id: params.prioridadId, p_solicitante_ref: params.solicitanteRef,
          p_inmueble_id: params.inmuebleId, p_calidad: params.calidad, p_asunto: params.asunto,
          p_descripcion: params.descripcion ?? undefined,
        })
        .single()
      if (error) throw error
      return data
    } finally {
      guardando.value = false
    }
  }

  async function registrarActuacion(params: {
    solicitudId: string; estadoNuevo: SolicitudEstado; fecha: string; descripcion: string
    esRespuesta?: boolean; motivo?: string; documentoId?: string | null
  }): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('gobierno_registrar_actuacion_solicitud', {
        p_solicitud_id: params.solicitudId, p_estado_nuevo: params.estadoNuevo, p_fecha: params.fecha,
        p_descripcion: params.descripcion, p_es_respuesta: params.esRespuesta ?? undefined,
        p_motivo: params.motivo ?? undefined, p_documento_id: params.documentoId ?? undefined,
      })
      if (error) throw error
      await cargarSolicitud(params.solicitudId)
    } finally {
      guardando.value = false
    }
  }

  async function escalarSolicitud(params: {
    solicitudId: string
    destinoTipo: 'expediente_convivencia' | 'agenda_punto' | 'decision'
    destinoId: string
  }): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('gobierno_escalar_solicitud', {
        p_solicitud_id: params.solicitudId, p_destino_tipo: params.destinoTipo, p_destino_id: params.destinoId,
      })
      if (error) throw error
      await cargarSolicitud(params.solicitudId)
    } finally {
      guardando.value = false
    }
  }

  async function cargarConfiguracionesSla(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('solicitud_sla').select('*').eq('tenant_id', tenantId).order('vigente_desde', { ascending: false })
    if (error) throw error
    configuracionesSla.value = data ?? []
  }

  async function crearConfiguracionSla(params: {
    tenantId: string; tipoId: number; categoriaId: number; prioridadId: number
    horasPrimeraRespuesta: number; horasResolucion: number; horarioHabil: boolean
    vigenteDesde?: string
  }): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('solicitud_sla').insert({
        tenant_id: params.tenantId, tipo_id: params.tipoId, categoria_id: params.categoriaId,
        prioridad_id: params.prioridadId, horas_primera_respuesta: params.horasPrimeraRespuesta,
        horas_resolucion: params.horasResolucion, horario_habil: params.horarioHabil,
        ...(params.vigenteDesde ? { vigente_desde: params.vigenteDesde } : {}),
      })
      if (error) throw error
      await cargarConfiguracionesSla(params.tenantId)
    } finally {
      guardando.value = false
    }
  }

  async function cargarTokens(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('atencion_tokens_consulta')
      .select('*, inmueble:inmueble_id(codigo)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    if (error) throw error
    tokens.value = (data ?? []) as unknown as TokenConsultaConInmueble[]
  }

  /** Invoca la Edge Function (§4.4) — nunca escribe la tabla de control directo. */
  async function generarTokenInmueble(
    inmuebleId: string, vigenciaDias: number,
  ): Promise<{ id: string; inmueble_id: string; token: string; vigencia_dias: number; expira_en: string }> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.functions.invoke<{
        id: string; inmueble_id: string; token: string; vigencia_dias: number; expira_en: string
      }>('generar-enlace-inmueble', { body: { inmueble_id: inmuebleId, vigencia_dias: vigenciaDias } })
      if (error) throw error
      return data!
    } finally {
      guardando.value = false
    }
  }

  async function revocarToken(tokenId: string, motivo: string, tenantId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('gobierno_revocar_token_consulta_inmueble', {
        p_token_id: tokenId, p_motivo: motivo,
      })
      if (error) throw error
      await cargarTokens(tenantId)
    } finally {
      guardando.value = false
    }
  }

  function limpiar(): void {
    solicitud.value = null
    actuaciones.value = []
  }

  return {
    solicitudes, solicitud, actuaciones, configuracionesSla, tokens, loading, guardando,
    cargarSolicitudes, cargarSolicitud, cargarActuaciones, crearSolicitud, registrarActuacion,
    escalarSolicitud, cargarConfiguracionesSla, crearConfiguracionSla, cargarTokens,
    generarTokenInmueble, revocarToken, limpiar,
  }
})
