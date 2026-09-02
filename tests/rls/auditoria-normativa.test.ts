/**
 * Normativa (PROMPT AUDITORÍA §65) — auditoria_normativa
 * (20260921100000_auditoria_normativa.sql). Referencia fundamento_normativo
 * por FK ("la matriz normativa de Fase 18 de contabilidad") pero NO depende
 * de fundamento_normativo.fecha_vigencia (esa columna está vacía para el
 * catálogo de plataforma real — ver comentario en la migración): `vigencia`
 * es propia de esta tabla y NOT NULL, lo que por tipo (`date`) ya descarta
 * documentar contra "norma vigente" sin especificar versión.
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
  console.warn('SALTADO tests/rls/auditoria-normativa: faltan credenciales Supabase en .env')
}

async function crearFundamentoFixture(admin: Cliente, tenantId: string, norma: string) {
  const { data, error } = await admin
    .from('fundamento_normativo')
    .insert({ tenant_id: tenantId, tipo: 'reglamento_ph', norma, articulo: '5' })
    .select('id')
    .single<{ id: number }>()
  if (error) throw new Error(`fixture fundamento: ${error.message}`)
  return data.id
}

async function crearEngagementCumplimientoFixture(admin: Cliente, tenantId: string, creadoPor: string) {
  const { data, error } = await admin
    .from('auditoria_engagements')
    .insert({ tenant_id: tenantId, nombre: 'Auditoría de cumplimiento', tipo: 'CUMPLIMIENTO', created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture engagement: ${error.message}`)
  return data.id
}

d('auditoria_normativa', () => {
  const admin = clienteAdmin(env!)

  it('crea un ítem referenciando el catálogo aunque fundamento_normativo.fecha_vigencia esté vacía (vigencia es propia de esta tabla)', async () => {
    const auditor = await crearUsuario(admin, 'anorm-auditor')
    const tenant = await crearTenant(admin, 'anorm', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')

    const fundamentoId = await crearFundamentoFixture(admin, tenant.id, 'Reglamento interno de propiedad horizontal')
    const { data: fundamento } = await admin.from('fundamento_normativo').select('fecha_vigencia').eq('id', fundamentoId).single()
    expect(fundamento?.fecha_vigencia).toBeNull()

    const engagementId = await crearEngagementCumplimientoFixture(admin, tenant.id, auditor.id)

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data, error } = await clienteAuditor
      .from('auditoria_normativa')
      .insert({
        tenant_id: tenant.id,
        engagement_id: engagementId,
        fundamento_normativo_id: fundamentoId,
        vigencia: '2026-01-15',
        criterio: 'El reglamento debe estar protocolizado ante notaría.',
        created_by: auditor.id,
      })
      .select('id, resultado, vigencia')
      .single()
    expect(error).toBeNull()
    expect(data?.resultado).toBe('PENDIENTE')
    expect(data?.vigencia).toBe('2026-01-15')

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('vigencia es obligatoria: el insert falla sin ella', async () => {
    const auditor = await crearUsuario(admin, 'anorm-sinvig')
    const tenant = await crearTenant(admin, 'anorm-sinvig', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const fundamentoId = await crearFundamentoFixture(admin, tenant.id, 'Ley 675 de 2001')
    const engagementId = await crearEngagementCumplimientoFixture(admin, tenant.id, auditor.id)

    const clienteAuditor = await clienteComo(env!, auditor)
    const { error } = await clienteAuditor.from('auditoria_normativa').insert({
      tenant_id: tenant.id,
      engagement_id: engagementId,
      fundamento_normativo_id: fundamentoId,
      criterio: 'Sin vigencia declarada.',
      created_by: auditor.id,
    } as never)
    expect(error).not.toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('auditor actualiza el resultado; solo administrador puede eliminar', async () => {
    const auditor = await crearUsuario(admin, 'anorm-resultado')
    const adminUsuario = await crearUsuario(admin, 'anorm-admin')
    const tenant = await crearTenant(admin, 'anorm-res', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    await crearMembership(admin, tenant.id, adminUsuario.id, 'administrador')
    const fundamentoId = await crearFundamentoFixture(admin, tenant.id, 'Decisión de asamblea 2026')
    const engagementId = await crearEngagementCumplimientoFixture(admin, tenant.id, auditor.id)

    const { data: item } = await admin
      .from('auditoria_normativa')
      .insert({
        tenant_id: tenant.id,
        engagement_id: engagementId,
        fundamento_normativo_id: fundamentoId,
        vigencia: '2026-02-01',
        criterio: 'Quórum documentado.',
        created_by: auditor.id,
      })
      .select('id')
      .single<{ id: string }>()

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data: actualizado, error: errorUpdate } = await clienteAuditor
      .from('auditoria_normativa')
      .update({ resultado: 'CUMPLE' })
      .eq('id', item!.id)
      .select('resultado')
      .single()
    expect(errorUpdate).toBeNull()
    expect(actualizado?.resultado).toBe('CUMPLE')

    const { error: errorDeleteAuditor } = await clienteAuditor.from('auditoria_normativa').delete().eq('id', item!.id)
    expect(errorDeleteAuditor).toBeNull()
    const { data: sigueExistiendo } = await admin.from('auditoria_normativa').select('id').eq('id', item!.id)
    expect(sigueExistiendo).toHaveLength(1)

    const clienteAdministrador = await clienteComo(env!, adminUsuario)
    const { error: errorDeleteAdmin } = await clienteAdministrador.from('auditoria_normativa').delete().eq('id', item!.id)
    expect(errorDeleteAdmin).toBeNull()
    const { data: yaNoExiste } = await admin.from('auditoria_normativa').select('id').eq('id', item!.id)
    expect(yaNoExiste).toEqual([])

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
    await eliminarUsuario(admin, adminUsuario.id)
  }, 30_000)

  it('un rol sin auditor/administrador no ve ni crea normativa', async () => {
    const auditor = await crearUsuario(admin, 'anorm-rbac-auditor')
    const auxiliar = await crearUsuario(admin, 'anorm-rbac-aux')
    const tenant = await crearTenant(admin, 'anorm-rbac', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    const fundamentoId = await crearFundamentoFixture(admin, tenant.id, 'Circular interna')
    const engagementId = await crearEngagementCumplimientoFixture(admin, tenant.id, auditor.id)

    const { data: item } = await admin
      .from('auditoria_normativa')
      .insert({
        tenant_id: tenant.id,
        engagement_id: engagementId,
        fundamento_normativo_id: fundamentoId,
        vigencia: '2026-03-01',
        criterio: 'Prueba RBAC.',
        created_by: auditor.id,
      })
      .select('id')
      .single<{ id: string }>()

    const clienteAuxiliar = await clienteComo(env!, auxiliar)
    const { data: visto, error: errorSelect } = await clienteAuxiliar.from('auditoria_normativa').select('id').eq('id', item!.id)
    expect(errorSelect).toBeNull()
    expect(visto).toEqual([])

    const { error: errorInsert } = await clienteAuxiliar.from('auditoria_normativa').insert({
      tenant_id: tenant.id,
      engagement_id: engagementId,
      fundamento_normativo_id: fundamentoId,
      vigencia: '2026-03-02',
      criterio: 'No debería poder.',
      created_by: auxiliar.id,
    })
    expect(errorInsert).not.toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
    await eliminarUsuario(admin, auxiliar.id)
  }, 30_000)

  it('aísla por tenant', async () => {
    const auditorA = await crearUsuario(admin, 'anorm-cross-a')
    const auditorB = await crearUsuario(admin, 'anorm-cross-b')
    const tenantA = await crearTenant(admin, 'anorm-cross-a', auditorA.id)
    const tenantB = await crearTenant(admin, 'anorm-cross-b', auditorB.id)
    await crearMembership(admin, tenantA.id, auditorA.id, 'auditor')
    await crearMembership(admin, tenantB.id, auditorB.id, 'auditor')
    const fundamentoIdB = await crearFundamentoFixture(admin, tenantB.id, 'Norma de otro tenant')
    const engagementIdB = await crearEngagementCumplimientoFixture(admin, tenantB.id, auditorB.id)
    const { data: itemB } = await admin
      .from('auditoria_normativa')
      .insert({
        tenant_id: tenantB.id,
        engagement_id: engagementIdB,
        fundamento_normativo_id: fundamentoIdB,
        vigencia: '2026-04-01',
        criterio: 'De otro tenant.',
        created_by: auditorB.id,
      })
      .select('id')
      .single<{ id: string }>()

    const clienteAuditorA = await clienteComo(env!, auditorA)
    const { data, error } = await clienteAuditorA.from('auditoria_normativa').select('id').eq('id', itemB!.id)
    expect(error).toBeNull()
    expect(data).toEqual([])

    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, auditorA.id)
    await eliminarUsuario(admin, auditorB.id)
  }, 30_000)
})
