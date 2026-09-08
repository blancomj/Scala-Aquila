/**
 * GOB-7 §4: impugnación (Ley 675 arts. 2 num. 5, 45, 49, 60, 62). AQUILA no resuelve la
 * impugnación — la registra, calcula su plazo (siempre en días hábiles, gobierno_sumar_dias_
 * habiles de GOB-4) y aplica el efecto mecánico que la resolución YA TOMADA por el juez/órgano
 * indica sobre el objeto impugnado (decisión o expediente sancionatorio). Los dos plazos legales
 * (art. 49 y art. 62) siguen "por verificar" — nunca bloquean por vencimiento
 * (plazo_fundamento_valido lo señala en UI, no como excepción).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type ImpugnacionRow = Database['public']['Tables']['gobierno_impugnaciones']['Row']
type ActuacionRow = Database['public']['Tables']['gobierno_impugnacion_actuaciones']['Row']
type ParametroRow = Database['public']['Tables']['gobierno_parametro_impugnacion']['Row']

export interface ImpugnacionConDetalle extends ImpugnacionRow {
  decision: { numero: number; anio: number; titulo: string } | null
  expediente: { numero: number; anio: number } | null
  impugnante: { primer_nombre: string; primer_apellido: string } | null
}

export const useGobiernoImpugnacionesStore = defineStore('gobiernoImpugnaciones', () => {
  const impugnaciones = shallowRef<ImpugnacionConDetalle[]>([])
  const impugnacion = ref<ImpugnacionConDetalle | null>(null)
  const actuaciones = shallowRef<ActuacionRow[]>([])
  const parametros = shallowRef<ParametroRow[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  const SELECT_CON_DETALLE = '*, decision:decision_id(numero, anio, titulo), '
    + 'expediente:expediente_id(numero, anio), impugnante:impugnante_ref(primer_nombre, primer_apellido)'

  /** Listado transversal (impugnaciones.vue): todas las impugnaciones del tenant. */
  async function cargarImpugnaciones(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('gobierno_impugnaciones')
        .select(SELECT_CON_DETALLE)
        .eq('tenant_id', tenantId)
        .order('anio', { ascending: false })
        .order('numero', { ascending: false })
      if (error) throw error
      impugnaciones.value = (data ?? []) as unknown as ImpugnacionConDetalle[]
    } finally {
      loading.value = false
    }
  }

  /** Impugnaciones de UNA decisión — sección contextual en decisiones/[id].vue (spec §4.4). */
  async function cargarImpugnacionesDeDecision(decisionId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('gobierno_impugnaciones').select(SELECT_CON_DETALLE).eq('decision_id', decisionId)
      .order('created_at', { ascending: false })
    if (error) throw error
    impugnaciones.value = (data ?? []) as unknown as ImpugnacionConDetalle[]
  }

  /** Impugnaciones de UN expediente — sección contextual en convivencia/[id].vue (spec §4.4). */
  async function cargarImpugnacionesDeExpediente(expedienteId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('gobierno_impugnaciones').select(SELECT_CON_DETALLE).eq('expediente_id', expedienteId)
      .order('created_at', { ascending: false })
    if (error) throw error
    impugnaciones.value = (data ?? []) as unknown as ImpugnacionConDetalle[]
  }

  async function cargarImpugnacion(id: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.from('gobierno_impugnaciones').select(SELECT_CON_DETALLE).eq('id', id).single()
    if (error) throw error
    impugnacion.value = data as unknown as ImpugnacionConDetalle
    await cargarActuaciones(id)
  }

  async function cargarActuaciones(impugnacionId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('gobierno_impugnacion_actuaciones').select('*').eq('impugnacion_id', impugnacionId).order('created_at')
    if (error) throw error
    actuaciones.value = data ?? []
  }

  async function cargarParametros(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.from('gobierno_parametro_impugnacion').select('*').eq('tenant_id', tenantId)
    if (error) throw error
    parametros.value = data ?? []
  }

  async function configurarParametro(params: {
    tenantId: string; objetoTipo: 'decision' | 'sancion'; plazoDias: number; fundamentoNormativoId?: number | null
  }): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_parametro_impugnacion').upsert({
        tenant_id: params.tenantId, objeto_tipo: params.objetoTipo, plazo_dias: params.plazoDias,
        fundamento_normativo_id: params.fundamentoNormativoId ?? null,
      })
      if (error) throw error
      await cargarParametros(params.tenantId)
    } finally {
      guardando.value = false
    }
  }

  async function presentarImpugnacion(params: {
    objetoTipo: 'decision' | 'sancion'; decisionId?: string | null; expedienteId?: string | null
    impugnanteRef: string; calidad?: string | null; fechaNotificacion: string; fechaPresentacion: string
    causal: string; fundamento?: string | null; documentoId?: string | null
    suspendeEfectos?: boolean; suspensionFundamento?: string | null
  }): Promise<ImpugnacionRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('gobierno_presentar_impugnacion', {
          p_objeto_tipo: params.objetoTipo, p_impugnante_ref: params.impugnanteRef,
          p_fecha_notificacion_objeto: params.fechaNotificacion, p_fecha_presentacion: params.fechaPresentacion,
          p_causal: params.causal,
          p_decision_id: params.decisionId ?? undefined, p_expediente_id: params.expedienteId ?? undefined,
          p_calidad: params.calidad ?? undefined, p_fundamento: params.fundamento ?? undefined,
          p_documento_id: params.documentoId ?? undefined,
          p_suspende_efectos: params.suspendeEfectos ?? undefined,
          p_suspension_fundamento: params.suspensionFundamento ?? undefined,
        })
        .single()
      if (error) throw error
      return data
    } finally {
      guardando.value = false
    }
  }

  async function registrarActuacion(params: {
    impugnacionId: string; estado: 'en_tramite' | 'desistida'; fecha: string; descripcion: string
    instancia?: string | null; documentoId?: string | null
  }): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('gobierno_registrar_actuacion_impugnacion', {
        p_impugnacion_id: params.impugnacionId, p_estado: params.estado, p_fecha: params.fecha,
        p_descripcion: params.descripcion, p_instancia: params.instancia ?? undefined,
        p_documento_id: params.documentoId ?? undefined,
      })
      if (error) throw error
      await cargarImpugnacion(params.impugnacionId)
    } finally {
      guardando.value = false
    }
  }

  async function resolverImpugnacion(params: {
    impugnacionId: string; resultado: 'confirmada' | 'revocada' | 'modificada' | 'inadmitida'
    descripcion: string; detalle?: string | null; resolucionDocumentoId?: string | null; instancia?: string | null
  }): Promise<ImpugnacionRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('gobierno_resolver_impugnacion', {
          p_impugnacion_id: params.impugnacionId, p_resultado: params.resultado, p_descripcion: params.descripcion,
          p_detalle: params.detalle ?? undefined, p_resolucion_documento_id: params.resolucionDocumentoId ?? undefined,
          p_instancia: params.instancia ?? undefined,
        })
        .single()
      if (error) throw error
      await cargarImpugnacion(params.impugnacionId)
      return data
    } finally {
      guardando.value = false
    }
  }

  function limpiar(): void {
    impugnacion.value = null
    actuaciones.value = []
  }

  return {
    impugnaciones, impugnacion, actuaciones, parametros, loading, guardando,
    cargarImpugnaciones, cargarImpugnacionesDeDecision, cargarImpugnacionesDeExpediente,
    cargarImpugnacion, cargarActuaciones, cargarParametros, configurarParametro,
    presentarImpugnacion, registrarActuacion, resolverImpugnacion, limpiar,
  }
})
