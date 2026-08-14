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
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'

export const RUN_ID = randomUUID().slice(0, 8)

/**
 * Sin `packages/shared/database.generated.ts` (D-11: gen types requiere
 * Docker, no disponible bajo D-08), el cliente se tipa con esquema `any`.
 * No es un tipo de BD escrito a mano (Fase I §3.3 prohíbe eso); es la
 * ausencia deliberada de tipado de esquema. Cada consulta que importa
 * usa su propio genérico explícito (`.single<T>()`) para el shape real.
 */
export type Cliente = ReturnType<typeof createClient<any, any, any>>

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
  return createClient<any, any, any>(env.url, env.serviceKey, {
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

export async function crearTenant(
  admin: Cliente,
  etiqueta: string,
  creadoPor: string,
): Promise<TenantPrueba> {
  const slug = `t-${RUN_ID}-${etiqueta}`.toLowerCase()
  const { data, error } = await admin
    .from('tenants')
    .insert({ name: `Tenant prueba ${etiqueta}`, slug, created_by: creadoPor })
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
  role: 'agent' | 'auditor',
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
  const cliente = createClient<any, any, any>(env.url, env.anonKey, {
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
  return createClient<any, any, any>(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
