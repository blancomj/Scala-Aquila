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

/**
 * EXT-02 §3.3 — "Mis solicitudes": lista TODAS las solicitudes del vínculo (sin filtro de
 * estado, la Edge Function ya las trae ordenadas por creado_at desc). Usado por "Mis asuntos"
 * (§7.6) para la lista de recientes y el badge de la tile de Solicitudes — mismo dato, sin
 * Edge Function nueva.
 */
export interface SolicitudExterna {
  id: string
  numero: number
  anio: number
  estado: Database['public']['Enums']['solicitud_estado_t']
  tipo_id: number | null
  categoria_id: number | null
  asunto: string
  triage_motivo_rechazo: string | null
  created_at: string
}

export async function listarSolicitudesExternas(vinculoId: string): Promise<SolicitudExterna[]> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<SolicitudExterna[]>('external-solicitudes-listar', {
    body: { vinculo_id: vinculoId },
  })
  if (error) throw await extraerErrorFuncion(error)
  return data ?? []
}

/**
 * EXT-08 §7.1 (Ola 2, M10) — detalle de una solicitud propia. Misma Edge Function que el listado
 * (`external-solicitudes-listar`): con `solicitud_id` en el body responde el detalle vía
 * `fn_solicitud_estado_externo` en vez de la lista completa — sin Edge Function nueva. La forma
 * de esta respuesta es DISTINTA de `SolicitudExterna` (sin `id`/`tipo_id`/`categoria_id`, con
 * `descripcion`/`resuelta_at`/`cerrada_at`) porque es el `RETURNS TABLE` de otra función SQL, no
 * el mismo shape del listado — la página de detalle usa el `id` de la URL, no uno que venga en
 * la respuesta.
 */
export interface ActuacionExterna {
  fecha: string
  descripcion: string
  created_at: string
}

export interface SolicitudExternaDetalle {
  numero: number
  anio: number
  estado: Database['public']['Enums']['solicitud_estado_t']
  asunto: string
  descripcion: string | null
  triage_motivo_rechazo: string | null
  created_at: string
  resuelta_at: string | null
  cerrada_at: string | null
  /** EXT-08b §7.2 (Ola 2, M12) — respuestas del staff, nunca notas internas (es_respuesta=false). */
  actuaciones: ActuacionExterna[]
}

export async function obtenerSolicitudExterna(
  vinculoId: string,
  solicitudId: string,
): Promise<SolicitudExternaDetalle> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<SolicitudExternaDetalle>(
    'external-solicitudes-listar',
    { body: { vinculo_id: vinculoId, solicitud_id: solicitudId } },
  )
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('No se pudo cargar la solicitud.')
  return data
}

/**
 * EXT-02 §3.2 (ya existente, expuesto aquí por primera vez en Ola 2 M10) — cancelar la propia
 * solicitud, solo posible mientras siga en `recibida_externa` (antes de que el staff la mire).
 * `external-solicitudes-cancelar` ya resuelve el 409 `SOLICITUD_CANCELACION_FUERA_DE_PLAZO` si el
 * estado cambió entre que la pantalla cargó y el usuario pulsó cancelar.
 */
export async function cancelarSolicitudExterna(
  vinculoId: string,
  solicitudId: string,
): Promise<SolicitudExternaDetalle> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<SolicitudExternaDetalle>(
    'external-solicitudes-cancelar',
    { body: { vinculo_id: vinculoId, solicitud_id: solicitudId } },
  )
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('No se pudo cancelar la solicitud.')
  return data
}

/**
 * EXT-07 §7.2 — "estado de cuenta en vivo": distinto del comprobante formal con folio
 * (ver-estado-cuenta/comprobante-cuenta, D-27/D-28, sin cambios aquí — PROMPT_MI_COPROPIEDAD_
 * FASE1.md §4.3). Consultado on-demand por el propio actor externo autenticado.
 */
export interface ObligacionCuenta {
  concepto: string
  periodo: string
  monto_pendiente: number
  estado: 'vencido' | 'pendiente'
  fecha_vencimiento: string | null
}

export interface CuentaResumen {
  inmueble: { id: string; codigo: string }
  saldo_total: number
  obligaciones: ObligacionCuenta[]
  pago_habilitado: boolean
}

