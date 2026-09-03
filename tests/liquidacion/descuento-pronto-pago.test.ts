/**
 * D3 — Descuento por pronto pago (fn_aplicar_descuento_pronto_pago,
 * supabase/migrations/20260830650000_descuento_pronto_pago.sql).
 *
 * Auditoría externa 2026-08-26 (Docs/evaluacion/02, sección de huecos de
 * prueba): esta regla se implementó y se verificó a mano, pero nunca quedó
 * congelada en un test — a diferencia de todo lo demás en tests/liquidacion.
 * Este archivo cierra ese hueco.
 *
 * No pasa por simular-liquidacion/aplicar-liquidacion (innecesario: la regla
 * solo mira la forma de la fila en `cargos`, no cómo llegó ahí) — el cargo de
 * capital se inserta directo con el mismo patrón que usa
 * fn_aplicar_liquidacion (20260830590000), vía el cliente admin.
 *
 * Cada caso usa su propio tenant: politicas_financieras_vigente_unica
 * permite solo una política 'vigente' por tenant, y los casos necesitan
 * configuraciones distintas (modo, porcentaje, días).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
  crearMembership,
  formaPagoEfectivo,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type Cliente,
  type TenantPrueba,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/liquidacion/descuento-pronto-pago: faltan variables de Supabase en .env')
}

const CAPITAL = 100_000
const FECHA_VENCIMIENTO = '2031-01-10'

d('Descuento por pronto pago (D3)', () => {
  const admin = clienteAdmin(env!)
  let creador: UsuarioPrueba
  let formaPagoId: number
  const tenants: TenantPrueba[] = []

  beforeAll(async () => {
    formaPagoId = await formaPagoEfectivo(admin)
    creador = await crearUsuario(admin, 'd3-creador')
  })

  afterAll(async () => {
    // Arrastra en cascada inmuebles, periodos, política, liquidación, cargos, pagos.
    for (const tenant of tenants) await eliminarTenant(admin, tenant.id)
    if (creador) await eliminarUsuario(admin, creador.id)
  })

  interface Fixture {
    tenantId: string
    inmuebleId: string
    periodoId: string
    cargoCapitalId: string
  }

  /** Copropiedad de una unidad con un cargo de capital de $100.000 pendiente,
   * bajo la política de descuento que indique `overridesPolitica`. */
  async function fixtureConCargoCapital(
    etiqueta: string,
    overridesPolitica: Record<string, unknown>,
  ): Promise<Fixture> {
    const tenant = await crearTenant(admin, `d3-${etiqueta}`, creador.id)
    tenants.push(tenant)
    await crearMembership(admin, tenant.id, creador.id, 'auxiliar')

    const { data: tipo, error: errTipo } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'TIPO_INMUEBLE')
      .eq('codigo', 'apartamento')
      .is('tenant_id', null)
      .single<{ id: number }>()
    if (errTipo) throw new Error(`fixture tipo apartamento: ${errTipo.message}`)

    const { data: inmueble, error: errInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `D3-${etiqueta}`, tipo_id: tipo.id })
      .select('id')
      .single<{ id: string }>()
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)

    const { error: errPol } = await admin.from('politicas_financieras').insert({
      tenant_id: tenant.id,
      version: 1,
      estado: 'vigente',
      vigente_desde: '2031-01-01',
      redondeo_modo: 'half_up',
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto',
      coeficientes_suma_esperada: 1,
      policy_hash: `fixture-d3-${RUN_ID}-${etiqueta}`,
      ...overridesPolitica,
    })
    if (errPol) throw new Error(`fixture politica: ${errPol.message}`)

    const { data: periodo, error: errPer } = await admin
      .from('periodos')
      .insert({
        tenant_id: tenant.id,
        anio: 2031,
        mes: 1,
        fecha_vencimiento: FECHA_VENCIMIENTO,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPer) throw new Error(`fixture periodo: ${errPer.message}`)

    const { data: concepto, error: errCon } = await admin
      .from('conceptos')
      .insert({
        tenant_id: tenant.id,
        codigo: `CUOTA_D3_${etiqueta}`,
        nombre: 'Cuota de prueba D3',
        modo_calculo: 'distribucion',
        modo_valor: 'fijo',
        valor_fijo: CAPITAL,
        prioridad: 100,
        estado: 'activo',
        tipo_recurrencia: 'recurrente',
        periodicidad: 'mensual',
        fecha_inicio_anio: 2031,
        fecha_inicio_mes: 1,
        alcance: 'todos',
      })
      .select('id')
      .single<{ id: string }>()
    if (errCon) throw new Error(`fixture concepto: ${errCon.message}`)

    // Cargo de capital directo, con el mismo origen que produciría
    // fn_aplicar_liquidacion — la regla D3 solo mira la forma de esta fila,
    // no el estado de la liquidación que lo originó. guard_liquidacion_creacion
    // exige nacer en pre_liquidada/fallida (aplicar es una transición, no un
    // punto de partida) — no hace falta llevarla más allá para este test.
    const { data: liquidacion, error: errLiq } = await admin
      .from('liquidaciones')
      .insert({
        tenant_id: tenant.id,
        periodo_id: periodo.id,
        estado: 'pre_liquidada',
        result_hash: `fixture-d3-${RUN_ID}-${etiqueta}`,
        tenant_total: CAPITAL,
      })
      .select('id')
      .single<{ id: string }>()
    if (errLiq) throw new Error(`fixture liquidacion: ${errLiq.message}`)

    const { data: linea, error: errLinea } = await admin
      .from('liquidacion_lineas')
      .insert({
        tenant_id: tenant.id,
        liquidacion_id: liquidacion.id,
        inmueble_id: inmueble.id,
        concepto_id: concepto.id,
        monto: CAPITAL,
      })
      .select('id')
      .single<{ id: string }>()
    if (errLinea) throw new Error(`fixture liquidacion_linea: ${errLinea.message}`)

    const { data: cargo, error: errCargo } = await admin
      .from('cargos')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmueble.id,
        periodo_id: periodo.id,
        categoria: 'capital',
        origen_tipo: 'liquidacion_linea',
        liquidacion_linea_id: linea.id,
        concepto_id: concepto.id,
        monto_original: CAPITAL,
      })
      .select('id')
      .single<{ id: string }>()
    if (errCargo) throw new Error(`fixture cargo capital: ${errCargo.message}`)

    return {
      tenantId: tenant.id,
      inmuebleId: inmueble.id,
      periodoId: periodo.id,
      cargoCapitalId: cargo.id,
    }
  }

  async function pagar(
    admin: Cliente,
    fixture: Fixture,
    monto: number,
    fechaPago: string,
  ): Promise<void> {
    const { data: pago, error: errPago } = await admin
      .from('pagos')
      .insert({
        tenant_id: fixture.tenantId,
        inmueble_id: fixture.inmuebleId,
        monto,
        fecha_pago: fechaPago,
        fecha_registro: fechaPago,
        forma_pago_id: formaPagoId,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPago) throw new Error(`pago: ${errPago.message}`)

    // Dispara trg_descuento_pronto_pago (AFTER INSERT ... FOR EACH STATEMENT).
    const { error: errAplic } = await admin.from('pago_aplicaciones').insert({
      tenant_id: fixture.tenantId,
      pago_id: pago.id,
      cargo_id: fixture.cargoCapitalId,
      monto,
    })
    if (errAplic) throw new Error(`pago_aplicaciones: ${errAplic.message}`)
  }

  async function descuentoDe(fixture: Fixture): Promise<{ id: string; monto_original: number }[]> {
    const { data, error } = await admin
      .from('cargos')
      .select('id, monto_original')
      .eq('cargo_capital_origen_id', fixture.cargoCapitalId)
      .eq('origen_tipo', 'descuento')
    if (error) throw new Error(`lectura cargos descuento: ${error.message}`)
    return data
  }

  it('reduce_deuda: pagar el neto a tiempo emite el cargo negativo que cierra el saldo', async () => {
    const fixture = await fixtureConCargoCapital('reduce', {
      descuento_pronto_pago_porcentaje: 5,
      descuento_pronto_pago_dias: 5,
      descuento_pronto_pago_modo: 'reduce_deuda',
    })
    // Tope: 10 - 5 = 5 de enero. Cuota 100.000, descuento 5% = 5.000, neto 95.000.
    await pagar(admin, fixture, 95_000, '2031-01-05')

    const descuentos = await descuentoDe(fixture)
    expect(descuentos).toHaveLength(1)
    expect(descuentos[0]!.monto_original).toBe(-5_000)
  })

  it('saldo_a_favor: pagar solo el neto NO alcanza — hay que cubrir la cuota completa', async () => {
    const fixture = await fixtureConCargoCapital('favor-parcial', {
      descuento_pronto_pago_porcentaje: 5,
      descuento_pronto_pago_dias: 5,
      descuento_pronto_pago_modo: 'saldo_a_favor',
    })
    await pagar(admin, fixture, 95_000, '2031-01-05')

    expect(await descuentoDe(fixture)).toHaveLength(0)
  })

  it('saldo_a_favor: pagar la cuota completa a tiempo emite el descuento como crédito', async () => {
    const fixture = await fixtureConCargoCapital('favor-completo', {
      descuento_pronto_pago_porcentaje: 5,
      descuento_pronto_pago_dias: 5,
      descuento_pronto_pago_modo: 'saldo_a_favor',
    })
    await pagar(admin, fixture, 100_000, '2031-01-05')

    const descuentos = await descuentoDe(fixture)
    expect(descuentos).toHaveLength(1)
    expect(descuentos[0]!.monto_original).toBe(-5_000)
  })

  it('fuera del plazo: cubrir el neto después del tope no emite descuento', async () => {
    const fixture = await fixtureConCargoCapital('tarde', {
      descuento_pronto_pago_porcentaje: 5,
      descuento_pronto_pago_dias: 5,
      descuento_pronto_pago_modo: 'reduce_deuda',
    })
    // Tope: 5 de enero. Un día después ya no aplica.
    await pagar(admin, fixture, 95_000, '2031-01-06')

    expect(await descuentoDe(fixture)).toHaveLength(0)
  })

  it('política con descuento en 0 (default) nunca emite, aunque se pague completo y a tiempo', async () => {
    const fixture = await fixtureConCargoCapital('apagado', {})
    await pagar(admin, fixture, 100_000, '2031-01-01')

    expect(await descuentoDe(fixture)).toHaveLength(0)
  })

  it('idempotente: alcanzar el neto en dos pagos parciales emite un único descuento, no dos', async () => {
    const fixture = await fixtureConCargoCapital('parcial-idempotente', {
      descuento_pronto_pago_porcentaje: 5,
      descuento_pronto_pago_dias: 5,
      descuento_pronto_pago_modo: 'reduce_deuda',
    })
    // Dos pagos a tiempo que juntos cubren el neto (95.000): el primero no
    // alcanza el umbral todavía, el segundo lo completa.
    await pagar(admin, fixture, 50_000, '2031-01-03')
    expect(await descuentoDe(fixture)).toHaveLength(0)

    await pagar(admin, fixture, 45_000, '2031-01-05')
    const descuentos = await descuentoDe(fixture)
    expect(descuentos).toHaveLength(1)
    expect(descuentos[0]!.monto_original).toBe(-5_000)

    // Un tercer pago (p.ej. el residual que cubre lo que falta del capital
    // completo) no debe duplicar el descuento — not exists en
    // fn_aplicar_descuento_pronto_pago sobre cargo_capital_origen_id.
    await pagar(admin, fixture, 5_000, '2031-01-05')
    expect(await descuentoDe(fixture)).toHaveLength(1)
  })
})
