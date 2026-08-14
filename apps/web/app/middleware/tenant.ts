/**
 * PROMPT_MAESTRO_FASE1.md §10.1 — segundo eslabón: "tenant → ¿active_tenant_id?
 * no → /onboarding/create-tenant". A diferencia de `auth.global.ts`, este NO
 * es global: cada página protegida que requiera una copropiedad activa lo
 * declara vía `definePageMeta({ middleware: ['tenant'] })` (p. ej. dashboard),
 * dejando afuera rutas que solo necesitan sesión (la propia página de
 * onboarding, futuras rutas de invitación).
 */
export default defineNuxtRouteMiddleware(async () => {
  const authStore = useAuthStore()
  const perfil = await authStore.cargarPerfil()

  if (!perfil?.active_tenant_id) {
    return navigateTo('/onboarding/create-tenant')
  }

  return undefined
})
