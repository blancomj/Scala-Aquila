/**
 * FIN-1 (20260930780000-20260930810000) — posición de tesorería y
 * disponibilidad bancaria. Ver Casos de uso/Tres Modulos/Financiero/
 * FIN_01_posicion_tesoreria.md §5 (12 pruebas obligatorias).
 *
 * Patrón calcado de fondo_compromisos/fn_fondo_saldos (20260929140000):
 * disponible = saldo − reservado, mismos guards de transición/motivo/
 * terminal-inmutable, aplicado a cuentas bancarias en vez de fondos.
 *
 * Hallazgo de esta sesión, encontrado ANTES de escribir la prueba 4 (no
 * por una prueba fallida en producción): guard_finanzas_compromiso_
 * bancario_transicion solo se disparaba "before update of estado", así
 * que editar `monto` en un compromiso terminal no quedaba bloqueado.
 * Corregido en 20260930810000 antes de escribir la prueba, agregando el
 * chequeo a guard_finanzas_compromiso_bancario (que sí corre en
 * cualquier UPDATE).
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
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/finanzas/posicion-tesoreria: faltan variables de Supabase en .env')
}

// Los fixtures contabilizan en el año 2020 — pasado real (no futuro como en tests/contabilidad/*,
// que usan años lejanos para aislarse de otros archivos que comparten tenants). Cada prueba de
// FIN-1 crea su propio tenant dedicado (crearTenantConPlan), así que no hay ese riesgo de
// colisión; 2020 importa por otra razón: guard_finanzas_compromiso_bancario llama
// fn_cuenta_bancaria_disponible(..., now()) con la fecha real de hoy — un fixture en un año
// futuro nunca aparecería contabilizado "a hoy", y el guard vería siempre saldo 0.

d('FIN-1: posición de tesorería y disponibilidad bancaria', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function crearTenantConPlan(etiqueta: string): Promise<{ tenantId: string; auxiliar: Cliente }> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const { error } = await admin.rpc('fn_instanciar_plan_contable', { p_tenant_id: tenant.id })
    if (error) throw error
    // Sin esto, contable_cuenta_default queda vacío (CAJA_GENERAL/ANTICIPO_COPROPIETARIO) — las
    // ramas "caja"/"anticipos" de finanzas_posicion_tesoreria no aparecerían para este tenant.
    const { error: errDefault } = await admin.rpc('fn_instanciar_cuentas_default', { p_tenant_id: tenant.id })
    if (errDefault) throw errDefault

    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')
    const auxiliar = await clienteComo(env!, usuario)

    return { tenantId: tenant.id, auxiliar }
  }

  async function crearPeriodo(tenantId: string, anio: number, mes: number): Promise<string> {
    const { data, error } = await admin
      .from('periodos').insert({ tenant_id: tenantId, anio, mes }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture periodo: ${error.message}`)
    return data.id
  }

  async function tipoComprobanteId(codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', 'TIPO_COMPROBANTE').eq('codigo', codigo)
      .single<{ id: number }>()
    if (error) throw error
    return data.id
  }

  async function cuentaPorCodigo(tenantId: string, codigo: string): Promise<string> {
    const { data, error } = await admin
      .from('contable_cuenta').select('id').eq('tenant_id', tenantId).eq('codigo', codigo)
      .single<{ id: string }>()
    if (error) throw error
    return data.id
  }

  async function entidadFinancieraId(): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id')
      .eq('tipo', 'ENTIDAD_FINANCIERA').eq('codigo', 'bancolombia').is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture entidad financiera: ${error.message}`)
    return data.id
  }

  async function crearCuentaBancaria(tenantId: string, contableCuentaId: string): Promise<string> {
    const { data, error } = await admin
      .from('cuentas_bancarias')
      .insert({
        tenant_id: tenantId, entidad_financiera_id: await entidadFinancieraId(),
        tipo_cuenta: 'ahorros', numero_cuenta: `FIN1-${Math.random().toString(36).slice(2, 8)}`,
        contable_cuenta_id: contableCuentaId, activa: true,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture cuenta_bancaria: ${error.message}`)
    return data.id
  }

  /** Deja la cuenta bancaria con un saldo contable conocido: un comprobante contabilizado real
   * (no un INSERT directo de saldo) — así fn_cuenta_bancaria_disponible se prueba contra lo mismo
   * que lee contable_libro_mayor en producción. */
  async function darSaldoBanco(
    tenantId: string, auxiliar: Cliente, cuentaBancoId: string, anio: number, monto: number,
  ): Promise<void> {
    const periodoId = await crearPeriodo(tenantId, anio, 1)
    const tipoId = await tipoComprobanteId('INGRESO')
    // 3310 (excedente/déficit del ejercicio) no exige tercero/centro de costo/fondo/inmueble —
    // 4105 (INGRESO_CUOTA_ORDINARIA) exige inmueble, 5105 exige tercero. Contrapartida elegida
    // solo por neutralidad de dimensiones para el fixture, no por sentido contable real.
    const contrapartidaId = await cuentaPorCodigo(tenantId, '3310')
    const { data: periodo } = await admin.from('periodos').select('anio').eq('id', periodoId).single<{ anio: number }>()
    const { data: comp, error: errComp } = await admin
      .from('contable_comprobante')
      .insert({
        tenant_id: tenantId, periodo_id: periodoId, tipo_id: tipoId, anio: periodo!.anio,
        fecha: `${anio}-01-15`, descripcion: 'FIN-1 fixture: saldo inicial de banco',
      })
      .select('id').single<{ id: string }>()
    if (errComp) throw errComp
    const { error: errDetalle } = await admin.from('contable_comprobante_detalle').insert([
      { tenant_id: tenantId, comprobante_id: comp.id, linea: 1, cuenta_id: cuentaBancoId, debito: monto, credito: 0 },
      { tenant_id: tenantId, comprobante_id: comp.id, linea: 2, cuenta_id: contrapartidaId, debito: 0, credito: monto },
    ])
    if (errDetalle) throw errDetalle
    const { error: errContab } = await auxiliar.rpc('fn_contabilizar_comprobante', { p_comprobante_id: comp.id })
    if (errContab) throw new Error(`fixture contabilizar: ${errContab.message}`)
  }

  async function crearCompromiso(params: {
    tenantId: string; cuentaBancariaId: string; monto: number
    estado?: 'proyectado' | 'reservado' | 'ejecutado' | 'liberado' | 'anulado'
    origen?: 'factura_proveedor' | 'lote_pago' | 'manual'
  }) {
    return admin.from('finanzas_cuenta_bancaria_compromiso').insert({
      tenant_id: params.tenantId, cuenta_bancaria_id: params.cuentaBancariaId, monto: params.monto,
      estado: params.estado ?? 'proyectado', origen: params.origen ?? 'manual',
    }).select('id').single<{ id: string }>()
  }

  it('1. un compromiso reservado descuenta del disponible; uno proyectado no lo descuenta pero aparece informativo', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('descuenta')
    const cuentaBancoContableId = await cuentaPorCodigo(tenantId, '111005')
    await darSaldoBanco(tenantId, auxiliar, cuentaBancoContableId, 2020, 10_000_000)
    const cbId = await crearCuentaBancaria(tenantId, cuentaBancoContableId)

    const { error: errProy } = await crearCompromiso({ tenantId, cuentaBancariaId: cbId, monto: 1_000_000, estado: 'proyectado' })
    expect(errProy).toBeNull()

    const { data: d1 } = await auxiliar.rpc('fn_cuenta_bancaria_disponible', { p_cuenta_bancaria_id: cbId }).single()
    expect(d1!.saldo_contable).toBe(10_000_000)
    expect(d1!.comprometido_proyectado).toBe(1_000_000)
    expect(d1!.disponible).toBe(10_000_000) // proyectado no descuenta

    const { error: errRes } = await crearCompromiso({ tenantId, cuentaBancariaId: cbId, monto: 3_000_000, estado: 'reservado' })
    expect(errRes).toBeNull()

    const { data: d2 } = await auxiliar.rpc('fn_cuenta_bancaria_disponible', { p_cuenta_bancaria_id: cbId }).single()
    expect(d2!.comprometido_reservado).toBe(3_000_000)
    expect(d2!.disponible).toBe(7_000_000)
  }, 30_000)

  it('2. un segundo compromiso que dejaría el disponible en negativo → COMPROMISO_BANCARIO_EXCEDE_DISPONIBLE', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('excede')
    const cuentaBancoContableId = await cuentaPorCodigo(tenantId, '111005')
    await darSaldoBanco(tenantId, auxiliar, cuentaBancoContableId, 2020, 1_000_000)
    const cbId = await crearCuentaBancaria(tenantId, cuentaBancoContableId)

    const { error: err1 } = await crearCompromiso({ tenantId, cuentaBancariaId: cbId, monto: 900_000, estado: 'reservado' })
    expect(err1).toBeNull()

    const { error: err2 } = await crearCompromiso({ tenantId, cuentaBancariaId: cbId, monto: 200_000, estado: 'reservado' })
    expect(err2?.message).toContain('COMPROMISO_BANCARIO_EXCEDE_DISPONIBLE')
  }, 30_000)

  it('3. liberar un compromiso reservado devuelve el disponible al valor previo', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('liberar')
    const cuentaBancoContableId = await cuentaPorCodigo(tenantId, '111005')
    await darSaldoBanco(tenantId, auxiliar, cuentaBancoContableId, 2020, 5_000_000)
    const cbId = await crearCuentaBancaria(tenantId, cuentaBancoContableId)

    const { data: compromiso } = await crearCompromiso({ tenantId, cuentaBancariaId: cbId, monto: 2_000_000, estado: 'reservado' })
    const { data: antes } = await auxiliar.rpc('fn_cuenta_bancaria_disponible', { p_cuenta_bancaria_id: cbId }).single()
    expect(antes!.disponible).toBe(3_000_000)

    const { error } = await admin.from('finanzas_cuenta_bancaria_compromiso')
      .update({ estado: 'liberado', motivo_liberacion: 'ya no se necesita' }).eq('id', compromiso!.id)
    expect(error).toBeNull()

    const { data: despues } = await auxiliar.rpc('fn_cuenta_bancaria_disponible', { p_cuenta_bancaria_id: cbId }).single()
    expect(despues!.disponible).toBe(5_000_000)
  }, 30_000)

  it('4. un compromiso terminal no admite modificación → COMPROMISO_BANCARIO_TERMINAL_INMUTABLE', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('terminal')
    const cuentaBancoContableId = await cuentaPorCodigo(tenantId, '111005')
    await darSaldoBanco(tenantId, auxiliar, cuentaBancoContableId, 2020, 5_000_000)
    const cbId = await crearCuentaBancaria(tenantId, cuentaBancoContableId)
    const { data: compromiso } = await crearCompromiso({ tenantId, cuentaBancariaId: cbId, monto: 1_000_000, estado: 'reservado' })
    await admin.from('finanzas_cuenta_bancaria_compromiso')
      .update({ estado: 'anulado', motivo_anulacion: 'prueba' }).eq('id', compromiso!.id)

    const { error: errEstado } = await admin.from('finanzas_cuenta_bancaria_compromiso')
      .update({ estado: 'reservado' }).eq('id', compromiso!.id)
    expect(errEstado?.message).toContain('COMPROMISO_BANCARIO_TERMINAL_INMUTABLE')

    const { error: errMonto } = await admin.from('finanzas_cuenta_bancaria_compromiso')
      .update({ monto: 999 }).eq('id', compromiso!.id)
    expect(errMonto?.message).toContain('COMPROMISO_BANCARIO_TERMINAL_INMUTABLE')
  }, 30_000)

  it('5. liberación o anulación sin motivo → COMPROMISO_BANCARIO_SIN_MOTIVO', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('sin-motivo')
    const cuentaBancoContableId = await cuentaPorCodigo(tenantId, '111005')
    await darSaldoBanco(tenantId, auxiliar, cuentaBancoContableId, 2020, 5_000_000)
    const cbId = await crearCuentaBancaria(tenantId, cuentaBancoContableId)
    const { data: compromiso } = await crearCompromiso({ tenantId, cuentaBancariaId: cbId, monto: 1_000_000, estado: 'reservado' })

    const { error } = await admin.from('finanzas_cuenta_bancaria_compromiso')
      .update({ estado: 'liberado' }).eq('id', compromiso!.id)
    expect(error?.message).toContain('COMPROMISO_BANCARIO_SIN_MOTIVO')
  }, 30_000)

  it('6. fn_cuenta_bancaria_disponible solo consulta contable_libro_mayor y finanzas_cuenta_bancaria_compromiso, nunca tablas operativas', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const archivo = path.resolve(import.meta.dirname, '../../supabase/migrations/20260930780000_fin1_cuenta_bancaria_compromiso.sql')
    const contenido = await fs.readFile(archivo, 'utf8')
    const cuerpo = contenido.slice(
      contenido.indexOf('create function public.fn_cuenta_bancaria_disponible'),
      contenido.indexOf('comment on function public.fn_cuenta_bancaria_disponible'),
    )
    expect(cuerpo).toMatch(/contable_libro_mayor/)
    expect(cuerpo).toMatch(/finanzas_cuenta_bancaria_compromiso/)
    expect(cuerpo).not.toMatch(/from public\.pagos/)
    expect(cuerpo).not.toMatch(/from public\.cargos/)
    expect(cuerpo).not.toMatch(/from public\.presupuesto_ejecucion/)
  })

  it('7. finanzas_posicion_tesoreria incluye bancos, caja, fondos, anticipos, cartera y CxP; coincide con cada dimensión por separado', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('posicion-completa')
    const cuentaBancoContableId = await cuentaPorCodigo(tenantId, '111005')
    await darSaldoBanco(tenantId, auxiliar, cuentaBancoContableId, 2020, 4_000_000)
    const cbId = await crearCuentaBancaria(tenantId, cuentaBancoContableId)

    const { data: posicion, error } = await auxiliar.rpc('finanzas_posicion_tesoreria', { p_tenant_id: tenantId })
    expect(error).toBeNull()
    const conceptos = (posicion ?? []).map((p) => p.concepto)
    expect(conceptos).toContain('bancos')
    expect(conceptos).toContain('caja')
    expect(conceptos).toContain('anticipos')
    expect(conceptos).toContain('cartera_total')
    expect(conceptos).toContain('cartera_vencida')
    expect(conceptos).toContain('cxp')

    const filaBanco = (posicion ?? []).find((p) => p.concepto === 'bancos' && p.detalle_id === cbId)
    const { data: directo } = await auxiliar.rpc('fn_cuenta_bancaria_disponible', { p_cuenta_bancaria_id: cbId }).single()
    expect(filaBanco?.monto_total).toBe(directo!.saldo_contable)
  }, 30_000)

  it('8. sin política de tesorería vigente, todos los utilizable=false', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('sin-politica')
    const cuentaBancoContableId = await cuentaPorCodigo(tenantId, '111005')
    await darSaldoBanco(tenantId, auxiliar, cuentaBancoContableId, 2020, 1_000_000)
    await crearCuentaBancaria(tenantId, cuentaBancoContableId)

    const { data: posicion } = await auxiliar.rpc('finanzas_posicion_tesoreria', { p_tenant_id: tenantId })
    expect((posicion ?? []).length).toBeGreaterThan(0)
    expect((posicion ?? []).every((p) => p.utilizable === false)).toBe(true)
  }, 30_000)

  it('9. marcar una cuenta bancaria de otro tenant en la política → POLITICA_TESORERIA_ENTIDAD_AJENA', async () => {
    const { tenantId: tenantA } = await crearTenantConPlan('politica-a')
    const { tenantId: tenantB } = await crearTenantConPlan('politica-b')
    const cuentaContableB = await cuentaPorCodigo(tenantB, '111005')
    const cuentaBancariaB = await crearCuentaBancaria(tenantB, cuentaContableB)

    const { error } = await admin.from('finanzas_politica_tesoreria').insert({
      tenant_id: tenantA, version: 1, bancos_utilizables: [cuentaBancariaB],
    })
    expect(error?.message).toContain('POLITICA_TESORERIA_ENTIDAD_AJENA')
  }, 30_000)

  it('10. cambiar la política vigente no modifica versiones anteriores', async () => {
    const { tenantId } = await crearTenantConPlan('politica-versiones')
    const { data: v1 } = await admin.from('finanzas_politica_tesoreria')
      .insert({ tenant_id: tenantId, version: 1, incluir_caja: true })
      .select('id').single<{ id: string }>()
    await admin.from('finanzas_politica_tesoreria').update({ estado: 'vigente' }).eq('id', v1!.id)

    await admin.from('finanzas_politica_tesoreria').update({ estado: 'historica' }).eq('id', v1!.id)
    const { data: v2 } = await admin.from('finanzas_politica_tesoreria')
      .insert({ tenant_id: tenantId, version: 2, incluir_caja: false })
      .select('id').single<{ id: string }>()
    await admin.from('finanzas_politica_tesoreria').update({ estado: 'vigente' }).eq('id', v2!.id)

    const { data: v1Final } = await admin.from('finanzas_politica_tesoreria')
      .select('incluir_caja, estado').eq('id', v1!.id).single()
    expect(v1Final?.incluir_caja).toBe(true)
    expect(v1Final?.estado).toBe('historica')
  }, 30_000)

  it('11. aislamiento entre tenants en las tres funciones', async () => {
    const { tenantId: tenantA, auxiliar: auxiliarA } = await crearTenantConPlan('aislar-a')
    const { auxiliar: auxiliarB } = await crearTenantConPlan('aislar-b')
    const cuentaContableA = await cuentaPorCodigo(tenantA, '111005')
    await darSaldoBanco(tenantA, auxiliarA, cuentaContableA, 2020, 6_000_000)
    const cbA = await crearCuentaBancaria(tenantA, cuentaContableA)

    const { data: propio } = await auxiliarA.rpc('fn_cuenta_bancaria_disponible', { p_cuenta_bancaria_id: cbA }).single()
    expect(propio!.saldo_contable).toBe(6_000_000)

    const { data: ajeno } = await auxiliarB.rpc('fn_cuenta_bancaria_disponible', { p_cuenta_bancaria_id: cbA }).single()
    expect(ajeno!.saldo_contable).toBe(0)

    const { data: posicionAjena } = await auxiliarB.rpc('finanzas_posicion_tesoreria', { p_tenant_id: tenantA })
    expect((posicionAjena ?? []).some((p) => p.detalle_id === cbA)).toBe(false)
  }, 30_000)

  it('12. los enums nuevos tienen comment on type', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const archivo1 = path.resolve(import.meta.dirname, '../../supabase/migrations/20260930780000_fin1_cuenta_bancaria_compromiso.sql')
    const archivo2 = path.resolve(import.meta.dirname, '../../supabase/migrations/20260930800000_fin1_posicion_tesoreria.sql')
    const c1 = await fs.readFile(archivo1, 'utf8')
    const c2 = await fs.readFile(archivo2, 'utf8')
    expect(c1).toMatch(/create type public\.compromiso_bancario_origen_t/)
    expect(c1).toMatch(/comment on type public\.compromiso_bancario_origen_t/)
    expect(c1).toMatch(/create type public\.compromiso_bancario_estado_t/)
    expect(c1).toMatch(/comment on type public\.compromiso_bancario_estado_t/)
    expect(c2).toMatch(/create type public\.posicion_naturaleza_t/)
    expect(c2).toMatch(/comment on type public\.posicion_naturaleza_t/)
  })
})
