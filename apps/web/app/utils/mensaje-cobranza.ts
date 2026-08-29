/**
 * Cómo se muestra en pantalla lo que se envió a un deudor (CAR §34.3).
 *
 * En SMS `contenido_renderizado` es el texto tal cual. En correo es el HTML
 * íntegro — eso es lo que se envió y por tanto lo que se guarda como
 * prueba, pero pintarlo crudo no es una opción: ese HTML sale de la base
 * de datos (la plantilla la edita quien administra), así que `v-html` lo
 * ejecutaría dentro de la sesión de quien lo está revisando. Y el
 * expediente se imprime: un iframe no imprime de forma fiable.
 *
 * Se muestra entonces el texto derivado, que conserva todo lo que dice el
 * correo y pierde solo el maquetado. La evidencia sigue siendo el HTML
 * guardado.
 */
import { htmlATextoPlano } from '@aquila/shared'

export function textoLegible(canal: string, contenido: string): string {
  return canal === 'email' ? htmlATextoPlano(contenido) : contenido
}

/**
 * Canales que el sistema despacha solo. El resto de `canal_cobranza_t`
 * —teléfono, físico, interno— es gestión humana: la acción se crea y se
 * programa igual, pero la cierra una persona.
 *
 * Vive aquí y no en cada pantalla porque es la MISMA lista que decide qué
 * incluye una corrida por lotes (cartera-ejecutar-lote) y qué acepta el
 * worker (despacho_cobranza.ts). Si la configuración anuncia despacho
 * automático de un canal que el worker no despacha, la corrida lo omite en
 * silencio y quien administra cree que notificó.
 */
export const CANALES_AUTOMATICOS: ReadonlySet<string> = new Set(['sms', 'email'])

export const ETIQUETA_CANAL: Record<string, string> = {
  email: 'Correo',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  telefono: 'Teléfono',
  fisico: 'Físico',
  interno: 'Interno',
}
