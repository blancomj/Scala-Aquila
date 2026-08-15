/**
 * probar-formula (Edge Function, HTTP real) — AEL-004 Fase 1
 * (PLAN_AEL004_RULE_WORKSPACE.md). Evalúa un texto AEL ad-hoc contra un
 * inmueble/periodo reales sin escribir nada: fórmula válida con
 * UNIT.x / PARAMETER.x da el resultado esperado; una fórmula rota devuelve
 * 200 con valido:false (no es un error HTTP); inmueble/periodo ajenos al
 * tenant → 404; auditor → 403.
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
  console.warn('SALTADO tests/tenancy/probar-formula: faltan variables de Supabase en .env')
}

interface RespuestaPrueba {
  valido: boolean
  resultado: string | boolean | null
  tipo: string | null
  diagnosticos: { codigo: string; mensaje: string; linea: number; columna: number }[]
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

d('probar-formula (Edge Function)', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let auditor: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente
  let clienteAuditor: Cliente
  let inmuebleId: string
  let periodoId: string

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, auditor.id)
  })

  it('setup', async () => {
    agente = await crearUsuario(admin, 'pf-agent')
    auditor = await crearUsuario(admin, 'pf-auditor')
    tenant = await crearTenant(admin, 'pf', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'agent')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    clienteAgent = await clienteComo(env!, agente)
    clienteAuditor = await clienteComo(env!, auditor)

    const tipoId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({
        tenant_id: tenant.id,
        codigo: `PF-${String(Date.now())}`,
        tipo_id: tipoId,
        area_privada: 80,
        area_comun: 20,
      })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)
    inmuebleId = inmueble.id

    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        vigente_desde: '2027-01-01',
        estado: 'borrador',
        suma_total: 1,
      })
      .select('id')
      .single<{ id: string }>()
    if (errSet) throw new Error(`fixture coeficiente_set: ${errSet.message}`)

    const { error: errCoef } = await admin
      .from('coeficientes')
      .insert({ tenant_id: tenant.id, set_id: set.id, inmueble_id: inmuebleId, valor: 1 })
    if (errCoef) throw new Error(`fixture coeficiente: ${errCoef.message}`)

    const { error: errSetVigente } = await admin
      .from('coeficiente_sets')
      .update({ estado: 'vigente' })
      .eq('id', set.id)
    if (errSetVigente) throw new Error(`fixture coeficiente_set vigente: ${errSetVigente.message}`)

    const { error: errPolitica } = await admin.from('politicas_financieras').insert({
      tenant_id: tenant.id,
      version: 1,
      estado: 'vigente',
      vigente_desde: '2027-01-01',
      redondeo_modo: 'half_up',
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto',
      coeficientes_suma_esperada: 1,
      policy_hash: 'test-fixture-hash',
    })
    if (errPolitica) throw new Error(`fixture politica: ${errPolitica.message}`)

    const { error: errPresupuesto } = await admin.from('presupuestos').insert({
      tenant_id: tenant.id,
      anio: 2027,
      version: 1,
      estado: 'vigente',
      monto_total: 12_000_000,
    })
    if (errPresupuesto) throw new Error(`fixture presupuesto: ${errPresupuesto.message}`)

    const { data: periodo, error: errPeriodo } = await admin
      .from('periodos')
      .insert({ tenant_id: tenant.id, anio: 2027, mes: 1, estado: 'abierto' })
      .select('id')
      .single<{ id: string }>()
    if (errPeriodo) throw new Error(`fixture periodo: ${errPeriodo.message}`)
    periodoId = periodo.id
  }, 30_000)

  it('fórmula válida con UNIT.COEFICIENTE y PARAMETER.PRESUPUESTO_ANUAL — resultado esperado', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaPrueba>(
      'probar-formula',
      {
        body: {
          tenant_id: tenant.id,
          inmueble_id: inmuebleId,
          periodo_id: periodoId,
          formula_ael: 'REGLA X\nRETORNAR UNIT.COEFICIENTE * PARAMETER.PRESUPUESTO_ANUAL',
        },
      },
    )
    expect(response?.status).toBe(200)
    expect(data?.valido).toBe(true)
    expect(data?.tipo).toBe('MONEY')
    expect(data?.resultado).toBe('12000000')
    expect(data?.diagnosticos).toEqual([])
  }, 30_000)

  it('fórmula con error de sintaxis — 200 con valido:false, no es un error HTTP', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaPrueba>(
      'probar-formula',
      {
        body: {
          tenant_id: tenant.id,
          inmueble_id: inmuebleId,
          periodo_id: periodoId,
          formula_ael: 'REGLA X\nRETORNAR (',
        },
      },
    )
    expect(response?.status).toBe(200)
    expect(data?.valido).toBe(false)
    expect(data?.resultado).toBeNull()
    expect(data?.diagnosticos.length).toBeGreaterThan(0)
  }, 30_000)

  it('INMUEBLE_NO_ENCONTRADO (404) para un inmueble ajeno al tenant', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaPrueba>(
      'probar-formula',
      {
        body: {
          tenant_id: tenant.id,
          inmueble_id: '00000000-0000-0000-0000-000000000000',
          periodo_id: periodoId,
          formula_ael: 'REGLA X\nRETORNAR 1',
        },
      },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(404)
  }, 30_000)

  it('PERIODO_NO_ENCONTRADO (404) para un periodo ajeno al tenant', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaPrueba>(
      'probar-formula',
      {
        body: {
          tenant_id: tenant.id,
          inmueble_id: inmuebleId,
          periodo_id: '00000000-0000-0000-0000-000000000000',
          formula_ael: 'REGLA X\nRETORNAR 1',
        },
      },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(404)
  }, 30_000)

  it('un auditor no puede probar fórmulas (403 FORBIDDEN)', async () => {
    const { data, response } = await clienteAuditor.functions.invoke<RespuestaPrueba>(
      'probar-formula',
      {
        body: {
          tenant_id: tenant.id,
          inmueble_id: inmuebleId,
          periodo_id: periodoId,
          formula_ael: 'REGLA X\nRETORNAR 1',
        },
      },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(403)
  }, 30_000)
})
