/**
 * Regresión de seguridad — `fn_instalar_plan_contable` (wrapper autorizado de
 * `fn_instanciar_plan_contable`, PC-2, migración `20260935180000`).
 *
 * `20260932550000` le revocó EXECUTE a `fn_instanciar_plan_contable` (y sus 6 hermanas
 * `fn_instanciar_*`) de `public`/`anon`/`authenticated`: son aprovisionamiento interno de
 * `create_tenant()`, sin chequeo propio de que `auth.uid()` pertenezca al `p_tenant_id`
 * recibido. Ese revoke rompió en silencio el único consumidor legítimo desde el navegador
 * (`apps/web/app/pages/contabilidad/plan-de-cuentas.vue` vía
 * `contabilidad.ts::instanciarPlan()`), que la invocaba directo — confirmado roto en
 * producción (hwjmlyzzvpmhadldavbq): `authenticated` no tenía EXECUTE.
 *
 * Esta suite cubre las dos caras para que no se rompa en silencio otra vez:
 *  1. El flujo real (auxiliar instalando el plan de SU PROPIA copropiedad) sigue funcionando.
 *  2. El hueco que motivó el revoke original sigue cerrado (rol insuficiente, o tenant ajeno).
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  type TenantPrueba,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/contabilidad/plan-de-cuentas-instalacion: faltan variables de Supabase en .env')
}

d('PC-2: fn_instalar_plan_contable (wrapper autorizado)', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function tenantVacio(etiqueta: string): Promise<TenantPrueba> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    return tenant
  }

  async function contarCuentas(tenantId: string): Promise<number> {
    const { count, error } = await admin
      .from('contable_cuenta')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
    if (error) throw error
    return count ?? 0
  }

  it('un auxiliar instala el plan de cuentas de SU PROPIA copropiedad', async () => {
    const tenant = await tenantVacio('instalar-ok')
    const usuario = await crearUsuario(admin, 'auxiliar-ok')
    usuariosCreados.push(usuario)
    await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')
    const cliente = await clienteComo(env!, usuario)

    const { data, error } = await cliente
      .rpc('fn_instalar_plan_contable', { p_tenant_id: tenant.id })
      .single<{ creadas: number; existentes: number }>()

    expect(error).toBeNull()
    expect(data!.creadas).toBeGreaterThan(0)
    expect(await contarCuentas(tenant.id)).toBe(data!.creadas)
  })

  it('un auditor (solo lectura) NO puede instalar el plan', async () => {
    const tenant = await tenantVacio('instalar-auditor')
    const usuario = await crearUsuario(admin, 'auditor-no')
    usuariosCreados.push(usuario)
    await crearMembership(admin, tenant.id, usuario.id, 'auditor')
    const cliente = await clienteComo(env!, usuario)

    const { error } = await cliente.rpc('fn_instalar_plan_contable', { p_tenant_id: tenant.id })

    expect(error).not.toBeNull()
    expect(error!.message).toContain('PLAN_CONTABLE_NO_AUTORIZADO')
    expect(await contarCuentas(tenant.id)).toBe(0)
  })

  it('un miembro de OTRA copropiedad no puede instalar el plan pasando el tenant_id ajeno', async () => {
    const tenantAjeno = await tenantVacio('instalar-ajeno-victima')
    const tenantPropio = await tenantVacio('instalar-ajeno-atacante')
    const usuario = await crearUsuario(admin, 'ajeno-atacante')
    usuariosCreados.push(usuario)
    // Administrador de SU tenant — rol más fuerte posible, y aun así no alcanza para el ajeno.
    await crearMembership(admin, tenantPropio.id, usuario.id, 'administrador')
    const cliente = await clienteComo(env!, usuario)

    const { error } = await cliente.rpc('fn_instalar_plan_contable', { p_tenant_id: tenantAjeno.id })

    expect(error).not.toBeNull()
    expect(error!.message).toContain('PLAN_CONTABLE_NO_AUTORIZADO')
    expect(await contarCuentas(tenantAjeno.id)).toBe(0)
  })

  it('fn_instanciar_plan_contable (sin wrapper) sigue sin EXECUTE para authenticated (20260932550000)', async () => {
    const tenant = await tenantVacio('instanciar-directo-bloqueado')
    const usuario = await crearUsuario(admin, 'directo-bloqueado')
    usuariosCreados.push(usuario)
    await crearMembership(admin, tenant.id, usuario.id, 'administrador')
    const cliente = await clienteComo(env!, usuario)

    const { error } = await cliente.rpc('fn_instanciar_plan_contable', { p_tenant_id: tenant.id })

    expect(error).not.toBeNull()
    // PostgREST expone el 42501 de Postgres como este código propio.
    expect(error!.code).toBe('42501')
  })
})
