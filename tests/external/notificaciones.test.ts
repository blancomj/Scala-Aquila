/**
 * EXT-08b §4.1/§7.2/§7.10 (Ola 2, M11/M12) — actuaciones visibles al residente + notificaciones
 * in-app. Vía mínima explícita (P2-01): UN SOLO evento (respuesta de staff a una solicitud
 * propia) — §4.4 deja fuera cualquier canal de comunicados genérico.
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
  console.warn('SALTADO tests/external/notificaciones: faltan variables de Supabase en .env')
}

interface RespuestaCrearSolicitud {
  id: string
}
interface ActuacionExterna {
  fecha: string
  descripcion: string
  created_at: string
}
interface RespuestaDetalleSolicitud {
  numero: number
  estado: string
  actuaciones: ActuacionExterna[]
}
interface NotificacionExterna {
  id: string
  titulo: string
  cuerpo: string | null
  enlace: string | null
  leida_at: string | null
  created_at: string
}
interface RespuestaListadoNotificaciones {
  notificaciones: NotificacionExterna[]
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

d('EXT-08b: actuaciones y notificaciones desde External', () => {
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

  async function crearStaffAuxiliar(tenantId: string, etiqueta: string): Promise<{ id: string; cliente: Cliente }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario.id)
    await crearMembership(admin, tenantId, usuario.id, 'auxiliar')
    const cliente = await clienteComo(env!, usuario)
    return { id: usuario.id, cliente }
  }

  /** Tenant + inmueble + un actor externo vinculado + una solicitud propia YA ACEPTADA en triage
   * (via el mismo camino EXT-02 real, external-solicitudes-crear, seguido de
   * fn_solicitud_triage_aceptar) — origen_actor_externo_id queda resuelto por
   * external-solicitudes-crear; el triage es indispensable porque
   * solicitudes_clasificacion_completa exige origen_id/prioridad_id no nulos para CUALQUIER
   * estado fuera de recibida_externa/rechazada_triage/cancelada_por_solicitante — sin este paso
   * ninguna actuación (que sí mueve la FSM) podría registrarse. */
  async function prepararEscenario(etiqueta: string): Promise<{
    tenantId: string; inmuebleId: string; vinculoId: string; clienteExterno: Cliente; solicitudId: string
    staffId: string; staffCliente: Cliente
  }> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const inmuebleId = await crearInmueble(tenant.id, `EXT08B-${etiqueta}-${RUN_ID}`)
    const terceroId = await crearTercero(tenant.id, `${RUN_ID}-${etiqueta}`)
    const personaRolId = await crearPersonaRol(tenant.id, inmuebleId, terceroId)

    const email = `ext08b-${RUN_ID}-${etiqueta}@example.test`
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
    const origenId = await crearVocabularioSolicitud(tenant.id, 'ORIGEN_SOLICITUD', `app-${etiqueta}`, 'App')
    const prioridadId = await crearVocabularioSolicitud(tenant.id, 'PRIORIDAD_SOLICITUD', `media-${etiqueta}`, 'Media')

    const { data: creada, error: errorCrearSolicitud } = await invocarConError(
      clienteExterno.functions.invoke<RespuestaCrearSolicitud>('external-solicitudes-crear', {
        body: { vinculo_id: vinculoId, tipo_id: tipoId, categoria_id: categoriaId, asunto: `Asunto ${etiqueta}` },
      }),
    )
    if (errorCrearSolicitud) throw new Error(errorCrearSolicitud.mensaje ?? 'fallo fixture solicitud')

    const staff = await crearStaffAuxiliar(tenant.id, `${etiqueta}-staff`)
    const { error: errorTriage } = await staff.cliente.rpc('fn_solicitud_triage_aceptar', {
      p_solicitud_id: creada!.id, p_origen_id: origenId, p_prioridad_id: prioridadId,
    })
    if (errorTriage) throw new Error(`fixture triage: ${errorTriage.message}`)

    return {
      tenantId: tenant.id, inmuebleId, vinculoId, clienteExterno, solicitudId: creada!.id,
      staffId: staff.id, staffCliente: staff.cliente,
    }
  }

  /** Staff registra una respuesta — mismo camino RPC que tests/gobierno/atencion.test.ts (no hay
   * Edge Function de staff para esto en el alcance de este corte). */
  async function registrarRespuesta(params: {
    solicitudId: string; descripcion: string; actorId: string
  }): Promise<{ id: string }> {
    const { data, error } = await admin.rpc('gobierno_registrar_actuacion_solicitud', {
      p_solicitud_id: params.solicitudId, p_estado_nuevo: 'en_atencion',
      p_fecha: new Date().toISOString().slice(0, 10), p_descripcion: params.descripcion,
      p_es_respuesta: true, p_actor_id: params.actorId,
    }).single<{ id: string }>()
    if (error) throw new Error(`fixture actuación: ${error.message}`)
    return data
  }

  it('1. una respuesta del staff genera una notificación con enlace a la solicitud', async () => {
    const e = await prepararEscenario('n1')
    await registrarRespuesta({ solicitudId: e.solicitudId, descripcion: 'Ya enviamos a mantenimiento.', actorId: e.staffId })

    const { data, error } = await invocarConError(
      e.clienteExterno.functions.invoke<RespuestaListadoNotificaciones>('external-notificaciones-listar', {
        body: { vinculo_id: e.vinculoId, accion: 'listar' },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.notificaciones).toHaveLength(1)
    expect(data!.notificaciones[0]!.enlace).toBe(`/mi-copropiedad/solicitudes/${e.solicitudId}`)
    expect(data!.notificaciones[0]!.leida_at).toBeNull()
  }, 30_000)

  it('2. una actuación que NO es respuesta (nota interna) no genera notificación', async () => {
    const e = await prepararEscenario('n2')
    const { error: errorNota } = await admin.rpc('gobierno_registrar_actuacion_solicitud', {
      p_solicitud_id: e.solicitudId, p_estado_nuevo: 'asignada',
      p_fecha: new Date().toISOString().slice(0, 10), p_descripcion: 'Nota interna, no es respuesta.',
      p_es_respuesta: false, p_actor_id: e.staffId,
    })
    if (errorNota) throw new Error(`fixture nota: ${errorNota.message}`)

    const { data, error } = await invocarConError(
      e.clienteExterno.functions.invoke<RespuestaListadoNotificaciones>('external-notificaciones-listar', {
        body: { vinculo_id: e.vinculoId, accion: 'listar' },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.notificaciones).toEqual([])
  }, 30_000)

  it('3. dos respuestas distintas generan DOS notificaciones (no colisionan por idempotencia)', async () => {
    const e = await prepararEscenario('n3')
    await registrarRespuesta({ solicitudId: e.solicitudId, descripcion: 'Primera respuesta.', actorId: e.staffId })
    await registrarRespuesta({ solicitudId: e.solicitudId, descripcion: 'Segunda respuesta.', actorId: e.staffId })

    const { data, error } = await invocarConError(
      e.clienteExterno.functions.invoke<RespuestaListadoNotificaciones>('external-notificaciones-listar', {
        body: { vinculo_id: e.vinculoId, accion: 'listar' },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.notificaciones).toHaveLength(2)
  }, 30_000)

  it('4. sin origen_actor_externo_id (solicitud creada por staff) no hay a quién notificar', async () => {
    const e = await prepararEscenario('n4')
    const otroTerceroId = await crearTercero(e.tenantId, `${RUN_ID}-n4-otro`)
    const tipoId = await crearVocabularioSolicitud(e.tenantId, 'TIPO_SOLICITUD', 'queja-n4-staff', 'Queja')
    const categoriaId = await crearVocabularioSolicitud(e.tenantId, 'CATEGORIA_SOLICITUD', 'ruido-n4-staff', 'Ruido')
    const origenId = await crearVocabularioSolicitud(e.tenantId, 'ORIGEN_SOLICITUD', 'app-n4-staff', 'App')
    const prioridadId = await crearVocabularioSolicitud(e.tenantId, 'PRIORIDAD_SOLICITUD', 'media-n4-staff', 'Media')
    const { data: sol, error: errorCrear } = await admin.rpc('gobierno_crear_solicitud', {
      p_tipo_id: tipoId, p_categoria_id: categoriaId, p_origen_id: origenId, p_prioridad_id: prioridadId,
      p_solicitante_ref: otroTerceroId, p_inmueble_id: e.inmuebleId, p_calidad: 'propietario',
      p_asunto: 'Creada por staff', p_actor_id: e.staffId,
    }).single<{ id: string }>()
    if (errorCrear) throw new Error(`fixture solicitud staff: ${errorCrear.message}`)
    await registrarRespuesta({ solicitudId: sol.id, descripcion: 'Respuesta a solicitud de staff.', actorId: e.staffId })

    const { data, error } = await invocarConError(
      e.clienteExterno.functions.invoke<RespuestaListadoNotificaciones>('external-notificaciones-listar', {
        body: { vinculo_id: e.vinculoId, accion: 'listar' },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.notificaciones).toEqual([])
  }, 30_000)

  it('5. marcar_leida actualiza leida_at y no permite marcar la de otro vínculo', async () => {
    const a = await prepararEscenario('n5a')
    const b = await prepararEscenario('n5b')
    await registrarRespuesta({ solicitudId: a.solicitudId, descripcion: 'Respuesta.', actorId: a.staffId })

    const { data: lista } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaListadoNotificaciones>('external-notificaciones-listar', {
        body: { vinculo_id: a.vinculoId, accion: 'listar' },
      }),
    )
    const notificacionId = lista!.notificaciones[0]!.id

    const { data: ajena, error: errorAjena } = await invocarConError(
      b.clienteExterno.functions.invoke<NotificacionExterna>('external-notificaciones-listar', {
        body: { vinculo_id: b.vinculoId, accion: 'marcar_leida', notificacion_id: notificacionId },
      }),
    )
    expect(ajena).toBeNull()
    expect(errorAjena!.status).toBe(404)
    expect(errorAjena!.codigo).toBe('NOTIFICACION_NO_ENCONTRADA')

    const { data: propia, error: errorPropia } = await invocarConError(
      a.clienteExterno.functions.invoke<NotificacionExterna>('external-notificaciones-listar', {
        body: { vinculo_id: a.vinculoId, accion: 'marcar_leida', notificacion_id: notificacionId },
      }),
    )
    if (errorPropia) throw new Error(errorPropia.mensaje ?? 'fallo inesperado')
    expect(propia!.leida_at).not.toBeNull()
  }, 30_000)

  it('6. un vínculo ajeno → 403 VINCULO_NO_PERTENECE', async () => {
    const a = await prepararEscenario('n6a')
    const b = await prepararEscenario('n6b')
    const { data, error } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaListadoNotificaciones>('external-notificaciones-listar', {
        body: { vinculo_id: b.vinculoId, accion: 'listar' },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(403)
    expect(error!.codigo).toBe('VINCULO_NO_PERTENECE')
  }, 30_000)

  it('7. el detalle de la solicitud trae las respuestas del staff, nunca notas internas', async () => {
    const e = await prepararEscenario('n7')
    await registrarRespuesta({ solicitudId: e.solicitudId, descripcion: 'Respuesta visible.', actorId: e.staffId })
    const { error: errorNota } = await admin.rpc('gobierno_registrar_actuacion_solicitud', {
      p_solicitud_id: e.solicitudId, p_estado_nuevo: 'en_atencion',
      p_fecha: new Date().toISOString().slice(0, 10), p_descripcion: 'Nota interna oculta.',
      p_es_respuesta: false, p_actor_id: e.staffId,
    })
    if (errorNota) throw new Error(`fixture nota: ${errorNota.message}`)

    const { data, error } = await invocarConError(
      e.clienteExterno.functions.invoke<RespuestaDetalleSolicitud>('external-solicitudes-listar', {
        body: { vinculo_id: e.vinculoId, solicitud_id: e.solicitudId },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.actuaciones).toHaveLength(1)
    expect(data!.actuaciones[0]!.descripcion).toBe('Respuesta visible.')
  }, 30_000)
})
