/**
 * fn_activar_pasarela / fn_cambiar_modo_pasarela — 20260904100000.
 *
 * Cubre el invariante "exactamente una pasarela activa por tenant" (que un
 * UPDATE suelto desde el cliente violaría contra el índice único parcial), y
 * el guard de que no se active en producción una configuración cuyas
 * credenciales nunca se probaron.
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
  console.warn('SALTADO tests/rls/pasarela-activacion: faltan variables de Supabase en .env')
}

d('activación de pasarela', () => {
  let admin: Cliente
  let tenant: TenantPrueba
  let agente: UsuarioPrueba
  let auditor: UsuarioPrueba
  let cliente: Cliente
  let configWompi: string
  let configPayu: string

  async function crearConfig(proveedor: 'wompi' | 'payu' | 'bold'): Promise<string> {
    const { data, error } = await admin
      .from('pasarela_config')
      .insert({ tenant_id: tenant.id, proveedor })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture config ${proveedor}: ${error.message}`)
    return data.id
  }

  async function activas(): Promise<string[]> {
    const { data } = await admin
      .from('pasarela_config')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('activa', true)
    return (data ?? []).map((c) => c.id)
  }

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenant = await crearTenant(admin, 'pasarela-act')
    agente = await crearUsuario(admin, 'pasarela-act-agente')
    auditor = await crearUsuario(admin, 'pasarela-act-auditor')
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    cliente = await clienteComo(env!, agente)
    configWompi = await crearConfig('wompi')
    configPayu = await crearConfig('payu')
  }, 60_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, auditor.id)
  }, 60_000)

  it('activa una pasarela en sandbox aunque no esté verificada', async () => {
    const { error } = await cliente.rpc('fn_activar_pasarela', {
      p_config_id: configWompi,
      p_tenant_id: tenant.id,
    })
    expect(error).toBeNull()
    expect(await activas()).toEqual([configWompi])
  })

  it('el swap deja exactamente una activa, nunca dos', async () => {
    const { error } = await cliente.rpc('fn_activar_pasarela', {
      p_config_id: configPayu,
      p_tenant_id: tenant.id,
    })
    expect(error).toBeNull()
    expect(await activas()).toEqual([configPayu])
  })

  it('emite un evento de auditoría al activar', async () => {
    const { data } = await admin
      .from('audit_log')
      .select('action, metadata')
      .eq('tenant_id', tenant.id)
      .eq('action', 'pasarela.activada')
    expect((data ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('cambiar de modo desactiva y borra la verificación', async () => {
    await admin
      .from('pasarela_config')
      .update({ verificada_at: new Date().toISOString() })
      .eq('id', configPayu)

    const { error } = await cliente.rpc('fn_cambiar_modo_pasarela', {
      p_config_id: configPayu,
      p_tenant_id: tenant.id,
      p_modo: 'produccion',
    })
    expect(error).toBeNull()

    const { data } = await admin
      .from('pasarela_config')
      .select('modo, activa, verificada_at')
      .eq('id', configPayu)
      .single<{ modo: string; activa: boolean; verificada_at: string | null }>()
    expect(data?.modo).toBe('produccion')
    expect(data?.activa).toBe(false)
    expect(data?.verificada_at).toBeNull()
  })

  it('no se puede activar en produccion sin verificada_at', async () => {
    const { error } = await cliente.rpc('fn_activar_pasarela', {
      p_config_id: configPayu,
      p_tenant_id: tenant.id,
    })
    expect(error?.message).toContain('PASARELA_NO_VERIFICADA')
    expect(await activas()).toEqual([])
  })

  it('en produccion sí activa una vez verificada', async () => {
    await admin
      .from('pasarela_config')
      .update({ verificada_at: new Date().toISOString() })
      .eq('id', configPayu)

    const { error } = await cliente.rpc('fn_activar_pasarela', {
      p_config_id: configPayu,
      p_tenant_id: tenant.id,
    })
    expect(error).toBeNull()
    expect(await activas()).toEqual([configPayu])
  })

  it('un auditor no puede activar', async () => {
    const clienteAuditor = await clienteComo(env!, auditor)
    const { error } = await clienteAuditor.rpc('fn_activar_pasarela', {
      p_config_id: configWompi,
      p_tenant_id: tenant.id,
    })
    expect(error?.message).toContain('FORBIDDEN')
  })

  it('no se puede activar una configuración de otra copropiedad', async () => {
    const otro = await crearTenant(admin, 'pasarela-act-otro')
    try {
      const { error } = await cliente.rpc('fn_activar_pasarela', {
        p_config_id: configWompi,
        p_tenant_id: otro.id,
      })
      expect(error).not.toBeNull()
    } finally {
      await eliminarTenant(admin, otro.id)
    }
  })
})