export async function obtenerCuentaResumen(vinculoId: string): Promise<CuentaResumen> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<CuentaResumen>('external-cuenta-resumen', {
    body: { vinculo_id: vinculoId },
  })
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('No se pudo cargar el estado de cuenta.')
  return data
}

/**
 * Unificación de plantilla (D-14x): el mismo documento formal con folio+hash que
 * `comprobante-cuenta/[id].vue` ya muestra vía enlace de correo, resuelto aquí para el vínculo
 * autenticado en vez de un token HMAC — ver `external-estado-cuenta-ver`. `existe: false` es un
 * estado legítimo (el tenant nunca corrió una liquidación) que la pantalla de Finanzas usa para
 * caer de vuelta a `obtenerCuentaResumen`, no un error.
 */
export type ComprobanteCuentaRespuesta =
  | { existe: false }
  | { existe: true; datos: EstadoCuentaDatos; folio: string | null; contenido_hash: string; pago_habilitado: boolean }

export async function obtenerComprobanteCuenta(vinculoId: string): Promise<ComprobanteCuentaRespuesta> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<ComprobanteCuentaRespuesta>(
    'external-estado-cuenta-ver',
    { body: { vinculo_id: vinculoId } },
  )
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('No se pudo cargar el comprobante de cuenta.')
  return data
}

/**
 * EXT-07 §7.3/§8.3 — pagar el propio saldo: tercera vía `actor_externo` de `crear-intencion-pago`
 * (sin cambios en `ver-intencion-pago`/`pago/resultado.vue` — ese flujo ya es agnóstico a la vía
 * que creó la intención, ver cabecera de `ver-intencion-pago/index.ts`: el capability token es el
 * propio `intencion_id`). Método fijo 'pse' en este corte, mismo criterio mínimo que ya usa
 * `comprobante-cuenta/[id].vue::pagarAhora` — elegir entre varios métodos es mejora de UI, no de
 * esta ola. El monto NUNCA se manda desde aquí (regla de oro, §1): el servidor lo calcula del
 * saldo real.
 */
export interface ResultadoPagoActorExterno {
  intencion_id: string
  resultado: { tipo: string; checkoutUrl?: string }
}

export async function crearIntencionPagoActorExterno(vinculoId: string): Promise<ResultadoPagoActorExterno> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<ResultadoPagoActorExterno>('crear-intencion-pago', {
    body: { via: 'actor_externo', vinculo_id: vinculoId, metodo: 'pse' },
  })
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('No se pudo iniciar el pago.')
  return data
}

/**
 * EXT-04 §7.3 (Ola 2, M13) — "Mis visitas": crear/listar/revocar. Tres Edge Functions ya
 * existentes desde EXT-04, sin ninguna UI que las consumiera todavía (confirmado en
 * PLAN_MI_COPROPIEDAD.md §10.1). `inmueble_id` se resuelve siempre del lado del servidor vía
 * fn_actor_externo_mis_vinculos — igual que solicitudes/reservas, nunca se manda desde aquí.
 */
export interface VisitaExterna {
  id: string
  visitante_nombre: string
  visitante_documento: string | null
  tipo_id: number | null
  permanente: boolean
  fecha_prevista: string | null
  hora_desde: string | null
  hora_hasta: string | null
  estado: 'vigente' | 'usada' | 'vencida' | 'revocada'
  qr_token: string | null
  qr_expira_at: string | null
  foto_url: string | null
  created_at: string
  ingreso_at: string | null
  egreso_at: string | null
}

export interface CrearVisitaPayload {
  vinculoId: string
  visitanteNombre: string
  visitanteDocumento?: string
  tipoId?: number
  /** Autorización sin vencimiento por fecha (EXT-09 M14) — cuando es true, fechaPrevista/
   * horaDesde/horaHasta se ignoran (el servidor los guarda en null; el CHECK de la migración
   * 20260943000000 los exige así). */
  permanente?: boolean
  fechaPrevista?: string
  horaDesde?: string
  horaHasta?: string
  /** JPEG/PNG, máx. 5 MB (mismo límite que el bucket `visitas-fotos`) — opcional, un
   * enriquecimiento de la autorización, nunca una condición de validez (EXT-09 M14). */
  foto?: File
}

