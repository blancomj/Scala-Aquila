/**
 * Store de auditoría interna — PROMPT_MAESTRO_MODULO_AUDITORIA_AQUILA §§5-40.
 *
 * Circuito núcleo: Riesgo → Control → Procedimiento → Engagement → Ejecución
 * → Muestra → Evidencia → Hallazgo → Acción → Seguimiento.
 *
 * Roles (ver migración 20260910100000): auditor + administrador leen y
 * escriben; auxiliar solo ve/trabaja lo que tiene asignado como
 * `responsable` en hallazgos/acciones — la RLS ya lo garantiza, este store
 * no filtra nada por su cuenta.
 *
 * `created_by`/`ejecutado_por`/`usuario_id` salen de `authStore.profile.id`,
 * NO de `useSupabaseUser().value.id` (ver nota en tasasReferencia.ts).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type AuditoriaRiesgo = Database['public']['Tables']['auditoria_riesgos']['Row']
type AuditoriaControl = Database['public']['Tables']['auditoria_controles']['Row']
type AuditoriaProcedimiento = Database['public']['Tables']['auditoria_procedimientos']['Row']
type AuditoriaEngagement = Database['public']['Tables']['auditoria_engagements']['Row']
type AuditoriaHallazgo = Database['public']['Tables']['auditoria_hallazgos']['Row']
type AuditoriaAccion = Database['public']['Tables']['auditoria_acciones']['Row']
type AuditoriaEjecucion = Database['public']['Tables']['auditoria_ejecuciones']['Row']
type AuditoriaMuestra = Database['public']['Tables']['auditoria_muestras']['Row']
type AuditoriaEvidencia = Database['public']['Tables']['auditoria_evidencias']['Row']
type AuditoriaTipoAuditoria = Database['public']['Tables']['auditoria_tipo_auditoria']['Row']
type AuditoriaCatalogoRiesgo = Database['public']['Tables']['auditoria_catalogo_riesgos']['Row']

/** Lista cerrada — debe reflejar el CHECK de auditoria_controles.codigo_automatico (PROMPT AUDITORÍA §15). */
export const CONTROLES_AUTOMATICOS = [
  { value: 'PERIODO_CERRADO_CON_MOVIMIENTOS', label: 'Movimientos en período cerrado' },
  { value: 'CARTERA_SOBREAPLICACION', label: 'Sobre-aplicación de pagos en cartera' },
  { value: 'PRESUPUESTO_VIGENTE_SIN_RUBROS', label: 'Presupuesto vigente sin rubros' },
  { value: 'CONTABILIDAD_DESCUADRE', label: 'Descuadre / parametrización contable pendiente' },
  { value: 'SEGURIDAD_CAMBIOS_PRIVILEGIOS', label: 'Cambios de rol o privilegio (informativo)' },
  { value: 'CARTERA_ANTICIPOS_SIN_APLICAR', label: 'Anticipos de cartera sin aplicar (+30 días)' },
  { value: 'BANCOS_CONCILIACION_PENDIENTE', label: 'Conciliación bancaria pendiente (+15 días)' },
  { value: 'TERCEROS_PROVEEDOR_DUPLICADO', label: 'Proveedor con documento duplicado (informativo)' },
  { value: 'GUARDAS_INMUTABILIDAD_DESHABILITADAS', label: 'Guardas de inmutabilidad deshabilitadas' },
] as const

export interface ResultadoEjecucionControl {
  ejecucion_id: string
  resultado: string
  conteo: number
  hallazgo_id: string | null
}

export const ESCALAS_RIESGO = {
  1: 'Muy bajo',
  2: 'Bajo',
  3: 'Medio',
  4: 'Alto',
  5: 'Crítico',
} as const

export type EscalaRiesgo = keyof typeof ESCALAS_RIESGO

function requireProfileId(): string {
  const authStore = useAuthStore()
  const id = authStore.profile?.id
  if (!id) throw new Error('auditoria: se requiere un perfil cargado (authStore.profile) para esta operación')
  return id
}

