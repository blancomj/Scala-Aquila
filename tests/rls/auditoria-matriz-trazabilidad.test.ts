/**
 * Matriz de trazabilidad (PROMPT AUDITORÍA §91) — fn_matriz_trazabilidad()
 * (20260923100000_auditoria_matriz_trazabilidad.sql). Sin tabla nueva: agrega
 * riesgos/controles/hallazgos/acciones/procedimientos+ejecuciones ya
 * existentes. Grano = hallazgo; un control sin hallazgos también aparece
 * (hallazgo_id null) y un hallazgo sin riesgo/control resuelto aparece con
 * riesgo_id null en vez de desaparecer (cadena rota, no oculta).
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
  console.warn('SALTADO tests/rls/auditoria-matriz-trazabilidad: faltan credenciales Supabase en .env')
}

interface FilaMatriz {
  riesgo_id: string | null
  riesgo_nombre: string | null
  control_id: string | null
  hallazgo_id: string | null
  hallazgo_nivel: string | null
  cerrado: boolean | null
  acciones_count: number
  acciones_abiertas: number
}

async function crearRiesgoFixture(admin: Cliente, tenantId: string, creadoPor: string, nombre: string) {
  const { data, error } = await admin
    .from('auditoria_riesgos')
    .insert({ tenant_id: tenantId, nombre, categoria: 'OPERATIVO', probabilidad: 3, impacto: 3, created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture riesgo: ${error.message}`)
  return data.id
}

async function crearControlFixture(admin: Cliente, tenantId: string, riesgoId: string, creadoPor: string, nombre: string) {
  const { data, error } = await admin
    .from('auditoria_controles')
    .insert({ tenant_id: tenantId, riesgo_id: riesgoId, nombre, tipo: 'PREVENTIVO', automatizado: false, manual: true, created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture control: ${error.message}`)
  return data.id
}

async function crearEngagementFixture(admin: Cliente, tenantId: string, creadoPor: string) {
  const { data, error } = await admin
    .from('auditoria_engagements')
    .insert({ tenant_id: tenantId, nombre: 'Engagement matriz', created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture engagement: ${error.message}`)
  return data.id
}

d('fn_matriz_trazabilidad', () => {
  const admin = clienteAdmin(env!)

  it('un control sin hallazgos aparece con hallazgo_id null (cadena sana)', async () => {
    const auditor = await crearUsuario(admin, 'amt-sano')
    const tenant = await crearTenant(admin, 'amt-sano', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id, 'Riesgo sano')
    const controlId = await crearControlFixture(admin, tenant.id, riesgoId, auditor.id, 'Control sano')

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data, error } = await clienteAuditor.rpc('fn_matriz_trazabilidad', { p_tenant_id: tenant.id })
    expect(error).toBeNull()
    const filas = data as FilaMatriz[]
    const fila = filas.find((f) => f.control_id === controlId)
    expect(fila).toBeDefined()
    expect(fila?.riesgo_id).toBe(riesgoId)
    expect(fila?.hallazgo_id).toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('un hallazgo generado por control (solo control_id, sin riesgo_id) resuelve el riesgo vía el control', async () => {
    const auditor = await crearUsuario(admin, 'amt-via-control')
    const tenant = await crearTenant(admin, 'amt-via-control', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id, 'Riesgo vía control')
    const controlId = await crearControlFixture(admin, tenant.id, riesgoId, auditor.id, 'Control con hallazgo')
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)
    const { data: hallazgo, error: errorHallazgo } = await admin
      .from('auditoria_hallazgos')
      .insert({
        tenant_id: tenant.id,
        engagement_id: engagementId,
        proceso: 'Matriz',
        control_id: controlId,
        nivel: 'ALTO',
        estado: 'ABIERTO',
        created_by: auditor.id,
      })
      .select('id')
      .single<{ id: string }>()
    expect(errorHallazgo).toBeNull()

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data } = await clienteAuditor.rpc('fn_matriz_trazabilidad', { p_tenant_id: tenant.id })
    const filas = data as FilaMatriz[]
    const fila = filas.find((f) => f.hallazgo_id === hallazgo!.id)
    expect(fila).toBeDefined()
    expect(fila?.riesgo_id).toBe(riesgoId)
    expect(fila?.hallazgo_nivel).toBe('ALTO')
    expect(fila?.cerrado).toBe(false)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('un hallazgo sin riesgo_id ni control_id aparece con riesgo_id null (cadena incompleta, no se oculta)', async () => {
    const auditor = await crearUsuario(admin, 'amt-huerfano')
    const tenant = await crearTenant(admin, 'amt-huerfano', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)
    const { data: hallazgo } = await admin
      .from('auditoria_hallazgos')
      .insert({
        tenant_id: tenant.id,
        engagement_id: engagementId,
        proceso: 'Cartera',
        nivel: 'MEDIO',
        estado: 'ABIERTO',
        created_by: auditor.id,
      })
      .select('id')
      .single<{ id: string }>()

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data, error } = await clienteAuditor.rpc('fn_matriz_trazabilidad', { p_tenant_id: tenant.id })
    expect(error).toBeNull()
    const filas = data as FilaMatriz[]
    const fila = filas.find((f) => f.hallazgo_id === hallazgo!.id)
    expect(fila).toBeDefined()
    expect(fila?.riesgo_id).toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('cuenta acciones y refleja el cierre del hallazgo', async () => {
    const auditor = await crearUsuario(admin, 'amt-acciones')
    const tenant = await crearTenant(admin, 'amt-acciones', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id, 'Riesgo con acciones')
    const controlId = await crearControlFixture(admin, tenant.id, riesgoId, auditor.id, 'Control con acciones')
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)
    const { data: hallazgo } = await admin
      .from('auditoria_hallazgos')
      .insert({
        tenant_id: tenant.id,
        engagement_id: engagementId,
        proceso: 'Matriz',
        control_id: controlId,
        riesgo_id: riesgoId,
        nivel: 'BAJO',
        estado: 'ABIERTO',
        created_by: auditor.id,
      })
      .select('id')
      .single<{ id: string }>()
    await admin.from('auditoria_acciones').insert([
      { tenant_id: tenant.id, hallazgo_id: hallazgo!.id, accion: 'Corregir A', estado: 'PENDIENTE', created_by: auditor.id },
      { tenant_id: tenant.id, hallazgo_id: hallazgo!.id, accion: 'Corregir B', estado: 'CERRADA', created_by: auditor.id },
    ])

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data } = await clienteAuditor.rpc('fn_matriz_trazabilidad', { p_tenant_id: tenant.id })
    const filas = data as FilaMatriz[]
    const fila = filas.find((f) => f.hallazgo_id === hallazgo!.id)
    expect(fila?.acciones_count).toBe(2)
    expect(fila?.acciones_abiertas).toBe(1)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('aísla por tenant', async () => {
    const auditorA = await crearUsuario(admin, 'amt-cross-a')
    const auditorB = await crearUsuario(admin, 'amt-cross-b')
    const tenantA = await crearTenant(admin, 'amt-cross-a', auditorA.id)
    const tenantB = await crearTenant(admin, 'amt-cross-b', auditorB.id)
    await crearMembership(admin, tenantA.id, auditorA.id, 'auditor')
    await crearMembership(admin, tenantB.id, auditorB.id, 'auditor')
    const riesgoIdB = await crearRiesgoFixture(admin, tenantB.id, auditorB.id, 'Riesgo de otro tenant')
    await crearControlFixture(admin, tenantB.id, riesgoIdB, auditorB.id, 'Control de otro tenant')

    const clienteAuditorA = await clienteComo(env!, auditorA)
    const { data, error } = await clienteAuditorA.rpc('fn_matriz_trazabilidad', { p_tenant_id: tenantB.id })
    expect(error).toBeNull()
    expect(data).toEqual([])

    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, auditorA.id)
    await eliminarUsuario(admin, auditorB.id)
  }, 30_000)
})
