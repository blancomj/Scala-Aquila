/**
 * GOB-6 §4: convivencia y régimen sancionatorio (Ley 675 arts. 58-60). El expediente nace
 * numerado (nunca borrador) y avanza por `gobierno_registrar_actuacion()` — el log de actuaciones
 * ES el mecanismo de avance, nunca un UPDATE directo de `etapa`. Imponer una sanción exige pasar
 * los 5 guards de `gobierno_imponer_sancion()` (marco §2: es el corte de mayor riesgo de toda la
 * serie GOB — un error aquí produce una violación de derechos fundamentales).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type InfraccionRow = Database['public']['Tables']['gobierno_infracciones']['Row']
type ClaseSancionRow = Database['public']['Tables']['gobierno_clase_sancion']['Row']
type ExpedienteRow = Database['public']['Tables']['gobierno_expedientes_convivencia']['Row']
type ActuacionRow = Database['public']['Tables']['gobierno_expediente_actuaciones']['Row']
type SancionRow = Database['public']['Tables']['gobierno_sanciones']['Row']
type ConfigExpensaRow = Database['public']['Tables']['gobierno_config_expensa_necesaria']['Row']
type OrganoCompetenteFila = Database['public']['Functions']['gobierno_organo_competente']['Returns'][number]

export interface ExpedienteConDetalle extends ExpedienteRow {
  infraccion: { codigo: string; nombre: string; clases_sancion_permitidas: string[] } | null
  inmueble: { codigo: string } | null
  presunto_infractor: { primer_nombre: string; primer_apellido: string } | null
}

export interface ConfigExpensaConConcepto extends ConfigExpensaRow {
  concepto: { codigo: string; nombre: string } | null
}

export const useGobiernoConvivenciaStore = defineStore('gobiernoConvivencia', () => {
  const infracciones = shallowRef<InfraccionRow[]>([])
  const clasesSancion = shallowRef<ClaseSancionRow[]>([])
  const expedientes = shallowRef<ExpedienteConDetalle[]>([])
  const expediente = ref<ExpedienteConDetalle | null>(null)
  const actuaciones = shallowRef<ActuacionRow[]>([])
  const sanciones = shallowRef<SancionRow[]>([])
  const configExpensa = shallowRef<ConfigExpensaConConcepto[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarClasesSancion(): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.from('gobierno_clase_sancion').select('*').order('numeral_articulo')
    if (error) throw error
    clasesSancion.value = data ?? []
  }

  async function cargarInfracciones(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('gobierno_infracciones').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
    if (error) throw error
    infracciones.value = data ?? []
  }

  async function crearInfraccion(params: {
    tenantId: string; codigo: string; nombre: string; descripcion?: string | null
    reglamentoReferencia: string; clasesSancionPermitidas: string[]; esNoPecuniaria: boolean
  }): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_infracciones').insert({
        tenant_id: params.tenantId, codigo: params.codigo, nombre: params.nombre,
        descripcion: params.descripcion ?? null, reglamento_referencia: params.reglamentoReferencia,
        clases_sancion_permitidas: params.clasesSancionPermitidas, es_no_pecuniaria: params.esNoPecuniaria,
      })
      if (error) throw error
      await cargarInfracciones(params.tenantId)
    } finally {
      guardando.value = false
    }
  }

  async function cargarExpedientes(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('gobierno_expedientes_convivencia')
        .select(
          '*, infraccion:infraccion_id(codigo, nombre, clases_sancion_permitidas), '
          + 'inmueble:inmueble_id(codigo), presunto_infractor:presunto_infractor_ref(primer_nombre, primer_apellido)',
        )
        .eq('tenant_id', tenantId)
        .order('anio', { ascending: false })
        .order('numero', { ascending: false })
      if (error) throw error
      expedientes.value = (data ?? []) as unknown as ExpedienteConDetalle[]
    } finally {
      loading.value = false
    }
  }

  async function cargarExpediente(id: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('gobierno_expedientes_convivencia')
      .select(
        '*, infraccion:infraccion_id(codigo, nombre, clases_sancion_permitidas), '
        + 'inmueble:inmueble_id(codigo), presunto_infractor:presunto_infractor_ref(primer_nombre, primer_apellido)',
      )
      .eq('id', id)
      .single()
    if (error) throw error
    expediente.value = data as unknown as ExpedienteConDetalle
    await Promise.all([cargarActuaciones(id), cargarSanciones(id)])
  }

  async function cargarActuaciones(expedienteId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('gobierno_expediente_actuaciones').select('*').eq('expediente_id', expedienteId).order('created_at')
    if (error) throw error
    actuaciones.value = data ?? []
  }

  async function cargarSanciones(expedienteId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('gobierno_sanciones').select('*').eq('expediente_id', expedienteId).order('impuesta_at', { ascending: false })
    if (error) throw error
    sanciones.value = data ?? []
  }

  async function reportarExpediente(params: {
    infraccionId: string; inmuebleId: string; presuntoInfractorRef: string
    calidad: 'propietario' | 'tenedor' | 'tercero'; descripcionHechos: string; fechaHechos: string
  }): Promise<ExpedienteRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('gobierno_reportar_expediente', {
          p_infraccion_id: params.infraccionId, p_inmueble_id: params.inmuebleId,
          p_presunto_infractor_ref: params.presuntoInfractorRef, p_calidad: params.calidad,
          p_descripcion_hechos: params.descripcionHechos, p_fecha_hechos: params.fechaHechos,
        })
        .single()
      if (error) throw error
      return data
    } finally {
      guardando.value = false
    }
  }

  async function registrarActuacion(params: {
    expedienteId: string; etapa: 'conciliacion_comite' | 'requerimiento_escrito' | 'descargos'
    fecha: string; descripcion: string; documentoId?: string | null; plazoDias?: number | null
  }): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('gobierno_registrar_actuacion', {
        p_expediente_id: params.expedienteId, p_etapa: params.etapa, p_fecha: params.fecha,
        p_descripcion: params.descripcion, p_documento_id: params.documentoId ?? undefined,
        p_plazo_dias: params.plazoDias ?? undefined,
      })
      if (error) throw error
      await cargarExpediente(params.expedienteId)
    } finally {
      guardando.value = false
    }
  }

  async function archivarExpediente(expedienteId: string, motivo: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('gobierno_archivar_expediente', { p_expediente_id: expedienteId, p_motivo: motivo })
      if (error) throw error
      await cargarExpediente(expedienteId)
    } finally {
      guardando.value = false
    }
  }

  async function imponerSancion(params: {
    expedienteId: string; claseSancionCodigo: string; decisionId: string
    monto?: number | null; zonaComunId?: string | null
    vigenteDesde?: string | null; vigenteHasta?: string | null; publicacionDocumentoId?: string | null
  }): Promise<SancionRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('gobierno_imponer_sancion', {
          p_expediente_id: params.expedienteId, p_clase_sancion_codigo: params.claseSancionCodigo,
          p_decision_id: params.decisionId, p_monto: params.monto ?? undefined, p_zona_comun_id: params.zonaComunId ?? undefined,
          p_vigente_desde: params.vigenteDesde ?? undefined, p_vigente_hasta: params.vigenteHasta ?? undefined,
          p_publicacion_documento_id: params.publicacionDocumentoId ?? undefined,
        })
        .single()
      if (error) throw error
      await cargarExpediente(params.expedienteId)
      return data
    } finally {
      guardando.value = false
    }
  }

  async function cargarConfigExpensa(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('gobierno_config_expensa_necesaria').select('*, concepto:concepto_id(codigo, nombre)').eq('tenant_id', tenantId)
    if (error) throw error
    configExpensa.value = (data ?? []) as unknown as ConfigExpensaConConcepto[]
  }

  async function configurarExpensaNecesaria(tenantId: string, conceptoId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_config_expensa_necesaria').insert({ tenant_id: tenantId, concepto_id: conceptoId })
      if (error) throw error
      await cargarConfigExpensa(tenantId)
    } finally {
      guardando.value = false
    }
  }

  async function quitarConfigExpensaNecesaria(tenantId: string, conceptoId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('gobierno_config_expensa_necesaria').delete().eq('tenant_id', tenantId).eq('concepto_id', conceptoId)
      if (error) throw error
      await cargarConfigExpensa(tenantId)
    } finally {
      guardando.value = false
    }
  }

  /** Vista previa del tope (spec §4.7): expensa necesaria mensual del inmueble a hoy — la misma
   * función que consume gobierno_imponer_sancion() internamente, para mostrar el tope ANTES de
   * intentar imponer. Null si el tenant no ha configurado gobierno_config_expensa_necesaria. */
  async function previsualizarExpensaMensual(inmuebleId: string): Promise<number | null> {
    const cliente = useSupabaseClient<Database>()
    const hoy = new Date().toISOString().slice(0, 10)
    const { data, error } = await cliente
      .rpc('fn_gobierno_expensa_necesaria_mensual', { p_inmueble_id: inmuebleId, p_fecha: hoy })
    if (error) return null
    return data
  }

  /** Acumulado de multas previas del mismo infractor en el tenant (misma suma que el guard 5b de
   * gobierno_imponer_sancion, leída en modo lectura para la vista previa). */
  async function acumuladoMultasPrevias(tenantId: string, presuntoInfractorRef: string): Promise<number> {
    const cliente = useSupabaseClient<Database>()
    const { data: multaClase } = await cliente.from('gobierno_clase_sancion').select('id').eq('codigo', 'multa').single()
    if (!multaClase) return 0
    const { data, error } = await cliente
      .from('gobierno_sanciones')
      .select('monto, clase_sancion_id, expediente:expediente_id!inner(tenant_id, presunto_infractor_ref)')
      .eq('clase_sancion_id', multaClase.id)
      .eq('expediente.tenant_id', tenantId)
      .eq('expediente.presunto_infractor_ref', presuntoInfractorRef)
    if (error) return 0
    return (data ?? []).reduce((acc, s) => acc + (s.monto ?? 0), 0)
  }

  /** Órgano competente para imponer sanciones a una fecha (GOB-1) — para mostrar en la vista
   * previa si la decisión elegida realmente proviene de un órgano competente. */
  async function organosCompetentesImponerSancion(tenantId: string, fecha: string): Promise<OrganoCompetenteFila[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .rpc('gobierno_organo_competente', { p_tenant_id: tenantId, p_atribucion_codigo: 'imponer_sanciones', p_fecha: fecha })
    if (error) throw error
    return data ?? []
  }

  function limpiar(): void {
    expediente.value = null
    actuaciones.value = []
    sanciones.value = []
  }

  return {
    infracciones, clasesSancion, expedientes, expediente, actuaciones, sanciones, configExpensa,
    loading, guardando,
    cargarClasesSancion, cargarInfracciones, crearInfraccion, cargarExpedientes, cargarExpediente,
    cargarActuaciones, cargarSanciones, reportarExpediente, registrarActuacion, archivarExpediente,
    imponerSancion, cargarConfigExpensa, configurarExpensaNecesaria, quitarConfigExpensaNecesaria,
    previsualizarExpensaMensual, acumuladoMultasPrevias, organosCompetentesImponerSancion, limpiar,
  }
})
