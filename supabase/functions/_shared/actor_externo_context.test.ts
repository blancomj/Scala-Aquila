// Cobertura de _shared/actor_externo_context.ts (EXT-06) — corre con `deno test`, mismo runner
// que rate_limit.test.ts/link_token.test.ts. El cliente se dobla con un objeto plano que cumple
// la interfaz estructural mínima que el módulo declara — sin tocar la red ni una BD real.
import { assertEquals } from 'jsr:@std/assert@^1'
import {
  extraerJwtDelHeader,
  resolverContextoActorExterno,
  respuestaErrorContextoActorExterno,
  type VinculoActorExterno,
} from './actor_externo_context.ts'

const VINCULO_A: VinculoActorExterno = {
  vinculo_id: 'aaaaaaaa-0000-0000-0000-000000000001',
  tenant_id: 'tenant-1',
  tenant_nombre: 'Conjunto Uno',
  inmueble_id: 'inmueble-1',
  persona_tipo: 'natural',
  rol_codigo: 'copropietario',
  vigente_desde: '2026-01-01',
  vigente_hasta: null,
}

const VINCULO_B: VinculoActorExterno = {
  ...VINCULO_A,
  vinculo_id: 'bbbbbbbb-0000-0000-0000-000000000002',
  tenant_id: 'tenant-2',
  inmueble_id: 'inmueble-2',
  rol_codigo: 'arrendatario',
}

function clienteConVinculos(
  vinculos: VinculoActorExterno[] | null,
  opciones: { errorRpc?: { message: string }; usuarioId?: string | null; errorAuth?: unknown } = {},
) {
  return {
    auth: {
      getUser: (_jwt: string) =>
        Promise.resolve({
          data: { user: opciones.usuarioId === undefined ? { id: 'user-1' } : opciones.usuarioId ? { id: opciones.usuarioId } : null },
          error: opciones.errorAuth ?? null,
        }),
    },
    rpc: (_fn: 'fn_actor_externo_mis_vinculos', _args: { p_auth_user_id: string }) =>
      Promise.resolve({ data: vinculos, error: opciones.errorRpc ?? null }),
  }
}

Deno.test('resolverContextoActorExterno: sin jwt → UNAUTHENTICATED', async () => {
  const resultado = await resolverContextoActorExterno(
    clienteConVinculos([VINCULO_A]),
    null,
    VINCULO_A.vinculo_id,
  )
  assertEquals(resultado, { tipo: 'UNAUTHENTICATED' })
})

Deno.test('resolverContextoActorExterno: jwt inválido (getUser sin usuario) → UNAUTHENTICATED', async () => {
  const resultado = await resolverContextoActorExterno(
    clienteConVinculos([VINCULO_A], { usuarioId: null }),
    'jwt-cualquiera',
    VINCULO_A.vinculo_id,
  )
  assertEquals(resultado, { tipo: 'UNAUTHENTICATED' })
})

Deno.test('resolverContextoActorExterno: getUser devuelve error → UNAUTHENTICATED', async () => {
  const resultado = await resolverContextoActorExterno(
    clienteConVinculos([VINCULO_A], { usuarioId: null, errorAuth: { message: 'token inválido' } }),
    'jwt-cualquiera',
    VINCULO_A.vinculo_id,
  )
  assertEquals(resultado, { tipo: 'UNAUTHENTICATED' })
})

Deno.test('resolverContextoActorExterno: vínculo propio → contexto resuelto correctamente', async () => {
  const resultado = await resolverContextoActorExterno(
    clienteConVinculos([VINCULO_A, VINCULO_B]),
    'jwt-valido',
    VINCULO_A.vinculo_id,
  )
  assertEquals(resultado, {
    authUserId: 'user-1',
    vinculoId: VINCULO_A.vinculo_id,
    tenantId: VINCULO_A.tenant_id,
    inmuebleId: VINCULO_A.inmueble_id,
    personaTipo: VINCULO_A.persona_tipo,
    rolCodigo: VINCULO_A.rol_codigo,
  })
})

