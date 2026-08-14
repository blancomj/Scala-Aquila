// PROMPT_MAESTRO_FASE1.md §4.1 · D-15 (Nuxt 4 en vez de Nuxt 3)
export default defineNuxtConfig({
  compatibilityDate: '2026-08-14',
  devtools: { enabled: true },

  // AD-10: runtime Node confirmado (Hostinger VPS/Cloud), SSR completo.
  ssr: true,
  nitro: {
    preset: 'node-server',
  },

  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxtjs/supabase', '@nuxt/eslint'],

  // D-16: @nuxtjs/supabase resuelve la sincronía de sesión servidor/cliente
  // (cookies) que SSR + rutas protegidas necesitan. `redirect: false` porque
  // el middleware propio (10.1) implementa la cadena exacta del plan
  // (auth.global → tenant → rbac → platform), no la del módulo.
  supabase: {
    redirect: false,
  },

  css: ['~/assets/css/main.css'],

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
