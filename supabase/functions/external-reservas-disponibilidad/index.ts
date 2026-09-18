// EXT-03 §3.1 · Consultar disponibilidad. Modo dual (mismo criterio que external-solicitudes-
// listar de EXT-02): sin zona_comun_id en el body → lista las zonas con regla de reserva vigente
// del tenant del vínculo (el spec nunca definió un endpoint de catálogo de zonas, pero tampoco
// previó otra forma de que la app las conozca); con zona_comun_id + fecha → franjas ocupadas +
// regla vigente de esa zona/fecha.
//
// zonas_comunes y mant_zona_reserva_regla exigen is_member(tenant_id) por RLS — un actor externo
// nunca es tenant_member (AD-37) — se leen con el cliente ADMIN tras resolver tenant_id vía el
// vínculo, mismo patrón exacto que external-solicitudes-catalogo (EXT-02) usó para lista_tipos.
//
// EXT-13 (Ola 2, M18) — cuando la zona tiene horario semanal configurado (mant_zona_horario_
// semanal), la respuesta agrega `franjas_validas` con las franjas del día consultado (mismo
// criterio de lectura vía admin). Si la zona no tiene NINGUNA fila ahí, la clave se omite por
// completo — compatibilidad hacia atrás explícita, ningún consumidor existente ve un campo nuevo.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'

interface VinculoFila {
  vinculo_id: string
  tenant_id: string
}

