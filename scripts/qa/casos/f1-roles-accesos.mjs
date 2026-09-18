#!/usr/bin/env node
/**
 * Casos f1-01 a f1-04 — invitar con rol exacto, escritura auditor vs
 * auxiliar, y el guard LAST_AGENT al intentar dejar la copropiedad sin
 * nadie que la opere.
 *
 * Mismo criterio que f0-invitaciones.mjs: invite_user()/accept_invitation()
 * directo (sin Brevo, no configurado en local). Las escrituras van con una
 * sesión real (RLS activa), nunca con service_role.
 */
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import { asegurarUsuario, cargarCatalogo, clienteAdmin, clienteComo, exigirLocal } from '../lib.mjs'

exigirLocal()

const banco = JSON.parse(fs.readFileSync('qa/tenants.json', 'utf8'))
const t1 = banco.tenants.t1
const admin = clienteAdmin()
const cat = await cargarCatalogo(admin)
const sesionAdmin = await clienteComo(admin, banco.adminPrincipal)

const veredictos = []
const anotar = (item, ok, observado) => veredictos.push({ item, ok, observado })
const sello = Date.now().toString(36)

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function invitarYAceptar(email, role) {
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  const { error: errorInvitar } = await sesionAdmin.rpc('invite_user', {
    p_tenant_id: t1.id,
    p_email: email,
    p_role: role,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  })
  if (errorInvitar) throw new Error(`invite_user(${email}, ${role}): ${errorInvitar.message}`)
  await asegurarUsuario(admin, email, 'QaAquila2026!', `QA F1 ${role}`)
  const sesion = await clienteComo(admin, email)
  const { error: errorAceptar } = await sesion.rpc('accept_invitation', { p_token_hash: tokenHash })
  if (errorAceptar) throw new Error(`accept_invitation(${email}): ${errorAceptar.message}`)
  return sesion
}

// ── f1-01 · invitar auxiliar, auditor y administrador; verificar rol exacto ─
const emails = {
  auxiliar: `qa.f1aux.${sello}@aquila.test`,
  auditor: `qa.f1aud.${sello}@aquila.test`,
  administrador: `qa.f1adm.${sello}@aquila.test`,
}
const sesiones = {}
{
  const detalles = []
  let todoOk = true
  for (const [role, email] of Object.entries(emails)) {
    try {
      sesiones[role] = await invitarYAceptar(email, role)
      const { data: user } = await sesiones[role].auth.getUser()
      const { data: mem } = await admin
        .from('memberships')
        .select('role, status')
        .eq('tenant_id', t1.id)
        .eq('user_id', user.user.id)
        .single()
      const ok = mem?.role === role && mem?.status === 'active'
      todoOk = todoOk && ok
      detalles.push(`${email} invitado como ${role} → membership.role=${mem?.role} status=${mem?.status} (${ok ? 'OK' : 'FALLA'})`)
    } catch (e) {
      todoOk = false
      detalles.push(`${email} (${role}): ${e.message}`)
    }
  }
  anotar('f1-01', todoOk, detalles.join(' · '))
}

// ── f1-02 · como auditor, intentar escribir un inmueble ────────────────
if (sesiones.auditor) {
  const codigo = `QAF1-AUD-${sello}`
  const { error } = await sesiones.auditor.from('inmuebles').insert({
    tenant_id: t1.id,
    codigo,
    tipo_id: cat.id('TIPO_INMUEBLE', 'apartamento'),
    estado: 'activo',
    area_privada: 40,
    uso_predio_id: cat.id('USO_PREDIO', 'residencial'),
  })
  const { count } = await admin
    .from('inmuebles')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', t1.id)
    .eq('codigo', codigo)
  anotar(
    'f1-02',
    !!error && count === 0,
    error
      ? `El INSERT como auditor fue rechazado (RLS): ${error.code} ${error.message}; quedaron ${count} filas con ese código`
      : `NO CUMPLE: el auditor pudo insertar un inmueble (quedaron ${count} filas)`,
  )
} else {
  anotar('f1-02', false, 'No se pudo ejecutar: no hay sesión de auditor (f1-01 falló)')
}

