/**
 * GOB-7 (20260931790000-20260931830000) — impugnación, Ley 675 arts. 2 num. 5, 45, 49, 60, 62.
 * Ver Casos de uso/Tres Modulos/Gobierno/GOB_07_impugnacion.md.
 *
 * "AQUILA no resuelve la impugnación: la registra, calcula su plazo, marca sus efectos sobre la
 * decisión impugnada y conserva el expediente. Quien resuelve es el juez o el órgano que
 * corresponda" (spec §2). Los dos plazos (art. 49 y art. 62) siguen "por verificar" — ver
 * GOB_07_INFORME.md primera línea — el sistema calcula pero NUNCA bloquea por vencimiento
 * (spec §3).
 *
 * Decisiones confirmadas en el Plan del corte: presentar y registrar actuaciones exige rol
 * auxiliar (formalización, mismo criterio que GOB-5/GOB-6); resolver exige administrador (efecto
 * jurídico real sobre el objeto impugnado).
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
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
  console.warn('SALTADO tests/gobierno/impugnacion: faltan variables de Supabase en .env')
}

interface DecisionRow { id: string; organo_id: string; estado: string }
interface ExpedienteRow { id: string; numero: number; anio: number; etapa: string }
interface SancionRow { id: string; novedad_id: string | null }
interface ImpugnacionRow {
  id: string
  numero: number
  anio: number
  objeto_tipo: 'decision' | 'sancion'
  decision_id: string | null
  expediente_id: string | null
  estado: string
  plazo_limite: string
  plazo_fundamento_valido: boolean
  presentada_en_plazo: boolean
  suspende_efectos: boolean
  resultado: string | null
}

d('GOB-7: impugnación', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  const HOY = new Date()
  const ANIO_HOY = HOY.getUTCFullYear()
  const MES_HOY = HOY.getUTCMonth() + 1
  const FECHA_HOY = HOY.toISOString().slice(0, 10)

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', tipo).eq('codigo', codigo).is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  async function idMateria(codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('gobierno_materia_decision').select('id').eq('codigo', codigo).single<{ id: number }>()
    if (error) throw new Error(`fixture materia ${codigo}: ${error.message}`)
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

  async function vincularRol(
    tenantId: string, inmuebleId: string, terceroId: string, rolCodigo: string,
    vigenteDesde: string, porcentaje: number | null = null,
  ): Promise<void> {
    const rolId = await idListaTipos('PERSONA_PREDIO', rolCodigo)
    const { error } = await admin
      .from('inmueble_persona_rol')
      .insert({ tenant_id: tenantId, inmueble_id: inmuebleId, tercero_id: terceroId, rol_id: rolId, vigente_desde: vigenteDesde, porcentaje })
    if (error) throw new Error(`fixture inmueble_persona_rol (${rolCodigo}): ${error.message}`)
  }

  async function crearOrgano(tenantId: string, tipoCodigo: string): Promise<string> {
    const tipoId = await idListaTipos('ORGANO_GOBIERNO', tipoCodigo)
    const { data, error } = await admin
      .from('gobierno_organos')
      .insert({ tenant_id: tenantId, tipo_id: tipoId, vigente_desde: '2020-01-01' })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture organo ${tipoCodigo}: ${error.message}`)
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

  async function crearCoeficienteSet(tenantId: string, filas: { inmuebleId: string; valor: number }[]): Promise<void> {
    const sumaTotal = filas.reduce((acc, f) => acc + f.valor, 0)
    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .insert({ tenant_id: tenantId, version: 1, vigente_desde: '2020-01-01', estado: 'borrador', suma_total: sumaTotal })
      .select('id').single<{ id: string }>()
    if (errSet) throw new Error(`fixture coeficiente_sets: ${errSet.message}`)
    const { error: errCoef } = await admin.from('coeficientes').insert(
      filas.map((f) => ({ tenant_id: tenantId, set_id: set.id, inmueble_id: f.inmuebleId, valor: f.valor })),
    )
    if (errCoef) throw new Error(`fixture coeficientes: ${errCoef.message}`)
    await admin.from('coeficiente_sets').update({ estado: 'vigente' }).eq('id', set.id)
  }

  async function crearAgendaPunto(tenantId: string, reunionId: string, orden: number, titulo: string): Promise<void> {
    const { error } = await admin.from('gobierno_agenda_puntos').insert({ tenant_id: tenantId, reunion_id: reunionId, orden, titulo })
    if (error) throw new Error(`fixture agenda: ${error.message}`)
  }

  async function crearAsistencia(
    tenantId: string, reunionId: string, inmuebleId: string, asistenteRef: string, calidad: 'propietario' | 'organo' = 'organo',
  ): Promise<string> {
    const { data, error } = await admin
      .from('gobierno_asistencia')
      .insert({ tenant_id: tenantId, reunion_id: reunionId, inmueble_id: inmuebleId, asistente_ref: asistenteRef, calidad })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture asistencia: ${error.message}`)
    return data.id
  }

  async function instalar(cliente: Cliente, reunionId: string, presidenteMiembroId: string, secretarioMiembroId: string): Promise<void> {
    const { error } = await cliente
      .from('gobierno_reuniones')
      .update({ estado: 'instalada', presidente_miembro_id: presidenteMiembroId, secretario_miembro_id: secretarioMiembroId })
      .eq('id', reunionId)
    if (error) throw new Error(`fixture instalar: ${error.message}`)
  }

  async function cerrarReunion(cliente: Cliente, reunionId: string): Promise<void> {
    const { error } = await cliente.from('gobierno_reuniones').update({ estado: 'cerrada' }).eq('id', reunionId)
    if (error) throw new Error(`fixture cerrar: ${error.message}`)
  }

  async function crearReunion(tenantId: string, organoId: string, fechaHora = '2026-06-01T15:00:00Z'): Promise<string> {
    const tipoId = await idListaTipos('TIPO_REUNION', 'asamblea_ordinaria')
    const { data, error } = await admin
      .from('gobierno_reuniones')
      .insert({
        tenant_id: tenantId, organo_id: organoId, tipo_id: tipoId, modalidad: 'presencial',
        convocatoria_regimen: 'primera', fecha_hora: fechaHora, lugar: 'Salón comunal',
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture reunion: ${error.message}`)
    return data.id
  }

  async function prepararTenant(etiqueta: string) {
    const { tenantId, cliente, usuarioId } = await crearTenantCompleto(etiqueta)
    const inmA = await crearInmueble(tenantId, `GOB7-${etiqueta}-A-${RUN_ID}`)
    const inmB = await crearInmueble(tenantId, `GOB7-${etiqueta}-B-${RUN_ID}`)
    await crearCoeficienteSet(tenantId, [{ inmuebleId: inmA, valor: 0.6 }, { inmuebleId: inmB, valor: 0.4 }])
    const propA = await crearTercero(tenantId, 'PropA', etiqueta)
    const propB = await crearTercero(tenantId, 'PropB', etiqueta)
    await vincularRol(tenantId, inmA, propA, 'copropietario', '2020-01-01', 100)
    await vincularRol(tenantId, inmB, propB, 'copropietario', '2020-01-01', 100)
    return { tenantId, cliente, usuarioId, inmA, inmB, propA, propB }
  }

  async function instalarOrgano(t: Awaited<ReturnType<typeof prepararTenant>>, tipoCodigo: string, etiqueta: string) {
    const organoId = await crearOrgano(t.tenantId, tipoCodigo)
    const pTercero = await crearTercero(t.tenantId, 'Presidente', etiqueta)
    const sTercero = await crearTercero(t.tenantId, 'Secretario', etiqueta)
    const presidenteMiembroId = await crearMiembro(t.tenantId, organoId, pTercero, 'presidente')
    const secretarioMiembroId = await crearMiembro(t.tenantId, organoId, sTercero, 'secretario')
    const reunionId = await crearReunion(t.tenantId, organoId)
    await crearAgendaPunto(t.tenantId, reunionId, 1, 'Punto')
    // consejo_administracion cuenta miembros presentes (calidad='organo'), no coeficientes de
    // propietario (GOB-3: gobierno_quorum() ramifica por tipo de órgano).
    const asistA = await crearAsistencia(t.tenantId, reunionId, t.inmA, pTercero, 'organo')
    const asistB = await crearAsistencia(t.tenantId, reunionId, t.inmB, sTercero, 'organo')
    await instalar(t.cliente, reunionId, presidenteMiembroId, secretarioMiembroId)
    return { organoId, reunionId, asistA, asistB }
  }

  async function votacionAprobada(
    t: Awaited<ReturnType<typeof prepararTenant>>, o: Awaited<ReturnType<typeof instalarOrgano>>, pregunta: string,
  ): Promise<string> {
    const materiaId = await idMateria('ordinaria')
    const { data: votacion, error: errVot } = await admin
      .from('gobierno_votaciones')
      .insert({ tenant_id: t.tenantId, reunion_id: o.reunionId, materia_id: materiaId, pregunta })
      .select('id').single<{ id: string }>()
    if (errVot) throw new Error(`fixture votacion: ${errVot.message}`)
    await admin.from('gobierno_votos').insert({ tenant_id: t.tenantId, votacion_id: votacion.id, asistencia_id: o.asistA, sentido: 'favor', coeficiente: 0 })
    await admin.from('gobierno_votos').insert({ tenant_id: t.tenantId, votacion_id: votacion.id, asistencia_id: o.asistB, sentido: 'contra', coeficiente: 0 })
    const { data: cerrada, error } = await admin
      .from('gobierno_votaciones').update({ estado: 'cerrada' }).eq('id', votacion.id).select('resultado').single<{ resultado: string }>()
    if (error) throw new Error(`fixture cerrar votacion: ${error.message}`)
    if (cerrada.resultado !== 'aprobada') throw new Error(`fixture votacion: resultado inesperado ${cerrada.resultado}`)
    return votacion.id
  }

  function crearDecision(votacionId: string, titulo: string) {
    return admin.rpc('gobierno_crear_decision', { p_votacion_id: votacionId, p_titulo: titulo }).single<DecisionRow>()
  }

  async function otorgarAtribucion(tenantId: string, organoId: string, codigo: string): Promise<void> {
    const atribucionId = await idListaTipos('ATRIBUCION_ORGANO', codigo)
    const { error } = await admin.from('gobierno_atribucion').insert({
      tenant_id: tenantId, organo_id: organoId, atribucion_id: atribucionId, origen: 'reglamento',
      reglamento_referencia: 'Art. 45 del reglamento interno', vigente_desde: '2020-01-01',
    })
    if (error) throw new Error(`fixture atribucion ${codigo}: ${error.message}`)
  }

  async function crearInfraccion(tenantId: string, clasesPermitidas: string[]): Promise<string> {
    const { data, error } = await admin
      .from('gobierno_infracciones')
      .insert({
        tenant_id: tenantId, codigo: `INF-${RUN_ID}-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`,
        nombre: 'Ruido excesivo en horario nocturno', reglamento_referencia: 'Art. 12 del reglamento de convivencia',
        clases_sancion_permitidas: clasesPermitidas, es_no_pecuniaria: true,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture infraccion: ${error.message}`)
    return data.id
  }

  function reportarExpediente(params: {
    infraccionId: string; inmuebleId: string; presuntoInfractorRef: string
    descripcionHechos: string; fechaHechos: string
  }) {
    return admin.rpc('gobierno_reportar_expediente', {
      p_infraccion_id: params.infraccionId, p_inmueble_id: params.inmuebleId,
      p_presunto_infractor_ref: params.presuntoInfractorRef, p_calidad: 'propietario',
      p_descripcion_hechos: params.descripcionHechos, p_fecha_hechos: params.fechaHechos,
    }).single<ExpedienteRow>()
  }

  function registrarActuacionExpediente(
    expedienteId: string, etapa: 'requerimiento_escrito' | 'descargos', descripcion: string,
  ) {
    return admin.rpc('gobierno_registrar_actuacion', {
      p_expediente_id: expedienteId, p_etapa: etapa, p_fecha: '2026-06-05', p_descripcion: descripcion,
    }).single<{ id: string }>()
  }

  async function llevarADescargos(expedienteId: string): Promise<void> {
    const { error: e1 } = await registrarActuacionExpediente(expedienteId, 'requerimiento_escrito', 'Requerimiento escrito enviado')
    if (e1) throw new Error(`fixture requerimiento: ${e1.message}`)
    const { error: e2 } = await registrarActuacionExpediente(expedienteId, 'descargos', 'Se otorgaron 5 días para descargos')
    if (e2) throw new Error(`fixture descargos: ${e2.message}`)
  }

  function imponerSancion(params: { expedienteId: string; decisionId: string; monto: number; actorId?: string }) {
    return admin.rpc('gobierno_imponer_sancion', {
      p_expediente_id: params.expedienteId, p_clase_sancion_codigo: 'multa', p_decision_id: params.decisionId,
      p_monto: params.monto,
      ...(params.actorId !== undefined && { p_actor_id: params.actorId }),
    }).single<SancionRow>()
  }

  async function crearConcepto(tenantId: string): Promise<string> {
    const sello = `${RUN_ID}-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await admin
      .from('conceptos')
      .insert({
        tenant_id: tenantId, codigo: `CONC-${sello}`, nombre: 'Cuota de administración',
        modo_calculo: 'directo', modo_valor: 'formulado', alcance: 'todos', estado: 'activo',
        tipo_recurrencia: 'novedad',
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture concepto: ${error.message}`)
    return data.id
  }

  async function crearPeriodo(tenantId: string, anio: number, mes: number): Promise<void> {
    const { error } = await admin.from('periodos').insert({ tenant_id: tenantId, anio, mes })
    if (error && !error.message.includes('duplicate')) throw new Error(`fixture periodo: ${error.message}`)
  }

  async function crearExpensaMensual(tenantId: string, inmuebleId: string, conceptoId: string, actorId: string, monto: number, fecha: string): Promise<void> {
    const { data: novedad, error } = await admin
      .from('novedades')
      .insert({ tenant_id: tenantId, inmueble_id: inmuebleId, concepto_id: conceptoId, tipo: 'CHARGE', monto, descripcion: 'Cuota ordinaria', fecha_efectiva: fecha, created_by: actorId })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture novedad expensa: ${error.message}`)
    const { error: errAprobar } = await admin.rpc('fn_aprobar_novedad', { p_novedad_id: novedad.id, p_actor_id: actorId })
    if (errAprobar) throw new Error(`fixture aprobar novedad expensa: ${errAprobar.message}`)
  }

  async function configurarExpensaNecesaria(tenantId: string, conceptoId: string): Promise<void> {
    const { error } = await admin.from('gobierno_config_expensa_necesaria').insert({ tenant_id: tenantId, concepto_id: conceptoId })
    if (error) throw new Error(`fixture config expensa: ${error.message}`)
  }

  async function crearCompromiso(tenantId: string, decisionId: string, orden: number, titulo: string): Promise<string> {
    const { data, error } = await admin
      .from('gobierno_compromisos')
      .insert({ tenant_id: tenantId, decision_id: decisionId, orden, titulo })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture compromiso: ${error.message}`)
    return data.id
  }

  /** Escenario mínimo para impugnar una DECISIÓN: tenant + un órgano + votación aprobada + decisión vigente. */
  async function escenarioDecision(etiqueta: string) {
    const t = await prepararTenant(etiqueta)
    const o = await instalarOrgano(t, 'consejo_administracion', etiqueta)
    const votacionId = await votacionAprobada(t, o, `¿Decisión ${etiqueta}?`)
    await cerrarReunion(t.cliente, o.reunionId)
    const { data: decision, error } = await crearDecision(votacionId, `Decisión ${etiqueta}`)
    if (error) throw new Error(`fixture decision ${etiqueta}: ${error.message}`)
    return { ...t, ...o, decisionId: decision.id }
  }

  /** Escenario completo para impugnar una SANCIÓN de multa: expediente con sanción ya impuesta. */
  async function escenarioSancion(etiqueta: string) {
    const t = await prepararTenant(etiqueta)
    const o = await instalarOrgano(t, 'consejo_administracion', etiqueta)
    await otorgarAtribucion(t.tenantId, o.organoId, 'imponer_sanciones')
    const conceptoId = await crearConcepto(t.tenantId)
    await crearPeriodo(t.tenantId, ANIO_HOY, MES_HOY)
    await crearExpensaMensual(t.tenantId, t.inmA, conceptoId, t.usuarioId, 100, FECHA_HOY)
    await configurarExpensaNecesaria(t.tenantId, conceptoId)
    const infraccionId = await crearInfraccion(t.tenantId, ['multa'])
    const votacionId = await votacionAprobada(t, o, `¿Sancionar ${etiqueta}?`)
    await cerrarReunion(t.cliente, o.reunionId)
    const { data: decision, error } = await crearDecision(votacionId, `Sanción ${etiqueta}`)
    if (error) throw new Error(`fixture decision sancion ${etiqueta}: ${error.message}`)
    const { data: expediente, error: errExp } = await reportarExpediente({
      infraccionId, inmuebleId: t.inmA, presuntoInfractorRef: t.propA,
      descripcionHechos: `Hechos ${etiqueta}`, fechaHechos: '2026-06-02',
    })
    if (errExp) throw new Error(`fixture expediente sancion ${etiqueta}: ${errExp.message}`)
    await llevarADescargos(expediente.id)
    const { data: sancion, error: errSanc } = await imponerSancion({
      expedienteId: expediente.id, decisionId: decision.id, monto: 50, actorId: t.usuarioId,
    })
    if (errSanc) throw new Error(`fixture sancion ${etiqueta}: ${errSanc.message}`)
    return { ...t, ...o, expedienteId: expediente.id, sancion }
  }

  async function fundamentoImpugnacion(articulo: 'art49' | 'art62'): Promise<number> {
    const referencia = articulo === 'art49' ? 'ley675_2001_art49_gob7' : 'ley675_2001_art62_gob7'
    const { data, error } = await admin
      .from('fundamento_normativo').select('id').eq('referencia', referencia).is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture fundamento ${referencia}: ${error.message}`)
    return data.id
  }

  async function configurarParametro(
    tenantId: string, objetoTipo: 'decision' | 'sancion', plazoDias: number, conFundamento = true,
  ): Promise<void> {
    const fundamentoId = conFundamento ? await fundamentoImpugnacion(objetoTipo === 'decision' ? 'art49' : 'art62') : null
    const { error } = await admin.from('gobierno_parametro_impugnacion').insert({
      tenant_id: tenantId, objeto_tipo: objetoTipo, plazo_dias: plazoDias, fundamento_normativo_id: fundamentoId,
    })
    if (error) throw new Error(`fixture parametro impugnacion: ${error.message}`)
  }

  function presentarImpugnacion(params: {
    objetoTipo: 'decision' | 'sancion'; decisionId?: string; expedienteId?: string; impugnanteRef: string
    fechaNotificacion: string; fechaPresentacion: string; causal: string
    suspendeEfectos?: boolean; suspensionFundamento?: string; actorId?: string
  }) {
    return admin.rpc('gobierno_presentar_impugnacion', {
      p_objeto_tipo: params.objetoTipo, p_impugnante_ref: params.impugnanteRef,
      p_fecha_notificacion_objeto: params.fechaNotificacion, p_fecha_presentacion: params.fechaPresentacion,
      p_causal: params.causal,
      ...(params.decisionId !== undefined && { p_decision_id: params.decisionId }),
      ...(params.expedienteId !== undefined && { p_expediente_id: params.expedienteId }),
      ...(params.suspendeEfectos !== undefined && { p_suspende_efectos: params.suspendeEfectos }),
      ...(params.suspensionFundamento !== undefined && { p_suspension_fundamento: params.suspensionFundamento }),
      ...(params.actorId !== undefined && { p_actor_id: params.actorId }),
    }).single<ImpugnacionRow>()
  }

  function registrarActuacionImpugnacion(params: {
    impugnacionId: string; estado: 'en_tramite' | 'desistida'; fecha: string; descripcion: string
  }) {
    return admin.rpc('gobierno_registrar_actuacion_impugnacion', {
      p_impugnacion_id: params.impugnacionId, p_estado: params.estado, p_fecha: params.fecha, p_descripcion: params.descripcion,
    }).single<{ id: string }>()
  }

  function resolverImpugnacion(params: {
    impugnacionId: string; resultado: 'confirmada' | 'revocada' | 'modificada' | 'inadmitida'
    descripcion: string; detalle?: string; actorId?: string
  }) {
    return admin.rpc('gobierno_resolver_impugnacion', {
      p_impugnacion_id: params.impugnacionId, p_resultado: params.resultado, p_descripcion: params.descripcion,
      ...(params.detalle !== undefined && { p_detalle: params.detalle }),
      ...(params.actorId !== undefined && { p_actor_id: params.actorId }),
    }).single<ImpugnacionRow>()
  }

  it('1. una impugnación sin decisión ni expediente viola el check gobierno_impugnaciones_objeto_check', async () => {
    const t = await crearTenantCompleto('t1')
    const impugnante = await crearTercero(t.tenantId, 'Impugnante', 't1')
    const { error } = await admin.from('gobierno_impugnaciones').insert({
      tenant_id: t.tenantId, numero: 1, anio: 2026, objeto_tipo: 'decision',
      decision_id: null, expediente_id: null, impugnante_ref: impugnante,
      fecha_notificacion_objeto: '2026-01-01', fecha_presentacion: '2026-01-01',
      plazo_limite: '2026-01-15', presentada_en_plazo: true, causal: 'motivo de prueba',
    })
    expect(error?.message).toContain('gobierno_impugnaciones_objeto_check')
  }, 30_000)

  it('2. presentar una impugnación deja la decisión en estado impugnada', async () => {
    const e = await escenarioDecision('t2')
    await configurarParametro(e.tenantId, 'decision', 30)
    const { data: impugnacion, error } = await presentarImpugnacion({
      objetoTipo: 'decision', decisionId: e.decisionId, impugnanteRef: e.propA,
      fechaNotificacion: FECHA_HOY, fechaPresentacion: FECHA_HOY, causal: 'Violación del quórum',
      actorId: e.usuarioId,
    })
    expect(error).toBeNull()
    expect(impugnacion!.estado).toBe('presentada')

    const { data: decision } = await admin.from('gobierno_decisiones').select('estado').eq('id', e.decisionId).single<{ estado: string }>()
    expect(decision!.estado).toBe('impugnada')
  }, 30_000)

  it('3. suspende_efectos=true sin justificar falla con IMPUGNACION_SUSPENSION_SIN_FUNDAMENTO', async () => {
    const e = await escenarioDecision('t3')
    await configurarParametro(e.tenantId, 'decision', 30)
    const { error } = await presentarImpugnacion({
      objetoTipo: 'decision', decisionId: e.decisionId, impugnanteRef: e.propA,
      fechaNotificacion: FECHA_HOY, fechaPresentacion: FECHA_HOY, causal: 'Motivo',
      suspendeEfectos: true, actorId: e.usuarioId,
    })
    expect(error?.message).toContain('IMPUGNACION_SUSPENSION_SIN_FUNDAMENTO')
  }, 30_000)

  it('4. por defecto la impugnación NO suspende los efectos — un compromiso de la decisión sigue pendiente', async () => {
    const e = await escenarioDecision('t4')
    const compromisoId = await crearCompromiso(e.tenantId, e.decisionId, 1, 'Compromiso vivo')
    await configurarParametro(e.tenantId, 'decision', 30)

    const { data: impugnacion, error } = await presentarImpugnacion({
      objetoTipo: 'decision', decisionId: e.decisionId, impugnanteRef: e.propA,
      fechaNotificacion: FECHA_HOY, fechaPresentacion: FECHA_HOY, causal: 'Motivo', actorId: e.usuarioId,
    })
    expect(error).toBeNull()
    expect(impugnacion!.suspende_efectos).toBe(false)

    const { data: compromiso } = await admin.from('gobierno_compromisos').select('estado').eq('id', compromisoId).single<{ estado: string }>()
    expect(compromiso!.estado).toBe('pendiente')
  }, 30_000)

  it('5. resolución revocada sobre una sanción con multa genera la reversión del cargo, y el cargo original sigue existiendo', async () => {
    const e = await escenarioSancion('t5')
    await configurarParametro(e.tenantId, 'sancion', 60)
    const { data: impugnacion, error } = await presentarImpugnacion({
      objetoTipo: 'sancion', expedienteId: e.expedienteId, impugnanteRef: e.propA,
      fechaNotificacion: FECHA_HOY, fechaPresentacion: FECHA_HOY, causal: 'Sanción desproporcionada',
      actorId: e.usuarioId,
    })
    expect(error).toBeNull()

    const { error: errResolver } = await resolverImpugnacion({
      impugnacionId: impugnacion!.id, resultado: 'revocada', descripcion: 'El juez revoca la sanción',
      actorId: e.usuarioId,
    })
    expect(errResolver).toBeNull()

    // El cargo original (enlazado a la novedad de la multa) sigue existiendo, sin tocar.
    const { data: cargoOriginal } = await admin
      .from('cargos').select('monto_original').eq('novedad_id', e.sancion.novedad_id!).single<{ monto_original: number }>()
    expect(cargoOriginal!.monto_original).toBe(50)

    // Existe un cargo de reversión (negativo, mismo inmueble) — nunca se borra el original.
    const { data: cargoReversion } = await admin
      .from('cargos').select('monto_original').eq('inmueble_id', e.inmA).eq('monto_original', -50)
    expect(cargoReversion).toHaveLength(1)

    const { data: expediente } = await admin.from('gobierno_expedientes_convivencia').select('etapa').eq('id', e.expedienteId).single<{ etapa: string }>()
    expect(expediente!.etapa).toBe('firme')
  }, 30_000)

  it('6. resolución confirmada devuelve la decisión a vigente', async () => {
    const e = await escenarioDecision('t6')
    await configurarParametro(e.tenantId, 'decision', 30)
    const { data: impugnacion } = await presentarImpugnacion({
      objetoTipo: 'decision', decisionId: e.decisionId, impugnanteRef: e.propA,
      fechaNotificacion: FECHA_HOY, fechaPresentacion: FECHA_HOY, causal: 'Motivo', actorId: e.usuarioId,
    })

    const { error } = await resolverImpugnacion({
      impugnacionId: impugnacion!.id, resultado: 'confirmada', descripcion: 'El órgano confirma la decisión',
      actorId: e.usuarioId,
    })
    expect(error).toBeNull()

    const { data: decision } = await admin.from('gobierno_decisiones').select('estado').eq('id', e.decisionId).single<{ estado: string }>()
    expect(decision!.estado).toBe('vigente')
  }, 30_000)

  it('7. el plazo se calcula en días hábiles y coincide con gobierno_sumar_dias_habiles (GOB-4) sobre un caso con festivos', async () => {
    const e = await escenarioDecision('t7')
    await configurarParametro(e.tenantId, 'decision', 20)

    // Mismo caso ya verificado independientemente en acta.test.ts: 2026-03-16 + 20 días hábiles
    // cruza San José (19 mar, trasladado a lunes 23) y Semana Santa (jueves/viernes santo,
    // 2-3 abr) → 2026-04-16.
    const { data: impugnacion, error } = await presentarImpugnacion({
      objetoTipo: 'decision', decisionId: e.decisionId, impugnanteRef: e.propA,
      fechaNotificacion: '2026-03-16', fechaPresentacion: '2026-03-16', causal: 'Motivo', actorId: e.usuarioId,
    })
    expect(error).toBeNull()

    const { data: plazoEsperado } = await admin.rpc('gobierno_sumar_dias_habiles', { p_fecha: '2026-03-16', p_dias: 20 })
    expect(impugnacion!.plazo_limite).toBe(plazoEsperado as unknown as string)
    expect(impugnacion!.plazo_limite).toBe('2026-04-16')
  }, 30_000)

  it('8. sin fundamento_normativo_id en el parámetro de plazo, el sistema calcula, advierte y no bloquea', async () => {
    const e = await escenarioDecision('t8')
    await configurarParametro(e.tenantId, 'decision', 30, false)

    const { data: impugnacion, error } = await presentarImpugnacion({
      objetoTipo: 'decision', decisionId: e.decisionId, impugnanteRef: e.propA,
      fechaNotificacion: FECHA_HOY, fechaPresentacion: FECHA_HOY, causal: 'Motivo', actorId: e.usuarioId,
    })
    expect(error).toBeNull()
    expect(impugnacion!.plazo_fundamento_valido).toBe(false)
    expect(impugnacion!.plazo_limite).not.toBeNull()
  }, 30_000)

  it('9. una impugnación presentada fuera de plazo se registra igual, con presentada_en_plazo=false', async () => {
    const e = await escenarioDecision('t9')
    await configurarParametro(e.tenantId, 'decision', 5)

    const { data: impugnacion, error } = await presentarImpugnacion({
      objetoTipo: 'decision', decisionId: e.decisionId, impugnanteRef: e.propA,
      fechaNotificacion: '2020-01-01', fechaPresentacion: FECHA_HOY, causal: 'Motivo tardío', actorId: e.usuarioId,
    })
    expect(error).toBeNull()
    expect(impugnacion!.presentada_en_plazo).toBe(false)
  }, 30_000)

  it('10. las actuaciones de la impugnación son append-only', async () => {
    const e = await escenarioDecision('t10')
    await configurarParametro(e.tenantId, 'decision', 30)
    const { data: impugnacion } = await presentarImpugnacion({
      objetoTipo: 'decision', decisionId: e.decisionId, impugnanteRef: e.propA,
      fechaNotificacion: FECHA_HOY, fechaPresentacion: FECHA_HOY, causal: 'Motivo', actorId: e.usuarioId,
    })
    const { data: actuacion, error: errActuacion } = await registrarActuacionImpugnacion({
      impugnacionId: impugnacion!.id, estado: 'en_tramite', fecha: FECHA_HOY, descripcion: 'Turnada al juez civil',
    })
    expect(errActuacion).toBeNull()

    const { error } = await admin.from('gobierno_impugnacion_actuaciones').update({ descripcion: 'editado' }).eq('id', actuacion!.id)
    expect(error?.message).toContain('APPEND_ONLY')
  }, 30_000)

  it('11. consecutivo de impugnaciones sin huecos', async () => {
    const t = await prepararTenant('t11')
    const o = await instalarOrgano(t, 'consejo_administracion', 't11')
    await configurarParametro(t.tenantId, 'decision', 30)
    const numeros: number[] = []
    for (let n = 0; n < 3; n++) {
      const votacionId = await votacionAprobada(t, o, `¿Decisión ${String(n)}?`)
      const { data: decision } = await crearDecision(votacionId, `Decisión ${String(n)}`)
      const { data: impugnacion, error } = await presentarImpugnacion({
        objetoTipo: 'decision', decisionId: decision!.id, impugnanteRef: t.propA,
        fechaNotificacion: FECHA_HOY, fechaPresentacion: FECHA_HOY, causal: `Motivo ${String(n)}`, actorId: t.usuarioId,
      })
      if (error) throw new Error(`impugnacion ${String(n)}: ${error.message}`)
      numeros.push(impugnacion.numero)
    }
    expect(numeros).toEqual([1, 2, 3])
  }, 60_000)

  it('12. aislamiento entre tenants', async () => {
    const e = await escenarioDecision('t12a')
    const b = await crearTenantCompleto('t12b')
    await configurarParametro(e.tenantId, 'decision', 30)
    const { data: impugnacion } = await presentarImpugnacion({
      objetoTipo: 'decision', decisionId: e.decisionId, impugnanteRef: e.propA,
      fechaNotificacion: FECHA_HOY, fechaPresentacion: FECHA_HOY, causal: 'Motivo', actorId: e.usuarioId,
    })

    const { data: vistaDesdeB } = await b.cliente.from('gobierno_impugnaciones').select('id').eq('id', impugnacion!.id)
    expect(vistaDesdeB).toHaveLength(0)
  }, 30_000)
})
