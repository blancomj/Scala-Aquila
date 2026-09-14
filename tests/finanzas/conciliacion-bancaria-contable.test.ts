/**
 * generar-conciliacion-bancaria + certificar-conciliacion-bancaria (Edge Functions, HTTP real) —
 * Fase 5 de la conciliación bancaria CONTABLE (banco↔libro), D-113/D-115/D-116/D-117.
 *
 * NO es el motor de recaudo (banco↔residente, extracto_bancario/extracto_linea/
 * conciliacion_propuesta, ya cubierto por tests/tenancy/conciliacion.test.ts) — glosario §2 del
 * prompt. Aquí se compara el saldo del extracto contra la cuenta contable de bancos
 * (contable_comprobante_detalle vía cuentas_bancarias.contable_cuenta_id, D-CB-1).
 *
 * D-CB-4: preparar (generar) exige auxiliar, certificar exige administrador — dos usuarios de
 * prueba con roles distintos, mismo criterio de segregación que FIN-3.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type Cliente,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/finanzas/conciliacion-bancaria-contable: faltan variables de Supabase en .env')
}

// Año futuro ficticio, exclusivo de esta suite — sin colisión posible con otras (periodos es
// único por (tenant_id, anio, mes), y cada test crea su propio tenant de todos modos).
const ANIO = 2038
const MES = 6
const HASTA = `${String(ANIO)}-${String(MES).padStart(2, '0')}-30`

interface ResumenGeneracion {
  conciliacionId: string
  saldoInicialBanco: number
  saldoFinalBanco: number
  saldoInicialLibros: number
  saldoFinalLibros: number
  partidasCruzadas: number
  partidasNoCruzadas: number
}

interface ResumenCertificacion {
  conciliacionId: string
  estado: string
}

d('Fase 5: generar-conciliacion-bancaria + certificar-conciliacion-bancaria', () => {
  const admin = clienteAdmin(env!)
  let auxiliar: UsuarioPrueba
  let administrador: UsuarioPrueba
  let clienteAuxiliar: Cliente
  let clienteAdministrador: Cliente
  let tenantId: string
  let periodoId: string
  let cuentaBancoContableId: string
  let contrapartidaId: string
  let cuentaBancariaId: string

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', tipo).eq('codigo', codigo).is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  async function cuentaPorCodigo(codigo: string): Promise<string> {
    const { data, error } = await admin
      .from('contable_cuenta').select('id').eq('tenant_id', tenantId).eq('codigo', codigo)
      .single<{ id: string }>()
    if (error) throw new Error(`fixture cuenta contable ${codigo}: ${error.message}`)
    return data.id
  }

  /** Comprobante balanceado (debito = credito) y ya contabilizado, con una sola línea de banco. */
  async function comprobanteBanco(
    tipoComprobanteCodigo: 'INGRESO' | 'EGRESO',
    fecha: string,
    debitoBanco: number,
    creditoBanco: number,
  ): Promise<void> {
    const tipoId = await idListaTipos('TIPO_COMPROBANTE', tipoComprobanteCodigo)
    const { data: comp, error: errComp } = await admin
      .from('contable_comprobante')
      .insert({
        tenant_id: tenantId, periodo_id: periodoId, tipo_id: tipoId, anio: ANIO, fecha,
        descripcion: 'Fase 5 fixture: movimiento de libros',
      })
      .select('id').single<{ id: string }>()
    if (errComp) throw new Error(`fixture comprobante: ${errComp.message}`)

    const { error: errDetalle } = await admin.from('contable_comprobante_detalle').insert([
      { tenant_id: tenantId, comprobante_id: comp.id, linea: 1, cuenta_id: cuentaBancoContableId, debito: debitoBanco, credito: creditoBanco },
      { tenant_id: tenantId, comprobante_id: comp.id, linea: 2, cuenta_id: contrapartidaId, debito: creditoBanco, credito: debitoBanco },
    ])
    if (errDetalle) throw new Error(`fixture detalle: ${errDetalle.message}`)

    const { error: errContab } = await clienteAdministrador.rpc('fn_contabilizar_comprobante', { p_comprobante_id: comp.id })
    if (errContab) throw new Error(`fixture contabilizar: ${errContab.message}`)
  }

  async function extractoConLineas(lineas: { fecha: string; monto: number }[]): Promise<void> {
    const { data: extracto, error: errExtracto } = await admin
      .from('extracto_bancario')
      .insert({
        tenant_id: tenantId,
        cuenta_bancaria_id: cuentaBancariaId,
        origen: 'banco',
        nombre_archivo: 'fase5-fixture.csv',
        hash_archivo: `hash-fase5-${RUN_ID}-${String(Date.now())}`,
        lineas_totales: lineas.length,
      })
      .select('id').single<{ id: string }>()
    if (errExtracto) throw new Error(`fixture extracto: ${errExtracto.message}`)

    const { error: errLineas } = await admin.from('extracto_linea').insert(
      lineas.map((l, i) => ({
        extracto_id: extracto.id,
        tenant_id: tenantId,
        fecha_movimiento: l.fecha,
        monto: l.monto,
        descripcion_banco: 'FASE 5 FIXTURE',
        hash_linea: `hashlinea-fase5-${RUN_ID}-${String(Date.now())}-${String(i)}`,
      })),
    )
    if (errLineas) throw new Error(`fixture lineas: ${errLineas.message}`)
  }

  beforeAll(async () => {
    auxiliar = await crearUsuario(admin, 'conc-ban-aux')
    administrador = await crearUsuario(admin, 'conc-ban-admin')
    clienteAdministrador = await clienteComo(env!, administrador)

    const { data: tenant, error } = await clienteAdministrador
      .rpc('create_tenant', { p_name: `Conciliación bancaria ${RUN_ID}`, p_slug: `conc-ban-${RUN_ID}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant: ${error.message}`)
    tenantId = tenant.id
    await crearMembership(admin, tenantId, auxiliar.id, 'auxiliar')
    clienteAuxiliar = await clienteComo(env!, auxiliar)

    const { data: periodo, error: errPeriodo } = await admin
      .from('periodos').insert({ tenant_id: tenantId, anio: ANIO, mes: MES }).select('id').single<{ id: string }>()
    if (errPeriodo) throw new Error(`fixture periodo: ${errPeriodo.message}`)
    periodoId = periodo.id

    cuentaBancoContableId = await cuentaPorCodigo('111005')
    contrapartidaId = await cuentaPorCodigo('3310')

    const entidadFinanciera = await idListaTipos('ENTIDAD_FINANCIERA', 'bancolombia')
    const { data: cuenta, error: errCuenta } = await admin
      .from('cuentas_bancarias')
      .insert({
        tenant_id: tenantId, entidad_financiera_id: entidadFinanciera, tipo_cuenta: 'ahorros',
        numero_cuenta: `FASE5-${RUN_ID}`, contable_cuenta_id: cuentaBancoContableId, activa: true,
      })
      .select('id').single<{ id: string }>()
    if (errCuenta) throw new Error(`fixture cuenta_bancaria: ${errCuenta.message}`)
    cuentaBancariaId = cuenta.id

    // Movimiento que SÍ cruza (paso 2 del motor: monto + fecha, sin ambigüedad): 500.000 en banco
    // el día 15, 500.000 en libros el día 16 (1 día de diferencia, dentro de la ventana de 3).
    await extractoConLineas([
      { fecha: `${String(ANIO)}-${String(MES).padStart(2, '0')}-15`, monto: 500_000 },
      // Movimiento que NO cruza, del lado banco: depósito el último día del período — dentro de
      // la ventana "reciente" (3 días) de la fecha de corte → deposito_transito.
      { fecha: HASTA, monto: 20_000 },
    ])
    await comprobanteBanco('INGRESO', `${String(ANIO)}-${String(MES).padStart(2, '0')}-16`, 500_000, 0)
    // Movimiento que NO cruza, del lado libros: un egreso (crédito en la cuenta de banco) →
    // monto negativo → cheque_pendiente.
    await comprobanteBanco('EGRESO', `${String(ANIO)}-${String(MES).padStart(2, '0')}-20`, 0, 30_000)
  }, 90_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenantId)
    await eliminarUsuario(admin, auxiliar.id)
    await eliminarUsuario(admin, administrador.id)
  }, 90_000)

  let conciliacionId: string

  it('un no-auxiliar (sin membership) recibe FORBIDDEN al generar', async () => {
    const otro = await crearUsuario(admin, 'conc-ban-ajeno')
    try {
      const clienteAjeno = await clienteComo(env!, otro)
      const { response } = await clienteAjeno.functions.invoke('generar-conciliacion-bancaria', {
        body: { tenant_id: tenantId, cuenta_bancaria_id: cuentaBancariaId, periodo_id: periodoId },
      })
      expect(response?.status).toBe(403)
    } finally {
      await eliminarUsuario(admin, otro.id)
    }
  }, 60_000)

  it('genera la conciliación: cruza lo que debe cruzar y clasifica lo que no', async () => {
    const { data, response } = await clienteAuxiliar.functions.invoke<ResumenGeneracion>(
      'generar-conciliacion-bancaria',
      { body: { tenant_id: tenantId, cuenta_bancaria_id: cuentaBancariaId, periodo_id: periodoId } },
    )
    expect(response?.status).toBe(200)
    expect(data?.saldoInicialBanco).toBe(0)
    expect(data?.saldoInicialLibros).toBe(0)
    expect(data?.saldoFinalBanco).toBe(520_000)
    expect(data?.saldoFinalLibros).toBe(470_000)
    expect(data?.partidasCruzadas).toBe(1)
    expect(data?.partidasNoCruzadas).toBe(2)
    conciliacionId = data!.conciliacionId

    const { data: cabecera } = await admin
      .from('conciliacion_bancaria')
      .select('estado, saldo_final_banco, saldo_final_libros')
      .eq('id', conciliacionId)
      .single<{ estado: string; saldo_final_banco: number; saldo_final_libros: number }>()
    expect(cabecera?.estado).toBe('borrador')
    expect(Number(cabecera?.saldo_final_banco)).toBe(520_000)
    expect(Number(cabecera?.saldo_final_libros)).toBe(470_000)

    const { data: partidas } = await admin
      .from('conciliacion_bancaria_partida')
      .select('origen, monto, tipo:tipo_id(codigo)')
      .eq('conciliacion_id', conciliacionId)
      .order('origen')
    type Partida = { origen: string; monto: number; tipo: { codigo: string } | null }
    const filas = (partidas ?? []) as unknown as Partida[]
    expect(filas).toHaveLength(2)
    const partidaBanco = filas.find((f) => f.origen === 'banco')
    const partidaLibro = filas.find((f) => f.origen === 'libro')
    expect(partidaBanco?.tipo?.codigo).toBe('deposito_transito')
    expect(Number(partidaBanco?.monto)).toBe(20_000)
    expect(partidaLibro?.tipo?.codigo).toBe('cheque_pendiente')
    expect(Number(partidaLibro?.monto)).toBe(30_000)

    // Invariante contable (Fase 4, packages/liquidation-engine/src/conciliacion-bancaria-cruce.ts):
    // saldo banco ajustado === saldo libros ajustado.
    expect(Number(cabecera?.saldo_final_banco) - Number(partidaBanco?.monto))
      .toBe(Number(cabecera?.saldo_final_libros) - -Number(partidaLibro?.monto))
  }, 60_000)

  it('una segunda generación para la misma cuenta y período falla con CONCILIACION_BANCARIA_YA_EXISTE', async () => {
    const { response } = await clienteAuxiliar.functions.invoke('generar-conciliacion-bancaria', {
      body: { tenant_id: tenantId, cuenta_bancaria_id: cuentaBancariaId, periodo_id: periodoId },
    })
    expect(response?.status).toBe(409)
  }, 60_000)

  it('una cuenta bancaria sin cuenta contable asociada falla con CUENTA_BANCARIA_SIN_CUENTA_CONTABLE', async () => {
    const entidadFinanciera = await idListaTipos('ENTIDAD_FINANCIERA', 'bancolombia')
    const { data: cuentaSinPUC, error: errCuenta } = await admin
      .from('cuentas_bancarias')
      .insert({
        tenant_id: tenantId, entidad_financiera_id: entidadFinanciera, tipo_cuenta: 'ahorros',
        numero_cuenta: `FASE5-SINPUC-${RUN_ID}`, activa: true,
      })
      .select('id').single<{ id: string }>()
    if (errCuenta) throw new Error(`fixture cuenta sin PUC: ${errCuenta.message}`)

    const { response } = await clienteAuxiliar.functions.invoke('generar-conciliacion-bancaria', {
      body: { tenant_id: tenantId, cuenta_bancaria_id: cuentaSinPUC.id, periodo_id: periodoId },
    })
    expect(response?.status).toBe(422)
  }, 60_000)

  it('un no-administrador (auxiliar) recibe FORBIDDEN al certificar', async () => {
    const { response } = await clienteAuxiliar.functions.invoke('certificar-conciliacion-bancaria', {
      body: { tenant_id: tenantId, conciliacion_id: conciliacionId },
    })
    expect(response?.status).toBe(403)
  }, 60_000)

  it('un administrador certifica la conciliación en borrador', async () => {
    const { data, response } = await clienteAdministrador.functions.invoke<ResumenCertificacion>(
      'certificar-conciliacion-bancaria',
      { body: { tenant_id: tenantId, conciliacion_id: conciliacionId } },
    )
    expect(response?.status).toBe(200)
    expect(data?.estado).toBe('certificada')

    const { data: cabecera } = await admin
      .from('conciliacion_bancaria')
      .select('estado, certificado_por, certificado_at')
      .eq('id', conciliacionId)
      .single<{ estado: string; certificado_por: string; certificado_at: string }>()
    expect(cabecera?.estado).toBe('certificada')
    expect(cabecera?.certificado_por).toBe(administrador.id)
    expect(cabecera?.certificado_at).toBeTruthy()
  }, 60_000)

  it('certificar de nuevo la misma conciliación falla con CONCILIACION_BANCARIA_YA_CERTIFICADA (D-CB-3, terminal)', async () => {
    const { response } = await clienteAdministrador.functions.invoke('certificar-conciliacion-bancaria', {
      body: { tenant_id: tenantId, conciliacion_id: conciliacionId },
    })
    expect(response?.status).toBe(409)
  }, 60_000)

  it('certificar una conciliación inexistente falla con CONCILIACION_BANCARIA_NO_ENCONTRADA', async () => {
    const { response } = await clienteAdministrador.functions.invoke('certificar-conciliacion-bancaria', {
      body: { tenant_id: tenantId, conciliacion_id: '00000000-0000-0000-0000-000000000000' },
    })
    expect(response?.status).toBe(404)
  }, 60_000)
})
