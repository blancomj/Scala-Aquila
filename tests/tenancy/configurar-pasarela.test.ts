/**
 * configurar-pasarela (Edge Function, HTTP real) — fase de estructura.
 *
 * El caso que más importa: una credencial guardada NO vuelve en ninguna
 * respuesta. Se guarda un valor conocido y se revisa el JSON completo de cada
 * respuesta posterior buscándolo — si alguna vez aparece (aunque sea dentro de
 * un mensaje de error o de `details`), el test falla.
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
  console.warn('SALTADO tests/tenancy/configurar-pasarela: faltan variables de Supabase en .env')
}

// Valor centinela: si esta cadena aparece en cualquier respuesta HTTP, hay
// una fuga de credenciales.
const SECRETO = 'prv_test_NUNCA_DEBE_SALIR_9f3a21'

interface RespuestaConfig {
  config: { id: string; proveedor: string; modo: string; activa: boolean; verificada_at: string | null }
  credenciales_guardadas?: string[]
  alcance?: string
}

d('configurar-pasarela', () => {
  let admin: Cliente
  let tenant: TenantPrueba
  let agente: UsuarioPrueba
  let auditor: UsuarioPrueba
  let clienteAgent: Cliente
  let clienteAuditor: Cliente
  let configId: string

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenant = await crearTenant(admin, 'cfg-pasarela')
    agente = await crearUsuario(admin, 'cfg-pasarela-agente')
    auditor = await crearUsuario(admin, 'cfg-pasarela-auditor')
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

  it('guarda configuración y credenciales de Wompi', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaConfig>(
      'configurar-pasarela',
      {
        body: {
          accion: 'guardar_credenciales',
          tenant_id: tenant.id,
          proveedor: 'wompi',
          identificador_publico: 'pub_test_abc',
          metodos: ['pse', 'nequi'],
          credenciales: {
            public_key: 'pub_test_abc',
            private_key: SECRETO,
            events_secret: 'evt_test',
            integrity_secret: 'int_test',
          },
        },
      },
    )
    expect(response?.status).toBe(200)
    expect(data?.credenciales_guardadas?.sort()).toEqual([
      'events_secret',
      'integrity_secret',
      'private_key',
      'public_key',
    ])
    expect(JSON.stringify(data)).not.toContain(SECRETO)
    configId = data!.config.id
  }, 60_000)

  it('rechaza una credencial que el proveedor no usa', async () => {
    const { data, response } = await clienteAgent.functions.invoke<unknown>('configurar-pasarela', {
      body: {
        accion: 'guardar_credenciales',
        tenant_id: tenant.id,
        proveedor: 'wompi',
        credenciales: { llave_inventada: 'x' },
      },
    })
    expect(response?.status).toBe(400)
    expect(JSON.stringify(data ?? '')).not.toContain(SECRETO)
  }, 60_000)

  it('los métodos habilitados quedan ligados al catálogo FORMA_PAGO', async () => {
    const { data } = await admin
      .from('pasarela_config_metodo')
      .select('forma_pago:lista_tipos(codigo, tipo)')
      .eq('config_id', configId)
    const filas = data ?? []
    expect(filas.map((m) => m.forma_pago.codigo).sort()).toEqual(['nequi', 'pse'])
    expect(filas.every((m) => m.forma_pago.tipo === 'FORMA_PAGO')).toBe(true)
  })

  it('probar_conexion verifica y sella, sin devolver la credencial', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaConfig>(
      'configurar-pasarela',
      { body: { accion: 'probar_conexion', tenant_id: tenant.id, config_id: configId } },
    )
    expect(response?.status).toBe(200)
    expect(data?.config.verificada_at).toBeTruthy()
    // Honestidad de alcance: no se habló con Wompi, solo con el almacén.
    expect(data?.alcance).toBe('credenciales_presentes_y_descifrables')
    expect(JSON.stringify(data)).not.toContain(SECRETO)
  }, 60_000)

  it('activa la pasarela', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaConfig>(
      'configurar-pasarela',
      { body: { accion: 'activar', tenant_id: tenant.id, config_id: configId } },
    )
    expect(response?.status).toBe(200)
    expect(data?.config.activa).toBe(true)
    expect(JSON.stringify(data)).not.toContain(SECRETO)
  }, 60_000)

  it('un auditor recibe FORBIDDEN', async () => {
    const { response } = await clienteAuditor.functions.invoke<unknown>('configurar-pasarela', {
      body: { accion: 'activar', tenant_id: tenant.id, config_id: configId },
    })
    expect(response?.status).toBe(403)
  }, 60_000)

  it('el valor de la credencial no aparece en audit_log', async () => {
    const { data } = await admin
      .from('audit_log')
      .select('action, metadata')
      .eq('tenant_id', tenant.id)
      .like('action', 'pasarela.%')
    expect((data ?? []).length).toBeGreaterThan(0)
    expect(JSON.stringify(data)).not.toContain(SECRETO)
    // Sí queda el nombre del campo y quién lo cambió — eso es lo auditable.
    expect(JSON.stringify(data)).toContain('private_key')
  })
})
