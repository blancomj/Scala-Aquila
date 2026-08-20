/**
 * novedades — 20260816110000, solicitud/evento de negocio con aprobación
 * (AD-29/AD-30). Cubre: aislamiento multitenant, INSERT solo agent (con
 * estado='pendiente'), sin política UPDATE para authenticated, y el guard
 * de transición (solo pendiente→aprobada/rechazada).
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
  console.warn('SALTADO tests/rls/novedades: faltan variables de Supabase en .env')
}

async function tipoApartamentoId(admin: Cliente): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'TIPO_INMUEBLE')
    .eq('codigo', 'apartamento')
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture tipo apartamento: ${error.message}`)
  return data.id
}

d('novedades: aislamiento, escritura y guard de transición', () => {
  const admin = clienteAdmin(env!)
  let agenteA: UsuarioPrueba
  let auditorA: UsuarioPrueba
  let agenteB: UsuarioPrueba
  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let clienteAgentA: Cliente
  let clienteAuditorA: Cliente
  let clienteAgentB: Cliente
  let inmuebleAId: string
  let novedadAId: string

  beforeAll(async () => {
    agenteA = await crearUsuario(admin, 'nov-agent-a')
    auditorA = await crearUsuario(admin, 'nov-auditor-a')
    agenteB = await crearUsuario(admin, 'nov-agent-b')
    tenantA = await crearTenant(admin, 'nov-a', agenteA.id)
    tenantB = await crearTenant(admin, 'nov-b', agenteB.id)
    await crearMembership(admin, tenantA.id, agenteA.id, 'auxiliar')
    await crearMembership(admin, tenantA.id, auditorA.id, 'auditor')
    await crearMembership(admin, tenantB.id, agenteB.id, 'auxiliar')

    clienteAgentA = await clienteComo(env!, agenteA)
    clienteAuditorA = await clienteComo(env!, auditorA)
    clienteAgentB = await clienteComo(env!, agenteB)

    const tipoId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantA.id, codigo: `NOV-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)
    inmuebleAId = inmueble.id

    const { data: novedad, error: errNovedad } = await admin
      .from('novedades')
      .insert({
        tenant_id: tenantA.id,
        inmueble_id: inmuebleAId,
        tipo: 'CHARGE',
        monto: 50_000,
        descripcion: 'Daño en zona común',
        fecha_efectiva: '2027-01-10',
        created_by: agenteA.id,
      })
      .select('id')
      .single<{ id: string }>()
    if (errNovedad) throw new Error(`fixture novedad: ${errNovedad.message}`)
    novedadAId = novedad.id
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, agenteA.id)
    await eliminarUsuario(admin, auditorA.id)
    await eliminarUsuario(admin, agenteB.id)
  }, 30_000)

  it('control positivo: agent A ve su propia novedad', async () => {
    const { data, error } = await clienteAgentA.from('novedades').select('id').eq('id', novedadAId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('SEC-11: agent B no ve la novedad de A', async () => {
    const { data, error } = await clienteAgentB.from('novedades').select('id').eq('id', novedadAId)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('un auditor no puede crear novedades', async () => {
    const { error } = await clienteAuditorA.from('novedades').insert({
      tenant_id: tenantA.id,
      inmueble_id: inmuebleAId,
      tipo: 'CHARGE',
      monto: 1000,
      descripcion: 'x',
      fecha_efectiva: '2027-01-10',
      created_by: auditorA.id,
    })
    expect(error).not.toBeNull()
  })

  it('un agent no puede insertar una novedad ya aprobada (estado != pendiente)', async () => {
    const { error } = await clienteAgentA.from('novedades').insert({
      tenant_id: tenantA.id,
      inmueble_id: inmuebleAId,
      tipo: 'CHARGE',
      monto: 1000,
      descripcion: 'x',
      fecha_efectiva: '2027-01-10',
      estado: 'aprobada',
      created_by: agenteA.id,
    })
    expect(error).not.toBeNull()
  })

  it('escritura exclusiva de service_role para transiciones: ni agent ni auditor pueden hacer UPDATE (0 filas afectadas)', async () => {
    // Sin política UPDATE para `authenticated`: RLS no lanza error, deja la
    // fila fuera de la vista actualizable — mismo patrón que SEC-03
    // (tenant-isolation.test.ts, "0 filas afectadas").
    const { data: dataAgent, error: errAgent } = await clienteAgentA
      .from('novedades')
      .update({ estado: 'aprobada' })
      .eq('id', novedadAId)
      .select()
    expect(errAgent).toBeNull()
    expect(dataAgent).toHaveLength(0)

    const { data: dataAuditor, error: errAuditor } = await clienteAuditorA
      .from('novedades')
      .update({ estado: 'aprobada' })
      .eq('id', novedadAId)
      .select()
    expect(errAuditor).toBeNull()
    expect(dataAuditor).toHaveLength(0)

    const { data: sigue, error: errSigue } = await admin
      .from('novedades')
      .select('estado')
      .eq('id', novedadAId)
      .single()
    expect(errSigue).toBeNull()
    expect(sigue?.estado).toBe('pendiente')
  })

  it('guard_novedad_transicion: rechaza transiciones que no sean pendiente→aprobada/rechazada', async () => {
    const { data: aprobada, error: errAprobar } = await admin
      .from('novedades')
      .update({ estado: 'aprobada' })
      .eq('id', novedadAId)
      .select('id')
      .single()
    expect(errAprobar).toBeNull()
    expect(aprobada?.id).toBe(novedadAId)

    const { error: errVolver } = await admin
      .from('novedades')
      .update({ estado: 'pendiente' })
      .eq('id', novedadAId)
    expect(errVolver?.message).toMatch(/INVALID_TRANSITION/)

    const { error: errRechazarYaAprobada } = await admin
      .from('novedades')
      .update({ estado: 'rechazada' })
      .eq('id', novedadAId)
    expect(errRechazarYaAprobada?.message).toMatch(/INVALID_TRANSITION/)
  })
})
