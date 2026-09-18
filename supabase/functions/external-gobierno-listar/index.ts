// EXT-11 §6.1/§7.1 (Ola 3, M20) — "Gobierno" de solo lectura para el actor externo: reuniones ya
// instaladas/cerradas, su convocatoria + agenda congelada, el acta (solo si ya está `publicada` —
// puesta a disposición real, art. 47 — nunca en `borrador`/`en_verificacion`/`suscrita`) y el
// RESULTADO agregado de cada votación cerrada. NUNCA se exponen `gobierno_poderes` (quién
// representó a quién) ni `gobierno_votos` (el voto individual de cada miembro/inmueble) — son
// datos personales de otros propietarios, fuera de alcance de este corte (PROMPT_MI_COPROPIEDAD_
// FASE3.md §1.2/§3).
//
// El dominio de gobierno es TENANT-COMPLETO, no por inmueble (ninguna tabla gobierno_* tiene
// columna inmueble_id, confirmado leyendo gob2_reuniones/convocatorias/agenda/gob3_votaciones/
// gob4_actas) — el filtro es exclusivamente tenant_id, nunca inmueble_id. Mismo patrón que
// external-documentos-listar (EXT-10): _shared/actor_externo_context.ts resuelve el vínculo,
// admin (service_role) bypasea RLS y filtra explícitamente por tenant_id ya verificado — nunca
// una policy RLS nueva que mencione actor_externo_vinculo.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import {
  extraerJwtDelHeader,
  resolverContextoActorExterno,
  respuestaErrorContextoActorExterno,
} from '../_shared/actor_externo_context.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

const ESTADOS_REUNION_VISIBLES = ['instalada', 'cerrada']

