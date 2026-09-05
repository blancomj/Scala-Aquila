/**
 * cargos / pagos / pago_aplicaciones — 20260816100000, ledger de cuenta
 * corriente (AD-31, PLAN §6.3-§6.4).
 *
 * Cubre: aislamiento multitenant, append-only (cargos/pagos/pago_aplicaciones
 * no admiten UPDATE/DELETE), escritura exclusiva de service_role (ningún rol
 * `authenticated` tiene política INSERT), guard_pago_aplicacion_no_excede
 * (CARGO_SOBREAPLICADO/PAGO_SOBREAPLICADO), y v_cargo_saldo tras aplicaciones
 * parciales.
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
  console.warn('SALTADO tests/rls/cuenta-corriente: faltan variables de Supabase en .env')
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

async function formaPagoEfectivoId(admin: Cliente): Promise<number> {
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

/** Arma un cargo de categoría capital mínimo (tenant, inmueble, periodo,
 * concepto, liquidacion, liquidacion_linea, cargo), todo vía admin. */
async function armarCargoCapital(
  admin: Cliente,
  tenantId: string,
  monto: number,
): Promise<{ inmuebleId: string; periodoId: string; cargoId: string }> {
  const tipoId = await tipoApartamentoId(admin)

  const { data: inmueble, error: errInmueble } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo: `CC-${String(Date.now())}`, tipo_id: tipoId })
    .select('id')
    .single<{ id: string }>()
  if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)

  const { data: periodo, error: errPeriodo } = await admin
    .from('periodos')
    .insert({ tenant_id: tenantId, anio: 2027, mes: 1, estado: 'abierto' })
    .select('id')
    .single<{ id: string }>()
  if (errPeriodo) throw new Error(`fixture periodo: ${errPeriodo.message}`)

  const { data: concepto, error: errConcepto } = await admin
    .from('conceptos')
    .insert({
      tenant_id: tenantId,
      codigo: 'CUOTA_ADMIN',
      nombre: 'Cuota de administración',
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
      periodo_id: periodo.id,
      result_hash: `test-fixture-${String(Date.now())}`,
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

  const { data: cargo, error: errCargo } = await admin
    .from('cargos')
    .insert({
      tenant_id: tenantId,
      inmueble_id: inmueble.id,
      periodo_id: periodo.id,
      categoria: 'capital',
      origen_tipo: 'liquidacion_linea',
      liquidacion_linea_id: linea.id,
      concepto_id: concepto.id,
      monto_original: monto,
    })
    .select('id')
    .single<{ id: string }>()
  if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)

  return { inmuebleId: inmueble.id, periodoId: periodo.id, cargoId: cargo.id }
}

