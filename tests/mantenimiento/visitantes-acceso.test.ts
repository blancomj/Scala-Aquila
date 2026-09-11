/**
 * MANT-11 (20260932750000-20260932780000) — visitantes y control de acceso. Ver
 * Casos de uso/Solicitudes - Reservas - Visitantes/MANT_11_visitantes_acceso.md §6
 * (11 pruebas obligatorias).
 *
 * La firma/verificación del QR (HMAC-SHA256, `_shared/link_token.ts`) exige Web Crypto de Deno —
 * imposible reproducir en una función SQL sin duplicar la lógica en dos runtimes. Por eso
 * `fn_autorizacion_visita_crear/validar/consumir` del spec se implementaron como Edge Functions
 * (`autorizacion-visita-crear/-validar/-consumir`), mismo patrón que `generar-qr-activo`/
 * `ver-inmueble` (MANT-0/GOB-0): estas pruebas invocan las Edge Functions reales vía
 * `cliente.functions.invoke`, no una función SQL directa, para ejercitar la firma/verificación
 * de verdad — no solo la mitad SQL (`fn_autorizacion_visita_marcar_usada`).
 *
 * El guard `AUTORIZACION_INMUEBLE_NO_VINCULADO` (prueba 1) se ejercita con un insert directo de
 * service-role, como EXT-01 hizo con `actor_externo_vinculo` y MANT-10 con `RESERVA_INMUEBLE_
 * NO_VINCULADO`: la vía real de creación desde External es EXT-03, todavía no existe.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import { readFileSync } from 'node:fs'
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
  console.warn('SALTADO tests/mantenimiento/visitantes-acceso: faltan variables de Supabase en .env')
}

const RAIZ = join(import.meta.dirname, '..', '..')

type AutorizacionRow = Database['public']['Tables']['mant_autorizaciones_visita']['Row']
type RegistroRow = Database['public']['Tables']['mant_registros_acceso']['Row']

d('MANT-11: visitantes y control de acceso', () => {
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
      .rpc('create_tenant', { p_name: `MANT-11 ${etiqueta}`, p_slug: `t11-${RUN_ID}-${etiqueta}` })
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

  async function crearAutorizacion(
    cliente: Cliente,
    params: { tenant_id: string; inmueble_id: string; visitante_nombre: string; fecha_prevista: string; hora_desde?: string; hora_hasta?: string },
  ): Promise<AutorizacionRow> {
    const { data, response } = await cliente.functions.invoke<AutorizacionRow>('autorizacion-visita-crear', {
      body: params,
    })
    if (response?.status !== 201 || !data) {
      throw new Error(`autorizacion-visita-crear: status ${String(response?.status)}`)
    }
    return data
  }

  async function validarQr(cliente: Cliente, qrToken: string) {
    return cliente.functions.invoke<AutorizacionRow>('autorizacion-visita-validar', { body: { qr_token: qrToken } })
  }

  async function consumirQr(cliente: Cliente, qrToken: string, observaciones?: string) {
    return cliente.functions.invoke<RegistroRow>('autorizacion-visita-consumir', {
      body: { qr_token: qrToken, ...(observaciones !== undefined && { observaciones }) },
    })
  }

  it('1. un actor externo autoriza una visita para su propio inmueble; falla para uno ajeno', async () => {
    const { tenantId } = await crearTenantCompleto('p1')
    const inmuebleSuyo = await crearInmueble(tenantId, `INM-${RUN_ID}-p1-suyo`)
    const inmuebleAjeno = await crearInmueble(tenantId, `INM-${RUN_ID}-p1-ajeno`)
    const vinculoId = await crearActorExterno(tenantId, inmuebleSuyo, `p1-${RUN_ID}`)

    const { error: eSuyo } = await admin.from('mant_autorizaciones_visita').insert({
      tenant_id: tenantId, inmueble_id: inmuebleSuyo, autorizado_por_ref: vinculoId,
      autorizado_por_origen: 'externo', visitante_nombre: 'Visita 1', fecha_prevista: '2027-04-01',
    })
    expect(eSuyo).toBeNull()

    const { error: eAjeno } = await admin.from('mant_autorizaciones_visita').insert({
      tenant_id: tenantId, inmueble_id: inmuebleAjeno, autorizado_por_ref: vinculoId,
      autorizado_por_origen: 'externo', visitante_nombre: 'Visita 2', fecha_prevista: '2027-04-01',
    })
    expect(eAjeno?.message).toContain('AUTORIZACION_INMUEBLE_NO_VINCULADO')
  }, 30_000)

  it('2. el QR generado tiene vigencia de horas, no de años (prueba central)', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p2')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-p2`)
    const autorizacion = await crearAutorizacion(cliente, {
      tenant_id: tenantId, inmueble_id: inmuebleId, visitante_nombre: 'Visita QR',
      fecha_prevista: '2027-04-02', hora_desde: '10:00', hora_hasta: '12:00',
    })
    expect(autorizacion.qr_token).toBeTruthy()
    expect(autorizacion.qr_expira_at).toBeTruthy()
    // MANT-0 (generar-qr-activo) firma con VIGENCIA_DIAS = 365*50 (~50 años). Este QR vence a
    // horas de la franja de la visita, no relativo a "ahora" (fecha_prevista es futura a
    // propósito) — se compara contra el fin de la franja (hora_hasta), no contra Date.now().
    const finFranja = new Date('2027-04-02T12:00:00Z')
    const horasSobreFinFranja = (new Date(autorizacion.qr_expira_at!).getTime() - finFranja.getTime()) / (3600 * 1000)
    expect(horasSobreFinFranja).toBeGreaterThan(0)
    expect(horasSobreFinFranja).toBeLessThan(24)
  }, 30_000)

  it('3. validar un QR no lo consume; consumirlo sí, y una segunda consumición falla', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p3')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-p3`)
    const autorizacion = await crearAutorizacion(cliente, {
      tenant_id: tenantId, inmueble_id: inmuebleId, visitante_nombre: 'Visita 3',
      fecha_prevista: '2027-04-03', hora_desde: '10:00', hora_hasta: '12:00',
    })

    const { data: validada, response: rValidar } = await validarQr(cliente, autorizacion.qr_token!)
    expect(rValidar?.status).toBe(200)
    expect(validada?.estado).toBe('vigente')

    const { response: rConsumir1 } = await consumirQr(cliente, autorizacion.qr_token!)
    expect(rConsumir1?.status).toBe(200)

    const { response: rConsumir2 } = await consumirQr(cliente, autorizacion.qr_token!)
    expect(rConsumir2?.status).not.toBe(200)
  }, 30_000)

  it('4. dos intentos simultáneos de consumir el mismo QR: solo uno tiene éxito', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p4')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-p4`)
    const autorizacion = await crearAutorizacion(cliente, {
      tenant_id: tenantId, inmueble_id: inmuebleId, visitante_nombre: 'Visita 4',
      fecha_prevista: '2027-04-04', hora_desde: '10:00', hora_hasta: '12:00',
    })

    const [r1, r2] = await Promise.all([
      consumirQr(cliente, autorizacion.qr_token!),
      consumirQr(cliente, autorizacion.qr_token!),
    ])
    const exitosos = [r1.response?.status, r2.response?.status].filter((s) => s === 200)
    expect(exitosos).toHaveLength(1)
  }, 30_000)

  it('5. una autorización vencida se deriva de qr_expira_at, no se escribe manualmente', async () => {
    const { tenantId } = await crearTenantCompleto('p5')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-p5`)
    const { data: fila, error } = await admin.from('mant_autorizaciones_visita').insert({
      tenant_id: tenantId, inmueble_id: inmuebleId, autorizado_por_ref: crypto.randomUUID(),
      autorizado_por_origen: 'staff', visitante_nombre: 'Visita 5', fecha_prevista: '2020-01-01',
      qr_expira_at: '2020-01-01T12:00:00Z',
    }).select('id, estado').single<{ id: string; estado: string }>()
    if (error) throw error
    expect(fila.estado).toBe('vigente')

    const { data: estadoReal, error: errFn } = await admin
      .rpc('mant_autorizacion_visita_vigente_real', { p_estado: fila.estado as never, p_qr_expira_at: '2020-01-01T12:00:00Z' })
    if (errFn) throw errFn
    expect(estadoReal).toBe('vencida')
  }, 30_000)

  it('6. revocar una autorización usada falla', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p6')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-p6`)
    const autorizacion = await crearAutorizacion(cliente, {
      tenant_id: tenantId, inmueble_id: inmuebleId, visitante_nombre: 'Visita 6',
      fecha_prevista: '2027-04-06', hora_desde: '10:00', hora_hasta: '12:00',
    })
    await consumirQr(cliente, autorizacion.qr_token!)

    const { error } = await cliente.rpc('fn_autorizacion_visita_revocar', { p_autorizacion_id: autorizacion.id })
    expect(error?.message).toContain('AUTORIZACION_ESTADO_INMUTABLE')
  }, 30_000)

  it('7. el registro de acceso lo crea un auxiliar; un actor externo no puede insertarlo directamente', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p7')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-p7`)
    const vinculoId = await crearActorExterno(tenantId, inmuebleId, `p7-${RUN_ID}`)
    const { data: vinculo } = await admin.from('actor_externo_vinculo').select('auth_user_id').eq('id', vinculoId).single()

    const { data: staffProfile } = await cliente.auth.getUser()
    const { error: eStaff } = await cliente.from('mant_registros_acceso').insert({
      tenant_id: tenantId, visitante_nombre: 'Visita 7', inmueble_destino_id: inmuebleId,
      registrado_por: staffProfile.user!.id,
    })
    expect(eStaff).toBeNull()

    const passwordExterno = `Aa1${crypto.randomUUID()}`
    await admin.auth.admin.updateUserById(vinculo!.auth_user_id, { password: passwordExterno })
    const { data: usuarioExterno } = await admin.auth.admin.getUserById(vinculo!.auth_user_id)
    const clienteExterno = await clienteComo(env!, {
      id: vinculo!.auth_user_id, email: usuarioExterno.user!.email!, password: passwordExterno,
    })
    const { error: eExterno } = await clienteExterno.from('mant_registros_acceso').insert({
      tenant_id: tenantId, visitante_nombre: 'Visita 7b', inmueble_destino_id: inmuebleId,
      registrado_por: staffProfile.user!.id,
    })
    expect(eExterno).toBeTruthy()
  }, 30_000)

  it('8. un acceso sin autorización previa se registra igual, con autorizacion_id = null', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p8')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-p8`)
    const { data: staffProfile } = await cliente.auth.getUser()
    const { data, error } = await cliente.from('mant_registros_acceso').insert({
      tenant_id: tenantId, visitante_nombre: 'Sin autorización', inmueble_destino_id: inmuebleId,
      registrado_por: staffProfile.user!.id, observaciones: 'Confirmado por llamada al residente',
    }).select('autorizacion_id').single()
    if (error) throw error
    expect(data.autorizacion_id).toBeNull()
  }, 30_000)

  it('9. visitante_documento no aparece en ninguna consulta de listado/resumen, solo en el detalle', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p9')
    const inmuebleId = await crearInmueble(tenantId, `INM-${RUN_ID}-p9`)
    const { data: staffProfile } = await cliente.auth.getUser()
    const { data: creado, error } = await cliente.from('mant_registros_acceso').insert({
      tenant_id: tenantId, visitante_nombre: 'Visita 9', visitante_documento: '123456789',
      inmueble_destino_id: inmuebleId, registrado_por: staffProfile.user!.id,
    }).select('id').single<{ id: string }>()
    if (error) throw error

    const { data: resumen, error: errResumen } = await cliente
      .from('mant_registros_acceso_resumen').select('*').eq('id', creado.id).single()
    if (errResumen) throw errResumen
    expect(Object.keys(resumen)).not.toContain('visitante_documento')

    const { data: detalle, error: errDetalle } = await cliente
      .from('mant_registros_acceso').select('visitante_documento').eq('id', creado.id).single()
    if (errDetalle) throw errDetalle
    expect(detalle.visitante_documento).toBe('123456789')
  }, 30_000)

  it('10. aislamiento entre tenants', async () => {
    const { tenantId: tenantA, cliente: clienteA } = await crearTenantCompleto('p10a')
    const { cliente: clienteB } = await crearTenantCompleto('p10b')
    const inmuebleA = await crearInmueble(tenantA, `INM-${RUN_ID}-p10a`)
    const autorizacion = await crearAutorizacion(clienteA, {
      tenant_id: tenantA, inmueble_id: inmuebleA, visitante_nombre: 'Visita 10',
      fecha_prevista: '2027-04-10', hora_desde: '10:00', hora_hasta: '12:00',
    })

    const { data: vistoPorB, error } = await clienteB.from('mant_autorizaciones_visita').select('id').eq('id', autorizacion.id)
    if (error) throw error
    expect(vistoPorB).toHaveLength(0)
  }, 30_000)

  it('11. los dos enums tienen comment on type', () => {
    const contenido = readFileSync(join(RAIZ, 'supabase/migrations/20260932750000_mant11_vocabulario.sql'), 'utf-8')
    expect(contenido).toMatch(/comment on type public\.autorizacion_visita_estado_t is/)
    expect(contenido).toMatch(/comment on type public\.autorizacion_origen_t is/)
  })
})
