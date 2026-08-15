/**
 * F5/F6: construye un DataSnapshot real desde el proyecto Supabase (los
 * datos que sembró 20260814100400_seed_gc001.sql, más
 * 20260815000000_seed_gc001_otros_ingresos.sql para el GAP-19) y confirma
 * que liquidar() ya resuelve PARAMETER.OTROS_INGRESOS_ANUAL desde
 * fuente_financiacion — el gap está cerrado, ya no lanza
 * ContractoNoResueltoError (17 §37 SNAPSHOT INCOMPLETE, 0AEL §20).
 */
import { money } from '@aquila/financial-kernel'
import { construirSnapshotDesdeSupabase, liquidar } from '@aquila/liquidation-engine'
import { describe, expect, it } from 'vitest'
import 'dotenv/config'
import { clienteAdmin, leerEntorno } from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/liquidacion/gc001-snapshot: faltan variables de Supabase en .env')
}

d('DataSnapshot real desde Supabase (seed de GC-001)', () => {
  const admin = clienteAdmin(env!)

  it('construye el snapshot de enero-2026 con los datos sembrados', async () => {
    const { data: tenant, error } = await admin
      .from('tenants')
      .select('id')
      .eq('slug', 'gc-001')
      .single()
    expect(error).toBeNull()
    if (!tenant) throw new Error('falta el tenant gc-001 — corre pnpm db:push primero')

    const snapshot = await construirSnapshotDesdeSupabase(admin, {
      tenantId: tenant.id,
      anio: 2026,
      mes: 1,
    })

    expect(snapshot.moneda).toBe('COP')
    expect(snapshot.inmuebles).toHaveLength(6)
    expect(snapshot.periodosDelAnio).toHaveLength(12)
    expect(snapshot.periodo.mes).toBe(1)
    expect(snapshot.conceptos.map((c) => c.codigo)).toEqual(['CUOTA_ADMIN'])
    expect(snapshot.politica.redondeoModo).toBe('HALF_UP')
    expect(snapshot.politica.redondeoEscala).toBe(0)

    const presupuestoAnual = snapshot.parametros.PRESUPUESTO_ANUAL
    if (presupuestoAnual?.tipo !== 'MONEY') throw new Error('se esperaba MONEY')
    expect(presupuestoAnual.valor.amount.toString()).toBe('120000000')
  })

  it('OTROS_INGRESOS_ANUAL viene de fuente_financiacion; liquidar() reproduce el golden case (GAP-19)', async () => {
    const { data: tenant } = await admin.from('tenants').select('id').eq('slug', 'gc-001').single()
    if (!tenant) throw new Error('falta el tenant gc-001')

    const snapshot = await construirSnapshotDesdeSupabase(admin, {
      tenantId: tenant.id,
      anio: 2026,
      mes: 1,
    })

    const otrosIngresos = snapshot.parametros.OTROS_INGRESOS_ANUAL
    if (otrosIngresos?.tipo !== 'MONEY') throw new Error('se esperaba MONEY')
    expect(otrosIngresos.valor.amount.toString()).toBe(money(20_000_000, 'COP').amount.toString())

    // paso0/INFORME_PASO_0.md §3.1-3.2: 120M - 20M = 100M a recuperar, enero
    // recibe 8.333.334 (uno de los 4 primeros meses con el residual).
    const { resultado } = liquidar(snapshot)
    expect(resultado.tenantTotal.amount.toString()).toBe('8333334')
  })
})
