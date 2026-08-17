/**
 * promesas_pago — CAR F5 (Docs/Motor de gestion de cartera/
 * CAR_00_Guia_Oficial.md §12.1-12.2). A diferencia de acciones_cobranza/
 * acuerdos_pago, no lleva maker-checker (CAR §12.1: informal, sin
 * aprobación formal) — cualquier agent la registra y la reevalúa.
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
  console.warn('SALTADO tests/rls/promesas-pago: faltan variables de Supabase en .env')
}

async function listaTipoId(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

d('promesas_pago (CAR §12.1-12.2)', () => {
  let admin: Cliente
  let agente: UsuarioPrueba
  let otroAgente: UsuarioPrueba
  let tenant: TenantPrueba
  let inmuebleId: string

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    agente = await crearUsuario(admin, 'promesa-agent')
    otroAgente = await crearUsuario(admin, 'promesa-agent2')
    tenant = await crearTenant(admin, 'promesa', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'agent')
    await crearMembership(admin, tenant.id, otroAgente.id, 'agent')

    const tipoInmuebleId = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
    const { data: inmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `PROM-${String(Date.now())}`, tipo_id: tipoInmuebleId })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)
    inmuebleId = inmueble.id
  })

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, otroAgente.id)
  })

  it('agent registra una promesa — registrada_por queda estampado desde auth.uid(), no confiado del cliente', async () => {
    const clienteAgente = await clienteComo(env!, agente)
    const { data, error } = await clienteAgente
      .from('promesas_pago')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        fecha_promesa: '2026-08-17',
        monto_prometido: 300000,
        fecha_pago_prometida: '2026-08-25',
        // registrada_por deliberadamente omitido/con otro valor — el trigger debe ignorarlo
      })
      .select('id, registrada_por, estado, cumplida_at')
      .single()

    expect(error).toBeNull()
    expect(data?.registrada_por).toBe(agente.id)
    expect(data?.estado).toBe('pendiente')
    expect(data?.cumplida_at).toBeNull()
  })

  it('PROMESA_TRANSICION_INVALIDA: no se puede saltar de pendiente a cancelada y luego reabrir', async () => {
    const clienteAgente = await clienteComo(env!, agente)
    const { data: promesa } = await clienteAgente
      .from('promesas_pago')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        fecha_promesa: '2026-08-17',
        monto_prometido: 100000,
        fecha_pago_prometida: '2026-08-20',
      })
      .select('id')
      .single<{ id: string }>()

    const { error: errCancelar } = await clienteAgente
      .from('promesas_pago')
      .update({ estado: 'cancelada' })
      .eq('id', promesa!.id)
    expect(errCancelar).toBeNull()

    const { error: errReabrir } = await clienteAgente
      .from('promesas_pago')
      .update({ estado: 'pendiente' })
      .eq('id', promesa!.id)
    expect(errReabrir).not.toBeNull()
    expect(errReabrir?.message).toMatch(/PROMESA_TRANSICION_INVALIDA/)
  })

  it('control positivo: pendiente→cumplida estampa cumplida_at automáticamente', async () => {
    const clienteAgente = await clienteComo(env!, agente)
    const { data: promesa } = await clienteAgente
      .from('promesas_pago')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        fecha_promesa: '2026-08-17',
        monto_prometido: 150000,
        fecha_pago_prometida: '2026-08-22',
      })
      .select('id')
      .single<{ id: string }>()

    const { data: cumplida, error } = await clienteAgente
      .from('promesas_pago')
      .update({ estado: 'cumplida', monto_cumplido: 150000 })
      .eq('id', promesa!.id)
      .select('estado, cumplida_at')
      .single()

    expect(error).toBeNull()
    expect(cumplida?.estado).toBe('cumplida')
    expect(cumplida?.cumplida_at).not.toBeNull()
  })
})
