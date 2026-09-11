// EXT-04 entregable 2 — capa de API para "Nueva visita"/"Mis visitas". Cada llamada envuelve una
// de las 3 Edge Functions ya existentes (external-visitas-crear/-revocar/-listar). TIPO_VISITA es
// catálogo GLOBAL (lista_tipos, tenant_id is null) — se lee directo por RLS
// (lista_tipos_select_miembro), sin Edge Function de catálogo (mismo criterio que EXT_04_INFORME.md
// §"por qué no hay catalogo"). Mismo patrón de sesión/error que api/reservas.ts.
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

export interface TipoVisita {
  id: number
  codigo: string
  nombre: string
}

export interface Autorizacion {
  id: string
  tenant_id: string
  inmueble_id: string
  autorizado_por_ref: string
  autorizado_por_origen: string
  visitante_nombre: string
  visitante_documento: string | null
  tipo_id: number | null
  fecha_prevista: string
  hora_desde: string | null
  hora_hasta: string | null
  estado: string
  qr_token: string | null
  qr_expira_at: string | null
}

export interface AutorizacionResumen {
  id: string
  visitante_nombre: string
  visitante_documento: string | null
  tipo_id: number | null
  fecha_prevista: string
  estado: string
  qr_token: string | null
  qr_expira_at: string | null
  created_at: string
  ingreso_at: string | null
  egreso_at: string | null
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

/** Vínculos vigentes de la cuenta con sesión activa — mismo RPC que api/reservas.ts/solicitudes.ts. */
export async function listarMisVinculos(): Promise<Vinculo[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Se requiere sesión activa.')
  const { data, error } = await supabase.rpc('fn_actor_externo_mis_vinculos', { p_auth_user_id: user.id })
  if (error) throw error
  return (data ?? []) as Vinculo[]
}

/** Catálogo global de TIPO_VISITA — leído directo (RLS: tenant_id is null es visible a cualquier
 * autenticado), sin Edge Function propia. */
export async function listarTiposVisita(): Promise<TipoVisita[]> {
  const { data, error } = await supabase
    .from('lista_tipos')
    .select('id, codigo, nombre')
    .eq('tipo', 'TIPO_VISITA')
    .is('tenant_id', null)
    .order('orden')
  if (error) throw error
  return (data ?? []) as TipoVisita[]
}

export interface DatosNuevaVisita {
  vinculoId: string
  visitanteNombre: string
  visitanteDocumento?: string
  tipoId?: number
  fechaPrevista: string
  horaDesde?: string
  horaHasta?: string
}

export async function crearVisita(datos: DatosNuevaVisita): Promise<Autorizacion> {
  const { data, error } = await supabase.functions.invoke<Autorizacion>('external-visitas-crear', {
    body: {
      vinculo_id: datos.vinculoId,
      visitante_nombre: datos.visitanteNombre,
      visitante_documento: datos.visitanteDocumento,
      tipo_id: datos.tipoId,
      fecha_prevista: datos.fechaPrevista,
      hora_desde: datos.horaDesde,
      hora_hasta: datos.horaHasta,
    },
  })
  if (error) throw await extraerErrorFuncion(error)
  return data as Autorizacion
}

export async function revocarVisita(vinculoId: string, autorizacionId: string): Promise<Autorizacion> {
  const { data, error } = await supabase.functions.invoke<Autorizacion>('external-visitas-revocar', {
    body: { vinculo_id: vinculoId, autorizacion_id: autorizacionId },
  })
  if (error) throw await extraerErrorFuncion(error)
  return data as Autorizacion
}

export async function listarVisitas(vinculoId: string): Promise<AutorizacionResumen[]> {
  const { data, error } = await supabase.functions.invoke<AutorizacionResumen[]>('external-visitas-listar', {
    body: { vinculo_id: vinculoId },
  })
  if (error) throw await extraerErrorFuncion(error)
  return data ?? []
}
