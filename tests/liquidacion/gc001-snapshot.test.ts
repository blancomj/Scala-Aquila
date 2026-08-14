/**
 * F5: construye un DataSnapshot real desde el proyecto Supabase (los datos
 * que sembró 20260814100400_seed_gc001.sql) y confirma que el gap conocido
 * de OTROS_INGRESOS_ANUAL se reporta explícito — nunca en silencio
 * (17 §37 SNAPSHOT INCOMPLETE, 0AEL §20).
 */
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

  it('liquidar() falla con un error explícito: falta OTROS_INGRESOS_ANUAL (gap conocido de F2)', async () => {
    const { data: tenant } = await admin.from('tenants').select('id').eq('slug', 'gc-001').single()
    if (!tenant) throw new Error('falta el tenant gc-001')

    const snapshot = await construirSnapshotDesdeSupabase(admin, {
      tenantId: tenant.id,
      anio: 2026,
      mes: 1,
    })

    // El evaluador debe reportar el Contract faltante — no asumir 0 en silencio.
    expect(() => liquidar(snapshot)).toThrow(/OTROS_INGRESOS_ANUAL/)
  })
})
