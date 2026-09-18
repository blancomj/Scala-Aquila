/**
 * EXT-07 §7.2 (external-cuenta-resumen) — "estado de cuenta en vivo" para el actor externo
 * (propietario/residente, EXT-01). Mismo patrón de fixtures que tests/external/solicitudes.test.ts
 * (EXT-02) para el vínculo + sesión real, y de tests/tenancy/crear-intencion-pago.test.ts para el
 * cargo con saldo pendiente (periodo/concepto/liquidación/línea/cargo).
 *
 * Deliberadamente NO se prueba aquí el token firmado del comprobante formal
 * (estados_cuenta_generados / ver-estado-cuenta, D-27) — es un contrato distinto que esta función
 * no toca (PROMPT_MI_COPROPIEDAD_FASE1.md §4.3).
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
  clienteComo,
  crearTenant,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type Cliente,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/external/cuenta-resumen: faltan variables de Supabase en .env')
}

interface RespuestaResumen {
  inmueble: { id: string; codigo: string }
  saldo_total: number
  obligaciones: { concepto: string; periodo: string; monto_pendiente: number; estado: string }[]
  pago_habilitado: boolean
}

interface ErrorHttpParseado {
  status: number | null
  codigo: string | null
  mensaje: string | null
}

/** Mismo desempaquetado de FunctionsHttpError que tests/external/solicitudes.test.ts. */
function invocarConError<T>(
  promesa: Promise<{ data: T | null; error: unknown }>,
): Promise<{ data: T | null; error: ErrorHttpParseado | null }> {
  return promesa.then(async ({ data, error }) => {
    if (!error) return { data, error: null }
    const contexto = (error as { context?: unknown }).context
    let status: number | null = null
    let cuerpo: { error?: { code?: string; message?: string } } = {}
    if (contexto instanceof Response) {
      status = contexto.status
      try {
        cuerpo = (await contexto.clone().json()) as typeof cuerpo
      } catch {
        // sin cuerpo JSON legible — se deja vacío.
      }
    }
    return {
      data: null,
      error: { status, codigo: cuerpo.error?.code ?? null, mensaje: cuerpo.error?.message ?? null },
    }
  })
}

