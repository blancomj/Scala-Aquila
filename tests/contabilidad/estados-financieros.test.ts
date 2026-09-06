/**
 * CO-5 (20260930440000-20260930490000) — estados financieros y notas.
 * Ver Casos de uso/Tres Modulos/Contabilidad/CO_05_estados_financieros.md §6
 * (13 pruebas obligatorias).
 *
 * Usa `create_tenant()` (mismo criterio que CO-3/CO-4/CO-7) para tener el árbol contable
 * completo, clasificado a mano vía `tenants.marco_grupo` (mismo criterio que
 * marco-contable-tenant.test.ts) y materializado vía `fn_contabilizar_periodo` (CO-3).
 *
 * De las 14 notas, solo 5 (fondo de imprevistos) y 12 (ejecución presupuestal) tienen prueba
 * numérica explícita en el corte (pruebas 10/11) — las demás (4/6/7/8/13/14) se generan con su
 * texto de respaldo ("sin cuentas bancarias activas", "sin política de deterioro vigente", "sin
 * procesos jurídicos activos"...) cuando el tenant de prueba no tiene esos datos sembrados: un
 * cuerpo no vacío igual de válido para la prueba 9, sin tener que construir cuentas_bancarias,
 * una política de deterioro o casos_juridicos (este último exige además un cliente autenticado
 * con rol administrador y una cadena certificacion_deuda/politica_financiera completa — fuera de
 * alcance de esta prueba, que no exige contenido específico de la nota 14).
 *
 * El aporte al fondo de imprevistos (nota 5 / prueba 10) se obtiene pagando un cargo real del
 * concepto FONDO_IMPREVISTOS (ya sembrado por create_tenant() en conceptos_plantilla, BLOQUE K) —
 * el trigger fn_aplicar_aporte_fondo ya existente dispara el aporte real al aplicar el pago, sin
 * insertar fondo_movimientos a mano.
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
  console.warn('SALTADO tests/contabilidad/estados-financieros: faltan variables de Supabase en .env')
}

const ANIO = 2038
const ANIO_ANTERIOR = ANIO - 1
const MES = 6
const FECHA = `${String(ANIO)}-06-15`
const FECHA_ANTERIOR = `${String(ANIO_ANTERIOR)}-03-10`
const FECHA_CORTE = `${String(ANIO)}-12-31`
const FECHA_CORTE_ANTERIOR = `${String(ANIO_ANTERIOR)}-12-31`

const CAPITAL_ANTERIOR = 40_000
const CAPITAL_ACTUAL = 200_000
const APORTE_FONDO = 60_000
const EGRESO = 30_000
const PRESUPUESTADO_EGRESO = 400_000

interface FilaEstado {
  codigo: string
  orden: number
  nivel: number
  etiqueta: string
  tipo_linea: string
  nota_referencia: number | null
  valor: number | null
  valor_anterior: number | null
  variacion_absoluta: number | null
  variacion_relativa: number | null
}

interface FilaNota {
  id: string
  tenant_id: string
  ejercicio: number
  plantilla_id: string
  numero: number
  titulo: string
  cuerpo: string
  estado: 'generada' | 'editada'
  generada_at: string
  editada_por: string | null
  editada_at: string | null
}

interface FilaLinea {
  codigo: string
  selector_cuentas: string | null
  orden: number
}

interface FilaMayor {
  cuenta_id: string
  cuenta_codigo: string
  saldo_final: number
}

function porCodigo(filas: FilaEstado[], codigo: string): FilaEstado {
  const fila = filas.find((f) => f.codigo === codigo)
  if (!fila) throw new Error(`línea ${codigo} no encontrada en el estado`)
  return fila
}

d('CO-5: estados financieros y notas', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  // ── fixtures (mismo patrón que tests/contabilidad/libros-oficiales.test.ts / materializacion.test.ts) ──

  async function crearTenantCompleto(etiqueta: string): Promise<{ tenantId: string; cliente: Cliente }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)
    const { data: tenant, error } = await cliente
      .rpc('create_tenant', { p_name: `CO-5 ${etiqueta}`, p_slug: `t-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    return { tenantId: tenant.id, cliente }
  }

  async function clasificar(tenantId: string, marcoGrupo: 'grupo_2' | 'grupo_3'): Promise<void> {
    const { error } = await admin
      .from('tenants')
      .update({ marco_grupo: marcoGrupo, uso_economico: 'residencial' })
      .eq('id', tenantId)
    if (error) throw new Error(`fixture clasificar (${marcoGrupo}): ${error.message}`)
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
      .insert({ tenant_id: tenantId, codigo: `CO5-${sufijo}`, tipo_id: tipoId })
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

  async function conceptoFondoImprevistosId(tenantId: string): Promise<string> {
    const { data, error } = await admin
      .from('conceptos')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('codigo', 'FONDO_IMPREVISTOS')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture concepto FONDO_IMPREVISTOS: ${error.message}`)
    return data.id
  }

  /** ADMINISTRACION ya viene sembrado por create_tenant() con su propia hoja de ingreso
   * ('cuotas_administracion', vinculada a la cuenta contable 4105) — se reutiliza tal cual en
   * vez de crear un concepto nuevo con `unaHojaIngresoLibre()`, que da CUALQUIER hoja libre (no
   * necesariamente 4105) y rompería la prueba 4 (4105 vs 4115 son códigos concretos). */
  async function conceptoAdministracionId(tenantId: string): Promise<string> {
    const { data, error } = await admin
      .from('conceptos')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('codigo', 'ADMINISTRACION')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture concepto ADMINISTRACION: ${error.message}`)
    return data.id
  }

  async function crearLiquidacion(tenantId: string, periodoId: string, montoTotal: number): Promise<string> {
    const sufijo = `${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await admin
      .from('liquidaciones')
      .insert({ tenant_id: tenantId, periodo_id: periodoId, result_hash: `co5-fixture-${sufijo}`, tenant_total: montoTotal })
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

  /** cargo + pago + aplicación de un concepto, en un periodo — el flujo común a capital y al
   * cargo del fondo de imprevistos (que además dispara el aporte real vía trigger). */
  async function pagarCargoCompleto(params: {
    tenantId: string; inmuebleId: string; periodoId: string; liquidacionId: string
    conceptoId: string; monto: number; fecha: string
  }): Promise<void> {
    const cargoId = await armarCargo(params)
    const pagoId = await armarPago(params.tenantId, params.inmuebleId, params.monto, params.fecha)
    await aplicarPago(params.tenantId, pagoId, cargoId, params.monto)
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

  /** presupuesto vigente del ejercicio + un rubro presupuestado sobre la misma hoja de egreso
   * que se paga en caja — así presupuesto_cuenta_ejecucion() da presupuestado Y ejecutado
   * reales sobre la misma cuenta (nota 12 / prueba 11). */
  async function crearPresupuestoVigente(tenantId: string, anio: number, hojaEgresoId: string): Promise<string> {
    const { data: presupuesto, error: errPresupuesto } = await admin
      .from('presupuestos')
      .insert({ tenant_id: tenantId, anio, version: 1, estado: 'vigente', monto_total: PRESUPUESTADO_EGRESO })
      .select('id')
      .single<{ id: string }>()
    if (errPresupuesto) throw new Error(`fixture presupuesto: ${errPresupuesto.message}`)
    const { error: errRubro } = await admin.from('presupuesto_rubros').insert({
      tenant_id: tenantId, presupuesto_id: presupuesto.id, codigo: 'CO5-RUBRO', nombre: 'Rubro de prueba CO-5',
      monto_anual: PRESUPUESTADO_EGRESO, cuenta_id: hojaEgresoId,
    })
    if (errRubro) throw new Error(`fixture presupuesto_rubro: ${errRubro.message}`)
    return presupuesto.id
  }

  async function cuentaPorCodigo(tenantId: string, codigo: string): Promise<{ id: string }> {
    const { data, error } = await admin
      .from('contable_cuenta')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('codigo', codigo)
      .single<{ id: string }>()
    if (error) throw new Error(`fixture cuenta ${codigo}: ${error.message}`)
    return data
  }

  /** Saldo real de todas las subcuentas de la clase 11 (efectivo) — consulta independiente del
   * motor de estados, usada para verificar por reconciliación directa que el EFE no absorbe el
   * traslado interno 111005↔111015 (prueba 8). */
  async function efectivoRealAcumulado(tenantId: string, hasta: string): Promise<number> {
    const { data, error } = await admin.rpc('contable_libro_mayor', {
      p_tenant_id: tenantId, p_desde: '0001-01-01', p_hasta: hasta,
    })
    if (error) throw error
    return (data as FilaMayor[])
      .filter((f) => f.cuenta_codigo.startsWith('11'))
      .reduce((s, f) => s + f.saldo_final, 0)
  }

  function moneda(n: number): string {
    return `$${Math.round(n).toLocaleString('en-US')}`
  }

  // ── escenario compartido: un tenant Grupo 2 con datos reales de UN solo ejercicio ──
  //
  // Deliberadamente un solo ejercicio: sin CO-6 (cierre y apertura, aún no implementado) no
  // existe ningún asiento de cierre que traslade el resultado de un ejercicio anterior a
  // resultados acumulados (3305) — así que cualquier saldo de caja proveniente de un ejercicio
  // ya cerrado quedaría en el activo (modo 'saldo', siempre acumulado) sin su contrapartida en
  // patrimonio, rompiendo activo = pasivo + patrimonio (prueba 1) por construcción, no por un
  // error del motor. La prueba 7 (comparativo) usa su propio tenant aislado de dos ejercicios,
  // exactamente para no mezclar esa verificación con el cuadre de este escenario.
  let escenario: {
    tenantId: string
    cliente: Cliente
    hojaEgresoId: string
    presupuestoId: string
  }

  beforeAll(async () => {
    const { tenantId, cliente } = await crearTenantCompleto('principal')
    await clasificar(tenantId, 'grupo_2')

    const periodoActual = await crearPeriodo(tenantId, ANIO, MES)
    const inmuebleId = await crearInmueble(tenantId, 'principal')
    const conceptoCapitalId = await conceptoAdministracionId(tenantId)
    const liquidacionActual = await crearLiquidacion(tenantId, periodoActual, CAPITAL_ACTUAL + APORTE_FONDO)
    await pagarCargoCompleto({
      tenantId, inmuebleId, periodoId: periodoActual, liquidacionId: liquidacionActual,
      conceptoId: conceptoCapitalId, monto: CAPITAL_ACTUAL, fecha: FECHA,
    })
    const conceptoFondoId = await conceptoFondoImprevistosId(tenantId)
    await pagarCargoCompleto({
      tenantId, inmuebleId, periodoId: periodoActual, liquidacionId: liquidacionActual,
      conceptoId: conceptoFondoId, monto: APORTE_FONDO, fecha: FECHA,
    })

    const hojaEgresoId = await unaHojaEgreso(tenantId)
    const centroCostoId = await unCentroCostoId()
    const { error: errPe } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantId, cuenta_id: hojaEgresoId, periodo_id: periodoActual, monto: EGRESO,
      liquidacion: 'pagado_caja', fecha_documento: FECHA, centro_costo_id: centroCostoId,
    })
    if (errPe) throw new Error(`fixture presupuesto_ejecucion: ${errPe.message}`)

    const presupuestoId = await crearPresupuestoVigente(tenantId, ANIO, hojaEgresoId)

    const { error: errPend } = await admin.rpc('contable_parametrizacion_pendiente', { p_tenant_id: tenantId })
    if (errPend) throw errPend

    const { error: errMatActual } = await cliente.rpc('fn_contabilizar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodoActual })
    if (errMatActual) throw errMatActual

    escenario = { tenantId, cliente, hojaEgresoId, presupuestoId }
  }, 90_000)

  it('1. en el ESF: activo = pasivo + patrimonio, incorporando el resultado del ejercicio', async () => {
    const { data, error } = await admin.rpc('contable_estado_financiero', {
      p_tenant_id: escenario.tenantId, p_codigo_estado: 'estado_situacion_financiera', p_fecha_corte: FECHA_CORTE,
    })
    if (error) throw error
    const filas = data as FilaEstado[]
    const totalActivo = porCodigo(filas, 'total_activo').valor!
    const totalPasivoMasPatrimonio = porCodigo(filas, 'total_pasivo_mas_patrimonio').valor!
    expect(totalActivo).toBeGreaterThan(0)
    expect(totalActivo).toBe(totalPasivoMasPatrimonio)
  })

  it('2. el resultado del ER coincide exactamente con el resultado incorporado en el ESF', async () => {
    const [{ data: er, error: errEr }, { data: esf, error: errEsf }] = await Promise.all([
      admin.rpc('contable_estado_financiero', { p_tenant_id: escenario.tenantId, p_codigo_estado: 'estado_resultados', p_fecha_corte: FECHA_CORTE }),
      admin.rpc('contable_estado_financiero', { p_tenant_id: escenario.tenantId, p_codigo_estado: 'estado_situacion_financiera', p_fecha_corte: FECHA_CORTE }),
    ])
    if (errEr) throw errEr
    if (errEsf) throw errEsf
    const resultadoEr = porCodigo(er, 'resultado_ejercicio').valor!
    const resultadoEsf = porCodigo(esf, 'resultado_ejercicio').valor!
    expect(resultadoEr).toBe(resultadoEsf)

    const { data: directo, error: errDirecto } = await admin
      .rpc('contable_resultado_ejercicio', { p_tenant_id: escenario.tenantId, p_fecha_corte: FECHA_CORTE })
    if (errDirecto) throw errDirecto
    expect(resultadoEr).toBe(directo)
  })

  it('3. el fondo de imprevistos aparece dentro del activo corriente y en ninguna línea de pasivo ni de patrimonio, en ambos grupos', async () => {
    for (const grupo of ['grupo_2', 'grupo_3'] as const) {
      const { data: plantilla, error: errPlantilla } = await admin
        .from('contable_estado_plantilla')
        .select('id')
        .eq('codigo', 'estado_situacion_financiera')
        .eq('marco_grupo', grupo)
        .eq('vigente', true)
        .single<{ id: string }>()
      if (errPlantilla) throw errPlantilla

      const { data: lineas, error: errLineas } = await admin
        .from('contable_estado_linea')
        .select('codigo, selector_cuentas, orden')
        .eq('plantilla_id', plantilla.id)
        .not('selector_cuentas', 'is', null)
      if (errLineas) throw errLineas
      const filas = lineas as FilaLinea[]

      // activo_efectivo (orden 30, dentro de "Activo corriente") selecciona '11' — cubre
      // 111005 (banco) Y 111015 (fondo de imprevistos): el fondo SÍ está en el activo.
      const activoEfectivo = filas.find((f) => f.codigo === 'activo_efectivo')!
      expect(activoEfectivo.selector_cuentas).toBe('11')
      expect(activoEfectivo.orden).toBeLessThan(200) // dentro de la sección ACTIVO, no PASIVO/PATRIMONIO

      // Ninguna línea de pasivo (orden 200-399) ni de patrimonio (orden 400+) selecciona '11'
      // (el fondo), ni los códigos retirados 27/32 (CTCP 0146/2025) — el fondo nunca aparece
      // como pasivo ni como patrimonio, por construcción del catálogo.
      const pasivoPatrimonio = filas.filter((f) => f.orden >= 200)
      for (const linea of pasivoPatrimonio) {
        expect(linea.selector_cuentas).not.toBe('11')
        expect(linea.selector_cuentas?.startsWith('27')).toBe(false)
        expect(linea.selector_cuentas?.startsWith('32')).toBe(false)
      }
    }

    // Dato real: el saldo de 111015 (fondo) del escenario Grupo 2 queda efectivamente
    // incorporado en 'activo_efectivo' (no se pierde, no se excluye).
    const { data: esf, error } = await admin.rpc('contable_estado_financiero', {
      p_tenant_id: escenario.tenantId, p_codigo_estado: 'estado_situacion_financiera', p_fecha_corte: FECHA_CORTE,
    })
    if (error) throw error
    const activoEfectivoValor = porCodigo(esf, 'activo_efectivo').valor!
    expect(activoEfectivoValor).toBeGreaterThanOrEqual(APORTE_FONDO)
  })

  it('4. la cuota del fondo (4115) se presenta en una línea distinta de la ordinaria (4105)', async () => {
    const { data, error } = await admin.rpc('contable_estado_financiero', {
      p_tenant_id: escenario.tenantId, p_codigo_estado: 'estado_resultados', p_fecha_corte: FECHA_CORTE,
    })
    if (error) throw error
    const filas = data as FilaEstado[]
    const ordinaria = porCodigo(filas, 'ingreso_cuota_ordinaria')
    const fondo = porCodigo(filas, 'ingreso_fondo_imprevistos')
    expect(ordinaria.codigo).not.toBe(fondo.codigo)
    expect(ordinaria.nota_referencia).toBe(10)
    expect(fondo.nota_referencia).toBe(5)
    expect(ordinaria.valor).toBe(CAPITAL_ACTUAL)
    expect(fondo.valor).toBe(APORTE_FONDO)
  })

  it('5. un tenant Grupo 3 obtiene tres estados; uno Grupo 2, cinco; pedir ECP a un Grupo 3 da error explícito', async () => {
    const { tenantId: tenantG3 } = await crearTenantCompleto('grupo3')
    await clasificar(tenantG3, 'grupo_3')

    const [{ data: marcoG3, error: errG3 }, { data: marcoG2, error: errG2 }] = await Promise.all([
      admin.rpc('tenant_marco_contable', { p_tenant_id: tenantG3 }).single<{ estados_requeridos: string[] }>(),
      admin.rpc('tenant_marco_contable', { p_tenant_id: escenario.tenantId }).single<{ estados_requeridos: string[] }>(),
    ])
    if (errG3) throw errG3
    if (errG2) throw errG2
    expect(marcoG3.estados_requeridos).toHaveLength(3)
    expect(marcoG3.estados_requeridos).not.toContain('estado_cambios_patrimonio')
    expect(marcoG2.estados_requeridos).toHaveLength(5)

    const { error: errEcp } = await admin.rpc('contable_estado_financiero', {
      p_tenant_id: tenantG3, p_codigo_estado: 'estado_cambios_patrimonio', p_fecha_corte: FECHA_CORTE,
    })
    expect(errEcp?.message).toContain('ESTADO_NO_REQUERIDO_PARA_GRUPO')
  }, 20_000)

  it('6. un tenant sin clasificar → MARCO_CONTABLE_SIN_CLASIFICAR, sin emitir nada', async () => {
    const { tenantId } = await crearTenantCompleto('sin-clasificar')
    const { data, error } = await admin.rpc('contable_estado_financiero', {
      p_tenant_id: tenantId, p_codigo_estado: 'estado_situacion_financiera', p_fecha_corte: FECHA_CORTE,
    })
    expect(error?.message).toContain('MARCO_CONTABLE_SIN_CLASIFICAR')
    expect(data).toBeNull()
  }, 20_000)

  it('7. el comparativo trae las cifras del ejercicio anterior y la variación es aritméticamente correcta', async () => {
    // Tenant aislado y propio (no el escenario compartido): necesita datos reales en DOS
    // ejercicios, algo que el escenario compartido evita a propósito (ver comentario junto a
    // `escenario`, arriba) para no romper la prueba 1. El código de cuenta no importa aquí (solo
    // se lee activo_efectivo), así que se reutiliza cualquier hoja de ingreso libre.
    const { tenantId, cliente } = await crearTenantCompleto('comparativo')
    await clasificar(tenantId, 'grupo_2')
    const inmuebleId = await crearInmueble(tenantId, 'unico')
    const hojaIngreso = await unaHojaIngresoLibre(tenantId)
    const conceptoId = await crearConcepto(tenantId, 'CO5-COMPARATIVO', { presupuestoCuentaId: hojaIngreso })

    const periodoAnterior = await crearPeriodo(tenantId, ANIO_ANTERIOR, 3)
    const liquidacionAnterior = await crearLiquidacion(tenantId, periodoAnterior, CAPITAL_ANTERIOR)
    await pagarCargoCompleto({
      tenantId, inmuebleId, periodoId: periodoAnterior, liquidacionId: liquidacionAnterior,
      conceptoId, monto: CAPITAL_ANTERIOR, fecha: FECHA_ANTERIOR,
    })
    const { error: errMatAnterior } = await cliente.rpc('fn_contabilizar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodoAnterior })
    if (errMatAnterior) throw errMatAnterior

    const periodoActual = await crearPeriodo(tenantId, ANIO, MES)
    const liquidacionActual = await crearLiquidacion(tenantId, periodoActual, CAPITAL_ACTUAL)
    await pagarCargoCompleto({
      tenantId, inmuebleId, periodoId: periodoActual, liquidacionId: liquidacionActual,
      conceptoId, monto: CAPITAL_ACTUAL, fecha: FECHA,
    })
    const { error: errMatActual } = await cliente.rpc('fn_contabilizar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodoActual })
    if (errMatActual) throw errMatActual

    const { data, error } = await admin.rpc('contable_estado_financiero', {
      p_tenant_id: tenantId, p_codigo_estado: 'estado_situacion_financiera', p_fecha_corte: FECHA_CORTE, p_comparativo: true,
    })
    if (error) throw error
    const activoEfectivo = porCodigo(data, 'activo_efectivo')
    expect(activoEfectivo.valor_anterior).toBe(CAPITAL_ANTERIOR)
    expect(activoEfectivo.valor).toBe(CAPITAL_ANTERIOR + CAPITAL_ACTUAL)
    expect(activoEfectivo.variacion_absoluta).toBe(activoEfectivo.valor! - activoEfectivo.valor_anterior!)
    expect(activoEfectivo.variacion_relativa).toBeCloseTo(
      (activoEfectivo.variacion_absoluta! / Math.abs(activoEfectivo.valor_anterior!)) * 100, 4,
    )

    const { data: sinComparativo, error: errSin } = await admin.rpc('contable_estado_financiero', {
      p_tenant_id: tenantId, p_codigo_estado: 'estado_situacion_financiera', p_fecha_corte: FECHA_CORTE, p_comparativo: false,
    })
    if (errSin) throw errSin
    const sinComparativoFila = porCodigo(sinComparativo, 'activo_efectivo')
    expect(sinComparativoFila.valor_anterior).toBeNull()
    expect(sinComparativoFila.variacion_absoluta).toBeNull()
  }, 30_000)

  it('8. en el EFE, el traslado 111005→111015 (aporte al fondo) no genera flujo neto', async () => {
    const { data: plantilla, error: errPlantilla } = await admin
      .from('contable_estado_plantilla')
      .select('id')
      .eq('codigo', 'estado_flujos_efectivo').eq('marco_grupo', 'grupo_2').eq('vigente', true)
      .single<{ id: string }>()
    if (errPlantilla) throw errPlantilla
    const { data: lineas, error: errLineas } = await admin
      .from('contable_estado_linea')
      .select('codigo, selector_cuentas')
      .eq('plantilla_id', plantilla.id)
      .not('selector_cuentas', 'is', null)
    if (errLineas) throw errLineas
    // Estructural: ninguna línea de actividad (todas las que tienen selector_cuentas propio)
    // selecciona la cuenta 11 — el traslado interno del aporte JAMÁS puede aparecer como flujo.
    for (const linea of lineas as FilaLinea[]) {
      if (linea.codigo === 'efectivo_inicio_ejercicio') continue // única excepción: conciliación
      expect(linea.selector_cuentas).not.toBe('11')
    }

    const { data: efe, error } = await admin.rpc('contable_estado_financiero', {
      p_tenant_id: escenario.tenantId, p_codigo_estado: 'estado_flujos_efectivo', p_fecha_corte: FECHA_CORTE,
    })
    if (error) throw error
    const filas = efe as FilaEstado[]

    // Numérico: la conciliación de apertura/cierre del EFE coincide con el saldo real
    // (independiente) de la cuenta 11 — si el traslado hubiera "filtrado" a alguna actividad,
    // el método indirecto (que nunca lee la cuenta 11 directamente) dejaría de cuadrar contra
    // el saldo real de esa misma cuenta.
    const [efectivoRealInicio, efectivoRealFin] = await Promise.all([
      efectivoRealAcumulado(escenario.tenantId, FECHA_CORTE_ANTERIOR),
      efectivoRealAcumulado(escenario.tenantId, FECHA_CORTE),
    ])
    expect(porCodigo(filas, 'efectivo_inicio_ejercicio').valor).toBe(efectivoRealInicio)
    expect(porCodigo(filas, 'efectivo_fin_ejercicio').valor).toBe(efectivoRealFin)
  })

  it('9. las 14 notas se generan; las obligatorias no pueden quedar vacías al exportar', async () => {
    const { data, error } = await escenario.cliente.rpc('fn_generar_notas', { p_tenant_id: escenario.tenantId, p_ejercicio: ANIO })
    if (error) throw error
    const notas = data as FilaNota[]
    expect(notas).toHaveLength(14)
    for (const nota of notas) {
      expect(nota.cuerpo.trim().length).toBeGreaterThan(0)
      expect(nota.cuerpo).not.toContain('{{')
    }

    const { error: errValida } = await admin.rpc('contable_validar_notas_completas', { p_tenant_id: escenario.tenantId, p_ejercicio: ANIO })
    expect(errValida).toBeNull()

    // Nota obligatoria vacía → NOTA_OBLIGATORIA_VACIA, en un tenant aparte (no interfiere con
    // el resto de las pruebas de este escenario compartido).
    const { tenantId: tenantVacio, cliente: clienteVacio } = await crearTenantCompleto('nota-vacia')
    await clasificar(tenantVacio, 'grupo_3')
    const { data: notasVacio, error: errNotasVacio } = await clienteVacio.rpc('fn_generar_notas', { p_tenant_id: tenantVacio, p_ejercicio: ANIO })
    if (errNotasVacio) throw errNotasVacio
    const primeraNota = (notasVacio as FilaNota[])[0]!
    const { error: errBlanquear } = await admin.from('contable_nota').update({ cuerpo: '' }).eq('id', primeraNota.id)
    if (errBlanquear) throw errBlanquear
    const { error: errValidaVacio } = await admin.rpc('contable_validar_notas_completas', { p_tenant_id: tenantVacio, p_ejercicio: ANIO })
    expect(errValidaVacio?.message).toContain('NOTA_OBLIGATORIA_VACIA')
  }, 20_000)

  it('10. la nota 5 (fondo de imprevistos) cuadra con el saldo de 111015', async () => {
    const cuenta111015 = await cuentaPorCodigo(escenario.tenantId, '111015')
    const { data: mayor, error } = await admin.rpc('contable_libro_mayor', {
      p_tenant_id: escenario.tenantId, p_desde: '0001-01-01', p_hasta: FECHA_CORTE, p_cuenta_id: cuenta111015.id,
    })
    if (error) throw error
    const saldoReal111015 = (mayor as FilaMayor[])[0]?.saldo_final ?? 0
    expect(saldoReal111015).toBe(APORTE_FONDO)

    const { data: notas, error: errNotas } = await admin
      .from('contable_nota')
      .select('cuerpo, contable_nota_plantilla:plantilla_id!inner(codigo)')
      .eq('tenant_id', escenario.tenantId).eq('ejercicio', ANIO)
      .eq('contable_nota_plantilla.codigo', 'fondo_imprevistos')
      .single<{ cuerpo: string }>()
    if (errNotas) throw errNotas
    expect(notas.cuerpo).toContain(`saldo final ${moneda(saldoReal111015)}`)
  })

  it('11. la nota 12 (ejecución presupuestal) cuadra con presupuesto_cuenta_ejecucion()', async () => {
    const { data: ejecucion, error } = await admin.rpc('presupuesto_cuenta_ejecucion', { p_presupuesto_id: escenario.presupuestoId })
    if (error) throw error
    const filaHoja = (ejecucion as { cuenta_id: string; presupuestado: number; ejecutado: number }[])
      .find((f) => f.cuenta_id === escenario.hojaEgresoId)!
    expect(filaHoja.presupuestado).toBe(PRESUPUESTADO_EGRESO)
    expect(filaHoja.ejecutado).toBe(EGRESO)

    const { data: notas, error: errNotas } = await admin
      .from('contable_nota')
      .select('cuerpo, contable_nota_plantilla:plantilla_id!inner(codigo)')
      .eq('tenant_id', escenario.tenantId).eq('ejercicio', ANIO)
      .eq('contable_nota_plantilla.codigo', 'ejecucion_presupuestal')
      .single<{ cuerpo: string }>()
    if (errNotas) throw errNotas
    expect(notas.cuerpo).toContain(`presupuestado ${moneda(filaHoja.presupuestado)}`)
    expect(notas.cuerpo).toContain(`ejecutado ${moneda(filaHoja.ejecutado)}`)
  })

  it('12. editar una nota conserva la marca de edición y no se pierde al regenerar el resto', async () => {
    const { data: notaHechos, error: errNota } = await admin
      .from('contable_nota')
      .select('id, generada_at, contable_nota_plantilla:plantilla_id!inner(codigo)')
      .eq('tenant_id', escenario.tenantId).eq('ejercicio', ANIO)
      .eq('contable_nota_plantilla.codigo', 'hechos_posteriores')
      .single<{ id: string; generada_at: string }>()
    if (errNota) throw errNota

    const textoEditado = 'Texto redactado a mano para la prueba 12 de CO-5.'
    const { error: errEditar } = await escenario.cliente
      .from('contable_nota')
      .update({ cuerpo: textoEditado })
      .eq('id', notaHechos.id)
    if (errEditar) throw errEditar

    const { data: editada, error: errLeer } = await admin
      .from('contable_nota')
      .select('cuerpo, estado, editada_por, editada_at')
      .eq('id', notaHechos.id)
      .single<{ cuerpo: string; estado: string; editada_por: string | null; editada_at: string | null }>()
    if (errLeer) throw errLeer
    expect(editada.estado).toBe('editada')
    expect(editada.cuerpo).toBe(textoEditado)
    expect(editada.editada_por).not.toBeNull()
    expect(editada.editada_at).not.toBeNull()

    // Regenerar el resto no debe tocar la nota editada.
    const { error: errRegenerar } = await escenario.cliente.rpc('fn_generar_notas', { p_tenant_id: escenario.tenantId, p_ejercicio: ANIO })
    if (errRegenerar) throw errRegenerar

    const { data: trasRegenerar, error: errTrasRegenerar } = await admin
      .from('contable_nota')
      .select('cuerpo, estado')
      .eq('id', notaHechos.id)
      .single<{ cuerpo: string; estado: string }>()
    if (errTrasRegenerar) throw errTrasRegenerar
    expect(trasRegenerar.estado).toBe('editada')
    expect(trasRegenerar.cuerpo).toBe(textoEditado)
  })

  it('13. aislamiento entre tenants', async () => {
    const { tenantId: tenantB, cliente: clienteB } = await crearTenantCompleto('aislamiento-b')

    const { data, error } = await clienteB.rpc('contable_estado_financiero', {
      p_tenant_id: escenario.tenantId, p_codigo_estado: 'estado_situacion_financiera', p_fecha_corte: FECHA_CORTE,
    })
    // Sin membresía en el tenant del escenario, tenant_marco_contable() no puede leer su fila de
    // `tenants` (RLS) — el marco resuelve como no clasificado, nunca los datos reales.
    expect(error?.message).toContain('MARCO_CONTABLE_SIN_CLASIFICAR')
    expect(data).toBeNull()

    const { error: errNotas } = await clienteB.rpc('fn_generar_notas', { p_tenant_id: escenario.tenantId, p_ejercicio: ANIO })
    expect(errNotas?.message).toContain('FORBIDDEN')

    const { count } = await admin
      .from('contable_nota')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantB)
    expect(count).toBe(0)
  }, 20_000)
})
