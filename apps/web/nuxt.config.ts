// PROMPT_MAESTRO_FASE1.md §4.1 · D-15 (Nuxt 4 en vez de Nuxt 3)

// E7 · headers de seguridad. Se lee SUPABASE_URL en tiempo de config (no
// runtimeConfig.public: los headers de routeRules son estáticos, se fijan
// al construir) para que connect-src apunte al proyecto real sin
// hardcodear el dominio.
const supabaseHttp = process.env.SUPABASE_URL ?? ''
const supabaseWs = supabaseHttp.replace(/^http/, 'ws')
const esDev = process.env.NODE_ENV !== 'production'

const csp = [
  "default-src 'self'",
  `connect-src 'self' ${supabaseHttp} ${supabaseWs}${esDev ? ' ws://localhost:* http://localhost:*' : ''}`,
  // 'unsafe-inline' en script-src: Nuxt SSR inyecta el payload de hidratación
  // como <script> inline sin nonce — sin esto la app no hidrata. Nuxt no
  // ofrece nonces por defecto (requeriría el módulo nuxt-security, fuera de
  // alcance aquí); el resto de la CSP (connect/frame/object/base-uri) sigue
  // cerrado. Limitación conocida, no un descuido.
  `script-src 'self' 'unsafe-inline'${esDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ')

export default defineNuxtConfig({
  compatibilityDate: '2026-08-14',
  devtools: { enabled: true },

  // AD-10: runtime Node confirmado (Hostinger VPS/Cloud), SSR completo.
  ssr: true,
  nitro: {
    preset: 'node-server',
    routeRules: {
      '/**': {
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          'Content-Security-Policy': csp,
        },
      },
    },
  },

  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxtjs/supabase', '@nuxt/eslint'],

  // D-16: @nuxtjs/supabase resuelve la sincronía de sesión servidor/cliente
  // (cookies) que SSR + rutas protegidas necesitan. `redirect: false` porque
  // el middleware propio (10.1) implementa la cadena exacta del plan
  // (auth.global → tenant → rbac → platform), no la del módulo.
  supabase: {
    redirect: false,
  },

  css: ['~/assets/css/main.css', '~/assets/css/ficha-inmueble.css'],

  typescript: {
    strict: true,
    typeCheck: false, // `nuxt typecheck` se corre aparte (pnpm -r typecheck); no duplicar en cada build.
  },

  // SEC-02 (Fase I §6.3, §17): solo lo que empieza por NUXT_PUBLIC_ o es la
  // anon key llega al navegador. La service_role key NUNCA vive aquí.
  runtimeConfig: {
    public: {
      supabaseUrl: '',
      supabaseAnonKey: '',
      appUrl: 'http://localhost:3000',
      appName: 'Aquila PH',
    },
  },
})
