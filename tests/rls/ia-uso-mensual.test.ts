/**
 * ia_uso_mensual / fn_registrar_uso_ia / fn_presupuesto_ia_disponible —
 * ENFOQUE_CONSOLIDACION Ola 3 (primera rebanada), 20260936000000.
 *
 * Mismo criterio de "sin ruta de escritura para el cliente" que
 * ia_credencial (tests/rls/proveedores-ia.test.ts), aunque aquí SÍ hay
 * SELECT: el tenant puede ver cuánto ha gastado, pero solo
 * fn_registrar_uso_ia (service_role) puede escribir.
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
  console.warn('SALTADO tests/rls/ia-uso-mensual: faltan variables de Supabase en .env')
}

d('RLS de ia_uso_mensual y presupuesto de IA', () => {
  let admin: Cliente
  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let adminA: UsuarioPrueba
  let agenteB: UsuarioPrueba
  let configA: string

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenantA = await crearTenant(admin, 'iauso-a')
    tenantB = await crearTenant(admin, 'iauso-b')
    adminA = await crearUsuario(admin, 'iauso-admin-a')
    agenteB = await crearUsuario(admin, 'iauso-agente-b')
    await crearMembership(admin, tenantA.id, adminA.id, 'administrador')
    await crearMembership(admin, tenantB.id, agenteB.id, 'auxiliar')

    const { data, error } = await admin
      .from('ia_config')
      .insert({ tenant_id: tenantA.id, proveedor: 'anthropic', modelo: 'claude-sonnet-5', activa: false })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture ia_config: ${error.message}`)
    configA = data.id
  }, 60_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, adminA.id)
    await eliminarUsuario(admin, agenteB.id)
  }, 60_000)

  it('fn_registrar_uso_ia acumula llamadas/tokens/costo en la misma fila del mes', async () => {
    const { error: e1 } = await admin.rpc('fn_registrar_uso_ia', {
      p_tenant_id: tenantA.id,
      p_tokens_entrada: 100,
      p_tokens_salida: 50,
      p_costo_estimado_usd: 0.01,
    })
    expect(e1).toBeNull()

    const { error: e2 } = await admin.rpc('fn_registrar_uso_ia', {
      p_tenant_id: tenantA.id,
      p_tokens_entrada: 200,
      p_tokens_salida: 80,
      p_costo_estimado_usd: 0.02,
    })
    expect(e2).toBeNull()

    const { data } = await admin
      .from('ia_uso_mensual')
      .select('llamadas, tokens_entrada, tokens_salida, costo_estimado_usd')
      .eq('tenant_id', tenantA.id)
      .single<{ llamadas: number; tokens_entrada: number; tokens_salida: number; costo_estimado_usd: number }>()
    expect(data?.llamadas).toBe(2)
    expect(data?.tokens_entrada).toBe(300)
    expect(data?.tokens_salida).toBe(130)
    expect(data?.costo_estimado_usd).toBeCloseTo(0.03, 4)
  })

  it('un miembro ve el uso acumulado de su copropiedad', async () => {
    const cliente = await clienteComo(env!, adminA)
    const { data } = await cliente.from('ia_uso_mensual').select('tenant_id').eq('tenant_id', tenantA.id)
    expect(data ?? []).toHaveLength(1)
  })

  it('SEC-11 · el tenant B no ve el uso del tenant A', async () => {
    const cliente = await clienteComo(env!, agenteB)
    const { data } = await cliente.from('ia_uso_mensual').select('tenant_id').eq('tenant_id', tenantA.id)
    expect(data ?? []).toHaveLength(0)
  })

  it('ningún usuario autenticado puede escribir en ia_uso_mensual directamente', async () => {
    const cliente = await clienteComo(env!, adminA)
    const { error: errorInsert } = await cliente.from('ia_uso_mensual').insert({
      tenant_id: tenantA.id,
      periodo: '2099-01',
      costo_estimado_usd: 999,
    })
    expect(errorInsert).not.toBeNull()

    // Sin policy de UPDATE, RLS filtra en vez de lanzar (0 filas afectadas,
    // sin error) — se prueba el efecto en la fila, no un error HTTP.
    const { error: errorUpdate } = await cliente
      .from('ia_uso_mensual')
      .update({ costo_estimado_usd: 0 })
      .eq('tenant_id', tenantA.id)
    expect(errorUpdate).toBeNull()
    const { data: filaTrasIntento } = await admin
      .from('ia_uso_mensual')
      .select('costo_estimado_usd')
      .eq('tenant_id', tenantA.id)
      .single<{ costo_estimado_usd: number }>()
    expect(filaTrasIntento?.costo_estimado_usd).toBeCloseTo(0.03, 4)
  })

  it('fn_registrar_uso_ia no es ejecutable por authenticated, solo service_role', async () => {
    const cliente = await clienteComo(env!, adminA)
    const { error } = await cliente.rpc('fn_registrar_uso_ia', {
      p_tenant_id: tenantA.id,
      p_tokens_entrada: 1,
      p_tokens_salida: 1,
      p_costo_estimado_usd: 0,
    })
    expect(error).not.toBeNull()
  })

  it('fn_presupuesto_ia_disponible: true sin proveedor activo (no hay techo que aplicar)', async () => {
    const cliente = await clienteComo(env!, adminA)
    const { data, error } = await cliente.rpc('fn_presupuesto_ia_disponible', { p_tenant_id: tenantA.id })
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('fn_presupuesto_ia_disponible: false cuando el gasto acumulado supera el techo del proveedor activo', async () => {
    const { error: errorActivar } = await admin
      .from('ia_config')
      .update({ activa: true, presupuesto_mensual_usd: 0.02 })
      .eq('id', configA)
    if (errorActivar) throw new Error(`fixture activar+techo: ${errorActivar.message}`)

    const cliente = await clienteComo(env!, adminA)
    const { data, error } = await cliente.rpc('fn_presupuesto_ia_disponible', { p_tenant_id: tenantA.id })
    expect(error).toBeNull()
    // El fixture de arriba ya acumuló 0.03 USD, por encima del techo de 0.02.
    expect(data).toBe(false)
  })

  it('fn_presupuesto_ia_disponible exige membresía en el tenant consultado', async () => {
    const cliente = await clienteComo(env!, agenteB)
    const { error } = await cliente.rpc('fn_presupuesto_ia_disponible', { p_tenant_id: tenantA.id })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('FORBIDDEN')
  })
})
