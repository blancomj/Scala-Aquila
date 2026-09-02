/**
 * Catálogo de íconos disponibles para accesos directos del sidebar.
 * Reutiliza los paths SVG de NAV_ICONOS — el usuario elige entre los
 * mismos íconos que ya aparecen en la navegación.
 */

export interface ShortcutIcono {
  clave: string
  label: string
  path: string
}

export const SHORTCUT_ICONOS: ShortcutIcono[] = [
  { clave: 'inicio', label: 'Inicio', path: 'M4 11.5 12 4l8 7.5M6 10v9h12v-9' },
  { clave: 'inmuebles', label: 'Inmuebles', path: 'M4 3h16v18H4zM8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2' },
  { clave: 'terceros', label: 'Terceros', path: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c1.2-3.5 4-5 7-5s5.8 1.5 7 5' },
  { clave: 'resumenCuenta', label: 'Resumen de cuenta', path: 'M4 6h16M4 12h16M4 18h10' },
  { clave: 'pagos', label: 'Pagos', path: 'M3 6h18v12H3zM3 10h18M7 15h3' },
  { clave: 'novedades', label: 'Novedades', path: 'M12 9v4m0 4h.01M10.3 3.86 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.86a2 2 0 0 0-3.4 0Z' },
  { clave: 'presupuesto', label: 'Presupuesto', path: 'M12 3v18M17 7.5c0-1.7-2.2-3-5-3s-5 1.3-5 3 2.2 3 5 3 5 1.3 5 3-2.2 3-5 3-5-1.3-5-3' },
  { clave: 'conceptos', label: 'Conceptos', path: 'M20.6 13.4 13 21a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1 0-2.8L10.8 3.6A2 2 0 0 1 12.2 3H19a2 2 0 0 1 2 2v6.8a2 2 0 0 1-.6 1.4ZM7.5 8a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Z' },
  { clave: 'liquidacion', label: 'Liquidación', path: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  { clave: 'contabilidad', label: 'Contabilidad', path: 'M12 3v18M7 21h10M3 8h18M6 8l-3 6a3 3 0 0 0 6 0L6 8Zm12 0-3 6a3 3 0 0 0 6 0l-3-6Z' },
  { clave: 'coeficientes', label: 'Coeficientes', path: 'M5 19 19 5M7 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z' },
  { clave: 'seguridad', label: 'Seguridad', path: 'M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3ZM9 12l2 2 4-4.5' },
  { clave: 'configuracion', label: 'Configuración', path: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z' },
  { clave: 'usuarios', label: 'Usuarios', path: 'M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c1-3.3 3.4-5 6.5-5s5.5 1.7 6.5 5M16 8a3 3 0 1 1 0 6M17.5 14.5c2.3.4 3.9 1.8 4.5 4.5' },
  { clave: 'auditoria', label: 'Auditoría', path: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.3-4.3' },
  { clave: 'carteraDashboard', label: 'Dashboard de cartera', path: 'M4 19V9M10 19V5M16 19v-7M4 19h16' },
]

export function obtenerIconoShortcut(clave: string): string | undefined {
  return SHORTCUT_ICONOS.find((i) => i.clave === clave)?.path
}
