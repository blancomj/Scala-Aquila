/**
 * EXT-14 §4.1/§7.9 (Ola 2, M19) — contactos de emergencia. Ligados a `inmueble_id`, no a
 * persona/vínculo puntual (§4.1): cualquier residente del MISMO inmueble ve/crea/elimina los
 * mismos contactos, no solo los que él mismo creó — varias pruebas de esta suite verifican
 * justamente eso, con un segundo vínculo sobre el mismo inmueble.
 *
 * `contactos_emergencia` no tiene NINGUNA política RLS (ni de lectura ni de escritura) — todo
 * pasa por external-contactos-emergencia con service_role.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
  clienteComo,
  crearTenant,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type Cliente,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/external/contactos-emergencia: faltan variables de Supabase en .env')
}

interface Contacto {
  id: string
  nombre: string
  telefono: string
  parentesco: string | null
  created_at: string
}

interface RespuestaListado {
  contactos: Contacto[]
}

interface ErrorHttpParseado {
  status: number | null
  codigo: string | null
  mensaje: string | null
}

function invocarConError<T>(
  promesa: Promise<{ data: T | null; error: unknown }>,
): Promise<{ data: T | null; error: ErrorHttpParseado | null }> {
  return promesa.then(async ({ data, error }) => {
    if (!error) return { data, error: null }
    const contexto = (error as { context?: unknown }).context
    let status: number | null = null
    let cuerpo: { error?: { code?: string; message?: string } } = {}
    if (contexto instanceof Response) {
      status = contexto.status
      try {
        cuerpo = (await contexto.clone().json()) as typeof cuerpo
      } catch {
        // sin cuerpo JSON legible — se deja vacío.
      }
    }
    return { data: null, error: { status, codigo: cuerpo.error?.code ?? null, mensaje: cuerpo.error?.message ?? null } }
  })
}

d('EXT-14: contactos de emergencia desde External', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: string[] = []
  const tercerosCreados: string[] = []

  afterAll(async () => {
    for (const id of usuariosCreados) await eliminarUsuario(admin, id)
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const id of tercerosCreados) {
      await admin.from('inmueble_persona_rol').delete().eq('tercero_id', id)
      await admin.from('terceros').delete().eq('id', id)
    }
  }, 60_000)

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', tipo).eq('codigo', codigo).is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  async function crearInmueble(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_INMUEBLE', 'apartamento')
    const { data, error } = await admin
      .from('inmuebles').insert({ tenant_id: tenantId, codigo, tipo_id: tipoId })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearTercero(tenantId: string, sello: string): Promise<string> {
    const tipoIdentId = await idListaTipos('TIPO_IDENTIFICACION', 'cedula')
    const estadoActivoId = await idListaTipos('ESTADO_TERCERO', 'activo')
    const { data, error } = await admin.from('terceros').insert({
      tenant_id: tenantId, tipo_persona: 'natural', tipo_identificacion_id: tipoIdentId,
      numero_documento: sello, primer_nombre: 'Externo', primer_apellido: sello, estado_id: estadoActivoId,
    }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture tercero ${sello}: ${error.message}`)
    tercerosCreados.push(data.id)
    return data.id
  }

  async function crearPersonaRol(tenantId: string, inmuebleId: string, terceroId: string): Promise<string> {
    const rolId = await idListaTipos('PERSONA_PREDIO', 'copropietario')
    const { data, error } = await admin
      .from('inmueble_persona_rol')
      .insert({ tenant_id: tenantId, inmueble_id: inmuebleId, tercero_id: terceroId, rol_id: rolId, vigente_desde: '2020-01-01' })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble_persona_rol: ${error.message}`)
    return data.id
  }

  async function crearVinculo(tenantId: string, personaRolId: string, authUserId: string): Promise<string> {
    const { error } = await admin.rpc('fn_actor_externo_registrar_vinculo', {
      p_tenant_id: tenantId, p_auth_user_id: authUserId, p_persona_rol_id: personaRolId,
      p_persona_tipo: 'propietario', p_origen: 'staff',
    })
    if (error) throw error
    const { data: vinculo, error: errorLeer } = await admin
      .from('actor_externo_vinculo').select('id').eq('auth_user_id', authUserId).eq('persona_rol_id', personaRolId)
      .single<{ id: string }>()
    if (errorLeer) throw errorLeer
    return vinculo.id
  }

  async function crearActorExterno(etiqueta: string): Promise<{ authUserId: string; email: string; password: string }> {
    const email = `ext14-${RUN_ID}-${etiqueta}@example.test`
    const password = `Aa1${crypto.randomUUID()}`
    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (errorCrear) throw errorCrear
    usuariosCreados.push(creado.user.id)
    return { authUserId: creado.user.id, email, password }
  }

  /** Tenant + inmueble + un actor externo YA vinculado (propietario) con sesión real (AD-37). */
  async function prepararTenantConActorExterno(etiqueta: string): Promise<{
    tenantId: string; inmuebleId: string; actorExternoVinculoId: string; clienteExterno: Cliente
  }> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const inmuebleId = await crearInmueble(tenant.id, `EXT14-${etiqueta}-${RUN_ID}`)
    const terceroId = await crearTercero(tenant.id, `${RUN_ID}-${etiqueta}`)
    const personaRolId = await crearPersonaRol(tenant.id, inmuebleId, terceroId)
    const usuario = await crearActorExterno(etiqueta)
    const vinculoId = await crearVinculo(tenant.id, personaRolId, usuario.authUserId)
    const clienteExterno = await clienteComo(env!, { id: usuario.authUserId, email: usuario.email, password: usuario.password })
    return { tenantId: tenant.id, inmuebleId, actorExternoVinculoId: vinculoId, clienteExterno }
  }

  /** Un SEGUNDO vínculo (otra persona) sobre el MISMO inmueble — para probar que "cualquier
   * residente del mismo inmueble" gestiona los mismos contactos, no solo quien los creó. */
  async function agregarSegundoVinculo(
    tenantId: string, inmuebleId: string, etiqueta: string,
  ): Promise<{ vinculoId: string; clienteExterno: Cliente }> {
    const terceroId = await crearTercero(tenantId, `${RUN_ID}-${etiqueta}`)
    const personaRolId = await crearPersonaRol(tenantId, inmuebleId, terceroId)
    const usuario = await crearActorExterno(etiqueta)
    const vinculoId = await crearVinculo(tenantId, personaRolId, usuario.authUserId)
    const clienteExterno = await clienteComo(env!, { id: usuario.authUserId, email: usuario.email, password: usuario.password })
    return { vinculoId, clienteExterno }
  }

  it('1. listar sin contactos da un arreglo vacío, nunca un error', async () => {
    const t = await prepararTenantConActorExterno('c1')
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaListado>('external-contactos-emergencia', {
        body: { vinculo_id: t.actorExternoVinculoId, accion: 'listar' },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.contactos).toEqual([])
  }, 30_000)

  it('2. crear un contacto y verlo en el listado', async () => {
    const t = await prepararTenantConActorExterno('c2')
    const { data: creado, error: errorCrear } = await invocarConError(
      t.clienteExterno.functions.invoke<Contacto>('external-contactos-emergencia', {
        body: { vinculo_id: t.actorExternoVinculoId, accion: 'crear', nombre: 'Mamá', telefono: '3001234567', parentesco: 'madre' },
      }),
    )
    if (errorCrear) throw new Error(errorCrear.mensaje ?? 'fallo inesperado')
    expect(creado!.nombre).toBe('Mamá')

    const { data: lista, error: errorLista } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaListado>('external-contactos-emergencia', {
        body: { vinculo_id: t.actorExternoVinculoId, accion: 'listar' },
      }),
    )
    if (errorLista) throw new Error(errorLista.mensaje ?? 'fallo inesperado')
    expect(lista!.contactos).toHaveLength(1)
    expect(lista!.contactos[0]!.telefono).toBe('3001234567')
  }, 30_000)

  it('3. crear sin nombre o sin teléfono → 400 INVALID_PAYLOAD', async () => {
    const t = await prepararTenantConActorExterno('c3')
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<Contacto>('external-contactos-emergencia', {
        body: { vinculo_id: t.actorExternoVinculoId, accion: 'crear', nombre: '  ', telefono: '3001234567' },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(400)
    expect(error!.codigo).toBe('INVALID_PAYLOAD')
  }, 30_000)

  it('4. un segundo residente del MISMO inmueble ve el contacto creado por el primero', async () => {
    const t = await prepararTenantConActorExterno('c4')
    await invocarConError(
      t.clienteExterno.functions.invoke<Contacto>('external-contactos-emergencia', {
        body: { vinculo_id: t.actorExternoVinculoId, accion: 'crear', nombre: 'Vecino', telefono: '3009999999' },
      }),
    )
    const segundo = await agregarSegundoVinculo(t.tenantId, t.inmuebleId, 'c4b')

    const { data, error } = await invocarConError(
      segundo.clienteExterno.functions.invoke<RespuestaListado>('external-contactos-emergencia', {
        body: { vinculo_id: segundo.vinculoId, accion: 'listar' },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.contactos).toHaveLength(1)
    expect(data!.contactos[0]!.nombre).toBe('Vecino')
  }, 30_000)

  it('5. un segundo residente del MISMO inmueble puede eliminar un contacto que no creó él', async () => {
    const t = await prepararTenantConActorExterno('c5')
    const { data: creado, error: errorCrear } = await invocarConError(
      t.clienteExterno.functions.invoke<Contacto>('external-contactos-emergencia', {
        body: { vinculo_id: t.actorExternoVinculoId, accion: 'crear', nombre: 'Borrar', telefono: '3005555555' },
      }),
    )
    if (errorCrear) throw new Error(errorCrear.mensaje ?? 'fallo inesperado')
    const segundo = await agregarSegundoVinculo(t.tenantId, t.inmuebleId, 'c5b')

    const { data, error } = await invocarConError(
      segundo.clienteExterno.functions.invoke<{ eliminado: boolean }>('external-contactos-emergencia', {
        body: { vinculo_id: segundo.vinculoId, accion: 'eliminar', contacto_id: creado!.id },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.eliminado).toBe(true)
  }, 30_000)

  it('6. NO ve contactos de otro inmueble del mismo tenant', async () => {
    const t = await prepararTenantConActorExterno('c6')
    const otroInmuebleId = await crearInmueble(t.tenantId, `EXT14-c6-otro-${RUN_ID}`)
    const terceroId = await crearTercero(t.tenantId, `${RUN_ID}-c6-otro`)
    const personaRolId = await crearPersonaRol(t.tenantId, otroInmuebleId, terceroId)
    const usuario = await crearActorExterno('c6-otro')
    const otroVinculoId = await crearVinculo(t.tenantId, personaRolId, usuario.authUserId)
    const clienteOtro = await clienteComo(env!, { id: usuario.authUserId, email: usuario.email, password: usuario.password })
    await invocarConError(
      clienteOtro.functions.invoke<Contacto>('external-contactos-emergencia', {
        body: { vinculo_id: otroVinculoId, accion: 'crear', nombre: 'De otro inmueble', telefono: '3001112222' },
      }),
    )

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaListado>('external-contactos-emergencia', {
        body: { vinculo_id: t.actorExternoVinculoId, accion: 'listar' },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.contactos).toEqual([])
  }, 30_000)

  it('7. NO puede eliminar un contacto de otro inmueble → 404 CONTACTO_NO_ENCONTRADO', async () => {
    const a = await prepararTenantConActorExterno('c7a')
    const b = await prepararTenantConActorExterno('c7b')
    const { data: creadoB, error: errorCrearB } = await invocarConError(
      b.clienteExterno.functions.invoke<Contacto>('external-contactos-emergencia', {
        body: { vinculo_id: b.actorExternoVinculoId, accion: 'crear', nombre: 'De B', telefono: '3003334444' },
      }),
    )
    if (errorCrearB) throw new Error(errorCrearB.mensaje ?? 'fallo inesperado')

    const { data, error } = await invocarConError(
      a.clienteExterno.functions.invoke<{ eliminado: boolean }>('external-contactos-emergencia', {
        body: { vinculo_id: a.actorExternoVinculoId, accion: 'eliminar', contacto_id: creadoB!.id },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(404)
    expect(error!.codigo).toBe('CONTACTO_NO_ENCONTRADO')
  }, 30_000)

  it('8. un vínculo de otro actor → 403 VINCULO_NO_PERTENECE', async () => {
    const a = await prepararTenantConActorExterno('c8a')
    const b = await prepararTenantConActorExterno('c8b')
    const { data, error } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaListado>('external-contactos-emergencia', {
        body: { vinculo_id: b.actorExternoVinculoId, accion: 'listar' },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(403)
    expect(error!.codigo).toBe('VINCULO_NO_PERTENECE')
  }, 30_000)

  it('9. una accion desconocida → 400 INVALID_PAYLOAD', async () => {
    const t = await prepararTenantConActorExterno('c9')
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaListado>('external-contactos-emergencia', {
        body: { vinculo_id: t.actorExternoVinculoId, accion: 'actualizar' },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(400)
    expect(error!.codigo).toBe('INVALID_PAYLOAD')
  }, 30_000)
})
