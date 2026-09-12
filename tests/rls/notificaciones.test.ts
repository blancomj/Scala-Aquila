/**
 * EXS-2 — notificaciones in-app: aislamiento, direccionamiento e idempotencia.
 *
 * Lo que estas pruebas defienden, y que no es obvio del esquema:
 *
 *  1. una notificación se dirige a un MÓDULO, no a una persona: quien no
 *     puede ver ese módulo no la ve, aunque sea miembro del tenant;
 *  2. el "leído" es por usuario, porque varios miembros ven el mismo aviso;
 *  3. reemitir la misma detección no duplica nada — los emisores son crons
 *     diarios que vuelven a ver lo mismo cada día;
 *  4. un cliente no puede fabricar notificaciones que parezcan del sistema.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
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

async function idListaTipos(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .single<{ id: number }>()
  if (error) throw new Error(`lista_tipos ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

d('EXS-2: notificaciones in-app', () => {
  const admin = clienteAdmin(env!)

  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let adminA: UsuarioPrueba
  let contadorA: UsuarioPrueba
  let miembroB: UsuarioPrueba
  let cAdminA: Cliente
  let cContadorA: Cliente
  let cMiembroB: Cliente

  beforeAll(async () => {
    tenantA = await crearTenant(admin, 'exs2-a')
    tenantB = await crearTenant(admin, 'exs2-b')

    adminA = await crearUsuario(admin, 'exs2-admin-a')
    contadorA = await crearUsuario(admin, 'exs2-contador-a')
    miembroB = await crearUsuario(admin, 'exs2-miembro-b')

    await crearMembership(admin, tenantA.id, adminA.id, 'administrador')
    const membershipContador = await crearMembership(admin, tenantA.id, contadorA.id, 'auxiliar')
    await crearMembership(admin, tenantB.id, miembroB.id, 'administrador')

    // El contador SOLO tiene el rol funcional 'contador' → cubre
    // 'financiero'. Asignar el primer rol funcional es justo lo que empieza
    // a restringir a alguien (puede_ver_modulo), y eso es lo que se quiere
    // probar aquí: ve lo financiero, no lo de mantenimiento.
    const rolContador = await idListaTipos(admin, 'ROL_FUNCIONAL', 'contador')
    const { error: errRol } = await admin
      .from('membership_roles_funcionales')
      .insert({ membership_id: membershipContador, rol_funcional_id: rolContador })
    if (errRol) throw new Error(`fixture rol funcional: ${errRol.message}`)

    cAdminA = await clienteComo(env!, adminA)
    cContadorA = await clienteComo(env!, contadorA)
    cMiembroB = await clienteComo(env!, miembroB)
  }, 60_000)

  afterAll(async () => {
    for (const u of [adminA, contadorA, miembroB]) await eliminarUsuario(admin, u.id)
    for (const t of [tenantA, tenantB]) await eliminarTenant(admin, t.id)
  })

  async function emitir(
    tenantId: string,
    modulo: string,
    titulo: string,
    evento: string,
  ): Promise<string | null> {
    const { data, error } = await admin.rpc('fn_notificar', {
      p_tenant_id: tenantId,
      p_modulo: modulo,
      p_tipo_codigo: 'alerta_inventario',
      p_prioridad: 'importante',
      p_titulo: titulo,
      p_origen_modulo: 'prueba',
      p_origen_entidad: 'prueba_exs2',
      p_origen_evento: evento,
    })
    if (error) throw new Error(`fn_notificar: ${error.message}`)
    return data
  }

  it('emite, y reemitir la misma detección no duplica (idempotencia)', async () => {
    const primera = await emitir(tenantA.id, 'financiero', 'Alerta de liquidez', 'idem')
    expect(primera).not.toBeNull()

    const segunda = await emitir(tenantA.id, 'financiero', 'Alerta de liquidez', 'idem')
    expect(segunda).toBeNull()

    const { data } = await admin
      .from('notificaciones')
      .select('id')
      .eq('tenant_id', tenantA.id)
      .eq('origen_evento', 'idem')
    expect(data).toHaveLength(1)
  }, 30_000)

  it('un tipo o prioridad inexistente falla explícito, no en silencio', async () => {
    const { error } = await admin.rpc('fn_notificar', {
      p_tenant_id: tenantA.id,
      p_modulo: 'financiero',
      p_tipo_codigo: 'no_existe',
      p_prioridad: 'importante',
      p_titulo: 'x',
      p_origen_modulo: 'prueba',
      p_origen_entidad: 'prueba_exs2',
      p_origen_evento: 'tipo-malo',
    })
    expect(error?.message).toContain('NOTIFICACION_TIPO_INVALIDO')
  }, 30_000)

  it('tenant isolation: un miembro del tenant B no ve las del tenant A', async () => {
    await emitir(tenantA.id, 'financiero', 'Solo para A', 'aislamiento')

    const { data } = await cMiembroB
      .from('notificaciones')
      .select('id')
      .eq('origen_evento', 'aislamiento')
    expect(data).toEqual([])
  }, 30_000)

  it('direccionamiento por módulo: el contador ve la financiera y NO la de mantenimiento', async () => {
    await emitir(tenantA.id, 'financiero', 'Financiera', 'dir-fin')
    await emitir(tenantA.id, 'mantenimiento', 'Mantenimiento', 'dir-mant')

    const { data: financiera } = await cContadorA
      .from('notificaciones')
      .select('id')
      .eq('origen_evento', 'dir-fin')
    expect(financiera).toHaveLength(1)

    const { data: mantenimiento } = await cContadorA
      .from('notificaciones')
      .select('id')
      .eq('origen_evento', 'dir-mant')
    expect(mantenimiento).toEqual([])
  }, 30_000)

  it('el administrador ve ambos módulos (puede_ver_modulo no lo restringe)', async () => {
    const { data } = await cAdminA
      .from('notificaciones')
      .select('id, modulo')
      .in('origen_evento', ['dir-fin', 'dir-mant'])
    expect(data).toHaveLength(2)
  }, 30_000)

  it('la lectura es por usuario: que uno la lea no la marca leída para otro', async () => {
    const id = await emitir(tenantA.id, 'financiero', 'Compartida', 'lectura')
    expect(id).not.toBeNull()

    const { error } = await cContadorA
      .from('notificacion_lectura')
      .insert({ notificacion_id: id!, user_id: contadorA.id })
    expect(error).toBeNull()

    // El contador la ve leída…
    const { data: suya } = await cContadorA
      .from('notificacion_lectura')
      .select('leida_at')
      .eq('notificacion_id', id!)
    expect(suya).toHaveLength(1)

    // …y el administrador no ve ninguna lectura: ni la suya (no la ha
    // leído) ni la ajena (RLS notificacion_lectura_select_propia).
    const { data: delAdmin } = await cAdminA
      .from('notificacion_lectura')
      .select('leida_at')
      .eq('notificacion_id', id!)
    expect(delAdmin).toEqual([])
  }, 30_000)

  it('no se puede marcar leída a nombre de otro usuario', async () => {
    const id = await emitir(tenantA.id, 'financiero', 'Ajena', 'lectura-ajena')
    const { error } = await cContadorA
      .from('notificacion_lectura')
      .insert({ notificacion_id: id!, user_id: adminA.id })
    expect(error).not.toBeNull()
  }, 30_000)

  it('no se puede marcar leída una notificación que no se puede ver', async () => {
    const id = await emitir(tenantA.id, 'mantenimiento', 'Invisible', 'lectura-invisible')
    // El contador no ve mantenimiento: el with-check del insert lo frena,
    // así que conocer el UUID no le sirve de nada (prompt 02 §25).
    const { error } = await cContadorA
      .from('notificacion_lectura')
      .insert({ notificacion_id: id!, user_id: contadorA.id })
    expect(error).not.toBeNull()
  }, 30_000)

  it('un cliente no puede fabricar notificaciones (sin policy de insert)', async () => {
    const tipoId = await idListaTipos(admin, 'TIPO_NOTIFICACION', 'alerta_inventario')
    const prioridadId = await idListaTipos(admin, 'PRIORIDAD_NOTIFICACION', 'critica')

    const { error } = await cAdminA.from('notificaciones').insert({
      tenant_id: tenantA.id,
      modulo: 'financiero',
      tipo_id: tipoId,
      prioridad_id: prioridadId,
      titulo: 'Falsificada',
      origen_modulo: 'ataque',
      origen_entidad: 'ataque',
      origen_evento: 'ataque',
    })
    expect(error).not.toBeNull()
  }, 30_000)

  it('el puente funciona: una detección de finanzas emite su notificación sola', async () => {
    // Es el corazón del corte: las detecciones que ya existían pasan a
    // avisar sin que nadie las llame a mano.
    const tipoAlerta = await idListaTipos(admin, 'TIPO_ALERTA_LIQUIDEZ', 'saldo_30d_bajo_umbral')
    const { data: regla, error: errRegla } = await admin
      .from('finanzas_alerta_regla')
      .insert({ tenant_id: tenantA.id, nombre: 'Saldo bajo en operativa', tipo_id: tipoAlerta })
      .select('id')
      .single<{ id: string }>()
    if (errRegla) throw new Error(`fixture regla: ${errRegla.message}`)

    const { data: emitida, error: errEmitida } = await admin
      .from('finanzas_alerta_emitida')
      .insert({ tenant_id: tenantA.id, regla_id: regla.id, fecha_emision: '2026-09-11', detalle: {} })
      .select('id')
      .single<{ id: string }>()
    if (errEmitida) throw new Error(`fixture alerta emitida: ${errEmitida.message}`)

    const { data: notis } = await admin
      .from('notificaciones')
      .select('titulo, modulo, enlace, origen_entidad')
      .eq('tenant_id', tenantA.id)
      .eq('origen_id', emitida.id)
    expect(notis).toHaveLength(1)
    expect(notis![0]!.titulo).toBe('Saldo bajo en operativa')
    expect(notis![0]!.modulo).toBe('financiero')
    // Lleva al contexto, no al home del módulo (prompt 06 §12). La ruta
    // decía '/finanzas/flujo' y esa página no existe: la corrigió
    // 20260933710000 tras verla dar 404 en el navegador. Que esta prueba
    // pasara con el enlace roto es justo el motivo de
    // tests/governance/enlaces-notificaciones.test.ts — fijar el literal
    // no comprueba que resuelva.
    expect(notis![0]!.enlace).toBe('/finanzas/flujo-proyectado')
    expect(notis![0]!.origen_entidad).toBe('finanzas_alerta_emitida')
  }, 30_000)

  it('fn_notificar no es invocable por un cliente autenticado', async () => {
    const { error } = await cAdminA.rpc('fn_notificar', {
      p_tenant_id: tenantA.id,
      p_modulo: 'financiero',
      p_tipo_codigo: 'alerta_inventario',
      p_prioridad: 'critica',
      p_titulo: 'Por la puerta de atrás',
      p_origen_modulo: 'ataque',
      p_origen_entidad: 'ataque',
      p_origen_evento: 'rpc-directa',
    })
    expect(error).not.toBeNull()
  }, 30_000)
})
