// ENFOQUE_CONSOLIDACION · paso 0 — "¿por qué cambió la cartera?".
//
// DB-FIRST: la comparación entre los dos cortes la hace
// fn_variacion_cartera (20260934050000), que internamente llama dos veces
// a fn_dashboard_cartera y hace el FULL OUTER JOIN por inmueble más el
// conteo de eventos del período. Esta función NO compara nada: recibe una
// fila por inmueble ya comparada y compone la respuesta con
// calcularVariacionCartera() (TS puro, suma/clasifica/ordena) — mismo
// reparto de trabajo que cartera-dashboard con REC-CAR-004.
//
// Ningún concepto financiero se define ni se recalcula aquí (DI-04): qué
// es deuda vencida lo decide fn_dashboard_cartera.
//
// Las dos fechas de corte son explícitas y las decide el llamador (AD-32
// — nunca Date.now() implícito). La UI muestra ambas para que el usuario
// sepa qué se compara contra qué.
//
// Rol mínimo: cualquier miembro del tenant (is_member) — mismo criterio
// que cartera-dashboard: es una lectura, no una decisión de negocio.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado), no src/index.ts — mismo motivo que
// cartera-dashboard/index.ts.
import {
  calcularVariacionCartera,
  explicarVariacionCartera,
  obtenerEventosVariacionPorTipo,
  obtenerFilasVariacionCartera,
} from '../../../packages/liquidation-engine/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import type { Afirmacion, Explicacion } from '../../../packages/shared/src/explicacion.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 30
const RATE_LIMIT_VENTANA = '1 hour'
const TOP_N_DEFAULT = 10
const TOP_N_MAX = 50
const TIPOS_EVENTO_MAX = 8

