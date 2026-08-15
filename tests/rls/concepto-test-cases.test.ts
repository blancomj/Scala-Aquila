/**
 * concepto_test_cases — 20260819100000, casos de prueba de AEL-004 Fase 6.
 * A diferencia de concepto_versiones (append-only), estos son fixtures de
 * prueba con CRUD completo para agent. Cubre: aislamiento por tenant, CRUD
 * agent, auditor no puede escribir, lectura cruzada bloqueada.
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
  console.warn('SALTADO tests/rls/concepto-test-cases: faltan variables de Supabase en .env')
}

d('concepto_test_cases: aislamiento y CRUD', () => {
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
    agenteA = await crearUsuario(admin, 'tc-agent-a')
    auditorA = await crearUsuario(admin, 'tc-auditor-a')
    agenteB = await crearUsuario(admin, 'tc-agent-b')
    tenantA = await crearTenant(admin, 'tc-a', agenteA.id)
    tenantB = await crearTenant(admin, 'tc-b', agenteB.id)
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
        codigo: `TC-${String(Date.now())}`,
        nombre: 'Concepto de prueba',
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

  type FilaCaso = Database['public']['Tables']['concepto_test_cases']['Insert']

  function filaCaso(overrides: Partial<FilaCaso> = {}): FilaCaso {
    return {
      tenant_id: tenantA.id,
      concepto_id: conceptoAId,
      nombre: 'Caso base',
      entradas: [
        { contrato: 'PARAMETER', campo: 'PRESUPUESTO_ANUAL', tipo: 'MONEY', valor: '1000' },
      ],
      tipo_esperado: 'MONEY',
      resultado_esperado: { tipo: 'MONEY', valor: '1000' },
      created_by: agenteA.id,
      ...overrides,
    }
  }

  let casoId: string

  it('agent puede crear un caso de prueba', async () => {
    const { data, error } = await clienteAgentA
      .from('concepto_test_cases')
      .insert(filaCaso())
      .select('id')
      .single<{ id: string }>()
    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
    casoId = data!.id
  })

  it('control positivo: agent A y auditor A ven el caso', async () => {
    const { data: comoAgent, error: errAgent } = await clienteAgentA
      .from('concepto_test_cases')
      .select('id')
      .eq('id', casoId)
    expect(errAgent).toBeNull()
    expect(comoAgent).toHaveLength(1)

    const { data: comoAuditor, error: errAuditor } = await clienteAuditorA
      .from('concepto_test_cases')
      .select('id')
      .eq('id', casoId)
    expect(errAuditor).toBeNull()
    expect(comoAuditor).toHaveLength(1)
  })

  it('SEC-11: agent B no ve el caso de A', async () => {
    const { data, error } = await clienteAgentB
      .from('concepto_test_cases')
      .select('id')
      .eq('id', casoId)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('un auditor no puede insertar ni actualizar casos de prueba', async () => {
    const { error: errInsert } = await clienteAuditorA
      .from('concepto_test_cases')
      .insert(filaCaso({ created_by: auditorA.id }))
    expect(errInsert).not.toBeNull()

    const { error: errUpdate, data } = await clienteAuditorA
      .from('concepto_test_cases')
      .update({ nombre: 'otro' })
      .eq('id', casoId)
      .select()
    expect(errUpdate).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('agent puede actualizar y luego borrar su propio caso', async () => {
    const { data: actualizado, error: errUpdate } = await clienteAgentA
      .from('concepto_test_cases')
      .update({ nombre: 'Caso actualizado' })
      .eq('id', casoId)
      .select('nombre')
      .single()
    expect(errUpdate).toBeNull()
    expect(actualizado?.nombre).toBe('Caso actualizado')

    const { error: errDelete } = await clienteAgentA
      .from('concepto_test_cases')
      .delete()
      .eq('id', casoId)
    expect(errDelete).toBeNull()

    const { data: trasBorrar } = await admin
      .from('concepto_test_cases')
      .select('id')
      .eq('id', casoId)
    expect(trasBorrar).toHaveLength(0)
  })
})
