/**
 * check_rate_limit() — 20260814170000_rate_limiting.sql (E7, GAP-12).
 * Prueba la RPC directamente: N intentos permitidos, el N+1 bloqueado y
 * auditado, sin que el bloqueo mismo cuente como un intento nuevo.
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
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/rate-limit: faltan variables de Supabase en .env')
}

d('check_rate_limit(): ventana deslizante por bucket', () => {
  const admin = clienteAdmin(env!)
  let usuario: UsuarioPrueba
  let tenant: TenantPrueba
  let cliente: Cliente

  beforeAll(async () => {
    usuario = await crearUsuario(admin, 'rl-usuario')
    tenant = await crearTenant(admin, 'rl', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')
    cliente = await clienteComo(env!, usuario)
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  })

  it('permite hasta max_hits y bloquea el siguiente, auditando el bloqueo', async () => {
    const bucket = `test-rl-${usuario.id}`

    for (let i = 0; i < 3; i++) {
      const { data, error } = await cliente.rpc('check_rate_limit', {
        p_bucket: bucket,
        p_max_hits: 3,
        p_window: '1 hour',
      })
      expect(error).toBeNull()
      expect(data).toBe(true)
    }

    const { data: bloqueado, error: errorBloqueo } = await cliente.rpc('check_rate_limit', {
      p_bucket: bucket,
      p_max_hits: 3,
      p_window: '1 hour',
    })
    expect(errorBloqueo).toBeNull()
    expect(bloqueado).toBe(false)

    const { data: evento } = await admin
      .from('audit_log')
      .select('action, metadata')
      .eq('actor_id', usuario.id)
      .eq('action', 'security.rate_limited')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(evento?.metadata).toMatchObject({ bucket, max_hits: 3 })

    // El bloqueo no cuenta como intento: sigue bloqueado, no permite un cuarto hit real.
    const { data: sigueBoqueado } = await cliente.rpc('check_rate_limit', {
      p_bucket: bucket,
      p_max_hits: 3,
      p_window: '1 hour',
    })
    expect(sigueBoqueado).toBe(false)
  }, 30_000)

  it('buckets distintos no se interfieren entre sí', async () => {
    const { data } = await cliente.rpc('check_rate_limit', {
      p_bucket: `otro-bucket-${usuario.id}`,
      p_max_hits: 1,
      p_window: '1 hour',
    })
    expect(data).toBe(true)
  })
})
