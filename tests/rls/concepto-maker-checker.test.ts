/**
 * conceptos — maker-checker de AEL-004 Fase 4 (20260818100000/100100).
 * Cubre: borrador→en_revision asigna enviado_a_revision_por en el servidor;
 * self-approval bloqueado; un agent distinto sí puede aprobar; rechazo
 * (en_revision→borrador); inmutabilidad de contenido fuera de borrador;
 * transición inválida rechazada.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
  console.warn('SALTADO tests/rls/concepto-maker-checker: faltan variables de Supabase en .env')
}

d('conceptos: maker-checker (en_revision, self-approval, inmutabilidad)', () => {
  const admin = clienteAdmin(env!)
  let agenteA: UsuarioPrueba
  let agenteB: UsuarioPrueba
  let tenantA: TenantPrueba
  let clienteAgentA: Cliente
  let clienteAgentB: Cliente

  beforeAll(async () => {
    agenteA = await crearUsuario(admin, 'mc-agent-a')
    agenteB = await crearUsuario(admin, 'mc-agent-b')
    tenantA = await crearTenant(admin, 'mc-a', agenteA.id)
    await crearMembership(admin, tenantA.id, agenteA.id, 'auxiliar')
    await crearMembership(admin, tenantA.id, agenteB.id, 'auxiliar')

    clienteAgentA = await clienteComo(env!, agenteA)
    clienteAgentB = await clienteComo(env!, agenteB)
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenantA.id)
    await eliminarUsuario(admin, agenteA.id)
    await eliminarUsuario(admin, agenteB.id)
  }, 30_000)

  async function crearConceptoBorrador(): Promise<string> {
    const { data, error } = await clienteAgentA
      .from('conceptos')
      .insert({
        tenant_id: tenantA.id,
        codigo: `MC-${String(Date.now())}-${String(Math.random()).slice(2, 6)}`,
        nombre: 'Concepto de prueba',
        modo_calculo: 'distribucion',
        modo_valor: 'formulado',
        tipo_recurrencia: 'recurrente',
        periodicidad: 'mensual',
        alcance: 'todos',
        fecha_inicio_anio: 2000,
        fecha_inicio_mes: 1,
        formula_ael: 'REGLA X\nRETORNAR 1',
        prioridad: 100,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture concepto: ${error.message}`)
    return data.id
  }

  it('borrador→en_revision asigna enviado_a_revision_por/at en el servidor', async () => {
    const id = await crearConceptoBorrador()
    const { data, error } = await clienteAgentA
      .from('conceptos')
      .update({ estado: 'en_revision' })
      .eq('id', id)
      .select('estado, enviado_a_revision_por, enviado_a_revision_at')
      .single()
    expect(error).toBeNull()
    expect(data?.estado).toBe('en_revision')
    expect(data?.enviado_a_revision_por).toBe(agenteA.id)
    expect(data?.enviado_a_revision_at).not.toBeNull()
  })

  it('SELF_APPROVAL: quien envió a revisión no puede aprobar su propia solicitud', async () => {
    const id = await crearConceptoBorrador()
    await clienteAgentA.from('conceptos').update({ estado: 'en_revision' }).eq('id', id)

    const { error } = await clienteAgentA
      .from('conceptos')
      .update({ estado: 'activo' })
      .eq('id', id)
    expect(error?.message).toMatch(/SELF_APPROVAL/)
  })

  it('control positivo: un agent distinto sí puede aprobar (en_revision→activo)', async () => {
    const id = await crearConceptoBorrador()
    await clienteAgentA.from('conceptos').update({ estado: 'en_revision' }).eq('id', id)

    const { data, error } = await clienteAgentB
      .from('conceptos')
      .update({ estado: 'activo' })
      .eq('id', id)
      .select('estado, aprobado_por, aprobado_at')
      .single()
    expect(error).toBeNull()
    expect(data?.estado).toBe('activo')
    expect(data?.aprobado_por).toBe(agenteB.id)
    expect(data?.aprobado_at).not.toBeNull()
  })

  it('rechazo: en_revision→borrador con motivo, sin restricción de identidad', async () => {
    const id = await crearConceptoBorrador()
    await clienteAgentA.from('conceptos').update({ estado: 'en_revision' }).eq('id', id)

    const { data, error } = await clienteAgentA
      .from('conceptos')
      .update({ estado: 'borrador', rechazado_motivo: 'falta redondeo' })
      .eq('id', id)
      .select('estado, rechazado_motivo')
      .single()
    expect(error).toBeNull()
    expect(data?.estado).toBe('borrador')
    expect(data?.rechazado_motivo).toBe('falta redondeo')
  })

  it('CONCEPTO_INMUTABLE: no se puede editar la fórmula fuera de borrador', async () => {
    const id = await crearConceptoBorrador()
    await clienteAgentA.from('conceptos').update({ estado: 'en_revision' }).eq('id', id)

    const { error } = await clienteAgentA
      .from('conceptos')
      .update({ formula_ael: 'REGLA X\nRETORNAR 2' })
      .eq('id', id)
    expect(error?.message).toMatch(/CONCEPTO_INMUTABLE/)
  })

  it('INVALID_TRANSITION: activo no puede pasar directo a en_revision', async () => {
    const id = await crearConceptoBorrador()
    await clienteAgentA.from('conceptos').update({ estado: 'en_revision' }).eq('id', id)
    await clienteAgentB.from('conceptos').update({ estado: 'activo' }).eq('id', id)

    const { error } = await clienteAgentA
      .from('conceptos')
      .update({ estado: 'en_revision' })
      .eq('id', id)
    expect(error?.message).toMatch(/INVALID_TRANSITION/)
  })
})
