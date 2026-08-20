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
 * Cobertura parcial a propósito — solo permisos con una tabla/operación 1:1:
 *   - `users:read`    → SELECT memberships
 *   - `users:manage`  → UPDATE memberships
 *   - `data:read`     → SELECT tenants
 *   - `settings:manage` → UPDATE tenants
 *   - `audit:view`    → SELECT audit_log
 * Fuera de alcance (documentado, no inventado):
 *   - `users:invite`, `tenant:delete` → solo Edge Function / sin política de
 *     mutación implementada aún (create-tenant es la única Edge Function que
 *     existe hoy, D-19); no hay operación RLS que ejecutar.
 *   - `data:create/update/delete` → "data" no es una tabla única; se prueba
 *     por tabla de dominio en tests/rls/domain-isolation.test.ts (SEC-11).
 *   - `dashboard:view`, `metrics:view` → visibilidad de UI, no una operación
 *     de base de datos.
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
})
