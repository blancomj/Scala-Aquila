/**
 * PROMPT_MAESTRO_FASE1.md §10.1 — cuarto eslabón: "platform → ¿is_platform_admin?
 * no → 404 (solo rutas (platform)/)". No es global: solo las páginas de la
 * consola de plataforma lo declaran vía `definePageMeta({ middleware: ['platform'] })`.
 *
 * 404, no 403 (a propósito, §10.1): una copropiedad no debe poder inferir
 * siquiera que la consola de plataforma existe.
 *
 * AD-09/SEC-10: is_platform_admin es un plano de autorización totalmente
 * separado del rol de tenant — no depende de `tenant.ts` ni de `rbac.ts`,
 * y de hecho normalmente NO llevará esos middlewares en la misma ruta.
 */
export default defineNuxtRouteMiddleware(async () => {
  const authStore = useAuthStore()
  const perfil = await authStore.cargarPerfil()

  if (!perfil?.is_platform_admin) {
    throw createError({ statusCode: 404, statusMessage: 'Página no encontrada' })
  }

  return undefined
})
