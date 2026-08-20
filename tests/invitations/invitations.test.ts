/**
 * E5 — invite_user / accept_invitation / revoke_invitation (RPC).
 * PROMPT_MAESTRO_FASE1.md §8, §9.2.
 *
 * Prueba la capa de RPC directamente (mismo patrón que tests/rls/*.ts),
 * sin pasar por las Edge Functions ni por Brevo — el envío real de email
 * se prueba manualmente una vez haya credenciales de Brevo configuradas
 * (D-21). El token de prueba se hashea con node:crypto, igual que
 * supabase/functions/_shared/tokens.ts lo hace con Web Crypto — mismo
 * algoritmo (sha256 hex), formato de entrada distinto pero equivalente.
 *
 * accept_invitation() devuelve `out_tenant_id`/`out_role`, no
 * `tenant_id`/`role` — nombres de columna de salida distintos a propósito
 * (20260814140100_accept_invitation_fix_ambiguous_column.sql): con esos
 * nombres, `RETURNS TABLE` colisiona con las columnas reales de
 * `memberships` usadas dentro de la función → "column reference is
 * ambiguous" (42702). La Edge Function accept-invitation sí devuelve
 * `{ tenant_id, role }` al cliente — el renombre es interno a la RPC.
 */
import { createHash, randomUUID } from 'node:crypto'
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
  console.warn('SALTADO tests/invitations: faltan variables de Supabase en .env')
}

function hashDePrueba(): { token: string; hash: string } {
  const token = randomUUID().replace(/-/g, '')
  const hash = createHash('sha256').update(token).digest('hex')
  return { token, hash }
}

