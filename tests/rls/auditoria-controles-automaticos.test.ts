/**
 * PROMPT_MAESTRO_MODULO_AUDITORIA_AQUILA — §15-23, §42 (Continuous Control
 * Monitoring). Cubre auditoria_control_ejecutar() contra datos reales:
 * detecta excepciones genuinas, crea el hallazgo automático con el nivel
 * correcto, y nunca acusa (SEGURIDAD_CAMBIOS_PRIVILEGIOS es siempre
 * informativo, jamás FAIL). También cubre el aislamiento por rol — un
 * auxiliar sin acceso a auditoria_controles no puede ejecutar nada.
 *
 * Migración: 20260914100000_auditoria_controles_automaticos.sql.
 */
import { describe, expect, it } from 'vitest'
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
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/auditoria-controles-automaticos: faltan credenciales Supabase en .env')
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

async function crearInmuebleFixture(admin: Cliente, tenantId: string) {
  const tipoId = await tipoApartamentoId(admin)
  const { data, error } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo: `CTRL-${Date.now()}`, tipo_id: tipoId })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture inmueble: ${error.message}`)
  return data.id
}

async function crearRiesgoYControl(
  admin: Cliente,
  tenantId: string,
  creadoPor: string,
  codigoAutomatico: string,
) {
  const { data: riesgo, error: errorRiesgo } = await admin
    .from('auditoria_riesgos')
    .insert({
      tenant_id: tenantId,
      nombre: `Riesgo ${codigoAutomatico}`,
      categoria: 'OPERATIVO',
      probabilidad: 3,
      impacto: 3,
      created_by: creadoPor,
    })
    .select('id')
    .single<{ id: string }>()
  if (errorRiesgo) throw new Error(`fixture riesgo: ${errorRiesgo.message}`)

  const { data: control, error: errorControl } = await admin
    .from('auditoria_controles')
    .insert({
      tenant_id: tenantId,
      riesgo_id: riesgo.id,
      nombre: `Control ${codigoAutomatico}`,
      objetivo: `Detectar excepciones de ${codigoAutomatico}`,
      tipo: 'DETECTIVO',
      automatizado: true,
      manual: false,
      codigo_automatico: codigoAutomatico,
      created_by: creadoPor,
    })
    .select('id')
    .single<{ id: string }>()
  if (errorControl) throw new Error(`fixture control: ${errorControl.message}`)
  return control.id
}

async function crearEngagementFixture(admin: Cliente, tenantId: string, creadoPor: string) {
  const { data, error } = await admin
    .from('auditoria_engagements')
    .insert({ tenant_id: tenantId, nombre: 'Monitoreo continuo', created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture engagement: ${error.message}`)
  return data.id
}

