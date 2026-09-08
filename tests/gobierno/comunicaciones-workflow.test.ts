/**
 * GOB-9 (20260931950000-20260932010000) — comunicaciones y workflow transversal.
 * Ver Casos de uso/Tres Modulos/Gobierno/GOB_09_comunicaciones_workflow.md.
 *
 * Último corte del roadmap (fila 33/33, HOJA_DE_RUTA.md §2). Es un refactor, no un módulo:
 * generaliza acciones_cobranza_envios/acuses (origen polimórfico, GOB-9 §3.1) y agrega un motor
 * de vencimientos que SOLO detecta y notifica sobre las 5 máquinas de estado ya construidas
 * (GOB-4/5/6/7/8) — nunca cambia su estado (§3.3, fuera de alcance §4).
 *
 * Prueba 1 (cero regresión) no se reproduce aquí como un `it()` — no tiene sentido ejecutar la
 * suite de otro archivo desde dentro de un test. La evidencia real es haber corrido, sin tocar ni
 * una línea, tests/plantillas-email, tests/plantillas-sms y tests/tenancy/cartera-*.test.ts
 * DESPUÉS de aplicar las migraciones de este corte — pegada en GOB_09_INFORME.md. Lo que sí se
 * verifica aquí (prueba 1) es la garantía estructural que hace posible esa cero regresión: el
 * camino de accion_id (legacy) sigue existiendo intacto y su unique original sigue vigente.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import { readFileSync } from 'node:fs'
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
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/gobierno/comunicaciones-workflow: faltan variables de Supabase en .env')
}

interface NotificacionRow {
  id: string
  tipo_vencimiento: string
  entidad_id: string
  config_id: string
}

d('GOB-9: comunicaciones y workflow transversal', () => {
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

  async function crearTenantCompleto(etiqueta: string): Promise<{ tenantId: string; cliente: Cliente }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const tenant = await crearTenant(admin, etiqueta, usuario.id)
    tenantsCreados.push(tenant.id)
    await crearMembership(admin, tenant.id, usuario.id, 'administrador')
    const cliente = await clienteComo(env!, usuario)
    return { tenantId: tenant.id, cliente }
  }

  async function crearInmueble(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_INMUEBLE', 'apartamento')
    const { data, error } = await admin
      .from('inmuebles').insert({ tenant_id: tenantId, codigo, tipo_id: tipoId }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearTercero(
    tenantId: string, primerNombre: string, primerApellido: string,
    extra: { email?: string; telefono?: string } = {},
  ): Promise<string> {
    const sello = `${RUN_ID}-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`
    const tipoIdentId = await idListaTipos('TIPO_IDENTIFICACION', 'cedula')
    const estadoActivoId = await idListaTipos('ESTADO_TERCERO', 'activo')
    const { data, error } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenantId, tipo_persona: 'natural', tipo_identificacion_id: tipoIdentId,
        numero_documento: sello, primer_nombre: primerNombre, primer_apellido: primerApellido,
        estado_id: estadoActivoId, email: extra.email ?? null, telefono: extra.telefono ?? null,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture tercero ${primerNombre} ${primerApellido}: ${error.message}`)
    return data.id
  }

  async function vincularPropietario(tenantId: string, inmuebleId: string, terceroId: string): Promise<void> {
    const rolId = await idListaTipos('PERSONA_PREDIO', 'copropietario')
    const { error } = await admin
      .from('inmueble_persona_rol')
      .insert({ tenant_id: tenantId, inmueble_id: inmuebleId, tercero_id: terceroId, rol_id: rolId, vigente_desde: '2020-01-01' })
    if (error) throw new Error(`fixture inmueble_persona_rol: ${error.message}`)
  }

  async function crearAgrupacion(tenantId: string, nombre: string, tipoCodigo: string, parentId: string | null = null): Promise<string> {
    const tipoId = await idListaTipos('AGRUPACION_PREDIOS', tipoCodigo)
    const { data, error } = await admin
      .from('agrupaciones')
      .insert({ tenant_id: tenantId, nombre, tipo_id: tipoId, parent_id: parentId })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture agrupacion ${nombre}: ${error.message}`)
    return data.id
  }

  async function crearOrgano(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('ORGANO_GOBIERNO', codigo)
    const { data, error } = await admin
      .from('gobierno_organos')
      .insert({ tenant_id: tenantId, tipo_id: tipoId, vigente_desde: '2020-01-01' })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture organo ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearMiembro(tenantId: string, organoId: string, terceroId: string, rolCodigo: string): Promise<string> {
    const rolId = await idListaTipos('ROL_CONCEJO_COPROPIEDAD', rolCodigo)
    const { data, error } = await admin
      .from('gobierno_miembros')
      .insert({ tenant_id: tenantId, organo_id: organoId, tercero_id: terceroId, rol_id: rolId, desde: '2020-01-01' })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture miembro ${rolCodigo}: ${error.message}`)
    return data.id
  }

  async function idMateria(codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('gobierno_materia_decision').select('id').eq('codigo', codigo).single<{ id: number }>()
    if (error) throw new Error(`fixture materia ${codigo}: ${error.message}`)
    return data.id
  }

  /** Mismo escenario base que GOB-5 (prepararVotacionAprobada, tests/gobierno/decisiones.test.ts):
   * 2 inmuebles con coeficientes (0.6/0.4) + quórum + votación aprobada + gobierno_crear_decision.
   * Reutilizado tal cual — inventar un atajo de inserción directa en gobierno_decisiones ya demostró
   * ser frágil (VOTACION_REUNION_NO_INSTALADA): el guard exige la secuencia real. */
  async function crearDecisionCompleta(
    tenantId: string, cliente: Cliente, organoId: string, etiqueta: string,
  ): Promise<{ decisionId: string; presidenteMiembroId: string; secretarioMiembroId: string }> {
    const inmA = await crearInmueble(tenantId, `GOB9-${etiqueta}-A-${RUN_ID}`)
    const inmB = await crearInmueble(tenantId, `GOB9-${etiqueta}-B-${RUN_ID}`)
    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .insert({ tenant_id: tenantId, version: 1, vigente_desde: '2020-01-01', estado: 'borrador', suma_total: 1 })
      .select('id').single<{ id: string }>()
    if (errSet) throw new Error(`fixture coeficiente_sets: ${errSet.message}`)
    await admin.from('coeficientes').insert([
      { tenant_id: tenantId, set_id: set.id, inmueble_id: inmA, valor: 0.6 },
      { tenant_id: tenantId, set_id: set.id, inmueble_id: inmB, valor: 0.4 },
    ])
    await admin.from('coeficiente_sets').update({ estado: 'vigente' }).eq('id', set.id)

    const propA = await crearTercero(tenantId, 'PropA', etiqueta)
    const propB = await crearTercero(tenantId, 'PropB', etiqueta)
    const pTercero = await crearTercero(tenantId, 'Presidente', etiqueta)
    const sTercero = await crearTercero(tenantId, 'Secretario', etiqueta)
    const presidenteMiembroId = await crearMiembro(tenantId, organoId, pTercero, 'presidente')
    const secretarioMiembroId = await crearMiembro(tenantId, organoId, sTercero, 'secretario')

    const reunionTipoId = await idListaTipos('TIPO_REUNION', 'asamblea_ordinaria')
    const { data: reunion, error: errReunion } = await admin
      .from('gobierno_reuniones')
      .insert({
        tenant_id: tenantId, organo_id: organoId, tipo_id: reunionTipoId, modalidad: 'presencial',
        convocatoria_regimen: 'primera', fecha_hora: '2026-06-01T15:00:00Z', lugar: 'Salón comunal',
      })
      .select('id').single<{ id: string }>()
    if (errReunion) throw new Error(`fixture reunion (decision): ${errReunion.message}`)
    await admin.from('gobierno_agenda_puntos').insert({ tenant_id: tenantId, reunion_id: reunion.id, orden: 1, titulo: 'Punto único' })
    const { data: asistA, error: errAsistA } = await admin
      .from('gobierno_asistencia')
      .insert({ tenant_id: tenantId, reunion_id: reunion.id, inmueble_id: inmA, asistente_ref: propA, calidad: 'propietario' })
      .select('id').single<{ id: string }>()
    if (errAsistA) throw new Error(`fixture asistencia A: ${errAsistA.message}`)
    const { data: asistB, error: errAsistB } = await admin
      .from('gobierno_asistencia')
      .insert({ tenant_id: tenantId, reunion_id: reunion.id, inmueble_id: inmB, asistente_ref: propB, calidad: 'propietario' })
      .select('id').single<{ id: string }>()
    if (errAsistB) throw new Error(`fixture asistencia B: ${errAsistB.message}`)

    const { error: errInstalar } = await cliente
      .from('gobierno_reuniones')
      .update({ estado: 'instalada', presidente_miembro_id: presidenteMiembroId, secretario_miembro_id: secretarioMiembroId })
      .eq('id', reunion.id)
    if (errInstalar) throw new Error(`fixture instalar: ${errInstalar.message}`)

    const materiaId = await idMateria('ordinaria')
    const { data: votacion, error: errVot } = await admin
      .from('gobierno_votaciones')
      .insert({ tenant_id: tenantId, reunion_id: reunion.id, materia_id: materiaId, pregunta: `¿Aprobar ${etiqueta}?` })
      .select('id').single<{ id: string }>()
    if (errVot) throw new Error(`fixture votacion (decision): ${errVot.message}`)
    await admin.from('gobierno_votos').insert({ tenant_id: tenantId, votacion_id: votacion.id, asistencia_id: asistA.id, sentido: 'favor', coeficiente: 0 })
    await admin.from('gobierno_votos').insert({ tenant_id: tenantId, votacion_id: votacion.id, asistencia_id: asistB.id, sentido: 'contra', coeficiente: 0 })
    const { error: errCierreVot } = await admin.from('gobierno_votaciones').update({ estado: 'cerrada' }).eq('id', votacion.id)
    if (errCierreVot) throw new Error(`fixture cerrar votacion: ${errCierreVot.message}`)

    const { error: errCerrarReunion } = await cliente.from('gobierno_reuniones').update({ estado: 'cerrada' }).eq('id', reunion.id)
    if (errCerrarReunion) throw new Error(`fixture cerrar reunion: ${errCerrarReunion.message}`)

    const { data: decision, error } = await admin
      .rpc('gobierno_crear_decision', { p_votacion_id: votacion.id, p_titulo: `Decisión ${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`fixture crear decision: ${error.message}`)
    return { decisionId: decision.id, presidenteMiembroId, secretarioMiembroId }
  }

  async function crearCompromiso(tenantId: string, decisionId: string, fechaLimite: string): Promise<string> {
    const { data, error } = await admin
      .from('gobierno_compromisos')
      .insert({ tenant_id: tenantId, decision_id: decisionId, orden: 1, titulo: 'Compromiso GOB-9', fecha_limite: fechaLimite })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture compromiso: ${error.message}`)
    return data.id
  }

  async function crearInfraccion(tenantId: string): Promise<string> {
    const { data, error } = await admin
      .from('gobierno_infracciones')
      .insert({ tenant_id: tenantId, codigo: `INF-${RUN_ID}-${String(Date.now())}`, nombre: 'Ruido excesivo', reglamento_referencia: 'art. 10' })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture infraccion: ${error.message}`)
    return data.id
  }

  async function crearExpediente(tenantId: string, inmuebleId: string, infractorId: string): Promise<string> {
    const infraccionId = await crearInfraccion(tenantId)
    const { data, error } = await admin
      .from('gobierno_expedientes_convivencia')
      .insert({
        tenant_id: tenantId, numero: Math.floor(Math.random() * 1_000_000) + 1, anio: 2026,
        infraccion_id: infraccionId, inmueble_id: inmuebleId, presunto_infractor_ref: infractorId,
        calidad: 'propietario', fecha_hechos: '2026-05-01', descripcion_hechos: 'Hechos de prueba GOB-9',
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture expediente: ${error.message}`)
    return data.id
  }

  async function crearImpugnacionSobreExpediente(tenantId: string, expedienteId: string, impugnanteId: string, plazoLimite: string): Promise<string> {
    const { data, error } = await admin
      .from('gobierno_impugnaciones')
      .insert({
        tenant_id: tenantId, numero: Math.floor(Math.random() * 1_000_000) + 1, anio: 2026,
        objeto_tipo: 'sancion', expediente_id: expedienteId, impugnante_ref: impugnanteId,
        fecha_notificacion_objeto: '2026-05-01', fecha_presentacion: '2026-05-05',
        plazo_limite: plazoLimite, presentada_en_plazo: true, causal: 'Causal de prueba GOB-9',
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture impugnacion: ${error.message}`)
    return data.id
  }

  // TIPO/CATEGORIA/ORIGEN/PRIORIDAD_SOLICITUD nacen sin filas globales (GOB-8: "cero filas
  // precargadas, cada copropiedad las define") — a diferencia de TIPO_INMUEBLE/ESTADO_TERCERO,
  // aquí hay que sembrar la fila del propio tenant antes de poder usarla.
  async function crearListaTipoTenant(tenantId: string, tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos')
      .insert({ tipo, codigo, nombre: codigo, tenant_id: tenantId })
      .select('id').single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos tenant ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  async function crearSolicitud(tenantId: string, inmuebleId: string, solicitanteId: string, slaVenceAt: string): Promise<string> {
    const tipoId = await crearListaTipoTenant(tenantId, 'TIPO_SOLICITUD', 'peticion')
    const categoriaId = await crearListaTipoTenant(tenantId, 'CATEGORIA_SOLICITUD', 'general')
    const origenId = await crearListaTipoTenant(tenantId, 'ORIGEN_SOLICITUD', 'residente')
    const prioridadId = await crearListaTipoTenant(tenantId, 'PRIORIDAD_SOLICITUD', 'media')
    const { data, error } = await admin
      .from('solicitudes')
      .insert({
        tenant_id: tenantId, numero: Math.floor(Math.random() * 1_000_000) + 1, anio: 2026,
        tipo_id: tipoId, categoria_id: categoriaId, origen_id: origenId, prioridad_id: prioridadId,
        solicitante_ref: solicitanteId, inmueble_id: inmuebleId, calidad: 'propietario',
        asunto: 'Solicitud de prueba GOB-9', sla_vence_at: slaVenceAt,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture solicitud: ${error.message}`)
    return data.id
  }

  // Reutiliza el órgano y el presidente/secretario ya creados por crearDecisionCompleta para el
  // mismo tenant — un segundo presidente/secretario vigente en el mismo órgano dispara
  // ROL_ORGANO_DUPLICADO (guard_gobierno_miembro, GOB-1).
  async function crearActa(
    tenantId: string, organoId: string, presidenteMiembroId: string, secretarioMiembroId: string, plazoDisposicionLimite: string,
  ): Promise<string> {
    const reunionTipoId = await idListaTipos('TIPO_REUNION', 'asamblea_ordinaria')
    const { data: reunion, error: errReunion } = await admin
      .from('gobierno_reuniones')
      .insert({
        tenant_id: tenantId, organo_id: organoId, tipo_id: reunionTipoId, modalidad: 'presencial',
        convocatoria_regimen: 'primera', fecha_hora: '2026-06-02T15:00:00Z', lugar: 'Salón comunal', estado: 'cerrada',
      })
      .select('id').single<{ id: string }>()
    if (errReunion) throw new Error(`fixture reunion (acta): ${errReunion.message}`)
    const { data: acta, error } = await admin
      .from('gobierno_actas')
      .insert({
        tenant_id: tenantId, reunion_id: reunion.id, anio: 2026, contenido_generado: {},
        presidente_miembro_id: presidenteMiembroId, secretario_miembro_id: secretarioMiembroId,
        plazo_disposicion_limite: plazoDisposicionLimite,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture acta: ${error.message}`)
    return acta.id
  }

  type TipoVencimiento = 'compromiso' | 'expediente_convivencia' | 'impugnacion' | 'solicitud' | 'acta_disposicion'

  async function crearConfigVencimiento(tenantId: string, tipo: TipoVencimiento, dias: number): Promise<string> {
    const { data, error } = await admin
      .from('gobierno_vencimiento_config')
      .insert({ tenant_id: tenantId, tipo_vencimiento: tipo, dias_anticipacion: dias, canal: 'email' })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture config vencimiento ${tipo}: ${error.message}`)
    return data.id
  }

  function detectar(tenantId: string, fecha = new Date().toISOString().slice(0, 10)) {
    return admin.rpc('gobierno_detectar_vencimientos', { p_tenant_id: tenantId, p_fecha: fecha })
  }

  const HOY = new Date()
  const EN_3_DIAS = new Date(HOY.getTime() + 3 * 86_400_000).toISOString().slice(0, 10)
  const EN_30_DIAS = new Date(HOY.getTime() + 30 * 86_400_000).toISOString().slice(0, 10)

  it('1. envio_origen_exclusivo protege el camino legacy: ni "ninguno" ni "los dos" a la vez', async () => {
    const { tenantId } = await crearTenantCompleto('t1')
    const terceroId = await crearTercero(tenantId, 'Destinatario', 't1', { email: 'destinatario-t1@example.test' })
    const base = {
      tenant_id: tenantId, intento_numero: 1, canal: 'email' as const, destinatario_tercero_id: terceroId,
      destinatario_contacto: 'destinatario-t1@example.test', plantilla_codigo: 'x', plantilla_version: 1,
      contenido_renderizado: 'x', contenido_hash: 'x', proveedor: 'brevo',
    }
    // Ninguno de los dos caminos: rechazado — así se comportaba accion_id NOT NULL antes de
    // GOB-9, ahora expresado por el check en vez de por la ausencia de default.
    const { error: errNinguno } = await admin.from('acciones_cobranza_envios').insert({ ...base, accion_id: null })
    expect(errNinguno?.message).toContain('envio_origen_exclusivo')

    // Los dos caminos a la vez: también rechazado — un envío no puede acreditarse por accion_id
    // Y por origen genérico simultáneamente (evitaría que una auditoría lo contara dos veces).
    const { error: errAmbos } = await admin.from('acciones_cobranza_envios').insert({
      ...base, accion_id: crypto.randomUUID(), origen_modulo: 'gobierno', origen_entidad: 'x', origen_id: crypto.randomUUID(),
    })
    expect(errAmbos?.message).toMatch(/envio_origen_exclusivo|acciones_cobranza_envios_accion_id_fkey/)
  }, 30_000)

  it('2. una plantilla generalizada se usa desde convocatoria y desde cobranza, con el mismo versionado', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('t2')
    const guardar = (eventType: string, html: string) =>
      cliente.rpc('fn_guardar_plantilla_email', {
        p_tenant_id: tenantId, p_event_type: eventType, p_subject: 'Asunto', p_html_content: html,
      }).single<{ version: number; event_type: string }>()

    const { data: convocatoria1, error: e1 } = await guardar('gob2_convocatoria', '<p>Convocatoria v1</p>')
    expect(e1).toBeNull()
    expect(convocatoria1!.version).toBe(1)

    const { data: cobranza1 } = await guardar('cartera_pago_vencido_test_gob9', '<p>Cobranza v1</p>')
    expect(cobranza1!.version).toBe(1)

    const { data: convocatoria2, error: e2 } = await guardar('gob2_convocatoria', '<p>Convocatoria v2 — cambia el cuerpo</p>')
    expect(e2).toBeNull()
    expect(convocatoria2!.version).toBe(2)
  }, 30_000)

  it('3. un envío conserva su origen polimórfico y es idempotente: el mismo origen no genera dos envíos', async () => {
    const { tenantId } = await crearTenantCompleto('t3')
    const terceroId = await crearTercero(tenantId, 'Destinatario', 't3', { email: 'destinatario-t3@example.test' })
    const origenId = crypto.randomUUID()

    const envioBase = {
      tenant_id: tenantId, accion_id: null, origen_modulo: 'gobierno', origen_entidad: 'gobierno_expediente_actuaciones',
      origen_id: origenId, origen_evento: 'requerimiento_escrito', intento_numero: 1, canal: 'email' as const,
      destinatario_tercero_id: terceroId, destinatario_contacto: 'destinatario-t3@example.test',
      plantilla_codigo: 'gob6_requerimiento_escrito', plantilla_version: 1, contenido_renderizado: 'Texto',
      contenido_hash: 'hash1', proveedor: 'brevo',
    }
    const { error: e1 } = await admin.from('acciones_cobranza_envios').insert(envioBase)
    expect(e1).toBeNull()

    const { error: e2 } = await admin.from('acciones_cobranza_envios').insert(envioBase)
    expect(e2?.message ?? e2?.details ?? '').toMatch(/duplicate key|unique/i)
  }, 30_000)

  it('4. el validador de frases prohibidas sigue activo en cobranza', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('t4')
    const { error } = await cliente.rpc('fn_guardar_plantilla_sms', {
      p_tenant_id: tenantId, p_event_type: 'cartera_pago_vencido', p_cuerpo: 'Si no paga lo reportamos a la central de riesgo hoy mismo',
    })
    expect(error?.message).toContain('CONTENIDO_PROHIBIDO')
  }, 30_000)

  it('5. la segmentación por agrupación devuelve exactamente los inmuebles de esa torre', async () => {
    const { tenantId } = await crearTenantCompleto('t5')
    const torreA = await crearAgrupacion(tenantId, 'Torre A', 'edificio')
    const torreB = await crearAgrupacion(tenantId, 'Torre B', 'edificio')
    const inmA1 = await crearInmueble(tenantId, `GOB9-t5-A1-${RUN_ID}`)
    const inmA2 = await crearInmueble(tenantId, `GOB9-t5-A2-${RUN_ID}`)
    const inmB1 = await crearInmueble(tenantId, `GOB9-t5-B1-${RUN_ID}`)
    await admin.from('inmuebles').update({ agrupacion_id: torreA }).eq('id', inmA1)
    await admin.from('inmuebles').update({ agrupacion_id: torreA }).eq('id', inmA2)
    await admin.from('inmuebles').update({ agrupacion_id: torreB }).eq('id', inmB1)
    const propA1 = await crearTercero(tenantId, 'PropA1', 't5')
    const propA2 = await crearTercero(tenantId, 'PropA2', 't5')
    const propB1 = await crearTercero(tenantId, 'PropB1', 't5')
    await vincularPropietario(tenantId, inmA1, propA1)
    await vincularPropietario(tenantId, inmA2, propA2)
    await vincularPropietario(tenantId, inmB1, propB1)

    const { data, error } = await admin.rpc('gobierno_segmento_destinatarios', {
      p_tenant_id: tenantId, p_criterio: 'agrupacion', p_valor: torreA,
    })
    expect(error).toBeNull()
    const inmuebles = (data as { inmueble_id: string }[]).map((r) => r.inmueble_id).sort()
    expect(inmuebles).toEqual([inmA1, inmA2].sort())
  }, 30_000)

  it('6. el motor de vencimientos detecta un compromiso próximo a vencer sin que ningún estado se haya modificado', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('t6')
    const organoId = await crearOrgano(tenantId, 'asamblea_general')
    const { decisionId } = await crearDecisionCompleta(tenantId, cliente, organoId, 't6')
    const compromisoId = await crearCompromiso(tenantId, decisionId, EN_3_DIAS)
    await crearConfigVencimiento(tenantId, 'compromiso', 5)

    const { data: antes } = await admin.from('gobierno_compromisos').select('estado').eq('id', compromisoId).single<{ estado: string }>()

    const { data, error } = await detectar(tenantId)
    expect(error).toBeNull()
    const filas = data as NotificacionRow[]
    expect(filas.some((f) => f.tipo_vencimiento === 'compromiso' && f.entidad_id === compromisoId)).toBe(true)

    const { data: despues } = await admin.from('gobierno_compromisos').select('estado').eq('id', compromisoId).single<{ estado: string }>()
    expect(despues!.estado).toBe(antes!.estado)
  }, 30_000)

  it('7. el motor no cambia ningún estado de ninguna de las 5 máquinas — prueba negativa', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('t7')
    const organoId = await crearOrgano(tenantId, 'asamblea_general')
    const inmueble = await crearInmueble(tenantId, `GOB9-t7-${RUN_ID}`)
    const persona = await crearTercero(tenantId, 'Persona', 't7')

    const { decisionId, presidenteMiembroId, secretarioMiembroId } = await crearDecisionCompleta(tenantId, cliente, organoId, 't7')
    const compromisoId = await crearCompromiso(tenantId, decisionId, EN_3_DIAS)
    const expedienteId = await crearExpediente(tenantId, inmueble, persona)
    // gobierno_expediente_actuaciones.fecha_limite solo existe si un hito la fija — sin esto,
    // el motor no tendría nada que detectar para expediente_convivencia.
    const { error: errActuacion } = await cliente.rpc('gobierno_registrar_actuacion', {
      p_expediente_id: expedienteId, p_etapa: 'requerimiento_escrito', p_fecha: new Date().toISOString().slice(0, 10),
      p_descripcion: 'Requerimiento t7', p_plazo_dias: 3,
    })
    if (errActuacion) throw new Error(`fixture actuacion t7: ${errActuacion.message}`)
    const impugnacionId = await crearImpugnacionSobreExpediente(tenantId, expedienteId, persona, EN_3_DIAS)
    const solicitudId = await crearSolicitud(tenantId, inmueble, persona, `${EN_3_DIAS}T00:00:00Z`)
    const actaId = await crearActa(tenantId, organoId, presidenteMiembroId, secretarioMiembroId, EN_3_DIAS)

    const tiposVencimiento: TipoVencimiento[] = ['compromiso', 'expediente_convivencia', 'impugnacion', 'solicitud', 'acta_disposicion']
    for (const tipo of tiposVencimiento) {
      await crearConfigVencimiento(tenantId, tipo, 5)
    }

    async function snapshot() {
      const [c, e, i, s, a] = await Promise.all([
        admin.from('gobierno_compromisos').select('estado').eq('id', compromisoId).single<{ estado: string }>(),
        admin.from('gobierno_expedientes_convivencia').select('etapa').eq('id', expedienteId).single<{ etapa: string }>(),
        admin.from('gobierno_impugnaciones').select('estado, resuelta_at').eq('id', impugnacionId).single(),
        admin.from('solicitudes').select('estado, resuelta_at, cerrada_at').eq('id', solicitudId).single(),
        admin.from('gobierno_actas').select('estado, suscrita_at, puesta_a_disposicion_at').eq('id', actaId).single(),
      ])
      return { c: c.data, e: e.data, i: i.data, s: s.data, a: a.data }
    }

    const antes = await snapshot()
    const { data, error } = await detectar(tenantId)
    expect(error).toBeNull()
    const tipos = (data as NotificacionRow[]).map((f) => f.tipo_vencimiento).sort()
    expect(tipos).toEqual(['acta_disposicion', 'compromiso', 'expediente_convivencia', 'impugnacion', 'solicitud'].sort())

    const despues = await snapshot()
    expect(despues).toEqual(antes)
  }, 30_000)

  it('8. una notificación ya emitida no se repite en la corrida siguiente', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('t8')
    const organoId = await crearOrgano(tenantId, 'asamblea_general')
    const { decisionId } = await crearDecisionCompleta(tenantId, cliente, organoId, 't8')
    const compromisoId = await crearCompromiso(tenantId, decisionId, EN_3_DIAS)
    await crearConfigVencimiento(tenantId, 'compromiso', 5)

    const { data: primera } = await detectar(tenantId)
    expect((primera as NotificacionRow[]).some((f) => f.entidad_id === compromisoId)).toBe(true)

    const { data: segunda, error } = await detectar(tenantId)
    expect(error).toBeNull()
    expect((segunda as NotificacionRow[]).some((f) => f.entidad_id === compromisoId)).toBe(false)

    const { count } = await admin
      .from('gobierno_vencimiento_notificaciones')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('entidad_id', compromisoId)
    expect(count).toBe(1)
  }, 30_000)

  it('9. la notificación de requerimiento de GOB-6 deja constancia verificable de envío', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('t9')
    const inmueble = await crearInmueble(tenantId, `GOB9-t9-${RUN_ID}`)
    const infractor = await crearTercero(tenantId, 'Infractor', 't9', { email: 'infractor-t9@example.test' })
    const expedienteId = await crearExpediente(tenantId, inmueble, infractor)

    const { error: errActuacion } = await cliente.rpc('gobierno_registrar_actuacion', {
      p_expediente_id: expedienteId, p_etapa: 'requerimiento_escrito', p_fecha: '2026-06-01',
      p_descripcion: 'Requerimiento escrito previo (art. 59)',
    })
    expect(errActuacion).toBeNull()

    await cliente.rpc('fn_guardar_plantilla_email', {
      p_tenant_id: tenantId, p_event_type: 'gob6_requerimiento_escrito',
      p_subject: 'Requerimiento escrito', p_html_content: '<p>Se le requiere formalmente por los hechos reportados.</p>',
    })

    const respuestaEnvio = await cliente.functions.invoke<{ tipo: string; envioId: string | null }>('enviar-comunicacion', {
      body: {
        tenant_id: tenantId, origen_modulo: 'gobierno', origen_entidad: 'gobierno_expediente_actuaciones',
        origen_id: expedienteId, origen_evento: 'requerimiento_escrito', canal: 'email',
        event_type: 'gob6_requerimiento_escrito', destinatario_tercero_id: infractor,
        destinatario_contacto: 'infractor-t9@example.test', campos: {}, modo: 'ejecucion',
      },
    })
    const errEnvio: unknown = respuestaEnvio.error
    const resultado = respuestaEnvio.data
    expect(errEnvio).toBeNull()
    expect(resultado?.tipo).toBe('enviada')
    expect(resultado?.envioId).not.toBeNull()

    const { data: envio, error: errLectura } = await admin
      .from('acciones_cobranza_envios')
      .select('id, origen_modulo, origen_entidad, origen_id, origen_evento')
      .eq('origen_modulo', 'gobierno').eq('origen_id', expedienteId).single()
    expect(errLectura).toBeNull()
    expect(envio!.origen_entidad).toBe('gobierno_expediente_actuaciones')

    const { count } = await admin.from('acciones_cobranza_acuses').select('id', { count: 'exact', head: true }).eq('envio_id', envio!.id)
    expect(count).toBe(1)
  }, 30_000)

  it('10. el tablero no ejecuta consultas propias sobre tablas de otros módulos — prueba estructural', () => {
    const store = readFileSync('apps/web/app/stores/gobiernoTablero.ts', 'utf-8')
    const llamadasFrom = [...store.matchAll(/\.from\(['"]([a-z_]+)['"]\)/g)].map((m) => m[1])
    expect(llamadasFrom).toEqual([])
    expect(store).toContain(".rpc('gobierno_tablero_resumen'")
  })

  it('11. aislamiento entre tenants en el motor de vencimientos', async () => {
    const a = await crearTenantCompleto('t11a')
    const b = await crearTenantCompleto('t11b')
    const organoA = await crearOrgano(a.tenantId, 'asamblea_general')
    const organoB = await crearOrgano(b.tenantId, 'asamblea_general')
    const { decisionId: decisionA } = await crearDecisionCompleta(a.tenantId, a.cliente, organoA, 't11a')
    const { decisionId: decisionB } = await crearDecisionCompleta(b.tenantId, b.cliente, organoB, 't11b')
    const compromisoA = await crearCompromiso(a.tenantId, decisionA, EN_3_DIAS)
    const compromisoB = await crearCompromiso(b.tenantId, decisionB, EN_3_DIAS)
    await crearConfigVencimiento(a.tenantId, 'compromiso', 5)
    await crearConfigVencimiento(b.tenantId, 'compromiso', 5)

    const { data, error } = await detectar(a.tenantId)
    expect(error).toBeNull()
    const filas = data as NotificacionRow[]
    expect(filas.some((f) => f.entidad_id === compromisoA)).toBe(true)
    expect(filas.some((f) => f.entidad_id === compromisoB)).toBe(false)

    const { count } = await admin.from('gobierno_vencimiento_notificaciones').select('id', { count: 'exact', head: true }).eq('tenant_id', b.tenantId)
    expect(count).toBe(0)
  }, 30_000)

  it('extra. la configuración de dias_anticipacion de 30 días también detecta un vencimiento lejano (control del rango)', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('extra')
    const organoId = await crearOrgano(tenantId, 'asamblea_general')
    const { decisionId } = await crearDecisionCompleta(tenantId, cliente, organoId, 'extra')
    const compromisoId = await crearCompromiso(tenantId, decisionId, EN_30_DIAS)
    await crearConfigVencimiento(tenantId, 'compromiso', 30)

    const { data, error } = await detectar(tenantId)
    expect(error).toBeNull()
    expect((data as NotificacionRow[]).some((f) => f.entidad_id === compromisoId)).toBe(true)
  }, 30_000)
})
