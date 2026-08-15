// F6 — expone liquidar() + guardarLiquidacion() (packages/liquidation-engine)
// al administrador (PLAN_MAESTRO_IMPLEMENTACION.md §5 F6, "el administrador
// liquida un periodo... desde la UI"). No construye un segundo motor: llama
// exactamente las mismas funciones puras que ya usan
// tests/liquidacion/gc001-*.test.ts.
//
// Privilegio real: `liquidaciones`/`liquidacion_lineas` NO tienen política
// RLS de INSERT para `authenticated` (supabase/migrations/20260814110000_
// liquidaciones.sql, a propósito — "liquidar es una operación privilegiada
// que corresponde a una Edge Function, no una escritura directa del
// cliente"). Por eso `guardarLiquidacion` se llama con `ctx.supabaseAdmin`
// (service_role, bypassa RLS) — el único otro uso de service_role en el
// proyecto es accept-invitation/index.ts. Como RLS no protege este INSERT,
// la función verifica el rol 'agent' explícitamente vía `has_role()` antes
// de escribir nada.
//
// Decisión explícita (confirmada con el usuario): esta función NO transiciona
// `periodos.estado` (abierto→en_liquidacion→cerrado) — solo persiste la
// liquidación, igual que ya hacían los tests. `guard_periodo_transicion`
// (20260814100300_domain_triggers.sql) no permite volver de 'en_liquidacion'
// a 'abierto', así que mover ese estado aquí arriesgaría dejar un periodo
// atascado si liquidar()/guardarLiquidacion() falla a mitad de camino, sin
// que exista todavía un mecanismo de reapertura (gap reconocido por el
// propio comentario del trigger, diferido a un incremento futuro de F6).
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado), no src/index.ts — mismo motivo que
// presupuesto-previsualizar/index.ts: Deno no resuelve especificadores con
// extensión .js que en realidad apuntan a hermanos .ts (convención NodeNext
// del build de Node). Solo se importan valores en tiempo de ejecución.
import {
  ConceptoNoAnalizaLimpioError,
  construirSnapshotDesdeSupabase,
  DependenciaCiclicaError,
  DependenciaDesconocidaError,
  EvaluacionConceptoFallidaError,
  guardarLiquidacion,
  liquidar,
  ReconciliacionLiquidacionFallidaError,
} from '../../../packages/liquidation-engine/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 20
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  periodo_id: z.string().uuid(),
})

