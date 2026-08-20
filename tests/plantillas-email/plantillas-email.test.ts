/**
 * Plantillas de correo — prueba la capa de RPC directamente
 * (fn_guardar_plantilla_email), sin pasar por las Edge Functions ni por
 * Brevo — mismo criterio que tests/plantillas-sms/plantillas-sms.test.ts:
 * la sincronización real se prueba manualmente una vez haya confirmación
 * explícita para el primer guardado real (mismo patrón que el worker de SMS).
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
  console.warn('SALTADO tests/plantillas-email: faltan variables de Supabase en .env')
}

d('Plantillas de correo (RPC)', () => {
  const admin = clienteAdmin(env!)
  let agentUser: UsuarioPrueba
  let auditorUser: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente
  let clienteAuditor: Cliente

  beforeAll(async () => {
    agentUser = await crearUsuario(admin, 'email-agent')
    auditorUser = await crearUsuario(admin, 'email-auditor')
    tenant = await crearTenant(admin, 'email', agentUser.id)
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
      .from('email_templates')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('event_type', 'cartera_recordatorio_pago')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('fn_guardar_plantilla_email: agent puede guardar (alta), sin brevo_template_id, sin sincronizar, y queda auditado', async () => {
    const { data, error } = await clienteAgent.rpc('fn_guardar_plantilla_email', {
      p_tenant_id: tenant.id,
      p_event_type: 'cartera_recordatorio_pago',
      p_subject: 'Recordatorio para {{ params.inmueble }}',
      p_html_content: '<p>Hola {{ params.nombreResidente }}, tu saldo es {{ params.saldoPendiente }}.</p>',
    })
    expect(error).toBeNull()
    expect(data?.subject).toBe('Recordatorio para {{ params.inmueble }}')
    expect(data?.brevo_template_id).toBeNull()
    expect(data?.is_synced).toBe(false)
    expect(data?.last_synced_at).toBeNull()

    const { data: auditoria } = await admin
      .from('audit_log')
      .select('action, metadata')
      .eq('tenant_id', tenant.id)
      .eq('action', 'plantilla_email.guardada')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(auditoria?.metadata).toMatchObject({
      event_type: 'cartera_recordatorio_pago',
      subject_anterior: null,
      subject_nuevo: 'Recordatorio para {{ params.inmueble }}',
    })
  })

  it('fn_guardar_plantilla_email: actualización guarda el asunto anterior y el nuevo en la auditoría, y vuelve a marcar is_synced=false', async () => {
    await clienteAgent.rpc('fn_guardar_plantilla_email', {
      p_tenant_id: tenant.id,
      p_event_type: 'cartera_pago_confirmado',
      p_subject: 'Asunto original',
      p_html_content: '<p>Contenido original con suficiente longitud</p>',
    })
    const { data, error } = await clienteAgent.rpc('fn_guardar_plantilla_email', {
      p_tenant_id: tenant.id,
      p_event_type: 'cartera_pago_confirmado',
      p_subject: 'Asunto actualizado',
      p_html_content: '<p>Contenido actualizado con suficiente longitud</p>',
    })
    expect(error).toBeNull()
    expect(data?.subject).toBe('Asunto actualizado')
    expect(data?.is_synced).toBe(false)

    const { data: auditoria } = await admin
      .from('audit_log')
      .select('metadata')
      .eq('tenant_id', tenant.id)
      .eq('action', 'plantilla_email.guardada')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(auditoria?.metadata).toMatchObject({
      event_type: 'cartera_pago_confirmado',
      subject_anterior: 'Asunto original',
      subject_nuevo: 'Asunto actualizado',
    })
  })

  it('fn_guardar_plantilla_email: EMAIL_BODY_TOO_SHORT como respaldo en base de datos', async () => {
    const { error } = await clienteAgent.rpc('fn_guardar_plantilla_email', {
      p_tenant_id: tenant.id,
      p_event_type: 'cartera_pago_vencido',
      p_subject: 'asunto',
      p_html_content: 'corto',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^EMAIL_BODY_TOO_SHORT:/)
  })

  it('fn_guardar_plantilla_email: auditor NO puede guardar (FORBIDDEN)', async () => {
    const { error } = await clienteAuditor.rpc('fn_guardar_plantilla_email', {
      p_tenant_id: tenant.id,
      p_event_type: 'cartera_acuerdo_pago_creado',
      p_subject: 'Asunto de auditor',
      p_html_content: '<p>Contenido de auditor con suficiente longitud</p>',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^FORBIDDEN:/)
  })

  it('listado: con fila previa, refleja el asunto guardado', async () => {
    const { data, error } = await clienteAgent
      .from('email_templates')
      .select('event_type, subject, is_synced')
      .eq('tenant_id', tenant.id)
      .eq('event_type', 'cartera_recordatorio_pago')
      .single()
    expect(error).toBeNull()
    expect(data?.subject).toBe('Recordatorio para {{ params.inmueble }}')
    expect(data?.is_synced).toBe(false)
  })
})
