/**
 * Papel de trabajo (PROMPT AUDITORÍA §35) —
 * 20260922100000_auditoria_papel_trabajo.sql agrega
 * auditoria_procedimientos.criterio (NOT NULL) y
 * auditoria_ejecuciones.conclusion/evidencia. El resto del workpaper
 * (Objetivo, Procedimiento, Muestra, Resultado) ya existía en
 * auditoria_procedimientos/auditoria_ejecuciones/auditoria_muestras
 * (20260910100000/20260912100000) — esta suite cubre lo nuevo y el flujo
 * completo procedimiento → ejecución → muestra.
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
  console.warn('SALTADO tests/rls/auditoria-papel-trabajo: faltan credenciales Supabase en .env')
}

async function crearRiesgoFixture(admin: Cliente, tenantId: string, creadoPor: string) {
  const { data, error } = await admin
    .from('auditoria_riesgos')
    .insert({ tenant_id: tenantId, nombre: 'Riesgo papel de trabajo', categoria: 'OPERATIVO', probabilidad: 3, impacto: 3, created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture riesgo: ${error.message}`)
  return data.id
}

async function crearControlFixture(admin: Cliente, tenantId: string, riesgoId: string, creadoPor: string) {
  const { data, error } = await admin
    .from('auditoria_controles')
    .insert({ tenant_id: tenantId, riesgo_id: riesgoId, nombre: 'Control manual', tipo: 'DETECTIVO', automatizado: false, manual: true, created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture control: ${error.message}`)
  return data.id
}

async function crearEngagementFixture(admin: Cliente, tenantId: string, creadoPor: string) {
  const { data, error } = await admin
    .from('auditoria_engagements')
    .insert({ tenant_id: tenantId, nombre: 'Engagement papel de trabajo', created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture engagement: ${error.message}`)
  return data.id
}

d('Papel de trabajo — auditoria_procedimientos.criterio / auditoria_ejecuciones.conclusion+evidencia', () => {
  const admin = clienteAdmin(env!)

  it('criterio es obligatorio en un procedimiento', async () => {
    const auditor = await crearUsuario(admin, 'apt-criterio')
    const tenant = await crearTenant(admin, 'apt-criterio', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id)
    const controlId = await crearControlFixture(admin, tenant.id, riesgoId, auditor.id)

    const clienteAuditor = await clienteComo(env!, auditor)
    const { error } = await clienteAuditor.from('auditoria_procedimientos').insert({
      tenant_id: tenant.id,
      control_id: controlId,
      nombre: 'Sin criterio',
      prueba_type: 'INSPECCION',
      created_by: auditor.id,
    } as never)
    expect(error).not.toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('flujo completo: procedimiento → ejecución (conclusión + evidencia) → muestra', async () => {
    const auditor = await crearUsuario(admin, 'apt-flujo')
    const tenant = await crearTenant(admin, 'apt-flujo', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id)
    const controlId = await crearControlFixture(admin, tenant.id, riesgoId, auditor.id)
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)

    const clienteAuditor = await clienteComo(env!, auditor)

    const { data: procedimiento, error: errorProc } = await clienteAuditor
      .from('auditoria_procedimientos')
      .insert({
        tenant_id: tenant.id,
        control_id: controlId,
        nombre: 'Revisión de conciliaciones',
        criterio: 'Toda conciliación bancaria debe cerrarse dentro de los 15 días.',
        prueba_type: 'RECONCILIACION',
        created_by: auditor.id,
      })
      .select('id')
      .single<{ id: string }>()
    expect(errorProc).toBeNull()

    const { data: ejecucion, error: errorEjec } = await clienteAuditor
      .from('auditoria_ejecuciones')
      .insert({
        tenant_id: tenant.id,
        procedimiento_id: procedimiento!.id,
        engagement_id: engagementId,
        resultado: 'PASS',
        conclusion: 'Las conciliaciones revisadas se cerraron dentro del plazo.',
        evidencia: ['Captura de extracto bancario', 'Reporte de conciliación'],
        ejecutado_at: new Date(2026, 0, 15).toISOString(),
        ejecutado_por: auditor.id,
        origen: 'manual',
      })
      .select('id, conclusion, evidencia, resultado')
      .single()
    expect(errorEjec).toBeNull()
    expect(ejecucion?.conclusion).toContain('cerraron dentro del plazo')
    expect(ejecucion?.evidencia).toHaveLength(2)
    expect(ejecucion?.resultado).toBe('PASS')

    const { data: muestra, error: errorMuestra } = await clienteAuditor
      .from('auditoria_muestras')
      .insert({
        tenant_id: tenant.id,
        ejecucion_id: ejecucion!.id,
        poblacion: 40,
        cantidad: 8,
        criterio: 'ALEATORIO',
        semilla: 12345,
        created_by: auditor.id,
      })
      .select('id, poblacion, cantidad')
      .single()
    expect(errorMuestra).toBeNull()
    expect(muestra?.cantidad).toBe(8)

    const { data: leido } = await clienteAuditor
      .from('auditoria_ejecuciones')
      .select('*')
      .eq('procedimiento_id', procedimiento!.id)
    expect(leido).toHaveLength(1)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('muestra ALEATORIA sin semilla falla (constraint ya existente, no nuevo)', async () => {
    const auditor = await crearUsuario(admin, 'apt-semilla')
    const tenant = await crearTenant(admin, 'apt-semilla', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id)
    const controlId = await crearControlFixture(admin, tenant.id, riesgoId, auditor.id)
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)

    const clienteAuditor = await clienteComo(env!, auditor)
    const { data: procedimiento } = await clienteAuditor
      .from('auditoria_procedimientos')
      .insert({
        tenant_id: tenant.id,
        control_id: controlId,
        nombre: 'Prueba sin semilla',
        criterio: 'Criterio de prueba.',
        prueba_type: 'INSPECCION',
        created_by: auditor.id,
      })
      .select('id')
      .single<{ id: string }>()
    const { data: ejecucion } = await clienteAuditor
      .from('auditoria_ejecuciones')
      .insert({
        tenant_id: tenant.id,
        procedimiento_id: procedimiento!.id,
        engagement_id: engagementId,
        resultado: 'PASS',
        ejecutado_at: new Date().toISOString(),
        ejecutado_por: auditor.id,
        origen: 'manual',
      })
      .select('id')
      .single<{ id: string }>()

    const { error } = await clienteAuditor.from('auditoria_muestras').insert({
      tenant_id: tenant.id,
      ejecucion_id: ejecucion!.id,
      poblacion: 10,
      cantidad: 2,
      criterio: 'ALEATORIO',
      created_by: auditor.id,
    })
    expect(error).not.toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('un auxiliar no ve ni crea procedimientos/ejecuciones', async () => {
    const auditor = await crearUsuario(admin, 'apt-rbac-auditor')
    const auxiliar = await crearUsuario(admin, 'apt-rbac-aux')
    const tenant = await crearTenant(admin, 'apt-rbac', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id)
    const controlId = await crearControlFixture(admin, tenant.id, riesgoId, auditor.id)
    const { data: procedimiento } = await admin
      .from('auditoria_procedimientos')
      .insert({
        tenant_id: tenant.id,
        control_id: controlId,
        nombre: 'Procedimiento RBAC',
        criterio: 'Criterio.',
        prueba_type: 'INSPECCION',
        created_by: auditor.id,
      })
      .select('id')
      .single<{ id: string }>()

    const clienteAuxiliar = await clienteComo(env!, auxiliar)
    const { data: visto, error: errorSelect } = await clienteAuxiliar
      .from('auditoria_procedimientos')
      .select('id')
      .eq('id', procedimiento!.id)
    expect(errorSelect).toBeNull()
    expect(visto).toEqual([])

    const { error: errorInsert } = await clienteAuxiliar.from('auditoria_procedimientos').insert({
      tenant_id: tenant.id,
      control_id: controlId,
      nombre: 'No debería poder',
      criterio: 'Criterio.',
      prueba_type: 'INSPECCION',
      created_by: auxiliar.id,
    })
    expect(errorInsert).not.toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
    await eliminarUsuario(admin, auxiliar.id)
  }, 30_000)
})
