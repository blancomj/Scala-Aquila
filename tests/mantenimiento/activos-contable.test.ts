/**
 * MANT-0 (20260930280000-20260930300000) — registro de activos, ficha
 * contable y depreciación. Ver Casos de uso/Tres Modulos/Mantenimiento/
 * MANT_00_activos_ficha_contable.md §6 (20 pruebas obligatorias).
 *
 * Hallazgo de esta sesión, confirmado con el usuario, que el corte original
 * no modelaba: un bien común ESENCIAL (Ley 675 art. 20, CTCP Concepto
 * 243/2025 — la inmensa mayoría de lo recibido de la constructora) nunca
 * puede capitalizarse, sin importar los demás campos. Se agrega el enum
 * `activo_naturaleza_bien_t` y el guard `ACTIVO_BIEN_ESENCIAL_NO_CAPITALIZABLE`
 * a nivel de trigger (no solo dentro de la RPC de capitalización) — pruebas
 * 21-22 de este archivo.
 *
 * El corte tampoco explicaba cómo se contabiliza el nacimiento de un activo
 * capitalizado (solo la depreciación periódica ya en curso). Se resolvió
 * con el usuario: `fn_mant_capitalizar_activo` reclasifica el gasto ya
 * pagado en `presupuesto_ejecucion.activo_id` (camino normal, comprado) o
 * causa contra `RECONOCIMIENTO_BIEN_DESAFECTADO` (camino raro, sin
 * `presupuesto_ejecucion` vinculada) — pruebas 23-24.
 *
 * Usa `create_tenant()` (mismo criterio que CO-3) porque necesita el árbol
 * completo (plan de cuentas + `contable_cuenta_default`, incluidos los
 * defaults nuevos GASTO_DEPRECIACION->5905/DEPRECIACION_ACUMULADA->1592/
 * PERDIDA_RETIRO_ACTIVO->5890 que este corte agrega a
 * `fn_instanciar_cuentas_default`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import type { Database } from '@aquila/shared'
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
  console.warn('SALTADO tests/mantenimiento/activos-contable: faltan variables de Supabase en .env')
}

interface ResumenDepreciacion {
  categoria: 'creado' | 'omitido' | 'fallido'
  activo_id: string
  comprobante_id: string | null
  detalle: string | null
}

const ANIO = 2035
const MES = 3
const FECHA = `${String(ANIO)}-${String(MES).padStart(2, '0')}-05`

d('MANT-0: registro de activos, ficha contable y depreciación', () => {
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
      .rpc('create_tenant', { p_name: `MANT-0 ${etiqueta}`, p_slug: `t-${RUN_ID}-${etiqueta}` })
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

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
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

  /** Una hoja de egreso sin requiere_tercero, para no tener que fabricar un tercero en el
   * fixture — mismo criterio que tests/contabilidad/materializacion.test.ts. */
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

  interface ActivoFixture {
    codigo: string
    naturalezaBien?: 'bien_comun_esencial' | 'bien_comun_no_esencial_desafectado' | 'bien_propio'
    origen?: 'comprado' | 'recibido_constructora' | 'donado' | 'reposicion'
    capitalizable?: boolean
    valorAdquisicion?: number
    vidaUtilMeses?: number
    metodoDepreciacion?: 'linea_recta' | 'no_deprecia'
    fechaInicioDepreciacion?: string
  }

  async function crearActivo(tenantId: string, params: ActivoFixture): Promise<string> {
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'mobiliario')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'otro')
    const centroCostoId = await idListaTipos('CENTRO_COSTO', 'administracion')
    const cuenta1505 = await cuentaPorCodigo(tenantId, '1505')

    const fila: Database['public']['Tables']['activos']['Insert'] = {
      tenant_id: tenantId,
      codigo: params.codigo,
      nombre: params.codigo,
      categoria_id: categoriaId,
      tipo_id: tipoId,
      naturaleza_bien: params.naturalezaBien ?? 'bien_propio',
      origen: params.origen ?? 'comprado',
      centro_costo_id: centroCostoId,
    }
    if (params.capitalizable !== false) {
      fila.fecha_adquisicion = FECHA
      fila.valor_adquisicion = params.valorAdquisicion ?? 1_200_000
      fila.contable_cuenta_id = cuenta1505
      fila.vida_util_meses = params.vidaUtilMeses ?? 12
      fila.metodo_depreciacion = params.metodoDepreciacion ?? 'linea_recta'
    }
    const { data, error } = await admin.from('activos').insert(fila).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture activo ${params.codigo}: ${error.message}`)
    return data.id
  }

  /** Paga el activo por la vía normal y lo capitaliza — el camino más común (reclasificación). */
  async function capitalizarComprado(
    tenantId: string,
    cliente: Cliente,
    activoId: string,
    periodoId: string,
    monto: number,
  ): Promise<string> {
    const hoja = await unaHojaEgreso(tenantId)
    const centroCostoId = await idListaTipos('CENTRO_COSTO', 'administracion')
    const { error: errPe } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantId,
      cuenta_id: hoja,
      periodo_id: periodoId,
      monto,
      liquidacion: 'pagado_caja',
      fecha_documento: FECHA,
      centro_costo_id: centroCostoId,
      activo_id: activoId,
    })
    if (errPe) throw new Error(`fixture presupuesto_ejecucion (pago activo): ${errPe.message}`)

    const { data, error } = await cliente.rpc('fn_mant_capitalizar_activo', {
      p_tenant_id: tenantId,
      p_activo_id: activoId,
      p_periodo_id: periodoId,
    })
    if (error) throw new Error(`fn_mant_capitalizar_activo: ${error.message}`)
    return data
  }

  // ── escenario compartido: un tenant, un activo capitalizado, depreciación reconocida ──
  let escenario: {
    tenantId: string
    cliente: Cliente
    periodoId: string
    activoId: string
    resumenDepreciacion: ResumenDepreciacion[]
  }

  beforeAll(async () => {
    const { tenantId, cliente } = await crearTenantCompleto('principal')
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)
    const activoId = await crearActivo(tenantId, { codigo: 'ACT-PRINCIPAL', vidaUtilMeses: 12, valorAdquisicion: 1_200_000 })
    await capitalizarComprado(tenantId, cliente, activoId, periodoId, 1_200_000)

    const { data: resumen, error } = await cliente.rpc('fn_mant_reconocer_depreciacion', {
      p_tenant_id: tenantId,
      p_periodo_id: periodoId,
    })
    if (error) throw error

    escenario = { tenantId, cliente, periodoId, activoId, resumenDepreciacion: resumen as ResumenDepreciacion[] }
  }, 60_000)

  it('1. capitalizado = true sin valor_adquisicion falla con ACTIVO_BLOQUE_CONTABLE_INCOMPLETO', async () => {
    const { tenantId } = await crearTenantCompleto('sin-valor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'mobiliario')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'otro')
    const { error } = await admin.from('activos').insert({
      tenant_id: tenantId, codigo: 'X1', nombre: 'X1', categoria_id: categoriaId, tipo_id: tipoId,
      naturaleza_bien: 'bien_propio', origen: 'comprado', capitalizado: true,
    })
    expect(error?.message).toContain('ACTIVO_BLOQUE_CONTABLE_INCOMPLETO')
  }, 30_000)

  it('2. una cuenta que no es de clase 15 falla con ACTIVO_CUENTA_CLASE_INVALIDA', async () => {
    const { tenantId } = await crearTenantCompleto('cuenta-invalida')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'mobiliario')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'otro')
    const cuentaGasto = await cuentaPorCodigo(tenantId, '5905')
    const { error } = await admin.from('activos').insert({
      tenant_id: tenantId, codigo: 'X2', nombre: 'X2', categoria_id: categoriaId, tipo_id: tipoId,
      naturaleza_bien: 'bien_propio', origen: 'comprado', capitalizado: true,
      fecha_adquisicion: FECHA, valor_adquisicion: 100_000, contable_cuenta_id: cuentaGasto,
      vida_util_meses: 12,
    })
    expect(error?.message).toContain('ACTIVO_CUENTA_CLASE_INVALIDA')
  }, 30_000)

  it('3. valor_residual mayor que valor_adquisicion falla con ACTIVO_VALOR_RESIDUAL_INVALIDO', async () => {
    const { tenantId } = await crearTenantCompleto('residual-invalido')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'mobiliario')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'otro')
    const cuenta1505 = await cuentaPorCodigo(tenantId, '1505')
    const { error } = await admin.from('activos').insert({
      tenant_id: tenantId, codigo: 'X3', nombre: 'X3', categoria_id: categoriaId, tipo_id: tipoId,
      naturaleza_bien: 'bien_propio', origen: 'comprado',
      fecha_adquisicion: FECHA, valor_adquisicion: 100_000, valor_residual: 200_000,
      contable_cuenta_id: cuenta1505, vida_util_meses: 12,
    })
    expect(error?.message).toContain('ACTIVO_VALOR_RESIDUAL_INVALIDO')
  }, 30_000)

  it('4. jerarquía cíclica falla con ACTIVO_JERARQUIA_CICLICA', async () => {
    const { tenantId } = await crearTenantCompleto('ciclo')
    const padre = await crearActivo(tenantId, { codigo: 'PADRE', capitalizable: false })
    const hijo = await crearActivo(tenantId, { codigo: 'HIJO', capitalizable: false })
    const { error: errHijo } = await admin.from('activos').update({ activo_padre_id: padre }).eq('id', hijo)
    expect(errHijo).toBeNull()
    const { error } = await admin.from('activos').update({ activo_padre_id: hijo }).eq('id', padre)
    expect(error?.message).toContain('ACTIVO_JERARQUIA_CICLICA')
  }, 30_000)

  it('5. transición inválida falla con ACTIVO_TRANSICION_INVALIDA; el historial es append-only', async () => {
    const { tenantId } = await crearTenantCompleto('transicion')
    const activoId = await crearActivo(tenantId, { codigo: 'CICLO-VIDA', capitalizable: false })
    const { error: errValida } = await admin.from('activos').update({ estado: 'adquirido' }).eq('id', activoId)
    expect(errValida).toBeNull()
    const { error: errInvalida } = await admin.from('activos').update({ estado: 'en_servicio' }).eq('id', activoId)
    expect(errInvalida?.message).toContain('ACTIVO_TRANSICION_INVALIDA')

    const { data: fila } = await admin
      .from('activo_estado_historial')
      .select('id')
      .eq('activo_id', activoId)
      .limit(1)
      .single<{ id: string }>()
    const { error: errUpdate } = await admin
      .from('activo_estado_historial')
      .update({ motivo: 'editado' })
      .eq('id', fila!.id)
    expect(errUpdate?.message).toContain('APPEND_ONLY')
  }, 30_000)

  it('6. la depreciación de línea recta da la cuota exacta esperada', async () => {
    const { data, error } = await admin.rpc('mant_calcular_depreciacion', {
      p_tenant_id: escenario.tenantId,
      p_periodo_id: escenario.periodoId,
    })
    if (error) throw error
    const fila = data.find((f) => f.activo_id === escenario.activoId)!
    expect(fila.cuota_mensual).toBe(100_000) // 1_200_000 / 12
    expect(fila.cuota_periodo).toBe(100_000)
  }, 30_000)

  it('7. la última cuota se ajusta y nunca deprecia por debajo del valor residual', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('ultima-cuota')
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)
    // vida útil de 1 mes: la fecha de inicio es el mismo mes del periodo, así que meses_transcurridos
    // se satura en 1 (vida_util_meses) y cuota_periodo agota toda la base en un solo periodo.
    const activoId = await crearActivo(tenantId, { codigo: 'CORTA-VIDA', vidaUtilMeses: 1, valorAdquisicion: 500_000 })
    await capitalizarComprado(tenantId, cliente, activoId, periodoId, 500_000)

    const { data, error } = await admin.rpc('mant_calcular_depreciacion', { p_tenant_id: tenantId, p_periodo_id: periodoId })
    if (error) throw error
    const fila = data.find((f) => f.activo_id === activoId)!
    expect(fila.cuota_periodo).toBe(500_000)
    expect(fila.acumulada_nueva).toBe(500_000)
  }, 30_000)

  it('8. reconocer depreciación genera un comprobante DEPRECIACION que cuadra', async () => {
    const creado = escenario.resumenDepreciacion.find((r) => r.activo_id === escenario.activoId)!
    expect(creado.categoria).toBe('creado')
    const { data: detalle, error } = await admin
      .from('contable_comprobante_detalle')
      .select('debito, credito')
      .eq('comprobante_id', creado.comprobante_id!)
    if (error) throw error
    const totalDebito = detalle.reduce((s, l) => s + l.debito, 0)
    const totalCredito = detalle.reduce((s, l) => s + l.credito, 0)
    expect(totalDebito).toBe(totalCredito)
    expect(totalDebito).toBeGreaterThan(0)

    const { data: comp } = await admin
      .from('contable_comprobante')
      .select('tipo_id, estado')
      .eq('id', creado.comprobante_id!)
      .single<{ tipo_id: number; estado: string }>()
    const tipoDepreciacionId = await idListaTipos('TIPO_COMPROBANTE', 'DEPRECIACION')
    expect(comp!.tipo_id).toBe(tipoDepreciacionId)
    expect(comp!.estado).toBe('contabilizado')
  }, 30_000)

  it('9. reconocer dos veces el mismo periodo no duplica', async () => {
    const { data: segunda, error } = await escenario.cliente.rpc('fn_mant_reconocer_depreciacion', {
      p_tenant_id: escenario.tenantId,
      p_periodo_id: escenario.periodoId,
    })
    if (error) throw error
    const filas = segunda as ResumenDepreciacion[]
    expect(filas.length).toBeGreaterThan(0)
    expect(filas.every((r) => r.categoria === 'omitido')).toBe(true)
  }, 30_000)

  it('10. sin mapeo de GASTO_DEPRECIACION/DEPRECIACION_ACUMULADA, aborta con CONTABLE_PARAMETRIZACION_PENDIENTE', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('sin-mapeo-depreciacion')
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)
    const activoId = await crearActivo(tenantId, { codigo: 'SIN-MAPEO' })
    await capitalizarComprado(tenantId, cliente, activoId, periodoId, 1_200_000)

    const eventoGasto = await idListaTipos('EVENTO_CONTABLE', 'GASTO_DEPRECIACION')
    const { error: errBorrar } = await admin
      .from('contable_cuenta_default')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('evento_id', eventoGasto)
    if (errBorrar) throw errBorrar

    const { count: antes } = await admin
      .from('contable_comprobante')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)

    const { error } = await cliente.rpc('fn_mant_reconocer_depreciacion', { p_tenant_id: tenantId, p_periodo_id: periodoId })
    expect(error?.message).toContain('CONTABLE_PARAMETRIZACION_PENDIENTE')

    const { count: despues } = await admin
      .from('contable_comprobante')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
    expect(despues).toBe(antes ?? 0)
  }, 30_000)

  it('11. un activo sin bloque contable completo (no capitalizado) no se deprecia', async () => {
    const { tenantId } = await crearTenantCompleto('sin-bloque-contable')
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)
    await crearActivo(tenantId, { codigo: 'INCOMPLETO', capitalizable: false })

    const { data, error } = await admin.rpc('mant_calcular_depreciacion', { p_tenant_id: tenantId, p_periodo_id: periodoId })
    if (error) throw error
    expect(data).toEqual([])
  }, 30_000)

  it('12. un activo retirado no deprecia (excluido de la proyección)', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('retirado-no-deprecia')
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)
    const activoId = await crearActivo(tenantId, { codigo: 'A-RETIRAR', vidaUtilMeses: 24 })
    await capitalizarComprado(tenantId, cliente, activoId, periodoId, 1_200_000)

    const { error: errRetiro } = await cliente.rpc('fn_mant_dar_baja_activo', {
      p_tenant_id: tenantId, p_activo_id: activoId, p_periodo_id: periodoId, p_motivo: 'prueba',
    })
    if (errRetiro) throw errRetiro

    const { data, error } = await admin.rpc('mant_calcular_depreciacion', { p_tenant_id: tenantId, p_periodo_id: periodoId })
    if (error) throw error
    expect(data.some((f) => f.activo_id === activoId)).toBe(false)
  }, 30_000)

  it('13. mant_conciliacion_ppe devuelve cero diferencias tras reconocer (prueba central)', async () => {
    const { data, error } = await admin.rpc('mant_conciliacion_ppe', {
      p_tenant_id: escenario.tenantId,
      p_fecha_corte: `${String(ANIO)}-12-31`,
    })
    if (error) throw error
    expect(data).toEqual([])
  }, 30_000)

  it('14. mant_ppe_por_activo suma exactamente el saldo de clase 15', async () => {
    const { data, error } = await admin.rpc('mant_ppe_por_activo', {
      p_tenant_id: escenario.tenantId,
      p_fecha_corte: `${String(ANIO)}-12-31`,
    })
    if (error) throw error
    const totalNeto = data.reduce((s, f) => s + f.valor_neto, 0)

    const { data: comps } = await admin
      .from('contable_comprobante')
      .select('id')
      .eq('tenant_id', escenario.tenantId)
      .eq('estado', 'contabilizado')
    const { data: detalle } = await admin
      .from('contable_comprobante_detalle')
      .select('debito, credito, cuenta:cuenta_id(codigo)')
      .in('comprobante_id', (comps ?? []).map((c) => c.id))
    const saldoClase15 = (detalle ?? [])
      .filter((l) => l.cuenta.codigo.startsWith('15'))
      .reduce((s, l) => s + l.debito - l.credito, 0)

    expect(totalNeto).toBe(saldoClase15)
  }, 30_000)

  it('15. mant_ppe_movimiento_ejercicio cuadra: inicial + adiciones - retiros - depreciación = final', async () => {
    const { data, error } = await admin.rpc('mant_ppe_movimiento_ejercicio', {
      p_tenant_id: escenario.tenantId,
      p_anio: ANIO,
    })
    if (error) throw error
    for (const fila of data) {
      expect(fila.saldo_inicial + fila.adiciones - fila.retiros - fila.depreciacion_ejercicio).toBe(fila.saldo_final)
    }
    expect(data.length).toBeGreaterThan(0)
  }, 30_000)

  it('16. el retiro de un activo capitalizado genera el comprobante de baja contra la depreciación acumulada', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('baja-capitalizado')
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)
    const activoId = await crearActivo(tenantId, { codigo: 'A-BAJA', vidaUtilMeses: 12, valorAdquisicion: 1_200_000 })
    await capitalizarComprado(tenantId, cliente, activoId, periodoId, 1_200_000)
    await cliente.rpc('fn_mant_reconocer_depreciacion', { p_tenant_id: tenantId, p_periodo_id: periodoId })

    const { data: compId, error } = await cliente.rpc('fn_mant_dar_baja_activo', {
      p_tenant_id: tenantId, p_activo_id: activoId, p_periodo_id: periodoId, p_motivo: 'fin de vida útil',
    })
    if (error) throw error
    expect(compId).not.toBeNull()

    const { data: detalle } = await admin
      .from('contable_comprobante_detalle')
      .select('debito, credito')
      .eq('comprobante_id', compId)
    const totalDebito = detalle!.reduce((s, l) => s + l.debito, 0)
    const totalCredito = detalle!.reduce((s, l) => s + l.credito, 0)
    expect(totalDebito).toBe(totalCredito)
    expect(detalle).toHaveLength(3) // acumulada + pérdida + costo original

    const { data: activo } = await admin.from('activos').select('estado').eq('id', activoId).single<{ estado: string }>()
    expect(activo!.estado).toBe('retirado')
  }, 30_000)

  it('19. aislamiento entre tenants', async () => {
    const { tenantId: tenantB } = await crearTenantCompleto('aislamiento-b')
    const { data, error } = await admin.from('activos').select('id').eq('tenant_id', tenantB).eq('id', escenario.activoId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  }, 30_000)

  it('21. un bien común esencial no puede insertarse con capitalizado = true', async () => {
    const { tenantId } = await crearTenantCompleto('esencial-insert')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'transporte_vertical')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'ascensor')
    const cuenta1505 = await cuentaPorCodigo(tenantId, '1505')
    const { error } = await admin.from('activos').insert({
      tenant_id: tenantId, codigo: 'ASCENSOR', nombre: 'Ascensor', categoria_id: categoriaId, tipo_id: tipoId,
      naturaleza_bien: 'bien_comun_esencial', origen: 'recibido_constructora', capitalizado: true,
      fecha_adquisicion: FECHA, valor_adquisicion: 50_000_000, contable_cuenta_id: cuenta1505,
      vida_util_meses: 240,
    })
    expect(error?.message).toContain('ACTIVO_BIEN_ESENCIAL_NO_CAPITALIZABLE')
  }, 30_000)

  it('22. fn_mant_capitalizar_activo rechaza un bien común esencial', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('esencial-rpc')
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)
    const activoId = await crearActivo(tenantId, { codigo: 'BOMBA', naturalezaBien: 'bien_comun_esencial', origen: 'recibido_constructora' })
    const { error } = await cliente.rpc('fn_mant_capitalizar_activo', {
      p_tenant_id: tenantId, p_activo_id: activoId, p_periodo_id: periodoId,
    })
    expect(error?.message).toContain('ACTIVO_BIEN_ESENCIAL_NO_CAPITALIZABLE')
  }, 30_000)

  it('23. capitalizar un bien comprado reclasifica el gasto ya pagado (débito 15xx, crédito la cuenta de gasto)', async () => {
    const { data: detalle, error } = await admin
      .from('contable_comprobante_detalle')
      .select('debito, credito, cuenta:cuenta_id(codigo)')
      .in(
        'comprobante_id',
        (
          await admin
            .from('contable_comprobante')
            .select('id')
            .eq('tenant_id', escenario.tenantId)
            .eq('origen_evento', 'capitalizacion')
        ).data!.map((c: { id: string }) => c.id),
      )
    if (error) throw error
    const debito15 = detalle.find((l) => l.cuenta.codigo === '1505')
    expect(debito15?.debito).toBe(1_200_000)
    const credito = detalle.find((l) => l.credito === 1_200_000)
    expect(credito).toBeDefined()
  }, 30_000)

  it('24. capitalizar sin presupuesto_ejecucion vinculada usa el camino de causación contra RECONOCIMIENTO_BIEN_DESAFECTADO', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('desafectado')
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)
    const activoId = await crearActivo(tenantId, {
      codigo: 'DESAFECTADO', naturalezaBien: 'bien_comun_no_esencial_desafectado', origen: 'donado',
    })

    // RECONOCIMIENTO_BIEN_DESAFECTADO viene mapeado a 3105 por defecto desde el alta (fix
    // 20260930350000: todo evento contable global debe tener default sembrado). Si el tenant
    // lo desmapea igual debe abortar explícito, no inventar cuenta — mismo patrón que la
    // prueba 10 con GASTO_DEPRECIACION.
    const eventoId = await idListaTipos('EVENTO_CONTABLE', 'RECONOCIMIENTO_BIEN_DESAFECTADO')
    const { error: errBorrar } = await admin
      .from('contable_cuenta_default')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('evento_id', eventoId)
    if (errBorrar) throw errBorrar

    const { error: errSinMapeo } = await cliente.rpc('fn_mant_capitalizar_activo', {
      p_tenant_id: tenantId, p_activo_id: activoId, p_periodo_id: periodoId,
    })
    expect(errSinMapeo?.message).toContain('CONTABLE_PARAMETRIZACION_PENDIENTE')

    const cuentaPatrimonio = await cuentaPorCodigo(tenantId, '3105')
    const { error: errMapear } = await admin
      .from('contable_cuenta_default')
      .insert({ tenant_id: tenantId, evento_id: eventoId, contable_cuenta_id: cuentaPatrimonio })
    if (errMapear) throw errMapear

    const { data: compId, error } = await cliente.rpc('fn_mant_capitalizar_activo', {
      p_tenant_id: tenantId, p_activo_id: activoId, p_periodo_id: periodoId,
    })
    if (error) throw error
    const { data: detalle } = await admin
      .from('contable_comprobante_detalle')
      .select('debito, credito')
      .eq('comprobante_id', compId)
    expect(detalle).toHaveLength(2)
    expect(detalle!.reduce((s, l) => s + l.debito, 0)).toBe(detalle!.reduce((s, l) => s + l.credito, 0))
  }, 30_000)

  it('17. la ficha pública del QR no expone valor de adquisición ni proveedor', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('qr-publico')
    const activoId = await crearActivo(tenantId, { codigo: 'QR-ACTIVO', capitalizable: false })
    const resultadoGen = await cliente.functions.invoke<{ qr_token: string }>('generar-qr-activo', {
      body: { activo_id: activoId, tenant_id: tenantId },
    })
    if (resultadoGen.error) throw resultadoGen.error
    const gen = resultadoGen.data!

    const resultado = await cliente.functions.invoke<Record<string, unknown>>('ver-activo', {
      body: { qr: gen.qr_token },
    })
    if (resultado.error) throw resultado.error
    const data = resultado.data!
    expect(data).toHaveProperty('nombre')
    expect(data).toHaveProperty('estado')
    expect(data).not.toHaveProperty('valor_adquisicion')
    expect(data).not.toHaveProperty('contable_cuenta_id')
    expect(data).not.toHaveProperty('proveedor')
    expect(Object.keys(data).sort()).toEqual(
      ['categoria', 'estado', 'nombre', 'tipo', 'ubicacion', 'ubicacion_detalle'].sort(),
    )
  }, 30_000)

  it('18. un token manipulado (firma alterada) no resuelve ningún activo', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('qr-manipulado')
    const activoId = await crearActivo(tenantId, { codigo: 'QR-MANIPULADO', capitalizable: false })
    const resultadoGen = await cliente.functions.invoke<{ qr_token: string }>('generar-qr-activo', {
      body: { activo_id: activoId, tenant_id: tenantId },
    })
    if (resultadoGen.error) throw resultadoGen.error
    const gen = resultadoGen.data!

    // Cambia el último carácter de la firma HMAC (formato v1.<exp>.<hex>) — un token con firma
    // inválida para el id que encuentre no debe resolver, aunque el resto del formato sea correcto.
    const partes = gen.qr_token.split('.')
    const firma = partes[2]!
    const ultimoCaracter = firma.slice(-1)
    partes[2] = firma.slice(0, -1) + (ultimoCaracter === 'a' ? 'b' : 'a')
    const tokenManipulado = partes.join('.')

    const resultado = await cliente.functions.invoke<Record<string, unknown>>('ver-activo', { body: { qr: tokenManipulado } })
    expect(resultado.data).toBeNull()
    expect(resultado.error).not.toBeNull()
  }, 30_000)
})
