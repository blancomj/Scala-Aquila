/**
 * webhook-pasarela (Edge Function, HTTP real) — Fase 2 §6.
 *
 * Cubre SOLO los caminos de rechazo que no requieren hablar con la API real
 * de Wompi: token de webhook desconocido y firma inválida — ambos se
 * descartan ANTES de la verificación doble (§6.2), así que no hacen ninguna
 * llamada de red al proveedor.
 *
 * El camino 'aprobada' (materializar un pago) exige que
 * adaptador.consultarTransaccion() responda contra el sandbox real de Wompi
 * con una transacción real — no se simula aquí (memoria del proyecto:
 * verificar antes de un test que dispare un envío/llamada externa real). Esa
 * lógica de idempotencia (fn_registrar_pago_pasarela) ya está cubierta a
 * nivel SQL en tests/rls/intenciones-pago.test.ts::"DOBLE WEBHOOK IDÉNTICO".
 * Falta, y queda pendiente, una prueba end-to-end contra una transacción real
 * de sandbox de Wompi antes de dar la Fase 2 por completamente verificada.
 */
import { createHash } from 'node:crypto'
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
  console.warn('SALTADO tests/tenancy/webhook-pasarela: faltan variables de Supabase en .env')
}

function sha256Hex(texto: string): string {
  return createHash('sha256').update(texto).digest('hex')
}

d('webhook-pasarela', () => {
  let admin: Cliente
  let tenant: TenantPrueba
  let agente: UsuarioPrueba
  let clienteAgent: Cliente
  let webhookToken: string

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenant = await crearTenant(admin, 'whp-fixture')
    agente = await crearUsuario(admin, 'whp-agente')
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    clienteAgent = await clienteComo(env!, agente)

    await clienteAgent.functions.invoke('configurar-pasarela', {
      body: {
        accion: 'guardar_credenciales',
        tenant_id: tenant.id,
        proveedor: 'wompi',
        credenciales: {
          public_key: 'pub_test_fixture',
          private_key: 'prv_test_fixture',
          events_secret: 'test_events_fixture_secreto',
          integrity_secret: 'test_integrity_fixture',
        },
      },
    })
    const { data: config } = await admin
      .from('pasarela_config')
      .select('webhook_token')
      .eq('tenant_id', tenant.id)
      .eq('proveedor', 'wompi')
      .single<{ webhook_token: string }>()
    webhookToken = config!.webhook_token
  }, 60_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
  }, 60_000)

  const urlBase = `${env!.url}/functions/v1/webhook-pasarela`

  it('un token de webhook desconocido responde 404 y queda auditado', async () => {
    const respuesta = await fetch(`${urlBase}/wompi/token-que-no-existe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: env!.anonKey },
      body: JSON.stringify({ event: 'transaction.updated', data: {} }),
    })
    expect(respuesta.status).toBe(404)

    const { data } = await admin
      .from('audit_log')
      .select('action')
      .eq('action', 'pasarela.webhook_token_invalido')
      .order('created_at', { ascending: false })
      .limit(1)
    expect((data ?? []).length).toBeGreaterThan(0)
  }, 60_000)

  it('una firma inválida responde 400 y queda auditada, sin tocar el ledger', async () => {
    const evento = {
      event: 'transaction.updated',
      data: {
        transaction: {
          id: 'tx-firma-invalida',
          reference: 'ref-no-existe',
          status: 'APPROVED',
          amount_in_cents: 100_000,
        },
      },
      signature: {
        properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
        checksum: sha256Hex('esto-no-es-la-firma-correcta'),
        timestamp: Math.floor(Date.now() / 1000),
      },
    }

    const respuesta = await fetch(`${urlBase}/wompi/${webhookToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: env!.anonKey },
      body: JSON.stringify(evento),
    })
    expect(respuesta.status).toBe(400)

    const { data } = await admin
      .from('audit_log')
      .select('action')
      .eq('tenant_id', tenant.id)
      .eq('action', 'pasarela.webhook_firma_invalida')
    expect((data ?? []).length).toBeGreaterThan(0)

    const { data: pagos } = await admin.from('pagos').select('id').eq('tenant_id', tenant.id)
    expect(pagos ?? []).toHaveLength(0)
  }, 60_000)
})
