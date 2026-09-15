/**
 * ia-redactar-explicacion (Edge Function, HTTP real) — ENFOQUE_CONSOLIDACION
 * Ola 3, primera rebanada.
 *
 * La mayoría de los casos se prueban SIN necesidad de una clave real de
 * proveedor: "IA no activa", "presupuesto agotado", rate limit y
 * aislamiento entre tenants son todos caminos de DEGRADACIÓN o rechazo que
 * nunca llegan a llamar al proveedor. El único caso que sí llama a un
 * proveedor real (Anthropic) está gateado por una variable de entorno
 * opcional — si no está presente, se omite con un mensaje explícito, nunca
 * se declara en verde sin haber corrido.
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
  RUN_ID,
  type Cliente,
  type TenantPrueba,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/tenancy/ia-redactar-explicacion: faltan variables de Supabase en .env')
}

interface RespuestaRedaccion {
  texto: string | null
  degradado: boolean
  motivo?: string
}

function explicacionDePrueba() {
  return {
    origenModulo: 'cartera',
    origenEntidad: 'variacion_cartera',
    origenId: crypto.randomUUID(),
    afirmaciones: [
      {
        tipo: 'calculo',
        texto: 'La cartera vencida subió $500.000 entre los dos cortes.',
        evidencia: { entidad: 'cartera_variacion', id: null, fuente: 'fn_variacion_cartera', fechaCorte: '2026-09-15' },
      },
    ],
  }
}

d('ia-redactar-explicacion', () => {
  let admin: Cliente
  let tenant: TenantPrueba
  let agente: UsuarioPrueba
  let otroTenant: TenantPrueba
  let agenteOtro: UsuarioPrueba
  let clienteAgent: Cliente
  let clienteOtro: Cliente

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenant = await crearTenant(admin, 'ia-redac')
    agente = await crearUsuario(admin, 'ia-redac-agente')
    otroTenant = await crearTenant(admin, 'ia-redac-otro')
    agenteOtro = await crearUsuario(admin, 'ia-redac-otro-agente')
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    await crearMembership(admin, otroTenant.id, agenteOtro.id, 'auxiliar')
    clienteAgent = await clienteComo(env!, agente)
    clienteOtro = await clienteComo(env!, agenteOtro)
  }, 60_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenant.id)
    await eliminarTenant(admin, otroTenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, agenteOtro.id)
  }, 60_000)

  it('sin ia_config activa, degrada con IA_NO_ACTIVA (200, no un error)', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaRedaccion>('ia-redactar-explicacion', {
      body: { tenant_id: tenant.id, explicacion: explicacionDePrueba() },
    })
    expect(response?.status).toBe(200)
    expect(data?.degradado).toBe(true)
    expect(data?.motivo).toBe('IA_NO_ACTIVA')
    expect(data?.texto).toBeNull()
  }, 30_000)

  it('quien no es miembro del tenant recibe FORBIDDEN', async () => {
    const { response } = await clienteOtro.functions.invoke<RespuestaRedaccion>('ia-redactar-explicacion', {
      body: { tenant_id: tenant.id, explicacion: explicacionDePrueba() },
    })
    expect(response?.status).toBe(403)
  }, 30_000)

  it('un payload sin afirmaciones es INVALID_PAYLOAD (400)', async () => {
    const { response } = await clienteAgent.functions.invoke<RespuestaRedaccion>('ia-redactar-explicacion', {
      body: { tenant_id: tenant.id, explicacion: { ...explicacionDePrueba(), afirmaciones: [] } },
    })
    expect(response?.status).toBe(400)
  }, 30_000)

  it('presupuesto agotado degrada con PRESUPUESTO_AGOTADO', async () => {
    const { data: config, error: errorConfig } = await admin
      .from('ia_config')
      .insert({
        tenant_id: tenant.id,
        proveedor: 'anthropic',
        modelo: 'claude-sonnet-5',
        activa: true,
        verificada_at: new Date().toISOString(),
        presupuesto_mensual_usd: 0.001,
      })
      .select('id')
      .single<{ id: string }>()
    if (errorConfig) throw new Error(`fixture ia_config activa: ${errorConfig.message}`)

    const { error: errorUso } = await admin.rpc('fn_registrar_uso_ia', {
      p_tenant_id: tenant.id,
      p_tokens_entrada: 1000,
      p_tokens_salida: 1000,
      p_costo_estimado_usd: 1, // muy por encima del techo de 0.001
    })
    if (errorUso) throw new Error(`fixture uso: ${errorUso.message}`)

    const { data, response } = await clienteAgent.functions.invoke<RespuestaRedaccion>('ia-redactar-explicacion', {
      body: { tenant_id: tenant.id, explicacion: explicacionDePrueba() },
    })
    expect(response?.status).toBe(200)
    expect(data?.degradado).toBe(true)
    expect(data?.motivo).toBe('PRESUPUESTO_AGOTADO')

    // Limpieza: quitar el techo para no interferir con las pruebas siguientes.
    await admin.from('ia_config').update({ presupuesto_mensual_usd: null }).eq('id', config.id)
  }, 30_000)

  it('RATE_LIMITED (429) tras agotar el límite del actor', async () => {
    const nuevoUsuario = await crearUsuario(admin, `ia-redac-rate-${RUN_ID}`)
    await crearMembership(admin, tenant.id, nuevoUsuario.id, 'auxiliar')
    const clienteRate = await clienteComo(env!, nuevoUsuario)

    // Límite real: 20/hora (supabase/functions/ia-redactar-explicacion/index.ts).
    // Sin ia_config activa para este tenant en este punto ya se limpió el
    // presupuesto pero la config de arriba sigue activa — no importa: el
    // rate limit se evalúa ANTES de leer ia_config, así que estas llamadas
    // nunca tocan al proveedor real.
    for (let i = 0; i < 20; i++) {
      const { response } = await clienteRate.functions.invoke<RespuestaRedaccion>('ia-redactar-explicacion', {
        body: { tenant_id: tenant.id, explicacion: explicacionDePrueba() },
      })
      expect(response?.status).toBe(200)
    }

    const { data, response } = await clienteRate.functions.invoke<RespuestaRedaccion>('ia-redactar-explicacion', {
      body: { tenant_id: tenant.id, explicacion: explicacionDePrueba() },
    })
    expect(data).toBeNull()
    expect(response?.status).toBe(429)

    await eliminarUsuario(admin, nuevoUsuario.id)
  }, 60_000)

  // ── Llamada real, gateada — solo corre si hay una clave de prueba ──────
  const claveAnthropicPrueba = process.env.ANTHROPIC_API_KEY_PRUEBA
  const dLive = claveAnthropicPrueba ? it : it.skip
  if (!claveAnthropicPrueba) {
    console.warn(
      'SALTADO (llamada real a Anthropic): falta ANTHROPIC_API_KEY_PRUEBA en .env — el resto de '
        + 'esta suite sí corrió.',
    )
  }

  dLive(
    'con una clave real de Anthropic, redacta de verdad y registra el uso (tenant desechable)',
    async () => {
      const tenantVivo = await crearTenant(admin, 'ia-redac-vivo')
      const agenteVivo = await crearUsuario(admin, 'ia-redac-vivo-agente')
      await crearMembership(admin, tenantVivo.id, agenteVivo.id, 'auxiliar')
      const clienteVivo = await clienteComo(env!, agenteVivo)

      try {
        const { data: configVivo, error: errorConfig } = await admin
          .from('ia_config')
          .insert({ tenant_id: tenantVivo.id, proveedor: 'anthropic', modelo: 'claude-haiku-4-5-20251001' })
          .select('id')
          .single<{ id: string }>()
        if (errorConfig) throw new Error(`fixture ia_config vivo: ${errorConfig.message}`)

        const { error: errorCred } = await admin.rpc('fn_guardar_credencial_ia', {
          p_config_id: configVivo.id,
          p_tenant_id: tenantVivo.id,
          p_nombre: 'api_key',
          p_valor: claveAnthropicPrueba!,
          p_actor_id: agenteVivo.id,
        })
        if (errorCred) throw new Error(`fixture credencial vivo: ${errorCred.message}`)

        const { error: errorVerificar } = await admin
          .from('ia_config')
          .update({ verificada_at: new Date().toISOString() })
          .eq('id', configVivo.id)
        if (errorVerificar) throw new Error(`fixture verificar: ${errorVerificar.message}`)

        const { error: errorActivar } = await admin.rpc('fn_activar_ia_proveedor', {
          p_config_id: configVivo.id,
          p_tenant_id: tenantVivo.id,
        })
        if (errorActivar) throw new Error(`fixture activar: ${errorActivar.message}`)

        const { data, response } = await clienteVivo.functions.invoke<RespuestaRedaccion>(
          'ia-redactar-explicacion',
          { body: { tenant_id: tenantVivo.id, explicacion: explicacionDePrueba() } },
        )
        expect(response?.status).toBe(200)
        expect(data?.degradado).toBe(false)
        expect(data?.texto).toBeTruthy()
        expect(typeof data?.texto).toBe('string')

        const { data: uso } = await admin
          .from('ia_uso_mensual')
          .select('llamadas, tokens_entrada, tokens_salida')
          .eq('tenant_id', tenantVivo.id)
          .single<{ llamadas: number; tokens_entrada: number; tokens_salida: number }>()
        expect(uso?.llamadas).toBe(1)
        expect(uso?.tokens_entrada).toBeGreaterThan(0)
      } finally {
        await eliminarTenant(admin, tenantVivo.id)
        await eliminarUsuario(admin, agenteVivo.id)
      }
    },
    60_000,
  )
})
