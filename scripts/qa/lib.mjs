/**
 * Utilidades compartidas del banco de pruebas QA.
 *
 * Todo lo de aquí corre SOLO contra el Supabase local: sembrar tres
 * copropiedades con actividad financiera real es irreversible (SEC-14,
 * cargos y eventos son append-only) y no tiene ningún sentido en producción.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env' })

export const URL_SUPABASE = process.env.SUPABASE_URL
export const CLAVE_ANON = process.env.SUPABASE_ANON_KEY
export const CLAVE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

export function exigirLocal() {
  if (!URL_SUPABASE || !CLAVE_ANON || !CLAVE_SERVICE) {
    throw new Error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY en .env')
  }
  if (!URL_SUPABASE.includes('127.0.0.1') && !URL_SUPABASE.includes('localhost')) {
    throw new Error(
      `SUPABASE_URL apunta a ${URL_SUPABASE}. El banco de pruebas QA nunca corre contra remoto: ` +
        'siembra actividad financiera append-only que no se puede deshacer.',
    )
  }
}

export function clienteAdmin() {
  return createClient(URL_SUPABASE, CLAVE_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch },
  })
}

/** Cliente autenticado como un usuario real — respeta RLS, como la UI. */
export async function clienteComo(admin, email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw new Error(`generateLink(${email}): ${error.message}`)
  const resp = await fetch(data.properties.action_link, { redirect: 'manual' })
  const location = resp.headers.get('location')
  if (!location) throw new Error(`sin redirect para ${email}: ${resp.status}`)
  const tokens = new URLSearchParams(new URL(location).hash.slice(1))
  const accessToken = tokens.get('access_token')
  const refreshToken = tokens.get('refresh_token')
  if (!accessToken || !refreshToken) throw new Error(`sin tokens para ${email}: ${location}`)
  const cliente = createClient(URL_SUPABASE, CLAVE_ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch },
  })
  const { error: errorSesion } = await cliente.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  if (errorSesion) throw errorSesion
  cliente.__accessToken = accessToken
  cliente.__email = email
  return cliente
}

/** Llama una Edge Function con la sesión de un usuario — mismo camino que la UI. */
export async function invocarFuncion(cliente, nombre, cuerpo) {
  const resp = await fetch(`${URL_SUPABASE}/functions/v1/${nombre}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: CLAVE_ANON,
      authorization: `Bearer ${cliente.__accessToken}`,
    },
    body: JSON.stringify(cuerpo ?? {}),
  })
  const texto = await resp.text()
  let json = null
  try {
    json = texto ? JSON.parse(texto) : null
  } catch {
    /* respuesta no-JSON: se devuelve el texto crudo para poder diagnosticar */
  }
  return { ok: resp.ok, status: resp.status, json, texto }
}

/** Asegura un usuario de auth con contraseña conocida; devuelve su id. */
export async function asegurarUsuario(admin, email, password, nombre) {
  const { data: existentes, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  const ya = existentes.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (ya) {
    await admin.auth.admin.updateUserById(ya.id, { password, email_confirm: true })
    return ya.id
  }
  const { data, error: errorCrear } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: nombre },
  })
  if (errorCrear) throw new Error(`crear usuario ${email}: ${errorCrear.message}`)
  return data.user.id
}

/** Catálogo global (lista_tipos con tenant_id null) indexado por tipo+codigo. */
export async function cargarCatalogo(admin) {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id, tipo, codigo')
    .is('tenant_id', null)
  if (error) throw error
  const mapa = new Map(data.map((r) => [`${r.tipo}:${r.codigo}`, r.id]))
  return {
    id(tipo, codigo) {
      const v = mapa.get(`${tipo}:${codigo}`)
      if (v === undefined) throw new Error(`lista_tipos ${tipo}:${codigo} no existe`)
      return v
    },
  }
}

/** Dígito de verificación NIT según el algoritmo DIAN. */
export function digitoVerificacionNit(nit) {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
  const digitos = String(nit).split('').reverse()
  const suma = digitos.reduce((acc, d, i) => acc + Number(d) * pesos[i], 0)
  const resto = suma % 11
  return String(resto > 1 ? 11 - resto : resto)
}

/** Reparto por mayor resto: Σ de las partes == total, exacto, en enteros. */
export function repartirMayorResto(total, pesos) {
  const sumaPesos = pesos.reduce((a, b) => a + b, 0)
  const exactos = pesos.map((p) => (total * p) / sumaPesos)
  const base = exactos.map(Math.floor)
  let falta = total - base.reduce((a, b) => a + b, 0)
  const orden = exactos
    .map((v, i) => ({ i, resto: v - Math.floor(v) }))
    .sort((a, b) => b.resto - a.resto)
  for (let k = 0; falta > 0; k++, falta--) base[orden[k % orden.length].i] += 1
  return base
}

export function log(mensaje) {
  process.stdout.write(`${mensaje}\n`)
}

export function paso(titulo) {
  process.stdout.write(`\n── ${titulo} ${'─'.repeat(Math.max(0, 66 - titulo.length))}\n`)
}
