// L2 · Simular — calcula una Pre-Liquidación sin comprometer nada.
//
// Es la mitad "sin consecuencias" del flujo de dos tiempos: corre el motor
// completo, guarda el resultado y se detiene. No crea cargos, no cierra el
// periodo, no toca la contabilidad. Se puede repetir las veces que haga
// falta mientras se corrigen datos — cada corrida descarta la anterior.
//
// ═══ REPARTO DE RESPONSABILIDADES ═══
//
// Esta función CALCULA; la base de datos GUARDA. El cálculo es
// packages/liquidation-engine tal cual —el mismo motor puro y determinista
// que ya usaban los tests, sin una línea nueva— y la persistencia entera es
// una sola llamada a fn_crear_preliquidacion, que descarta la corrida
// anterior, sella el escenario e inserta cabecera y líneas en una
// transacción. Aquí no hay orquestación: hay una llamada.
//
// Por qué no persiste directo desde TypeScript, como hacía
// guardarLiquidacion(): porque eran dos INSERT secuenciales y entre uno y
// otro cabía un fallo que dejaba una liquidación sin líneas — un total sin
// el detalle que lo sustenta.
//
// ═══ QUIÉN PUEDE ═══
//
// Rol `auxiliar` (que `administrador` hereda). Simular no compromete nada,
// así que no exige el rol alto — ese se pide para aplicar
// (guard_liquidacion_transicion). fn_crear_preliquidacion revalida el rol
// por su cuenta: es SECURITY DEFINER y no puede confiar en que quien la
// llame ya lo haya hecho.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado), no src/index.ts — mismo motivo que
// liquidar-periodo/index.ts: Deno no resuelve especificadores con extensión
// .js que apuntan a hermanos .ts (convención NodeNext del build de Node).
import {
  ConceptoNoAnalizaLimpioError,
  construirSnapshotDesdeSupabase,
  DependenciaCiclicaError,
  DependenciaDesconocidaError,
  EvaluacionConceptoFallidaError,
  liquidar,
  ReconciliacionLiquidacionFallidaError,
} from '../../../packages/liquidation-engine/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

// Más alto que el de aplicar: simular es justamente lo que se espera que el
// usuario repita mientras corrige datos.
const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  periodo_id: z.string().uuid(),
})

// Espejo local de LineaResultado (packages/liquidation-engine/src/result.ts):
// dist/index.js pierde los exports type-only al compilar a JS.
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
      `simular_liquidacion:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // Lectura con RLS del usuario: solo ve el periodo si es miembro del
    // tenant. Nunca se confía en un tenant_id que venga del payload.
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

    // ── Pre-vuelo, antes de gastar el cálculo ────────────────────────
    // No corta el paso: los bloqueos se devuelven junto al resultado para
    // que la pantalla los muestre. Se calcula igual —ver los números aunque
    // falte la fecha de vencimiento es útil— y quien decide si se puede
    // aplicar es fn_aplicar_liquidacion, con el lock tomado.
    const { data: hallazgos, error: errorPrevuelo } = await ctx.supabase.rpc(
      'fn_liquidacion_prevuelo',
      { p_tenant_id: periodo.tenant_id, p_periodo_id: periodoId },
    )
    if (errorPrevuelo) {
      return errorResponse(500, 'INTERNAL_ERROR', errorPrevuelo.message, undefined, correlationId)
    }

    // ── El motor ──────────────────────────────────────────────────────
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
        action: 'simular_liquidacion.snapshot_incompleto',
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
          action: 'simular_liquidacion.liquidacion_invalida',
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

    // ── Guardar: una sola llamada, una sola transacción ───────────────
    const conceptoIdPorCodigo = new Map(snapshot.conceptos.map((c) => [c.codigo, c.id]))
    const lineas: { inmueble_id: string; concepto_id: string; monto: string }[] = []
    for (const linea of calculado.resultado.lineas as LineaResultadoLocal[]) {
      const conceptoId = conceptoIdPorCodigo.get(linea.conceptoCodigo)
      if (conceptoId === undefined) {
        return errorResponse(
          500,
          'INTERNAL_ERROR',
          `La línea de "${linea.conceptoCodigo}" no corresponde a ningún concepto del snapshot.`,
          undefined,
          correlationId,
        )
      }
      lineas.push({
        inmueble_id: linea.inmuebleId,
        concepto_id: conceptoId,
        monto: linea.monto.amount.toString(),
      })
    }

    const { data: guardado, error: errorGuardar } = await ctx.supabase.rpc(
      'fn_crear_preliquidacion',
      {
        p_tenant_id: periodo.tenant_id,
        p_periodo_id: periodoId,
        p_result_hash: calculado.resultHash,
        p_tenant_total: Number(calculado.resultado.tenantTotal.amount.toString()),
        p_lineas: lineas,
        // El snapshot completo queda guardado para auditoría: permite
        // responder "¿con qué datos se calculó esto?" sin reconstruirlos.
        p_snapshot: snapshot as unknown as Record<string, unknown>,
        p_snapshot_hash: calculado.resultHash,
      },
    )
    if (errorGuardar) {
      logEvent({
        level: 'error',
        action: 'simular_liquidacion.guardado_fallido',
        correlationId,
        actorId,
        tenantId: periodo.tenant_id,
        meta: { periodoId },
        message: errorGuardar.message,
      })
      // FORBIDDEN / PERIODO_NO_ABIERTO / PERIODO_YA_LIQUIDADO vienen del
      // propio guard: son del usuario, no fallos del servidor.
      const esDeNegocio = /FORBIDDEN|PERIODO_NO_ABIERTO|PERIODO_YA_LIQUIDADO|PERIODO_NO_ENCONTRADO/.test(
        errorGuardar.message,
      )
      return errorResponse(
        esDeNegocio ? 422 : 500,
        esDeNegocio ? 'LIQUIDACION_INVALIDA' : 'INTERNAL_ERROR',
        errorGuardar.message,
        undefined,
        correlationId,
      )
    }

    const resumen = guardado as {
      liquidacion_id: string
      lineas: number
      sello_datos: string
      descarto_anteriores: number
    }

    logEvent({
      level: 'info',
      action: 'simular_liquidacion.completada',
      correlationId,
      actorId,
      tenantId: periodo.tenant_id,
      meta: {
        periodoId,
        liquidacionId: resumen.liquidacion_id,
        lineas: resumen.lineas,
        descartoAnteriores: resumen.descarto_anteriores,
      },
    })

    return jsonResponse(
      {
        liquidacion_id: resumen.liquidacion_id,
        periodo_id: periodoId,
        estado: 'pre_liquidada',
        result_hash: calculado.resultHash,
        tenant_total: calculado.resultado.tenantTotal.amount.toString(),
        lineas: resumen.lineas,
        descarto_anteriores: resumen.descarto_anteriores,
        // La pantalla los pinta como checklist; los bloqueos deshabilitan
        // "Solicitar aplicación".
        prevuelo: hallazgos ?? [],
      },
      200,
      correlationId,
    )
  }),
}
