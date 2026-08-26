// Genera un magic link de Supabase Auth para entrar al preview sin escribir
// contraseña en ningún formulario — usa la service_role key (SOLO dev,
// proyecto hwjmlyzzvpmhadldavbq, D-25) para pedirle a la Admin API un link
// de un solo uso para un usuario ya existente. No crea, no lee ni maneja
// ninguna contraseña en texto plano en ningún momento.
//
// Uso: pnpm dev:login [email] — sin argumento usa el correo por defecto de
// abajo. Siempre contra dev (.env, D-25) — nunca tiene sentido contra prod.
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env' })

const EMAIL_POR_DEFECTO = 'blancomj@gmail.com'

const email = process.argv[2] ?? EMAIL_POR_DEFECTO
const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env')
  process.exit(1)
}

// global.fetch: la implementación de fetch que trae @supabase/supabase-js
// por defecto falla con "fetch failed" en Node 24 / Windows; el fetch nativo
// de Node sí conecta sin problema (confirmado con un POST directo).
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch },
})

const { data, error } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email,
})

if (error) {
  console.error(`No se pudo generar el link para ${email}: ${error.message}`)
  process.exit(1)
}

// El action_link apunta a <SUPABASE_URL>/auth/v1/verify — GoTrue responde con un 303 a
// redirect_to (localhost:3000) con los tokens en el fragmento (#access_token=...). El propio
// <SUPABASE_URL>/auth/v1/verify normalmente no es navegable desde el Browser pane (política de
// dominios externos) ni el fragmento se detecta solo en la SPA (@nuxtjs/supabase v1 espera PKCE
// con ?code=, no el flujo implícito clásico) — por eso se resuelve el redirect aquí (server-side,
// sin pasar por el navegador) y se entregan los tokens por query string a /dev-login, que los
// pasa al mismo cliente Supabase de la app vía setSession().
const respuestaVerify = await fetch(data.properties.action_link, { redirect: 'manual' })
const location = respuestaVerify.headers.get('location')
if (!location) {
  console.error('El link de verificación no devolvió un redirect con los tokens.')
  process.exit(1)
}

const tokens = new URLSearchParams(new URL(location).hash.slice(1))
const accessToken = tokens.get('access_token')
const refreshToken = tokens.get('refresh_token')
if (!accessToken || !refreshToken) {
  console.error('El redirect no traía access_token/refresh_token.')
  process.exit(1)
}

const appUrl = process.env.NUXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
console.log(`${appUrl}/dev-login?access_token=${accessToken}&refresh_token=${refreshToken}`)
