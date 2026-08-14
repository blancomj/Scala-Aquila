/**
 * Toda Edge Function de este proyecto responde `{ error: { code, message,
 * details } }` (formato uniforme, PROMPT_MAESTRO_FASE1.md §8) en cualquier
 * fallo con status != 2xx. supabase-js envuelve eso en un FunctionsHttpError
 * cuyo `.context` es el Response crudo — hay que leerlo a mano para no
 * perder el mensaje real. Compartido entre stores/tenant.ts y
 * stores/invitations.ts (antes duplicado en tenant.ts).
 */
export async function extraerErrorFuncion(error: unknown): Promise<Error> {
  if (error && typeof error === 'object' && 'context' in error) {
    const contexto = (error as { context: unknown }).context
    if (contexto instanceof Response) {
      try {
        const cuerpo = (await contexto.clone().json()) as { error?: { message?: string } }
        if (cuerpo.error?.message) return new Error(cuerpo.error.message)
      } catch {
        // El cuerpo no era JSON con la forma esperada — cae al mensaje genérico.
      }
    }
  }
  return error instanceof Error ? error : new Error('No se pudo completar la operación.')
}