interface FilaHorarioSemanal {
  dia_semana: number
  hora_desde: string
  hora_hasta: string
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
  const cuerpo = body as { vinculo_id?: unknown; zona_comun_id?: unknown; fecha?: unknown } | null
  const vinculoId = cuerpo?.vinculo_id
  if (typeof vinculoId !== 'string') {
    return errorResponse(400, 'INVALID_PAYLOAD', 'vinculo_id es requerido.', undefined, correlationId)
  }
  const zonaComunId = typeof cuerpo?.zona_comun_id === 'string' ? cuerpo.zona_comun_id : null
  const fecha = typeof cuerpo?.fecha === 'string' ? cuerpo.fecha : null
  if (zonaComunId && !fecha) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'fecha es requerida junto con zona_comun_id.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }

  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!jwt) {
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere sesión activa.', undefined, correlationId)
  }
  const cliente = createClient<Database>(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const {
    data: { user },
  } = await cliente.auth.getUser(jwt)
  if (!user) {
    return errorResponse(401, 'UNAUTHENTICATED', 'Sesión inválida.', undefined, correlationId)
  }

  const { data: vinculos, error: errorVinculos } = await cliente.rpc('fn_actor_externo_mis_vinculos', {
    p_auth_user_id: user.id,
  })
  if (errorVinculos) {
    return errorResponse(500, 'INTERNAL_ERROR', errorVinculos.message, undefined, correlationId)
  }
  const vinculo = (vinculos as VinculoFila[] | null)?.find((v) => v.vinculo_id === vinculoId)
  if (!vinculo) {
    return errorResponse(
      403, 'VINCULO_NO_PERTENECE',
      'Este vínculo no existe, no es tuyo, o ya no está vigente.', undefined, correlationId,
    )
  }

  const admin = createClient<Database>(supabaseUrl, serviceKey)

  if (!zonaComunId) {
    const { data: zonas, error: errorZonas } = await admin
      .from('zonas_comunes')
      .select('id, codigo, nombre')
      .eq('tenant_id', vinculo.tenant_id)
      .order('nombre')
    if (errorZonas) {
      return errorResponse(500, 'INTERNAL_ERROR', errorZonas.message, undefined, correlationId)
    }
    const hoy = new Date().toISOString().slice(0, 10)
    const { data: reglas, error: errorReglas } = await admin
      .from('mant_zona_reserva_regla')
      .select('zona_comun_id')
      .eq('tenant_id', vinculo.tenant_id)
      .lte('vigente_desde', hoy)
      .or(`vigente_hasta.is.null,vigente_hasta.gte.${hoy}`)
    if (errorReglas) {
      return errorResponse(500, 'INTERNAL_ERROR', errorReglas.message, undefined, correlationId)
    }
    const zonasConRegla = new Set((reglas ?? []).map((r: { zona_comun_id: string }) => r.zona_comun_id))
    return jsonResponse(
      { zonas: (zonas ?? []).filter((z: { id: string }) => zonasConRegla.has(z.id)) },
      200, correlationId,
    )
  }

  const { data: zona, error: errorZona } = await admin
    .from('zonas_comunes')
    .select('id')
    .eq('id', zonaComunId)
    .eq('tenant_id', vinculo.tenant_id)
    .maybeSingle()
  if (errorZona) {
    return errorResponse(500, 'INTERNAL_ERROR', errorZona.message, undefined, correlationId)
  }
  if (!zona) {
    return errorResponse(404, 'RESERVA_ZONA_INEXISTENTE', 'Esta zona no existe.', undefined, correlationId)
  }

  const { data: regla, error: errorRegla } = await admin
    .from('mant_zona_reserva_regla')
    .select('requiere_aprobacion, duracion_maxima_minutos, anticipacion_minima_horas, '
      + 'anticipacion_maxima_dias, cupo_simultaneo, maximo_activas_por_inmueble, genera_cargo, '
      + 'concepto_id, penalidad_cancelacion_tardia_horas')
    .eq('zona_comun_id', zonaComunId)
    .eq('tenant_id', vinculo.tenant_id)
    .lte('vigente_desde', fecha!)
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${fecha!}`)
    .order('vigente_desde', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (errorRegla) {
    return errorResponse(500, 'INTERNAL_ERROR', errorRegla.message, undefined, correlationId)
  }

  let monto: number | null = null
  if (regla?.genera_cargo && regla.concepto_id) {
    const { data: concepto } = await admin.from('conceptos').select('valor_fijo').eq('id', regla.concepto_id).maybeSingle()
    monto = concepto?.valor_fijo ?? null
  }

  const { data: ocupadas, error: errorOcupadas } = await admin
    .from('mant_reservas')
    .select('hora_inicio, hora_fin')
    .eq('zona_comun_id', zonaComunId)
    .eq('fecha', fecha!)
    .in('estado', ['solicitada', 'aprobada'])
  if (errorOcupadas) {
    return errorResponse(500, 'INTERNAL_ERROR', errorOcupadas.message, undefined, correlationId)
  }

  const { data: horarioSemanal, error: errorHorario } = await admin
    .from('mant_zona_horario_semanal')
    .select('dia_semana, hora_desde, hora_hasta')
    .eq('zona_comun_id', zonaComunId)
    .eq('tenant_id', vinculo.tenant_id)
  if (errorHorario) {
    return errorResponse(500, 'INTERNAL_ERROR', errorHorario.message, undefined, correlationId)
  }
  let franjasValidas: { hora_desde: string; hora_hasta: string }[] | undefined
  if (horarioSemanal && horarioSemanal.length > 0) {
    // Mismo criterio que new Date(`${fecha}T00:00:00`) en el resto del frontend (formatoFecha):
    // medianoche local, sin conversión — igual que extract(dow from date) en el guard SQL.
    const diaSemana = new Date(`${fecha!}T00:00:00`).getDay()
    franjasValidas = (horarioSemanal as FilaHorarioSemanal[])
      .filter((f) => f.dia_semana === diaSemana)
      .map((f) => ({ hora_desde: f.hora_desde, hora_hasta: f.hora_hasta }))
      .sort((a, b) => a.hora_desde.localeCompare(b.hora_desde))
  }

  return jsonResponse(
    {
      ocupadas: ocupadas ?? [],
      regla: regla ? { ...regla, monto } : null,
      ...(franjasValidas !== undefined ? { franjas_validas: franjasValidas } : {}),
    },
    200, correlationId,
  )
})
