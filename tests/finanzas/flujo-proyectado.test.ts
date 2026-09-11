/**
 * FIN-4 (20260932560000-20260932630000) — flujo de caja proyectado y alertas de liquidez.
 * Ver Casos de uso/Tres Modulos/Financiero/FIN_04_flujo_proyectado.md §5 (13 pruebas
 * obligatorias). Las pruebas 3, 4 y 9 son las que impiden que la proyección se convierta en un
 * juego de números (§7, criterio de aceptación).
 *
 * Decisiones aprobadas con el usuario (2026-09-09, ver cabecera de 20260932630000): tasa de
 * recaudo histórica de 12 meses; fecha de próximo pago de contratos calculada dentro de este
 * corte (no en MANT-5); plantilla de escenario conservador + reglas de alerta auto-sembrada en
 * create_tenant() como borrador/inactiva (mismo patrón que MANT-9); cron propio de Finanzas
 * replicando el patrón de cartera_corridas_diarias sin llamada HTTP.
 *
 * Los fixtures de este archivo usan crearTenant() (INSERT directo, no la RPC create_tenant) —
 * a propósito: así el tenant nace sin la plantilla auto-sembrada, que es exactamente lo que las
 * pruebas 6 y 10 verifican como comportamiento por defecto del propio corte. La plantilla
 * auto-sembrada tiene su propia prueba dedicada en flujo-plantilla-default.test.ts.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
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
  console.warn('SALTADO tests/finanzas/flujo-proyectado: faltan variables de Supabase en .env')
}

const ARCHIVOS_CORTE = [
  '20260932560000', '20260932570000', '20260932580000', '20260932590000',
  '20260932600000', '20260932610000', '20260932620000',
]

interface FilaFlujo {
  semana: number
  ingresos_esperados: number
  ingresos_otros: number
  egresos_cxp: number
  egresos_contratos: number
  egresos_mantenimiento: number
  flujo_neto: number
  saldo_acumulado: number
  componentes_insuficientes: string[]
}

d('FIN-4: flujo de caja proyectado y alertas de liquidez', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', tipo).eq('codigo', codigo).is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  async function prepararTenant(etiqueta: string): Promise<{ tenantId: string; auxiliar: Cliente }> {
    const tenant: TenantPrueba = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const { error: e1 } = await admin.rpc('fn_instanciar_plan_contable', { p_tenant_id: tenant.id })
    if (e1) throw e1
    const { error: e2 } = await admin.rpc('fn_instanciar_cuentas_default', { p_tenant_id: tenant.id })
    if (e2) throw e2

    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')
    const auxiliar = await clienteComo(env!, usuario)
    return { tenantId: tenant.id, auxiliar }
  }

  async function crearInmueble(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_INMUEBLE', 'apartamento')
    const { data, error } = await admin
      .from('inmuebles').insert({ tenant_id: tenantId, codigo, tipo_id: tipoId }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearPeriodo(tenantId: string, fechaVencimiento: string, anio: number, mes: number): Promise<string> {
    const { data, error } = await admin
      .from('periodos')
      .insert({ tenant_id: tenantId, anio, mes, estado: 'abierto', fecha_vencimiento: fechaVencimiento })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture periodo: ${error.message}`)
    return data.id
  }

  async function crearLiquidacion(tenantId: string, periodoId: string, montoTotal: number): Promise<string> {
    const { data, error } = await admin
      .from('liquidaciones')
      .insert({
        tenant_id: tenantId, periodo_id: periodoId,
        result_hash: `fin4-fixture-${String(Date.now())}-${String(Math.random())}`,
        tenant_total: montoTotal,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture liquidacion: ${error.message}`)
    return data.id
  }

  /** Cargo ordinario (categoria='capital', origen_tipo='liquidacion_linea') con vencimiento y
   * monto pagado controlados — la única vía real de crear un cargo así (constraint
   * cargos_origen_unico exige un liquidacion_linea_id real). */
  async function crearCargoOrdinario(params: {
    tenantId: string; inmuebleId: string; periodoId: string; liquidacionId: string
    monto: number; pagado?: number; fechaPago?: string
  }): Promise<string> {
    const { data: concepto, error: errConcepto } = await admin
      .from('conceptos')
      .insert({
        tenant_id: params.tenantId, codigo: `FIN4-${String(Date.now())}-${String(Math.random()).slice(2, 6)}`,
        nombre: 'Cuota', modo_calculo: 'distribucion', modo_valor: 'formulado',
        tipo_recurrencia: 'recurrente', periodicidad: 'mensual', alcance: 'todos',
        fecha_inicio_anio: 2000, fecha_inicio_mes: 1, prioridad: 100, estado: 'activo',
      })
      .select('id').single<{ id: string }>()
    if (errConcepto) throw new Error(`fixture concepto: ${errConcepto.message}`)

    const { data: linea, error: errLinea } = await admin
      .from('liquidacion_lineas')
      .insert({
        tenant_id: params.tenantId, liquidacion_id: params.liquidacionId, inmueble_id: params.inmuebleId,
        concepto_id: concepto.id, monto: params.monto,
      })
      .select('id').single<{ id: string }>()
    if (errLinea) throw new Error(`fixture liquidacion_linea: ${errLinea.message}`)

    const { data: cargo, error: errCargo } = await admin.from('cargos').insert({
      tenant_id: params.tenantId, inmueble_id: params.inmuebleId, periodo_id: params.periodoId,
      categoria: 'capital', origen_tipo: 'liquidacion_linea', liquidacion_linea_id: linea.id,
      concepto_id: concepto.id, monto_original: params.monto,
    }).select('id').single<{ id: string }>()
    if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)

    if (params.pagado) {
      const { data: pago, error: errPago } = await admin.from('pagos').insert({
        tenant_id: params.tenantId, inmueble_id: params.inmuebleId, monto: params.pagado,
        fecha_pago: params.fechaPago ?? new Date().toISOString().slice(0, 10),
        forma_pago_id: await idListaTipos('FORMA_PAGO', 'efectivo'),
      }).select('id').single<{ id: string }>()
      if (errPago) throw new Error(`fixture pago: ${errPago.message}`)
      const { error: errAplicacion } = await admin.from('pago_aplicaciones').insert({
        tenant_id: params.tenantId, pago_id: pago.id, cargo_id: cargo.id, monto: params.pagado,
      })
      if (errAplicacion) throw new Error(`fixture pago_aplicacion: ${errAplicacion.message}`)
    }
    return cargo.id
  }

  async function crearTercero(tenantId: string, primerNombre: string, primerApellido: string): Promise<string> {
    const sello = `${RUN_ID}-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`
    const tipoIdentId = await idListaTipos('TIPO_IDENTIFICACION', 'cedula')
    const estadoActivoId = await idListaTipos('ESTADO_TERCERO', 'activo')
    const { data, error } = await admin.from('terceros').insert({
      tenant_id: tenantId, tipo_persona: 'natural', tipo_identificacion_id: tipoIdentId,
      numero_documento: sello, primer_nombre: primerNombre, primer_apellido: primerApellido,
      estado_id: estadoActivoId,
    }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture tercero ${primerNombre}: ${error.message}`)
    return data.id
  }

  /** Factura ya en estado 'aprobada' — se inserta directo con ese estado (bypass del flujo
   * borrador->registrada->en_revision->aprobada) porque lo único que importa para FIN-4 es que
   * finanzas_facturas_pagables() la vea, no la mecánica de aprobación de FIN-2/3. */
  async function crearFacturaAprobada(params: {
    tenantId: string; proveedorId: string; fechaVencimiento: string; total: number; contratoId?: string
  }): Promise<string> {
    const { data, error } = await admin.from('finanzas_facturas_proveedor').insert({
      tenant_id: params.tenantId, proveedor_id: params.proveedorId,
      numero_documento: `FIN4-FAC-${String(Date.now())}-${String(Math.random()).slice(2, 6)}`,
      fecha_emision: params.fechaVencimiento, fecha_vencimiento: params.fechaVencimiento,
      subtotal: params.total, iva_generado: 0, iva_descontable: 0, total_bruto: params.total,
      total_retenciones: 0, total_neto_pagar: params.total, estado: 'aprobada',
      contrato_id: params.contratoId ?? null,
    }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture factura: ${error.message}`)
    return data.id
  }

  function fechaISO(diasDesdeHoy: number): string {
    const d1 = new Date()
    d1.setUTCDate(d1.getUTCDate() + diasDesdeHoy)
    return d1.toISOString().slice(0, 10)
  }

  it('1. escenario optimista: el índice calculado coincide con el esperado, verificado a mano', async () => {
    const { tenantId } = await prepararTenant('p1-a-mano')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-1`)
    const vencimiento = fechaISO(3)
    const periodoId = await crearPeriodo(tenantId, vencimiento, 2027, 1)
    const liquidacionId = await crearLiquidacion(tenantId, periodoId, 1_000_000)
    await crearCargoOrdinario({ tenantId, inmuebleId, periodoId, liquidacionId, monto: 1_000_000 })

    const { data, error } = await admin
      .rpc('finanzas_flujo_proyectado', { p_tenant_id: tenantId, p_horizonte_dias: 7, p_escenario: 'optimista' })
    if (error) throw error
    const filas = data as unknown as FilaFlujo[]
    expect(filas).toHaveLength(1)
    const [fila] = filas
    if (!fila) throw new Error('finanzas_flujo_proyectado no devolvió filas')
    expect(fila.ingresos_esperados).toBe(1_000_000)
    expect(fila.egresos_cxp).toBe(0)
    expect(fila.egresos_contratos).toBe(0)
    expect(fila.flujo_neto).toBe(1_000_000)
    expect(fila.saldo_acumulado).toBe(1_000_000)
  }, 30_000)

  it('2. conservador produce ingresos ≤ base y egresos ≥ base sobre los mismos datos', async () => {
    const { tenantId } = await prepararTenant('p2-conservador')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-2`)

    // Historial para la tasa de recaudo: 1.000.000 vencido hace 30 días, 600.000 pagado -> 60%.
    const periodoHistorico = await crearPeriodo(tenantId, fechaISO(-30), 2026, 1)
    const liquidacionHistorica = await crearLiquidacion(tenantId, periodoHistorico, 1_000_000)
    await crearCargoOrdinario({
      tenantId, inmuebleId, periodoId: periodoHistorico, liquidacionId: liquidacionHistorica,
      monto: 1_000_000, pagado: 600_000, fechaPago: fechaISO(-25),
    })

    // Cargo futuro dentro del horizonte, para que ingresos_esperados difiera entre escenarios.
    const periodoFuturo = await crearPeriodo(tenantId, fechaISO(10), 2027, 3)
    const liquidacionFutura = await crearLiquidacion(tenantId, periodoFuturo, 1_000_000)
    await crearCargoOrdinario({
      tenantId, inmuebleId, periodoId: periodoFuturo, liquidacionId: liquidacionFutura, monto: 1_000_000,
    })

    // conservador vigente: 40% de recaudo (< 60% histórico) + 15 días extra de proveedores.
    await admin.from('finanzas_escenario_parametros').insert({
      tenant_id: tenantId, escenario: 'conservador', version: 1, estado: 'vigente',
      pct_recaudo_esperado: 40, dias_adicionales_pago_proveedor: 15,
    })

    // Factura que vence justo después del horizonte de 30 días, pero dentro de 30+15.
    const proveedorId = await crearTercero(tenantId, 'Proveedor', 'ConservadorTest')
    await crearFacturaAprobada({ tenantId, proveedorId, fechaVencimiento: fechaISO(35), total: 500_000 })

    const { data: baseData, error: e1 } = await admin
      .rpc('finanzas_flujo_proyectado', { p_tenant_id: tenantId, p_horizonte_dias: 30, p_escenario: 'base' })
    if (e1) throw e1
    const { data: consData, error: e2 } = await admin
      .rpc('finanzas_flujo_proyectado', { p_tenant_id: tenantId, p_horizonte_dias: 30, p_escenario: 'conservador' })
    if (e2) throw e2

    const sumar = (filas: FilaFlujo[], campo: keyof FilaFlujo) =>
      filas.reduce((acc, f) => acc + Number(f[campo]), 0)
    const base = baseData as unknown as FilaFlujo[]
    const conservador = consData as unknown as FilaFlujo[]

    expect(sumar(conservador, 'ingresos_esperados')).toBeLessThanOrEqual(sumar(base, 'ingresos_esperados'))
    expect(sumar(conservador, 'egresos_cxp')).toBeGreaterThanOrEqual(sumar(base, 'egresos_cxp'))
    // La factura a +35 días no debe aparecer en base (fuera del horizonte de 30) pero sí en conservador.
    expect(sumar(base, 'egresos_cxp')).toBe(0)
    expect(sumar(conservador, 'egresos_cxp')).toBe(500_000)
  }, 30_000)

  it('3-4-5. sin historial de recaudo/MANT-9/MANT-5: insuficiente donde corresponde, cero donde no', async () => {
    const { tenantId } = await prepararTenant('p3-4-5-sin-datos')

    const { data, error } = await admin
      .rpc('finanzas_flujo_proyectado', { p_tenant_id: tenantId, p_horizonte_dias: 30, p_escenario: 'base' })
    if (error) throw error
    const filas = data as unknown as FilaFlujo[]

    for (const fila of filas) {
      // 3. ingresos_esperados sin historial de recaudo -> datos_insuficientes, no una tasa inventada.
      expect(fila.componentes_insuficientes).toContain('ingresos_esperados')
      expect(fila.ingresos_esperados).toBe(0)
      // 4. sin datos de MANT-9 -> egresos_mantenimiento datos_insuficientes, no falla.
      expect(fila.componentes_insuficientes).toContain('egresos_mantenimiento')
      expect(fila.egresos_mantenimiento).toBe(0)
      // 5. sin contratos MANT-5 -> egresos_contratos es cero, NO datos_insuficientes.
      expect(fila.componentes_insuficientes).not.toContain('egresos_contratos')
      expect(fila.egresos_contratos).toBe(0)
    }
  }, 30_000)

  it('6. ninguna migración del corte siembra coeficientes de escenario ni reglas (salvo la del addendum, documentada)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const dir = path.resolve(import.meta.dirname, '../../supabase/migrations')
    const archivos = (await fs.readdir(dir)).filter((f) => ARCHIVOS_CORTE.some((prefijo) => f.startsWith(prefijo)))
    expect(archivos).toHaveLength(7)
    for (const archivo of archivos) {
      const contenido = (await fs.readFile(path.join(dir, archivo), 'utf8')).replace(/--.*$/gm, '')
      expect(contenido).not.toMatch(/insert into public\.finanzas_escenario_parametros/i)
      expect(contenido).not.toMatch(/insert into public\.finanzas_alerta_regla/i)
    }
  })

  it('7. un snapshot congela los parámetros; cambiarlos después no altera el snapshot', async () => {
    const { tenantId, auxiliar } = await prepararTenant('p7-snapshot-inmutable')
    const { data: v1 } = await admin.from('finanzas_escenario_parametros').insert({
      tenant_id: tenantId, escenario: 'conservador', version: 1, estado: 'vigente', pct_recaudo_esperado: 50,
    }).select('id').single<{ id: string }>()

    const { data: snapshotId, error: errSnap } = await auxiliar
      .rpc('finanzas_flujo_snapshot_guardar', {
        p_tenant_id: tenantId, p_horizonte_dias: 7, p_escenario: 'conservador', p_motivo: 'prueba 7',
      })
    if (errSnap) throw errSnap

    await admin.from('finanzas_escenario_parametros').update({ estado: 'historica' }).eq('id', v1!.id)
    await admin.from('finanzas_escenario_parametros').insert({
      tenant_id: tenantId, escenario: 'conservador', version: 2, estado: 'vigente', pct_recaudo_esperado: 10,
    })

    const { data: snap, error: errLeer } = await admin
      .from('finanzas_flujo_snapshot').select('parametros').eq('id', snapshotId)
      .single<{ parametros: { escenario_parametros: { escenario: string; pct_recaudo_esperado: number }[] } }>()
    if (errLeer) throw errLeer
    const parametros = snap.parametros
    const conservadorCongelado = parametros.escenario_parametros.find((p) => p.escenario === 'conservador')
    expect(conservadorCongelado?.pct_recaudo_esperado).toBe(50)
  }, 30_000)

  it('8. finanzas_proyeccion_vs_real calcula la desviación esperada sobre datos conocidos', async () => {
    const { tenantId, auxiliar } = await prepararTenant('p8-vs-real')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-8`)
    const vencimiento = fechaISO(3)
    const periodoId = await crearPeriodo(tenantId, vencimiento, 2027, 5)
    const liquidacionId = await crearLiquidacion(tenantId, periodoId, 1_000_000)
    await crearCargoOrdinario({ tenantId, inmuebleId, periodoId, liquidacionId, monto: 1_000_000 })

    const { data: snapshotId, error: errSnap } = await auxiliar
      .rpc('finanzas_flujo_snapshot_guardar', {
        p_tenant_id: tenantId, p_horizonte_dias: 7, p_escenario: 'optimista', p_motivo: 'prueba 8',
      })
    if (errSnap) throw errSnap

    // Realidad observada: se recaudó 700.000 (no el millón proyectado) esta semana.
    const { data: pago, error: errPago } = await admin.from('pagos').insert({
      tenant_id: tenantId, inmueble_id: inmuebleId, monto: 700_000, fecha_pago: fechaISO(0),
      forma_pago_id: await idListaTipos('FORMA_PAGO', 'efectivo'),
    }).select('id').single<{ id: string }>()
    if (errPago) throw errPago
    await admin.from('pago_aplicaciones').insert({
      tenant_id: tenantId, pago_id: pago.id,
      cargo_id: (await admin.from('cargos').select('id').eq('tenant_id', tenantId).limit(1).single()).data!.id,
      monto: 700_000,
    })

    const { data: comparacion, error: errComp } = await admin
      .rpc('finanzas_proyeccion_vs_real', { p_snapshot_id: snapshotId, p_hasta: fechaISO(7) })
    if (errComp) throw errComp
    const filas = comparacion as { semana: number; flujo_neto_proyectado: number; flujo_neto_real: number; desviacion: number }[]
    expect(filas).toHaveLength(1)
    const [filaComparacion] = filas
    if (!filaComparacion) throw new Error('finanzas_proyeccion_vs_real no devolvió filas')
    expect(filaComparacion.flujo_neto_proyectado).toBe(1_000_000)
    expect(filaComparacion.flujo_neto_real).toBe(700_000)
    expect(filaComparacion.desviacion).toBe(-300_000)
  }, 30_000)

  it('9. una alerta se emite cuando corresponde y no altera ningún otro estado', async () => {
    const { tenantId } = await prepararTenant('p9-alerta-sin-efecto')
    const proveedorId = await crearTercero(tenantId, 'Proveedor', 'AlertaTest')
    // Una CxP grande y próxima sin nada que la cubra -> saldo proyectado a 30 días negativo.
    const facturaId = await crearFacturaAprobada({
      tenantId, proveedorId, fechaVencimiento: fechaISO(5), total: 50_000_000,
    })

    const { data: regla, error: errRegla } = await admin.from('finanzas_alerta_regla').insert({
      tenant_id: tenantId, tipo_id: await idListaTipos('TIPO_ALERTA_LIQUIDEZ', 'saldo_30d_negativo'),
      nombre: 'prueba 9', activa: true,
    }).select('id').single<{ id: string }>()
    if (errRegla) throw errRegla

    const { data: facturaAntes } = await admin.from('finanzas_facturas_proveedor').select('estado').eq('id', facturaId).single()

    const { data: emitidas, error } = await admin.rpc('finanzas_alertas_evaluar', { p_tenant_id: tenantId })
    if (error) throw error
    expect(emitidas).toBe(1)

    const { data: alerta } = await admin.from('finanzas_alerta_emitida').select('id').eq('regla_id', regla.id).single<{ id: string }>()
    expect(alerta).toBeTruthy()

    const { data: facturaDespues } = await admin.from('finanzas_facturas_proveedor').select('estado').eq('id', facturaId).single()
    expect(facturaDespues?.estado).toBe(facturaAntes?.estado)

    // Idempotente: correr otra vez el mismo día no emite una segunda fila.
    const { data: segundaCorrida } = await admin.rpc('finanzas_alertas_evaluar', { p_tenant_id: tenantId })
    expect(segundaCorrida).toBe(0)
  }, 30_000)

  it('10. cero reglas de alerta sembradas para un tenant creado sin pasar por create_tenant()', async () => {
    const { tenantId } = await prepararTenant('p10-cero-reglas')
    const { data, error } = await admin.from('finanzas_alerta_regla').select('id').eq('tenant_id', tenantId)
    if (error) throw error
    expect(data).toHaveLength(0)
  }, 30_000)

  it('11. cambiar la política de utilizable de FIN-1 se refleja en el saldo inicial del flujo', async () => {
    const { tenantId, auxiliar } = await prepararTenant('p11-saldo-inicial')

    const { data: sinPolitica } = await admin
      .rpc('finanzas_flujo_proyectado', { p_tenant_id: tenantId, p_horizonte_dias: 7, p_escenario: 'optimista' })
    const filasSin = sinPolitica as unknown as FilaFlujo[]
    const [filaSin] = filasSin
    if (!filaSin) throw new Error('finanzas_flujo_proyectado no devolvió filas')
    expect(filaSin.saldo_acumulado).toBe(0)

    await admin.from('finanzas_politica_tesoreria').insert({
      tenant_id: tenantId, version: 1, estado: 'vigente', incluir_caja: true,
    })

    const { data: conPolitica } = await admin
      .rpc('finanzas_flujo_proyectado', { p_tenant_id: tenantId, p_horizonte_dias: 7, p_escenario: 'optimista' })
    const filasCon = conPolitica as unknown as FilaFlujo[]
    const [filaCon] = filasCon
    if (!filaCon) throw new Error('finanzas_flujo_proyectado no devolvió filas')
    const { data: posicionCon } = await auxiliar.rpc('finanzas_posicion_tesoreria', { p_tenant_id: tenantId })
    const sumaUtilizable = (posicionCon ?? [])
      .filter((p) => p.utilizable)
      .reduce((acc, p) => acc + p.monto_disponible, 0)
    expect(filaCon.saldo_acumulado).toBe(sumaUtilizable)
  }, 30_000)

  it('12. aislamiento entre tenants: flujo, tasa de recaudo y alertas no ven datos de otro tenant', async () => {
    const { tenantId: tenantA } = await prepararTenant('p12-aislar-a')
    const { tenantId: tenantB } = await prepararTenant('p12-aislar-b')
    const inmuebleA = await crearInmueble(tenantA, `INM-${RUN_ID}-12a`)
    const periodoA = await crearPeriodo(tenantA, fechaISO(3), 2027, 7)
    const liquidacionA = await crearLiquidacion(tenantA, periodoA, 1_000_000)
    await crearCargoOrdinario({ tenantId: tenantA, inmuebleId: inmuebleA, periodoId: periodoA, liquidacionId: liquidacionA, monto: 1_000_000 })

    const { data: flujoB } = await admin
      .rpc('finanzas_flujo_proyectado', { p_tenant_id: tenantB, p_horizonte_dias: 7, p_escenario: 'optimista' })
    const filasB = flujoB as unknown as FilaFlujo[]
    const [filaB] = filasB
    if (!filaB) throw new Error('finanzas_flujo_proyectado no devolvió filas')
    expect(filaB.ingresos_esperados).toBe(0)

    await admin.from('finanzas_alerta_regla').insert({
      tenant_id: tenantA, tipo_id: await idListaTipos('TIPO_ALERTA_LIQUIDEZ', 'saldo_30d_negativo'), activa: true, nombre: 'aislar',
    })
    await admin.rpc('finanzas_alertas_evaluar', { p_tenant_id: tenantB })
    const { data: alertasB } = await admin.from('finanzas_alerta_emitida').select('id').eq('tenant_id', tenantB)
    expect(alertasB).toHaveLength(0)
  }, 30_000)

  it('13. el enum de escenario tiene comment on type', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const archivo = path.resolve(import.meta.dirname, '../../supabase/migrations/20260932560000_fin4_vocabulario.sql')
    const contenido = await fs.readFile(archivo, 'utf8')
    expect(contenido).toMatch(/create type public\.finanzas_flujo_escenario_t/)
    expect(contenido).toMatch(/comment on type public\.finanzas_flujo_escenario_t/)
  })
})
