/**
 * Estado compartido del compositor de correo — conecta el acceso directo
 * del sidebar con el drawer del compositor.
 *
 * Usa useState de Nuxt (key = 'compositor-correo') para que el estado
 * persista entre navigaciones y esté sincronizado en SSR/cliente.
 */
export function useCompositorCorreo() {
  const abierto = useState('compositor-correo', () => false)
  /** Tercero a preseleccionar como destinatario la próxima vez que el drawer abra — lo consume
   * y limpia CompositorCorreoFlotante.vue apenas lo lee, para no reaplicarlo en aperturas
   * posteriores desde el acceso directo del sidebar. */
  const terceroPreseleccionado = useState<string | null>('compositor-correo-tercero', () => null)

  /** Abre el compositor con un tercero ya elegido como destinatario — usado desde listados
   * (ej. terceros/index.vue) donde el email de una fila actúa como acceso directo. */
  function abrirPara(terceroId: string): void {
    terceroPreseleccionado.value = terceroId
    abierto.value = true
  }

  return { abierto, terceroPreseleccionado, abrirPara }
}
