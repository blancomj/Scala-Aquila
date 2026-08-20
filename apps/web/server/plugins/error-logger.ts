// E7 · observabilidad — correlationId por request (header X-Correlation-Id
// en toda respuesta) y log estructurado de errores de servidor no
// capturados. `logEvent` viene de server/utils/logger.ts (auto-import de
// Nitro).
import { randomUUID } from 'node:crypto'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.context.correlationId = randomUUID()
  })

  nitroApp.hooks.hook('beforeResponse', (event) => {
    const correlationId = event.context.correlationId
    // beforeResponse no garantiza que los headers todavía no se hayan enviado (ej. redirects,
    // respuestas ya terminadas) — sin este guard, setHeader lanza "Cannot set headers after
    // they are sent to the client", que el hook `error` de abajo vuelve a loguear como si fuera
    // un error real de la request.
    if (typeof correlationId === 'string' && !event.node.res.headersSent) {
      event.node.res.setHeader('X-Correlation-Id', correlationId)
    }
  })

  nitroApp.hooks.hook('error', (error, { event }) => {
    const correlationId = event?.context.correlationId
    logEvent({
      level: 'error',
      action: 'server.unhandled_error',
      correlationId: typeof correlationId === 'string' ? correlationId : randomUUID(),
      message: error instanceof Error ? error.message : String(error),
    })
  })
})
