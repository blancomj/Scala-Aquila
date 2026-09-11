/**
 * CO-9 · Certificación de estados financieros, dictamen del revisor fiscal y rendición de
 * cuentas (§4.1-§4.6). Toda escritura pasa por RPC (las tres tablas no tienen policy
 * insert/update para authenticated) — mismo criterio que stores/gobiernoActas.ts.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

export type CertificacionRow = Database['public']['Tables']['contable_certificacion']['Row']
export type DictamenRow = Database['public']['Tables']['contable_dictamen']['Row']
export type RendicionRow = Database['public']['Tables']['contable_rendicion_cuentas']['Row']

export interface DocumentoProximoVencer {
  documento_id: string
  tipo_documento: string
  fecha_origen: string
  fecha_limite: string
  dias_restantes: number
  bajo_legal_hold: boolean
}

export const useContableRendicionStore = defineStore('contableRendicion', () => {
  const certificaciones = shallowRef<CertificacionRow[]>([])
  const rendiciones = shallowRef<RendicionRow[]>([])
  const documentosProximosVencer = shallowRef<DocumentoProximoVencer[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargar(tenantId: string, ejercicio: number): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const [{ data: certs, error: errCerts }, { data: rends, error: errRends }] = await Promise.all([
        cliente.from('contable_certificacion').select('*').eq('tenant_id', tenantId).eq('ejercicio', ejercicio)
          .order('certificado_at', { ascending: false }),
        cliente.from('contable_rendicion_cuentas').select('*').eq('tenant_id', tenantId).eq('ejercicio', ejercicio)
          .order('created_at', { ascending: false }),
      ])
      if (errCerts) throw errCerts
      if (errRends) throw errRends
      certificaciones.value = certs ?? []
      rendiciones.value = rends ?? []
    } finally {
      loading.value = false
    }
  }

  async function certificar(params: {
    tenantId: string; ejercicio: number; fechaCorte: string; estadosIncluidos: string[]
    administradorDocumento: string; textoCertificacion: string
    contadorTerceroId?: string | null; contadorTarjetaProfesional?: string | null
  }): Promise<CertificacionRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('fn_contable_certificar_estados', {
        p_tenant_id: params.tenantId, p_ejercicio: params.ejercicio, p_fecha_corte: params.fechaCorte,
        p_estados_incluidos: params.estadosIncluidos, p_administrador_documento: params.administradorDocumento,
        p_texto_certificacion: params.textoCertificacion,
        p_contador_tercero_id: params.contadorTerceroId ?? undefined,
        p_contador_tarjeta_profesional: params.contadorTarjetaProfesional ?? undefined,
      }).single<CertificacionRow>()
      if (error) throw error
      await cargar(params.tenantId, params.ejercicio)
      return data
    } finally {
      guardando.value = false
    }
  }

  async function invalidarCertificacion(tenantId: string, ejercicio: number, motivo: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('fn_contable_invalidar_certificacion', {
        p_tenant_id: tenantId, p_ejercicio: ejercicio, p_motivo: motivo,
      })
      if (error) throw error
      await cargar(tenantId, ejercicio)
    } finally {
      guardando.value = false
    }
  }

  async function registrarDictamen(params: {
    tenantId: string; ejercicio: number; certificacionId: string; revisorFiscalTerceroId: string
    tipoOpinionCodigo: string; texto: string; fecha: string
  }): Promise<DictamenRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('fn_contable_registrar_dictamen', {
        p_tenant_id: params.tenantId, p_certificacion_id: params.certificacionId,
        p_revisor_fiscal_tercero_id: params.revisorFiscalTerceroId, p_tipo_opinion_codigo: params.tipoOpinionCodigo,
        p_texto: params.texto, p_fecha: params.fecha,
      }).single<DictamenRow>()
      if (error) throw error
      await cargar(params.tenantId, params.ejercicio)
      return data
    } finally {
      guardando.value = false
    }
  }

  async function crearRendicion(params: {
    tenantId: string; ejercicio: number; periodoDesde: string; periodoHasta: string
    certificacionId: string; dictamenId?: string | null; presupuestoEjecutadoResumen?: unknown
  }): Promise<RendicionRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('fn_contable_crear_rendicion', {
        p_tenant_id: params.tenantId, p_ejercicio: params.ejercicio, p_periodo_desde: params.periodoDesde,
        p_periodo_hasta: params.periodoHasta, p_certificacion_id: params.certificacionId,
        p_dictamen_id: params.dictamenId ?? undefined,
        p_presupuesto_ejecutado_resumen: (params.presupuestoEjecutadoResumen ?? null) as never,
      }).single<RendicionRow>()
      if (error) throw error
      await cargar(params.tenantId, params.ejercicio)
      return data
    } finally {
      guardando.value = false
    }
  }

  async function presentarRendicion(params: {
    tenantId: string; ejercicio: number; id: string
    decisionId?: string | null; actaReferenciaTexto?: string | null; observaciones?: string | null
  }): Promise<RendicionRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('fn_contable_presentar_rendicion', {
        p_id: params.id, p_decision_id: params.decisionId ?? undefined,
        p_acta_referencia_texto: params.actaReferenciaTexto ?? undefined, p_observaciones: params.observaciones ?? undefined,
      }).single<RendicionRow>()
      if (error) throw error
      await cargar(params.tenantId, params.ejercicio)
      return data
    } finally {
      guardando.value = false
    }
  }

  async function aprobarRendicion(tenantId: string, ejercicio: number, id: string): Promise<RendicionRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('fn_contable_aprobar_rendicion', { p_id: id }).single<RendicionRow>()
      if (error) throw error
      await cargar(tenantId, ejercicio)
      return data
    } finally {
      guardando.value = false
    }
  }

  async function rechazarRendicion(tenantId: string, ejercicio: number, id: string, motivo: string): Promise<RendicionRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('fn_contable_rechazar_rendicion', { p_id: id, p_motivo: motivo }).single<RendicionRow>()
      if (error) throw error
      await cargar(tenantId, ejercicio)
      return data
    } finally {
      guardando.value = false
    }
  }

  async function vincularDocumentoRendicion(tenantId: string, ejercicio: number, id: string, documentoId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .rpc('fn_contable_vincular_documento_rendicion', { p_id: id, p_documento_id: documentoId })
      if (error) throw error
      await cargar(tenantId, ejercicio)
    } finally {
      guardando.value = false
    }
  }

  async function registrarLibrosDian(tenantId: string, ejercicio: number, id: string, fecha: string, radicado: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .rpc('fn_contable_registrar_libros_dian', { p_id: id, p_fecha: fecha, p_radicado: radicado })
      if (error) throw error
      await cargar(tenantId, ejercicio)
    } finally {
      guardando.value = false
    }
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

  async function cargarDocumentosProximosVencer(tenantId: string, diasAnticipacion = 90): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .rpc('contable_documentos_proximos_vencer_retencion', { p_tenant_id: tenantId, p_dias_anticipacion: diasAnticipacion })
    if (error) throw error
    documentosProximosVencer.value = (data ?? []) as DocumentoProximoVencer[]
  }

  async function definirPoliticaConservacion(tenantId: string, tipoDocumentoId: number, plazoAnios: number): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('contable_politica_conservacion')
        .upsert({ tenant_id: tenantId, tipo_documento_id: tipoDocumentoId, plazo_anios: plazoAnios }, { onConflict: 'tenant_id,tipo_documento_id' })
      if (error) throw error
      await cargarDocumentosProximosVencer(tenantId)
    } finally {
      guardando.value = false
    }
  }

  async function activarLegalHold(tenantId: string, documentoGrupoId: string, motivo: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .rpc('fn_activar_legal_hold', { p_tenant_id: tenantId, p_documento_grupo_id: documentoGrupoId, p_motivo: motivo })
      if (error) throw error
      await cargarDocumentosProximosVencer(tenantId)
    } finally {
      guardando.value = false
    }
  }

  function limpiar(): void {
    certificaciones.value = []
    rendiciones.value = []
    documentosProximosVencer.value = []
  }

  return {
    certificaciones, rendiciones, documentosProximosVencer, loading, guardando,
    cargar, certificar, invalidarCertificacion, registrarDictamen, crearRendicion, presentarRendicion,
    aprobarRendicion, rechazarRendicion, vincularDocumentoRendicion, registrarLibrosDian,
    generarEnlaceConsulta, cargarDocumentosProximosVencer, definirPoliticaConservacion, activarLegalHold, limpiar,
  }
})
