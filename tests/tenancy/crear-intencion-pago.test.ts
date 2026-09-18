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
  RUN_ID,
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

/**
 * EXT-07 §7.3 — tercera vía 'actor_externo': el propio propietario/residente paga su saldo,
 * autenticado por actor_externo_vinculo (D-60/AD-37), sin ser tenant_member. Mismo patrón de
 * fixtures que tests/external/cuenta-resumen.test.ts (vínculo + sesión real) combinado con el
 * armado de cargo con saldo de este archivo.
 */
d('crear-intencion-pago — vía actor_externo (EXT-07)', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: string[] = []
  const tercerosCreados: string[] = []

  afterAll(async () => {
    for (const id of usuariosCreados) await eliminarUsuario(admin, id)
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const id of tercerosCreados) {
      await admin.from('inmueble_persona_rol').delete().eq('tercero_id', id)
      await admin.from('terceros').delete().eq('id', id)
    }
  }, 60_000)

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
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

  async function crearInmuebleAE(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_INMUEBLE', 'apartamento')
    const { data, error } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantId, codigo, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearTerceroAE(tenantId: string, sello: string): Promise<string> {
    const tipoIdentId = await idListaTipos('TIPO_IDENTIFICACION', 'cedula')
    const estadoActivoId = await idListaTipos('ESTADO_TERCERO', 'activo')
    const { data, error } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenantId,
        tipo_persona: 'natural',
        tipo_identificacion_id: tipoIdentId,
        numero_documento: sello,
        primer_nombre: 'Externo',
        primer_apellido: sello,
        estado_id: estadoActivoId,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture tercero ${sello}: ${error.message}`)
    tercerosCreados.push(data.id)
    return data.id
  }

  async function crearPersonaRolAE(
    tenantId: string,
    inmuebleId: string,
    terceroId: string,
  ): Promise<string> {
    const rolId = await idListaTipos('PERSONA_PREDIO', 'copropietario')
    const { data, error } = await admin
      .from('inmueble_persona_rol')
      .insert({
        tenant_id: tenantId,
        inmueble_id: inmuebleId,
        tercero_id: terceroId,
        rol_id: rolId,
        vigente_desde: '2020-01-01',
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble_persona_rol: ${error.message}`)
    return data.id
  }

  async function crearVinculoAE(
    tenantId: string,
    personaRolId: string,
    authUserId: string,
  ): Promise<string> {
    const { error } = await admin.rpc('fn_actor_externo_registrar_vinculo', {
      p_tenant_id: tenantId,
      p_auth_user_id: authUserId,
      p_persona_rol_id: personaRolId,
      p_persona_tipo: 'propietario',
      p_origen: 'staff',
    })
    if (error) throw error
    const { data: vinculo, error: errorLeer } = await admin
      .from('actor_externo_vinculo')
      .select('id')
      .eq('auth_user_id', authUserId)
      .eq('persona_rol_id', personaRolId)
      .single<{ id: string }>()
    if (errorLeer) throw errorLeer
    return vinculo.id
  }

  async function prepararActorExternoConInmueble(
    etiqueta: string,
  ): Promise<{ tenantId: string; inmuebleId: string; vinculoId: string; clienteExterno: Cliente }> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const inmuebleId = await crearInmuebleAE(tenant.id, `CIPAE-${etiqueta}-${RUN_ID}`)
    const terceroId = await crearTerceroAE(tenant.id, `${RUN_ID}-${etiqueta}`)
    const personaRolId = await crearPersonaRolAE(tenant.id, inmuebleId, terceroId)

    const email = `cipae-${RUN_ID}-${etiqueta}@example.test`
    const password = `Aa1${crypto.randomUUID()}`
    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (errorCrear) throw errorCrear
    usuariosCreados.push(creado.user.id)

    const vinculoId = await crearVinculoAE(tenant.id, personaRolId, creado.user.id)
    const clienteExterno = await clienteComo(env!, { id: creado.user.id, email, password })

    // Pasarela activa — requisito de crear-intencion-pago para CUALQUIER vía (PASARELA_NO_
    // CONFIGURADA si falta), configurada por un staff desechable, no expuesto en el test.
    const staff = await crearUsuario(admin, `${etiqueta}-staff`)
    usuariosCreados.push(staff.id)
    await crearMembership(admin, tenant.id, staff.id, 'auxiliar')
    const clienteStaff = await clienteComo(env!, staff)
    const { data: cfg } = await clienteStaff.functions.invoke<{ config: { id: string } }>(
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
    const configId = cfg!.config.id
    await clienteStaff.functions.invoke('configurar-pasarela', {
      body: { accion: 'probar_conexion', tenant_id: tenant.id, config_id: configId },
    })
    await clienteStaff.functions.invoke('configurar-pasarela', {
      body: { accion: 'activar', tenant_id: tenant.id, config_id: configId },
    })

    return { tenantId: tenant.id, inmuebleId, vinculoId, clienteExterno }
  }

  async function armarSaldo(
    tenantId: string,
    inmuebleId: string,
    monto: number,
    // Distingue periodos cuando se arman dos cargos para el MISMO tenant (periodos_unico es
    // tenant_id+anio+mes).
    mes = 1,
  ): Promise<void> {
    const sufijo = `${String(Date.now())}${String(Math.floor(Math.random() * 10000))}`
    const { data: periodo, error: eP } = await admin
      .from('periodos')
      .insert({ tenant_id: tenantId, anio: 2026, mes, estado: 'abierto' })
      .select('id')
      .single<{ id: string }>()
    if (eP) throw new Error(`fixture periodo: ${eP.message}`)

    const { data: concepto, error: eC } = await admin
      .from('conceptos')
      .insert({
        tenant_id: tenantId,
        codigo: `CUOTA-${sufijo}`,
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
        tenant_id: tenantId,
        periodo_id: periodo.id,
        result_hash: `cipae-fixture-${sufijo}`,
        tenant_total: monto,
      })
      .select('id')
      .single<{ id: string }>()
    if (eL) throw new Error(`fixture liquidacion: ${eL.message}`)

    const { data: linea, error: eLinea } = await admin
      .from('liquidacion_lineas')
      .insert({
        tenant_id: tenantId,
        liquidacion_id: liq.id,
        inmueble_id: inmuebleId,
        concepto_id: concepto.id,
        monto,
      })
      .select('id')
      .single<{ id: string }>()
    if (eLinea) throw new Error(`fixture linea: ${eLinea.message}`)

    const { error: eCargo } = await admin.from('cargos').insert({
      tenant_id: tenantId,
      inmueble_id: inmuebleId,
      periodo_id: periodo.id,
      categoria: 'capital',
      origen_tipo: 'liquidacion_linea',
      liquidacion_linea_id: linea.id,
      concepto_id: concepto.id,
      monto_original: monto,
    })
    if (eCargo) throw new Error(`fixture cargo: ${eCargo.message}`)
  }

  it('el propio actor externo genera su intención de pago, con el saldo real (no lo que mande el body)', async () => {
    const t = await prepararActorExternoConInmueble('ae1')
    await armarSaldo(t.tenantId, t.inmuebleId, 275_000)

    const { data, response } = await t.clienteExterno.functions.invoke<{
      intencion_id: string
      referencia: string
      monto: number
    }>('crear-intencion-pago', {
      body: { via: 'actor_externo', vinculo_id: t.vinculoId, metodo: 'pse' },
    })
    expect(response?.status).toBe(200)
    expect(data?.monto).toBe(275_000)

    const { data: fila } = await admin
      .from('intenciones_pago')
      .select('estado, inmueble_id, tenant_id, creada_por')
      .eq('id', data!.intencion_id)
      .single<{ estado: string; inmueble_id: string; tenant_id: string; creada_por: string }>()
    expect(fila?.estado).toBe('pendiente')
    expect(fila?.inmueble_id).toBe(t.inmuebleId)
    // creada_por sí se traza para esta vía (a diferencia de 'token') — es el propio actor externo.
    expect(fila?.creada_por).not.toBeNull()
  }, 60_000)

  it('un vínculo de otro actor no puede pagar en su nombre → 403 VINCULO_NO_PERTENECE', async () => {
    const a = await prepararActorExternoConInmueble('ae2a')
    const b = await prepararActorExternoConInmueble('ae2b')
    await armarSaldo(b.tenantId, b.inmuebleId, 100_000)

    const { response } = await a.clienteExterno.functions.invoke('crear-intencion-pago', {
      body: { via: 'actor_externo', vinculo_id: b.vinculoId, metodo: 'pse' },
    })
    expect(response?.status).toBe(403)
  }, 60_000)

  it('un inmueble_id forzado en el cuerpo no tiene efecto: el inmueble siempre sale del vínculo', async () => {
    const t = await prepararActorExternoConInmueble('ae3')
    const otroInmuebleId = await crearInmuebleAE(t.tenantId, `CIPAE-ae3-otro-${RUN_ID}`)
    await armarSaldo(t.tenantId, t.inmuebleId, 60_000, 1)
    await armarSaldo(t.tenantId, otroInmuebleId, 999_000, 2)

    const { data, response } = await t.clienteExterno.functions.invoke<{ monto: number }>(
      'crear-intencion-pago',
      {
        // inmueble_id no es un campo válido para la vía actor_externo (zod lo ignora vía
        // discriminatedUnion) — se envía igual para probar que un campo extra del body no
        // tiene ningún efecto: el inmueble siempre sale del vínculo resuelto en el servidor.
        body: {
          via: 'actor_externo',
          vinculo_id: t.vinculoId,
          metodo: 'pse',
          inmueble_id: otroInmuebleId,
        },
      },
    )
    expect(response?.status).toBe(200)
    expect(data?.monto).toBe(60_000)
  }, 60_000)

  it('sin sesión (Authorization ausente) → 401 UNAUTHENTICATED', async () => {
    const t = await prepararActorExternoConInmueble('ae4')
    await t.clienteExterno.auth.signOut()
    const { response } = await t.clienteExterno.functions.invoke('crear-intencion-pago', {
      body: { via: 'actor_externo', vinculo_id: t.vinculoId, metodo: 'pse' },
    })
    expect(response?.status).toBe(401)
  }, 60_000)
})
