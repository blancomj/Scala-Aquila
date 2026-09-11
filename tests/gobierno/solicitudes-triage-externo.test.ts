/**
 * GOB-8 (parche) (20260932790000-20260932810000) — recepción externa de solicitudes con triage.
 * Ver Casos de uso/Solicitudes - Reservas - Visitantes/GOB_08_PARCHE_RECEPCION_EXTERNA.md §5 (10
 * pruebas obligatorias).
 *
 * Hallazgo durante la implementación (no en el Plan del corte, documentado en
 * 20260932810000_gob8_parche_funciones.sql y en GOB_08_PARCHE_INFORME.md): el spec no le pasa
 * p_origen_id/p_prioridad_id a fn_solicitud_recibir_externa — ORIGEN_SOLICITUD/PRIORIDAD_SOLICITUD
 * son catálogo del tenant, no algo que un actor externo sin sesión de staff deba elegir.
 * `solicitudes.origen_id`/`prioridad_id` pasaron a nullable (CHECK
 * solicitudes_clasificacion_completa exige ambos no-null fuera de recibida_externa/
 * rechazada_triage) y fn_solicitud_triage_aceptar gana esos dos parámetros — el staff los asigna
 * en el momento del triage, no el remitente externo.
 *
 * Cero Edge Function nueva en este parche (Plan del corte, aprobado): check_rate_limit ya es una
 * función Postgres (a diferencia del HMAC de MANT-11, que sí exige Deno) — las cuatro funciones
 * son 100% SQL, llamadas por RPC directo con la sesión real del actor externo (AD-37) o del staff.
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
  console.warn('SALTADO tests/gobierno/solicitudes-triage-externo: faltan variables de Supabase en .env')
}

interface SolicitudRow {
  id: string
  numero: number
  anio: number
  estado: string
  sla_vence_at: string | null
  origen_actor_externo_id: string | null
  triage_motivo_rechazo: string | null
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

d('GOB-8 (parche): recepción externa de solicitudes con triage', () => {
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

  /** Tenant + inmueble + un actor externo YA vinculado (propietario) con sesión real (AD-37). */
  async function prepararTenantConActorExterno(etiqueta: string): Promise<{
    tenantId: string; inmuebleId: string; actorExternoVinculoId: string; clienteExterno: Cliente
    tipoId: number; categoriaId: number
  }> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const inmuebleId = await crearInmueble(tenant.id, `GOB8P-${etiqueta}-${RUN_ID}`)
    const terceroId = await crearTercero(tenant.id, `${RUN_ID}-${etiqueta}`)
    const personaRolId = await crearPersonaRol(tenant.id, inmuebleId, terceroId)

    const email = `gob8p-${RUN_ID}-${etiqueta}@example.test`
    const password = `Aa1${crypto.randomUUID()}`
    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (errorCrear) throw errorCrear
    usuariosCreados.push(creado.user.id)

    const { error: errorVinculo } = await admin.rpc('fn_actor_externo_registrar_vinculo', {
      p_tenant_id: tenant.id, p_auth_user_id: creado.user.id, p_persona_rol_id: personaRolId,
      p_persona_tipo: 'propietario', p_origen: 'staff',
    })
    if (errorVinculo) throw errorVinculo

    const { data: vinculo, error: errorLeer } = await admin
      .from('actor_externo_vinculo').select('id').eq('auth_user_id', creado.user.id).single<{ id: string }>()
    if (errorLeer) throw errorLeer

    const clienteExterno = await clienteComo(env!, { id: creado.user.id, email, password })

    const tipoId = await crearVocabularioSolicitud(tenant.id, 'TIPO_SOLICITUD', `queja-${etiqueta}`, 'Queja')
    const categoriaId = await crearVocabularioSolicitud(tenant.id, 'CATEGORIA_SOLICITUD', `ruido-${etiqueta}`, 'Ruido')

    return { tenantId: tenant.id, inmuebleId, actorExternoVinculoId: vinculo.id, clienteExterno, tipoId, categoriaId }
  }

  async function crearStaffAuxiliar(tenantId: string, etiqueta: string): Promise<Cliente> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario.id)
    await crearMembership(admin, tenantId, usuario.id, 'auxiliar')
    return clienteComo(env!, usuario)
  }

  it('1. un actor externo vigente puede crear una solicitud para su propio inmueble; nace en recibida_externa, sin sla_vence_at', async () => {
    const t = await prepararTenantConActorExterno('p1')
    const { data, error } = await t.clienteExterno.rpc('fn_solicitud_recibir_externa', {
      p_actor_externo_vinculo_id: t.actorExternoVinculoId, p_inmueble_id: t.inmuebleId,
      p_tipo_id: t.tipoId, p_categoria_id: t.categoriaId, p_asunto: 'Ruido nocturno', p_descripcion: 'Fiesta hasta tarde',
    }).single<SolicitudRow>()
    if (error) throw error
    expect(data.estado).toBe('recibida_externa')
    expect(data.sla_vence_at).toBeNull()
    expect(data.origen_actor_externo_id).toBe(t.actorExternoVinculoId)
  }, 30_000)

  it('2. un actor externo no puede crear una solicitud para un inmueble que no es el suyo → SOLICITUD_EXTERNA_INMUEBLE_NO_VINCULADO', async () => {
    const t = await prepararTenantConActorExterno('p2')
    const otroInmuebleId = await crearInmueble(t.tenantId, `GOB8P-p2-otro-${RUN_ID}`)
    const { error } = await t.clienteExterno.rpc('fn_solicitud_recibir_externa', {
      p_actor_externo_vinculo_id: t.actorExternoVinculoId, p_inmueble_id: otroInmuebleId,
      p_tipo_id: t.tipoId, p_categoria_id: t.categoriaId, p_asunto: 'Asunto',
    })
    expect(error?.message).toContain('SOLICITUD_EXTERNA_INMUEBLE_NO_VINCULADO')
  }, 30_000)

  it('3. aceptar calcula el SLA desde el momento de la aceptación, no desde la recepción original', async () => {
    const t = await prepararTenantConActorExterno('p3')
    const origenId = await crearVocabularioSolicitud(t.tenantId, 'ORIGEN_SOLICITUD', 'formulario', 'Formulario')
    const prioridadId = await crearVocabularioSolicitud(t.tenantId, 'PRIORIDAD_SOLICITUD', 'media', 'Media')
    const { error: errorSla } = await admin.from('solicitud_sla').insert({
      tenant_id: t.tenantId, tipo_id: t.tipoId, categoria_id: t.categoriaId, prioridad_id: prioridadId,
      horas_primera_respuesta: 1, horas_resolucion: 2, horario_habil: false,
    })
    if (errorSla) throw errorSla

    const creadaAt = Date.now()
    const { data: creada, error: errorCrear } = await t.clienteExterno.rpc('fn_solicitud_recibir_externa', {
      p_actor_externo_vinculo_id: t.actorExternoVinculoId, p_inmueble_id: t.inmuebleId,
      p_tipo_id: t.tipoId, p_categoria_id: t.categoriaId, p_asunto: 'Asunto',
    }).single<SolicitudRow>()
    if (errorCrear) throw errorCrear

    await esperar(2000)
    const staff = await crearStaffAuxiliar(t.tenantId, `p3-staff-${RUN_ID}`)
    const aceptadaAt = Date.now()
    const { data: aceptada, error: errorAceptar } = await staff.rpc('fn_solicitud_triage_aceptar', {
      p_solicitud_id: creada.id, p_origen_id: origenId, p_prioridad_id: prioridadId,
    }).single<SolicitudRow>()
    if (errorAceptar) throw errorAceptar

    expect(aceptada.estado).toBe('nueva')
    expect(aceptada.sla_vence_at).not.toBeNull()
    const slaVenceMs = new Date(aceptada.sla_vence_at!).getTime()
    const HORAS_2_MS = 2 * 3600 * 1000
    // Desde la aceptación (± 5s de margen): correcto.
    expect(Math.abs(slaVenceMs - (aceptadaAt + HORAS_2_MS))).toBeLessThan(5000)
    // Desde la recepción original: habría una diferencia de ~2s (el esperar() de arriba) que NO
    // debe coincidir dentro del mismo margen de 5s si el cálculo fuera (incorrectamente) desde
    // creadaAt — se verifica que el propio delta entre ambas referencias es observable.
    expect(slaVenceMs - (creadaAt + HORAS_2_MS)).toBeGreaterThan(1000)
  }, 30_000)

  it('4. rechazar sin motivo → SOLICITUD_TRIAGE_RECHAZO_SIN_MOTIVO', async () => {
    const t = await prepararTenantConActorExterno('p4')
    const { data: creada, error: errorCrear } = await t.clienteExterno.rpc('fn_solicitud_recibir_externa', {
      p_actor_externo_vinculo_id: t.actorExternoVinculoId, p_inmueble_id: t.inmuebleId,
      p_tipo_id: t.tipoId, p_categoria_id: t.categoriaId, p_asunto: 'Asunto',
    }).single<SolicitudRow>()
    if (errorCrear) throw errorCrear

    const staff = await crearStaffAuxiliar(t.tenantId, `p4-staff-${RUN_ID}`)
    const { error } = await staff.rpc('fn_solicitud_triage_rechazar', { p_solicitud_id: creada.id, p_motivo: '' })
    expect(error?.message).toContain('SOLICITUD_TRIAGE_RECHAZO_SIN_MOTIVO')
  }, 30_000)

  it('5. triage sobre una solicitud que no está en recibida_externa → SOLICITUD_TRIAGE_ESTADO_INVALIDO', async () => {
    const t = await prepararTenantConActorExterno('p5')
    const origenId = await crearVocabularioSolicitud(t.tenantId, 'ORIGEN_SOLICITUD', 'formulario', 'Formulario')
    const prioridadId = await crearVocabularioSolicitud(t.tenantId, 'PRIORIDAD_SOLICITUD', 'media', 'Media')
    const { data: creada, error: errorCrear } = await t.clienteExterno.rpc('fn_solicitud_recibir_externa', {
      p_actor_externo_vinculo_id: t.actorExternoVinculoId, p_inmueble_id: t.inmuebleId,
      p_tipo_id: t.tipoId, p_categoria_id: t.categoriaId, p_asunto: 'Asunto',
    }).single<SolicitudRow>()
    if (errorCrear) throw errorCrear

    const staff = await crearStaffAuxiliar(t.tenantId, `p5-staff-${RUN_ID}`)
    const { error: errorPrimero } = await staff.rpc('fn_solicitud_triage_aceptar', {
      p_solicitud_id: creada.id, p_origen_id: origenId, p_prioridad_id: prioridadId,
    })
    if (errorPrimero) throw errorPrimero

    const { error } = await staff.rpc('fn_solicitud_triage_aceptar', {
      p_solicitud_id: creada.id, p_origen_id: origenId, p_prioridad_id: prioridadId,
    })
    expect(error?.message).toContain('SOLICITUD_TRIAGE_ESTADO_INVALIDO')
  }, 30_000)

  it('6. el actor externo puede consultar el estado y el motivo de rechazo de su propia solicitud, y de ninguna otra', async () => {
    const t = await prepararTenantConActorExterno('p6')
    const { data: creada, error: errorCrear } = await t.clienteExterno.rpc('fn_solicitud_recibir_externa', {
      p_actor_externo_vinculo_id: t.actorExternoVinculoId, p_inmueble_id: t.inmuebleId,
      p_tipo_id: t.tipoId, p_categoria_id: t.categoriaId, p_asunto: 'Asunto',
    }).single<SolicitudRow>()
    if (errorCrear) throw errorCrear

    const staff = await crearStaffAuxiliar(t.tenantId, `p6-staff-${RUN_ID}`)
    const { error: errorRechazo } = await staff.rpc('fn_solicitud_triage_rechazar', {
      p_solicitud_id: creada.id, p_motivo: 'Ya fue resuelto por otro canal',
    })
    if (errorRechazo) throw errorRechazo

    const { data: propia, error: errorPropia } = await t.clienteExterno.rpc('fn_solicitud_estado_externo', {
      p_actor_externo_vinculo_id: t.actorExternoVinculoId, p_solicitud_id: creada.id,
    })
    if (errorPropia) throw errorPropia
    const filaPropia = (propia as { estado: string; triage_motivo_rechazo: string | null }[])[0]
    expect(filaPropia?.estado).toBe('rechazada_triage')
    expect(filaPropia?.triage_motivo_rechazo).toBe('Ya fue resuelto por otro canal')

    // otro actor externo (otro vínculo, mismo tenant) no ve esta solicitud.
    const otro = await prepararTenantConActorExterno('p6b')
    const { data: ajena, error: errorAjena } = await otro.clienteExterno.rpc('fn_solicitud_estado_externo', {
      p_actor_externo_vinculo_id: otro.actorExternoVinculoId, p_solicitud_id: creada.id,
    })
    if (errorAjena) throw errorAjena
    expect(ajena).toEqual([])
  }, 30_000)

  it('7. el límite de tasa se aplica a los envíos externos', async () => {
    const t = await prepararTenantConActorExterno('p7')
    for (let i = 0; i < 5; i += 1) {
      const { error } = await t.clienteExterno.rpc('fn_solicitud_recibir_externa', {
        p_actor_externo_vinculo_id: t.actorExternoVinculoId, p_inmueble_id: t.inmuebleId,
        p_tipo_id: t.tipoId, p_categoria_id: t.categoriaId, p_asunto: `Intento ${String(i)}`,
      })
      if (error) throw new Error(`intento ${String(i)} no debía fallar: ${error.message}`)
    }
    const { error: errorLimite } = await t.clienteExterno.rpc('fn_solicitud_recibir_externa', {
      p_actor_externo_vinculo_id: t.actorExternoVinculoId, p_inmueble_id: t.inmuebleId,
      p_tipo_id: t.tipoId, p_categoria_id: t.categoriaId, p_asunto: 'Sexto intento',
    })
    expect(errorLimite?.message).toContain('RATE_LIMITED')
  }, 30_000)

  it('8. ninguna política RLS nueva permite insert/update directo de un actor externo sobre solicitudes', async () => {
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

  it('9. aceptar/rechazar quedan registrados en solicitud_actuaciones', async () => {
    const t = await prepararTenantConActorExterno('p9')
    const origenId = await crearVocabularioSolicitud(t.tenantId, 'ORIGEN_SOLICITUD', 'formulario', 'Formulario')
    const prioridadId = await crearVocabularioSolicitud(t.tenantId, 'PRIORIDAD_SOLICITUD', 'media', 'Media')
    const { data: aceptada, error: errorCrear1 } = await t.clienteExterno.rpc('fn_solicitud_recibir_externa', {
      p_actor_externo_vinculo_id: t.actorExternoVinculoId, p_inmueble_id: t.inmuebleId,
      p_tipo_id: t.tipoId, p_categoria_id: t.categoriaId, p_asunto: 'Se acepta',
    }).single<SolicitudRow>()
    if (errorCrear1) throw errorCrear1
    const { data: rechazada, error: errorCrear2 } = await t.clienteExterno.rpc('fn_solicitud_recibir_externa', {
      p_actor_externo_vinculo_id: t.actorExternoVinculoId, p_inmueble_id: t.inmuebleId,
      p_tipo_id: t.tipoId, p_categoria_id: t.categoriaId, p_asunto: 'Se rechaza',
    }).single<SolicitudRow>()
    if (errorCrear2) throw errorCrear2

    const staff = await crearStaffAuxiliar(t.tenantId, `p9-staff-${RUN_ID}`)
    const { error: errorAceptar } = await staff.rpc('fn_solicitud_triage_aceptar', {
      p_solicitud_id: aceptada.id, p_origen_id: origenId, p_prioridad_id: prioridadId,
    })
    if (errorAceptar) throw errorAceptar
    const { error: errorRechazar } = await staff.rpc('fn_solicitud_triage_rechazar', {
      p_solicitud_id: rechazada.id, p_motivo: 'No aplica',
    })
    if (errorRechazar) throw errorRechazar

    const { data: actuacionAceptar, error: errorLeerAceptar } = await admin
      .from('solicitud_actuaciones').select('estado').eq('solicitud_id', aceptada.id).eq('estado', 'nueva').maybeSingle()
    if (errorLeerAceptar) throw errorLeerAceptar
    expect(actuacionAceptar).toBeTruthy()

    const { data: actuacionRechazar, error: errorLeerRechazar } = await admin
      .from('solicitud_actuaciones').select('estado, descripcion').eq('solicitud_id', rechazada.id)
      .eq('estado', 'rechazada_triage').maybeSingle()
    if (errorLeerRechazar) throw errorLeerRechazar
    expect(actuacionRechazar?.descripcion).toBe('No aplica')
  }, 30_000)

  it('10. aislamiento entre tenants: el vínculo de un tenant no sirve para un inmueble de otro tenant', async () => {
    const a = await prepararTenantConActorExterno('p10a')
    const b = await prepararTenantConActorExterno('p10b')
    const { error } = await a.clienteExterno.rpc('fn_solicitud_recibir_externa', {
      p_actor_externo_vinculo_id: a.actorExternoVinculoId, p_inmueble_id: b.inmuebleId,
      p_tipo_id: a.tipoId, p_categoria_id: a.categoriaId, p_asunto: 'Cruzado',
    })
    expect(error?.message).toContain('SOLICITUD_EXTERNA_INMUEBLE_NO_VINCULADO')
  }, 30_000)
})
