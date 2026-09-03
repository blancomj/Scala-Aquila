/**
 * PROMPT_MAESTRO_FASE1.md §10.1 — segundo eslabón: "tenant → ¿active_tenant_id?
 * no → /onboarding/create-tenant". A diferencia de `auth.global.ts`, este NO
 * es global: cada página protegida que requiera una copropiedad activa lo
 * declara vía `definePageMeta({ middleware: ['tenant'] })` (p. ej. dashboard),
 * dejando afuera rutas que solo necesitan sesión (la propia página de
 * onboarding, futuras rutas de invitación).
 *
 * Tercer eslabón (2026-09-04): si el usuario tiene más de una membresía y
 * todavía no confirmó con cuál va a trabajar EN ESTA SESIÓN DE LOGIN, lo
 * manda a /seleccionar-copropiedad antes de dejarlo seguir. La confirmación
 * se recuerda en una cookie de sesión (sin maxAge — el navegador la borra al
 * cerrarse), no en el store: así sobrevive a una recarga de página dentro de
 * la misma sesión sin volver a preguntar, pero un login nuevo (o el cierre
 * de sesión explícito, ver NavUsuarioMenu.vue/perfil.vue) vuelve a pedirla.
 * Con una sola membresía nunca se pregunta — se asume esa como predeterminada.
 *
 * BUG REAL corregido el mismo día (reportado en vivo, cuenta con membresías
 * de sobra y active_tenant_id en null): la versión anterior miraba
 * profiles.active_tenant_id ANTES que las membresías reales, así que
 * cualquier cuenta con active_tenant_id null — por ejemplo porque la
 * copropiedad que tenía como activa se borró (ON DELETE SET NULL) — caía en
 * "crea tu copropiedad" sin importar cuántas membresías le quedaran. El
 * orden correcto es: primero las membresías reales deciden si hace falta
 * onboarding; active_tenant_id es solo una preferencia de sesión que se
 * puede — y debe — reconstruir a partir de ellas.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // TODO lo que dependa del contexto de la app —stores, useCookie— se resuelve
  // ANTES del primer await. Tras un await se pierde ese contexto (unctx no lo
  // restaura solo), así que `useTenantStore()` caía al global `activePinia` de
  // Pinia: en un servidor caliente ese global sigue poblado por la petición
  // anterior y funciona por accidente, pero en la primera petición de un
  // servidor recién arrancado no está y el SSR reventaba con
  // «getActivePinia() was called but there was no active Pinia» — un 500 en
  // toda ruta autenticada que solo se veía en arranque en frío.
  //
  // Que funcionara "casi siempre" era precisamente el síntoma: ese global es
  // compartido entre peticiones concurrentes, que es lo que Pinia advierte.
  const authStore = useAuthStore()
  const tenantStore = useTenantStore()
  const copropiedadConfirmada = useCookie<boolean>('copropiedad-confirmada-sesion', {
    default: () => false,
  })

  const perfil = await authStore.cargarPerfil()

  // Misma key 'memberships' que layouts/default.vue — Nuxt deduplica
  // useAsyncData por key dentro de la misma request, así que esto no
  // dispara una segunda consulta si el layout ya la resolvió.
  await useAsyncData('memberships', () => tenantStore.cargarMemberships())

  // Sin ninguna membresía activa: recién nunca tuvo copropiedad, o la única
  // que tenía se borró junto con su membership. Ahí sí corresponde ofrecer
  // crear una — este es el ÚNICO caso legítimo de /onboarding/create-tenant.
  // Un administrador de plataforma sin ninguna copropiedad NO es alguien que
  // deba crear una: su trabajo está en la consola de plataforma, que no
  // requiere tenant (AD-09/SEC-10, plano de autorización aparte). Sin esto
  // caía en "crea tu copropiedad", justo lo que no es. Nunca se notó porque
  // las cuentas de plataforma que existen hoy son ADEMÁS miembros de alguna
  // copropiedad, así que el modelo nunca se ejerció con su usuario real.
  // /plataforma no declara este middleware, así que no hay bucle.
  if (tenantStore.memberships.length === 0 && perfil?.is_platform_admin) {
    return navigateTo('/plataforma')
  }

  if (tenantStore.memberships.length === 0) {
    return navigateTo('/onboarding/create-tenant')
  }

  // Exactamente una membresía pero sin active_tenant_id resuelto (cuenta
  // vieja, o la copropiedad que sí tenía como activa se borró y
  // profiles.active_tenant_id cayó a null). Se autoresuelve en silencio: "con
  // una sola no hay nada entre qué elegir" — misma regla que
  // NavTenantSwitcher.vue.
  if (tenantStore.memberships.length === 1 && !perfil?.active_tenant_id) {
    await tenantStore.cambiarTenant(tenantStore.memberships[0]!.tenant_id)
  }

  if (
    tenantStore.memberships.length > 1 &&
    !copropiedadConfirmada.value &&
    to.path !== '/seleccionar-copropiedad'
  ) {
    return navigateTo({ path: '/seleccionar-copropiedad', query: { redirect: to.fullPath } })
  }

  return undefined
})
