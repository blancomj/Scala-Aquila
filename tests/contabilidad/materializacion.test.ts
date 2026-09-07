/**
 * CO-3 (20260930230000-20260930270000) — materialización: de la proyección
 * de solo lectura (`contable_movimientos()`) a comprobantes persistidos.
 * Ver Casos de uso/Tres Modulos/Contabilidad/CO_03_materializacion_asientos.md
 * §6 (12 pruebas obligatorias).
 *
 * Usa `create_tenant()` (no `crearTenant()` + `fn_instanciar_plan_contable`,
 * el patrón más liviano de CO-1/CO-2) porque este corte necesita el árbol
 * COMPLETO que solo produce el alta real: conceptos con
 * `presupuesto_cuenta_id`, hojas de `presupuesto_cuenta` con
 * `contable_cuenta_id`, y el fondo de imprevistos (GAP-22) — verificado
 * antes de escribir este archivo: un tenant recién creado por `create_tenant()`
 * ya sale con `contable_parametrizacion_pendiente()` vacío.
 *
 * `create_tenant()` deja al creador con rol 'administrador', que satisface
 * `has_role(..., ['auxiliar'])` por superconjunto (20260830100000) — así que
 * el mismo cliente autenticado sirve para dar de alta el tenant Y para llamar
 * `fn_contabilizar_periodo` (SECURITY DEFINER con verificación interna de
 * `has_role`, que con el cliente `admin` (service_role) siempre da FORBIDDEN
 * porque `auth.uid()` es null para ese rol — mismo hallazgo que CO-2).
 *
 * Prueba #5 del corte ("presupuesto_ejecucion con liquidacion IS NULL no se
 * contabiliza") ya NO es construible: 20260830490000 (anterior a CO-3) purgó
 * esas filas y puso `liquidacion NOT NULL`, y el guard exige
 * `cuenta_bancaria_id` siempre que `liquidacion = 'pagado_banco'`. Verificado
 * contra la base real: 0 filas con `liquidacion` NULL, y un intento de
 * insertar una lo confirma. Se reemplaza por una prueba de que ese caso está
 * cerrado (ver test 5) — decisión confirmada con el usuario.
 *
 * Prueba #8 del corte dice que "usar el fondo" debe debitar una cuenta de
 * GASTO. Verificado contra el comportamiento real de `contable_hechos()`
 * (bloque D, sin tocar en este corte): un 'uso' es reclasificación de
 * efectivo (111005 ↔ 111015), igual que un 'aporte' pero al revés — el gasto
 * real ocurre después, en un movimiento aparte cuando ese dinero ya en banco
 * se le paga a un proveedor. Test 8 verifica el comportamiento real,
 * confirmado con el usuario.
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
  console.warn('SALTADO tests/contabilidad/materializacion: faltan variables de Supabase en .env')
}

interface ResumenFila {
  categoria: 'creado' | 'omitido' | 'fallido' | 'sin_contrapartida'
  hecho_entidad: string
  hecho_id: string
  comprobante_id: string | null
  detalle: string | null
}

interface DetalleFila {
  cuenta_id: string
  debito: number
  credito: number
  fondo_id: string | null
  origen_entidad: string
  origen_id: string
}

const ANIO = 2034
const MES = 3
const FECHA_EN_PERIODO = `${String(ANIO)}-${String(MES).padStart(2, '0')}-15`

d('CO-3: materialización — de la proyección al asiento persistido', () => {
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
      .rpc('create_tenant', { p_name: `Materialización ${etiqueta}`, p_slug: `t-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    return { tenantId: tenant.id, cliente }
  }

  async function crearPeriodo(
    tenantId: string,
    anio: number,
    mes: number,
    contableEstado: 'abierto' | 'cerrado' = 'abierto',
  ): Promise<string> {
    const { data, error } = await admin
      .from('periodos')
      .insert({ tenant_id: tenantId, anio, mes })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture periodo: ${error.message}`)
    if (contableEstado === 'cerrado') {
      const { error: errCerrar } = await admin
        .from('periodos')
        .update({ contable_estado: 'cerrado' })
        .eq('id', data.id)
      if (errCerrar) throw errCerrar
    }
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

  async function crearInmueble(tenantId: string): Promise<string> {
    const tipoId = await tipoApartamentoId()
    const codigo = `MAT-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantId, codigo, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble: ${error.message}`)
    return data.id
  }

  /** Una hoja de ingreso ya sembrada por create_tenant() (con contable_cuenta_id) y que
   * NINGÚN concepto del tenant tiene todavía vinculada — evita competir por la misma hoja
   * que create_tenant() ya le asignó a ADMINISTRACION. */
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

  /** Un concepto propio. `presupuestoCuentaId` ausente + `estado: 'borrador'` (el mismo
   * estado con que create_tenant() siembra sus conceptos sin vincular, ver
   * tests/contabilidad/alta-parametrizacion-contable.test.ts) deja que la cuenta de crédito
   * de un cargo la resuelva el evento contable predeterminado (interés →
   * CARTERA_INTERES_MORA/INGRESO_INTERES_MORA) en vez de disparar el ámbito 'concepto' de
   * contable_parametrizacion_pendiente (que solo mira conceptos 'activo' sin cuenta). */
  async function crearConcepto(
    tenantId: string,
    codigo: string,
    opts?: { presupuestoCuentaId?: string; estado?: 'activo' | 'borrador' },
  ): Promise<string> {
    const { data, error } = await admin
      .from('conceptos')
      .insert({
        tenant_id: tenantId,
        codigo,
        nombre: codigo,
        modo_calculo: 'distribucion',
        modo_valor: 'fijo',
        valor_fijo: 1,
        prioridad: 100,
        estado: opts?.estado ?? 'activo',
        tipo_recurrencia: 'recurrente',
        periodicidad: 'mensual',
        fecha_inicio_anio: 2000,
        fecha_inicio_mes: 1,
        alcance: 'todos',
        ...(opts?.presupuestoCuentaId ? { presupuesto_cuenta_id: opts.presupuestoCuentaId } : {}),
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture concepto ${codigo}: ${error.message}`)
    return data.id
  }

  /** liquidaciones_viva_unica (L0) admite una sola liquidación viva por (tenant, periodo) — así
   * que un periodo con varios cargos de prueba comparte UNA liquidación con varias
   * liquidacion_lineas, en vez de una liquidación por cargo. */
  async function crearLiquidacion(tenantId: string, periodoId: string, montoTotal: number): Promise<string> {
    const sufijo = `${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await admin
      .from('liquidaciones')
      .insert({ tenant_id: tenantId, periodo_id: periodoId, result_hash: `mat-fixture-${sufijo}`, tenant_total: montoTotal })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture liquidacion: ${error.message}`)
    return data.id
  }

  async function armarCargo(params: {
    tenantId: string
    inmuebleId: string
    periodoId: string
    liquidacionId: string
    conceptoId: string
    monto: number
    categoria?: 'capital' | 'interes'
  }): Promise<string> {
    const { data: linea, error: errLinea } = await admin
      .from('liquidacion_lineas')
      .insert({
        tenant_id: params.tenantId,
        liquidacion_id: params.liquidacionId,
        inmueble_id: params.inmuebleId,
        concepto_id: params.conceptoId,
        monto: params.monto,
      })
      .select('id')
      .single<{ id: string }>()
    if (errLinea) throw new Error(`fixture liquidacion_linea: ${errLinea.message}`)

    const { data: cargo, error: errCargo } = await admin
      .from('cargos')
      .insert({
        tenant_id: params.tenantId,
        inmueble_id: params.inmuebleId,
        periodo_id: params.periodoId,
        categoria: params.categoria ?? 'capital',
        origen_tipo: 'liquidacion_linea',
        liquidacion_linea_id: linea.id,
        concepto_id: params.conceptoId,
        monto_original: params.monto,
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
      .insert({
        tenant_id: tenantId,
        inmueble_id: inmuebleId,
        monto,
        fecha_pago: fechaPago,
        fecha_registro: fechaPago,
        forma_pago_id: formaPagoId,
      })
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

  /** Una hoja de egreso de las que `create_tenant()` ya siembra con su
   * `contable_cuenta_id` vinculado — evita crear una cuenta presupuestal nueva sin
   * cuenta contable, que dispararía CONTABLE_PARAMETRIZACION_PENDIENTE (ámbito
   * 'cuenta_presupuestal') en vez del comportamiento que cada prueba quiere ejercitar.
   * Se exige que la cuenta contable vinculada no requiera tercero — TODAS las hojas de
   * egreso sembradas por PUC_PH_CO exigen centro de costo (verificado contra la base
   * real), así que ese lado se satisface pasando centro_costo_id en el insert. */
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

  async function idFondoImprevistos(tenantId: string): Promise<string> {
    const { data, error } = await admin
      .from('fondos')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('naturaleza', 'imprevistos')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture fondo imprevistos: ${error.message}`)
    return data.id
  }

  /** Soporte documental (D-42, guard_fondo_movimiento) — mismo patrón que
   * tests/contabilidad/fondos-dimension.test.ts. */
  async function crearDocumentoFixture(tenantId: string): Promise<string> {
    const { data: tipo, error: errTipo } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'TIPO_DOCUMENTO')
      .is('tenant_id', null)
      .eq('codigo', 'soporte_movimiento_fondo')
      .single<{ id: number }>()
    if (errTipo) throw new Error(`fixture TIPO_DOCUMENTO soporte_movimiento_fondo: ${errTipo.message}`)
    const sufijo = `${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await admin
      .from('documentos')
      .insert({
        tenant_id: tenantId,
        tipo_documento_id: tipo.id,
        nombre_archivo: 'soporte-fixture.pdf',
        storage_path: `test/${sufijo}.pdf`,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture documento soporte: ${error.message}`)
    return data.id
  }

  async function codigoCuenta(cuentaId: string): Promise<string> {
    const { data, error } = await admin
      .from('contable_cuenta')
      .select('codigo')
      .eq('id', cuentaId)
      .single<{ codigo: string }>()
    if (error) throw error
    return data.codigo
  }

  /** Cuenta contable que `contable_cuenta_default` tiene mapeada para un evento
   * contable dado, en un tenant — mismo patrón que fondos-dimension.test.ts. */
  async function codigoCuentaEvento(tenantId: string, eventoCodigo: string): Promise<string> {
    const { data: evento, error: errEvento } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'EVENTO_CONTABLE')
      .is('tenant_id', null)
      .eq('codigo', eventoCodigo)
      .single<{ id: number }>()
    if (errEvento) throw new Error(`fixture evento ${eventoCodigo}: ${errEvento.message}`)
    const { data, error } = await admin
      .from('contable_cuenta_default')
      .select('contable_cuenta:contable_cuenta_id(codigo)')
      .eq('tenant_id', tenantId)
      .eq('evento_id', evento.id)
      .single<{ contable_cuenta: { codigo: string } }>()
    if (error) throw new Error(`fixture default ${eventoCodigo}: ${error.message}`)
    return data.contable_cuenta.codigo
  }

  async function detalleDe(comprobanteId: string): Promise<DetalleFila[]> {
    const { data, error } = await admin
      .from('contable_comprobante_detalle')
      .select('cuenta_id, debito, credito, fondo_id, origen_entidad, origen_id')
      .eq('comprobante_id', comprobanteId)
    if (error) throw error
    return data as DetalleFila[]
  }

  // ── escenario compartido: un tenant, un periodo, un hecho de cada camino/entidad ──
  let escenario: {
    tenantId: string
    cliente: Cliente
    periodoId: string
    resumen: ResumenFila[]
    cargoInteresId: string
    aporteId: string
    usoId: string
  }

  beforeAll(async () => {
    const { tenantId, cliente } = await crearTenantCompleto('principal')
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)
    const inmuebleId = await crearInmueble(tenantId)

    // Camino B, entidad 'cargos' + 'pago_aplicaciones': cargo capital, recaudado en su totalidad,
    // y cargo de interés (test 6) — una sola liquidación "viva" por periodo (liquidaciones_viva_unica),
    // con una liquidacion_linea por cargo.
    const hojaIngreso = await unaHojaIngresoLibre(tenantId)
    const conceptoCapital = await crearConcepto(tenantId, 'MAT-CAPITAL', { presupuestoCuentaId: hojaIngreso })
    // Sin presupuesto_cuenta_id, y en 'borrador' (no 'activo') para no disparar el ámbito
    // 'concepto' de contable_parametrizacion_pendiente — así el crédito de este cargo lo
    // resuelve el fallback de interés, no un vínculo propio (ver test 6).
    const conceptoInteres = await crearConcepto(tenantId, 'MAT-INTERES', { estado: 'borrador' })
    const liquidacionId = await crearLiquidacion(tenantId, periodoId, 105_000)
    const cargoCapitalId = await armarCargo({
      tenantId,
      inmuebleId,
      periodoId,
      liquidacionId,
      conceptoId: conceptoCapital,
      monto: 100_000,
    })
    const pagoRecaudo = await armarPago(tenantId, inmuebleId, 100_000, FECHA_EN_PERIODO)
    await aplicarPago(tenantId, pagoRecaudo, cargoCapitalId, 100_000)

    // Camino B, entidad 'pagos': anticipo recibido sin aplicar todavía.
    await armarPago(tenantId, inmuebleId, 20_000, FECHA_EN_PERIODO)

    // Camino B, entidad 'cargos' — cargo de interés (test 6).
    const cargoInteresId = await armarCargo({
      tenantId,
      inmuebleId,
      periodoId,
      liquidacionId,
      conceptoId: conceptoInteres,
      monto: 5_000,
      categoria: 'interes',
    })

    // Camino A, entidad 'presupuesto_ejecucion': egreso pagado en caja.
    const hojaEgreso = await unaHojaEgreso(tenantId)
    const centroCostoId = await unCentroCostoId()
    const { error: errPe } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantId,
      cuenta_id: hojaEgreso,
      periodo_id: periodoId,
      monto: 30_000,
      liquidacion: 'pagado_caja',
      fecha_documento: FECHA_EN_PERIODO,
      centro_costo_id: centroCostoId,
    })
    if (errPe) throw new Error(`fixture presupuesto_ejecucion: ${errPe.message}`)

    // Camino A, entidad 'fondo_movimientos': aporte (test 7) y uso (test 8).
    const fondoId = await idFondoImprevistos(tenantId)
    const documentoId = await crearDocumentoFixture(tenantId)
    const { data: aporte, error: errAporte } = await admin
      .from('fondo_movimientos')
      .insert({
        tenant_id: tenantId,
        fondo_id: fondoId,
        tipo: 'aporte',
        monto: 50_000,
        documento_id: documentoId,
        periodo_id: periodoId,
      })
      .select('id')
      .single<{ id: string }>()
    if (errAporte) throw new Error(`fixture fondo_movimiento aporte: ${errAporte.message}`)

    const { data: uso, error: errUso } = await admin
      .from('fondo_movimientos')
      .insert({
        tenant_id: tenantId,
        fondo_id: fondoId,
        tipo: 'uso',
        monto: 10_000,
        documento_id: documentoId,
        periodo_id: periodoId,
      })
      .select('id')
      .single<{ id: string }>()
    if (errUso) throw new Error(`fixture fondo_movimiento uso: ${errUso.message}`)

    // Precondición: un tenant recién nacido no debe traer nada pendiente (alta-parametrizacion-contable.test.ts
    // ya lo cubre en general; se revalida aquí porque el resto del escenario depende de que sea cierto).
    const { data: pendientes, error: errPend } = await admin.rpc('contable_parametrizacion_pendiente', {
      p_tenant_id: tenantId,
    })
    if (errPend) throw errPend
    if (pendientes.length > 0) {
      throw new Error(`fixture: el tenant nace con pendientes inesperados: ${JSON.stringify(pendientes)}`)
    }

    const { data: resumen, error } = await cliente.rpc('fn_contabilizar_periodo', {
      p_tenant_id: tenantId,
      p_periodo_id: periodoId,
    })
    if (error) throw error

    escenario = {
      tenantId,
      cliente,
      periodoId,
      resumen: resumen as ResumenFila[],
      cargoInteresId,
      aporteId: aporte.id,
      usoId: uso.id,
    }
  }, 60_000)

  it('1. materializar un periodo completo produce comprobantes de todos los caminos; débitos = créditos', async () => {
    const creados = escenario.resumen.filter((r) => r.categoria === 'creado')
    expect(creados.length).toBeGreaterThan(0)
    expect(escenario.resumen.some((r) => r.categoria === 'fallido')).toBe(false)

    const entidadesCreadas = new Set(creados.map((r) => r.hecho_entidad))
    expect(entidadesCreadas.has('cargos')).toBe(true)
    expect(entidadesCreadas.has('pago_aplicaciones')).toBe(true)
    expect(entidadesCreadas.has('pagos')).toBe(true)
    expect(entidadesCreadas.has('presupuesto_ejecucion')).toBe(true)
    expect(entidadesCreadas.has('fondo_movimientos')).toBe(true)

    let totalDebito = 0
    let totalCredito = 0
    for (const r of creados) {
      const filas = await detalleDe(r.comprobante_id!)
      for (const f of filas) {
        totalDebito += f.debito
        totalCredito += f.credito
      }
    }
    expect(totalDebito).toBeGreaterThan(0)
    expect(totalDebito).toBe(totalCredito)
  })

  it('2. contable_conciliacion_proyeccion no reporta diferencias tras materializar', async () => {
    const { data, error } = await admin.rpc('contable_conciliacion_proyeccion', {
      p_tenant_id: escenario.tenantId,
      p_desde: `${String(ANIO)}-01-01`,
      p_hasta: `${String(ANIO)}-12-31`,
    })
    if (error) throw error
    expect(data).toEqual([])
  })

  it('3. materializar dos veces no duplica: la segunda corrida reporta todo omitido', async () => {
    const { data: segunda, error } = await escenario.cliente.rpc('fn_contabilizar_periodo', {
      p_tenant_id: escenario.tenantId,
      p_periodo_id: escenario.periodoId,
    })
    if (error) throw error
    const filas = segunda as ResumenFila[]
    expect(filas.length).toBeGreaterThan(0)
    expect(filas.every((r) => r.categoria === 'omitido')).toBe(true)
  })

  it('4. con parametrización pendiente, aborta con CONTABLE_PARAMETRIZACION_PENDIENTE y no crea nada', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('pendiente')
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)

    // Rompe a propósito una hoja presupuestal ya sembrada por create_tenant().
    const hoja = await unaHojaEgreso(tenantId)
    const { error: errRomper } = await admin
      .from('presupuesto_cuenta')
      .update({ contable_cuenta_id: null })
      .eq('id', hoja)
    if (errRomper) throw errRomper

    const { count: antes } = await admin
      .from('contable_comprobante')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)

    const { error } = await cliente.rpc('fn_contabilizar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodoId })
    expect(error?.message).toContain('CONTABLE_PARAMETRIZACION_PENDIENTE')

    const { count: despues } = await admin
      .from('contable_comprobante')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
    expect(despues).toBe(antes ?? 0)
  })

  it('5. presupuesto_ejecucion.liquidacion NULL ya es irrepresentable (cerrado antes de CO-3, no un hueco de este corte)', async () => {
    const { tenantId } = await crearTenantCompleto('sin-contrapartida')
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)
    const hoja = await unaHojaEgreso(tenantId)

    // 20260830490000 (anterior a CO-3) ya purgó las filas históricas y puso esta columna
    // NOT NULL — el insert debe fallar aquí, sin llegar nunca a fn_contabilizar_periodo.
    const { error } = await admin
      .from('presupuesto_ejecucion')
      .insert({ tenant_id: tenantId, cuenta_id: hoja, periodo_id: periodoId, monto: 10_000 } as never)
    expect(error).not.toBeNull()

    const { count } = await admin
      .from('presupuesto_ejecucion')
      .select('id', { count: 'exact', head: true })
      .is('liquidacion', null)
    expect(count).toBe(0)
  })

  it('6. un cargo de interés debita CARTERA_INTERES_MORA y acredita INGRESO_INTERES_MORA', async () => {
    const comp = escenario.resumen.find((r) => r.hecho_entidad === 'cargos' && r.categoria === 'creado')!
    const filas = await detalleDe(comp.comprobante_id!)
    const propias = filas.filter((f) => f.origen_id === escenario.cargoInteresId)
    expect(propias).toHaveLength(2)

    const debito = propias.find((f) => f.debito > 0)!
    const credito = propias.find((f) => f.credito > 0)!
    const [codigoDebito, codigoCredito, esperadoDebito, esperadoCredito] = await Promise.all([
      codigoCuenta(debito.cuenta_id),
      codigoCuenta(credito.cuenta_id),
      codigoCuentaEvento(escenario.tenantId, 'CARTERA_INTERES_MORA'),
      codigoCuentaEvento(escenario.tenantId, 'INGRESO_INTERES_MORA'),
    ])
    expect(codigoDebito).toBe(esperadoDebito)
    expect(codigoCredito).toBe(esperadoCredito)
  })

  it('7. un aporte al fondo genera reclasificación de efectivo (111015 vs 111005), nunca gasto ni pasivo/patrimonio', async () => {
    const comp = escenario.resumen.find((r) => r.hecho_entidad === 'fondo_movimientos' && r.hecho_id === escenario.aporteId)!
    expect(comp.categoria).toBe('creado')
    const filas = await detalleDe(comp.comprobante_id!)
    expect(filas).toHaveLength(2)

    const codigos = (await Promise.all(filas.map((f) => codigoCuenta(f.cuenta_id)))).sort()
    expect(codigos).toEqual(['111005', '111015'])
    for (const f of filas) expect(f.fondo_id).not.toBeNull()
  })

  it('8. el uso del fondo también es reclasificación de efectivo (111005 vs 111015), con fondo_id en ambas líneas', async () => {
    const comp = escenario.resumen.find((r) => r.hecho_entidad === 'fondo_movimientos' && r.hecho_id === escenario.usoId)!
    expect(comp.categoria).toBe('creado')
    const filas = await detalleDe(comp.comprobante_id!)
    expect(filas).toHaveLength(2)

    const codigos = (await Promise.all(filas.map((f) => codigoCuenta(f.cuenta_id)))).sort()
    expect(codigos).toEqual(['111005', '111015'])
    for (const f of filas) expect(f.fondo_id).not.toBeNull()
  })

  it('9. cada línea persistida conserva el origen_entidad/origen_id de la proyección', async () => {
    const comp = escenario.resumen.find((r) => r.hecho_entidad === 'fondo_movimientos' && r.hecho_id === escenario.aporteId)!
    const filas = await detalleDe(comp.comprobante_id!)
    expect(filas.length).toBeGreaterThan(0)
    for (const f of filas) {
      expect(f.origen_entidad).toBe('fondo_movimientos')
      expect(f.origen_id).toBe(escenario.aporteId)
    }
  })

  it('10. materializar un periodo cerrado falla con CONTABLE_PERIODO_CERRADO y no crea nada', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('periodo-cerrado')
    const periodoId = await crearPeriodo(tenantId, ANIO, MES, 'cerrado')

    const { count: antes } = await admin
      .from('contable_comprobante')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)

    const { error } = await cliente.rpc('fn_contabilizar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodoId })
    expect(error?.message).toContain('CONTABLE_PERIODO_CERRADO')

    const { count: despues } = await admin
      .from('contable_comprobante')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
    expect(despues).toBe(antes ?? 0)
  })

  it('11. no regresión: contable_movimientos()/contable_cuadre() sobre gc-001 dan los mismos números capturados antes del refactor de contable_hechos()', async () => {
    const { data: tenant, error: errTenant } = await admin
      .from('tenants')
      .select('id')
      .eq('slug', 'gc-001')
      .single<{ id: string }>()
    if (errTenant) throw new Error(`gc-001 no encontrado: ${errTenant.message}`)

    const { data: movimientos, error: errMov } = await admin.rpc('contable_movimientos', {
      p_tenant_id: tenant.id,
      p_desde: '2026-01-01',
      p_hasta: '2026-12-31',
    })
    if (errMov) throw errMov
    // Capturado con un script Node antes de aplicar 20260930230000 y comparado con
    // JSON.stringify (igualdad byte a byte) contra el mismo rango — ver CO_03_INFORME.md.
    expect(movimientos).toHaveLength(58)

    const { data: cuadre, error: errCuadre } = await admin
      .rpc('contable_cuadre', { p_tenant_id: tenant.id, p_desde: '2026-01-01', p_hasta: '2026-12-31' })
      .single<{ lineas: number; total_debito: string; total_credito: string; diferencia: string; sin_cuenta: number }>()
    if (errCuadre) throw errCuadre
    expect(cuadre.lineas).toBe(58)
    expect(Number(cuadre.total_debito)).toBe(19_178_667)
    expect(Number(cuadre.total_credito)).toBe(19_178_667)
    expect(Number(cuadre.diferencia)).toBe(0)
    expect(cuadre.sin_cuenta).toBe(5)
  })

  it('12. aislamiento entre tenants: un tenant no puede materializar el periodo de otro', async () => {
    const { tenantId: tenantB, cliente: clienteB } = await crearTenantCompleto('aislamiento-b')

    // clienteB no tiene membership en el tenant del escenario principal → has_role() falla.
    const { error: errForbidden } = await clienteB.rpc('fn_contabilizar_periodo', {
      p_tenant_id: escenario.tenantId,
      p_periodo_id: escenario.periodoId,
    })
    expect(errForbidden?.message).toContain('FORBIDDEN')

    // Cruzar tenant_id de B con un periodo_id que pertenece a otro tenant tampoco resuelve:
    // la función busca `id = p_periodo_id and tenant_id = p_tenant_id`, no lo encuentra.
    const { error: errCruzado } = await clienteB.rpc('fn_contabilizar_periodo', {
      p_tenant_id: tenantB,
      p_periodo_id: escenario.periodoId,
    })
    expect(errCruzado?.message).toContain('CONTABLE_PERIODO_CERRADO')
  })
})
