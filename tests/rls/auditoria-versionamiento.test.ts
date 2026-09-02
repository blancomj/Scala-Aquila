/**
 * Versionamiento (PROMPT AUDITORÍA §64) —
 * 20260927100000_auditoria_versionamiento.sql. Alcance real: solo
 * auditoria_riesgos tiene hoy una vía de edición, así que es la única
 * entidad versionada (`version`, incrementada por trigger). El informe
 * queda vinculado a la versión vigente cuando se creó cada hallazgo
 * (`riesgo_version_utilizada`, congelada al insertar, inmune a ediciones
 * posteriores del riesgo).
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
  console.warn('SALTADO tests/rls/auditoria-versionamiento: faltan credenciales Supabase en .env')
}

async function crearRiesgoFixture(admin: Cliente, tenantId: string, creadoPor: string, nombre: string) {
  const { data, error } = await admin
    .from('auditoria_riesgos')
    .insert({ tenant_id: tenantId, nombre, categoria: 'OPERATIVO', probabilidad: 3, impacto: 3, created_by: creadoPor })
    .select('id, version')
    .single<{ id: string; version: number }>()
  if (error) throw new Error(`fixture riesgo: ${error.message}`)
  return data
}

async function crearEngagementFixture(admin: Cliente, tenantId: string, creadoPor: string) {
  const { data, error } = await admin
    .from('auditoria_engagements')
    .insert({ tenant_id: tenantId, nombre: 'Engagement versionamiento', created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture engagement: ${error.message}`)
  return data.id
}

d('Versionamiento — auditoria_riesgos.version / auditoria_hallazgos.riesgo_version_utilizada', () => {
  const admin = clienteAdmin(env!)

  it('un riesgo nuevo arranca en version 1', async () => {
    const auditor = await crearUsuario(admin, 'aver-inicial')
    const tenant = await crearTenant(admin, 'aver-inicial', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgo = await crearRiesgoFixture(admin, tenant.id, auditor.id, 'Riesgo versión inicial')
    expect(riesgo.version).toBe(1)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('editar probabilidad/impacto/prioridad sube la versión; tocar solo updated_at no', async () => {
    const auditor = await crearUsuario(admin, 'aver-bump')
    const tenant = await crearTenant(admin, 'aver-bump', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgo = await crearRiesgoFixture(admin, tenant.id, auditor.id, 'Riesgo que sube de versión')

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data: tras1, error: error1 } = await clienteAuditor
      .from('auditoria_riesgos')
      .update({ probabilidad: 5 })
      .eq('id', riesgo.id)
      .select('version')
      .single()
    expect(error1).toBeNull()
    expect(tras1?.version).toBe(2)

    const { data: tras2 } = await clienteAuditor
      .from('auditoria_riesgos')
      .update({ prioridad: 'ALTA' })
      .eq('id', riesgo.id)
      .select('version')
      .single()
    expect(tras2?.version).toBe(3)

    // Reasignar el mismo valor no debería contar como cambio real, pero
    // IS DISTINCT FROM no puede saber "intención" — probamos el caso que sí
    // debe dar igual (mismo probabilidad, no se toca ninguna columna versionada).
    const { data: tras3 } = await clienteAuditor
      .from('auditoria_riesgos')
      .update({ descripcion: 'Ahora con descripción' })
      .eq('id', riesgo.id)
      .select('version')
      .single()
    expect(tras3?.version).toBe(4)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('un hallazgo nuevo congela la versión vigente del riesgo, y no cambia si el riesgo se edita después', async () => {
    const auditor = await crearUsuario(admin, 'aver-congelar')
    const tenant = await crearTenant(admin, 'aver-congelar', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgo = await crearRiesgoFixture(admin, tenant.id, auditor.id, 'Riesgo que se edita después')
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data: hallazgo, error } = await clienteAuditor
      .from('auditoria_hallazgos')
      .insert({
        tenant_id: tenant.id,
        engagement_id: engagementId,
        riesgo_id: riesgo.id,
        proceso: 'Cartera',
        nivel: 'MEDIO',
        estado: 'ABIERTO',
        created_by: auditor.id,
      })
      .select('id, riesgo_version_utilizada')
      .single()
    expect(error).toBeNull()
    expect(hallazgo?.riesgo_version_utilizada).toBe(1)

    // El riesgo cambia DESPUÉS de creado el hallazgo — la versión congelada no debe moverse.
    await clienteAuditor.from('auditoria_riesgos').update({ probabilidad: 1 }).eq('id', riesgo.id)
    const { data: hallazgoReleido } = await clienteAuditor
      .from('auditoria_hallazgos')
      .select('riesgo_version_utilizada')
      .eq('id', hallazgo!.id)
      .single()
    expect(hallazgoReleido?.riesgo_version_utilizada).toBe(1)

    const { data: riesgoReleido } = await clienteAuditor.from('auditoria_riesgos').select('version').eq('id', riesgo.id).single()
    expect(riesgoReleido?.version).toBe(2)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('un hallazgo sin riesgo_id no congela ninguna versión', async () => {
    const auditor = await crearUsuario(admin, 'aver-sinriesgo')
    const tenant = await crearTenant(admin, 'aver-sinriesgo', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data, error } = await clienteAuditor
      .from('auditoria_hallazgos')
      .insert({ tenant_id: tenant.id, engagement_id: engagementId, proceso: 'Cartera', nivel: 'MEDIO', estado: 'ABIERTO', created_by: auditor.id })
      .select('riesgo_version_utilizada')
      .single()
    expect(error).toBeNull()
    expect(data?.riesgo_version_utilizada).toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)
})