d('E5 — invitaciones (RPC)', () => {
  const admin = clienteAdmin(env!)
  let agentUser: UsuarioPrueba
  let auditorUser: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente
  let clienteAuditor: Cliente

  beforeAll(async () => {
    agentUser = await crearUsuario(admin, 'inv-agent')
    auditorUser = await crearUsuario(admin, 'inv-auditor')
    tenant = await crearTenant(admin, 'inv', agentUser.id)
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

  it('invite_user: agent puede invitar', async () => {
    const { hash } = hashDePrueba()
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    const { data, error } = await clienteAgent.rpc('invite_user', {
      p_tenant_id: tenant.id,
      p_email: 'nuevo-invitado@example.test',
      p_role: 'auditor',
      p_token_hash: hash,
      p_expires_at: expiresAt,
    })
    expect(error).toBeNull()
    expect(data?.status).toBe('pending')
    expect(data?.email).toBe('nuevo-invitado@example.test')
  })

  it('invite_user: auditor NO puede invitar (FORBIDDEN)', async () => {
    const { hash } = hashDePrueba()
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    const { error } = await clienteAuditor.rpc('invite_user', {
      p_tenant_id: tenant.id,
      p_email: 'otro@example.test',
      p_role: 'auditor',
      p_token_hash: hash,
      p_expires_at: expiresAt,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^FORBIDDEN:/)
  })

  it('invite_user: ALREADY_MEMBER si el correo ya es miembro activo', async () => {
    const { hash } = hashDePrueba()
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    const { error } = await clienteAgent.rpc('invite_user', {
      p_tenant_id: tenant.id,
      p_email: auditorUser.email,
      p_role: 'auxiliar',
      p_token_hash: hash,
      p_expires_at: expiresAt,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^ALREADY_MEMBER:/)
  })

  it('invite_user: INVITE_PENDING si ya hay una invitación pendiente para ese correo', async () => {
    const email = 'pendiente-duplicada@example.test'
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    const primera = hashDePrueba()
    const { error: errorPrimera } = await clienteAgent.rpc('invite_user', {
      p_tenant_id: tenant.id,
      p_email: email,
      p_role: 'auditor',
      p_token_hash: primera.hash,
      p_expires_at: expiresAt,
    })
    expect(errorPrimera).toBeNull()

    const segunda = hashDePrueba()
    const { error: errorSegunda } = await clienteAgent.rpc('invite_user', {
      p_tenant_id: tenant.id,
      p_email: email,
      p_role: 'auditor',
      p_token_hash: segunda.hash,
      p_expires_at: expiresAt,
    })
    expect(errorSegunda).not.toBeNull()
    expect(errorSegunda?.message).toMatch(/^INVITE_PENDING:/)
  })

  it('accept_invitation: flujo feliz — crea membership, fija active_tenant_id, marca aceptada', async () => {
    const invitadoEmail = `inv-aceptar-${randomUUID().slice(0, 8)}@example.test`
    const invitado = await crearUsuario(admin, 'inv-aceptar')
    // crearUsuario genera un email propio (rls-<RUN_ID>-...); lo pisamos
    // para que coincida con el de la invitación (accept_invitation exige
    // que profiles.email == invitations.email).
    await admin.from('profiles').update({ email: invitadoEmail }).eq('id', invitado.id)

    const { hash } = hashDePrueba()
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    const { data: invitacion, error: errorInvitar } = await clienteAgent.rpc('invite_user', {
      p_tenant_id: tenant.id,
      p_email: invitadoEmail,
      p_role: 'auditor',
      p_token_hash: hash,
      p_expires_at: expiresAt,
    })
    expect(errorInvitar).toBeNull()

    const clienteInvitado = await clienteComo(env!, invitado)
    const { data: resultado, error: errorAceptar } = await clienteInvitado
      .rpc('accept_invitation', { p_token_hash: hash })
      .single()
    expect(errorAceptar).toBeNull()
    expect(resultado?.out_tenant_id).toBe(tenant.id)
    expect(resultado?.out_role).toBe('auditor')

    const { data: membership } = await admin
      .from('memberships')
      .select('role, status')
      .eq('tenant_id', tenant.id)
      .eq('user_id', invitado.id)
      .single()
    expect(membership?.role).toBe('auditor')
    expect(membership?.status).toBe('active')

    const { data: perfil } = await admin
      .from('profiles')
      .select('active_tenant_id')
      .eq('id', invitado.id)
      .single()
    expect(perfil?.active_tenant_id).toBe(tenant.id)

    const { data: invitacionFinal } = await admin
      .from('invitations')
      .select('status, accepted_by')
      .eq('id', invitacion!.id)
      .single()
    expect(invitacionFinal?.status).toBe('accepted')
    expect(invitacionFinal?.accepted_by).toBe(invitado.id)

    await eliminarUsuario(admin, invitado.id)
  }, 30_000)

  it('accept_invitation: INV_NOT_FOUND con un hash inexistente', async () => {
    const { hash } = hashDePrueba()
    const { error } = await clienteAgent.rpc('accept_invitation', { p_token_hash: hash }).single()
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^INV_NOT_FOUND:/)
  })

  it('accept_invitation: INV_USED al reintentar con un token ya consumido', async () => {
    const invitadoEmail = `inv-usado-${randomUUID().slice(0, 8)}@example.test`
    const invitado = await crearUsuario(admin, 'inv-usado')
    await admin.from('profiles').update({ email: invitadoEmail }).eq('id', invitado.id)

    const { hash } = hashDePrueba()
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    await clienteAgent.rpc('invite_user', {
      p_tenant_id: tenant.id,
      p_email: invitadoEmail,
      p_role: 'auditor',
      p_token_hash: hash,
      p_expires_at: expiresAt,
    })

    const clienteInvitado = await clienteComo(env!, invitado)
    const { error: errorPrimerIntento } = await clienteInvitado
      .rpc('accept_invitation', { p_token_hash: hash })
      .single()
    expect(errorPrimerIntento).toBeNull()

    const { error: errorSegundoIntento } = await clienteInvitado
      .rpc('accept_invitation', { p_token_hash: hash })
      .single()
    expect(errorSegundoIntento).not.toBeNull()
    expect(errorSegundoIntento?.message).toMatch(/^INV_USED:/)

    await eliminarUsuario(admin, invitado.id)
  }, 30_000)

  it('accept_invitation: INV_EMAIL_MISMATCH si el correo de sesión no coincide', async () => {
    const { hash } = hashDePrueba()
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    await clienteAgent.rpc('invite_user', {
      p_tenant_id: tenant.id,
      p_email: 'correo-que-nadie-tiene@example.test',
      p_role: 'auditor',
      p_token_hash: hash,
      p_expires_at: expiresAt,
    })

    // auditorUser ya es miembro, pero su email no es el invitado — igual
    // debe fallar con INV_EMAIL_MISMATCH antes de llegar a ningún otro check.
    const { error } = await clienteAuditor.rpc('accept_invitation', { p_token_hash: hash }).single()
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^INV_EMAIL_MISMATCH:/)
  })

  it('accept_invitation: INV_EXPIRED con una invitación vencida', async () => {
    const invitadoEmail = `inv-expirado-${randomUUID().slice(0, 8)}@example.test`
    const invitado = await crearUsuario(admin, 'inv-expirado')
    await admin.from('profiles').update({ email: invitadoEmail }).eq('id', invitado.id)

    const { hash } = hashDePrueba()
    // Se inserta directo por admin (bypassa RLS) con expires_at en el
    // pasado — invite_user() fuerza +48h, no hay forma de pedirle una
    // invitación ya vencida.
    await admin.from('invitations').insert({
      tenant_id: tenant.id,
      email: invitadoEmail,
      role: 'auditor',
      token_hash: hash,
      expires_at: new Date(Date.now() - 1000).toISOString(),
      invited_by: agentUser.id,
    })

    const clienteInvitado = await clienteComo(env!, invitado)
    const { error } = await clienteInvitado
      .rpc('accept_invitation', { p_token_hash: hash })
      .single()
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^INV_EXPIRED:/)

    // accept_invitation() no marca status='expired' (un UPDATE seguido de
    // RAISE EXCEPTION en la misma invocación se revierte junto con todo lo
    // demás — ver 20260814140200_accept_invitation_no_lazy_expire.sql). El
    // rechazo se basa solo en expires_at < now(), status se queda 'pending'.
    const { data: invitacionFinal } = await admin
      .from('invitations')
      .select('status')
      .eq('token_hash', hash)
      .single()
    expect(invitacionFinal?.status).toBe('pending')

    await eliminarUsuario(admin, invitado.id)
  }, 30_000)

  it('revoke_invitation: agent puede revocar una invitación pendiente', async () => {
    const { hash } = hashDePrueba()
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    const { data: invitacion } = await clienteAgent.rpc('invite_user', {
      p_tenant_id: tenant.id,
      p_email: 'a-revocar@example.test',
      p_role: 'auditor',
      p_token_hash: hash,
      p_expires_at: expiresAt,
    })

    const { error } = await clienteAgent.rpc('revoke_invitation', {
      p_invitation_id: invitacion!.id,
    })
    expect(error).toBeNull()

    const { data: invitacionFinal } = await admin
      .from('invitations')
      .select('status')
      .eq('id', invitacion!.id)
      .single()
    expect(invitacionFinal?.status).toBe('revoked')
  })

  it('revoke_invitation: auditor NO puede revocar (FORBIDDEN)', async () => {
    const { hash } = hashDePrueba()
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    const { data: invitacion } = await clienteAgent.rpc('invite_user', {
      p_tenant_id: tenant.id,
      p_email: 'a-revocar-2@example.test',
      p_role: 'auditor',
      p_token_hash: hash,
      p_expires_at: expiresAt,
    })

    const { error } = await clienteAuditor.rpc('revoke_invitation', {
      p_invitation_id: invitacion!.id,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^FORBIDDEN:/)
  })

  it('revoke_invitation: INV_NOT_PENDING si ya fue aceptada/revocada', async () => {
    const { hash } = hashDePrueba()
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    const { data: invitacion } = await clienteAgent.rpc('invite_user', {
      p_tenant_id: tenant.id,
      p_email: 'a-revocar-3@example.test',
      p_role: 'auditor',
      p_token_hash: hash,
      p_expires_at: expiresAt,
    })
    await clienteAgent.rpc('revoke_invitation', { p_invitation_id: invitacion!.id })

    const { error } = await clienteAgent.rpc('revoke_invitation', {
      p_invitation_id: invitacion!.id,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^INV_NOT_PENDING:/)
  })

  it('revoke_invitation: INV_NOT_FOUND con un id inexistente', async () => {
    const { error } = await clienteAgent.rpc('revoke_invitation', { p_invitation_id: randomUUID() })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^INV_NOT_FOUND:/)
  })
})