// Espejo local — dist/index.js pierde los exports type-only al compilar
// (mismo patrón que InmuebleCarteraResumenLocal en cartera-dashboard).
interface MoneyLocal {
  readonly amount: { toString(): string }
}
interface DeltaLocal {
  readonly anterior: MoneyLocal
  readonly actual: MoneyLocal
  readonly delta: MoneyLocal
  readonly pctCambio: number | null
}
interface ContribuyenteLocal {
  readonly inmuebleId: string
  readonly codigo: string
  readonly vencidaAnterior: MoneyLocal
  readonly vencidaActual: MoneyLocal
  readonly delta: MoneyLocal
  readonly clase: string
  readonly diasMoraMaximo: number
  readonly etapaCobranza: string
  readonly eventosEnPeriodo: number
}
interface AfirmacionLocal {
  readonly tipo: Afirmacion['tipo']
  readonly texto: string
  readonly evidencia: { readonly entidad: string; readonly id: string | null; readonly fuente: string; readonly fechaCorte: string | null }
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/

const payloadSchema = z
  .object({
    tenant_id: z.string().uuid(),
    fecha_corte_anterior: z.string().regex(FECHA, 'fecha_corte_anterior debe ser YYYY-MM-DD.'),
    fecha_corte_actual: z.string().regex(FECHA, 'fecha_corte_actual debe ser YYYY-MM-DD.'),
    top_n: z.number().int().min(1).max(TOP_N_MAX).optional().default(TOP_N_DEFAULT),
  })
  .refine((p) => p.fecha_corte_anterior < p.fecha_corte_actual, {
    message: 'fecha_corte_anterior debe ser anterior a fecha_corte_actual.',
    path: ['fecha_corte_anterior'],
  })

function dinero(m: MoneyLocal): string {
  return m.amount.toString()
}

function serializarDelta(d: DeltaLocal) {
  return {
    anterior: dinero(d.anterior),
    actual: dinero(d.actual),
    delta: dinero(d.delta),
    pctCambio: d.pctCambio,
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
      return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser JSON válido.', undefined, correlationId)
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
      fecha_corte_anterior: fechaCorteAnterior,
      fecha_corte_actual: fechaCorteActual,
      top_n: topN,
    } = parseo.data

    // fn_variacion_cartera evalúa fn_dashboard_cartera dos veces: es más
    // pesada que el dashboard, por eso el límite es la mitad.
    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `cartera_variacion:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: esMiembro, error: errorMembresia } = await ctx.supabase.rpc('is_member', { p_tenant: tenantId })
    if (errorMembresia) {
      return errorResponse(500, 'INTERNAL_ERROR', errorMembresia.message, undefined, correlationId)
    }
    if (!esMiembro) {
      return errorResponse(403, 'FORBIDDEN', 'No eres miembro de este tenant.', undefined, correlationId)
    }

    const { data: tenant, error: errorTenant } = await ctx.supabase
      .from('tenants')
      .select('moneda')
      .eq('id', tenantId)
      .maybeSingle()
    if (errorTenant) {
      return errorResponse(500, 'INTERNAL_ERROR', errorTenant.message, undefined, correlationId)
    }
    if (!tenant) {
      return errorResponse(404, 'TENANT_NO_ENCONTRADO', 'El tenant no existe o no es accesible.', undefined, correlationId)
    }

    const filas = await obtenerFilasVariacionCartera(ctx.supabase, {
      tenantId,
      fechaCorteAnterior,
      fechaCorteActual,
      moneda: tenant.moneda,
    })

    // Sin inmuebles en ninguno de los dos cortes no hay comparación
    // posible. Se responde 200 con `comparable: false` en vez de un error:
    // "no hay base de comparación" es una respuesta legítima, no un fallo
    // (prompt P0 §6).
    if (filas.length === 0) {
      return jsonResponse(
        { comparable: false, motivo: 'SIN_DATOS', fechaCorteAnterior, fechaCorteActual },
        200,
        correlationId,
      )
    }

    const variacion = calcularVariacionCartera(filas, tenant.moneda)
    const porTipo = await obtenerEventosVariacionPorTipo(ctx.supabase, {
      tenantId,
      fechaCorteAnterior,
      fechaCorteActual,
    })

    // Cast justificado: mismo problema de resolución de tipos que motiva
    // los espejos locales arriba — el valor en ejecución es el real.
    const contribuyentes = variacion.contribuyentes as unknown as ContribuyenteLocal[]
    const afirmaciones = explicarVariacionCartera(variacion, {
      fechaCorteAnterior,
      fechaCorteActual,
    }) as unknown as AfirmacionLocal[]
    // Único lugar que ensambla el contrato Explicacion (Ola 2 §2): el
    // núcleo de liquidation-engine no puede importar @aquila/shared
    // (D-14), así que arma afirmaciones sueltas y esta capa I/O las
    // envuelve en el contrato real.
    const explicacion: Explicacion = {
      origenModulo: 'cartera_cobranza',
      origenEntidad: 'variacion_cartera',
      origenId: tenantId,
      afirmaciones: afirmaciones as unknown as Afirmacion[],
    }

    return jsonResponse(
      {
        comparable: true,
        fechaCorteAnterior,
        fechaCorteActual,
        moneda: tenant.moneda,
        conceptos: {
          total: serializarDelta(variacion.total as unknown as DeltaLocal),
          vencida: serializarDelta(variacion.vencida as unknown as DeltaLocal),
          corriente: serializarDelta(variacion.corriente as unknown as DeltaLocal),
          sinVencimiento: serializarDelta(variacion.sinVencimiento as unknown as DeltaLocal),
          interesCausado: serializarDelta(variacion.interesCausado as unknown as DeltaLocal),
        },
        incrementoBruto: dinero(variacion.incrementoBruto as unknown as MoneyLocal),
        reduccionBruta: dinero(variacion.reduccionBruta as unknown as MoneyLocal),
        concentracion: {
          inmuebles: variacion.concentracion.inmuebles,
          monto: dinero(variacion.concentracion.monto as unknown as MoneyLocal),
          pctDelIncremento: variacion.concentracion.pctDelIncremento,
          umbralPct: variacion.concentracion.umbralPct,
        },
        conteos: {
          ...variacion.conteos,
          inmueblesComparados: variacion.inmueblesComparados,
        },
        // calcularVariacionCartera solo devuelve los que subieron: la
        // tabla responde "quién aportó al aumento". Los que bajaron se
        // resumen en conteos.
        contribuyentes: contribuyentes.slice(0, topN).map((c) => ({
          inmuebleId: c.inmuebleId,
          codigo: c.codigo,
          vencidaAnterior: dinero(c.vencidaAnterior),
          vencidaActual: dinero(c.vencidaActual),
          delta: dinero(c.delta),
          clase: c.clase,
          diasMoraMaximo: c.diasMoraMaximo,
          etapaCobranza: c.etapaCobranza,
          eventosEnPeriodo: c.eventosEnPeriodo,
        })),
        atribucion: {
          explicado: {
            inmuebles: variacion.atribucion.explicado.inmuebles,
            monto: dinero(variacion.atribucion.explicado.monto as unknown as MoneyLocal),
          },
          sinExplicar: {
            inmuebles: variacion.atribucion.sinExplicar.inmuebles,
            monto: dinero(variacion.atribucion.sinExplicar.monto as unknown as MoneyLocal),
          },
          porTipo: porTipo.slice(0, TIPOS_EVENTO_MAX),
        },
        explicacion,
      },
      200,
      correlationId,
    )
  }),
}
