import type { NavGrupo, NavItem } from '~/utils/navegacion'
import { NAV_GRUPOS } from '~/utils/navegacion'

/**
 * Forma de `sidebar_config.configuracion` (ver la migración 20260937000000).
 * Solo reordena/reagrupa/renombra/oculta el catálogo fijo de `navegacion.ts`
 * — nunca contiene una ruta, ícono o permiso que no exista ya ahí. `etiquetas`
 * es un mapa ruta (`to`) -> nombre personalizado; una clave ausente o vacía
 * usa el `label` original del catálogo (equivale a "restablecer nombre").
 * `ocultos` son las rutas que el administrador apagó — siguen existiendo
 * para poder prenderlas de nuevo desde el editor, solo se ocultan del
 * sidebar real (NavSidebar.vue) y de la vista previa.
 */
export interface ConfiguracionMenu {
  grupos?: string[]
  items?: Record<string, string[]>
  etiquetas?: Record<string, string>
  ocultos?: string[]
}

export type NavItemPersonalizado = NavItem & { oculto: boolean }
export interface NavGrupoPersonalizado {
  titulo: string
  items: NavItemPersonalizado[]
}

/**
 * Aplica el orden personalizado de un tenant sobre el catálogo fijo de
 * grupos/ítems. Función pura (sin composables de Nuxt) para poder probarla
 * sin contexto de app — la usa `useMenuPersonalizado` con `NAV_GRUPOS` real.
 *
 * Grupos/ítems que la configuración no menciona se agregan al final, en su
 * posición original — así un ítem nuevo que agregue un corte futuro en
 * `navegacion.ts` aparece solo, sin requerir migrar esta tabla. Un ítem
 * puede moverse a un grupo distinto del suyo original (vía `items`), pero
 * su `permiso`/`modulo` siempre vienen del catálogo, nunca de acá.
 */
export function aplicarConfiguracionMenu(
  gruposBase: readonly NavGrupo[],
  configuracion: ConfiguracionMenu | null | undefined,
): NavGrupoPersonalizado[] {
  const ordenGrupos = configuracion?.grupos ?? []
  const itemsPorGrupo = configuracion?.items ?? {}
  const etiquetas = configuracion?.etiquetas ?? {}
  const ocultos = new Set(configuracion?.ocultos ?? [])

  function conPersonalizacion(item: NavItem): NavItemPersonalizado {
    const nombre = etiquetas[item.to]?.trim()
    return { ...item, label: nombre ? nombre : item.label, oculto: ocultos.has(item.to) }
  }

  const itemsPorRuta = new Map<string, NavItem>()
  for (const grupo of gruposBase) {
    for (const item of grupo.items) itemsPorRuta.set(item.to, item)
  }

  // Cualquier ruta que la configuración ya haya asignado a ALGÚN grupo queda
  // "reclamada" — no se repite como sobrante en su grupo original.
  const rutasAsignadas = new Set<string>()
  for (const rutas of Object.values(itemsPorGrupo)) {
    for (const ruta of rutas) if (itemsPorRuta.has(ruta)) rutasAsignadas.add(ruta)
  }

  const titulosBase = gruposBase.map((g) => g.titulo)
  const titulosOrdenados = [
    ...ordenGrupos.filter((t) => titulosBase.includes(t)),
    ...titulosBase.filter((t) => !ordenGrupos.includes(t)),
  ]
  // Sin duplicados aunque `ordenGrupos` traiga un título repetido.
  const titulosFinal = [...new Set(titulosOrdenados)]

  return titulosFinal.map((titulo) => {
    const grupoBase = gruposBase.find((g) => g.titulo === titulo)!
    const rutasConfiguradas = itemsPorGrupo[titulo] ?? []

    const itemsConfigurados = rutasConfiguradas
      .map((ruta) => itemsPorRuta.get(ruta))
      .filter((item): item is NavItem => item !== undefined)

    const itemsSobrantes = grupoBase.items.filter((item) => !rutasAsignadas.has(item.to))

    return {
      titulo,
      items: [...itemsConfigurados, ...itemsSobrantes].map(conPersonalizacion),
    }
  })
}

export function useMenuPersonalizado() {
  const sidebarConfigStore = useSidebarConfigStore()

  const gruposPersonalizados = computed(() =>
    aplicarConfiguracionMenu(NAV_GRUPOS, sidebarConfigStore.configuracion),
  )

  return { gruposPersonalizados }
}
