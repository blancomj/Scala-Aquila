/**
 * create-tenant (Edge Function, HTTP real) — PROMPT_MAESTRO_FASE1.md §8, §9.1.
 *
 * A diferencia de tests/invitations/invitations.test.ts (que prueba las RPC
 * directamente, sin pasar por las Edge Functions), esto invoca la función
 * desplegada de verdad vía `supabase.functions.invoke` — es el único test
 * HTTP real de create-tenant, y de paso el único que ejercita el rate limit
 * (E7, GAP-12) de punta a punta: create-tenant no envía email, así que
 * agotar su límite no gasta cuota de Brevo.
 */
import { afterAll, describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  clienteComo,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type Cliente,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/tenancy/create-tenant: faltan variables de Supabase en .env')
}

interface RespuestaCrearTenant {
  tenant: { id: string; slug: string }
  membership: { id: string; role: string }
}

d('create-tenant (Edge Function)', () => {
  const admin = clienteAdmin(env!)
  // tenants.created_by → profiles(id) sin ON DELETE — hay que borrar los
  // tenants ANTES que los usuarios que los crearon, o la FK lo rechaza.
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  async function usuarioDePrueba(etiqueta: string): Promise<Cliente> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    return clienteComo(env!, usuario)
  }

  afterAll(async () => {
    for (const id of tenantsCreados) {
      await eliminarTenant(admin, id)
    }
    for (const usuario of usuariosCreados) {
      await eliminarUsuario(admin, usuario.id)
    }
  })

  it('flujo feliz: crea tenant + membership administrador, responde 200', async () => {
    const cliente = await usuarioDePrueba('ct-feliz')

    // No se desestructura `error`: @supabase/functions-js lo tipa como `any`
    // (gap de la librería) — `data`/`response` sí están bien tipados y
    // bastan para verificar tanto el éxito como los códigos de error.
    const { data, response } = await cliente.functions.invoke<RespuestaCrearTenant>(
      'create-tenant',
      {
        body: { name: 'Tenant HTTP feliz', slug: `t-${RUN_ID}-ct-feliz` },
      },
    )

    expect(response?.status).toBe(200)
    expect(data?.tenant.slug).toBe(`t-${RUN_ID}-ct-feliz`)
    // create_tenant() (20260830100000): quien crea el tenant recibe
    // 'administrador' automáticamente, no 'auxiliar'.
    expect(data?.membership.role).toBe('administrador')

    tenantsCreados.push(data!.tenant.id)
  }, 30_000)

  it('SLUG_INVALID: el payload no pasa el schema de Zod (400)', async () => {
    const cliente = await usuarioDePrueba('ct-invalido')

    const { data, response } = await cliente.functions.invoke<RespuestaCrearTenant>(
      'create-tenant',
      {
        body: { name: 'X', slug: 'AB' },
      },
    )

    expect(data).toBeNull()
    expect(response?.status).toBe(400)
  }, 30_000)

  it('RATE_LIMITED (429) tras agotar el límite, sin llegar a crear más tenants', async () => {
    const cliente = await usuarioDePrueba('ct-rate')

    // Límite real de create-tenant: 10/hora (supabase/functions/create-tenant/index.ts).
    for (let i = 0; i < 10; i++) {
      const { data, response } = await cliente.functions.invoke<RespuestaCrearTenant>(
        'create-tenant',
        {
          body: { name: `Tenant rate ${String(i)}`, slug: `t-${RUN_ID}-ct-rate-${String(i)}` },
        },
      )
      expect(response?.status).toBe(200)
      tenantsCreados.push(data!.tenant.id)
    }

    const { data, response } = await cliente.functions.invoke<RespuestaCrearTenant>(
      'create-tenant',
      {
        body: { name: 'Tenant rate 11', slug: `t-${RUN_ID}-ct-rate-11` },
      },
    )

    expect(data).toBeNull()
    expect(response?.status).toBe(429)
  }, 60_000)
})
