// EXT-03 entregable 1 — capa de API para "Nueva reserva"/"Mis reservas". Cada llamada envuelve una
// de las 4 Edge Functions ya existentes (external-reservas-disponibilidad/-crear/-cancelar/-listar).
// `supabase.functions.invoke(...)` adjunta el JWT de la sesión activa como Authorization header —
// igual que src/session/cliente.ts ya hace para el resto de la app (mismo patrón que api/solicitudes.ts).
import { supabase } from '../session/cliente'

export interface Vinculo {
  vinculo_id: string
  tenant_id: string
  tenant_nombre: string
  inmueble_id: string
  persona_tipo: string
  rol_codigo: string
  vigente_desde: string
  vigente_hasta: string | null
}

export interface ZonaComun {
  id: string
  codigo: string
  nombre: string
}

export interface ReglaZona {
  requiere_aprobacion: boolean
  duracion_maxima_minutos: number | null
  anticipacion_minima_horas: number | null
  anticipacion_maxima_dias: number | null
  cupo_simultaneo: number
  maximo_activas_por_inmueble: number | null
  genera_cargo: boolean
  concepto_id: string | null
  penalidad_cancelacion_tardia_horas: number | null
  monto: number | null
}

export interface Disponibilidad {
  ocupadas: { hora_inicio: string; hora_fin: string }[]
  regla: ReglaZona | null
}

export interface Reserva {
  id: string
  tenant_id: string
  zona_comun_id: string
  inmueble_id: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  estado: string
  cargo_id: string | null
  penalizada: boolean
}

export interface ReservaResumen {
  id: string
  zona_comun_id: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  estado: string
  penalizada: boolean
  motivo_rechazo: string | null
  created_at: string
}

type ErrorConCodigo = Error & { code?: string }

/** Mismo patrón que apps/web/app/utils/edge-function-error.ts: supabase-js envuelve un fallo de
 * Edge Function en FunctionsHttpError cuyo `.context` es el Response crudo. */
async function extraerErrorFuncion(error: unknown): Promise<ErrorConCodigo> {
  if (error && typeof error === 'object' && 'context' in error) {
    const contexto = (error as { context: unknown }).context
    if (contexto instanceof Response) {
      try {
        const cuerpo = (await contexto.clone().json()) as { error?: { code?: string; message?: string } }
        if (cuerpo.error?.message) {
          const errorConCodigo: ErrorConCodigo = new Error(cuerpo.error.message)
          errorConCodigo.code = cuerpo.error.code
          return errorConCodigo
        }
      } catch {
        // el cuerpo no era JSON con la forma esperada — cae al mensaje genérico.
      }
    }
  }
  return error instanceof Error ? error : new Error('No se pudo completar la operación.')
}

/** Vínculos vigentes de la cuenta con sesión activa — insumo del selector de inmueble (spec §3.5,
 * "si el actor tiene más de un vínculo"). Mismo RPC que api/solicitudes.ts ya usa. */
export async function listarMisVinculos(): Promise<Vinculo[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Se requiere sesión activa.')
  const { data, error } = await supabase.rpc('fn_actor_externo_mis_vinculos', { p_auth_user_id: user.id })
  if (error) throw error
  return (data ?? []) as Vinculo[]
}

/** Sin zonaComunId: lista las zonas reservables del tenant del vínculo. Con zonaComunId+fecha:
 * franjas ocupadas + regla vigente de esa zona/fecha (spec §3.5, "la regla se muestra ANTES de
 * confirmar"). */
export async function listarZonasReservables(vinculoId: string): Promise<ZonaComun[]> {
  const { data, error } = await supabase.functions.invoke<{ zonas: ZonaComun[] }>('external-reservas-disponibilidad', {
    body: { vinculo_id: vinculoId },
  })
  if (error) throw await extraerErrorFuncion(error)
  return data?.zonas ?? []
}

export async function obtenerDisponibilidad(vinculoId: string, zonaComunId: string, fecha: string): Promise<Disponibilidad> {
  const { data, error } = await supabase.functions.invoke<Disponibilidad>('external-reservas-disponibilidad', {
    body: { vinculo_id: vinculoId, zona_comun_id: zonaComunId, fecha },
  })
  if (error) throw await extraerErrorFuncion(error)
  return data as Disponibilidad
}

export interface DatosNuevaReserva {
  vinculoId: string
  zonaComunId: string
  fecha: string
  horaInicio: string
  horaFin: string
}

export async function crearReserva(datos: DatosNuevaReserva): Promise<Reserva> {
  const { data, error } = await supabase.functions.invoke<Reserva>('external-reservas-crear', {
    body: {
      vinculo_id: datos.vinculoId, zona_comun_id: datos.zonaComunId, fecha: datos.fecha,
      hora_inicio: datos.horaInicio, hora_fin: datos.horaFin,
    },
  })
  if (error) throw await extraerErrorFuncion(error)
  return data as Reserva
}

export async function cancelarReserva(vinculoId: string, reservaId: string): Promise<Reserva> {
  const { data, error } = await supabase.functions.invoke<Reserva>('external-reservas-cancelar', {
    body: { vinculo_id: vinculoId, reserva_id: reservaId },
  })
  if (error) throw await extraerErrorFuncion(error)
  return data as Reserva
}

export async function listarReservas(vinculoId: string): Promise<ReservaResumen[]> {
  const { data, error } = await supabase.functions.invoke<ReservaResumen[]>('external-reservas-listar', {
    body: { vinculo_id: vinculoId },
  })
  if (error) throw await extraerErrorFuncion(error)
  return data ?? []
}
