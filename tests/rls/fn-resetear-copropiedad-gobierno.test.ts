/**
 * D-125/D-126: última tanda de la deuda de 118 FKs (D-122) — el ciclo real de 4 tablas de
 * Gobierno (decisiones/reuniones/miembros/actas) y `mant_reservas` (ciclo con `cargos`), ambos
 * dejados fuera de D-125 a propósito por tocar tablas "core" fuera de Mantenimiento/Fondos.
 *
 * Ciclo de Gobierno: decisiones -> actas -> miembros -> decisiones, y decisiones -> reuniones ->
 * miembros -> decisiones (dos ciclos de 3 que comparten el tramo miembros -> decisiones).
 * Verificado que diferir SOLO `gobierno_miembros.decision_id` alcanza para romper ambos.
 *
 * Ciclo cargos/mant_reservas: `cargos.reserva_id` <-> `mant_reservas.cargo_id` — un cargo por
 * reservar una zona común, y la reserva sabe qué cargo generó.
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
  console.warn('SALTADO tests/rls/fn-resetear-copropiedad-gobierno: faltan variables de Supabase en .env')
}

async function idListaTipos(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos').select('id').eq('tipo', tipo).eq('codigo', codigo).is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
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

d('fn_resetear_copropiedad — cobertura Gobierno/mant_reservas (D-125/D-126)', () => {
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

  it('resuelve el ciclo real de 4 tablas de Gobierno (decisiones/reuniones/miembros/actas)', async () => {
    await nuevoTenant('reset-gob-ciclo')

    const tipoOrganoId = await idListaTipos(admin, 'ORGANO_GOBIERNO', 'asamblea_general')
    const { data: organo, error: errOrgano } = await admin
      .from('gobierno_organos')
      .insert({ tenant_id: tenant!.id, tipo_id: tipoOrganoId, vigente_desde: '2020-01-01' })
      .select('id').single<{ id: string }>()
    if (errOrgano) throw new Error(`fixture organo: ${errOrgano.message}`)

    const tipoIdentId = await idListaTipos(admin, 'TIPO_IDENTIFICACION', 'cedula')
    const estadoActivoId = await idListaTipos(admin, 'ESTADO_TERCERO', 'activo')
    const { data: tercero, error: errTercero } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant!.id, tipo_persona: 'natural', tipo_identificacion_id: tipoIdentId,
        numero_documento: `RGB-${String(Date.now())}`, primer_nombre: 'Presidente', primer_apellido: 'Reset',
        estado_id: estadoActivoId,
      })
      .select('id').single<{ id: string }>()
    if (errTercero) throw new Error(`fixture tercero: ${errTercero.message}`)

    const rolId = await idListaTipos(admin, 'ROL_CONCEJO_COPROPIEDAD', 'presidente')
    const { data: miembro, error: errMiembro } = await admin
      .from('gobierno_miembros')
      .insert({ tenant_id: tenant!.id, organo_id: organo.id, tercero_id: tercero.id, rol_id: rolId, desde: '2020-01-01' })
      .select('id').single<{ id: string }>()
    if (errMiembro) throw new Error(`fixture miembro: ${errMiembro.message}`)

    const tipoReunionId = await idListaTipos(admin, 'TIPO_REUNION', 'asamblea_ordinaria')
    const { data: reunion, error: errReunion } = await admin
      .from('gobierno_reuniones')
      .insert({
        tenant_id: tenant!.id, organo_id: organo.id, tipo_id: tipoReunionId, modalidad: 'presencial',
        convocatoria_regimen: 'primera', fecha_hora: '2026-06-01T15:00:00Z', lugar: 'Salón comunal',
        presidente_miembro_id: miembro.id, secretario_miembro_id: miembro.id,
      })
      .select('id').single<{ id: string }>()
    if (errReunion) throw new Error(`fixture reunión: ${errReunion.message}`)

    const { error: errInstalar } = await admin
      .from('gobierno_reuniones')
      .update({ estado: 'instalada' })
      .eq('id', reunion.id)
    if (errInstalar) throw new Error(`fixture instalar reunión: ${errInstalar.message}`)

    // Quórum deliberatorio (art. 45, hay_pluralidad): exige MÁS DE UN propietario distinto
    // presente, no solo >50% de coeficientes — un único dueño con el 100% no hace quórum.
    const tipoInmId = await tipoApartamentoId(admin)
    const { data: inmuebleA, error: errInmA } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant!.id, codigo: `RGB-GOB-A-${String(Date.now())}`, tipo_id: tipoInmId })
      .select('id').single<{ id: string }>()
    if (errInmA) throw new Error(`fixture inmueble A: ${errInmA.message}`)
    const { data: inmuebleB, error: errInmB } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant!.id, codigo: `RGB-GOB-B-${String(Date.now())}`, tipo_id: tipoInmId })
      .select('id').single<{ id: string }>()
    if (errInmB) throw new Error(`fixture inmueble B: ${errInmB.message}`)

    const { data: coefSet, error: errCoefSet } = await admin
      .from('coeficiente_sets')
      .insert({ tenant_id: tenant!.id, version: 1, vigente_desde: '2020-01-01', estado: 'borrador', suma_total: 1 })
      .select('id').single<{ id: string }>()
    if (errCoefSet) throw new Error(`fixture coeficiente_set: ${errCoefSet.message}`)
    const { error: errCoef } = await admin
      .from('coeficientes')
      .insert([
        { tenant_id: tenant!.id, set_id: coefSet.id, inmueble_id: inmuebleA.id, valor: 0.6 },
        { tenant_id: tenant!.id, set_id: coefSet.id, inmueble_id: inmuebleB.id, valor: 0.4 },
      ])
    if (errCoef) throw new Error(`fixture coeficiente: ${errCoef.message}`)
    const { error: errCoefVigente } = await admin
      .from('coeficiente_sets').update({ estado: 'vigente' }).eq('id', coefSet.id)
    if (errCoefVigente) throw new Error(`fixture coeficiente_set vigente: ${errCoefVigente.message}`)

    const tercero2Id = await (async () => {
      const { data, error } = await admin
        .from('terceros')
        .insert({
          tenant_id: tenant!.id, tipo_persona: 'natural', tipo_identificacion_id: tipoIdentId,
          numero_documento: `RGB-2-${String(Date.now())}`, primer_nombre: 'Propietario2', primer_apellido: 'Reset',
          estado_id: estadoActivoId,
        })
        .select('id').single<{ id: string }>()
      if (error) throw new Error(`fixture tercero 2: ${error.message}`)
      return data.id
    })()

    const { error: errAsistencia } = await admin
      .from('gobierno_asistencia')
      .insert([
        { tenant_id: tenant!.id, reunion_id: reunion.id, inmueble_id: inmuebleA.id, asistente_ref: tercero.id, calidad: 'propietario' },
        { tenant_id: tenant!.id, reunion_id: reunion.id, inmueble_id: inmuebleB.id, asistente_ref: tercero2Id, calidad: 'propietario' },
      ])
    if (errAsistencia) throw new Error(`fixture asistencia: ${errAsistencia.message}`)

    const { data: materia, error: errMateria } = await admin
      .from('gobierno_materia_decision').select('id').eq('codigo', 'ordinaria').single<{ id: number }>()
    if (errMateria) throw new Error(`fixture materia: ${errMateria.message}`)
    const materiaId = materia.id

    const { data: votacion, error: errVotacion } = await admin
      .from('gobierno_votaciones')
      .insert({ tenant_id: tenant!.id, reunion_id: reunion.id, materia_id: materiaId, pregunta: '¿Cierre de reset?' })
      .select('id').single<{ id: string }>()
    if (errVotacion) throw new Error(`fixture votación: ${errVotacion.message}`)

    const { data: decision, error: errDecision } = await admin
      .from('gobierno_decisiones')
      .insert({
        tenant_id: tenant!.id, numero: 1, anio: 2026, reunion_id: reunion.id, votacion_id: votacion.id,
        materia_id: materiaId, titulo: 'Decisión ciclo reset', organo_id: organo.id,
      })
      .select('id').single<{ id: string }>()
    if (errDecision) throw new Error(`fixture decisión: ${errDecision.message}`)

    const { data: acta, error: errActa } = await admin
      .from('gobierno_actas')
      .insert({
        tenant_id: tenant!.id, reunion_id: reunion.id, anio: 2026, contenido_generado: {},
        presidente_miembro_id: miembro.id, secretario_miembro_id: miembro.id,
        plazo_disposicion_limite: '2026-07-01',
      })
      .select('id').single<{ id: string }>()
    if (errActa) throw new Error(`fixture acta: ${errActa.message}`)

    // Cierra el ciclo: la decisión ahora apunta al acta, y el miembro apunta a la decisión
    // (este último es el único enlace que necesitó DEFERRABLE — rompe los dos ciclos de 3 a la vez).
    const { error: errCerrarDecision } = await admin
      .from('gobierno_decisiones')
      .update({ acta_id: acta.id })
      .eq('id', decision.id)
    if (errCerrarDecision) throw new Error(`fixture cerrar decisión: ${errCerrarDecision.message}`)

    const { error: errCerrarMiembro } = await admin
      .from('gobierno_miembros')
      .update({ decision_id: decision.id })
      .eq('id', miembro.id)
    if (errCerrarMiembro) throw new Error(`fixture cerrar ciclo miembro: ${errCerrarMiembro.message}`)

    const { data: resumen, error } = await cAdm.rpc('fn_resetear_copropiedad', { p_tenant_id: tenant!.id })
    expect(error).toBeNull()
    expect(resumen).toBeTruthy()

    for (const tabla of ['gobierno_decisiones', 'gobierno_reuniones', 'gobierno_miembros', 'gobierno_actas', 'gobierno_votaciones'] as const) {
      const { data, error: errSel } = await admin.from(tabla).select('id').eq('tenant_id', tenant!.id)
      if (errSel) throw errSel
      expect(data, `${tabla} debería quedar vacía`).toHaveLength(0)
    }
  }, 30_000)

  it('resuelve el ciclo real cargos.reserva_id <-> mant_reservas.cargo_id', async () => {
    await nuevoTenant('reset-reserva-ciclo')

    const tipoInmId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant!.id, codigo: `RGB-INM-${String(Date.now())}`, tipo_id: tipoInmId })
      .select('id').single<{ id: string }>()
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)

    const tipoZonaId = await idListaTipos(admin, 'TIPO_ZONA_COMUN', 'recreativa')
    const { data: zona, error: errZona } = await admin
      .from('zonas_comunes')
      .insert({ tenant_id: tenant!.id, codigo: `RGB-ZONA-${String(Date.now())}`, nombre: 'Zona ciclo reset', tipo_id: tipoZonaId })
      .select('id').single<{ id: string }>()
    if (errZona) throw new Error(`fixture zona común: ${errZona.message}`)

    const { data: periodo, error: errPeriodo } = await admin
      .from('periodos')
      .insert({ tenant_id: tenant!.id, anio: 2032, mes: 1 })
      .select('id').single<{ id: string }>()
    if (errPeriodo) throw new Error(`fixture periodo: ${errPeriodo.message}`)

    const { error: errRegla } = await admin
      .from('mant_zona_reserva_regla')
      .insert({
        tenant_id: tenant!.id, zona_comun_id: zona.id, requiere_aprobacion: false,
        cupo_simultaneo: 1, vigente_desde: '2020-01-01',
      })
    if (errRegla) throw new Error(`fixture regla de reserva: ${errRegla.message}`)

    // guard_cargos_origen_unico exige reserva_id poblado desde el INSERT cuando origen_tipo =
    // 'reserva' — hay que crear la reserva PRIMERO (sin cargo_id, nullable) y el cargo después.
    const { data: reserva, error: errReserva } = await admin
      .from('mant_reservas')
      .insert({
        tenant_id: tenant!.id, zona_comun_id: zona.id, inmueble_id: inmueble.id,
        solicitante_origen: 'staff', fecha: '2026-08-01', hora_inicio: '10:00', hora_fin: '11:00',
      })
      .select('id').single<{ id: string }>()
    if (errReserva) throw new Error(`fixture reserva: ${errReserva.message}`)

    const { data: cargo, error: errCargo } = await admin
      .from('cargos')
      .insert({
        tenant_id: tenant!.id, inmueble_id: inmueble.id, periodo_id: periodo.id,
        categoria: 'otro', origen_tipo: 'reserva', reserva_id: reserva.id, monto_original: 20_000,
      })
      .select('id').single<{ id: string }>()
    if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)

    const { error: errCerrarReserva } = await admin
      .from('mant_reservas')
      .update({ cargo_id: cargo.id })
      .eq('id', reserva.id)
    if (errCerrarReserva) throw new Error(`fixture cerrar ciclo reserva: ${errCerrarReserva.message}`)

    const { data: resumen, error } = await cAdm.rpc('fn_resetear_copropiedad', { p_tenant_id: tenant!.id })
    expect(error).toBeNull()
    expect(resumen).toBeTruthy()

    for (const tabla of ['cargos', 'mant_reservas'] as const) {
      const { data, error: errSel } = await admin.from(tabla).select('id').eq('tenant_id', tenant!.id)
      if (errSel) throw errSel
      expect(data, `${tabla} debería quedar vacía`).toHaveLength(0)
    }
  }, 30_000)
})