// Espejo local de LineaResultado (packages/liquidation-engine/src/result.ts)
// — dist/index.js pierde los exports type-only al compilar a JS; ver
// comentario del import de arriba sobre por qué no se importa el tipo.
interface LineaResultadoLocal {
  readonly inmuebleId: string
  readonly conceptoCodigo: string
  readonly monto: { readonly amount: { toString(): string } }
}

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
    const { periodo_id: periodoId } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `liquidar_periodo:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // Lectura con ctx.supabase (RLS del usuario) — solo ve el periodo si es
    // miembro de ese tenant; nunca se confía en un tenant_id del payload.
    const { data: periodo, error: errorPeriodo } = await ctx.supabase
      .from('periodos')
      .select('id, tenant_id, anio, mes, estado')
      .eq('id', periodoId)
      .maybeSingle()
    if (errorPeriodo) {
      return errorResponse(500, 'INTERNAL_ERROR', errorPeriodo.message, undefined, correlationId)
    }
    if (!periodo) {
      return errorResponse(
        404,
        'PERIODO_NO_ENCONTRADO',
        'El periodo no existe o no es accesible.',
        undefined,
        correlationId,
      )
    }

    if (periodo.estado !== 'abierto') {
      return errorResponse(
        422,
        'PERIODO_NO_ABIERTO',
        `El periodo está en estado "${periodo.estado}", no "abierto".`,
        undefined,
        correlationId,
      )
    }

    // RLS no protege el INSERT de más abajo (ver cabecera) — el rol se
    // verifica aquí explícitamente, con el mismo has_role() que usan las
    // políticas RLS del resto del esquema.
    const { data: esAgent, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: periodo.tenant_id,
      p_roles: ['agent'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!esAgent) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un agent puede liquidar un periodo.',
        undefined,
        correlationId,
      )
    }

    // Idempotencia simplificada de v0 (constraint liquidaciones_periodo_unico):
    // una liquidación completada por periodo, sin reintentos todavía.
    const { data: existente, error: errorExistente } = await ctx.supabase
      .from('liquidaciones')
      .select('id, result_hash, tenant_total')
      .eq('periodo_id', periodoId)
      .maybeSingle()
    if (errorExistente) {
      return errorResponse(500, 'INTERNAL_ERROR', errorExistente.message, undefined, correlationId)
    }
    if (existente) {
      return errorResponse(
        409,
        'PERIODO_YA_LIQUIDADO',
        'Este periodo ya tiene una liquidación completada.',
        { liquidacion_id: existente.id },
        correlationId,
      )
    }

    let snapshot
    try {
      snapshot = await construirSnapshotDesdeSupabase(ctx.supabase, {
        tenantId: periodo.tenant_id,
        anio: periodo.anio,
        mes: periodo.mes,
      })
    } catch (excepcion) {
      const mensaje = excepcion instanceof Error ? excepcion.message : 'Snapshot incompleto.'
      logEvent({
        level: 'warn',
        action: 'liquidar_periodo.snapshot_incompleto',
        correlationId,
        actorId,
        message: mensaje,
      })
      return errorResponse(422, 'SNAPSHOT_INCOMPLETO', mensaje, undefined, correlationId)
    }

    let calculado
    try {
      calculado = liquidar(snapshot)
    } catch (excepcion) {
      if (
        excepcion instanceof DependenciaCiclicaError ||
        excepcion instanceof DependenciaDesconocidaError ||
        excepcion instanceof ConceptoNoAnalizaLimpioError ||
        excepcion instanceof EvaluacionConceptoFallidaError ||
        excepcion instanceof ReconciliacionLiquidacionFallidaError
      ) {
        logEvent({
          level: 'error',
          action: 'liquidar_periodo.liquidacion_invalida',
          correlationId,
          actorId,
          meta: { tipo: excepcion.name },
          message: excepcion.message,
        })
        return errorResponse(
          422,
          'LIQUIDACION_INVALIDA',
          excepcion.message,
          undefined,
          correlationId,
        )
      }
      throw excepcion
    }

    // Único uso de service_role: liquidaciones/liquidacion_lineas no tienen
    // política de INSERT para `authenticated` (ver cabecera). El rol ya se
    // verificó arriba, así que este bypass de RLS es intencional y acotado.
    let liquidacionId: string
    try {
      liquidacionId = await guardarLiquidacion(ctx.supabaseAdmin, snapshot, calculado)
    } catch (excepcion) {
      const mensaje = excepcion instanceof Error ? excepcion.message : 'No se pudo guardar.'
      logEvent({
        level: 'error',
        action: 'liquidar_periodo.guardado_fallido',
        correlationId,
        actorId,
        message: mensaje,
      })
      return errorResponse(500, 'INTERNAL_ERROR', mensaje, undefined, correlationId)
    }

    logEvent({
      level: 'info',
      action: 'liquidar_periodo.completada',
      correlationId,
      actorId,
      tenantId: periodo.tenant_id,
      meta: { periodoId, liquidacionId },
    })

    return jsonResponse(
      {
        liquidacion_id: liquidacionId,
        periodo_id: periodoId,
        result_hash: calculado.resultHash,
        tenant_total: calculado.resultado.tenantTotal.amount.toString(),
        lineas: calculado.resultado.lineas.map((l: LineaResultadoLocal) => ({
          inmueble_id: l.inmuebleId,
          concepto_codigo: l.conceptoCodigo,
          monto: l.monto.amount.toString(),
        })),
      },
      200,
      correlationId,
    )
  }),
}
