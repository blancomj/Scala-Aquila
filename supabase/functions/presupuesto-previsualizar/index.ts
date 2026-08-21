// Docs/Motor presupuestal/AQUILA_SAAS_E16_...md §5 (fase 5, "previsualizar
// distribución") + REC-003: reutiliza allocate() del kernel financiero real
// (packages/financial-kernel, el mismo que usa liquidation-engine/executor.ts
// para la distribución por coeficiente) — no construye un segundo motor.
//
// A diferencia de liquidar() (packages/liquidation-engine), esto NO exige
// que existan periodos para el año del presupuesto ni ejecuta AEL: la
// necesidad financiera anual es aritmética simple (monto_total - otros
// ingresos aplicados), no depende de ningún concepto/fórmula. Por eso se
// invoca allocate() directamente en vez de liquidar(snapshot) completo —
// una previsualización de un presupuesto en borrador no tiene por qué
// depender de que ya existan los periodos del año que todavía se está
// preparando.
//
// No persiste nada — ninguna tabla nueva, ningún efecto secundario. Solo
// lectura (RLS via ctx.supabase) + cálculo.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado) — NO src/index.ts: el código fuente usa
// especificadores con extensión .js que apuntan a hermanos .ts (convención
// NodeNext), y Deno los resuelve literalmente, así que falla. El .js
// compilado sí es válido para Deno, pero pierde los exports type-only
// (RoundingPolicy, AllocationEntry...) en el barrel — por eso aquí solo se
// importan los valores en tiempo de ejecución (el algoritmo real y
// compartido, que es el punto de REC-003) y los tipos se declaran
// localmente más abajo en vez de encadenar resolución de tipos cross-runtime.
import { allocate, money, restar } from '../../../packages/financial-kernel/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  presupuesto_id: z.string().uuid(),
})

// Espejo local de AllocationEntry (packages/financial-kernel/src/allocation.ts)
// — ver comentario del import de arriba sobre por qué no se importa el tipo.
interface AllocationEntryLocal {
  readonly targetId: string
  readonly exactAmount: { readonly amount: { toString(): string } }
  readonly allocatedAmount: { readonly amount: { toString(): string } }
}

// Espejo local de RoundingPolicy['modo'] (financial-operation-service.ts).
type ModoRedondeoAllocate = 'HALF_UP' | 'HALF_EVEN' | 'DOWN' | 'UP'

