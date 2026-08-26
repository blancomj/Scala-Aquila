/**
 * construirSnapshotDesdeSupabase() — GAP-19 (OTROS_INGRESOS_ANUAL neteado
 * desde fuente_financiacion) y 17 §37 SNAPSHOT INCOMPLETE (AREA_COMUN
 * ausente, no inventada, cuando no se diligenció).
 *
 * Antes este archivo se llamaba gc001-snapshot.test.ts y afirmaba valores
 * dorados contra el tenant real gc-001 (6 inmuebles, un único concepto
 * CUOTA_ADMIN activo, tenantTotal='8333334'). gc-001 dejó de ser un fixture
 * congelado hace tiempo — hoy tiene 66 inmuebles y una decena de conceptos en
 * distintos estados de prueba manual desde la UI, así que esas aserciones
 * llevaban meses rotas sin que nadie lo causara con código: cualquiera que
 * usara gc-001 como copropiedad de demostración iba a volver a romperlas.
 * Igual que concepto-tipo-recurrencia-snapshot.test.ts, este archivo arma su
 * propio tenant desechable — la cobertura de construirSnapshotDesdeSupabase()
 * no necesita datos reales de producción, solo un fixture estable.
 */
import { money } from '@aquila/financial-kernel'
import { construirSnapshotDesdeSupabase, liquidar } from '@aquila/liquidation-engine'
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
    'SALTADO tests/liquidacion/snapshot-fuente-financiacion: faltan variables de Supabase en .env',
  )
}

// Presupuesto anual neto de 1.080.000 entre 12 meses = 90.000 exactos, sin
// residual de mayor_resto — ese reparto ya lo cubre flujo-dos-tiempos.test.ts;
// aquí solo interesa que el neteo de fuente_financiacion sea correcto.
const PRESUPUESTO_ANUAL = 1_200_000
const OTROS_INGRESOS_ANUAL = 120_000
const CUOTA_MENSUAL_ESPERADA = 90_000

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

