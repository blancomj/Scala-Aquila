/**
 * GOB-5 (20260931620000-20260931690000) — decisión y compromisos, Ley 675 arts. 45/47/51.
 * Ver Casos de uso/Tres Modulos/Gobierno/GOB_05_decision_compromisos.md.
 *
 * Decisiones confirmadas en el Plan del corte:
 *  - Crear una decisión (formalizar una votación ya aprobada) exige rol auxiliar; revocarla
 *    exige rol administrador — mismo patrón de segregación que GOB-4 (generar/suscribir acta).
 *  - Las transiciones de un compromiso (avances, cumplido, bloqueado, cancelado) exigen solo
 *    rol auxiliar: es ejecución operativa de una decisión que ya pasó por el filtro de
 *    administrador al crearse.
 *
 * gobierno_decisiones NUNCA es borrador: solo nace de una votación cerrada y aprobada, así que
 * el consecutivo se asigna en el mismo INSERT (a diferencia del acta, GOB-4).
 *
 * Enlaces salientes: este corte solo conecta presupuesto y autorización de fondo (los dos únicos
 * destinos que existen hoy). La "rendición de cuentas contable" queda para CO-9 —
 * CO_09_PARCHE_FRONTERA_GOBIERNO.md la asigna explícitamente a ese corte y
 * contable_rendicion_cuentas todavía no existe — así que la prueba 8 del spec se ajusta para
 * probar solo lo que existe.
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
  console.warn('SALTADO tests/gobierno/decisiones: faltan variables de Supabase en .env')
}

const PDF_MINIMO = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) // "%PDF-1.4"

interface DecisionRow {
  id: string
  numero: number
  anio: number
  estado: string
  acta_id: string | null
  votacion_id: string
  reunion_id: string
  organo_id: string
  revoca_decision_id: string | null
}

interface EjecucionRow {
  total_compromisos: number
  cumplidos: number
  en_progreso: number
  bloqueados: number
  vencidos: number
  cancelados: number
  porcentaje_avance: number
  semaforo: string
  estado_ejecucion: string
}

interface EfectoRow {
  entidad: string
  entidad_id: string
  descripcion: string | null
}

d('GOB-5: decisión y compromisos', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []
  const storagePaths: string[] = []

  afterAll(async () => {
    if (storagePaths.length > 0) {
      await admin.storage.from('documentos-inmueble').remove(storagePaths)
    }
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

  async function crearOrgano(tenantId: string): Promise<string> {
    const tipoId = await idListaTipos('ORGANO_GOBIERNO', 'asamblea_general')
    const { data, error } = await admin
      .from('gobierno_organos')
      .insert({ tenant_id: tenantId, tipo_id: tipoId, vigente_desde: '2020-01-01' })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture organo: ${error.message}`)
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

  async function crearCoeficienteSet(tenantId: string, filas: { inmuebleId: string; valor: number }[]): Promise<string> {
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
    return set.id
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

  async function crearAgendaPunto(tenantId: string, reunionId: string, orden: number, titulo: string): Promise<void> {
    const { error } = await admin.from('gobierno_agenda_puntos').insert({ tenant_id: tenantId, reunion_id: reunionId, orden, titulo })
    if (error) throw new Error(`fixture agenda: ${error.message}`)
  }

  async function crearAsistencia(tenantId: string, reunionId: string, inmuebleId: string, asistenteRef: string): Promise<string> {
    const { data, error } = await admin
      .from('gobierno_asistencia')
      .insert({ tenant_id: tenantId, reunion_id: reunionId, inmueble_id: inmuebleId, asistente_ref: asistenteRef, calidad: 'propietario' })
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

  function generarActa(reunionId: string) {
    return admin.rpc('gobierno_generar_acta', { p_reunion_id: reunionId }).single<{
      id: string; estado: string; plazo_disposicion_limite: string
    }>()
  }

  function suscribirActa(actaId: string, presidenteMiembroId: string, secretarioMiembroId: string) {
    return admin.rpc('fn_gobierno_suscribir_acta', {
      p_acta_id: actaId, p_presidente_miembro_id: presidenteMiembroId, p_secretario_miembro_id: secretarioMiembroId,
    }).single<{ id: string; estado: string }>()
  }

  function crearDecision(
    votacionId: string,
    titulo: string,
    opts: { descripcion?: string; fundamento?: string; fechaLimite?: string; prioridad?: string } = {},
  ) {
    return admin.rpc('gobierno_crear_decision', {
      p_votacion_id: votacionId,
      p_titulo: titulo,
      ...(opts.descripcion !== undefined && { p_descripcion: opts.descripcion }),
      ...(opts.fundamento !== undefined && { p_fundamento: opts.fundamento }),
      ...(opts.fechaLimite !== undefined && { p_fecha_limite: opts.fechaLimite }),
      ...(opts.prioridad !== undefined && { p_prioridad: opts.prioridad }),
    }).single<DecisionRow>()
  }

  function revocarDecision(decisionId: string, votacionRevocatoriaId: string, titulo: string) {
    return admin.rpc('gobierno_revocar_decision', {
      p_decision_id: decisionId, p_votacion_revocatoria_id: votacionRevocatoriaId, p_titulo: titulo,
    }).single<DecisionRow>()
  }

  async function crearCompromiso(
    tenantId: string, decisionId: string, orden: number, titulo: string, extra: Record<string, unknown> = {},
  ): Promise<string> {
    const { data, error } = await admin
      .from('gobierno_compromisos')
      .insert({ tenant_id: tenantId, decision_id: decisionId, orden, titulo, ...extra })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture compromiso: ${error.message}`)
    return data.id
  }

  async function crearDocumentoEvidencia(tenantId: string): Promise<string> {
    const tipoDocId = await idListaTipos('TIPO_DOCUMENTO', 'evidencia_compromiso')
    const storagePath = `${tenantId}/_copropiedad/${crypto.randomUUID()}/1_evidencia-fixture.pdf`
    const { error: errorUpload } = await admin.storage
      .from('documentos-inmueble')
      .upload(storagePath, PDF_MINIMO, { contentType: 'application/pdf', upsert: false })
    if (errorUpload) throw new Error(`fixture storage evidencia: ${errorUpload.message}`)
    storagePaths.push(storagePath)
    const { data, error } = await admin
      .from('documentos')
      .insert({
        tenant_id: tenantId, tipo_documento_id: tipoDocId,
        nombre_archivo: 'evidencia-fixture.pdf', storage_path: storagePath, tamano_bytes: PDF_MINIMO.length,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture documento evidencia: ${error.message}`)
    return data.id
  }

  // registrado_por lo asigna un trigger desde auth.uid() (mismo patrón que
  // caso_juridico_actuaciones) — con el cliente admin (service_role) auth.uid() es null, así que
  // esta fixture usa el cliente autenticado del tenant, no admin.
  async function registrarAvance(
    cliente: Cliente, tenantId: string, compromisoId: string,
    opts: { documentoId?: string; descripcion?: string; porcentaje?: number } = {},
  ): Promise<string> {
    const { data, error } = await cliente
      .from('gobierno_compromiso_avances')
      .insert({
        tenant_id: tenantId, compromiso_id: compromisoId, fecha: '2026-06-05',
        descripcion: opts.descripcion ?? 'avance', porcentaje: opts.porcentaje ?? null,
        documento_id: opts.documentoId ?? null,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture avance: ${error.message}`)
    return data.id
  }

  /** Tenant + reunión cerrada con una votación cerrada y aprobada (0.6 favor / 0.4 contra,
   * materia 'ordinaria') — mismo escenario base que GOB-3/GOB-4, reutilizado tal cual. */
  async function prepararVotacionAprobada(etiqueta: string, fechaHora = '2026-06-01T15:00:00Z') {
    const { tenantId, cliente } = await crearTenantCompleto(etiqueta)
    const organoId = await crearOrgano(tenantId)
    const inmA = await crearInmueble(tenantId, `GOB5-${etiqueta}-A-${RUN_ID}`)
    const inmB = await crearInmueble(tenantId, `GOB5-${etiqueta}-B-${RUN_ID}`)
    await crearCoeficienteSet(tenantId, [{ inmuebleId: inmA, valor: 0.6 }, { inmuebleId: inmB, valor: 0.4 }])
    const propA = await crearTercero(tenantId, 'PropA', etiqueta)
    const propB = await crearTercero(tenantId, 'PropB', etiqueta)
    const pTercero = await crearTercero(tenantId, 'Presidente', etiqueta)
    const sTercero = await crearTercero(tenantId, 'Secretario', etiqueta)
    const presidenteMiembroId = await crearMiembro(tenantId, organoId, pTercero, 'presidente')
    const secretarioMiembroId = await crearMiembro(tenantId, organoId, sTercero, 'secretario')

    const reunionId = await crearReunion(tenantId, organoId, fechaHora)
    await crearAgendaPunto(tenantId, reunionId, 1, 'Aprobar presupuesto')
    const asistA = await crearAsistencia(tenantId, reunionId, inmA, propA)
    const asistB = await crearAsistencia(tenantId, reunionId, inmB, propB)
    await instalar(cliente, reunionId, presidenteMiembroId, secretarioMiembroId)

    const materiaId = await idMateria('ordinaria')
    const { data: votacion, error: errVot } = await admin
      .from('gobierno_votaciones')
      .insert({ tenant_id: tenantId, reunion_id: reunionId, materia_id: materiaId, pregunta: '¿Aprobar?' })
      .select('id').single<{ id: string }>()
    if (errVot) throw new Error(`fixture votacion: ${errVot.message}`)
    await admin.from('gobierno_votos').insert({ tenant_id: tenantId, votacion_id: votacion.id, asistencia_id: asistA, sentido: 'favor', coeficiente: 0 })
    await admin.from('gobierno_votos').insert({ tenant_id: tenantId, votacion_id: votacion.id, asistencia_id: asistB, sentido: 'contra', coeficiente: 0 })
    const { data: cerrada, error: errCierre } = await admin
      .from('gobierno_votaciones').update({ estado: 'cerrada' }).eq('id', votacion.id)
      .select('resultado').single<{ resultado: string }>()
    if (errCierre) throw new Error(`fixture cerrar votacion: ${errCierre.message}`)
    if (cerrada.resultado !== 'aprobada') throw new Error(`fixture votacion: resultado inesperado ${cerrada.resultado}`)

    await cerrarReunion(cliente, reunionId)
    return {
      tenantId, cliente, organoId, reunionId, votacionId: votacion.id, asistA, asistB,
      presidenteMiembroId, secretarioMiembroId,
    }
  }

  it('1. crear una decisión sin votación aprobada falla con DECISION_SIN_VOTACION_APROBADA', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('t1')
    const organoId = await crearOrgano(tenantId)
    const pTercero = await crearTercero(tenantId, 'Presidente', 't1')
    const sTercero = await crearTercero(tenantId, 'Secretario', 't1')
    const presidenteMiembroId = await crearMiembro(tenantId, organoId, pTercero, 'presidente')
    const secretarioMiembroId = await crearMiembro(tenantId, organoId, sTercero, 'secretario')
    // Quórum deliberatorio (art. 45) exige un número PLURAL de propietarios, no solo la suma de
    // coeficientes — dos inmuebles con asistencia, mismo patrón que prepararVotacionAprobada.
    const inmA = await crearInmueble(tenantId, `GOB5-t1-A-${RUN_ID}`)
    const inmB = await crearInmueble(tenantId, `GOB5-t1-B-${RUN_ID}`)
    await crearCoeficienteSet(tenantId, [{ inmuebleId: inmA, valor: 0.6 }, { inmuebleId: inmB, valor: 0.4 }])
    const propA = await crearTercero(tenantId, 'PropA', 't1')
    const propB = await crearTercero(tenantId, 'PropB', 't1')
    const materiaId = await idMateria('ordinaria')
    const reunionId = await crearReunion(tenantId, organoId)
    await crearAsistencia(tenantId, reunionId, inmA, propA) // quórum, para que abrir la votación no falle
    await crearAsistencia(tenantId, reunionId, inmB, propB)
    // Instalada (abrir una votación lo exige quórum) pero nunca cerrada: la votación queda 'abierta'.
    await instalar(cliente, reunionId, presidenteMiembroId, secretarioMiembroId)
    const { data: votacion, error: errVot } = await admin
      .from('gobierno_votaciones')
      .insert({ tenant_id: tenantId, reunion_id: reunionId, materia_id: materiaId, pregunta: '¿?' })
      .select('id').single<{ id: string }>()
    expect(errVot).toBeNull()

    const { error } = await crearDecision(votacion!.id, 'Decisión inválida')
    expect(error?.message).toContain('DECISION_SIN_VOTACION_APROBADA')
  }, 30_000)

  it('2. una decisión enlazada a un acta suscrita es inmutable → DECISION_INMUTABLE_TRAS_ACTA', async () => {
    const e = await prepararVotacionAprobada('t2')
    const { data: acta, error: errActa } = await generarActa(e.reunionId)
    expect(errActa).toBeNull()
    const { error: errSuscribir } = await suscribirActa(acta!.id, e.presidenteMiembroId, e.secretarioMiembroId)
    expect(errSuscribir).toBeNull()

    // El acta ya existe (suscrita) al crear la decisión: acta_id se resuelve en el mismo INSERT.
    const { data: decision, error: errDecision } = await crearDecision(e.votacionId, 'Aprobar presupuesto 2026')
    expect(errDecision).toBeNull()
    expect(decision!.acta_id).toBe(acta!.id)

    const { error: errUpdate } = await admin
      .from('gobierno_decisiones').update({ titulo: 'Otro título' }).eq('id', decision!.id)
    expect(errUpdate?.message).toContain('DECISION_INMUTABLE_TRAS_ACTA')
  }, 30_000)

  it('3. consecutivo de decisiones sin huecos', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('t3')
    const organoId = await crearOrgano(tenantId)
    const inmA = await crearInmueble(tenantId, `GOB5-t3-A-${RUN_ID}`)
    const inmB = await crearInmueble(tenantId, `GOB5-t3-B-${RUN_ID}`)
    await crearCoeficienteSet(tenantId, [{ inmuebleId: inmA, valor: 0.6 }, { inmuebleId: inmB, valor: 0.4 }])
    const propA = await crearTercero(tenantId, 'PropA', 't3')
    const propB = await crearTercero(tenantId, 'PropB', 't3')
    const pTercero = await crearTercero(tenantId, 'Presidente', 't3')
    const sTercero = await crearTercero(tenantId, 'Secretario', 't3')
    const presidenteMiembroId = await crearMiembro(tenantId, organoId, pTercero, 'presidente')
    const secretarioMiembroId = await crearMiembro(tenantId, organoId, sTercero, 'secretario')
    const materiaId = await idMateria('ordinaria')

    const numeros: number[] = []
    for (let n = 0; n < 3; n++) {
      const reunionId = await crearReunion(tenantId, organoId, `2026-0${String(n + 6)}-01T15:00:00Z`)
      await crearAgendaPunto(tenantId, reunionId, 1, `Punto ${String(n)}`)
      const asistA = await crearAsistencia(tenantId, reunionId, inmA, propA)
      const asistB = await crearAsistencia(tenantId, reunionId, inmB, propB)
      await instalar(cliente, reunionId, presidenteMiembroId, secretarioMiembroId)
      const { data: votacion } = await admin
        .from('gobierno_votaciones')
        .insert({ tenant_id: tenantId, reunion_id: reunionId, materia_id: materiaId, pregunta: `¿Punto ${String(n)}?` })
        .select('id').single<{ id: string }>()
      await admin.from('gobierno_votos').insert({ tenant_id: tenantId, votacion_id: votacion!.id, asistencia_id: asistA, sentido: 'favor', coeficiente: 0 })
      await admin.from('gobierno_votos').insert({ tenant_id: tenantId, votacion_id: votacion!.id, asistencia_id: asistB, sentido: 'contra', coeficiente: 0 })
      await admin.from('gobierno_votaciones').update({ estado: 'cerrada' }).eq('id', votacion!.id)
      await cerrarReunion(cliente, reunionId)

      const { data: decision, error } = await crearDecision(votacion!.id, `Decisión ${String(n)}`)
      expect(error).toBeNull()
      numeros.push(decision!.numero)
    }
    expect(numeros).toEqual([1, 2, 3])
  }, 30_000)

  it('4. gobierno_decision_ejecucion refleja el avance real y ninguna columna de estado de ejecución vive en gobierno_decisiones', async () => {
    const e = await prepararVotacionAprobada('t4')
    const { data: decision } = await crearDecision(e.votacionId, 'Decisión con compromisos')

    // Prueba estructural: select('*') no debe traer ninguna columna de estado agregado.
    const { data: releida } = await admin.from('gobierno_decisiones').select('*').eq('id', decision!.id).single()
    const claves = Object.keys(releida as Record<string, unknown>)
    expect(claves).not.toContain('estado_ejecucion')
    expect(claves).not.toContain('semaforo')
    expect(claves).not.toContain('porcentaje_avance')
    expect(claves).not.toContain('avance')

    const c1 = await crearCompromiso(e.tenantId, decision!.id, 1, 'Compromiso 1')
    const doc1 = await crearDocumentoEvidencia(e.tenantId)
    await registrarAvance(e.cliente, e.tenantId, c1, { documentoId: doc1 })
    const { error: errCumplir } = await admin.from('gobierno_compromisos').update({ estado: 'cumplido' }).eq('id', c1)
    expect(errCumplir).toBeNull()

    await crearCompromiso(e.tenantId, decision!.id, 2, 'Compromiso 2', { estado: 'en_progreso' })
    await crearCompromiso(e.tenantId, decision!.id, 3, 'Compromiso 3') // pendiente

    const { data: ejecucion, error } = await admin
      .rpc('gobierno_decision_ejecucion', { p_decision_id: decision!.id }).single<EjecucionRow>()
    expect(error).toBeNull()
    expect(ejecucion).toMatchObject({ total_compromisos: 3, cumplidos: 1, en_progreso: 1, bloqueados: 0, cancelados: 0 })
    expect(ejecucion!.porcentaje_avance).toBeCloseTo(33.33, 1)
    expect(ejecucion!.estado_ejecucion).toBe('en_ejecucion')
  }, 30_000)

  it('5. un compromiso pasa a cumplido solo con evidencia → COMPROMISO_CUMPLIDO_SIN_EVIDENCIA', async () => {
    const e = await prepararVotacionAprobada('t5')
    const { data: decision } = await crearDecision(e.votacionId, 'Decisión t5')
    const c1 = await crearCompromiso(e.tenantId, decision!.id, 1, 'Compromiso sin evidencia')

    const { error: errSinAvance } = await admin.from('gobierno_compromisos').update({ estado: 'cumplido' }).eq('id', c1)
    expect(errSinAvance?.message).toContain('COMPROMISO_CUMPLIDO_SIN_EVIDENCIA')

    await registrarAvance(e.cliente, e.tenantId, c1, { descripcion: 'avance sin documento adjunto' })
    const { error: errAvanceSinDocumento } = await admin.from('gobierno_compromisos').update({ estado: 'cumplido' }).eq('id', c1)
    expect(errAvanceSinDocumento?.message).toContain('COMPROMISO_CUMPLIDO_SIN_EVIDENCIA')

    const doc = await crearDocumentoEvidencia(e.tenantId)
    await registrarAvance(e.cliente, e.tenantId, c1, { documentoId: doc })
    const { error: errConEvidencia } = await admin.from('gobierno_compromisos').update({ estado: 'cumplido' }).eq('id', c1)
    expect(errConEvidencia).toBeNull()
  }, 30_000)

  it('6. el semáforo cambia de en_plazo a vencido al pasar la fecha, sin que ningún job haya corrido', async () => {
    const e = await prepararVotacionAprobada('t6')
    const { data: decision } = await crearDecision(e.votacionId, 'Decisión t6')
    const c1 = await crearCompromiso(e.tenantId, decision!.id, 1, 'Compromiso con plazo', { fecha_limite: '2027-01-01' })

    const { data: ejecEnPlazo } = await admin
      .rpc('gobierno_decision_ejecucion', { p_decision_id: decision!.id }).single<EjecucionRow>()
    expect(ejecEnPlazo!.semaforo).toBe('en_plazo')

    await admin.from('gobierno_compromisos').update({ fecha_limite: '2020-01-01' }).eq('id', c1)
    const { data: ejecVencido } = await admin
      .rpc('gobierno_decision_ejecucion', { p_decision_id: decision!.id }).single<EjecucionRow>()
    expect(ejecVencido!.semaforo).toBe('vencido')
  }, 30_000)

  it('7. los avances son append-only: un update sobre un avance falla', async () => {
    const e = await prepararVotacionAprobada('t7')
    const { data: decision } = await crearDecision(e.votacionId, 'Decisión t7')
    const c1 = await crearCompromiso(e.tenantId, decision!.id, 1, 'Compromiso')
    const avanceId = await registrarAvance(e.cliente, e.tenantId, c1, { descripcion: 'avance original' })

    const { error } = await admin.from('gobierno_compromiso_avances').update({ descripcion: 'editado' }).eq('id', avanceId)
    expect(error?.message).toContain('APPEND_ONLY')
  }, 30_000)

  it('8. gobierno_decision_efectos devuelve el presupuesto y la autorización de fondo enlazados', async () => {
    // La rendición de cuentas contable queda fuera de este corte: contable_rendicion_cuentas
    // todavía no existe (CO_09_PARCHE_FRONTERA_GOBIERNO.md la asigna a CO-9, posterior a GOB-5).
    const e = await prepararVotacionAprobada('t8')
    const { data: decision } = await crearDecision(e.votacionId, 'Aprobar presupuesto 2026')

    const { data: presupuesto, error: errPresupuesto } = await admin
      .from('presupuestos')
      .insert({ tenant_id: e.tenantId, anio: 2026, version: 1, estado: 'borrador', monto_total: 1_000_000, decision_id: decision!.id })
      .select('id').single<{ id: string }>()
    expect(errPresupuesto).toBeNull()

    const tipoFondoId = await idListaTipos('TIPO_FONDO', 'especial')
    const { data: fondo, error: errFondo } = await admin
      .from('fondos')
      .insert({ tenant_id: e.tenantId, naturaleza: 'destinacion_especifica', tipo_id: tipoFondoId, codigo: `FT8-${RUN_ID}`, nombre: 'Fondo t8' })
      .select('id').single<{ id: string }>()
    expect(errFondo).toBeNull()
    const organoDecisorioId = await idListaTipos('ORGANO_DECISORIO', 'asamblea')
    const { data: autorizacion, error: errAutorizacion } = await admin
      .from('fondo_autorizaciones')
      .insert({
        tenant_id: e.tenantId, fondo_id: fondo!.id, organo_id: organoDecisorioId,
        tipo_decision: 'creacion', decision: 'Crear fondo t8', decision_id: decision!.id,
      })
      .select('id').single<{ id: string }>()
    expect(errAutorizacion).toBeNull()

    const { data: efectos, error } = await admin
      .rpc('gobierno_decision_efectos', { p_decision_id: decision!.id })
    expect(error).toBeNull()
    const filas = efectos as EfectoRow[]
    expect(filas.map((f) => f.entidad).sort()).toEqual(['fondo_autorizacion', 'presupuesto'])
    expect(filas.find((f) => f.entidad === 'presupuesto')!.entidad_id).toBe(presupuesto!.id)
    expect(filas.find((f) => f.entidad === 'fondo_autorizacion')!.entidad_id).toBe(autorizacion!.id)
  }, 30_000)

  it('9. desde el presupuesto se llega a la decisión que lo aprobó, y viceversa', async () => {
    const e = await prepararVotacionAprobada('t9')
    const { data: decision } = await crearDecision(e.votacionId, 'Aprobar presupuesto t9')
    const { data: presupuesto } = await admin
      .from('presupuestos')
      .insert({ tenant_id: e.tenantId, anio: 2026, version: 1, estado: 'borrador', monto_total: 500_000, decision_id: decision!.id })
      .select('id').single<{ id: string }>()

    const { data: origen, error } = await admin
      .rpc('gobierno_decision_origen', { p_entidad: 'presupuesto', p_entidad_id: presupuesto!.id })
      .single<DecisionRow>()
    expect(error).toBeNull()
    expect(origen!.id).toBe(decision!.id)

    const { data: efectos } = await admin.rpc('gobierno_decision_efectos', { p_decision_id: decision!.id })
    const filas = efectos as EfectoRow[]
    expect(filas.some((f) => f.entidad === 'presupuesto' && f.entidad_id === presupuesto!.id)).toBe(true)
  }, 30_000)

  it('10. poblar acta_asamblea y decision_id a la vez falla con PRESUPUESTO_ORIGEN_APROBACION_DUPLICADO', async () => {
    const e = await prepararVotacionAprobada('t10')
    const { data: decision } = await crearDecision(e.votacionId, 'Aprobar presupuesto t10')

    const { error } = await admin.from('presupuestos').insert({
      tenant_id: e.tenantId, anio: 2026, version: 1, estado: 'borrador', monto_total: 100,
      decision_id: decision!.id, acta_asamblea: 'Acta 001 de 2026',
    })
    expect(error?.message).toContain('PRESUPUESTO_ORIGEN_APROBACION_DUPLICADO')
  }, 30_000)

  it('11. los textos de acta_asamblea preexistentes (copropiedad sin GOB) siguen intactos', async () => {
    const { tenantId } = await crearTenantCompleto('t11')
    const { data: presupuesto, error } = await admin
      .from('presupuestos')
      .insert({ tenant_id: tenantId, anio: 2026, version: 1, estado: 'borrador', monto_total: 100, acta_asamblea: 'Acta 045 de 2019 (copropiedad sin GOB)' })
      .select('acta_asamblea, decision_id').single<{ acta_asamblea: string; decision_id: string | null }>()
    expect(error).toBeNull()
    expect(presupuesto!.acta_asamblea).toBe('Acta 045 de 2019 (copropiedad sin GOB)')
    expect(presupuesto!.decision_id).toBeNull()
  }, 30_000)

  it('12. una decisión revocatoria enlaza a la revocada y la deja en estado revocada', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('t12')
    const organoId = await crearOrgano(tenantId)
    const inmA = await crearInmueble(tenantId, `GOB5-t12-A-${RUN_ID}`)
    const inmB = await crearInmueble(tenantId, `GOB5-t12-B-${RUN_ID}`)
    await crearCoeficienteSet(tenantId, [{ inmuebleId: inmA, valor: 0.6 }, { inmuebleId: inmB, valor: 0.4 }])
    const propA = await crearTercero(tenantId, 'PropA', 't12')
    const propB = await crearTercero(tenantId, 'PropB', 't12')
    const pTercero = await crearTercero(tenantId, 'Presidente', 't12')
    const sTercero = await crearTercero(tenantId, 'Secretario', 't12')
    const presidenteMiembroId = await crearMiembro(tenantId, organoId, pTercero, 'presidente')
    const secretarioMiembroId = await crearMiembro(tenantId, organoId, sTercero, 'secretario')
    const materiaId = await idMateria('ordinaria')

    const reunionId = await crearReunion(tenantId, organoId)
    await crearAgendaPunto(tenantId, reunionId, 1, 'Punto único')
    const asistA = await crearAsistencia(tenantId, reunionId, inmA, propA)
    const asistB = await crearAsistencia(tenantId, reunionId, inmB, propB)
    await instalar(cliente, reunionId, presidenteMiembroId, secretarioMiembroId)

    async function abrirVotarCerrar(pregunta: string): Promise<string> {
      const { data: votacion } = await admin
        .from('gobierno_votaciones')
        .insert({ tenant_id: tenantId, reunion_id: reunionId, materia_id: materiaId, pregunta })
        .select('id').single<{ id: string }>()
      await admin.from('gobierno_votos').insert({ tenant_id: tenantId, votacion_id: votacion!.id, asistencia_id: asistA, sentido: 'favor', coeficiente: 0 })
      await admin.from('gobierno_votos').insert({ tenant_id: tenantId, votacion_id: votacion!.id, asistencia_id: asistB, sentido: 'contra', coeficiente: 0 })
      await admin.from('gobierno_votaciones').update({ estado: 'cerrada' }).eq('id', votacion!.id)
      return votacion!.id
    }

    const votacion1 = await abrirVotarCerrar('¿Aprobar decisión original?')
    const votacion2 = await abrirVotarCerrar('¿Revocar decisión original?')
    await cerrarReunion(cliente, reunionId)

    const { data: original } = await crearDecision(votacion1, 'Decisión original t12')
    const { data: revocatoria, error } = await revocarDecision(original!.id, votacion2, 'Revocatoria t12')
    expect(error).toBeNull()
    expect(revocatoria!.revoca_decision_id).toBe(original!.id)

    const { data: releidaOriginal } = await admin
      .from('gobierno_decisiones').select('estado').eq('id', original!.id).single<{ estado: string }>()
    expect(releidaOriginal!.estado).toBe('revocada')
  }, 30_000)

  it('13. aislamiento entre tenants', async () => {
    const a = await prepararVotacionAprobada('t13a')
    const b = await crearTenantCompleto('t13b')
    const { data: decisionA } = await crearDecision(a.votacionId, 'Decisión t13a')

    const { data: vistaDesdeB } = await b.cliente.from('gobierno_decisiones').select('id').eq('id', decisionA!.id)
    expect(vistaDesdeB).toHaveLength(0)

    const compromisoA = await crearCompromiso(a.tenantId, decisionA!.id, 1, 'Compromiso t13a')
    const { data: compVistoDesdeB } = await b.cliente.from('gobierno_compromisos').select('id').eq('id', compromisoA)
    expect(compVistoDesdeB).toHaveLength(0)
  }, 30_000)
})
