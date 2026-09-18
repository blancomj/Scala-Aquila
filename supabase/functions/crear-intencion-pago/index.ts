// Crear intención de pago por pasarela — Fase 2 §5. Tres vías: token (enlace
// HMAC del estado de cuenta, mismo mecanismo que ver-estado-cuenta, D-27),
// sesion (un auxiliar/administrador cobrando en nombre de un residente) o
// actor_externo (EXT-07 — el propio propietario/residente autenticado por
// actor_externo_vinculo, D-60/AD-37: tiene sesión real de Supabase Auth desde
// EXT-01, pero nunca es tenant_member, así que no puede pasar por 'sesion').
// La vía 'token' se mantiene para enlaces ya emitidos (correo del estado de
// cuenta) y para quien no tenga sesión iniciada.
//
// REGLA DE ORO (§1, §5.3): el monto lo decide el SERVIDOR, nunca el body del
// cliente sin verificar. inmueble_id/tenant_id SIEMPRE se derivan del lado
// del servidor (del documento de estado de cuenta ya autorizado, o de la
// membresía RLS-scoped) — jamás de lo que el cliente afirme.
//
// Ninguna credencial de pasarela sale de aquí: entra por
// fn_leer_credenciales_pasarela (service_role) y solo se usa para construir
// la intención con el adaptador; nunca en la respuesta, un log ni audit_log.
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { money } from '../../../packages/financial-kernel/dist/index.js'
import {
  ADAPTADORES,
  centavosDesdeMoney,
  construirReferencia,
} from '../../../packages/payment-gateways/dist/index.js'
import type { MetodoPago } from '../../../packages/payment-gateways/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import {
  extraerJwtDelHeader,
  resolverContextoActorExterno,
  respuestaErrorContextoActorExterno,
} from '../_shared/actor_externo_context.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { verificarTokenEnlace } from '../_shared/link_token.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

// IP-scoped, no por actor: varios residentes de la misma copropiedad pueden
// compartir la IP del router del edificio y generar cada uno su propio
// checkout la misma hora — 15 se quedaba corto para ese escenario real.
// Mismo orden de magnitud que configurar-pasarela (40/hora).
const RATE_LIMIT_MAX_HITS = 40
const RATE_LIMIT_VENTANA = '1 hour'
// Ventana corta: es un enlace de checkout, no la intención de negocio (esa
// vive en el estado de cuenta, 30 días vía D-27). Si el residente no termina
// de pagar en este plazo, el job de expiración (§7) cierra la fila; puede
// generar una nueva intención cuando quiera.
const VIGENCIA_INTENCION_MINUTOS = 30

const payloadSchema = z.discriminatedUnion('via', [
  z.object({
    via: z.literal('token'),
    estado_cuenta_id: z.string().uuid(),
    t: z.string().min(1),
    monto: z.number().positive().optional(),
    metodo: z.string().trim().min(1),
  }),
  z.object({
    via: z.literal('sesion'),
    inmueble_id: z.string().uuid(),
    monto: z.number().positive().optional(),
    metodo: z.string().trim().min(1),
  }),
  z.object({
    via: z.literal('actor_externo'),
    vinculo_id: z.string().uuid(),
    monto: z.number().positive().optional(),
    metodo: z.string().trim().min(1),
  }),
])

