/**
 * D-124/D-125: fn_resetear_copropiedad ganó cobertura de 63 tablas de Mantenimiento/Gobierno/
 * Fondos/Contabilidad/Finanzas (20260935100000). Tres de esos grupos tenían ciclos reales de FK
 * `ON DELETE NO ACTION` entre dos DELETE statements separados (uno por tabla, como ya hace la
 * función) — un problema distinto de las auto-referencias, que sí se resuelven solas dentro de un
 * único `DELETE ... WHERE tenant_id = $1` sin necesitar nada especial. Se resolvieron marcando
 * exactamente 6 constraints puntuales `DEFERRABLE INITIAL IMMEDIATE` (sin cambiar el
 * comportamiento normal de la app — el `SET CONSTRAINTS ALL DEFERRED` que la función ya ejecutaba
 * antes no hacía nada porque 979/980 FKs del esquema no eran deferrable).
 *
 * De paso se corrigió un bug real (no solo teórico): `cargos.novedad_id -> novedades` tenía datos
 * poblados en tenants reales de prueba (330 filas) y el arreglo anterior borraba `novedades` ANTES
 * que `cargos` — el nuevo orden, recalculado desde `pg_constraint` real, lo corrige.
 */
import { afterEach, describe, expect, it } from 'vitest'
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
  type Cliente,
  type TenantPrueba,
  type UsuarioPrueba,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/fn-resetear-copropiedad-mant-fondos: faltan variables de Supabase en .env')
}

