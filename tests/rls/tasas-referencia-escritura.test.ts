/**
 * tasas_referencia — quién puede escribir la tasa nacional, y por qué la
 * pantalla de plataforma (bloque 27, /plataforma/tasas-referencia) está
 * obligada a pedir fecha de cierre.
 *
 * La tabla es GLOBAL (sin tenant_id, única excepción a REC-CAR-007) porque el
 * art. 30 de la Ley 675/2001 se aplica igual a toda copropiedad. De ahí las
 * tres invariantes que cubre este archivo:
 *
 *  1. lectura abierta a cualquier autenticado — el motor de mora la necesita;
 *  2. escritura SOLO is_platform_admin — un administrador de copropiedad no
 *     puede fijar la tasa que limita su propio tope de mora;
 *  3. append-only: `forbid_mutation` bloquea UPDATE, así que NO existe
 *     "cerrar la vigencia de la anterior". Es la razón de que registrar una
 *     tasa sin `vigente_hasta` bloquearía el tipo de tasa para siempre — la
 *     restricción de no solape la haría chocar con toda fecha futura y ya no
 *     se podría acotar.
 *
 * Igual que politica-financiera-tope-legal.test.ts: las filas que inserta NO
 * se pueden borrar después (append-only) y quedan permanentemente. Se usan
 * años 1901-1990 derivados de RUN_ID — banda distinta de la que usa aquel
 * archivo (1000-1900) para que ambos puedan correr en la misma pasada sin
 * chocar contra la restricción de no solape.
 */
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
  RUN_ID,
  type Cliente,
  type TenantPrueba,
  type UsuarioPrueba,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/tasas-referencia-escritura: faltan variables de Supabase en .env')
}

/** Año 1901-1990 derivado de RUN_ID — banda propia de este archivo. */
function fechaDePruebaAislada(desplazamientoDias = 0): string {
  const anio = 1901 + (parseInt(RUN_ID.slice(0, 3), 16) % 90)
  const mes = 1 + (parseInt(RUN_ID.slice(3, 5), 16) % 12)
  const dia = 1 + (parseInt(RUN_ID.slice(5, 7), 16) % 20) + desplazamientoDias
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

d('tasas_referencia — escritura de plataforma y append-only (CAR §3.4)', () => {
  let admin: Cliente
  let usuarioTenant: Cliente
  const usuarios: UsuarioPrueba[] = []
  const tenants: TenantPrueba[] = []
  let desde: string
  let hasta: string
  let idFixture: string

  beforeAll(async () => {
    admin = clienteAdmin(env!)

    const usuario = await crearUsuario(admin, 'tasas-ref')
    usuarios.push(usuario)
    const tenant = await crearTenant(admin, 'tasas-ref', usuario.id)
    tenants.push(tenant)
    await crearMembership(admin, tenant.id, usuario.id, 'administrador')
    usuarioTenant = await clienteComo(env!, usuario)

    desde = fechaDePruebaAislada()
    hasta = fechaDePruebaAislada(3)
    const { data, error } = await admin
      .from('tasas_referencia')
      .insert({
        tipo_tasa: 'ibc_consumo_ordinario',
        vigente_desde: desde,
        vigente_hasta: hasta,
        valor_ea: 0.2412,
        valor_mensual: 0.0181,
        resolucion_numero: `TEST-ESCRITURA-${RUN_ID}`,
        resolucion_fecha: desde,
        entidad_fuente: 'Dato de prueba automatizado — no es una tasa real',
      })
      .select('id')
      .single()
    if (error) throw new Error(`fixture tasas_referencia: ${error.message}`)
    idFixture = data.id
  })

  afterAll(async () => {
    for (const tenant of tenants) await eliminarTenant(admin, tenant.id)
    for (const usuario of usuarios) await eliminarUsuario(admin, usuario.id)
    // La fila de tasas_referencia queda: append-only, a propósito.
  })

  it('cualquier autenticado puede LEER la tasa de referencia', async () => {
    const { data, error } = await usuarioTenant
      .from('tasas_referencia')
      .select('id, valor_mensual')
      .eq('id', idFixture)
      .maybeSingle()
    expect(error).toBeNull()
    expect(data?.id).toBe(idFixture)
  })

  it('un administrador de copropiedad NO puede registrar una tasa nacional', async () => {
    const { error } = await usuarioTenant.from('tasas_referencia').insert({
      tipo_tasa: 'ibc_consumo_ordinario',
      vigente_desde: fechaDePruebaAislada(10),
      vigente_hasta: fechaDePruebaAislada(12),
      valor_ea: 0.99,
      valor_mensual: 0.5, // se subiría su propio tope de mora
      resolucion_numero: `TEST-INTRUSO-${RUN_ID}`,
      resolucion_fecha: fechaDePruebaAislada(10),
      entidad_fuente: 'Dato de prueba automatizado — no es una tasa real',
    })
    expect(error).not.toBeNull()
  })

  it('append-only: ni siquiera con service role se puede cerrar la vigencia de una tasa', async () => {
    const { error } = await admin
      .from('tasas_referencia')
      .update({ vigente_hasta: fechaDePruebaAislada(5) })
      .eq('id', idFixture)
    expect(error).not.toBeNull()
    expect(error?.message).toContain('APPEND_ONLY')
  })

  it('no se admite una vigencia que solape con otra del mismo tipo de tasa', async () => {
    const { error } = await admin.from('tasas_referencia').insert({
      tipo_tasa: 'ibc_consumo_ordinario',
      vigente_desde: fechaDePruebaAislada(1), // cae dentro de [desde, hasta]
      vigente_hasta: fechaDePruebaAislada(2),
      valor_ea: 0.2412,
      valor_mensual: 0.0181,
      resolucion_numero: `TEST-SOLAPE-${RUN_ID}`,
      resolucion_fecha: desde,
      entidad_fuente: 'Dato de prueba automatizado — no es una tasa real',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('tasas_referencia_sin_solape')
  })
})
