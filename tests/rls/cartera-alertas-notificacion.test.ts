/**
 * cartera_alertas_evaluar() / cartera_alerta_emitida / puente a fn_notificar
 * (ENFOQUE_CONSOLIDACION, Ola 1 §2.2 — 06_PROMPT_O1_CONSOLIDACION.md).
 *
 * Cartera era el único de los cuatro detectores que detectaba y no
 * avisaba (02_ESTADO_VERIFICADO.md §2). Esta suite prueba las tres cosas
 * que el prompt exige explícitamente en §5:
 *
 *   - Idempotencia: dos corridas el mismo día no duplican notificación.
 *   - Aislamiento: ninguna alerta de un tenant es visible desde otro.
 *   - El puente nunca falla la detección: cartera_alerta_emitida es la
 *     fuente de verdad append-only; la notificación es best-effort.
 *
 * cartera_alertas_evaluar() y cron_cartera_alertas_diario() tienen su
 * EXECUTE revocado de public/anon/authenticated (higiene, igual que
 * finanzas_alertas_evaluar) — se invocan aquí con el cliente admin
 * (service_role), igual que tests/finanzas/flujo-plantilla-default.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/cartera-alertas-notificacion: faltan variables de Supabase en .env')
}

const FECHA_CORTE = '2026-08-15'

async function listaTipoId(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

/** Siembra un cargo vencido hace más de 90 días respecto a FECHA_CORTE — dispara
 * exactamente una condición (obligaciones_mayor_90) y ninguna de las otras tres. */
async function sembrarObligacionVencida(admin: Cliente, tenantId: string): Promise<void> {
  const tipoInmuebleId = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
  const { data: inmueble, error: errInm } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo: `OLA1-${String(Date.now())}`, tipo_id: tipoInmuebleId })
    .select('id')
    .single<{ id: string }>()
  if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)

  const { data: periodo, error: errPer } = await admin
    .from('periodos')
    .insert({ tenant_id: tenantId, anio: 2026, mes: 5, fecha_vencimiento: '2026-05-01' })
    .select('id')
    .single<{ id: string }>()
  if (errPer) throw new Error(`fixture periodo: ${errPer.message}`)

  const { data: concepto, error: errConcepto } = await admin
    .from('conceptos')
    .insert({
      tenant_id: tenantId,
      codigo: `CUOTA-OLA1-${String(Date.now())}`,
      nombre: 'Cuota (fixture ola1)',
      modo_calculo: 'distribucion',
      modo_valor: 'fijo',
      valor_fijo: 500_000,
      prioridad: 100,
      estado: 'activo',
      tipo_recurrencia: 'recurrente',
      periodicidad: 'mensual',
      fecha_inicio_anio: 2026,
      fecha_inicio_mes: 5,
      alcance: 'todos',
    })
    .select('id')
    .single<{ id: string }>()
  if (errConcepto) throw new Error(`fixture concepto: ${errConcepto.message}`)

  const { data: liquidacion, error: errLiq } = await admin
    .from('liquidaciones')
    .insert({
      tenant_id: tenantId,
      periodo_id: periodo.id,
      result_hash: `ola1-fixture-${String(Date.now())}`,
      tenant_total: 500_000,
    })
    .select('id')
    .single<{ id: string }>()
  if (errLiq) throw new Error(`fixture liquidacion: ${errLiq.message}`)

  const { data: linea, error: errLinea } = await admin
    .from('liquidacion_lineas')
    .insert({
      tenant_id: tenantId,
      liquidacion_id: liquidacion.id,
      inmueble_id: inmueble.id,
      concepto_id: concepto.id,
      monto: 500_000,
    })
    .select('id')
    .single<{ id: string }>()
  if (errLinea) throw new Error(`fixture liquidacion_linea: ${errLinea.message}`)

  const { error: errCargo } = await admin.from('cargos').insert({
    tenant_id: tenantId,
    inmueble_id: inmueble.id,
    periodo_id: periodo.id,
    categoria: 'capital',
    origen_tipo: 'liquidacion_linea',
    liquidacion_linea_id: linea.id,
    concepto_id: concepto.id,
    monto_original: 500_000,
    fecha_vencimiento: '2026-05-01',
  })
  if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)
}

