#!/usr/bin/env node
/**
 * Casos f0-12 y f0-13 — aceptar una invitación con el correo exacto
 * invitado, y rechazarla si el correo de la sesión no coincide.
 *
 * Llama invite_user()/accept_invitation() directo (mismas RPC que invoca
 * la Edge Function invite-user, ver supabase/functions/invite-user/index.ts)
 * en vez de pasar por Brevo — Brevo no está configurado en local y el envío
 * de email no es lo que estos dos casos verifican (eso es E5, ya cubierto
 * aparte). El token se genera y se hashea (sha256 hex) exactamente como
 * supabase/functions/_shared/tokens.ts.
 */
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import { asegurarUsuario, clienteAdmin, clienteComo, exigirLocal } from '../lib.mjs'

exigirLocal()

const banco = JSON.parse(fs.readFileSync('qa/tenants.json', 'utf8'))
const t1 = banco.tenants.t1
const admin = clienteAdmin()
const sesionAdmin = await clienteComo(admin, banco.adminPrincipal)

const veredictos = []
const anotar = (item, ok, observado) => veredictos.push({ item, ok, observado })

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

const sello = Date.now().toString(36)
const emailInvitado = `qa.f0invite.${sello}@aquila.test`
const emailIntruso = `qa.f0invite.otro.${sello}@aquila.test`
const password = 'QaAquila2026!'

// ── f0-12 · aceptar logueado con el correo exacto invitado ─────────────
{
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  const { data: invitacion, error: errorInvitar } = await sesionAdmin.rpc('invite_user', {
    p_tenant_id: t1.id,
    p_email: emailInvitado,
    p_role: 'auditor',
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  })

  if (errorInvitar) {
    anotar('f0-12', false, `invite_user() rechazó la invitación de prueba: ${errorInvitar.message}`)
  } else {
    await asegurarUsuario(admin, emailInvitado, password, 'QA F0 Invitado')
    const sesionInvitado = await clienteComo(admin, emailInvitado)
    const { data: aceptar, error: errorAceptar } = await sesionInvitado.rpc('accept_invitation', {
      p_token_hash: tokenHash,
    })
    const { data: membresia } = await admin
      .from('memberships')
      .select('role, status')
      .eq('tenant_id', t1.id)
      .eq('user_id', (await sesionInvitado.auth.getUser()).data.user.id)
      .single()

    anotar(
      'f0-12',
      !errorAceptar && membresia?.status === 'active' && membresia?.role === 'auditor',
      errorAceptar
        ? `accept_invitation() rechazó con el correo exacto invitado: ${errorAceptar.message}`
        : `accept_invitation() devolvió tenant_id=${aceptar?.[0]?.tenant_id ?? aceptar?.tenant_id}; membership quedó role=${membresia?.role} status=${membresia?.status} (esperado: auditor/active, el rol exacto asignado al invitar)`,
    )
  }
}

// ── f0-13 · aceptar la MISMA invitación logueado con un correo distinto ─
{
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  const { data: invitacion2, error: errorInvitar2 } = await sesionAdmin.rpc('invite_user', {
    p_tenant_id: t1.id,
    p_email: `qa.f0invite.destino.${sello}@aquila.test`,
    p_role: 'auxiliar',
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  })

  if (errorInvitar2) {
    anotar('f0-13', false, `invite_user() rechazó la segunda invitación de prueba: ${errorInvitar2.message}`)
  } else {
    await asegurarUsuario(admin, emailIntruso, password, 'QA F0 Invitado Intruso')
    const sesionIntruso = await clienteComo(admin, emailIntruso)
    const { error: errorAceptar2 } = await sesionIntruso.rpc('accept_invitation', {
      p_token_hash: tokenHash,
    })
    const { count: membresiasIntruso } = await admin
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', t1.id)
      .eq('user_id', (await sesionIntruso.auth.getUser()).data.user.id)

    anotar(
      'f0-13',
      !!errorAceptar2 && errorAceptar2.message.includes('INV_EMAIL_MISMATCH') && membresiasIntruso === 0,
      errorAceptar2
        ? `Rechazado con "${errorAceptar2.message}"; el intruso quedó con ${membresiasIntruso} membership(s) en T1 (debe ser 0)`
        : `NO CUMPLE: aceptó la invitación con un correo distinto al invitado`,
    )
  }
}

// ── limpieza ─────────────────────────────────────────────────────────────
for (const correo of [emailInvitado, emailIntruso, `qa.f0invite.destino.${sello}@aquila.test`]) {
  const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const u = lista.users.find((x) => x.email?.toLowerCase() === correo.toLowerCase())
  if (u) await admin.auth.admin.deleteUser(u.id)
}

for (const v of veredictos) {
  process.stdout.write(`${v.item}  ${v.ok ? 'CUMPLE ' : 'NO CUMPLE'}  ${v.observado}\n`)
}
