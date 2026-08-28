/**
 * crear-intencion-pago (Edge Function, HTTP real) — Fase 2 §5.
 *
 * Cubre el camino 'via: sesion' (auxiliar/administrador cobrando en nombre de
 * un residente) contra la función desplegada, con credenciales SINTÉTICAS de
 * prueba (nunca las reales de Wompi del usuario — crearIntencion() no habla
 * con la red de Wompi, solo construye y firma la URL de Web Checkout, así que
 * cualquier valor de credencial sirve para probar la mecánica end-to-end).
 *
 * El camino 'via: token' (enlace público del estado de cuenta) NO se prueba
 * aquí: firmar un token que el servidor acepte exige conocer
 * ESTADO_CUENTA_LINK_SECRET tal como está configurado en el proyecto de
 * desarrollo, que este test no puede asumir sin verificarlo primero.
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
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/tenancy/crear-intencion-pago: faltan variables de Supabase en .env')
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

interface RespuestaIntencion {
  intencion_id: string
  referencia: string
  monto: number
  resultado: { tipo: string; checkoutUrl?: string }
}

interface ContextoTenant {
  readonly periodoId: string
  readonly conceptoId: string
  readonly liquidacionId: string
}

d('crear-intencion-pago', () => {
  let admin: Cliente
  let tenant: TenantPrueba
  let agente: UsuarioPrueba
  let auditor: UsuarioPrueba
  let clienteAgent: Cliente
  let clienteAuditor: Cliente
  let configId: string
  let ctx: ContextoTenant

  /** Mismo armado que tests/rls/intenciones-pago.test.ts::armarCargoCapital. */
  async function armarInmuebleConSaldo(monto: number): Promise<{ inmuebleId: string }> {
    const tipoId = await tipoApartamentoId(admin)
    const sufijo = `${String(Date.now())}${String(Math.floor(Math.random() * 10000))}`

    const { data: inmueble, error: e1 } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `CIP-${sufijo}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (e1) throw new Error(`fixture inmueble: ${e1.message}`)

    const { data: linea, error: e2 } = await admin
      .from('liquidacion_lineas')
      .insert({
        tenant_id: tenant.id,
        liquidacion_id: ctx.liquidacionId,
        inmueble_id: inmueble.id,
        concepto_id: ctx.conceptoId,
        monto,
      })
      .select('id')
      .single<{ id: string }>()
    if (e2) throw new Error(`fixture linea: ${e2.message}`)

    const { error: e3 } = await admin.from('cargos').insert({
      tenant_id: tenant.id,
      inmueble_id: inmueble.id,
      periodo_id: ctx.periodoId,
      categoria: 'capital',
      origen_tipo: 'liquidacion_linea',
      liquidacion_linea_id: linea.id,
      concepto_id: ctx.conceptoId,
      monto_original: monto,
    })
    if (e3) throw new Error(`fixture cargo: ${e3.message}`)

    return { inmuebleId: inmueble.id }
  }

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenant = await crearTenant(admin, 'cip-fixture')
    agente = await crearUsuario(admin, 'cip-agente')
    auditor = await crearUsuario(admin, 'cip-auditor')
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    clienteAgent = await clienteComo(env!, agente)
    clienteAuditor = await clienteComo(env!, auditor)

    const { data: periodo, error: eP } = await admin
      .from('periodos')
      .insert({ tenant_id: tenant.id, anio: 2026, mes: 1, estado: 'abierto' })
      .select('id')
      .single<{ id: string }>()
    if (eP) throw new Error(`fixture periodo: ${eP.message}`)

    const { data: concepto, error: eC } = await admin
      .from('conceptos')
      .insert({
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
        prioridad: 100,
        estado: 'activo',
      })
      .select('id')
      .single<{ id: string }>()
    if (eC) throw new Error(`fixture concepto: ${eC.message}`)

    const { data: liq, error: eL } = await admin
      .from('liquidaciones')
      .insert({
        tenant_id: tenant.id,
        periodo_id: periodo.id,
        result_hash: `cip-fixture-${String(Date.now())}`,
        tenant_total: 1_000_000,
      })
      .select('id')
      .single<{ id: string }>()
    if (eL) throw new Error(`fixture liquidacion: ${eL.message}`)

    ctx = { periodoId: periodo.id, conceptoId: concepto.id, liquidacionId: liq.id }

    const { data: cfg } = await clienteAgent.functions.invoke<{ config: { id: string } }>(
      'configurar-pasarela',
      {
        body: {
          accion: 'guardar_credenciales',
          tenant_id: tenant.id,
          proveedor: 'wompi',
          identificador_publico: 'pub_test_fixture',
          metodos: ['pse'],
          credenciales: {
            public_key: 'pub_test_fixture',
            private_key: 'prv_test_fixture',
            events_secret: 'test_events_fixture',
            integrity_secret: 'test_integrity_fixture',
          },
        },
      },
    )
    configId = cfg!.config.id
    await clienteAgent.functions.invoke('configurar-pasarela', {
      body: { accion: 'probar_conexion', tenant_id: tenant.id, config_id: configId },
    })
    await clienteAgent.functions.invoke('configurar-pasarela', {
      body: { accion: 'activar', tenant_id: tenant.id, config_id: configId },
    })
  }, 60_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, auditor.id)
  }, 60_000)

  it('un auditor no puede generar una intención de cobro', async () => {
    const { inmuebleId } = await armarInmuebleConSaldo(50_000)
    const { response } = await clienteAuditor.functions.invoke('crear-intencion-pago', {
      body: { via: 'sesion', inmueble_id: inmuebleId, metodo: 'pse' },
    })
    expect(response?.status).toBe(403)
  }, 60_000)

  it('sin saldo pendiente responde PAGO_INVALIDO', async () => {
    const tipoId = await tipoApartamentoId(admin)
    const { data: inmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `CIP-VACIO-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    const { response } = await clienteAgent.functions.invoke('crear-intencion-pago', {
      body: { via: 'sesion', inmueble_id: inmueble!.id, metodo: 'pse' },
    })
    expect(response?.status).toBe(422)
  }, 60_000)

  it('un método que Wompi no soporta se rechaza antes de tocar la pasarela', async () => {
    const { inmuebleId } = await armarInmuebleConSaldo(30_000)
    const { response } = await clienteAgent.functions.invoke('crear-intencion-pago', {
      body: { via: 'sesion', inmueble_id: inmuebleId, metodo: 'corresponsal_bancario' },
    })
    expect(response?.status).toBe(400)
  }, 60_000)

  it('genera una intención pendiente con URL de Web Checkout firmada', async () => {
    const { inmuebleId } = await armarInmuebleConSaldo(213_517)
    const { data, response } = await clienteAgent.functions.invoke<RespuestaIntencion>(
      'crear-intencion-pago',
      { body: { via: 'sesion', inmueble_id: inmuebleId, metodo: 'pse' } },
    )
    expect(response?.status).toBe(200)
    expect(data?.resultado.tipo).toBe('redirect')
    expect(data?.resultado.checkoutUrl).toContain('https://checkout.wompi.co/p/')
    expect(data?.resultado.checkoutUrl).toContain('signature%3Aintegrity=')
    expect(data?.monto).toBe(213_517)

    const { data: fila } = await admin
      .from('intenciones_pago')
      .select('estado, referencia, monto')
      .eq('id', data!.intencion_id)
      .single<{ estado: string; referencia: string; monto: number }>()
    expect(fila?.estado).toBe('pendiente')
    expect(fila?.referencia).toBe(data!.referencia)

    // ver-intencion-pago (§8.2): la pantalla de resultado consulta este
    // endpoint público con el propio uuid como capability token.
    const { data: consulta, response: respuestaConsulta } = await clienteAgent.functions.invoke<{
      estado: string
      monto: number
      referencia: string
    }>('ver-intencion-pago', { body: { intencion_id: data!.intencion_id } })
    expect(respuestaConsulta?.status).toBe(200)
    expect(consulta?.estado).toBe('pendiente')
    expect(consulta?.referencia).toBe(data!.referencia)
  }, 60_000)

  it('ver-intencion-pago responde 404 ante un uuid que no existe', async () => {
    const { response } = await clienteAgent.functions.invoke('ver-intencion-pago', {
      body: { intencion_id: '00000000-0000-0000-0000-000000000000' },
    })
    expect(response?.status).toBe(404)
  }, 60_000)

  it('un monto solicitado mayor al saldo pendiente responde PASARELA_MONTO_EXCEDE_SALDO', async () => {
    const { inmuebleId } = await armarInmuebleConSaldo(40_000)
    const { response } = await clienteAgent.functions.invoke('crear-intencion-pago', {
      body: { via: 'sesion', inmueble_id: inmuebleId, metodo: 'pse', monto: 999_999 },
    })
    expect(response?.status).toBe(422)
  }, 60_000)
})
