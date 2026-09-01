/**
 * PROMPT_MAESTRO_MODULO_AUDITORIA_AQUILA — §7, §40, §53, §55, §70, §101-102.
 *
 * Cubre el circuito núcleo del módulo de auditoría (Riesgo → Control →
 * Engagement → Hallazgo → Acción) contra las políticas RLS y las guardas de
 * segregación de funciones definidas en:
 *   - 20260910100000_auditoria_entidades_core.sql
 *   - 20260911100000_auditoria_trabajo.sql
 *   - 20260912100000_auditoria_ejecucion.sql
 *
 * AUD-T-001 aislamiento cross-tenant; AUD-T-003 no-autoaprobación;
 * AUD-T-004 cierre requiere evidencia; AUD-T-005 segregación de funciones;
 * AUD-T-011 denegación cross-tenant. No cubre todavía informes/normativa
 * (fuera del alcance MVP acordado).
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
  console.warn('SALTADO tests/rls/auditoria: faltan credenciales Supabase en .env')
}

async function crearRiesgoFixture(admin: Cliente, tenantId: string, creadoPor: string) {
  const { data, error } = await admin
    .from('auditoria_riesgos')
    .insert({
      tenant_id: tenantId,
      nombre: 'Riesgo de prueba',
      categoria: 'OPERATIVO',
      probabilidad: 3,
      impacto: 3,
      created_by: creadoPor,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture riesgo: ${error.message}`)
  return data.id
}

async function crearEngagementFixture(admin: Cliente, tenantId: string, creadoPor: string) {
  const { data, error } = await admin
    .from('auditoria_engagements')
    .insert({ tenant_id: tenantId, nombre: 'Engagement de prueba', created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture engagement: ${error.message}`)
  return data.id
}

async function crearHallazgoFixture(
  admin: Cliente,
  tenantId: string,
  engagementId: string,
  creadoPor: string,
  responsable?: string,
) {
  const { data, error } = await admin
    .from('auditoria_hallazgos')
    .insert({
      tenant_id: tenantId,
      engagement_id: engagementId,
      proceso: 'Cartera',
      nivel: 'MEDIO',
      created_by: creadoPor,
      responsable: responsable ?? null,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture hallazgo: ${error.message}`)
  return data.id
}

d('Módulo de auditoría — RLS y segregación de funciones', () => {
  const admin = clienteAdmin(env!)

  it('AUD-T-001/011: un auditor no ve riesgos de otro tenant', async () => {
    const usuarioA = await crearUsuario(admin, 'aud-riesgo-a')
    const usuarioB = await crearUsuario(admin, 'aud-riesgo-b')
    const tenantA = await crearTenant(admin, 'aud-riesgo-a', usuarioA.id)
    const tenantB = await crearTenant(admin, 'aud-riesgo-b', usuarioB.id)
    await crearMembership(admin, tenantA.id, usuarioA.id, 'auditor')
    await crearMembership(admin, tenantB.id, usuarioB.id, 'auditor')
    const riesgoB = await crearRiesgoFixture(admin, tenantB.id, usuarioB.id)

    const clienteA = await clienteComo(env!, usuarioA)
    const { data, error } = await clienteA.from('auditoria_riesgos').select('id').eq('id', riesgoB)

    expect(error).toBeNull()
    expect(data).toEqual([])

    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, usuarioA.id)
    await eliminarUsuario(admin, usuarioB.id)
  }, 30_000)

  it('un auxiliar no puede crear un riesgo (solo auditor/administrador escriben)', async () => {
    const usuario = await crearUsuario(admin, 'aud-auxiliar-riesgo')
    const tenant = await crearTenant(admin, 'aud-aux-riesgo', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')
    const cliente = await clienteComo(env!, usuario)

    const { error } = await cliente.from('auditoria_riesgos').insert({
      tenant_id: tenant.id,
      nombre: 'Riesgo no autorizado',
      categoria: 'OPERATIVO',
      probabilidad: 2,
      impacto: 2,
      created_by: usuario.id,
    })

    expect(error).not.toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)

  it('un auxiliar solo ve los hallazgos donde es responsable asignado', async () => {
    const auditor = await crearUsuario(admin, 'aud-resp-auditor')
    const auxiliar = await crearUsuario(admin, 'aud-resp-auxiliar')
    const tenant = await crearTenant(admin, 'aud-resp', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    const engagement = await crearEngagementFixture(admin, tenant.id, auditor.id)
    const hallazgoAsignado = await crearHallazgoFixture(admin, tenant.id, engagement, auditor.id, auxiliar.id)
    const hallazgoAjeno = await crearHallazgoFixture(admin, tenant.id, engagement, auditor.id)

    const clienteAux = await clienteComo(env!, auxiliar)
    const { data, error } = await clienteAux.from('auditoria_hallazgos').select('id')

    expect(error).toBeNull()
    const ids = (data ?? []).map((h) => h.id)
    expect(ids).toContain(hallazgoAsignado)
    expect(ids).not.toContain(hallazgoAjeno)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
    await eliminarUsuario(admin, auxiliar.id)
  }, 30_000)

  it('AUD-T-003/005: quien crea un hallazgo no puede cerrarlo (auto-cierre bloqueado)', async () => {
    const auditor = await crearUsuario(admin, 'aud-sod-auditor')
    const tenant = await crearTenant(admin, 'aud-sod', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const engagement = await crearEngagementFixture(admin, tenant.id, auditor.id)
    const hallazgo = await crearHallazgoFixture(admin, tenant.id, engagement, auditor.id)

    const clienteAuditor = await clienteComo(env!, auditor)
    const { error } = await clienteAuditor
      .from('auditoria_hallazgos')
      .update({ estado: 'CERRADO', evidencia: ['evidencia-1'] })
      .eq('id', hallazgo)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/AUD-SOD/)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('AUD-T-004: un hallazgo no puede cerrarse sin evidencia, incluso por un administrador distinto', async () => {
    const auditor = await crearUsuario(admin, 'aud-cierre-auditor')
    const administrador = await crearUsuario(admin, 'aud-cierre-admin')
    const tenant = await crearTenant(admin, 'aud-cierre', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    const engagement = await crearEngagementFixture(admin, tenant.id, auditor.id)
    const hallazgo = await crearHallazgoFixture(admin, tenant.id, engagement, auditor.id)

    const clienteAdministrador = await clienteComo(env!, administrador)

    const sinEvidencia = await clienteAdministrador
      .from('auditoria_hallazgos')
      .update({ estado: 'CERRADO' })
      .eq('id', hallazgo)
    expect(sinEvidencia.error).not.toBeNull()
    expect(sinEvidencia.error?.message).toMatch(/AUD-CIERRE/)

    const conEvidencia = await clienteAdministrador
      .from('auditoria_hallazgos')
      .update({ estado: 'CERRADO', evidencia: ['captura-conciliacion.png'] })
      .eq('id', hallazgo)
      .select('estado')
      .single()
    expect(conEvidencia.error).toBeNull()
    expect(conEvidencia.data?.estado).toBe('CERRADO')

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
    await eliminarUsuario(admin, administrador.id)
  }, 30_000)

  it('una acción de seguimiento no puede cerrarse sin evidencia_cierre', async () => {
    const auditor = await crearUsuario(admin, 'aud-accion-auditor')
    const tenant = await crearTenant(admin, 'aud-accion', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const engagement = await crearEngagementFixture(admin, tenant.id, auditor.id)
    const hallazgo = await crearHallazgoFixture(admin, tenant.id, engagement, auditor.id)
    const { data: accion, error: errorAccion } = await admin
      .from('auditoria_acciones')
      .insert({ tenant_id: tenant.id, hallazgo_id: hallazgo, accion: 'Corregir', created_by: auditor.id })
      .select('id')
      .single<{ id: string }>()
    if (errorAccion) throw new Error(errorAccion.message)

    const clienteAuditor = await clienteComo(env!, auditor)
    const sinEvidencia = await clienteAuditor
      .from('auditoria_acciones')
      .update({ estado: 'CERRADA' })
      .eq('id', accion.id)
    expect(sinEvidencia.error).not.toBeNull()
    expect(sinEvidencia.error?.message).toMatch(/AUD-CIERRE/)

    const conEvidencia = await clienteAuditor
      .from('auditoria_acciones')
      .update({ estado: 'CERRADA', evidencia_cierre: ['soporte.pdf'] })
      .eq('id', accion.id)
      .select('estado')
      .single()
    expect(conEvidencia.error).toBeNull()
    expect(conEvidencia.data?.estado).toBe('CERRADA')

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('un auxiliar responsable de una acción no puede cerrarla él mismo (solo puede avanzar el progreso)', async () => {
    const auditor = await crearUsuario(admin, 'aud-accion-aux-auditor')
    const auxiliar = await crearUsuario(admin, 'aud-accion-aux-auxiliar')
    const tenant = await crearTenant(admin, 'aud-accion-aux', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    const engagement = await crearEngagementFixture(admin, tenant.id, auditor.id)
    const hallazgo = await crearHallazgoFixture(admin, tenant.id, engagement, auditor.id)
    const { data: accion, error: errorAccion } = await admin
      .from('auditoria_acciones')
      .insert({
        tenant_id: tenant.id,
        hallazgo_id: hallazgo,
        accion: 'Corregir',
        created_by: auditor.id,
        responsable: auxiliar.id,
      })
      .select('id')
      .single<{ id: string }>()
    if (errorAccion) throw new Error(errorAccion.message)

    const clienteAuxiliar = await clienteComo(env!, auxiliar)

    const progreso = await clienteAuxiliar
      .from('auditoria_acciones')
      .update({ estado: 'EN_PROGRESO' })
      .eq('id', accion.id)
      .select('estado')
      .single()
    expect(progreso.error).toBeNull()
    expect(progreso.data?.estado).toBe('EN_PROGRESO')

    const cierre = await clienteAuxiliar
      .from('auditoria_acciones')
      .update({ estado: 'CERRADA', evidencia_cierre: ['soporte.pdf'] })
      .eq('id', accion.id)
    // with check de auditoria_acciones_update excluye estado=CERRADA para el
    // responsable: USING deja ver la fila pero WITH CHECK rechaza el nuevo
    // valor -> Postgres levanta 42501 (no filas silenciosas).
    expect(cierre.error).not.toBeNull()
    expect(cierre.error?.code).toBe('42501')

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
    await eliminarUsuario(admin, auxiliar.id)
  }, 30_000)

  it('§34/§70: una evidencia no puede modificarse ni borrarse una vez creada', async () => {
    const auditor = await crearUsuario(admin, 'aud-evidencia-auditor')
    const tenant = await crearTenant(admin, 'aud-evidencia', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const engagement = await crearEngagementFixture(admin, tenant.id, auditor.id)
    const hallazgo = await crearHallazgoFixture(admin, tenant.id, engagement, auditor.id)

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data: evidencia, error: errorInsert } = await clienteAuditor
      .from('auditoria_evidencias')
      .insert({
        tenant_id: tenant.id,
        hallazgo_id: hallazgo,
        tipo: 'DOCUMENTO',
        usuario_id: auditor.id,
        descripcion: 'Soporte inicial',
      })
      .select('id')
      .single<{ id: string }>()
    expect(errorInsert).toBeNull()

    const update = await clienteAuditor
      .from('auditoria_evidencias')
      .update({ descripcion: 'Cambiada' })
      .eq('id', evidencia!.id)
    expect(update.error).toBeNull()
    expect(update.data).toBeNull() // sin política de UPDATE: 0 filas afectadas

    const del = await clienteAuditor.from('auditoria_evidencias').delete().eq('id', evidencia!.id)
    expect(del.error).toBeNull()
    expect(del.data).toBeNull() // sin política de DELETE: 0 filas afectadas

    const { data: sigueViva } = await admin
      .from('auditoria_evidencias')
      .select('descripcion')
      .eq('id', evidencia!.id)
      .single()
    expect(sigueViva?.descripcion).toBe('Soporte inicial')

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('§33: una muestra con criterio ALEATORIO exige semilla reproducible', async () => {
    const auditor = await crearUsuario(admin, 'aud-muestra-auditor')
    const tenant = await crearTenant(admin, 'aud-muestra', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const engagement = await crearEngagementFixture(admin, tenant.id, auditor.id)
    const { data: ejecucion, error: errorEjecucion } = await admin
      .from('auditoria_ejecuciones')
      .insert({ tenant_id: tenant.id, engagement_id: engagement, ejecutado_por: auditor.id })
      .select('id')
      .single<{ id: string }>()
    if (errorEjecucion) throw new Error(errorEjecucion.message)

    const clienteAuditor = await clienteComo(env!, auditor)
    const sinSemilla = await clienteAuditor.from('auditoria_muestras').insert({
      tenant_id: tenant.id,
      ejecucion_id: ejecucion.id,
      poblacion: 100,
      cantidad: 10,
      criterio: 'ALEATORIO',
      created_by: auditor.id,
    })
    expect(sinSemilla.error).not.toBeNull()

    const conSemilla = await clienteAuditor.from('auditoria_muestras').insert({
      tenant_id: tenant.id,
      ejecucion_id: ejecucion.id,
      poblacion: 100,
      cantidad: 10,
      criterio: 'ALEATORIO',
      semilla: 42,
      created_by: auditor.id,
    })
    expect(conSemilla.error).toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('los catálogos globales (tipos de auditoría, riesgos de referencia) son legibles por cualquier autenticado', async () => {
    const usuario = await crearUsuario(admin, 'aud-catalogo')
    const tenant = await crearTenant(admin, 'aud-catalogo', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')
    const cliente = await clienteComo(env!, usuario)

    const tipos = await cliente.from('auditoria_tipo_auditoria').select('codigo').eq('codigo', 'CARTERA')
    expect(tipos.error).toBeNull()
    expect(tipos.data).toHaveLength(1)

    const riesgos = await cliente.from('auditoria_catalogo_riesgos').select('codigo').limit(1)
    expect(riesgos.error).toBeNull()
    expect((riesgos.data ?? []).length).toBeGreaterThan(0)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)
})