export const useAuditoriaStore = defineStore('auditoria', () => {
  const tenantStore = useTenantStore()
  const loading = ref(false)

  // ── CATÁLOGOS GLOBALES ──────────────────────────────────────────────────
  const tiposAuditoria = shallowRef<AuditoriaTipoAuditoria[]>([])
  const catalogoRiesgos = shallowRef<AuditoriaCatalogoRiesgo[]>([])

  async function cargarTiposAuditoria(): Promise<AuditoriaTipoAuditoria[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_tipo_auditoria')
      .select('*')
      .eq('activo', true)
      .order('nombre')
    if (error) throw error
    tiposAuditoria.value = data ?? []
    return tiposAuditoria.value
  }

  async function cargarCatalogoRiesgos(): Promise<AuditoriaCatalogoRiesgo[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_catalogo_riesgos')
      .select('*')
      .eq('activo', true)
      .order('categoria')
    if (error) throw error
    catalogoRiesgos.value = data ?? []
    return catalogoRiesgos.value
  }

  // ── RIESGOS ───────────────────────────────────────────────────────────────
  const riesgos = shallowRef<AuditoriaRiesgo[]>([])
  const riesgoSeleccionado = ref<AuditoriaRiesgo | null>(null)

  async function cargarRiesgos(tenantId: string): Promise<AuditoriaRiesgo[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('auditoria_riesgos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('riesgo_inherente', { ascending: false })
      if (error) throw error
      riesgos.value = data ?? []
      return riesgos.value
    } finally {
      loading.value = false
    }
  }

  async function crearRiesgo(
    tenantId: string,
    datos: Omit<AuditoriaRiesgo, 'id' | 'tenant_id' | 'created_by' | 'created_at' | 'updated_at' | 'riesgo_inherente' | 'busqueda_tsv'>
  ): Promise<AuditoriaRiesgo> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_riesgos')
      .insert({ tenant_id: tenantId, created_by: requireProfileId(), ...datos })
      .select()
      .single()
    if (error) throw error
    riesgos.value = [data!, ...riesgos.value]
    return data!
  }

  // ── CONTROLES ───────────────────────────────────────────────────────────
  const controles = shallowRef<AuditoriaControl[]>([])

  async function cargarControles(tenantId: string): Promise<AuditoriaControl[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_controles')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('nombre')
    if (error) throw error
    controles.value = data ?? []
    return controles.value
  }

  async function cargarControlesPorRiesgo(tenantId: string, riesgoId: string): Promise<AuditoriaControl[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_controles')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('riesgo_id', riesgoId)
    if (error) throw error
    return data ?? []
  }

  async function crearControl(
    tenantId: string,
    datos: Omit<AuditoriaControl, 'id' | 'tenant_id' | 'created_by' | 'created_at' | 'updated_at' | 'busqueda_tsv'>
  ): Promise<AuditoriaControl> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_controles')
      .insert({ tenant_id: tenantId, created_by: requireProfileId(), ...datos })
      .select()
      .single()
    if (error) throw error
    controles.value = [data!, ...controles.value]
    return data!
  }

  // ── PROCEDIMIENTOS ──────────────────────────────────────────────────────
  const procedimientos = shallowRef<AuditoriaProcedimiento[]>([])

  async function cargarProcedimientosPorControl(tenantId: string, controlId: string): Promise<AuditoriaProcedimiento[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_procedimientos')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('control_id', controlId)
      .order('created_at', { ascending: false })
    if (error) throw error
    procedimientos.value = data ?? []
    return procedimientos.value
  }

  async function crearProcedimiento(
    tenantId: string,
    datos: Omit<AuditoriaProcedimiento, 'id' | 'tenant_id' | 'created_by' | 'created_at' | 'updated_at'>
  ): Promise<AuditoriaProcedimiento> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_procedimientos')
      .insert({ tenant_id: tenantId, created_by: requireProfileId(), ...datos })
      .select()
      .single()
    if (error) throw error
    procedimientos.value = [data!, ...procedimientos.value]
    return data!
  }

  // ── ENGAGEMENTS / AUDITORÍAS ───────────────────────────────────────────
  const engagements = shallowRef<AuditoriaEngagement[]>([])

  async function cargarEngagements(tenantId: string): Promise<AuditoriaEngagement[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_engagements')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    if (error) throw error
    engagements.value = data ?? []
    return engagements.value
  }

  async function crearEngagement(
    tenantId: string,
    datos: Omit<AuditoriaEngagement, 'id' | 'tenant_id' | 'created_by' | 'created_at' | 'updated_at'>
  ): Promise<AuditoriaEngagement> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_engagements')
      .insert({ tenant_id: tenantId, created_by: requireProfileId(), ...datos })
      .select()
      .single()
    if (error) throw error
    engagements.value = [data!, ...engagements.value]
    return data!
  }

  /** "Auditar ahora" (§57): crea un engagement focalizado desde un registro AQUILA. */
  async function crearEngagementDesdeOrigen(
    tenantId: string,
    origenTipo: string,
    origenId: string,
    datos: Omit<AuditoriaEngagement, 'id' | 'tenant_id' | 'created_by' | 'created_at' | 'updated_at' | 'origen_tipo' | 'origen_id'>
  ): Promise<AuditoriaEngagement> {
    return crearEngagement(tenantId, { ...datos, origen_tipo: origenTipo, origen_id: origenId })
  }

  // ── EJECUCIONES / PRUEBAS ──────────────────────────────────────────────
  const ejecuciones = shallowRef<AuditoriaEjecucion[]>([])

  async function cargarEjecucionesPorEngagement(tenantId: string, engagementId: string): Promise<AuditoriaEjecucion[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_ejecuciones')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('engagement_id', engagementId)
      .order('ejecutado_at', { ascending: false })
    if (error) throw error
    ejecuciones.value = data ?? []
    return ejecuciones.value
  }

  async function registrarEjecucion(
    tenantId: string,
    datos: Omit<AuditoriaEjecucion, 'id' | 'tenant_id' | 'ejecutado_por' | 'created_at' | 'updated_at'>
  ): Promise<AuditoriaEjecucion> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_ejecuciones')
      .insert({ tenant_id: tenantId, ejecutado_por: requireProfileId(), ...datos })
      .select()
      .single()
    if (error) throw error
    ejecuciones.value = [data!, ...ejecuciones.value]
    return data!
  }

  /** Continuous Control Monitoring — dispara auditoria_control_ejecutar() (§15, §42). */
  async function ejecutarControlAutomatico(
    controlId: string,
    engagementId: string,
  ): Promise<ResultadoEjecucionControl> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('auditoria_control_ejecutar', {
      p_control_id: controlId,
      p_engagement_id: engagementId,
    })
    if (error) throw error
    const resultado = data?.[0]
    if (!resultado) throw new Error('auditoria_control_ejecutar no devolvió resultado.')
    return resultado
  }

  // ── MUESTRAS ────────────────────────────────────────────────────────────
  async function registrarMuestra(
    tenantId: string,
    datos: Omit<AuditoriaMuestra, 'id' | 'tenant_id' | 'created_by' | 'created_at'>
  ): Promise<AuditoriaMuestra> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_muestras')
      .insert({ tenant_id: tenantId, created_by: requireProfileId(), ...datos })
      .select()
      .single()
    if (error) throw error
    return data!
  }

  // ── HALLAZGOS ────────────────────────────────────────────────────────────
  const hallazgos = shallowRef<AuditoriaHallazgo[]>([])

  async function cargarHallazgos(tenantId: string, engagementId?: string): Promise<AuditoriaHallazgo[]> {
    let query = useSupabaseClient<Database>()
      .from('auditoria_hallazgos')
      .select('*')
      .eq('tenant_id', tenantId)

    if (engagementId) {
      query = query.eq('engagement_id', engagementId)
    }

    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error
    hallazgos.value = data ?? []
    return hallazgos.value
  }

  async function crearHallazgo(
    tenantId: string,
    datos: Omit<AuditoriaHallazgo, 'id' | 'tenant_id' | 'created_by' | 'created_at' | 'updated_at' | 'busqueda_tsv'>
  ): Promise<AuditoriaHallazgo> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_hallazgos')
      .insert({ tenant_id: tenantId, created_by: requireProfileId(), ...datos })
      .select()
      .single()
    if (error) throw error
    hallazgos.value = [data!, ...hallazgos.value]
    return data!
  }

  /**
   * Cierra un hallazgo. El trigger `auditoria_hallazgo_cierre_guard` rechaza
   * el cierre si falta evidencia o si quien cierra es quien lo creó (§40,
   * §55) — este método no duplica esa validación, solo propaga el error.
   */
  async function cerrarHallazgo(tenantId: string, hallazgoId: string): Promise<AuditoriaHallazgo> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_hallazgos')
      .update({ estado: 'CERRADO' })
      .eq('tenant_id', tenantId)
      .eq('id', hallazgoId)
      .select()
      .single()
    if (error) throw error
    const index = hallazgos.value.findIndex((h) => h.id === hallazgoId)
    if (index >= 0) hallazgos.value = [...hallazgos.value.slice(0, index), data!, ...hallazgos.value.slice(index + 1)]
    return data!
  }

  // ── ACCIONES ───────────────────────────────────────────────────────────
  const acciones = shallowRef<AuditoriaAccion[]>([])

  async function cargarAcciones(tenantId: string, hallazgoId?: string): Promise<AuditoriaAccion[]> {
    let query = useSupabaseClient<Database>()
      .from('auditoria_acciones')
      .select('*')
      .eq('tenant_id', tenantId)

    if (hallazgoId) {
      query = query.eq('hallazgo_id', hallazgoId)
    }

    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error
    acciones.value = data ?? []
    return acciones.value
  }

  async function crearAccion(
    tenantId: string,
    datos: Omit<AuditoriaAccion, 'id' | 'tenant_id' | 'created_by' | 'created_at' | 'updated_at'>
  ): Promise<AuditoriaAccion> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_acciones')
      .insert({ tenant_id: tenantId, created_by: requireProfileId(), ...datos })
      .select()
      .single()
    if (error) throw error
    acciones.value = [data!, ...acciones.value]
    return data!
  }

  async function actualizarAccion(
    tenantId: string,
    accionId: string,
    datos: Partial<AuditoriaAccion>
  ): Promise<AuditoriaAccion> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_acciones')
      .update(datos)
      .eq('tenant_id', tenantId)
      .eq('id', accionId)
      .select()
      .single()
    if (error) throw error
    const index = acciones.value.findIndex((a) => a.id === accionId)
    if (index >= 0) acciones.value = [...acciones.value.slice(0, index), data!, ...acciones.value.slice(index + 1)]
    return data!
  }

  // ── EVIDENCIAS ─────────────────────────────────────────────────────────
  async function subirEvidencia(
    tenantId: string,
    hallazgoId: string,
    datos: Omit<AuditoriaEvidencia, 'id' | 'tenant_id' | 'hallazgo_id' | 'usuario_id' | 'created_at' | 'busqueda_tsv'>
  ): Promise<AuditoriaEvidencia> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_evidencias')
      .insert({ tenant_id: tenantId, hallazgo_id: hallazgoId, usuario_id: requireProfileId(), ...datos })
      .select()
      .single()
    if (error) throw error
    return data!
  }

  async function cargarEvidenciasPorHallazgo(tenantId: string, hallazgoId: string): Promise<AuditoriaEvidencia[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('auditoria_evidencias')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('hallazgo_id', hallazgoId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  }

  // ── ESTADÍSTICAS / DASHBOARD ───────────────────────────────────────────
  const estadisticas = computed(() => {
    const tenantId = tenantStore.activeTenant?.id
    if (!tenantId) return null

    const totalRiesgos = riesgos.value.length
    const totalControles = controles.value.length
    const totalEngagements = engagements.value.length
    const hallazgosAbiertos = hallazgos.value.filter((h) => h.estado !== 'CERRADO' && h.estado !== 'RECHAZADO').length
    const hallazgosCriticos = hallazgos.value.filter((h) => h.nivel === 'CRITICO' && h.estado !== 'CERRADO').length
    const accionesVencidas = acciones.value.filter((a) => {
      if (!a.fecha_compromiso) return false
      const hoy = new Date()
      hoy.setHours(0, 0, 0, 0)
      const fecha = new Date(a.fecha_compromiso)
      fecha.setHours(0, 0, 0, 0)
      return fecha < hoy && a.estado !== 'CERRADA' && a.estado !== 'RECHAZADA'
    }).length

    return {
      totalRiesgos,
      totalControles,
      totalEngagements,
      hallazgosAbiertos,
      hallazgosCriticos,
      accionesVencidas,
      riesgoResidual: hallazgosCriticos > 0 ? 'ALTO' : hallazgosAbiertos > 0 ? 'MEDIO' : 'BAJO',
    }
  })

  // ── LIMPIAR ─────────────────────────────────────────────────────────────
  function limpiar(): void {
    riesgos.value = []
    controles.value = []
    procedimientos.value = []
    engagements.value = []
    ejecuciones.value = []
    hallazgos.value = []
    acciones.value = []
    riesgoSeleccionado.value = null
  }

  return {
    // estados
    loading,
    tiposAuditoria,
    catalogoRiesgos,
    riesgos,
    controles,
    procedimientos,
    engagements,
    ejecuciones,
    hallazgos,
    acciones,
    estadisticas,
    riesgoSeleccionado,

    // catálogos
    cargarTiposAuditoria,
    cargarCatalogoRiesgos,

    // riesgos
    cargarRiesgos,
    crearRiesgo,

    // controles
    cargarControles,
    cargarControlesPorRiesgo,
    crearControl,

    // procedimientos
    cargarProcedimientosPorControl,
    crearProcedimiento,

    // engagements
    cargarEngagements,
    crearEngagement,
    crearEngagementDesdeOrigen,

    // ejecuciones / muestras
    cargarEjecucionesPorEngagement,
    registrarEjecucion,
    registrarMuestra,
    ejecutarControlAutomatico,

    // hallazgos
    cargarHallazgos,
    crearHallazgo,
    cerrarHallazgo,

    // acciones
    cargarAcciones,
    crearAccion,
    actualizarAccion,

    // evidencias
    subirEvidencia,
    cargarEvidenciasPorHallazgo,

    // limpieza
    limpiar,
  }
})
