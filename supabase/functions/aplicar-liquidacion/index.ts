// L3 · Aplicar — el acto irreversible.
//
// Todo el trabajo ocurre en fn_aplicar_liquidacion (plpgsql): lock del
// periodo, revalidación del sello, gates del pre-vuelo, cargos, cargos de
// novedades y cierre del periodo, en UNA transacción. Esta función no
// orquesta nada — hace una cosa que la base de datos no puede hacer sola, y
// después llama.
//
// ═══ LO ÚNICO QUE HACE AQUÍ ARRIBA, Y POR QUÉ ═══
//
// Recalcular el snapshot_hash. Ese hash lo produce
// packages/liquidation-engine con serialización canónica, y solo TypeScript
// sabe calcularlo: si el snapshot de ahora difiere del que se calculó, los
// números que el administrador está aprobando ya no son los que produciría
// aplicar. Se recalcula, se compara, y el resultado se pasa a la RPC para
// que ella también lo verifique — ya dentro de su transacción.
//
// Es la barrera "exacta". La otra, el sello de datos, vive en la base y
// corre dentro del lock. Ninguna sola bastaría: esta es precisa pero se
// evalúa fuera de la transacción; aquella cubre la ventana pero es un
// resumen. Ver la cabecera de 20260830590000_liquidacion_aplicar.sql.
//
// ═══ QUIÉN PUEDE ═══
//
// Solo `administrador`, y no lo decide esta función: lo decide
// guard_liquidacion_transicion cuando la RPC hace el UPDATE de estado. Un
// auxiliar que llame esta función directamente recibe
// LIQUIDACION_REQUIERE_ADMINISTRADOR desde la base — verificado con
// sesiones reales.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import {
  construirSnapshotDesdeSupabase,
  liquidar,
} from '../../../packages/liquidation-engine/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { agruparAvisosAlcance } from '../_shared/avisos_alcance.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

// Espejo local de AvisoAlcanceSinDato (packages/liquidation-engine/src/
// result.ts): dist/index.js pierde los exports type-only al compilar a JS.
interface AvisoAlcanceLocal {
  readonly conceptoCodigo: string
  readonly inmuebleId: string
  readonly campos: readonly string[]
}

// Bajo a propósito: aplicar es un acto por periodo, no una operación que se
// repita. Un número alto aquí solo serviría para amplificar un error.
const RATE_LIMIT_MAX_HITS = 10
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  liquidacion_id: z.string().uuid(),
})

