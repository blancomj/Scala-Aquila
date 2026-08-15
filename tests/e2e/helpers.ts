/**
 * Helpers de fixtures para E2E — reexporta el mismo patrón que
 * tests/rls/helpers.ts (cliente admin, RUN_ID, crear/eliminar tenant y
 * usuario) en vez de duplicarlo. Playwright corre en un proceso Node
 * aparte de Vitest, pero el helper es TS puro sin dependencias de ninguno
 * de los dos frameworks — se puede compartir tal cual.
 */
export {
  clienteAdmin,
  clienteAnonimo,
  clienteComo,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type Cliente,
  type Entorno,
  type TenantPrueba,
  type UsuarioPrueba,
} from '../rls/helpers.js'

import type { Page } from '@playwright/test'
import type { Cliente } from '../rls/helpers.js'

/**
 * crearTenant() (tests/rls/helpers.ts) inserta directo en `tenants`, sin
 * pasar por la RPC create_tenant() — que es la única que fija
 * profiles.active_tenant_id. Sin este paso, el middleware `tenant.ts`
 * manda a /onboarding/create-tenant en vez de dejar pasar a /dashboard
 * (visto en corridas reales de esta suite).
 */
export async function fijarTenantActivo(
  admin: Cliente,
  usuarioId: string,
  tenantId: string,
): Promise<void> {
  const { error } = await admin
    .from('profiles')
    .update({ active_tenant_id: tenantId })
    .eq('id', usuarioId)
  if (error) throw new Error(`fijarTenantActivo: ${error.message}`)
}

/**
 * Login real por UI. Nuxt SSR entrega el HTML antes de que Vue termine de
 * hidratar — un click inmediato tras `goto('/login')` puede caer en el
 * <form> nativo del navegador (sin el @submit.prevent de Vue todavía
 * enganchado) y navegar por GET con los campos como query string. Bajo
 * carga (máquina de recursos modestos) esto se ha visto incluso después de
 * `waitForLoadState('networkidle')` — networkidle solo garantiza que la red
 * está quieta, no que Vue ya terminó de hidratar y enganchar
 * @submit.prevent. Sin una señal de hidratación propia en la app, se
 * detecta el fallback nativo por la URL resultante (query string con
 * `email=`) y se reintenta en vez de fallar.
 */
export async function loginUI(page: Page, email: string, password: string): Promise<void> {
  for (let intento = 0; intento < 3; intento++) {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña').fill(password)
    await page.getByRole('button', { name: 'Entrar' }).click()
    if (!page.url().includes('email=')) return
  }
  throw new Error(
    'loginUI: el formulario siguió navegando por GET nativo tras varios intentos (hidratación no enganchó a tiempo).',
  )
}
