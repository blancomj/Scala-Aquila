export {}

declare module '#app' {
  interface PageMeta {
    /** Rutas exentas del middleware auth.global (PLAN §10.1) — login, registro, la raíz. */
    publico?: boolean
  }
}
