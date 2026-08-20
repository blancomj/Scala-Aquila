// AEL-004 Fase 1 (PLAN_AEL004_RULE_WORKSPACE.md) — "probar fórmula": evalúa
// un texto AEL ad-hoc (guardado o no) contra un inmueble y periodo reales,
// sin escribir nada. Un `valido:false` con diagnósticos es un resultado
// normal (200), no un error HTTP — igual criterio que Doc 10 VALIDATION
// STATES (Idle/Validating/Valid/Invalid, ambos "Valid"/"Invalid" son
// resultados esperados).
//
// Solo lectura, RLS-scoped (ctx.supabase) — no hace falta ctx.supabaseAdmin
// porque nada se escribe y todas las tablas que toca ya tienen política
// SELECT para agent (inmuebles/periodos/presupuestos/politicas_financieras/
// conceptos/coeficiente_sets/coeficientes).
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado), no src/index.ts — mismo motivo que
// liquidar-periodo/index.ts.
import {
  construirContextoPrueba,
  probarFormula,
} from '../../../packages/liquidation-engine/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  inmueble_id: z.string().uuid(),
  periodo_id: z.string().uuid(),
  formula_ael: z.string().min(1, 'formula_ael no puede estar vacía.'),
})

// Espejos locales — dist/index.js pierde los exports type-only al compilar.
interface DiagnosticoLocal {
  readonly codigo: string
  readonly mensaje: string
  readonly span: { readonly inicio: { readonly linea: number; readonly columna: number } }
}
interface ValorLocal {
  readonly tipo: string
  readonly valor?: unknown
}
interface PasoTrazaLocal {
  readonly nombre: string | null
  readonly expresionTexto: string
  readonly valor: ValorLocal
}
interface ResultadoPruebaLocal {
  readonly valido: boolean
  readonly resultado: ValorLocal | null
  readonly diagnosticos: readonly DiagnosticoLocal[]
  readonly traza: readonly PasoTrazaLocal[]
}

function serializarValor(resultado: ValorLocal): string | boolean | null {
  switch (resultado.tipo) {
    case 'MONEY':
      return (resultado.valor as { amount: { toString(): string } }).amount.toString()
    case 'NUMBER':
      return (resultado.valor as { toString(): string }).toString()
    case 'BOOLEAN':
      return resultado.valor as boolean
    default:
      return null
  }
}

export default {
  fetch: withSupabase<Database>({ auth: 'user' }, async (req, ctx) => {
    const correlationId = crypto.randomUUID()
    const actorId = ctx.userClaims?.id ?? null
    if (!actorId) {
      return errorResponse(401, 'UNAUTHENTICATED', 'Sesión inválida.', undefined, correlationId)
    }

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
    const {
      tenant_id: tenantId,
      inmueble_id: inmuebleId,
      periodo_id: periodoId,
      formula_ael: formulaAel,
    } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `probar_formula:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: esAgent, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: tenantId,
      p_roles: ['auxiliar'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!esAgent) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un agent puede probar fórmulas.',
        undefined,
        correlationId,
      )
    }

    const { data: inmueble, error: errorInmueble } = await ctx.supabase
      .from('inmuebles')
      .select('id')
      .eq('id', inmuebleId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (errorInmueble) {
      return errorResponse(500, 'INTERNAL_ERROR', errorInmueble.message, undefined, correlationId)
    }
    if (!inmueble) {
      return errorResponse(
        404,
        'INMUEBLE_NO_ENCONTRADO',
        'El inmueble no existe o no es accesible.',
        undefined,
        correlationId,
      )
    }

    const { data: periodo, error: errorPeriodo } = await ctx.supabase
      .from('periodos')
      .select('anio, mes')
      .eq('id', periodoId)
      .eq('tenant_id', tenantId)
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

    let contexto: Awaited<ReturnType<typeof construirContextoPrueba>>
    try {
      contexto = await construirContextoPrueba(ctx.supabase, {
        tenantId,
        inmuebleId,
        anio: periodo.anio,
        mes: periodo.mes,
      })
    } catch (excepcion) {
      const mensaje =
        excepcion instanceof Error
          ? excepcion.message
          : 'No se pudo construir el contexto de prueba.'
      return errorResponse(422, 'SNAPSHOT_INCOMPLETO', mensaje, undefined, correlationId)
    }

    const resultado = probarFormula(formulaAel, contexto.contexto) as ResultadoPruebaLocal

    return jsonResponse(
      {
        valido: resultado.valido,
        resultado: resultado.resultado ? serializarValor(resultado.resultado) : null,
        tipo: resultado.resultado?.tipo ?? null,
        diagnosticos: resultado.diagnosticos.map((d) => ({
          codigo: d.codigo,
          mensaje: d.mensaje,
          linea: d.span.inicio.linea,
          columna: d.span.inicio.columna,
        })),
        traza: resultado.traza.map((paso) => ({
          nombre: paso.nombre,
          expresionTexto: paso.expresionTexto,
          valor: serializarValor(paso.valor),
          tipo: paso.valor.tipo,
        })),
      },
      200,
      correlationId,
    )
  }),
}
