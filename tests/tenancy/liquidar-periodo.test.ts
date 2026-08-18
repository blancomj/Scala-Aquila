/**
 * liquidar-periodo (Edge Function, HTTP real) — F6, expone liquidar()/
 * guardarLiquidacion() (packages/liquidation-engine). Cubre el flujo feliz,
 * idempotencia (una liquidación por periodo), rol (solo agent), 404 y
 * aislamiento por tenant.
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
  console.warn('SALTADO tests/tenancy/liquidar-periodo: faltan variables de Supabase en .env')
}

interface RespuestaLiquidar {
  liquidacion_id: string
  periodo_id: string
  result_hash: string
  tenant_total: string
  lineas: { inmueble_id: string; concepto_codigo: string; monto: string }[]
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

/** Arma copropiedad completa lista para liquidar: inmuebles, coeficientes,
 * política vigente, presupuesto vigente, periodo abierto y CUOTA_ADMIN. */
async function armarCopropiedad(
  admin: Cliente,
  tenantId: string,
  montoTotal: number,
): Promise<string> {
  const tipoId = await tipoApartamentoId(admin)
  const cuentaId = await cuentaAdministracionId(admin, tenantId)

  const coeficientes = [0.3, 0.3, 0.4]
  const inmuebleIds: string[] = []
  for (let i = 0; i < coeficientes.length; i++) {
    const { data: inmueble, error } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantId, codigo: `LP-${String(i)}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble: ${error.message}`)
    inmuebleIds.push(inmueble.id)
  }

  const { data: set, error: errSet } = await admin
    .from('coeficiente_sets')
    .insert({
      tenant_id: tenantId,
      version: 1,
      vigente_desde: '2027-01-01',
      estado: 'borrador',
      suma_total: 1,
    })
    .select('id')
    .single<{ id: string }>()
  if (errSet) throw new Error(`fixture coeficiente_set: ${errSet.message}`)

  const { error: errCoef } = await admin.from('coeficientes').insert(
    inmuebleIds.map((id, i) => ({
      tenant_id: tenantId,
      set_id: set.id,
      inmueble_id: id,
      valor: coeficientes[i] ?? 0,
    })),
  )
  if (errCoef) throw new Error(`fixture coeficientes: ${errCoef.message}`)

  const { error: errSetVigente } = await admin
    .from('coeficiente_sets')
    .update({ estado: 'vigente' })
    .eq('id', set.id)
  if (errSetVigente) throw new Error(`fixture coeficiente_set vigente: ${errSetVigente.message}`)

  const { error: errPolitica } = await admin.from('politicas_financieras').insert({
    tenant_id: tenantId,
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

  const { data: presupuesto, error: errPresupuesto } = await admin
    .from('presupuestos')
    .insert({
      tenant_id: tenantId,
      anio: 2027,
      version: 1,
      estado: 'vigente',
      monto_total: montoTotal,
    })
    .select('id')
    .single<{ id: string }>()
  if (errPresupuesto) throw new Error(`fixture presupuesto: ${errPresupuesto.message}`)

  await admin.from('presupuesto_rubros').insert({
    tenant_id: tenantId,
    presupuesto_id: presupuesto.id,
    codigo: 'ADMIN-001',
    nombre: 'Administración',
    cuenta_id: cuentaId,
    monto_anual: montoTotal,
  })

  const { data: periodo, error: errPeriodo } = await admin
    .from('periodos')
    .insert({ tenant_id: tenantId, anio: 2027, mes: 1, estado: 'abierto' })
    .select('id')
    .single<{ id: string }>()
  if (errPeriodo) throw new Error(`fixture periodo: ${errPeriodo.message}`)

  const { error: errConcepto } = await admin.from('conceptos').insert({
    tenant_id: tenantId,
    codigo: 'CUOTA_ADMIN',
    nombre: 'Cuota de administración',
    tipo_base: 'coeficiente',
    modo_calculo: 'distribucion',
    formula_ael:
      'REGLA CUOTA_BASICA\n' +
      'DEFINIR presupuesto_anual = PARAMETER.PRESUPUESTO_ANUAL\n' +
      'DEFINIR otros_ingresos_anual = PARAMETER.OTROS_INGRESOS_ANUAL\n' +
      'RETORNAR presupuesto_anual - otros_ingresos_anual',
    prioridad: 100,
    estado: 'activo',
  })
  if (errConcepto) throw new Error(`fixture concepto: ${errConcepto.message}`)

  return periodo.id
}

d('liquidar-periodo (Edge Function)', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let auditor: UsuarioPrueba
  let agenteOtro: UsuarioPrueba
  let tenant: TenantPrueba
  let tenantOtro: TenantPrueba
  let clienteAgent: Cliente
  let clienteAuditor: Cliente
  let clienteAgentOtro: Cliente
  let periodoId: string

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarTenant(admin, tenantOtro.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, auditor.id)
    await eliminarUsuario(admin, agenteOtro.id)
  })

  it('setup', async () => {
    agente = await crearUsuario(admin, 'lp-agent')
    auditor = await crearUsuario(admin, 'lp-auditor')
    agenteOtro = await crearUsuario(admin, 'lp-agent-otro')
    tenant = await crearTenant(admin, 'lp', agente.id)
    tenantOtro = await crearTenant(admin, 'lp-otro', agenteOtro.id)
    await crearMembership(admin, tenant.id, agente.id, 'agent')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    await crearMembership(admin, tenantOtro.id, agenteOtro.id, 'agent')
    clienteAgent = await clienteComo(env!, agente)
    clienteAuditor = await clienteComo(env!, auditor)
    clienteAgentOtro = await clienteComo(env!, agenteOtro)

    periodoId = await armarCopropiedad(admin, tenant.id, 1_000_000)
  }, 30_000)

  it('un auditor no puede liquidar (403)', async () => {
    const { data, response } = await clienteAuditor.functions.invoke<RespuestaLiquidar>(
      'liquidar-periodo',
      { body: { periodo_id: periodoId } },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(403)
  }, 30_000)

  it('PERIODO_NO_ENCONTRADO (404): periodo inexistente', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaLiquidar>(
      'liquidar-periodo',
      { body: { periodo_id: '00000000-0000-0000-0000-000000000000' } },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(404)
  }, 30_000)

  it('aislamiento: un agent de otro tenant no puede liquidar este periodo', async () => {
    const { data, response } = await clienteAgentOtro.functions.invoke<RespuestaLiquidar>(
      'liquidar-periodo',
      { body: { periodo_id: periodoId } },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(404)
  }, 30_000)

  it('flujo feliz: liquida el periodo y persiste el resultado', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaLiquidar>(
      'liquidar-periodo',
      { body: { periodo_id: periodoId } },
    )

    expect(response?.status).toBe(200)
    expect(data?.periodo_id).toBe(periodoId)
    expect(data?.tenant_total).toBe('1000000')
    expect(data?.lineas).toHaveLength(3)

    const { data: fila, error } = await admin
      .from('liquidaciones')
      .select('id, result_hash, tenant_total, estado')
      .eq('periodo_id', periodoId)
      .single()
    expect(error).toBeNull()
    expect(fila?.id).toBe(data?.liquidacion_id)
    expect(fila?.result_hash).toBe(data?.result_hash)
    expect(fila?.estado).toBe('completada')

    const { data: lineas, error: errorLineas } = await admin
      .from('liquidacion_lineas')
      .select('monto')
      .eq('liquidacion_id', data!.liquidacion_id)
    expect(errorLineas).toBeNull()
    expect(lineas).toHaveLength(3)
  }, 30_000)

  it('PERIODO_YA_LIQUIDADO (409): un segundo intento sobre el mismo periodo', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaLiquidar>(
      'liquidar-periodo',
      { body: { periodo_id: periodoId } },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(409)
  }, 30_000)
})