// Mismo mapeo que packages/liquidation-engine/src/snapshot-supabase.ts —
// no se comparte entre Deno y Node, es un switch de 4 casos, no vale la
// pena la infraestructura cross-runtime para esto.
function mapearModoRedondeo(modo: 'half_up' | 'half_even' | 'down' | 'up'): ModoRedondeoAllocate {
  switch (modo) {
    case 'half_up':
      return 'HALF_UP'
    case 'half_even':
      return 'HALF_EVEN'
    case 'down':
      return 'DOWN'
    case 'up':
      return 'UP'
  }
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
    const { presupuesto_id: presupuestoId } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `presupuesto_previsualizar:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // Todas las lecturas siguientes van con ctx.supabase (contexto del
    // usuario) — RLS ya garantiza que solo se vea lo del tenant al que
    // pertenece; no hay comprobación de tenant_id manual porque no hace falta.
    const { data: presupuesto, error: errorPresupuesto } = await ctx.supabase
      .from('presupuestos')
      .select('id, tenant_id, anio, version, estado, monto_total')
      .eq('id', presupuestoId)
      .maybeSingle()
    if (errorPresupuesto) {
      logEvent({
        level: 'error',
        action: 'presupuesto_previsualizar.error_presupuesto',
        correlationId,
        actorId,
        message: errorPresupuesto.message,
      })
      return errorResponse(
        500,
        'INTERNAL_ERROR',
        errorPresupuesto.message,
        undefined,
        correlationId,
      )
    }
    if (!presupuesto) {
      return errorResponse(
        404,
        'PRESUPUESTO_NO_ENCONTRADO',
        'El presupuesto no existe o no es accesible.',
        undefined,
        correlationId,
      )
    }

    const { data: tenant, error: errorTenant } = await ctx.supabase
      .from('tenants')
      .select('moneda')
      .eq('id', presupuesto.tenant_id)
      .single()
    if (errorTenant) {
      return errorResponse(500, 'INTERNAL_ERROR', errorTenant.message, undefined, correlationId)
    }

    const { data: inmuebles, error: errorInmuebles } = await ctx.supabase
      .from('inmuebles')
      .select('id, codigo')
      .eq('tenant_id', presupuesto.tenant_id)
      .eq('estado', 'activo')
    if (errorInmuebles) {
      return errorResponse(500, 'INTERNAL_ERROR', errorInmuebles.message, undefined, correlationId)
    }
    if (inmuebles.length === 0) {
      return errorResponse(
        422,
        'SIN_INMUEBLES',
        'La copropiedad no tiene inmuebles activos para distribuir.',
        undefined,
        correlationId,
      )
    }

    const { data: setVigente, error: errorSet } = await ctx.supabase
      .from('coeficiente_sets')
      .select('id')
      .eq('tenant_id', presupuesto.tenant_id)
      .eq('estado', 'vigente')
      .maybeSingle()
    if (errorSet) {
      return errorResponse(500, 'INTERNAL_ERROR', errorSet.message, undefined, correlationId)
    }
    if (!setVigente) {
      return errorResponse(
        422,
        'COEFICIENTE_SET_NO_VIGENTE',
        'La copropiedad no tiene un set de coeficientes vigente.',
        undefined,
        correlationId,
      )
    }

    const { data: coeficientes, error: errorCoef } = await ctx.supabase
      .from('coeficientes')
      .select('inmueble_id, valor')
      .eq('set_id', setVigente.id)
    if (errorCoef) {
      return errorResponse(500, 'INTERNAL_ERROR', errorCoef.message, undefined, correlationId)
    }
    const coeficientePorInmueble = new Map(coeficientes.map((c) => [c.inmueble_id, c.valor]))

    const { data: politica, error: errorPolitica } = await ctx.supabase
      .from('politicas_financieras')
      .select('redondeo_modo, redondeo_escala')
      .eq('tenant_id', presupuesto.tenant_id)
      .eq('estado', 'vigente')
      .maybeSingle()
    if (errorPolitica) {
      return errorResponse(500, 'INTERNAL_ERROR', errorPolitica.message, undefined, correlationId)
    }
    if (!politica) {
      return errorResponse(
        422,
        'POLITICA_NO_VIGENTE',
        'La copropiedad no tiene una política financiera vigente.',
        undefined,
        correlationId,
      )
    }

    const { data: fuentes, error: errorFuentes } = await ctx.supabase
      .from('fuente_financiacion')
      .select('valor_aplicado, lista_tipos!inner(codigo)')
      .eq('presupuesto_id', presupuestoId)
      .eq('lista_tipos.codigo', 'otros_ingresos')
    if (errorFuentes) {
      return errorResponse(500, 'INTERNAL_ERROR', errorFuentes.message, undefined, correlationId)
    }

    const moneda = tenant.moneda
    const montoTotal = money(presupuesto.monto_total, moneda)
    const otrosIngresosAplicados = fuentes.reduce((acc, f) => acc + Number(f.valor_aplicado), 0)
    const necesidadFinanciera = restar(montoTotal, money(otrosIngresosAplicados, moneda))

    if (necesidadFinanciera.amount.isNegative()) {
      return errorResponse(
        422,
        'NECESIDAD_NEGATIVA',
        'Los otros ingresos aplicados superan el presupuesto total — revisa fuente_financiacion.',
        { monto_total: presupuesto.monto_total, otros_ingresos_aplicados: otrosIngresosAplicados },
        correlationId,
      )
    }

    const sinCoeficiente = inmuebles.filter((inmueble) => !coeficientePorInmueble.has(inmueble.id))
    if (sinCoeficiente.length > 0) {
      return errorResponse(
        422,
        'SIN_COEFICIENTE',
        'Uno o más inmuebles activos no tienen coeficiente en el set vigente.',
        { inmuebles: sinCoeficiente.map((i) => i.codigo) },
        correlationId,
      )
    }

    const targets = inmuebles.map((inmueble) => ({
      id: inmueble.id,
      codigo: inmueble.codigo,
      basis: String(coeficientePorInmueble.get(inmueble.id)),
    }))

    let resultado
    try {
      resultado = allocate({
        basisType: 'coefficient',
        sourceAmount: necesidadFinanciera,
        targets,
        policy: {
          modo: mapearModoRedondeo(politica.redondeo_modo),
          escala: politica.redondeo_escala,
        },
      })
    } catch (excepcion) {
      const mensaje = excepcion instanceof Error ? excepcion.message : 'Error de distribución.'
      logEvent({
        level: 'warn',
        action: 'presupuesto_previsualizar.allocation_error',
        correlationId,
        actorId,
        message: mensaje,
      })
      return errorResponse(422, 'DISTRIBUCION_INVALIDA', mensaje, undefined, correlationId)
    }

    const distribucion = resultado.entries.map((entrada: AllocationEntryLocal) => {
      const inmueble = targets.find((t) => t.id === entrada.targetId)
      return {
        inmueble_id: entrada.targetId,
        codigo: inmueble?.codigo ?? entrada.targetId,
        coeficiente: inmueble?.basis ?? null,
        valor_exacto: entrada.exactAmount.amount.toString(),
        valor_asignado: entrada.allocatedAmount.amount.toString(),
      }
    })

    return jsonResponse(
      {
        presupuesto_id: presupuestoId,
        anio: presupuesto.anio,
        version: presupuesto.version,
        estado: presupuesto.estado,
        moneda,
        monto_total: presupuesto.monto_total,
        otros_ingresos_aplicados: otrosIngresosAplicados,
        necesidad_financiera: necesidadFinanciera.amount.toString(),
        distribucion,
      },
      200,
      correlationId,
    )
  }),
}
