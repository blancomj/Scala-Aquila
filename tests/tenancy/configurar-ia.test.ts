/**
 * configurar-ia (Edge Function, HTTP real) — fase de estructura.
 *
 * El caso que más importa: una credencial guardada NO vuelve en ninguna
 * respuesta. Se guarda un valor conocido y se revisa el JSON completo de cada
 * respuesta posterior buscándolo — si alguna vez aparece (aunque sea dentro de
 * un mensaje de error o de `details`), el test falla. Mismo patrón exacto que
 * tests/tenancy/configurar-pasarela.test.ts.
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
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/tenancy/configurar-ia: faltan variables de Supabase en .env')
}

// Valor centinela: si esta cadena aparece en cualquier respuesta HTTP, hay
// una fuga de credenciales.
const SECRETO = 'sk-test-NUNCA-DEBE-SALIR-9f3a21'

interface RespuestaConfig {
  config: { id: string; proveedor: string; modelo: string; activa: boolean; verificada_at: string | null }
  credenciales_guardadas?: string[]
  alcance?: string
}

d('configurar-ia', () => {
  let admin: Cliente
  let tenant: TenantPrueba
  let agente: UsuarioPrueba
  let auditor: UsuarioPrueba
  let clienteAgent: Cliente
  let clienteAuditor: Cliente
  let configId: string

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenant = await crearTenant(admin, 'cfg-ia')
    agente = await crearUsuario(admin, 'cfg-ia-agente')
    auditor = await crearUsuario(admin, 'cfg-ia-auditor')
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    clienteAgent = await clienteComo(env!, agente)
    clienteAuditor = await clienteComo(env!, auditor)
  }, 60_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, auditor.id)
  }, 60_000)

  it('guarda configuración y credenciales de Anthropic', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaConfig>('configurar-ia', {
      body: {
        accion: 'guardar_credenciales',
        tenant_id: tenant.id,
        proveedor: 'anthropic',
        modelo: 'claude-sonnet-5',
        credenciales: { api_key: SECRETO },
      },
    })
    expect(response?.status).toBe(200)
    expect(data?.credenciales_guardadas).toEqual(['api_key'])
    expect(data?.config.modelo).toBe('claude-sonnet-5')
    expect(JSON.stringify(data)).not.toContain(SECRETO)
    configId = data!.config.id
  }, 60_000)

  it('rechaza una credencial que el proveedor no usa', async () => {
    const { data, response } = await clienteAgent.functions.invoke<unknown>('configurar-ia', {
      body: {
        accion: 'guardar_credenciales',
        tenant_id: tenant.id,
        proveedor: 'anthropic',
        modelo: 'claude-sonnet-5',
        credenciales: { llave_inventada: 'x' },
      },
    })
    expect(response?.status).toBe(400)
    expect(JSON.stringify(data ?? '')).not.toContain(SECRETO)
  }, 60_000)

  it('probar_conexion verifica y sella, sin devolver la credencial', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaConfig>('configurar-ia', {
      body: { accion: 'probar_conexion', tenant_id: tenant.id, config_id: configId },
    })
    expect(response?.status).toBe(200)
    expect(data?.config.verificada_at).toBeTruthy()
    // Honestidad de alcance: no se habló con Anthropic, solo con el almacén.
    expect(data?.alcance).toBe('credenciales_presentes_y_descifrables')
    expect(JSON.stringify(data)).not.toContain(SECRETO)
  }, 60_000)

  it('activa el proveedor', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaConfig>('configurar-ia', {
      body: { accion: 'activar', tenant_id: tenant.id, config_id: configId },
    })
    expect(response?.status).toBe(200)
    expect(data?.config.activa).toBe(true)
    expect(JSON.stringify(data)).not.toContain(SECRETO)
  }, 60_000)

  it('un auditor recibe FORBIDDEN', async () => {
    const { response } = await clienteAuditor.functions.invoke<unknown>('configurar-ia', {
      body: { accion: 'activar', tenant_id: tenant.id, config_id: configId },
    })
    expect(response?.status).toBe(403)
  }, 60_000)

  it('el valor de la credencial no aparece en audit_log', async () => {
    const { data } = await admin
      .from('audit_log')
      .select('action, metadata')
      .eq('tenant_id', tenant.id)
      .like('action', 'ia_proveedor.%')
    expect((data ?? []).length).toBeGreaterThan(0)
    expect(JSON.stringify(data)).not.toContain(SECRETO)
    // Sí queda el nombre del campo y quién lo cambió — eso es lo auditable.
    expect(JSON.stringify(data)).toContain('api_key')
  })
})
