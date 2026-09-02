/**
 * Root cause (PROMPT AUDITORÍA §62) — auditoria_hallazgos.causa_raiz
 * (20260926100000_auditoria_causa_raiz.sql). Clasificación estructurada,
 * distinta de `causa` (texto libre), y nunca obligatoria — "no exigir
 * análisis de causa raíz profundo para observaciones menores".
 */
import { describe, expect, it } from 'vitest'
import { clienteAdmin, clienteComo, crearMembership, crearTenant, crearUsuario, eliminarTenant, eliminarUsuario, leerEntorno } from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/auditoria-causa-raiz: faltan credenciales Supabase en .env')
}

d('auditoria_hallazgos.causa_raiz', () => {
  const admin = clienteAdmin(env!)

  it('acepta cualquiera de las 9 categorías del §62', async () => {
    const auditor = await crearUsuario(admin, 'acr-categorias')
    const tenant = await crearTenant(admin, 'acr-categorias', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const { data: engagement } = await admin
      .from('auditoria_engagements')
      .insert({ tenant_id: tenant.id, nombre: 'Engagement causa raíz', created_by: auditor.id })
      .select('id')
      .single<{ id: string }>()

    const clienteAuditor = await clienteComo(env!, auditor)
    for (const categoria of ['PERSONA', 'PROCESO', 'TECNOLOGIA', 'DATOS', 'POLITICA', 'CONTROL', 'NORMATIVA', 'INTEGRACION', 'CONFIGURACION']) {
      const { error } = await clienteAuditor.from('auditoria_hallazgos').insert({
        tenant_id: tenant.id,
        engagement_id: engagement!.id,
        proceso: 'Cartera',
        nivel: 'MEDIO',
        estado: 'ABIERTO',
        causa_raiz: categoria,
        created_by: auditor.id,
      })
      expect(error, `categoría ${categoria} debería ser válida`).toBeNull()
    }

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('rechaza una categoría fuera de la lista cerrada', async () => {
    const auditor = await crearUsuario(admin, 'acr-invalida')
    const tenant = await crearTenant(admin, 'acr-invalida', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const { data: engagement } = await admin
      .from('auditoria_engagements')
      .insert({ tenant_id: tenant.id, nombre: 'Engagement inválido', created_by: auditor.id })
      .select('id')
      .single<{ id: string }>()

    const clienteAuditor = await clienteComo(env!, auditor)
    const { error } = await clienteAuditor.from('auditoria_hallazgos').insert({
      tenant_id: tenant.id,
      engagement_id: engagement!.id,
      proceso: 'Cartera',
      nivel: 'MEDIO',
      estado: 'ABIERTO',
      causa_raiz: 'OTRA_COSA',
      created_by: auditor.id,
    } as never)
    expect(error).not.toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('nunca es obligatoria: un hallazgo se crea sin causa_raiz', async () => {
    const auditor = await crearUsuario(admin, 'acr-opcional')
    const tenant = await crearTenant(admin, 'acr-opcional', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const { data: engagement } = await admin
      .from('auditoria_engagements')
      .insert({ tenant_id: tenant.id, nombre: 'Engagement opcional', created_by: auditor.id })
      .select('id')
      .single<{ id: string }>()

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data, error } = await clienteAuditor
      .from('auditoria_hallazgos')
      .insert({
        tenant_id: tenant.id,
        engagement_id: engagement!.id,
        proceso: 'Observación menor',
        nivel: 'OBSERVACION',
        estado: 'ABIERTO',
        created_by: auditor.id,
      })
      .select('causa_raiz')
      .single()
    expect(error).toBeNull()
    expect(data?.causa_raiz).toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)
})
