/**
 * GOB-3 (20260931490000-20260931530000) — motor de quórum y votación.
 * Ver Casos de uso/Tres Modulos/Gobierno/GOB_03_quorum_votacion.md.
 *
 * Hallazgo del Plan del corte, confirmado con el usuario: el art. 46 de la Ley 675 de 2001 tiene
 * DIEZ numerales (verificado cruzando 3 fuentes — WebFetch directo contra dominios .gov.co falló
 * por TLS), no siete como decía el texto del corte. Se sembraron los diez reales
 * (20260931500000_gob3_materias_vocabulario.sql) + extincion_ph (art. 45, sin techo) + ordinaria
 * (materia por defecto). Solo dos de los diez tienen atribución ATRIBUCION_ORGANO vinculada
 * (expensas_extraordinarias, reforma_estatutos_reglamento) — el resto queda sin atribución,
 * decisión confirmada (no se inventan códigos nuevos, mismo criterio que D-61).
 *
 * gobierno_asistencia.inmueble_id se volvió nullable (20260931490000) para poder registrar la
 * asistencia de un miembro de consejo (calidad='organo', coeficiente fijo=1 — un miembro un voto,
 * art. 54) sin necesitar que posea una unidad.
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
  console.warn('SALTADO tests/gobierno/quorum-votacion: faltan variables de Supabase en .env')
}

d('GOB-3: motor de quórum y votación', () => {
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

  async function idMateria(codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('gobierno_materia_decision').select('id').eq('codigo', codigo).single<{ id: number }>()
    if (error) throw new Error(`fixture materia ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearTenantCompleto(etiqueta: string): Promise<{ tenantId: string; cliente: Cliente }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const tenant = await crearTenant(admin, etiqueta, usuario.id)
    tenantsCreados.push(tenant.id)
    await crearMembership(admin, tenant.id, usuario.id, 'administrador')
    const { clienteComo } = await import('../rls/helpers.js')
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

  async function crearOrgano(tenantId: string, tipoCodigo = 'asamblea_general'): Promise<string> {
    const tipoId = await idListaTipos('ORGANO_GOBIERNO', tipoCodigo)
    const { data, error } = await admin
      .from('gobierno_organos')
      .insert({ tenant_id: tenantId, tipo_id: tipoId, vigente_desde: '2020-01-01' })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture organo ${tipoCodigo}: ${error.message}`)
    return data.id
  }

  async function crearMiembro(tenantId: string, organoId: string, terceroId: string, rolCodigo: string, desde = '2020-01-01'): Promise<string> {
    const rolId = await idListaTipos('ROL_CONCEJO_COPROPIEDAD', rolCodigo)
    const { data, error } = await admin
      .from('gobierno_miembros')
      .insert({ tenant_id: tenantId, organo_id: organoId, tercero_id: terceroId, rol_id: rolId, desde })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture miembro ${rolCodigo}: ${error.message}`)
    return data.id
  }

  async function crearCoeficienteSet(
    tenantId: string, version: number, vigenteDesde: string, filas: { inmuebleId: string; valor: number }[],
  ): Promise<string> {
    const sumaTotal = filas.reduce((acc, f) => acc + f.valor, 0)
    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .insert({ tenant_id: tenantId, version, vigente_desde: vigenteDesde, estado: 'borrador', suma_total: sumaTotal })
      .select('id').single<{ id: string }>()
    if (errSet) throw new Error(`fixture coeficiente_sets: ${errSet.message}`)
    if (filas.length > 0) {
      const { error: errCoef } = await admin.from('coeficientes').insert(
        filas.map((f) => ({ tenant_id: tenantId, set_id: set.id, inmueble_id: f.inmuebleId, valor: f.valor })),
      )
      if (errCoef) throw new Error(`fixture coeficientes: ${errCoef.message}`)
    }
    const { error: errActivar } = await admin.from('coeficiente_sets').update({ estado: 'vigente' }).eq('id', set.id)
    if (errActivar) throw new Error(`fixture activar coeficiente_sets: ${errActivar.message}`)
    return set.id
  }

  async function crearReunion(
    tenantId: string, organoId: string,
    overrides: {
      modalidad?: 'presencial' | 'no_presencial' | 'mixta'
      convocatoriaRegimen?: 'primera' | 'segunda' | 'universal_sin_convocatoria'
      convocatoriaAntecedenteId?: string
      fechaHora?: string
    } = {},
  ): Promise<string> {
    const tipoId = await idListaTipos('TIPO_REUNION', 'asamblea_ordinaria')
    const modalidad = overrides.modalidad ?? 'presencial'
    const { data, error } = await admin
      .from('gobierno_reuniones')
      .insert({
        tenant_id: tenantId, organo_id: organoId, tipo_id: tipoId,
        modalidad, convocatoria_regimen: overrides.convocatoriaRegimen ?? 'primera',
        convocatoria_antecedente_id: overrides.convocatoriaAntecedenteId ?? null,
        fecha_hora: overrides.fechaHora ?? '2026-06-01T15:00:00Z',
        lugar: modalidad === 'no_presencial' ? null : 'Salón comunal',
        medio: modalidad === 'presencial' ? null : 'Enlace virtual',
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture reunion: ${error.message}`)
    return data.id
  }

  async function instalar(reunionId: string, presidenteMiembroId: string, secretarioMiembroId: string): Promise<void> {
    const { error } = await admin
      .from('gobierno_reuniones')
      .update({ estado: 'instalada', presidente_miembro_id: presidenteMiembroId, secretario_miembro_id: secretarioMiembroId })
      .eq('id', reunionId)
    if (error) throw new Error(`fixture instalar: ${error.message}`)
  }

  function crearAsistencia(
    tenantId: string, reunionId: string, inmuebleId: string | null, asistenteRef: string,
    calidad: 'propietario' | 'apoderado' | 'invitado' | 'organo',
    opciones: { ingresoAt?: string; salidaAt?: string } = {},
  ) {
    return admin
      .from('gobierno_asistencia')
      .insert({
        tenant_id: tenantId, reunion_id: reunionId, inmueble_id: inmuebleId, asistente_ref: asistenteRef,
        calidad, salida_at: opciones.salidaAt ?? null,
        ...(opciones.ingresoAt ? { ingreso_at: opciones.ingresoAt } : {}),
      })
      .select('*').single<{ id: string; coeficiente: number }>()
  }

  async function crearReglaMayoria(
    tenantId: string, materiaId: number, quorumMinimoPct: number, mayoriaPct: number, vigenteDesde = '2020-01-01',
  ) {
    return admin
      .from('gobierno_regla_mayoria')
      .insert({ tenant_id: tenantId, materia_id: materiaId, quorum_minimo_pct: quorumMinimoPct, mayoria_pct: mayoriaPct, vigente_desde: vigenteDesde })
      .select('*').single()
  }

  function crearVotacion(
    tenantId: string, reunionId: string, materiaId: number, pregunta: string,
    opciones: { abiertaAt?: string } = {},
  ) {
    return admin
      .from('gobierno_votaciones')
      .insert({
        tenant_id: tenantId, reunion_id: reunionId, materia_id: materiaId, pregunta,
        ...(opciones.abiertaAt ? { abierta_at: opciones.abiertaAt } : {}),
      })
      .select('*').single<{
        id: string; estado: string; resultado: string | null
        coeficiente_total: number | null; coeficiente_favor: number | null
      }>()
  }

  function cerrarVotacion(id: string) {
    return admin.from('gobierno_votaciones').update({ estado: 'cerrada' }).eq('id', id).select('*').single<{
      id: string; resultado: string; coeficiente_total: number; coeficiente_representado: number
      coeficiente_favor: number; regla_aplicada: unknown
    }>()
  }

  function crearVoto(tenantId: string, votacionId: string, asistenciaId: string, sentido: 'favor' | 'contra' | 'abstencion', emitidoAt?: string) {
    return admin
      .from('gobierno_votos')
      .insert({
        tenant_id: tenantId, votacion_id: votacionId, asistencia_id: asistenciaId, sentido, coeficiente: 0,
        ...(emitidoAt ? { emitido_at: emitidoAt } : {}),
      })
      .select('*').single()
  }

  /** Asamblea con 3 inmuebles/propietarios y un coeficiente_set (valores dados). Presidente/secretario ya nombrados. */
  async function prepararAsamblea(etiqueta: string, coefs: [number, number, number]) {
    const { tenantId, cliente } = await crearTenantCompleto(etiqueta)
    const organoId = await crearOrgano(tenantId)
    const pTercero = await crearTercero(tenantId, 'Presidente', etiqueta)
    const sTercero = await crearTercero(tenantId, 'Secretario', etiqueta)
    const presidenteMiembroId = await crearMiembro(tenantId, organoId, pTercero, 'presidente')
    const secretarioMiembroId = await crearMiembro(tenantId, organoId, sTercero, 'secretario')
    const inmA = await crearInmueble(tenantId, `GOB3-${etiqueta}-A-${RUN_ID}`)
    const inmB = await crearInmueble(tenantId, `GOB3-${etiqueta}-B-${RUN_ID}`)
    const inmC = await crearInmueble(tenantId, `GOB3-${etiqueta}-C-${RUN_ID}`)
    await crearCoeficienteSet(tenantId, 1, '2020-01-01', [
      { inmuebleId: inmA, valor: coefs[0] }, { inmuebleId: inmB, valor: coefs[1] }, { inmuebleId: inmC, valor: coefs[2] },
    ])
    const propA = await crearTercero(tenantId, 'PropA', etiqueta)
    const propB = await crearTercero(tenantId, 'PropB', etiqueta)
    const propC = await crearTercero(tenantId, 'PropC', etiqueta)
    return { tenantId, cliente, organoId, presidenteMiembroId, secretarioMiembroId, inmA, inmB, inmC, propA, propB, propC }
  }

  it('1. configurar una mayoría del 80% para una materia distinta de la extinción falla → MAYORIA_EXCEDE_TECHO_LEGAL', async () => {
    const { tenantId } = await crearTenantCompleto('gob3-t1')
    const materiaId = await idMateria('reforma_estatutos_reglamento')
    const { error } = await crearReglaMayoria(tenantId, materiaId, 50, 80)
    expect(error?.message).toContain('MAYORIA_EXCEDE_TECHO_LEGAL')
  }, 30_000)

  it('2. una materia del art. 46 se calcula sobre coeficientes totales: 60% asistencia, 100% de los presentes a favor → rechazada', async () => {
    const e = await prepararAsamblea('t2', [0.4, 0.4, 0.2])
    const reunionId = await crearReunion(e.tenantId, e.organoId)
    await instalar(reunionId, e.presidenteMiembroId, e.secretarioMiembroId)
    const { data: asistA } = await crearAsistencia(e.tenantId, reunionId, e.inmA, e.propA, 'propietario')
    const { data: asistC } = await crearAsistencia(e.tenantId, reunionId, e.inmC, e.propC, 'propietario')
    // inmB (0.4) no asiste — presente: 0.4 + 0.2 = 0.6 (60%), 2 personas distintas (plural ok).

    // cambio_destinacion_bien_comun (46.1) no tiene atribución vinculada — evita el chequeo de
    // competencia del órgano (probado por separado en el test 13) para aislar el cálculo de mayoría.
    const materiaId = await idMateria('cambio_destinacion_bien_comun')
    const { data: votacion, error: errAbrir } = await crearVotacion(e.tenantId, reunionId, materiaId, '¿Cambiar la destinación de un bien común?')
    expect(errAbrir).toBeNull()
    await crearVoto(e.tenantId, votacion!.id, asistA!.id, 'favor')
    await crearVoto(e.tenantId, votacion!.id, asistC!.id, 'favor')

    const { data: cerrada, error: errCerrar } = await cerrarVotacion(votacion!.id)
    expect(errCerrar).toBeNull()
    expect(cerrada!.coeficiente_total).toBeCloseTo(1, 6)
    expect(cerrada!.coeficiente_favor).toBeCloseTo(0.6, 6)
    expect(cerrada!.resultado).toBe('rechazada')
  }, 30_000)

  it('3. una materia ordinaria se calcula sobre representados: 60% asistencia, 55% de los presentes a favor → aprobada', async () => {
    const e = await prepararAsamblea('t3', [0.33, 0.4, 0.27])
    const reunionId = await crearReunion(e.tenantId, e.organoId)
    await instalar(reunionId, e.presidenteMiembroId, e.secretarioMiembroId)
    const { data: asistA } = await crearAsistencia(e.tenantId, reunionId, e.inmA, e.propA, 'propietario')
    const { data: asistC } = await crearAsistencia(e.tenantId, reunionId, e.inmC, e.propC, 'propietario')
    // inmB (0.4) no asiste — presente: 0.33 + 0.27 = 0.6 (60%).

    const materiaId = await idMateria('ordinaria')
    const { data: votacion } = await crearVotacion(e.tenantId, reunionId, materiaId, '¿Aprobar el punto ordinario?')
    await crearVoto(e.tenantId, votacion!.id, asistA!.id, 'favor')
    await crearVoto(e.tenantId, votacion!.id, asistC!.id, 'contra')

    const { data: cerrada } = await cerrarVotacion(votacion!.id)
    expect(cerrada!.coeficiente_representado).toBeCloseTo(0.6, 6)
    expect(cerrada!.coeficiente_favor).toBeCloseTo(0.33, 6)
    expect(cerrada!.resultado).toBe('aprobada')
  }, 30_000)

  it('4. un solo propietario con el 60% de los coeficientes no hace quórum → VOTACION_SIN_QUORUM', async () => {
    const e = await prepararAsamblea('t4', [0.6, 0.3, 0.1])
    const reunionId = await crearReunion(e.tenantId, e.organoId)
    await instalar(reunionId, e.presidenteMiembroId, e.secretarioMiembroId)
    await crearAsistencia(e.tenantId, reunionId, e.inmA, e.propA, 'propietario')
    // Solo una persona presente (propA, 60%) — sin pluralidad.

    const materiaId = await idMateria('ordinaria')
    const { error } = await crearVotacion(e.tenantId, reunionId, materiaId, '¿Algo?')
    expect(error?.message).toContain('VOTACION_SIN_QUORUM')
  }, 30_000)

  it('5. configurar una mayoría inferior al piso legal falla → MAYORIA_INFERIOR_AL_PISO_LEGAL', async () => {
    const { tenantId } = await crearTenantCompleto('gob3-t5')
    const materiaId = await idMateria('ordinaria')
    const { error } = await crearReglaMayoria(tenantId, materiaId, 50, 40)
    expect(error?.message).toContain('MAYORIA_INFERIOR_AL_PISO_LEGAL')
  }, 30_000)

  it('6. intentar añadir una materia a la lista del art. 46 falla → MATERIA_LEGAL_INMUTABLE', async () => {
    const { error } = await admin
      .from('gobierno_materia_decision')
      .insert({
        codigo: `test_nueva_${RUN_ID}`, nombre: 'x', descripcion: 'x',
        mayoria_tipo: 'ordinaria', base_calculo: 'coeficientes_representados',
      })
    expect(error?.message).toContain('MATERIA_LEGAL_INMUTABLE')
  }, 30_000)

  it('7. abrir votación de materia calificada en reunión no_presencial falla → VOTACION_MATERIA_NO_ADMITE_NO_PRESENCIAL', async () => {
    const e = await prepararAsamblea('t7', [0.5, 0.3, 0.2])
    const reunionId = await crearReunion(e.tenantId, e.organoId, { modalidad: 'no_presencial' })
    await instalar(reunionId, e.presidenteMiembroId, e.secretarioMiembroId)

    const materiaId = await idMateria('reforma_estatutos_reglamento')
    const { error } = await crearVotacion(e.tenantId, reunionId, materiaId, '¿Reformar el reglamento?')
    expect(error?.message).toContain('VOTACION_MATERIA_NO_ADMITE_NO_PRESENCIAL')
  }, 30_000)

  it('8. en segunda convocatoria, una materia calificada se abre; aprobada solo con 70% de los totales, con menos rechazada', async () => {
    const e = await prepararAsamblea('t8', [0.4, 0.25, 0.35])
    const primeraId = await crearReunion(e.tenantId, e.organoId, { convocatoriaRegimen: 'primera' })
    const segundaId = await crearReunion(e.tenantId, e.organoId, {
      convocatoriaRegimen: 'segunda', convocatoriaAntecedenteId: primeraId,
    })
    await instalar(segundaId, e.presidenteMiembroId, e.secretarioMiembroId)
    const { data: asistA } = await crearAsistencia(e.tenantId, segundaId, e.inmA, e.propA, 'propietario')
    const { data: asistC } = await crearAsistencia(e.tenantId, segundaId, e.inmC, e.propC, 'propietario')
    // inmB (0.25) no asiste — presente: 0.4 + 0.35 = 0.75 (75%), 2 personas.

    const materiaId = await idMateria('cambio_destinacion_bien_comun')

    const { data: votacionAprueba, error: errAbrir1 } = await crearVotacion(e.tenantId, segundaId, materiaId, '¿Reforma 1?')
    expect(errAbrir1).toBeNull()
    await crearVoto(e.tenantId, votacionAprueba!.id, asistA!.id, 'favor')
    await crearVoto(e.tenantId, votacionAprueba!.id, asistC!.id, 'favor')
    const { data: cerrada1 } = await cerrarVotacion(votacionAprueba!.id)
    expect(cerrada1!.resultado).toBe('aprobada') // 75% de los totales >= 70%

    const { data: votacionRechaza } = await crearVotacion(e.tenantId, segundaId, materiaId, '¿Reforma 2?')
    await crearVoto(e.tenantId, votacionRechaza!.id, asistA!.id, 'favor')
    await crearVoto(e.tenantId, votacionRechaza!.id, asistC!.id, 'contra')
    const { data: cerrada2 } = await cerrarVotacion(votacionRechaza!.id)
    expect(cerrada2!.resultado).toBe('rechazada') // solo 40% de los totales a favor
  }, 30_000)

  it('9. el quórum cambia al registrar una salida: hay quórum a las 10:00 y no a las 11:00', async () => {
    const e = await prepararAsamblea('t9', [0.3, 0.35, 0.35])
    const reunionId = await crearReunion(e.tenantId, e.organoId)
    await instalar(reunionId, e.presidenteMiembroId, e.secretarioMiembroId)
    const t0 = '2026-06-01T10:00:00Z'
    const t1 = '2026-06-01T11:00:00Z'
    await crearAsistencia(e.tenantId, reunionId, e.inmA, e.propA, 'propietario', { ingresoAt: t0 })
    await crearAsistencia(e.tenantId, reunionId, e.inmB, e.propB, 'propietario', { ingresoAt: t0, salidaAt: t1 })
    // A las 10:00: A+B presentes (0.65, 2 personas) — quórum. A las 11:00: solo A (0.3, 1 persona) — sin quórum.

    const materiaId = await idMateria('ordinaria')
    const { error: errA10 } = await crearVotacion(e.tenantId, reunionId, materiaId, '¿A las 10:00?', { abiertaAt: t0 })
    expect(errA10).toBeNull()

    const { error: errA11 } = await crearVotacion(e.tenantId, reunionId, materiaId, '¿A las 11:00?', { abiertaAt: t1 })
    expect(errA11?.message).toContain('VOTACION_SIN_QUORUM')
  }, 30_000)

  it('10. un inmueble no puede votar dos veces en la misma votación → VOTO_DUPLICADO', async () => {
    const e = await prepararAsamblea('t10', [0.4, 0.3, 0.3])
    const reunionId = await crearReunion(e.tenantId, e.organoId)
    await instalar(reunionId, e.presidenteMiembroId, e.secretarioMiembroId)
    const { data: asistA } = await crearAsistencia(e.tenantId, reunionId, e.inmA, e.propA, 'propietario')
    await crearAsistencia(e.tenantId, reunionId, e.inmB, e.propB, 'propietario')

    const materiaId = await idMateria('ordinaria')
    const { data: votacion } = await crearVotacion(e.tenantId, reunionId, materiaId, '¿Algo?')
    const { error: err1 } = await crearVoto(e.tenantId, votacion!.id, asistA!.id, 'favor')
    expect(err1).toBeNull()
    const { error: err2 } = await crearVoto(e.tenantId, votacion!.id, asistA!.id, 'contra')
    expect(err2?.message).toContain('VOTO_DUPLICADO')
  }, 30_000)

  it('11. un asistente con calidad invitado no puede votar → VOTO_EMISOR_NO_HABILITADO', async () => {
    const e = await prepararAsamblea('t11', [0.4, 0.3, 0.3])
    const reunionId = await crearReunion(e.tenantId, e.organoId)
    await instalar(reunionId, e.presidenteMiembroId, e.secretarioMiembroId)
    await crearAsistencia(e.tenantId, reunionId, e.inmA, e.propA, 'propietario')
    await crearAsistencia(e.tenantId, reunionId, e.inmB, e.propB, 'propietario')
    const invitadoTercero = await crearTercero(e.tenantId, 'Invitado', 't11')
    const { data: asistInvitado } = await crearAsistencia(e.tenantId, reunionId, null, invitadoTercero, 'invitado')

    const materiaId = await idMateria('ordinaria')
    const { data: votacion } = await crearVotacion(e.tenantId, reunionId, materiaId, '¿Algo?')
    const { error } = await crearVoto(e.tenantId, votacion!.id, asistInvitado!.id, 'favor')
    expect(error?.message).toContain('VOTO_EMISOR_NO_HABILITADO')
  }, 30_000)

  it('12. una votación en reunión de consejo se calcula por miembros, no por coeficientes', async () => {
    const { tenantId } = await crearTenantCompleto('gob3-t12')
    const organoId = await crearOrgano(tenantId, 'consejo_administracion')
    const pTercero = await crearTercero(tenantId, 'Presidente', 't12')
    const sTercero = await crearTercero(tenantId, 'Secretario', 't12')
    const vTercero = await crearTercero(tenantId, 'Vocal', 't12')
    const presidenteMiembroId = await crearMiembro(tenantId, organoId, pTercero, 'presidente')
    const secretarioMiembroId = await crearMiembro(tenantId, organoId, sTercero, 'secretario')
    await crearMiembro(tenantId, organoId, vTercero, 'vocal')
    // Sin coeficiente_sets en este tenant — si el cálculo usara coeficientes por error, fallaría.

    const reunionId = await crearReunion(tenantId, organoId)
    await instalar(reunionId, presidenteMiembroId, secretarioMiembroId)
    const { data: asistP } = await crearAsistencia(tenantId, reunionId, null, pTercero, 'organo')
    const { data: asistS } = await crearAsistencia(tenantId, reunionId, null, sTercero, 'organo')
    // vTercero no asiste — 2 de 3 miembros presentes (66.7% > 50%).
    expect(asistP!.coeficiente).toBe(1)

    const materiaId = await idMateria('ordinaria')
    const { data: votacion } = await crearVotacion(tenantId, reunionId, materiaId, '¿Aprobar acta anterior?')
    await crearVoto(tenantId, votacion!.id, asistP!.id, 'favor')
    await crearVoto(tenantId, votacion!.id, asistS!.id, 'favor')

    const { data: cerrada } = await cerrarVotacion(votacion!.id)
    expect(cerrada!.coeficiente_total).toBe(3) // miembros vigentes, no coeficientes
    expect(cerrada!.coeficiente_favor).toBe(2)
    expect(cerrada!.resultado).toBe('aprobada')
  }, 30_000)

  it('13. una votación de materia cuya atribución no corresponde al órgano reunido falla → VOTACION_ORGANO_INCOMPETENTE', async () => {
    const e = await prepararAsamblea('t13', [0.4, 0.3, 0.3])
    const reunionId = await crearReunion(e.tenantId, e.organoId)
    await instalar(reunionId, e.presidenteMiembroId, e.secretarioMiembroId)
    await crearAsistencia(e.tenantId, reunionId, e.inmA, e.propA, 'propietario')
    await crearAsistencia(e.tenantId, reunionId, e.inmB, e.propB, 'propietario')
    // No se otorgó la atribución reformar_reglamento a ningún órgano de este tenant.

    const materiaId = await idMateria('reforma_estatutos_reglamento')
    const { error } = await crearVotacion(e.tenantId, reunionId, materiaId, '¿Reformar el reglamento?')
    expect(error?.message).toContain('VOTACION_ORGANO_INCOMPETENTE')
  }, 30_000)

  it('14. una votación cerrada es inmutable → VOTACION_CERRADA_INMUTABLE', async () => {
    const e = await prepararAsamblea('t14', [0.4, 0.3, 0.3])
    const reunionId = await crearReunion(e.tenantId, e.organoId)
    await instalar(reunionId, e.presidenteMiembroId, e.secretarioMiembroId)
    const { data: asistA } = await crearAsistencia(e.tenantId, reunionId, e.inmA, e.propA, 'propietario')
    await crearAsistencia(e.tenantId, reunionId, e.inmB, e.propB, 'propietario')
    const materiaId = await idMateria('ordinaria')
    const { data: votacion } = await crearVotacion(e.tenantId, reunionId, materiaId, '¿Algo?')
    await crearVoto(e.tenantId, votacion!.id, asistA!.id, 'favor')
    await cerrarVotacion(votacion!.id)

    const { error } = await admin.from('gobierno_votaciones').update({ pregunta: 'Otra pregunta' }).eq('id', votacion!.id)
    expect(error?.message).toContain('VOTACION_CERRADA_INMUTABLE')
  }, 30_000)

  it('15. la regla aplicada queda congelada: cambiar gobierno_regla_mayoria después no altera el resultado', async () => {
    const e = await prepararAsamblea('t15', [0.4, 0.3, 0.3])
    const materiaId = await idMateria('ordinaria')
    const { data: regla } = await crearReglaMayoria(e.tenantId, materiaId, 50, 50)
    const reunionId = await crearReunion(e.tenantId, e.organoId)
    await instalar(reunionId, e.presidenteMiembroId, e.secretarioMiembroId)
    const { data: asistA } = await crearAsistencia(e.tenantId, reunionId, e.inmA, e.propA, 'propietario')
    const { data: asistB } = await crearAsistencia(e.tenantId, reunionId, e.inmB, e.propB, 'propietario')
    const { data: votacion } = await crearVotacion(e.tenantId, reunionId, materiaId, '¿Algo?')
    await crearVoto(e.tenantId, votacion!.id, asistA!.id, 'favor')
    await crearVoto(e.tenantId, votacion!.id, asistB!.id, 'contra')
    const { data: cerrada } = await cerrarVotacion(votacion!.id)
    const resultadoOriginal = cerrada!.resultado
    const reglaAplicadaOriginal = JSON.stringify(cerrada!.regla_aplicada)

    await admin.from('gobierno_regla_mayoria').update({ mayoria_pct: 65 }).eq('id', (regla as { id: string }).id)

    const { data: releida } = await admin
      .from('gobierno_votaciones').select('resultado, regla_aplicada').eq('id', votacion!.id)
      .single<{ resultado: string; regla_aplicada: unknown }>()
    expect(releida!.resultado).toBe(resultadoOriginal)
    expect(JSON.stringify(releida!.regla_aplicada)).toBe(reglaAplicadaOriginal)
  }, 30_000)

  it('16. cambiar los coeficientes después de la reunión no altera el resultado', async () => {
    const e = await prepararAsamblea('t16', [0.4, 0.3, 0.3])
    const reunionId = await crearReunion(e.tenantId, e.organoId)
    await instalar(reunionId, e.presidenteMiembroId, e.secretarioMiembroId)
    const { data: asistA } = await crearAsistencia(e.tenantId, reunionId, e.inmA, e.propA, 'propietario')
    const { data: asistB } = await crearAsistencia(e.tenantId, reunionId, e.inmB, e.propB, 'propietario')
    const materiaId = await idMateria('ordinaria')
    const { data: votacion } = await crearVotacion(e.tenantId, reunionId, materiaId, '¿Algo?')
    await crearVoto(e.tenantId, votacion!.id, asistA!.id, 'favor')
    await crearVoto(e.tenantId, votacion!.id, asistB!.id, 'contra')
    const { data: cerrada } = await cerrarVotacion(votacion!.id)
    const totalOriginal = cerrada!.coeficiente_total
    const favorOriginal = cerrada!.coeficiente_favor

    await admin.from('coeficiente_sets').update({ estado: 'historica', vigente_hasta: '2026-07-01' }).eq('tenant_id', e.tenantId).eq('version', 1)
    await crearCoeficienteSet(e.tenantId, 2, '2026-07-01', [
      { inmuebleId: e.inmA, valor: 0.9 }, { inmuebleId: e.inmB, valor: 0.05 }, { inmuebleId: e.inmC, valor: 0.05 },
    ])

    const { data: releida } = await admin
      .from('gobierno_votaciones').select('coeficiente_total, coeficiente_favor').eq('id', votacion!.id)
      .single<{ coeficiente_total: number; coeficiente_favor: number }>()
    expect(releida!.coeficiente_total).toBe(totalOriginal)
    expect(releida!.coeficiente_favor).toBe(favorOriginal)
  }, 30_000)

  it('17. aislamiento entre tenants', async () => {
    const a = await prepararAsamblea('t17a', [0.4, 0.3, 0.3])
    const b = await prepararAsamblea('t17b', [0.4, 0.3, 0.3])
    const reunionA = await crearReunion(a.tenantId, a.organoId)
    await instalar(reunionA, a.presidenteMiembroId, a.secretarioMiembroId)
    await crearAsistencia(a.tenantId, reunionA, a.inmA, a.propA, 'propietario')
    await crearAsistencia(a.tenantId, reunionA, a.inmB, a.propB, 'propietario')
    const materiaId = await idMateria('ordinaria')
    const { data: votacionA, error: errAbrirA } = await crearVotacion(a.tenantId, reunionA, materiaId, '¿Algo?')
    expect(errAbrirA).toBeNull()

    const { data: vistaDesdeB, error } = await b.cliente.from('gobierno_votaciones').select('id').eq('id', votacionA!.id)
    expect(error).toBeNull()
    expect(vistaDesdeB).toHaveLength(0)

    const { error: errCruzado } = await admin
      .from('gobierno_votaciones')
      .insert({ tenant_id: a.tenantId, reunion_id: reunionA, materia_id: materiaId, pregunta: 'x' })
      .single()
    // No debería fallar por aislamiento en sí (misma reunión, mismo tenant) — se valida en su
    // lugar cruzando tenant de reunión vs tenant de la fila, ya cubierto por VOTACION_REUNION_
    // INVALIDA en otras pruebas; aquí basta con que B no vea nada de A (arriba).
    expect(errCruzado).toBeNull()
  }, 30_000)

  it('18. los enums nuevos de GOB-3 tienen comment on type (D-24)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const archivos = [
      { archivo: '20260931500000_gob3_materias_vocabulario.sql', tipos: ['mayoria_tipo_t', 'base_calculo_t'] },
      { archivo: '20260931530000_gob3_votaciones.sql', tipos: ['votacion_metodo_t', 'votacion_estado_t', 'votacion_resultado_t', 'votacion_sentido_t'] },
    ]
    for (const { archivo, tipos } of archivos) {
      const ruta = path.resolve(import.meta.dirname, `../../supabase/migrations/${archivo}`)
      const contenido = await fs.readFile(ruta, 'utf8')
      for (const tipo of tipos) {
        expect(contenido).toMatch(new RegExp(`create type public\\.${tipo} as enum`))
        expect(contenido).toMatch(new RegExp(`comment on type public\\.${tipo} is`))
      }
    }
  })
})
