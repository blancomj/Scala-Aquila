/**
 * cartera_etapas — CAR F6 (Docs/Motor de gestion de cartera/
 * CAR_00_Guia_Oficial.md §11). Maker-checker sobre UNA fila por inmueble
 * (no un log): agent propone via etapa_propuesta, administrador distinto
 * confirma escribiendo el mismo valor en etapa. Transiciones automáticas
 * (sin aprobación en la matriz §11.3) las puede confirmar cualquier agent
 * directamente, sin pasar por etapa_propuesta.
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
  console.warn('SALTADO tests/rls/cartera-etapas: faltan variables de Supabase en .env')
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

async function crearInmueble(admin: Cliente, tenantId: string, prefijo: string): Promise<string> {
  const tipoInmuebleId = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
  const { data, error } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo: `${prefijo}-${String(Date.now())}`, tipo_id: tipoInmuebleId })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture inmueble: ${error.message}`)
  return data.id
}

d('cartera_etapas (CAR §11)', () => {
  let admin: Cliente
  let agente: UsuarioPrueba
  let administrador: UsuarioPrueba
  let administradorDos: UsuarioPrueba
  let tenant: TenantPrueba

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    agente = await crearUsuario(admin, 'etapa-agent')
    administrador = await crearUsuario(admin, 'etapa-admin1')
    administradorDos = await crearUsuario(admin, 'etapa-admin2')
    tenant = await crearTenant(admin, 'etapa', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'agent')
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    await crearMembership(admin, tenant.id, administradorDos.id, 'administrador')
  })

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, administrador.id)
    await eliminarUsuario(admin, administradorDos.id)
  })

  it('CARTERA_ETAPA_INICIAL_INVALIDA: un INSERT no puede nacer fuera de preventiva', async () => {
    const inmuebleId = await crearInmueble(admin, tenant.id, 'ETI')
    const clienteAgente = await clienteComo(env!, agente)
    const { error } = await clienteAgente
      .from('cartera_etapas')
      .insert({ tenant_id: tenant.id, inmueble_id: inmuebleId, etapa: 'administrativa' })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/CARTERA_ETAPA_INICIAL_INVALIDA/)
  })

  it('agent crea la fila en preventiva', async () => {
    const inmuebleId = await crearInmueble(admin, tenant.id, 'ETI')
    const clienteAgente = await clienteComo(env!, agente)
    const { data, error } = await clienteAgente
      .from('cartera_etapas')
      .insert({ tenant_id: tenant.id, inmueble_id: inmuebleId })
      .select('etapa, etapa_propuesta')
      .single()
    expect(error).toBeNull()
    expect(data?.etapa).toBe('preventiva')
    expect(data?.etapa_propuesta).toBeNull()
  })

  it('CARTERA_ETAPA_TRANSICION_INVALIDA: no puede saltar directo de preventiva a juridica', async () => {
    const inmuebleId = await crearInmueble(admin, tenant.id, 'ETI')
    const clienteAgente = await clienteComo(env!, agente)
    const { data: fila } = await clienteAgente
      .from('cartera_etapas')
      .insert({ tenant_id: tenant.id, inmueble_id: inmuebleId })
      .select('id')
      .single<{ id: string }>()

    const { error } = await clienteAgente
      .from('cartera_etapas')
      .update({ etapa: 'juridica' })
      .eq('id', fila!.id)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/CARTERA_ETAPA_TRANSICION_INVALIDA/)
  })

  it('transición automática (preventiva→administrativa): un agent la confirma directo, sin propuesta', async () => {
    const inmuebleId = await crearInmueble(admin, tenant.id, 'ETI')
    const clienteAgente = await clienteComo(env!, agente)
    const { data: fila } = await clienteAgente
      .from('cartera_etapas')
      .insert({ tenant_id: tenant.id, inmueble_id: inmuebleId })
      .select('id')
      .single<{ id: string }>()

    const { data, error } = await clienteAgente
      .from('cartera_etapas')
      .update({ etapa: 'administrativa' })
      .eq('id', fila!.id)
      .select('etapa, etapa_anterior, aprobado_por')
      .single()
    expect(error).toBeNull()
    expect(data?.etapa).toBe('administrativa')
    expect(data?.etapa_anterior).toBe('preventiva')
    expect(data?.aprobado_por).toBeNull() // automática — no hubo aprobación humana
  })

  it('CARTERA_ETAPA_SIN_PROPUESTA: una transición con aprobación no se puede confirmar sin proponerla antes', async () => {
    const inmuebleId = await crearInmueble(admin, tenant.id, 'ETI')
    const clienteAgente = await clienteComo(env!, agente)
    const { data: fila } = await clienteAgente
      .from('cartera_etapas')
      .insert({ tenant_id: tenant.id, inmueble_id: inmuebleId })
      .select('id')
      .single<{ id: string }>()
    await clienteAgente.from('cartera_etapas').update({ etapa: 'administrativa' }).eq('id', fila!.id)

    const clienteAdministrador = await clienteComo(env!, administrador)
    const { error } = await clienteAdministrador
      .from('cartera_etapas')
      .update({ etapa: 'prejuridica' })
      .eq('id', fila!.id)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/CARTERA_ETAPA_SIN_PROPUESTA/)
  })

  it('PH-C19: propone escalar a prejuridica, un agent simple no puede confirmarla, autoaprobación bloqueada, admin distinto sí puede', async () => {
    const inmuebleId = await crearInmueble(admin, tenant.id, 'ETI')
    const clienteAgente = await clienteComo(env!, agente)
    const { data: fila } = await clienteAgente
      .from('cartera_etapas')
      .insert({ tenant_id: tenant.id, inmueble_id: inmuebleId })
      .select('id')
      .single<{ id: string }>()
    await clienteAgente.from('cartera_etapas').update({ etapa: 'administrativa' }).eq('id', fila!.id)

    const { data: propuesta, error: errorPropuesta } = await clienteAgente
      .from('cartera_etapas')
      .update({ etapa_propuesta: 'prejuridica', motivo_propuesta: 'Acciones administrativas agotadas' })
      .eq('id', fila!.id)
      .select('etapa_propuesta, propuesto_por')
      .single()
    expect(errorPropuesta).toBeNull()
    expect(propuesta?.etapa_propuesta).toBe('prejuridica')
    expect(propuesta?.propuesto_por).toBe(agente.id)

    // Un agent simple (no administrador) no puede confirmar.
    const { error: errorAgenteConfirma } = await clienteAgente
      .from('cartera_etapas')
      .update({ etapa: 'prejuridica' })
      .eq('id', fila!.id)
    expect(errorAgenteConfirma).not.toBeNull()
    expect(errorAgenteConfirma?.message).toMatch(/CARTERA_ETAPA_REQUIERE_ADMINISTRADOR/)

    // administrador distinto confirma correctamente.
    const clienteAdministradorDos = await clienteComo(env!, administradorDos)
    const { data: confirmada, error: errorConfirmar } = await clienteAdministradorDos
      .from('cartera_etapas')
      .update({ etapa: 'prejuridica' })
      .eq('id', fila!.id)
      .select('etapa, etapa_propuesta, aprobado_por, aprobado_at')
      .single()
    expect(errorConfirmar).toBeNull()
    expect(confirmada?.etapa).toBe('prejuridica')
    expect(confirmada?.etapa_propuesta).toBeNull()
    expect(confirmada?.aprobado_por).toBe(administradorDos.id)
    expect(confirmada?.aprobado_at).not.toBeNull()
  })

  it('CARTERA_ETAPA_AUTOAPROBACION: quien propuso no puede confirmar aunque tenga rol administrador', async () => {
    const inmuebleId = await crearInmueble(admin, tenant.id, 'ETI')
    const clienteAdministrador = await clienteComo(env!, administrador)
    const { data: fila } = await clienteAdministrador
      .from('cartera_etapas')
      .insert({ tenant_id: tenant.id, inmueble_id: inmuebleId })
      .select('id')
      .single<{ id: string }>()
    await clienteAdministrador.from('cartera_etapas').update({ etapa: 'administrativa' }).eq('id', fila!.id)
    await clienteAdministrador
      .from('cartera_etapas')
      .update({ etapa_propuesta: 'prejuridica' })
      .eq('id', fila!.id)

    const { error } = await clienteAdministrador
      .from('cartera_etapas')
      .update({ etapa: 'prejuridica' })
      .eq('id', fila!.id)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/CARTERA_ETAPA_AUTOAPROBACION/)
  })

  it('retirar una propuesta pendiente no exige administrador ni deja rastro de aprobación', async () => {
    const inmuebleId = await crearInmueble(admin, tenant.id, 'ETI')
    const clienteAgente = await clienteComo(env!, agente)
    const { data: fila } = await clienteAgente
      .from('cartera_etapas')
      .insert({ tenant_id: tenant.id, inmueble_id: inmuebleId })
      .select('id')
      .single<{ id: string }>()
    await clienteAgente.from('cartera_etapas').update({ etapa: 'administrativa' }).eq('id', fila!.id)
    await clienteAgente.from('cartera_etapas').update({ etapa_propuesta: 'prejuridica' }).eq('id', fila!.id)

    const { data, error } = await clienteAgente
      .from('cartera_etapas')
      .update({ etapa_propuesta: null })
      .eq('id', fila!.id)
      .select('etapa, etapa_propuesta, propuesto_por')
      .single()
    expect(error).toBeNull()
    expect(data?.etapa).toBe('administrativa') // sin cambios en la etapa real
    expect(data?.etapa_propuesta).toBeNull()
    expect(data?.propuesto_por).toBeNull()
  })

  it('CARTERA_ETAPA_CONGELADA: ningún cambio es posible mientras el inmueble tiene un acuerdo de pago vigente', async () => {
    const inmuebleId = await crearInmueble(admin, tenant.id, 'ETI')
    const clienteAgente = await clienteComo(env!, agente)
    const { data: fila } = await clienteAgente
      .from('cartera_etapas')
      .insert({ tenant_id: tenant.id, inmueble_id: inmuebleId })
      .select('id')
      .single<{ id: string }>()

    const { data: acuerdo } = await clienteAgente
      .from('acuerdos_pago')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        consecutivo: `ETI-ACU-${String(Date.now())}`,
        fecha_acuerdo: '2026-08-17',
        fecha_inicio: '2026-09-01',
        fecha_fin: '2026-12-01',
        monto_capital: 500000,
        monto_interes: 0,
        monto_otros: 0,
        monto_total: 500000,
        numero_cuotas: 1,
      })
      .select('id')
      .single<{ id: string }>()
    await clienteAgente.from('acuerdos_pago').update({ estado: 'pendiente_aprobacion' }).eq('id', acuerdo!.id)
    const clienteAdministrador = await clienteComo(env!, administrador)
    await clienteAdministrador.from('acuerdos_pago').update({ estado: 'vigente' }).eq('id', acuerdo!.id)

    const { error } = await clienteAgente
      .from('cartera_etapas')
      .update({ etapa: 'administrativa' })
      .eq('id', fila!.id)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/CARTERA_ETAPA_CONGELADA/)
  })

  it('CARTERA_ETAPA_CONTEXTO_INMUTABLE: no se puede reasignar la fila a otro inmueble', async () => {
    const inmuebleUno = await crearInmueble(admin, tenant.id, 'ETI')
    const inmuebleDos = await crearInmueble(admin, tenant.id, 'ETI')
    const clienteAgente = await clienteComo(env!, agente)
    const { data: fila } = await clienteAgente
      .from('cartera_etapas')
      .insert({ tenant_id: tenant.id, inmueble_id: inmuebleUno })
      .select('id')
      .single<{ id: string }>()

    const { error } = await clienteAgente
      .from('cartera_etapas')
      .update({ inmueble_id: inmuebleDos })
      .eq('id', fila!.id)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/CARTERA_ETAPA_CONTEXTO_INMUTABLE/)
  })

  it('un cliente no puede falsificar aprobado_por/aprobado_at en una transición automática', async () => {
    const inmuebleId = await crearInmueble(admin, tenant.id, 'ETI')
    const clienteAgente = await clienteComo(env!, agente)
    const { data: fila } = await clienteAgente
      .from('cartera_etapas')
      .insert({ tenant_id: tenant.id, inmueble_id: inmuebleId })
      .select('id')
      .single<{ id: string }>()

    const { data, error } = await clienteAgente
      .from('cartera_etapas')
      .update({ etapa: 'administrativa', aprobado_por: administrador.id, aprobado_at: new Date().toISOString() })
      .eq('id', fila!.id)
      .select('aprobado_por, aprobado_at')
      .single()
    expect(error).toBeNull()
    expect(data?.aprobado_por).toBeNull()
    expect(data?.aprobado_at).toBeNull()
  })
})
