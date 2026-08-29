/**
 * cartera-certificar-deuda (CAR §15.2, bloque 21/GAP-CAR-011) — la Edge
 * Function que expide la certificación de deuda del art. 48. La agregación
 * y el hash (construirCertificacionDeuda/calcularCertificacionHash) ya
 * están probados como funciones puras en packages/liquidation-engine/src/
 * cartera-juridico.test.ts; esto cubre lo que solo puede probarse contra
 * la base real: rol exigido, consecutivo asignado por
 * fn_siguiente_consecutivo (RC-3), persistencia y lectura por RLS, y el
 * caso sin deuda vencida.
 */
import { afterAll, describe, expect, it } from 'vitest'
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
  console.warn('SALTADO tests/tenancy/cartera-certificar-deuda: faltan variables de Supabase en .env')
}

interface RespuestaCertificar {
  certificacionId: string
  consecutivo: string
  hash: string
}

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

d('cartera-certificar-deuda — CAR §15.2', () => {
  const admin = clienteAdmin(env!)
  let administrador: UsuarioPrueba
  let auxiliar: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAdministrador: Cliente
  let clienteAuxiliar: Cliente
  let politicaId: string

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, administrador.id)
    await eliminarUsuario(admin, auxiliar.id)
  })

  // periodos_unico es (tenant_id, anio, mes) — cada llamada a
  // crearInmuebleConDeuda necesita su propio período, no reutilizar mes=1.
  let mesContador = 0

  /** Un inmueble con un cargo capital vencido (fecha_vencimiento pasada) y saldo pendiente. */
  async function crearInmuebleConDeuda(
    prefijo: string,
    fechaVencimiento: string,
    monto: number,
  ): Promise<string> {
    mesContador += 1
    const tipoInmueble = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
    const { data: inmueble, error: errInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `${prefijo}-${String(Date.now())}`, tipo_id: tipoInmueble })
      .select('id')
      .single<{ id: string }>()
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)

    const { data: periodo, error: errPer } = await admin
      .from('periodos')
      .insert({ tenant_id: tenant.id, anio: 2026, mes: mesContador, estado: 'abierto', fecha_vencimiento: fechaVencimiento })
      .select('id')
      .single<{ id: string }>()
    if (errPer) throw new Error(`fixture periodo: ${errPer.message}`)

    const { data: concepto, error: errCon } = await admin
      .from('conceptos')
      .insert({
        tenant_id: tenant.id,
        codigo: `CERT-${String(Date.now())}`,
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
    if (errCon) throw new Error(`fixture concepto: ${errCon.message}`)

    const { data: liq, error: errLiq } = await admin
      .from('liquidaciones')
      .insert({
        tenant_id: tenant.id,
        periodo_id: periodo.id,
        result_hash: `test-fixture-certdeuda-${String(Date.now())}`,
        tenant_total: monto,
      })
      .select('id')
      .single<{ id: string }>()
    if (errLiq) throw new Error(`fixture liquidacion: ${errLiq.message}`)

    const { data: linea, error: errLin } = await admin
      .from('liquidacion_lineas')
      .insert({
        tenant_id: tenant.id,
        liquidacion_id: liq.id,
        inmueble_id: inmueble.id,
        concepto_id: concepto.id,
        monto,
      })
      .select('id')
      .single<{ id: string }>()
    if (errLin) throw new Error(`fixture linea: ${errLin.message}`)

    const { error: errCargo } = await admin.from('cargos').insert({
      tenant_id: tenant.id,
      inmueble_id: inmueble.id,
      periodo_id: periodo.id,
      categoria: 'capital',
      origen_tipo: 'liquidacion_linea',
      liquidacion_linea_id: linea.id,
      concepto_id: concepto.id,
      monto_original: monto,
    })
    if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)

    return inmueble.id
  }

  it('setup: tenant con administrador, auxiliar y política financiera vigente', async () => {
    administrador = await crearUsuario(admin, 'certd-admin')
    auxiliar = await crearUsuario(admin, 'certd-aux')
    tenant = await crearTenant(admin, 'certd', administrador.id)
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    clienteAdministrador = await clienteComo(env!, administrador)
    clienteAuxiliar = await clienteComo(env!, auxiliar)

    const { data: politica, error: errPol } = await admin
      .from('politicas_financieras')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        estado: 'vigente',
        vigente_desde: '2026-01-01',
        redondeo_modo: 'half_up',
        redondeo_escala: 0,
        residual_metodo: 'mayor_resto',
        coeficientes_suma_esperada: 1,
        policy_hash: `test-fixture-certdeuda-${tenant.id}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPol) throw new Error(`fixture politica_financiera: ${errPol.message}`)
    politicaId = politica.id
  }, 60_000)

  it('un auxiliar no puede expedir una certificación (403)', async () => {
    const inmuebleId = await crearInmuebleConDeuda('CD-AUX', '2026-01-10', 300_000)
    const { response } = await clienteAuxiliar.functions.invoke<RespuestaCertificar>('cartera-certificar-deuda', {
      body: {
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        fecha_corte: '2026-02-01',
        fecha_expedicion: '2026-02-01',
        cargo_firmante: 'Auxiliar de prueba',
      },
    })
    expect(response?.status).toBe(403)
  }, 30_000)

  it('un administrador expide la certificación: consecutivo, hash y montos correctos, persistida y legible por RLS', async () => {
    const inmuebleId = await crearInmuebleConDeuda('CD-OK', '2026-01-10', 300_000)
    const { data, response } = await clienteAdministrador.functions.invoke<RespuestaCertificar>(
      'cartera-certificar-deuda',
      {
        body: {
          tenant_id: tenant.id,
          inmueble_id: inmuebleId,
          fecha_corte: '2026-02-01',
          fecha_expedicion: '2026-02-01',
          cargo_firmante: 'María Restrepo — Administradora',
        },
      },
    )
    expect(response?.status).toBe(201)
    expect(data?.certificacionId).toBeTruthy()
    expect(data?.consecutivo).toBeTruthy()
    expect(data?.hash).toMatch(/^[0-9a-f]{64}$/)

    const { data: fila, error } = await clienteAdministrador
      .from('certificaciones_deuda')
      .select(
        'monto_expensas_ordinarias, monto_expensas_extraordinarias, monto_intereses_mora, monto_sanciones, monto_otros, monto_total, estado, cargo_firmante, politica_financiera_id',
      )
      .eq('id', data!.certificacionId)
      .single()
    if (error) throw new Error(`select certificacion: ${error.message}`)

    expect(fila.monto_expensas_ordinarias).toBe(300_000)
    expect(fila.monto_expensas_extraordinarias).toBe(0)
    expect(fila.monto_intereses_mora).toBe(0)
    expect(fila.monto_sanciones).toBe(0)
    expect(fila.monto_total).toBe(300_000)
    expect(fila.estado).toBe('vigente')
    expect(fila.cargo_firmante).toBe('María Restrepo — Administradora')
    expect(fila.politica_financiera_id).toBe(politicaId)
  }, 30_000)

  it('el consecutivo avanza entre dos emisiones del mismo tenant', async () => {
    const inmuebleUno = await crearInmuebleConDeuda('CD-SEQ1', '2026-01-10', 100_000)
    const inmuebleDos = await crearInmuebleConDeuda('CD-SEQ2', '2026-01-10', 150_000)

    const primera = await clienteAdministrador.functions.invoke<RespuestaCertificar>('cartera-certificar-deuda', {
      body: {
        tenant_id: tenant.id,
        inmueble_id: inmuebleUno,
        fecha_corte: '2026-02-01',
        fecha_expedicion: '2026-02-01',
        cargo_firmante: 'Administrador',
      },
    })
    const segunda = await clienteAdministrador.functions.invoke<RespuestaCertificar>('cartera-certificar-deuda', {
      body: {
        tenant_id: tenant.id,
        inmueble_id: inmuebleDos,
        fecha_corte: '2026-02-01',
        fecha_expedicion: '2026-02-01',
        cargo_firmante: 'Administrador',
      },
    })

    expect(primera.data?.consecutivo).toBeTruthy()
    expect(segunda.data?.consecutivo).toBeTruthy()
    expect(segunda.data!.consecutivo).not.toBe(primera.data!.consecutivo)
  }, 30_000)

  it('sin deuda vencida a la fecha de corte responde 422 CERTIFICACION_SIN_DEUDA', async () => {
    // fecha_vencimiento futura respecto al corte: el cargo existe pero no está vencido.
    const inmuebleId = await crearInmuebleConDeuda('CD-SINDEUDA', '2026-12-31', 100_000)
    const resultado = await clienteAdministrador.functions.invoke<RespuestaCertificar>('cartera-certificar-deuda', {
      body: {
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        fecha_corte: '2026-02-01',
        fecha_expedicion: '2026-02-01',
        cargo_firmante: 'Administrador',
      },
    })
    expect(resultado.data).toBeNull()
    expect(resultado.response?.status).toBe(422)
    // Un error no-2xx de functions.invoke llega en `error.context` (Response), no en `data`.
    const contexto: unknown = (resultado.error as { context?: unknown } | null)?.context
    const cuerpo = (await (contexto as Response).json()) as { error?: { code?: string } }
    expect(cuerpo.error?.code).toBe('CERTIFICACION_SIN_DEUDA')
  }, 30_000)
})
