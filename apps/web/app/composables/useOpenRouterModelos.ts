/**
 * Catálogo EN VIVO de modelos de OpenRouter — a diferencia de los otros 3
 * proveedores (lista corta, curada a mano en @aquila/ai-providers), el valor
 * de OpenRouter es justo que expone cientos de modelos de decenas de
 * proveedores reales; una lista estática de 3 ejemplos se queda corta y
 * confunde (reportado por el usuario, 2026-09-13).
 *
 * Pide `/api/openrouter-modelos` (ruta propia de Nitro, server/api/), NO
 * `https://openrouter.ai/api/v1/models` directo — el CSP de la app
 * (`connect-src 'self' <supabase>`, nuxt.config.ts) bloquea cualquier fetch
 * del navegador a un dominio externo a propósito. El fetch real a OpenRouter
 * ocurre del lado del servidor, donde el CSP del navegador no aplica.
 *
 * Estado a nivel de módulo (no de instancia de componente): el catálogo es
 * el mismo para cualquier copropiedad, se pide una sola vez por sesión de
 * navegador aunque el usuario entre y salga de la pantalla varias veces —
 * la ruta del servidor además cachea 1h, así que ni siquiera cada sesión
 * nueva vuelve a golpear a OpenRouter.
 */
export interface ModeloOpenRouter {
  readonly id: string
  readonly nombre: string
}

const modelos = ref<ModeloOpenRouter[]>([])
const cargando = ref(false)
const error = ref<string | null>(null)
let yaCargado = false

interface RespuestaOpenRouter {
  data?: { id: string; name?: string }[]
}

export function useOpenRouterModelos(): {
  modelos: Ref<ModeloOpenRouter[]>
  cargando: Ref<boolean>
  error: Ref<string | null>
  cargar: () => Promise<void>
} {
  async function cargar(): Promise<void> {
    if (yaCargado || cargando.value) return
    cargando.value = true
    error.value = null
    try {
      const cuerpo = await $fetch<RespuestaOpenRouter>('/api/openrouter-modelos')
      modelos.value = (cuerpo.data ?? [])
        .map((m) => ({ id: m.id, nombre: m.name ?? m.id }))
        .sort((a, b) => a.id.localeCompare(b.id))
      yaCargado = true
    } catch (excepcion) {
      error.value =
        excepcion instanceof Error
          ? excepcion.message
          : 'No se pudo cargar el catálogo de OpenRouter.'
    } finally {
      cargando.value = false
    }
  }

  return { modelos, cargando, error, cargar }
}