Deno.test('resolverContextoActorExterno: vinculo_id que no está en la lista del usuario → VINCULO_NO_PERTENECE (no 404)', async () => {
  // Caso central de seguridad: un actor externo intentando leer el vínculo de otro (IDOR) no
  // debe distinguirse de un vínculo inexistente — ambos responden VINCULO_NO_PERTENECE.
  const resultado = await resolverContextoActorExterno(
    clienteConVinculos([VINCULO_A]),
    'jwt-valido',
    VINCULO_B.vinculo_id,
  )
  assertEquals(resultado, { tipo: 'VINCULO_NO_PERTENECE' })
})

Deno.test('resolverContextoActorExterno: lista de vínculos vacía → VINCULO_NO_PERTENECE', async () => {
  const resultado = await resolverContextoActorExterno(
    clienteConVinculos([]),
    'jwt-valido',
    VINCULO_A.vinculo_id,
  )
  assertEquals(resultado, { tipo: 'VINCULO_NO_PERTENECE' })
})

Deno.test('resolverContextoActorExterno: rpc devuelve data=null → VINCULO_NO_PERTENECE (no lanza)', async () => {
  const resultado = await resolverContextoActorExterno(
    clienteConVinculos(null),
    'jwt-valido',
    VINCULO_A.vinculo_id,
  )
  assertEquals(resultado, { tipo: 'VINCULO_NO_PERTENECE' })
})

Deno.test('resolverContextoActorExterno: error real de la RPC → INTERNAL_ERROR, no VINCULO_NO_PERTENECE', async () => {
  const resultado = await resolverContextoActorExterno(
    clienteConVinculos([VINCULO_A], { errorRpc: { message: 'boom' } }),
    'jwt-valido',
    VINCULO_A.vinculo_id,
  )
  assertEquals(resultado, { tipo: 'INTERNAL_ERROR', mensaje: 'boom' })
})

Deno.test('extraerJwtDelHeader: toma el token tras "Bearer "', () => {
  const req = new Request('https://example.test', {
    headers: { authorization: 'Bearer abc.def.ghi' },
  })
  assertEquals(extraerJwtDelHeader(req), 'abc.def.ghi')
})

Deno.test('extraerJwtDelHeader: sin header → null', () => {
  const req = new Request('https://example.test')
  assertEquals(extraerJwtDelHeader(req), null)
})

Deno.test('respuestaErrorContextoActorExterno: UNAUTHENTICATED → 401', async () => {
  const respuesta = respuestaErrorContextoActorExterno({ tipo: 'UNAUTHENTICATED' }, 'corr-1')
  assertEquals(respuesta.status, 401)
  const cuerpo = (await respuesta.json()) as { error: { code: string } }
  assertEquals(cuerpo.error.code, 'UNAUTHENTICATED')
})

Deno.test('respuestaErrorContextoActorExterno: VINCULO_NO_PERTENECE → 403', async () => {
  const respuesta = respuestaErrorContextoActorExterno({ tipo: 'VINCULO_NO_PERTENECE' }, 'corr-2')
  assertEquals(respuesta.status, 403)
  const cuerpo = (await respuesta.json()) as { error: { code: string } }
  assertEquals(cuerpo.error.code, 'VINCULO_NO_PERTENECE')
})

Deno.test('respuestaErrorContextoActorExterno: INTERNAL_ERROR → 500 con el mensaje real', async () => {
  const respuesta = respuestaErrorContextoActorExterno(
    { tipo: 'INTERNAL_ERROR', mensaje: 'boom' },
    'corr-3',
  )
  assertEquals(respuesta.status, 500)
  const cuerpo = (await respuesta.json()) as { error: { code: string; message: string } }
  assertEquals(cuerpo.error.code, 'INTERNAL_ERROR')
  assertEquals(cuerpo.error.message, 'boom')
})
