/**
 * T-MATRIX — PROMPT_MAESTRO_FASE1.md §7.6, §12.2.
 *
 * `ROLE_PERMISSIONS` (apps/web/app/types/permissions.ts) es la única
 * definición de la matriz en el frontend; la misma matriz vive en SQL como
 * políticas RLS. Este test no compara las dos fuentes en abstracto — para
 * cada permiso con una operación RLS-protegida concreta hoy, ejecuta esa
 * operación como `agent` y como `auditor` y verifica que el resultado
 * coincide con lo que dice `hasPermission()`. Si alguien cambia la matriz
 * TS o la política SQL sin tocar la otra, este test lo detecta.
 *
 * Cobertura de los 12 permisos de `Permission` (permissions.ts) — auditado en
 * PROMPT_PERMISOS_CAPA2.md §1.7/§A4. Cinco tienen una comparación RLS 1:1
 * directa aquí; los otros siete están fuera de alcance POR DISEÑO, cada uno
 * con su razón, no por omisión:
 *   - `users:read`    → SELECT memberships (comparado abajo)
 *   - `users:manage`  → UPDATE memberships (comparado abajo)
 *   - `data:read`     → SELECT tenants (comparado abajo)
 *   - `settings:manage` → UPDATE tenants (comparado abajo)
 *   - `audit:view`    → SELECT audit_log (comparado abajo)
 *   - `tenant:delete` → sin política de DELETE en `tenants` (§1.6): la
 *     operación debe fallar para los 3 roles, sin excepción — comparado
 *     abajo como "esto no se puede", no omitido.
 *   - `users:invite`  → solo Edge Function (create-tenant, D-19); no hay
 *     política de mutación RLS que ejecutar como test 1:1.
 *   - `data:create/update/delete` → "data" no es una tabla única; cada tabla
 *     de dominio tiene su propia policy y su propio test en tests/rls/*
 *     (~90 archivos, uno o más por dominio, p.ej. cartera-cobranza.test.ts).
 *   - `dashboard:view`, `metrics:view` → visibilidad de UI (qué tarjeta se
 *     muestra), no una operación de base de datos que RLS pueda negar.
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
} from '../rls/helpers.js'
import { hasPermission } from '../../apps/web/app/types/permissions.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rbac/t-matrix: faltan variables de Supabase en .env')
}

d('T-MATRIX — ROLE_PERMISSIONS (TS) coincide con las políticas RLS', () => {
  const admin = clienteAdmin(env!)
  let agentUser: UsuarioPrueba
  let auditorUser: UsuarioPrueba
  let administradorUser: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente
  let clienteAuditor: Cliente
  let clienteAdministrador: Cliente
  let membershipAuditorId: string

  beforeAll(async () => {
    agentUser = await crearUsuario(admin, 'tmatrix-agent')
    auditorUser = await crearUsuario(admin, 'tmatrix-auditor')
    administradorUser = await crearUsuario(admin, 'tmatrix-administrador')
    tenant = await crearTenant(admin, 'tmatrix', agentUser.id)
    await crearMembership(admin, tenant.id, agentUser.id, 'auxiliar')
    membershipAuditorId = await crearMembership(admin, tenant.id, auditorUser.id, 'auditor')
    await crearMembership(admin, tenant.id, administradorUser.id, 'administrador')
    clienteAgent = await clienteComo(env!, agentUser)
    clienteAuditor = await clienteComo(env!, auditorUser)
    clienteAdministrador = await clienteComo(env!, administradorUser)
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agentUser.id)
    await eliminarUsuario(admin, auditorUser.id)
    await eliminarUsuario(admin, administradorUser.id)
  }, 30_000)

  it('users:read — SELECT memberships coincide para agent y auditor', async () => {
    const { data: datosAgent, error: errorAgent } = await clienteAgent
      .from('memberships')
      .select('id')
      .eq('tenant_id', tenant.id)
    expect(errorAgent).toBeNull()
    expect(datosAgent!.length > 0).toBe(hasPermission('auxiliar', 'users:read'))

    const { data: datosAuditor, error: errorAuditor } = await clienteAuditor
      .from('memberships')
      .select('id')
      .eq('tenant_id', tenant.id)
    expect(errorAuditor).toBeNull()
    expect(datosAuditor!.length > 0).toBe(hasPermission('auditor', 'users:read'))

    const { data: datosAdministrador, error: errorAdministrador } = await clienteAdministrador
      .from('memberships')
      .select('id')
      .eq('tenant_id', tenant.id)
    expect(errorAdministrador).toBeNull()
    expect(datosAdministrador!.length > 0).toBe(hasPermission('administrador', 'users:read'))
  })

  it('users:manage — UPDATE memberships coincide para agent y auditor', async () => {
    const { data: datosAuditor, error: errorAuditor } = await clienteAuditor
      .from('memberships')
      .update({ role: 'auditor' })
      .eq('id', membershipAuditorId)
      .select('id')
    expect(errorAuditor).toBeNull()
    expect(datosAuditor!.length > 0).toBe(hasPermission('auditor', 'users:manage'))

    const { data: datosAgent, error: errorAgent } = await clienteAgent
      .from('memberships')
      .update({ role: 'auditor' })
      .eq('id', membershipAuditorId)
      .select('id')
    expect(errorAgent).toBeNull()
    expect(datosAgent!.length > 0).toBe(hasPermission('auxiliar', 'users:manage'))

    const { data: datosAdministrador, error: errorAdministrador } = await clienteAdministrador
      .from('memberships')
      .update({ role: 'auditor' })
      .eq('id', membershipAuditorId)
      .select('id')
    expect(errorAdministrador).toBeNull()
    expect(datosAdministrador!.length > 0).toBe(hasPermission('administrador', 'users:manage'))
  })

  it('data:read — SELECT tenants coincide para agent y auditor', async () => {
    const { data: datosAgent, error: errorAgent } = await clienteAgent
      .from('tenants')
      .select('id')
      .eq('id', tenant.id)
    expect(errorAgent).toBeNull()
    expect(datosAgent!.length > 0).toBe(hasPermission('auxiliar', 'data:read'))

    const { data: datosAuditor, error: errorAuditor } = await clienteAuditor
      .from('tenants')
      .select('id')
      .eq('id', tenant.id)
    expect(errorAuditor).toBeNull()
    expect(datosAuditor!.length > 0).toBe(hasPermission('auditor', 'data:read'))

    const { data: datosAdministrador, error: errorAdministrador } = await clienteAdministrador
      .from('tenants')
      .select('id')
      .eq('id', tenant.id)
    expect(errorAdministrador).toBeNull()
    expect(datosAdministrador!.length > 0).toBe(hasPermission('administrador', 'data:read'))
  })

  it('settings:manage — UPDATE tenants coincide para agent y auditor', async () => {
    const { data: datosAuditor, error: errorAuditor } = await clienteAuditor
      .from('tenants')
      .update({ name: 'Tenant prueba tmatrix' })
      .eq('id', tenant.id)
      .select('id')
    expect(errorAuditor).toBeNull()
    expect(datosAuditor!.length > 0).toBe(hasPermission('auditor', 'settings:manage'))

    const { data: datosAgent, error: errorAgent } = await clienteAgent
      .from('tenants')
      .update({ name: 'Tenant prueba tmatrix' })
      .eq('id', tenant.id)
      .select('id')
    expect(errorAgent).toBeNull()
    expect(datosAgent!.length > 0).toBe(hasPermission('auxiliar', 'settings:manage'))

    const { data: datosAdministrador, error: errorAdministrador } = await clienteAdministrador
      .from('tenants')
      .update({ name: 'Tenant prueba tmatrix' })
      .eq('id', tenant.id)
      .select('id')
    expect(errorAdministrador).toBeNull()
    expect(datosAdministrador!.length > 0).toBe(hasPermission('administrador', 'settings:manage'))
  })

  it('audit:view — SELECT audit_log coincide para agent y auditor', async () => {
    // audit_membership_change (trigger) ya generó filas para este tenant al
    // crear las membresías en beforeAll — no hace falta una fixture aparte.
    const { data: datosAgent, error: errorAgent } = await clienteAgent
      .from('audit_log')
      .select('id')
      .eq('tenant_id', tenant.id)
    expect(errorAgent).toBeNull()
    expect(datosAgent!.length > 0).toBe(hasPermission('auxiliar', 'audit:view'))

    const { data: datosAuditor, error: errorAuditor } = await clienteAuditor
      .from('audit_log')
      .select('id')
      .eq('tenant_id', tenant.id)
    expect(errorAuditor).toBeNull()
    expect(datosAuditor!.length > 0).toBe(hasPermission('auditor', 'audit:view'))

    const { data: datosAdministrador, error: errorAdministrador } = await clienteAdministrador
      .from('audit_log')
      .select('id')
      .eq('tenant_id', tenant.id)
    expect(errorAdministrador).toBeNull()
    expect(datosAdministrador!.length > 0).toBe(hasPermission('administrador', 'audit:view'))
  })

  it('tenant:delete — DELETE tenants falla para los 3 roles (sin política, PROMPT_PERMISOS_CAPA2.md §1.6/§B2)', async () => {
    // Sin policy de DELETE en tenants (20260813190300: "Sin INSERT... ni
    // DELETE"), con FORCE RLS el resultado es 0 filas afectadas, no un error
    // 42501 — mismo comportamiento que UPDATE contra RLS sin fila que
    // satisfaga el USING implícito (false). Se prueba el efecto (el tenant
    // sigue existiendo), no el error, igual que el resto de este archivo.
    const { data: datosAgent, error: errorAgent } = await clienteAgent
      .from('tenants')
      .delete()
      .eq('id', tenant.id)
      .select('id')
    expect(errorAgent).toBeNull()
    expect(datosAgent).toEqual([])

    const { data: datosAuditor, error: errorAuditor } = await clienteAuditor
      .from('tenants')
      .delete()
      .eq('id', tenant.id)
      .select('id')
    expect(errorAuditor).toBeNull()
    expect(datosAuditor).toEqual([])

    const { data: datosAdministrador, error: errorAdministrador } = await clienteAdministrador
      .from('tenants')
      .delete()
      .eq('id', tenant.id)
      .select('id')
    expect(errorAdministrador).toBeNull()
    expect(datosAdministrador).toEqual([])

    // Los 3 roles tienen tenant:delete en ROLE_PERMISSIONS (permissions.ts),
    // pero la RLS real lo niega para los 3 — la matriz TS documenta una
    // capacidad que la base de datos no concede (§B2, decisión del usuario:
    // dejarlo así, documentado — no romper ni inventar una política nueva).
    const { data: sigueExistiendo, error: errorAdmin } = await admin
      .from('tenants')
      .select('id')
      .eq('id', tenant.id)
    expect(errorAdmin).toBeNull()
    expect(sigueExistiendo).toHaveLength(1)
  })
})
