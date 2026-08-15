/**
 * F5/F6: liquidar() + guardarLiquidacion() contra la base real —
 * OTROS_INGRESOS_ANUAL ya viene resuelto por construirSnapshotDesdeSupabase
 * desde fuente_financiacion (GAP-19, 20260815000000_seed_gc001_otros_ingresos.sql),
 * sin suplir nada a mano. Verifica la puerta F5→F6 (PLAN §5.4): el
 * resultado queda persistido y su `result_hash` es reproducible.
 *
 * Idempotente por diseño, no por limpieza: `liquidaciones`/
 * `liquidacion_lineas` son inmutables y RESTRICT bloquea su DELETE incluso
 * para service_role (20260814110100_liquidacion_lineas_fk_restrict.sql) —
 * el test no intenta borrar su fixture; si ya existe (de una corrida
 * anterior), reutiliza esa fila y verifica que recalcular reproduce el
 * mismo resultHash, en vez de reinsertar.
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
  console.warn('SALTADO tests/liquidacion/gc001-persistencia: faltan variables de Supabase en .env')
}

d('liquidar() + guardarLiquidacion() — puerta F5→F6 (PLAN §5.4)', () => {
  const admin = clienteAdmin(env!)

  it('persiste (o reutiliza) la liquidación de enero; el result_hash siempre reproduce', async () => {
    const { data: tenant } = await admin.from('tenants').select('id').eq('slug', 'gc-001').single()
    if (!tenant) throw new Error('falta el tenant gc-001')

    const snapshot = await construirSnapshotDesdeSupabase(admin, {
      tenantId: tenant.id,
      anio: 2026,
      mes: 1,
    })

    const calculado = liquidar(snapshot)
    expect(calculado.resultado.tenantTotal.amount.toString()).toBe('8333334')

    const { data: existente } = await admin
      .from('liquidaciones')
      .select('id, result_hash, tenant_total, estado')
      .eq('periodo_id', snapshot.periodo.id)
      .maybeSingle()

    const liquidacionId = existente
      ? existente.id
      : await guardarLiquidacion(admin, snapshot, calculado)

    const { data: fila, error } = await admin
      .from('liquidaciones')
      .select('result_hash, tenant_total, estado')
      .eq('id', liquidacionId)
      .single()
    expect(error).toBeNull()
    // Reproducibilidad (PLAN §5.4): lo persistido (esta corrida o una previa)
    // coincide exactamente con lo recién recalculado contra el mismo snapshot.
    expect(fila?.result_hash).toBe(calculado.resultHash)
    expect(Number(fila?.tenant_total)).toBe(8333334)
    expect(fila?.estado).toBe('completada')

    const { data: lineas, error: errorLineas } = await admin
      .from('liquidacion_lineas')
      .select('monto')
      .eq('liquidacion_id', liquidacionId)
    expect(errorLineas).toBeNull()
    expect(lineas).toHaveLength(6)
  })
})
