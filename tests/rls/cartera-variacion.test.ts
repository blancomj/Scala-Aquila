/**
 * fn_variacion_cartera / fn_variacion_cartera_eventos — aislamiento entre
 * copropiedades (ENFOQUE_CONSOLIDACION paso 0, prompt P0 §8).
 *
 * Las dos funciones son `security invoker` a propósito: heredan la RLS del
 * invocante en vez de saltársela. Un `security definer` aquí habría creado
 * un camino para leer la cartera de otra copropiedad a través de una
 * función de solo lectura — que es justamente el tipo de fuga que una capa
 * de inteligencia puede introducir sin que nadie lo note.
 *
 * Esta prueba existe para que ese detalle no se pueda revertir en silencio:
 * si alguien cambia invoker por definer, estas expectativas fallan.
 *
 * PRUEBA DE AUSENCIA: no comprueba que la función devuelva datos, sino que
 * NO devuelva los de otro tenant. Un miembro de A no puede ver nada de B,
 * ni siquiera la lista de inmuebles comparados.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
  type Cliente,
  type TenantPrueba,
  type UsuarioPrueba,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/cartera-variacion: faltan variables de Supabase en .env')
}

const CORTE_ANTERIOR = '2026-08-01'
const CORTE_ACTUAL = '2026-09-01'

async function listaTipoId(admin: Cliente, tipo: string, codigo: string): Promise<number> {
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

async function crearInmueble(admin: Cliente, tenantId: string, codigo: string): Promise<string> {
  const tipoInmuebleId = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
  const { data, error } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo, tipo_id: tipoInmuebleId })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture inmueble: ${error.message}`)
  return data.id
}

d('fn_variacion_cartera — aislamiento por copropiedad', () => {
  let admin: Cliente
  let miembroA: UsuarioPrueba
  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let codigoB: string

  beforeAll(async () => {
    if (!env) return
    admin = clienteAdmin(env)

    miembroA = await crearUsuario(admin, 'variacion-a')
    tenantA = await crearTenant(admin, 'variacion-a', miembroA.id)
    tenantB = await crearTenant(admin, 'variacion-b')
    await crearMembership(admin, tenantA.id, miembroA.id, 'administrador')

    // Un inmueble en cada lado. El de B tiene un código reconocible: si
    // apareciera en la respuesta de A, la fuga sería inequívoca.
    await crearInmueble(admin, tenantA.id, `VAR-A-${String(Date.now())}`)
    codigoB = `VAR-B-${String(Date.now())}`
    await crearInmueble(admin, tenantB.id, codigoB)

    // Evento solo en B: alimenta fn_variacion_cartera_eventos de B.
    const { error } = await admin.from('eventos_cartera').insert({
      tenant_id: tenantB.id,
      tipo: 'CARGO_VENCIDO',
      fecha_corte: CORTE_ACTUAL,
      ocurrido_at: `${CORTE_ACTUAL}T10:00:00Z`,
      motivo: 'Fixture de aislamiento: no debe verse desde el tenant A',
      origen: 'job',
      dedup_key: `rls-variacion-${String(Date.now())}`,
    })
    if (error) throw new Error(`fixture evento: ${error.message}`)
  })

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, miembroA.id)
  })

  it('un miembro de A no obtiene ninguna fila del tenant B', async () => {
    const cliente = await clienteComo(env!, miembroA)

    const { data, error } = await cliente.rpc('fn_variacion_cartera', {
      p_tenant_id: tenantB.id,
      p_fecha_corte_anterior: CORTE_ANTERIOR,
      p_fecha_corte_actual: CORTE_ACTUAL,
    })

    // RLS filtra, no lanza: la respuesta correcta es vacía, no un error.
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('el código de inmueble de B nunca aparece en la respuesta de A', async () => {
    const cliente = await clienteComo(env!, miembroA)

    const { data } = await cliente.rpc('fn_variacion_cartera', {
      p_tenant_id: tenantA.id,
      p_fecha_corte_anterior: CORTE_ANTERIOR,
      p_fecha_corte_actual: CORTE_ACTUAL,
    })

    const codigos = (data ?? []).map((f: { codigo: string }) => f.codigo)
    expect(codigos).not.toContain(codigoB)
  })

  it('los eventos de B no se cuentan desde A', async () => {
    const cliente = await clienteComo(env!, miembroA)

    const { data, error } = await cliente.rpc('fn_variacion_cartera_eventos', {
      p_tenant_id: tenantB.id,
      p_fecha_corte_anterior: CORTE_ANTERIOR,
      p_fecha_corte_actual: CORTE_ACTUAL,
    })

    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('un cliente anónimo no obtiene nada', async () => {
    const cliente = clienteAnonimo(env!)

    const { data } = await cliente.rpc('fn_variacion_cartera', {
      p_tenant_id: tenantA.id,
      p_fecha_corte_anterior: CORTE_ANTERIOR,
      p_fecha_corte_actual: CORTE_ACTUAL,
    })

    expect(data ?? []).toHaveLength(0)
  })

  it('el propio tenant sí responde: la función no está rota, solo aislada', async () => {
    const cliente = await clienteComo(env!, miembroA)

    const { data, error } = await cliente.rpc('fn_variacion_cartera', {
      p_tenant_id: tenantA.id,
      p_fecha_corte_anterior: CORTE_ANTERIOR,
      p_fecha_corte_actual: CORTE_ACTUAL,
    })

    // Sin esta expectativa, los cuatro casos anteriores pasarían igual con
    // una función que no devuelve nada nunca.
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
  })
})
