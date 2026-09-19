/**
 * Unificación de plantilla (D-14x) — external-estado-cuenta-ver: el mismo documento formal con
 * folio+hash que ver-estado-cuenta (D-27/D-28) sirve al staff/token, resuelto aquí para un actor
 * externo autenticado por vínculo en vez de token HMAC o membership (AD-37: nunca es tenant_member,
 * así que no puede pasar por ninguna de esas dos puertas). Mismo patrón de fixtures que
 * tests/external/cuenta-resumen.test.ts.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import { createHash } from 'node:crypto'
import type { Json } from '@aquila/shared'
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
  console.warn('SALTADO tests/external/estado-cuenta-ver: faltan variables de Supabase en .env')
}

interface DatosMinimos {
  tenant_nombre: string
  tenant_nit: string | null
  inmueble_codigo: string
  movimientos: unknown[]
  saldo_final: number
  generado_en: string
}

interface RespuestaComprobante {
  existe: boolean
  datos?: DatosMinimos
  folio?: string | null
  contenido_hash?: string
  pago_habilitado?: boolean
}

interface ErrorHttpParseado {
  status: number | null
  codigo: string | null
  mensaje: string | null
}

/** Mismo desempaquetado de FunctionsHttpError que tests/external/cuenta-resumen.test.ts. */
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
    return {
      data: null,
      error: { status, codigo: cuerpo.error?.code ?? null, mensaje: cuerpo.error?.message ?? null },
    }
  })
}

