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
    if (typeof correlationId === 'string') {
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
