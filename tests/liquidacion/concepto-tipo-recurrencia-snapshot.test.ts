/**
 * Conceptos avanzados Fase 2 — construirSnapshotDesdeSupabase() filtra
 * conceptos por tipo_recurrencia + fechas (temporal.ts::conceptoAplicaEnPeriodo)
 * contra un tenant y periodos sembrados a propósito para este test — no
 * toca los conceptos reales de GC-001 (gc001-snapshot.test.ts).
 */
import { construirSnapshotDesdeSupabase } from '@aquila/liquidation-engine'
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
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
  console.warn(
    'SALTADO tests/liquidacion/concepto-tipo-recurrencia-snapshot: faltan variables de Supabase en .env',
  )
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

d('construirSnapshotDesdeSupabase — filtro temporal por tipo_recurrencia', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let tenant: TenantPrueba
  let periodoFeb: string
  let periodoAbr: string
  let periodoJul: string

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
  })

  it('setup: tenant con un concepto por_periodo (marzo-mayo 2027)', async () => {
    agente = await crearUsuario(admin, 'trs')
    tenant = await crearTenant(admin, 'trs', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')

    const tipoId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({
        tenant_id: tenant.id,
        codigo: `TRS-${String(Date.now())}`,
        tipo_id: tipoId,
      })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)

    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        vigente_desde: '2027-01-01',
        estado: 'borrador',
        suma_total: 1,
      })
      .select('id')
      .single<{ id: string }>()
    if (errSet) throw new Error(`fixture coeficiente_set: ${errSet.message}`)

    const { error: errCoef } = await admin
      .from('coeficientes')
      .insert({ tenant_id: tenant.id, set_id: set.id, inmueble_id: inmueble.id, valor: 1 })
    if (errCoef) throw new Error(`fixture coeficiente: ${errCoef.message}`)

    const { error: errSetVigente } = await admin
      .from('coeficiente_sets')
      .update({ estado: 'vigente' })
      .eq('id', set.id)
    if (errSetVigente) throw new Error(`fixture coeficiente_set vigente: ${errSetVigente.message}`)

    const { error: errPolitica } = await admin.from('politicas_financieras').insert({
      tenant_id: tenant.id,
      version: 1,
      estado: 'vigente',
      vigente_desde: '2027-01-01',
      redondeo_modo: 'half_up',
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto',
      coeficientes_suma_esperada: 1,
      policy_hash: 'test-fixture-hash',
    })
    if (errPolitica) throw new Error(`fixture politica: ${errPolitica.message}`)

    const { data: periodos, error: errPeriodos } = await admin
      .from('periodos')
      .insert([
        { tenant_id: tenant.id, anio: 2027, mes: 2, estado: 'abierto' },
        { tenant_id: tenant.id, anio: 2027, mes: 4, estado: 'abierto' },
        { tenant_id: tenant.id, anio: 2027, mes: 7, estado: 'abierto' },
      ])
      .select('id, mes')
    if (errPeriodos) throw new Error(`fixture periodos: ${errPeriodos.message}`)
    periodoFeb = periodos.find((p) => p.mes === 2)!.id
    periodoAbr = periodos.find((p) => p.mes === 4)!.id
    periodoJul = periodos.find((p) => p.mes === 7)!.id

    const { error: errConcepto } = await admin.from('conceptos').insert({
      tenant_id: tenant.id,
      codigo: 'CUOTA_POR_PERIODO',
      nombre: 'Cuota por un periodo',
      modo_calculo: 'directo',
      modo_valor: 'fijo',
      valor_fijo: 10000,
      prioridad: 100,
      estado: 'activo',
      tipo_recurrencia: 'por_periodo',
      fecha_inicio_anio: 2027,
      fecha_inicio_mes: 3,
      fecha_fin_anio: 2027,
      fecha_fin_mes: 5,
      alcance: 'todos',
    })
    if (errConcepto) throw new Error(`fixture concepto: ${errConcepto.message}`)
  }, 30_000)

  it('febrero (antes del rango): el concepto no aparece en el snapshot', async () => {
    const snapshot = await construirSnapshotDesdeSupabase(admin, {
      tenantId: tenant.id,
      anio: 2027,
      mes: 2,
    })
    expect(snapshot.periodo.id).toBe(periodoFeb)
    expect(snapshot.conceptos.map((c) => c.codigo)).toEqual([])
  })

  it('abril (dentro del rango marzo-mayo): el concepto sí aparece', async () => {
    const snapshot = await construirSnapshotDesdeSupabase(admin, {
      tenantId: tenant.id,
      anio: 2027,
      mes: 4,
    })
    expect(snapshot.periodo.id).toBe(periodoAbr)
    expect(snapshot.conceptos.map((c) => c.codigo)).toEqual(['CUOTA_POR_PERIODO'])
  })

  it('julio (después del rango): el concepto vuelve a no aparecer', async () => {
    const snapshot = await construirSnapshotDesdeSupabase(admin, {
      tenantId: tenant.id,
      anio: 2027,
      mes: 7,
    })
    expect(snapshot.periodo.id).toBe(periodoJul)
    expect(snapshot.conceptos.map((c) => c.codigo)).toEqual([])
  })
})
