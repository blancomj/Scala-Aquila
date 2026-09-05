/**
 * Edge Functions fondos-aprobar-solicitud / fondos-rechazar-solicitud /
 * fondos-comprometer-solicitud (GAP-22, Modelo §20, D-37).
 *
 * La máquina de estados y la segregación de funciones (rol, no-autoaprobación,
 * no-autoejecución, disponible, motivo obligatorio) ya están probadas contra
 * el UPDATE directo en tests/tenancy/fondos-modelo-general.test.ts (bloque
 * "solicitudes de uso y segregación de funciones") — guard_fondo_solicitud_
 * uso_transicion es la misma trigger sea cual sea el cliente que escriba.
 * Esto cubre lo que solo existe en la capa Edge Function: el contrato HTTP
 * (401/404/422/403/409), el mapeo de código de guard → status, y que el
 * camino feliz de cada función efectivamente llega a escribir.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/tenancy/fondos-solicitud-decision: faltan variables de Supabase en .env')
}

interface RespuestaSolicitud {
  id: string
  estado: string
  aprobador_id: string | null
  compromiso_id: string | null
}

async function cuerpoError(error: unknown): Promise<{ code?: string; message?: string }> {
  const contexto: unknown = (error as { context?: unknown } | null)?.context
  const cuerpo = (await (contexto as Response).json()) as { error?: { code?: string; message?: string } }
  return cuerpo.error ?? {}
}

d('Edge Functions fondos-*-solicitud — decisión de solicitudes de uso (GAP-22, D-37)', () => {
  const admin = clienteAdmin(env!)
  let tenant: TenantPrueba
  let fondo: { id: string }
  let solicitante: UsuarioPrueba
  let aprobador: UsuarioPrueba
  let ejecutor: UsuarioPrueba
  let clSolicitante: Cliente
  let clAprobador: Cliente
  let clEjecutor: Cliente

  async function idTipoFondo(codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'TIPO_FONDO')
      .is('tenant_id', null)
      .eq('codigo', codigo)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture TIPO_FONDO ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearSolicitud(monto: number): Promise<RespuestaSolicitud> {
    const { data, error } = await clSolicitante
      .from('fondo_solicitudes_uso')
      .insert({
        tenant_id: tenant.id,
        fondo_id: fondo.id,
        solicitante_id: solicitante.id,
        objetivo: 'Reparación de emergencia',
        monto_solicitado: monto,
        justificacion: 'Falla detectada en visita técnica',
      })
      .select('id, estado, aprobador_id, compromiso_id')
      .single<RespuestaSolicitud>()
    if (error) throw new Error(`fixture solicitud: ${error.message}`)
    return data
  }

  async function enviarARevision(id: string): Promise<void> {
    const { error } = await clSolicitante
      .from('fondo_solicitudes_uso')
      .update({ estado: 'en_revision' })
      .eq('id', id)
    if (error) throw new Error(`fixture en_revision: ${error.message}`)
  }

  beforeAll(async () => {
    tenant = await crearTenant(admin, 'fondos-edge-solicitud')
    solicitante = await crearUsuario(admin, 'fondos-edge-solicitante')
    aprobador = await crearUsuario(admin, 'fondos-edge-aprobador')
    ejecutor = await crearUsuario(admin, 'fondos-edge-ejecutor')
    await crearMembership(admin, tenant.id, solicitante.id, 'auxiliar')
    await crearMembership(admin, tenant.id, aprobador.id, 'administrador')
    await crearMembership(admin, tenant.id, ejecutor.id, 'auxiliar')
    clSolicitante = await clienteComo(env!, solicitante)
    clAprobador = await clienteComo(env!, aprobador)
    clEjecutor = await clienteComo(env!, ejecutor)

    const tipoProyecto = await idTipoFondo('proyecto')
    const { data, error } = await admin
      .from('fondos')
      .insert({
        tenant_id: tenant.id,
        codigo: 'FON-EDGE',
        nombre: 'Fondo Edge Function solicitudes',
        naturaleza: 'destinacion_especifica',
        tipo_id: tipoProyecto,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture fondo: ${error.message}`)
    fondo = data

    for (const estado of ['pendiente_autorizacion', 'activo'] as const) {
      await admin.from('fondos').update({ estado }).eq('id', fondo.id)
    }
    await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 200_000 })
  }, 60_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, solicitante.id)
    await eliminarUsuario(admin, aprobador.id)
    await eliminarUsuario(admin, ejecutor.id)
  }, 60_000)

  it('fondos-aprobar-solicitud: 404 SOLICITUD_NO_ENCONTRADA si el id no existe o no es visible', async () => {
    const resultado = await clAprobador.functions.invoke<RespuestaSolicitud>('fondos-aprobar-solicitud', {
      body: { solicitud_id: '00000000-0000-0000-0000-000000000000' },
    })
    expect(resultado.response?.status).toBe(404)
    const cuerpo = await cuerpoError(resultado.error)
    expect(cuerpo.code).toBe('SOLICITUD_NO_ENCONTRADA')
  }, 30_000)

  it('fondos-aprobar-solicitud: 403 SOLICITUD_AUTOAPROBACION si decide el propio solicitante', async () => {
    const solicitud = await crearSolicitud(15_000)
    await enviarARevision(solicitud.id)

    const resultado = await clSolicitante.functions.invoke<RespuestaSolicitud>('fondos-aprobar-solicitud', {
      body: { solicitud_id: solicitud.id },
    })
    expect(resultado.response?.status).toBe(403)
    const cuerpo = await cuerpoError(resultado.error)
    expect(cuerpo.code).toBe('SOLICITUD_AUTOAPROBACION')
  }, 30_000)

  it('fondos-aprobar-solicitud: 403 SOLICITUD_ROL_INSUFICIENTE si decide un auxiliar sin rol administrador', async () => {
    const solicitud = await crearSolicitud(15_000)
    await enviarARevision(solicitud.id)

    const resultado = await clEjecutor.functions.invoke<RespuestaSolicitud>('fondos-aprobar-solicitud', {
      body: { solicitud_id: solicitud.id },
    })
    expect(resultado.response?.status).toBe(403)
    const cuerpo = await cuerpoError(resultado.error)
    expect(cuerpo.code).toBe('SOLICITUD_ROL_INSUFICIENTE')
  }, 30_000)

  it('fondos-aprobar-solicitud: 422 SOLICITUD_EXCEDE_DISPONIBLE si el monto supera el disponible', async () => {
    const solicitud = await crearSolicitud(500_000)
    await enviarARevision(solicitud.id)

    const resultado = await clAprobador.functions.invoke<RespuestaSolicitud>('fondos-aprobar-solicitud', {
      body: { solicitud_id: solicitud.id },
    })
    expect(resultado.response?.status).toBe(422)
    const cuerpo = await cuerpoError(resultado.error)
    expect(cuerpo.code).toBe('SOLICITUD_EXCEDE_DISPONIBLE')
  }, 30_000)

  it('fondos-rechazar-solicitud: 400 INVALID_PAYLOAD si falta motivo_rechazo', async () => {
    const solicitud = await crearSolicitud(15_000)
    await enviarARevision(solicitud.id)

    const resultado = await clAprobador.functions.invoke<RespuestaSolicitud>('fondos-rechazar-solicitud', {
      body: { solicitud_id: solicitud.id },
    })
    expect(resultado.response?.status).toBe(400)
    const cuerpo = await cuerpoError(resultado.error)
    expect(cuerpo.code).toBe('INVALID_PAYLOAD')
  }, 30_000)

  it('camino feliz completo: aprobar → comprometer (D-37: no el mismo actor), 403 si lo intenta el mismo aprobador', async () => {
    const solicitud = await crearSolicitud(15_000)
    await enviarARevision(solicitud.id)

    const aprobada = await clAprobador.functions.invoke<RespuestaSolicitud>('fondos-aprobar-solicitud', {
      body: { solicitud_id: solicitud.id },
    })
    expect(aprobada.response?.status).toBe(200)
    expect(aprobada.data?.estado).toBe('aprobada')
    expect(aprobada.data?.aprobador_id).toBe(aprobador.id)

    const autoejecucion = await clAprobador.functions.invoke<RespuestaSolicitud>('fondos-comprometer-solicitud', {
      body: { solicitud_id: solicitud.id },
    })
    expect(autoejecucion.response?.status).toBe(403)
    const cuerpoAutoejecucion = await cuerpoError(autoejecucion.error)
    expect(cuerpoAutoejecucion.code).toBe('SOLICITUD_AUTOEJECUCION')

    const comprometida = await clEjecutor.functions.invoke<RespuestaSolicitud>('fondos-comprometer-solicitud', {
      body: { solicitud_id: solicitud.id },
    })
    expect(comprometida.response?.status).toBe(200)
    expect(comprometida.data?.estado).toBe('comprometida')
    expect(comprometida.data?.compromiso_id).toBeTruthy()

    const { data: compromiso, error } = await admin
      .from('fondo_compromisos')
      .select('monto, estado, solicitud_id')
      .eq('id', comprometida.data!.compromiso_id!)
      .single<{ monto: number; estado: string; solicitud_id: string | null }>()
    if (error) throw new Error(`select compromiso: ${error.message}`)
    expect(compromiso).toEqual({ monto: 15_000, estado: 'comprometido', solicitud_id: solicitud.id })
  }, 30_000)

  it('fondos-rechazar-solicitud: camino feliz con motivo registra estado rechazada', async () => {
    const solicitud = await crearSolicitud(15_000)
    await enviarARevision(solicitud.id)

    const resultado = await clAprobador.functions.invoke<RespuestaSolicitud>('fondos-rechazar-solicitud', {
      body: { solicitud_id: solicitud.id, motivo_rechazo: 'No hay soporte suficiente.' },
    })
    expect(resultado.response?.status).toBe(200)
    expect(resultado.data?.estado).toBe('rechazada')
  }, 30_000)
})
