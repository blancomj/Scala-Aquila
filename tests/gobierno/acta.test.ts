/**
 * GOB-4 (20260931550000-20260931580000) — el acta se genera, no se adjunta (Ley 675 art. 47).
 * Ver Casos de uso/Tres Modulos/Gobierno/GOB_04_acta.md.
 *
 * Decisiones confirmadas en el Plan del corte:
 *  - Suscribir un acta exige rol administrador (segregación de funciones, marco §5.5) — mismo
 *    patrón que instalar/cerrar una reunión (GOB-2) y abrir/cerrar una votación (GOB-3).
 *  - El detalle nominal del voto (quién votó qué) se incluye por defecto, lectura literal del
 *    art. 47.
 *
 * numero se asigna SOLO al suscribir (fn_gobierno_suscribir_acta), nunca al generar el borrador
 * — mismo principio que fn_contabilizar_comprobante (CO-2): el consecutivo se asigna en la
 * transición que hace el objeto jurídicamente definitivo. Motor de días hábiles colombianos
 * (Ley 51 de 1983 — Ley Emiliani) genuinamente nuevo, verificado en gobierno_pascua/
 * gobierno_festivos_colombia contra fechas 2026 reales antes de escribir este archivo.
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
  console.warn('SALTADO tests/gobierno/acta: faltan variables de Supabase en .env')
}

const PDF_MINIMO = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) // "%PDF-1.4"

interface RespuestaEnlace {
  documento_id: string
  token: string
  vigencia_dias: number
  expira_en: string
}
interface RespuestaVerDocumento {
  nombre_archivo: string
  tipo_documento_id: number
  fecha_vencimiento: string | null
  url_firmada: string
  url_expira_en_segundos: number
}

d('GOB-4: el acta se genera, no se adjunta', () => {
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

  async function crearCoeficienteSet(
    tenantId: string, filas: { inmuebleId: string; valor: number }[], version = 1, vigenteDesde = '2020-01-01',
  ): Promise<string> {
    const sumaTotal = filas.reduce((acc, f) => acc + f.valor, 0)
    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .insert({ tenant_id: tenantId, version, vigente_desde: vigenteDesde, estado: 'borrador', suma_total: sumaTotal })
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

  async function crearDocumentoActa(tenantId: string): Promise<string> {
    const tipoDocId = await idListaTipos('TIPO_DOCUMENTO', 'acta_asamblea')
    const storagePath = `${tenantId}/_copropiedad/${crypto.randomUUID()}/1_acta-fixture.pdf`
    const { error: errorUpload } = await admin.storage
      .from('documentos-inmueble')
      .upload(storagePath, PDF_MINIMO, { contentType: 'application/pdf', upsert: false })
    if (errorUpload) throw new Error(`fixture storage documento acta: ${errorUpload.message}`)
    storagePaths.push(storagePath)
    const { data, error } = await admin
      .from('documentos')
      .insert({
        tenant_id: tenantId, tipo_documento_id: tipoDocId,
        nombre_archivo: 'acta-fixture.pdf', storage_path: storagePath, tamano_bytes: PDF_MINIMO.length,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture documento acta: ${error.message}`)
    return data.id
  }

  async function crearAgendaPunto(tenantId: string, reunionId: string, orden: number, titulo: string): Promise<void> {
    const { error } = await admin.from('gobierno_agenda_puntos').insert({ tenant_id: tenantId, reunion_id: reunionId, orden, titulo })
    if (error) throw new Error(`fixture agenda: ${error.message}`)
  }

  async function crearAsistencia(tenantId: string, reunionId: string, inmuebleId: string, asistenteRef: string) {
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
      id: string; estado: string; contenido_generado: Record<string, unknown>
      presidente_miembro_id: string; secretario_miembro_id: string
      plazo_disposicion_limite: string; numero: number | null
    }>()
  }

  function suscribirActa(actaId: string, presidenteMiembroId: string, secretarioMiembroId: string) {
    return admin.rpc('fn_gobierno_suscribir_acta', {
      p_acta_id: actaId, p_presidente_miembro_id: presidenteMiembroId, p_secretario_miembro_id: secretarioMiembroId,
    }).single<{
      id: string; estado: string; numero: number | null; hash_contenido: string | null
      suscrita_at: string | null
    }>()
  }

  /** Escenario completo: reunión cerrada con agenda, asistencia, poder y votación cerrada. */
  async function prepararReunionCerradaCompleta(etiqueta: string) {
    const { tenantId, cliente } = await crearTenantCompleto(etiqueta)
    const organoId = await crearOrgano(tenantId)
    const pTercero = await crearTercero(tenantId, 'Presidente', etiqueta)
    const sTercero = await crearTercero(tenantId, 'Secretario', etiqueta)
    const presidenteMiembroId = await crearMiembro(tenantId, organoId, pTercero, 'presidente')
    const secretarioMiembroId = await crearMiembro(tenantId, organoId, sTercero, 'secretario')
    const inmA = await crearInmueble(tenantId, `GOB4-${etiqueta}-A-${RUN_ID}`)
    const inmB = await crearInmueble(tenantId, `GOB4-${etiqueta}-B-${RUN_ID}`)
    await crearCoeficienteSet(tenantId, [{ inmuebleId: inmA, valor: 0.6 }, { inmuebleId: inmB, valor: 0.4 }])
    const propA = await crearTercero(tenantId, 'PropA', etiqueta)
    const propB = await crearTercero(tenantId, 'PropB', etiqueta)

    const reunionId = await crearReunion(tenantId, organoId)
    await crearAgendaPunto(tenantId, reunionId, 1, 'Aprobar presupuesto')
    const asistA = await crearAsistencia(tenantId, reunionId, inmA, propA)
    const asistB = await crearAsistencia(tenantId, reunionId, inmB, propB)
    await instalar(cliente, reunionId, presidenteMiembroId, secretarioMiembroId)

    const materiaId = await idMateria('ordinaria')
    const { data: votacion, error: errVot } = await admin
      .from('gobierno_votaciones')
      .insert({ tenant_id: tenantId, reunion_id: reunionId, materia_id: materiaId, pregunta: '¿Aprobar el presupuesto?' })
      .select('id').single<{ id: string }>()
    if (errVot) throw new Error(`fixture votacion: ${errVot.message}`)
    await admin.from('gobierno_votos').insert({ tenant_id: tenantId, votacion_id: votacion.id, asistencia_id: asistA, sentido: 'favor', coeficiente: 0 })
    await admin.from('gobierno_votos').insert({ tenant_id: tenantId, votacion_id: votacion.id, asistencia_id: asistB, sentido: 'contra', coeficiente: 0 })
    await admin.from('gobierno_votaciones').update({ estado: 'cerrada' }).eq('id', votacion.id)

    await cerrarReunion(cliente, reunionId)
    return { tenantId, cliente, organoId, reunionId, presidenteMiembroId, secretarioMiembroId, inmA, inmB, propA, propB, votacionId: votacion.id }
  }

  it('1. generar el acta de una reunión no cerrada falla con ACTA_REUNION_NO_CERRADA', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('t1')
    const organoId = await crearOrgano(tenantId)
    const pTercero = await crearTercero(tenantId, 'Presidente', 't1')
    const sTercero = await crearTercero(tenantId, 'Secretario', 't1')
    const presidenteMiembroId = await crearMiembro(tenantId, organoId, pTercero, 'presidente')
    const secretarioMiembroId = await crearMiembro(tenantId, organoId, sTercero, 'secretario')
    const reunionId = await crearReunion(tenantId, organoId)
    await crearAgendaPunto(tenantId, reunionId, 1, 'Punto')
    await instalar(cliente, reunionId, presidenteMiembroId, secretarioMiembroId)
    // No se cierra la reunión.

    const { error } = await generarActa(reunionId)
    expect(error?.message).toContain('ACTA_REUNION_NO_CERRADA')
  }, 30_000)

  it('2. el acta generada contiene las secciones obligatorias del art. 47 con datos reales (prueba central)', async () => {
    const e = await prepararReunionCerradaCompleta('t2')
    const { data: acta, error } = await generarActa(e.reunionId)
    expect(error).toBeNull()
    const contenido = acta!.contenido_generado

    expect(contenido.caracter).toMatchObject({ codigo: 'asamblea_ordinaria', caracter: 'ordinaria' })
    expect(contenido.convocatoria).toMatchObject({ regimen: 'primera' })
    expect(contenido.orden_del_dia).toEqual([{ orden: 1, titulo: 'Aprobar presupuesto', descripcion: null }])
    expect((contenido.asistentes as unknown[]).length).toBe(2)
    expect(contenido.poderes).toEqual([])
    expect(contenido.quorum).toMatchObject({ coeficiente_total: 1 })
    expect((contenido.votaciones as unknown[]).length).toBe(1)
  }, 30_000)

  it('3. la lista de asistentes incluye nombre/calidad/unidad/coeficiente — coeficientes congelados en la reunión, no los vigentes hoy', async () => {
    const e = await prepararReunionCerradaCompleta('t3')
    const { data: acta } = await generarActa(e.reunionId)
    const asistentes = acta!.contenido_generado.asistentes as {
      nombre: string; calidad: string; inmueble_codigo: string; coeficiente: number
    }[]
    const asistA = asistentes.find((a) => a.inmueble_codigo.includes('-A-'))
    expect(asistA).toMatchObject({ calidad: 'propietario', coeficiente: 0.6 })
    expect(asistA!.nombre).toContain('PropA')

    // Cambia el coeficiente_set vigente DESPUÉS de cerrar la reunión — el acta no debe reflejarlo.
    await admin.from('coeficiente_sets').update({ estado: 'historica', vigente_hasta: '2026-07-01' }).eq('tenant_id', e.tenantId).eq('version', 1)
    await crearCoeficienteSet(e.tenantId, [{ inmuebleId: e.inmA, valor: 0.99 }, { inmuebleId: e.inmB, valor: 0.01 }], 2, '2026-07-01')

    const { data: actaRegenerada } = await generarActa(e.reunionId)
    const asistARegen = (actaRegenerada!.contenido_generado.asistentes as typeof asistentes)
      .find((a) => a.inmueble_codigo.includes('-A-'))
    expect(asistARegen!.coeficiente).toBe(0.6) // sigue siendo el congelado en gobierno_asistencia
  }, 30_000)

  it('4. la sección de votos refleja el resultado de cada votación', async () => {
    const e = await prepararReunionCerradaCompleta('t4')
    const { data: acta } = await generarActa(e.reunionId)
    const votaciones = acta!.contenido_generado.votaciones as {
      pregunta: string; resultado: string; favor: number; contra: number
    }[]
    expect(votaciones).toHaveLength(1)
    expect(votaciones[0]!.pregunta).toBe('¿Aprobar el presupuesto?')
    expect(votaciones[0]!.favor).toBeCloseTo(0.6, 6)
    expect(votaciones[0]!.contra).toBeCloseTo(0.4, 6)
  }, 30_000)

  it('5. suscribir con una sección obligatoria vacía falla con ACTA_CONTENIDO_MINIMO_INCOMPLETO, detallando cuál falta', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('t5')
    const organoId = await crearOrgano(tenantId)
    const pTercero = await crearTercero(tenantId, 'Presidente', 't5')
    const sTercero = await crearTercero(tenantId, 'Secretario', 't5')
    const presidenteMiembroId = await crearMiembro(tenantId, organoId, pTercero, 'presidente')
    const secretarioMiembroId = await crearMiembro(tenantId, organoId, sTercero, 'secretario')
    const reunionId = await crearReunion(tenantId, organoId)
    // Sin puntos de agenda ni asistencia.
    await instalar(cliente, reunionId, presidenteMiembroId, secretarioMiembroId)
    await cerrarReunion(cliente, reunionId)

    const { data: acta } = await generarActa(reunionId)
    const { error } = await suscribirActa(acta!.id, presidenteMiembroId, secretarioMiembroId)
    expect(error?.message).toContain('ACTA_CONTENIDO_MINIMO_INCOMPLETO')
    expect(error?.message).toContain('orden del día')
    expect(error?.message).toContain('asistentes')
  }, 30_000)

  it('6. solo el presidente y el secretario de esa reunión pueden suscribir → ACTA_SUSCRIPTOR_NO_AUTORIZADO', async () => {
    const e = await prepararReunionCerradaCompleta('t6')
    const { data: acta } = await generarActa(e.reunionId)
    const otroTercero = await crearTercero(e.tenantId, 'Otro', 't6')
    const otroMiembroId = await crearMiembro(e.tenantId, e.organoId, otroTercero, 'vocal')

    const { error } = await suscribirActa(acta!.id, otroMiembroId, e.secretarioMiembroId)
    expect(error?.message).toContain('ACTA_SUSCRIPTOR_NO_AUTORIZADO')
  }, 30_000)

  it('7. un acta suscrita es inmutable → ACTA_SUSCRITA_INMUTABLE', async () => {
    const e = await prepararReunionCerradaCompleta('t7')
    const { data: acta } = await generarActa(e.reunionId)
    const { error: errSuscribir } = await suscribirActa(acta!.id, e.presidenteMiembroId, e.secretarioMiembroId)
    expect(errSuscribir).toBeNull()

    const { error: errRegenerar } = await generarActa(e.reunionId)
    expect(errRegenerar?.message).toContain('ACTA_SUSCRITA_INMUTABLE')

    const { error: errResuscribir } = await suscribirActa(acta!.id, e.presidenteMiembroId, e.secretarioMiembroId)
    expect(errResuscribir?.message).toContain('ACTA_SUSCRITA_INMUTABLE')
  }, 30_000)

  it('8. el hash es estable si el contenido no cambia y distinto si cambia', async () => {
    const eA = await prepararReunionCerradaCompleta('t8a')
    const { data: actaA } = await generarActa(eA.reunionId)
    const { data: suscritaA } = await suscribirActa(actaA!.id, eA.presidenteMiembroId, eA.secretarioMiembroId)
    const { data: releidaA } = await admin.from('gobierno_actas').select('hash_contenido').eq('id', actaA!.id).single<{ hash_contenido: string }>()
    expect(releidaA!.hash_contenido).toBe(suscritaA!.hash_contenido) // estable

    const eB = await crearTenantCompleto('t8b')
    const organoB = await crearOrgano(eB.tenantId)
    const pB = await crearTercero(eB.tenantId, 'Presidente', 't8b')
    const sB = await crearTercero(eB.tenantId, 'Secretario', 't8b')
    const presidenteB = await crearMiembro(eB.tenantId, organoB, pB, 'presidente')
    const secretarioB = await crearMiembro(eB.tenantId, organoB, sB, 'secretario')
    const reunionB = await crearReunion(eB.tenantId, organoB)
    await crearAgendaPunto(eB.tenantId, reunionB, 1, 'Un punto totalmente distinto')
    const inmB = await crearInmueble(eB.tenantId, `GOB4-t8b-${RUN_ID}`)
    await crearCoeficienteSet(eB.tenantId, [{ inmuebleId: inmB, valor: 1 }])
    const propB = await crearTercero(eB.tenantId, 'Prop', 't8b')
    await crearAsistencia(eB.tenantId, reunionB, inmB, propB)
    await instalar(eB.cliente, reunionB, presidenteB, secretarioB)
    await cerrarReunion(eB.cliente, reunionB)
    const { data: actaB } = await generarActa(reunionB)
    const { data: suscritaB } = await suscribirActa(actaB!.id, presidenteB, secretarioB)

    expect(suscritaB!.hash_contenido).not.toBe(suscritaA!.hash_contenido)
  }, 30_000)

  it('9. consecutivo sin huecos: generar 5, descartar 2 borradores, suscribir 3 → números 1, 2, 3', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('t9')
    const organoId = await crearOrgano(tenantId)
    const pTercero = await crearTercero(tenantId, 'Presidente', 't9')
    const sTercero = await crearTercero(tenantId, 'Secretario', 't9')
    const presidenteMiembroId = await crearMiembro(tenantId, organoId, pTercero, 'presidente')
    const secretarioMiembroId = await crearMiembro(tenantId, organoId, sTercero, 'secretario')
    const inmA = await crearInmueble(tenantId, `GOB4-t9-A-${RUN_ID}`)
    await crearCoeficienteSet(tenantId, [{ inmuebleId: inmA, valor: 1 }])
    const prop = await crearTercero(tenantId, 'Prop', 't9')

    const actaIds: string[] = []
    for (let n = 0; n < 5; n++) {
      const reunionId = await crearReunion(tenantId, organoId, `2026-06-0${String(n + 1)}T15:00:00Z`)
      await crearAgendaPunto(tenantId, reunionId, 1, `Punto ${String(n)}`)
      await crearAsistencia(tenantId, reunionId, inmA, prop)
      await instalar(cliente, reunionId, presidenteMiembroId, secretarioMiembroId)
      await cerrarReunion(cliente, reunionId)
      const { data: acta } = await generarActa(reunionId)
      actaIds.push(acta!.id)
    }

    // Descarta los 2 primeros borradores (nunca ocuparon número).
    await admin.from('gobierno_actas').delete().in('id', [actaIds[0]!, actaIds[1]!])

    const numeros: (number | null)[] = []
    for (const id of actaIds.slice(2)) {
      const { data: suscrita, error } = await suscribirActa(id, presidenteMiembroId, secretarioMiembroId)
      expect(error).toBeNull()
      numeros.push(suscrita!.numero)
    }
    expect(numeros).toEqual([1, 2, 3])
  }, 30_000)

  it('10. plazo_disposicion_limite = fecha de la reunión + 20 días hábiles, cruzando festivos colombianos', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('t10')
    const organoId = await crearOrgano(tenantId)
    const pTercero = await crearTercero(tenantId, 'Presidente', 't10')
    const sTercero = await crearTercero(tenantId, 'Secretario', 't10')
    const presidenteMiembroId = await crearMiembro(tenantId, organoId, pTercero, 'presidente')
    const secretarioMiembroId = await crearMiembro(tenantId, organoId, sTercero, 'secretario')
    // 2026-03-16 + 20 días hábiles cruza San José (19 mar, trasladado a lunes 23) y Semana Santa
    // (jueves santo 2 abr, viernes santo 3 abr) — verificado independientemente contra
    // gobierno_sumar_dias_habiles antes de escribir esta prueba: resultado 2026-04-16.
    const reunionId = await crearReunion(tenantId, organoId, '2026-03-16T15:00:00Z')
    await crearAgendaPunto(tenantId, reunionId, 1, 'Punto')
    await instalar(cliente, reunionId, presidenteMiembroId, secretarioMiembroId)
    await cerrarReunion(cliente, reunionId)

    const { data: acta } = await generarActa(reunionId)
    expect(acta!.plazo_disposicion_limite).toBe('2026-04-16')
  }, 30_000)

  it('11. un plazo de comisión verificadora superior a 20 días hábiles falla con VERIFICACION_PLAZO_EXCEDE_LEGAL', async () => {
    const e = await prepararReunionCerradaCompleta('t11')
    const { data: acta } = await generarActa(e.reunionId)
    const verificador = await crearTercero(e.tenantId, 'Verificador', 't11')

    const { error } = await admin.from('gobierno_acta_verificadores').insert({
      tenant_id: e.tenantId, acta_id: acta!.id, tercero_id: verificador, plazo_limite: '2027-01-01',
    })
    expect(error?.message).toContain('VERIFICACION_PLAZO_EXCEDE_LEGAL')
  }, 30_000)

  it('12. con comisión designada, el acta no pasa directo de borrador a suscrita', async () => {
    const e = await prepararReunionCerradaCompleta('t12')
    const { data: acta } = await generarActa(e.reunionId)
    const verificador = await crearTercero(e.tenantId, 'Verificador', 't12')

    const { error: errDesignar } = await admin.from('gobierno_acta_verificadores').insert({
      tenant_id: e.tenantId, acta_id: acta!.id, tercero_id: verificador, plazo_limite: acta!.plazo_disposicion_limite,
    })
    expect(errDesignar).toBeNull()

    const { data: releida } = await admin.from('gobierno_actas').select('estado').eq('id', acta!.id).single<{ estado: string }>()
    expect(releida!.estado).toBe('en_verificacion')
  }, 30_000)

  it('13. el enlace de consulta del acta caduca y registra la entrega', async () => {
    const e = await prepararReunionCerradaCompleta('t13')
    const { data: acta } = await generarActa(e.reunionId)
    const documentoId = await crearDocumentoActa(e.tenantId)
    await admin.from('gobierno_actas').update({ documento_id: documentoId }).eq('id', acta!.id)
    await suscribirActa(acta!.id, e.presidenteMiembroId, e.secretarioMiembroId)

    // Enlace de consulta con token real (GOB-0, reutilizado tal cual — genérico para cualquier
    // documento_id) con vigencia_dias:0 → ya vencido para cuando ver-documento lo consume.
    const { data: enlace, response: respEnlace } = await e.cliente.functions.invoke<RespuestaEnlace>(
      'generar-enlace-documento',
      { body: { documento_id: documentoId, vigencia_dias: 0 } },
    )
    expect(respEnlace?.status).toBe(200)
    const { data: verResult, response: respVer } = await admin.functions.invoke<RespuestaVerDocumento>(
      'ver-documento',
      { body: { id: documentoId, t: enlace!.token } },
    )
    expect(verResult).toBeNull()
    expect(respVer?.status).toBe(410)

    const { error: errEntregaAntesSuscrita } = await admin.from('gobierno_acta_entregas').insert({
      tenant_id: e.tenantId, acta_id: acta!.id, tipo: 'solicitud',
    })
    expect(errEntregaAntesSuscrita).toBeNull() // ya está suscrita en este punto

    const { error: errEntrega } = await admin.from('gobierno_acta_entregas').insert({
      tenant_id: e.tenantId, acta_id: acta!.id, tipo: 'entrega',
    })
    expect(errEntrega).toBeNull()

    const { data: releida } = await admin
      .from('gobierno_actas').select('estado, puesta_a_disposicion_at').eq('id', acta!.id)
      .single<{ estado: string; puesta_a_disposicion_at: string | null }>()
    expect(releida!.estado).toBe('publicada')
    expect(releida!.puesta_a_disposicion_at).not.toBeNull()

    const { error: errNegativaSinMotivo } = await admin.from('gobierno_acta_entregas').insert({
      tenant_id: e.tenantId, acta_id: acta!.id, tipo: 'negativa',
    })
    expect(errNegativaSinMotivo).not.toBeNull() // constraint: negativa exige motivo
  }, 30_000)

  it('14. aislamiento entre tenants', async () => {
    const a = await prepararReunionCerradaCompleta('t14a')
    const b = await crearTenantCompleto('t14b')
    const { data: actaA } = await generarActa(a.reunionId)

    const { data: vistaDesdeB } = await b.cliente.from('gobierno_actas').select('id').eq('id', actaA!.id)
    expect(vistaDesdeB).toHaveLength(0)
  }, 30_000)
})