export default {
  fetch: withSupabase<Database>({ auth: 'user' }, async (req, ctx) => {
    const correlationId = crypto.randomUUID()
    const actorId = ctx.userClaims?.id ?? null

    if (req.method !== 'POST') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Solo POST.', undefined, correlationId)
    }

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'El cuerpo debe ser JSON válido.',
        undefined,
        correlationId,
      )
    }

    const parseo = payloadSchema.safeParse(payload)
    if (!parseo.success) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        parseo.error.issues[0]?.message ?? 'Payload inválido.',
        { issues: parseo.error.issues },
        correlationId,
      )
    }
    const { liquidacion_id: liquidacionId } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `aplicar_liquidacion:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // RLS del usuario: solo la ve si es miembro del tenant.
    const { data: liquidacion, error: errorLiq } = await ctx.supabase
      .from('liquidaciones')
      .select('id, tenant_id, periodo_id, estado, snapshot_hash, periodos(anio, mes)')
      .eq('id', liquidacionId)
      .maybeSingle()
    if (errorLiq) {
      return errorResponse(500, 'INTERNAL_ERROR', errorLiq.message, undefined, correlationId)
    }
    if (!liquidacion) {
      return errorResponse(
        404,
        'LIQUIDACION_NO_ENCONTRADA',
        'La liquidación no existe o no es accesible.',
        undefined,
        correlationId,
      )
    }
    if (liquidacion.estado !== 'pendiente_aprobacion') {
      return errorResponse(
        422,
        'LIQUIDACION_NO_PENDIENTE',
        `La liquidación está en estado "${liquidacion.estado}" — solo se aplica una que esté ` +
          'pendiente de aprobación.',
        undefined,
        correlationId,
      )
    }

    // ── La barrera exacta: ¿el snapshot sigue siendo el mismo? ────────
    // Se recalcula con el mismo motor que lo produjo. Si la Pre-Liquidación
    // no trae hash (las anteriores a L0 no lo tienen), se omite la
    // comparación en vez de fingir que se verificó — la RPC lo tratará
    // igual y el sello de datos sigue cubriendo su parte.
    let hashActual: string | null = null
    // ADC-01: avisos de "dato sin clasificar" de ESTA corrida — solo existen
    // cuando hubo recálculo (mismo condicional que hashActual, misma razón:
    // una Pre-Liquidación anterior a L0 no trae snapshot_hash y no se
    // reconstruye). Sin recálculo, se aplica sin avisos de alcance nuevos —
    // los de fn_liquidacion_prevuelo (SQL) siguen cubriéndose igual.
    let avisosAlcance: readonly AvisoAlcanceLocal[] = []
    if (liquidacion.snapshot_hash !== null) {
      const periodo = liquidacion.periodos as unknown as { anio: number; mes: number } | null
      if (!periodo) {
        return errorResponse(
          500,
          'INTERNAL_ERROR',
          'No se pudo leer el periodo de la liquidación.',
          undefined,
          correlationId,
        )
      }
      try {
        const snapshot = await construirSnapshotDesdeSupabase(ctx.supabase, {
          tenantId: liquidacion.tenant_id,
          anio: periodo.anio,
          mes: periodo.mes,
        })
        const calculado = liquidar(snapshot)
        hashActual = calculado.resultHash
        avisosAlcance = calculado.resultado.avisosAlcance as AvisoAlcanceLocal[]
      } catch (excepcion) {
        const mensaje =
          excepcion instanceof Error ? excepcion.message : 'No se pudo reconstruir el snapshot.'
        logEvent({
          level: 'warn',
          action: 'aplicar_liquidacion.snapshot_irreconstruible',
          correlationId,
          actorId,
          tenantId: liquidacion.tenant_id,
          message: mensaje,
        })
        // Si el escenario ya no permite ni calcular, desde luego no permite
        // aplicar lo que se calculó antes.
        return errorResponse(
          422,
          'LIQUIDACION_SNAPSHOT_DESACTUALIZADO',
          `Los datos ya no permiten reproducir este cálculo: ${mensaje}. Vuelve a simular.`,
          undefined,
          correlationId,
        )
      }
    }

    // ── Todo lo demás pasa dentro de la transacción ───────────────────
    const { data: resultado, error: errorAplicar } = await ctx.supabase.rpc(
      'fn_aplicar_liquidacion',
      {
        p_liquidacion_id: liquidacionId,
        p_snapshot_hash: hashActual,
        p_avisos_alcance: agruparAvisosAlcance(avisosAlcance),
      },
    )

    if (errorAplicar) {
      const mensaje = errorAplicar.message
      logEvent({
        level: 'error',
        action: 'aplicar_liquidacion.rechazada',
        correlationId,
        actorId,
        tenantId: liquidacion.tenant_id,
        meta: { liquidacionId },
        message: mensaje,
      })

      // Los guards de la base hablan en códigos; se traducen al contrato
      // HTTP sin perder el mensaje original, que es el que explica al
      // usuario qué hacer.
      const mapa: Record<string, { status: number; code: string }> = {
        LIQUIDACION_REQUIERE_ADMINISTRADOR: { status: 403, code: 'FORBIDDEN' },
        LIQUIDACION_NO_PENDIENTE: { status: 422, code: 'LIQUIDACION_NO_PENDIENTE' },
        LIQUIDACION_NO_ENCONTRADA: { status: 404, code: 'LIQUIDACION_NO_ENCONTRADA' },
        LIQUIDACION_DATOS_CAMBIARON: { status: 409, code: 'LIQUIDACION_DATOS_CAMBIARON' },
        LIQUIDACION_SNAPSHOT_DESACTUALIZADO: {
          status: 409,
          code: 'LIQUIDACION_SNAPSHOT_DESACTUALIZADO',
        },
        LIQUIDACION_PREVUELO_BLOQUEADO: { status: 422, code: 'LIQUIDACION_PREVUELO_BLOQUEADO' },
      }
      for (const [codigo, { status, code }] of Object.entries(mapa)) {
        if (mensaje.includes(codigo)) {
          return errorResponse(status, code, mensaje, undefined, correlationId)
        }
      }
      return errorResponse(500, 'INTERNAL_ERROR', mensaje, undefined, correlationId)
    }

    const resumen = resultado as {
      cargos_creados: number
      cargos_novedades: number
      tenant_total: number
      avisos: unknown[]
    }

    logEvent({
      level: 'info',
      action: 'aplicar_liquidacion.aplicada',
      correlationId,
      actorId,
      tenantId: liquidacion.tenant_id,
      meta: {
        liquidacionId,
        periodoId: liquidacion.periodo_id,
        cargos: resumen.cargos_creados,
        cargosNovedades: resumen.cargos_novedades,
      },
    })

    return jsonResponse(resultado, 200, correlationId)
  }),
}