d('Controles automáticos — Continuous Control Monitoring', () => {
  const admin = clienteAdmin(env!)

  it('PERIODO_CERRADO_CON_MOVIMIENTOS: detecta un cargo posterior al cierre y crea hallazgo ALTO', async () => {
    const auditor = await crearUsuario(admin, 'ccm-periodo')
    const tenant = await crearTenant(admin, 'ccm-periodo', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const inmueble = await crearInmuebleFixture(admin, tenant.id)
    const controlId = await crearRiesgoYControl(admin, tenant.id, auditor.id, 'PERIODO_CERRADO_CON_MOVIMIENTOS')
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)

    const cerradoAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: periodo, error: errorPeriodo } = await admin
      .from('periodos')
      .insert({ tenant_id: tenant.id, anio: 2026, mes: 3, estado: 'cerrado', cerrado_at: cerradoAt })
      .select('id')
      .single<{ id: string }>()
    if (errorPeriodo) throw new Error(errorPeriodo.message)

    const { data: novedad, error: errorNovedad } = await admin
      .from('novedades')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmueble,
        tipo: 'CHARGE',
        monto: 50000,
        descripcion: 'Novedad de prueba CCM',
        fecha_efectiva: new Date().toISOString().slice(0, 10),
        created_by: auditor.id,
      })
      .select('id')
      .single<{ id: string }>()
    if (errorNovedad) throw new Error(errorNovedad.message)

    const { error: errorCargo } = await admin.from('cargos').insert({
      tenant_id: tenant.id,
      inmueble_id: inmueble,
      periodo_id: periodo.id,
      categoria: 'otro',
      origen_tipo: 'novedad',
      novedad_id: novedad.id,
      monto_original: 50000,
      created_at: new Date().toISOString(),
    })
    if (errorCargo) throw new Error(errorCargo.message)

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data, error } = await clienteAuditor.rpc('auditoria_control_ejecutar', {
      p_control_id: controlId,
      p_engagement_id: engagementId,
    })

    expect(error).toBeNull()
    const resultado = data![0]
    expect(resultado.resultado).toBe('FAIL')
    expect(resultado.conteo).toBeGreaterThanOrEqual(1)
    expect(resultado.hallazgo_id).not.toBeNull()

    const { data: hallazgo } = await admin
      .from('auditoria_hallazgos')
      .select('nivel, estado')
      .eq('id', resultado.hallazgo_id!)
      .single()
    expect(hallazgo?.nivel).toBe('ALTO')
    expect(hallazgo?.estado).toBe('ABIERTO')

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('PRESUPUESTO_VIGENTE_SIN_RUBROS: detecta un presupuesto vigente sin rubros y crea hallazgo MEDIO', async () => {
    const auditor = await crearUsuario(admin, 'ccm-presupuesto')
    const tenant = await crearTenant(admin, 'ccm-presupuesto', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const controlId = await crearRiesgoYControl(admin, tenant.id, auditor.id, 'PRESUPUESTO_VIGENTE_SIN_RUBROS')
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)

    const { error: errorPresupuesto } = await admin.from('presupuestos').insert({
      tenant_id: tenant.id,
      anio: 2026,
      version: 1,
      estado: 'vigente',
      monto_total: 0,
    })
    if (errorPresupuesto) throw new Error(errorPresupuesto.message)

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data, error } = await clienteAuditor.rpc('auditoria_control_ejecutar', {
      p_control_id: controlId,
      p_engagement_id: engagementId,
    })

    expect(error).toBeNull()
    const resultado = data![0]
    expect(resultado.resultado).toBe('FAIL')
    expect(resultado.conteo).toBe(1)

    const { data: hallazgo } = await admin
      .from('auditoria_hallazgos')
      .select('nivel')
      .eq('id', resultado.hallazgo_id!)
      .single()
    expect(hallazgo?.nivel).toBe('MEDIO')

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('SEGURIDAD_CAMBIOS_PRIVILEGIOS: reporta cambios de rol como REVIEW, nunca crea hallazgo', async () => {
    const auditor = await crearUsuario(admin, 'ccm-seguridad-auditor')
    const adminGuard = await crearUsuario(admin, 'ccm-seguridad-guard')
    const otro = await crearUsuario(admin, 'ccm-seguridad-otro')
    const tenant = await crearTenant(admin, 'ccm-seguridad', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    // guard_last_agent (SEC-07) bloquea degradar/revocar el único auxiliar o
    // administrador activo — este membership mantiene siempre uno presente
    // para poder cambiar libremente el rol de `otro` más abajo.
    await crearMembership(admin, tenant.id, adminGuard.id, 'administrador')
    const membershipOtro = await crearMembership(admin, tenant.id, otro.id, 'auxiliar')
    const controlId = await crearRiesgoYControl(admin, tenant.id, auditor.id, 'SEGURIDAD_CAMBIOS_PRIVILEGIOS')
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)

    const { error: errorCambioRol } = await admin
      .from('memberships')
      .update({ role: 'administrador' })
      .eq('id', membershipOtro)
    if (errorCambioRol) throw new Error(errorCambioRol.message)

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data, error } = await clienteAuditor.rpc('auditoria_control_ejecutar', {
      p_control_id: controlId,
      p_engagement_id: engagementId,
    })

    expect(error).toBeNull()
    const resultado = data![0]
    expect(resultado.resultado).toBe('REVIEW')
    expect(resultado.conteo).toBeGreaterThanOrEqual(1)
    expect(resultado.hallazgo_id).toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
    await eliminarUsuario(admin, adminGuard.id)
    await eliminarUsuario(admin, otro.id)
  }, 30_000)

  it('sobre datos limpios el resultado es PASS y no crea hallazgo', async () => {
    const auditor = await crearUsuario(admin, 'ccm-limpio')
    const tenant = await crearTenant(admin, 'ccm-limpio', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const controlId = await crearRiesgoYControl(admin, tenant.id, auditor.id, 'CARTERA_SOBREAPLICACION')
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data, error } = await clienteAuditor.rpc('auditoria_control_ejecutar', {
      p_control_id: controlId,
      p_engagement_id: engagementId,
    })

    expect(error).toBeNull()
    const resultado = data![0]
    expect(resultado.resultado).toBe('PASS')
    expect(resultado.conteo).toBe(0)
    expect(resultado.hallazgo_id).toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('un auxiliar sin acceso a auditoria_controles no puede ejecutar el control (RLS lo bloquea)', async () => {
    const auditor = await crearUsuario(admin, 'ccm-rls-auditor')
    const auxiliar = await crearUsuario(admin, 'ccm-rls-auxiliar')
    const tenant = await crearTenant(admin, 'ccm-rls', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    const controlId = await crearRiesgoYControl(admin, tenant.id, auditor.id, 'CARTERA_SOBREAPLICACION')
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)

    const clienteAuxiliar = await clienteComo(env!, auxiliar)
    const { error } = await clienteAuxiliar.rpc('auditoria_control_ejecutar', {
      p_control_id: controlId,
      p_engagement_id: engagementId,
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/AUD-CTRL/)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
    await eliminarUsuario(admin, auxiliar.id)
  }, 30_000)

  it('rechaza ejecutar un control contra una auditoría de otro tenant', async () => {
    const auditorA = await crearUsuario(admin, 'ccm-cross-a')
    const auditorB = await crearUsuario(admin, 'ccm-cross-b')
    const tenantA = await crearTenant(admin, 'ccm-cross-a', auditorA.id)
    const tenantB = await crearTenant(admin, 'ccm-cross-b', auditorB.id)
    await crearMembership(admin, tenantA.id, auditorA.id, 'auditor')
    await crearMembership(admin, tenantB.id, auditorB.id, 'auditor')
    const controlA = await crearRiesgoYControl(admin, tenantA.id, auditorA.id, 'CARTERA_SOBREAPLICACION')
    const engagementB = await crearEngagementFixture(admin, tenantB.id, auditorB.id)

    // auditorA sí ve su propio control, pero no la auditoría de tenantB (RLS) -> "auditoría no existe"
    const clienteAuditorA = await clienteComo(env!, auditorA)
    const { error } = await clienteAuditorA.rpc('auditoria_control_ejecutar', {
      p_control_id: controlA,
      p_engagement_id: engagementB,
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/AUD-CTRL/)

    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, auditorA.id)
    await eliminarUsuario(admin, auditorB.id)
  }, 30_000)
})
