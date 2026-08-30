/**
 * Casos jurídicos, actuaciones y costas (CAR §15.3-16, bloque 20/22) —
 * remisión a proceso ejecutivo desde una certificación vigente.
 *
 * Sin Edge Function: guard_caso_juridico_insert/transicion,
 * guard_caso_juridico_actuacion_registrada_por y guard_costa_judicial_*
 * (20260822340000/20260907100000) ya validan todo — rol administrador para
 * remitir y cerrar, certificación vigente del mismo tenant, abogado con rol
 * vigente, y estampan aprobado_por/registrada_por/consecutivo desde
 * auth.uid() y fn_siguiente_consecutivo. Mismo criterio que
 * decidirAccion/cancelarAccion en cobranza.ts.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { mensajeError } from '~/utils/error-message'

export type CasoJuridico = Database['public']['Tables']['casos_juridicos']['Row']
export type ActuacionJuridica = Database['public']['Tables']['caso_juridico_actuaciones']['Row']
export type CostaJudicial = Database['public']['Tables']['costas_judiciales']['Row']
export type EstadoCasoJuridico = Database['public']['Enums']['estado_caso_juridico_t']
export type TipoCosta = Database['public']['Enums']['tipo_costa_t']
export type EstadoCosta = Database['public']['Enums']['estado_costa_t']

export const ESTADOS_CIERRE: readonly EstadoCasoJuridico[] = ['terminado', 'desistido', 'archivado']

export interface CrearCasoJuridicoInput {
  inmuebleId: string
  certificacionId: string
  fechaRemision: string
  abogadoTerceroId: string | null
  numeroRadicado: string | null
  juzgado: string | null
  ciudad: string | null
  montoPretension: number
  fechaPretension: string
}

export interface RegistrarActuacionInput {
  fecha: string
  tipoActuacionId: number
  descripcion: string
  estadoDesde: EstadoCasoJuridico | null
  estadoHasta: EstadoCasoJuridico | null
  /** Auto, oficio o sentencia que respalda la actuación, en documentos — ver 20260908160000. */
  documentoId: string | null
}

export interface RegistrarCostaInput {
  tipoCosta: TipoCosta
  monto: number
  documentoFuente: string
  fechaDecision: string
  autoridad: string
}

