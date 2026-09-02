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

async function listaTipoId(admin: Cliente, tipo: string, codigo: string): Promise<number> {
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

  it('CARTERA_ANTICIPOS_SIN_APLICAR: detecta un pago con remanente sin aplicar desde hace más de 30 días', async () => {
    const auditor = await crearUsuario(admin, 'ccm-anticipo')
    const tenant = await crearTenant(admin, 'ccm-anticipo', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const inmueble = await crearInmuebleFixture(admin, tenant.id)
    const formaPagoId = await listaTipoId(admin, 'FORMA_PAGO', 'efectivo')
    const controlId = await crearRiesgoYControl(admin, tenant.id, auditor.id, 'CARTERA_ANTICIPOS_SIN_APLICAR')
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)

    const fechaAntigua = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { error: errorPago } = await admin.from('pagos').insert({
      tenant_id: tenant.id,
      inmueble_id: inmueble,
      monto: 100000,
      fecha_pago: fechaAntigua,
      forma_pago_id: formaPagoId,
    })
    if (errorPago) throw new Error(errorPago.message)

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

  it('CARTERA_ANTICIPOS_SIN_APLICAR: un pago reciente o ya aplicado no cuenta como excepción', async () => {
    const auditor = await crearUsuario(admin, 'ccm-anticipo-limpio')
    const tenant = await crearTenant(admin, 'ccm-anticipo-limpio', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const inmueble = await crearInmuebleFixture(admin, tenant.id)
    const formaPagoId = await listaTipoId(admin, 'FORMA_PAGO', 'efectivo')
    const controlId = await crearRiesgoYControl(admin, tenant.id, auditor.id, 'CARTERA_ANTICIPOS_SIN_APLICAR')
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)

    const { error: errorPago } = await admin.from('pagos').insert({
      tenant_id: tenant.id,
      inmueble_id: inmueble,
      monto: 100000,
      fecha_pago: new Date().toISOString().slice(0, 10),
      forma_pago_id: formaPagoId,
    })
    if (errorPago) throw new Error(errorPago.message)

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data, error } = await clienteAuditor.rpc('auditoria_control_ejecutar', {
      p_control_id: controlId,
      p_engagement_id: engagementId,
    })

    expect(error).toBeNull()
    const resultado = data![0]
    expect(resultado.resultado).toBe('PASS')
    expect(resultado.conteo).toBe(0)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('correr el mismo control dos veces no duplica el hallazgo (necesario para que el cron diario no inunde la bandeja)', async () => {
    const auditor = await crearUsuario(admin, 'ccm-dedup')
    const tenant = await crearTenant(admin, 'ccm-dedup', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const inmueble = await crearInmuebleFixture(admin, tenant.id)
    const formaPagoId = await listaTipoId(admin, 'FORMA_PAGO', 'efectivo')
    const controlId = await crearRiesgoYControl(admin, tenant.id, auditor.id, 'CARTERA_ANTICIPOS_SIN_APLICAR')
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)

    const fechaAntigua = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { error: errorPago } = await admin.from('pagos').insert({
      tenant_id: tenant.id,
      inmueble_id: inmueble,
      monto: 100000,
      fecha_pago: fechaAntigua,
      forma_pago_id: formaPagoId,
    })
    if (errorPago) throw new Error(errorPago.message)

    const clienteAuditor = await clienteComo(env!, auditor)
    const primera = await clienteAuditor.rpc('auditoria_control_ejecutar', {
      p_control_id: controlId,
      p_engagement_id: engagementId,
    })
    expect(primera.error).toBeNull()
    const resultado1 = primera.data![0]
    expect(resultado1.resultado).toBe('FAIL')
    expect(resultado1.hallazgo_id).not.toBeNull()

    const segunda = await clienteAuditor.rpc('auditoria_control_ejecutar', {
      p_control_id: controlId,
      p_engagement_id: engagementId,
    })
    expect(segunda.error).toBeNull()
    const resultado2 = segunda.data![0]
    expect(resultado2.resultado).toBe('FAIL')
    // Mismo hallazgo reutilizado, no uno nuevo — la excepción sigue sin
    // resolver, no hace falta una segunda fila para decirlo otra vez.
    expect(resultado2.hallazgo_id).toBe(resultado1.hallazgo_id)
    expect(resultado2.ejecucion_id).not.toBe(resultado1.ejecucion_id)

    const { data: hallazgos } = await admin
      .from('auditoria_hallazgos')
      .select('id')
      .eq('control_id', controlId)
    expect(hallazgos).toHaveLength(1)

    const { data: ejecuciones } = await admin
      .from('auditoria_ejecuciones')
      .select('origen, ejecutado_por')
      .eq('engagement_id', engagementId)
      .order('created_at', { ascending: true })
    expect(ejecuciones).toHaveLength(2)
    for (const ejecucion of ejecuciones ?? []) {
      expect(ejecucion.origen).toBe('manual')
      expect(ejecucion.ejecutado_por).toBe(auditor.id)
    }

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('BANCOS_CONCILIACION_PENDIENTE: detecta una línea de extracto sin conciliar hace más de 15 días', async () => {
    const auditor = await crearUsuario(admin, 'ccm-banco')
    const tenant = await crearTenant(admin, 'ccm-banco', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const controlId = await crearRiesgoYControl(admin, tenant.id, auditor.id, 'BANCOS_CONCILIACION_PENDIENTE')
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)

    const sello = String(Date.now())
    const { data: extracto, error: errorExtracto } = await admin
      .from('extracto_bancario')
      .insert({
        tenant_id: tenant.id,
        nombre_archivo: 'extracto-prueba.csv',
        hash_archivo: `hash-extracto-${sello}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errorExtracto) throw new Error(errorExtracto.message)

    const fechaAntigua = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { error: errorLinea } = await admin.from('extracto_linea').insert({
      extracto_id: extracto.id,
      tenant_id: tenant.id,
      fecha_movimiento: fechaAntigua,
      monto: 250000,
      descripcion_banco: 'Consignación sin identificar',
      hash_linea: `hash-linea-${sello}`,
    })
    if (errorLinea) throw new Error(errorLinea.message)

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

  it('TERCEROS_PROVEEDOR_DUPLICADO: reporta como REVIEW un mismo documento con dos tipos de identificación, nunca crea hallazgo', async () => {
    const auditor = await crearUsuario(admin, 'ccm-proveedor')
    const tenant = await crearTenant(admin, 'ccm-proveedor', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const controlId = await crearRiesgoYControl(admin, tenant.id, auditor.id, 'TERCEROS_PROVEEDOR_DUPLICADO')
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)

    const tipoCedula = await listaTipoId(admin, 'TIPO_IDENTIFICACION', 'cedula')
    const tipoNit = await listaTipoId(admin, 'TIPO_IDENTIFICACION', 'nit')
    const estadoActivo = await listaTipoId(admin, 'ESTADO_TERCERO', 'activo')
    const rolProveedor = await listaTipoId(admin, 'PERSONA_COPROPIEDAD', 'proveedor')
    const sello = String(Date.now())

    const { data: terceroA, error: errorA } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_identificacion_id: tipoCedula,
        numero_documento: sello,
        tipo_persona: 'natural',
        primer_nombre: 'Proveedor',
        primer_apellido: 'DuplicadoA',
        email: `prov-a-${sello}@example.test`,
        estado_id: estadoActivo,
      })
      .select('id')
      .single<{ id: string }>()
    if (errorA) throw new Error(`fixture terceroA: ${errorA.message}`)

    const { data: terceroB, error: errorB } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_identificacion_id: tipoNit,
        numero_documento: sello,
        tipo_persona: 'juridica',
        razon_social: 'Proveedor Duplicado B S.A.S.',
        email: `prov-b-${sello}@example.test`,
        estado_id: estadoActivo,
      })
      .select('id')
      .single<{ id: string }>()
    if (errorB) throw new Error(`fixture terceroB: ${errorB.message}`)

    for (const terceroId of [terceroA.id, terceroB.id]) {
      const { error: errorRol } = await admin.from('tenant_tercero_rol').insert({
        tenant_id: tenant.id,
        tercero_id: terceroId,
        rol_id: rolProveedor,
        vigente_desde: '2026-01-01',
      })
      if (errorRol) throw new Error(`fixture tenant_tercero_rol: ${errorRol.message}`)
    }

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data, error } = await clienteAuditor.rpc('auditoria_control_ejecutar', {
      p_control_id: controlId,
      p_engagement_id: engagementId,
    })

    expect(error).toBeNull()
    const resultado = data![0]
    expect(resultado.resultado).toBe('REVIEW')
    expect(resultado.conteo).toBe(1)
    expect(resultado.hallazgo_id).toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('GUARDAS_INMUTABILIDAD_DESHABILITADAS: sobre el estado real de la base, PASS y no crea hallazgo', async () => {
    // No se induce el FAIL desde este test: forzarlo requeriría deshabilitar
    // de verdad un trigger de inmutabilidad (cargos_append_only, etc.) sobre
    // la base compartida de desarrollo, el mismo riesgo operativo por el que
    // CARTERA_SOBREAPLICACION tampoco fuerza su propio guard aquí. Este test
    // sí confirma que la consulta corre y que, con las guardas intactas
    // (el estado real de este proyecto), el resultado es el esperado.
    const auditor = await crearUsuario(admin, 'ccm-guardas')
    const tenant = await crearTenant(admin, 'ccm-guardas', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const controlId = await crearRiesgoYControl(admin, tenant.id, auditor.id, 'GUARDAS_INMUTABILIDAD_DESHABILITADAS')
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
})
