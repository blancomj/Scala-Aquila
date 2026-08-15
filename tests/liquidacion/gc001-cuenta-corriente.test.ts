/**
 * E3: guardarLiquidacion() también registra cargos de capital en el ledger
 * de cuenta corriente (AD-31/AD-33) — verifica que aparecen 1:1 con
 * liquidacion_lineas y que el resultHash de GC-001 no cambia (el ledger
 * nunca toca el motor de conceptos).
 *
 * Usa febrero-2026 (no enero, ya liquidado por gc001-persistencia.test.ts
 * antes de que este ledger existiera — reutilizar esa fila no ejercitaría
 * el registro de cargos). Idempotente por diseño, mismo criterio que
 * gc001-persistencia.test.ts: si ya corrió antes, reutiliza la fila.
 */
import {
  construirSnapshotDesdeSupabase,
  guardarLiquidacion,
  liquidar,
} from '@aquila/liquidation-engine'
import { describe, expect, it } from 'vitest'
import 'dotenv/config'
import { clienteAdmin, leerEntorno } from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn(
    'SALTADO tests/liquidacion/gc001-cuenta-corriente: faltan variables de Supabase en .env',
  )
}

d('guardarLiquidacion() registra cargos en el ledger de cuenta corriente (AD-31/AD-33)', () => {
  const admin = clienteAdmin(env!)

  it('cargos categoria=capital reconcilian 1:1 con liquidacion_lineas; resultHash estable', async () => {
    const { data: tenant } = await admin.from('tenants').select('id').eq('slug', 'gc-001').single()
    if (!tenant) throw new Error('falta el tenant gc-001')

    const snapshot = await construirSnapshotDesdeSupabase(admin, {
      tenantId: tenant.id,
      anio: 2026,
      mes: 2,
    })

    const calculado = liquidar(snapshot)

    const { data: existente } = await admin
      .from('liquidaciones')
      .select('id, result_hash')
      .eq('periodo_id', snapshot.periodo.id)
      .maybeSingle()

    const liquidacionId = existente
      ? existente.id
      : await guardarLiquidacion(admin, snapshot, calculado)

    const { data: fila, error } = await admin
      .from('liquidaciones')
      .select('result_hash')
      .eq('id', liquidacionId)
      .single()
    expect(error).toBeNull()
    // AD-31: el ledger de cuenta corriente no debe alterar el resultado del
    // motor de conceptos — mismo resultHash siempre que se recalcula.
    expect(fila?.result_hash).toBe(calculado.resultHash)

    const { data: lineas, error: errorLineas } = await admin
      .from('liquidacion_lineas')
      .select('id, monto')
      .eq('liquidacion_id', liquidacionId)
    expect(errorLineas).toBeNull()
    expect(lineas?.length).toBeGreaterThan(0)

    const { data: cargos, error: errorCargos } = await admin
      .from('cargos')
      .select('id, liquidacion_linea_id, categoria, origen_tipo, monto_original')
      .in(
        'liquidacion_linea_id',
        (lineas ?? []).map((l) => l.id),
      )
    expect(errorCargos).toBeNull()

    const lineasConMonto = (lineas ?? []).filter((l) => l.monto !== 0)
    expect(cargos).toHaveLength(lineasConMonto.length)
    for (const c of cargos ?? []) {
      expect(c.categoria).toBe('capital')
      expect(c.origen_tipo).toBe('liquidacion_linea')
    }

    // El saldo pendiente de cada cargo recién creado (sin pagos aún) es su monto_original.
    const { data: saldos, error: errorSaldos } = await admin
      .from('v_cargo_saldo')
      .select('monto_original, monto_pendiente')
      .in(
        'id',
        (cargos ?? []).map((c) => c.id),
      )
    expect(errorSaldos).toBeNull()
    for (const s of saldos ?? []) {
      expect(Number(s.monto_pendiente)).toBe(Number(s.monto_original))
    }
  }, 30_000)
})
