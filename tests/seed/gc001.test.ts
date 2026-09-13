/**
 * F2 → F3 (PLAN §5.4): "GC-001 persistido y consultable".
 * Verifica que el seed de 20260814100400_seed_gc001.sql cargó los datos de
 * entrada de paso0/INFORME_PASO_0.md §3.1 correctamente en el proyecto
 * remoto — no recalcula nada, solo confirma que están donde F5 los espera.
 */
import { describe, expect, it } from 'vitest'
import 'dotenv/config'
import { clienteAdmin, leerEntorno } from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/seed/gc001: faltan variables de Supabase en .env')
}

d('GC-001 — datos de entrada persistidos (paso0/INFORME_PASO_0.md §3.1)', () => {
  const admin = clienteAdmin(env!)

  it('el tenant gc-001 existe con moneda COP', async () => {
    const { data, error } = await admin
      .from('tenants')
      .select('id, name, moneda')
      .eq('slug', 'gc-001')
      .single()
    expect(error).toBeNull()
    expect(data?.moneda).toBe('COP')
  })

  // D-89: gc-001 dejó de ser un fixture congelado — se usa como tenant demo "vivo" que varios
  // cortes siguen alimentando (66 inmuebles hoy, no los 6 originales de paso0; presupuesto
  // vigente reemplazado por otro corte). Esta prueba ya no verifica el dato original de
  // paso0/INFORME_PASO_0.md §3.1 en sí, solo que gc-001 sigue teniendo un presupuesto vigente
  // consistente — el monto exacto es el que dejó el último corte que lo tocó, no un invariante
  // de este test.
  it('el presupuesto 2026 vigente existe (monto actual, no el original de paso0 — ver D-89)', async () => {
    const { data: tenant } = await admin.from('tenants').select('id').eq('slug', 'gc-001').single()
    const { data, error } = await admin
      .from('presupuestos')
      .select('monto_total, estado')
      .eq('tenant_id', tenant?.id ?? '')
      .eq('anio', 2026)
      .eq('estado', 'vigente')
      .single()
    expect(error).toBeNull()
    expect(Number(data?.monto_total)).toBe(1000000)
  })

  it('los 66 inmuebles actuales y sus coeficientes suman exactamente 1.0 (D-89: ya no son los 6 de paso0)', async () => {
    const { data: tenant } = await admin.from('tenants').select('id').eq('slug', 'gc-001').single()
    const { data: inmuebles, error: errInm } = await admin
      .from('inmuebles')
      .select('id, codigo')
      .eq('tenant_id', tenant?.id ?? '')
    expect(errInm).toBeNull()
    expect(inmuebles).toHaveLength(66)

    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .select('id, suma_total')
      .eq('tenant_id', tenant?.id ?? '')
      .eq('estado', 'vigente')
      .single()
    expect(errSet).toBeNull()
    expect(Number(set?.suma_total)).toBe(1)

    const { data: coeficientes, error: errCoef } = await admin
      .from('coeficientes')
      .select('valor')
      .eq('set_id', set?.id ?? '')
    expect(errCoef).toBeNull()
    const suma = (coeficientes ?? []).reduce((acc, c) => acc + c.valor, 0)
    expect(suma).toBeCloseTo(1, 10)
  })

  it('los 12 periodos de 2026 existen, todos abiertos', async () => {
    const { data: tenant } = await admin.from('tenants').select('id').eq('slug', 'gc-001').single()
    const { data, error } = await admin
      .from('periodos')
      .select('mes, estado')
      .eq('tenant_id', tenant?.id ?? '')
      .eq('anio', 2026)
    expect(error).toBeNull()
    expect(data).toHaveLength(12)
    expect(data?.every((p) => p.estado === 'abierto')).toBe(true)
  })

  // D-89: CUOTA_ADMIN quedó `archivado` por otro corte posterior a paso0 — la fórmula (PLAN
  // §4.3.2) y el modo de cálculo siguen intactos, solo cambió su estado de ciclo de vida.
  it('el concepto CUOTA_ADMIN existe en modo distribución (PLAN §4.3.2; archivado por otro corte, D-89)', async () => {
    const { data: tenant } = await admin.from('tenants').select('id').eq('slug', 'gc-001').single()
    const { data, error } = await admin
      .from('conceptos')
      .select('modo_calculo, formula_ael, estado')
      .eq('tenant_id', tenant?.id ?? '')
      .eq('codigo', 'CUOTA_ADMIN')
      .single()
    expect(error).toBeNull()
    expect(data?.modo_calculo).toBe('distribucion')
    expect(data?.estado).toBe('archivado')
    expect(data?.formula_ael).toContain('PARAMETER.PRESUPUESTO_ANUAL')
  })
})
