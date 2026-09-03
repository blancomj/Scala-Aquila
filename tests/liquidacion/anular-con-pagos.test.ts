/**
 * Hueco de test #3 (auditoría externa 2026-08-26, Docs/evaluacion/02 §7) —
 * "el camino post-pago (ajuste) no tiene test ni flujo". El flujo guiado de
 * ajuste post-pago queda diferido a propósito (feature nueva, decisión de
 * producto pendiente) — lo que este test cubre es el comportamiento que SÍ
 * existe hoy y no tenía ningún test: fn_anular_liquidacion rechaza con
 * LIQUIDACION_CON_PAGOS si el periodo ya tiene algún pago imputado
 * (supabase/migrations/20260830630000_liquidacion_anular.sql:176-185).
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
  console.warn('SALTADO tests/liquidacion/anular-con-pagos: faltan variables de Supabase en .env')
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

d('fn_anular_liquidacion rechaza si hay pagos imputados (hueco de test #3)', () => {
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

  it('LIQUIDACION_CON_PAGOS: una liquidación con un pago imputado no se puede anular', async () => {
    auxiliar = await crearUsuario(admin, 'anul-pago-aux')
    administrador = await crearUsuario(admin, 'anul-pago-adm')
    tenant = await crearTenant(admin, 'anul-pago', auxiliar.id)
    const tenantId = tenant.id
    await crearMembership(admin, tenantId, auxiliar.id, 'auxiliar')
    await crearMembership(admin, tenantId, administrador.id, 'administrador')
    cAux = await clienteComo(env!, auxiliar)
    cAdm = await clienteComo(env!, administrador)

    const tipoId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantId, codigo: `AP-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)

    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .insert({
        tenant_id: tenantId,
        version: 1,
        vigente_desde: '2035-01-01',
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
      vigente_desde: '2035-01-01',
      redondeo_modo: 'half_up',
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto',
      coeficientes_suma_esperada: 1,
      policy_hash: 'fixture-anul-pago',
    })
    if (errPol) throw new Error(`fixture politica: ${errPol.message}`)

    const { data: periodo, error: errPer } = await admin
      .from('periodos')
      .insert({ tenant_id: tenantId, anio: 2035, mes: 1, fecha_vencimiento: '2035-01-10' })
      .select('id')
      .single<{ id: string }>()
    if (errPer) throw new Error(`fixture periodo: ${errPer.message}`)

    const { error: errCon } = await admin.from('conceptos').insert({
      tenant_id: tenantId,
      codigo: 'CUOTA_AP',
      nombre: 'Cuota de prueba anular con pagos',
      modo_calculo: 'distribucion',
      modo_valor: 'fijo',
      valor_fijo: 100_000,
      prioridad: 100,
      estado: 'activo',
      tipo_recurrencia: 'recurrente',
      periodicidad: 'mensual',
      fecha_inicio_anio: 2035,
      fecha_inicio_mes: 1,
      alcance: 'todos',
    })
    if (errCon) throw new Error(`fixture concepto: ${errCon.message}`)

    const { data: sim, error: errSim } = await cAux.functions.invoke('simular-liquidacion', {
      body: { periodo_id: periodo.id },
    })
    if (errSim) throw errSim
    const liquidacionId = (sim as { liquidacion_id: string }).liquidacion_id

    const { error: errSolicitar } = await cAux
      .from('liquidaciones')
      .update({ estado: 'pendiente_aprobacion', nota_solicitud: 'anular-con-pagos' })
      .eq('id', liquidacionId)
    if (errSolicitar) throw new Error(`fixture solicitar: ${errSolicitar.message}`)

    const { error: errAplicar } = await cAdm.rpc('fn_aplicar_liquidacion', {
      p_liquidacion_id: liquidacionId,
    })
    if (errAplicar) throw errAplicar

    // Sin pagos todavía — anular debería funcionar (lo confirma
    // flujo-dos-tiempos.test.ts). Registramos un pago primero para
    // ejercitar el caso que SÍ falta cubrir.
    const { response: respuestaPago } = await cAux.functions.invoke('registrar-pago', {
      // `forma_pago` es obligatorio desde 20260903100000 (medio de recaudo) y
      // va como CÓDIGO, no como id. `fecha_registro` acompaña a fecha_pago
      // porque el guard rechaza registrar el futuro y esta prueba vive en una
      // línea temporal de 2035 (coeficientes, periodo y vencimiento incluidos).
      body: {
        inmueble_id: inmueble.id,
        monto: 50_000,
        fecha_pago: '2035-01-05',
        fecha_registro: '2035-01-05',
        forma_pago: 'efectivo',
      },
    })
    expect(respuestaPago?.status).toBe(200)

    const { error: errAnular } = await cAdm.rpc('fn_anular_liquidacion', {
      p_liquidacion_id: liquidacionId,
      p_motivo: 'intento de anular con pago ya imputado',
    })
    expect(errAnular?.message).toMatch(/LIQUIDACION_CON_PAGOS/)

    // Confirma que el rechazo no dejó nada a medias: la liquidación sigue
    // aplicada, el periodo sigue cerrado.
    const { data: liq, error: errLeerLiq } = await admin
      .from('liquidaciones')
      .select('estado')
      .eq('id', liquidacionId)
      .single<{ estado: string }>()
    if (errLeerLiq) throw new Error(`verificación liquidación: ${errLeerLiq.message}`)
    expect(liq.estado).toBe('aplicada')

    const { data: per, error: errLeerPer } = await admin
      .from('periodos')
      .select('estado')
      .eq('id', periodo.id)
      .single<{ estado: string }>()
    if (errLeerPer) throw new Error(`verificación periodo: ${errLeerPer.message}`)
    expect(per.estado).toBe('cerrado')
  }, 60_000)
})
