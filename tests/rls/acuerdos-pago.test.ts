/**
 * acuerdos_pago — CAR F5 (Docs/Motor de gestion de cartera/
 * CAR_00_Guia_Oficial.md §12.1/§12.3-12.6). Maker-checker igual que
 * acciones_cobranza (20260822280000): agent propone, administrador
 * aprueba la transición a 'vigente', auto-aprobación bloqueada.
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
  console.warn('SALTADO tests/rls/acuerdos-pago: faltan variables de Supabase en .env')
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

d('acuerdos_pago (CAR §12.1/§12.3-12.6)', () => {
  let admin: Cliente
  let agente: UsuarioPrueba
  let administrador: UsuarioPrueba
  let administradorDos: UsuarioPrueba
  let tenant: TenantPrueba
  let inmuebleId: string
  let consecutivoContador = 0

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    agente = await crearUsuario(admin, 'acuerdo-agent')
    administrador = await crearUsuario(admin, 'acuerdo-admin1')
    administradorDos = await crearUsuario(admin, 'acuerdo-admin2')
    tenant = await crearTenant(admin, 'acuerdo', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'agent')
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    await crearMembership(admin, tenant.id, administradorDos.id, 'administrador')

    const tipoInmuebleId = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
    const { data: inmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `ACU-${String(Date.now())}`, tipo_id: tipoInmuebleId })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)
    inmuebleId = inmueble.id
  })

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, administrador.id)
    await eliminarUsuario(admin, administradorDos.id)
  })

  function payloadAcuerdo(overrides: Record<string, unknown> = {}) {
    consecutivoContador += 1
    return {
      tenant_id: tenant.id,
      inmueble_id: inmuebleId,
      consecutivo: `ACU-TEST-${String(consecutivoContador)}`,
      fecha_acuerdo: '2026-08-17',
      fecha_inicio: '2026-09-01',
      fecha_fin: '2026-12-01',
      monto_capital: 800000,
      monto_interes: 100000,
      monto_otros: 0,
      monto_total: 900000,
      numero_cuotas: 3,
      ...overrides,
    }
  }

  it('ACUERDO_ESTADO_INICIAL_INVALIDO: un INSERT no puede nacer ya en vigente', async () => {
    const clienteAgente = await clienteComo(env!, agente)
    const { error } = await clienteAgente.from('acuerdos_pago').insert(payloadAcuerdo({ estado: 'vigente' }))
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/ACUERDO_ESTADO_INICIAL_INVALIDO/)
  })

  it('agent propone un acuerdo en borrador — propuesto_por queda estampado desde auth.uid()', async () => {
    const clienteAgente = await clienteComo(env!, agente)
    const { data, error } = await clienteAgente
      .from('acuerdos_pago')
      .insert(payloadAcuerdo())
      .select('id, estado, propuesto_por, aprobado_por')
      .single()

    expect(error).toBeNull()
    expect(data?.estado).toBe('borrador')
    expect(data?.propuesto_por).toBe(agente.id)
    expect(data?.aprobado_por).toBeNull()
  })

  it('acuerdo_total_coherente: rechaza un total que no cuadra con capital+interes+otros', async () => {
    const clienteAgente = await clienteComo(env!, agente)
    const { error } = await clienteAgente
      .from('acuerdos_pago')
      .insert(payloadAcuerdo({ monto_total: 999999 }))
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/acuerdo_total_coherente/)
  })

  it('acuerdo_condonacion_requiere_soporte: condona_interes=true sin acta_referencia se rechaza', async () => {
    const clienteAgente = await clienteComo(env!, agente)
    const { error } = await clienteAgente
      .from('acuerdos_pago')
      .insert(payloadAcuerdo({ condona_interes: true, monto_condonado: 50000 }))
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/acuerdo_condonacion_requiere_soporte/)
  })

  it('ACUERDO_REQUIERE_ADMINISTRADOR: un agent simple no puede activar el acuerdo', async () => {
    const clienteAgente = await clienteComo(env!, agente)
    const { data: acuerdo } = await clienteAgente
      .from('acuerdos_pago')
      .insert(payloadAcuerdo())
      .select('id')
      .single<{ id: string }>()
    await clienteAgente.from('acuerdos_pago').update({ estado: 'pendiente_aprobacion' }).eq('id', acuerdo!.id)

    const { error } = await clienteAgente.from('acuerdos_pago').update({ estado: 'vigente' }).eq('id', acuerdo!.id)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/ACUERDO_REQUIERE_ADMINISTRADOR/)
  })

  it('ACUERDO_AUTOAPROBACION: un administrador no puede activar un acuerdo que él mismo propuso', async () => {
    const clienteAdministrador = await clienteComo(env!, administrador)
    const { data: acuerdo } = await clienteAdministrador
      .from('acuerdos_pago')
      .insert(payloadAcuerdo())
      .select('id')
      .single<{ id: string }>()
    await clienteAdministrador
      .from('acuerdos_pago')
      .update({ estado: 'pendiente_aprobacion' })
      .eq('id', acuerdo!.id)

    const { error } = await clienteAdministrador
      .from('acuerdos_pago')
      .update({ estado: 'vigente' })
      .eq('id', acuerdo!.id)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/ACUERDO_AUTOAPROBACION/)
  })

  it('control positivo: un administrador distinto sí puede activar, queda registrado quién y cuándo, y solo puede haber un acuerdo vigente por inmueble', async () => {
    const clienteAgente = await clienteComo(env!, agente)
    const { data: acuerdo } = await clienteAgente
      .from('acuerdos_pago')
      .insert(payloadAcuerdo())
      .select('id')
      .single<{ id: string }>()
    await clienteAgente.from('acuerdos_pago').update({ estado: 'pendiente_aprobacion' }).eq('id', acuerdo!.id)

    const clienteAdministradorDos = await clienteComo(env!, administradorDos)
    const { error } = await clienteAdministradorDos
      .from('acuerdos_pago')
      .update({ estado: 'vigente' })
      .eq('id', acuerdo!.id)
    expect(error).toBeNull()

    const { data: filaFinal } = await admin
      .from('acuerdos_pago')
      .select('estado, aprobado_por, aprobado_at')
      .eq('id', acuerdo!.id)
      .single()
    expect(filaFinal?.estado).toBe('vigente')
    expect(filaFinal?.aprobado_por).toBe(administradorDos.id)
    expect(filaFinal?.aprobado_at).not.toBeNull()

    // acuerdos_pago_vigente_unico: un segundo acuerdo del MISMO inmueble no puede activarse a la vez.
    const { data: acuerdoDos } = await clienteAgente
      .from('acuerdos_pago')
      .insert(payloadAcuerdo())
      .select('id')
      .single<{ id: string }>()
    await clienteAgente.from('acuerdos_pago').update({ estado: 'pendiente_aprobacion' }).eq('id', acuerdoDos!.id)
    const { error: errDosVigentes } = await clienteAdministradorDos
      .from('acuerdos_pago')
      .update({ estado: 'vigente' })
      .eq('id', acuerdoDos!.id)
    expect(errDosVigentes).not.toBeNull()
    expect(errDosVigentes?.code).toBe('23505')
  })

  it('acuerdo_pago_cuotas: agent puede crear el calendario de cuotas, con guard de transición propio', async () => {
    const clienteAgente = await clienteComo(env!, agente)
    const { data: acuerdo } = await clienteAgente
      .from('acuerdos_pago')
      .insert(payloadAcuerdo())
      .select('id')
      .single<{ id: string }>()

    const { data: cuota, error } = await clienteAgente
      .from('acuerdo_pago_cuotas')
      .insert({
        tenant_id: tenant.id,
        acuerdo_id: acuerdo!.id,
        numero_cuota: 1,
        fecha_vencimiento: '2026-09-01',
        monto: 300000,
      })
      .select('id, estado')
      .single()
    expect(error).toBeNull()
    expect(cuota?.estado).toBe('pendiente')

    const { error: errPagada } = await clienteAgente
      .from('acuerdo_pago_cuotas')
      .update({ estado: 'pagada', monto_pagado: 300000, fecha_pago: '2026-09-01' })
      .eq('id', cuota!.id)
    expect(errPagada).toBeNull()

    const { error: errReabrir } = await clienteAgente
      .from('acuerdo_pago_cuotas')
      .update({ estado: 'pendiente' })
      .eq('id', cuota!.id)
    expect(errReabrir).not.toBeNull()
    expect(errReabrir?.message).toMatch(/CUOTA_ACUERDO_TRANSICION_INVALIDA/)
  })
})
