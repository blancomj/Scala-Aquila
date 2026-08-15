// PROMPT_MAESTRO_FASE1.md §9.2, §12.1 — invitación completa, en dos partes:
// (a) emisión real por UI, que dispara Brevo de verdad (aprobado — no hay
//     bandeja de prueba en este entorno, así que solo se verifica que la
//     Edge Function responda 200 y la invitación quede "pendiente", nunca
//     se lee el correo recibido);
// (b) aceptación real por UI de una invitación SEMBRADA con token conocido
//     (mismo patrón que tests/invitations/invitations.test.ts) — así se
//     ejercita accept-invitation de punta a punta sin depender de (a).
import { createHash, randomUUID } from 'node:crypto'
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
  RUN_ID,
} from './helpers.js'

const env = leerEntorno()
test.skip(!env, 'faltan variables de Supabase en .env')

const CORREO_INVITACION_REAL = process.env.E2E_INVITE_EMAIL ?? 'blancomj5@gmail.com'

test.describe('invitación completa', () => {
  test('(a) un agent invita por UI — Brevo real, la invitación queda pendiente', async ({ page }) => {
    const admin = clienteAdmin(env!)
    const agente = await crearUsuario(admin, 'e2e-inv-agent')
    const tenant = await crearTenant(admin, 'e2e-inv', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'agent')
    await fijarTenantActivo(admin, agente.id, tenant.id)

    try {
      await loginUI(page, agente.email, agente.password)
      await expect(page).toHaveURL(/\/dashboard/)

      await page.goto('/usuarios')
      await page.waitForLoadState('networkidle')
      await page.getByLabel('Correo electrónico').fill(CORREO_INVITACION_REAL)
      await page.getByRole('button', { name: 'Invitar' }).click()

      await expect(page.getByText(`Invitación enviada a ${CORREO_INVITACION_REAL}.`)).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByText(CORREO_INVITACION_REAL, { exact: false }).last()).toBeVisible()
    } finally {
      await eliminarTenant(admin, tenant.id)
      await eliminarUsuario(admin, agente.id)
    }
  })

  test('(b) invitación sembrada con token conocido se acepta por UI real', async ({ page }) => {
    const admin = clienteAdmin(env!)
    const agente = await crearUsuario(admin, 'e2e-inv-b-agent')
    const tenant = await crearTenant(admin, 'e2e-inv-b', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'agent')
    await fijarTenantActivo(admin, agente.id, tenant.id)

    const emailInvitado = `e2e-invitado-${RUN_ID}@example.test`
    const invitado = await crearUsuario(admin, 'e2e-inv-b-invitado')
    // crearUsuario genera un correo propio (rls-...) — se sobrescribe al de
    // la invitación para que accept_invitation no rechace por email mismatch.
    // profiles.email es un espejo de auth.users.email fijado solo al crear
    // el usuario (trigger on_auth_user_created) — no hay trigger que lo
    // resincronice en un cambio posterior, así que se actualiza a mano con
    // el cliente admin (guard_privileged_columns solo bloquea cuando
    // auth.uid() no es null, no en contexto service_role).
    await admin.auth.admin.updateUserById(invitado.id, { email: emailInvitado, email_confirm: true })
    await admin.from('profiles').update({ email: emailInvitado }).eq('id', invitado.id)

    const token = randomUUID().replace(/-/g, '')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

    const { error: errorInvitacion } = await admin.from('invitations').insert({
      tenant_id: tenant.id,
      email: emailInvitado,
      role: 'auditor',
      token_hash: tokenHash,
      expires_at: expiresAt,
      invited_by: agente.id,
    })
    expect(errorInvitacion).toBeNull()

    try {
      await loginUI(page, emailInvitado, invitado.password)
      // El invitado aún no tiene membership ni active_tenant_id antes de
      // aceptar — el middleware lo manda a /onboarding/create-tenant, no a
      // /dashboard (a diferencia de otros specs que sí preseeed un tenant).
      await expect(page).not.toHaveURL(/\/login/)

      await page.goto(`/invite?token=${token}`)
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

      const { data: membresia } = await admin
        .from('memberships')
        .select('role, status')
        .eq('tenant_id', tenant.id)
        .eq('user_id', invitado.id)
        .single()
      expect(membresia?.role).toBe('auditor')
      expect(membresia?.status).toBe('active')
    } finally {
      await eliminarTenant(admin, tenant.id)
      await eliminarUsuario(admin, agente.id)
      await eliminarUsuario(admin, invitado.id)
    }
  })
})
