import type { Permission } from './permissions'

export {}

declare module '#app' {
  interface PageMeta {
    /** Rutas exentas del middleware auth.global (PLAN §10.1) — login, registro, la raíz. */
    publico?: boolean
    /**
     * Permiso requerido por la ruta — lo evalúa el middleware `rbac` contra
     * `tenantStore.role` (PLAN §10.1, tercer eslabón). Sin este campo, `rbac`
     * no bloquea nada (todavía no hay páginas reales de dominio que lo
     * necesiten — E4 v0 construye el mecanismo, las páginas futuras lo usan).
     */
    permiso?: Permission
  }
}