// ── f1-03 · como auxiliar, la misma escritura ───────────────────────────
if (sesiones.auxiliar) {
  const codigo = `QAF1-AUX-${sello}`
  const { error } = await sesiones.auxiliar.from('inmuebles').insert({
    tenant_id: t1.id,
    codigo,
    tipo_id: cat.id('TIPO_INMUEBLE', 'apartamento'),
    estado: 'activo',
    area_privada: 40,
    uso_predio_id: cat.id('USO_PREDIO', 'residencial'),
  })
  const { count } = await admin
    .from('inmuebles')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', t1.id)
    .eq('codigo', codigo)
  anotar(
    'f1-03',
    !error && count === 1,
    error
      ? `El INSERT como auxiliar falló: ${error.code} ${error.message}`
      : `Completado sin error: quedó ${count} inmueble con código ${codigo}`,
  )
  if (!error) await admin.from('inmuebles').delete().eq('tenant_id', t1.id).eq('codigo', codigo)
} else {
  anotar('f1-03', false, 'No se pudo ejecutar: no hay sesión de auxiliar (f1-01 falló)')
}

// ── f1-04 · último auxiliar/administrador activo: no se puede revocar/degradar ─
// T1 tiene varios agents/administradores sembrados (no es el caso real de
// "un solo activo") — se arma el escenario en un tenant descartable propio
// para no tocar T1: un tenant nuevo con un único administrador (el creador).
{
  const sesionSolitario = await (async () => {
    const email = `qa.f1lastagent.${sello}@aquila.test`
    await asegurarUsuario(admin, email, 'QaAquila2026!', 'QA F1 Last Agent')
    return clienteComo(admin, email)
  })()
  const slug = `qa-f1-lastagent-${sello}`
  const { data: tenantSolitario, error: errorTenant } = await sesionSolitario.rpc('create_tenant', {
    p_name: 'QA F1 Last Agent',
    p_slug: slug,
  })

  if (errorTenant) {
    anotar('f1-04', false, `No se pudo montar el escenario (create_tenant falló): ${errorTenant.message}`)
  } else {
    const { data: user } = await sesionSolitario.auth.getUser()
    const { data: membresia } = await admin
      .from('memberships')
      .select('id, role, status')
      .eq('tenant_id', tenantSolitario.id)
      .eq('user_id', user.user.id)
      .single()

    const { error: errorDegradar } = await sesionSolitario
      .from('memberships')
      .update({ role: 'auditor' })
      .eq('id', membresia.id)
    const { error: errorRevocar } = await sesionSolitario
      .from('memberships')
      .update({ status: 'revoked' })
      .eq('id', membresia.id)

    const { data: membresiaDespues } = await admin
      .from('memberships')
      .select('role, status')
      .eq('id', membresia.id)
      .single()

    const mensajes = [errorDegradar?.message, errorRevocar?.message].filter(Boolean).join(' | ')
    anotar(
      'f1-04',
      !!errorDegradar &&
        !!errorRevocar &&
        mensajes.includes('LAST_AGENT') &&
        membresiaDespues.role === 'administrador' &&
        membresiaDespues.status === 'active',
      `Degradar a auditor: ${errorDegradar ? `rechazado (${errorDegradar.message})` : 'NO CUMPLE: se permitió'}; revocar: ${errorRevocar ? `rechazado (${errorRevocar.message})` : 'NO CUMPLE: se permitió'}; estado final role=${membresiaDespues.role} status=${membresiaDespues.status}`,
    )

    // limpieza del tenant descartable
    await admin.from('tenants').delete().eq('id', tenantSolitario.id)
  }
}

for (const v of veredictos) {
  process.stdout.write(`${v.item}  ${v.ok ? 'CUMPLE ' : 'NO CUMPLE'}  ${v.observado}\n`)
}
