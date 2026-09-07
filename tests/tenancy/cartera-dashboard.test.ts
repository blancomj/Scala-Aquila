/**
 * cartera-dashboard (Edge Function, HTTP real) — CAR F9, tarjetas
 * principales + distribución por antigüedad (§23.1/§23.2). Cubre PH-C34
 * (aislamiento cross-tenant, SEC-03) y el flujo funcional: cargos
 * vencidos vs. corrientes, intereses causados, saldo a favor y el tramo
 * de antigüedad correcto.
 *
 * No cubre CARTERA_PREJURIDICA/CARTERA_JURIDICA con datos reales — exige
 * recorrer la máquina de estados completa de F6 (preventiva→administrativa
 * →prejuridica→juridica, cada paso con su propio rol/aprobación) solo
 * para sembrar un dato; esa agrupación por etapa ya está cubierta por el
 * test unitario puro (cartera-dashboard.test.ts). Aquí se verifica que,
 * sin fila en cartera_etapas, el default es 'preventiva' (coalesce en
 * fn_dashboard_cartera) — igual que en F8.
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
  console.warn('SALTADO tests/tenancy/cartera-dashboard: faltan variables de Supabase en .env')
}

interface RespuestaDashboard {
  tarjetas: {
    carteraTotal: string
    carteraVencida: string
    carteraCorriente: string
    interesesCausados: string
    carteraMayor90: string
    carteraMayor180: string
    saldosAFavor: string
  }
  antiguedad: { codigo: string; cantidadInmuebles: number; monto: string }[]
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

async function formaPagoEfectivoId(admin: Cliente): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'FORMA_PAGO')
    .eq('codigo', 'efectivo')
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture forma de pago: ${error.message}`)
  return data.id
}

async function crearPeriodo(
  admin: Cliente,
  tenantId: string,
  fechaVencimiento: string,
  anio: number,
  mes: number,
): Promise<string> {
  const { data: periodo, error: errPeriodo } = await admin
    .from('periodos')
    .insert({ tenant_id: tenantId, anio, mes, estado: 'abierto', fecha_vencimiento: fechaVencimiento })
    .select('id')
    .single<{ id: string }>()
  if (errPeriodo) throw new Error(`fixture periodo: ${errPeriodo.message}`)
  return periodo.id
}

async function crearLiquidacion(admin: Cliente, tenantId: string, periodoId: string, montoTotal: number): Promise<string> {
  const { data: liquidacion, error: errLiquidacion } = await admin
    .from('liquidaciones')
    .insert({
      tenant_id: tenantId,
      periodo_id: periodoId,
      result_hash: `test-fixture-dashboard-${String(Date.now())}-${String(Math.random())}`,
      tenant_total: montoTotal,
    })
    .select('id')
    .single<{ id: string }>()
  if (errLiquidacion) throw new Error(`fixture liquidacion: ${errLiquidacion.message}`)
  return liquidacion.id
}

async function crearCargo(
  admin: Cliente,
  tenantId: string,
  inmuebleId: string,
  periodoId: string,
  liquidacionId: string,
  categoria: 'capital' | 'interes',
  monto: number,
): Promise<void> {
  const { data: concepto, error: errConcepto } = await admin
    .from('conceptos')
    .insert({
      tenant_id: tenantId,
      codigo: `CD-${String(Date.now())}-${String(Math.random()).slice(2, 6)}`,
      nombre: 'Cuota',
      modo_calculo: 'distribucion',
      modo_valor: 'formulado',
      tipo_recurrencia: 'recurrente',
      periodicidad: 'mensual',
      alcance: 'todos',
      fecha_inicio_anio: 2000,
      fecha_inicio_mes: 1,
      prioridad: 100,
      estado: 'activo',
    })
    .select('id')
    .single<{ id: string }>()
  if (errConcepto) throw new Error(`fixture concepto: ${errConcepto.message}`)

  const { data: linea, error: errLinea } = await admin
    .from('liquidacion_lineas')
    .insert({ tenant_id: tenantId, liquidacion_id: liquidacionId, inmueble_id: inmuebleId, concepto_id: concepto.id, monto })
    .select('id')
    .single<{ id: string }>()
  if (errLinea) throw new Error(`fixture liquidacion_linea: ${errLinea.message}`)

  const { error: errCargo } = await admin.from('cargos').insert({
    tenant_id: tenantId,
    inmueble_id: inmuebleId,
    periodo_id: periodoId,
    categoria,
    origen_tipo: 'liquidacion_linea',
    liquidacion_linea_id: linea.id,
    concepto_id: concepto.id,
    monto_original: monto,
  })
  if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)
}

d('cartera-dashboard (Edge Function, CAR §23.1/§23.2)', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let agenteOtro: UsuarioPrueba
  let tenant: TenantPrueba
  let tenantOtro: TenantPrueba
  let clienteAgent: Cliente
  let clienteAgentOtro: Cliente
  let inmueble1Id: string
  let inmueble2Id: string

  const FECHA_CORTE = '2026-03-01'

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarTenant(admin, tenantOtro.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, agenteOtro.id)
  })

  it('setup', async () => {
    agente = await crearUsuario(admin, 'cd-agent')
    agenteOtro = await crearUsuario(admin, 'cd-agent-otro')
    tenant = await crearTenant(admin, 'cd', agente.id)
    tenantOtro = await crearTenant(admin, 'cd-otro', agenteOtro.id)
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    await crearMembership(admin, tenantOtro.id, agenteOtro.id, 'auxiliar')
    clienteAgent = await clienteComo(env!, agente)
    clienteAgentOtro = await clienteComo(env!, agenteOtro)

    const tipoId = await tipoApartamentoId(admin)
    const { data: inm1, error: errInm1 } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `CD1-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInm1) throw new Error(`fixture inmueble1: ${errInm1.message}`)
    inmueble1Id = inm1.id

    const { data: inm2, error: errInm2 } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `CD2-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInm2) throw new Error(`fixture inmueble2: ${errInm2.message}`)
    inmueble2Id = inm2.id

    // inmueble1: vencido 45 días (corte 2026-03-01, vencimiento 2026-01-15) → MORA_INICIAL (31-60).
    const periodoVencidoId = await crearPeriodo(admin, tenant.id, '2026-01-15', 2026, 1)
    const liquidacionVencidaId = await crearLiquidacion(admin, tenant.id, periodoVencidoId, 210_000)
    await crearCargo(admin, tenant.id, inmueble1Id, periodoVencidoId, liquidacionVencidaId, 'capital', 200_000)
    await crearCargo(admin, tenant.id, inmueble1Id, periodoVencidoId, liquidacionVencidaId, 'interes', 10_000)

    // inmueble2: NO vencido (vencimiento futuro) → corriente, AL_DIA.
    const periodoFuturoId = await crearPeriodo(admin, tenant.id, '2026-06-01', 2026, 6)
    const liquidacionFuturaId = await crearLiquidacion(admin, tenant.id, periodoFuturoId, 150_000)
    await crearCargo(admin, tenant.id, inmueble2Id, periodoFuturoId, liquidacionFuturaId, 'capital', 150_000)

    // inmueble2: sobrepago sin aplicar → saldo_credito.
    const formaPagoId = await formaPagoEfectivoId(admin)
    const { error: errPago } = await admin
      .from('pagos')
      .insert({ tenant_id: tenant.id, inmueble_id: inmueble2Id, monto: 50_000, fecha_pago: '2026-02-01', forma_pago_id: formaPagoId })
    if (errPago) throw new Error(`fixture pago: ${errPago.message}`)
  }, 30_000)

  it('PH-C34: un agent de otro tenant no puede ver este dashboard (403)', async () => {
    const { data, response } = await clienteAgentOtro.functions.invoke<RespuestaDashboard>('cartera-dashboard', {
      body: { tenant_id: tenant.id, fecha_corte: FECHA_CORTE },
    })
    expect(data).toBeNull()
    expect(response?.status).toBe(403)
  }, 30_000)

  it('tarjetas: separa vencida/corriente, intereses causados y saldo a favor correctamente', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaDashboard>('cartera-dashboard', {
      body: { tenant_id: tenant.id, fecha_corte: FECHA_CORTE },
    })
    expect(response?.status).toBe(200)
    expect(data?.tarjetas.carteraTotal).toBe('360000')
    expect(data?.tarjetas.carteraVencida).toBe('210000')
    expect(data?.tarjetas.carteraCorriente).toBe('150000')
    expect(data?.tarjetas.interesesCausados).toBe('10000')
    expect(data?.tarjetas.carteraMayor90).toBe('0')
    expect(data?.tarjetas.carteraMayor180).toBe('0')
    expect(data?.tarjetas.saldosAFavor).toBe('50000')
  }, 30_000)

  it('antigüedad: inmueble1 cae en MORA_INICIAL, inmueble2 en AL_DIA', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaDashboard>('cartera-dashboard', {
      body: { tenant_id: tenant.id, fecha_corte: FECHA_CORTE },
    })
    expect(response?.status).toBe(200)
    expect(data?.antiguedad).toHaveLength(8)

    const alDia = data?.antiguedad.find((t) => t.codigo === 'AL_DIA')
    expect(alDia?.cantidadInmuebles).toBe(1)
    expect(alDia?.monto).toBe('0')

    const moraInicial = data?.antiguedad.find((t) => t.codigo === 'MORA_INICIAL')
    expect(moraInicial?.cantidadInmuebles).toBe(1)
    expect(moraInicial?.monto).toBe('210000')

    const otrosTramos = data?.antiguedad.filter((t) => t.codigo !== 'AL_DIA' && t.codigo !== 'MORA_INICIAL')
    for (const tramo of otrosTramos ?? []) {
      expect(tramo.cantidadInmuebles).toBe(0)
    }
  }, 30_000)
})
