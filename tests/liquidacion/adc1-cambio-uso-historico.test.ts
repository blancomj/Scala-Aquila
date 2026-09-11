/**
 * ADC-01-ADD (§18, PROMPT_01_ADAPTACION_COMERCIAL_CORE — §36 Caso 6 "cambio
 * de uso histórico") — un cambio físico de un inmueble (uso_predio_id) NO
 * debe alterar retroactivamente una liquidación de un periodo anterior al
 * cambio: `inmueble_atributo_historico` (fn_inmueble_atributo_historico_sincronizar,
 * migración 20260932910000) debe resolver, para ese periodo, el uso vigente
 * EN ESE MOMENTO, no el actual.
 *
 * Va contra simular-liquidacion (Edge Function real), igual que
 * adc1-avisos-alcance.test.ts — el snapshot builder (construirSnapshotDesdeSupabase)
 * solo vive ahí, no en la RPC directa.
 *
 * Tenant propio: cambia el uso de un inmueble en vivo, no debe convivir con
 * fixtures de otros tests en el mismo periodo/tenant.
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
  console.warn('SALTADO tests/liquidacion/adc1-cambio-uso-historico: faltan variables de Supabase en .env')
}

interface RespuestaSimular {
  liquidacion_id: string
  avisos_alcance: { codigo: string; titulo: string; detalle: string }[]
}

async function idListaTipos(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

d('ADC-01-ADD (§18/§36 Caso 6): cambio de uso histórico — no retroactivo', () => {
  const admin = clienteAdmin(env!)
  let administrador: UsuarioPrueba | undefined
  let cAdm: Cliente
  let tenant: TenantPrueba | undefined
  let inmuebleId: string
  let periodoPasadoId: string

  afterAll(async () => {
    if (tenant) await eliminarTenant(admin, tenant.id)
    if (administrador) await eliminarUsuario(admin, administrador.id)
  })

  it('setup: inmueble residencial cuyo histórico se retrotrae a 2025-01-01, concepto segmentado por uso_predio=residencial', async () => {
    administrador = await crearUsuario(admin, 'adc1cuh')
    tenant = await crearTenant(admin, 'adc1cuh', administrador.id)
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    cAdm = await clienteComo(env!, administrador)

    const tipoApartamentoId = await idListaTipos(admin, 'TIPO_INMUEBLE', 'apartamento')
    const usoResidencialId = await idListaTipos(admin, 'USO_PREDIO', 'residencial')

    const { data: inmueble, error: errInm } = await admin
      .from('inmuebles')
      .insert({
        tenant_id: tenant.id,
        codigo: 'CUH-1',
        tipo_id: tipoApartamentoId,
        uso_predio_id: usoResidencialId,
      })
      .select('id')
      .single<{ id: string }>()
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)
    inmuebleId = inmueble.id

    // El trigger AFTER INSERT ya sembró una fila histórica con vigente_desde=hoy.
    // La retrotraemos a 2025-01-01 para simular "residencial desde antes" —
    // manipulación de fixture vía service_role (bypassa RLS), no una vía que
    // un cliente autenticado normal tenga disponible.
    const { data: historico, error: errHist } = await admin
      .from('inmueble_atributo_historico')
      .select('id')
      .eq('inmueble_id', inmuebleId)
      .is('vigente_hasta', null)
      .single<{ id: string }>()
    if (errHist) throw new Error(`fixture historico (lectura): ${errHist.message}`)
    const { error: errBackdate } = await admin
      .from('inmueble_atributo_historico')
      .update({ vigente_desde: '2025-01-01' })
      .eq('id', historico.id)
    if (errBackdate) throw new Error(`fixture historico (backdate): ${errBackdate.message}`)

    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .insert({ tenant_id: tenant.id, version: 1, vigente_desde: '2025-01-01', estado: 'borrador', suma_total: 1 })
      .select('id')
      .single<{ id: string }>()
    if (errSet) throw new Error(`fixture set: ${errSet.message}`)
    const { error: errCoef } = await admin
      .from('coeficientes')
      .insert({ tenant_id: tenant.id, set_id: set.id, inmueble_id: inmuebleId, valor: 1 })
    if (errCoef) throw new Error(`fixture coeficientes: ${errCoef.message}`)
    await admin.from('coeficiente_sets').update({ estado: 'vigente' }).eq('id', set.id)

    const { error: errPol } = await admin.from('politicas_financieras').insert({
      tenant_id: tenant.id,
      version: 1,
      estado: 'vigente',
      vigente_desde: '2025-01-01',
      redondeo_modo: 'half_up',
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto',
      coeficientes_suma_esperada: 1,
      policy_hash: 'fixture-adc1cuh',
    })
    if (errPol) throw new Error(`fixture politica: ${errPol.message}`)

    const { data: per, error: errPer } = await admin
      .from('periodos')
      .insert({ tenant_id: tenant.id, anio: 2025, mes: 6, fecha_vencimiento: '2025-06-10' })
      .select('id')
      .single<{ id: string }>()
    if (errPer) throw new Error(`fixture periodo pasado: ${errPer.message}`)
    periodoPasadoId = per.id

    const { error: errCon } = await admin.from('conceptos').insert({
      tenant_id: tenant.id,
      codigo: 'ADMIN_RESIDENCIAL_CUH',
      nombre: 'Administración residencial (CUH test)',
      modo_calculo: 'directo',
      modo_valor: 'fijo',
      valor_fijo: 50_000,
      prioridad: 100,
      estado: 'activo',
      tipo_recurrencia: 'recurrente',
      periodicidad: 'mensual',
      fecha_inicio_anio: 2025,
      fecha_inicio_mes: 1,
      alcance: 'calculado',
      alcance_condiciones: { campo: 'uso_predio', operador: 'eq', valor: 'residencial' },
    })
    if (errCon) throw new Error(`fixture concepto: ${errCon.message}`)
  }, 60_000)

  it('antes del cambio: el periodo pasado (2025-06) sí incluye el inmueble (era residencial)', async () => {
    const { data, error } = await cAdm.functions.invoke<RespuestaSimular>('simular-liquidacion', {
      body: { periodo_id: periodoPasadoId },
    })
    if (error) throw error

    expect(data!.avisos_alcance).toHaveLength(0)

    const { data: lineas } = await admin
      .from('liquidacion_lineas')
      .select('inmueble_id, monto')
      .eq('liquidacion_id', data!.liquidacion_id)
    expect(lineas).toHaveLength(1)
    expect(lineas![0]!.inmueble_id).toBe(inmuebleId)
    expect(Number(lineas![0]!.monto)).toBe(50_000)
  }, 30_000)

  it('cambio físico HOY: el inmueble pasa a comercial (cierra la fila histórica vieja, abre una nueva)', async () => {
    const usoComercialId = await idListaTipos(admin, 'USO_PREDIO', 'comercial')
    const { error } = await admin
      .from('inmuebles')
      .update({ uso_predio_id: usoComercialId })
      .eq('id', inmuebleId)
    if (error) throw new Error(`cambio de uso: ${error.message}`)

    const { data: historicos, error: errHist } = await admin
      .from('inmueble_atributo_historico')
      .select('uso_predio_id, vigente_desde, vigente_hasta')
      .eq('inmueble_id', inmuebleId)
      .order('vigente_desde', { ascending: true })
    if (errHist) throw new Error(`lectura historico post-cambio: ${errHist.message}`)

    // Debe haber DOS filas: la vieja (residencial, ahora cerrada) y la nueva
    // (comercial, abierta) — el cambio no reescribe la fila vieja en el sitio.
    expect(historicos).toHaveLength(2)
    expect(historicos![0]!.vigente_desde).toBe('2025-01-01')
    expect(historicos![0]!.vigente_hasta).not.toBeNull()
    expect(historicos![1]!.vigente_hasta).toBeNull()
  })

  it('después del cambio: re-simular el MISMO periodo pasado (2025-06) da el mismo resultado — no retroactivo', async () => {
    const { data, error } = await cAdm.functions.invoke<RespuestaSimular>('simular-liquidacion', {
      body: { periodo_id: periodoPasadoId },
    })
    if (error) throw error

    expect(data!.avisos_alcance).toHaveLength(0)

    const { data: lineas } = await admin
      .from('liquidacion_lineas')
      .select('inmueble_id, monto')
      .eq('liquidacion_id', data!.liquidacion_id)
    expect(lineas).toHaveLength(1)
    expect(lineas![0]!.inmueble_id).toBe(inmuebleId)
    expect(Number(lineas![0]!.monto)).toBe(50_000)
  }, 30_000)

  it('un periodo del mes SIGUIENTE sí ve el uso nuevo: el inmueble queda fuera del alcance residencial', async () => {
    // fechaReferencia = primer día del mes del periodo (snapshot-supabase.ts).
    // El cambio de uso ocurrió HOY: un periodo del mes actual todavía resuelve
    // "residencial" (su fechaReferencia, día 1, es anterior al cambio) — el
    // primer periodo que ve "comercial" es el del mes siguiente, cuyo día 1
    // ya es posterior a la fila nueva (vigente_desde=hoy). Este es el
    // contraste que prueba que la resolución sí es sensible al tiempo, no
    // que "siempre" devuelva el histórico.
    const siguiente = new Date()
    siguiente.setUTCMonth(siguiente.getUTCMonth() + 1)
    const anio = siguiente.getUTCFullYear()
    const mes = siguiente.getUTCMonth() + 1
    const { data: per, error: errPer } = await admin
      .from('periodos')
      .insert({
        tenant_id: tenant!.id,
        anio,
        mes,
        fecha_vencimiento: `${String(anio)}-${String(mes).padStart(2, '0')}-28`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPer) throw new Error(`fixture periodo siguiente: ${errPer.message}`)

    const { data, error } = await cAdm.functions.invoke<RespuestaSimular>('simular-liquidacion', {
      body: { periodo_id: per.id },
    })
    if (error) throw error

    const { data: lineas } = await admin
      .from('liquidacion_lineas')
      .select('inmueble_id')
      .eq('liquidacion_id', data!.liquidacion_id)
    expect(lineas).toEqual([])
  }, 30_000)
})
