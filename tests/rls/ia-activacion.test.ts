/**
 * fn_activar_ia_proveedor — 20260935000000.
 *
 * Cubre el invariante "exactamente un proveedor de IA activo por tenant"
 * (que un UPDATE suelto desde el cliente violaría contra el índice único
 * parcial), y el guard de que no se active un proveedor cuyas credenciales
 * nunca se probaron. A diferencia de pasarela (que exime a sandbox), aquí
 * no hay concepto de entorno: la verificación siempre es obligatoria.
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
  console.warn('SALTADO tests/rls/ia-activacion: faltan variables de Supabase en .env')
}

d('activación de proveedor de IA', () => {
  let admin: Cliente
  let tenant: TenantPrueba
  let agente: UsuarioPrueba
  let auditor: UsuarioPrueba
  let cliente: Cliente
  let configAnthropic: string
  let configOpenai: string

  async function crearConfig(proveedor: 'anthropic' | 'openai' | 'google', modelo: string): Promise<string> {
    const { data, error } = await admin
      .from('ia_config')
      .insert({ tenant_id: tenant.id, proveedor, modelo })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture config ${proveedor}: ${error.message}`)
    return data.id
  }

  async function activas(): Promise<string[]> {
    const { data } = await admin
      .from('ia_config')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('activa', true)
    return (data ?? []).map((c) => c.id)
  }

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenant = await crearTenant(admin, 'ia-act')
    agente = await crearUsuario(admin, 'ia-act-agente')
    auditor = await crearUsuario(admin, 'ia-act-auditor')
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    cliente = await clienteComo(env!, agente)
    configAnthropic = await crearConfig('anthropic', 'claude-sonnet-5')
    configOpenai = await crearConfig('openai', 'gpt-5')
  }, 60_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, auditor.id)
  }, 60_000)

  it('no se puede activar sin verificada_at', async () => {
    const { error } = await cliente.rpc('fn_activar_ia_proveedor', {
      p_config_id: configAnthropic,
      p_tenant_id: tenant.id,
    })
    expect(error?.message).toContain('IA_NO_VERIFICADA')
    expect(await activas()).toEqual([])
  })

  it('activa una vez verificada', async () => {
    await admin
      .from('ia_config')
      .update({ verificada_at: new Date().toISOString() })
      .eq('id', configAnthropic)

    const { error } = await cliente.rpc('fn_activar_ia_proveedor', {
      p_config_id: configAnthropic,
      p_tenant_id: tenant.id,
    })
    expect(error).toBeNull()
    expect(await activas()).toEqual([configAnthropic])
  })

  it('el swap deja exactamente una activa, nunca dos', async () => {
    await admin
      .from('ia_config')
      .update({ verificada_at: new Date().toISOString() })
      .eq('id', configOpenai)

    const { error } = await cliente.rpc('fn_activar_ia_proveedor', {
      p_config_id: configOpenai,
      p_tenant_id: tenant.id,
    })
    expect(error).toBeNull()
    expect(await activas()).toEqual([configOpenai])
  })

  it('emite un evento de auditoría al activar', async () => {
    const { data } = await admin
      .from('audit_log')
      .select('action, metadata')
      .eq('tenant_id', tenant.id)
      .eq('action', 'ia_proveedor.activado')
    expect((data ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('guardar una credencial nueva desactiva y borra la verificación', async () => {
    const { error } = await admin.rpc('fn_guardar_credencial_ia', {
      p_config_id: configOpenai,
      p_tenant_id: tenant.id,
      p_nombre: 'api_key',
      p_valor: 'sk-nueva',
      p_actor_id: agente.id,
    })
    expect(error).toBeNull()

    const { data } = await admin
      .from('ia_config')
      .select('activa, verificada_at')
      .eq('id', configOpenai)
      .single<{ activa: boolean; verificada_at: string | null }>()
    expect(data?.activa).toBe(false)
    expect(data?.verificada_at).toBeNull()
  })

  it('un auditor no puede activar', async () => {
    const clienteAuditor = await clienteComo(env!, auditor)
    const { error } = await clienteAuditor.rpc('fn_activar_ia_proveedor', {
      p_config_id: configAnthropic,
      p_tenant_id: tenant.id,
    })
    expect(error?.message).toContain('FORBIDDEN')
  })

  it('no se puede activar una configuración de otra copropiedad', async () => {
    const otro = await crearTenant(admin, 'ia-act-otro')
    try {
      const { error } = await cliente.rpc('fn_activar_ia_proveedor', {
        p_config_id: configAnthropic,
        p_tenant_id: otro.id,
      })
      expect(error).not.toBeNull()
    } finally {
      await eliminarTenant(admin, otro.id)
    }
  })
})
