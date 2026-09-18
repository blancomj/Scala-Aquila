// EXT-06 — ExecutionContext formal para el actor externo (propietario/residente, EXT-01).
//
// Resuelve, del lado del servidor, con qué vínculo (actor_externo_vinculo) está actuando el
// llamador — nunca confía en tenant_id/inmueble_id que mande el cliente en el body. Mismo
// principio que ya aplican ver-estado-cuenta/crear-intencion-pago para su vía 'sesion' (un
// miembro resuelto por `memberships`), replicado aquí para un actor externo resuelto por
// `actor_externo_vinculo` — que por diseño (AD-37) NUNCA es tenant_member, así que no puede
// pasar por ese mismo camino.
//
// El cliente SIEMPRE debe indicar `vinculoId` (igual que ya exigen
// obtenerCatalogoSolicitud/crearSolicitudExterna en actor-externo-api.ts): no se navega "el
// vínculo activo" desde el servidor porque el servidor no tiene sesión de navegador — el
// vinculoId identifica CUÁL de los vínculos vigentes del usuario se usa en esta llamada, y se
// valida siempre contra la lista real que devuelve fn_actor_externo_mis_vinculos, nunca se
// confía en el resto de sus campos (tenant_id/inmueble_id) tal como los mande el cliente.
//
// Tipo estructural mínimo (mismo criterio que rate_limit.ts::ClienteConRpc): cualquier cliente
// con `.auth.getUser()` y `.rpc('fn_actor_externo_mis_vinculos', ...)` compatibles sirve, sin
// atar este módulo al tipo exacto de SupabaseClient<Database> — así los tests inyectan un doble
// simple sin tocar la red.
import { errorResponse } from './http.ts'

export interface VinculoActorExterno {
  vinculo_id: string
  tenant_id: string
  tenant_nombre: string
  inmueble_id: string
  persona_tipo: string
  rol_codigo: string
  vigente_desde: string | null
  vigente_hasta: string | null
}

export interface ContextoActorExterno {
  authUserId: string
  vinculoId: string
  tenantId: string
  inmuebleId: string
  personaTipo: string
  rolCodigo: string
}

export type ErrorContextoActorExterno =
  | { tipo: 'UNAUTHENTICATED' }
  | { tipo: 'VINCULO_NO_PERTENECE' }
  | { tipo: 'INTERNAL_ERROR'; mensaje: string }

interface ClienteContextoActorExterno {
  auth: {
    getUser(jwt: string): PromiseLike<{
      data: { user: { id: string } | null }
      error: unknown
    }>
  }
  rpc(
    fn: 'fn_actor_externo_mis_vinculos',
    args: { p_auth_user_id: string },
  ): PromiseLike<{ data: VinculoActorExterno[] | null; error: { message: string } | null }>
}

/** Extrae el Bearer token del header Authorization — `null` si no viene. */
export function extraerJwtDelHeader(req: Request): string | null {
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null
}

/**
 * Resuelve el `ContextoActorExterno` para un `vinculoId` dado, verificando que pertenezca al
 * usuario autenticado por `jwt`. `fn_actor_externo_mis_vinculos` ya filtra por vigencia (ver
 * `20260932690000_ext1_funciones_identidad.sql`), así que un vínculo vencido simplemente no
 * aparece en la lista y esto resuelve a VINCULO_NO_PERTENECE sin necesidad de un chequeo de fecha aparte.
 */
export async function resolverContextoActorExterno(
  cliente: ClienteContextoActorExterno,
  jwt: string | null,
  vinculoId: string,
): Promise<ContextoActorExterno | ErrorContextoActorExterno> {
  if (!jwt) return { tipo: 'UNAUTHENTICATED' }

  const { data: userData, error: errorUser } = await cliente.auth.getUser(jwt)
  const authUserId = userData?.user?.id
  if (errorUser || !authUserId) return { tipo: 'UNAUTHENTICATED' }

  const { data: vinculos, error: errorVinculos } = await cliente.rpc(
    'fn_actor_externo_mis_vinculos',
    { p_auth_user_id: authUserId },
  )
  // Fallo de lectura ≠ vínculo ajeno: un error real de la RPC/BD se reporta como
  // INTERNAL_ERROR (mismo criterio que ver-estado-cuenta), no se disfraza de VINCULO_NO_PERTENECE.
  if (errorVinculos) return { tipo: 'INTERNAL_ERROR', mensaje: errorVinculos.message }

  const vinculo = (vinculos ?? []).find((v) => v.vinculo_id === vinculoId)
  if (!vinculo) return { tipo: 'VINCULO_NO_PERTENECE' }

  return {
    authUserId,
    vinculoId: vinculo.vinculo_id,
    tenantId: vinculo.tenant_id,
    inmuebleId: vinculo.inmueble_id,
    personaTipo: vinculo.persona_tipo,
    rolCodigo: vinculo.rol_codigo,
  }
}

/** Traduce un `ErrorContextoActorExterno` a la `Response` HTTP equivalente — mismo contrato
 * `403 VINCULO_NO_PERTENECE` + mismo texto que ya usan las 11 Edge Functions `external-*`
 * existentes (external-solicitudes-*, external-reservas-*, external-visitas-*) para este caso;
 * no se introduce un segundo código para el mismo significado. */
export function respuestaErrorContextoActorExterno(
  error: ErrorContextoActorExterno,
  correlationId: string,
): Response {
  switch (error.tipo) {
    case 'UNAUTHENTICATED':
      return errorResponse(
        401,
        'UNAUTHENTICATED',
        'Se requiere sesión activa.',
        undefined,
        correlationId,
      )
    case 'VINCULO_NO_PERTENECE':
      return errorResponse(
        403,
        'VINCULO_NO_PERTENECE',
        'Este vínculo no existe, no es tuyo, o ya no está vigente.',
        undefined,
        correlationId,
      )
    case 'INTERNAL_ERROR':
      return errorResponse(500, 'INTERNAL_ERROR', error.mensaje, undefined, correlationId)
  }
}
