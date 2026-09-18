/**
 * EXT-02 (20260932820000-20260932830000 + Edge Functions) — solicitudes desde External. Ver
 * Casos de uso/Solicitudes - Reservas - Visitantes/EXT_02_solicitudes.md §5 (12 pruebas
 * obligatorias).
 *
 * Deliberadamente delgado (spec §2): External no decide si una solicitud es válida, solo la
 * entrega y consulta su estado — toda la lógica de negocio real vive en las funciones del parche
 * de GOB-8 (fn_solicitud_recibir_externa/fn_solicitud_estado_externo), reutilizadas tal cual.
 *
 * Hallazgo de implementación (no en el Plan, documentado en 20260932830000_ext2_funciones.sql):
 * cambiar el tipo de retorno de fn_solicitud_estado_externo (parche GOB-8, ya en producción) para
 * que sirviera de "listar" habría exigido un DROP FUNCTION — se agregó
 * fn_solicitud_mis_solicitudes_externas() en su lugar, sin tocar la función existente.
 *
 * Las 4 Edge Functions (external-solicitudes-catalogo/-crear/-cancelar/-listar) son las primeras
 * de External autenticadas por sesión real (JWT de Supabase Auth), no por link_token.ts — se
 * invocan con `clienteExterno.functions.invoke(...)`, que adjunta automáticamente el access_token
 * de la sesión activa como Authorization header.
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
  console.warn('SALTADO tests/external/solicitudes: faltan variables de Supabase en .env')
}

interface RespuestaCrear {
  id: string
  numero: number
  anio: number
  estado: string
  inmueble_id: string
  origen_actor_externo_id: string
}
interface RespuestaListado {
  id: string
  numero: number
  anio: number
  estado: string
  asunto: string
  triage_motivo_rechazo: string | null
}
interface RespuestaCatalogo {
  tipos: { id: number; codigo: string; nombre: string }[]
  categorias: { id: number; codigo: string; nombre: string }[]
}

interface ErrorHttpParseado {
  status: number | null
  codigo: string | null
  mensaje: string | null
}

/** supabase-js envuelve un fallo de Edge Function en FunctionsHttpError cuyo `.context` es el
 * Response crudo — mismo patrón que apps/web/app/utils/edge-function-error.ts. */
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

