#!/usr/bin/env node
/**
 * Casos f0-01 a f0-06 — registro, duplicado, login correcto/incorrecto,
 * recuperar contraseña y definir la nueva desde el enlace recibido.
 *
 * Usa un usuario descartable propio (no toca qa.auxiliar/qa.auditor/etc.,
 * que son compartidos por el resto del banco). El correo de recuperación
 * se verifica de verdad en Mailpit (puerto 54324 — el contenedor se llama
 * "inbucket" pero la imagen real es mailpit; su API es /api/v1/*, no la de
 * Inbucket), el mismo camino que seguiría un usuario real en local.
 */
import { createClient } from '@supabase/supabase-js'
import { clienteAdmin, exigirLocal } from '../lib.mjs'

exigirLocal()

const URL_SUPABASE = process.env.SUPABASE_URL
const CLAVE_ANON = process.env.SUPABASE_ANON_KEY
const MAILPIT = 'http://127.0.0.1:54324'

const admin = clienteAdmin()
const veredictos = []
const anotar = (item, ok, observado) => veredictos.push({ item, ok, observado })

function nuevoCliente() {
  return createClient(URL_SUPABASE, CLAVE_ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch },
  })
}

const sello = Date.now().toString(36)
const email = `qa.f0auth.${sello}@aquila.test`
const passwordInicial = 'QaAquila2026!'
const passwordNueva = 'QaAquila2026-Nueva!'

async function contarUsuariosPorEmail(correo) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users.filter((u) => u.email?.toLowerCase() === correo.toLowerCase()).length
}

// ── f0-01 · registrar un usuario nuevo con correo y contraseña válidos ──
const clienteRegistro = nuevoCliente()
const { data: datosSignUp, error: errorSignUp } = await clienteRegistro.auth.signUp({
  email,
  password: passwordInicial,
  options: { data: { full_name: 'QA F0 Auth' } },
})
{
  const conteo = await contarUsuariosPorEmail(email)
  anotar(
    'f0-01',
    !errorSignUp && conteo === 1 && (!!datosSignUp?.session || !!datosSignUp?.user),
    errorSignUp
      ? `signUp() rechazó el alta: ${errorSignUp.message}`
      : `signUp() ${datosSignUp.session ? 'devolvió sesión de inmediato (enable_confirmations=false en supabase/config.toml local)' : 'no devolvió sesión — pendiente de confirmación'}; auth.users tiene ${conteo} fila(s) con ese correo`,
  )
}

// ── f0-02 · registrar con un correo que ya existe ───────────────────────
{
  const clienteDup = nuevoCliente()
  const { data: datosDup, error: errorDup } = await clienteDup.auth.signUp({
    email,
    password: 'OtraClave2026!',
    options: { data: { full_name: 'QA F0 Auth Duplicado' } },
  })
  const conteo = await contarUsuariosPorEmail(email)
  // GoTrue con confirmaciones desactivadas no siempre devuelve un `error`
  // explícito para no filtrar qué correos existen — pero NUNCA debe crear
  // una segunda cuenta ni devolver una sesión nueva para un correo ya usado.
  const rechazadoOAmbiguo = !!errorDup || !datosDup?.session
  anotar(
    'f0-02',
    conteo === 1 && rechazadoOAmbiguo,
    errorDup
      ? `Rechazado explícitamente: ${errorDup.code ?? ''} ${errorDup.message}`.trim()
      : datosDup?.session
        ? `NO CUMPLE: devolvió una sesión nueva para un correo duplicado`
        : `No devolvió error explícito ni sesión (respuesta ambigua tipo "revisa tu correo")`,
  )
  anotar(
    'f0-02-conteo',
    conteo === 1,
    `auth.users tiene ${conteo} fila(s) con ${email} tras el intento de duplicado (debe seguir siendo 1)`,
  )
}

// ── f0-03 · iniciar sesión con correo y contraseña correctos ────────────
{
  const clienteLogin = nuevoCliente()
  const { data, error } = await clienteLogin.auth.signInWithPassword({
    email,
    password: passwordInicial,
  })
  anotar(
    'f0-03',
    !error && !!data.session,
    error
      ? `signInWithPassword rechazó credenciales correctas: ${error.message}`
      : `Sesión activa devuelta (access_token presente, expires_at=${data.session.expires_at})`,
  )
}

// ── f0-04 · iniciar sesión con la contraseña incorrecta ─────────────────
{
  const clienteLoginMalo = nuevoCliente()
  const { data, error } = await clienteLoginMalo.auth.signInWithPassword({
    email,
    password: 'ClaveIncorrecta123!',
  })
  const { data: sesionPosterior } = await clienteLoginMalo.auth.getSession()
  anotar(
    'f0-04',
    !!error && !data.session && !sesionPosterior.session,
    error
      ? `Rechazado con "${error.message}" (status ${error.status}); getSession() posterior confirma session=${sesionPosterior.session}`
      : `NO CUMPLE: otorgó sesión con contraseña incorrecta`,
  )
}