/**
 * EXT-09 (Ola 2, M14) — el body pasa de JSON a multipart/form-data SOLO para poder adjuntar la
 * foto opcional (mismo criterio que subir-documento/stores/documentos.ts, la única otra función
 * del proyecto que sube un archivo) — ningún campo cambia de significado.
 */
export async function crearVisitaExterna(payload: CrearVisitaPayload): Promise<VisitaExterna> {
  const cliente = useSupabaseClient<Database>()
  const form = new FormData()
  form.set('vinculo_id', payload.vinculoId)
  form.set('visitante_nombre', payload.visitanteNombre)
  if (payload.permanente) {
    form.set('permanente', 'true')
  } else if (payload.fechaPrevista) {
    form.set('fecha_prevista', payload.fechaPrevista)
  }
  if (payload.visitanteDocumento) form.set('visitante_documento', payload.visitanteDocumento)
  if (payload.tipoId != null) form.set('tipo_id', String(payload.tipoId))
  if (!payload.permanente && payload.horaDesde) form.set('hora_desde', payload.horaDesde)
  if (!payload.permanente && payload.horaHasta) form.set('hora_hasta', payload.horaHasta)
  if (payload.foto) form.set('foto', payload.foto)

  const { data, error } = await cliente.functions.invoke<VisitaExterna>('external-visitas-crear', {
    body: form,
  })
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('No se pudo crear la autorización de visita.')
  return data
}

export async function listarVisitasExternas(vinculoId: string): Promise<VisitaExterna[]> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<VisitaExterna[]>('external-visitas-listar', {
    body: { vinculo_id: vinculoId },
  })
  if (error) throw await extraerErrorFuncion(error)
  return data ?? []
}

export async function revocarVisitaExterna(vinculoId: string, autorizacionId: string): Promise<VisitaExterna> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<VisitaExterna>('external-visitas-revocar', {
    body: { vinculo_id: vinculoId, autorizacion_id: autorizacionId },
  })
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('No se pudo revocar la autorización.')
  return data
}

/**
 * EXT-10 §7.5 (Ola 2, M15) — "Mis reservas": disponibilidad/crear/cancelar/listar. Cuatro Edge
 * Functions ya existentes desde EXT-03, confirmadas 100% funcionales para actor externo y sin
 * ninguna RLS nueva (las RPCs son SECURITY DEFINER — PLAN_MI_COPROPIEDAD.md §10.2). El monto de
 * una reserva (si `genera_cargo`) lo decide siempre el servidor (regla de oro) — nunca se manda
 * desde aquí.
 */
export interface ZonaReservable {
  id: string
  codigo: string
  nombre: string
}

export async function listarZonasReservables(vinculoId: string): Promise<ZonaReservable[]> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<{ zonas: ZonaReservable[] }>(
    'external-reservas-disponibilidad',
    { body: { vinculo_id: vinculoId } },
  )
  if (error) throw await extraerErrorFuncion(error)
  return data?.zonas ?? []
}

export interface ReglaReservaZona {
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

export interface DisponibilidadZona {
  ocupadas: { hora_inicio: string; hora_fin: string }[]
  regla: ReglaReservaZona | null
  /** EXT-13 (Ola 2, M18) — presente SOLO si la zona tiene horario semanal configurado (mant_zona_
   * horario_semanal); ausente para cualquier otra zona (compatibilidad hacia atrás explícita). */
  franjas_validas?: { hora_desde: string; hora_hasta: string }[]
}

export async function consultarDisponibilidadZona(
  vinculoId: string,
  zonaComunId: string,
  fecha: string,
): Promise<DisponibilidadZona> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<DisponibilidadZona>(
    'external-reservas-disponibilidad',
    { body: { vinculo_id: vinculoId, zona_comun_id: zonaComunId, fecha } },
  )
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('No se pudo consultar la disponibilidad.')
  return data
}

export interface ReservaExterna {
  id: string
  zona_comun_id: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  estado: 'solicitada' | 'aprobada' | 'rechazada' | 'cancelada' | 'completada' | 'no_show'
  penalizada: boolean
  motivo_rechazo: string | null
  created_at: string
}

