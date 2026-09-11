/**
 * COM-1 — el compositor de correo envía de verdad, contra Brevo real.
 *
 * Hasta esta sesión, nada probaba que enviar-correo-compositor efectivamente entregara nada a
 * Brevo (la única cobertura previa, packages/shared/src/compositor.test.ts, solo valida el
 * registro de placeholders — nunca invoca la Edge Function). Este test ENVÍA UN CORREO DE VERDAD
 * a un dominio reservado por RFC 2606 (example.com, nunca resuelve a un buzón real) — a diferencia
 * del SMS de cartera-envio-evidencia.test.ts, un envío de correo transaccional no consume un
 * crédito con costo relevante, así que no requiere autorización aparte del propietario del
 * producto.
 *
 * Lo que se verifica es exactamente lo que el usuario pidió poder confiar:
 *   1. Brevo aceptó el correo (no es un mock, es la respuesta real de /v3/smtp/email).
 *   2. El envío quedó registrado en acciones_cobranza_envios con origen_modulo='compositor' y
 *      destinatario_tercero_id NULL (destinatario suelto, COM-1) — antes de COM-1 esto no
 *      dejaba ningún rastro recuperable ahí, solo un insert suelto en audit_log.
 *   3. Quedó un acuse inicial 'encolado' — sin esto, el webhook de Brevo no tendría nada contra
 *      qué resolver la confirmación de entrega real.
 */
import { afterAll, describe, expect, it } from 'vitest'
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
  console.warn('SALTADO tests/tenancy/compositor-correo-envio: faltan variables de Supabase en .env')
}

/** Dominio de ejemplo reservado por RFC 2606 — nunca resuelve a un buzón real (mismo criterio que
 * cartera-canal-email.test.ts). */
const EMAIL_PRUEBA = 'residente.prueba@example.com'

interface RespuestaCompositor {
  ok: boolean
  campos_resueltos: string[]
  campos_no_resueltos?: string[]
}

d('COM-1 — compositor de correo: envío real y rastro en el histórico', () => {
  const admin = clienteAdmin(env!)
  let administrador: UsuarioPrueba
  let tenant: TenantPrueba
  let cliente: Cliente

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, administrador.id)
  })

  it('setup: copropiedad con el compositor de correo activo', async () => {
    administrador = await crearUsuario(admin, 'cce-admin')
    tenant = await crearTenant(admin, 'cce', administrador.id)
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    cliente = await clienteComo(env!, administrador)

    const { error } = await admin
      .from('tenants')
      .update({ compositor_correo_activo: true })
      .eq('id', tenant.id)
    if (error) throw new Error(`activar compositor_correo_activo: ${error.message}`)
  }, 30_000)

  it('envía el correo de verdad y deja rastro completo en acciones_cobranza_envios', async () => {
    const { data, response } = await cliente.functions.invoke<RespuestaCompositor>('enviar-correo-compositor', {
      body: {
        tenant_id: tenant.id,
        destinatario_email: EMAIL_PRUEBA,
        destinatario_nombre: 'Residente de Prueba',
        asunto: 'COM-1: prueba automatizada de envío',
        cuerpo: 'Este es un correo de prueba automatizada — confirma que el compositor sí envía.',
      },
    })
    expect(response?.status).toBe(200)
    expect(data?.ok).toBe(true)

    const { data: envios, error } = await admin
      .from('acciones_cobranza_envios')
      .select('*, acciones_cobranza_acuses(estado, origen)')
      .eq('tenant_id', tenant.id)
      .eq('origen_modulo', 'compositor')
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) throw new Error(`consultar envío: ${error.message}`)
    expect(envios).toHaveLength(1)

    const envio = envios[0] as unknown as {
      accion_id: string | null
      origen_entidad: string
      origen_evento: string
      canal: string
      destinatario_tercero_id: string | null
      destinatario_contacto: string
      contenido_renderizado: string
      proveedor: string
      referencia_externa: string | null
      es_automatico: boolean
      acciones_cobranza_acuses: { estado: string; origen: string }[]
    }

    expect(envio.accion_id).toBeNull()
    expect(envio.origen_entidad).toBe('compositor_envio')
    expect(envio.origen_evento).toBe('compositor_correo.enviado')
    expect(envio.canal).toBe('email')
    // COM-1: sin destinatario_tercero_id — es un correo suelto, no vinculado a terceros.
    expect(envio.destinatario_tercero_id).toBeNull()
    expect(envio.destinatario_contacto).toBe(EMAIL_PRUEBA)
    expect(envio.contenido_renderizado).toContain('confirma que el compositor sí envía')
    expect(envio.proveedor).toBe('brevo')
    expect(envio.es_automatico).toBe(false)
    // Brevo aceptó el correo de verdad: sin esto no habría con qué resolver un acuse de entrega.
    expect(envio.referencia_externa).toBeTruthy()
    expect(envio.acciones_cobranza_acuses).toHaveLength(1)
    expect(envio.acciones_cobranza_acuses[0]!.estado).toBe('encolado')
    expect(envio.acciones_cobranza_acuses[0]!.origen).toBe('proveedor')
  }, 30_000)
})
