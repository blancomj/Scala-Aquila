/**
 * Estado compartido del compositor de correo — conecta el acceso directo
 * del sidebar con el drawer del compositor.
 *
 * Usa useState de Nuxt (key = 'compositor-correo') para que el estado
 * persista entre navigaciones y esté sincronizado en SSR/cliente.
 */
export function useCompositorCorreo() {
  const abierto = useState('compositor-correo', () => false)
  return { abierto }
}
