/**
 * Copropiedad predeterminada (profiles.tenant_predeterminado_id) — RPC
 * directas, mismo patrón que tests/invitations/invitations.test.ts.
 * Migración: 20260904220000_tenant_predeterminado.sql.
 *
 * tenant_predeterminado_id es "con cuál copropiedad se preselecciona el
 * selector de inicio de sesión" — distinta de active_tenant_id ("en cuál
 * estoy trabajando ahora mismo"). El comportamiento a proteger:
 *   · create_tenant/accept_invitation llenan tenant_predeterminado_id SOLO
 *     si venía null (coalesce) — la primera copropiedad es el default
 *     natural, pero una quinta no debe pisar una preferencia ya elegida.
 *   · set_tenant_predeterminado() es la única escritura directa — reutiliza
 *     guard_active_tenant (mismo guard que valida active_tenant_id) para
 *     exigir membresía activa, y solo puede tocar el propio profile
 *     (auth.uid() en el WHERE, sin parámetro de usuario).
 */
import { afterAll, describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  clienteAnonimo,
  clienteComo,
  crearMembership,
  crearTenant,
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
  console.warn('SALTADO tests/tenancy/tenant-predeterminado: faltan variables de Supabase en .env')
}

interface TenantFila {
  id: string
  slug: string
}

interface PerfilPredeterminado {
  active_tenant_id: string | null
  tenant_predeterminado_id: string | null
}

async function perfilDe(admin: Cliente, userId: string): Promise<PerfilPredeterminado> {
  const { data, error } = await admin
    .from('profiles')
    .select('active_tenant_id, tenant_predeterminado_id')
    .eq('id', userId)
    .single<PerfilPredeterminado>()
  if (error) throw new Error(`fixture perfil: ${error.message}`)
  return data
}

