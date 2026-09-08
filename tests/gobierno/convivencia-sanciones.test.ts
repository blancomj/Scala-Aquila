/**
 * GOB-6 (20260931710000-20260931770000) — convivencia y régimen sancionatorio, Ley 675
 * arts. 58-60. Ver Casos de uso/Tres Modulos/Gobierno/GOB_06_convivencia_sanciones.md.
 *
 * "Es el único corte de toda la serie donde un error del software produce una violación de
 * derechos fundamentales" (marco §2) — los 5 guards de las pruebas 1-5 son el corte.
 *
 * Decisiones confirmadas en el Plan del corte:
 *  - Imponer una sanción (gobierno_imponer_sancion) exige rol administrador — el acto de mayor
 *    peso de toda la serie GOB, no una formalización (a diferencia de crear una decisión en
 *    GOB-5, que solo exige auxiliar).
 *  - Registrar actuaciones del expediente (requerimiento, descargos, conciliación) exige solo
 *    auxiliar — administrador ⊇ auxiliar, ambos roles pueden hacerlo.
 *
 * La multa se materializa vía `novedades` (TIPO_NOVEDAD.sancion, ya sembrado) + fn_aprobar_
 * novedad — cero mecanismo de cobro paralelo. Toda sanción enlaza a la decision_id de GOB-5 que
 * la autorizó; el órgano competente se lee de esa decisión (gobierno_organo_competente, GOB-1).
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
  console.warn('SALTADO tests/gobierno/convivencia-sanciones: faltan variables de Supabase en .env')
}

interface ExpedienteRow {
  id: string
  numero: number
  anio: number
  etapa: string
  propietario_responsable_ref: string | null
}
interface SancionRow {
  id: string
  clase_sancion_id: number
  monto: number | null
  novedad_id: string | null
  zona_comun_id: string | null
}
interface DecisionRow { id: string; organo_id: string }

d('GOB-6: convivencia y régimen sancionatorio', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  // fn_gobierno_expensa_necesaria_mensual() resuelve el periodo con current_date (fecha real del
  // servidor), no con una fecha fija del test — el periodo/novedad de la expensa ordinaria debe
  // caer en el mes real de hoy, o SANCION_PERIODO_INEXISTENTE.
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

  async function crearMiembro(
    tenantId: string, organoId: string, terceroId: string, rolCodigo: string, hasta: string | null = null,
  ): Promise<string> {
    const rolId = await idListaTipos('ROL_CONCEJO_COPROPIEDAD', rolCodigo)
    const { data, error } = await admin
      .from('gobierno_miembros')
      .insert({ tenant_id: tenantId, organo_id: organoId, tercero_id: terceroId, rol_id: rolId, desde: '2020-01-01', hasta })
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
    tenantId: string, reunionId: string, inmuebleId: string, asistenteRef: string, calidad: 'propietario' | 'organo' = 'propietario',
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

  /** Un tenant con 2 inmuebles/propietarios y una escalera de votación reutilizable — la misma
   * base que GOB-5, con la posibilidad de instalar VARIOS órganos (asamblea, consejo, comité). */
  async function prepararTenant(etiqueta: string) {
    const { tenantId, cliente, usuarioId } = await crearTenantCompleto(etiqueta)
    const inmA = await crearInmueble(tenantId, `GOB6-${etiqueta}-A-${RUN_ID}`)
    const inmB = await crearInmueble(tenantId, `GOB6-${etiqueta}-B-${RUN_ID}`)
    await crearCoeficienteSet(tenantId, [{ inmuebleId: inmA, valor: 0.6 }, { inmuebleId: inmB, valor: 0.4 }])
    const propA = await crearTercero(tenantId, 'PropA', etiqueta)
    const propB = await crearTercero(tenantId, 'PropB', etiqueta)
    await vincularRol(tenantId, inmA, propA, 'copropietario', '2020-01-01', 100)
    await vincularRol(tenantId, inmB, propB, 'copropietario', '2020-01-01', 100)
    return { tenantId, cliente, usuarioId, inmA, inmB, propA, propB }
  }

  /** Instala un órgano (con su propia reunión ya instalada) donde se pueden abrir varias
   * votaciones sucesivas — cerrar la reunión al final con cerrarReunion(). */
  async function instalarOrgano(t: Awaited<ReturnType<typeof prepararTenant>>, tipoCodigo: string, etiqueta: string) {
    const organoId = await crearOrgano(t.tenantId, tipoCodigo)
    const pTercero = await crearTercero(t.tenantId, 'Presidente', etiqueta)
    const sTercero = await crearTercero(t.tenantId, 'Secretario', etiqueta)
    // Art. 58 par. 1: el comité de convivencia exige un período de exactamente UN año (hasta
    // obligatorio) — los demás órganos pueden quedar vigentes indefinidamente.
    const hastaMiembro = tipoCodigo === 'comite_convivencia' ? '2020-12-31' : null
    const presidenteMiembroId = await crearMiembro(t.tenantId, organoId, pTercero, 'presidente', hastaMiembro)
    const secretarioMiembroId = await crearMiembro(t.tenantId, organoId, sTercero, 'secretario', hastaMiembro)
    const reunionId = await crearReunion(t.tenantId, organoId)
    await crearAgendaPunto(t.tenantId, reunionId, 1, 'Sanciones')
    // gobierno_quorum() ramifica por tipo de órgano (GOB-3): consejo_administracion cuenta
    // miembros presentes (calidad='organo'), sin coeficientes — el resto cuenta coeficientes de
    // asistencia propietario/apoderado. Los dos asistentes deben calzar con esa rama.
    const asistA = tipoCodigo === 'consejo_administracion'
      ? await crearAsistencia(t.tenantId, reunionId, t.inmA, pTercero, 'organo')
      : await crearAsistencia(t.tenantId, reunionId, t.inmA, t.propA)
    const asistB = tipoCodigo === 'consejo_administracion'
      ? await crearAsistencia(t.tenantId, reunionId, t.inmB, sTercero, 'organo')
      : await crearAsistencia(t.tenantId, reunionId, t.inmB, t.propB)
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

  async function crearInfraccion(
    tenantId: string, clasesPermitidas: string[], opts: { codigo?: string } = {},
  ): Promise<string> {
    const { data, error } = await admin
      .from('gobierno_infracciones')
      .insert({
        tenant_id: tenantId, codigo: opts.codigo ?? `INF-${RUN_ID}-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`,
        nombre: 'Ruido excesivo en horario nocturno', reglamento_referencia: 'Art. 12 del reglamento de convivencia',
        clases_sancion_permitidas: clasesPermitidas, es_no_pecuniaria: true,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture infraccion: ${error.message}`)
    return data.id
  }

  function reportarExpediente(params: {
    infraccionId: string; inmuebleId: string; presuntoInfractorRef: string
    calidad: 'propietario' | 'tenedor' | 'tercero'; descripcionHechos: string; fechaHechos: string
  }) {
    return admin.rpc('gobierno_reportar_expediente', {
      p_infraccion_id: params.infraccionId, p_inmueble_id: params.inmuebleId,
      p_presunto_infractor_ref: params.presuntoInfractorRef, p_calidad: params.calidad,
      p_descripcion_hechos: params.descripcionHechos, p_fecha_hechos: params.fechaHechos,
    }).single<ExpedienteRow>()
  }

  function registrarActuacion(
    expedienteId: string, etapa: 'conciliacion_comite' | 'requerimiento_escrito' | 'descargos', descripcion: string,
  ) {
    return admin.rpc('gobierno_registrar_actuacion', {
      p_expediente_id: expedienteId, p_etapa: etapa, p_fecha: '2026-06-05', p_descripcion: descripcion,
    }).single<{ id: string }>()
  }

  async function llevarADescargos(expedienteId: string): Promise<void> {
    const { error: e1 } = await registrarActuacion(expedienteId, 'requerimiento_escrito', 'Requerimiento escrito enviado, 5 días para responder')
    if (e1) throw new Error(`fixture requerimiento: ${e1.message}`)
    const { error: e2 } = await registrarActuacion(expedienteId, 'descargos', 'Se notificó y se otorgaron 5 días para descargos')
    if (e2) throw new Error(`fixture descargos: ${e2.message}`)
  }

  function imponerSancion(params: {
    expedienteId: string; clase: string; decisionId: string
    monto?: number; zonaComunId?: string; actorId?: string
  }) {
    return admin.rpc('gobierno_imponer_sancion', {
      p_expediente_id: params.expedienteId, p_clase_sancion_codigo: params.clase, p_decision_id: params.decisionId,
      ...(params.monto !== undefined && { p_monto: params.monto }),
      ...(params.zonaComunId !== undefined && { p_zona_comun_id: params.zonaComunId }),
      ...(params.actorId !== undefined && { p_actor_id: params.actorId }),
    }).single<SancionRow>()
  }

  async function crearZonaComun(tenantId: string, esEsencial: boolean): Promise<string> {
    const sello = `${RUN_ID}-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`
    const tipoId = await idListaTipos('TIPO_ZONA_COMUN', 'recreativa')
    const { data, error } = await admin
      .from('zonas_comunes')
      .insert({ tenant_id: tenantId, codigo: `ZC-${sello}`, nombre: 'Salón comunal', tipo_id: tipoId, es_esencial: esEsencial })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture zona comun: ${error.message}`)
    return data.id
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

  /** Crea+aprueba una novedad para materializar el cargo que representa la expensa ordinaria del
   * mes — mismo mecanismo que usa la propia multa (AD-33), reutilizado aquí como fixture. */
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

  /** Escenario completo: tenant + consejo con atribución imponer_sanciones + expensa ordinaria de
   * 100 configurada (tope individual 200, tope acumulado 1000) + infracción que permite multa. */
  async function prepararEscenarioMulta(etiqueta: string) {
    const t = await prepararTenant(etiqueta)
    const o = await instalarOrgano(t, 'consejo_administracion', etiqueta)
    await otorgarAtribucion(t.tenantId, o.organoId, 'imponer_sanciones')
    const conceptoId = await crearConcepto(t.tenantId)
    await crearPeriodo(t.tenantId, ANIO_HOY, MES_HOY)
    await crearExpensaMensual(t.tenantId, t.inmA, conceptoId, t.usuarioId, 100, FECHA_HOY)
    await configurarExpensaNecesaria(t.tenantId, conceptoId)
    const infraccionId = await crearInfraccion(t.tenantId, ['multa'])
    return { ...t, ...o, infraccionId }
  }

  async function expedienteListoParaSancion(
    e: { tenantId: string; infraccionId: string; inmuebleId: string; infractorRef: string },
    etiqueta: string,
  ): Promise<string> {
    const { data: expediente, error } = await reportarExpediente({
      infraccionId: e.infraccionId, inmuebleId: e.inmuebleId, presuntoInfractorRef: e.infractorRef,
      calidad: 'propietario', descripcionHechos: `Hechos ${etiqueta}`, fechaHechos: '2026-06-02',
    })
    if (error) throw new Error(`fixture expediente ${etiqueta}: ${error.message}`)
    await llevarADescargos(expediente.id)
    return expediente.id
  }

  it('1. imponer sanción sin requerimiento escrito previo falla con SANCION_SIN_REQUERIMIENTO_PREVIO', async () => {
    const e = await prepararEscenarioMulta('t1')
    const votacionId = await votacionAprobada(e, e, '¿Sancionar?')
    await cerrarReunion(e.cliente, e.reunionId)
    const { data: decision } = await crearDecision(votacionId, 'Sancionar por ruido')

    const { data: expediente } = await reportarExpediente({
      infraccionId: e.infraccionId, inmuebleId: e.inmA, presuntoInfractorRef: e.propA,
      calidad: 'propietario', descripcionHechos: 'Ruido nocturno', fechaHechos: '2026-06-02',
    })

    const { error } = await imponerSancion({ expedienteId: expediente!.id, clase: 'multa', decisionId: decision!.id, monto: 50 })
    expect(error?.message).toContain('SANCION_SIN_REQUERIMIENTO_PREVIO')
  }, 30_000)

  it('2. imponer sanción sin etapa de descargos falla con SANCION_SIN_DEBIDO_PROCESO, aunque el infractor no respondiera', async () => {
    const e = await prepararEscenarioMulta('t2')
    const votacionId = await votacionAprobada(e, e, '¿Sancionar?')
    await cerrarReunion(e.cliente, e.reunionId)
    const { data: decision } = await crearDecision(votacionId, 'Sancionar por ruido')

    const { data: expediente } = await reportarExpediente({
      infraccionId: e.infraccionId, inmuebleId: e.inmA, presuntoInfractorRef: e.propA,
      calidad: 'propietario', descripcionHechos: 'Ruido nocturno', fechaHechos: '2026-06-02',
    })
    // Solo el requerimiento — nunca los descargos, ni siquiera constancia de "no respondió".
    await registrarActuacion(expediente!.id, 'requerimiento_escrito', 'Requerimiento enviado')

    const { error } = await imponerSancion({ expedienteId: expediente!.id, clase: 'multa', decisionId: decision!.id, monto: 50 })
    expect(error?.message).toContain('SANCION_SIN_DEBIDO_PROCESO')
  }, 30_000)

  it('3. el comité de convivencia intenta imponer una sanción → SANCION_ORGANO_INCOMPETENTE', async () => {
    const t = await prepararTenant('t3')
    const infraccionId = await crearInfraccion(t.tenantId, ['multa'])
    const comite = await instalarOrgano(t, 'comite_convivencia', 't3')
    const votacionId = await votacionAprobada(t, comite, '¿El comité puede sancionar?')
    await cerrarReunion(t.cliente, comite.reunionId)
    const { data: decision } = await crearDecision(votacionId, 'Intento de sanción del comité')

    const expedienteId = await expedienteListoParaSancion(
      { tenantId: t.tenantId, infraccionId, inmuebleId: t.inmA, infractorRef: t.propA }, 't3',
    )
    const { error } = await imponerSancion({ expedienteId, clase: 'multa', decisionId: decision!.id, monto: 10 })
    expect(error?.message).toContain('SANCION_ORGANO_INCOMPETENTE')
  }, 30_000)

  it('4. una multa de 2,5 veces las expensas del infractor falla con MULTA_EXCEDE_TOPE_INDIVIDUAL', async () => {
    const e = await prepararEscenarioMulta('t4')
    const votacionId = await votacionAprobada(e, e, '¿Multar 2.5x?')
    await cerrarReunion(e.cliente, e.reunionId)
    const { data: decision } = await crearDecision(votacionId, 'Multa 2.5x')
    const expedienteId = await expedienteListoParaSancion(
      { tenantId: e.tenantId, infraccionId: e.infraccionId, inmuebleId: e.inmA, infractorRef: e.propA }, 't4',
    )

    const { error } = await imponerSancion({ expedienteId, clase: 'multa', decisionId: decision!.id, monto: 250 })
    expect(error?.message).toContain('MULTA_EXCEDE_TOPE_INDIVIDUAL')
  }, 30_000)

  it('5. multas acumuladas que suman 10,5 veces fallan con MULTA_EXCEDE_TOPE_ACUMULADO aunque cada una sea individualmente válida', async () => {
    const e = await prepararEscenarioMulta('t5')
    // 5 multas de 200 (= 2x, tope individual exacto) sobre el MISMO infractor, en expedientes
    // distintos — cada una válida, acumulado llega exactamente a 1000 (10x, en el límite).
    for (let n = 0; n < 5; n++) {
      const votacionId = await votacionAprobada(e, e, `¿Multar ${String(n)}?`)
      const { data: decision } = await crearDecision(votacionId, `Multa ${String(n)}`)
      const expedienteId = await expedienteListoParaSancion(
        { tenantId: e.tenantId, infraccionId: e.infraccionId, inmuebleId: e.inmA, infractorRef: e.propA }, `t5-${String(n)}`,
      )
      const { error } = await imponerSancion({ expedienteId, clase: 'multa', decisionId: decision!.id, monto: 200, actorId: e.usuarioId })
      expect(error).toBeNull()
    }

    // Una sexta multa de solo 50 (muy por debajo del tope individual de 200) empuja el acumulado
    // a 1050 = 10.5x, por encima del tope acumulado de 1000 (10x).
    const votacionId = await votacionAprobada(e, e, '¿Multar la sexta vez?')
    await cerrarReunion(e.cliente, e.reunionId)
    const { data: decision } = await crearDecision(votacionId, 'Sexta multa')
    const expedienteId = await expedienteListoParaSancion(
      { tenantId: e.tenantId, infraccionId: e.infraccionId, inmuebleId: e.inmA, infractorRef: e.propA }, 't5-5',
    )
    const { error } = await imponerSancion({ expedienteId, clase: 'multa', decisionId: decision!.id, monto: 50 })
    expect(error?.message).toContain('MULTA_EXCEDE_TOPE_ACUMULADO')
  }, 60_000)

  it('6. crear una infracción sin reglamento_referencia falla con INFRACCION_SIN_TIPIFICACION', async () => {
    const { tenantId } = await crearTenantCompleto('t6')
    const { error } = await admin.from('gobierno_infracciones').insert({
      tenant_id: tenantId, codigo: 'sin-tipificar', nombre: 'Sin tipificar', reglamento_referencia: '   ',
    })
    expect(error?.message).toContain('INFRACCION_SIN_TIPIFICACION')
  }, 30_000)

  it('7. añadir una cuarta clase al catálogo global falla con SANCION_CLASE_NO_EXTENSIBLE', async () => {
    const { error } = await admin.from('gobierno_clase_sancion').insert({
      codigo: 'cuarta_clase', nombre: 'Cuarta clase inventada', descripcion: 'No autorizada', numeral_articulo: '59.4',
    })
    expect(error?.message).toContain('SANCION_CLASE_NO_EXTENSIBLE')
  }, 30_000)

  it('8. restringir un bien común marcado como esencial falla con SANCION_BIEN_COMUN_ESENCIAL', async () => {
    const t = await prepararTenant('t8')
    const o = await instalarOrgano(t, 'consejo_administracion', 't8')
    await otorgarAtribucion(t.tenantId, o.organoId, 'imponer_sanciones')
    const infraccionId = await crearInfraccion(t.tenantId, ['restriccion_uso'])
    const zonaEsencial = await crearZonaComun(t.tenantId, true)

    const votacionId = await votacionAprobada(t, o, '¿Restringir zona esencial?')
    await cerrarReunion(t.cliente, o.reunionId)
    const { data: decision } = await crearDecision(votacionId, 'Restricción sobre zona esencial')
    const expedienteId = await expedienteListoParaSancion(
      { tenantId: t.tenantId, infraccionId, inmuebleId: t.inmA, infractorRef: t.propA }, 't8',
    )

    const { error } = await imponerSancion({ expedienteId, clase: 'restriccion_uso', decisionId: decision!.id, zonaComunId: zonaEsencial })
    expect(error?.message).toContain('SANCION_BIEN_COMUN_ESENCIAL')
  }, 30_000)

  it('9. un tenedor puede ser sujeto del expediente, y el propietario responsable se resuelve correctamente a la fecha de los hechos', async () => {
    const t = await prepararTenant('t9')
    const infraccionId = await crearInfraccion(t.tenantId, ['multa'])
    const tenedor = await crearTercero(t.tenantId, 'Arrendatario', 't9')
    await vincularRol(t.tenantId, t.inmA, tenedor, 'arrendatario', '2026-01-01')

    const { data: expediente, error } = await reportarExpediente({
      infraccionId, inmuebleId: t.inmA, presuntoInfractorRef: tenedor, calidad: 'tenedor',
      descripcionHechos: 'Ruido del arrendatario', fechaHechos: '2026-06-02',
    })
    expect(error).toBeNull()
    // propA es el copropietario vigente desde 2020-01-01, sigue siéndolo a la fecha de los hechos.
    expect(expediente!.propietario_responsable_ref).toBe(t.propA)
  }, 30_000)

  it('10. el expediente es append-only: un update sobre una actuación falla', async () => {
    const t = await prepararTenant('t10')
    const infraccionId = await crearInfraccion(t.tenantId, ['multa'])
    const { data: expediente } = await reportarExpediente({
      infraccionId, inmuebleId: t.inmA, presuntoInfractorRef: t.propA, calidad: 'propietario',
      descripcionHechos: 'Hechos t10', fechaHechos: '2026-06-02',
    })
    const { data: actuacion } = await registrarActuacion(expediente!.id, 'requerimiento_escrito', 'Requerimiento')

    const { error } = await admin.from('gobierno_expediente_actuaciones').update({ descripcion: 'editado' }).eq('id', actuacion!.id)
    expect(error?.message).toContain('APPEND_ONLY')
  }, 30_000)

  it('11. la multa impuesta genera un cargo enlazado al expediente, con concepto de sanción y no de expensa ordinaria', async () => {
    const e = await prepararEscenarioMulta('t11')
    const votacionId = await votacionAprobada(e, e, '¿Multar?')
    await cerrarReunion(e.cliente, e.reunionId)
    const { data: decision } = await crearDecision(votacionId, 'Multa enlazada a cargo')
    const expedienteId = await expedienteListoParaSancion(
      { tenantId: e.tenantId, infraccionId: e.infraccionId, inmuebleId: e.inmA, infractorRef: e.propA }, 't11',
    )

    const { data: sancion, error } = await imponerSancion({ expedienteId, clase: 'multa', decisionId: decision!.id, monto: 150, actorId: e.usuarioId })
    expect(error).toBeNull()
    expect(sancion!.novedad_id).not.toBeNull()

    const { data: cargo } = await admin
      .from('cargos').select('categoria, monto_original, novedad_id').eq('novedad_id', sancion!.novedad_id!).single<{ categoria: string; monto_original: number; novedad_id: string }>()
    expect(cargo!.categoria).toBe('otro')
    expect(cargo!.monto_original).toBe(150)

    const { data: novedad } = await admin
      .from('novedades').select('tipo_novedad_id').eq('id', sancion!.novedad_id!).single<{ tipo_novedad_id: number }>()
    const idSancion = await idListaTipos('TIPO_NOVEDAD', 'sancion')
    expect(novedad!.tipo_novedad_id).toBe(idSancion)
  }, 30_000)

  it('12. el consejo CON atribución sí puede imponer; SIN ella, no', async () => {
    const t = await prepararTenant('t12')
    const o = await instalarOrgano(t, 'consejo_administracion', 't12')
    const conceptoId = await crearConcepto(t.tenantId)
    await crearPeriodo(t.tenantId, ANIO_HOY, MES_HOY)
    await crearExpensaMensual(t.tenantId, t.inmA, conceptoId, t.usuarioId, 100, FECHA_HOY)
    await configurarExpensaNecesaria(t.tenantId, conceptoId)
    const infraccionId = await crearInfraccion(t.tenantId, ['multa'])

    // Sin atribución todavía: falla.
    const votacion1 = await votacionAprobada(t, o, '¿Multar sin atribución?')
    const { data: decision1 } = await crearDecision(votacion1, 'Sin atribución')
    const expediente1 = await expedienteListoParaSancion(
      { tenantId: t.tenantId, infraccionId, inmuebleId: t.inmA, infractorRef: t.propA }, 't12a',
    )
    const { error: errorSin } = await imponerSancion({ expedienteId: expediente1, clase: 'multa', decisionId: decision1!.id, monto: 10 })
    expect(errorSin?.message).toContain('SANCION_ORGANO_INCOMPETENTE')

    // Con la atribución otorgada: sí puede.
    await otorgarAtribucion(t.tenantId, o.organoId, 'imponer_sanciones')
    const votacion2 = await votacionAprobada(t, o, '¿Multar con atribución?')
    await cerrarReunion(t.cliente, o.reunionId)
    const { data: decision2 } = await crearDecision(votacion2, 'Con atribución')
    const expediente2 = await expedienteListoParaSancion(
      { tenantId: t.tenantId, infraccionId, inmuebleId: t.inmA, infractorRef: t.propA }, 't12b',
    )
    const { error: errorCon } = await imponerSancion({ expedienteId: expediente2, clase: 'multa', decisionId: decision2!.id, monto: 10, actorId: t.usuarioId })
    expect(errorCon).toBeNull()
  }, 60_000)

  it('13. consecutivo de expedientes sin huecos', async () => {
    const t = await prepararTenant('t13')
    const infraccionId = await crearInfraccion(t.tenantId, ['multa'])
    const numeros: number[] = []
    for (let n = 0; n < 3; n++) {
      const { data: expediente } = await reportarExpediente({
        infraccionId, inmuebleId: t.inmA, presuntoInfractorRef: t.propA, calidad: 'propietario',
        descripcionHechos: `Hechos ${String(n)}`, fechaHechos: '2026-06-02',
      })
      numeros.push(expediente!.numero)
    }
    expect(numeros).toEqual([1, 2, 3])
  }, 30_000)

  it('14. aislamiento entre tenants', async () => {
    const t = await prepararTenant('t14a')
    const b = await crearTenantCompleto('t14b')
    const infraccionId = await crearInfraccion(t.tenantId, ['multa'])
    const { data: expediente } = await reportarExpediente({
      infraccionId, inmuebleId: t.inmA, presuntoInfractorRef: t.propA, calidad: 'propietario',
      descripcionHechos: 'Hechos t14a', fechaHechos: '2026-06-02',
    })

    const { data: vistaDesdeB } = await b.cliente.from('gobierno_expedientes_convivencia').select('id').eq('id', expediente!.id)
    expect(vistaDesdeB).toHaveLength(0)
  }, 30_000)
})