d('cargos / pagos / pago_aplicaciones — ledger de cuenta corriente', () => {
  const admin = clienteAdmin(env!)
  let agenteA: UsuarioPrueba
  let auditorA: UsuarioPrueba
  let agenteB: UsuarioPrueba
  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let clienteAgentA: Cliente
  let clienteAuditorA: Cliente
  let clienteAgentB: Cliente
  let inmuebleAId: string
  let cargoAId: string

  beforeAll(async () => {
    agenteA = await crearUsuario(admin, 'cc-agent-a')
    auditorA = await crearUsuario(admin, 'cc-auditor-a')
    agenteB = await crearUsuario(admin, 'cc-agent-b')
    tenantA = await crearTenant(admin, 'cc-a', agenteA.id)
    tenantB = await crearTenant(admin, 'cc-b', agenteB.id)
    await crearMembership(admin, tenantA.id, agenteA.id, 'auxiliar')
    await crearMembership(admin, tenantA.id, auditorA.id, 'auditor')
    await crearMembership(admin, tenantB.id, agenteB.id, 'auxiliar')

    clienteAgentA = await clienteComo(env!, agenteA)
    clienteAuditorA = await clienteComo(env!, auditorA)
    clienteAgentB = await clienteComo(env!, agenteB)

    const { inmuebleId, cargoId } = await armarCargoCapital(admin, tenantA.id, 100_000)
    inmuebleAId = inmuebleId
    cargoAId = cargoId
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, agenteA.id)
    await eliminarUsuario(admin, auditorA.id)
    await eliminarUsuario(admin, agenteB.id)
  }, 30_000)

  it('control positivo: agent A ve su propio cargo', async () => {
    const { data, error } = await clienteAgentA.from('cargos').select('id').eq('id', cargoAId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('SEC-11: agent B no ve el cargo de A', async () => {
    const { data, error } = await clienteAgentB.from('cargos').select('id').eq('id', cargoAId)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('un auditor puede leer cargos de su tenant', async () => {
    const { data, error } = await clienteAuditorA.from('cargos').select('id').eq('id', cargoAId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('escritura exclusiva de service_role: ni agent ni auditor pueden insertar un cargo', async () => {
    const filaCargo = {
      tenant_id: tenantA.id,
      inmueble_id: inmuebleAId,
      periodo_id: cargoAId, // valor irrelevante — RLS bloquea antes de validar FKs
      categoria: 'otro' as const,
      origen_tipo: 'interes' as const,
      cargo_capital_origen_id: cargoAId,
      monto_original: 1,
    }
    const { error: errAgent } = await clienteAgentA.from('cargos').insert(filaCargo)
    expect(errAgent).not.toBeNull()

    const { error: errAuditor } = await clienteAuditorA.from('cargos').insert(filaCargo)
    expect(errAuditor).not.toBeNull()
  })

  it('ni agent ni auditor pueden insertar un pago directamente', async () => {
    const filaPago = {
      tenant_id: tenantA.id,
      inmueble_id: inmuebleAId,
      monto: 1000,
      fecha_pago: '2027-01-15',
    }
    const { error: errAgent } = await clienteAgentA.from('pagos').insert(filaPago)
    expect(errAgent).not.toBeNull()

    const { error: errAuditor } = await clienteAuditorA.from('pagos').insert(filaPago)
    expect(errAuditor).not.toBeNull()
  })

  it('append-only: cargos no admite UPDATE ni DELETE', async () => {
    const { error: errUpdate } = await admin
      .from('cargos')
      .update({ monto_original: 999 })
      .eq('id', cargoAId)
    expect(errUpdate?.message).toMatch(/APPEND_ONLY/)

    const { error: errDelete } = await admin.from('cargos').delete().eq('id', cargoAId)
    expect(errDelete?.message).toMatch(/APPEND_ONLY/)
  })

  it('guard_pago_aplicacion_no_excede: CARGO_SOBREAPLICADO si la aplicación excede lo pendiente', async () => {
    const formaPagoId = await formaPagoEfectivoId(admin)
    const { data: pago, error: errPago } = await admin
      .from('pagos')
      .insert({
        tenant_id: tenantA.id,
        inmueble_id: inmuebleAId,
        monto: 200_000,
        fecha_pago: '2027-01-15',
        fecha_registro: '2027-01-15',
        forma_pago_id: formaPagoId,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPago) throw new Error(`fixture pago: ${errPago.message}`)

    const { error } = await admin.from('pago_aplicaciones').insert({
      tenant_id: tenantA.id,
      pago_id: pago.id,
      cargo_id: cargoAId,
      monto: 150_000, // cargoA solo tiene 100_000 pendiente
    })
    expect(error?.message).toMatch(/CARGO_SOBREAPLICADO/)
  })

  it('aplicación parcial: v_cargo_saldo refleja el pendiente correcto', async () => {
    const formaPagoId = await formaPagoEfectivoId(admin)
    const { data: pago, error: errPago } = await admin
      .from('pagos')
      .insert({
        tenant_id: tenantA.id,
        inmueble_id: inmuebleAId,
        monto: 40_000,
        fecha_pago: '2027-01-16',
        fecha_registro: '2027-01-16',
        forma_pago_id: formaPagoId,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPago) throw new Error(`fixture pago: ${errPago.message}`)

    const { error: errAplicacion } = await admin.from('pago_aplicaciones').insert({
      tenant_id: tenantA.id,
      pago_id: pago.id,
      cargo_id: cargoAId,
      monto: 40_000,
    })
    expect(errAplicacion).toBeNull()

    const { data: saldo, error: errSaldo } = await admin
      .from('v_cargo_saldo')
      .select('monto_pendiente')
      .eq('id', cargoAId)
      .single<{ monto_pendiente: string }>()
    expect(errSaldo).toBeNull()
    expect(Number(saldo?.monto_pendiente)).toBe(60_000)

    // PAGO_SOBREAPLICADO: una segunda aplicación del mismo pago que exceda su monto.
    const { error: errExceso } = await admin.from('pago_aplicaciones').insert({
      tenant_id: tenantA.id,
      pago_id: pago.id,
      cargo_id: cargoAId,
      monto: 1,
    })
    expect(errExceso?.message).toMatch(/PAGO_SOBREAPLICADO/)
  })

  it('append-only: pago_aplicaciones no admite UPDATE ni DELETE', async () => {
    const { data: aplicacion, error: errBusqueda } = await admin
      .from('pago_aplicaciones')
      .select('id')
      .eq('cargo_id', cargoAId)
      .limit(1)
      .single<{ id: string }>()
    if (errBusqueda) throw new Error(`fixture búsqueda aplicación: ${errBusqueda.message}`)

    const { error: errUpdate } = await admin
      .from('pago_aplicaciones')
      .update({ monto: 1 })
      .eq('id', aplicacion.id)
    expect(errUpdate?.message).toMatch(/APPEND_ONLY/)
  })
})