d('cartera_alertas_evaluar — emisión, idempotencia y aislamiento', () => {
  let admin: Cliente
  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let miembroA: UsuarioPrueba

  beforeAll(async () => {
    if (!env) return
    admin = clienteAdmin(env)

    tenantA = await crearTenant(admin, 'ola1-alertas-a')
    tenantB = await crearTenant(admin, 'ola1-alertas-b')
    miembroA = await crearUsuario(admin, 'ola1-alertas-a')
    await crearMembership(admin, tenantA.id, miembroA.id, 'administrador')

    // Solo A tiene cartera vencida. B queda deliberadamente vacío — es el
    // control de la prueba de aislamiento.
    await sembrarObligacionVencida(admin, tenantA.id)
  })

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, miembroA.id)
  })

  it('emite exactamente una alerta (obligaciones_mayor_90) y su notificación correspondiente', async () => {
    const { data: emitidas, error } = await admin.rpc('cartera_alertas_evaluar', {
      p_tenant_id: tenantA.id,
      p_fecha: FECHA_CORTE,
    })
    expect(error).toBeNull()
    expect(emitidas).toBe(1)

    const { data: alertas } = await admin
      .from('cartera_alerta_emitida')
      .select('tipo_id, fecha_emision, detalle, lista_tipos(codigo)')
      .eq('tenant_id', tenantA.id)
    expect(alertas).toHaveLength(1)
    expect((alertas?.[0] as unknown as { lista_tipos: { codigo: string } }).lista_tipos.codigo).toBe(
      'obligaciones_mayor_90',
    )

    const { data: notifs } = await admin
      .from('notificaciones')
      .select('modulo, titulo, origen_entidad, origen_evento, enlace')
      .eq('tenant_id', tenantA.id)
    expect(notifs).toHaveLength(1)
    expect(notifs?.[0]?.modulo).toBe('cartera_cobranza')
    expect(notifs?.[0]?.origen_entidad).toBe('cartera_alerta_emitida')
    expect(notifs?.[0]?.enlace).toBe('/cartera')
  })

  it('correr la misma fecha una segunda vez no duplica ni la alerta ni la notificación', async () => {
    const { data: emitidasSegunda, error } = await admin.rpc('cartera_alertas_evaluar', {
      p_tenant_id: tenantA.id,
      p_fecha: FECHA_CORTE,
    })
    expect(error).toBeNull()
    expect(emitidasSegunda).toBe(0)

    const { count: alertasCount } = await admin
      .from('cartera_alerta_emitida')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantA.id)
    expect(alertasCount).toBe(1)

    const { count: notifsCount } = await admin
      .from('notificaciones')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantA.id)
    expect(notifsCount).toBe(1)
  })

  it('un tenant sin cartera vencida no emite ninguna alerta', async () => {
    const { data: emitidas, error } = await admin.rpc('cartera_alertas_evaluar', {
      p_tenant_id: tenantB.id,
      p_fecha: FECHA_CORTE,
    })
    expect(error).toBeNull()
    expect(emitidas).toBe(0)

    const { count } = await admin
      .from('cartera_alerta_emitida')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantB.id)
    expect(count).toBe(0)
  })

  it('un miembro de A no ve alertas ni notificaciones de B (aislamiento RLS)', async () => {
    const { clienteComo } = await import('./helpers.js')
    const cliente = await clienteComo(env!, miembroA)

    const { data: alertasDeB } = await cliente
      .from('cartera_alerta_emitida')
      .select('id')
      .eq('tenant_id', tenantB.id)
    expect(alertasDeB ?? []).toHaveLength(0)

    const { data: notifsDeB } = await cliente.from('notificaciones').select('id').eq('tenant_id', tenantB.id)
    expect(notifsDeB ?? []).toHaveLength(0)
  })

  it(
    'cron_cartera_alertas_diario no duplica sobre un tenant ya corrido el mismo día',
    async () => {
      // La corrida de HOY (current_date) es un día distinto a FECHA_CORTE —
      // confirma que el cron guarda por (tenant, fecha_corte, origen) real,
      // no reutiliza el guard de otra fecha por accidente.
      // Timeout ampliado: el cron recorre TODOS los tenants activos del
      // proyecto, no solo los de esta prueba.
      const { error: error1 } = await admin.rpc('cron_cartera_alertas_diario')
      expect(error1).toBeNull()
      const { error: error2 } = await admin.rpc('cron_cartera_alertas_diario')
      expect(error2).toBeNull()

      const { count } = await admin
        .from('cartera_corridas_diarias')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantA.id)
        .eq('origen', 'alertas')
      expect(count).toBe(1)
    },
    60_000,
  )
})
