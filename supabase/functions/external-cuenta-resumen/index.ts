// EXT-07 §7.2 — "Estado de cuenta en vivo" para Mi Copropiedad: distinto del comprobante formal
// notariado (estados_cuenta_generados + ver-estado-cuenta, D-27, que NO se toca aquí — ver
// PROMPT_MI_COPROPIEDAD_FASE1.md §4.3). Esta es una vista de trabajo sobre v_cargo_saldo,
// consultada on-demand por el propio actor externo autenticado, sin folio ni hash.
//
// Por qué admin (service_role) y no el patrón anon+JWT de external-solicitudes-listar: v_cargo_saldo
// es `security_invoker = true` y hereda la RLS de `cargos`, cuya única política de SELECT
// (cargos_select_agent_auditor) exige `has_role(tenant_id, ['auxiliar','auditor'])` — un actor
// externo NUNCA es tenant_member (AD-37), así que consultarla con su propio JWT devolvería siempre
// cero filas. Mismo camino que ya usan ver-estado-cuenta/crear-intencion-pago para sus lecturas
// financieras: admin resuelve el contexto (_shared/actor_externo_context.ts) y filtra
// explícitamente por el inmueble_id ya verificado — nunca por lo que mande el cliente.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import {
  extraerJwtDelHeader,
  resolverContextoActorExterno,
  respuestaErrorContextoActorExterno,
} from '../_shared/actor_externo_context.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

interface FilaCargoSaldo {
  concepto_id: string | null
  periodo_id: string
  monto_pendiente: number | string
  fecha_vencimiento: string | null
}

interface Obligacion {
  concepto: string
  periodo: string
  monto_pendiente: number
  estado: 'vencido' | 'pendiente'
  fecha_vencimiento: string | null
}

interface FilaConcepto {
  id: string
  nombre: string
}

interface FilaPeriodo {
  id: string
  anio: number
  mes: number
}

Deno.serve(async (req) => {
  const preflight = respuestaPreflight(req)
  if (preflight) return preflight

  const correlationId = crypto.randomUUID()
  if (req.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Solo POST.', undefined, correlationId)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser JSON.', undefined, correlationId)
  }
  const vinculoId = (body as { vinculo_id?: unknown } | null)?.vinculo_id
  if (typeof vinculoId !== 'string' || vinculoId.length === 0) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'vinculo_id es requerido.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const jwt = extraerJwtDelHeader(req)
  const contexto = await resolverContextoActorExterno(admin, jwt, vinculoId)
  if ('tipo' in contexto) {
    return respuestaErrorContextoActorExterno(contexto, correlationId)
  }

  const bloqueo = await enforceRateLimit(
    admin,
    `cuenta_resumen_vinculo:${contexto.vinculoId}`,
    RATE_LIMIT_MAX_HITS,
    RATE_LIMIT_VENTANA,
    correlationId,
  )
  if (bloqueo) return bloqueo

  const [{ data: inmueble, error: errorInmueble }, { data: cargos, error: errorCargos }] =
    await Promise.all([
      admin.from('inmuebles').select('id, codigo').eq('id', contexto.inmuebleId).maybeSingle(),
      admin
        .from('v_cargo_saldo')
        .select('concepto_id, periodo_id, monto_pendiente, fecha_vencimiento')
        .eq('inmueble_id', contexto.inmuebleId)
        .gt('monto_pendiente', 0),
    ])
  if (errorInmueble) {
    return errorResponse(500, 'INTERNAL_ERROR', errorInmueble.message, undefined, correlationId)
  }
  if (!inmueble) {
    return errorResponse(404, 'INMUEBLE_NO_ENCONTRADO', 'El inmueble no existe.', undefined, correlationId)
  }
  if (errorCargos) {
    return errorResponse(500, 'INTERNAL_ERROR', errorCargos.message, undefined, correlationId)
  }

  const filas = (cargos ?? []) as FilaCargoSaldo[]
  // `cargos.concepto_id` SÍ admite null (verificado: `\d cargos` — a diferencia de `periodo_id`,
  // `not null`) — un cargo puede no tener concepto de catálogo vinculado. Sin este filtro,
  // `.in('id', conceptoIds)` mandaba un `null` dentro de la lista y PostgREST fallaba con
  // "invalid input syntax for type uuid" al intentar parsearlo como uuid — bug real, hallado con
  // datos QA reales (T1-101 tiene cargos con concepto_id null), no con los fixtures de prueba
  // (que siempre rellenan concepto_id). `nombreConcepto.get(null)` ya cae al fallback 'Concepto'
  // más abajo sin cambios.
  const conceptoIds = [...new Set(filas.map((f) => f.concepto_id).filter((id): id is string => id !== null))]
  const periodoIds = [...new Set(filas.map((f) => f.periodo_id))]

  const [{ data: conceptos, error: errorConceptos }, { data: periodos, error: errorPeriodos }] =
    await Promise.all([
      conceptoIds.length > 0
        ? admin.from('conceptos').select('id, nombre').in('id', conceptoIds)
        : Promise.resolve({ data: [] as FilaConcepto[], error: null }),
      periodoIds.length > 0
        ? admin.from('periodos').select('id, anio, mes').in('id', periodoIds)
        : Promise.resolve({ data: [] as FilaPeriodo[], error: null }),
    ])
  if (errorConceptos) {
    return errorResponse(500, 'INTERNAL_ERROR', errorConceptos.message, undefined, correlationId)
  }
  if (errorPeriodos) {
    return errorResponse(500, 'INTERNAL_ERROR', errorPeriodos.message, undefined, correlationId)
  }

  const nombreConcepto = new Map(
    ((conceptos ?? []) as FilaConcepto[]).map((c) => [c.id, c.nombre]),
  )
  const etiquetaPeriodo = new Map(
    ((periodos ?? []) as FilaPeriodo[]).map((p) => [
      p.id,
      `${String(p.mes).padStart(2, '0')}/${String(p.anio)}`,
    ]),
  )

  // Vencido/pendiente es una etiqueta descriptiva mínima para esta vista de trabajo — NO
  // reemplaza ni consulta el motor de clasificación de cartera (políticas de tramos), que es un
  // dominio propio y no se duplica aquí (PLAN_MI_COPROPIEDAD.md §3, "no exponer" salvo capability
  // explícita).
  const hoy = new Date().toISOString().slice(0, 10)
  const obligaciones: Obligacion[] = filas.map((f) => ({
    concepto: (f.concepto_id ? nombreConcepto.get(f.concepto_id) : undefined) ?? 'Concepto',
    periodo: etiquetaPeriodo.get(f.periodo_id) ?? '—',
    monto_pendiente: Number(f.monto_pendiente),
    estado: f.fecha_vencimiento && f.fecha_vencimiento < hoy ? 'vencido' : 'pendiente',
    fecha_vencimiento: f.fecha_vencimiento,
  }))

  const saldoTotal = obligaciones.reduce((acc, o) => acc + o.monto_pendiente, 0)

  // Mismo chequeo que ver-estado-cuenta (Fase 2, D-32): un booleano público sobre si esta
  // copropiedad tiene pasarela activa, nunca las credenciales.
  const { data: pasarelaActiva } = await admin
    .from('pasarela_config')
    .select('id')
    .eq('tenant_id', contexto.tenantId)
    .eq('activa', true)
    .maybeSingle()

  return jsonResponse(
    {
      inmueble: { id: inmueble.id, codigo: inmueble.codigo },
      saldo_total: saldoTotal,
      obligaciones,
      pago_habilitado: !!pasarelaActiva,
    },
    200,
    correlationId,
  )
})
