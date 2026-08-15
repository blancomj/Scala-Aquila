// PROMPT_MAESTRO_FASE1.md §9.4, §12.1 — switch de copropiedad activa, por
// UI real (el <select> nativo de apps/web/app/layouts/default.vue).
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

test('cambio de copropiedad: el selector actualiza el tenant activo y el dashboard lo refleja', async ({
  page,
}) => {
  const admin = clienteAdmin(env!)
  let usuario: UsuarioPrueba | undefined
  let tenantA: TenantPrueba | undefined
  let tenantB: TenantPrueba | undefined

  try {
    usuario = await crearUsuario(admin, 'e2e-switch')
    tenantA = await crearTenant(admin, 'e2e-switch-a', usuario.id)
    tenantB = await crearTenant(admin, 'e2e-switch-b', usuario.id)
    await crearMembership(admin, tenantA.id, usuario.id, 'agent')
    await crearMembership(admin, tenantB.id, usuario.id, 'agent')
    await fijarTenantActivo(admin, usuario.id, tenantA.id)

    await loginUI(page, usuario.email, usuario.password)
    await expect(page).toHaveURL(/\/dashboard/)

    // getByText simple choca con <option> del <select> (mismo texto) —
    // se acota al párrafo "Copropiedad activa: ..." (strict mode violation
    // visto en corridas reales).
    await expect(page.getByText('Copropiedad activa:', { exact: false })).toContainText('e2e-switch-a')

    const selector = page.locator('header select')
    await selector.selectOption({ value: tenantB.id })

    await expect(page.getByText('Copropiedad activa:', { exact: false })).toContainText('e2e-switch-b', {
      timeout: 10_000,
    })

    const { data: perfil } = await admin.from('profiles').select('active_tenant_id').eq('id', usuario.id).single()
    expect(perfil?.active_tenant_id).toBe(tenantB.id)
  } finally {
    if (tenantA) await eliminarTenant(admin, tenantA.id)
    if (tenantB) await eliminarTenant(admin, tenantB.id)
    if (usuario) await eliminarUsuario(admin, usuario.id)
  }
})
