/**
 * EXT-01 §3.2 — capa de API del portal de identidad para actores externos
 * (propietarios/tenedores). Envuelve las Edge Functions ya existentes
 * (actor-externo-solicitar-otp/confirmar-otp) vía `cliente.functions.invoke`,
 * mismo patrón que `consulta-inmueble/index.vue` (ver-inmueble) — no `fetch`
 * crudo como hace `apps/mobile/src/api/identidad.ts` (ese patrón es de
 * React Native, no aplica a este cliente Nuxt).
 *
 * Solo canal email en este corte (el Edge Function ya soporta sms, la UI no
 * lo expone todavía — decisión explícita del Plan de este corte).
 */
import type { Database } from '@aquila/shared'

interface SolicitarOtpResultado {
  message: string
}

interface ConfirmarOtpResultado {
  email: string
  hashed_token: string
  vinculos: number
}

export async function solicitarOtpActorExterno(contacto: string): Promise<SolicitarOtpResultado> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<SolicitarOtpResultado>(
    'actor-externo-solicitar-otp',
    { body: { canal: 'email', contacto } },
  )
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('No se pudo procesar la solicitud.')
  return data
}

export async function confirmarOtpActorExterno(
  contacto: string,
  codigo: string,
): Promise<ConfirmarOtpResultado> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<ConfirmarOtpResultado>(
    'actor-externo-confirmar-otp',
    { body: { canal: 'email', contacto, codigo } },
  )
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('Código inválido o vencido.')
  return data
}

/**
 * Intercambia el `hashed_token` del magic link (confirmarOtpActorExterno) por
 * una sesión real, con `useSupabaseClient()` para que la sesión quede en las
 * cookies que `@nuxtjs/supabase` sincroniza con el servidor (D-16) — nada de
 * `localStorage` a mano, que el resto de la app no vería.
 *
 * Dos hallazgos empíricos (probados en el navegador contra el proyecto
 * remoto Scala - Aquila, no supuestos de la documentación ni copiados de
 * `apps/mobile/src/session/cliente.ts::establecerSesionDesdeOtp`, que nunca
 * se ejecutó en un dispositivo real):
 * 1. `token_hash`, no `token`+`email` — `hashed_token` de
 *    `admin.generateLink()` está pensado para el parámetro `token_hash` de
 *    `verifyOtp` (flujo de enlace); `token`+`email` es para el código de 6
 *    dígitos de un OTP de `signInWithOtp`, un flujo distinto. Con
 *    `token`+`email` fallaba con "Token has expired or is invalid" aunque
 *    el token fuera válido y recién emitido.
 * 2. `type: 'recovery'`, no `'magiclink'` — a pesar de que la Edge Function
 *    pide el enlace con `admin.generateLink({type: 'magiclink', ...})`.
 *    Para un usuario YA existente y confirmado (el caso normal de un login
 *    repetido de actor externo), confirmado contra `auth.one_time_tokens`:
 *    el token queda guardado con `token_type = 'recovery_token'`, no
 *    `magiclink_token'` — `verifyOtp` debe pedir el mismo tipo que GoTrue
 *    realmente guardó.
 */
export async function establecerSesionActorExterno(hashedToken: string): Promise<void> {
  const cliente = useSupabaseClient<Database>()
  const { error } = await cliente.auth.verifyOtp({ token_hash: hashedToken, type: 'recovery' })
  if (error) throw error
}

/**
 * EXT-02 §3.1/§3.4 — crear una solicitud (PQRS) desde el portal. A diferencia
 * de EXT-01, estas dos Edge Functions ya autentican por sesión (Authorization
 * Bearer, que `cliente.functions.invoke()` adjunta solo — nada que armar a
 * mano): resuelven `inmueble_id`/`tenant_id` siempre del lado del servidor
 * vía `fn_actor_externo_mis_vinculos` del propio caller, nunca del
 * `vinculo_id` que mande el cliente. Cero SQL/Edge Function nueva para esta
 * adición — mismo patrón ya usado por `NuevaSolicitudScreen.tsx`.
 */
interface ItemCatalogo {
  id: number
  tipo: string
  codigo: string
  nombre: string
}

interface CatalogoSolicitud {
  tipos: ItemCatalogo[]
  categorias: ItemCatalogo[]
}

export async function obtenerCatalogoSolicitud(vinculoId: string): Promise<CatalogoSolicitud> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<CatalogoSolicitud>(
    'external-solicitudes-catalogo',
    { body: { vinculo_id: vinculoId } },
  )
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('No se pudo cargar el catálogo de tipo/categoría.')
  return data
}

interface CrearSolicitudPayload {
  vinculoId: string
  tipoId: number
  categoriaId: number
  asunto: string
  descripcion?: string
}

interface SolicitudCreada {
  id: string
  numero: number
  anio: number
  estado: Database['public']['Enums']['solicitud_estado_t']
}

export async function crearSolicitudExterna(payload: CrearSolicitudPayload): Promise<SolicitudCreada> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<SolicitudCreada>('external-solicitudes-crear', {
    body: {
      vinculo_id: payload.vinculoId,
      tipo_id: payload.tipoId,
      categoria_id: payload.categoriaId,
      asunto: payload.asunto,
      ...(payload.descripcion ? { descripcion: payload.descripcion } : {}),
    },
  })
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('No se pudo enviar la solicitud.')
  return data
}
