/**
 * Cierre del audit de guardias de fn_resetear_copropiedad (D-99/D-122). D-99 encontró y corrigió
 * 4 guardias que bloqueaban el reset (SEC-14/forbid_mutation, cobertura de tablas, CO-2), y se
 * detuvo deliberadamente en un quinto: guard_coeficiente_set_padre_inmutable (IMMUTABLE_
 * COEFFICIENT_SET) sobre `coeficientes`, cuando el set padre está vigente/histórico.
 *
 * Auditoría completa (no "un guard, un parche") vía pg_trigger/pg_proc confirmó que era el ÚNICO
 * trigger de DELETE, de las 76 tablas que el reset borra, que todavía no leía
 * `aquila.reset_context` — los otros 18 (forbid_mutation/forbid_mutation_salvo_tenant_borrado,
 * guard_contable_comprobante_detalle_inmutable) ya estaban corregidos por D-99.
 * guard_coeficiente_set_inmutable (sobre coeficiente_sets) no necesitaba tocarse: solo dispara en
 * UPDATE, nunca en DELETE.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
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
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/fn-resetear-copropiedad-coeficientes: faltan variables de Supabase en .env')
}

async function tipoApartamentoId(admin: Cliente): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'TIPO_INMUEBLE')
    .eq('codigo', 'apartamento')
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture tipo apartamento: ${error.message}`)
  return data.id
}

/** Set + un coeficiente, promovido al estado pedido — mismo patrón que
 * tests/liquidacion/coeficiente-set-reemplazo.test.ts. */
async function crearSetConCoeficiente(
  admin: Cliente,
  tenantId: string,
  inmuebleId: string,
  version: number,
  estado: 'vigente' | 'historica',
): Promise<{ setId: string; coeficienteId: string }> {
  const { data: set, error: errSet } = await admin
    .from('coeficiente_sets')
    .insert({
      tenant_id: tenantId,
      version,
      vigente_desde: '2030-01-01',
      estado: 'borrador',
      suma_total: 1,
    })
    .select('id')
    .single<{ id: string }>()
  if (errSet) throw new Error(`fixture coeficiente_set: ${errSet.message}`)

  const { data: coef, error: errCoef } = await admin
    .from('coeficientes')
    .insert({ tenant_id: tenantId, set_id: set.id, inmueble_id: inmuebleId, valor: 1 })
    .select('id')
    .single<{ id: string }>()
  if (errCoef) throw new Error(`fixture coeficiente: ${errCoef.message}`)

  // 'historica' no es alcanzable desde 'borrador' directo en el modelo real (se pasa por
  // 'vigente' primero), pero para este fixture solo importa el valor final de `estado` que el
  // guard lee — se fija directo, sin pasar por el flujo de reemplazo completo.
  const { error: errEstado } = await admin
    .from('coeficiente_sets')
    .update({ estado })
    .eq('id', set.id)
  if (errEstado) throw new Error(`fixture estado ${estado}: ${errEstado.message}`)

  return { setId: set.id, coeficienteId: coef.id }
}

d('fn_resetear_copropiedad — guardia de coeficientes (D-99/D-122)', () => {
  const admin = clienteAdmin(env!)
  let administrador: UsuarioPrueba | undefined
  let tenant: TenantPrueba | undefined

  afterAll(async () => {
    if (tenant) await eliminarTenant(admin, tenant.id)
    if (administrador) await eliminarUsuario(admin, administrador.id)
  })

  it('un coeficiente de un set vigente sigue siendo inmutable FUERA de un reset (regresión)', async () => {
    administrador = await crearUsuario(admin, 'reset-coef-adm')
    tenant = await crearTenant(admin, 'reset-coef', administrador.id)
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')

    const tipoId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `RC-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)

    const { coeficienteId } = await crearSetConCoeficiente(admin, tenant.id, inmueble.id, 1, 'vigente')

    const { error } = await admin.from('coeficientes').delete().eq('id', coeficienteId)
    expect(error?.message).toMatch(/IMMUTABLE_COEFFICIENT_SET/)
  })

  it('fn_resetear_copropiedad borra coeficientes de sets vigentes E históricos sin bloquearse', async () => {
    const cAdm: Cliente = await clienteComo(env!, administrador!)
    const tipoId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant!.id, codigo: `RC2-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)

    // El set 'vigente' del test anterior sigue ahí (versión 1); se agrega uno 'historica' propio
    // (versión 2) para cubrir la otra rama del guard en el mismo reset.
    await crearSetConCoeficiente(admin, tenant!.id, inmueble.id, 2, 'historica')

    const { data: resumen, error } = await cAdm.rpc('fn_resetear_copropiedad', {
      p_tenant_id: tenant!.id,
    })
    expect(error).toBeNull()
    expect(resumen).toBeTruthy()

    const { data: coefDespues, error: errCoefDespues } = await admin
      .from('coeficientes')
      .select('id')
      .eq('tenant_id', tenant!.id)
    if (errCoefDespues) throw errCoefDespues
    expect(coefDespues).toHaveLength(0)

    const { data: setsDespues, error: errSetsDespues } = await admin
      .from('coeficiente_sets')
      .select('id')
      .eq('tenant_id', tenant!.id)
    if (errSetsDespues) throw errSetsDespues
    expect(setsDespues).toHaveLength(0)
  })
})
