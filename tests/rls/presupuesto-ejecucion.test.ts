/**
 * presupuesto_ejecucion — ejecución presupuestal (E9, 20260823270000) y su
 * seguimiento (ingreso automático vía conceptos.presupuesto_cuenta_id,
 * 20260823300000 reversión). Verificado a mano en dev durante la
 * construcción (incluida la UI real, con datos de GC-001); este archivo
 * codifica esa misma verificación como regresión permanente — no existía
 * ningún test automatizado para E9 hasta ahora.
 *
 * El vínculo concepto↔cuenta se invirtió en 20260830200000: es el concepto
 * el que declara su cuenta presupuestal (conceptos.presupuesto_cuenta_id),
 * no la cuenta la que apunta a su concepto — este archivo ya refleja esa
 * dirección.
 *
 * Cubre: aislamiento multitenant + rol agent (insert) vs auditor (solo
 * lectura), guard_presupuesto_ejecucion_cuenta (cuenta/periodo inexistente
 * o de otro tenant, cuenta no-hoja, cuenta con un concepto vinculado,
 * reversión sin origen / origen inexistente / de otro tenant / de otra
 * cuenta), append-only (ni UPDATE ni DELETE mientras el tenant existe),
 * guard_concepto_presupuesto_cuenta (hoja/naturaleza/tenant), la extensión
 * de guard_presupuesto_cuenta_arbol que impide darle hijos a una cuenta con
 * un concepto vinculado, y presupuesto_cuenta_ejecucion() — manual +
 * automático (cargos vía conceptos.presupuesto_cuenta_id) + rollup +
 * reversión neteada a cero.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/presupuesto-ejecucion: faltan variables de Supabase en .env')
}

interface CuentaFixture {
  id: string
  nivel: number
  es_hoja: boolean
}

async function crearCuenta(
  admin: Cliente,
  params: {
    tenantId: string
    naturaleza: 'ingreso' | 'egreso'
    codigo: string
    parentId?: string
  },
): Promise<CuentaFixture> {
  const { data, error } = await admin
    .from('presupuesto_cuenta')
    .insert({
      tenant_id: params.tenantId,
      naturaleza: params.naturaleza,
      codigo: params.codigo,
      nombre: params.codigo,
      parent_id: params.parentId ?? null,
    })
    .select('id, nivel, es_hoja')
    .single<CuentaFixture>()
  if (error) throw new Error(`fixture cuenta ${params.codigo}: ${error.message}`)
  return data
}

/** Vincula un concepto a su cuenta presupuestal (dirección invertida, 20260830200000) — separado
 * de crearCuenta porque ahora el vínculo vive en conceptos, no en presupuesto_cuenta. */
async function vincularConceptoCuenta(
  admin: Cliente,
  conceptoId: string,
  cuentaId: string | null,
): Promise<{ error: { message: string } | null }> {
  const { error } = await admin
    .from('conceptos')
    .update({ presupuesto_cuenta_id: cuentaId })
    .eq('id', conceptoId)
  return { error }
}

async function crearPeriodo(admin: Cliente, tenantId: string, anio: number, mes: number) {
  const { data, error } = await admin
    .from('periodos')
    .insert({ tenant_id: tenantId, anio, mes, estado: 'abierto' })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture periodo: ${error.message}`)
  return data.id
}

/** Contador módulo-global — varios tests de este archivo crean un presupuesto para el mismo
 * (tenant, año) y presupuestos_version_unica exige version distinta en ese caso. */
let versionFixtureContador = 1

async function crearPresupuesto(admin: Cliente, tenantId: string, anio: number, montoTotal: number) {
  const version = versionFixtureContador
  versionFixtureContador += 1
  const { data, error } = await admin
    .from('presupuestos')
    .insert({ tenant_id: tenantId, anio, version, monto_total: montoTotal })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture presupuesto: ${error.message}`)
  return data.id
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

