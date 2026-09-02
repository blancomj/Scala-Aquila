/**
 * Reincidencia (PROMPT AUDITORÍA §61) — 20260924100000_auditoria_reincidencia.sql
 * agrega auditoria_hallazgos.reincidente/hallazgo_anterior_id/causa_comun
 * (marcados a mano por el auditor, no detectados automáticamente) y
 * auditoria_riesgos.prioridad (que el auditor sube él mismo — no hay
 * fórmula automática que "aumente la prioridad").
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
  console.warn('SALTADO tests/rls/auditoria-reincidencia: faltan credenciales Supabase en .env')
}

async function crearRiesgoFixture(admin: Cliente, tenantId: string, creadoPor: string) {
  const { data, error } = await admin
    .from('auditoria_riesgos')
    .insert({ tenant_id: tenantId, nombre: 'Riesgo reincidencia', categoria: 'OPERATIVO', probabilidad: 3, impacto: 3, created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture riesgo: ${error.message}`)
  return data.id
}

async function crearEngagementFixture(admin: Cliente, tenantId: string, creadoPor: string) {
  const { data, error } = await admin
    .from('auditoria_engagements')
    .insert({ tenant_id: tenantId, nombre: 'Engagement reincidencia', created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture engagement: ${error.message}`)
  return data.id
}

async function crearHallazgoFixture(
  admin: Cliente,
  tenantId: string,
  engagementId: string,
  riesgoId: string,
  creadoPor: string,
  estado: string,
) {
  const { data, error } = await admin
    .from('auditoria_hallazgos')
    .insert({ tenant_id: tenantId, engagement_id: engagementId, riesgo_id: riesgoId, proceso: 'Cartera', nivel: 'MEDIO', estado, created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture hallazgo: ${error.message}`)
  return data.id
}

d('Reincidencia — auditoria_hallazgos.reincidente / auditoria_riesgos.prioridad', () => {
  const admin = clienteAdmin(env!)

  it('reincidente=true exige hallazgo_anterior_id y causa_comun (constraint)', async () => {
    const auditor = await crearUsuario(admin, 'arei-constraint')
    const tenant = await crearTenant(admin, 'arei-constraint', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id)
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)

    const clienteAuditor = await clienteComo(env!, auditor)
    const { error } = await clienteAuditor.from('auditoria_hallazgos').insert({
      tenant_id: tenant.id,
      engagement_id: engagementId,
      riesgo_id: riesgoId,
      proceso: 'Cartera',
      nivel: 'MEDIO',
      estado: 'ABIERTO',
      reincidente: true,
      created_by: auditor.id,
    } as never)
    expect(error).not.toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('un hallazgo no puede ser reincidencia de sí mismo', async () => {
    const auditor = await crearUsuario(admin, 'arei-autorref')
    const tenant = await crearTenant(admin, 'arei-autorref', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id)
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)
    const hallazgoId = await crearHallazgoFixture(admin, tenant.id, engagementId, riesgoId, auditor.id, 'ABIERTO')

    const clienteAuditor = await clienteComo(env!, auditor)
    const { error } = await clienteAuditor
      .from('auditoria_hallazgos')
      .update({ reincidente: true, hallazgo_anterior_id: hallazgoId, causa_comun: 'x' })
      .eq('id', hallazgoId)
    expect(error).not.toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('flujo completo: se marca un hallazgo nuevo como reincidente de uno anterior cerrado, y se sube la prioridad del riesgo', async () => {
    const auditor = await crearUsuario(admin, 'arei-flujo')
    const tenant = await crearTenant(admin, 'arei-flujo', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id)
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)
    const hallazgoAnteriorId = await crearHallazgoFixture(admin, tenant.id, engagementId, riesgoId, auditor.id, 'CERRADO')

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data: nuevo, error: errorNuevo } = await clienteAuditor
      .from('auditoria_hallazgos')
      .insert({
        tenant_id: tenant.id,
        engagement_id: engagementId,
        riesgo_id: riesgoId,
        proceso: 'Cartera',
        nivel: 'ALTO',
        estado: 'ABIERTO',
        reincidente: true,
        hallazgo_anterior_id: hallazgoAnteriorId,
        causa_comun: 'Falta de segregación de funciones en la aplicación de pagos.',
        created_by: auditor.id,
      })
      .select('id, reincidente, hallazgo_anterior_id, causa_comun')
      .single()
    expect(errorNuevo).toBeNull()
    expect(nuevo?.reincidente).toBe(true)
    expect(nuevo?.hallazgo_anterior_id).toBe(hallazgoAnteriorId)

    const { data: riesgoActualizado, error: errorRiesgo } = await clienteAuditor
      .from('auditoria_riesgos')
      .update({ prioridad: 'ALTA' })
      .eq('id', riesgoId)
      .select('prioridad')
      .single()
    expect(errorRiesgo).toBeNull()
    expect(riesgoActualizado?.prioridad).toBe('ALTA')

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('prioridad solo acepta ALTA/MEDIA/BAJA', async () => {
    const auditor = await crearUsuario(admin, 'arei-prioridad')
    const tenant = await crearTenant(admin, 'arei-prioridad', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id)

    const clienteAuditor = await clienteComo(env!, auditor)
    const { error } = await clienteAuditor.from('auditoria_riesgos').update({ prioridad: 'URGENTE' } as never).eq('id', riesgoId)
    expect(error).not.toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('un auxiliar no puede subir la prioridad de un riesgo', async () => {
    const auditor = await crearUsuario(admin, 'arei-rbac-auditor')
    const auxiliar = await crearUsuario(admin, 'arei-rbac-aux')
    const tenant = await crearTenant(admin, 'arei-rbac', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id)

    const clienteAuxiliar = await clienteComo(env!, auxiliar)
    const { data, error } = await clienteAuxiliar
      .from('auditoria_riesgos')
      .update({ prioridad: 'ALTA' })
      .eq('id', riesgoId)
      .select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
    await eliminarUsuario(admin, auxiliar.id)
  }, 30_000)
})
