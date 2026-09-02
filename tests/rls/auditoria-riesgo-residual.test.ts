/**
 * Riesgo residual dinámico (PROMPT AUDITORÍA §63) —
 * auditoria_riesgo_residual_historial (20260925100000_auditoria_riesgo_residual.sql).
 * Tabla insert-only: "nunca borrar el estado anterior" se verifica probando
 * que no hay UPDATE/DELETE disponibles vía RLS, no solo leyendo el comentario.
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
  console.warn('SALTADO tests/rls/auditoria-riesgo-residual: faltan credenciales Supabase en .env')
}

async function crearRiesgoFixture(admin: Cliente, tenantId: string, creadoPor: string, nombre: string) {
  const { data, error } = await admin
    .from('auditoria_riesgos')
    .insert({ tenant_id: tenantId, nombre, categoria: 'OPERATIVO', probabilidad: 4, impacto: 4, created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture riesgo: ${error.message}`)
  return data.id
}

d('auditoria_riesgo_residual_historial', () => {
  const admin = clienteAdmin(env!)

  it('registra una reevaluación con riesgo_residual generado (probabilidad × impacto)', async () => {
    const auditor = await crearUsuario(admin, 'arr-generado')
    const tenant = await crearTenant(admin, 'arr-generado', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id, 'Riesgo residual generado')

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data, error } = await clienteAuditor
      .from('auditoria_riesgo_residual_historial')
      .insert({
        tenant_id: tenant.id,
        riesgo_id: riesgoId,
        probabilidad: 2,
        impacto: 4,
        motivo: 'Se cerraron las acciones de remediación; el control ya opera de forma consistente.',
        created_by: auditor.id,
      })
      .select('riesgo_residual')
      .single()
    expect(error).toBeNull()
    expect(data?.riesgo_residual).toBe(8)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('conserva el historial: una segunda reevaluación no modifica ni borra la primera', async () => {
    const auditor = await crearUsuario(admin, 'arr-historial')
    const tenant = await crearTenant(admin, 'arr-historial', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id, 'Riesgo con historial')

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data: primera } = await clienteAuditor
      .from('auditoria_riesgo_residual_historial')
      .insert({ tenant_id: tenant.id, riesgo_id: riesgoId, probabilidad: 4, impacto: 4, motivo: 'Evaluación inicial.', created_by: auditor.id })
      .select('id, created_at')
      .single()

    const { data: segunda } = await clienteAuditor
      .from('auditoria_riesgo_residual_historial')
      .insert({ tenant_id: tenant.id, riesgo_id: riesgoId, probabilidad: 2, impacto: 3, motivo: 'Tras cerrar acciones de remediación.', created_by: auditor.id })
      .select('id, created_at')
      .single()

    const { data: historial, error } = await clienteAuditor
      .from('auditoria_riesgo_residual_historial')
      .select('*')
      .eq('riesgo_id', riesgoId)
      .order('created_at', { ascending: false })
    expect(error).toBeNull()
    expect(historial).toHaveLength(2)
    expect(historial![0]!.id).toBe(segunda!.id)
    expect(historial![0]!.riesgo_residual).toBe(6)
    expect(historial![1]!.id).toBe(primera!.id)
    expect(historial![1]!.riesgo_residual).toBe(16)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('nunca se borra el estado anterior: no hay UPDATE ni DELETE disponibles', async () => {
    const auditor = await crearUsuario(admin, 'arr-inmutable')
    const tenant = await crearTenant(admin, 'arr-inmutable', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id, 'Riesgo inmutable')

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data: fila } = await clienteAuditor
      .from('auditoria_riesgo_residual_historial')
      .insert({ tenant_id: tenant.id, riesgo_id: riesgoId, probabilidad: 3, impacto: 3, motivo: 'Original.', created_by: auditor.id })
      .select('id')
      .single<{ id: string }>()

    const { data: actualizados, error: errorUpdate } = await clienteAuditor
      .from('auditoria_riesgo_residual_historial')
      .update({ motivo: 'Intento de editar.' })
      .eq('id', fila!.id)
      .select('id')
    expect(errorUpdate).toBeNull()
    expect(actualizados).toEqual([])

    const { data: borrados, error: errorDelete } = await clienteAuditor
      .from('auditoria_riesgo_residual_historial')
      .delete()
      .eq('id', fila!.id)
      .select('id')
    expect(errorDelete).toBeNull()
    expect(borrados).toEqual([])

    const { data: sigueIgual } = await admin.from('auditoria_riesgo_residual_historial').select('motivo').eq('id', fila!.id).single()
    expect(sigueIgual?.motivo).toBe('Original.')

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('un auxiliar no ve ni registra riesgo residual', async () => {
    const auditor = await crearUsuario(admin, 'arr-rbac-auditor')
    const auxiliar = await crearUsuario(admin, 'arr-rbac-aux')
    const tenant = await crearTenant(admin, 'arr-rbac', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id, 'Riesgo RBAC')
    const { data: fila } = await admin
      .from('auditoria_riesgo_residual_historial')
      .insert({ tenant_id: tenant.id, riesgo_id: riesgoId, probabilidad: 3, impacto: 3, motivo: 'Original.', created_by: auditor.id })
      .select('id')
      .single<{ id: string }>()

    const clienteAuxiliar = await clienteComo(env!, auxiliar)
    const { data: visto, error: errorSelect } = await clienteAuxiliar
      .from('auditoria_riesgo_residual_historial')
      .select('id')
      .eq('id', fila!.id)
    expect(errorSelect).toBeNull()
    expect(visto).toEqual([])

    const { error: errorInsert } = await clienteAuxiliar.from('auditoria_riesgo_residual_historial').insert({
      tenant_id: tenant.id,
      riesgo_id: riesgoId,
      probabilidad: 1,
      impacto: 1,
      motivo: 'No debería poder.',
      created_by: auxiliar.id,
    })
    expect(errorInsert).not.toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
    await eliminarUsuario(admin, auxiliar.id)
  }, 30_000)

  it('aísla por tenant', async () => {
    const auditorA = await crearUsuario(admin, 'arr-cross-a')
    const auditorB = await crearUsuario(admin, 'arr-cross-b')
    const tenantA = await crearTenant(admin, 'arr-cross-a', auditorA.id)
    const tenantB = await crearTenant(admin, 'arr-cross-b', auditorB.id)
    await crearMembership(admin, tenantA.id, auditorA.id, 'auditor')
    await crearMembership(admin, tenantB.id, auditorB.id, 'auditor')
    const riesgoIdB = await crearRiesgoFixture(admin, tenantB.id, auditorB.id, 'Riesgo de otro tenant')
    await admin
      .from('auditoria_riesgo_residual_historial')
      .insert({ tenant_id: tenantB.id, riesgo_id: riesgoIdB, probabilidad: 2, impacto: 2, motivo: 'De otro tenant.', created_by: auditorB.id })

    const clienteAuditorA = await clienteComo(env!, auditorA)
    const { data, error } = await clienteAuditorA
      .from('auditoria_riesgo_residual_historial')
      .select('id')
      .eq('riesgo_id', riesgoIdB)
    expect(error).toBeNull()
    expect(data).toEqual([])

    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, auditorA.id)
    await eliminarUsuario(admin, auditorB.id)
  }, 30_000)
})