/** Contador módulo-global para que cada llamada de armarConceptoConCargo cree un periodo propio
 * (mes distinto) — liquidaciones solo admite una fila por periodo (liquidaciones_periodo_unico),
 * así que reutilizar un periodo entre fixtures de distintos tests colisiona. Arranca en 2: el
 * mes 1 de 2028 para tenantA ya lo usa periodoA (beforeAll). */
let mesFixtureContador = 2

/** Concepto real + periodo + cargo de categoría capital contra él — mismo patrón probado que
 * tests/rls/cuenta-corriente.test.ts::armarCargoCapital, adaptado para devolver el concepto_id
 * y el periodo_id (lo que presupuesto_cuenta_ejecucion() necesita para el camino automático). */
async function armarConceptoConCargo(
  admin: Cliente,
  tenantId: string,
  anio: number,
  codigoConcepto: string,
  monto: number,
): Promise<{ conceptoId: string; periodoId: string }> {
  const tipoId = await tipoApartamentoId(admin)

  const mes = mesFixtureContador
  mesFixtureContador = mesFixtureContador === 12 ? 1 : mesFixtureContador + 1
  const periodoId = await crearPeriodo(admin, tenantId, anio, mes)

  const { data: inmueble, error: errInmueble } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo: `PE-${String(Date.now())}`, tipo_id: tipoId })
    .select('id')
    .single<{ id: string }>()
  if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)

  const { data: concepto, error: errConcepto } = await admin
    .from('conceptos')
    .insert({
      tenant_id: tenantId,
      codigo: codigoConcepto,
      nombre: codigoConcepto,
      modo_calculo: 'distribucion',
      modo_valor: 'formulado',
      tipo_recurrencia: 'recurrente',
      periodicidad: 'mensual',
      alcance: 'todos',
      fecha_inicio_anio: 2000,
      fecha_inicio_mes: 1,
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
      result_hash: `pe-fixture-${String(Date.now())}`,
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
      inmueble_id: inmueble.id,
      concepto_id: concepto.id,
      monto,
    })
    .select('id')
    .single<{ id: string }>()
  if (errLinea) throw new Error(`fixture liquidacion_linea: ${errLinea.message}`)

  const { error: errCargo } = await admin.from('cargos').insert({
    tenant_id: tenantId,
    inmueble_id: inmueble.id,
    periodo_id: periodoId,
    categoria: 'capital',
    origen_tipo: 'liquidacion_linea',
    liquidacion_linea_id: linea.id,
    concepto_id: concepto.id,
    monto_original: monto,
  })
  if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)

  return { conceptoId: concepto.id, periodoId }
}

