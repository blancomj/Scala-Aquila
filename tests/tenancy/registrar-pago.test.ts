/**
 * registrar-pago (Edge Function, HTTP real) — E5. Ejercita imputarPago()
 * de punta a punta sobre un ledger real: orden interés→capital→otro, las
 * dos estrategias de imputación (AD-36), y sobrepago sin fila especial
 * (AD-34, PlanImputacion.noAplicado).
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
  console.warn('SALTADO tests/tenancy/registrar-pago: faltan variables de Supabase en .env')
}

interface RespuestaPago {
  pago_id: string
  aplicado: string
  no_aplicado: string
  aplicaciones: { cargo_id: string; monto: string }[]
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

async function listaTipoId(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

/** Política vigente + inmueble, con la estrategia de imputación indicada. */
async function armarTenant(
  admin: Cliente,
  tenantId: string,
  estrategia: 'deuda_mas_antigua' | 'periodo_actual',
): Promise<string> {
  const { error: errPolitica } = await admin.from('politicas_financieras').insert({
    tenant_id: tenantId,
    version: 1,
    estado: 'vigente',
    vigente_desde: '2026-01-01',
    redondeo_modo: 'half_up',
    redondeo_escala: 0,
    residual_metodo: 'mayor_resto',
    coeficientes_suma_esperada: 1,
    policy_hash: 'test-fixture-hash',
    imputacion_orden: ['interes', 'capital', 'otro'],
    imputacion_estrategia: estrategia,
  })
  if (errPolitica) throw new Error(`fixture politica: ${errPolitica.message}`)

  const tipoId = await tipoApartamentoId(admin)
  const { data: inmueble, error: errInmueble } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo: `PAGO-${String(Date.now())}`, tipo_id: tipoId })
    .select('id')
    .single<{ id: string }>()
  if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)

  return inmueble.id
}

