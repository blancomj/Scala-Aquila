/**
 * PROMPT_MAESTRO_FASE1.md §10.1 — primer eslabón de la cadena:
 * "auth.global → ¿sesión válida? no → /login?redirect=…"
 *
 * Solo esto por ahora (F6, primera rebanada E0+E2): `tenant`/`rbac`/
 * `platform` llegan cuando E3 (tenancy) y E4 (autorización) existan.
 */
export default defineNuxtRouteMiddleware((to) => {
  const usuario = useSupabaseUser()
  const esPublica = to.meta.publico === true

  if (!esPublica && !usuario.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }

  if (esPublica && usuario.value && (to.path === '/login' || to.path === '/register')) {
    return navigateTo('/dashboard')
  }

  return undefined
})