d('presupuesto_ejecucion — ejecución presupuestal (E9) y seguimiento', () => {
  const admin = clienteAdmin(env!)
  let agenteA: UsuarioPrueba
  let auditorA: UsuarioPrueba
  let agenteB: UsuarioPrueba
  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let clienteAgentA: Cliente
  let clienteAuditorA: Cliente
  let clienteAgentB: Cliente
  let cuentaEgresoA: CuentaFixture
  let periodoA: string
  let cuentaEgresoB: CuentaFixture
  let periodoB: string

  beforeAll(async () => {
    agenteA = await crearUsuario(admin, 'pej-agent-a')
    auditorA = await crearUsuario(admin, 'pej-auditor-a')
    agenteB = await crearUsuario(admin, 'pej-agent-b')
    tenantA = await crearTenant(admin, 'pej-a', agenteA.id)
    tenantB = await crearTenant(admin, 'pej-b', agenteB.id)
    await crearMembership(admin, tenantA.id, agenteA.id, 'auxiliar')
    await crearMembership(admin, tenantA.id, auditorA.id, 'auditor')
    await crearMembership(admin, tenantB.id, agenteB.id, 'auxiliar')

    clienteAgentA = await clienteComo(env!, agenteA)
    clienteAuditorA = await clienteComo(env!, auditorA)
    clienteAgentB = await clienteComo(env!, agenteB)

    cuentaEgresoA = await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'egreso', codigo: 'pej-egreso-a' })
    periodoA = await crearPeriodo(admin, tenantA.id, 2028, 1)
    cuentaEgresoB = await crearCuenta(admin, { tenantId: tenantB.id, naturaleza: 'egreso', codigo: 'pej-egreso-b' })
    periodoB = await crearPeriodo(admin, tenantB.id, 2028, 1)
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, agenteA.id)
    await eliminarUsuario(admin, auditorA.id)
    await eliminarUsuario(admin, agenteB.id)
  }, 30_000)

  // ── RLS ──────────────────────────────────────────────────────────────
  it('agent A puede registrar e insertar un movimiento en su tenant', async () => {
    const { data, error } = await clienteAgentA
      .from('presupuesto_ejecucion')
      .insert({
        tenant_id: tenantA.id,
        cuenta_id: cuentaEgresoA.id,
        periodo_id: periodoA,
        monto: 100,
        liquidacion: 'pagado_caja',
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBeDefined()
  })

  it('SEC-11: agent B no ve los movimientos de A', async () => {
    const { data, error } = await clienteAgentB
      .from('presupuesto_ejecucion')
      .select('id')
      .eq('tenant_id', tenantA.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('un auditor puede leer pero no insertar', async () => {
    const lectura = await clienteAuditorA
      .from('presupuesto_ejecucion')
      .select('id')
      .eq('tenant_id', tenantA.id)
    expect(lectura.error).toBeNull()
    expect((lectura.data ?? []).length).toBeGreaterThan(0)

    const escritura = await clienteAuditorA
      .from('presupuesto_ejecucion')
      .insert({ tenant_id: tenantA.id, cuenta_id: cuentaEgresoA.id, periodo_id: periodoA, monto: 50 })
    expect(escritura.error).not.toBeNull()
  })

  // ── guard_presupuesto_ejecucion_cuenta — cuenta/periodo ─────────────────
  it('CUENTA_INEXISTENTE: cuenta_id que no existe se rechaza', async () => {
    const { error } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantA.id,
      cuenta_id: '00000000-0000-0000-0000-000000000000',
      periodo_id: periodoA,
      monto: 10,
    })
    expect(error?.message).toMatch(/CUENTA_INEXISTENTE/)
  })

  it('CUENTA_TENANT_INCONSISTENTE: no se puede registrar contra una cuenta de otro tenant', async () => {
    const { error } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantA.id,
      cuenta_id: cuentaEgresoB.id,
      periodo_id: periodoA,
      monto: 10,
    })
    expect(error?.message).toMatch(/CUENTA_TENANT_INCONSISTENTE/)
  })

  it('CUENTA_NO_ES_HOJA: no se puede registrar contra una cuenta que agrupa subcuentas', async () => {
    const grupo = await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'egreso', codigo: 'pej-grupo' })
    await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'egreso', codigo: 'pej-grupo.hijo', parentId: grupo.id })

    const { error } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantA.id,
      cuenta_id: grupo.id,
      periodo_id: periodoA,
      monto: 10,
    })
    expect(error?.message).toMatch(/CUENTA_NO_ES_HOJA/)
  })

  it('PERIODO_INEXISTENTE: periodo_id que no existe se rechaza', async () => {
    const { error } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantA.id,
      cuenta_id: cuentaEgresoA.id,
      periodo_id: '00000000-0000-0000-0000-000000000000',
      monto: 10,
    })
    expect(error?.message).toMatch(/PERIODO_INEXISTENTE/)
  })

  it('PERIODO_TENANT_INCONSISTENTE: no se puede usar un periodo de otro tenant', async () => {
    const { error } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantA.id,
      cuenta_id: cuentaEgresoA.id,
      periodo_id: periodoB,
      monto: 10,
    })
    expect(error?.message).toMatch(/PERIODO_TENANT_INCONSISTENTE/)
  })

  // ── guard_concepto_presupuesto_cuenta (20260830200000) ──────────────────
  it('CUENTA_NO_ES_HOJA (concepto): un concepto no puede vincularse a una cuenta que agrupa', async () => {
    const grupoIngreso = await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'ingreso', codigo: 'pej-ing-grupo' })
    await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'ingreso', codigo: 'pej-ing-grupo.hijo', parentId: grupoIngreso.id })
    const { conceptoId } = await armarConceptoConCargo(admin, tenantA.id, 2028, 'PEJ-CONCEPTO-1', 1000)

    const { error } = await vincularConceptoCuenta(admin, conceptoId, grupoIngreso.id)
    expect(error?.message).toMatch(/CUENTA_NO_ES_HOJA/)
  })

  it('CUENTA_NATURALEZA_INVALIDA: un concepto no puede vincularse a una cuenta de egreso', async () => {
    const { conceptoId } = await armarConceptoConCargo(admin, tenantA.id, 2028, 'PEJ-CONCEPTO-2', 1000)
    const { error } = await vincularConceptoCuenta(admin, conceptoId, cuentaEgresoA.id)
    expect(error?.message).toMatch(/CUENTA_NATURALEZA_INVALIDA/)
  })

  it('CUENTA_INEXISTENTE (concepto): presupuesto_cuenta_id que no existe se rechaza', async () => {
    const { conceptoId } = await armarConceptoConCargo(admin, tenantA.id, 2028, 'PEJ-CONCEPTO-FANTASMA', 1000)
    const { error } = await vincularConceptoCuenta(
      admin,
      conceptoId,
      '00000000-0000-0000-0000-000000000000',
    )
    expect(error?.message).toMatch(/CUENTA_INEXISTENTE/)
  })

  it('CUENTA_TENANT_INCONSISTENTE (concepto): no se puede vincular a una cuenta de otro tenant', async () => {
    const { conceptoId: conceptoDeB } = await armarConceptoConCargo(admin, tenantB.id, 2028, 'PEJ-CONCEPTO-B', 1000)
    const hoja = await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'ingreso', codigo: 'pej-ing-cruce' })

    const { error } = await vincularConceptoCuenta(admin, conceptoDeB, hoja.id)
    expect(error?.message).toMatch(/CUENTA_TENANT_INCONSISTENTE/)
  })

  it('CUENTA_TIENE_CONCEPTO: una cuenta con concepto vinculado no puede ganar subcuentas', async () => {
    const { conceptoId } = await armarConceptoConCargo(admin, tenantA.id, 2028, 'PEJ-CONCEPTO-3', 1000)
    const hoja = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'ingreso',
      codigo: 'pej-ing-con-concepto',
    })
    await vincularConceptoCuenta(admin, conceptoId, hoja.id)

    const { error } = await admin.from('presupuesto_cuenta').insert({
      tenant_id: tenantA.id,
      naturaleza: 'ingreso',
      codigo: 'pej-ing-con-concepto.hijo',
      nombre: 'No debería poder',
      parent_id: hoja.id,
    })
    expect(error?.message).toMatch(/CUENTA_TIENE_CONCEPTO/)
  })

  // ── CUENTA_CONCEPTO_AUTOMATICO + ejecución automática vía cargos ────────
  it('CUENTA_CONCEPTO_AUTOMATICO: una cuenta con concepto vinculado no admite movimientos manuales', async () => {
    const { conceptoId } = await armarConceptoConCargo(admin, tenantA.id, 2028, 'PEJ-CONCEPTO-4', 1000)
    const hoja = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'ingreso',
      codigo: 'pej-ing-automatico',
    })
    await vincularConceptoCuenta(admin, conceptoId, hoja.id)

    const { error } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantA.id,
      cuenta_id: hoja.id,
      periodo_id: periodoA,
      monto: 10,
    })
    expect(error?.message).toMatch(/CUENTA_CONCEPTO_AUTOMATICO/)
  })

  it('presupuesto_cuenta_ejecucion suma automáticamente el cargo real de la cuenta con concepto', async () => {
    const { conceptoId } = await armarConceptoConCargo(admin, tenantA.id, 2028, 'PEJ-CONCEPTO-5', 4_000_000)
    const padreIngreso = await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'ingreso', codigo: 'pej-ing-padre' })
    const hoja = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'ingreso',
      codigo: 'pej-ing-hoja-auto',
      parentId: padreIngreso.id,
    })
    await vincularConceptoCuenta(admin, conceptoId, hoja.id)

    const presupuesto = await crearPresupuesto(admin, tenantA.id, 2028, 1)
    const { data: totales, error } = await admin.rpc('presupuesto_cuenta_ejecucion', {
      p_presupuesto_id: presupuesto,
    })
    expect(error).toBeNull()

    const porCuenta = new Map((totales ?? []).map((t) => [t.cuenta_id, t.ejecutado]))
    expect(porCuenta.get(hoja.id)).toBe(4_000_000)
    expect(porCuenta.get(padreIngreso.id)).toBe(4_000_000)
  })

  it('presupuesto_cuenta_ejecucion suma juntos varios conceptos que apuntan a la misma cuenta', async () => {
    const hoja = await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'ingreso', codigo: 'pej-ing-multi' })
    const { conceptoId: c1 } = await armarConceptoConCargo(admin, tenantA.id, 2028, 'PEJ-MULTI-1', 1_000_000)
    const { conceptoId: c2 } = await armarConceptoConCargo(admin, tenantA.id, 2028, 'PEJ-MULTI-2', 500_000)
    await vincularConceptoCuenta(admin, c1, hoja.id)
    await vincularConceptoCuenta(admin, c2, hoja.id)

    const presupuesto = await crearPresupuesto(admin, tenantA.id, 2028, 1)
    const { data: totales, error } = await admin.rpc('presupuesto_cuenta_ejecucion', {
      p_presupuesto_id: presupuesto,
    })
    expect(error).toBeNull()
    const porCuenta = new Map((totales ?? []).map((t) => [t.cuenta_id, t.ejecutado]))
    expect(porCuenta.get(hoja.id)).toBe(1_500_000)
  })

  it('presupuesto_cuenta_ejecucion acota el ejecutado automático al año fiscal del presupuesto', async () => {
    const { conceptoId } = await armarConceptoConCargo(admin, tenantA.id, 2029, 'PEJ-CONCEPTO-6', 999)
    const hoja = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'ingreso',
      codigo: 'pej-ing-otro-anio',
    })
    await vincularConceptoCuenta(admin, conceptoId, hoja.id)

    // presupuesto 2028 no debe ver el cargo de un periodo 2029.
    const presupuesto2028 = await crearPresupuesto(admin, tenantA.id, 2028, 1)
    const { data: totales } = await admin.rpc('presupuesto_cuenta_ejecucion', {
      p_presupuesto_id: presupuesto2028,
    })
    const porCuenta = new Map((totales ?? []).map((t) => [t.cuenta_id, t.ejecutado]))
    expect(porCuenta.get(hoja.id) ?? 0).toBe(0)
  })

  // ── reversión (20260823300000) ──────────────────────────────────────────
  it('REVERSION_SIN_ORIGEN: un monto negativo sin ajusta_movimiento_id se rechaza', async () => {
    const { error } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantA.id,
      cuenta_id: cuentaEgresoA.id,
      periodo_id: periodoA,
      monto: -10,
    })
    expect(error?.message).toMatch(/REVERSION_SIN_ORIGEN/)
  })

  it('MOVIMIENTO_INEXISTENTE: ajusta_movimiento_id que no existe se rechaza', async () => {
    const { error } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantA.id,
      cuenta_id: cuentaEgresoA.id,
      periodo_id: periodoA,
      monto: -10,
      ajusta_movimiento_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(error?.message).toMatch(/MOVIMIENTO_INEXISTENTE/)
  })

  it('MOVIMIENTO_TENANT_INCONSISTENTE: no se puede revertir un movimiento de otro tenant', async () => {
    const { data: movimientoB } = await admin
      .from('presupuesto_ejecucion')
      .insert({
        tenant_id: tenantB.id,
        cuenta_id: cuentaEgresoB.id,
        periodo_id: periodoB,
        monto: 500,
        liquidacion: 'pagado_caja',
      })
      .select('id')
      .single<{ id: string }>()

    const { error } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantA.id,
      cuenta_id: cuentaEgresoA.id,
      periodo_id: periodoA,
      monto: -10,
      ajusta_movimiento_id: movimientoB!.id,
    })
    expect(error?.message).toMatch(/MOVIMIENTO_TENANT_INCONSISTENTE/)
  })

  it('REVERSION_CUENTA_DISTINTA: no se puede revertir un movimiento de otra cuenta', async () => {
    const otraCuenta = await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'egreso', codigo: 'pej-otra-cuenta' })
    const { data: original } = await admin
      .from('presupuesto_ejecucion')
      .insert({
        tenant_id: tenantA.id,
        cuenta_id: cuentaEgresoA.id,
        periodo_id: periodoA,
        monto: 200,
        liquidacion: 'pagado_caja',
      })
      .select('id')
      .single<{ id: string }>()

    const { error } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantA.id,
      cuenta_id: otraCuenta.id,
      periodo_id: periodoA,
      monto: -200,
      ajusta_movimiento_id: original!.id,
    })
    expect(error?.message).toMatch(/REVERSION_CUENTA_DISTINTA/)
  })

  it('una reversión válida neta el ejecutado de la cuenta a cero', async () => {
    const cuenta = await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'egreso', codigo: 'pej-reversion-ok' })
    const { data: original, error: errOriginal } = await admin
      .from('presupuesto_ejecucion')
      .insert({
        tenant_id: tenantA.id,
        cuenta_id: cuenta.id,
        periodo_id: periodoA,
        monto: 300,
        liquidacion: 'pagado_caja',
      })
      .select('id')
      .single<{ id: string }>()
    expect(errOriginal).toBeNull()

    const { error: errReversion } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantA.id,
      cuenta_id: cuenta.id,
      periodo_id: periodoA,
      monto: -300,
      ajusta_movimiento_id: original!.id,
    })
    expect(errReversion).toBeNull()

    const presupuesto = await crearPresupuesto(admin, tenantA.id, 2028, 1)
    const { data: totales, error } = await admin.rpc('presupuesto_cuenta_ejecucion', {
      p_presupuesto_id: presupuesto,
    })
    expect(error).toBeNull()
    const porCuenta = new Map((totales ?? []).map((t) => [t.cuenta_id, t.ejecutado]))
    expect(porCuenta.get(cuenta.id)).toBe(0)
  })

  // ── append-only (16 §68) ─────────────────────────────────────────────────
  it('APPEND_ONLY: no admite UPDATE mientras el tenant existe', async () => {
    const { data: movimiento } = await admin
      .from('presupuesto_ejecucion')
      .insert({
        tenant_id: tenantA.id,
        cuenta_id: cuentaEgresoA.id,
        periodo_id: periodoA,
        monto: 10,
        liquidacion: 'pagado_caja',
      })
      .select('id')
      .single<{ id: string }>()

    const { error } = await admin
      .from('presupuesto_ejecucion')
      .update({ descripcion: 'editado' })
      .eq('id', movimiento!.id)
    expect(error?.message).toMatch(/APPEND_ONLY/)
  })

  it('APPEND_ONLY: no admite DELETE mientras el tenant existe', async () => {
    const { data: movimiento } = await admin
      .from('presupuesto_ejecucion')
      .insert({
        tenant_id: tenantA.id,
        cuenta_id: cuentaEgresoA.id,
        periodo_id: periodoA,
        monto: 10,
        liquidacion: 'pagado_caja',
      })
      .select('id')
      .single<{ id: string }>()

    const { error } = await admin.from('presupuesto_ejecucion').delete().eq('id', movimiento!.id)
    expect(error?.message).toMatch(/APPEND_ONLY/)
  })
})