async function idListaTipos(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos').select('id').eq('tipo', tipo).eq('codigo', codigo).is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

async function crearActivoMinimo(admin: Cliente, tenantId: string, codigo: string): Promise<string> {
  const tipoId = await idListaTipos(admin, 'TIPO_ACTIVO', 'extintor')
  const categoriaId = await idListaTipos(admin, 'CATEGORIA_ACTIVO', 'seguridad')
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

async function tipoApartamentoId(admin: Cliente): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'TIPO_INMUEBLE')
    .eq('codigo', 'apartamento')
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture tipo apartamento: ${error.message}`)
  return data.id
}

d('fn_resetear_copropiedad — cobertura Mantenimiento/Fondos (D-124/D-125)', () => {
  const admin = clienteAdmin(env!)
  let administrador: UsuarioPrueba | undefined
  let tenant: TenantPrueba | undefined
  let cAdm: Cliente

  afterEach(async () => {
    if (tenant) await eliminarTenant(admin, tenant.id)
    if (administrador) await eliminarUsuario(admin, administrador.id)
    tenant = undefined
    administrador = undefined
  })

  async function nuevoTenant(etiqueta: string): Promise<void> {
    administrador = await crearUsuario(admin, etiqueta)
    tenant = await crearTenant(admin, etiqueta, administrador.id)
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    cAdm = await clienteComo(env!, administrador)
  }

  it('resuelve el ciclo real OT<->incidencia y OT<->programación (antes irresoluble sin DEFERRABLE)', async () => {
    await nuevoTenant('reset-mant-ot')
    const activoId = await crearActivoMinimo(admin, tenant!.id, `RMF-ACT-${String(Date.now())}`)
    const tipoMantId = await idListaTipos(admin, 'TIPO_MANTENIMIENTO', 'correctivo')
    const tipoIncId = await idListaTipos(admin, 'TIPO_INCIDENCIA', 'falla')
    const origenId = await idListaTipos(admin, 'ORIGEN_REPORTE', 'vigilancia')

    // guard_ot_origen_consistente exige EXACTAMENTE uno de programacion_id/incidencia_id/
    // inspeccion_id, según `origen` — no se puede cerrar ambos ciclos en una sola OT. Se usan dos:
    // una con origen='incidencia' (cierra el ciclo OT<->mant_incidencias) y otra con
    // origen='programacion' (cierra el ciclo OT<->mant_programaciones).
    const { data: incidencia, error: errInc } = await admin
      .from('mant_incidencias')
      .insert({
        tenant_id: tenant!.id, activo_id: activoId, tipo_id: tipoIncId, origen_id: origenId,
        titulo: 'Incidencia ciclo reset',
      })
      .select('id').single<{ id: string }>()
    if (errInc) throw new Error(`fixture incidencia: ${errInc.message}`)

    const { data: otIncidencia, error: errOtInc } = await admin
      .from('mant_ordenes_trabajo')
      .insert({
        tenant_id: tenant!.id, activo_id: activoId, tipo_mantenimiento_id: tipoMantId,
        titulo: 'OT ciclo incidencia', origen: 'incidencia', incidencia_id: incidencia.id,
      })
      .select('id').single<{ id: string }>()
    if (errOtInc) throw new Error(`fixture OT (incidencia): ${errOtInc.message}`)

    const { error: errCerrarInc } = await admin
      .from('mant_incidencias')
      .update({ orden_trabajo_id: otIncidencia.id })
      .eq('id', incidencia.id)
    if (errCerrarInc) throw new Error(`fixture cerrar ciclo incidencia: ${errCerrarInc.message}`)

    const tipoMantPreventivoId = await idListaTipos(admin, 'TIPO_MANTENIMIENTO', 'preventivo')
    const { data: plan, error: errPlan } = await admin
      .from('mant_planes')
      .insert({
        tenant_id: tenant!.id, codigo: `RMF-PLAN-${String(Date.now())}`, nombre: 'Plan ciclo reset',
        tipo_mantenimiento_id: tipoMantPreventivoId, alcance: 'activo', alcance_activo_id: activoId,
        frecuencia_meses: 6, frecuencia_origen: 'propia', ventana_dias: 15, horizonte_meses: 6,
      })
      .select('id').single<{ id: string }>()
    if (errPlan) throw new Error(`fixture plan: ${errPlan.message}`)

    const hoy = new Date().toISOString().slice(0, 10)
    const { data: programacion, error: errProg } = await admin
      .from('mant_programaciones')
      .insert({
        tenant_id: tenant!.id, plan_id: plan.id, activo_id: activoId,
        fecha_programada: hoy, ventana_hasta: hoy,
      })
      .select('id').single<{ id: string }>()
    if (errProg) throw new Error(`fixture programación: ${errProg.message}`)

    const { data: otProgramacion, error: errOtProg } = await admin
      .from('mant_ordenes_trabajo')
      .insert({
        tenant_id: tenant!.id, activo_id: activoId, tipo_mantenimiento_id: tipoMantId,
        titulo: 'OT ciclo programación', origen: 'programacion', programacion_id: programacion.id,
      })
      .select('id').single<{ id: string }>()
    if (errOtProg) throw new Error(`fixture OT (programación): ${errOtProg.message}`)

    const { error: errCerrarProg } = await admin
      .from('mant_programaciones')
      .update({ orden_trabajo_id: otProgramacion.id })
      .eq('id', programacion.id)
    if (errCerrarProg) throw new Error(`fixture cerrar ciclo programación: ${errCerrarProg.message}`)

    const { data: resumen, error } = await cAdm.rpc('fn_resetear_copropiedad', { p_tenant_id: tenant!.id })
    expect(error).toBeNull()
    expect(resumen).toBeTruthy()

    for (const tabla of ['mant_ordenes_trabajo', 'mant_incidencias', 'mant_programaciones', 'mant_planes'] as const) {
      const { data, error: errSel } = await admin.from(tabla).select('id').eq('tenant_id', tenant!.id)
      if (errSel) throw errSel
      expect(data, `${tabla} debería quedar vacía`).toHaveLength(0)
    }
  }, 30_000)

  it('resuelve el ciclo real fondo_solicitudes_uso<->fondo_compromisos', async () => {
    await nuevoTenant('reset-fondo-ciclo')
    const tipoFondoId = await idListaTipos(admin, 'TIPO_FONDO', 'proyecto')
    const { data: fondo, error: errFondo } = await admin
      .from('fondos')
      .insert({
        tenant_id: tenant!.id, codigo: 'RMF-FON', nombre: 'Fondo ciclo reset',
        naturaleza: 'destinacion_especifica', tipo_id: tipoFondoId,
      })
      .select('id').single<{ id: string }>()
    if (errFondo) throw new Error(`fixture fondo: ${errFondo.message}`)

    for (const estado of ['pendiente_autorizacion', 'activo'] as const) {
      const { error: errEstado } = await admin.from('fondos').update({ estado }).eq('id', fondo.id)
      if (errEstado) throw new Error(`fixture activar fondo (${estado}): ${errEstado.message}`)
    }

    const { data: solicitud, error: errSol } = await admin
      .from('fondo_solicitudes_uso')
      .insert({
        tenant_id: tenant!.id, fondo_id: fondo.id, solicitante_id: administrador!.id,
        objetivo: 'Reparación de prueba', monto_solicitado: 100_000,
      })
      .select('id').single<{ id: string }>()
    if (errSol) throw new Error(`fixture solicitud: ${errSol.message}`)

    const { data: compromiso, error: errComp } = await admin
      .from('fondo_compromisos')
      .insert({
        tenant_id: tenant!.id, fondo_id: fondo.id, concepto: 'Compromiso ciclo reset',
        monto: 100_000, solicitud_id: solicitud.id,
      })
      .select('id').single<{ id: string }>()
    if (errComp) throw new Error(`fixture compromiso: ${errComp.message}`)

    const { error: errCerrar } = await admin
      .from('fondo_solicitudes_uso')
      .update({ compromiso_id: compromiso.id })
      .eq('id', solicitud.id)
    if (errCerrar) throw new Error(`fixture cerrar ciclo solicitud: ${errCerrar.message}`)

    const { data: resumen, error } = await cAdm.rpc('fn_resetear_copropiedad', { p_tenant_id: tenant!.id })
    expect(error).toBeNull()
    expect(resumen).toBeTruthy()

    for (const tabla of ['fondo_solicitudes_uso', 'fondo_compromisos'] as const) {
      const { data, error: errSel } = await admin.from(tabla).select('id').eq('tenant_id', tenant!.id)
      if (errSel) throw errSel
      expect(data, `${tabla} debería quedar vacía`).toHaveLength(0)
    }
  }, 30_000)

  it('corrige el orden real cargos.novedad_id -> novedades (antes fallaba con datos poblados)', async () => {
    await nuevoTenant('reset-cargo-novedad')
    const tipoInmId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant!.id, codigo: `RMF-INM-${String(Date.now())}`, tipo_id: tipoInmId })
      .select('id').single<{ id: string }>()
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)

    const { data: novedad, error: errNov } = await admin
      .from('novedades')
      .insert({
        tenant_id: tenant!.id, inmueble_id: inmueble.id, tipo: 'DEBIT', monto: 50_000,
        descripcion: 'Recargo de prueba (ciclo reset)', fecha_efectiva: new Date().toISOString().slice(0, 10),
        created_by: administrador!.id,
      })
      .select('id').single<{ id: string }>()
    if (errNov) throw new Error(`fixture novedad: ${errNov.message}`)

    const { data: periodo, error: errPeriodo } = await admin
      .from('periodos')
      .insert({ tenant_id: tenant!.id, anio: 2031, mes: 1 })
      .select('id').single<{ id: string }>()
    if (errPeriodo) throw new Error(`fixture periodo: ${errPeriodo.message}`)

    const { error: errCargo } = await admin
      .from('cargos')
      .insert({
        tenant_id: tenant!.id, inmueble_id: inmueble.id, periodo_id: periodo.id,
        categoria: 'otro', origen_tipo: 'novedad', novedad_id: novedad.id, monto_original: 50_000,
      })
    if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)

    const { data: resumen, error } = await cAdm.rpc('fn_resetear_copropiedad', { p_tenant_id: tenant!.id })
    expect(error).toBeNull()
    expect(resumen).toBeTruthy()

    for (const tabla of ['cargos', 'novedades'] as const) {
      const { data, error: errSel } = await admin.from(tabla).select('id').eq('tenant_id', tenant!.id)
      if (errSel) throw errSel
      expect(data, `${tabla} debería quedar vacía`).toHaveLength(0)
    }
  }, 30_000)
})
