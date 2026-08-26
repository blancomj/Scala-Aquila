/**
 * H2 (auditoría externa 2026-08-26, Docs/evaluacion/02) — prorrateo temporal
 * por inmueble contra la base real: un inmueble que se activa a mitad de
 * periodo paga menos que un mes completo, y los demás absorben la
 * diferencia (Σ=fuente exacta, ver executor.ts). La lógica pura ya está
 * cubierta por snapshot-supabase.test.ts/executor.test.ts — esto verifica
 * que la query real (`.or()` en snapshot-supabase.ts, que reemplazó el
 * `.eq('estado','activo')` de siempre) y el trigger fn_inmueble_estado_fechas
 * encajan de punta a punta.
 *
 * Mismo criterio que flujo-dos-tiempos.test.ts: tenant propio, admin.from()
 * para preparar datos fuera de RLS, cAux.functions.invoke() para el camino
 * real que usaría la app.
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
  console.warn('SALTADO tests/liquidacion/prorrateo-temporal: faltan variables de Supabase en .env')
}

const CUOTA = 300_000

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

d('Prorrateo temporal por inmueble (H2)', () => {
  const admin = clienteAdmin(env!)
  let auxiliar: UsuarioPrueba | undefined
  let tenant: TenantPrueba | undefined
  let cAux: Cliente
  let periodo: string
  let inmuebleProrrateado: string

  afterAll(async () => {
    if (tenant) await eliminarTenant(admin, tenant.id)
    if (auxiliar) await eliminarUsuario(admin, auxiliar.id)
  })

  it('setup: 3 unidades iguales, una se activa el día 15 de un mes de 31 días', async () => {
    auxiliar = await crearUsuario(admin, 'h2prorrateo')
    tenant = await crearTenant(admin, 'h2', auxiliar.id)
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    cAux = await clienteComo(env!, auxiliar)

    const tipoId = await tipoApartamentoId(admin)
    const { data: inmuebles, error: errInm } = await admin
      .from('inmuebles')
      .insert(
        Array.from({ length: 3 }, (_, i) => ({
          tenant_id: tenant.id,
          codigo: `H2-${String(i + 1).padStart(3, '0')}`,
          tipo_id: tipoId,
        })),
      )
      .select('id')
    if (errInm) throw new Error(`fixture inmuebles: ${errInm.message}`)

    // H2-002 (índice 1) es el que se activa a mitad de mes. Se crea 'activo'
    // por defecto (fn_inmueble_estado_fechas pone activo_desde=hoy en el
    // INSERT) — este UPDATE no toca `estado`, así que el trigger lo deja
    // pasar tal cual: fuerza la fecha simulada del escenario de test.
    inmuebleProrrateado = inmuebles[1]!.id
    const { error: errFecha } = await admin
      .from('inmuebles')
      .update({ activo_desde: '2031-03-15' })
      .eq('id', inmuebleProrrateado)
    if (errFecha) throw new Error(`fixture activo_desde: ${errFecha.message}`)

    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        vigente_desde: '2031-01-01',
        estado: 'borrador',
        suma_total: 1,
      })
      .select('id')
      .single<{ id: string }>()
    if (errSet) throw new Error(`fixture set: ${errSet.message}`)

    const { error: errCoef } = await admin.from('coeficientes').insert(
      inmuebles.map((i) => ({
        tenant_id: tenant.id,
        set_id: set.id,
        inmueble_id: i.id,
        valor: 0.333333,
      })),
    )
    if (errCoef) throw new Error(`fixture coeficientes: ${errCoef.message}`)
    await admin.from('coeficiente_sets').update({ estado: 'vigente' }).eq('id', set.id)

    const { error: errPol } = await admin.from('politicas_financieras').insert({
      tenant_id: tenant.id,
      version: 1,
      estado: 'vigente',
      vigente_desde: '2031-01-01',
      redondeo_modo: 'half_up',
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto',
      coeficientes_suma_esperada: 1,
      policy_hash: 'fixture-h2',
    })
    if (errPol) throw new Error(`fixture politica: ${errPol.message}`)

    // Marzo 2031: 31 días. Activo desde el 15 → 17 días (15..31) de 31.
    const { data: per, error: errPer } = await admin
      .from('periodos')
      .insert({ tenant_id: tenant.id, anio: 2031, mes: 3, fecha_vencimiento: '2031-03-10' })
      .select('id')
      .single<{ id: string }>()
    if (errPer) throw new Error(`fixture periodo: ${errPer.message}`)
    periodo = per.id

    const { error: errCon } = await admin.from('conceptos').insert({
      tenant_id: tenant.id,
      codigo: 'CUOTA_H2',
      nombre: 'Cuota de prueba prorrateo',
      modo_calculo: 'distribucion',
      modo_valor: 'fijo',
      valor_fijo: CUOTA,
      prioridad: 100,
      estado: 'activo',
      tipo_recurrencia: 'recurrente',
      periodicidad: 'mensual',
      fecha_inicio_anio: 2031,
      fecha_inicio_mes: 3,
      alcance: 'todos',
    })
    if (errCon) throw new Error(`fixture concepto: ${errCon.message}`)
  }, 60_000)

  it('simula: el inmueble prorrateado paga menos, los demás absorben la diferencia, Σ=fuente exacta', async () => {
    const { data, error } = await cAux.functions.invoke('simular-liquidacion', {
      body: { periodo_id: periodo },
    })
    if (error) throw error
    expect(data.estado).toBe('pre_liquidada')
    expect(Number(data.tenant_total)).toBe(CUOTA)

    // Un solo concepto en este fixture (CUOTA_H2) — no hace falta filtrar por él.
    const { data: lineas, error: errLineas } = await admin
      .from('liquidacion_lineas')
      .select('inmueble_id, monto')
      .eq('liquidacion_id', data.liquidacion_id)
    if (errLineas) throw errLineas

    const porInmueble = new Map(lineas.map((l) => [l.inmueble_id, l.monto]))
    const montoProrrateado = porInmueble.get(inmuebleProrrateado)!
    const montosNormales = [...porInmueble.entries()]
      .filter(([id]) => id !== inmuebleProrrateado)
      .map(([, m]) => m)

    const sinProrrateo = CUOTA / 3 // 100_000: lo que le tocaría con el mes completo.
    expect(montoProrrateado).toBeLessThan(sinProrrateo)
    for (const monto of montosNormales) {
      expect(monto).toBeGreaterThan(sinProrrateo)
    }
    const suma = montoProrrateado + montosNormales.reduce((a, b) => a + b, 0)
    expect(suma).toBe(CUOTA) // nada se pierde: se redistribuye.
  }, 60_000)
})
