/**
 * cartera-indicadores (Edge Function, HTTP real) — CAR F9 (parte 2),
 * §23.3: Overdue Portfolio %, Roll Rate, Cure Rate.
 *
 * Roll Rate/Cure Rate se prueban con snapshots SINTÉTICOS insertados
 * directamente (posiciones_cartera_snapshot es append-only, solo
 * service_role escribe, F3) — no hace falta recorrer el job diario (F8)
 * completo para fijar clasificacion_codigo/deuda_total exactos en dos
 * fechas y así ejercitar los bordes del agregador puro contra la BD real.
 * Overdue Portfolio % SÍ usa un cargo real (se recalcula en vivo con
 * fn_dashboard_cartera, F9 parte 1, independiente de los snapshots).
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
  console.warn('SALTADO tests/tenancy/cartera-indicadores: faltan variables de Supabase en .env')
}

interface RespuestaIndicadores {
  overduePortfolioPct: number | null
  cureRate: number | null
  rollRatePorTramo: { tramoCodigo: string; tramoSiguienteCodigo: string | null; rollRate: number | null }[]
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

async function crearInmueble(admin: Cliente, tenantId: string, tipoId: number, codigo: string): Promise<string> {
  const { data, error } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo, tipo_id: tipoId })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture inmueble ${codigo}: ${error.message}`)
  return data.id
}

async function insertarSnapshot(
  admin: Cliente,
  opciones: {
    tenantId: string
    inmuebleId: string
    fechaCorte: string
    deudaTotal: number
    clasificacionCodigo: string
    diasMoraMaximo: number
    politicaId: string
  },
): Promise<void> {
  const { error } = await admin.from('posiciones_cartera_snapshot').insert({
    tenant_id: opciones.tenantId,
    inmueble_id: opciones.inmuebleId,
    fecha_corte: opciones.fechaCorte,
    deuda_total: opciones.deudaTotal,
    deuda_capital: opciones.deudaTotal,
    deuda_interes: 0,
    deuda_otros: 0,
    dias_mora_maximo: opciones.diasMoraMaximo,
    clasificacion_codigo: opciones.clasificacionCodigo,
    nivel_riesgo: opciones.diasMoraMaximo === 0 ? 'ninguno' : 'bajo',
    etapa_cobranza: opciones.diasMoraMaximo === 0 ? 'preventiva' : 'administrativa',
    politica_clasificacion_id: opciones.politicaId,
    politica_version: 1,
    posicion_hash: `test-fixture-indicadores-${opciones.inmuebleId}-${opciones.fechaCorte}`,
  })
  if (error) throw new Error(`fixture snapshot ${opciones.inmuebleId}/${opciones.fechaCorte}: ${error.message}`)
}

d('cartera-indicadores (Edge Function, CAR §23.3)', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente
  let politicaId: string
  let inmuebleRealId: string

  const FECHA_DESDE = '2026-02-01'
  const FECHA_HASTA = '2026-03-01'

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
  })

  it('setup', async () => {
    agente = await crearUsuario(admin, 'ci-agent')
    tenant = await crearTenant(admin, 'ci', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'agent')
    clienteAgent = await clienteComo(env!, agente)

    const { data: politica, error: errPolitica } = await admin
      .from('politicas_clasificacion_cartera')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        estado: 'borrador',
        nombre: 'Política indicadores v1',
        policy_hash: `test-fixture-indicadores-${tenant.id}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPolitica) throw new Error(`fixture politica: ${errPolitica.message}`)
    politicaId = politica.id

    const { error: errTramos } = await admin.from('politica_clasificacion_tramos').insert([
      { tenant_id: tenant.id, politica_id: politicaId, codigo: 'AL_DIA', nombre: 'Al día', dias_min: 0, dias_max: 0, nivel_riesgo: 'ninguno', etapa_cobranza: 'preventiva', prioridad: 0, orden: 0 },
      { tenant_id: tenant.id, politica_id: politicaId, codigo: 'MORA_TEMPRANA', nombre: 'Temprana', dias_min: 1, dias_max: 30, nivel_riesgo: 'bajo', etapa_cobranza: 'administrativa', prioridad: 1, orden: 1 },
      { tenant_id: tenant.id, politica_id: politicaId, codigo: 'MORA_INICIAL', nombre: 'Inicial', dias_min: 31, dias_max: null, nivel_riesgo: 'bajo', etapa_cobranza: 'administrativa', prioridad: 2, orden: 2 },
    ])
    if (errTramos) throw new Error(`fixture tramos: ${errTramos.message}`)

    const { error: errActivar } = await admin
      .from('politicas_clasificacion_cartera')
      .update({ estado: 'vigente' })
      .eq('id', politicaId)
    if (errActivar) throw new Error(`activar politica: ${errActivar.message}`)

    const tipoId = await tipoApartamentoId(admin)
    const inmuebleAId = await crearInmueble(admin, tenant.id, tipoId, `CI-A-${String(Date.now())}`)
    const inmuebleBId = await crearInmueble(admin, tenant.id, tipoId, `CI-B-${String(Date.now())}`)
    const inmuebleCId = await crearInmueble(admin, tenant.id, tipoId, `CI-C-${String(Date.now())}`)

    // A: MORA_TEMPRANA (100_000) → MORA_INICIAL (100_000) — rola, no se cura.
    await insertarSnapshot(admin, { tenantId: tenant.id, inmuebleId: inmuebleAId, fechaCorte: FECHA_DESDE, deudaTotal: 100_000, clasificacionCodigo: 'MORA_TEMPRANA', diasMoraMaximo: 15, politicaId })
    await insertarSnapshot(admin, { tenantId: tenant.id, inmuebleId: inmuebleAId, fechaCorte: FECHA_HASTA, deudaTotal: 100_000, clasificacionCodigo: 'MORA_INICIAL', diasMoraMaximo: 45, politicaId })

    // B: MORA_TEMPRANA (50_000) → AL_DIA (0) — se cura.
    await insertarSnapshot(admin, { tenantId: tenant.id, inmuebleId: inmuebleBId, fechaCorte: FECHA_DESDE, deudaTotal: 50_000, clasificacionCodigo: 'MORA_TEMPRANA', diasMoraMaximo: 10, politicaId })
    await insertarSnapshot(admin, { tenantId: tenant.id, inmuebleId: inmuebleBId, fechaCorte: FECHA_HASTA, deudaTotal: 0, clasificacionCodigo: 'AL_DIA', diasMoraMaximo: 0, politicaId })

    // C: AL_DIA → AL_DIA — sano en ambas fechas, no compite en los denominadores.
    await insertarSnapshot(admin, { tenantId: tenant.id, inmuebleId: inmuebleCId, fechaCorte: FECHA_DESDE, deudaTotal: 0, clasificacionCodigo: 'AL_DIA', diasMoraMaximo: 0, politicaId })
    await insertarSnapshot(admin, { tenantId: tenant.id, inmuebleId: inmuebleCId, fechaCorte: FECHA_HASTA, deudaTotal: 0, clasificacionCodigo: 'AL_DIA', diasMoraMaximo: 0, politicaId })

    // inmuebleReal: cargo vencido REAL para Overdue Portfolio % (fn_dashboard_cartera en vivo).
    inmuebleRealId = await crearInmueble(admin, tenant.id, tipoId, `CI-REAL-${String(Date.now())}`)
    const { data: periodo, error: errPeriodo } = await admin
      .from('periodos')
      .insert({ tenant_id: tenant.id, anio: 2026, mes: 1, estado: 'abierto', fecha_vencimiento: '2026-01-15' })
      .select('id')
      .single<{ id: string }>()
    if (errPeriodo) throw new Error(`fixture periodo: ${errPeriodo.message}`)
    const { data: concepto, error: errConcepto } = await admin
      .from('conceptos')
      .insert({ tenant_id: tenant.id, codigo: `CI-CONC-${String(Date.now())}`, nombre: 'Cuota', tipo_base: 'coeficiente', modo_calculo: 'distribucion', prioridad: 100, estado: 'activo' })
      .select('id')
      .single<{ id: string }>()
    if (errConcepto) throw new Error(`fixture concepto: ${errConcepto.message}`)
    const { data: liquidacion, error: errLiquidacion } = await admin
      .from('liquidaciones')
      .insert({ tenant_id: tenant.id, periodo_id: periodo.id, result_hash: `test-fixture-indicadores-liq-${String(Date.now())}`, tenant_total: 100_000 })
      .select('id')
      .single<{ id: string }>()
    if (errLiquidacion) throw new Error(`fixture liquidacion: ${errLiquidacion.message}`)
    const { data: linea, error: errLinea } = await admin
      .from('liquidacion_lineas')
      .insert({ tenant_id: tenant.id, liquidacion_id: liquidacion.id, inmueble_id: inmuebleRealId, concepto_id: concepto.id, monto: 100_000 })
      .select('id')
      .single<{ id: string }>()
    if (errLinea) throw new Error(`fixture liquidacion_linea: ${errLinea.message}`)
    const { error: errCargo } = await admin.from('cargos').insert({
      tenant_id: tenant.id,
      inmueble_id: inmuebleRealId,
      periodo_id: periodo.id,
      categoria: 'capital',
      origen_tipo: 'liquidacion_linea',
      liquidacion_linea_id: linea.id,
      concepto_id: concepto.id,
      monto_original: 100_000,
    })
    if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)
  }, 30_000)

  it('SNAPSHOT_NO_DISPONIBLE (422): sin snapshot para fecha_desde', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaIndicadores>('cartera-indicadores', {
      body: { tenant_id: tenant.id, fecha_desde: '2020-01-01', fecha_hasta: FECHA_HASTA },
    })
    expect(data).toBeNull()
    expect(response?.status).toBe(422)
  }, 30_000)

  it('Overdue Portfolio %, Cure Rate y Roll Rate se calculan correctamente contra la BD real', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaIndicadores>('cartera-indicadores', {
      body: { tenant_id: tenant.id, fecha_desde: FECHA_DESDE, fecha_hasta: FECHA_HASTA },
    })
    expect(response?.status).toBe(200)

    // inmuebleReal: 1 cargo, 100% vencido, sin cargo corriente → 100%.
    expect(data?.overduePortfolioPct).toBeCloseTo(100, 6)

    // Cure Rate: vencidos en t−1 = A(100_000) + B(50_000) = 150_000; curado = B(50_000) → 33.33%.
    expect(data?.cureRate).toBeCloseTo(100 / 3, 6)

    const temprana = data?.rollRatePorTramo.find((t) => t.tramoCodigo === 'MORA_TEMPRANA')
    expect(temprana?.tramoSiguienteCodigo).toBe('MORA_INICIAL')
    // A (100_000) roló de TEMPRANA a INICIAL; B (50_000) curó a AL_DIA (no cuenta como "rolado a INICIAL").
    // rollRate = 100_000 / (100_000 + 50_000) = 66.67%.
    expect(temprana?.rollRate).toBeCloseTo(200 / 3, 6)

    const alDia = data?.rollRatePorTramo.find((t) => t.tramoCodigo === 'AL_DIA')
    expect(alDia?.tramoSiguienteCodigo).toBe('MORA_TEMPRANA')
    expect(alDia?.rollRate).toBeCloseTo(0, 6) // C permaneció en AL_DIA.

    const inicial = data?.rollRatePorTramo.find((t) => t.tramoCodigo === 'MORA_INICIAL')
    expect(inicial?.tramoSiguienteCodigo).toBeNull() // último tramo de la política.
    expect(inicial?.rollRate).toBeNull()
  }, 30_000)
})
