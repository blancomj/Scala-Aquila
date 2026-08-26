/**
 * Hueco de test #5 (auditoría externa 2026-08-26, Docs/evaluacion/02 §7) —
 * contable_movimientos()/contable_cuadre() (20260830500000) no tenían
 * ninguna cobertura automatizada: ni unitaria, ni de integración, ni e2e de
 * la página que las consume (apps/web/app/pages/contabilidad/movimientos.vue).
 *
 * Dos casos:
 * 1. gc-001 (solo LECTURA — nunca se modifica, es el tenant de referencia
 *    que otros tests dependen tener intacto): ya tiene contable_cuenta_default
 *    poblado (19 mapeos, verificado antes de escribir este test) y 14 cargos
 *    reales en 2026 — caso "feliz" con cuentas parametrizadas.
 * 2. Tenant propio sin ninguna parametrización contable: un cargo de capital
 *    cuyo concepto no tiene presupuesto_cuenta_id — el diseño documentado
 *    dice que la línea debe salir con cuenta_codigo NULL en vez de omitirse,
 *    sin romper el cuadre. Verificado empíricamente, no asumido.
 *
 * El cuadre es estructural (SUM(debito)=SUM(credito) por construcción, ver
 * cabecera de la migración) — lo que este test confirma es que la función
 * SÍ corre sin errores contra datos reales en ambos escenarios, y que
 * contable_cuadre() efectivamente reporta diferencia=0 en la práctica, no
 * solo en el diseño en papel.
 */
import { describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  type Cliente,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/contabilidad/contable-movimientos: faltan variables de Supabase en .env')
}

interface FilaCuadre {
  lineas: number
  total_debito: string
  total_credito: string
  diferencia: string
  sin_cuenta: number
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

d('contable_movimientos / contable_cuadre', () => {
  const admin = clienteAdmin(env!)

  it('gc-001 (cuentas parametrizadas): el cuadre da diferencia=0 sobre datos reales', async () => {
    const { data: tenant, error: errTenant } = await admin
      .from('tenants')
      .select('id')
      .eq('slug', 'gc-001')
      .single<{ id: string }>()
    if (errTenant) throw new Error(`gc-001 no encontrado: ${errTenant.message}`)

    const { data, error } = await admin
      .rpc('contable_cuadre', {
        p_tenant_id: tenant.id,
        p_desde: '2026-01-01',
        p_hasta: '2026-12-31',
      })
      .single<FilaCuadre>()
    if (error) throw error

    expect(data.lineas).toBeGreaterThan(0)
    expect(Number(data.diferencia)).toBe(0)
    expect(Number(data.total_debito)).toBe(Number(data.total_credito))
  }, 30_000)

  it('tenant sin parametrización contable: la línea sale con cuenta_codigo NULL, sin romper el cuadre', async () => {
    const usuario = await crearUsuario(admin, 'contable-mov')
    const tenant = await crearTenant(admin, 'contable-mov', usuario.id)
    try {
      const tipoId = await tipoApartamentoId(admin)
      const { data: inmueble, error: errInm } = await admin
        .from('inmuebles')
        .insert({ tenant_id: tenant.id, codigo: `CM-${String(Date.now())}`, tipo_id: tipoId })
        .select('id')
        .single<{ id: string }>()
      if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)

      const { data: periodo, error: errPer } = await admin
        .from('periodos')
        .insert({ tenant_id: tenant.id, anio: 2033, mes: 1, fecha_vencimiento: '2033-01-10' })
        .select('id')
        .single<{ id: string }>()
      if (errPer) throw new Error(`fixture periodo: ${errPer.message}`)

      // Concepto SIN presupuesto_cuenta_id — a propósito, es el caso que
      // deja cuenta_credito sin resolver. El tenant tampoco tiene ninguna
      // fila en contable_cuenta_default, así que cuenta_debito tampoco
      // resuelve: ambos lados de la línea salen NULL.
      const { data: concepto, error: errConcepto } = await admin
        .from('conceptos')
        .insert({
          tenant_id: tenant.id,
          codigo: 'CM-SIN-MAPEO',
          nombre: 'Concepto sin parametrizar',
          modo_calculo: 'distribucion',
          modo_valor: 'fijo',
          valor_fijo: 50_000,
          prioridad: 100,
          estado: 'activo',
          tipo_recurrencia: 'recurrente',
          periodicidad: 'mensual',
          fecha_inicio_anio: 2033,
          fecha_inicio_mes: 1,
          alcance: 'todos',
        })
        .select('id')
        .single<{ id: string }>()
      if (errConcepto) throw new Error(`fixture concepto: ${errConcepto.message}`)

      const { data: liquidacion, error: errLiq } = await admin
        .from('liquidaciones')
        .insert({
          tenant_id: tenant.id,
          periodo_id: periodo.id,
          result_hash: `test-fixture-cm-${String(Date.now())}`,
          tenant_total: 50_000,
        })
        .select('id')
        .single<{ id: string }>()
      if (errLiq) throw new Error(`fixture liquidacion: ${errLiq.message}`)

      const { data: linea, error: errLinea } = await admin
        .from('liquidacion_lineas')
        .insert({
          tenant_id: tenant.id,
          liquidacion_id: liquidacion.id,
          inmueble_id: inmueble.id,
          concepto_id: concepto.id,
          monto: 50_000,
        })
        .select('id')
        .single<{ id: string }>()
      if (errLinea) throw new Error(`fixture liquidacion_linea: ${errLinea.message}`)

      const { error: errCargo } = await admin.from('cargos').insert({
        tenant_id: tenant.id,
        inmueble_id: inmueble.id,
        periodo_id: periodo.id,
        categoria: 'capital',
        origen_tipo: 'liquidacion_linea',
        liquidacion_linea_id: linea.id,
        concepto_id: concepto.id,
        monto_original: 50_000,
      })
      if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)

      const { data, error } = await admin
        .rpc('contable_cuadre', { p_tenant_id: tenant.id, p_desde: '2033-01-01', p_hasta: '2033-01-31' })
        .single<FilaCuadre>()
      if (error) throw error

      expect(data.lineas).toBeGreaterThan(0)
      expect(Number(data.diferencia)).toBe(0) // el cuadre sobrevive aunque la cuenta no resuelva.
      expect(data.sin_cuenta).toBeGreaterThan(0) // confirma que SÍ detecta la falta de parametrización.

      const { data: movimientos, error: errMov } = await admin.rpc('contable_movimientos', {
        p_tenant_id: tenant.id,
        p_desde: '2033-01-01',
        p_hasta: '2033-01-31',
      })
      if (errMov) throw errMov
      expect(movimientos.length).toBeGreaterThan(0)
      expect(movimientos.some((m: { cuenta_codigo: string | null }) => m.cuenta_codigo === null)).toBe(true)
    } finally {
      await eliminarTenant(admin, tenant.id)
      await eliminarUsuario(admin, usuario.id)
    }
  }, 30_000)
})
