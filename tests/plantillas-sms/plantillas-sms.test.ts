/**
 * Plantillas SMS — prueba la capa de RPC directamente (fn_guardar_plantilla_sms,
 * fn_toggle_plantilla_sms), sin pasar por las Edge Functions ni por Brevo —
 * mismo criterio que tests/invitations/invitations.test.ts: el envío real
 * de SMS se prueba manualmente una vez haya credenciales de Brevo
 * configuradas (BREVO_API_KEY/BREVO_SMS_SENDER).
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
  console.warn('SALTADO tests/plantillas-sms: faltan variables de Supabase en .env')
}

d('Plantillas SMS (RPC)', () => {
  const admin = clienteAdmin(env!)
  let agentUser: UsuarioPrueba
  let auditorUser: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente
  let clienteAuditor: Cliente

  beforeAll(async () => {
    agentUser = await crearUsuario(admin, 'sms-agent')
    auditorUser = await crearUsuario(admin, 'sms-auditor')
    tenant = await crearTenant(admin, 'sms', agentUser.id)
    await crearMembership(admin, tenant.id, agentUser.id, 'auxiliar')
    await crearMembership(admin, tenant.id, auditorUser.id, 'auditor')
    clienteAgent = await clienteComo(env!, agentUser)
    clienteAuditor = await clienteComo(env!, auditorUser)
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agentUser.id)
    await eliminarUsuario(admin, auditorUser.id)
  }, 30_000)

  it('listado: sin fila previa, la tabla simplemente no tiene el evento', async () => {
    const { data, error } = await clienteAgent
      .from('plantillas_sms')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('event_type', 'cartera_recordatorio_pago')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('fn_guardar_plantilla_sms: agent puede guardar (alta) y queda auditado', async () => {
    const { data, error } = await clienteAgent.rpc('fn_guardar_plantilla_sms', {
      p_tenant_id: tenant.id,
      p_event_type: 'cartera_recordatorio_pago',
      p_cuerpo: 'Hola {nombreResidente}, tu saldo es {saldoPendiente}.',
    })
    expect(error).toBeNull()
    expect(data?.cuerpo).toBe('Hola {nombreResidente}, tu saldo es {saldoPendiente}.')
    expect(data?.activo).toBe(false)

    const { data: auditoria } = await admin
      .from('audit_log')
      .select('action, metadata')
      .eq('tenant_id', tenant.id)
      .eq('action', 'plantilla_sms.guardada')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(auditoria?.metadata).toMatchObject({
      event_type: 'cartera_recordatorio_pago',
      cuerpo_anterior: null,
      cuerpo_nuevo: 'Hola {nombreResidente}, tu saldo es {saldoPendiente}.',
    })
  })

  it('fn_guardar_plantilla_sms: actualización guarda el texto anterior y el nuevo en la auditoría', async () => {
    await clienteAgent.rpc('fn_guardar_plantilla_sms', {
      p_tenant_id: tenant.id,
      p_event_type: 'cartera_pago_confirmado',
      p_cuerpo: 'Texto original',
    })
    const { data, error } = await clienteAgent.rpc('fn_guardar_plantilla_sms', {
      p_tenant_id: tenant.id,
      p_event_type: 'cartera_pago_confirmado',
      p_cuerpo: 'Texto actualizado',
    })
    expect(error).toBeNull()
    expect(data?.cuerpo).toBe('Texto actualizado')

    const { data: auditoria } = await admin
      .from('audit_log')
      .select('metadata')
      .eq('tenant_id', tenant.id)
      .eq('action', 'plantilla_sms.guardada')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(auditoria?.metadata).toMatchObject({
      event_type: 'cartera_pago_confirmado',
      cuerpo_anterior: 'Texto original',
      cuerpo_nuevo: 'Texto actualizado',
    })
  })

  it('fn_guardar_plantilla_sms: auditor NO puede guardar (FORBIDDEN)', async () => {
    const { error } = await clienteAuditor.rpc('fn_guardar_plantilla_sms', {
      p_tenant_id: tenant.id,
      p_event_type: 'cartera_pago_vencido',
      p_cuerpo: 'Texto de auditor',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^FORBIDDEN:/)
  })

  it('fn_toggle_plantilla_sms: sobre evento sin plantilla → SMS_TEMPLATE_NOT_FOUND', async () => {
    const { error } = await clienteAgent.rpc('fn_toggle_plantilla_sms', {
      p_tenant_id: tenant.id,
      p_event_type: 'cartera_acuerdo_pago_creado',
      p_activo: true,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^SMS_TEMPLATE_NOT_FOUND:/)
  })

  it('fn_toggle_plantilla_sms: agent enciende/apaga el interruptor y queda auditado', async () => {
    const { data: encendido, error: errorEncender } = await clienteAgent.rpc(
      'fn_toggle_plantilla_sms',
      { p_tenant_id: tenant.id, p_event_type: 'cartera_recordatorio_pago', p_activo: true },
    )
    expect(errorEncender).toBeNull()
    expect(encendido?.activo).toBe(true)

    const { data: apagado, error: errorApagar } = await clienteAgent.rpc('fn_toggle_plantilla_sms', {
      p_tenant_id: tenant.id,
      p_event_type: 'cartera_recordatorio_pago',
      p_activo: false,
    })
    expect(errorApagar).toBeNull()
    expect(apagado?.activo).toBe(false)

    const { data: auditoria } = await admin
      .from('audit_log')
      .select('metadata')
      .eq('tenant_id', tenant.id)
      .eq('action', 'plantilla_sms.interruptor_cambiado')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(auditoria?.metadata).toMatchObject({
      event_type: 'cartera_recordatorio_pago',
      activo: false,
    })
  })

  it('fn_toggle_plantilla_sms: auditor NO puede cambiar el interruptor (FORBIDDEN)', async () => {
    const { error } = await clienteAuditor.rpc('fn_toggle_plantilla_sms', {
      p_tenant_id: tenant.id,
      p_event_type: 'cartera_recordatorio_pago',
      p_activo: true,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^FORBIDDEN:/)
  })

  it('fn_guardar_plantilla_sms: rechaza contenido prohibido (CJ-4 §11.3) sin guardar nada', async () => {
    const { error } = await clienteAgent.rpc('fn_guardar_plantilla_sms', {
      p_tenant_id: tenant.id,
      p_event_type: 'cartera_aviso_prejuridico',
      p_cuerpo: 'Si no paga, procederemos a embargar su inmueble de inmediato.',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^CONTENIDO_PROHIBIDO:/)
    expect(error?.message).toMatch(/procederemos a embargar/)

    const { data } = await clienteAgent
      .from('plantillas_sms')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('event_type', 'cartera_aviso_prejuridico')
      .maybeSingle()
    expect(data).toBeNull()
  })

  it('listado: con fila previa, refleja el cuerpo guardado', async () => {
    const { data, error } = await clienteAgent
      .from('plantillas_sms')
      .select('event_type, cuerpo, activo')
      .eq('tenant_id', tenant.id)
      .eq('event_type', 'cartera_recordatorio_pago')
      .single()
    expect(error).toBeNull()
    expect(data?.cuerpo).toBe('Hola {nombreResidente}, tu saldo es {saldoPendiente}.')
  })
})