d('EXT-07: external-cuenta-resumen', () => {
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

  async function crearInmueble(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_INMUEBLE', 'apartamento')
    const { data, error } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantId, codigo, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearTercero(tenantId: string, sello: string): Promise<string> {
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

  async function crearPersonaRol(
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

  async function crearVinculo(
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

  /** Tenant + inmueble + actor externo vinculado, sin cargos todavía (cada test arma su saldo). */
  async function prepararTenantConActorExterno(
    etiqueta: string,
  ): Promise<{
    tenantId: string
    inmuebleId: string
    actorExternoVinculoId: string
    clienteExterno: Cliente
  }> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const inmuebleId = await crearInmueble(tenant.id, `EXT7-${etiqueta}-${RUN_ID}`)
    const terceroId = await crearTercero(tenant.id, `${RUN_ID}-${etiqueta}`)
    const personaRolId = await crearPersonaRol(tenant.id, inmuebleId, terceroId)

    const email = `ext7-${RUN_ID}-${etiqueta}@example.test`
    const password = `Aa1${crypto.randomUUID()}`
    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (errorCrear) throw errorCrear
    usuariosCreados.push(creado.user.id)

    const vinculoId = await crearVinculo(tenant.id, personaRolId, creado.user.id)
    const clienteExterno = await clienteComo(env!, { id: creado.user.id, email, password })

    return { tenantId: tenant.id, inmuebleId, actorExternoVinculoId: vinculoId, clienteExterno }
  }

  /** Un cargo real con saldo pendiente sobre `inmuebleId` — mismo armado que
   * tests/tenancy/crear-intencion-pago.test.ts::armarInmuebleConSaldo, parametrizado por inmueble
   * en vez de crearlo, porque aquí el inmueble ya viene del vínculo del actor externo. */
  async function armarCargoPendiente(
    tenantId: string,
    inmuebleId: string,
    monto: number,
    // Distingue periodos cuando se arman dos cargos para el MISMO tenant (periodos_unico es
    // tenant_id+anio+mes) — cada llamada en un mismo test pasa un mes distinto.
    mes = 1,
  ): Promise<{ cargoId: string; periodoId: string }> {
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
        result_hash: `ext7-fixture-${sufijo}`,
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

    const { data: cargo, error: eCargo } = await admin
      .from('cargos')
      .insert({
        tenant_id: tenantId,
        inmueble_id: inmuebleId,
        periodo_id: periodo.id,
        categoria: 'capital',
        origen_tipo: 'liquidacion_linea',
        liquidacion_linea_id: linea.id,
        concepto_id: concepto.id,
        monto_original: monto,
      })
      .select('id')
      .single<{ id: string }>()
    if (eCargo) throw new Error(`fixture cargo: ${eCargo.message}`)
    return { cargoId: cargo.id, periodoId: periodo.id }
  }

  it('1. actor externo con saldo pendiente ve el total y el desglose de su propio inmueble', async () => {
    const t = await prepararTenantConActorExterno('c1')
    await armarCargoPendiente(t.tenantId, t.inmuebleId, 150_000)

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaResumen>('external-cuenta-resumen', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.inmueble.id).toBe(t.inmuebleId)
    expect(data!.saldo_total).toBe(150_000)
    expect(data!.obligaciones).toHaveLength(1)
    expect(data!.obligaciones[0]!.concepto).toBe('Cuota de administración')
    expect(data!.obligaciones[0]!.monto_pendiente).toBe(150_000)
    expect(data!.obligaciones[0]!.estado).toBe('pendiente')
  }, 30_000)

  it('2. sin cargos pendientes → saldo 0 y sin obligaciones (nunca un error)', async () => {
    const t = await prepararTenantConActorExterno('c2')
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaResumen>('external-cuenta-resumen', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.saldo_total).toBe(0)
    expect(data!.obligaciones).toEqual([])
  }, 30_000)

  it('3. un vínculo de otro actor → 403 VINCULO_NO_PERTENECE, nunca datos ajenos', async () => {
    const a = await prepararTenantConActorExterno('c3a')
    const b = await prepararTenantConActorExterno('c3b')
    await armarCargoPendiente(b.tenantId, b.inmuebleId, 999_000)

    const { data, error } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaResumen>('external-cuenta-resumen', {
        body: { vinculo_id: b.actorExternoVinculoId },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(403)
    expect(error!.codigo).toBe('VINCULO_NO_PERTENECE')
  }, 30_000)

  it('4. un vinculo_id inexistente responde igual que uno ajeno (no distingue, no confirma existencia)', async () => {
    const t = await prepararTenantConActorExterno('c4')
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaResumen>('external-cuenta-resumen', {
        body: { vinculo_id: '00000000-0000-0000-0000-000000000000' },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(403)
    expect(error!.codigo).toBe('VINCULO_NO_PERTENECE')
  }, 30_000)

  it('5. aislamiento: los cargos de otro inmueble del mismo tenant no se mezclan en el saldo', async () => {
    const t = await prepararTenantConActorExterno('c5')
    const otroInmuebleId = await crearInmueble(t.tenantId, `EXT7-c5-otro-${RUN_ID}`)
    await armarCargoPendiente(t.tenantId, t.inmuebleId, 80_000, 1)
    await armarCargoPendiente(t.tenantId, otroInmuebleId, 500_000, 2)

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaResumen>('external-cuenta-resumen', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.saldo_total).toBe(80_000)
  }, 30_000)

  it('6. sin autenticación (sin Authorization) → 401 UNAUTHENTICATED', async () => {
    const t = await prepararTenantConActorExterno('c6')
    const { error: errorSignOut } = await t.clienteExterno.auth.signOut()
    if (errorSignOut) throw errorSignOut
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaResumen>('external-cuenta-resumen', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(401)
    expect(error!.codigo).toBe('UNAUTHENTICATED')
  }, 30_000)

  it('7. cargos sin concepto_id (p. ej. intereses de mora) no rompen el resumen', async () => {
    // BUG REAL encontrado con datos QA reales (no con fixtures, que siempre rellenan
    // concepto_id): `cargos.concepto_id` admite null (`\d cargos`) — un cargo de origen
    // 'interes' típicamente no tiene concepto de catálogo propio. El código armaba
    // `conceptoIds` con ese null adentro y `.in('id', conceptoIds)` fallaba en PostgREST con
    // "invalid input syntax for type uuid" al intentar parsear el null como uuid — un 500 en
    // vez de mostrar el saldo real. Este test fija el comportamiento correcto.
    const t = await prepararTenantConActorExterno('c7')
    const { cargoId, periodoId } = await armarCargoPendiente(t.tenantId, t.inmuebleId, 100_000)
    const { error: eInteres } = await admin.from('cargos').insert({
      tenant_id: t.tenantId,
      inmueble_id: t.inmuebleId,
      periodo_id: periodoId,
      categoria: 'interes',
      origen_tipo: 'interes',
      cargo_capital_origen_id: cargoId,
      monto_original: 5_000,
    })
    if (eInteres) throw new Error(`fixture cargo interes: ${eInteres.message}`)

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaResumen>('external-cuenta-resumen', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.saldo_total).toBe(105_000)
    expect(data!.obligaciones).toHaveLength(2)
    const sinConcepto = data!.obligaciones.find((o) => o.monto_pendiente === 5_000)
    expect(sinConcepto?.concepto).toBe('Concepto')
  }, 30_000)
})
