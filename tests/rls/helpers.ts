/**
 * Fixtures para los tests RLS de la puerta F1→F2 (PLAN §5.4).
 *
 * D-08: sin Postgres local, estos tests corren contra el proyecto Supabase
 * remoto de desarrollo. Cada ejecución usa un RUN_ID único para no chocar
 * con ejecuciones concurrentes (mitigación registrada en DECISIONES.md D-08)
 * y limpia todo lo que crea en `afterAll`.
 *
 * Si faltan las variables de entorno, los tests se OMITEN con un mensaje
 * explícito — nunca se declaran en verde sin haber corrido (0AEL §28).
 */
import 'dotenv/config'
import { crearClienteAquila, type AquilaClient } from '@aquila/shared'
import { randomBytes, randomUUID } from 'node:crypto'

export const RUN_ID = randomUUID().slice(0, 8)

/** D-11 resuelto: tipos generados desde el esquema real (DB-first). */
export type Cliente = AquilaClient

export interface Entorno {
  url: string
  anonKey: string
  serviceKey: string
}

export function leerEntorno(): Entorno | null {
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) return null
  return { url, anonKey, serviceKey }
}

/** service_role — tiene BYPASSRLS. Se usa solo para preparar fixtures. */
export function clienteAdmin(env: Entorno): Cliente {
  return crearClienteAquila(env.url, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function passwordAleatoria(): string {
  return randomBytes(18).toString('base64url')
}

export interface UsuarioPrueba {
  id: string
  email: string
  password: string
}

export async function crearUsuario(admin: Cliente, etiqueta: string): Promise<UsuarioPrueba> {
  const email = `rls-${RUN_ID}-${etiqueta}@example.test`
  const password = passwordAleatoria()

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) {
    throw new Error(`No se pudo crear el usuario de prueba "${etiqueta}": ${error.message}`)
  }
  return { id: data.user.id, email, password }
}

export async function eliminarUsuario(admin: Cliente, id: string): Promise<void> {
  await admin.auth.admin.deleteUser(id)
}

export interface TenantPrueba {
  id: string
  slug: string
}

/** `creadoPor` es opcional porque `tenants.created_by` es nullable
 * (20260813190100_core_tables.sql:16). La firma lo exigía y ocho suites lo
 * omitían: 12 errores de `tsc` sobre pruebas que en ejecución pasaban, porque
 * la base sí acepta el insert sin ese campo. Se relaja la firma en vez de
 * reescribir las ocho — el tipo debe describir el esquema, no al revés. */
export async function crearTenant(
  admin: Cliente,
  etiqueta: string,
  creadoPor?: string,
): Promise<TenantPrueba> {
  const slug = `t-${RUN_ID}-${etiqueta}`.toLowerCase()
  const { data, error } = await admin
    .from('tenants')
    // La clave se omite cuando no hay autor, en vez de mandarla en undefined:
    // el tipo generado no admite `string | undefined` en una columna nullable.
    .insert({ name: `Tenant prueba ${etiqueta}`, slug, ...(creadoPor ? { created_by: creadoPor } : {}) })
    .select('id, slug')
    .single<TenantPrueba>()

  if (error) {
    throw new Error(`No se pudo crear el tenant de prueba "${etiqueta}": ${error.message}`)
  }
  return data
}

export async function eliminarTenant(admin: Cliente, id: string): Promise<void> {
  // ON DELETE CASCADE arrastra memberships e invitations.
  await admin.from('tenants').delete().eq('id', id)
}

export async function crearMembership(
  admin: Cliente,
  tenantId: string,
  userId: string,
  role: 'auxiliar' | 'auditor' | 'administrador',
): Promise<string> {
  const { data, error } = await admin
    .from('memberships')
    .insert({ tenant_id: tenantId, user_id: userId, role })
    .select('id')
    .single<{ id: string }>()

  if (error) {
    throw new Error(`No se pudo crear membership: ${error.message}`)
  }
  return data.id
}

/** Cliente autenticado como el usuario de prueba (usa la anon key + JWT de sesión). */
export async function clienteComo(env: Entorno, usuario: UsuarioPrueba): Promise<Cliente> {
  const cliente = crearClienteAquila(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await cliente.auth.signInWithPassword({
    email: usuario.email,
    password: usuario.password,
  })
  if (error) {
    throw new Error(`No se pudo iniciar sesión como ${usuario.email}: ${error.message}`)
  }
  return cliente
}

/** Cliente sin sesión — representa al rol `anon`. */
export function clienteAnonimo(env: Entorno): Cliente {
  return crearClienteAquila(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Id de una fila global del catálogo `lista_tipos` (las que tienen
 * `tenant_id is null`).
 *
 * Vivía duplicado dentro de auditoria-controles-automaticos.test.ts. Se sube
 * aquí porque `pagos.forma_pago_id` pasó a NOT NULL
 * (20260903100000_pagos_medio_recaudo.sql:126) y cuatro suites seguían
 * insertando pagos sin él: la fixture necesita resolver el id de la forma de
 * pago, y eso no se puede hardcodear —`lista_tipos.id` es un bigint de
 * secuencia, distinto en cada base—.
 */
export async function listaTipoId(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

/** Forma de pago «efectivo»: la única que no arrastra cuenta bancaria, así que
 * es la fixture correcta para pruebas que no tratan sobre el medio de recaudo
 * (efectivo debita CAJA_GENERAL; cualquier otra exige identificar el banco). */
export async function formaPagoEfectivo(admin: Cliente): Promise<number> {
  return listaTipoId(admin, 'FORMA_PAGO', 'efectivo')
}
