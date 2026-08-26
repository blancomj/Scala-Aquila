/**
 * calcular-intereses (Edge Function, HTTP real) — E6. Ejercita
 * calcularInteresMora() de punta a punta: capital vencido genera interés
 * proporcional a los días de mora, el tope de política se aplica, capital
 * dentro de gracia no genera nada, y una segunda corrida sobre el mismo
 * rango no duplica interés ya generado (idempotencia,
 * obtenerUltimaFechaInteresPorCapital).
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
  console.warn('SALTADO tests/tenancy/calcular-intereses: faltan variables de Supabase en .env')
}

interface RespuestaInteres {
  inmueble_id: string
  monto_generado: string
  tope_aplicado: boolean
}

// S2 (auditoría 2026-08-26, 20260901110000): desde ahora toda política que
// declare interes_tasa_mensual/interes_tope_mensual exige también declarar
// interes_tipo_tasa/interes_multiplicador. tasas_referencia es GLOBAL y
// append-only (sin borrado posible) — se busca una fila que ya cubra
// 2026-01-01 antes de insertar, para que una segunda corrida de este archivo
// no choque contra tasas_referencia_sin_solape con la que dejó la primera.
// valor_mensual=0.05 da un tope de 1.5×0.05=0.075, por encima de cualquier
// interes_tasa_mensual/interes_tope_mensual que usan las fixtures de este
// archivo (0.02/0.03/0.05) — no cambia el interés que se está probando.
async function asegurarTasaReferenciaDePrueba(admin: Cliente): Promise<void> {
  const { data: existente, error: errSel } = await admin
    .from('tasas_referencia')
    .select('id')
    .eq('tipo_tasa', 'ibc_consumo_ordinario')
    .lte('vigente_desde', '2026-01-01')
    .or('vigente_hasta.is.null,vigente_hasta.gte.2026-01-01')
    .limit(1)
  if (errSel) throw new Error(`lectura tasas_referencia: ${errSel.message}`)
  if (existente.length > 0) return

  const { error: errIns } = await admin.from('tasas_referencia').insert({
    tipo_tasa: 'ibc_consumo_ordinario',
    vigente_desde: '2026-01-01',
    vigente_hasta: '2026-12-31',
    valor_ea: 0.6,
    valor_mensual: 0.05,
    resolucion_numero: 'TEST-CALC-INTERESES-2026',
    resolucion_fecha: '2026-01-01',
    entidad_fuente: 'Dato de prueba automatizado — no es una tasa real',
  })
  if (errIns) throw new Error(`fixture tasas_referencia: ${errIns.message}`)
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

async function crearCargoCapital(
  admin: Cliente,
  tenantId: string,
  inmuebleId: string,
  periodoId: string,
  monto: number,
): Promise<string> {
  const { data: concepto, error: errConcepto } = await admin
    .from('conceptos')
    .insert({
      tenant_id: tenantId,
      codigo: `CI-${String(Date.now())}-${String(Math.random()).slice(2, 6)}`,
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

  const { data: liquidacion, error: errLiquidacion } = await admin
    .from('liquidaciones')
    .insert({
      tenant_id: tenantId,
      periodo_id: periodoId,
      result_hash: `test-fixture-${String(Date.now())}-${String(Math.random())}`,
      tenant_total: monto,
    })
    .select('id')
    .single<{ id: string }>()
  if (errLiquidacion) throw new Error(`fixture liquidacion: ${errLiquidacion.message}`)

  const { data: linea, error: errLinea } = await admin
    .from('liquidacion_lineas')
    .insert({
      tenant_id: tenantId,
      liquidacion_id: liquidacion.id,
      inmueble_id: inmuebleId,
      concepto_id: concepto.id,
      monto,
    })
    .select('id')
    .single<{ id: string }>()
  if (errLinea) throw new Error(`fixture liquidacion_linea: ${errLinea.message}`)

  const { data: cargo, error: errCargo } = await admin
    .from('cargos')
    .insert({
      tenant_id: tenantId,
      inmueble_id: inmuebleId,
      periodo_id: periodoId,
      categoria: 'capital',
      origen_tipo: 'liquidacion_linea',
      liquidacion_linea_id: linea.id,
      concepto_id: concepto.id,
      monto_original: monto,
    })
    .select('id')
    .single<{ id: string }>()
  if (errCargo) throw new Error(`fixture cargo capital: ${errCargo.message}`)
  return cargo.id
}

d('calcular-intereses (Edge Function)', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente
  let inmuebleId: string
  let inmuebleGraciaId: string

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
  })

  it('setup', async () => {
    agente = await crearUsuario(admin, 'ci-agent')
    tenant = await crearTenant(admin, 'ci', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    clienteAgent = await clienteComo(env!, agente)

    await asegurarTasaReferenciaDePrueba(admin)
    const { error: errPolitica } = await admin.from('politicas_financieras').insert({
      tenant_id: tenant.id,
      version: 1,
      estado: 'vigente',
      vigente_desde: '2026-01-01',
      redondeo_modo: 'half_up',
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto',
      coeficientes_suma_esperada: 1,
      policy_hash: 'test-fixture-hash',
      interes_tasa_mensual: 0.03,
      interes_tope_mensual: 0.02,
      interes_dias_gracia: 5,
      interes_tipo_tasa: 'ibc_consumo_ordinario',
      interes_multiplicador: 1.5,
    })
    if (errPolitica) throw new Error(`fixture politica: ${errPolitica.message}`)

    const tipoId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `CI-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)
    inmuebleId = inmueble.id

    const { data: inmuebleGracia, error: errInmuebleGracia } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `CI-GRACIA-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInmuebleGracia) throw new Error(`fixture inmueble gracia: ${errInmuebleGracia.message}`)
    inmuebleGraciaId = inmuebleGracia.id
  }, 30_000)

  it('un agent sin acceso a otro tenant no puede calcular intereses (403 por 404 previo, o 403 directo)', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaInteres[]>(
      'calcular-intereses',
      {
        body: { tenant_id: '00000000-0000-0000-0000-000000000000', fecha_referencia: '2026-01-11' },
      },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(403)
  }, 30_000)

  it('capital vencido genera interés proporcional a los días de mora; tope se aplica', async () => {
    const { data: periodo, error: errPeriodo } = await admin
      .from('periodos')
      .insert({
        tenant_id: tenant.id,
        anio: 2026,
        mes: 1,
        estado: 'abierto',
        fecha_vencimiento: '2026-01-01',
      })
      .select('id')
      .single<{ id: string }>()
    if (errPeriodo) throw new Error(`fixture periodo: ${errPeriodo.message}`)

    await crearCargoCapital(admin, tenant.id, inmuebleId, periodo.id, 100_000)

    // días de mora = (11 - 1) - 5 gracia = 5. tasa efectiva = min(0.03, 0.02) = 0.02.
    // interes = 100_000 * (0.02/30) * 5 = 333.33 → HALF_UP escala 0 → 333.
    const { data, response } = await clienteAgent.functions.invoke<RespuestaInteres[]>(
      'calcular-intereses',
      { body: { tenant_id: tenant.id, fecha_referencia: '2026-01-11' } },
    )
    expect(response?.status).toBe(200)
    const fila = data?.find((f) => f.inmueble_id === inmuebleId)
    expect(fila?.monto_generado).toBe('333')
    expect(fila?.tope_aplicado).toBe(true)
  }, 30_000)

  it('capital dentro del periodo de gracia no genera interés', async () => {
    const { data: periodo, error: errPeriodo } = await admin
      .from('periodos')
      .insert({
        tenant_id: tenant.id,
        anio: 2026,
        mes: 2,
        estado: 'abierto',
        fecha_vencimiento: '2026-02-01',
      })
      .select('id')
      .single<{ id: string }>()
    if (errPeriodo) throw new Error(`fixture periodo: ${errPeriodo.message}`)

    await crearCargoCapital(admin, tenant.id, inmuebleGraciaId, periodo.id, 50_000)

    // 3 días transcurridos, gracia = 5 → sin mora.
    const { data, response } = await clienteAgent.functions.invoke<RespuestaInteres[]>(
      'calcular-intereses',
      { body: { tenant_id: tenant.id, fecha_referencia: '2026-02-04' } },
    )
    expect(response?.status).toBe(200)
    expect(data?.find((f) => f.inmueble_id === inmuebleGraciaId)).toBeUndefined()
  }, 30_000)

  it('idempotencia: una segunda corrida sobre el mismo rango no duplica interés', async () => {
    const { data: primeraLista, error: errPrimera } = await admin
      .from('cargos')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('inmueble_id', inmuebleId)
      .eq('origen_tipo', 'interes')
    expect(errPrimera).toBeNull()
    const cantidadPrevia = primeraLista?.length ?? 0
    expect(cantidadPrevia).toBeGreaterThan(0)

    // Misma fecha_referencia que la corrida anterior — no deberían quedar
    // días nuevos por devengar sobre el mismo cargo de capital.
    const { response } = await clienteAgent.functions.invoke<RespuestaInteres[]>(
      'calcular-intereses',
      { body: { tenant_id: tenant.id, fecha_referencia: '2026-01-11' } },
    )
    expect(response?.status).toBe(200)

    const { data: segundaLista, error: errSegunda } = await admin
      .from('cargos')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('inmueble_id', inmuebleId)
      .eq('origen_tipo', 'interes')
    expect(errSegunda).toBeNull()
    expect(segundaLista).toHaveLength(cantidadPrevia)
  }, 30_000)
})

// REQ-NOVEDAD-003 (D-23) — tenant/política aparte: la política vigente no
// puede modificarse una vez creada (guard_politica_inmutable), así que el
// caso descuento_antes_interes necesita su propia fixture desde cero.
d('calcular-intereses (Edge Function) — REQ-NOVEDAD-003: descuento_antes_interes', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
  })

  it('un DISCOUNT del mismo período reduce la base de capital antes del interés', async () => {
    agente = await crearUsuario(admin, 'ci-desc-agent')
    tenant = await crearTenant(admin, 'ci-desc', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    clienteAgent = await clienteComo(env!, agente)

    await asegurarTasaReferenciaDePrueba(admin)
    const { error: errPolitica } = await admin.from('politicas_financieras').insert({
      tenant_id: tenant.id,
      version: 1,
      estado: 'vigente',
      vigente_desde: '2026-01-01',
      redondeo_modo: 'half_up',
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto',
      coeficientes_suma_esperada: 1,
      policy_hash: 'test-fixture-hash-descuento',
      interes_tasa_mensual: 0.03,
      interes_tope_mensual: 0.05,
      interes_dias_gracia: 0,
      interes_descuento_orden: 'descuento_antes_interes',
      interes_tipo_tasa: 'ibc_consumo_ordinario',
      interes_multiplicador: 1.5,
    })
    if (errPolitica) throw new Error(`fixture politica: ${errPolitica.message}`)

    const tipoId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `CI-DESC-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)

    const { data: periodo, error: errPeriodo } = await admin
      .from('periodos')
      .insert({
        tenant_id: tenant.id,
        anio: 2026,
        mes: 1,
        estado: 'abierto',
        fecha_vencimiento: '2026-01-01',
      })
      .select('id')
      .single<{ id: string }>()
    if (errPeriodo) throw new Error(`fixture periodo: ${errPeriodo.message}`)

    await crearCargoCapital(admin, tenant.id, inmueble.id, periodo.id, 100_000)

    // DISCOUNT ya aprobado — se inserta directo el par novedad+cargo (mismo
    // efecto que fn_aprobar_novedad), no se ejercita el flujo de aprobación
    // aquí, ya cubierto por tests/tenancy/novedades.test.ts.
    const { data: novedad, error: errNovedad } = await admin
      .from('novedades')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmueble.id,
        tipo: 'DISCOUNT',
        monto: -30_000,
        descripcion: 'fixture descuento REQ-NOVEDAD-003',
        fecha_efectiva: '2026-01-01',
        estado: 'aprobada',
        created_by: agente.id,
        approved_by: agente.id,
        approved_at: new Date().toISOString(),
      })
      .select('id')
      .single<{ id: string }>()
    if (errNovedad) throw new Error(`fixture novedad: ${errNovedad.message}`)

    const { error: errCargoDescuento } = await admin.from('cargos').insert({
      tenant_id: tenant.id,
      inmueble_id: inmueble.id,
      periodo_id: periodo.id,
      categoria: 'otro',
      origen_tipo: 'novedad',
      novedad_id: novedad.id,
      monto_original: -30_000,
    })
    if (errCargoDescuento) throw new Error(`fixture cargo descuento: ${errCargoDescuento.message}`)

    // días de mora = 10, sin gracia. base = 100_000 - 30_000 = 70_000.
    // interes = 70_000 * (0.03/30) * 10 = 700.
    const { data, response } = await clienteAgent.functions.invoke<RespuestaInteres[]>(
      'calcular-intereses',
      { body: { tenant_id: tenant.id, fecha_referencia: '2026-01-11' } },
    )
    expect(response?.status).toBe(200)
    const fila = data?.find((f) => f.inmueble_id === inmueble.id)
    expect(fila?.monto_generado).toBe('700')
  }, 30_000)
})

// H3/H4 (auditoría externa 2026-08-26) — tenant/política aparte, mismo
// criterio que el describe anterior.
d('calcular-intereses (Edge Function) — H3/H4: compensa_creditos entre periodos', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
  })

  it('un CREDIT de enero compensa la mora de un capital vencido en febrero', async () => {
    agente = await crearUsuario(admin, 'ci-cred-agent')
    tenant = await crearTenant(admin, 'ci-cred', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    clienteAgent = await clienteComo(env!, agente)

    await asegurarTasaReferenciaDePrueba(admin)
    const { error: errPolitica } = await admin.from('politicas_financieras').insert({
      tenant_id: tenant.id,
      version: 1,
      estado: 'vigente',
      vigente_desde: '2026-01-01',
      redondeo_modo: 'half_up',
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto',
      coeficientes_suma_esperada: 1,
      policy_hash: 'test-fixture-hash-credito',
      interes_tasa_mensual: 0.03,
      interes_tope_mensual: 0.05,
      interes_dias_gracia: 0,
      interes_descuento_orden: 'descuento_antes_interes',
      interes_mora_compensa_creditos: true,
      interes_tipo_tasa: 'ibc_consumo_ordinario',
      interes_multiplicador: 1.5,
    })
    if (errPolitica) throw new Error(`fixture politica: ${errPolitica.message}`)

    const tipoId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `CI-CRED-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)

    const { data: periodoEnero, error: errPeriodoEnero } = await admin
      .from('periodos')
      .insert({
        tenant_id: tenant.id,
        anio: 2026,
        mes: 1,
        estado: 'abierto',
        fecha_vencimiento: '2026-01-01',
      })
      .select('id')
      .single<{ id: string }>()
    if (errPeriodoEnero) throw new Error(`fixture periodo enero: ${errPeriodoEnero.message}`)

    const { data: periodoFebrero, error: errPeriodoFebrero } = await admin
      .from('periodos')
      .insert({
        tenant_id: tenant.id,
        anio: 2026,
        mes: 2,
        estado: 'abierto',
        fecha_vencimiento: '2026-02-01',
      })
      .select('id')
      .single<{ id: string }>()
    if (errPeriodoFebrero) throw new Error(`fixture periodo febrero: ${errPeriodoFebrero.message}`)

    await crearCargoCapital(admin, tenant.id, inmueble.id, periodoFebrero.id, 100_000)

    // CREDIT de enero — un periodo distinto del capital que causa mora en
    // febrero. Con el pool acumulado (H3/H4), esto sí compensa; antes de
    // esta fase el mecanismo solo miraba el mismo periodo del capital.
    const { data: novedad, error: errNovedad } = await admin
      .from('novedades')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmueble.id,
        tipo: 'CREDIT',
        monto: -20_000,
        descripcion: 'fixture crédito H3/H4',
        fecha_efectiva: '2026-01-15',
        estado: 'aprobada',
        created_by: agente.id,
        approved_by: agente.id,
        approved_at: new Date().toISOString(),
      })
      .select('id')
      .single<{ id: string }>()
    if (errNovedad) throw new Error(`fixture novedad: ${errNovedad.message}`)

    const { error: errCargoCredito } = await admin.from('cargos').insert({
      tenant_id: tenant.id,
      inmueble_id: inmueble.id,
      periodo_id: periodoEnero.id,
      categoria: 'otro',
      origen_tipo: 'novedad',
      novedad_id: novedad.id,
      monto_original: -20_000,
    })
    if (errCargoCredito) throw new Error(`fixture cargo crédito: ${errCargoCredito.message}`)

    // días de mora = 10, sin gracia. base = 100_000 - 20_000 (pool de enero) = 80_000.
    // interes = 80_000 * (0.03/30) * 10 = 800 — sin compensar entre periodos sería 1000.
    const { data, response } = await clienteAgent.functions.invoke<RespuestaInteres[]>(
      'calcular-intereses',
      { body: { tenant_id: tenant.id, fecha_referencia: '2026-02-11' } },
    )
    expect(response?.status).toBe(200)
    const fila = data?.find((f) => f.inmueble_id === inmueble.id)
    expect(fila?.monto_generado).toBe('800')
  }, 30_000)
})
