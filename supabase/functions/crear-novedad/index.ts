// E4 — expone la creación de novedades (Docs/16 §26-30). Escritura directa
// vía ctx.supabase (RLS-scoped): novedades_insert_agent ya autoriza
// (has_role agent + estado='pendiente') sin efecto colateral que requiera
// service_role, a diferencia de aprobar-novedad (ver esa cabecera).
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 30
const RATE_LIMIT_VENTANA = '1 hour'

// AD-30: regla de signo por tipo.
const TIPOS_POSITIVOS = ['CHARGE', 'DEBIT'] as const
const TIPOS_NEGATIVOS = ['DISCOUNT', 'CREDIT', 'REFUND'] as const

const payloadSchema = z
  .object({
    inmueble_id: z.string().uuid(),
    concepto_id: z.string().uuid().optional(),
    tipo: z.enum(['CHARGE', 'DISCOUNT', 'ADJUSTMENT', 'REFUND', 'CREDIT', 'DEBIT']),
    tipo_novedad_id: z.number().int().positive().optional(),
    presupuesto_cuenta_id: z.string().uuid().optional(),
    monto: z.number().finite(),
    descripcion: z.string().trim().min(1),
    fecha_efectiva: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_efectiva debe ser YYYY-MM-DD.'),
    // Conceptos avanzados Fase 4 — mutuamente excluyentes (novedades_permanente_prorrateable_exclusivos).
    permanente: z.boolean().optional(),
    prorrateable: z.boolean().optional(),
    cuotas_totales: z.number().int().positive().optional(),
  })
  .refine(
    (payload) =>
      !TIPOS_POSITIVOS.includes(payload.tipo as (typeof TIPOS_POSITIVOS)[number]) ||
      payload.monto > 0,
    { message: 'CHARGE/DEBIT requieren monto positivo (AD-30).', path: ['monto'] },
  )
  .refine(
    (payload) =>
      !TIPOS_NEGATIVOS.includes(payload.tipo as (typeof TIPOS_NEGATIVOS)[number]) ||
      payload.monto < 0,
    { message: 'DISCOUNT/CREDIT/REFUND requieren monto negativo (AD-30).', path: ['monto'] },
  )
  .refine((payload) => !(payload.permanente && payload.prorrateable), {
    message: 'permanente y prorrateable son mutuamente excluyentes.',
    path: ['permanente'],
  })
  .refine((payload) => !payload.prorrateable || (payload.cuotas_totales ?? 0) > 1, {
    message: 'prorrateable exige cuotas_totales > 1.',
    path: ['cuotas_totales'],
  })
  .refine((payload) => payload.prorrateable || payload.cuotas_totales === undefined, {
    message: 'cuotas_totales solo aplica cuando prorrateable=true.',
    path: ['cuotas_totales'],
  })
  .refine(
    (payload) => !(payload.permanente || payload.prorrateable) || payload.concepto_id !== undefined,
    {
      message:
        'Una novedad permanente o prorrateable exige concepto_id (el concepto Novedad del tenant).',
      path: ['concepto_id'],
    },
  )

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
    const datos = parseo.data
    // Sin decisión canónica (Doc19 §289) — se rechaza: no tiene sentido de
    // negocio registrar un ajuste de $0 (decisión de esta entrega).
    if (datos.monto === 0) {
      return errorResponse(
        400,
        'ADJUSTMENT_ZERO_AMOUNT',
        'monto no puede ser cero.',
        undefined,
        correlationId,
      )
    }

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `crear_novedad:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // Lectura RLS-scoped: solo resuelve el inmueble si el usuario es miembro
    // de ese tenant — nunca se confía en un tenant_id enviado por el cliente.
    const { data: inmueble, error: errorInmueble } = await ctx.supabase
      .from('inmuebles')
      .select('id, tenant_id')
      .eq('id', datos.inmueble_id)
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

    const { data: esAgent, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: inmueble.tenant_id,
      p_roles: ['auxiliar'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!esAgent) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un agent puede crear novedades.',
        undefined,
        correlationId,
      )
    }

    const { data: novedad, error: errorInsert } = await ctx.supabase
      .from('novedades')
      .insert({
        tenant_id: inmueble.tenant_id,
        inmueble_id: datos.inmueble_id,
        concepto_id: datos.concepto_id ?? null,
        tipo: datos.tipo,
        tipo_novedad_id: datos.tipo_novedad_id ?? null,
        presupuesto_cuenta_id: datos.presupuesto_cuenta_id ?? null,
        monto: datos.monto,
        descripcion: datos.descripcion,
        fecha_efectiva: datos.fecha_efectiva,
        permanente: datos.permanente ?? false,
        prorrateable: datos.prorrateable ?? false,
        cuotas_totales: datos.cuotas_totales ?? null,
        created_by: actorId,
      })
      .select()
      .single()
    if (errorInsert) {
      return errorResponse(500, 'INTERNAL_ERROR', errorInsert.message, undefined, correlationId)
    }

    logEvent({
      level: 'info',
      action: 'crear_novedad.completada',
      correlationId,
      actorId,
      tenantId: inmueble.tenant_id,
      meta: { novedadId: novedad.id },
    })

    return jsonResponse(novedad, 200, correlationId)
  }),
}
