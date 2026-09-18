/**
 * EXT-10 §6.1/§7.6 (Ola 2, M16) — Documentos para el actor externo (propietario/residente,
 * EXT-01). Cubre `external-documentos-listar` (Edge Function nueva de este corte) y la vía
 * `actor_externo` nueva de `generar-enlace-documento` (la vía `sesion` original, usada por
 * auxiliar+, no se toca — ya cubierta por tests/gobierno/prerrequisitos.test.ts y
 * tests/contabilidad/rendicion-cuentas.test.ts).
 *
 * `documentos` no tiene NINGUNA política RLS utilizable por un actor externo (AD-37) — por eso
 * los fixtures insertan la fila directo con el cliente `admin` (mismo criterio que
 * tests/external/cuenta-resumen.test.ts arma cargos con `admin`, sin pasar por subir-documento).
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
  console.warn('SALTADO tests/external/documentos: faltan variables de Supabase en .env')
}

interface DocumentoExterno {
  id: string
  nombre_archivo: string
  tipo_documento: string
  fecha_vencimiento: string | null
  tamano_bytes: number | null
  descripcion: string | null
  created_at: string
  alcance: 'copropiedad' | 'inmueble'
}

interface RespuestaListado {
  documentos: DocumentoExterno[]
}

interface RespuestaEnlace {
  documento_id: string
  token: string
  vigencia_dias: number
  expira_en: string
}

interface RespuestaVerDocumento {
  nombre_archivo: string
  url_firmada: string
}

interface ErrorHttpParseado {
  status: number | null
  codigo: string | null
  mensaje: string | null
}

/** Mismo desempaquetado de FunctionsHttpError que el resto de tests/external/*.test.ts. */
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