export const useCasosJuridicosStore = defineStore('casosJuridicos', () => {
  const casos = ref<CasoJuridico[]>([])
  const actuaciones = ref<ActuacionJuridica[]>([])
  const costas = ref<CostaJudicial[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarCasos(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('casos_juridicos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
      if (error) throw new Error(mensajeError(error, 'No se pudieron cargar los casos jurídicos.'))
      casos.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function crearCaso(tenantId: string, input: CrearCasoJuridicoInput): Promise<CasoJuridico> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('casos_juridicos')
        .insert({
          tenant_id: tenantId,
          inmueble_id: input.inmuebleId,
          certificacion_id: input.certificacionId,
          fecha_remision: input.fechaRemision,
          abogado_tercero_id: input.abogadoTerceroId,
          numero_radicado: input.numeroRadicado,
          juzgado: input.juzgado,
          ciudad: input.ciudad,
          monto_pretension: input.montoPretension,
          fecha_pretension: input.fechaPretension,
        })
        .select('*')
        .single()
      if (error) throw new Error(mensajeError(error, 'No se pudo remitir el caso a jurídico.'))
      casos.value = [data, ...casos.value]
      return data
    } finally {
      guardando.value = false
    }
  }

  /** Campos administrativos que cualquier auxiliar puede editar/avanzar (no el cierre). */
  async function actualizarCaso(
    casoId: string,
    campos: Partial<{
      estado: EstadoCasoJuridico
      abogadoTerceroId: string | null
      numeroRadicado: string | null
      juzgado: string | null
      ciudad: string | null
      fechaApertura: string | null
      fechaUltimaActuacion: string | null
      fechaProximaActuacion: string | null
    }>,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('casos_juridicos')
      .update({
        estado: campos.estado,
        abogado_tercero_id: campos.abogadoTerceroId,
        numero_radicado: campos.numeroRadicado,
        juzgado: campos.juzgado,
        ciudad: campos.ciudad,
        fecha_apertura: campos.fechaApertura,
        fecha_ultima_actuacion: campos.fechaUltimaActuacion,
        fecha_proxima_actuacion: campos.fechaProximaActuacion,
      })
      .eq('id', casoId)
      .select('*')
      .single()
    if (error) throw new Error(mensajeError(error, 'No se pudo actualizar el caso.'))
    casos.value = casos.value.map((c) => (c.id === casoId ? data : c))
  }

  /** Cerrar exige rol administrador — lo hace cumplir guard_caso_juridico_transicion. */
  async function cerrarCaso(
    casoId: string,
    input: { estado: EstadoCasoJuridico; fechaCierre: string; motivoCierre: string; montoRecuperado: number },
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('casos_juridicos')
      .update({
        estado: input.estado,
        fecha_cierre: input.fechaCierre,
        motivo_cierre: input.motivoCierre,
        monto_recuperado: input.montoRecuperado,
      })
      .eq('id', casoId)
      .select('*')
      .single()
    if (error) throw new Error(mensajeError(error, 'No se pudo cerrar el caso.'))
    casos.value = casos.value.map((c) => (c.id === casoId ? data : c))
  }

  async function cargarActuaciones(casoId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('caso_juridico_actuaciones')
      .select('*')
      .eq('caso_id', casoId)
      .order('fecha', { ascending: false })
    if (error) throw new Error(mensajeError(error, 'No se pudieron cargar las actuaciones.'))
    actuaciones.value = data ?? []
  }

  async function registrarActuacion(
    tenantId: string,
    casoId: string,
    input: RegistrarActuacionInput,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('caso_juridico_actuaciones').insert({
      tenant_id: tenantId,
      caso_id: casoId,
      fecha: input.fecha,
      tipo_actuacion_id: input.tipoActuacionId,
      descripcion: input.descripcion,
      estado_desde: input.estadoDesde,
      estado_hasta: input.estadoHasta,
      documento_id: input.documentoId,
    })
    if (error) throw new Error(mensajeError(error, 'No se pudo registrar la actuación.'))
    await cargarActuaciones(casoId)
  }

  async function cargarCostas(casoId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('costas_judiciales')
      .select('*')
      .eq('caso_id', casoId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(mensajeError(error, 'No se pudieron cargar las costas.'))
    costas.value = data ?? []
  }

  async function registrarCosta(tenantId: string, casoId: string, input: RegistrarCostaInput): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('costas_judiciales').insert({
      tenant_id: tenantId,
      caso_id: casoId,
      tipo_costa: input.tipoCosta,
      monto: input.monto,
      documento_fuente: input.documentoFuente,
      fecha_decision: input.fechaDecision,
      autoridad: input.autoridad,
    })
    if (error) throw new Error(mensajeError(error, 'No se pudo registrar la costa.'))
    await cargarCostas(casoId)
  }

  async function actualizarCosta(
    casoId: string,
    costaId: string,
    campos: { estado?: EstadoCosta; montoRecuperado?: number },
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('costas_judiciales')
      .update({ estado: campos.estado, monto_recuperado: campos.montoRecuperado })
      .eq('id', costaId)
    if (error) throw new Error(mensajeError(error, 'No se pudo actualizar la costa.'))
    await cargarCostas(casoId)
  }

  return {
    casos,
    actuaciones,
    costas,
    loading,
    guardando,
    cargarCasos,
    crearCaso,
    actualizarCaso,
    cerrarCaso,
    cargarActuaciones,
    registrarActuacion,
    cargarCostas,
    registrarCosta,
    actualizarCosta,
  }
})
