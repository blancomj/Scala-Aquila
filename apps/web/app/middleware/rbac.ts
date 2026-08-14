/**
 * PROMPT_MAESTRO_FASE1.md §10.1 — tercer eslabón: "rbac → ¿permiso de la
 * ruta? no → 403". No es global (como `tenant.ts`): cada página que exige
 * un permiso concreto lo declara vía `definePageMeta({ permiso: '...',
 * middleware: ['tenant', 'rbac'] })`. Sin ese campo, no bloquea nada.
 *
 * El permiso se evalúa contra `tenantStore.role` (la membership de la
 * copropiedad ACTIVA — §7.1), usando la misma matriz de
 * `types/permissions.ts` que las políticas RLS espejan en SQL (T-MATRIX,
 * §12.2). Esta es una barrera de UX (§8.3 lo llama así explícitamente en
 * el diagrama de la cadena) — la barrera real es RLS.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const permisoRequerido = to.meta.permiso
  if (!permisoRequerido) return undefined

  const authStore = useAuthStore()
  await authStore.cargarPerfil()

  const tenantStore = useTenantStore()
  if (tenantStore.memberships.length === 0) {
    await tenantStore.cargarMemberships()
  }

  if (!tenantStore.puede(permisoRequerido)) {
    throw createError({ statusCode: 403, statusMessage: 'No autorizado' })
  }

  return undefined
})
