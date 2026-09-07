/**
 * CAR §23.5 / bloque 16 — fn_bandeja_cobranza y las reglas de decisión que
 * la pantalla de acciones da por ciertas.
 *
 * Lo que se prueba no es solo que la función devuelva filas: es que la
 * bandeja no pueda mentir sobre el estado probatorio, y que las barreras
 * del maker-checker vivan en la base y no en la interfaz. Un botón
 * deshabilitado es una cortesía; el trigger es la barrera.
 */
import { afterAll, describe, expect, it } from 'vitest'
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
} from '../rls/helpers.js'

type TipoAccionCobranza = Database['public']['Enums']['tipo_accion_cobranza_t']

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/tenancy/cartera-bandeja: faltan variables de Supabase en .env')
}

interface FilaBandeja {
  accion_id: string
  inmueble_codigo: string
  estado: string
  tipo_accion: string
  destinatario_nombre: string | null
  destinatario_contacto: string | null
  envios_total: number
  ultimo_estado_acuse: string | null
  acreditada: boolean
  dias_mora: number
}

async function listaTipoId(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

d('CAR §23.5 — bandeja de acciones de cobranza', () => {
  const admin = clienteAdmin(env!)
  let administrador: UsuarioPrueba
  let auxiliar: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAdministrador: Cliente
  let clienteAuxiliar: Cliente
  let politicaId: string
  let terceroId: string
  let inmuebleAlto: string
  let inmuebleSimple: string
  let accionPendiente: string
  let accionAcreditada: string

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, administrador.id)
    await eliminarUsuario(admin, auxiliar.id)
  })

  async function crearAccion(
    inmuebleId: string,
    tipoAccion: TipoAccionCobranza,
    estado: 'programada' | 'pendiente_aprobacion',
    diasMora: number,
  ): Promise<string> {
    const { data, error } = await admin
      .from('acciones_cobranza')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        tipo_accion: tipoAccion,
        canal: tipoAccion === 'sms' ? 'sms' : 'email',
        fecha_programada: '2026-08-20',
        clasificacion_codigo: 'MORA',
        politica_clasificacion_id: politicaId,
        politica_version: 1,
        dias_mora_al_momento: diasMora,
        deuda_total_al_momento: 900_000,
        destinatario_tercero_id: terceroId,
        destinatario_rol_codigo: 'copropietario',
        estado,
        creada_por: 'job',
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`crearAccion: ${error.message}`)
    return data.id
  }

  it('setup: dos acciones, una esperando aprobación y otra ya acreditada', async () => {
    administrador = await crearUsuario(admin, 'cbn-admin')
    auxiliar = await crearUsuario(admin, 'cbn-aux')
    tenant = await crearTenant(admin, 'cbn', administrador.id)
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    clienteAdministrador = await clienteComo(env!, administrador)
    clienteAuxiliar = await clienteComo(env!, auxiliar)

    const { data: politica, error: errPol } = await admin
      .from('politicas_clasificacion_cartera')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        estado: 'vigente',
        nombre: 'Política bandeja',
        policy_hash: `test-bandeja-${tenant.id}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPol) throw new Error(`fixture politica: ${errPol.message}`)
    politicaId = politica.id

    const tipoInmueble = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
    const sello = String(Date.now())
    const { data: inmuebles, error: errInm } = await admin
      .from('inmuebles')
      .insert([
        { tenant_id: tenant.id, codigo: `CBN-ALTO-${sello}`, tipo_id: tipoInmueble },
        { tenant_id: tenant.id, codigo: `CBN-SIMPLE-${sello}`, tipo_id: tipoInmueble },
      ])
      .select('id')
    if (errInm) throw new Error(`fixture inmuebles: ${errInm.message}`)
    inmuebleAlto = inmuebles[0]!.id
    inmuebleSimple = inmuebles[1]!.id

    const tipoIdent = await listaTipoId(admin, 'TIPO_IDENTIFICACION', 'cedula')
    const estadoActivo = await listaTipoId(admin, 'ESTADO_TERCERO', 'activo')
    const { data: tercero, error: errTer } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_identificacion_id: tipoIdent,
        numero_documento: `CBN-${sello}`,
        tipo_persona: 'natural',
        primer_nombre: 'Bandeja',
        primer_apellido: 'Prueba',
        email: `cbn-${sello}@example.test`,
        estado_id: estadoActivo,
      })
      .select('id')
      .single<{ id: string }>()
    if (errTer) throw new Error(`fixture tercero: ${errTer.message}`)
    terceroId = tercero.id

    // Alta de mora + espera aprobación: debe salir primero en la cola.
    accionPendiente = await crearAccion(inmuebleAlto, 'requerimiento_formal', 'pendiente_aprobacion', 75)
    // Ya despachada y con acuse de entrega.
    accionAcreditada = await crearAccion(inmuebleSimple, 'sms', 'programada', 20)
    await admin.from('acciones_cobranza').update({ estado: 'ejecutando' }).eq('id', accionAcreditada)
    await admin.from('acciones_cobranza').update({ estado: 'ejecutada' }).eq('id', accionAcreditada)

    const { data: envio, error: errEnvio } = await admin
      .from('acciones_cobranza_envios')
      .insert({
        tenant_id: tenant.id,
        accion_id: accionAcreditada,
        intento_numero: 1,
        canal: 'sms',
        destinatario_tercero_id: terceroId,
        destinatario_contacto: '+573000000000',
        plantilla_codigo: 'cartera_pago_vencido',
        plantilla_version: 0,
        contenido_renderizado: 'Texto exacto que recibió el deudor.',
        contenido_hash: 'hash-bandeja',
        proveedor: 'brevo',
        referencia_externa: `bandeja-${sello}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errEnvio) throw new Error(`fixture envío: ${errEnvio.message}`)

    await admin.from('acciones_cobranza_acuses').insert({
      tenant_id: tenant.id,
      envio_id: envio.id,
      estado: 'entregado',
      ocurrido_at: '2026-08-20T15:00:00Z',
      origen: 'proveedor',
    })
  }, 90_000)

  it('ordena por urgencia: lo que espera aprobación va primero', async () => {
    const { data, error } = await clienteAdministrador.rpc('fn_bandeja_cobranza', {
      p_tenant_id: tenant.id,
    })
    expect(error).toBeNull()
    const filas = data as unknown as FilaBandeja[]
    expect(filas.length).toBe(2)
    expect(filas[0]!.accion_id).toBe(accionPendiente)
    expect(filas[0]!.estado).toBe('pendiente_aprobacion')
  }, 30_000)

  it('trae el estado probatorio derivado, no un campo persistido', async () => {
    const { data } = await clienteAdministrador.rpc('fn_bandeja_cobranza', { p_tenant_id: tenant.id })
    const filas = data as unknown as FilaBandeja[]

    const acreditada = filas.find((f) => f.accion_id === accionAcreditada)!
    expect(acreditada.envios_total).toBe(1)
    expect(acreditada.ultimo_estado_acuse).toBe('entregado')
    expect(acreditada.acreditada).toBe(true)

    // La que nunca se envió: despachar y acreditar son cosas distintas y la
    // bandeja no puede insinuar lo contrario.
    const pendiente = filas.find((f) => f.accion_id === accionPendiente)!
    expect(pendiente.envios_total).toBe(0)
    expect(pendiente.ultimo_estado_acuse).toBeNull()
    expect(pendiente.acreditada).toBe(false)
  }, 30_000)

  it('filtra por estado y resuelve el destinatario', async () => {
    const { data } = await clienteAdministrador.rpc('fn_bandeja_cobranza', {
      p_tenant_id: tenant.id,
      p_estados: ['pendiente_aprobacion'],
    })
    const filas = data as unknown as FilaBandeja[]
    expect(filas.length).toBe(1)
    expect(filas[0]!.tipo_accion).toBe('requerimiento_formal')
    expect(filas[0]!.destinatario_nombre).toContain('Bandeja')
    expect(filas[0]!.destinatario_contacto).toContain('@example.test')
    expect(filas[0]!.dias_mora).toBe(75)
  }, 30_000)

  it('un auxiliar ve la cola pero no puede aprobar — la barrera está en la base', async () => {
    const { data, error } = await clienteAuxiliar.rpc('fn_bandeja_cobranza', { p_tenant_id: tenant.id })
    expect(error).toBeNull()
    expect((data as unknown as FilaBandeja[]).length).toBe(2)

    const { error: errAprobar } = await clienteAuxiliar
      .from('acciones_cobranza')
      .update({ estado: 'aprobada' })
      .eq('id', accionPendiente)
    expect(errAprobar).not.toBeNull()
    expect(errAprobar?.message ?? '').toMatch(/ACCION_COBRANZA_REQUIERE_ADMINISTRADOR/i)

    // Y la acción sigue esperando: un intento fallido no la mueve.
    const { data: sinCambio } = await admin
      .from('acciones_cobranza')
      .select('estado')
      .eq('id', accionPendiente)
      .single<{ estado: string }>()
    expect(sinCambio!.estado).toBe('pendiente_aprobacion')
  }, 30_000)

  it('el administrador aprueba y queda registrado quién decidió (art. 48)', async () => {
    const { error } = await clienteAdministrador
      .from('acciones_cobranza')
      .update({ estado: 'aprobada' })
      .eq('id', accionPendiente)
    expect(error).toBeNull()

    const { data: decidida } = await admin
      .from('acciones_cobranza')
      .select('estado, aprobada_por, aprobada_at')
      .eq('id', accionPendiente)
      .single<{ estado: string; aprobada_por: string | null; aprobada_at: string | null }>()
    expect(decidida!.estado).toBe('aprobada')
    // El firmante identificado no lo pone el cliente: lo estampa el trigger
    // desde auth.uid().
    expect(decidida!.aprobada_por).toBe(administrador.id)
    expect(decidida!.aprobada_at).not.toBeNull()
  }, 30_000)

  it('RLS: la bandeja de otro tenant no devuelve filas aunque se pase su id', async () => {
    const intruso = await crearUsuario(admin, 'cbn-intruso')
    try {
      const clienteIntruso = await clienteComo(env!, intruso)
      const { data, error } = await clienteIntruso.rpc('fn_bandeja_cobranza', { p_tenant_id: tenant.id })
      expect(error).toBeNull()
      // p_tenant_id es un filtro, no un permiso.
      expect((data as unknown as FilaBandeja[]).length).toBe(0)
    } finally {
      await eliminarUsuario(admin, intruso.id)
    }
  }, 60_000)
})
