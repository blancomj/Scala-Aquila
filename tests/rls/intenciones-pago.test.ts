/**
 * intenciones_pago + fn_registrar_pago_pasarela — 20260904130000, fase 2 §3.
 *
 * El test más importante del módulo es "doble webhook idéntico ⇒ UN solo
 * pago": toda pasarela entrega webhooks at-least-once, así que la duplicación
 * no es un caso raro, es el comportamiento garantizado. Se prueba contra la
 * base real (no por inspección de código), tal como exige la Definition of
 * Done de la fase 2.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/intenciones-pago: faltan variables de Supabase en .env')
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

async function formaPagoPseId(admin: Cliente): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'FORMA_PAGO')
    .eq('codigo', 'pse')
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture forma pago pse: ${error.message}`)
  return data.id
}

async function entidadFinancieraId(admin: Cliente): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'ENTIDAD_FINANCIERA')
    .eq('codigo', 'bancolombia')
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture entidad financiera: ${error.message}`)
  return data.id
}

/** Contexto compartido del tenant: periodo, concepto y liquidación. Los tres
 *  son únicos por tenant/periodo (periodos_unico, conceptos por código,
 *  liquidaciones_viva_unica), así que se crean UNA sola vez y se reusan. */
interface ContextoTenant {
  readonly periodoId: string
  readonly conceptoId: string
  readonly liquidacionId: string
}

/** Cargo de capital mínimo — mismo armado que tests/rls/cuenta-corriente.ts,
 *  pero colgando del contexto compartido. Lo nuevo en cada llamada es el
 *  inmueble y su línea → cargo. */
async function armarCargoCapital(
  admin: Cliente,
  tenantId: string,
  ctx: ContextoTenant,
  monto: number,
): Promise<{ inmuebleId: string; cargoId: string }> {
  const tipoId = await tipoApartamentoId(admin)
  const sufijo = `${String(Date.now())}${String(Math.floor(Math.random() * 1000))}`

  const { data: inmueble, error: e1 } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo: `IP-${sufijo}`, tipo_id: tipoId })
    .select('id')
    .single<{ id: string }>()
  if (e1) throw new Error(`fixture inmueble: ${e1.message}`)

  const { data: linea, error: e5 } = await admin
    .from('liquidacion_lineas')
    .insert({
      tenant_id: tenantId,
      liquidacion_id: ctx.liquidacionId,
      inmueble_id: inmueble.id,
      concepto_id: ctx.conceptoId,
      monto,
    })
    .select('id')
    .single<{ id: string }>()
  if (e5) throw new Error(`fixture liquidacion_linea: ${e5.message}`)

  const { data: cargo, error: e6 } = await admin
    .from('cargos')
    .insert({
      tenant_id: tenantId,
      inmueble_id: inmueble.id,
      periodo_id: ctx.periodoId,
      categoria: 'capital',
      origen_tipo: 'liquidacion_linea',
      liquidacion_linea_id: linea.id,
      concepto_id: ctx.conceptoId,
      monto_original: monto,
    })
    .select('id')
    .single<{ id: string }>()
  if (e6) throw new Error(`fixture cargo: ${e6.message}`)

  return { inmuebleId: inmueble.id, cargoId: cargo.id }
}

