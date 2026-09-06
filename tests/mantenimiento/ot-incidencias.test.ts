/**
 * MANT-4 (20260930890000-20260930980000) — incidencias y órdenes de trabajo.
 * Ver Casos de uso/Tres Modulos/Mantenimiento/MANT_04_incidencias_ordenes_trabajo.md.
 *
 * AD-26 aplicado en este corte: mientras no exista GOB_00_DECISION_AD26.md, toda incidencia la
 * inserta un usuario CON sesión (auxiliar/administrador). El reportante (residente, vigilancia)
 * es siempre texto libre (reportante_ref/reportante_contacto), nunca un principal de
 * autenticación — la prueba 12 confirma exactamente esto, no que exista un INSERT anónimo.
 * La escritura por QR sin sesión queda fuera de alcance (§3.5 del corte).
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import type { Database } from '@aquila/shared'
import {
  clienteAdmin,
  clienteComo,
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
  console.warn('SALTADO tests/mantenimiento/ot-incidencias: faltan variables de Supabase en .env')
}

function sumarMeses(fechaIso: string, meses: number): string {
  const fecha = new Date(`${fechaIso}T00:00:00Z`)
  fecha.setUTCMonth(fecha.getUTCMonth() + meses)
  return fecha.toISOString().slice(0, 10)
}

const HOY = new Date().toISOString().slice(0, 10)

d('MANT-4: incidencias y órdenes de trabajo', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function crearTenantCompleto(etiqueta: string): Promise<{ tenantId: string; cliente: Cliente }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)
    const { data: tenant, error } = await cliente
      .rpc('create_tenant', { p_name: `MANT-4 ${etiqueta}`, p_slug: `t-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    return { tenantId: tenant.id, cliente }
  }

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', tipo).eq('codigo', codigo).is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  async function crearActivoMinimo(tenantId: string, codigo: string, tipoId: number, categoriaId: number): Promise<string> {
    const { data, error } = await admin
      .from('activos')
      .insert({
        tenant_id: tenantId, codigo, nombre: codigo, categoria_id: categoriaId, tipo_id: tipoId,
        naturaleza_bien: 'bien_propio', origen: 'comprado', estado: 'en_servicio',
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture activo ${codigo}: ${error.message}`)
    return data.id
  }

  async function requisitoPorCodigo(tenantId: string, codigo: string) {
    const { data, error } = await admin
      .from('mant_requisito').select('*').eq('tenant_id', tenantId).eq('codigo', codigo).single()
    if (error) throw new Error(`fixture requisito ${codigo}: ${error.message}`)
    return data
  }

  // ── Criticidad (MANT-1) mínima: un set con un solo criterio y una sola banda que cubre ──
  // cualquier puntaje, para que mant_criticidad(activo_id).banda sea determinística.
  async function configurarCriticidad(tenantId: string, activoId: string, etiquetaBanda: string): Promise<void> {
    const { data: set, error: errSet } = await admin
      .from('mant_criticidad_set').insert({ tenant_id: tenantId, version: 1 }).select('id').single<{ id: string }>()
    if (errSet) throw new Error(`fixture set criticidad: ${errSet.message}`)
    const { data: criterio, error: errCrit } = await admin
      .from('mant_criticidad_criterio')
      .insert({ tenant_id: tenantId, set_id: set.id, codigo: 'unico', nombre: 'unico', peso: 100, escala: { alto: 100 } })
      .select('id').single<{ id: string }>()
    if (errCrit) throw new Error(`fixture criterio: ${errCrit.message}`)
    const { error: errBanda } = await admin
      .from('mant_criticidad_banda')
      .insert({ tenant_id: tenantId, set_id: set.id, etiqueta: etiquetaBanda, puntaje_desde: 0, puntaje_hasta: null, orden: 10 })
    if (errBanda) throw new Error(`fixture banda: ${errBanda.message}`)
    const { error: errActivar } = await admin.from('mant_criticidad_set').update({ estado: 'vigente' }).eq('id', set.id)
    if (errActivar) throw new Error(`activar set: ${errActivar.message}`)
    const { error: errEval } = await admin
      .from('mant_activo_criticidad').upsert(
        { tenant_id: tenantId, activo_id: activoId, criterio_id: criterio.id, valor: 'alto' },
        { onConflict: 'activo_id,criterio_id' },
      )
    if (errEval) throw new Error(`fixture evaluación: ${errEval.message}`)
  }

  type IncidenciaInsert = Database['public']['Tables']['mant_incidencias']['Insert']
  async function crearIncidencia(cliente: Cliente, overrides: IncidenciaInsert) {
    return await cliente.from('mant_incidencias').insert(overrides).select('*').single()
  }

  type OtInsert = Database['public']['Tables']['mant_ordenes_trabajo']['Insert']
  async function crearOt(cliente: Cliente, overrides: Omit<OtInsert, 'origen'> & { origen?: OtInsert['origen'] }) {
    return await cliente.from('mant_ordenes_trabajo').insert({ origen: 'manual', ...overrides }).select('*').single()
  }

  type OtEstado = Database['public']['Enums']['ot_estado_t']
  async function avanzarOt(otId: string, ...estados: OtEstado[]): Promise<void> {
    for (const estado of estados) {
      const patch: Database['public']['Tables']['mant_ordenes_trabajo']['Update'] = { estado }
      if (estado === 'ejecutada') patch.ejecutada_at = new Date().toISOString()
      const { error } = await admin.from('mant_ordenes_trabajo').update(patch).eq('id', otId)
      if (error) throw new Error(`avanzar OT a ${estado}: ${error.message}`)
    }
  }

  it('1. consecutivos de incidencia y de OT sin huecos', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('consecutivos')
    const tipoActivoId = await idListaTipos('TIPO_ACTIVO', 'extintor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'seguridad')
    const activoId = await crearActivoMinimo(tenantId, `EXT-${RUN_ID}`, tipoActivoId, categoriaId)
    const tipoIncId = await idListaTipos('TIPO_INCIDENCIA', 'falla')
    const origenId = await idListaTipos('ORIGEN_REPORTE', 'vigilancia')
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'correctivo')

    const { data: inc1, error: e1 } = await crearIncidencia(cliente, {
      tenant_id: tenantId, activo_id: activoId, tipo_id: tipoIncId, origen_id: origenId, titulo: 'Incidencia 1',
    })
    expect(e1).toBeNull()
    const { data: inc2, error: e2 } = await crearIncidencia(cliente, {
      tenant_id: tenantId, activo_id: activoId, tipo_id: tipoIncId, origen_id: origenId, titulo: 'Incidencia 2',
    })
    expect(e2).toBeNull()
    expect(inc2!.numero).toBe(inc1!.numero + 1)

    const { data: ot1, error: eo1 } = await crearOt(cliente, {
      tenant_id: tenantId, activo_id: activoId, tipo_mantenimiento_id: tipoMantId, titulo: 'OT 1',
    })
    expect(eo1).toBeNull()
    const { data: ot2, error: eo2 } = await crearOt(cliente, {
      tenant_id: tenantId, activo_id: activoId, tipo_mantenimiento_id: tipoMantId, titulo: 'OT 2',
    })
    expect(eo2).toBeNull()
    expect(ot2!.numero).toBe(ot1!.numero + 1)
  }, 20_000)

  it('2. descartar una incidencia sin motivo falla con INCIDENCIA_DESCARTE_SIN_MOTIVO', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('descarte-sin-motivo')
    const tipoIncId = await idListaTipos('TIPO_INCIDENCIA', 'solicitud')
    const origenId = await idListaTipos('ORIGEN_REPORTE', 'residente')
    const { data: inc } = await crearIncidencia(cliente, {
      tenant_id: tenantId, tipo_id: tipoIncId, origen_id: origenId, titulo: 'Solicitud sin sustento',
    })
    const { error } = await cliente.from('mant_incidencias').update({ estado: 'descartada' }).eq('id', inc!.id)
    expect(error?.message).toContain('INCIDENCIA_DESCARTE_SIN_MOTIVO')

    const { error: errOk } = await cliente
      .from('mant_incidencias').update({ estado: 'descartada', descartada_motivo: 'Duplicada' }).eq('id', inc!.id)
    expect(errOk).toBeNull()
  }, 20_000)

  it('3. mant_prioridad_sugerida devuelve la prioridad esperada con desglose', async () => {
    const { tenantId } = await crearTenantCompleto('prioridad-sugerida')
    const tipoActivoId = await idListaTipos('TIPO_ACTIVO', 'ascensor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'transporte_vertical')
    const activoId = await crearActivoMinimo(tenantId, `ASC-${RUN_ID}`, tipoActivoId, categoriaId)
    await configurarCriticidad(tenantId, activoId, 'alto')

    const severidadGraveId = await idListaTipos('SEVERIDAD_INCIDENCIA', 'grave')
    const prioridadAltaId = await idListaTipos('PRIORIDAD', 'alta')
    const { error: errMatriz } = await admin.from('mant_matriz_prioridad').insert({
      tenant_id: tenantId, banda_criticidad: 'alto', severidad_id: severidadGraveId, prioridad_id: prioridadAltaId,
    })
    expect(errMatriz).toBeNull()

    const { data, error } = await admin
      .rpc('mant_prioridad_sugerida', { p_activo_id: activoId, p_severidad_id: severidadGraveId })
      .single<{ prioridad_id: number; banda_criticidad: string; severidad_nombre: string; encontrada: boolean }>()
    expect(error).toBeNull()
    expect(data!.encontrada).toBe(true)
    expect(data!.prioridad_id).toBe(prioridadAltaId)
    expect(data!.banda_criticidad).toBe('alto')
    expect(data!.severidad_nombre).toBe('Grave')
  }, 20_000)

  it('4. sobrescribir la prioridad sugerida sin motivo falla con PRIORIDAD_SOBRESCRITA_SIN_MOTIVO', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('prioridad-sobrescrita')
    const tipoActivoId = await idListaTipos('TIPO_ACTIVO', 'ascensor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'transporte_vertical')
    const activoId = await crearActivoMinimo(tenantId, `ASC-${RUN_ID}`, tipoActivoId, categoriaId)
    await configurarCriticidad(tenantId, activoId, 'alto')

    const severidadGraveId = await idListaTipos('SEVERIDAD_INCIDENCIA', 'grave')
    const prioridadAltaId = await idListaTipos('PRIORIDAD', 'alta')
    const prioridadBajaId = await idListaTipos('PRIORIDAD', 'baja')
    await admin.from('mant_matriz_prioridad').insert({
      tenant_id: tenantId, banda_criticidad: 'alto', severidad_id: severidadGraveId, prioridad_id: prioridadAltaId,
    })
    const tipoIncId = await idListaTipos('TIPO_INCIDENCIA', 'falla')
    const origenId = await idListaTipos('ORIGEN_REPORTE', 'residente')

    const { error } = await crearIncidencia(cliente, {
      tenant_id: tenantId, activo_id: activoId, tipo_id: tipoIncId, origen_id: origenId,
      titulo: 'Ascensor con ruido', severidad_id: severidadGraveId, prioridad_id: prioridadBajaId,
    })
    expect(error?.message).toContain('PRIORIDAD_SOBRESCRITA_SIN_MOTIVO')

    const { data: ok, error: errOk } = await crearIncidencia(cliente, {
      tenant_id: tenantId, activo_id: activoId, tipo_id: tipoIncId, origen_id: origenId,
      titulo: 'Ascensor con ruido', severidad_id: severidadGraveId, prioridad_id: prioridadBajaId,
      prioridad_sobrescrita_motivo: 'El residente insiste que es urgente pese al análisis',
    })
    expect(errOk).toBeNull()
    expect(ok?.prioridad_sugerida_id).toBe(prioridadAltaId)
    expect(ok?.prioridad_id).toBe(prioridadBajaId)
  }, 20_000)

  it('5. cerrar una OT con una tarea obligatoria pendiente falla con OT_CIERRE_INCOMPLETO', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('cierre-incompleto')
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'correctivo')
    const { data: ot } = await crearOt(cliente, { tenant_id: tenantId, tipo_mantenimiento_id: tipoMantId, titulo: 'OT con tarea pendiente' })
    await admin.from('mant_ot_tareas').insert({
      tenant_id: tenantId, ot_id: ot!.id, orden: 1, descripcion: 'Revisar presión', obligatoria: true,
    })
    await avanzarOt(ot!.id, 'programada', 'asignada', 'en_ejecucion', 'ejecutada')

    const { error } = await admin.rpc('fn_mant_cerrar_ot', { p_ot_id: ot!.id })
    expect(error?.message).toContain('OT_CIERRE_INCOMPLETO')
    expect(error?.message).toContain('Revisar presión')
  }, 20_000)

  it('6. una tarea obligatoria marcada no_aplica sin motivo falla con TAREA_NO_APLICA_SIN_MOTIVO', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('no-aplica-sin-motivo')
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'correctivo')
    const { data: ot } = await crearOt(cliente, { tenant_id: tenantId, tipo_mantenimiento_id: tipoMantId, titulo: 'OT' })
    const { data: tarea } = await admin.from('mant_ot_tareas').insert({
      tenant_id: tenantId, ot_id: ot!.id, orden: 1, descripcion: 'Purgar aire', obligatoria: true,
    }).select('id').single<{ id: string }>()

    const { error } = await admin.from('mant_ot_tareas').update({ estado: 'no_aplica' }).eq('id', tarea!.id)
    expect(error?.message).toContain('TAREA_NO_APLICA_SIN_MOTIVO')

    const { error: errOk } = await admin
      .from('mant_ot_tareas').update({ estado: 'no_aplica', no_aplica_motivo: 'Equipo reemplazado' }).eq('id', tarea!.id)
    expect(errOk).toBeNull()
  }, 20_000)

  it('7. cerrar una OT con requisito_id genera el cumplimiento en MANT-2, con su evidencia', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('cumplimiento-generado')
    const tipoTanqueId = await idListaTipos('TIPO_ACTIVO', 'tanque')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'hidraulico')
    const activoId = await crearActivoMinimo(tenantId, `TQ-${RUN_ID}`, tipoTanqueId, categoriaId)
    const requisito = await requisitoPorCodigo(tenantId, 'TANQUE_LAVADO') // requiere_tercero_acreditado = false
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'reglamentario')

    const { data: ot } = await crearOt(cliente, {
      tenant_id: tenantId, activo_id: activoId, tipo_mantenimiento_id: tipoMantId, requisito_id: requisito.id,
      titulo: 'Lavado de tanque',
    })
    await avanzarOt(ot!.id, 'programada', 'asignada', 'en_ejecucion', 'ejecutada')

    const fechaCierre = HOY
    const { data: cerrada, error } = await admin.rpc('fn_mant_cerrar_ot', {
      p_ot_id: ot!.id, p_fecha_cierre: fechaCierre,
    }).single<{ estado: string }>()
    expect(error).toBeNull()
    expect(cerrada?.estado).toBe('cerrada')

    const { data: cumplimiento, error: errCump } = await admin
      .from('mant_cumplimiento').select('*').eq('requisito_id', requisito.id).eq('activo_id', activoId).single()
    expect(errCump).toBeNull()
    expect(cumplimiento?.fecha_cumplimiento).toBe(fechaCierre)
    expect(cumplimiento?.evidencia_referencia).toContain(String(ot!.numero))
  }, 20_000)

  it('8. requisito que exige tercero acreditado sin acreditación en la OT falla con OT_CUMPLIMIENTO_SIN_ACREDITACION', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('sin-acreditacion')
    const tipoExtintorId = await idListaTipos('TIPO_ACTIVO', 'extintor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'seguridad')
    const activoId = await crearActivoMinimo(tenantId, `EXT-${RUN_ID}`, tipoExtintorId, categoriaId)
    const requisito = await requisitoPorCodigo(tenantId, 'EXTINTOR_MANTENIMIENTO') // requiere_tercero_acreditado = true
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'reglamentario')

    const { data: ot } = await crearOt(cliente, {
      tenant_id: tenantId, activo_id: activoId, tipo_mantenimiento_id: tipoMantId, requisito_id: requisito.id,
      titulo: 'Mantenimiento de extintor',
    })
    await avanzarOt(ot!.id, 'programada', 'asignada', 'en_ejecucion', 'ejecutada')

    const { error } = await admin.rpc('fn_mant_cerrar_ot', { p_ot_id: ot!.id })
    expect(error?.message).toContain('OT_CUMPLIMIENTO_SIN_ACREDITACION')
  }, 20_000)

  it('9. una medición fuera de rango genera una incidencia de anomalía enlazada', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('medicion-fuera-rango')
    const tipoActivoId = await idListaTipos('TIPO_ACTIVO', 'bomba')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'hidraulico')
    const activoId = await crearActivoMinimo(tenantId, `BOM-${RUN_ID}`, tipoActivoId, categoriaId)
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'preventivo')
    const { data: def } = await admin.from('mant_atributo_definicion').insert({
      tenant_id: tenantId, tipo_activo_id: tipoActivoId, codigo: 'presion', nombre: 'Presión', tipo_dato: 'numero',
    }).select('id').single<{ id: string }>()

    const { data: ot } = await crearOt(cliente, { tenant_id: tenantId, activo_id: activoId, tipo_mantenimiento_id: tipoMantId, titulo: 'Revisión de presión' })
    const { data: medicion, error } = await admin.from('mant_ot_mediciones').insert({
      tenant_id: tenantId, ot_id: ot!.id, atributo_definicion_id: def!.id, valor: 999, rango_min: 0, rango_max: 10,
    }).select('*').single()
    expect(error).toBeNull()
    expect(medicion?.fuera_de_rango).toBe(true)
    expect(medicion?.incidencia_generada_id).toBeTruthy()

    const { data: incidencia, error: errInc } = await admin
      .from('mant_incidencias').select('activo_id, tipo_id, origen_id')
      .eq('id', medicion!.incidencia_generada_id!)
      .single<{ activo_id: string; tipo_id: number; origen_id: number }>()
    expect(errInc).toBeNull()
    const tipoAnomaliaId = await idListaTipos('TIPO_INCIDENCIA', 'anomalia')
    const origenMedicionId = await idListaTipos('ORIGEN_REPORTE', 'medicion')
    expect(incidencia?.tipo_id).toBe(tipoAnomaliaId)
    expect(incidencia?.origen_id).toBe(origenMedicionId)
    expect(incidencia?.activo_id).toBe(activoId)
  }, 20_000)

  it('10. una OT cerrada es inmutable con OT_CERRADA_INMUTABLE', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('ot-cerrada-inmutable')
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'correctivo')
    const { data: ot } = await crearOt(cliente, { tenant_id: tenantId, tipo_mantenimiento_id: tipoMantId, titulo: 'OT sin tareas' })
    await avanzarOt(ot!.id, 'programada', 'asignada', 'en_ejecucion', 'ejecutada')
    const { error: errCerrar } = await admin.rpc('fn_mant_cerrar_ot', { p_ot_id: ot!.id })
    expect(errCerrar).toBeNull()

    const { error } = await admin.from('mant_ordenes_trabajo').update({ titulo: 'Otro título' }).eq('id', ot!.id)
    expect(error?.message).toContain('OT_CERRADA_INMUTABLE')
  }, 20_000)

  it('11. cerrar una OT originada en programación desplaza la siguiente según la política de MANT-3', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('encadenamiento-mant3')
    const tipoActivoId = await idListaTipos('TIPO_ACTIVO', 'extintor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'seguridad')
    const activoId = await crearActivoMinimo(tenantId, `EXT-${RUN_ID}`, tipoActivoId, categoriaId)
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'preventivo')

    const { data: plan } = await cliente.from('mant_planes').insert({
      tenant_id: tenantId, codigo: 'PLAN-ENCADENAMIENTO', nombre: 'PLAN-ENCADENAMIENTO',
      tipo_mantenimiento_id: tipoMantId, alcance: 'activo', alcance_activo_id: activoId,
      frecuencia_meses: 1, frecuencia_origen: 'propia', ventana_dias: 5, horizonte_meses: 1,
    }).select('*').single()
    await admin.from('mant_plan_tareas').insert({ tenant_id: tenantId, plan_id: plan!.id, orden: 1, descripcion: 'Revisar' })
    await cliente.rpc('fn_mant_activar_plan', { p_plan_id: plan!.id })

    const { data: prog } = await admin.from('mant_programaciones').select('*').eq('plan_id', plan!.id).single()
    expect(prog).toBeTruthy()

    const { data: ot, error: errGenerarOt } = await admin
      .rpc('fn_mant_generar_ot_desde_programacion', { p_programacion_id: prog!.id }).single<{ id: string; numero: number }>()
    expect(errGenerarOt).toBeNull()
    await admin.from('mant_ot_tareas').update({ estado: 'ejecutada', ejecutada_at: new Date().toISOString() }).eq('ot_id', ot!.id)
    await avanzarOt(ot!.id, 'asignada', 'en_ejecucion', 'ejecutada')

    // Amplía el horizonte para que la siguiente programación quepa, y cierra con retraso real.
    await admin.from('mant_planes').update({ horizonte_meses: 3 }).eq('id', plan!.id)
    const fechaCierreReal = sumarMeses(HOY, 2)
    const { error: errCerrar } = await admin.rpc('fn_mant_cerrar_ot', { p_ot_id: ot!.id, p_fecha_cierre: fechaCierreReal })
    expect(errCerrar).toBeNull()

    const { data: progCerrada } = await admin.from('mant_programaciones').select('*').eq('id', prog!.id).single()
    expect(progCerrada?.estado).toBe('generada')
    expect(progCerrada?.orden_trabajo_id).toBe(ot!.id)

    await cliente.rpc('fn_mant_generar_programaciones', { p_plan_id: plan!.id })
    const { data: siguientes } = await admin
      .from('mant_programaciones').select('fecha_programada').eq('plan_id', plan!.id).eq('estado', 'pendiente')
    const fechas = (siguientes ?? []).map((f) => f.fecha_programada)
    expect(fechas).toContain(sumarMeses(fechaCierreReal, 1))
  }, 20_000)

  it('12. una incidencia se crea con un usuario con sesión; el reportante es siempre dato, nunca cuenta', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('reportante-sin-cuenta')
    const tipoIncId = await idListaTipos('TIPO_INCIDENCIA', 'falla')
    const origenId = await idListaTipos('ORIGEN_REPORTE', 'residente')

    const { data: inc, error } = await crearIncidencia(cliente, {
      tenant_id: tenantId, tipo_id: tipoIncId, origen_id: origenId, titulo: 'Gotera en el pasillo',
      reportante_ref: 'Residente apartamento 302 (sin cuenta en el sistema)',
      reportante_contacto: '+57 300 1234567',
    })
    expect(error).toBeNull()
    expect(inc?.reportante_ref).toContain('sin cuenta')
    expect(inc?.registrada_por).toBeTruthy() // quien insertó SÍ tiene sesión — AD-26
  }, 20_000)

  it('13. la ficha pública del QR no expone costos ni proveedores de la OT', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('qr-sin-costos-ot')
    const tipoActivoId = await idListaTipos('TIPO_ACTIVO', 'extintor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'seguridad')
    const activoId = await crearActivoMinimo(tenantId, `EXT-${RUN_ID}`, tipoActivoId, categoriaId)

    const { data: gen, error: errGen } = await cliente.functions.invoke<{ qr_token: string }>('generar-qr-activo', {
      body: { activo_id: activoId, tenant_id: tenantId },
    })
    if (errGen) throw errGen

    const { data, error } = await cliente.functions.invoke<Record<string, unknown>>('ver-activo', {
      body: { qr: gen!.qr_token },
    })
    if (error) throw error
    expect(data).not.toHaveProperty('costo_estimado')
    expect(data).not.toHaveProperty('asignado_tercero_id')
    expect(data).not.toHaveProperty('contrato_id')
    expect(data).not.toHaveProperty('valor_adquisicion')
  }, 30_000)

  it('14. los historiales son append-only', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('append-only')
    const tipoIncId = await idListaTipos('TIPO_INCIDENCIA', 'falla')
    const origenId = await idListaTipos('ORIGEN_REPORTE', 'residente')
    const { data: inc } = await crearIncidencia(cliente, {
      tenant_id: tenantId, tipo_id: tipoIncId, origen_id: origenId, titulo: 'Incidencia',
    })
    await cliente.from('mant_incidencias').update({ estado: 'en_evaluacion' }).eq('id', inc!.id)
    const { data: actuacion } = await admin
      .from('mant_incidencia_actuaciones').select('id').eq('incidencia_id', inc!.id).limit(1).single<{ id: string }>()
    const { error: errUpdate } = await admin
      .from('mant_incidencia_actuaciones').update({ descripcion: 'alterado' }).eq('id', actuacion!.id)
    expect(errUpdate?.message).toContain('APPEND_ONLY')
    const { error: errDelete } = await admin.from('mant_incidencia_actuaciones').delete().eq('id', actuacion!.id)
    expect(errDelete?.message).toContain('APPEND_ONLY')

    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'correctivo')
    const { data: ot } = await crearOt(cliente, { tenant_id: tenantId, tipo_mantenimiento_id: tipoMantId, titulo: 'OT' })
    await admin.from('mant_ordenes_trabajo').update({ estado: 'programada' }).eq('id', ot!.id)
    const { data: histOt } = await admin
      .from('mant_ot_estado_historial').select('id').eq('ot_id', ot!.id).limit(1).single<{ id: string }>()
    const { error: errUpdateOt } = await admin
      .from('mant_ot_estado_historial').update({ motivo: 'alterado' }).eq('id', histOt!.id)
    expect(errUpdateOt?.message).toContain('APPEND_ONLY')
  }, 20_000)

  it('15. aislamiento entre tenants', async () => {
    const { tenantId: tenantA, cliente: clienteA } = await crearTenantCompleto('aislar-a')
    const { tenantId: tenantB, cliente: clienteB } = await crearTenantCompleto('aislar-b')
    const tipoIncId = await idListaTipos('TIPO_INCIDENCIA', 'falla')
    const origenId = await idListaTipos('ORIGEN_REPORTE', 'residente')
    const { data: incA } = await crearIncidencia(clienteA, {
      tenant_id: tenantA, tipo_id: tipoIncId, origen_id: origenId, titulo: 'Incidencia A',
    })

    const { data: visibleDesdeB, error: errSelect } = await clienteB.from('mant_incidencias').select('id').eq('id', incA!.id)
    expect(errSelect).toBeNull()
    expect(visibleDesdeB ?? []).toHaveLength(0)

    const tipoActivoId = await idListaTipos('TIPO_ACTIVO', 'extintor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'seguridad')
    const activoIdA = await crearActivoMinimo(tenantA, `EXT-A-${RUN_ID}`, tipoActivoId, categoriaId)
    const { error: errCruce } = await admin.from('mant_incidencias').insert({
      tenant_id: tenantB, activo_id: activoIdA, tipo_id: tipoIncId, origen_id: origenId, titulo: 'Cruce',
    })
    expect(errCruce?.message).toContain('INCIDENCIA_TENANT_INCONSISTENTE')
    void clienteB
  }, 20_000)

  it('16. los enums nuevos del corte tienen COMMENT ON TYPE (D-24)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const archivoIncidencias = path.resolve(
      import.meta.dirname, '../../supabase/migrations/20260930910000_mant4_incidencias.sql',
    )
    const contenidoIncidencias = await fs.readFile(archivoIncidencias, 'utf8')
    expect(contenidoIncidencias).toMatch(/create type public\.incidencia_estado_t/)
    expect(contenidoIncidencias).toMatch(/comment on type public\.incidencia_estado_t/)

    const archivoOt = path.resolve(
      import.meta.dirname, '../../supabase/migrations/20260930940000_mant4_ordenes_trabajo.sql',
    )
    const contenidoOt = await fs.readFile(archivoOt, 'utf8')
    for (const enumNombre of ['ot_origen_t', 'ot_estado_t', 'tarea_estado_t']) {
      expect(contenidoOt).toMatch(new RegExp(`create type public\\.${enumNombre}`))
      expect(contenidoOt).toMatch(new RegExp(`comment on type public\\.${enumNombre}`))
    }
  })
})