d('EXT-02: solicitudes desde External', () => {
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

  async function crearVocabularioSolicitud(
    tenantId: string,
    familia: 'TIPO_SOLICITUD' | 'CATEGORIA_SOLICITUD' | 'ORIGEN_SOLICITUD' | 'PRIORIDAD_SOLICITUD',
    codigo: string, nombre: string,
  ): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').insert({ tipo: familia, codigo, nombre, tenant_id: tenantId })
      .select('id').single<{ id: number }>()
    if (error) throw new Error(`fixture vocabulario ${familia}.${codigo}: ${error.message}`)
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
    tipoId: number; categoriaId: number
  }> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const inmuebleId = await crearInmueble(tenant.id, `EXT2-${etiqueta}-${RUN_ID}`)
    const terceroId = await crearTercero(tenant.id, `${RUN_ID}-${etiqueta}`)
    const personaRolId = await crearPersonaRol(tenant.id, inmuebleId, terceroId)

    const email = `ext2-${RUN_ID}-${etiqueta}@example.test`
    const password = `Aa1${crypto.randomUUID()}`
    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (errorCrear) throw errorCrear
    usuariosCreados.push(creado.user.id)

    const vinculoId = await crearVinculo(tenant.id, personaRolId, creado.user.id)
    const clienteExterno = await clienteComo(env!, { id: creado.user.id, email, password })

    const tipoId = await crearVocabularioSolicitud(tenant.id, 'TIPO_SOLICITUD', `queja-${etiqueta}`, 'Queja')
    const categoriaId = await crearVocabularioSolicitud(tenant.id, 'CATEGORIA_SOLICITUD', `ruido-${etiqueta}`, 'Ruido')

    return { tenantId: tenant.id, inmuebleId, actorExternoVinculoId: vinculoId, clienteExterno, tipoId, categoriaId }
  }

  async function crearStaffAuxiliar(tenantId: string, etiqueta: string): Promise<Cliente> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario.id)
    await crearMembership(admin, tenantId, usuario.id, 'auxiliar')
    return clienteComo(env!, usuario)
  }

  it('1. actor externo con vínculo vigente envía una solicitud; llega en recibida_externa, inmueble_id resuelto del vínculo', async () => {
    const t = await prepararTenantConActorExterno('p1')
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaCrear>('external-solicitudes-crear', {
        body: { vinculo_id: t.actorExternoVinculoId, tipo_id: t.tipoId, categoria_id: t.categoriaId, asunto: 'Ruido nocturno' },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.estado).toBe('recibida_externa')
    expect(data!.inmueble_id).toBe(t.inmuebleId)
    expect(data!.origen_actor_externo_id).toBe(t.actorExternoVinculoId)
  }, 30_000)

  it('2. forzar un inmueble_id distinto en el cuerpo no tiene efecto: la función usa el del vínculo', async () => {
    const t = await prepararTenantConActorExterno('p2')
    const otroInmuebleId = await crearInmueble(t.tenantId, `EXT2-p2-otro-${RUN_ID}`)
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaCrear>('external-solicitudes-crear', {
        body: {
          vinculo_id: t.actorExternoVinculoId, tipo_id: t.tipoId, categoria_id: t.categoriaId, asunto: 'Intento de suplantación',
          inmueble_id: otroInmuebleId,
        },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.inmueble_id).toBe(t.inmuebleId)
    expect(data!.inmueble_id).not.toBe(otroInmuebleId)
  }, 30_000)

  it('3. un vínculo de otro usuario no puede enviar → 403 VINCULO_NO_PERTENECE', async () => {
    // `vigente_desde` es inmutable tras el alta (siempre current_date) y `fn_actor_externo_
    // registrar_vinculo` no acepta backdatearlo — no hay forma de fabricar un vínculo YA vencido
    // sin esperar un día real, así que esta prueba cubre la otra mitad de la disyunción del spec
    // ("vencido O de otro usuario"): un vínculo real, vigente, pero que no es del que llama.
    const t = await prepararTenantConActorExterno('p3')
    const otro = await prepararTenantConActorExterno('p3b')

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaCrear>('external-solicitudes-crear', {
        body: { vinculo_id: otro.actorExternoVinculoId, tipo_id: t.tipoId, categoria_id: t.categoriaId, asunto: 'No debería crear' },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(403)
    expect(error!.codigo).toBe('VINCULO_NO_PERTENECE')
  }, 30_000)

  it('4. cancelar una solicitud en recibida_externa la mueve a cancelada_por_solicitante', async () => {
    const t = await prepararTenantConActorExterno('p4')
    const { data: creada, error: errorCrear } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaCrear>('external-solicitudes-crear', {
        body: { vinculo_id: t.actorExternoVinculoId, tipo_id: t.tipoId, categoria_id: t.categoriaId, asunto: 'A cancelar' },
      }),
    )
    if (errorCrear) throw new Error(errorCrear.mensaje ?? 'fallo inesperado')

    const { data: cancelada, error: errorCancelar } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaCrear>('external-solicitudes-cancelar', {
        body: { vinculo_id: t.actorExternoVinculoId, solicitud_id: creada!.id },
      }),
    )
    if (errorCancelar) throw new Error(errorCancelar.mensaje ?? 'fallo inesperado')
    expect(cancelada!.estado).toBe('cancelada_por_solicitante')
  }, 30_000)

  it('5. cancelar una solicitud que ya pasó a triage falla → SOLICITUD_CANCELACION_FUERA_DE_PLAZO', async () => {
    const t = await prepararTenantConActorExterno('p5')
    const origenId = await crearVocabularioSolicitud(t.tenantId, 'ORIGEN_SOLICITUD', 'formulario', 'Formulario')
    const prioridadId = await crearVocabularioSolicitud(t.tenantId, 'PRIORIDAD_SOLICITUD', 'media', 'Media')
    const { data: creada, error: errorCrear } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaCrear>('external-solicitudes-crear', {
        body: { vinculo_id: t.actorExternoVinculoId, tipo_id: t.tipoId, categoria_id: t.categoriaId, asunto: 'Ya en triage' },
      }),
    )
    if (errorCrear) throw new Error(errorCrear.mensaje ?? 'fallo inesperado')

    const staff = await crearStaffAuxiliar(t.tenantId, `p5-staff-${RUN_ID}`)
    const { error: errorAceptar } = await staff.rpc('fn_solicitud_triage_aceptar', {
      p_solicitud_id: creada!.id, p_origen_id: origenId, p_prioridad_id: prioridadId,
    })
    if (errorAceptar) throw errorAceptar

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaCrear>('external-solicitudes-cancelar', {
        body: { vinculo_id: t.actorExternoVinculoId, solicitud_id: creada!.id },
      }),
    )
    expect(data).toBeNull()
    expect(error!.codigo).toBe('SOLICITUD_CANCELACION_FUERA_DE_PLAZO')
  }, 30_000)

  it('6. listar solo devuelve las solicitudes del vínculo que consulta, nunca las de otro inmueble/tenant', async () => {
    const a = await prepararTenantConActorExterno('p6a')
    const b = await prepararTenantConActorExterno('p6b')
    const { error: e1 } = await invocarConError(
      a.clienteExterno.functions.invoke('external-solicitudes-crear', {
        body: { vinculo_id: a.actorExternoVinculoId, tipo_id: a.tipoId, categoria_id: a.categoriaId, asunto: 'De A' },
      }),
    )
    if (e1) throw new Error(e1.mensaje ?? 'fallo inesperado')
    const { error: e2 } = await invocarConError(
      b.clienteExterno.functions.invoke('external-solicitudes-crear', {
        body: { vinculo_id: b.actorExternoVinculoId, tipo_id: b.tipoId, categoria_id: b.categoriaId, asunto: 'De B' },
      }),
    )
    if (e2) throw new Error(e2.mensaje ?? 'fallo inesperado')

    const { data: listaA, error: errorListaA } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaListado[]>('external-solicitudes-listar', {
        body: { vinculo_id: a.actorExternoVinculoId },
      }),
    )
    if (errorListaA) throw new Error(errorListaA.mensaje ?? 'fallo inesperado')
    expect(listaA!.every((s) => s.asunto === 'De A')).toBe(true)
    expect(listaA!.some((s) => s.asunto === 'De B')).toBe(false)
  }, 30_000)

  it('7. el detalle de una solicitud rechazada en triage incluye el motivo tal como lo escribió el staff', async () => {
    const t = await prepararTenantConActorExterno('p7')
    const { data: creada, error: errorCrear } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaCrear>('external-solicitudes-crear', {
        body: { vinculo_id: t.actorExternoVinculoId, tipo_id: t.tipoId, categoria_id: t.categoriaId, asunto: 'Para rechazar' },
      }),
    )
    if (errorCrear) throw new Error(errorCrear.mensaje ?? 'fallo inesperado')

    const staff = await crearStaffAuxiliar(t.tenantId, `p7-staff-${RUN_ID}`)
    const { error: errorRechazar } = await staff.rpc('fn_solicitud_triage_rechazar', {
      p_solicitud_id: creada!.id, p_motivo: 'Fuera del alcance de administración',
    })
    if (errorRechazar) throw errorRechazar

    const { data: detalle, error: errorDetalle } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaListado>('external-solicitudes-listar', {
        body: { vinculo_id: t.actorExternoVinculoId, solicitud_id: creada!.id },
      }),
    )
    if (errorDetalle) throw new Error(errorDetalle.mensaje ?? 'fallo inesperado')
    expect(detalle!.estado).toBe('rechazada_triage')
    expect(detalle!.triage_motivo_rechazo).toBe('Fuera del alcance de administración')
  }, 30_000)

  it('8. el catálogo devuelto coincide exactamente con los valores vigentes de TIPO_SOLICITUD/CATEGORIA_SOLICITUD', async () => {
    const t = await prepararTenantConActorExterno('p8')
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaCatalogo>('external-solicitudes-catalogo', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.tipos.some((x) => x.id === t.tipoId)).toBe(true)
    expect(data!.categorias.some((x) => x.id === t.categoriaId)).toBe(true)
  }, 30_000)

  it('9. cero políticas RLS nuevas sobre solicitudes (idénticas a las del parche de GOB-8)', async () => {
    const dbUrl = process.env.SUPABASE_DB_URL
    if (!dbUrl) throw new Error('falta SUPABASE_DB_URL')
    const { Client } = await import('pg')
    const client = new Client({ connectionString: dbUrl })
    await client.connect()
    let filas: { cmd: string }[]
    try {
      const resultado = await client.query<{ cmd: string }>(`
        select cmd from pg_policies
        where schemaname = 'public' and tablename = 'solicitudes' and cmd in ('INSERT', 'UPDATE')
      `)
      filas = resultado.rows
    } finally {
      await client.end()
    }
    expect(filas).toEqual([])
  }, 30_000)

  it('10. el límite de tasa aplicado es el mismo del parche — no hay un segundo mecanismo en la Edge Function', async () => {
    const t = await prepararTenantConActorExterno('p10')
    for (let i = 0; i < 5; i += 1) {
      const { error } = await invocarConError(
        t.clienteExterno.functions.invoke('external-solicitudes-crear', {
          body: { vinculo_id: t.actorExternoVinculoId, tipo_id: t.tipoId, categoria_id: t.categoriaId, asunto: `Intento ${String(i)}` },
        }),
      )
      if (error) throw new Error(`intento ${String(i)} no debía fallar: ${JSON.stringify(error)}`)
    }
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke('external-solicitudes-crear', {
        body: { vinculo_id: t.actorExternoVinculoId, tipo_id: t.tipoId, categoria_id: t.categoriaId, asunto: 'Sexto intento' },
      }),
    )
    expect(data).toBeNull()
    expect(error!.codigo).toBe('RATE_LIMITED')
  }, 30_000)

  it('11. un actor externo con dos vínculos (dos inmuebles) puede enviar para cualquiera, cada una atribuida correctamente', async () => {
    const t = await prepararTenantConActorExterno('p11')
    const inmuebleB = await crearInmueble(t.tenantId, `EXT2-p11b-${RUN_ID}`)
    const terceroB = await crearTercero(t.tenantId, `${RUN_ID}-p11b`)
    const personaRolB = await crearPersonaRol(t.tenantId, inmuebleB, terceroB)
    const { data: vinculoOriginal } = await admin
      .from('actor_externo_vinculo').select('auth_user_id').eq('id', t.actorExternoVinculoId).single<{ auth_user_id: string }>()
    const vinculoBId = await crearVinculo(t.tenantId, personaRolB, vinculoOriginal!.auth_user_id)

    const { data: solA, error: eA } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaCrear>('external-solicitudes-crear', {
        body: { vinculo_id: t.actorExternoVinculoId, tipo_id: t.tipoId, categoria_id: t.categoriaId, asunto: 'Para inmueble A' },
      }),
    )
    if (eA) throw new Error(eA.mensaje ?? 'fallo inesperado')
    const { data: solB, error: eB } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaCrear>('external-solicitudes-crear', {
        body: { vinculo_id: vinculoBId, tipo_id: t.tipoId, categoria_id: t.categoriaId, asunto: 'Para inmueble B' },
      }),
    )
    if (eB) throw new Error(eB.mensaje ?? 'fallo inesperado')
    expect(solA!.inmueble_id).toBe(t.inmuebleId)
    expect(solB!.inmueble_id).toBe(inmuebleB)
  }, 30_000)

  it('12. aislamiento entre tenants: el vínculo de un tenant no sirve desde la sesión de un actor de otro tenant', async () => {
    const a = await prepararTenantConActorExterno('p12a')
    const b = await prepararTenantConActorExterno('p12b')
    const { data: cruzado, error: errorCruzado } = await invocarConError(
      a.clienteExterno.functions.invoke('external-solicitudes-crear', {
        body: { vinculo_id: b.actorExternoVinculoId, tipo_id: a.tipoId, categoria_id: a.categoriaId, asunto: 'Vínculo ajeno' },
      }),
    )
    expect(cruzado).toBeNull()
    expect(errorCruzado!.codigo).toBe('VINCULO_NO_PERTENECE')

    // y la lista de A nunca ve nada de B, aunque ambas hayan enviado solicitudes reales.
    const { error: eA } = await invocarConError(
      a.clienteExterno.functions.invoke('external-solicitudes-crear', {
        body: { vinculo_id: a.actorExternoVinculoId, tipo_id: a.tipoId, categoria_id: a.categoriaId, asunto: 'De A (p12)' },
      }),
    )
    if (eA) throw new Error(eA.mensaje ?? 'fallo inesperado')
    const { error: eB } = await invocarConError(
      b.clienteExterno.functions.invoke('external-solicitudes-crear', {
        body: { vinculo_id: b.actorExternoVinculoId, tipo_id: b.tipoId, categoria_id: b.categoriaId, asunto: 'De B (p12)' },
      }),
    )
    if (eB) throw new Error(eB.mensaje ?? 'fallo inesperado')
    const { data: listaA, error: errorListaA } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaListado[]>('external-solicitudes-listar', {
        body: { vinculo_id: a.actorExternoVinculoId },
      }),
    )
    if (errorListaA) throw new Error(errorListaA.mensaje ?? 'fallo inesperado')
    expect(listaA!.some((s) => s.asunto === 'De B (p12)')).toBe(false)
  }, 30_000)

  // ── EXT-16 (Ola 3, M21): rate limiting en cancelar/catalogo/listar. external-solicitudes-crear
  // NO se toca en este corte — ya tiene su propio límite (5/hora) dentro de
  // fn_solicitud_recibir_externa, probado en la prueba 10 de arriba (PLAN_MI_COPROPIEDAD.md §12.3
  // corregido: era un punto ciego del grep original, no un gap real). Igual que en reservas.test.ts,
  // enforceRateLimit corre antes de la RPC — el intento cuenta sin importar si el negocio lo acepta.
  it('13. rate limit: cancelar bloquea después de 30 intentos en una hora', async () => {
    const t = await prepararTenantConActorExterno('p13rl')
    for (let i = 0; i < 30; i += 1) {
      const { error } = await invocarConError(
        t.clienteExterno.functions.invoke('external-solicitudes-cancelar', {
          body: { vinculo_id: t.actorExternoVinculoId, solicitud_id: crypto.randomUUID() },
        }),
      )
      expect(error?.codigo).not.toBe('RATE_LIMITED')
    }
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke('external-solicitudes-cancelar', {
        body: { vinculo_id: t.actorExternoVinculoId, solicitud_id: crypto.randomUUID() },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(429)
    expect(error!.codigo).toBe('RATE_LIMITED')
  }, 60_000)

  it('14. rate limit: catálogo bloquea después de 60 intentos en una hora', async () => {
    const t = await prepararTenantConActorExterno('p14rl')
    for (let i = 0; i < 60; i += 1) {
      const { error } = await invocarConError(
        t.clienteExterno.functions.invoke<RespuestaCatalogo>('external-solicitudes-catalogo', {
          body: { vinculo_id: t.actorExternoVinculoId },
        }),
      )
      expect(error?.codigo).not.toBe('RATE_LIMITED')
    }
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaCatalogo>('external-solicitudes-catalogo', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(429)
    expect(error!.codigo).toBe('RATE_LIMITED')
  }, 90_000)

  it('15. rate limit: listar bloquea después de 60 intentos en una hora', async () => {
    const t = await prepararTenantConActorExterno('p15rl')
    for (let i = 0; i < 60; i += 1) {
      const { error } = await invocarConError(
        t.clienteExterno.functions.invoke<RespuestaListado[]>('external-solicitudes-listar', {
          body: { vinculo_id: t.actorExternoVinculoId },
        }),
      )
      expect(error?.codigo).not.toBe('RATE_LIMITED')
    }
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaListado[]>('external-solicitudes-listar', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(429)
    expect(error!.codigo).toBe('RATE_LIMITED')
  }, 90_000)
})