d('intenciones de pago y registro idempotente', () => {
  let admin: Cliente
  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let agenteA: UsuarioPrueba
  let agenteB: UsuarioPrueba
  let formaPagoId: number
  let cuentaRecaudoId: string
  let ctxA: ContextoTenant

  async function crearIntencionPendiente(
    monto: number,
  ): Promise<{ intencionId: string; cargoId: string; inmuebleId: string }> {
    const { inmuebleId, cargoId } = await armarCargoCapital(admin, tenantA.id, ctxA, monto)
    const sufijo = `${String(Date.now())}${String(Math.floor(Math.random() * 10000))}`
    const { data, error } = await admin
      .from('intenciones_pago')
      .insert({
        tenant_id: tenantA.id,
        inmueble_id: inmuebleId,
        proveedor: 'wompi',
        referencia: `ip-${sufijo}-202703-9f3a21b4`,
        monto,
        estado: 'pendiente',
        expira_at: new Date(Date.now() + 3600_000).toISOString(),
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture intención: ${error.message}`)
    return { intencionId: data.id, cargoId, inmuebleId }
  }

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenantA = await crearTenant(admin, 'intenciones-a')
    tenantB = await crearTenant(admin, 'intenciones-b')
    agenteA = await crearUsuario(admin, 'intenciones-agente-a')
    agenteB = await crearUsuario(admin, 'intenciones-agente-b')
    await crearMembership(admin, tenantA.id, agenteA.id, 'auxiliar')
    await crearMembership(admin, tenantB.id, agenteB.id, 'auxiliar')
    formaPagoId = await formaPagoPseId(admin)

    // 20260904210000: fn_registrar_pago_pasarela debe resolver esta cuenta
    // (es_recaudo=true, activa) y dejarla en pagos.cuenta_bancaria_id.
    const { data: cuentaRecaudo, error: eCuenta } = await admin
      .from('cuentas_bancarias')
      .insert({
        tenant_id: tenantA.id,
        entidad_financiera_id: await entidadFinancieraId(admin),
        tipo_cuenta: 'ahorros',
        numero_cuenta: '000-000000-00',
        es_recaudo: true,
        activa: true,
      })
      .select('id')
      .single<{ id: string }>()
    if (eCuenta) throw new Error(`fixture cuenta_bancaria: ${eCuenta.message}`)
    cuentaRecaudoId = cuentaRecaudo.id

    const { data: periodo, error: ePeriodo } = await admin
      .from('periodos')
      .insert({ tenant_id: tenantA.id, anio: 2027, mes: 3, estado: 'abierto' })
      .select('id')
      .single<{ id: string }>()
    if (ePeriodo) throw new Error(`fixture periodo: ${ePeriodo.message}`)

    const { data: concepto, error: eConcepto } = await admin
      .from('conceptos')
      .insert({
        tenant_id: tenantA.id,
        codigo: 'CUOTA_ADMIN',
        nombre: 'Cuota de administración',
        modo_calculo: 'distribucion',
        modo_valor: 'formulado',
        tipo_recurrencia: 'recurrente',
        periodicidad: 'mensual',
        alcance: 'todos',
        fecha_inicio_anio: 2000,
        fecha_inicio_mes: 1,
        prioridad: 100,
        estado: 'activo',
      })
      .select('id')
      .single<{ id: string }>()
    if (eConcepto) throw new Error(`fixture concepto: ${eConcepto.message}`)

    const { data: liquidacion, error: eLiq } = await admin
      .from('liquidaciones')
      .insert({
        tenant_id: tenantA.id,
        periodo_id: periodo.id,
        result_hash: `ip-fixture-${String(Date.now())}`,
        tenant_total: 1_000_000,
      })
      .select('id')
      .single<{ id: string }>()
    if (eLiq) throw new Error(`fixture liquidacion: ${eLiq.message}`)

    ctxA = { periodoId: periodo.id, conceptoId: concepto.id, liquidacionId: liquidacion.id }
  }, 90_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, agenteA.id)
    await eliminarUsuario(admin, agenteB.id)
  }, 90_000)

  it('SEC-11 · el tenant B no ve las intenciones del tenant A', async () => {
    const { intencionId } = await crearIntencionPendiente(50_000)
    const cliente = await clienteComo(env!, agenteB)
    const { data } = await cliente.from('intenciones_pago').select('id').eq('id', intencionId)
    expect(data ?? []).toHaveLength(0)
  }, 60_000)

  it('un miembro ve las intenciones de su copropiedad', async () => {
    const { intencionId } = await crearIntencionPendiente(50_000)
    const cliente = await clienteComo(env!, agenteA)
    const { data } = await cliente.from('intenciones_pago').select('id').eq('id', intencionId)
    expect(data?.map((i) => i.id)).toContain(intencionId)
  }, 60_000)

  it('`authenticated` no puede insertar una intención directamente', async () => {
    // Crear una intención define cuánto se va a cobrar: es un efecto de
    // seguridad que el cliente no debe poder eludir. Solo service_role.
    const { inmuebleId } = await armarCargoCapital(admin, tenantA.id, ctxA, 10_000)
    const cliente = await clienteComo(env!, agenteA)
    const { error } = await cliente.from('intenciones_pago').insert({
      tenant_id: tenantA.id,
      inmueble_id: inmuebleId,
      proveedor: 'wompi',
      referencia: 'inyectada-x-202701-9f3a21b4',
      monto: 1,
      expira_at: new Date(Date.now() + 3600_000).toISOString(),
    })
    expect(error).not.toBeNull()
  }, 60_000)

  it('DOBLE WEBHOOK IDÉNTICO ⇒ UN SOLO PAGO', async () => {
    const monto = 120_000
    const { intencionId, cargoId, inmuebleId } = await crearIntencionPendiente(monto)
    const args = {
      p_intencion_id: intencionId,
      p_transaction_id: `tx-${intencionId}`,
      p_monto: monto,
      p_forma_pago_id: formaPagoId,
      p_fecha_pago: '2026-08-01',
      p_aplicaciones: [{ cargo_id: cargoId, monto }],
    }

    const { data: primero, error: e1 } = await admin.rpc('fn_registrar_pago_pasarela', args)
    expect(e1).toBeNull()

    // Segundo webhook, idéntico. No debe ser un error: es lo normal.
    const { data: segundo, error: e2 } = await admin.rpc('fn_registrar_pago_pasarela', args)
    expect(e2).toBeNull()
    expect(segundo).toBe(primero)

    const { data: pagos } = await admin
      .from('pagos')
      .select('id, monto, cuenta_bancaria_id')
      .eq('inmueble_id', inmuebleId)
    expect(pagos ?? []).toHaveLength(1)
    // 20260904210000: cierra el vacío contable — el pago de pasarela debe
    // quedar contra la cuenta de recaudo del tenant, no sin cuenta.
    expect(pagos?.[0]?.cuenta_bancaria_id).toBe(cuentaRecaudoId)

    const { data: aplicaciones } = await admin
      .from('pago_aplicaciones')
      .select('id')
      .eq('pago_id', primero as string)
    expect(aplicaciones ?? []).toHaveLength(1)
  }, 90_000)

  it('el pago de pasarela emite su recibo de caja CON los conceptos aplicados', async () => {
    // Regresión de 20260903190000: el trigger automático se retiró porque
    // corría antes de que existieran las pago_aplicaciones y el recibo salía
    // vacío. fn_registrar_pago_pasarela llama fn_emitir_recibo_caja
    // explícitamente, después de las aplicaciones — esto lo verifica.
    const monto = 90_000
    const { intencionId, cargoId } = await crearIntencionPendiente(monto)
    const { data: pagoId, error } = await admin.rpc('fn_registrar_pago_pasarela', {
      p_intencion_id: intencionId,
      p_transaction_id: `tx-recibo-${intencionId}`,
      p_monto: monto,
      p_forma_pago_id: formaPagoId,
      p_fecha_pago: '2026-08-01',
      p_aplicaciones: [{ cargo_id: cargoId, monto }],
    })
    expect(error).toBeNull()

    const { data: recibo } = await admin
      .from('recibos_caja')
      .select('folio, datos')
      .eq('pago_id', pagoId as string)
      .maybeSingle<{ folio: string; datos: { conceptos: unknown[]; anticipo: number } }>()

    expect(recibo?.folio).toBeTruthy()
    expect(recibo?.datos.conceptos.length).toBeGreaterThan(0)
    expect(recibo?.datos.anticipo ?? -1).toBe(0)
  }, 90_000)

  it('una intención aprobada es terminal e inmutable', async () => {
    const monto = 40_000
    const { intencionId, cargoId } = await crearIntencionPendiente(monto)
    await admin.rpc('fn_registrar_pago_pasarela', {
      p_intencion_id: intencionId,
      p_transaction_id: `tx-term-${intencionId}`,
      p_monto: monto,
      p_forma_pago_id: formaPagoId,
      p_fecha_pago: '2026-08-01',
      p_aplicaciones: [{ cargo_id: cargoId, monto }],
    })

    const { error } = await admin
      .from('intenciones_pago')
      .update({ estado: 'rechazada' })
      .eq('id', intencionId)
    expect(error?.message).toContain('INTENCION_TERMINAL')
  }, 90_000)

  it('rechaza transiciones inválidas de la máquina de estados', async () => {
    const { intencionId } = await crearIntencionPendiente(30_000)
    // pendiente → creada no está permitido.
    const { error } = await admin
      .from('intenciones_pago')
      .update({ estado: 'creada' })
      .eq('id', intencionId)
    expect(error?.message).toContain('INTENCION_TRANSICION_INVALIDA')
  }, 60_000)

  it('una intención expirada que llega a confirmarse no crea un pago silencioso', async () => {
    const { intencionId } = await crearIntencionPendiente(25_000)
    await admin.from('intenciones_pago').update({ estado: 'expirada' }).eq('id', intencionId)

    const { error } = await admin.rpc('fn_registrar_pago_pasarela', {
      p_intencion_id: intencionId,
      p_transaction_id: `tx-exp-${intencionId}`,
      p_monto: 25_000,
      p_forma_pago_id: formaPagoId,
      p_fecha_pago: '2026-08-01',
      p_aplicaciones: [],
    })
    expect(error?.message).toContain('INTENCION_NO_PENDIENTE')
  }, 60_000)

  it('el índice único impide dos pagos para la misma intención', async () => {
    // Última línea de defensa, por debajo de la lógica de la función.
    const monto = 15_000
    const { intencionId, cargoId, inmuebleId } = await crearIntencionPendiente(monto)
    await admin.rpc('fn_registrar_pago_pasarela', {
      p_intencion_id: intencionId,
      p_transaction_id: `tx-idx-${intencionId}`,
      p_monto: monto,
      p_forma_pago_id: formaPagoId,
      p_fecha_pago: '2026-08-01',
      p_aplicaciones: [{ cargo_id: cargoId, monto }],
    })

    const { error } = await admin.from('pagos').insert({
      tenant_id: tenantA.id,
      inmueble_id: inmuebleId,
      monto,
      fecha_pago: '2026-08-02',
      forma_pago_id: formaPagoId,
      intencion_pago_id: intencionId,
    })
    expect(error).not.toBeNull()
  }, 90_000)
})
