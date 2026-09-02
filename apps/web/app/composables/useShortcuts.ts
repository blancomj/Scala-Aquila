/**
 * Accesos directos del sidebar — lógica de negocio.
 *
 * Filtra shortcuts por permisos del usuario actual, valida límite máximo
 * (6 por tenant), y delega persistencia a authStore.actualizarShortcuts().
 */
import type { Shortcut } from '~/stores/auth'
import { NAV_GRUPOS, NAV_INICIO, NAV_COPROPIEDADES, type NavItem } from '~/utils/navegacion'

const MAX_SHORTCUTS = 5

/** Lista plana de todos los NavItems del sidebar (para busqueda de permisos). */
function todosLosItems(): NavItem[] {
  const items: NavItem[] = [NAV_INICIO, NAV_COPROPIEDADES]
  for (const grupo of NAV_GRUPOS) {
    items.push(...grupo.items)
  }
  return items
}

export function useShortcuts() {
  const authStore = useAuthStore()
  const tenantStore = useTenantStore()

  /** Shortcuts del usuario, ordenados. */
  const shortcuts = computed<Shortcut[]>(() =>
    [...authStore.shortcuts].sort((a, b) => a.orden - b.orden),
  )

  /** Rutas que ya tiene como shortcut (para excluir del selector). */
  const shortcutsActivos = computed(() => new Set(shortcuts.value.map((s) => s.to)))

  /** Items disponibles para agregar (que el usuario puede ver y no tiene ya). */
  const itemsDisponibles = computed(() =>
    todosLosItems()
      .filter((item) => {
        if (shortcutsActivos.value.has(item.to)) return false
        if (item.permiso && !tenantStore.puede(item.permiso)) return false
        if (item.modulo && !tenantStore.puedeVerModulo(item.modulo)) return false
        return true
      })
      .map((item) => ({
        to: item.to,
        label: item.label,
        icono: item.icono,
      })),
  )

  /** Puede agregar más shortcuts. */
  const puedeAgregar = computed(() => shortcuts.value.length < MAX_SHORTCUTS)

  /** Icono como path SVG a partir del shortcut. */
  function iconoPath(icono: string): string {
    return icono
  }

  /** Agrega un shortcut al final de la lista. */
  async function agregar(item: { to: string; label: string; icono: string }): Promise<void> {
    if (!puedeAgregar.value) throw new Error(`Máximo ${MAX_SHORTCUTS} accesos directos.`)
    if (shortcutsActivos.value.has(item.to)) return

    const nuevo: Shortcut = {
      to: item.to,
      label: item.label,
      icono: item.icono,
      orden: shortcuts.value.length,
    }
    await authStore.actualizarShortcuts([...shortcuts.value, nuevo])
  }

  /** Elimina un shortcut por ruta. */
  async function eliminar(to: string): Promise<void> {
    const filtrados = shortcuts.value.filter((s) => s.to !== to)
    const reordenados = filtrados.map((s, i) => ({ ...s, orden: i }))
    await authStore.actualizarShortcuts(reordenados)
  }

  /** Mueve un shortcut una posición arriba o abajo. */
  async function mover(to: string, direccion: 'arriba' | 'abajo'): Promise<void> {
    const items = [...shortcuts.value].sort((a, b) => a.orden - b.orden)
    const idx = items.findIndex((s) => s.to === to)
    if (idx < 0) return

    const destino = direccion === 'arriba' ? idx - 1 : idx + 1
    if (destino < 0 || destino >= items.length) return

    const tmp = items[idx]!.orden
    items[idx]!.orden = items[destino]!.orden
    items[destino]!.orden = tmp

    await authStore.actualizarShortcuts(items)
  }

  return {
    shortcuts,
    shortcutsActivos,
    itemsDisponibles,
    puedeAgregar,
    iconoPath,
    agregar,
    eliminar,
    mover,
    MAX_SHORTCUTS,
  }
}
