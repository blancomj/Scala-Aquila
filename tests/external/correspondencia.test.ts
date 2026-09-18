/**
 * EXT-12 §4.1/§7.7/§8.4 (Ola 2, M17) — correspondencia/paquetería. El lado de escritura
 * (correspondencia-registrar) es SIEMPRE staff (auxiliar/administrador) — el residente solo lee
 * vía external-correspondencia-listar, nunca escribe esta tabla (ni directo ni por Edge Function).
 *
 * `correspondencia` no tiene política RLS de escritura para nadie (ni staff) — todo pasa por
 * correspondencia-registrar con service_role.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type Cliente,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/external/correspondencia: faltan variables de Supabase en .env')
}

interface FilaCorrespondencia {
  id: string
  inmueble_id: string
  destino: string
  remitente: string
  entregada: boolean
  entregada_a: string | null
  entregada_at: string | null
}

interface RespuestaListado {
  correspondencia: { id: string; destino: string; remitente: string; entregada: boolean; entregada_a: string | null; entregada_at: string | null }[]
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

d('EXT-12: correspondencia desde External', () => {
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

  /** Tenant + inmueble + un actor externo YA vinculado + un staff (auxiliar) del mismo tenant. */
  async function prepararEscenario(etiqueta: string): Promise<{
    tenantId: string; inmuebleId: string; vinculoId: string; clienteExterno: Cliente; clienteStaff: Cliente
  }> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const inmuebleId = await crearInmueble(tenant.id, `EXT12-${etiqueta}-${RUN_ID}`)
    const terceroId = await crearTercero(tenant.id, `${RUN_ID}-${etiqueta}`)
    const personaRolId = await crearPersonaRol(tenant.id, inmuebleId, terceroId)

    const email = `ext12-${RUN_ID}-${etiqueta}@example.test`
    const password = `Aa1${crypto.randomUUID()}`
    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (errorCrear) throw errorCrear
    usuariosCreados.push(creado.user.id)
    const vinculoId = await crearVinculo(tenant.id, personaRolId, creado.user.id)
    const clienteExterno = await clienteComo(env!, { id: creado.user.id, email, password })

    const staff = await crearUsuario(admin, `ext12-staff-${etiqueta}`)
    usuariosCreados.push(staff.id)
    await crearMembership(admin, tenant.id, staff.id, 'auxiliar')
    const clienteStaff = await clienteComo(env!, staff)

    return { tenantId: tenant.id, inmuebleId, vinculoId, clienteExterno, clienteStaff }
  }

  it('1. staff registra y el residente lo ve como "en portería" (entregada=false)', async () => {
    const e = await prepararEscenario('cx1')
    const { data: creado, error: errorCrear } = await invocarConError(
      e.clienteStaff.functions.invoke<FilaCorrespondencia>('correspondencia-registrar', {
        body: { accion: 'registrar', inmueble_id: e.inmuebleId, destino: 'Juan Residente', remitente: 'Mercado Libre' },
      }),
    )
    if (errorCrear) throw new Error(errorCrear.mensaje ?? 'fallo inesperado')
    expect(creado!.entregada).toBe(false)

    const { data: lista, error: errorLista } = await invocarConError(
      e.clienteExterno.functions.invoke<RespuestaListado>('external-correspondencia-listar', {
        body: { vinculo_id: e.vinculoId },
      }),
    )
    if (errorLista) throw new Error(errorLista.mensaje ?? 'fallo inesperado')
    expect(lista!.correspondencia).toHaveLength(1)
    expect(lista!.correspondencia[0]!.entregada).toBe(false)
    expect(lista!.correspondencia[0]!.remitente).toBe('Mercado Libre')
  }, 30_000)

  it('2. un actor externo (nunca tenant_member) no puede registrar → 403 FORBIDDEN', async () => {
    const e = await prepararEscenario('cx2')
    const { data, error } = await invocarConError(
      e.clienteExterno.functions.invoke<FilaCorrespondencia>('correspondencia-registrar', {
        body: { accion: 'registrar', inmueble_id: e.inmuebleId, destino: 'Juan Residente', remitente: 'Alguien' },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(403)
    expect(error!.codigo).toBe('FORBIDDEN')
  }, 30_000)

  it('3. staff marca entregada y el residente ve el cambio reflejado', async () => {
    const e = await prepararEscenario('cx3')
    const { data: creado, error: errorCrear } = await invocarConError(
      e.clienteStaff.functions.invoke<FilaCorrespondencia>('correspondencia-registrar', {
        body: { accion: 'registrar', inmueble_id: e.inmuebleId, destino: 'Juan Residente', remitente: 'Rappi' },
      }),
    )
    if (errorCrear) throw new Error(errorCrear.mensaje ?? 'fallo inesperado')

    const { data: entregada, error: errorEntregar } = await invocarConError(
      e.clienteStaff.functions.invoke<FilaCorrespondencia>('correspondencia-registrar', {
        body: { accion: 'marcar_entregada', correspondencia_id: creado!.id, entregada_a: 'Juan Residente' },
      }),
    )
    if (errorEntregar) throw new Error(errorEntregar.mensaje ?? 'fallo inesperado')
    expect(entregada!.entregada).toBe(true)
    expect(entregada!.entregada_a).toBe('Juan Residente')

    const { data: lista, error: errorLista } = await invocarConError(
      e.clienteExterno.functions.invoke<RespuestaListado>('external-correspondencia-listar', {
        body: { vinculo_id: e.vinculoId },
      }),
    )
    if (errorLista) throw new Error(errorLista.mensaje ?? 'fallo inesperado')
    expect(lista!.correspondencia[0]!.entregada).toBe(true)
    expect(lista!.correspondencia[0]!.entregada_a).toBe('Juan Residente')
  }, 30_000)

  it('4. marcar entregada dos veces la segunda vez falla con 409 CORRESPONDENCIA_YA_ENTREGADA', async () => {
    const e = await prepararEscenario('cx4')
    const { data: creado, error: errorCrear } = await invocarConError(
      e.clienteStaff.functions.invoke<FilaCorrespondencia>('correspondencia-registrar', {
        body: { accion: 'registrar', inmueble_id: e.inmuebleId, destino: 'Juan Residente', remitente: 'Amazon' },
      }),
    )
    if (errorCrear) throw new Error(errorCrear.mensaje ?? 'fallo inesperado')
    await invocarConError(
      e.clienteStaff.functions.invoke<FilaCorrespondencia>('correspondencia-registrar', {
        body: { accion: 'marcar_entregada', correspondencia_id: creado!.id, entregada_a: 'Juan Residente' },
      }),
    )

    const { data, error } = await invocarConError(
      e.clienteStaff.functions.invoke<FilaCorrespondencia>('correspondencia-registrar', {
        body: { accion: 'marcar_entregada', correspondencia_id: creado!.id, entregada_a: 'Otra Persona' },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(409)
    expect(error!.codigo).toBe('CORRESPONDENCIA_YA_ENTREGADA')
  }, 30_000)

  it('5. un residente de otro inmueble del mismo tenant no ve correspondencia ajena', async () => {
    const a = await prepararEscenario('cx5a')
    const b = await prepararEscenario('cx5b')
    await invocarConError(
      a.clienteStaff.functions.invoke<FilaCorrespondencia>('correspondencia-registrar', {
        body: { accion: 'registrar', inmueble_id: a.inmuebleId, destino: 'De A', remitente: 'Alguien' },
      }),
    )

    const { data, error } = await invocarConError(
      b.clienteExterno.functions.invoke<RespuestaListado>('external-correspondencia-listar', {
        body: { vinculo_id: b.vinculoId },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.correspondencia).toEqual([])
  }, 30_000)

  it('6. un vínculo ajeno → 403 VINCULO_NO_PERTENECE', async () => {
    const a = await prepararEscenario('cx6a')
    const b = await prepararEscenario('cx6b')
    const { data, error } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaListado>('external-correspondencia-listar', {
        body: { vinculo_id: b.vinculoId },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(403)
    expect(error!.codigo).toBe('VINCULO_NO_PERTENECE')
  }, 30_000)

  it('7. registrar sin destino o remitente → 400 INVALID_PAYLOAD', async () => {
    const e = await prepararEscenario('cx7')
    const { data, error } = await invocarConError(
      e.clienteStaff.functions.invoke<FilaCorrespondencia>('correspondencia-registrar', {
        body: { accion: 'registrar', inmueble_id: e.inmuebleId, destino: '', remitente: 'Alguien' },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(400)
    expect(error!.codigo).toBe('INVALID_PAYLOAD')
  }, 30_000)

  it('8. registrar con inmueble_id inexistente → 404 INMUEBLE_NO_ENCONTRADO', async () => {
    const e = await prepararEscenario('cx8')
    const { data, error } = await invocarConError(
      e.clienteStaff.functions.invoke<FilaCorrespondencia>('correspondencia-registrar', {
        body: { accion: 'registrar', inmueble_id: '00000000-0000-0000-0000-000000000000', destino: 'X', remitente: 'Y' },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(404)
    expect(error!.codigo).toBe('INMUEBLE_NO_ENCONTRADO')
  }, 30_000)

  it('9. una accion desconocida → 400 INVALID_PAYLOAD', async () => {
    const e = await prepararEscenario('cx9')
    const { data, error } = await invocarConError(
      e.clienteStaff.functions.invoke<FilaCorrespondencia>('correspondencia-registrar', {
        body: { accion: 'borrar', inmueble_id: e.inmuebleId },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(400)
    expect(error!.codigo).toBe('INVALID_PAYLOAD')
  }, 30_000)
})
