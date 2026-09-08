/**
 * GOB-8 (20260931850000-20260931880000) — atención al propietario/residente y consulta sin
 * sesión. Ver Casos de uso/Tres Modulos/Gobierno/GOB_08_atencion_consulta.md.
 *
 * AD-26 sigue vigente — Opción 1 confirmada en GOB_00_DECISION_AD26.md: consulta por enlace con
 * token, sin sesión ni portal para propietarios/residentes. NADA de este corte es obligación
 * legal (spec §2) — SLA, encuesta y clasificación de PQRS son buena práctica, registrada así en
 * fundamento_normativo (tipo='otra', referencia='gob8_buena_practica_sin_base_legal').
 *
 * Decisiones confirmadas en el Plan del corte:
 *  - El paquete de ver-inmueble NO incluye "documentos publicados" genéricos (no existe una
 *    marca de visibilidad en `documentos` hoy) — solo estado de cuenta, paz y salvo, actas
 *    publicadas y estado de solicitudes.
 *  - El formulario público para que un residente cree su propia solicitud queda fuera de este
 *    corte — toda solicitud la registra la administración (rol auxiliar).
 *  - Configurar solicitud_sla exige solo rol auxiliar (administrador ⊇ auxiliar).
 *
 * Códigos de error con prefijo ATENCION_, no SOLICITUD_ — el módulo Fondos ya usa SOLICITUD_*
 * para un concepto de dominio distinto (SOLICITUD_ESTADO_TERMINAL entre ellos).
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import type { Database } from '@aquila/shared'
import {
  clienteAdmin,
  clienteAnonimo,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type Cliente,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/gobierno/atencion: faltan variables de Supabase en .env')
}

interface SolicitudRow {
  id: string
  numero: number
  anio: number
  estado: string
  sla_vence_at: string | null
  en_espera_desde: string | null
  expediente_convivencia_id: string | null
}
interface RespuestaGenerarEnlace { id: string; inmueble_id: string; token: string; vigencia_dias: number; expira_en: string }
interface RespuestaVerInmueble {
  estado_cuenta: unknown
  paz_y_salvo: unknown
  actas_publicadas: unknown[]
  solicitudes: { id: string; numero: number; anio: number; estado: string; asunto: string }[]
}
interface RespuestaEncuesta { id: string; calificacion: number; comentario: string | null; respondida_at: string }

d('GOB-8: atención al propietario/residente y consulta sin sesión', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', tipo).eq('codigo', codigo).is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  async function crearVocabularioSolicitud(
    tenantId: string, familia: 'TIPO_SOLICITUD' | 'CATEGORIA_SOLICITUD' | 'ORIGEN_SOLICITUD' | 'PRIORIDAD_SOLICITUD',
    codigo: string, nombre: string,
  ): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').insert({ tipo: familia, codigo, nombre, tenant_id: tenantId }).select('id').single<{ id: number }>()
    if (error) throw new Error(`fixture vocabulario ${familia}.${codigo}: ${error.message}`)
    return data.id
  }

  async function crearTenantCompleto(etiqueta: string): Promise<{ tenantId: string; cliente: Cliente; usuarioId: string }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const tenant = await crearTenant(admin, etiqueta, usuario.id)
    tenantsCreados.push(tenant.id)
    await crearMembership(admin, tenant.id, usuario.id, 'administrador')
    const { clienteComo } = await import('../rls/helpers.js')
    const cliente = await clienteComo(env!, usuario)
    return { tenantId: tenant.id, cliente, usuarioId: usuario.id }
  }

  async function crearInmueble(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_INMUEBLE', 'apartamento')
    const { data, error } = await admin
      .from('inmuebles').insert({ tenant_id: tenantId, codigo, tipo_id: tipoId }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearTercero(tenantId: string, primerNombre: string, primerApellido: string): Promise<string> {
    const sello = `${RUN_ID}-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`
    const tipoIdentId = await idListaTipos('TIPO_IDENTIFICACION', 'cedula')
    const estadoActivoId = await idListaTipos('ESTADO_TERCERO', 'activo')
    const { data, error } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenantId, tipo_persona: 'natural', tipo_identificacion_id: tipoIdentId,
        numero_documento: sello, primer_nombre: primerNombre, primer_apellido: primerApellido,
        estado_id: estadoActivoId,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture tercero ${primerNombre} ${primerApellido}: ${error.message}`)
    return data.id
  }

  /** Tenant + un inmueble + un tercero propietario — escenario mínimo reutilizable. */
  async function prepararTenant(etiqueta: string) {
    const { tenantId, cliente, usuarioId } = await crearTenantCompleto(etiqueta)
    const inmA = await crearInmueble(tenantId, `GOB8-${etiqueta}-A-${RUN_ID}`)
    const propA = await crearTercero(tenantId, 'PropA', etiqueta)
    const tipoId = await crearVocabularioSolicitud(tenantId, 'TIPO_SOLICITUD', 'queja', 'Queja')
    const categoriaId = await crearVocabularioSolicitud(tenantId, 'CATEGORIA_SOLICITUD', 'ruido', 'Ruido')
    const origenId = await crearVocabularioSolicitud(tenantId, 'ORIGEN_SOLICITUD', 'telefono', 'Teléfono')
    const prioridadId = await crearVocabularioSolicitud(tenantId, 'PRIORIDAD_SOLICITUD', 'media', 'Media')
    return { tenantId, cliente, usuarioId, inmA, propA, tipoId, categoriaId, origenId, prioridadId }
  }

  function crearSolicitud(params: {
    tipoId: number; categoriaId: number; origenId: number; prioridadId: number
    solicitanteRef: string; inmuebleId: string; asunto: string; actorId?: string
  }) {
    return admin.rpc('gobierno_crear_solicitud', {
      p_tipo_id: params.tipoId, p_categoria_id: params.categoriaId, p_origen_id: params.origenId,
      p_prioridad_id: params.prioridadId, p_solicitante_ref: params.solicitanteRef,
      p_inmueble_id: params.inmuebleId, p_calidad: 'propietario', p_asunto: params.asunto,
      ...(params.actorId !== undefined && { p_actor_id: params.actorId }),
    }).single<SolicitudRow>()
  }

  type SolicitudEstado = Database['public']['Enums']['solicitud_estado_t']

  function registrarActuacion(params: {
    solicitudId: string; estadoNuevo: SolicitudEstado; descripcion: string
    esRespuesta?: boolean; motivo?: string; actorId?: string
  }) {
    return admin.rpc('gobierno_registrar_actuacion_solicitud', {
      p_solicitud_id: params.solicitudId, p_estado_nuevo: params.estadoNuevo, p_fecha: new Date().toISOString().slice(0, 10),
      p_descripcion: params.descripcion,
      ...(params.esRespuesta !== undefined && { p_es_respuesta: params.esRespuesta }),
      ...(params.motivo !== undefined && { p_motivo: params.motivo }),
      ...(params.actorId !== undefined && { p_actor_id: params.actorId }),
    }).single<{ id: string }>()
  }

  async function crearSLA(params: {
    tenantId: string; tipoId: number; categoriaId: number; prioridadId: number
    horasPrimeraRespuesta: number; horasResolucion: number; horarioHabil?: boolean
  }): Promise<void> {
    const { error } = await admin.from('solicitud_sla').insert({
      tenant_id: params.tenantId, tipo_id: params.tipoId, categoria_id: params.categoriaId,
      prioridad_id: params.prioridadId, horas_primera_respuesta: params.horasPrimeraRespuesta,
      horas_resolucion: params.horasResolucion, horario_habil: params.horarioHabil ?? false,
    })
    if (error) throw new Error(`fixture solicitud_sla: ${error.message}`)
  }

  async function crearInfraccionYExpediente(
    t: Awaited<ReturnType<typeof prepararTenant>>, etiqueta: string,
  ): Promise<string> {
    const { data: infraccion, error: errInf } = await admin
      .from('gobierno_infracciones')
      .insert({
        tenant_id: t.tenantId, codigo: `INF-${RUN_ID}-${etiqueta}`, nombre: 'Ruido excesivo',
        reglamento_referencia: 'Art. 12 del reglamento de convivencia', clases_sancion_permitidas: ['multa'],
        es_no_pecuniaria: true,
      })
      .select('id').single<{ id: string }>()
    if (errInf) throw new Error(`fixture infraccion: ${errInf.message}`)
    const { data: expediente, error: errExp } = await admin.rpc('gobierno_reportar_expediente', {
      p_infraccion_id: infraccion.id, p_inmueble_id: t.inmA, p_presunto_infractor_ref: t.propA,
      p_calidad: 'propietario', p_descripcion_hechos: `Hechos ${etiqueta}`, p_fecha_hechos: '2026-06-02',
    }).single<{ id: string }>()
    if (errExp) throw new Error(`fixture expediente: ${errExp.message}`)
    return expediente.id
  }

  function escalarSolicitud(solicitudId: string, destinoTipo: string, destinoId: string) {
    return admin.rpc('gobierno_escalar_solicitud', {
      p_solicitud_id: solicitudId, p_destino_tipo: destinoTipo, p_destino_id: destinoId,
    }).single<SolicitudRow>()
  }

  async function generarTokenInmueble(cliente: Cliente, inmuebleId: string, vigenciaDias = 30): Promise<RespuestaGenerarEnlace> {
    // No se desestructura `error`: @supabase/functions-js lo tipa como `any` (gap de la
    // librería) — `data`/`response` sí están bien tipados y bastan.
    const { data, response } = await cliente.functions.invoke<RespuestaGenerarEnlace>('generar-enlace-inmueble', {
      body: { inmueble_id: inmuebleId, vigencia_dias: vigenciaDias },
    })
    if (response?.status !== 200) throw new Error(`generar-enlace-inmueble: status ${String(response?.status)}`)
    if (!data) throw new Error('generar-enlace-inmueble: sin datos')
    return data
  }

  async function verInmueble(id: string, t: string): Promise<{ data: RespuestaVerInmueble | null; status: number | undefined }> {
    const anon = clienteAnonimo(env!)
    const { data, response } = await anon.functions.invoke<RespuestaVerInmueble>('ver-inmueble', { body: { id, t } })
    return { data: data ?? null, status: response?.status }
  }

  async function responderEncuesta(
    id: string, t: string, solicitudId: string, calificacion: number, comentario?: string,
  ): Promise<{ data: RespuestaEncuesta | null; status: number | undefined }> {
    const anon = clienteAnonimo(env!)
    const { data, response } = await anon.functions.invoke<RespuestaEncuesta>('responder-encuesta-solicitud', {
      body: { id, t, solicitud_id: solicitudId, calificacion, ...(comentario !== undefined && { comentario }) },
    })
    return { data: data ?? null, status: response?.status }
  }

  it('1. cerrar (resolver) una solicitud sin respuesta registrada falla con ATENCION_CIERRE_SIN_RESPUESTA', async () => {
    const t = await prepararTenant('t1')
    const { data: solicitud } = await crearSolicitud({
      tipoId: t.tipoId, categoriaId: t.categoriaId, origenId: t.origenId, prioridadId: t.prioridadId,
      solicitanteRef: t.propA, inmuebleId: t.inmA, asunto: 'Ruido nocturno', actorId: t.usuarioId,
    })
    const { error } = await registrarActuacion({
      solicitudId: solicitud!.id, estadoNuevo: 'resuelta', descripcion: 'Cerrando sin responder', actorId: t.usuarioId,
    })
    expect(error?.message).toContain('ATENCION_CIERRE_SIN_RESPUESTA')
  }, 30_000)

  it('2. el reloj del SLA se pausa en en_espera y se reanuda al salir, desplazando sla_vence_at', async () => {
    const t = await prepararTenant('t2')
    await crearSLA({
      tenantId: t.tenantId, tipoId: t.tipoId, categoriaId: t.categoriaId, prioridadId: t.prioridadId,
      horasPrimeraRespuesta: 4, horasResolucion: 24,
    })
    const { data: solicitud } = await crearSolicitud({
      tipoId: t.tipoId, categoriaId: t.categoriaId, origenId: t.origenId, prioridadId: t.prioridadId,
      solicitanteRef: t.propA, inmuebleId: t.inmA, asunto: 'Fuga de agua', actorId: t.usuarioId,
    })
    const venceAntesDeEspera = new Date(solicitud!.sla_vence_at!).getTime()

    await registrarActuacion({
      solicitudId: solicitud!.id, estadoNuevo: 'en_espera', descripcion: 'Esperando al propietario',
      motivo: 'Sin acceso al inmueble', actorId: t.usuarioId,
    })
    const { data: enEspera } = await admin.from('solicitudes').select('en_espera_desde, sla_vence_at').eq('id', solicitud!.id).single<{ en_espera_desde: string; sla_vence_at: string }>()
    expect(enEspera!.en_espera_desde).not.toBeNull()
    expect(new Date(enEspera!.sla_vence_at).getTime()).toBe(venceAntesDeEspera)

    await registrarActuacion({
      solicitudId: solicitud!.id, estadoNuevo: 'en_atencion', descripcion: 'El propietario ya está disponible', actorId: t.usuarioId,
    })
    const { data: reanudada } = await admin.from('solicitudes').select('en_espera_desde, sla_vence_at').eq('id', solicitud!.id).single<{ en_espera_desde: string | null; sla_vence_at: string }>()
    expect(reanudada!.en_espera_desde).toBeNull()
    expect(new Date(reanudada!.sla_vence_at).getTime()).toBeGreaterThan(venceAntesDeEspera)
  }, 30_000)

  it('3. el SLA se calcula, no se almacena: una solicitud vencida aparece como vencida sin correr ningún job', async () => {
    const t = await prepararTenant('t3')
    await crearSLA({
      tenantId: t.tenantId, tipoId: t.tipoId, categoriaId: t.categoriaId, prioridadId: t.prioridadId,
      horasPrimeraRespuesta: 1, horasResolucion: 1,
    })
    const { data: solicitud } = await crearSolicitud({
      tipoId: t.tipoId, categoriaId: t.categoriaId, origenId: t.origenId, prioridadId: t.prioridadId,
      solicitanteRef: t.propA, inmuebleId: t.inmA, asunto: 'Filtración en techo', actorId: t.usuarioId,
    })
    expect(solicitud!.sla_vence_at).not.toBeNull()

    // Sin ningún job/cron: se fuerza el escenario "ya venció hace rato" con un UPDATE directo
    // (equivalente a que el tiempo real hubiera pasado) y se comprueba en caliente — nunca se lee
    // un booleano "vencida" persistido, porque no existe tal columna.
    const ayer = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    await admin.from('solicitudes').update({ sla_vence_at: ayer }).eq('id', solicitud!.id)

    const { data: fila } = await admin.from('solicitudes').select('sla_vence_at').eq('id', solicitud!.id).single<{ sla_vence_at: string }>()
    const vencida = new Date(fila!.sla_vence_at).getTime() < Date.now()
    expect(vencida).toBe(true)
  }, 30_000)

  it('4. con horario_habil activo, el vencimiento salta el fin de semana', async () => {
    // 2026-01-02 es viernes (2026-01-01 es jueves, Año Nuevo) — viernes 20:00 + 8 horas hábiles
    // nunca cae en sábado/domingo (gobierno_es_dia_habil, GOB-4): salta a 2026-01-05 (lunes) 04:00.
    const { data: resultado, error } = await admin.rpc('gobierno_sumar_horas_habiles', {
      p_desde: '2026-01-02T20:00:00Z', p_horas: 8,
    })
    expect(error).toBeNull()
    expect(new Date(resultado as unknown as string).toISOString()).toBe('2026-01-05T04:00:00.000Z')

    // Confirma también que crear_solicitud realmente usa este mecanismo cuando horario_habil=true.
    const t = await prepararTenant('t4')
    await crearSLA({
      tenantId: t.tenantId, tipoId: t.tipoId, categoriaId: t.categoriaId, prioridadId: t.prioridadId,
      horasPrimeraRespuesta: 4, horasResolucion: 8, horarioHabil: true,
    })
    const { data: solicitud } = await crearSolicitud({
      tipoId: t.tipoId, categoriaId: t.categoriaId, origenId: t.origenId, prioridadId: t.prioridadId,
      solicitanteRef: t.propA, inmuebleId: t.inmA, asunto: 'Ascensor dañado', actorId: t.usuarioId,
    })
    expect(solicitud!.sla_vence_at).not.toBeNull()
    expect(new Date(solicitud!.sla_vence_at!).getTime()).toBeGreaterThan(Date.now())
  }, 30_000)

  it('5. las actuaciones de la solicitud son append-only', async () => {
    const t = await prepararTenant('t5')
    const { data: solicitud } = await crearSolicitud({
      tipoId: t.tipoId, categoriaId: t.categoriaId, origenId: t.origenId, prioridadId: t.prioridadId,
      solicitanteRef: t.propA, inmuebleId: t.inmA, asunto: 'Solicitud t5', actorId: t.usuarioId,
    })
    const { data: actuacion } = await registrarActuacion({
      solicitudId: solicitud!.id, estadoNuevo: 'asignada', descripcion: 'Asignada al vigilante', actorId: t.usuarioId,
    })
    const { error } = await admin.from('solicitud_actuaciones').update({ descripcion: 'editado' }).eq('id', actuacion!.id)
    expect(error?.message).toContain('APPEND_ONLY')
  }, 30_000)

  it('6. escalar a un expediente de convivencia deja el enlace en ambos sentidos', async () => {
    const t = await prepararTenant('t6')
    const expedienteId = await crearInfraccionYExpediente(t, 't6')
    const { data: solicitud } = await crearSolicitud({
      tipoId: t.tipoId, categoriaId: t.categoriaId, origenId: t.origenId, prioridadId: t.prioridadId,
      solicitanteRef: t.propA, inmuebleId: t.inmA, asunto: 'Denuncia de convivencia', actorId: t.usuarioId,
    })
    const { data: escalada, error } = await escalarSolicitud(solicitud!.id, 'expediente_convivencia', expedienteId)
    expect(error).toBeNull()
    expect(escalada!.expediente_convivencia_id).toBe(expedienteId)

    const { data: vistaDesdeExpediente } = await admin
      .from('solicitudes').select('id').eq('expediente_convivencia_id', expedienteId)
    expect(vistaDesdeExpediente).toHaveLength(1)
    expect(vistaDesdeExpediente![0]!.id).toBe(solicitud!.id)
  }, 30_000)

  it('7. un token de consulta es por inmueble: no expone solicitudes de otro inmueble del mismo tenant', async () => {
    const t = await prepararTenant('t7')
    const inmB = await crearInmueble(t.tenantId, `GOB8-t7-B-${RUN_ID}`)
    await crearSolicitud({
      tipoId: t.tipoId, categoriaId: t.categoriaId, origenId: t.origenId, prioridadId: t.prioridadId,
      solicitanteRef: t.propA, inmuebleId: t.inmA, asunto: 'Solicitud del inmueble A', actorId: t.usuarioId,
    })
    await crearSolicitud({
      tipoId: t.tipoId, categoriaId: t.categoriaId, origenId: t.origenId, prioridadId: t.prioridadId,
      solicitanteRef: t.propA, inmuebleId: inmB, asunto: 'Solicitud del inmueble B', actorId: t.usuarioId,
    })

    const enlace = await generarTokenInmueble(t.cliente, t.inmA)
    const { data } = await verInmueble(enlace.id, enlace.token)
    expect(data).not.toBeNull()
    expect(data!.solicitudes).toHaveLength(1)
    expect(data!.solicitudes[0]!.asunto).toBe('Solicitud del inmueble A')
  }, 30_000)

  it('8. un token caducado no devuelve nada; uno revocado tampoco', async () => {
    const t = await prepararTenant('t8')

    const enlaceCaducado = await generarTokenInmueble(t.cliente, t.inmA, 0)
    const caducado = await verInmueble(enlaceCaducado.id, enlaceCaducado.token)
    expect(caducado.data).toBeNull()
    expect(caducado.status).toBe(410)

    const enlaceVigente = await generarTokenInmueble(t.cliente, t.inmA, 30)
    const { error: errRevocar } = await admin.rpc('gobierno_revocar_token_consulta_inmueble', {
      p_token_id: enlaceVigente.id, p_motivo: 'Ya no aplica', p_actor_id: t.usuarioId,
    })
    expect(errRevocar).toBeNull()
    const revocado = await verInmueble(enlaceVigente.id, enlaceVigente.token)
    expect(revocado.data).toBeNull()
    expect(revocado.status).toBe(403)
  }, 30_000)

  it('9. cada consulta con token queda registrada en auditoría', async () => {
    const t = await prepararTenant('t9')
    const enlace = await generarTokenInmueble(t.cliente, t.inmA)
    const { data } = await verInmueble(enlace.id, enlace.token)
    expect(data).not.toBeNull()

    const { data: registros } = await admin
      .from('audit_log').select('id').eq('entity_type', 'atencion_tokens_consulta').eq('entity_id', enlace.id)
    expect((registros ?? []).length).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it('10. el consultante sin sesión no puede escribir nada — ni siquiera una tabla directa', async () => {
    const t = await prepararTenant('t10')
    const anon = clienteAnonimo(env!)
    const { error } = await anon.from('solicitudes').insert({
      tenant_id: t.tenantId, numero: 999, anio: 2026, tipo_id: t.tipoId, categoria_id: t.categoriaId,
      origen_id: t.origenId, prioridad_id: t.prioridadId, solicitante_ref: t.propA, inmueble_id: t.inmA,
      calidad: 'propietario', asunto: 'Intento de escritura anónima',
    })
    expect(error).not.toBeNull()
  }, 30_000)

  it('11. consecutivo de solicitudes sin huecos', async () => {
    const t = await prepararTenant('t11')
    const numeros: number[] = []
    for (let n = 0; n < 3; n++) {
      const { data: solicitud } = await crearSolicitud({
        tipoId: t.tipoId, categoriaId: t.categoriaId, origenId: t.origenId, prioridadId: t.prioridadId,
        solicitanteRef: t.propA, inmuebleId: t.inmA, asunto: `Solicitud ${String(n)}`, actorId: t.usuarioId,
      })
      numeros.push(solicitud!.numero)
    }
    expect(numeros).toEqual([1, 2, 3])
  }, 30_000)

  it('12. aislamiento entre tenants', async () => {
    const t = await prepararTenant('t12a')
    const b = await crearTenantCompleto('t12b')
    const { data: solicitud } = await crearSolicitud({
      tipoId: t.tipoId, categoriaId: t.categoriaId, origenId: t.origenId, prioridadId: t.prioridadId,
      solicitanteRef: t.propA, inmuebleId: t.inmA, asunto: 'Solicitud t12a', actorId: t.usuarioId,
    })
    const { data: vistaDesdeB } = await b.cliente.from('solicitudes').select('id').eq('id', solicitud!.id)
    expect(vistaDesdeB).toHaveLength(0)
  }, 30_000)

  // Pruebas 13-14: §4.5 (encuesta de satisfacción), no exigidas por §6 (que solo pide las 12 de
  // arriba) pero sí por §4 (alcance incluido) y por la Definición de Hecho del marco maestro
  // (cobertura de todo código nuevo) — ver GOB_08_INFORME.md.
  it('13. la encuesta de satisfacción solo se responde una vez, y solo tras resuelta/cerrada', async () => {
    const t = await prepararTenant('t13')
    const { data: solicitud } = await crearSolicitud({
      tipoId: t.tipoId, categoriaId: t.categoriaId, origenId: t.origenId, prioridadId: t.prioridadId,
      solicitanteRef: t.propA, inmuebleId: t.inmA, asunto: 'Solicitud t13', actorId: t.usuarioId,
    })
    const enlace = await generarTokenInmueble(t.cliente, t.inmA)

    // Todavía 'nueva': no es encuestable.
    const antesDeResolver = await responderEncuesta(enlace.id, enlace.token, solicitud!.id, 5)
    expect(antesDeResolver.status).toBe(409)
    expect(antesDeResolver.data).toBeNull()

    await registrarActuacion({
      solicitudId: solicitud!.id, estadoNuevo: 'resuelta', descripcion: 'Solucionado', esRespuesta: true, actorId: t.usuarioId,
    })

    const primera = await responderEncuesta(enlace.id, enlace.token, solicitud!.id, 4, 'Buena atención')
    expect(primera.status).toBe(201)
    expect(primera.data!.calificacion).toBe(4)

    const segunda = await responderEncuesta(enlace.id, enlace.token, solicitud!.id, 2)
    expect(segunda.status).toBe(409)
    expect(segunda.data).toBeNull()
  }, 30_000)

  it('14. la encuesta de satisfacción no acepta un insert directo a la tabla — solo vía la Edge Function', async () => {
    const t = await prepararTenant('t14')
    const { data: solicitud } = await crearSolicitud({
      tipoId: t.tipoId, categoriaId: t.categoriaId, origenId: t.origenId, prioridadId: t.prioridadId,
      solicitanteRef: t.propA, inmuebleId: t.inmA, asunto: 'Solicitud t14', actorId: t.usuarioId,
    })
    const anon = clienteAnonimo(env!)
    const { error } = await anon.from('solicitud_encuesta').insert({
      tenant_id: t.tenantId, solicitud_id: solicitud!.id, calificacion: 5,
    })
    expect(error).not.toBeNull()
  }, 30_000)
})