/** Un periodo con fecha_vencimiento (requerida por obtenerCargosAbiertos). */
async function crearPeriodo(
  admin: Cliente,
  tenantId: string,
  anio: number,
  mes: number,
  fechaVencimiento: string,
): Promise<string> {
  const { data, error } = await admin
    .from('periodos')
    .insert({
      tenant_id: tenantId,
      anio,
      mes,
      estado: 'abierto',
      fecha_vencimiento: fechaVencimiento,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture periodo: ${error.message}`)
  return data.id
}

/** Cargo categoria=capital vía el camino real (liquidacion+liquidacion_linea). */
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
      codigo: `CONCEPTO-${String(Date.now())}-${String(Math.random()).slice(2, 6)}`,
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

async function crearCargoInteres(
  admin: Cliente,
  tenantId: string,
  inmuebleId: string,
  periodoId: string,
  cargoCapitalOrigenId: string,
  monto: number,
): Promise<string> {
  const { data, error } = await admin
    .from('cargos')
    .insert({
      tenant_id: tenantId,
      inmueble_id: inmuebleId,
      periodo_id: periodoId,
      categoria: 'interes',
      origen_tipo: 'interes',
      cargo_capital_origen_id: cargoCapitalOrigenId,
      monto_original: monto,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture cargo interes: ${error.message}`)
  return data.id
}

d('registrar-pago (Edge Function)', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let auditor: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente
  let clienteAuditor: Cliente
  let inmuebleId: string
  let periodoViejoId: string
  let periodoActualId: string

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, auditor.id)
  })

  it('setup', async () => {
    agente = await crearUsuario(admin, 'rp-agent')
    auditor = await crearUsuario(admin, 'rp-auditor')
    tenant = await crearTenant(admin, 'rp', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    clienteAgent = await clienteComo(env!, agente)
    clienteAuditor = await clienteComo(env!, auditor)

    inmuebleId = await armarTenant(admin, tenant.id, 'deuda_mas_antigua')
    periodoViejoId = await crearPeriodo(admin, tenant.id, 2026, 11, '2026-11-05')
    periodoActualId = await crearPeriodo(admin, tenant.id, 2026, 12, '2026-12-05')
  }, 30_000)

  it('un auditor no puede registrar pagos (403)', async () => {
    const { data, response } = await clienteAuditor.functions.invoke<RespuestaPago>(
      'registrar-pago',
      { body: { inmueble_id: inmuebleId, monto: 1000, fecha_pago: '2026-12-10' } },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(403)
  }, 30_000)

  it('pago parcial: interés antes que capital dentro del mismo periodo', async () => {
    const capitalId = await crearCargoCapital(
      admin,
      tenant.id,
      inmuebleId,
      periodoActualId,
      100_000,
    )
    const interesId = await crearCargoInteres(
      admin,
      tenant.id,
      inmuebleId,
      periodoActualId,
      capitalId,
      10_000,
    )

    const { data, response } = await clienteAgent.functions.invoke<RespuestaPago>(
      'registrar-pago',
      {
        body: { inmueble_id: inmuebleId, monto: 15_000, fecha_pago: '2026-12-10' },
      },
    )
    expect(response?.status).toBe(200)
    expect(data?.aplicaciones).toEqual([
      { cargo_id: interesId, monto: '10000' },
      { cargo_id: capitalId, monto: '5000' },
    ])
    expect(data?.no_aplicado).toBe('0')

    const { data: saldo } = await admin
      .from('v_cargo_saldo')
      .select('id, monto_pendiente')
      .eq('id', capitalId)
      .single()
    expect(Number(saldo?.monto_pendiente)).toBe(95_000)
  }, 30_000)

  it('pago que cruza dos periodos: cubre el periodo más viejo primero (deuda_mas_antigua)', async () => {
    const capitalViejoId = await crearCargoCapital(
      admin,
      tenant.id,
      inmuebleId,
      periodoViejoId,
      20_000,
    )

    const { data, response } = await clienteAgent.functions.invoke<RespuestaPago>(
      'registrar-pago',
      {
        body: { inmueble_id: inmuebleId, monto: 20_000, fecha_pago: '2026-12-11' },
      },
    )
    expect(response?.status).toBe(200)
    // El periodo viejo (2026-11) se cubre antes que cualquier remanente del actual.
    expect(data?.aplicaciones[0]?.cargo_id).toBe(capitalViejoId)
    expect(data?.aplicaciones[0]?.monto).toBe('20000')
  }, 30_000)

  it('pago que excede todo lo pendiente: no_aplicado > 0, sin fila especial (AD-34)', async () => {
    // Inmueble propio para este caso — los anteriores de este describe ya
    // dejaron saldo pendiente sobre `inmuebleId` y contaminarían el cálculo
    // de "excede todo lo pendiente".
    const tipoId = await tipoApartamentoId(admin)
    const { data: otroInmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({
        tenant_id: tenant.id,
        codigo: `PAGO-EXCESO-${String(Date.now())}`,
        tipo_id: tipoId,
      })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)

    const periodoExcesoId = await crearPeriodo(admin, tenant.id, 2027, 1, '2027-01-05')
    const capitalId = await crearCargoCapital(
      admin,
      tenant.id,
      otroInmueble.id,
      periodoExcesoId,
      5_000,
    )

    const { data, response } = await clienteAgent.functions.invoke<RespuestaPago>(
      'registrar-pago',
      {
        body: { inmueble_id: otroInmueble.id, monto: 50_000, fecha_pago: '2026-12-12' },
      },
    )
    expect(response?.status).toBe(200)
    expect(data?.no_aplicado).toBe('45000')
    expect(data?.aplicaciones).toEqual([{ cargo_id: capitalId, monto: '5000' }])

    const { data: pagos, error } = await admin
      .from('pagos')
      .select('id')
      .eq('inmueble_id', otroInmueble.id)
      .eq('monto', 50_000)
    expect(error).toBeNull()
    expect(pagos).toHaveLength(1)
  }, 30_000)

  it('con pagador marcado pero sin plantilla activa, el pago igual responde 200 (SMS es mejor esfuerzo)', async () => {
    // Deliberadamente SIN activar la plantilla: BREVO_API_KEY/BREVO_SMS_SENDER
    // son credenciales REALES en este proyecto de desarrollo (verificado con
    // `supabase secrets list`), no un mock — mismo motivo que
    // tests/plantillas-sms/plantillas-sms.test.ts prueba solo hasta la capa
    // de RPC y nunca invoca la Edge Function que sí envía: un test
    // automatizado no debe poder disparar un SMS real. Este caso llega hasta
    // el JOIN inmueble_persona_rol→terceros (ejercita esa consulta de
    // verdad) y se detiene en "sin plantilla activa", antes de sendSms().
    const tipoId = await tipoApartamentoId(admin)
    const { data: inmuebleSms, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `PAGO-SMS-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)

    const tipoIdentCedula = await listaTipoId(admin, 'TIPO_IDENTIFICACION', 'cedula')
    const estadoActivo = await listaTipoId(admin, 'ESTADO_TERCERO', 'activo')
    const { data: tercero, error: errTercero } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_identificacion_id: tipoIdentCedula,
        numero_documento: `RP-SMS-${String(Date.now())}`,
        tipo_persona: 'natural',
        primer_nombre: 'Laura',
        primer_apellido: 'Pérez',
        telefono: '+573001234567',
        estado_id: estadoActivo,
      })
      .select('id')
      .single<{ id: string }>()
    if (errTercero) throw new Error(`fixture tercero: ${errTercero.message}`)

    const rolCopropietario = await listaTipoId(admin, 'PERSONA_PREDIO', 'copropietario')
    const { error: errRol } = await admin.from('inmueble_persona_rol').insert({
      tenant_id: tenant.id,
      inmueble_id: inmuebleSms.id,
      tercero_id: tercero.id,
      rol_id: rolCopropietario,
      vigente_desde: '2026-01-01',
      es_pagador: true,
      recibe_notificaciones: true,
    })
    if (errRol) throw new Error(`fixture inmueble_persona_rol: ${errRol.message}`)

    const periodoSmsId = await crearPeriodo(admin, tenant.id, 2027, 2, '2027-02-05')
    const capitalId = await crearCargoCapital(admin, tenant.id, inmuebleSms.id, periodoSmsId, 30_000)

    const { data, response } = await clienteAgent.functions.invoke<RespuestaPago>('registrar-pago', {
      body: { inmueble_id: inmuebleSms.id, monto: 30_000, fecha_pago: '2027-02-06' },
    })
    expect(response?.status).toBe(200)
    expect(data?.aplicaciones).toEqual([{ cargo_id: capitalId, monto: '30000' }])
  }, 30_000)
})

d('registrar-pago — estrategia periodo_actual (AD-36)', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente
  let inmuebleId: string
  let periodoViejoId: string
  let periodoActualId: string

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
  })

  it('prioriza el periodo del pago sobre la deuda más vieja', async () => {
    agente = await crearUsuario(admin, 'rp-pa-agent')
    tenant = await crearTenant(admin, 'rp-pa', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    clienteAgent = await clienteComo(env!, agente)

    inmuebleId = await armarTenant(admin, tenant.id, 'periodo_actual')
    periodoViejoId = await crearPeriodo(admin, tenant.id, 2026, 11, '2026-11-05')
    periodoActualId = await crearPeriodo(admin, tenant.id, 2026, 12, '2026-12-05')

    const capitalViejoId = await crearCargoCapital(
      admin,
      tenant.id,
      inmuebleId,
      periodoViejoId,
      30_000,
    )
    const capitalActualId = await crearCargoCapital(
      admin,
      tenant.id,
      inmuebleId,
      periodoActualId,
      30_000,
    )

    const { data, response } = await clienteAgent.functions.invoke<RespuestaPago>(
      'registrar-pago',
      {
        body: { inmueble_id: inmuebleId, monto: 40_000, fecha_pago: '2026-12-15' },
      },
    )
    expect(response?.status).toBe(200)
    // periodo_actual: el cargo del periodo del pago (2026-12) se cubre primero.
    expect(data?.aplicaciones).toEqual([
      { cargo_id: capitalActualId, monto: '30000' },
      { cargo_id: capitalViejoId, monto: '10000' },
    ])
  }, 30_000)
})