d('EXT-comprobante: external-estado-cuenta-ver', () => {
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
      .from('lista_tipos')
      .select('id')
      .eq('tipo', tipo)
      .eq('codigo', codigo)
      .is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  async function crearInmueble(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_INMUEBLE', 'apartamento')
    const { data, error } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantId, codigo, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearTercero(tenantId: string, sello: string): Promise<string> {
    const tipoIdentId = await idListaTipos('TIPO_IDENTIFICACION', 'cedula')
    const estadoActivoId = await idListaTipos('ESTADO_TERCERO', 'activo')
    const { data, error } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenantId,
        tipo_persona: 'natural',
        tipo_identificacion_id: tipoIdentId,
        numero_documento: sello,
        primer_nombre: 'Externo',
        primer_apellido: sello,
        estado_id: estadoActivoId,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture tercero ${sello}: ${error.message}`)
    tercerosCreados.push(data.id)
    return data.id
  }

  async function crearPersonaRol(
    tenantId: string,
    inmuebleId: string,
    terceroId: string,
  ): Promise<string> {
    const rolId = await idListaTipos('PERSONA_PREDIO', 'copropietario')
    const { data, error } = await admin
      .from('inmueble_persona_rol')
      .insert({
        tenant_id: tenantId,
        inmueble_id: inmuebleId,
        tercero_id: terceroId,
        rol_id: rolId,
        vigente_desde: '2020-01-01',
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble_persona_rol: ${error.message}`)
    return data.id
  }

  async function crearVinculo(
    tenantId: string,
    personaRolId: string,
    authUserId: string,
  ): Promise<string> {
    const { error } = await admin.rpc('fn_actor_externo_registrar_vinculo', {
      p_tenant_id: tenantId,
      p_auth_user_id: authUserId,
      p_persona_rol_id: personaRolId,
      p_persona_tipo: 'propietario',
      p_origen: 'staff',
    })
    if (error) throw error
    const { data: vinculo, error: errorLeer } = await admin
      .from('actor_externo_vinculo')
      .select('id')
      .eq('auth_user_id', authUserId)
      .eq('persona_rol_id', personaRolId)
      .single<{ id: string }>()
    if (errorLeer) throw errorLeer
    return vinculo.id
  }

  /** Tenant + inmueble + actor externo vinculado, sin comprobante emitido todavía. */
  async function prepararTenantConActorExterno(
    etiqueta: string,
  ): Promise<{
    tenantId: string
    inmuebleId: string
    actorExternoVinculoId: string
    clienteExterno: Cliente
  }> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const inmuebleId = await crearInmueble(tenant.id, `EXTCC-${etiqueta}-${RUN_ID}`)
    const terceroId = await crearTercero(tenant.id, `${RUN_ID}-${etiqueta}`)
    const personaRolId = await crearPersonaRol(tenant.id, inmuebleId, terceroId)

    const email = `extcc-${RUN_ID}-${etiqueta}@example.test`
    const password = `Aa1${crypto.randomUUID()}`
    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (errorCrear) throw errorCrear
    usuariosCreados.push(creado.user.id)

    const vinculoId = await crearVinculo(tenant.id, personaRolId, creado.user.id)
    const clienteExterno = await clienteComo(env!, { id: creado.user.id, email, password })

    return { tenantId: tenant.id, inmuebleId, actorExternoVinculoId: vinculoId, clienteExterno }
  }

  /** Un `estados_cuenta_generados` real para `inmuebleId` — misma forma que produce
   * fn_emitir_estados_cuenta, mínima para lo que compara este archivo. Devuelve `datos` releído
   * de la base (no el objeto local que se insertó): jsonb normaliza el orden de las claves al
   * guardar, así que el `JSON.stringify` determinista que usa la función solo coincide con el que
   * viene del registro real, no con el literal construido en memoria antes del insert. */
  async function emitirComprobante(
    tenantId: string,
    inmuebleId: string,
    saldoFinal: number,
  ): Promise<{ id: string; folio: string; datos: DatosMinimos }> {
    const datos: DatosMinimos = {
      tenant_nombre: 'Tenant de prueba',
      tenant_nit: null,
      inmueble_codigo: `EXTCC-${RUN_ID}`,
      movimientos: [],
      saldo_final: saldoFinal,
      generado_en: new Date().toISOString(),
    }
    const folio = `EDC-TEST-${String(Date.now())}${String(Math.floor(Math.random() * 1000))}`
    const { data, error } = await admin
      .from('estados_cuenta_generados')
      .insert({ tenant_id: tenantId, inmueble_id: inmuebleId, datos: datos as unknown as Json, folio })
      .select('id, datos')
      .single<{ id: string; datos: DatosMinimos }>()
    if (error) throw new Error(`fixture estados_cuenta_generados: ${error.message}`)
    return { id: data.id, folio, datos: data.datos }
  }

  it('1. documento existe: mismo folio y mismo hash que produciría ver-estado-cuenta', async () => {
    const t = await prepararTenantConActorExterno('e1')
    const { folio, datos } = await emitirComprobante(t.tenantId, t.inmuebleId, 150_000)

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaComprobante>('external-estado-cuenta-ver', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.existe).toBe(true)
    expect(data!.folio).toBe(folio)
    expect(data!.datos!.saldo_final).toBe(150_000)
    expect(data!.contenido_hash).toBe(createHash('sha256').update(JSON.stringify(datos)).digest('hex'))
  }, 30_000)

  it('2. sin ningún estados_cuenta_generados emitido todavía → existe:false, nunca un error', async () => {
    const t = await prepararTenantConActorExterno('e2')
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaComprobante>('external-estado-cuenta-ver', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.existe).toBe(false)
  }, 30_000)

  it('3. aislamiento: el comprobante de otro inmueble del mismo tenant no aparece', async () => {
    const t = await prepararTenantConActorExterno('e3')
    const otroInmuebleId = await crearInmueble(t.tenantId, `EXTCC-e3-otro-${RUN_ID}`)
    await emitirComprobante(t.tenantId, otroInmuebleId, 999_000)

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaComprobante>('external-estado-cuenta-ver', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.existe).toBe(false)
  }, 30_000)

  it('4. un vínculo de otro actor → 403 VINCULO_NO_PERTENECE, nunca el comprobante ajeno', async () => {
    const a = await prepararTenantConActorExterno('e4a')
    const b = await prepararTenantConActorExterno('e4b')
    await emitirComprobante(b.tenantId, b.inmuebleId, 500_000)

    const { data, error } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaComprobante>('external-estado-cuenta-ver', {
        body: { vinculo_id: b.actorExternoVinculoId },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(403)
    expect(error!.codigo).toBe('VINCULO_NO_PERTENECE')
  }, 30_000)

  it('5. sin autenticación (sin Authorization) → 401 UNAUTHENTICATED', async () => {
    const t = await prepararTenantConActorExterno('e5')
    const { error: errorSignOut } = await t.clienteExterno.auth.signOut()
    if (errorSignOut) throw errorSignOut
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaComprobante>('external-estado-cuenta-ver', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(401)
    expect(error!.codigo).toBe('UNAUTHENTICATED')
  }, 30_000)

  it('6. rate limit: bloquea después de 60 intentos en una hora', async () => {
    const t = await prepararTenantConActorExterno('e6')
    for (let i = 0; i < 60; i++) {
      const { error } = await invocarConError(
        t.clienteExterno.functions.invoke<RespuestaComprobante>('external-estado-cuenta-ver', {
          body: { vinculo_id: t.actorExternoVinculoId },
        }),
      )
      expect(error?.codigo).not.toBe('RATE_LIMITED')
    }
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaComprobante>('external-estado-cuenta-ver', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(429)
    expect(error!.codigo).toBe('RATE_LIMITED')
  }, 60_000)
})
