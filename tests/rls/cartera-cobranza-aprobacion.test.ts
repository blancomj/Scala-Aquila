/**
 * Aprobación de acciones_cobranza — CAR F4 (Docs/Motor de gestion de
 * cartera/CAR_00_Guia_Oficial.md §9.4/§21.3). Mismo patrón maker-checker
 * que concepto_maker_checker (20260818100100), sin Edge Function: el
 * trigger guard_accion_cobranza_transicion() (20260822280000) exige rol
 * administrador y bloquea auto-aprobación. Usa clientes autenticados por
 * usuario real (no el cliente admin) porque el guard lee auth.uid() —
 * con service_role, auth.uid() es null y el guard se salta (cambio fuera
 * de banda), lo cual no probaría nada de esto.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '@aquila/shared'
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
  console.warn('SALTADO tests/rls/cartera-cobranza-aprobacion: faltan variables de Supabase en .env')
}

async function listaTipoId(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

d('acciones_cobranza — aprobación (CAR §9.4/§21.3, maker-checker sin Edge Function)', () => {
  let admin: Cliente
  let agente: UsuarioPrueba
  let administrador: UsuarioPrueba
  let administradorDos: UsuarioPrueba
  let tenant: TenantPrueba
  let inmuebleId: string
  let politicaId: string
  let terceroId: string

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    agente = await crearUsuario(admin, 'cob-apr-agent')
    administrador = await crearUsuario(admin, 'cob-apr-admin1')
    administradorDos = await crearUsuario(admin, 'cob-apr-admin2')
    tenant = await crearTenant(admin, 'cob-aprobacion', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    await crearMembership(admin, tenant.id, administradorDos.id, 'administrador')

    const tipoInmuebleId = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
    const { data: inmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `COBAPR-${String(Date.now())}`, tipo_id: tipoInmuebleId })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)
    inmuebleId = inmueble.id

    const { data: politica, error: errPolitica } = await admin
      .from('politicas_clasificacion_cartera')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        estado: 'borrador',
        nombre: 'Política aprobación v1',
        policy_hash: `test-fixture-cobranza-aprobacion-${tenant.id}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPolitica) throw new Error(`fixture politica: ${errPolitica.message}`)
    politicaId = politica.id

    const tipoIdentCedula = await listaTipoId(admin, 'TIPO_IDENTIFICACION', 'cedula')
    const estadoActivo = await listaTipoId(admin, 'ESTADO_TERCERO', 'activo')
    const { data: tercero, error: errTercero } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_identificacion_id: tipoIdentCedula,
        numero_documento: `COBAPR-${String(Date.now())}`,
        tipo_persona: 'natural',
        primer_nombre: 'Carlos',
        primer_apellido: 'Ruiz',
        email: 'carlos.ruiz@example.test',
        estado_id: estadoActivo,
      })
      .select('id')
      .single<{ id: string }>()
    if (errTercero) throw new Error(`fixture tercero: ${errTercero.message}`)
    terceroId = tercero.id
  })

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, administrador.id)
    await eliminarUsuario(admin, administradorDos.id)
  })

  type AccionCobranzaInsert = Database['public']['Tables']['acciones_cobranza']['Insert']

  function payloadAccion(overrides: Partial<AccionCobranzaInsert> = {}): AccionCobranzaInsert {
    return {
      tenant_id: tenant.id,
      inmueble_id: inmuebleId,
      tipo_accion: 'requerimiento_formal',
      canal: 'fisico',
      fecha_programada: '2026-08-25',
      clasificacion_codigo: 'MORA_AVANZADA',
      politica_clasificacion_id: politicaId,
      politica_version: 1,
      dias_mora_al_momento: 95,
      deuda_total_al_momento: 900000,
      alcance: 'inmueble',
      destinatario_tercero_id: terceroId,
      destinatario_rol_codigo: 'copropietario',
      intento_numero: 1,
      creada_por: 'manual',
      estado: 'pendiente_aprobacion',
      ...overrides,
    }
  }

  it('ACCION_COBRANZA_ESTADO_INICIAL_INVALIDO: un INSERT no puede nacer ya en aprobada', async () => {
    const clienteAgente = await clienteComo(env!, agente)
    const { error } = await clienteAgente.from('acciones_cobranza').insert(payloadAccion({ estado: 'aprobada' }))

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/ACCION_COBRANZA_ESTADO_INICIAL_INVALIDO/)
  })

  it('ACCION_COBRANZA_REQUIERE_ADMINISTRADOR: un agent simple no puede aprobar', async () => {
    const clienteAgente = await clienteComo(env!, agente)
    const { data: fila, error: errInsert } = await clienteAgente
      .from('acciones_cobranza')
      .insert(payloadAccion())
      .select('id')
      .single<{ id: string }>()
    if (errInsert) throw new Error(`insert accion: ${errInsert.message}`)

    const { error } = await clienteAgente.from('acciones_cobranza').update({ estado: 'aprobada' }).eq('id', fila.id)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/ACCION_COBRANZA_REQUIERE_ADMINISTRADOR/)
  })

  it('ACCION_COBRANZA_AUTOAPROBACION: un administrador no puede aprobar lo que él mismo propuso', async () => {
    const clienteAdministrador = await clienteComo(env!, administrador)
    const { data: fila, error: errInsert } = await clienteAdministrador
      .from('acciones_cobranza')
      .insert(payloadAccion())
      .select('id')
      .single<{ id: string }>()
    if (errInsert) throw new Error(`insert accion: ${errInsert.message}`)

    const { error } = await clienteAdministrador
      .from('acciones_cobranza')
      .update({ estado: 'aprobada' })
      .eq('id', fila.id)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/ACCION_COBRANZA_AUTOAPROBACION/)
  })

  it('control positivo: un administrador distinto sí puede aprobar, y queda registrado quién y cuándo', async () => {
    const clienteAdministrador = await clienteComo(env!, administrador)
    const { data: fila, error: errInsert } = await clienteAdministrador
      .from('acciones_cobranza')
      .insert(payloadAccion())
      .select('id')
      .single<{ id: string }>()
    if (errInsert) throw new Error(`insert accion: ${errInsert.message}`)

    const clienteAdministradorDos = await clienteComo(env!, administradorDos)
    const { error } = await clienteAdministradorDos
      .from('acciones_cobranza')
      .update({ estado: 'aprobada' })
      .eq('id', fila.id)
    expect(error).toBeNull()

    const { data: filaFinal } = await admin
      .from('acciones_cobranza')
      .select('estado, aprobada_por, aprobada_at, propuesta_por')
      .eq('id', fila.id)
      .single()
    expect(filaFinal?.estado).toBe('aprobada')
    expect(filaFinal?.aprobada_por).toBe(administradorDos.id)
    expect(filaFinal?.aprobada_at).not.toBeNull()
    expect(filaFinal?.propuesta_por).toBe(administrador.id)
  })

  it('control positivo: rechazar también funciona, y ACCION_COBRANZA_TRANSICION_INVALIDA bloquea reabrir una acción rechazada', async () => {
    const clienteAdministrador = await clienteComo(env!, administrador)
    const { data: fila, error: errInsert } = await clienteAdministrador
      .from('acciones_cobranza')
      .insert(payloadAccion())
      .select('id')
      .single<{ id: string }>()
    if (errInsert) throw new Error(`insert accion: ${errInsert.message}`)

    const clienteAdministradorDos = await clienteComo(env!, administradorDos)
    const { error: errRechazo } = await clienteAdministradorDos
      .from('acciones_cobranza')
      .update({ estado: 'rechazada' })
      .eq('id', fila.id)
    expect(errRechazo).toBeNull()

    const { error: errReabrir } = await clienteAdministradorDos
      .from('acciones_cobranza')
      .update({ estado: 'pendiente_aprobacion' })
      .eq('id', fila.id)
    expect(errReabrir).not.toBeNull()
    expect(errReabrir?.message).toMatch(/ACCION_COBRANZA_TRANSICION_INVALIDA/)
  })
})
