/**
 * CO-4 (20260930360000-20260930370000) — libros oficiales de contabilidad.
 * Ver Casos de uso/Tres Modulos/Contabilidad/CO_04_libros_oficiales.md §5
 * (11 pruebas obligatorias).
 *
 * Usa `create_tenant()` (mismo criterio que CO-3/MANT-0) porque necesita el
 * árbol completo (plan de cuentas, contable_cuenta_default, presupuesto_cuenta
 * con contable_cuenta_id) y materializa vía `fn_contabilizar_periodo` (CO-3)
 * antes de poder probar los libros — un libro oficial lee solo lo persistido,
 * nunca la proyección de `contable_movimientos()`.
 *
 * Los cinco objetos nuevos son funciones `stable` de solo lectura
 * (`contable_libro_diario`, `contable_libro_mayor`, `contable_balance_prueba`,
 * `contable_conciliacion_cartera`, `contable_libro_inventarios_balances`) más
 * `fn_registrar_exportacion_libro` (auditoría de exportación, §3.6).
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
  console.warn('SALTADO tests/contabilidad/libros-oficiales: faltan variables de Supabase en .env')
}

const ANIO = 2036
const MES = 4
const FECHA = `${String(ANIO)}-${String(MES).padStart(2, '0')}-10`

interface FilaDiario {
  fecha: string
  comprobante: string
  tipo_codigo: string
  numero: number
  comprobante_id: string
  cuenta_codigo: string
  cuenta_nombre: string
  descripcion: string
  debito: number
  credito: number
}

interface FilaMayor {
  cuenta_id: string
  cuenta_codigo: string
  cuenta_nombre: string
  naturaleza: 'debito' | 'credito'
  saldo_inicial: number
  movimiento_debito: number
  movimiento_credito: number
  saldo_final: number
}

interface FilaBalance {
  codigo: string
  nombre: string
  naturaleza: 'debito' | 'credito'
  saldo_anterior: number
  debitos_periodo: number
  creditos_periodo: number
  saldo_final: number
}

interface FilaConciliacion {
  inmueble_id: string
  saldo_contable: number
  saldo_auxiliar: number
  diferencia: number
}

d('CO-4: libros oficiales de contabilidad', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function crearTenantCompleto(etiqueta: string): Promise<{ tenantId: string; cliente: Cliente }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)
    const { data: tenant, error } = await cliente
      .rpc('create_tenant', { p_name: `CO-4 ${etiqueta}`, p_slug: `t-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    return { tenantId: tenant.id, cliente }
  }

  async function crearPeriodo(tenantId: string, anio: number, mes: number): Promise<string> {
    const { data, error } = await admin
      .from('periodos')
      .insert({ tenant_id: tenantId, anio, mes })
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
      .insert({ tenant_id: tenantId, codigo: `CO4-${sufijo}`, tipo_id: tipoId })
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
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('naturaleza', 'ingreso')
      .eq('es_hoja', true)
      .eq('activa', true)
      .not('contable_cuenta_id', 'is', null)
      .limit(20)
    if (error) throw new Error(`fixture hojas ingreso: ${error.message}`)
    const libre = hojas.find((h) => !idsUsados.has(h.id))
    if (!libre) throw new Error('fixture: no hay hoja de ingreso libre para vincular a un concepto')
    return libre.id
  }

  async function crearConcepto(
    tenantId: string,
    codigo: string,
    opts?: { presupuestoCuentaId?: string; estado?: 'activo' | 'borrador' },
  ): Promise<string> {
    const { data, error } = await admin
      .from('conceptos')
      .insert({
        tenant_id: tenantId, codigo, nombre: codigo, modo_calculo: 'distribucion', modo_valor: 'fijo',
        valor_fijo: 1, prioridad: 100, estado: opts?.estado ?? 'activo', tipo_recurrencia: 'recurrente',
        periodicidad: 'mensual', fecha_inicio_anio: 2000, fecha_inicio_mes: 1, alcance: 'todos',
        ...(opts?.presupuestoCuentaId ? { presupuesto_cuenta_id: opts.presupuestoCuentaId } : {}),
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
      .insert({ tenant_id: tenantId, periodo_id: periodoId, result_hash: `co4-fixture-${sufijo}`, tenant_total: montoTotal })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture liquidacion: ${error.message}`)
    return data.id
  }

  async function armarCargo(params: {
    tenantId: string; inmuebleId: string; periodoId: string; liquidacionId: string
    conceptoId: string; monto: number; categoria?: 'capital' | 'interes'
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
        categoria: params.categoria ?? 'capital', origen_tipo: 'liquidacion_linea',
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

  async function unaHojaEgreso(tenantId: string): Promise<string> {
    const { data, error } = await admin
      .from('presupuesto_cuenta')
      .select('id, contable_cuenta:contable_cuenta_id!inner(requiere_tercero)')
      .eq('tenant_id', tenantId)
      .eq('naturaleza', 'egreso')
      .eq('es_hoja', true)
      .eq('activa', true)
      .eq('contable_cuenta.requiere_tercero', false)
      .limit(1)
      .single<{ id: string }>()
    if (error) throw new Error(`fixture hoja egreso: ${error.message}`)
    return data.id
  }

  async function unCentroCostoId(): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'CENTRO_COSTO')
      .is('tenant_id', null)
      .eq('activo', true)
      .limit(1)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture centro_costo: ${error.message}`)
    return data.id
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

  /** Comprobante manual (AJUSTE) que credita 1399 (Deterioro de cartera, naturaleza crédito
   * dentro de clase 1) contra 5915 (Gasto deterioro) — CO-7 todavía no existe, así que es la
   * única forma de sembrar un movimiento real en una cuenta correctora para la prueba 4. */
  async function contabilizarAjusteDeterioro(tenantId: string, cliente: Cliente, periodoId: string, monto: number): Promise<void> {
    const tipoAjusteId = (
      await admin.from('lista_tipos').select('id').eq('tipo', 'TIPO_COMPROBANTE').eq('codigo', 'AJUSTE').is('tenant_id', null).single<{ id: number }>()
    ).data!.id
    const cuenta1399 = await cuentaPorCodigo(tenantId, '1399')
    const cuenta5915 = await cuentaPorCodigo(tenantId, '5915')
    const { data: comp, error: errComp } = await admin
      .from('contable_comprobante')
      .insert({
        tenant_id: tenantId, periodo_id: periodoId, tipo_id: tipoAjusteId, anio: ANIO, fecha: FECHA,
        descripcion: 'Ajuste de deterioro de cartera (fixture prueba 4)',
      })
      .select('id')
      .single<{ id: string }>()
    if (errComp) throw new Error(`fixture comprobante ajuste: ${errComp.message}`)
    const { error: errDet } = await admin.from('contable_comprobante_detalle').insert([
      { tenant_id: tenantId, comprobante_id: comp.id, linea: 1, cuenta_id: cuenta5915, debito: monto, credito: 0 },
      { tenant_id: tenantId, comprobante_id: comp.id, linea: 2, cuenta_id: cuenta1399, debito: 0, credito: monto },
    ])
    if (errDet) throw new Error(`fixture detalle ajuste: ${errDet.message}`)
    const { error: errContab } = await cliente.rpc('fn_contabilizar_comprobante', { p_comprobante_id: comp.id })
    if (errContab) throw new Error(`fn_contabilizar_comprobante (ajuste deterioro): ${errContab.message}`)
  }

  // ── escenario compartido ──
  let escenario: {
    tenantId: string
    cliente: Cliente
    periodoId: string
    inmuebleId: string
    liquidacionId: string
  }

  beforeAll(async () => {
    const { tenantId, cliente } = await crearTenantCompleto('principal')
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)
    const inmuebleId = await crearInmueble(tenantId, 'principal')

    const hojaIngreso = await unaHojaIngresoLibre(tenantId)
    const conceptoCapital = await crearConcepto(tenantId, 'CO4-CAPITAL', { presupuestoCuentaId: hojaIngreso })
    const conceptoInteres = await crearConcepto(tenantId, 'CO4-INTERES', { estado: 'borrador' })
    const liquidacionId = await crearLiquidacion(tenantId, periodoId, 205_000)

    const cargoCapitalId = await armarCargo({ tenantId, inmuebleId, periodoId, liquidacionId, conceptoId: conceptoCapital, monto: 200_000 })
    const pago = await armarPago(tenantId, inmuebleId, 200_000, FECHA)
    await aplicarPago(tenantId, pago, cargoCapitalId, 200_000)
    await armarCargo({ tenantId, inmuebleId, periodoId, liquidacionId, conceptoId: conceptoInteres, monto: 5_000, categoria: 'interes' })

    const hojaEgreso = await unaHojaEgreso(tenantId)
    const centroCostoId = await unCentroCostoId()
    const { error: errPe } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantId, cuenta_id: hojaEgreso, periodo_id: periodoId, monto: 30_000,
      liquidacion: 'pagado_caja', fecha_documento: FECHA, centro_costo_id: centroCostoId,
    })
    if (errPe) throw new Error(`fixture presupuesto_ejecucion: ${errPe.message}`)

    const { error: errPend } = await admin.rpc('contable_parametrizacion_pendiente', { p_tenant_id: tenantId })
    if (errPend) throw errPend

    const { error: errMat } = await cliente.rpc('fn_contabilizar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodoId })
    if (errMat) throw errMat

    await contabilizarAjusteDeterioro(tenantId, cliente, periodoId, 15_000)

    escenario = { tenantId, cliente, periodoId, inmuebleId, liquidacionId }
  }, 60_000)

  it('1. en el Libro Diario, SUM(debito) = SUM(credito) para cualquier rango', async () => {
    const { data, error } = await admin.rpc('contable_libro_diario', {
      p_tenant_id: escenario.tenantId, p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31`,
    })
    if (error) throw error
    const filas = data as FilaDiario[]
    expect(filas.length).toBeGreaterThan(0)
    const totalDebito = filas.reduce((s, f) => s + f.debito, 0)
    const totalCredito = filas.reduce((s, f) => s + f.credito, 0)
    expect(totalDebito).toBe(totalCredito)
  }, 30_000)

  it('2. el Libro Diario está ordenado por fecha y (tipo, numero); sin saltos en el consecutivo', async () => {
    const { data, error } = await admin.rpc('contable_libro_diario', {
      p_tenant_id: escenario.tenantId, p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31`,
    })
    if (error) throw error
    const filas = data as FilaDiario[]
    for (let i = 1; i < filas.length; i++) {
      expect(filas[i]!.fecha >= filas[i - 1]!.fecha).toBe(true)
    }
    // El consecutivo es por (tenant, anio, tipo_id) — contable_consecutivo (CO-2) lleva un
    // contador independiente por tipo, así que "sin saltos" se verifica agrupado por tipo, no
    // globalmente entre tipos distintos.
    const { data: comps, error: errComps } = await admin
      .from('contable_comprobante')
      .select('numero, tipo_id')
      .eq('tenant_id', escenario.tenantId)
      .eq('anio', ANIO)
      .not('numero', 'is', null)
      .order('tipo_id')
      .order('numero')
    if (errComps) throw errComps
    const porTipo = new Map<number, number[]>()
    for (const c of comps) {
      const lista = porTipo.get(c.tipo_id) ?? []
      lista.push(c.numero)
      porTipo.set(c.tipo_id, lista)
    }
    for (const numeros of porTipo.values()) {
      for (let i = 1; i < numeros.length; i++) {
        expect(numeros[i]).toBe(numeros[i - 1]! + 1)
      }
    }
  }, 30_000)

  it('3. en el Libro Mayor, para toda cuenta: saldo_inicial + movimiento = saldo_final', async () => {
    const { data, error } = await admin.rpc('contable_libro_mayor', {
      p_tenant_id: escenario.tenantId, p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31`,
    })
    if (error) throw error
    const filas = data as FilaMayor[]
    expect(filas.length).toBeGreaterThan(0)
    for (const f of filas) {
      const movimiento = f.naturaleza === 'debito'
        ? f.movimiento_debito - f.movimiento_credito
        : f.movimiento_credito - f.movimiento_debito
      expect(f.saldo_inicial + movimiento).toBe(f.saldo_final)
    }
  }, 30_000)

  it('4. una cuenta correctora (1399, naturaleza crédito dentro de clase 1) presenta saldo crédito positivo', async () => {
    const { data, error } = await admin.rpc('contable_libro_mayor', {
      p_tenant_id: escenario.tenantId, p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31`,
    })
    if (error) throw error
    const fila = (data as FilaMayor[]).find((f) => f.cuenta_codigo === '1399')!
    expect(fila.naturaleza).toBe('credito')
    expect(fila.saldo_final).toBe(15_000)
  }, 30_000)

  it('5. en el Balance de prueba, la suma de saldos débito iguala la suma de saldos crédito', async () => {
    const { data, error } = await admin.rpc('contable_balance_prueba', {
      p_tenant_id: escenario.tenantId, p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31`, p_nivel: 5,
    })
    if (error) throw error
    const filas = data as FilaBalance[]
    expect(filas.length).toBeGreaterThan(0)
    const sumaDebito = filas.reduce((s, f) => s + (f.naturaleza === 'debito' ? Math.max(f.saldo_final, 0) : Math.max(-f.saldo_final, 0)), 0)
    const sumaCredito = filas.reduce((s, f) => s + (f.naturaleza === 'credito' ? Math.max(f.saldo_final, 0) : Math.max(-f.saldo_final, 0)), 0)
    expect(Math.round(sumaDebito)).toBe(Math.round(sumaCredito))
  }, 30_000)

  it('6. el Balance de prueba consolidado a nivel 1 y a nivel 5 dan los mismos totales', async () => {
    const [{ data: nivel1, error: err1 }, { data: nivel5, error: err5 }] = await Promise.all([
      admin.rpc('contable_balance_prueba', { p_tenant_id: escenario.tenantId, p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31`, p_nivel: 1 }),
      admin.rpc('contable_balance_prueba', { p_tenant_id: escenario.tenantId, p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31`, p_nivel: 5 }),
    ])
    if (err1) throw err1
    if (err5) throw err5
    const total = (filas: FilaBalance[]): number => filas.reduce((s, f) => s + f.debitos_periodo, 0)
    expect(total(nivel1 as FilaBalance[])).toBe(total(nivel5 as FilaBalance[]))
  }, 30_000)

  it('7. contable_conciliacion_cartera devuelve cero diferencias tras materializar, y detecta una diferencia inyectada', async () => {
    const { data: antes, error: errAntes } = await admin.rpc('contable_conciliacion_cartera', {
      p_tenant_id: escenario.tenantId, p_fecha_corte: `${String(ANIO)}-12-31`,
    })
    if (errAntes) throw errAntes
    expect(antes).toEqual([])

    // Inyecta un cargo nuevo, deliberadamente NO materializado — el auxiliar (cargos) se mueve,
    // el contable (comprobante) no, así que debe aparecer una diferencia.
    const hojaIngreso = await unaHojaIngresoLibre(escenario.tenantId)
    const concepto = await crearConcepto(escenario.tenantId, 'CO4-SIN-MATERIALIZAR', { presupuestoCuentaId: hojaIngreso })
    // Reutiliza la liquidación ya creada en beforeAll: liquidaciones_viva_unica admite solo una
    // liquidación viva por (tenant, periodo) — una liquidacion_linea nueva sobre la misma
    // liquidación es válida, una liquidación nueva para el mismo periodo no lo es.
    await armarCargo({ tenantId: escenario.tenantId, inmuebleId: escenario.inmuebleId, periodoId: escenario.periodoId, liquidacionId: escenario.liquidacionId, conceptoId: concepto, monto: 7_000 })

    const { data: despues, error: errDespues } = await admin.rpc('contable_conciliacion_cartera', {
      p_tenant_id: escenario.tenantId, p_fecha_corte: `${String(ANIO)}-12-31`,
    })
    if (errDespues) throw errDespues
    const filas = despues as FilaConciliacion[]
    const fila = filas.find((f) => f.inmueble_id === escenario.inmuebleId)!
    expect(fila.diferencia).not.toBe(0)
  }, 30_000)

  it('8. el Libro de Inventarios y Balances cuadra: activo = pasivo + patrimonio + resultado del ejercicio', async () => {
    const { data, error } = await admin.rpc('contable_libro_inventarios_balances', {
      p_tenant_id: escenario.tenantId, p_fecha_corte: `${String(ANIO)}-12-31`,
    })
    if (error) throw error
    const cuadre = (data as { codigo: string; cuadra: boolean; diferencia: number }[]).find((f) => f.codigo === 'CUADRE')!
    expect(cuadre.cuadra).toBe(true)
    expect(cuadre.diferencia).toBe(0)
  }, 30_000)

  it('9. el encabezado legal (tenant_marco_contable) distingue sin clasificar de clasificado', async () => {
    const { data: sinClasificar, error: err1 } = await admin.rpc('tenant_marco_contable', { p_tenant_id: escenario.tenantId }).single<{ clasificado: boolean }>()
    if (err1) throw err1
    expect(sinClasificar.clasificado).toBe(false)

    const { error: errClasificar } = await admin
      .from('tenants')
      .update({ marco_grupo: 'grupo_3', uso_economico: 'residencial' })
      .eq('id', escenario.tenantId)
    if (errClasificar) throw errClasificar
    const { data: clasificado, error: err2 } = await admin.rpc('tenant_marco_contable', { p_tenant_id: escenario.tenantId }).single<{ clasificado: boolean; marco_grupo: string }>()
    if (err2) throw err2
    expect(clasificado.clasificado).toBe(true)
    expect(clasificado.marco_grupo).toBe('grupo_3')
  }, 30_000)

  it('10. aislamiento entre tenants en las cuatro funciones de libro', async () => {
    const { tenantId: tenantB } = await crearTenantCompleto('aislamiento-b')
    const [diario, mayor, balance, conciliacion] = await Promise.all([
      admin.rpc('contable_libro_diario', { p_tenant_id: tenantB, p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31` }),
      admin.rpc('contable_libro_mayor', { p_tenant_id: tenantB, p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31` }),
      admin.rpc('contable_balance_prueba', { p_tenant_id: tenantB, p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31`, p_nivel: 5 }),
      admin.rpc('contable_conciliacion_cartera', { p_tenant_id: tenantB, p_fecha_corte: `${String(ANIO)}-12-31` }),
    ])
    if (diario.error) throw diario.error
    if (mayor.error) throw mayor.error
    if (balance.error) throw balance.error
    if (conciliacion.error) throw conciliacion.error
    expect(diario.data).toEqual([])
    expect(mayor.data).toEqual([])
    expect(balance.data).toEqual([])
    expect(conciliacion.data).toEqual([])
  }, 30_000)

  it('11. rendimiento: el Libro Diario responde en tiempo razonable sobre un tenant con volumen', async () => {
    const N = 500
    const { tenantId, cliente } = await crearTenantCompleto('rendimiento')
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)
    const hojaIngreso = await unaHojaIngresoLibre(tenantId)
    const concepto = await crearConcepto(tenantId, 'CO4-VOLUMEN', { presupuestoCuentaId: hojaIngreso })
    const liquidacion = await crearLiquidacion(tenantId, periodoId, N * 100_000)
    const tipoId = await tipoApartamentoId()

    // Bulk insert (no round-trip por fila): 500 inmuebles, 500 líneas de liquidación y 500
    // cargos, cada uno en una sola llamada — con round-trips individuales, 1500 llamadas
    // secuenciales exceden cualquier timeout razonable sin decir nada sobre el rendimiento real
    // de contable_libro_diario, que es lo que esta prueba mide.
    const { data: inmuebles, error: errInmuebles } = await admin
      .from('inmuebles')
      .insert(Array.from({ length: N }, (_, i) => ({ tenant_id: tenantId, codigo: `CO4-VOL-${String(i)}`, tipo_id: tipoId })))
      .select('id')
    if (errInmuebles) throw new Error(`fixture bulk inmuebles: ${errInmuebles.message}`)

    const { data: lineas, error: errLineas } = await admin
      .from('liquidacion_lineas')
      .insert(inmuebles.map((inm) => ({ tenant_id: tenantId, liquidacion_id: liquidacion, inmueble_id: inm.id, concepto_id: concepto, monto: 100_000 })))
      .select('id, inmueble_id')
    if (errLineas) throw new Error(`fixture bulk liquidacion_lineas: ${errLineas.message}`)

    const { error: errCargos } = await admin.from('cargos').insert(
      lineas.map((linea) => ({
        tenant_id: tenantId, inmueble_id: linea.inmueble_id, periodo_id: periodoId, categoria: 'capital' as const,
        origen_tipo: 'liquidacion_linea' as const, liquidacion_linea_id: linea.id, concepto_id: concepto, monto_original: 100_000,
      })),
    )
    if (errCargos) throw new Error(`fixture bulk cargos: ${errCargos.message}`)

    const { error: errMat } = await cliente.rpc('fn_contabilizar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodoId })
    if (errMat) throw errMat

    const inicio = Date.now()
    const { data, error } = await admin.rpc('contable_libro_diario', {
      p_tenant_id: tenantId, p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31`,
    })
    const duracionMs = Date.now() - inicio
    if (error) throw error
    expect(data.length).toBeGreaterThan(0)
    console.log(`[CO-4 prueba 11] Libro Diario de 500 inmuebles: ${String(duracionMs)}ms, ${String(data.length)} líneas`)
    expect(duracionMs).toBeLessThan(5_000)
  }, 120_000)
})
