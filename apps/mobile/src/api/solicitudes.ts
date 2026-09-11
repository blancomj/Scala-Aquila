// EXT-02 entregable 3 — capa de API para "Nueva solicitud"/"Mis solicitudes". Cada llamada envuelve
// una de las 4 Edge Functions ya existentes (external-solicitudes-catalogo/-crear/-cancelar/-listar)
// o el RPC fn_actor_externo_mis_vinculos (mismo criterio que esas funciones usan para resolver el
// vínculo del caller — la app necesita la lista completa para el selector de inmueble de §3.4).
// `supabase.functions.invoke(...)` adjunta el JWT de la sesión activa como Authorization header —
// igual que src/session/cliente.ts ya hace para el resto de la app.
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

export interface ItemCatalogo {
  id: number
  codigo: string
  nombre: string
}

export interface Catalogo {
  tipos: ItemCatalogo[]
  categorias: ItemCatalogo[]
}

export interface Solicitud {
  id: string
  numero: number
  anio: number
  estado: string
  inmueble_id: string
  origen_actor_externo_id: string
}

export interface SolicitudResumen {
  id: string
  numero: number
  anio: number
  estado: string
  tipo_id: number
  categoria_id: number
  asunto: string
  triage_motivo_rechazo: string | null
  created_at: string
}

export interface SolicitudDetalle {
  numero: number
  anio: number
  estado: string
  asunto: string
  descripcion: string | null
  triage_motivo_rechazo: string | null
  created_at: string
  resuelta_at: string | null
  cerrada_at: string | null
}

export interface DatosNuevaSolicitud {
  vinculoId: string
  tipoId: number
  categoriaId: number
  asunto: string
  descripcion?: string
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

/** Vínculos vigentes de la cuenta con sesión activa — insumo del selector de inmueble (spec §3.4,
 * "si el actor tiene más de un vínculo"). */
export async function listarMisVinculos(): Promise<Vinculo[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Se requiere sesión activa.')
  const { data, error } = await supabase.rpc('fn_actor_externo_mis_vinculos', { p_auth_user_id: user.id })
  if (error) throw error
  return (data ?? []) as Vinculo[]
}

export async function obtenerCatalogo(vinculoId: string): Promise<Catalogo> {
  const { data, error } = await supabase.functions.invoke<Catalogo>('external-solicitudes-catalogo', {
    body: { vinculo_id: vinculoId },
  })
  if (error) throw await extraerErrorFuncion(error)
  return data as Catalogo
}

export async function crearSolicitud(datos: DatosNuevaSolicitud): Promise<Solicitud> {
  const { data, error } = await supabase.functions.invoke<Solicitud>('external-solicitudes-crear', {
    body: {
      vinculo_id: datos.vinculoId,
      tipo_id: datos.tipoId,
      categoria_id: datos.categoriaId,
      asunto: datos.asunto,
      ...(datos.descripcion ? { descripcion: datos.descripcion } : {}),
    },
  })
  if (error) throw await extraerErrorFuncion(error)
  return data as Solicitud
}

export async function cancelarSolicitud(vinculoId: string, solicitudId: string): Promise<Solicitud> {
  const { data, error } = await supabase.functions.invoke<Solicitud>('external-solicitudes-cancelar', {
    body: { vinculo_id: vinculoId, solicitud_id: solicitudId },
  })
  if (error) throw await extraerErrorFuncion(error)
  return data as Solicitud
}

export async function listarSolicitudes(vinculoId: string): Promise<SolicitudResumen[]> {
  const { data, error } = await supabase.functions.invoke<SolicitudResumen[]>('external-solicitudes-listar', {
    body: { vinculo_id: vinculoId },
  })
  if (error) throw await extraerErrorFuncion(error)
  return data ?? []
}

export async function obtenerDetalleSolicitud(vinculoId: string, solicitudId: string): Promise<SolicitudDetalle> {
  const { data, error } = await supabase.functions.invoke<SolicitudDetalle>('external-solicitudes-listar', {
    body: { vinculo_id: vinculoId, solicitud_id: solicitudId },
  })
  if (error) throw await extraerErrorFuncion(error)
  return data as SolicitudDetalle
}