d('EXT-10: documentos desde External', () => {
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

  /** Tenant + inmueble + un actor externo YA vinculado (propietario) con sesión real (AD-37). */
  async function prepararTenantConActorExterno(etiqueta: string): Promise<{
    tenantId: string; inmuebleId: string; actorExternoVinculoId: string; clienteExterno: Cliente
  }> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const inmuebleId = await crearInmueble(tenant.id, `EXT10-${etiqueta}-${RUN_ID}`)
    const terceroId = await crearTercero(tenant.id, `${RUN_ID}-${etiqueta}`)
    const personaRolId = await crearPersonaRol(tenant.id, inmuebleId, terceroId)

    const email = `ext10-${RUN_ID}-${etiqueta}@example.test`
    const password = `Aa1${crypto.randomUUID()}`
    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (errorCrear) throw errorCrear
    usuariosCreados.push(creado.user.id)

    const vinculoId = await crearVinculo(tenant.id, personaRolId, creado.user.id)
    const clienteExterno = await clienteComo(env!, { id: creado.user.id, email, password })

    return { tenantId: tenant.id, inmuebleId, actorExternoVinculoId: vinculoId, clienteExterno }
  }

  /** Inserta un `documentos` directo (bypass subir-documento — mismo criterio que
   * cuenta-resumen.test.ts arma cargos directo). `inmuebleId: null` = documento de copropiedad. */
  async function crearDocumento(params: {
    tenantId: string
    inmuebleId: string | null
    nombreArchivo: string
    version?: number
    grupoId?: string
    storagePath?: string
  }): Promise<string> {
    const tipoDocId = await idListaTipos('TIPO_DOCUMENTO', 'otro_documento')
    const { data, error } = await admin.from('documentos').insert({
      tenant_id: params.tenantId,
      inmueble_id: params.inmuebleId,
      tipo_documento_id: tipoDocId,
      nombre_archivo: params.nombreArchivo,
      storage_path: params.storagePath ?? `${params.tenantId}/fixture/${crypto.randomUUID()}.pdf`,
      version: params.version ?? 1,
      ...(params.grupoId ? { grupo_id: params.grupoId } : {}),
    }).select('id, grupo_id').single<{ id: string; grupo_id: string }>()
    if (error) throw new Error(`fixture documento ${params.nombreArchivo}: ${error.message}`)
    return data.id
  }

  it('1. lista los documentos del propio inmueble', async () => {
    const t = await prepararTenantConActorExterno('d1')
    await crearDocumento({ tenantId: t.tenantId, inmuebleId: t.inmuebleId, nombreArchivo: 'contrato.pdf' })

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaListado>('external-documentos-listar', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.documentos).toHaveLength(1)
    expect(data!.documentos[0]!.nombre_archivo).toBe('contrato.pdf')
    expect(data!.documentos[0]!.alcance).toBe('inmueble')
    expect(data!.documentos[0]!.tipo_documento).toBe('Otro documento')
  }, 30_000)

  it('2. también ve documentos de copropiedad (inmueble_id null) del mismo tenant', async () => {
    const t = await prepararTenantConActorExterno('d2')
    await crearDocumento({ tenantId: t.tenantId, inmuebleId: null, nombreArchivo: 'reglamento-ph.pdf' })

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaListado>('external-documentos-listar', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.documentos).toHaveLength(1)
    expect(data!.documentos[0]!.alcance).toBe('copropiedad')
  }, 30_000)

  it('3. NO ve documentos de otro inmueble del mismo tenant', async () => {
    const t = await prepararTenantConActorExterno('d3')
    const otroInmuebleId = await crearInmueble(t.tenantId, `EXT10-d3-otro-${RUN_ID}`)
    await crearDocumento({ tenantId: t.tenantId, inmuebleId: otroInmuebleId, nombreArchivo: 'ajeno.pdf' })

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaListado>('external-documentos-listar', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.documentos).toEqual([])
  }, 30_000)

  it('4. solo trae la versión vigente de cada grupo (v_documento_vigente, nunca una vieja)', async () => {
    const t = await prepararTenantConActorExterno('d4')
    const grupoId = crypto.randomUUID()
    await crearDocumento({
      tenantId: t.tenantId, inmuebleId: t.inmuebleId, nombreArchivo: 'v1.pdf', version: 1, grupoId,
    })
    await crearDocumento({
      tenantId: t.tenantId, inmuebleId: t.inmuebleId, nombreArchivo: 'v2.pdf', version: 2, grupoId,
    })

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaListado>('external-documentos-listar', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.documentos).toHaveLength(1)
    expect(data!.documentos[0]!.nombre_archivo).toBe('v2.pdf')
  }, 30_000)

  it('5. un vínculo de otro actor → 403 VINCULO_NO_PERTENECE, nunca documentos ajenos', async () => {
    const a = await prepararTenantConActorExterno('d5a')
    const b = await prepararTenantConActorExterno('d5b')
    await crearDocumento({ tenantId: b.tenantId, inmuebleId: b.inmuebleId, nombreArchivo: 'de-b.pdf' })

    const { data, error } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaListado>('external-documentos-listar', {
        body: { vinculo_id: b.actorExternoVinculoId },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(403)
    expect(error!.codigo).toBe('VINCULO_NO_PERTENECE')
  }, 30_000)

  it('6. via actor_externo: firma un enlace para el propio documento y ver-documento lo resuelve', async () => {
    const t = await prepararTenantConActorExterno('d6')
    const rutaStorage = `${t.tenantId}/fixture/${crypto.randomUUID()}.pdf`
    // ver-documento firma la URL con Storage real (createSignedUrl falla con "Object not
    // found" si el objeto no existe físicamente) — a diferencia del resto de fixtures de esta
    // suite, este test SÍ necesita subir un objeto real, no solo la fila de `documentos`.
    const { error: errorSubida } = await admin.storage
      .from('documentos-inmueble')
      .upload(rutaStorage, new Blob(['contenido de prueba'], { type: 'application/pdf' }), { contentType: 'application/pdf' })
    if (errorSubida) throw new Error(`fixture storage: ${errorSubida.message}`)
    const documentoId = await crearDocumento({
      tenantId: t.tenantId, inmuebleId: t.inmuebleId, nombreArchivo: 'ver.pdf', storagePath: rutaStorage,
    })

    const { data: enlace, error: errorEnlace } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaEnlace>('generar-enlace-documento', {
        body: { via: 'actor_externo', vinculo_id: t.actorExternoVinculoId, documento_id: documentoId },
      }),
    )
    if (errorEnlace) throw new Error(errorEnlace.mensaje ?? 'fallo inesperado')
    expect(enlace!.documento_id).toBe(documentoId)

    const { data: resuelto, error: errorVer } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaVerDocumento>('ver-documento', {
        body: { id: enlace!.documento_id, t: enlace!.token },
      }),
    )
    if (errorVer) throw new Error(errorVer.mensaje ?? 'fallo inesperado')
    expect(resuelto!.nombre_archivo).toBe('ver.pdf')
    expect(resuelto!.url_firmada).toBeTruthy()
  }, 30_000)

  it('7. via actor_externo: NO puede firmar un enlace para un documento de otro inmueble del mismo tenant', async () => {
    const t = await prepararTenantConActorExterno('d7')
    const otroInmuebleId = await crearInmueble(t.tenantId, `EXT10-d7-otro-${RUN_ID}`)
    const documentoId = await crearDocumento({ tenantId: t.tenantId, inmuebleId: otroInmuebleId, nombreArchivo: 'ajeno.pdf' })

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaEnlace>('generar-enlace-documento', {
        body: { via: 'actor_externo', vinculo_id: t.actorExternoVinculoId, documento_id: documentoId },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(404)
    expect(error!.codigo).toBe('DOCUMENTO_NO_ENCONTRADO')
  }, 30_000)

  it('8. via actor_externo: un vínculo ajeno → 403 VINCULO_NO_PERTENECE', async () => {
    const a = await prepararTenantConActorExterno('d8a')
    const b = await prepararTenantConActorExterno('d8b')
    const documentoId = await crearDocumento({ tenantId: b.tenantId, inmuebleId: b.inmuebleId, nombreArchivo: 'de-b.pdf' })

    const { data, error } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaEnlace>('generar-enlace-documento', {
        body: { via: 'actor_externo', vinculo_id: b.actorExternoVinculoId, documento_id: documentoId },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(403)
    expect(error!.codigo).toBe('VINCULO_NO_PERTENECE')
  }, 30_000)

  it('9. sin via (comportamiento por defecto = sesion) sigue exigiendo has_role auxiliar, no rompe compatibilidad', async () => {
    const t = await prepararTenantConActorExterno('d9')
    const documentoId = await crearDocumento({ tenantId: t.tenantId, inmuebleId: t.inmuebleId, nombreArchivo: 'legacy.pdf' })

    // El actor externo NUNCA es tenant_member (AD-37) — sin `via` explícito, cae en la vía
    // 'sesion' original, que exige is_member+has_role auxiliar. Documento ni siquiera visible
    // por RLS a este cliente → 404 (mismo comportamiento previo a este corte, sin via).
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaEnlace>('generar-enlace-documento', {
        body: { documento_id: documentoId },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(404)
    expect(error!.codigo).toBe('DOCUMENTO_NO_ENCONTRADO')
  }, 30_000)
})