// ── f0-05 · solicitar recuperar contraseña con un correo existente ──────
let linkRecuperacion = null
{
  const clienteRecuperar = nuevoCliente()
  const { error } = await clienteRecuperar.auth.resetPasswordForEmail(email, {
    redirectTo: 'http://127.0.0.1:3000/reset-password',
  })
  if (error) {
    anotar('f0-05', false, `resetPasswordForEmail rechazó: ${error.message}`)
  } else {
    // Mailpit indexa async; una espera corta evita falsos negativos.
    await new Promise((r) => setTimeout(r, 800))
    const resp = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email} subject:"Reset your password"`)}`,
    )
    const resultado = await resp.json()
    const mensaje = resultado.messages?.[0]
    if (!mensaje) {
      anotar('f0-05', false, `No llegó ningún correo "Reset your password" a Mailpit para ${email}`)
    } else {
      const detalle = await fetch(`${MAILPIT}/api/v1/message/${mensaje.ID}`).then((r) => r.json())
      const texto = detalle.Text || detalle.HTML || ''
      const match = texto.match(/http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify\?[^\s)]+/)
      linkRecuperacion = match?.[0] ?? null
      anotar(
        'f0-05',
        !!linkRecuperacion && linkRecuperacion.includes('type=recovery') && linkRecuperacion.includes('redirect_to=http://127.0.0.1:3000/reset-password'),
        linkRecuperacion
          ? `Llegó el correo con un enlace type=recovery hacia /reset-password: ${linkRecuperacion.slice(0, 90)}…`
          : `El correo llegó pero no se pudo extraer un enlace de recuperación válido del cuerpo`,
      )
    }
  }
}

// ── f0-06 · definir la nueva contraseña desde el enlace recibido ───────
if (linkRecuperacion) {
  const respVerify = await fetch(linkRecuperacion, { redirect: 'manual' })
  const location = respVerify.headers.get('location')
  const tokens = location ? new URLSearchParams(new URL(location).hash.slice(1)) : null
  const accessToken = tokens?.get('access_token')
  const refreshToken = tokens?.get('refresh_token')

  if (!accessToken || !refreshToken) {
    anotar('f0-06', false, `El enlace no devolvió tokens utilizables (redirect a ${location})`)
  } else {
    const clienteReset = nuevoCliente()
    await clienteReset.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    const { error: errorUpdate } = await clienteReset.auth.updateUser({ password: passwordNueva })

    const clienteViejaClave = nuevoCliente()
    const { data: loginViejo } = await clienteViejaClave.auth.signInWithPassword({
      email,
      password: passwordInicial,
    })
    const clienteNuevaClave = nuevoCliente()
    const { data: loginNuevo, error: errorLoginNuevo } = await clienteNuevaClave.auth.signInWithPassword({
      email,
      password: passwordNueva,
    })

    // El mismo enlace, usado una segunda vez, no debe volver a servir.
    const respVerify2 = await fetch(linkRecuperacion, { redirect: 'manual' })
    const location2 = respVerify2.headers.get('location')
    const tokens2 = location2 ? new URLSearchParams(new URL(location2).hash.slice(1)) : null
    const reusoFuncionó = !!tokens2?.get('access_token')

    anotar(
      'f0-06',
      !errorUpdate && !loginViejo.session && !!loginNuevo.session && !reusoFuncionó,
      errorUpdate
        ? `updateUser(password) falló: ${errorUpdate.message}`
        : `Contraseña vieja ${loginViejo.session ? 'SIGUE sirviendo (falla)' : 'ya no sirve'}; nueva ${loginNuevo.session ? 'sirve' : `NO sirve (${errorLoginNuevo?.message})`}; reusar el mismo enlace ${reusoFuncionó ? 'volvió a dar tokens (falla — no es un solo uso)' : 'ya no da tokens (correcto)'}`,
    )
  }
} else {
  anotar('f0-06', false, 'No se pudo ejecutar: f0-05 no produjo un enlace de recuperación utilizable')
}

// ── limpieza: borrar el usuario descartable ─────────────────────────────
const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
const creado = userList.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
if (creado) await admin.auth.admin.deleteUser(creado.id)

for (const v of veredictos) {
  process.stdout.write(`${v.item}  ${v.ok ? 'CUMPLE ' : 'NO CUMPLE'}  ${v.observado}\n`)
}
