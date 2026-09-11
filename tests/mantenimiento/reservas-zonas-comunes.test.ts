/**
 * MANT-10 (20260932710000-20260932740000) — reservas de zonas comunes. Ver
 * Casos de uso/Solicitudes - Reservas - Visitantes/MANT_10_reservas_zonas_comunes.md §5
 * (12 pruebas obligatorias).
 *
 * Desviaciones de diseño frente al spec, documentadas en la cabecera de cada migración (no
 * están en el prompt original): concepto_id es uuid (no bigint, conceptos.id ya es uuid);
 * mant_zona_reserva_regla.monto es nueva (conceptos no tiene un valor fijo, solo formula_ael —
 * mismo criterio que novedades.monto); mant_reservas.zona_cupo_simultaneo es un snapshot interno
 * necesario para que el exclude constraint pueda condicionarse a cupo=1 sin depender de una
 * subconsulta (cupo>1 se guarda por conteo en el trigger, tal como pide el spec §3.3).
 *
 * Las pruebas de guards (1-6, 9) insertan directo con el cliente admin (service_role) — el mismo
 * criterio que EXT-01 usó para actor_externo_vinculo: el guard vive en la base de datos y se
 * ejercita ahí, sin depender de un punto de entrada que otro corte (EXT-03) construye después.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
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
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip
if (!env) {
  console.warn('SALTADO tests/mantenimiento/reservas-zonas-comunes: faltan variables de Supabase en .env')
}

const RAIZ = join(import.meta.dirname, '..', '..')

type ReglaInsert = Database['public']['Tables']['mant_zona_reserva_regla']['Insert']

d('MANT-10: reservas de zonas comunes', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: string[] = []
  const tercerosCreados: string[] = []

  afterAll(async () => {
    for (const id of usuariosCreados) await eliminarUsuario(admin, id)
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const id of tercerosCreados) {
      await admin.from('inmueble_persona_rol').delete().eq('tercero_id', id)
      await admin.from('terceros').delete().eq('id', id)
    }
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
    usuariosCreados.push(usuario.id)
    const cliente = await clienteComo(env!, usuario)
    const { data: tenant, error } = await cliente
      .rpc('create_tenant', { p_name: `MANT-10 ${etiqueta}`, p_slug: `t10-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    return { tenantId: tenant.id, cliente }
  }

  async function crearInmueble(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_INMUEBLE', 'apartamento')
    const { data, error } = await admin
      .from('inmuebles').insert({ tenant_id: tenantId, codigo, tipo_id: tipoId }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearZonaComun(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_ZONA_COMUN', 'recreativa')
    const { data, error } = await admin
      .from('zonas_comunes')
      .insert({ tenant_id: tenantId, codigo, nombre: `Zona ${codigo}`, tipo_id: tipoId })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture zona ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearConcepto(tenantId: string, codigo: string, valorFijo: number): Promise<string> {
    const { data, error } = await admin
      .from('conceptos')
      .insert({
        tenant_id: tenantId, codigo, nombre: `Concepto ${codigo}`,
        modo_calculo: 'directo', estado: 'activo',
        modo_valor: 'fijo', valor_fijo: valorFijo,
        tipo_recurrencia: 'unico', fecha_inicio_anio: 2020, fecha_inicio_mes: 1,
        alcance: 'todos',
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture concepto ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearPeriodo(tenantId: string, anio: number, mes: number): Promise<string> {
    const { data, error } = await admin
      .from('periodos').insert({ tenant_id: tenantId, anio, mes }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture periodo ${String(anio)}-${String(mes)}: ${error.message}`)
    return data.id
  }

  async function crearTercero(tenantId: string, sello: string): Promise<string> {
    const tipoIdentId = await idListaTipos('TIPO_IDENTIFICACION', 'cedula')
    const estadoActivoId = await idListaTipos('ESTADO_TERCERO', 'activo')
    const { data, error } = await admin.from('terceros').insert({
      tenant_id: tenantId, tipo_persona: 'natural', tipo_identificacion_id: tipoIdentId,
      numero_documento: sello, primer_nombre: 'Externo', primer_apellido: sello, estado_id: estadoActivoId,
    }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture tercero ${sello}: ${error.message}`)
    tercerosCreados.push(data.id)
    return data.id
  }

  async function crearPersonaRol(tenantId: string, inmuebleId: string, terceroId: string): Promise<string> {
    const rolId = await idListaTipos('PERSONA_PREDIO', 'copropietario')
    const { data, error } = await admin
      .from('inmueble_persona_rol')
      .insert({ tenant_id: tenantId, inmueble_id: inmuebleId, tercero_id: terceroId, rol_id: rolId, vigente_desde: '2020-01-01' })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble_persona_rol: ${error.message}`)
    return data.id
  }

  async function crearActorExterno(tenantId: string, inmuebleId: string, sello: string): Promise<string> {
    const terceroId = await crearTercero(tenantId, sello)
    const personaRolId = await crearPersonaRol(tenantId, inmuebleId, terceroId)
    const usuario = await crearUsuario(admin, `ext-${sello}`)
    usuariosCreados.push(usuario.id)
    const { error } = await admin.rpc('fn_actor_externo_registrar_vinculo', {
      p_tenant_id: tenantId, p_auth_user_id: usuario.id, p_persona_rol_id: personaRolId,
      p_persona_tipo: 'propietario', p_origen: 'staff',
    })
    if (error) throw error
    const { data: vinculo, error: errVinculo } = await admin
      .from('actor_externo_vinculo').select('id').eq('auth_user_id', usuario.id).single<{ id: string }>()
    if (errVinculo) throw errVinculo
    return vinculo.id
  }

  async function crearRegla(tenantId: string, zonaComunId: string, overrides: Partial<ReglaInsert> = {}) {
    const payload: ReglaInsert = {
      tenant_id: tenantId,
      zona_comun_id: zonaComunId,
      requiere_aprobacion: true,
      cupo_simultaneo: 1,
      vigente_desde: '2020-01-01',
      ...overrides,
    }
    const { data, error } = await admin
      .from('mant_zona_reserva_regla').insert(payload).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture regla zona ${zonaComunId}: ${error.message}`)
    return data.id
  }

  interface ParametrosReserva {
    tenantId: string
    zonaComunId: string
    inmuebleId: string
    fecha: string
    horaInicio: string
    horaFin: string
    solicitanteOrigen?: 'staff' | 'externo'
    solicitanteRef?: string | null
  }

  async function insertarReserva(p: ParametrosReserva) {
    return admin
      .from('mant_reservas')
      .insert({
        tenant_id: p.tenantId, zona_comun_id: p.zonaComunId, inmueble_id: p.inmuebleId,
        fecha: p.fecha, hora_inicio: p.horaInicio, hora_fin: p.horaFin,
        solicitante_origen: p.solicitanteOrigen ?? 'staff', solicitante_ref: p.solicitanteRef ?? null,
      })
      .select('id, estado')
      .single<{ id: string; estado: string }>()
  }

  it('1. dos reservas que se traslapan en la misma zona: la segunda falla por el exclude constraint', async () => {
    const { tenantId } = await crearTenantCompleto('p1')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-p1`)
    const zonaId = await crearZonaComun(tenantId, `Z-${RUN_ID}-p1`)
    await crearRegla(tenantId, zonaId)

    const { error: e1 } = await insertarReserva({
      tenantId, zonaComunId: zonaId, inmuebleId, fecha: '2027-03-10', horaInicio: '10:00', horaFin: '11:00',
    })
    expect(e1).toBeNull()

    const { error: e2 } = await insertarReserva({
      tenantId, zonaComunId: zonaId, inmuebleId, fecha: '2027-03-10', horaInicio: '10:30', horaFin: '11:30',
    })
    expect(e2).toBeTruthy()
  }, 30_000)

  it('2. con cupo_simultaneo=3, la cuarta reserva simultánea falla; la tercera no', async () => {
    const { tenantId } = await crearTenantCompleto('p2')
    const zonaId = await crearZonaComun(tenantId, `Z-${RUN_ID}-p2`)
    await crearRegla(tenantId, zonaId, { cupo_simultaneo: 3 })
    const inmueble1 = await crearInmueble(tenantId, `INM-${RUN_ID}-p2-1`)
    const inmueble2 = await crearInmueble(tenantId, `INM-${RUN_ID}-p2-2`)
    const inmueble3 = await crearInmueble(tenantId, `INM-${RUN_ID}-p2-3`)
    const inmueble4 = await crearInmueble(tenantId, `INM-${RUN_ID}-p2-4`)
    const franja = { fecha: '2027-03-11', horaInicio: '10:00', horaFin: '11:00' }

    const r1 = await insertarReserva({ tenantId, zonaComunId: zonaId, inmuebleId: inmueble1, ...franja })
    const r2 = await insertarReserva({ tenantId, zonaComunId: zonaId, inmuebleId: inmueble2, ...franja })
    const r3 = await insertarReserva({ tenantId, zonaComunId: zonaId, inmuebleId: inmueble3, ...franja })
    expect(r1.error).toBeNull()
    expect(r2.error).toBeNull()
    expect(r3.error).toBeNull()

    const r4 = await insertarReserva({ tenantId, zonaComunId: zonaId, inmuebleId: inmueble4, ...franja })
    expect(r4.error?.message).toContain('RESERVA_CUPO_EXCEDIDO')
  }, 30_000)

  it('3. una reserva que excede duracion_maxima_minutos falla', async () => {
    const { tenantId } = await crearTenantCompleto('p3')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-p3`)
    const zonaId = await crearZonaComun(tenantId, `Z-${RUN_ID}-p3`)
    await crearRegla(tenantId, zonaId, { duracion_maxima_minutos: 60 })

    const { error } = await insertarReserva({
      tenantId, zonaComunId: zonaId, inmuebleId, fecha: '2027-03-12', horaInicio: '10:00', horaFin: '12:00',
    })
    expect(error?.message).toContain('RESERVA_DURACION_EXCEDIDA')
  }, 30_000)

  it('4. una reserva fuera de la ventana de anticipación mínima falla', async () => {
    const { tenantId } = await crearTenantCompleto('p4')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-p4`)
    const zonaId = await crearZonaComun(tenantId, `Z-${RUN_ID}-p4`)
    await crearRegla(tenantId, zonaId, { anticipacion_minima_horas: 72 })

    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { error } = await insertarReserva({
      tenantId, zonaComunId: zonaId, inmuebleId, fecha: manana, horaInicio: '10:00', horaFin: '11:00',
    })
    expect(error?.message).toContain('RESERVA_FUERA_DE_VENTANA')
  }, 30_000)

  it('5. un inmueble en su límite de reservas activas no puede crear una más', async () => {
    const { tenantId } = await crearTenantCompleto('p5')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-p5`)
    const zonaId = await crearZonaComun(tenantId, `Z-${RUN_ID}-p5`)
    await crearRegla(tenantId, zonaId, { maximo_activas_por_inmueble: 1 })

    const { error: e1 } = await insertarReserva({
      tenantId, zonaComunId: zonaId, inmuebleId, fecha: '2027-03-13', horaInicio: '10:00', horaFin: '11:00',
    })
    expect(e1).toBeNull()

    const { error: e2 } = await insertarReserva({
      tenantId, zonaComunId: zonaId, inmuebleId, fecha: '2027-03-13', horaInicio: '14:00', horaFin: '15:00',
    })
    expect(e2?.message).toContain('RESERVA_LIMITE_INMUEBLE_EXCEDIDO')
  }, 30_000)

  it('6. con requiere_aprobacion=false, la reserva nace directo en aprobada', async () => {
    const { tenantId } = await crearTenantCompleto('p6')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-p6`)
    const zonaId = await crearZonaComun(tenantId, `Z-${RUN_ID}-p6`)
    await crearRegla(tenantId, zonaId, { requiere_aprobacion: false })

    const { data, error } = await insertarReserva({
      tenantId, zonaComunId: zonaId, inmuebleId, fecha: '2027-03-14', horaInicio: '10:00', horaFin: '11:00',
    })
    expect(error).toBeNull()
    expect(data?.estado).toBe('aprobada')
  }, 30_000)

  it('7. rechazar una reserva sin motivo falla', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p7')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-p7`)
    const zonaId = await crearZonaComun(tenantId, `Z-${RUN_ID}-p7`)
    await crearRegla(tenantId, zonaId)

    const { data } = await insertarReserva({
      tenantId, zonaComunId: zonaId, inmuebleId, fecha: '2027-03-15', horaInicio: '10:00', horaFin: '11:00',
    })
    const { error } = await cliente.rpc('fn_reserva_rechazar', { p_reserva_id: data!.id, p_motivo: '  ' })
    expect(error?.message).toContain('RESERVA_RECHAZO_SIN_MOTIVO')
  }, 30_000)

  it('8. aprobar una reserva con genera_cargo=true crea el cargo correspondiente, enlazado', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p8')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-p8`)
    const zonaId = await crearZonaComun(tenantId, `Z-${RUN_ID}-p8`)
    const conceptoId = await crearConcepto(tenantId, `CON-${RUN_ID}-p8`, 50000)
    await crearPeriodo(tenantId, 2027, 3)
    await crearRegla(tenantId, zonaId, { genera_cargo: true, concepto_id: conceptoId })

    const { data } = await insertarReserva({
      tenantId, zonaComunId: zonaId, inmuebleId, fecha: '2027-03-16', horaInicio: '10:00', horaFin: '11:00',
    })
    const { data: aprobada, error } = await cliente
      .rpc('fn_reserva_aprobar', { p_reserva_id: data!.id })
      .single<{ estado: string; cargo_id: string | null }>()
    if (error) throw error
    expect(aprobada.estado).toBe('aprobada')
    expect(aprobada.cargo_id).toBeTruthy()

    const { data: cargo, error: errCargo } = await admin
      .from('cargos').select('monto_original, concepto_id, inmueble_id, origen_tipo')
      .eq('id', aprobada.cargo_id!).single()
    if (errCargo) throw errCargo
    expect(cargo.monto_original).toBe(50000)
    expect(cargo.concepto_id).toBe(conceptoId)
    expect(cargo.inmueble_id).toBe(inmuebleId)
    expect(cargo.origen_tipo).toBe('reserva')
  }, 30_000)

  it('9. un actor externo no puede reservar para un inmueble ajeno', async () => {
    const { tenantId } = await crearTenantCompleto('p9')
    const inmuebleSuyo = await crearInmueble(tenantId, `INM-${RUN_ID}-p9-suyo`)
    const inmuebleAjeno = await crearInmueble(tenantId, `INM-${RUN_ID}-p9-ajeno`)
    const vinculoId = await crearActorExterno(tenantId, inmuebleSuyo, `p9-${RUN_ID}`)
    const zonaId = await crearZonaComun(tenantId, `Z-${RUN_ID}-p9`)
    await crearRegla(tenantId, zonaId)

    const { error } = await insertarReserva({
      tenantId, zonaComunId: zonaId, inmuebleId: inmuebleAjeno, fecha: '2027-03-17',
      horaInicio: '10:00', horaFin: '11:00', solicitanteOrigen: 'externo', solicitanteRef: vinculoId,
    })
    expect(error?.message).toContain('RESERVA_INMUEBLE_NO_VINCULADO')
  }, 30_000)

  it('10. ninguna migración siembra reglas de reserva (prueba estática)', async () => {
    const dirMigraciones = join(RAIZ, 'supabase/migrations')
    const archivos = await readdir(dirMigraciones)
    for (const archivo of archivos) {
      const contenido = await readFile(join(dirMigraciones, archivo), 'utf8')
      expect(contenido).not.toMatch(/insert into public\.mant_zona_reserva_regla/)
    }
  })

  it('11. aislamiento entre tenants', async () => {
    const { tenantId: tenantA } = await crearTenantCompleto('p11a')
    const { cliente: clienteB } = await crearTenantCompleto('p11b')
    const inmuebleA = await crearInmueble(tenantA, `INM-${RUN_ID}-p11a`)
    const zonaA = await crearZonaComun(tenantA, `Z-${RUN_ID}-p11a`)
    await crearRegla(tenantA, zonaA)

    const { data } = await insertarReserva({
      tenantId: tenantA, zonaComunId: zonaA, inmuebleId: inmuebleA,
      fecha: '2027-03-18', horaInicio: '10:00', horaFin: '11:00',
    })

    const { data: vistoPorB, error } = await clienteB.from('mant_reservas').select('id').eq('id', data!.id)
    if (error) throw error
    expect(vistoPorB).toHaveLength(0)
  }, 30_000)

  it('12. los dos enums tienen comment on type', () => {
    const contenido = readFileSync(join(RAIZ, 'supabase/migrations/20260932710000_mant10_vocabulario.sql'), 'utf-8')
    expect(contenido).toMatch(/comment on type public\.reserva_estado_t is/)
    expect(contenido).toMatch(/comment on type public\.reserva_solicitante_t is/)
  })
})
