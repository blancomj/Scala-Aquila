// CAR §18 — disparador de la corrida diaria de cartera (bloque 2,
// PRQ-CAR-010). Lo llama pg_cron a través de pg_net, no una persona.
//
// ALCANCE DECIDIDO POR EL PROPIETARIO DEL PRODUCTO (2026-08-29): SOLO
// CALCULA. Invoca cartera-recalcular en modo 'ejecucion' — que clasifica,
// evalúa escalamientos y CREA las acciones en la bandeja — y no despacha
// absolutamente nada. Ningún mensaje sale hasta que una persona lo apruebe
// o lo envíe desde /cartera/acciones.
//
// Por qué existe esta función en vez de que el cron llame directo a
// cartera-recalcular: pg_cron tendría que autenticarse, y la única
// credencial que sirve para el modo 'secret' (SUPABASE_SECRET_KEYS) vive
// dentro de las Edge Functions y no debe copiarse a la base ni a un
// archivo. Aquí se lee del entorno y no sale de Supabase; hacia afuera
// esta función solo expone un token propio en la ruta, igual que
// webhook-brevo.
//
// Fan-out de una petición POR COPROPIEDAD, CONCURRENTE (Promise.all, no un
// for/await secuencial): si una falla — política sin tramos, datos a medias
// — las demás siguen, cada una en su propia promesa aislada. Secuencial fue
// el diseño original y dejó de alcanzar: con 4 copropiedades activas con
// política vigente (una de ellas, gc-001, con 66 inmuebles) la SUMA de sus
// tiempos ya supera el límite de ejecución de la Edge Function y el cron
// entero vuelve 504 — no por una copropiedad rota, sino porque el tiempo
// total escalaba con la cantidad de tenants en vez de con el más lento de
// ellos. En producción, con más copropiedades, seguiría empeorando.
//
// Solo se disparan las copropiedades con política de clasificación
// VIGENTE. Sin política, cartera-recalcular aborta por PH-C26/I-C14: pedir
// esa corrida es gastar una invocación para recibir un 422 previsible.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'

/** Comparación en tiempo constante: el token es el único control de acceso. */
function tokenValido(recibido: string, esperado: string): boolean {
  if (recibido.length !== esperado.length) return false
  let diferencia = 0
  for (let i = 0; i < recibido.length; i += 1) {
    diferencia |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i)
  }
  return diferencia === 0
}

/**
 * SUPABASE_SECRET_KEYS llega como JSON con las claves del proyecto. Se usa
 * la `default`, que es la que valida `auth: 'secret'` en el wrapper.
 */
function claveSecretaDefault(): string | null {
  const crudo = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (!crudo) return null
  try {
    const claves = JSON.parse(crudo) as Record<string, string>
    return claves['default'] ?? Object.values(claves)[0] ?? null
  } catch {
    // Algunos entornos la inyectan como una sola clave en texto plano.
    return crudo
  }
}

interface ResultadoTenant {
  tenantId: string
  status: number
  ok: boolean
  detalle?: string
}

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID()

  if (req.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Solo POST.', undefined, correlationId)
  }

  const segmentos = new URL(req.url).pathname.split('/').filter(Boolean)
  const token = segmentos.at(-1)
  const tokenEsperado = Deno.env.get('CARTERA_CRON_TOKEN')

  // Sin token configurado el endpoint se cierra, no se abre.
  if (!tokenEsperado) {
    logEvent({
      level: 'error',
      action: 'cartera_cron.token_no_configurado',
      correlationId,
      message: 'CARTERA_CRON_TOKEN no está configurado — no se dispara nada.',
    })
    return errorResponse(500, 'INTERNAL_ERROR', 'Cron no configurado.', undefined, correlationId)
  }
  if (!token || !tokenValido(token, tokenEsperado)) {
    return errorResponse(404, 'CRON_TOKEN_INVALIDO', 'Ruta inválida.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const secretKey = claveSecretaDefault()
  if (!supabaseUrl || !serviceKey || !secretKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  // REC-CAR-008: la fecha de corte se puede fijar explícitamente (re-correr
  // un día concreto); si no viene, es la de hoy.
  let fechaCorte = new Date().toISOString().slice(0, 10)
  try {
    const cuerpo = (await req.json()) as { fecha_corte?: unknown }
    if (typeof cuerpo.fecha_corte === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cuerpo.fecha_corte)) {
      fechaCorte = cuerpo.fecha_corte
    }
  } catch {
    // Sin cuerpo: fecha de hoy. pg_cron manda un body vacío.
  }

  const { data: politicas, error: errorPoliticas } = await admin
    .from('politicas_clasificacion_cartera')
    .select('tenant_id, tenants!inner(status)')
    .eq('estado', 'vigente')
    .eq('tenants.status', 'active')
  if (errorPoliticas) {
    return errorResponse(500, 'INTERNAL_ERROR', errorPoliticas.message, undefined, correlationId)
  }

  const tenantIds = [...new Set((politicas ?? []).map((p) => p.tenant_id))]

  // Cada tenant es una unidad de trabajo independiente: su propia llamada a
  // cartera-recalcular y su propio upsert de bitácora, en su propia promesa.
  // El bloque nunca relanza — cualquier falla queda capturada en el
  // ResultadoTenant — así que Promise.all no aborta por una que falle.
  const resultados: ResultadoTenant[] = await Promise.all(
    tenantIds.map(async (tenantId): Promise<ResultadoTenant> => {
      let resultado: ResultadoTenant
      try {
        const respuesta = await fetch(`${supabaseUrl}/functions/v1/cartera-recalcular`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // El wrapper valida esta clave en modo 'secret'. No hay usuario:
            // la acción nacerá con creada_por='job'.
            apikey: secretKey,
          },
          body: JSON.stringify({ tenant_id: tenantId, fecha_corte: fechaCorte, modo: 'ejecucion' }),
        })

        const ok = respuesta.ok
        let detalle: string | undefined
        if (!ok) {
          detalle = (await respuesta.text()).slice(0, 300)
        }
        resultado = { tenantId, status: respuesta.status, ok, detalle }
      } catch (excepcion) {
        resultado = {
          tenantId,
          status: 0,
          ok: false,
          detalle: excepcion instanceof Error ? excepcion.message : 'error de red',
        }
      }

      await admin
        .from('cartera_corridas_diarias')
        .upsert(
          {
            tenant_id: tenantId,
            fecha_corte: fechaCorte,
            origen: 'cron',
            disparado_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,fecha_corte,origen' },
        )

      return resultado
    }),
  )

  const fallidas = resultados.filter((r) => !r.ok)
  logEvent({
    level: fallidas.length > 0 ? 'error' : 'info',
    action: 'cartera_cron.completado',
    correlationId,
    meta: {
      fechaCorte,
      copropiedades: tenantIds.length,
      exitosas: resultados.length - fallidas.length,
      fallidas: fallidas.length,
      // Se listan las que fallaron con su motivo: "corrió y algo falló" y
      // "no corrió" tienen que distinguirse desde los logs.
      detalleFallidas: fallidas.slice(0, 10),
    },
  })

  return jsonResponse(
    {
      fechaCorte,
      copropiedades: tenantIds.length,
      exitosas: resultados.length - fallidas.length,
      fallidas: fallidas.length,
      resultados,
    },
    200,
    correlationId,
  )
})
