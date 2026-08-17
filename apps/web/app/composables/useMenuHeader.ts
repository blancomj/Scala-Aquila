/** Coordina qué desplegable del header está abierto — evita que el
 * selector de copropiedad, la campana y el menú de usuario queden abiertos
 * a la vez (cada uno vivía con su propio ref local, sin coordinación). */
export function useMenuHeaderAbierto() {
  return useState<string | null>('menu-header-abierto', () => null)
}
