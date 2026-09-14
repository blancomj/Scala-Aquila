/**
 * CO-7 (20260930400000-20260930420000) — deterioro de cartera.
 * Ver Casos de uso/Tres Modulos/Contabilidad/CO_07_deterioro_cartera.md §6
 * (11 pruebas obligatorias).
 *
 * Usa `create_tenant()` (mismo criterio que CO-4/CO-3/MANT-0) para tener el árbol contable
 * completo (contable_cuenta_default con CARTERA_CUOTA_ORDINARIA/CARTERA_INTERES_MORA/
 * CARTERA_OTROS/DETERIORO_CARTERA/GASTO_DETERIORO_CARTERA ya sembrados en la alta).
 *
 * Escenario de fechas: fecha de corte 1 = 2036-06-30 (mes de periodoA, que dobla como el
 * periodo que se cierra). Tres cargos con vencimientos distintos dan antigüedades exactas de
 * 10/46/121 días (verificadas por día-del-año, no por resta de calendario a ojo):
 *   periodoA.fecha_vencimiento = 2036-06-20 → 10 días al corte 1
 *   periodoB.fecha_vencimiento = 2036-05-15 → 46 días al corte 1 (77 al corte 2, 108 al corte 3)
 *   periodoC.fecha_vencimiento = 2036-03-01 → 121 días al corte 1
 * Tramos de la política: 0-30 (0%), 31-60 (10%), 61+ (30%).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
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
  console.warn('SALTADO tests/contabilidad/deterioro: faltan variables de Supabase en .env')
}

interface FilaCalculo {
  inmueble_id: string
  cuenta_cartera_id: string
  cuenta_codigo: string
  cuenta_nombre: string
  saldo: number
  dias_vencido: number
  tramo_id: string | null
  porcentaje: number | null
  deterioro_calculado: number
  deterioro_reconocido: number
  ajuste: number
}

d('CO-7: deterioro de cartera', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  // ── fixtures (mismo patrón que tests/contabilidad/libros-oficiales.test.ts) ──

  async function crearTenantCompleto(etiqueta: string): Promise<{ tenantId: string; cliente: Cliente }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)
    const { data: tenant, error } = await cliente
      .rpc('create_tenant', { p_name: `CO-7 ${etiqueta}`, p_slug: `t-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    return { tenantId: tenant.id, cliente }
  }

  async function crearPeriodo(tenantId: string, anio: number, mes: number, fechaVencimiento?: string): Promise<string> {
    const { data, error } = await admin
      .from('periodos')
      .insert({
        tenant_id: tenantId, anio, mes,
        ...(fechaVencimiento ? { fecha_vencimiento: fechaVencimiento } : {}),
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture periodo: ${error.message}`)
    return data.id
  }

  async function tipoApartamentoId(): Promise<number> {
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

  async function formaPagoEfectivoId(): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'FORMA_PAGO')
      .eq('codigo', 'efectivo')
      .is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture forma_pago efectivo: ${error.message}`)
    return data.id
  }

  async function crearInmueble(tenantId: string, sufijo: string): Promise<string> {
    const tipoId = await tipoApartamentoId()
    const { data, error } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantId, codigo: `CO7-${sufijo}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble: ${error.message}`)
    return data.id
  }

  async function unaHojaIngresoLibre(tenantId: string): Promise<string> {
    const { data: usadas, error: errUsadas } = await admin
      .from('conceptos')
      .select('presupuesto_cuenta_id')
      .eq('tenant_id', tenantId)
      .not('presupuesto_cuenta_id', 'is', null)
    if (errUsadas) throw new Error(`fixture conceptos usados: ${errUsadas.message}`)
    const idsUsados = new Set(usadas.map((c) => c.presupuesto_cuenta_id))
    const { data: hojas, error } = await admin
      .from('presupuesto_cuenta')
      .select('id, contable_cuenta:contable_cuenta_id!inner(requiere_fondo)')
      .eq('tenant_id', tenantId)
      .eq('naturaleza', 'ingreso')
      .eq('es_hoja', true)
      .eq('activa', true)
      .not('contable_cuenta_id', 'is', null)
      .eq('contable_cuenta.requiere_fondo', false)
      .order('id')
      .limit(20)
    if (error) throw new Error(`fixture hojas ingreso: ${error.message}`)
    const libre = hojas.find((h) => !idsUsados.has(h.id))
    if (!libre) throw new Error('fixture: no hay hoja de ingreso libre para vincular a un concepto')
    return libre.id
  }

  async function crearConcepto(tenantId: string, codigo: string, presupuestoCuentaId: string): Promise<string> {
    const { data, error } = await admin
      .from('conceptos')
      .insert({
        tenant_id: tenantId, codigo, nombre: codigo, modo_calculo: 'distribucion', modo_valor: 'fijo',
        valor_fijo: 1, prioridad: 100, estado: 'activo', tipo_recurrencia: 'recurrente',
        periodicidad: 'mensual', fecha_inicio_anio: 2000, fecha_inicio_mes: 1, alcance: 'todos',
        presupuesto_cuenta_id: presupuestoCuentaId,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture concepto ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearLiquidacion(tenantId: string, periodoId: string, montoTotal: number): Promise<string> {
    const sufijo = `${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await admin
      .from('liquidaciones')
      .insert({ tenant_id: tenantId, periodo_id: periodoId, result_hash: `co7-fixture-${sufijo}`, tenant_total: montoTotal })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture liquidacion: ${error.message}`)
    return data.id
  }

  /** Cargo de cartera (categoria='capital') vía liquidacion_linea — único camino de origen
   * físico que admite cargos_origen_unico. La cuenta contable la resuelve CO-7 por
   * cargos.categoria (CARTERA_CUOTA_ORDINARIA), no por este concepto/presupuesto_cuenta. */
  async function armarCargo(params: {
    tenantId: string; inmuebleId: string; periodoId: string; liquidacionId: string
    conceptoId: string; monto: number
  }): Promise<string> {
    const { data: linea, error: errLinea } = await admin
      .from('liquidacion_lineas')
      .insert({
        tenant_id: params.tenantId, liquidacion_id: params.liquidacionId, inmueble_id: params.inmuebleId,
        concepto_id: params.conceptoId, monto: params.monto,
      })
      .select('id')
      .single<{ id: string }>()
    if (errLinea) throw new Error(`fixture liquidacion_linea: ${errLinea.message}`)
    const { data: cargo, error: errCargo } = await admin
      .from('cargos')
      .insert({
        tenant_id: params.tenantId, inmueble_id: params.inmuebleId, periodo_id: params.periodoId,
        categoria: 'capital', origen_tipo: 'liquidacion_linea',
        liquidacion_linea_id: linea.id, concepto_id: params.conceptoId, monto_original: params.monto,
      })
      .select('id')
      .single<{ id: string }>()
    if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)
    return cargo.id
  }

  async function armarPago(tenantId: string, inmuebleId: string, monto: number, fechaPago: string): Promise<string> {
    const formaPagoId = await formaPagoEfectivoId()
    const { data, error } = await admin
      .from('pagos')
      .insert({ tenant_id: tenantId, inmueble_id: inmuebleId, monto, fecha_pago: fechaPago, fecha_registro: fechaPago, forma_pago_id: formaPagoId })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture pago: ${error.message}`)
    return data.id
  }

  async function aplicarPago(tenantId: string, pagoId: string, cargoId: string, monto: number): Promise<void> {
    const { error } = await admin
      .from('pago_aplicaciones')
      .insert({ tenant_id: tenantId, pago_id: pagoId, cargo_id: cargoId, monto })
    if (error) throw new Error(`fixture pago_aplicacion: ${error.message}`)
  }

  async function cuentaPorCodigo(tenantId: string, codigo: string): Promise<string> {
    const { data, error } = await admin
      .from('contable_cuenta')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('codigo', codigo)
      .single<{ id: string }>()
    if (error) throw new Error(`fixture cuenta ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearPoliticaBorrador(
    tenantId: string,
    version: number,
    opts: { metodo: 'antiguedad' | 'porcentaje_global' | 'individual'; porcentajeGlobal?: number; excluirAcuerdoVigente?: boolean },
  ): Promise<string> {
    const { data, error } = await admin
      .from('contable_politica_deterioro')
      .insert({
        tenant_id: tenantId, version, metodo: opts.metodo,
        porcentaje_global: opts.porcentajeGlobal ?? null,
        excluir_cargos_con_acuerdo_vigente: opts.excluirAcuerdoVigente ?? true,
        vigente_desde: '2000-01-01',
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture politica deterioro: ${error.message}`)
    return data.id
  }

  async function insertarTramo(tenantId: string, politicaId: string, diasDesde: number, diasHasta: number | null, porcentaje: number): Promise<void> {
    const { error } = await admin.from('contable_politica_deterioro_tramo').insert({
      tenant_id: tenantId, politica_id: politicaId, dias_desde: diasDesde, dias_hasta: diasHasta, porcentaje,
    })
    if (error) throw new Error(`fixture tramo deterioro: ${error.message}`)
  }

  async function activarPolitica(politicaId: string): Promise<{ error: { message: string } | null }> {
    return admin.from('contable_politica_deterioro').update({ estado: 'vigente' }).eq('id', politicaId)
  }

  async function politicaEstandarVigente(tenantId: string, opts?: { excluirAcuerdoVigente?: boolean }): Promise<string> {
    const politicaId = await crearPoliticaBorrador(tenantId, 1, {
      metodo: 'antiguedad',
      ...(opts?.excluirAcuerdoVigente !== undefined ? { excluirAcuerdoVigente: opts.excluirAcuerdoVigente } : {}),
    })
    await insertarTramo(tenantId, politicaId, 0, 30, 0)
    await insertarTramo(tenantId, politicaId, 31, 60, 10)
    await insertarTramo(tenantId, politicaId, 61, null, 30)
    const { error } = await activarPolitica(politicaId)
    if (error) throw new Error(`activar politica estandar: ${error.message}`)
    return politicaId
  }

  /** guard_acuerdo_transicion (CAR F5) solo permite borrador → pendiente_aprobacion → vigente
   * — nunca insertar directo en vigente (ACUERDO_ESTADO_INICIAL_INVALIDO). Con el cliente
   * admin (sin auth.uid()) los checks de rol/autoaprobación de esa misma función se omiten. */
  async function crearAcuerdoVigente(tenantId: string, inmuebleId: string, monto: number, fecha: string): Promise<string> {
    const { data, error } = await admin
      .from('acuerdos_pago')
      .insert({
        tenant_id: tenantId, inmueble_id: inmuebleId,
        consecutivo: `CO7-AC-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`,
        fecha_acuerdo: fecha, fecha_inicio: fecha, fecha_fin: fecha,
        monto_capital: monto, monto_total: monto, numero_cuotas: 1,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture acuerdo_pago: ${error.message}`)
    const { error: errPendiente } = await admin
      .from('acuerdos_pago').update({ estado: 'pendiente_aprobacion' }).eq('id', data.id)
    if (errPendiente) throw new Error(`fixture acuerdo_pago (pendiente_aprobacion): ${errPendiente.message}`)
    const { error: errVigente } = await admin
      .from('acuerdos_pago').update({ estado: 'vigente' }).eq('id', data.id)
    if (errVigente) throw new Error(`fixture acuerdo_pago (vigente): ${errVigente.message}`)
    return data.id
  }

  // ── escenario principal (pruebas 3-8, 10) ──
  const CORTE1 = '2036-06-30'
  const CORTE2 = '2036-07-31'

  let escenario: {
    tenantId: string
    cliente: Cliente
    inmueblePrincipal: string
    inmuebleB: string
    periodoCierre1: string // dobla como periodoA (anio=2036, mes=6)
    periodoCierre2: string
    periodoCierre3: string
    cargoA: string
  }

  beforeAll(async () => {
    const { tenantId, cliente } = await crearTenantCompleto('principal')
    const inmueblePrincipal = await crearInmueble(tenantId, 'principal')
    const inmuebleB = await crearInmueble(tenantId, 'b')

    // periodoA dobla como "periodo que se cierra" en el corte 1 (mismo anio/mes: 2036-06,
    // periodos_unico exige una sola fila por tenant+anio+mes).
    const periodoA = await crearPeriodo(tenantId, 2036, 6, '2036-06-20') // 10 días al corte 1
    const periodoB = await crearPeriodo(tenantId, 2036, 5, '2036-05-15') // 46/77/108 días
    const periodoC = await crearPeriodo(tenantId, 2036, 3, '2036-03-01') // 121 días al corte 1
    const periodoCierre2 = await crearPeriodo(tenantId, 2036, 7)
    const periodoCierre3 = await crearPeriodo(tenantId, 2036, 8)

    const liquidacion = await crearLiquidacion(tenantId, periodoA, 410_000)
    const hojaIngreso = await unaHojaIngresoLibre(tenantId)
    const concepto = await crearConcepto(tenantId, 'CO7-CARTERA', hojaIngreso)

    const cargoA = await armarCargo({ tenantId, inmuebleId: inmueblePrincipal, periodoId: periodoA, liquidacionId: liquidacion, conceptoId: concepto, monto: 100_000 })
    await armarCargo({ tenantId, inmuebleId: inmueblePrincipal, periodoId: periodoB, liquidacionId: liquidacion, conceptoId: concepto, monto: 200_000 })
    await armarCargo({ tenantId, inmuebleId: inmueblePrincipal, periodoId: periodoC, liquidacionId: liquidacion, conceptoId: concepto, monto: 50_000 })
    await armarCargo({ tenantId, inmuebleId: inmuebleB, periodoId: periodoB, liquidacionId: liquidacion, conceptoId: concepto, monto: 60_000 })

    await politicaEstandarVigente(tenantId)

    escenario = {
      tenantId, cliente, inmueblePrincipal, inmuebleB,
      periodoCierre1: periodoA, periodoCierre2, periodoCierre3, cargoA,
    }
  }, 60_000)

  it('1. sin política vigente, contable_calcular_deterioro y fn_contable_reconocer_deterioro fallan con DETERIORO_SIN_POLITICA, cero comprobantes', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('sin-politica')
    const periodoId = await crearPeriodo(tenantId, 2036, 6)

    const { error: errCalculo } = await admin.rpc('contable_calcular_deterioro', {
      p_tenant_id: tenantId, p_fecha_corte: CORTE1,
    })
    expect(errCalculo?.message).toContain('DETERIORO_SIN_POLITICA')

    const { error: errReconocer } = await cliente.rpc('fn_contable_reconocer_deterioro', {
      p_tenant_id: tenantId, p_periodo_id: periodoId,
    })
    expect(errReconocer?.message).toContain('DETERIORO_SIN_POLITICA')

    const { data: comprobantes, error: errComps } = await admin
      .from('contable_comprobante')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('origen_entidad', 'deterioro')
    if (errComps) throw errComps
    expect(comprobantes).toEqual([])
  }, 30_000)

  it('2. tramos con hueco → DETERIORO_TRAMOS_INCOMPLETOS; tramos solapados → DETERIORO_TRAMOS_SOLAPADOS', async () => {
    const { tenantId } = await crearTenantCompleto('tramos-invalidos')
    const politicaId = await crearPoliticaBorrador(tenantId, 1, { metodo: 'antiguedad' })

    // Hueco: falta cobertura de 31 a 39.
    await insertarTramo(tenantId, politicaId, 0, 30, 5)
    await insertarTramo(tenantId, politicaId, 40, null, 20)
    const { error: errHueco } = await activarPolitica(politicaId)
    expect(errHueco?.message).toContain('DETERIORO_TRAMOS_INCOMPLETOS')

    // Corrige el hueco, introduce un solape (20 se solapa con el tramo anterior 0-30).
    const { error: errBorra } = await admin.from('contable_politica_deterioro_tramo').delete().eq('politica_id', politicaId)
    if (errBorra) throw errBorra
    await insertarTramo(tenantId, politicaId, 0, 30, 5)
    await insertarTramo(tenantId, politicaId, 20, 60, 10)
    await insertarTramo(tenantId, politicaId, 61, null, 20)
    const { error: errSolape } = await activarPolitica(politicaId)
    expect(errSolape?.message).toContain('DETERIORO_TRAMOS_SOLAPADOS')
  }, 30_000)

  it('3. con política de antigüedad y cartera sembrada en tramos conocidos, el cálculo da el importe esperado', async () => {
    const { data, error } = await admin.rpc('contable_calcular_deterioro', {
      p_tenant_id: escenario.tenantId, p_fecha_corte: CORTE1,
    })
    if (error) throw error
    const filas = data as FilaCalculo[]

    const principal = filas.find((f) => f.inmueble_id === escenario.inmueblePrincipal)!
    // 100k@0% + 200k@10% + 50k@30% = 0 + 20_000 + 15_000
    expect(principal.saldo).toBe(350_000)
    expect(principal.deterioro_calculado).toBe(35_000)

    const b = filas.find((f) => f.inmueble_id === escenario.inmuebleB)!
    // 60k@10% (46 días → tramo 31-60)
    expect(b.saldo).toBe(60_000)
    expect(b.deterioro_calculado).toBe(6_000)
  }, 30_000)

  it('4. el reconocimiento genera un comprobante que cuadra, con débito en GASTO_DETERIORO_CARTERA y crédito en DETERIORO_CARTERA', async () => {
    const { data: compId, error } = await escenario.cliente.rpc('fn_contable_reconocer_deterioro', {
      p_tenant_id: escenario.tenantId, p_periodo_id: escenario.periodoCierre1,
    })
    if (error) throw error
    expect(compId).toBeTruthy()

    const { data: detalle, error: errDet } = await admin
      .from('contable_comprobante_detalle')
      .select('debito, credito, cuenta_id')
      .eq('comprobante_id', compId)
      .order('linea')
    if (errDet) throw errDet
    expect(detalle).toHaveLength(2)

    const cuentaGasto = await cuentaPorCodigo(escenario.tenantId, '5915')
    const cuentaDeterioro = await cuentaPorCodigo(escenario.tenantId, '1399')
    const lineaGasto = detalle.find((l) => l.cuenta_id === cuentaGasto)!
    const lineaDeterioro = detalle.find((l) => l.cuenta_id === cuentaDeterioro)!
    // Total esperado: 35_000 (principal) + 6_000 (inmuebleB) = 41_000.
    expect(lineaGasto.debito).toBe(41_000)
    expect(lineaGasto.credito).toBe(0)
    expect(lineaDeterioro.debito).toBe(0)
    expect(lineaDeterioro.credito).toBe(41_000)
  }, 30_000)

  it('5. reconocer dos veces el mismo periodo no duplica', async () => {
    const { data: compId, error } = await escenario.cliente.rpc('fn_contable_reconocer_deterioro', {
      p_tenant_id: escenario.tenantId, p_periodo_id: escenario.periodoCierre1,
    })
    if (error) throw error

    const { data: comprobantes, error: errComps } = await admin
      .from('contable_comprobante')
      .select('id')
      .eq('tenant_id', escenario.tenantId)
      .eq('origen_entidad', 'deterioro')
      .eq('origen_id', escenario.periodoCierre1)
    if (errComps) throw errComps
    expect(comprobantes).toHaveLength(1)
    expect(comprobantes[0]!.id).toBe(compId)
  }, 30_000)

  it('6. un segundo reconocimiento con mayor cartera vencida registra solo el ajuste', async () => {
    const { data: compId, error } = await escenario.cliente.rpc('fn_contable_reconocer_deterioro', {
      p_tenant_id: escenario.tenantId, p_periodo_id: escenario.periodoCierre2,
    })
    if (error) throw error
    expect(compId).toBeTruthy()

    const { data: detalle, error: errDet } = await admin
      .from('contable_comprobante_detalle')
      .select('debito, credito, cuenta_id')
      .eq('comprobante_id', compId)
    if (errDet) throw errDet

    const cuentaGasto = await cuentaPorCodigo(escenario.tenantId, '5915')
    const lineaGasto = detalle.find((l) => l.cuenta_id === cuentaGasto)!
    // Al corte 2 (2036-07-31): A=41d→10%(100k)=10_000, B=77d→30%(200k)=60_000,
    // C=152d→30%(50k)=15_000 (principal=85_000); inmuebleB: 77d→30%(60k)=18_000.
    // Total=103_000, ya reconocido=41_000 → ajuste=62_000 (no el total).
    expect(lineaGasto.debito).toBe(62_000)
  }, 30_000)

  it('7. una recuperación (cartera que se paga) genera el asiento inverso', async () => {
    // Cancela por completo el cargo A (100_000, el de menor antigüedad) — su saldo pasa a
    // cero y sale de la base, bajando el deterioro total pese a que el resto siguió aumentando.
    const pago = await armarPago(escenario.tenantId, escenario.inmueblePrincipal, 100_000, CORTE2)
    await aplicarPago(escenario.tenantId, pago, escenario.cargoA, 100_000)

    const { data: compId, error } = await escenario.cliente.rpc('fn_contable_reconocer_deterioro', {
      p_tenant_id: escenario.tenantId, p_periodo_id: escenario.periodoCierre3,
    })
    if (error) throw error
    expect(compId).toBeTruthy()

    const { data: detalle, error: errDet } = await admin
      .from('contable_comprobante_detalle')
      .select('debito, credito, cuenta_id')
      .eq('comprobante_id', compId)
    if (errDet) throw errDet

    const cuentaGasto = await cuentaPorCodigo(escenario.tenantId, '5915')
    const cuentaDeterioro = await cuentaPorCodigo(escenario.tenantId, '1399')
    const lineaGasto = detalle.find((l) => l.cuenta_id === cuentaGasto)!
    const lineaDeterioro = detalle.find((l) => l.cuenta_id === cuentaDeterioro)!
    // Al corte 3: A pagado (excluido); B y C sin cambio de tramo respecto al corte 2 →
    // total=75_000+18_000=93_000, ya reconocido=103_000 → ajuste=-10_000 (recuperación):
    // el asiento se invierte — débito en 1399, crédito en 5915.
    expect(lineaDeterioro.debito).toBe(10_000)
    expect(lineaDeterioro.credito).toBe(0)
    expect(lineaGasto.debito).toBe(0)
    expect(lineaGasto.credito).toBe(10_000)
  }, 30_000)

  it('8. 1399 presenta saldo crédito y el activo neto de cartera es 1305 − 1399 en el balance de prueba de CO-4', async () => {
    const { data, error } = await admin.rpc('contable_libro_mayor', {
      p_tenant_id: escenario.tenantId, p_desde: '2036-01-01', p_hasta: '2036-12-31',
    })
    if (error) throw error
    const fila1399 = (data as { cuenta_codigo: string; naturaleza: string; saldo_final: number }[]).find((f) => f.cuenta_codigo === '1399')!
    expect(fila1399.naturaleza).toBe('credito')
    // Acumulado: 41_000 (corte 1, prueba 4) + 62_000 (corte 2, prueba 6) - 10_000 (corte 3,
    // prueba 7) = 93_000.
    expect(fila1399.saldo_final).toBe(93_000)
  }, 30_000)

  it('9. los cargos con acuerdo de pago vigente quedan fuera de la base con la configuración por defecto, y dentro si se cambia el parámetro', async () => {
    const { tenantId } = await crearTenantCompleto('acuerdo-vigente')
    const inmuebleConAcuerdo = await crearInmueble(tenantId, 'con-acuerdo')
    const inmuebleSinAcuerdo = await crearInmueble(tenantId, 'sin-acuerdo')
    const periodo = await crearPeriodo(tenantId, 2036, 5, '2036-05-15') // 46 días → tramo 10%
    const liquidacion = await crearLiquidacion(tenantId, periodo, 100_000)
    const hojaIngreso = await unaHojaIngresoLibre(tenantId)
    const concepto = await crearConcepto(tenantId, 'CO7-ACUERDO', hojaIngreso)

    await armarCargo({ tenantId, inmuebleId: inmuebleConAcuerdo, periodoId: periodo, liquidacionId: liquidacion, conceptoId: concepto, monto: 50_000 })
    await armarCargo({ tenantId, inmuebleId: inmuebleSinAcuerdo, periodoId: periodo, liquidacionId: liquidacion, conceptoId: concepto, monto: 50_000 })
    await crearAcuerdoVigente(tenantId, inmuebleConAcuerdo, 50_000, '2036-05-20')

    // v1: excluir_cargos_con_acuerdo_vigente=true (default) — el inmueble con acuerdo no aparece.
    await politicaEstandarVigente(tenantId)
    const { data: conExclusion, error: err1 } = await admin.rpc('contable_calcular_deterioro', {
      p_tenant_id: tenantId, p_fecha_corte: CORTE1,
    })
    if (err1) throw err1
    const filasConExclusion = conExclusion as FilaCalculo[]
    expect(filasConExclusion.some((f) => f.inmueble_id === inmuebleConAcuerdo)).toBe(false)
    expect(filasConExclusion.some((f) => f.inmueble_id === inmuebleSinAcuerdo)).toBe(true)

    // Retira v1 (vigente → historica, transición permitida por guard_politica_inmutable) y
    // activa v2 con excluir_cargos_con_acuerdo_vigente=false.
    const { data: v1, error: errV1 } = await admin
      .from('contable_politica_deterioro')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('estado', 'vigente')
      .single<{ id: string }>()
    if (errV1) throw errV1
    const { error: errHistorica } = await admin
      .from('contable_politica_deterioro')
      .update({ estado: 'historica' })
      .eq('id', v1.id)
    if (errHistorica) throw errHistorica

    const v2Id = await crearPoliticaBorrador(tenantId, 2, { metodo: 'antiguedad', excluirAcuerdoVigente: false })
    await insertarTramo(tenantId, v2Id, 0, 30, 0)
    await insertarTramo(tenantId, v2Id, 31, 60, 10)
    await insertarTramo(tenantId, v2Id, 61, null, 30)
    const { error: errActivarV2 } = await activarPolitica(v2Id)
    if (errActivarV2) throw new Error(errActivarV2.message)

    const { data: sinExclusion, error: err2 } = await admin.rpc('contable_calcular_deterioro', {
      p_tenant_id: tenantId, p_fecha_corte: CORTE1,
    })
    if (err2) throw err2
    const filasSinExclusion = sinExclusion as FilaCalculo[]
    expect(filasSinExclusion.some((f) => f.inmueble_id === inmuebleConAcuerdo)).toBe(true)
  }, 30_000)

  it('10. el detalle por inmueble suma exactamente el total del comprobante', async () => {
    const { data: comprobantes, error: errComps } = await admin
      .from('contable_comprobante')
      .select('id')
      .eq('tenant_id', escenario.tenantId)
      .eq('origen_entidad', 'deterioro')
      .eq('origen_id', escenario.periodoCierre1)
    if (errComps) throw errComps
    const compId = comprobantes[0]!.id

    const { data: detalleAgregado, error: errAgregado } = await admin
      .from('contable_comprobante_detalle')
      .select('debito')
      .eq('comprobante_id', compId)
      .gt('debito', 0)
      .single<{ debito: number }>()
    if (errAgregado) throw errAgregado

    const { data: detallePorInmueble, error: errDetalle } = await admin
      .from('contable_deterioro_detalle')
      .select('ajuste')
      .eq('comprobante_id', compId)
    if (errDetalle) throw errDetalle

    const sumaAjustes = detallePorInmueble.reduce((s, f) => s + f.ajuste, 0)
    expect(sumaAjustes).toBe(detalleAgregado.debito)
    expect(detallePorInmueble.length).toBeGreaterThanOrEqual(2)
  }, 30_000)

  it('11. aislamiento entre tenants', async () => {
    const { tenantId: tenantAislado } = await crearTenantCompleto('aislamiento')
    const { error } = await admin.rpc('contable_calcular_deterioro', {
      p_tenant_id: tenantAislado, p_fecha_corte: CORTE1,
    })
    // El tenant nuevo no tiene política propia — si la política vigente del tenant principal
    // se filtrara entre tenants, este cálculo no fallaría.
    expect(error?.message).toContain('DETERIORO_SIN_POLITICA')
  }, 30_000)
})
