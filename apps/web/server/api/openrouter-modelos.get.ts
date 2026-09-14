// Proxy del catálogo público de OpenRouter — NO es una Edge Function porque
// no toca ni Supabase ni un secreto: solo reenvía una API pública, sin
// autenticación, que el navegador no puede llamar directo (CSP `connect-src
// 'self' <supabase>`, apps/web/nuxt.config.ts, deliberadamente sin dominios
// externos — mismo criterio que el comentario de `icon.fallbackToApi` sobre
// no violar "el espíritu de la CSP de este proyecto").
//
// Cacheado en el servidor (1h): el catálogo no cambia minuto a minuto y esto
// evita pedirle a OpenRouter una vez por cada copropiedad que abra la
// pantalla de configuración de IA.
export default defineCachedEventHandler(
  async () => {
    const respuesta = await fetch('https://openrouter.ai/api/v1/models')
    if (!respuesta.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: `OpenRouter respondió ${String(respuesta.status)}`,
      })
    }
    const cuerpo = (await respuesta.json()) as { data?: { id: string; name?: string }[] }
    return { data: cuerpo.data ?? [] }
  },
  { maxAge: 60 * 60 },
)
