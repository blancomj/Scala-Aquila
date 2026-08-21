/**
 * fuente_financiacion / fundamento_normativo — 20260814200000, corte físico
 * de GAP-19 (Docs/Motor presupuestal/AQUILA_SAAS_E16_...md §8).
 *
 * fuente_financiacion.tipo pasó de enum a lista_tipos (familia
 * TIPO_FUENTE_FINANCIACION, 20260830210000, se retiró 'saldo_aplicable') —
 * este archivo usa tipoFuenteId() para resolver el id de plataforma de cada
 * código en vez de un literal de enum.
 *
 * Cubre: aislamiento multitenant (mismo patrón que domain-isolation), el
 * CHECK valor_aplicado <= valor_disponible, las reglas del trigger
 * guard_fuente_financiacion (tipo_id inexistente/de otra familia/de otro
 * tenant, FI-003 fondo insuficiente/inexistente, inmutabilidad heredada del
 * presupuesto padre), y la extensión de guard_presupuesto_reconciliado
 * (fuentes no pueden superar monto_total).
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
  console.warn(
    'SALTADO tests/rls/motor-presupuestal-financiacion: faltan variables de Supabase en .env',
  )
}

/** presupuesto_cuenta (E8) es un catálogo por tenant, no una fila de
 * plataforma como el categoria_id plano de antes — idempotente porque
 * `codigo` es único por tenant. */
