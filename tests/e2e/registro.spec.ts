// PROMPT_MAESTRO_FASE1.md §9.1, §12.1 — registro público real por UI.
// GAP-11 (§15.2): el registro directo mantiene la confirmación de email
// estándar de Supabase, así que signUp() no entrega sesión de inmediato —
// la página muestra "Revisa tu correo", no redirige a /dashboard.
// Nota: signUp() dispara un correo de confirmación real (mismo enfoque que
// el envío real por Brevo en invitacion.spec.ts) — Supabase Auth tiene su
// propio límite de envío (independiente de nuestro rate limiting), así que
// corridas repetidas de este spec en pocos minutos pueden fallar con "email
// rate limit exceeded". No es un fallo del código, es cuota de correo.
import { expect, test } from '@playwright/test'
import type { User } from '@supabase/supabase-js'
import { clienteAdmin, leerEntorno, RUN_ID } from './helpers.js'

const env = leerEntorno()
test.skip(!env, 'faltan variables de Supabase en .env')

test('registro público: crea la cuenta y pide confirmar el correo', async ({ page }) => {
  const admin = clienteAdmin(env!)
  // signUp() público (a diferencia de admin.auth.admin.createUser(), usado en
  // el resto de la suite) valida el dominio del correo y rechaza `@example.test`
  // como inválido — se usa un alias real con `+` sobre un dominio que sí acepta.
  const email = `blancomj5+e2e-registro-${RUN_ID}@gmail.com`
  const password = 'PruebaE2E!2026'

  await page.goto('/register')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Nombre completo').fill('Usuaria E2E')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()

  await expect(page.getByText('Revisa tu correo')).toBeVisible()

  const { data: lista } = await admin.auth.admin.listUsers()
  const creado = lista.users.find((u: User) => u.email === email)
  expect(creado).toBeDefined()
  if (creado) await admin.auth.admin.deleteUser(creado.id)
})