interface FilaReunion {
  id: string
  organo_id: string
  tipo_id: number
  modalidad: string
  fecha_hora: string
  lugar: string | null
  medio: string | null
  estado: string
}
interface FilaOrgano {
  id: string
  nombre: string | null
  tipo_id: number
}
interface FilaListaTipos {
  id: number
  nombre: string
}
interface FilaConvocatoria {
  emitida_at: string
  fecha_limite_respuesta: string | null
  documento_id: string | null
  orden_del_dia_congelado: unknown
}
interface FilaAgendaPunto {
  id: string
  orden: number
  titulo: string
  descripcion: string | null
  requiere_decision: boolean
}
interface FilaActa {
  id: string
  numero: number | null
  anio: number
  documento_id: string | null
  suscrita_at: string | null
  puesta_a_disposicion_at: string | null
}
interface FilaVotacion {
  id: string
  pregunta: string
  materia_id: number
  resultado: string | null
  coeficiente_total: string | null
  coeficiente_representado: string | null
  coeficiente_favor: string | null
  coeficiente_contra: string | null
  coeficiente_abstencion: string | null
}
interface FilaMateria {
  id: number
  nombre: string
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
  const cuerpo = body as { vinculo_id?: unknown; accion?: unknown; reunion_id?: unknown } | null
  const vinculoId = cuerpo?.vinculo_id
  if (typeof vinculoId !== 'string') {
    return errorResponse(400, 'INVALID_PAYLOAD', 'vinculo_id es requerido.', undefined, correlationId)
  }
  const accion = cuerpo?.accion
  if (accion !== 'reuniones' && accion !== 'detalle') {
    return errorResponse(400, 'INVALID_PAYLOAD', 'accion debe ser "reuniones" o "detalle".', undefined, correlationId)
  }
  const reunionId = typeof cuerpo?.reunion_id === 'string' ? cuerpo.reunion_id : null
  if (accion === 'detalle' && !reunionId) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'reunion_id es requerido para accion="detalle".', undefined, correlationId)
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
    admin, `gobierno_listar_vinculo:${contexto.vinculoId}`, RATE_LIMIT_MAX_HITS, RATE_LIMIT_VENTANA, correlationId,
  )
  if (bloqueo) return bloqueo

  async function resolverNombresTipos(ids: number[]): Promise<Map<number, string>> {
    if (ids.length === 0) return new Map()
    const { data, error } = await admin.from('lista_tipos').select('id, nombre').in('id', [...new Set(ids)])
    if (error) throw new Error(error.message)
    return new Map((data as FilaListaTipos[]).map((t) => [t.id, t.nombre]))
  }

  if (accion === 'reuniones') {
    const { data: reuniones, error: errorReuniones } = await admin
      .from('gobierno_reuniones')
      .select('id, organo_id, tipo_id, modalidad, fecha_hora, lugar, medio, estado')
      .eq('tenant_id', contexto.tenantId)
      .in('estado', ESTADOS_REUNION_VISIBLES)
      .order('fecha_hora', { ascending: false })
    if (errorReuniones) {
      return errorResponse(500, 'INTERNAL_ERROR', errorReuniones.message, undefined, correlationId)
    }
    const filas = (reuniones ?? []) as FilaReunion[]

    const organoIds = [...new Set(filas.map((r) => r.organo_id))]
    const { data: organos, error: errorOrganos } = organoIds.length > 0
      ? await admin.from('gobierno_organos').select('id, nombre, tipo_id').in('id', organoIds)
      : { data: [] as FilaOrgano[], error: null }
    if (errorOrganos) {
      return errorResponse(500, 'INTERNAL_ERROR', errorOrganos.message, undefined, correlationId)
    }
    const organosPorId = new Map((organos as FilaOrgano[]).map((o) => [o.id, o]))

    let nombresTipos: Map<number, string>
    try {
      nombresTipos = await resolverNombresTipos([
        ...filas.map((r) => r.tipo_id),
        ...(organos as FilaOrgano[]).map((o) => o.tipo_id),
      ])
    } catch (err) {
      return errorResponse(500, 'INTERNAL_ERROR', (err as Error).message, undefined, correlationId)
    }

    return jsonResponse(
      {
        reuniones: filas.map((r) => {
          const organo = organosPorId.get(r.organo_id)
          return {
            id: r.id,
            organo_nombre: organo?.nombre ?? nombresTipos.get(organo?.tipo_id ?? -1) ?? 'Órgano de gobierno',
            tipo_nombre: nombresTipos.get(r.tipo_id) ?? 'Reunión',
            modalidad: r.modalidad,
            fecha_hora: r.fecha_hora,
            lugar: r.lugar,
            medio: r.medio,
            estado: r.estado,
          }
        }),
      },
      200, correlationId,
    )
  }

  // accion === 'detalle' — reunionId ya validado como string arriba.
  const { data: reunion, error: errorReunion } = await admin
    .from('gobierno_reuniones')
    .select('id, organo_id, tipo_id, modalidad, fecha_hora, lugar, medio, estado')
    .eq('id', reunionId!)
    .eq('tenant_id', contexto.tenantId)
    .in('estado', ESTADOS_REUNION_VISIBLES)
    .maybeSingle()
  if (errorReunion) {
    return errorResponse(500, 'INTERNAL_ERROR', errorReunion.message, undefined, correlationId)
  }
  if (!reunion) {
    return errorResponse(
      404, 'GOBIERNO_REUNION_NO_PERTENECE',
      'Esta reunión no existe, no es de tu copropiedad, o todavía no está disponible.', undefined, correlationId,
    )
  }
  const filaReunion = reunion as FilaReunion

  const { data: organo, error: errorOrgano } = await admin
    .from('gobierno_organos').select('id, nombre, tipo_id').eq('id', filaReunion.organo_id).maybeSingle()
  if (errorOrgano) {
    return errorResponse(500, 'INTERNAL_ERROR', errorOrgano.message, undefined, correlationId)
  }

  const { data: convocatoria, error: errorConvocatoria } = await admin
    .from('gobierno_convocatorias')
    .select('emitida_at, fecha_limite_respuesta, documento_id, orden_del_dia_congelado')
    .eq('reunion_id', reunionId!)
    .maybeSingle()
  if (errorConvocatoria) {
    return errorResponse(500, 'INTERNAL_ERROR', errorConvocatoria.message, undefined, correlationId)
  }

  // gobierno_agenda_puntos es inmutable tras instalar la reunión (AGENDA_INMUTABLE_TRAS_INSTALAR)
  // — coincide con orden_del_dia_congelado de la convocatoria; leer de aquí es equivalente y más
  // simple (PROMPT_MI_COPROPIEDAD_FASE3.md §7.1).
  const { data: agenda, error: errorAgenda } = await admin
    .from('gobierno_agenda_puntos')
    .select('id, orden, titulo, descripcion, requiere_decision')
    .eq('reunion_id', reunionId!)
    .order('orden', { ascending: true })
  if (errorAgenda) {
    return errorResponse(500, 'INTERNAL_ERROR', errorAgenda.message, undefined, correlationId)
  }

  const { data: acta, error: errorActa } = await admin
    .from('gobierno_actas')
    .select('id, numero, anio, documento_id, suscrita_at, puesta_a_disposicion_at')
    .eq('reunion_id', reunionId!)
    .eq('estado', 'publicada')
    .maybeSingle()
  if (errorActa) {
    return errorResponse(500, 'INTERNAL_ERROR', errorActa.message, undefined, correlationId)
  }

  // NUNCA seleccionar columnas de gobierno_votos ni exponer un JOIN a esa tabla — solo el
  // resultado agregado ya congelado en gobierno_votaciones (§3/§1.2 de PROMPT_MI_COPROPIEDAD_
  // FASE3.md: el voto individual de cada miembro/inmueble es información personal de otros
  // propietarios, fuera de alcance de este corte).
  const { data: votaciones, error: errorVotaciones } = await admin
    .from('gobierno_votaciones')
    .select(
      'id, pregunta, materia_id, resultado, coeficiente_total, coeficiente_representado, '
      + 'coeficiente_favor, coeficiente_contra, coeficiente_abstencion',
    )
    .eq('reunion_id', reunionId!)
    .eq('estado', 'cerrada')
  if (errorVotaciones) {
    return errorResponse(500, 'INTERNAL_ERROR', errorVotaciones.message, undefined, correlationId)
  }
  const filasVotaciones = (votaciones ?? []) as FilaVotacion[]

  const materiaIds = [...new Set(filasVotaciones.map((v) => v.materia_id))]
  const { data: materias, error: errorMaterias } = materiaIds.length > 0
    ? await admin.from('gobierno_materia_decision').select('id, nombre').in('id', materiaIds)
    : { data: [] as FilaMateria[], error: null }
  if (errorMaterias) {
    return errorResponse(500, 'INTERNAL_ERROR', errorMaterias.message, undefined, correlationId)
  }
  const nombresMaterias = new Map((materias as FilaMateria[]).map((m) => [m.id, m.nombre]))

  let nombresTipos: Map<number, string>
  try {
    nombresTipos = await resolverNombresTipos([
      filaReunion.tipo_id,
      ...(organo ? [(organo as FilaOrgano).tipo_id] : []),
    ])
  } catch (err) {
    return errorResponse(500, 'INTERNAL_ERROR', (err as Error).message, undefined, correlationId)
  }

  const filaOrgano = organo as FilaOrgano | null
  const filaConvocatoria = convocatoria as FilaConvocatoria | null
  const filaActa = acta as FilaActa | null

  return jsonResponse(
    {
      reunion: {
        id: filaReunion.id,
        organo_nombre: filaOrgano?.nombre ?? nombresTipos.get(filaOrgano?.tipo_id ?? -1) ?? 'Órgano de gobierno',
        tipo_nombre: nombresTipos.get(filaReunion.tipo_id) ?? 'Reunión',
        modalidad: filaReunion.modalidad,
        fecha_hora: filaReunion.fecha_hora,
        lugar: filaReunion.lugar,
        medio: filaReunion.medio,
        estado: filaReunion.estado,
      },
      convocatoria: filaConvocatoria
        ? {
            emitida_at: filaConvocatoria.emitida_at,
            fecha_limite_respuesta: filaConvocatoria.fecha_limite_respuesta,
            documento_id: filaConvocatoria.documento_id,
            orden_del_dia_congelado: filaConvocatoria.orden_del_dia_congelado,
          }
        : null,
      agenda: (agenda as FilaAgendaPunto[]).map((p) => ({
        id: p.id, orden: p.orden, titulo: p.titulo, descripcion: p.descripcion, requiere_decision: p.requiere_decision,
      })),
      acta: filaActa
        ? {
            id: filaActa.id,
            numero: filaActa.numero,
            anio: filaActa.anio,
            documento_id: filaActa.documento_id,
            suscrita_at: filaActa.suscrita_at,
            puesta_a_disposicion_at: filaActa.puesta_a_disposicion_at,
          }
        : null,
      votaciones: filasVotaciones.map((v) => ({
        id: v.id,
        pregunta: v.pregunta,
        materia_nombre: nombresMaterias.get(v.materia_id) ?? 'Decisión',
        resultado: v.resultado,
        coeficiente_total: v.coeficiente_total,
        coeficiente_representado: v.coeficiente_representado,
        coeficiente_favor: v.coeficiente_favor,
        coeficiente_contra: v.coeficiente_contra,
        coeficiente_abstencion: v.coeficiente_abstencion,
      })),
    },
    200, correlationId,
  )
})
