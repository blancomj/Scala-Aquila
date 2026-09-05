/**
 * BLOQUE K (GAP-22, D-38) — el circuito de cobro del fondo de imprevistos,
 * de punta a punta: concepto → fórmula (PORCENTAJE de AEL) → liquidación →
 * cargo → recaudo → aporte al fondo → contabilidad.
 *
 * Verificado antes contra la base real con un script ad-hoc (ver D-38 y
 * ANALISIS_FONDOS_BLOQUE_A.md §4.4/§4.6) — esto es la versión formal.
 *
 * Usa la Edge Function create-tenant (no crearTenant() de helpers.ts): solo
 * el alta real deja la parametrización contable completa (145 cuentas,
 * contable_cuenta_default con CARTERA_FONDO_IMPREVISTOS/INGRESO_FONDO_IMPREVISTOS)
 * y el fondo de imprevistos ya instanciado (GAP-22, bloque "alta de
 * copropiedad") — sin eso, CARTERA_FONDO_IMPREVISTOS/INGRESO_FONDO_IMPREVISTOS
 * no tendrían cuenta mapeada y el propio guard de escritura lo rechazaría.
 *
 * Un solo periodo sembrado (no los 12 del año): ejecutarDistribucion() reparte
 * el 100% del valor anual del concepto a ese único periodo (Paso 1, PLAN
 * §6.5) — mismo comportamiento para ADMINISTRACION que para FONDO_IMPREVISTOS,
 * no es nada específico de este bloque. Con los 12 periodos reales, cada uno
 * recibiría 1/12.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  clienteComo,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type Cliente,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/liquidacion/fondo-imprevistos-cuota: faltan variables de Supabase en .env')
}

interface RespuestaCrearTenant {
  tenant: { id: string; slug: string }
}

interface RespuestaSimular {
  liquidacion_id: string
}

interface RespuestaPago {
  pago_id: string
}

const MONTO_TOTAL_PRESUPUESTO = 120_000_000
const PORCENTAJE_FONDO = 1

async function activarConcepto(admin: Cliente, tenantId: string, codigo: string): Promise<string> {
  const { data: con, error } = await admin
    .from('conceptos')
    .select('id, estado')
    .eq('tenant_id', tenantId)
    .eq('codigo', codigo)
    .single<{ id: string; estado: string }>()
  if (error) throw new Error(`concepto ${codigo}: ${error.message}`)
  expect(con.estado).toBe('borrador')

  let r = await admin.from('conceptos').update({ estado: 'en_revision' }).eq('id', con.id)
  if (r.error) throw r.error
  r = await admin.from('conceptos').update({ estado: 'activo' }).eq('id', con.id)
  if (r.error) throw r.error
  return con.id
}

d('BLOQUE K — circuito de cobro del fondo de imprevistos (GAP-22, D-38)', () => {
  const admin = clienteAdmin(env!)
  let usuario: UsuarioPrueba
  let cAdm: Cliente
  let tenantId: string
  let fondoImprevistosId: string
  let periodoId: string
  let cargosFondo: { id: string; monto_original: number; inmueble_id: string }[]

  beforeAll(async () => {
    usuario = await crearUsuario(admin, 'fondo-cuota')
    cAdm = await clienteComo(env!, usuario)

    const { data, response } = await cAdm.functions.invoke<RespuestaCrearTenant>('create-tenant', {
      body: { name: 'Fondo cuota BLOQUE K', slug: `t-${RUN_ID}-fondo-cuota` },
    })
    if (!response || response.status !== 200 || !data) {
      throw new Error(`create-tenant: HTTP ${String(response?.status)}`)
    }
    tenantId = data.tenant.id

    await activarConcepto(admin, tenantId, 'ADMINISTRACION')
    await activarConcepto(admin, tenantId, 'FONDO_IMPREVISTOS')

    const { data: fondo, error: errFondo } = await admin
      .from('fondos')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('naturaleza', 'imprevistos')
      .single<{ id: string }>()
    if (errFondo) throw new Error(`fondo de imprevistos (nacido con el alta): ${errFondo.message}`)
    fondoImprevistosId = fondo.id

    // create-tenant siembra el plan/presupuesto contable pero no una política
    // financiera vigente (nadie la exige al alta hoy) — se crea aquí si no
    // existe, igual que hace cada test que corre una liquidación real.
    const { data: polExistente } = await admin
      .from('politicas_financieras')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('estado', 'vigente')
      .maybeSingle<{ id: string }>()

    if (polExistente) {
      const { error: errPol } = await admin
        .from('politicas_financieras')
        .update({ fondo_imprevistos_porcentaje: PORCENTAJE_FONDO, fondo_imprevistos_base: 'presupuesto_anual' })
        .eq('id', polExistente.id)
      if (errPol) throw new Error(`política financiera: ${errPol.message}`)
    } else {
      const { error: errPol } = await admin.from('politicas_financieras').insert({
        tenant_id: tenantId,
        version: 1,
        estado: 'vigente',
        vigente_desde: '2031-01-01',
        redondeo_modo: 'half_up',
        redondeo_escala: 0,
        residual_metodo: 'mayor_resto',
        coeficientes_suma_esperada: 1,
        policy_hash: 'fixture-fondo-cuota',
        fondo_imprevistos_porcentaje: PORCENTAJE_FONDO,
        fondo_imprevistos_base: 'presupuesto_anual',
      })
      if (errPol) throw new Error(`política financiera: ${errPol.message}`)
    }

    const { data: tipoApto, error: errTipo } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'TIPO_INMUEBLE')
      .eq('codigo', 'apartamento')
      .is('tenant_id', null)
      .single<{ id: number }>()
    if (errTipo) throw new Error(`fixture tipo apartamento: ${errTipo.message}`)

    const { data: inmuebles, error: errInm } = await admin
      .from('inmuebles')
      .insert(
        Array.from({ length: 3 }, (_, i) => ({
          tenant_id: tenantId,
          codigo: `K-${String(i + 1)}`,
          tipo_id: tipoApto.id,
        })),
      )
      .select('id')
    if (errInm) throw new Error(`fixture inmuebles: ${errInm.message}`)

    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .insert({ tenant_id: tenantId, version: 1, vigente_desde: '2031-01-01', estado: 'borrador', suma_total: 1 })
      .select('id')
      .single<{ id: string }>()
    if (errSet) throw new Error(`fixture set: ${errSet.message}`)
    const { error: errCoef } = await admin
      .from('coeficientes')
      .insert(inmuebles.map((i) => ({ tenant_id: tenantId, set_id: set.id, inmueble_id: i.id, valor: 1 / 3 })))
    if (errCoef) throw new Error(`fixture coeficientes: ${errCoef.message}`)
    await admin.from('coeficiente_sets').update({ estado: 'vigente' }).eq('id', set.id)

    const { data: presupuesto, error: errPre } = await admin
      .from('presupuestos')
      .insert({ tenant_id: tenantId, anio: 2031, version: 1, estado: 'vigente', monto_total: MONTO_TOTAL_PRESUPUESTO })
      .select('id')
      .single<{ id: string }>()
    if (errPre) throw new Error(`fixture presupuesto: ${errPre.message}`)

    const { data: cuentaEgreso, error: errCE } = await admin
      .from('presupuesto_cuenta')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('naturaleza', 'egreso')
      .eq('es_hoja', true)
      .limit(1)
      .single<{ id: string }>()
    if (errCE) throw new Error(`fixture cuenta egreso: ${errCE.message}`)
    const { error: errRubro } = await admin.from('presupuesto_rubros').insert({
      tenant_id: tenantId,
      presupuesto_id: presupuesto.id,
      codigo: 'rubro-k',
      nombre: 'Rubro de prueba K',
      monto_anual: MONTO_TOTAL_PRESUPUESTO,
      cuenta_id: cuentaEgreso.id,
    })
    if (errRubro) throw new Error(`fixture rubro: ${errRubro.message}`)

    const { data: periodo, error: errPer } = await admin
      .from('periodos')
      .insert({ tenant_id: tenantId, anio: 2031, mes: 1, fecha_vencimiento: '2031-01-10' })
      .select('id')
      .single<{ id: string }>()
    if (errPer) throw new Error(`fixture periodo: ${errPer.message}`)
    periodoId = periodo.id

    const { data: sim, response: respSim } = await cAdm.functions.invoke<RespuestaSimular>(
      'simular-liquidacion',
      { body: { periodo_id: periodoId } },
    )
    if (!respSim || respSim.status !== 200 || !sim) {
      throw new Error(`simular-liquidacion: HTTP ${String(respSim?.status)}`)
    }
    const { error: errSolicitar } = await admin
      .from('liquidaciones')
      .update({ estado: 'pendiente_aprobacion', nota_solicitud: 'k' })
      .eq('id', sim.liquidacion_id)
    if (errSolicitar) throw errSolicitar
    const { error: errAplicar } = await cAdm.rpc('fn_aplicar_liquidacion', {
      p_liquidacion_id: sim.liquidacion_id,
    })
    if (errAplicar) throw errAplicar

    const { data: fondoConcepto } = await admin
      .from('conceptos')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('codigo', 'FONDO_IMPREVISTOS')
      .single<{ id: string }>()
    const { data: cf, error: errCargos } = await admin
      .from('cargos')
      .select('id, monto_original, inmueble_id')
      .eq('tenant_id', tenantId)
      .eq('concepto_id', fondoConcepto!.id)
    if (errCargos) throw errCargos
    cargosFondo = cf
  }, 60_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenantId)
    await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  it('la fórmula PORCENTAJE(PRESUPUESTO_ANUAL, 1%) produce el 1% del presupuesto, distribuido por coeficiente', () => {
    expect(cargosFondo).toHaveLength(3)
    const suma = cargosFondo.reduce((s, c) => s + c.monto_original, 0)
    expect(Math.abs(suma - MONTO_TOTAL_PRESUPUESTO * (PORCENTAJE_FONDO / 100))).toBeLessThan(1)
  })

  it('recaudo → aporte: pagar un cargo de FONDO_IMPREVISTOS registra un aporte por el mismo monto', async () => {
    const cargo0 = cargosFondo[0]
    if (!cargo0) throw new Error('fixture: sin cargos de FONDO_IMPREVISTOS')
    const { count: aportesAntes } = await admin
      .from('fondo_movimientos')
      .select('id', { count: 'exact', head: true })
      .eq('fondo_id', fondoImprevistosId)
      .eq('tipo', 'aporte')

    const { data: pago, response: respPago } = await cAdm.functions.invoke<RespuestaPago>('registrar-pago', {
      body: {
        inmueble_id: cargo0.inmueble_id,
        monto: cargo0.monto_original,
        fecha_pago: new Date().toISOString().slice(0, 10),
        forma_pago: 'transferencia_bancaria',
        aplicaciones_manuales: [{ cargo_id: cargo0.id, monto: cargo0.monto_original }],
      },
    })
    if (!respPago || respPago.status !== 200 || !pago) {
      throw new Error(`registrar-pago: HTTP ${String(respPago?.status)}`)
    }

    const { data: aportes, count: aportesDespues } = await admin
      .from('fondo_movimientos')
      .select('id, monto, pago_id', { count: 'exact' })
      .eq('fondo_id', fondoImprevistosId)
      .eq('tipo', 'aporte')
      .order('created_at', { ascending: false })
      .limit(1)
    expect(aportesDespues).toBe((aportesAntes ?? 0) + 1)
    const aporte = aportes?.[0]
    if (!aporte) throw new Error('no se encontró el aporte recién creado')
    expect(aporte.monto).toBe(cargo0.monto_original)
    expect(aporte.pago_id).toBe(pago.pago_id)
  })

  it('contable_movimientos(): cargo debita 1315/acredita 4115, recaudo libera 1315, aporte segrega a 111015 — cuadre global', async () => {
    const { data: mov, error } = await admin.rpc('contable_movimientos', {
      p_tenant_id: tenantId,
      p_desde: '2020-01-01',
      p_hasta: '2040-01-01',
    })
    if (error) throw error
    const lineas = mov as {
      origen_id: string
      cuenta_codigo: string | null
      debito: number
      credito: number
      fondo_id: string | null
    }[]

    const cargo0 = cargosFondo[0]
    if (!cargo0) throw new Error('fixture: sin cargos de FONDO_IMPREVISTOS')
    const lineasCargo = lineas.filter((l) => l.origen_id === cargo0.id)
    expect(lineasCargo).toHaveLength(2)
    expect(lineasCargo.find((l) => l.debito > 0)?.cuenta_codigo).toBe('1315')
    expect(lineasCargo.find((l) => l.credito > 0)?.cuenta_codigo).toBe('4115')
    expect(lineasCargo.every((l) => l.fondo_id === fondoImprevistosId)).toBe(true)

    const { data: aplicacion } = await admin
      .from('pago_aplicaciones')
      .select('id')
      .eq('cargo_id', cargo0.id)
      .single<{ id: string }>()
    const lineasRecaudo = lineas.filter((l) => l.origen_id === aplicacion!.id)
    expect(lineasRecaudo).toHaveLength(2)
    expect(lineasRecaudo.find((l) => l.credito > 0)?.cuenta_codigo).toBe('1315')
    expect(lineasRecaudo.find((l) => l.debito > 0)?.cuenta_codigo).not.toBe('1315')
    expect(lineasRecaudo.every((l) => l.fondo_id === fondoImprevistosId)).toBe(true)

    const { data: aporte } = await admin
      .from('fondo_movimientos')
      .select('id')
      .eq('fondo_id', fondoImprevistosId)
      .eq('tipo', 'aporte')
      .eq('pago_id', (await admin.from('pagos').select('id').eq('tenant_id', tenantId).single<{ id: string }>()).data!.id)
      .single<{ id: string }>()
    const lineasAporte = lineas.filter((l) => l.origen_id === aporte!.id)
    expect(lineasAporte).toHaveLength(2)
    expect(lineasAporte.find((l) => l.debito > 0)?.cuenta_codigo).toBe('111015')
    expect(lineasAporte.every((l) => l.fondo_id === fondoImprevistosId)).toBe(true)

    const totalDebito = lineas.reduce((s, l) => s + l.debito, 0)
    const totalCredito = lineas.reduce((s, l) => s + l.credito, 0)
    expect(Math.abs(totalDebito - totalCredito)).toBeLessThan(0.01)
  })

  it('contable_dimensiones_faltantes(): ninguna línea del fondo queda sin fondo_id', async () => {
    const { data, error } = await admin.rpc('contable_dimensiones_faltantes', {
      p_tenant_id: tenantId,
      p_desde: '2020-01-01',
      p_hasta: '2040-01-01',
    })
    if (error) throw error
    const faltantesFondo = (data as { dimension_faltante: string }[]).filter(
      (f) => f.dimension_faltante === 'fondo',
    )
    expect(faltantesFondo).toHaveLength(0)
  })

  it('anular el pago no rompe con una excepción (límite documentado: el aporte no se reversa solo)', async () => {
    const { data: pago, error: errPago } = await admin
      .from('pagos')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('pago_original_id', null)
      .single<{ id: string }>()
    if (errPago) throw new Error(`fixture pago original: ${errPago.message}`)

    const { count: aportesAntes } = await admin
      .from('fondo_movimientos')
      .select('id', { count: 'exact', head: true })
      .eq('fondo_id', fondoImprevistosId)
      .eq('tipo', 'aporte')

    const { error } = await admin.rpc('fn_anular_pago', {
      p_pago_id: pago.id,
      p_motivo: 'prueba BLOQUE K',
      p_actor_id: usuario.id,
    })
    expect(error).toBeNull()

    // Límite explícito de D-38: el espejo negativo no genera (ni intenta
    // generar, rompiendo) un aporte nuevo — sigue habiendo los mismos.
    const { count: aportesDespues } = await admin
      .from('fondo_movimientos')
      .select('id', { count: 'exact', head: true })
      .eq('fondo_id', fondoImprevistosId)
      .eq('tipo', 'aporte')
    expect(aportesDespues).toBe(aportesAntes)
  })
})