d('Copropiedad predeterminada (tenant_predeterminado_id)', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  async function usuarioDePrueba(
    etiqueta: string,
  ): Promise<{ usuario: UsuarioPrueba; cliente: Cliente }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)
    return { usuario, cliente }
  }

  afterAll(async () => {
    for (const id of tenantsCreados) {
      await eliminarTenant(admin, id)
    }
    for (const usuario of usuariosCreados) {
      await eliminarUsuario(admin, usuario.id)
    }
  })

  it('create_tenant: la primera copropiedad de un usuario llena tenant_predeterminado_id', async () => {
    const { usuario, cliente } = await usuarioDePrueba('tp-primera')

    const { data, error } = await cliente.rpc('create_tenant', {
      p_name: 'TP primera',
      p_slug: `t-${RUN_ID}-tp-primera`,
    })
    expect(error).toBeNull()
    const tenant = data as unknown as TenantFila
    tenantsCreados.push(tenant.id)

    const perfil = await perfilDe(admin, usuario.id)
    expect(perfil.active_tenant_id).toBe(tenant.id)
    expect(perfil.tenant_predeterminado_id).toBe(tenant.id)
  }, 30_000)

  it('create_tenant: una segunda copropiedad NO pisa una predeterminada ya elegida', async () => {
    const { usuario, cliente } = await usuarioDePrueba('tp-segunda')

    const { data: primero, error: e1 } = await cliente.rpc('create_tenant', {
      p_name: 'TP segunda uno',
      p_slug: `t-${RUN_ID}-tp-segunda-1`,
    })
    expect(e1).toBeNull()
    const tenant1 = primero as unknown as TenantFila
    tenantsCreados.push(tenant1.id)

    const { data: segundo, error: e2 } = await cliente.rpc('create_tenant', {
      p_name: 'TP segunda dos',
      p_slug: `t-${RUN_ID}-tp-segunda-2`,
    })
    expect(e2).toBeNull()
    const tenant2 = segundo as unknown as TenantFila
    tenantsCreados.push(tenant2.id)

    const perfil = await perfilDe(admin, usuario.id)
    // active_tenant_id SÍ salta a la copropiedad recién creada — eso no
    // cambió en esta migración. tenant_predeterminado_id se queda clavado
    // en la primera (coalesce nunca pisa un valor no-null).
    expect(perfil.active_tenant_id).toBe(tenant2.id)
    expect(perfil.tenant_predeterminado_id).toBe(tenant1.id)
  }, 30_000)

  it('accept_invitation: la primera membresía por invitación llena tenant_predeterminado_id', async () => {
    const invitador = await crearUsuario(admin, 'tp-inv-invitador')
    usuariosCreados.push(invitador)
    const tenant = await crearTenant(admin, 'tp-inv', invitador.id)
    tenantsCreados.push(tenant.id)
    await crearMembership(admin, tenant.id, invitador.id, 'administrador')
    const clienteInvitador = await clienteComo(env!, invitador)

    const { usuario: invitado, cliente: clienteInvitado } = await usuarioDePrueba('tp-inv-invitado')
    // accept_invitation exige profiles.email == invitations.email.
    await admin.from('profiles').update({ email: invitado.email }).eq('id', invitado.id)

    const { randomUUID: uuid, createHash } = await import('node:crypto')
    const token = uuid().replace(/-/g, '')
    const hash = createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

    const { error: errorInvitar } = await clienteInvitador.rpc('invite_user', {
      p_tenant_id: tenant.id,
      p_email: invitado.email,
      p_role: 'auditor',
      p_token_hash: hash,
      p_expires_at: expiresAt,
    })
    expect(errorInvitar).toBeNull()

    const { error: errorAceptar } = await clienteInvitado
      .rpc('accept_invitation', { p_token_hash: hash })
      .single()
    expect(errorAceptar).toBeNull()

    const perfil = await perfilDe(admin, invitado.id)
    expect(perfil.active_tenant_id).toBe(tenant.id)
    expect(perfil.tenant_predeterminado_id).toBe(tenant.id)
  }, 30_000)

  it('accept_invitation: NO pisa una predeterminada ya elegida por el invitado', async () => {
    const invitador = await crearUsuario(admin, 'tp-inv2-invitador')
    usuariosCreados.push(invitador)
    const tenantInvitacion = await crearTenant(admin, 'tp-inv2', invitador.id)
    tenantsCreados.push(tenantInvitacion.id)
    await crearMembership(admin, tenantInvitacion.id, invitador.id, 'administrador')
    const clienteInvitador = await clienteComo(env!, invitador)

    const { usuario: invitado, cliente: clienteInvitado } = await usuarioDePrueba('tp-inv2-invitado')

    // El invitado ya tiene su propia copropiedad y, con ella, un default fijado.
    const { data: propio, error: errorPropio } = await clienteInvitado.rpc('create_tenant', {
      p_name: 'TP inv2 propio',
      p_slug: `t-${RUN_ID}-tp-inv2-propio`,
    })
    expect(errorPropio).toBeNull()
    const tenantPropio = propio as unknown as TenantFila
    tenantsCreados.push(tenantPropio.id)

    await admin.from('profiles').update({ email: invitado.email }).eq('id', invitado.id)

    const { randomUUID: uuid, createHash } = await import('node:crypto')
    const token = uuid().replace(/-/g, '')
    const hash = createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

    await clienteInvitador.rpc('invite_user', {
      p_tenant_id: tenantInvitacion.id,
      p_email: invitado.email,
      p_role: 'auditor',
      p_token_hash: hash,
      p_expires_at: expiresAt,
    })
    const { error: errorAceptar } = await clienteInvitado
      .rpc('accept_invitation', { p_token_hash: hash })
      .single()
    expect(errorAceptar).toBeNull()

    const perfil = await perfilDe(admin, invitado.id)
    // active_tenant_id salta a la copropiedad de la invitación (igual que
    // hoy); tenant_predeterminado_id se queda en la propia.
    expect(perfil.active_tenant_id).toBe(tenantInvitacion.id)
    expect(perfil.tenant_predeterminado_id).toBe(tenantPropio.id)
  }, 30_000)

  it('set_tenant_predeterminado: cambia la preferencia sin tocar active_tenant_id', async () => {
    const { usuario, cliente } = await usuarioDePrueba('tp-set')
    const tenantA = await crearTenant(admin, 'tp-set-a', usuario.id)
    const tenantB = await crearTenant(admin, 'tp-set-b', usuario.id)
    tenantsCreados.push(tenantA.id, tenantB.id)
    await crearMembership(admin, tenantA.id, usuario.id, 'administrador')
    await crearMembership(admin, tenantB.id, usuario.id, 'administrador')
    await admin.from('profiles').update({ active_tenant_id: tenantA.id }).eq('id', usuario.id)

    const { error } = await cliente.rpc('set_tenant_predeterminado', { p_tenant_id: tenantB.id })
    expect(error).toBeNull()

    const perfil = await perfilDe(admin, usuario.id)
    expect(perfil.tenant_predeterminado_id).toBe(tenantB.id)
    // La copropiedad ACTIVA de la sesión no se mueve — son dos cosas
    // independientes a propósito (comentario de actualizarTenantPredeterminado
    // en apps/web/app/stores/tenant.ts).
    expect(perfil.active_tenant_id).toBe(tenantA.id)
  }, 30_000)

  it('set_tenant_predeterminado: NO_MEMBERSHIP si el tenant no es una membresía activa propia', async () => {
    const { usuario, cliente } = await usuarioDePrueba('tp-set-ajeno')
    const otro = await crearUsuario(admin, 'tp-set-ajeno-otro')
    usuariosCreados.push(otro)
    const tenantAjeno = await crearTenant(admin, 'tp-set-ajeno', otro.id)
    tenantsCreados.push(tenantAjeno.id)
    await crearMembership(admin, tenantAjeno.id, otro.id, 'administrador')
    // usuario NUNCA tiene membership en tenantAjeno.

    const { error } = await cliente.rpc('set_tenant_predeterminado', { p_tenant_id: tenantAjeno.id })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^NO_MEMBERSHIP:/)

    const perfil = await perfilDe(admin, usuario.id)
    expect(perfil.tenant_predeterminado_id).not.toBe(tenantAjeno.id)
  }, 30_000)

  it('set_tenant_predeterminado: un usuario no puede alterar el default de otro', async () => {
    const { usuario: usuarioA, cliente: clienteA } = await usuarioDePrueba('tp-set-otro-a')
    const { usuario: usuarioB } = await usuarioDePrueba('tp-set-otro-b')
    const tenant = await crearTenant(admin, 'tp-set-otro', usuarioA.id)
    tenantsCreados.push(tenant.id)
    await crearMembership(admin, tenant.id, usuarioA.id, 'administrador')
    await crearMembership(admin, tenant.id, usuarioB.id, 'administrador')

    // set_tenant_predeterminado no recibe un id de usuario — solo puede
    // afectar auth.uid() de la sesión que llama. Se confirma que llamarla
    // como A nunca deja rastro en el profile de B.
    const { error } = await clienteA.rpc('set_tenant_predeterminado', { p_tenant_id: tenant.id })
    expect(error).toBeNull()

    const perfilB = await perfilDe(admin, usuarioB.id)
    expect(perfilB.tenant_predeterminado_id).not.toBe(tenant.id)
  }, 30_000)

  it('set_tenant_predeterminado: anon (sin sesión) no puede ejecutarla', async () => {
    const anon = clienteAnonimo(env!)
    const { error } = await anon.rpc('set_tenant_predeterminado', {
      p_tenant_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(error).not.toBeNull()
  })
})
