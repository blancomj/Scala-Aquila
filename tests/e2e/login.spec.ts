// PROMPT_MAESTRO_FASE1.md §12.1 — login real por UI, usuario preseed.
import { expect, test } from '@playwright/test'
import {
  clienteAdmin,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  fijarTenantActivo,
  leerEntorno,
  loginUI,
  type TenantPrueba,
  type UsuarioPrueba,
} from './helpers.js'

const env = leerEntorno()
test.skip(!env, 'faltan variables de Supabase en .env')

test('login: usuario existente entra y llega a /dashboard', async ({ page }) => {
  const admin = clienteAdmin(env!)
  let usuario: UsuarioPrueba | undefined
  let tenant: TenantPrueba | undefined

  try {
    usuario = await crearUsuario(admin, 'e2e-login')
    tenant = await crearTenant(admin, 'e2e-login', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'agent')
    await fijarTenantActivo(admin, usuario.id, tenant.id)

    await loginUI(page, usuario.email, usuario.password)

    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByText(usuario.email)).toBeVisible()
  } finally {
    // tenants.created_by → profiles(id) sin ON DELETE: el tenant se borra
    // antes que el usuario (mismo orden que tests/tenancy/create-tenant.test.ts).
    if (tenant) await eliminarTenant(admin, tenant.id)
    if (usuario) await eliminarUsuario(admin, usuario.id)
  }
})