async function cuentaAdministracionId(admin: Cliente, tenantId: string): Promise<string> {
  const { data: existente } = await admin
    .from('presupuesto_cuenta')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('codigo', 'administracion')
    .maybeSingle<{ id: string }>()
  if (existente) return existente.id

  const { data, error } = await admin
    .from('presupuesto_cuenta')
    .insert({
      tenant_id: tenantId,
      naturaleza: 'egreso',
      codigo: 'administracion',
      nombre: 'Administración',
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture cuenta administracion: ${error.message}`)
  return data.id
}

async function crearPresupuestoReconciliado(
  admin: Cliente,
  tenantId: string,
  anio: number,
  montoTotal: number,
): Promise<{ presupuestoId: string; rubroId: string }> {
  const cuentaId = await cuentaAdministracionId(admin, tenantId)

  const { data: presupuesto, error: errPresupuesto } = await admin
    .from('presupuestos')
    .insert({ tenant_id: tenantId, anio, version: 1, monto_total: montoTotal })
    .select('id')
    .single<{ id: string }>()
  if (errPresupuesto) throw new Error(`fixture presupuesto: ${errPresupuesto.message}`)

  const { data: rubro, error: errRubro } = await admin
    .from('presupuesto_rubros')
    .insert({
      tenant_id: tenantId,
      presupuesto_id: presupuesto.id,
      codigo: 'ADMIN-001',
      nombre: 'Administración',
      cuenta_id: cuentaId,
      monto_anual: montoTotal,
    })
    .select('id')
    .single<{ id: string }>()
  if (errRubro) throw new Error(`fixture rubro: ${errRubro.message}`)

  return { presupuestoId: presupuesto.id, rubroId: rubro.id }
}

/** Id de plataforma (tenant_id null) de un código de TIPO_FUENTE_FINANCIACION — reemplaza el
 * literal de enum que existía antes de 20260830210000. */
async function tipoFuenteId(admin: Cliente, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'TIPO_FUENTE_FINANCIACION')
    .is('tenant_id', null)
    .eq('codigo', codigo)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture tipo fuente ${codigo}: ${error.message}`)
  return data.id
}

d('fuente_financiacion / fundamento_normativo — Motor Presupuestal (GAP-19)', () => {
  const admin = clienteAdmin(env!)
  let agenteA: UsuarioPrueba
  let auditorA: UsuarioPrueba
  let agenteB: UsuarioPrueba
  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let clienteAgentA: Cliente
  let clienteAuditorA: Cliente
  let clienteAgentB: Cliente
  let presupuestoAId: string
  let fundamentoAId: number
  let fuenteAId: string
  let tipoOtrosIngresosId: number
  let tipoCuotaExtraordinariaId: number
  let tipoFondoImprevistosId: number

  beforeAll(async () => {
    agenteA = await crearUsuario(admin, 'mpf-agent-a')
    auditorA = await crearUsuario(admin, 'mpf-auditor-a')
    agenteB = await crearUsuario(admin, 'mpf-agent-b')
    tenantA = await crearTenant(admin, 'mpf-a', agenteA.id)
    tenantB = await crearTenant(admin, 'mpf-b', agenteB.id)
    await crearMembership(admin, tenantA.id, agenteA.id, 'auxiliar')
    await crearMembership(admin, tenantA.id, auditorA.id, 'auditor')
    await crearMembership(admin, tenantB.id, agenteB.id, 'auxiliar')

    clienteAgentA = await clienteComo(env!, agenteA)
    clienteAuditorA = await clienteComo(env!, auditorA)
    clienteAgentB = await clienteComo(env!, agenteB)

    tipoOtrosIngresosId = await tipoFuenteId(admin, 'otros_ingresos')
    tipoCuotaExtraordinariaId = await tipoFuenteId(admin, 'cuota_extraordinaria')
    tipoFondoImprevistosId = await tipoFuenteId(admin, 'fondo_imprevistos')

    const { presupuestoId } = await crearPresupuestoReconciliado(admin, tenantA.id, 2027, 1_000_000)
    presupuestoAId = presupuestoId

    const { data: fundamento, error: errFundamento } = await admin
      .from('fundamento_normativo')
      .insert({ tenant_id: tenantA.id, tipo: 'decision_asamblea', norma: 'Acta 2027-01' })
      .select('id')
      .single<{ id: number }>()
    if (errFundamento) throw new Error(`fixture fundamento: ${errFundamento.message}`)
    fundamentoAId = fundamento.id

    const { data: fuente, error: errFuente } = await admin
      .from('fuente_financiacion')
      .insert({
        tenant_id: tenantA.id,
        presupuesto_id: presupuestoAId,
        tipo_id: tipoOtrosIngresosId,
        valor_disponible: 100_000,
        valor_aplicado: 50_000,
        fundamento_normativo_id: fundamentoAId,
      })
      .select('id')
      .single<{ id: string }>()
    if (errFuente) throw new Error(`fixture fuente: ${errFuente.message}`)
    fuenteAId = fuente.id
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, agenteA.id)
    await eliminarUsuario(admin, auditorA.id)
    await eliminarUsuario(admin, agenteB.id)
  }, 30_000)

  it('control positivo: A ve su propia fuente_financiacion y fundamento_normativo', async () => {
    const { data: fuentes, error: errFuentes } = await clienteAgentA
      .from('fuente_financiacion')
      .select('id')
      .eq('id', fuenteAId)
    expect(errFuentes).toBeNull()
    expect(fuentes).toHaveLength(1)

    const { data: fundamentos, error: errFundamentos } = await clienteAgentA
      .from('fundamento_normativo')
      .select('id')
      .eq('id', fundamentoAId)
    expect(errFundamentos).toBeNull()
    expect(fundamentos).toHaveLength(1)
  })

  it('SEC-11: B no ve la fuente_financiacion ni el fundamento_normativo de A', async () => {
    const { data: fuentes, error: errFuentes } = await clienteAgentB
      .from('fuente_financiacion')
      .select('id')
      .eq('id', fuenteAId)
    expect(errFuentes).toBeNull()
    expect(fuentes).toHaveLength(0)

    const { data: fundamentos, error: errFundamentos } = await clienteAgentB
      .from('fundamento_normativo')
      .select('id')
      .eq('id', fundamentoAId)
    expect(errFundamentos).toBeNull()
    expect(fundamentos).toHaveLength(0)
  })

  it('un auditor no puede insertar fuente_financiacion ni fundamento_normativo', async () => {
    const { error: errFuente } = await clienteAuditorA.from('fuente_financiacion').insert({
      tenant_id: tenantA.id,
      presupuesto_id: presupuestoAId,
      tipo_id: tipoCuotaExtraordinariaId,
      valor_disponible: 1000,
    })
    expect(errFuente).not.toBeNull()

    const { error: errFundamento } = await clienteAuditorA
      .from('fundamento_normativo')
      .insert({ tenant_id: tenantA.id, tipo: 'otra', norma: 'X' })
    expect(errFundamento).not.toBeNull()
  })

  it('CHECK: valor_aplicado no puede superar valor_disponible', async () => {
    const { error } = await admin.from('fuente_financiacion').insert({
      tenant_id: tenantA.id,
      presupuesto_id: presupuestoAId,
      tipo_id: tipoCuotaExtraordinariaId,
      valor_disponible: 100,
      valor_aplicado: 150,
    })
    expect(error).not.toBeNull()
  })

  it('TIPO_FUENTE_INEXISTENTE: tipo_id que no existe se rechaza', async () => {
    const { error } = await admin.from('fuente_financiacion').insert({
      tenant_id: tenantA.id,
      presupuesto_id: presupuestoAId,
      tipo_id: 0,
      valor_disponible: 100,
    })
    expect(error?.message).toMatch(/TIPO_FUENTE_INEXISTENTE/)
  })

  it('TIPO_FUENTE_INVALIDO: tipo_id de otra familia lista_tipos se rechaza', async () => {
    const { data: otraFamilia } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'TIPO_INMUEBLE')
      .limit(1)
      .single<{ id: number }>()

    const { error } = await admin.from('fuente_financiacion').insert({
      tenant_id: tenantA.id,
      presupuesto_id: presupuestoAId,
      tipo_id: otraFamilia!.id,
      valor_disponible: 100,
    })
    expect(error?.message).toMatch(/TIPO_FUENTE_INVALIDO/)
  })

  it('TIPO_FUENTE_TENANT_INCONSISTENTE: no se puede usar un tipo propio de otro tenant', async () => {
    const { data: tipoDeB, error: errTipoB } = await admin
      .from('lista_tipos')
      .insert({ tipo: 'TIPO_FUENTE_FINANCIACION', codigo: 'personalizado-b', nombre: 'Personalizado B', tenant_id: tenantB.id })
      .select('id')
      .single<{ id: number }>()
    if (errTipoB) throw new Error(`fixture tipo propio de B: ${errTipoB.message}`)

    const { error } = await admin.from('fuente_financiacion').insert({
      tenant_id: tenantA.id,
      presupuesto_id: presupuestoAId,
      tipo_id: tipoDeB.id,
      valor_disponible: 100,
    })
    expect(error?.message).toMatch(/TIPO_FUENTE_TENANT_INCONSISTENTE/)
  })

  it('FI-003: fondo_imprevistos rechaza si el tenant no tiene fondo configurado', async () => {
    const { error } = await admin.from('fuente_financiacion').insert({
      tenant_id: tenantA.id,
      presupuesto_id: presupuestoAId,
      tipo_id: tipoFondoImprevistosId,
      valor_disponible: 1000,
    })
    expect(error?.message).toMatch(/FONDO_IMPREVISTOS_NO_EXISTE/)
  })

  it('FI-003: fondo_imprevistos rechaza si valor_disponible excede el saldo real', async () => {
    const { data: fondo, error: errFondo } = await admin
      .from('fondos')
      .insert({ tenant_id: tenantA.id, tipo: 'imprevistos', nombre: 'Fondo imprevistos A' })
      .select('id')
      .single<{ id: string }>()
    if (errFondo) throw new Error(`fixture fondo: ${errFondo.message}`)

    await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenantA.id, fondo_id: fondo.id, tipo: 'aporte', monto: 500 })

    const { error: errExceso } = await admin.from('fuente_financiacion').insert({
      tenant_id: tenantA.id,
      presupuesto_id: presupuestoAId,
      tipo_id: tipoFondoImprevistosId,
      valor_disponible: 501,
    })
    expect(errExceso?.message).toMatch(/FONDO_INSUFICIENTE/)

    const { error: errDentro } = await admin.from('fuente_financiacion').insert({
      tenant_id: tenantA.id,
      presupuesto_id: presupuestoAId,
      tipo_id: tipoFondoImprevistosId,
      valor_disponible: 500,
    })
    expect(errDentro).toBeNull()
  })

  it('inmutable: no se puede insertar fuente_financiacion sobre un presupuesto vigente', async () => {
    const { presupuestoId } = await crearPresupuestoReconciliado(admin, tenantA.id, 2028, 200_000)

    const { error: errVigente } = await admin
      .from('presupuestos')
      .update({ estado: 'vigente' })
      .eq('id', presupuestoId)
    expect(errVigente).toBeNull()

    const { error } = await admin.from('fuente_financiacion').insert({
      tenant_id: tenantA.id,
      presupuesto_id: presupuestoId,
      tipo_id: tipoCuotaExtraordinariaId,
      valor_disponible: 1000,
    })
    expect(error?.message).toMatch(/IMMUTABLE_BUDGET/)
  })

  it('guard_presupuesto_reconciliado: rechaza aprobar si las fuentes superan monto_total', async () => {
    const { presupuestoId } = await crearPresupuestoReconciliado(admin, tenantA.id, 2029, 100_000)

    await admin.from('fuente_financiacion').insert([
      {
        tenant_id: tenantA.id,
        presupuesto_id: presupuestoId,
        tipo_id: tipoCuotaExtraordinariaId,
        valor_disponible: 80_000,
        valor_aplicado: 70_000,
      },
      {
        tenant_id: tenantA.id,
        presupuesto_id: presupuestoId,
        tipo_id: tipoOtrosIngresosId,
        valor_disponible: 80_000,
        valor_aplicado: 70_000,
      },
    ])

    const { error } = await admin
      .from('presupuestos')
      .update({ estado: 'aprobado' })
      .eq('id', presupuestoId)
    expect(error?.message).toMatch(/FINANCIACION_EXCEDE_PRESUPUESTO/)
  })
})