function ipDelRequest(req: Request): string {
  const reenviada = req.headers.get('x-forwarded-for')
  const primera = reenviada?.split(',')[0]?.trim()
  return primera && primera.length > 0 ? primera : 'desconocida'
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
    return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser JSON válido.', undefined, correlationId)
  }
  const parseo = payloadSchema.safeParse(body)
  if (!parseo.success) {
    return errorResponse(
      400,
      'INVALID_PAYLOAD',
      parseo.error.issues[0]?.message ?? 'Payload inválido.',
      undefined,
      correlationId,
    )
  }
  const datos = parseo.data

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const ip = ipDelRequest(req)
  const { data: permitidoIp } = await admin.rpc('check_rate_limit', {
    p_bucket: `crear_intencion_ip:${ip}`,
    p_max_hits: RATE_LIMIT_MAX_HITS,
    p_window: RATE_LIMIT_VENTANA,
  })
  if (permitidoIp === false) {
    return errorResponse(429, 'RATE_LIMITED', 'Demasiados intentos. Inténtalo más tarde.', undefined, correlationId)
  }

  // ── Autorización + resolución de tenant/inmueble, del lado del servidor ──
  let tenantId: string
  let inmuebleId: string
  let creadaPor: string | null

  if (datos.via === 'token') {
    const { data: estadoCuenta, error: errorEC } = await admin
      .from('estados_cuenta_generados')
      .select('tenant_id, inmueble_id, created_at')
      .eq('id', datos.estado_cuenta_id)
      .maybeSingle()
    if (errorEC) {
      return errorResponse(500, 'INTERNAL_ERROR', errorEC.message, undefined, correlationId)
    }
    if (!estadoCuenta) {
      return errorResponse(404, 'ESTADO_CUENTA_NO_ENCONTRADO', 'Este comprobante no existe.', undefined, correlationId)
    }
    const veredicto = await verificarTokenEnlace(datos.t, datos.estado_cuenta_id)
    if (veredicto === 'invalido') {
      return errorResponse(403, 'ESTADO_CUENTA_ENLACE_INVALIDO', 'Este enlace no es válido.', undefined, correlationId)
    }
    if (veredicto === 'vencido') {
      return errorResponse(410, 'ESTADO_CUENTA_VENCIDO', 'Este enlace venció.', undefined, correlationId)
    }
    tenantId = estadoCuenta.tenant_id
    inmuebleId = estadoCuenta.inmueble_id
    creadaPor = null
  } else if (datos.via === 'actor_externo') {
    const jwtActorExterno = extraerJwtDelHeader(req)
    const contexto = await resolverContextoActorExterno(admin, jwtActorExterno, datos.vinculo_id)
    if ('tipo' in contexto) {
      return respuestaErrorContextoActorExterno(contexto, correlationId)
    }
    tenantId = contexto.tenantId
    inmuebleId = contexto.inmuebleId
    // A diferencia de 'sesion' (un auxiliar cobrando en nombre de otro, creadaPor=null no aplica
    // aquí), el propio actor externo SÍ tiene fila en `profiles` (handle_new_user se dispara para
    // cualquier alta en auth.users, incluida la de EXT-01) — trazarlo es correcto, no un relleno
    // forzado de una columna que no lo espera.
    creadaPor = contexto.authUserId
  } else {
    const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!jwt) {
      return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere sesión activa.', undefined, correlationId)
    }
    const { data: userData, error: errorUser } = await admin.auth.getUser(jwt)
    const userId = userData?.user?.id
    if (errorUser || !userId) {
      return errorResponse(401, 'UNAUTHENTICATED', 'Sesión inválida.', undefined, correlationId)
    }
    const { data: inmueble, error: errorInmueble } = await admin
      .from('inmuebles')
      .select('id, tenant_id')
      .eq('id', datos.inmueble_id)
      .maybeSingle()
    if (errorInmueble) {
      return errorResponse(500, 'INTERNAL_ERROR', errorInmueble.message, undefined, correlationId)
    }
    if (!inmueble) {
      return errorResponse(404, 'INMUEBLE_NO_ENCONTRADO', 'El inmueble no existe.', undefined, correlationId)
    }
    // has_role() lee auth.uid() por dentro — llamarla desde el cliente
    // service_role (sin JWT de usuario) siempre daría false. Se replica su
    // condición ('auxiliar' o 'administrador', activo) con una consulta
    // directa: admin ya saltó RLS y el userId ya se verificó arriba contra
    // el propio JWT (admin.auth.getUser), así que esto no abre nada nuevo.
    const { data: membership } = await admin
      .from('memberships')
      .select('role')
      .eq('user_id', userId)
      .eq('tenant_id', inmueble.tenant_id)
      .eq('status', 'active')
      .maybeSingle()
    const esAgent = membership?.role === 'auxiliar' || membership?.role === 'administrador'
    if (!esAgent) {
      return errorResponse(403, 'FORBIDDEN', 'Solo un auxiliar o administrador puede generar un cobro.', undefined, correlationId)
    }
    tenantId = inmueble.tenant_id
    inmuebleId = inmueble.id
    creadaPor = userId
  }

  const bloqueoInmueble = await enforceRateLimit(
    admin,
    `crear_intencion_inmueble:${inmuebleId}`,
    RATE_LIMIT_MAX_HITS,
    RATE_LIMIT_VENTANA,
    correlationId,
  )
  if (bloqueoInmueble) return bloqueoInmueble

  const [{ data: tenant, error: errorTenant }, { data: inmueble, error: errorInmuebleCodigo }] =
    await Promise.all([
      admin.from('tenants').select('moneda, slug').eq('id', tenantId).single(),
      admin.from('inmuebles').select('codigo').eq('id', inmuebleId).single(),
    ])
  if (errorTenant || !tenant) {
    return errorResponse(500, 'INTERNAL_ERROR', errorTenant?.message ?? 'Tenant no encontrado.', undefined, correlationId)
  }
  if (errorInmuebleCodigo || !inmueble) {
    return errorResponse(500, 'INTERNAL_ERROR', errorInmuebleCodigo?.message ?? 'Inmueble no encontrado.', undefined, correlationId)
  }

  // ── §5.3: el monto NUNCA supera el saldo pendiente real ──────────────────
  const { data: cargos, error: errorCargos } = await admin
    .from('v_cargo_saldo')
    .select('monto_pendiente')
    .eq('inmueble_id', inmuebleId)
    .gt('monto_pendiente', 0)
  if (errorCargos) {
    return errorResponse(500, 'INTERNAL_ERROR', errorCargos.message, undefined, correlationId)
  }
  const saldoPendiente = (cargos ?? []).reduce((acc, c) => acc + Number(c.monto_pendiente), 0)
  if (saldoPendiente <= 0) {
    return errorResponse(422, 'PAGO_INVALIDO', 'Este inmueble no tiene saldo pendiente por cobrar.', undefined, correlationId)
  }
  const montoSolicitado = datos.monto ?? saldoPendiente
  if (montoSolicitado > saldoPendiente) {
    return errorResponse(
      422,
      'PASARELA_MONTO_EXCEDE_SALDO',
      `El monto solicitado (${String(montoSolicitado)}) excede el saldo pendiente real `
        + `(${String(saldoPendiente)}).`,
      undefined,
      correlationId,
    )
  }
  const montoMoney = money(montoSolicitado, tenant.moneda)

  // ── Pasarela activa del tenant ────────────────────────────────────────
  const { data: config, error: errorConfig } = await admin
    .from('pasarela_config')
    .select('id, proveedor, modo, webhook_token')
    .eq('tenant_id', tenantId)
    .eq('activa', true)
    .maybeSingle()
  if (errorConfig) {
    return errorResponse(500, 'INTERNAL_ERROR', errorConfig.message, undefined, correlationId)
  }
  if (!config) {
    return errorResponse(422, 'PASARELA_NO_CONFIGURADA', 'Esta copropiedad no tiene una pasarela activa.', undefined, correlationId)
  }

  const adaptador = ADAPTADORES[config.proveedor]
  if (!adaptador.capacidades.metodosSoportados.includes(datos.metodo as MetodoPago)) {
    return errorResponse(
      400,
      'PASARELA_CREDENCIAL_INVALIDA',
      `${adaptador.nombreComercial} no soporta el método "${datos.metodo}".`,
      undefined,
      correlationId,
    )
  }

  const { data: credencialesFilas, error: errorCred } = await admin.rpc(
    'fn_leer_credenciales_pasarela',
    { p_config_id: config.id, p_tenant_id: tenantId },
  )
  if (errorCred) {
    return errorResponse(500, 'INTERNAL_ERROR', 'No se pudieron leer las credenciales de la pasarela.', undefined, correlationId)
  }
  const credenciales: Record<string, string> = {}
  for (const fila of credencialesFilas ?? []) {
    credenciales[fila.nombre] = fila.valor
  }
  const faltantes = adaptador.capacidades.credencialesRequeridas.filter((n) => !(n in credenciales))
  if (faltantes.length > 0) {
    return errorResponse(
      422,
      'PASARELA_CREDENCIAL_FALTANTE',
      `Faltan credenciales de ${adaptador.nombreComercial}: ${faltantes.join(', ')}.`,
      undefined,
      correlationId,
    )
  }

  // ── Referencia estructurada (§3.2) ────────────────────────────────────
  const ahora = new Date()
  const periodoActual = `${String(ahora.getUTCFullYear())}${String(ahora.getUTCMonth() + 1).padStart(2, '0')}`
  const intencionUuid = crypto.randomUUID()
  const referencia = construirReferencia({
    tenantSlug: tenant.slug,
    codigoInmueble: inmueble.codigo,
    periodo: periodoActual,
    uuid: intencionUuid,
  })

  const appUrl = Deno.env.get('APP_URL') ?? Deno.env.get('NUXT_PUBLIC_APP_URL') ?? 'http://localhost:3000'

  const { error: errorInsert } = await admin.from('intenciones_pago').insert({
    id: intencionUuid,
    tenant_id: tenantId,
    inmueble_id: inmuebleId,
    proveedor: config.proveedor,
    referencia,
    monto: montoSolicitado,
    estado: 'creada',
    metodo: datos.metodo,
    expira_at: new Date(Date.now() + VIGENCIA_INTENCION_MINUTOS * 60_000).toISOString(),
    creada_por: creadaPor,
  })
  if (errorInsert) {
    return errorResponse(500, 'INTERNAL_ERROR', errorInsert.message, undefined, correlationId)
  }

  try {
    const resultado = await adaptador.crearIntencion({
      montoCentavos: centavosDesdeMoney(montoMoney),
      moneda: tenant.moneda,
      referencia,
      metodo: datos.metodo as MetodoPago,
      urlRetorno: `${appUrl}/pago/resultado?intencion=${intencionUuid}`,
      modo: config.modo,
      credenciales,
    })

    // creada -> pendiente: la intención ya tiene un checkout real esperando
    // al residente. Transición explícita, nunca directa en el INSERT — si el
    // adaptador falla arriba, la fila se queda en 'creada' y el job de
    // expiración (§7) la cierra sola.
    await admin.from('intenciones_pago').update({ estado: 'pendiente' }).eq('id', intencionUuid)

    logEvent({
      level: 'info',
      action: 'crear_intencion_pago.completada',
      correlationId,
      tenantId,
      meta: { intencionId: intencionUuid, proveedor: config.proveedor, via: datos.via },
    })

    return jsonResponse(
      { intencion_id: intencionUuid, referencia, resultado, monto: montoSolicitado },
      200,
      correlationId,
    )
  } catch (excepcion) {
    const mensaje = excepcion instanceof Error ? excepcion.message : 'No se pudo iniciar el cobro.'
    logEvent({
      level: 'error',
      action: 'crear_intencion_pago.fallida',
      correlationId,
      tenantId,
      message: mensaje,
      meta: { intencionId: intencionUuid, proveedor: config.proveedor },
    })
    return errorResponse(502, 'INTERNAL_ERROR', mensaje, undefined, correlationId)
  }
})