async function tipoFuenteOtrosIngresosId(admin: Cliente): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'TIPO_FUENTE_FINANCIACION')
    .eq('codigo', 'otros_ingresos')
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture tipo fuente otros_ingresos: ${error.message}`)
  return data.id
}

d('construirSnapshotDesdeSupabase — fuente_financiacion y áreas (GAP-19, 17 §37)', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let tenant: TenantPrueba
  let inmuebleId: string
  let periodoId: string

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
  })

  it('setup: un inmueble sin area_comun, un presupuesto con otros_ingresos aplicados', async () => {
    agente = await crearUsuario(admin, 'sff')
    tenant = await crearTenant(admin, 'sff', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')

    const tipoId = await tipoApartamentoId(admin)
    // area_comun deliberadamente sin diligenciar — es lo que la segunda
    // prueba verifica que el snapshot no inventa.
    const { data: inmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({
        tenant_id: tenant.id,
        codigo: `SFF-${String(Date.now())}`,
        tipo_id: tipoId,
        area_privada: 75.5,
      })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)
    inmuebleId = inmueble.id

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
      .insert({ tenant_id: tenant.id, set_id: set.id, inmueble_id: inmuebleId, valor: 1 })
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

    // El motor divide el neto ANUAL entre los periodos del año en los que el
    // concepto aplica (PLAN §6.5, doble reparto anual→periodo→inmueble) — se
    // siembran los 12 meses de 2027, no solo enero, o construirSnapshotDesdeSupabase
    // vería un año de un solo periodo y devolvería el neto completo sin dividir.
    const { data: periodos, error: errPeriodos } = await admin
      .from('periodos')
      .insert(
        Array.from({ length: 12 }, (_, i) => ({
          tenant_id: tenant.id,
          anio: 2027,
          mes: i + 1,
          estado: 'abierto' as const,
        })),
      )
      .select('id, mes')
    if (errPeriodos) throw new Error(`fixture periodos: ${errPeriodos.message}`)
    periodoId = periodos.find((p) => p.mes === 1)!.id

    // Presupuesto en borrador: guard_fuente_financiacion (IMMUTABLE_BUDGET)
    // solo admite insertar fuente_financiacion mientras no esté
    // vigente/cerrado — se promueve después, como en la app real.
    const { data: presupuesto, error: errPresupuesto } = await admin
      .from('presupuestos')
      .insert({
        tenant_id: tenant.id,
        anio: 2027,
        version: 1,
        estado: 'borrador',
        monto_total: PRESUPUESTO_ANUAL,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPresupuesto) throw new Error(`fixture presupuesto: ${errPresupuesto.message}`)

    const { data: cuenta, error: errCuenta } = await admin
      .from('presupuesto_cuenta')
      .insert({
        tenant_id: tenant.id,
        naturaleza: 'egreso',
        codigo: 'administracion',
        nombre: 'Administración',
      })
      .select('id')
      .single<{ id: string }>()
    if (errCuenta) throw new Error(`fixture cuenta: ${errCuenta.message}`)

    const { error: errRubro } = await admin.from('presupuesto_rubros').insert({
      tenant_id: tenant.id,
      presupuesto_id: presupuesto.id,
      codigo: 'ADMIN-001',
      nombre: 'Administración',
      cuenta_id: cuenta.id,
      monto_anual: PRESUPUESTO_ANUAL,
    })
    if (errRubro) throw new Error(`fixture rubro: ${errRubro.message}`)

    const tipoFuenteId = await tipoFuenteOtrosIngresosId(admin)
    const { error: errFuente } = await admin.from('fuente_financiacion').insert({
      tenant_id: tenant.id,
      presupuesto_id: presupuesto.id,
      tipo_id: tipoFuenteId,
      valor_disponible: OTROS_INGRESOS_ANUAL,
      valor_aplicado: OTROS_INGRESOS_ANUAL,
      descripcion: 'fixture GAP-19',
    })
    if (errFuente) throw new Error(`fixture fuente_financiacion: ${errFuente.message}`)

    const { error: errVigente } = await admin
      .from('presupuestos')
      .update({ estado: 'vigente' })
      .eq('id', presupuesto.id)
    if (errVigente) throw new Error(`fixture presupuesto vigente: ${errVigente.message}`)

    const { error: errConcepto } = await admin.from('conceptos').insert({
      tenant_id: tenant.id,
      codigo: 'CUOTA_ADMIN',
      nombre: 'Cuota de administración',
      modo_calculo: 'distribucion',
      modo_valor: 'formulado',
      tipo_recurrencia: 'recurrente',
      periodicidad: 'mensual',
      alcance: 'todos',
      fecha_inicio_anio: 2000,
      fecha_inicio_mes: 1,
      formula_ael:
        'REGLA CUOTA_BASICA\n' +
        'DEFINIR presupuesto_anual = PARAMETER.PRESUPUESTO_ANUAL\n' +
        'DEFINIR otros_ingresos_anual = PARAMETER.OTROS_INGRESOS_ANUAL\n' +
        'RETORNAR presupuesto_anual - otros_ingresos_anual',
      prioridad: 100,
      estado: 'activo',
    })
    if (errConcepto) throw new Error(`fixture concepto: ${errConcepto.message}`)
  }, 30_000)

  it('PRESUPUESTO_ANUAL y COEFICIENTE llegan reales al snapshot', async () => {
    const snapshot = await construirSnapshotDesdeSupabase(admin, {
      tenantId: tenant.id,
      anio: 2027,
      mes: 1,
    })

    expect(snapshot.moneda).toBe('COP')
    expect(snapshot.periodo.id).toBe(periodoId)
    expect(snapshot.inmuebles.map((i) => i.id)).toEqual([inmuebleId])
    expect(snapshot.conceptos.map((c) => c.codigo)).toEqual(['CUOTA_ADMIN'])

    const presupuestoAnual = snapshot.parametros.PRESUPUESTO_ANUAL
    if (presupuestoAnual?.tipo !== 'MONEY') throw new Error('se esperaba MONEY')
    expect(presupuestoAnual.valor.amount.toString()).toBe(String(PRESUPUESTO_ANUAL))

    const unit = snapshot.unidades[inmuebleId]
    if (!unit) throw new Error('el inmueble no tiene entrada en snapshot.unidades')
    if (unit.COEFICIENTE?.tipo !== 'NUMBER') throw new Error('se esperaba NUMBER')
    expect(unit.COEFICIENTE.valor.toString()).toBe('1')
    if (unit.AREA_PRIVADA?.tipo !== 'NUMBER') throw new Error('se esperaba NUMBER')
    expect(unit.AREA_PRIVADA.valor.toString()).toBe('75.5')
  })

  it('AREA_COMUN no diligenciada queda ausente del catálogo (17 §37 SNAPSHOT INCOMPLETE)', async () => {
    const snapshot = await construirSnapshotDesdeSupabase(admin, {
      tenantId: tenant.id,
      anio: 2027,
      mes: 1,
    })
    expect(snapshot.unidades[inmuebleId]?.AREA_COMUN).toBeUndefined()
  })

  it('OTROS_INGRESOS_ANUAL viene de fuente_financiacion; liquidar() neta correctamente (GAP-19)', async () => {
    const snapshot = await construirSnapshotDesdeSupabase(admin, {
      tenantId: tenant.id,
      anio: 2027,
      mes: 1,
    })

    const otrosIngresos = snapshot.parametros.OTROS_INGRESOS_ANUAL
    if (otrosIngresos?.tipo !== 'MONEY') throw new Error('se esperaba MONEY')
    expect(otrosIngresos.valor.amount.toString()).toBe(
      money(OTROS_INGRESOS_ANUAL, 'COP').amount.toString(),
    )

    const { resultado } = liquidar(snapshot)
    expect(resultado.tenantTotal.amount.toString()).toBe(String(CUOTA_MENSUAL_ESPERADA))
  })
})
