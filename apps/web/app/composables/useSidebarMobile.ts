/**
 * Estado compartido del drawer del sidebar en mobile (abierto/cerrado) —
 * independiente del colapso icon-only de escritorio (cookie
 * sidebar-colapsado, ver NavSidebar.vue). `useState`, no `useCookie`: un
 * drawer que reapareciera abierto al recargar la página sería peor que uno
 * que siempre arranca cerrado.
 */
export function useSidebarMobile(): Ref<boolean> {
  return useState<boolean>('sidebar-mobile-abierto', () => false)
}
