/**
 * presupuesto-financiacion (Edge Function, HTTP real) — GAP-19, capa de
 * exposición de fuente_financiacion (Docs/Motor presupuestal/E-16 §9, §14).
 *
 * No repite el rate limit de punta a punta (ya probado en
 * tests/tenancy/create-tenant.test.ts y en el test unitario de
 * enforceRateLimit) ni el aislamiento RLS por tenant (ya cubierto en
 * tests/rls/motor-presupuestal-financiacion.test.ts) — se enfoca en lo que
 * es propio de esta capa: el contrato HTTP.
 */
import { afterAll, describe, expect, it } from 'vitest'
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
  console.warn(
    'SALTADO tests/tenancy/presupuesto-financiacion: faltan variables de Supabase en .env',
  )
}

interface RespuestaFuente {
  id: string
  presupuesto_id: string
  tipo: string
  valor_disponible: string
  valor_aplicado: string
}

/** presupuesto_cuenta (E8) es un catálogo por tenant, no una fila de
 * plataforma como el categoria_id plano de antes — idempotente porque
 * `codigo` es único por tenant. */
async function cuentaAdministracionId(admin: Cliente, tenantId: string): Promise<string> {
  const { data: existente } = await admin
    .from('presupuesto_cuenta')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('codigo', 'administracion')
    .maybeSingle<{ id: string }>()
  if (existente) return existente.id

  const { data, error } = await admin
    .from('presupuesto_cuenta')
    .insert({
      tenant_id: tenantId,
      naturaleza: 'egreso',
      codigo: 'administracion',
      nombre: 'Administración',
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture cuenta administracion: ${error.message}`)
  return data.id
}

async function crearPresupuesto(admin: Cliente, tenantId: string, anio: number): Promise<string> {
  const cuentaId = await cuentaAdministracionId(admin, tenantId)
  const { data: presupuesto, error: errPresupuesto } = await admin
    .from('presupuestos')
    .insert({ tenant_id: tenantId, anio, version: 1, monto_total: 500_000 })
    .select('id')
    .single<{ id: string }>()
  if (errPresupuesto) throw new Error(`fixture presupuesto: ${errPresupuesto.message}`)

  await admin.from('presupuesto_rubros').insert({
    tenant_id: tenantId,
    presupuesto_id: presupuesto.id,
    codigo: 'ADMIN-001',
    nombre: 'Administración',
    cuenta_id: cuentaId,
    monto_anual: 500_000,
  })

  return presupuesto.id
}

d('presupuesto-financiacion (Edge Function)', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let auditor: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente
  let clienteAuditor: Cliente
  let presupuestoId: string

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, auditor.id)
  })

  it('setup', async () => {
    agente = await crearUsuario(admin, 'pf-agent')
    auditor = await crearUsuario(admin, 'pf-auditor')
    tenant = await crearTenant(admin, 'pf', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    clienteAgent = await clienteComo(env!, agente)
    clienteAuditor = await clienteComo(env!, auditor)
    presupuestoId = await crearPresupuesto(admin, tenant.id, 2027)
  }, 30_000)

  it('flujo feliz: agent registra una fuente de financiación, responde 200', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaFuente>(
      'presupuesto-financiacion',
      {
        body: {
          presupuesto_id: presupuestoId,
          tipo: 'otros_ingresos',
          valor_disponible: 50_000,
          valor_aplicado: 20_000,
          descripcion: 'Arriendo salón comunal',
        },
      },
    )

    expect(response?.status).toBe(200)
    expect(data?.presupuesto_id).toBe(presupuestoId)
    expect(data?.tipo).toBe('otros_ingresos')
  }, 30_000)

  it('INVALID_PAYLOAD (400): valor_aplicado no puede superar valor_disponible', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaFuente>(
      'presupuesto-financiacion',
      {
        body: {
          presupuesto_id: presupuestoId,
          tipo: 'saldo_aplicable',
          valor_disponible: 100,
          valor_aplicado: 200,
        },
      },
    )

    expect(data).toBeNull()
    expect(response?.status).toBe(400)
  }, 30_000)

  it('PRESUPUESTO_NO_ENCONTRADO (404): presupuesto inexistente', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaFuente>(
      'presupuesto-financiacion',
      {
        body: {
          presupuesto_id: '00000000-0000-0000-0000-000000000000',
          tipo: 'saldo_aplicable',
          valor_disponible: 100,
        },
      },
    )

    expect(data).toBeNull()
    expect(response?.status).toBe(404)
  }, 30_000)

  it('un auditor no puede registrar fuentes de financiación', async () => {
    const { data, response } = await clienteAuditor.functions.invoke<RespuestaFuente>(
      'presupuesto-financiacion',
      {
        body: {
          presupuesto_id: presupuestoId,
          tipo: 'saldo_aplicable',
          valor_disponible: 100,
        },
      },
    )

    expect(data).toBeNull()
    expect(response?.status).not.toBe(200)
  }, 30_000)
})