export async function crearReservaExterna(
  vinculoId: string,
  zonaComunId: string,
  fecha: string,
  horaInicio: string,
  horaFin: string,
): Promise<ReservaExterna> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<ReservaExterna>('external-reservas-crear', {
    body: {
      vinculo_id: vinculoId, zona_comun_id: zonaComunId,
      fecha, hora_inicio: horaInicio, hora_fin: horaFin,
    },
  })
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('No se pudo crear la reserva.')
  return data
}

export async function listarReservasExternas(vinculoId: string): Promise<ReservaExterna[]> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<ReservaExterna[]>('external-reservas-listar', {
    body: { vinculo_id: vinculoId },
  })
  if (error) throw await extraerErrorFuncion(error)
  return data ?? []
}

export async function cancelarReservaExterna(vinculoId: string, reservaId: string): Promise<ReservaExterna> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<ReservaExterna>('external-reservas-cancelar', {
    body: { vinculo_id: vinculoId, reserva_id: reservaId },
  })
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('No se pudo cancelar la reserva.')
  return data
}

// ── EXT-10 (Ola 2, M16) — Documentos ────────────────────────────────────────────────────────
export interface DocumentoExterno {
  id: string
  nombre_archivo: string
  tipo_documento: string
  fecha_vencimiento: string | null
  tamano_bytes: number | null
  descripcion: string | null
  created_at: string
  alcance: 'copropiedad' | 'inmueble'
}

export async function listarDocumentosExternos(vinculoId: string): Promise<DocumentoExterno[]> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<{ documentos: DocumentoExterno[] }>(
    'external-documentos-listar',
    { body: { vinculo_id: vinculoId } },
  )
  if (error) throw await extraerErrorFuncion(error)
  return data?.documentos ?? []
}

interface EnlaceDocumento {
  documento_id: string
  token: string
  vigencia_dias: number
  expira_en: string
}

/** Firma el enlace (generar-enlace-documento, vía actor_externo) y de una vez lo resuelve a la
 * signed URL real de Storage (ver-documento) — la UI solo necesita el resultado final para abrir
 * el documento, igual que ya hace el "Ver" de UiLibreriaDocumentos.vue para staff. */
export async function obtenerUrlDocumentoExterno(vinculoId: string, documentoId: string): Promise<string> {
  const cliente = useSupabaseClient<Database>()
  const { data: enlace, error: errorEnlace } = await cliente.functions.invoke<EnlaceDocumento>(
    'generar-enlace-documento',
    { body: { via: 'actor_externo', vinculo_id: vinculoId, documento_id: documentoId } },
  )
  if (errorEnlace) throw await extraerErrorFuncion(errorEnlace)
  if (!enlace) throw new Error('No se pudo generar el enlace del documento.')

  const { data: resuelto, error: errorVer } = await cliente.functions.invoke<{ url_firmada: string }>(
    'ver-documento',
    { body: { id: enlace.documento_id, t: enlace.token } },
  )
  if (errorVer) throw await extraerErrorFuncion(errorVer)
  if (!resuelto) throw new Error('No se pudo abrir el documento.')
  return resuelto.url_firmada
}

// ── EXT-14 (Ola 2, M19) — Contactos de emergencia ───────────────────────────────────────────
export interface ContactoEmergencia {
  id: string
  nombre: string
  telefono: string
  parentesco: string | null
  created_at: string
}

export async function listarContactosEmergencia(vinculoId: string): Promise<ContactoEmergencia[]> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<{ contactos: ContactoEmergencia[] }>(
    'external-contactos-emergencia',
    { body: { vinculo_id: vinculoId, accion: 'listar' } },
  )
  if (error) throw await extraerErrorFuncion(error)
  return data?.contactos ?? []
}

export async function crearContactoEmergencia(
  vinculoId: string,
  nombre: string,
  telefono: string,
  parentesco?: string,
): Promise<ContactoEmergencia> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<ContactoEmergencia>('external-contactos-emergencia', {
    body: {
      vinculo_id: vinculoId, accion: 'crear', nombre, telefono,
      ...(parentesco ? { parentesco } : {}),
    },
  })
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('No se pudo crear el contacto.')
  return data
}

export async function eliminarContactoEmergencia(vinculoId: string, contactoId: string): Promise<void> {
  const cliente = useSupabaseClient<Database>()
  const { error } = await cliente.functions.invoke('external-contactos-emergencia', {
    body: { vinculo_id: vinculoId, accion: 'eliminar', contacto_id: contactoId },
  })
  if (error) throw await extraerErrorFuncion(error)
}

