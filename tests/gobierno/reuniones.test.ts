/**
 * GOB-2 (20260931410000-20260931460000) — reunión, convocatoria, asistencia y poderes.
 * Ver Casos de uso/Tres Modulos/Gobierno/GOB_02_reunion_convocatoria_asistencia.md.
 *
 * Decisiones confirmadas en el Plan del corte:
 *  - instalar/cerrar una reunión exige rol administrador (segregación de funciones, marco §5.5) —
 *    prueba 15, añadida sobre las 14 del corte.
 *  - Envío de convocatoria: solo modelo de datos en este corte (gobierno_convocatorias/
 *    gobierno_convocatoria_envios), sin disparo automático de email/SMS.
 *  - Límite de poderes por apoderado: sin tope por defecto (remisión al reglamento, sin piso
 *    legal citado) — no probado aquí porque no existe la regla.
 *
 * fn_coeficiente_set_vigente(tenant, fecha): hallazgo del Plan del corte — no existía ninguna
 * función que resolviera el coeficiente_sets vigente A UNA FECHA (todo el repo solo filtraba
 * estado='vigente', el actual). Se agregó en 20260931420000_gob2_reuniones.sql.
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
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/gobierno/reuniones: faltan variables de Supabase en .env')
}

d('GOB-2: reunión, convocatoria, asistencia y poderes', () => {
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

  async function crearTenantCompleto(etiqueta: string): Promise<{ tenantId: string; cliente: Cliente; usuario: UsuarioPrueba }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const tenant = await crearTenant(admin, etiqueta, usuario.id)
    tenantsCreados.push(tenant.id)
    await crearMembership(admin, tenant.id, usuario.id, 'administrador')
    const cliente = await clienteComo(env!, usuario)
    return { tenantId: tenant.id, cliente, usuario }
  }

  async function crearInmueble(tenantId: string, codigo: string, tipoCodigo = 'apartamento'): Promise<string> {
    const tipoId = await idListaTipos('TIPO_INMUEBLE', tipoCodigo)
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
    vigenteDesde: string, vigenteHasta: string | null = null,
  ): Promise<string> {
    const rolId = await idListaTipos('PERSONA_PREDIO', rolCodigo)
    const { data, error } = await admin
      .from('inmueble_persona_rol')
      .insert({ tenant_id: tenantId, inmueble_id: inmuebleId, tercero_id: terceroId, rol_id: rolId, vigente_desde: vigenteDesde, vigente_hasta: vigenteHasta })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble_persona_rol (${rolCodigo}): ${error.message}`)
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
    const { error: errCoef } = await admin.from('coeficientes').insert(
      filas.map((f) => ({ tenant_id: tenantId, set_id: set.id, inmueble_id: f.inmuebleId, valor: f.valor })),
    )
    if (errCoef) throw new Error(`fixture coeficientes: ${errCoef.message}`)
    const { error: errActivar } = await admin.from('coeficiente_sets').update({ estado: 'vigente' }).eq('id', set.id)
    if (errActivar) throw new Error(`fixture activar coeficiente_sets: ${errActivar.message}`)
    return set.id
  }

  async function reemplazarCoeficienteSet(
    tenantId: string, anteriorSetId: string, nuevaVersion: number, nuevoVigenteDesde: string,
    filas: { inmuebleId: string; valor: number }[],
  ): Promise<string> {
    const { error: errRetiro } = await admin
      .from('coeficiente_sets')
      .update({ estado: 'historica', vigente_hasta: nuevoVigenteDesde })
      .eq('id', anteriorSetId)
    if (errRetiro) throw new Error(`fixture retirar coeficiente_sets: ${errRetiro.message}`)
    return crearCoeficienteSet(tenantId, nuevaVersion, nuevoVigenteDesde, filas)
  }

  async function crearDocumento(tenantId: string): Promise<string> {
    const tipoDocId = await idListaTipos('TIPO_DOCUMENTO', 'acta_asamblea')
    const { data, error } = await admin
      .from('documentos')
      .insert({
        tenant_id: tenantId, tipo_documento_id: tipoDocId,
        nombre_archivo: 'poder-fixture.pdf',
        storage_path: `${tenantId}/_copropiedad/${crypto.randomUUID()}/1_poder-fixture.pdf`,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture documento: ${error.message}`)
    return data.id
  }

  const FECHA_REUNION = '2026-06-01T15:00:00-05:00'

  interface Escenario {
    tenantId: string
    cliente: Cliente
    organoId: string
    presidenteMiembroId: string
    secretarioMiembroId: string
    coeficienteSetId: string
    inmuebleA: string
    inmuebleB: string
  }

  async function prepararEscenario(etiqueta: string): Promise<Escenario> {
    const { tenantId, cliente } = await crearTenantCompleto(etiqueta)
    const organoId = await crearOrgano(tenantId)
    const presidenteTercero = await crearTercero(tenantId, 'Presidente', etiqueta)
    const secretarioTercero = await crearTercero(tenantId, 'Secretario', etiqueta)
    const presidenteMiembroId = await crearMiembro(tenantId, organoId, presidenteTercero, 'presidente')
    const secretarioMiembroId = await crearMiembro(tenantId, organoId, secretarioTercero, 'secretario')
    const inmuebleA = await crearInmueble(tenantId, `GOB2-${etiqueta}-A-${RUN_ID}`)
    const inmuebleB = await crearInmueble(tenantId, `GOB2-${etiqueta}-B-${RUN_ID}`)
    const coeficienteSetId = await crearCoeficienteSet(tenantId, 1, '2020-01-01', [
      { inmuebleId: inmuebleA, valor: 0.5 },
      { inmuebleId: inmuebleB, valor: 0.5 },
    ])
    return { tenantId, cliente, organoId, presidenteMiembroId, secretarioMiembroId, coeficienteSetId, inmuebleA, inmuebleB }
  }

  async function crearReunion(e: Escenario, overrides: Record<string, unknown> = {}): Promise<string> {
    const tipoId = await idListaTipos('TIPO_REUNION', 'asamblea_ordinaria')
    const { data, error } = await admin
      .from('gobierno_reuniones')
      .insert({
        tenant_id: e.tenantId, organo_id: e.organoId, tipo_id: tipoId,
        modalidad: 'presencial', convocatoria_regimen: 'primera',
        fecha_hora: FECHA_REUNION, lugar: 'Salón comunal',
        ...overrides,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture reunion: ${error.message}`)
    return data.id
  }

  async function instalar(cliente: Cliente, reunionId: string, extra: Record<string, unknown> = {}) {
    return cliente.from('gobierno_reuniones').update({ estado: 'instalada', ...extra }).eq('id', reunionId).select('*').single()
  }

  it('1. instalar sin presidente o sin secretario falla con REUNION_SIN_PRESIDENTE_O_SECRETARIO', async () => {
    const e = await prepararEscenario('t1')
    const reunionId = await crearReunion(e)
    const { error } = await instalar(e.cliente, reunionId, { presidente_miembro_id: e.presidenteMiembroId, secretario_miembro_id: null })
    expect(error?.message).toContain('REUNION_SIN_PRESIDENTE_O_SECRETARIO')
  }, 30_000)

  it('2. al instalar se congela el coeficiente_set vigente a la fecha; cambiarlo después no altera la reunión (prueba central)', async () => {
    const e = await prepararEscenario('t2')
    const reunionId = await crearReunion(e)
    const { data: instalada, error } = await instalar(e.cliente, reunionId, {
      presidente_miembro_id: e.presidenteMiembroId, secretario_miembro_id: e.secretarioMiembroId,
    }).then((r) => r as { data: { coeficiente_set_id: string } | null; error: { message: string } | null })
    expect(error).toBeNull()
    expect(instalada?.coeficiente_set_id).toBe(e.coeficienteSetId)

    // Cambia el coeficiente_set vigente DESPUÉS de instalar (nueva versión, otro reparto).
    await reemplazarCoeficienteSet(e.tenantId, e.coeficienteSetId, 2, '2026-07-01', [
      { inmuebleId: e.inmuebleA, valor: 0.9 },
      { inmuebleId: e.inmuebleB, valor: 0.1 },
    ])

    const { data: releida, error: errReleer } = await admin
      .from('gobierno_reuniones').select('coeficiente_set_id').eq('id', reunionId).single<{ coeficiente_set_id: string }>()
    expect(errReleer).toBeNull()
    expect(releida?.coeficiente_set_id).toBe(e.coeficienteSetId)
  }, 30_000)

  it('3. cambiar el coeficiente_set de una reunión instalada falla con REUNION_COEFICIENTE_SET_INMUTABLE', async () => {
    const e = await prepararEscenario('t3')
    const reunionId = await crearReunion(e)
    await instalar(e.cliente, reunionId, { presidente_miembro_id: e.presidenteMiembroId, secretario_miembro_id: e.secretarioMiembroId })

    const otroSetId = await reemplazarCoeficienteSet(e.tenantId, e.coeficienteSetId, 2, '2027-01-01', [
      { inmuebleId: e.inmuebleA, valor: 0.5 }, { inmuebleId: e.inmuebleB, valor: 0.5 },
    ])
    const { error } = await admin.from('gobierno_reuniones').update({ coeficiente_set_id: otroSetId }).eq('id', reunionId)
    expect(error?.message).toContain('REUNION_COEFICIENTE_SET_INMUTABLE')
  }, 30_000)

  it('4. el orden del día no admite cambios tras instalar: AGENDA_INMUTABLE_TRAS_INSTALAR', async () => {
    const e = await prepararEscenario('t4')
    const reunionId = await crearReunion(e)
    const { data: punto, error: errPunto } = await admin
      .from('gobierno_agenda_puntos')
      .insert({ tenant_id: e.tenantId, reunion_id: reunionId, orden: 1, titulo: 'Aprobar presupuesto' })
      .select('id').single<{ id: string }>()
    expect(errPunto).toBeNull()

    await instalar(e.cliente, reunionId, { presidente_miembro_id: e.presidenteMiembroId, secretario_miembro_id: e.secretarioMiembroId })

    const { error: errUpdate } = await admin
      .from('gobierno_agenda_puntos').update({ titulo: 'Otro título' }).eq('id', punto!.id)
    expect(errUpdate?.message).toContain('AGENDA_INMUTABLE_TRAS_INSTALAR')

    const { error: errInsert } = await admin
      .from('gobierno_agenda_puntos').insert({ tenant_id: e.tenantId, reunion_id: reunionId, orden: 2, titulo: 'Punto nuevo' })
    expect(errInsert?.message).toContain('AGENDA_INMUTABLE_TRAS_INSTALAR')
  }, 30_000)

  it('5. segunda convocatoria sin antecedente falla con SEGUNDA_CONVOCATORIA_SIN_ANTECEDENTE', async () => {
    const e = await prepararEscenario('t5')
    const { error } = await admin.from('gobierno_reuniones').insert({
      tenant_id: e.tenantId, organo_id: e.organoId, tipo_id: await idListaTipos('TIPO_REUNION', 'asamblea_ordinaria'),
      modalidad: 'presencial', convocatoria_regimen: 'segunda', fecha_hora: FECHA_REUNION, lugar: 'Salón comunal',
    })
    expect(error?.message).toContain('SEGUNDA_CONVOCATORIA_SIN_ANTECEDENTE')
  }, 30_000)

  it('6. universal_sin_convocatoria con asistencia inferior al 100% falla con REUNION_UNIVERSAL_SIN_TOTALIDAD_COEFICIENTES', async () => {
    const e = await prepararEscenario('t6')
    const reunionId = await crearReunion(e, { convocatoria_regimen: 'universal_sin_convocatoria' })
    const tercero = await crearTercero(e.tenantId, 'Propietario', 'A-t6')
    await vincularRol(e.tenantId, e.inmuebleA, tercero, 'copropietario', '2020-01-01')
    const { error: errAsist } = await admin.from('gobierno_asistencia').insert({
      tenant_id: e.tenantId, reunion_id: reunionId, inmueble_id: e.inmuebleA, asistente_ref: tercero, calidad: 'propietario',
    })
    expect(errAsist).toBeNull()
    // Solo inmuebleA (0.5 de 1.0) está presente — no alcanza el 100%.
    const { error } = await instalar(e.cliente, reunionId, { presidente_miembro_id: e.presidenteMiembroId, secretario_miembro_id: e.secretarioMiembroId })
    expect(error?.message).toContain('REUNION_UNIVERSAL_SIN_TOTALIDAD_COEFICIENTES')
  }, 30_000)

  it('7. un tenedor sin poder no puede registrarse como apoderado ni propietario: ASISTENCIA_TENEDOR_SIN_PODER', async () => {
    const e = await prepararEscenario('t7')
    const reunionId = await crearReunion(e)
    const arrendatario = await crearTercero(e.tenantId, 'Arrendatario', 'B-t7')
    await vincularRol(e.tenantId, e.inmuebleA, arrendatario, 'arrendatario', '2020-01-01')

    const { error } = await admin.from('gobierno_asistencia').insert({
      tenant_id: e.tenantId, reunion_id: reunionId, inmueble_id: e.inmuebleA, asistente_ref: arrendatario, calidad: 'propietario',
    })
    expect(error?.message).toContain('ASISTENCIA_TENEDOR_SIN_PODER')
  }, 30_000)

  it('8. un poder sin documento no se valida: PODER_SIN_SOPORTE', async () => {
    const e = await prepararEscenario('t8')
    const reunionId = await crearReunion(e)
    const otorgante = await crearTercero(e.tenantId, 'Otorgante', 'C-t8')
    const apoderado = await crearTercero(e.tenantId, 'Apoderado', 'C-t8')
    const { data: poder, error: errPoder } = await admin
      .from('gobierno_poderes')
      .insert({ tenant_id: e.tenantId, reunion_id: reunionId, otorgante_ref: otorgante, inmueble_id: e.inmuebleA, apoderado_ref: apoderado })
      .select('id').single<{ id: string }>()
    expect(errPoder).toBeNull()

    const { error } = await admin.from('gobierno_poderes').update({ validado_at: new Date().toISOString() }).eq('id', poder!.id)
    expect(error?.message).toContain('PODER_SIN_SOPORTE')

    // Con documento_id sí se valida.
    const documentoId = await crearDocumento(e.tenantId)
    const { error: errConDocumento } = await admin
      .from('gobierno_poderes').update({ documento_id: documentoId, validado_at: new Date().toISOString() }).eq('id', poder!.id)
    expect(errConDocumento).toBeNull()
  }, 30_000)

  it('9. un inmueble representado dos veces falla con ASISTENCIA_INMUEBLE_DUPLICADO', async () => {
    const e = await prepararEscenario('t9')
    const reunionId = await crearReunion(e)
    const propietario1 = await crearTercero(e.tenantId, 'Prop1', 'D-t9')
    const propietario2 = await crearTercero(e.tenantId, 'Prop2', 'D-t9')
    await vincularRol(e.tenantId, e.inmuebleA, propietario1, 'copropietario', '2020-01-01')

    const { error: err1 } = await admin.from('gobierno_asistencia').insert({
      tenant_id: e.tenantId, reunion_id: reunionId, inmueble_id: e.inmuebleA, asistente_ref: propietario1, calidad: 'propietario',
    })
    expect(err1).toBeNull()

    const { error: err2 } = await admin.from('gobierno_asistencia').insert({
      tenant_id: e.tenantId, reunion_id: reunionId, inmueble_id: e.inmuebleA, asistente_ref: propietario2, calidad: 'invitado',
    })
    expect(err2?.message).toContain('ASISTENCIA_INMUEBLE_DUPLICADO')
  }, 30_000)

  it('10. el coeficiente acumulado suma correctamente y cambia al registrar una salida', async () => {
    const e = await prepararEscenario('t10')
    const reunionId = await crearReunion(e)
    const prop1 = await crearTercero(e.tenantId, 'Prop1', 'E-t10')
    const prop2 = await crearTercero(e.tenantId, 'Prop2', 'E-t10')
    await vincularRol(e.tenantId, e.inmuebleA, prop1, 'copropietario', '2020-01-01')
    await vincularRol(e.tenantId, e.inmuebleB, prop2, 'copropietario', '2020-01-01')

    const { data: asistA, error: errA } = await admin.from('gobierno_asistencia').insert({
      tenant_id: e.tenantId, reunion_id: reunionId, inmueble_id: e.inmuebleA, asistente_ref: prop1, calidad: 'propietario',
    }).select('id, ingreso_at').single<{ id: string; ingreso_at: string }>()
    expect(errA).toBeNull()
    const { error: errB } = await admin.from('gobierno_asistencia').insert({
      tenant_id: e.tenantId, reunion_id: reunionId, inmueble_id: e.inmuebleB, asistente_ref: prop2, calidad: 'propietario',
    })
    expect(errB).toBeNull()

    const { data: total1, error: errTotal1 } = await admin.rpc('gobierno_reunion_coeficiente_actual', { p_reunion_id: reunionId })
    expect(errTotal1).toBeNull()
    expect(Number(total1)).toBeCloseTo(1.0, 6)

    // salida_at se deriva de ingreso_at (devuelto por la propia BD), no del reloj local del test
    // runner: el guard exige salida_at >= ingreso_at, y comparar contra `new Date()` local es
    // frágil si hay desfase de reloj entre esta máquina y el servidor de Supabase (mismo tipo de
    // problema ya documentado para fetch de Node, ver DECISIONES.md/memoria de proyecto).
    const salidaAt = new Date(new Date(asistA!.ingreso_at).getTime() + 60_000).toISOString()
    const { error: errSalida } = await admin
      .from('gobierno_asistencia').update({ salida_at: salidaAt }).eq('id', asistA!.id)
    expect(errSalida).toBeNull()

    const { data: total2, error: errTotal2 } = await admin.rpc('gobierno_reunion_coeficiente_actual', { p_reunion_id: reunionId })
    expect(errTotal2).toBeNull()
    expect(Number(total2)).toBeCloseTo(0.5, 6)
  }, 30_000)

  it('11. un invitado no aporta coeficiente', async () => {
    const e = await prepararEscenario('t11')
    const reunionId = await crearReunion(e)
    const invitado = await crearTercero(e.tenantId, 'Invitado', 'F-t11')
    const { data: asistencia, error } = await admin.from('gobierno_asistencia').insert({
      tenant_id: e.tenantId, reunion_id: reunionId, inmueble_id: e.inmuebleA, asistente_ref: invitado, calidad: 'invitado',
    }).select('coeficiente').single<{ coeficiente: string }>()
    expect(error).toBeNull()
    expect(Number(asistencia?.coeficiente)).toBe(0)

    const { data: total, error: errTotal } = await admin.rpc('gobierno_reunion_coeficiente_actual', { p_reunion_id: reunionId })
    expect(errTotal).toBeNull()
    expect(Number(total)).toBe(0)
  }, 30_000)

  it('12. una reunión cerrada es inmutable: REUNION_CERRADA_INMUTABLE', async () => {
    const e = await prepararEscenario('t12')
    const reunionId = await crearReunion(e)
    await instalar(e.cliente, reunionId, { presidente_miembro_id: e.presidenteMiembroId, secretario_miembro_id: e.secretarioMiembroId })
    const { error: errCerrar } = await e.cliente.from('gobierno_reuniones').update({ estado: 'cerrada' }).eq('id', reunionId)
    expect(errCerrar).toBeNull()

    const { error } = await admin.from('gobierno_reuniones').update({ lugar: 'Otro lugar' }).eq('id', reunionId)
    expect(error?.message).toContain('REUNION_CERRADA_INMUTABLE')
  }, 30_000)

  it('13. aislamiento entre tenants', async () => {
    const a = await prepararEscenario('t13a')
    const b = await prepararEscenario('t13b')
    const reunionA = await crearReunion(a)

    const { data: vistaDesdeB } = await b.cliente.from('gobierno_reuniones').select('*').eq('id', reunionA)
    expect(vistaDesdeB).toHaveLength(0)

    const { error: errCruzado } = await admin
      .from('gobierno_reuniones')
      .insert({
        tenant_id: a.tenantId, organo_id: b.organoId, tipo_id: await idListaTipos('TIPO_REUNION', 'asamblea_ordinaria'),
        modalidad: 'presencial', convocatoria_regimen: 'primera', fecha_hora: FECHA_REUNION, lugar: 'x',
      })
    expect(errCruzado?.message).toContain('REUNION_ORGANO_INVALIDO')
  }, 30_000)

  it('14. los enums nuevos de GOB-2 tienen comment on type (D-24)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const archivo = path.resolve(import.meta.dirname, '../../supabase/migrations/20260931410000_gob2_vocabulario.sql')
    const contenido = await fs.readFile(archivo, 'utf8')
    for (const tipo of ['reunion_modalidad_t', 'reunion_convocatoria_t', 'reunion_estado_t', 'asistencia_calidad_t']) {
      expect(contenido).toMatch(new RegExp(`create type public\\.${tipo} as enum`))
      expect(contenido).toMatch(new RegExp(`comment on type public\\.${tipo} is`))
    }
  })

  it('15. instalar o cerrar sin rol administrador falla con REUNION_TRANSICION_REQUIERE_ADMINISTRADOR', async () => {
    const e = await prepararEscenario('t15')
    const auxiliarUsuario = await crearUsuario(admin, 't15-aux')
    usuariosCreados.push(auxiliarUsuario)
    await crearMembership(admin, e.tenantId, auxiliarUsuario.id, 'auxiliar')
    const clienteAuxiliar = await clienteComo(env!, auxiliarUsuario)

    const reunionId = await crearReunion(e)
    const { error } = await instalar(clienteAuxiliar, reunionId, {
      presidente_miembro_id: e.presidenteMiembroId, secretario_miembro_id: e.secretarioMiembroId,
    })
    expect(error?.message).toContain('REUNION_TRANSICION_REQUIERE_ADMINISTRADOR')
  }, 30_000)

  it('16. una reunión cerrada no admite nueva asistencia ni poderes: ASISTENCIA_REUNION_CERRADA / PODER_REUNION_CERRADA', async () => {
    // Regresión encontrada en pruebas manuales de navegador durante GOB-2 (no la detectaron las
    // 15 pruebas automatizadas originales): tras cerrar una reunión, la UI/BD seguían permitiendo
    // registrar asistencia y poderes nuevos. Corregido en 20260931480000_gob2_fix_asistencia_
    // poder_reunion_cerrada.sql.
    const e = await prepararEscenario('t16')
    const reunionId = await crearReunion(e)
    await instalar(e.cliente, reunionId, { presidente_miembro_id: e.presidenteMiembroId, secretario_miembro_id: e.secretarioMiembroId })
    const { error: errCerrar } = await e.cliente.from('gobierno_reuniones').update({ estado: 'cerrada' }).eq('id', reunionId)
    expect(errCerrar).toBeNull()

    const tercero = await crearTercero(e.tenantId, 'Propietario', 'G-t16')
    await vincularRol(e.tenantId, e.inmuebleA, tercero, 'copropietario', '2020-01-01')
    const { error: errAsistencia } = await admin.from('gobierno_asistencia').insert({
      tenant_id: e.tenantId, reunion_id: reunionId, inmueble_id: e.inmuebleA, asistente_ref: tercero, calidad: 'propietario',
    })
    expect(errAsistencia?.message).toContain('ASISTENCIA_REUNION_CERRADA')

    const otorgante = await crearTercero(e.tenantId, 'Otorgante', 'G-t16')
    const apoderado = await crearTercero(e.tenantId, 'Apoderado', 'G-t16')
    const { error: errPoder } = await admin.from('gobierno_poderes').insert({
      tenant_id: e.tenantId, reunion_id: reunionId, otorgante_ref: otorgante, inmueble_id: e.inmuebleB, apoderado_ref: apoderado,
    })
    expect(errPoder?.message).toContain('PODER_REUNION_CERRADA')
  }, 30_000)
})
