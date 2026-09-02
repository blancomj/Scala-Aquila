/**
 * Plan anual de auditoría (PROMPT AUDITORÍA §30) — `auditoria_planes` +
 * `auditoria_plan_items` (20260920100000_auditoria_plan_anual.sql), y la
 * función de sugerencia `fn_sugerir_plan_anual` (riesgo_inherente, historial
 * de hallazgos, si el riesgo ya tiene control automatizado).
 */
import { describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  type Cliente,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/auditoria-plan-anual: faltan credenciales Supabase en .env')
}

interface SugerenciaPlan {
  riesgo_id: string
  riesgo_nombre: string
  categoria: string
  riesgo_inherente: number
  hallazgos_abiertos: number
  hallazgos_criticos: number
  tiene_control_automatico: boolean
  procesos: string | null
  frecuencias: string | null
  score: number
}

async function crearRiesgoFixture(
  admin: Cliente,
  tenantId: string,
  creadoPor: string,
  nombre: string,
  probabilidad = 3,
  impacto = 3,
) {
  const { data, error } = await admin
    .from('auditoria_riesgos')
    .insert({ tenant_id: tenantId, nombre, categoria: 'OPERATIVO', probabilidad, impacto, created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture riesgo: ${error.message}`)
  return data.id
}

async function crearControlFixture(
  admin: Cliente,
  tenantId: string,
  riesgoId: string,
  creadoPor: string,
  nombre: string,
  automatizado: boolean,
) {
  const { data, error } = await admin
    .from('auditoria_controles')
    .insert({
      tenant_id: tenantId,
      riesgo_id: riesgoId,
      nombre,
      tipo: 'PREVENTIVO',
      automatizado,
      manual: !automatizado,
      created_by: creadoPor,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture control: ${error.message}`)
  return data.id
}

async function crearEngagementFixture(admin: Cliente, tenantId: string, creadoPor: string) {
  const { data, error } = await admin
    .from('auditoria_engagements')
    .insert({ tenant_id: tenantId, nombre: 'Engagement de prueba', created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture engagement: ${error.message}`)
  return data.id
}

async function crearHallazgoFixture(
  admin: Cliente,
  tenantId: string,
  engagementId: string,
  riesgoId: string | null,
  creadoPor: string,
  nivel: string,
  estado: string,
) {
  const { data, error } = await admin
    .from('auditoria_hallazgos')
    .insert({
      tenant_id: tenantId,
      engagement_id: engagementId,
      proceso: 'Plan anual',
      riesgo_id: riesgoId,
      nivel,
      estado,
      created_by: creadoPor,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture hallazgo: ${error.message}`)
  return data.id
}

d('auditoria_planes / auditoria_plan_items / fn_sugerir_plan_anual', () => {
  const admin = clienteAdmin(env!)

  it('fn_sugerir_plan_anual combina riesgo_inherente, historial de hallazgos (directo e indirecto vía control) y control automático', async () => {
    const auditor = await crearUsuario(admin, 'apa-auditor')
    const tenant = await crearTenant(admin, 'apa', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')

    // probabilidad 3 * impacto 3 = riesgo_inherente 9
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id, 'Riesgo plan anual', 3, 3)
    const controlId = await crearControlFixture(admin, tenant.id, riesgoId, auditor.id, 'Control automático', true)
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)

    // Hallazgo con riesgo_id directo (típico de carga manual), abierto y crítico.
    await crearHallazgoFixture(admin, tenant.id, engagementId, riesgoId, auditor.id, 'CRITICO', 'ABIERTO')
    // Hallazgo generado por el control automático (solo trae control_id, no riesgo_id
    // — así inserta auditoria_control_ejecutar), cerrado: no debe contar como abierto.
    const { error: errorIndirecto } = await admin
      .from('auditoria_hallazgos')
      .insert({
        tenant_id: tenant.id,
        engagement_id: engagementId,
        proceso: 'Plan anual',
        control_id: controlId,
        nivel: 'MEDIO',
        estado: 'CERRADO',
        created_by: auditor.id,
      })
    expect(errorIndirecto).toBeNull()

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data, error } = await clienteAuditor.rpc('fn_sugerir_plan_anual', { p_tenant_id: tenant.id })
    expect(error).toBeNull()
    const sugerencias = data as SugerenciaPlan[]
    const fila = sugerencias.find((s) => s.riesgo_id === riesgoId)
    expect(fila).toBeDefined()
    expect(fila?.riesgo_inherente).toBe(9)
    expect(fila?.hallazgos_abiertos).toBe(1)
    expect(fila?.hallazgos_criticos).toBe(1)
    // el cerrado vía control_id sí cuenta en el histórico total (2 hallazgos
    // ligados al riesgo), pero solo 1 abierto y 1 crítico, ya verificado arriba.
    expect(fila?.tiene_control_automatico).toBe(true)
    // score = 9 (inherente) + 1*3 (abiertos) + 1*5 (criticos) - 4 (ya automatizado) = 13
    expect(fila?.score).toBe(13)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('crea el plan en BORRADOR por defecto (no se aprueba automáticamente) y sus ítems', async () => {
    const auditor = await crearUsuario(admin, 'apa-plan')
    const tenant = await crearTenant(admin, 'apa-plan', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id, 'Riesgo para el plan')

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data: plan, error: errorPlan } = await clienteAuditor
      .from('auditoria_planes')
      .insert({ tenant_id: tenant.id, anio: 2027, created_by: auditor.id })
      .select('id, estado, aprobado_por, aprobado_at')
      .single()
    expect(errorPlan).toBeNull()
    expect(plan?.estado).toBe('BORRADOR')
    expect(plan?.aprobado_por).toBeNull()
    expect(plan?.aprobado_at).toBeNull()

    const { data: item, error: errorItem } = await clienteAuditor
      .from('auditoria_plan_items')
      .insert({
        tenant_id: tenant.id,
        plan_id: plan!.id,
        riesgo_id: riesgoId,
        proceso: 'Cartera',
        prioridad: 'ALTA',
        frecuencia: 'ANUAL',
        periodo: '2027',
        created_by: auditor.id,
      })
      .select('id')
      .single()
    expect(errorItem).toBeNull()
    expect(item?.id).toBeTruthy()

    // No se aprueba solo por crear ítems — la aprobación es un UPDATE explícito y separado.
    const { data: planTrasItem } = await clienteAuditor
      .from('auditoria_planes')
      .select('estado')
      .eq('id', plan!.id)
      .single()
    expect(planTrasItem?.estado).toBe('BORRADOR')

    // Aprobación explícita, sí permitida.
    const { error: errorAprobar } = await clienteAuditor
      .from('auditoria_planes')
      .update({ estado: 'APROBADO', aprobado_por: auditor.id, aprobado_at: new Date().toISOString() })
      .eq('id', plan!.id)
    expect(errorAprobar).toBeNull()

    // unique(tenant_id, anio): un segundo plan para el mismo año falla.
    const { error: errorDuplicado } = await clienteAuditor
      .from('auditoria_planes')
      .insert({ tenant_id: tenant.id, anio: 2027, created_by: auditor.id })
    expect(errorDuplicado).not.toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('un rol sin auditor/administrador no puede crear ni ver planes', async () => {
    const auditor = await crearUsuario(admin, 'apa-rbac-auditor')
    const auxiliar = await crearUsuario(admin, 'apa-rbac-aux')
    const tenant = await crearTenant(admin, 'apa-rbac', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')

    const { data: plan, error: errorPlan } = await admin
      .from('auditoria_planes')
      .insert({ tenant_id: tenant.id, anio: 2028, created_by: auditor.id })
      .select('id')
      .single<{ id: string }>()
    expect(errorPlan).toBeNull()

    const clienteAuxiliar = await clienteComo(env!, auxiliar)
    const { data: visto, error: errorSelect } = await clienteAuxiliar.from('auditoria_planes').select('id').eq('id', plan!.id)
    expect(errorSelect).toBeNull()
    expect(visto).toEqual([])

    const { error: errorInsert } = await clienteAuxiliar
      .from('auditoria_planes')
      .insert({ tenant_id: tenant.id, anio: 2029, created_by: auxiliar.id })
    expect(errorInsert).not.toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
    await eliminarUsuario(admin, auxiliar.id)
  }, 30_000)

  it('aísla por tenant: fn_sugerir_plan_anual y las tablas del plan no filtran riesgos/planes de otro tenant', async () => {
    const auditorA = await crearUsuario(admin, 'apa-cross-a')
    const auditorB = await crearUsuario(admin, 'apa-cross-b')
    const tenantA = await crearTenant(admin, 'apa-cross-a', auditorA.id)
    const tenantB = await crearTenant(admin, 'apa-cross-b', auditorB.id)
    await crearMembership(admin, tenantA.id, auditorA.id, 'auditor')
    await crearMembership(admin, tenantB.id, auditorB.id, 'auditor')
    await crearRiesgoFixture(admin, tenantB.id, auditorB.id, 'Riesgo de otro tenant')

    const clienteAuditorA = await clienteComo(env!, auditorA)
    const { data, error } = await clienteAuditorA.rpc('fn_sugerir_plan_anual', { p_tenant_id: tenantB.id })
    expect(error).toBeNull()
    expect(data).toEqual([])

    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, auditorA.id)
    await eliminarUsuario(admin, auditorB.id)
  }, 30_000)
})