// ── EXT-12 (Ola 2, M17) — Correspondencia ───────────────────────────────────────────────────
export interface CorrespondenciaExterna {
  id: string
  tipo: string | null
  destino: string
  remitente: string
  descripcion: string | null
  created_at: string
  entregada: boolean
  entregada_a: string | null
  entregada_at: string | null
}

export async function listarCorrespondenciaExterna(vinculoId: string): Promise<CorrespondenciaExterna[]> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<{ correspondencia: CorrespondenciaExterna[] }>(
    'external-correspondencia-listar',
    { body: { vinculo_id: vinculoId } },
  )
  if (error) throw await extraerErrorFuncion(error)
  return data?.correspondencia ?? []
}

// ── EXT-08b (Ola 2, M11) — Notificaciones ───────────────────────────────────────────────────
export interface NotificacionExterna {
  id: string
  titulo: string
  cuerpo: string | null
  enlace: string | null
  leida_at: string | null
  created_at: string
}

export async function listarNotificacionesExternas(vinculoId: string): Promise<NotificacionExterna[]> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<{ notificaciones: NotificacionExterna[] }>(
    'external-notificaciones-listar',
    { body: { vinculo_id: vinculoId, accion: 'listar' } },
  )
  if (error) throw await extraerErrorFuncion(error)
  return data?.notificaciones ?? []
}

export async function marcarNotificacionExternaLeida(
  vinculoId: string,
  notificacionId: string,
): Promise<NotificacionExterna> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<NotificacionExterna>('external-notificaciones-listar', {
    body: { vinculo_id: vinculoId, accion: 'marcar_leida', notificacion_id: notificacionId },
  })
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('No se pudo marcar la notificación como leída.')
  return data
}

// ── EXT-11 (Ola 3, M20) — Gobierno de solo lectura ──────────────────────────────────────────
// Nunca expone gobierno_poderes ni gobierno_votos (el voto individual) — solo el resultado
// agregado de una votación cerrada. Ver PROMPT_MI_COPROPIEDAD_FASE3.md §7.1/§9.
export interface ReunionGobierno {
  id: string
  organo_nombre: string
  tipo_nombre: string
  modalidad: string
  fecha_hora: string
  lugar: string | null
  medio: string | null
  estado: string
}

export async function listarReunionesGobierno(vinculoId: string): Promise<ReunionGobierno[]> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<{ reuniones: ReunionGobierno[] }>(
    'external-gobierno-listar',
    { body: { vinculo_id: vinculoId, accion: 'reuniones' } },
  )
  if (error) throw await extraerErrorFuncion(error)
  return data?.reuniones ?? []
}

export interface ConvocatoriaGobierno {
  emitida_at: string
  fecha_limite_respuesta: string | null
  documento_id: string | null
  orden_del_dia_congelado: unknown
}
export interface AgendaPuntoGobierno {
  id: string
  orden: number
  titulo: string
  descripcion: string | null
  requiere_decision: boolean
}
export interface ActaGobierno {
  id: string
  numero: number | null
  anio: number
  documento_id: string | null
  suscrita_at: string | null
  puesta_a_disposicion_at: string | null
}
export interface VotacionGobierno {
  id: string
  pregunta: string
  materia_nombre: string
  resultado: string | null
  coeficiente_total: string | null
  coeficiente_representado: string | null
  coeficiente_favor: string | null
  coeficiente_contra: string | null
  coeficiente_abstencion: string | null
}
export interface ReunionGobiernoDetalle {
  reunion: ReunionGobierno
  convocatoria: ConvocatoriaGobierno | null
  agenda: AgendaPuntoGobierno[]
  acta: ActaGobierno | null
  votaciones: VotacionGobierno[]
}

export async function obtenerReunionGobierno(vinculoId: string, reunionId: string): Promise<ReunionGobiernoDetalle> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente.functions.invoke<ReunionGobiernoDetalle>(
    'external-gobierno-listar',
    { body: { vinculo_id: vinculoId, accion: 'detalle', reunion_id: reunionId } },
  )
  if (error) throw await extraerErrorFuncion(error)
  if (!data) throw new Error('No se pudo cargar esta reunión.')
  return data
}
