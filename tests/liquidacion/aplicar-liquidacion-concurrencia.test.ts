/**
 * Hueco de test #1 (auditoría externa 2026-08-26, Docs/evaluacion/02 §7) —
 * dos aplicaciones concurrentes de la MISMA liquidación no deben duplicar
 * cargos. Mismo criterio de test que S1 (tests/tenancy/novedades.test.ts:
 * "dos aprobaciones concurrentes no duplican el cargo"), aquí contra
 * fn_aplicar_liquidacion (20260901150000_fn_aplicar_liquidacion_idempotente.sql).
 *
 * Setup mínimo (no reusa flujo-dos-tiempos.test.ts: ese archivo ya es largo
 * y cubre L0-L7 completo — esto es un caso puntual de concurrencia).
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
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/liquidacion/aplicar-liquidacion-concurrencia: faltan variables de Supabase en .env')
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

d('fn_aplicar_liquidacion — concurrencia (hueco de test #1)', () => {
  const admin = clienteAdmin(env!)
  let auxiliar: UsuarioPrueba | undefined
  let administrador: UsuarioPrueba | undefined
  let tenant: TenantPrueba | undefined
  let cAux: Cliente
  let cAdm: Cliente

  afterAll(async () => {
    if (tenant) await eliminarTenant(admin, tenant.id)
    if (auxiliar) await eliminarUsuario(admin, auxiliar.id)
    if (administrador) await eliminarUsuario(admin, administrador.id)
  })

  it('dos aplicaciones concurrentes de la misma liquidación no duplican cargos', async () => {
    auxiliar = await crearUsuario(admin, 'aplic-conc-aux')
    administrador = await crearUsuario(admin, 'aplic-conc-adm')
    tenant = await crearTenant(admin, 'aplic-conc', auxiliar.id)
    const tenantId = tenant.id
    await crearMembership(admin, tenantId, auxiliar.id, 'auxiliar')
    await crearMembership(admin, tenantId, administrador.id, 'administrador')
    cAux = await clienteComo(env!, auxiliar)
    cAdm = await clienteComo(env!, administrador)

    const tipoId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantId, codigo: `AC-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)

    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .insert({
        tenant_id: tenantId,
        version: 1,
        vigente_desde: '2032-01-01',
        estado: 'borrador',
        suma_total: 1,
      })
      .select('id')
      .single<{ id: string }>()
    if (errSet) throw new Error(`fixture set: ${errSet.message}`)
    const { error: errCoef } = await admin.from('coeficientes').insert({
      tenant_id: tenantId,
      set_id: set.id,
      inmueble_id: inmueble.id,
      valor: 1,
    })
    if (errCoef) throw new Error(`fixture coeficiente: ${errCoef.message}`)
    await admin.from('coeficiente_sets').update({ estado: 'vigente' }).eq('id', set.id)

    const { error: errPol } = await admin.from('politicas_financieras').insert({
      tenant_id: tenantId,
      version: 1,
      estado: 'vigente',
      vigente_desde: '2032-01-01',
      redondeo_modo: 'half_up',
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto',
      coeficientes_suma_esperada: 1,
      policy_hash: 'fixture-aplic-conc',
    })
    if (errPol) throw new Error(`fixture politica: ${errPol.message}`)

    const { data: periodo, error: errPer } = await admin
      .from('periodos')
      .insert({ tenant_id: tenantId, anio: 2032, mes: 1, fecha_vencimiento: '2032-01-10' })
      .select('id')
      .single<{ id: string }>()
    if (errPer) throw new Error(`fixture periodo: ${errPer.message}`)

    const { error: errCon } = await admin.from('conceptos').insert({
      tenant_id: tenantId,
      codigo: 'CUOTA_AC',
      nombre: 'Cuota de prueba concurrencia',
      modo_calculo: 'distribucion',
      modo_valor: 'fijo',
      valor_fijo: 100_000,
      prioridad: 100,
      estado: 'activo',
      tipo_recurrencia: 'recurrente',
      periodicidad: 'mensual',
      fecha_inicio_anio: 2032,
      fecha_inicio_mes: 1,
      alcance: 'todos',
    })
    if (errCon) throw new Error(`fixture concepto: ${errCon.message}`)

    // Simular + solicitar — mismo camino que flujo-dos-tiempos.test.ts: el
    // auxiliar simula y solicita, el punto de este test es la concurrencia
    // al aplicar, no el resto del flujo.
    const resultadoSim = await cAux.functions.invoke<{ liquidacion_id: string }>('simular-liquidacion', {
      body: { periodo_id: periodo.id },
    })
    if (resultadoSim.error) throw resultadoSim.error
    const liquidacionId = resultadoSim.data!.liquidacion_id

    const { error: errSolicitar } = await cAux
      .from('liquidaciones')
      .update({ estado: 'pendiente_aprobacion', nota_solicitud: 'concurrencia' })
      .eq('id', liquidacionId)
    if (errSolicitar) throw new Error(`fixture solicitar: ${errSolicitar.message}`)

    const [r1, r2] = await Promise.allSettled([
      cAdm.rpc('fn_aplicar_liquidacion', { p_liquidacion_id: liquidacionId }),
      cAdm.rpc('fn_aplicar_liquidacion', { p_liquidacion_id: liquidacionId }),
    ])
    const resultados = [r1, r2].map((r) => (r.status === 'fulfilled' ? r.value.error?.message : String(r.reason)))
    // Una gana, la otra falla con LIQUIDACION_NO_PENDIENTE — nunca las dos en silencio.
    expect(resultados.filter((m) => m === undefined)).toHaveLength(1)
    expect(resultados.some((m) => typeof m === 'string' && m.includes('LIQUIDACION_NO_PENDIENTE'))).toBe(true)

    const { data: cargos, error: errCargos } = await admin
      .from('cargos')
      .select('id')
      .eq('periodo_id', periodo.id)
      .eq('origen_tipo', 'liquidacion_linea')
    if (errCargos) throw new Error(`verificación cargos: ${errCargos.message}`)
    expect(cargos).toHaveLength(1) // 1 inmueble → 1 cargo, nunca 2.

    const { data: liquidacion, error: errLiq } = await admin
      .from('liquidaciones')
      .select('estado')
      .eq('id', liquidacionId)
      .single<{ estado: string }>()
    if (errLiq) throw new Error(`verificación liquidación: ${errLiq.message}`)
    expect(liquidacion.estado).toBe('aplicada')
  }, 60_000)
})
