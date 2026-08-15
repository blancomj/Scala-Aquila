/**
 * concepto_versiones — 20260817100000, historial append-only de AEL-004
 * Fase 3. Cubre: aislamiento multitenant, auto-numeración de versión en el
 * servidor (asignar_version_concepto), INSERT solo agent, y append-only
 * (ni admin puede editar/borrar una versión ya escrita).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '@aquila/shared'
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
  type TenantPrueba,
  type UsuarioPrueba,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/concepto-versiones: faltan variables de Supabase en .env')
}

d('concepto_versiones: aislamiento, auto-versión y append-only', () => {
  const admin = clienteAdmin(env!)
  let agenteA: UsuarioPrueba
  let auditorA: UsuarioPrueba
  let agenteB: UsuarioPrueba
  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let clienteAgentA: Cliente
  let clienteAuditorA: Cliente
  let clienteAgentB: Cliente
  let conceptoAId: string

  beforeAll(async () => {
    agenteA = await crearUsuario(admin, 'cv-agent-a')
    auditorA = await crearUsuario(admin, 'cv-auditor-a')
    agenteB = await crearUsuario(admin, 'cv-agent-b')
    tenantA = await crearTenant(admin, 'cv-a', agenteA.id)
    tenantB = await crearTenant(admin, 'cv-b', agenteB.id)
    await crearMembership(admin, tenantA.id, agenteA.id, 'agent')
    await crearMembership(admin, tenantA.id, auditorA.id, 'auditor')
    await crearMembership(admin, tenantB.id, agenteB.id, 'agent')

    clienteAgentA = await clienteComo(env!, agenteA)
    clienteAuditorA = await clienteComo(env!, auditorA)
    clienteAgentB = await clienteComo(env!, agenteB)

    const { data: concepto, error: errConcepto } = await admin
      .from('conceptos')
      .insert({
        tenant_id: tenantA.id,
        codigo: `CV-${String(Date.now())}`,
        nombre: 'Cuota de prueba',
        tipo_base: 'coeficiente',
        modo_calculo: 'distribucion',
        prioridad: 100,
      })
      .select('id')
      .single<{ id: string }>()
    if (errConcepto) throw new Error(`fixture concepto: ${errConcepto.message}`)
    conceptoAId = concepto.id
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, agenteA.id)
    await eliminarUsuario(admin, auditorA.id)
    await eliminarUsuario(admin, agenteB.id)
  }, 30_000)

  type FilaVersion = Database['public']['Tables']['concepto_versiones']['Insert']

  function filaVersion(overrides: Partial<FilaVersion> = {}): FilaVersion {
    return {
      tenant_id: tenantA.id,
      concepto_id: conceptoAId,
      nombre: 'Cuota de prueba',
      tipo_base: 'coeficiente',
      modo_calculo: 'distribucion',
      formula_ael: 'REGLA X\nRETORNAR 1',
      prioridad: 100,
      estado_concepto: 'borrador',
      hash: 'test-hash',
      created_by: agenteA.id,
      ...overrides,
    }
  }

  it('asignar_version_concepto: dos inserts consecutivos dan version 1 y 2, sin que el cliente la envíe', async () => {
    const { data: v1, error: err1 } = await clienteAgentA
      .from('concepto_versiones')
      .insert(filaVersion())
      .select('version')
      .single()
    expect(err1).toBeNull()
    expect(v1?.version).toBe(1)

    const { data: v2, error: err2 } = await clienteAgentA
      .from('concepto_versiones')
      .insert(filaVersion({ formula_ael: 'REGLA X\nRETORNAR 2' }))
      .select('version')
      .single()
    expect(err2).toBeNull()
    expect(v2?.version).toBe(2)
  })

  it('control positivo: agent A ve las versiones de su propio concepto', async () => {
    const { data, error } = await clienteAgentA
      .from('concepto_versiones')
      .select('id')
      .eq('concepto_id', conceptoAId)
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThanOrEqual(2)
  })

  it('SEC-11: agent B no ve las versiones del concepto de A', async () => {
    const { data, error } = await clienteAgentB
      .from('concepto_versiones')
      .select('id')
      .eq('concepto_id', conceptoAId)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('un auditor no puede insertar versiones', async () => {
    const { error } = await clienteAuditorA
      .from('concepto_versiones')
      .insert(filaVersion({ created_by: auditorA.id }))
    expect(error).not.toBeNull()
  })

  it('append-only: ni agent ni admin (service_role) pueden editar o borrar una versión', async () => {
    const { data: fila, error: errFila } = await admin
      .from('concepto_versiones')
      .select('id')
      .eq('concepto_id', conceptoAId)
      .eq('version', 1)
      .single<{ id: string }>()
    expect(errFila).toBeNull()

    // Sin política UPDATE para `authenticated`: RLS filtra la fila antes de
    // que el trigger append-only llegue a evaluarse — 0 filas afectadas,
    // sin error (mismo patrón que SEC-03, tests/rls/tenant-isolation.test.ts).
    const { data: dataUpdateAgent, error: errUpdateAgent } = await clienteAgentA
      .from('concepto_versiones')
      .update({ nombre: 'otro' })
      .eq('id', fila!.id)
      .select()
    expect(errUpdateAgent).toBeNull()
    expect(dataUpdateAgent).toHaveLength(0)

    const { error: errUpdateAdmin } = await admin
      .from('concepto_versiones')
      .update({ nombre: 'otro' })
      .eq('id', fila!.id)
    expect(errUpdateAdmin?.message).toMatch(/APPEND_ONLY/)

    const { error: errDeleteAdmin } = await admin
      .from('concepto_versiones')
      .delete()
      .eq('id', fila!.id)
    expect(errDeleteAdmin?.message).toMatch(/APPEND_ONLY/)
  })
})
