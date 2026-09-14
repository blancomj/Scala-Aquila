/**
 * FIN-3 (20260931220000-20260931300000) — programación y ejecución de pagos por lote.
 * Ver Casos de uso/Tres Modulos/Financiero/FIN_03_lotes_pago.md §5 (16 pruebas obligatorias) y
 * D-59 en DECISIONES.md.
 *
 * Tres decisiones confirmadas con el usuario antes de implementar (`AskUserQuestion`): (1) el
 * motor de conciliación bancaria existente (extracto_bancario/extracto_linea/
 * conciliacion_propuesta) está construido solo para recaudo entrante (conciliacion_propuesta.
 * inmueble_id not null) — no puede representar un pago a proveedor. Se agregó una FK pasiva
 * finanzas_lotes_pago.extracto_linea_id (mismo patrón que fondo_movimientos.extracto_linea_id) +
 * fn_finanzas_conciliar_lote(), sin modificar el motor existente. (2) "criticidad_proveedor" que
 * pide finanzas_facturas_pagables() no existe como concepto en el repo (MANT-1 es criticidad de
 * ACTIVOS, MANT-5 es evaluación de DESEMPEÑO) — se omite esa columna. (3) tabla de umbral propia
 * (finanzas_politica_aprobacion_lote), no se reutiliza finanzas_politica_aprobacion_pago de FIN-2.
 *
 * Reutiliza el patrón de fixtures de tests/finanzas/posicion-tesoreria.test.ts (cuenta bancaria
 * con saldo contable real vía comprobante contabilizado, no un INSERT directo de saldo) combinado
 * con el de tests/finanzas/facturas-proveedor.test.ts (escenario con create_tenant(), factura
 * aprobada).
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import type { Database } from '@aquila/shared'
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
  console.warn('SALTADO tests/finanzas/lotes-pago: faltan variables de Supabase en .env')
}

const ANIO = 2035
const MES = 3
const FECHA = `${String(ANIO)}-${String(MES).padStart(2, '0')}-10`
const FECHA_VENCIMIENTO = `${String(ANIO)}-${String(MES).padStart(2, '0')}-25`

// Año real del PASADO, exclusivo para el comprobante que le da saldo a la cuenta bancaria —
// guard_finanzas_compromiso_bancario llama fn_cuenta_bancaria_disponible(cuenta, now()) con la
// fecha real de hoy, así que el saldo debe quedar contabilizado en o antes de hoy para contar
// (mismo motivo documentado en posicion-tesoreria.test.ts). ANIO (futuro ficticio) sigue usándose
// para periodos/facturas/lotes, que no dependen de now().
const SALDO_ANIO = 2020

d('FIN-3: programación y ejecución de pagos por lote', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', tipo).eq('codigo', codigo).is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  async function crearPeriodo(tenantId: string): Promise<string> {
    const { data, error } = await admin
      .from('periodos').insert({ tenant_id: tenantId, anio: ANIO, mes: MES }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture periodo: ${error.message}`)
    return data.id
  }

  async function unaHojaEgreso(tenantId: string): Promise<string> {
    const { data, error } = await admin
      .from('presupuesto_cuenta')
      .select('id, contable_cuenta:contable_cuenta_id!inner(requiere_tercero)')
      .eq('tenant_id', tenantId).eq('naturaleza', 'egreso').eq('es_hoja', true).eq('activa', true)
      .eq('contable_cuenta.requiere_tercero', false)
      .limit(1).single<{ id: string }>()
    if (error) throw new Error(`fixture hoja egreso: ${error.message}`)
    return data.id
  }

  async function unCentroCostoId(): Promise<number> {
    return idListaTipos('CENTRO_COSTO', 'administracion')
  }

  async function crearTercero(tenantId: string, apellido: string): Promise<string> {
    const [tipoIdent, estado] = await Promise.all([
      idListaTipos('TIPO_IDENTIFICACION', 'cedula'),
      idListaTipos('ESTADO_TERCERO', 'activo'),
    ])
    const { data, error } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenantId, tipo_persona: 'natural', tipo_identificacion_id: tipoIdent,
        numero_documento: `${apellido}-${RUN_ID}`, primer_nombre: 'Proveedor', primer_apellido: apellido,
        estado_id: estado,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture tercero ${apellido}: ${error.message}`)
    return data.id
  }

  async function crearDocumento(tenantId: string, nombre: string, tipoDocumentoCodigo: string): Promise<string> {
    const tipoDocId = await idListaTipos('TIPO_DOCUMENTO', tipoDocumentoCodigo)
    const { data, error } = await admin
      .from('documentos')
      .insert({ tenant_id: tenantId, tipo_documento_id: tipoDocId, nombre_archivo: `${nombre}.pdf`, storage_path: `test/${nombre}.pdf` })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture documento ${nombre}: ${error.message}`)
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

  async function cuentaPorCodigo(tenantId: string, codigo: string): Promise<string> {
    const { data, error } = await admin
      .from('contable_cuenta').select('id').eq('tenant_id', tenantId).eq('codigo', codigo)
      .single<{ id: string }>()
    if (error) throw new Error(`fixture cuenta contable ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearCuentaBancaria(tenantId: string, contableCuentaId: string): Promise<string> {
    const { data, error } = await admin
      .from('cuentas_bancarias')
      .insert({
        tenant_id: tenantId, entidad_financiera_id: await entidadFinancieraId(),
        tipo_cuenta: 'ahorros', numero_cuenta: `FIN3-${Math.random().toString(36).slice(2, 8)}`,
        contable_cuenta_id: contableCuentaId, activa: true,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture cuenta_bancaria: ${error.message}`)
    return data.id
  }

  async function tipoComprobanteId(codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', 'TIPO_COMPROBANTE').eq('codigo', codigo)
      .single<{ id: number }>()
    if (error) throw error
    return data.id
  }

  /** Saldo contable real vía comprobante contabilizado — mismo patrón que FIN-1
   * (posicion-tesoreria.test.ts), para que fn_cuenta_bancaria_disponible se pruebe contra lo mismo
   * que lee contable_libro_mayor en producción. Crea su PROPIO periodo en SALDO_ANIO (pasado
   * real) — distinto del periodo (ANIO, futuro ficticio) de facturas/lotes, sin colisión posible
   * con la unique (tenant_id, anio, mes) porque son años distintos. */
  async function darSaldoBanco(tenantId: string, cliente: Cliente, cuentaBancoContableId: string, monto: number): Promise<void> {
    const { data: periodo, error: errPeriodo } = await admin
      .from('periodos').insert({ tenant_id: tenantId, anio: SALDO_ANIO, mes: 1 }).select('id').single<{ id: string }>()
    if (errPeriodo) throw new Error(`fixture periodo saldo: ${errPeriodo.message}`)

    const tipoId = await tipoComprobanteId('INGRESO')
    const contrapartidaId = await cuentaPorCodigo(tenantId, '3310')
    const { data: comp, error: errComp } = await admin
      .from('contable_comprobante')
      .insert({
        tenant_id: tenantId, periodo_id: periodo.id, tipo_id: tipoId, anio: SALDO_ANIO,
        fecha: `${String(SALDO_ANIO)}-01-15`, descripcion: 'FIN-3 fixture: saldo inicial de banco',
      })
      .select('id').single<{ id: string }>()
    if (errComp) throw errComp
    const { error: errDetalle } = await admin.from('contable_comprobante_detalle').insert([
      { tenant_id: tenantId, comprobante_id: comp.id, linea: 1, cuenta_id: cuentaBancoContableId, debito: monto, credito: 0 },
      { tenant_id: tenantId, comprobante_id: comp.id, linea: 2, cuenta_id: contrapartidaId, debito: 0, credito: monto },
    ])
    if (errDetalle) throw errDetalle
    const { error: errContab } = await cliente.rpc('fn_contabilizar_comprobante', { p_comprobante_id: comp.id })
    if (errContab) throw new Error(`fixture contabilizar: ${errContab.message}`)
  }

  interface Escenario {
    tenantId: string
    cliente: Cliente
    proveedorId: string
    cuentaId: string
    centroCostoId: number
    documentoId: string
    cuentaBancariaId: string
    periodoId: string
  }

  /** Crea el tenant, siembra el periodo/plan/PUC (create_tenant), un proveedor, y una cuenta
   * bancaria con `montoSaldo` de saldo contable real. */
  async function prepararEscenario(etiqueta: string, montoSaldo: number): Promise<Escenario> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)
    const { data: tenant, error } = await cliente
      .rpc('create_tenant', { p_name: `FIN-3 ${etiqueta}`, p_slug: `f3-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)

    const [proveedorId, cuentaId, centroCostoId, documentoId, periodoId] = await Promise.all([
      crearTercero(tenant.id, etiqueta),
      unaHojaEgreso(tenant.id),
      unCentroCostoId(),
      crearDocumento(tenant.id, etiqueta, 'factura_proveedor'),
      crearPeriodo(tenant.id),
    ])

    const cuentaBancoContableId = await cuentaPorCodigo(tenant.id, '111005')
    await darSaldoBanco(tenant.id, cliente, cuentaBancoContableId, montoSaldo)
    const cuentaBancariaId = await crearCuentaBancaria(tenant.id, cuentaBancoContableId)

    return { tenantId: tenant.id, cliente, proveedorId, cuentaId, centroCostoId, documentoId, cuentaBancariaId, periodoId }
  }

  type FacturaInsert = Database['public']['Tables']['finanzas_facturas_proveedor']['Insert']
  function filaFactura(e: Escenario, overrides: Partial<FacturaInsert> = {}): FacturaInsert {
    return {
      tenant_id: e.tenantId, proveedor_id: e.proveedorId, presupuesto_cuenta_id: e.cuentaId,
      centro_costo_id: e.centroCostoId, documento_soporte_id: e.documentoId,
      numero_documento: `FAC-${Math.random().toString(36).slice(2, 8)}-${RUN_ID}`,
      fecha_emision: FECHA, fecha_vencimiento: FECHA_VENCIMIENTO,
      subtotal: 1_000_000, iva_generado: 0, iva_descontable: 0,
      total_bruto: 1_000_000, total_retenciones: 0, total_neto_pagar: 1_000_000,
      ...overrides,
    }
  }

  /** Crea una factura y la lleva hasta 'aprobada' (borrador→registrada→en_revision→aprobada),
   * dejándola lista para entrar a un lote. Devuelve la fila aprobada (con presupuesto_ejecucion_id). */
  async function crearFacturaAprobada(e: Escenario, overrides: Partial<FacturaInsert> = {}) {
    const { data: factura, error } = await admin
      .from('finanzas_facturas_proveedor').insert(filaFactura(e, overrides)).select('*').single()
    if (error) throw new Error(`fixture factura: ${error.message}`)
    const { error: e1 } = await admin.from('finanzas_facturas_proveedor').update({ estado: 'registrada' }).eq('id', factura.id)
    if (e1) throw new Error(`fixture -> registrada: ${e1.message}`)
    const { error: e2 } = await admin.from('finanzas_facturas_proveedor').update({ estado: 'en_revision' }).eq('id', factura.id)
    if (e2) throw new Error(`fixture -> en_revision: ${e2.message}`)
    const { data: aprobada, error: errAprobar } = await e.cliente
      .rpc('fn_finanzas_aprobar_factura', { p_factura_id: factura.id })
      .single<Database['public']['Tables']['finanzas_facturas_proveedor']['Row']>()
    if (errAprobar) throw new Error(`fixture aprobar factura: ${errAprobar.message}`)
    return aprobada
  }

  /** Crea una factura SIN aprobar (queda en 'en_revision'), para la prueba 1. */
  async function crearFacturaSinAprobar(e: Escenario, overrides: Partial<FacturaInsert> = {}) {
    const { data: factura, error } = await admin
      .from('finanzas_facturas_proveedor').insert(filaFactura(e, overrides)).select('*').single()
    if (error) throw new Error(`fixture factura: ${error.message}`)
    await admin.from('finanzas_facturas_proveedor').update({ estado: 'registrada' }).eq('id', factura.id)
    await admin.from('finanzas_facturas_proveedor').update({ estado: 'en_revision' }).eq('id', factura.id)
    return factura
  }

  type LoteInsert = Database['public']['Tables']['finanzas_lotes_pago']['Insert']
  // anio/numero los asigna siempre guard_finanzas_lote_pago (BEFORE INSERT) — nunca el cliente,
  // así que el fixture no los provee y castea el resto del payload al tipo generado.
  async function crearLote(e: Escenario, overrides: Partial<LoteInsert> = {}) {
    const { data, error } = await admin
      .from('finanzas_lotes_pago')
      .insert({ tenant_id: e.tenantId, cuenta_bancaria_id: e.cuentaBancariaId, fecha_programada: FECHA, ...overrides } as LoteInsert)
      .select('*').single()
    if (error) throw new Error(`fixture lote: ${error.message}`)
    return data
  }

  async function agregarItem(e: Escenario, loteId: string, facturaId: string, montoAPagar: number, esPagoParcial = false) {
    return admin.from('finanzas_lote_items').insert({
      tenant_id: e.tenantId, lote_id: loteId, factura_id: facturaId,
      monto_a_pagar: montoAPagar, es_pago_parcial: esPagoParcial,
    }).select('*').single()
  }

  it('1. añadir al lote una factura no aprobada → LOTE_ITEM_FACTURA_NO_APROBADA', async () => {
    const e = await prepararEscenario('no-aprobada', 5_000_000)
    const factura = await crearFacturaSinAprobar(e)
    const lote = await crearLote(e)
    const { error } = await agregarItem(e, lote.id, factura.id, 1_000_000)
    expect(error?.message).toContain('LOTE_ITEM_FACTURA_NO_APROBADA')
  }, 30_000)

  it('2. añadir dos veces la misma factura (a dos lotes) → LOTE_ITEM_FACTURA_YA_PROGRAMADA', async () => {
    const e = await prepararEscenario('ya-programada', 5_000_000)
    const factura = await crearFacturaAprobada(e)
    const loteA = await crearLote(e)
    const { error: e1 } = await agregarItem(e, loteA.id, factura.id, 1_000_000)
    expect(e1).toBeNull()

    const loteB = await crearLote(e)
    const { error: e2 } = await agregarItem(e, loteB.id, factura.id, 1_000_000)
    expect(e2?.message).toContain('LOTE_ITEM_FACTURA_YA_PROGRAMADA')
  }, 30_000)

  it('3. pago no parcial con monto distinto al neto de la factura → LOTE_ITEM_MONTO_INCONSISTENTE', async () => {
    const e = await prepararEscenario('monto-inconsistente', 5_000_000)
    const factura = await crearFacturaAprobada(e)
    const lote = await crearLote(e)
    const { error } = await agregarItem(e, lote.id, factura.id, 900_000, false)
    expect(error?.message).toContain('LOTE_ITEM_MONTO_INCONSISTENTE')
  }, 30_000)

  it('4. pago parcial mayor o igual al pendiente → LOTE_ITEM_PARCIAL_INVALIDO', async () => {
    const e = await prepararEscenario('parcial-invalido', 5_000_000)
    const factura = await crearFacturaAprobada(e)
    const lote = await crearLote(e)
    const { error } = await agregarItem(e, lote.id, factura.id, 1_000_000, true)
    expect(error?.message).toContain('LOTE_ITEM_PARCIAL_INVALIDO')
  }, 30_000)

  it('5. armar un lote cuyo total exceda la disponibilidad de la cuenta bancaria → COMPROMISO_BANCARIO_EXCEDE_DISPONIBLE (prueba central del vínculo con FIN-1)', async () => {
    const e = await prepararEscenario('excede-disponible', 500_000)
    const factura = await crearFacturaAprobada(e)
    const lote = await crearLote(e)
    const { error } = await agregarItem(e, lote.id, factura.id, 1_000_000)
    expect(error?.message).toContain('COMPROMISO_BANCARIO_EXCEDE_DISPONIBLE')
  }, 30_000)

  it('6. un lote conciliado no admite modificación → LOTE_CONCILIADO_INMUTABLE', async () => {
    const e = await prepararEscenario('conciliado-inmutable', 5_000_000)
    const factura = await crearFacturaAprobada(e)
    const lote = await crearLote(e)
    await agregarItem(e, lote.id, factura.id, 1_000_000)
    await admin.from('finanzas_lotes_pago').update({ estado: 'programado' }).eq('id', lote.id)
    const { data: aprobado } = await e.cliente
      .rpc('fn_finanzas_aprobar_lote', { p_lote_id: lote.id })
      .single<Database['public']['Tables']['finanzas_lotes_pago']['Row']>()
    await e.cliente.rpc('fn_finanzas_ejecutar_lote', { p_lote_id: aprobado!.id, p_fecha_ejecucion: FECHA })

    const { data: extracto } = await admin.from('extracto_bancario').insert({
      tenant_id: e.tenantId, cuenta_bancaria_id: e.cuentaBancariaId,
      nombre_archivo: 'extracto.csv', hash_archivo: `hash-${RUN_ID}`,
    }).select('id').single<{ id: string }>()
    const { data: linea } = await admin.from('extracto_linea').insert({
      tenant_id: e.tenantId, extracto_id: extracto!.id, fecha_movimiento: FECHA, monto: -1_000_000,
      descripcion_banco: 'Transferencia proveedor', hash_linea: `hash-linea-${RUN_ID}`,
    }).select('id').single<{ id: string }>()

    await e.cliente.rpc('fn_finanzas_conciliar_lote', { p_lote_id: lote.id, p_extracto_linea_id: linea!.id })

    const { error } = await admin.from('finanzas_lotes_pago').update({ descripcion: 'cambio' }).eq('id', lote.id)
    expect(error?.message).toContain('LOTE_CONCILIADO_INMUTABLE')
  }, 30_000)

  it('7. aprobación con salto de validación no bloqueante sin motivo → LOTE_APROBACION_SIN_JUSTIFICACION', async () => {
    const e = await prepararEscenario('sin-justificacion', 5_000_000)
    const factura = await crearFacturaAprobada(e)

    // Habilitación ya vencida del proveedor — validación no bloqueante (mant_habilitaciones_semaforo).
    const tipoId = await idListaTipos('TIPO_HABILITACION', 'rut')
    const docHabilitacion = await crearDocumento(e.tenantId, 'sin-justificacion-hab', 'habilitacion_proveedor')
    await admin.from('mant_proveedor_habilitacion').insert({
      tenant_id: e.tenantId, tercero_id: e.proveedorId, tipo_id: tipoId, documento_id: docHabilitacion,
      // Fechas reales del pasado (no relativas a ANIO, que es un año futuro ficticio para
      // aislar los fixtures) — mant_habilitaciones_semaforo compara contra current_date real.
      vigente_desde: '2019-01-01', vigente_hasta: '2020-01-01',
    })

    const lote = await crearLote(e)
    await agregarItem(e, lote.id, factura.id, 1_000_000)
    await admin.from('finanzas_lotes_pago').update({ estado: 'programado' }).eq('id', lote.id)

    const { error } = await e.cliente.rpc('fn_finanzas_aprobar_lote', { p_lote_id: lote.id })
    expect(error?.message).toContain('LOTE_APROBACION_SIN_JUSTIFICACION')

    const { data: aprobado, error: errConJustif } = await e.cliente
      .rpc('fn_finanzas_aprobar_lote', { p_lote_id: lote.id, p_justificacion: 'Habilitación vencida, se aprueba de todos modos' })
      .single<Database['public']['Tables']['finanzas_lotes_pago']['Row']>()
    expect(errConJustif).toBeNull()
    expect(aprobado!.estado).toBe('aprobado')
  }, 30_000)

  it('8. al ejecutar un lote, se crean las filas en presupuesto_ejecucion con liquidacion=pagado_banco y las facturas pasan a pagada/pagada_parcial (prueba central)', async () => {
    const e = await prepararEscenario('ejecutar-central', 5_000_000)
    const facturaCompleta = await crearFacturaAprobada(e, { numero_documento: `FAC-completa-${RUN_ID}` })
    const facturaParcial = await crearFacturaAprobada(e, { numero_documento: `FAC-parcial-${RUN_ID}` })

    const lote = await crearLote(e)
    await agregarItem(e, lote.id, facturaCompleta.id, 1_000_000, false)
    await agregarItem(e, lote.id, facturaParcial.id, 400_000, true)
    await admin.from('finanzas_lotes_pago').update({ estado: 'programado' }).eq('id', lote.id)
    await e.cliente.rpc('fn_finanzas_aprobar_lote', { p_lote_id: lote.id })

    const { data: ejecutado, error } = await e.cliente
      .rpc('fn_finanzas_ejecutar_lote', { p_lote_id: lote.id, p_fecha_ejecucion: FECHA })
      .single<Database['public']['Tables']['finanzas_lotes_pago']['Row']>()
    expect(error).toBeNull()
    expect(ejecutado!.estado).toBe('ejecutado')

    const { data: ejecCompleta } = await admin
      .from('finanzas_facturas_proveedor').select('estado').eq('id', facturaCompleta.id).single()
    expect(ejecCompleta?.estado).toBe('pagada')
    const { data: ejecParcial } = await admin
      .from('finanzas_facturas_proveedor').select('estado').eq('id', facturaParcial.id).single()
    expect(ejecParcial?.estado).toBe('pagada_parcial')

    const { data: filasPago } = await admin
      .from('presupuesto_ejecucion').select('*').eq('liquidacion', 'pagado_banco').eq('tenant_id', e.tenantId)
    expect(filasPago).toHaveLength(2)
    for (const fila of filasPago!) {
      expect(fila.cuenta_bancaria_id).toBe(e.cuentaBancariaId)
    }
    const montoTotal = filasPago!.reduce((acc, f) => acc + f.monto, 0)
    expect(montoTotal).toBe(1_400_000)
  }, 30_000)

  it('9. al anular un lote aprobado, los compromisos se liberan y las facturas vuelven a aprobada; cero filas en presupuesto_ejecucion', async () => {
    const e = await prepararEscenario('anular-aprobado', 5_000_000)
    const factura = await crearFacturaAprobada(e)
    const lote = await crearLote(e)
    await agregarItem(e, lote.id, factura.id, 1_000_000)
    // compromiso_bancario_id lo asigna un AFTER INSERT (fn_finanzas_lote_item_crear_compromiso) —
    // no aparece en el RETURNING del INSERT original, hay que releer la fila.
    const { data: item } = await admin
      .from('finanzas_lote_items').select('*').eq('lote_id', lote.id).eq('factura_id', factura.id).single()
    await admin.from('finanzas_lotes_pago').update({ estado: 'programado' }).eq('id', lote.id)
    await e.cliente.rpc('fn_finanzas_aprobar_lote', { p_lote_id: lote.id })

    const { count: antes } = await admin
      .from('presupuesto_ejecucion').select('id', { count: 'exact', head: true }).eq('tenant_id', e.tenantId)

    const { data: anulado, error } = await e.cliente
      .rpc('fn_finanzas_anular_lote', { p_lote_id: lote.id, p_motivo: 'prueba de anulación' })
      .single<Database['public']['Tables']['finanzas_lotes_pago']['Row']>()
    expect(error).toBeNull()
    expect(anulado!.estado).toBe('anulado')

    const { data: facturaFinal } = await admin
      .from('finanzas_facturas_proveedor').select('estado').eq('id', factura.id).single()
    expect(facturaFinal?.estado).toBe('aprobada')

    const { data: compromiso } = await admin
      .from('finanzas_cuenta_bancaria_compromiso').select('estado').eq('id', item!.compromiso_bancario_id!).single()
    expect(compromiso?.estado).toBe('liberado')

    const { count: despues } = await admin
      .from('presupuesto_ejecucion').select('id', { count: 'exact', head: true }).eq('tenant_id', e.tenantId)
    expect(despues).toBe(antes ?? 0)
  }, 30_000)

  it('10. no se crea ningún comprobante contable durante la ejecución del lote', async () => {
    const e = await prepararEscenario('sin-comprobante', 5_000_000)
    const factura = await crearFacturaAprobada(e)
    const lote = await crearLote(e)
    await agregarItem(e, lote.id, factura.id, 1_000_000)
    await admin.from('finanzas_lotes_pago').update({ estado: 'programado' }).eq('id', lote.id)
    await e.cliente.rpc('fn_finanzas_aprobar_lote', { p_lote_id: lote.id })

    const { count: antes } = await admin
      .from('contable_comprobante').select('id', { count: 'exact', head: true }).eq('tenant_id', e.tenantId)

    await e.cliente.rpc('fn_finanzas_ejecutar_lote', { p_lote_id: lote.id, p_fecha_ejecucion: FECHA })

    const { count: despues } = await admin
      .from('contable_comprobante').select('id', { count: 'exact', head: true }).eq('tenant_id', e.tenantId)
    expect(despues).toBe(antes ?? 0)
  }, 30_000)

  it('11. materializar CO-3 sobre las filas creadas por el lote produce el comprobante correcto (retenciones: hueco declarado, CO-8 no existe)', async () => {
    const e = await prepararEscenario('materializacion', 5_000_000)
    const factura = await crearFacturaAprobada(e)
    const lote = await crearLote(e)
    await agregarItem(e, lote.id, factura.id, 1_000_000)
    await admin.from('finanzas_lotes_pago').update({ estado: 'programado' }).eq('id', lote.id)
    await e.cliente.rpc('fn_finanzas_aprobar_lote', { p_lote_id: lote.id })
    await e.cliente.rpc('fn_finanzas_ejecutar_lote', { p_lote_id: lote.id, p_fecha_ejecucion: FECHA })

    // Sin CO-8, ninguna factura puede tener retenciones reales (guard bloquea el insert por
    // completo) — se verifica que el hueco sigue declarado, no se inventa el caso "con retenciones".
    const { data: retenciones } = await admin.from('finanzas_factura_retencion').select('id').eq('factura_id', factura.id)
    expect(retenciones).toHaveLength(0)

    const { error: errMat } = await e.cliente
      .rpc('fn_contabilizar_periodo', { p_tenant_id: e.tenantId, p_periodo_id: e.periodoId })
    expect(errMat).toBeNull()

    const { data: conciliacion, error: errConc } = await admin
      .rpc('contable_conciliacion_proyeccion', {
        p_tenant_id: e.tenantId, p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31`,
      })
    expect(errConc).toBeNull()
    expect(conciliacion).toHaveLength(0)
  }, 30_000)

  it('12. la conciliación con el motor de bancos cierra el lote a conciliado solo cuando el usuario confirma, no cuando existe la línea', async () => {
    const e = await prepararEscenario('conciliacion-explicita', 5_000_000)
    const factura = await crearFacturaAprobada(e)
    const lote = await crearLote(e)
    await agregarItem(e, lote.id, factura.id, 1_000_000)
    await admin.from('finanzas_lotes_pago').update({ estado: 'programado' }).eq('id', lote.id)
    await e.cliente.rpc('fn_finanzas_aprobar_lote', { p_lote_id: lote.id })
    await e.cliente.rpc('fn_finanzas_ejecutar_lote', { p_lote_id: lote.id, p_fecha_ejecucion: FECHA })

    const { data: extracto } = await admin.from('extracto_bancario').insert({
      tenant_id: e.tenantId, cuenta_bancaria_id: e.cuentaBancariaId,
      nombre_archivo: 'extracto2.csv', hash_archivo: `hash2-${RUN_ID}`,
    }).select('id').single<{ id: string }>()
    const { data: linea } = await admin.from('extracto_linea').insert({
      tenant_id: e.tenantId, extracto_id: extracto!.id, fecha_movimiento: FECHA, monto: -1_000_000,
      descripcion_banco: 'Transferencia proveedor', hash_linea: `hash2-linea-${RUN_ID}`,
    }).select('id').single<{ id: string }>()

    // La línea existe, pero nadie confirmó todavía — el lote sigue 'ejecutado'.
    const { data: antesConfirmar } = await admin.from('finanzas_lotes_pago').select('estado').eq('id', lote.id).single()
    expect(antesConfirmar?.estado).toBe('ejecutado')

    const { data: conciliado, error } = await e.cliente
      .rpc('fn_finanzas_conciliar_lote', { p_lote_id: lote.id, p_extracto_linea_id: linea!.id })
      .single<Database['public']['Tables']['finanzas_lotes_pago']['Row']>()
    expect(error).toBeNull()
    expect(conciliado!.estado).toBe('conciliado')
    expect(conciliado!.extracto_linea_id).toBe(linea!.id)
  }, 30_000)

  it('13. consecutivo sin huecos', async () => {
    const e = await prepararEscenario('consecutivo', 5_000_000)
    const lote1 = await crearLote(e)
    const lote2 = await crearLote(e)
    const lote3 = await crearLote(e)
    expect([lote1.numero, lote2.numero, lote3.numero]).toEqual([lote1.numero, lote1.numero + 1, lote1.numero + 2])
    expect(lote1.anio).toBe(ANIO)
  }, 30_000)

  it('14. sin umbral parametrizado, todo lote exige administrador (nunca auxiliar)', async () => {
    const e = await prepararEscenario('sin-umbral-admin', 5_000_000)
    const factura = await crearFacturaAprobada(e)
    const lote = await crearLote(e)
    await agregarItem(e, lote.id, factura.id, 1_000_000)
    await admin.from('finanzas_lotes_pago').update({ estado: 'programado' }).eq('id', lote.id)

    const usuarioAuxiliar = await crearUsuario(admin, 'sin-umbral-aux')
    usuariosCreados.push(usuarioAuxiliar)
    await crearMembership(admin, e.tenantId, usuarioAuxiliar.id, 'auxiliar')
    const auxiliar = await clienteComo(env!, usuarioAuxiliar)

    const { error } = await auxiliar.rpc('fn_finanzas_aprobar_lote', { p_lote_id: lote.id })
    expect(error?.message).toContain('FORBIDDEN')

    const { data: aprobado, error: errAdmin } = await e.cliente
      .rpc('fn_finanzas_aprobar_lote', { p_lote_id: lote.id })
      .single<Database['public']['Tables']['finanzas_lotes_pago']['Row']>()
    expect(errAdmin).toBeNull()
    expect(aprobado!.estado).toBe('aprobado')
  }, 30_000)

  it('15. aislamiento entre tenants', async () => {
    const a = await prepararEscenario('aislar-a', 5_000_000)
    const b = await prepararEscenario('aislar-b', 5_000_000)
    const facturaB = await crearFacturaAprobada(b)

    const loteA = await crearLote(a)
    const { error: errCruzado } = await agregarItem(a, loteA.id, facturaB.id, 1_000_000)
    expect(errCruzado?.message).toContain('LOTE_TENANT_INCONSISTENTE')

    const { data: vistoDesdeB } = await b.cliente.from('finanzas_lotes_pago').select('*').eq('id', loteA.id)
    expect(vistoDesdeB).toHaveLength(0)
  }, 30_000)

  it('16. lote_estado_t tiene comment on type (D-24)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const archivo = path.resolve(import.meta.dirname, '../../supabase/migrations/20260931220000_fin3_vocabulario.sql')
    const contenido = await fs.readFile(archivo, 'utf8')
    expect(contenido).toMatch(/create type public\.lote_estado_t as enum/)
    expect(contenido).toMatch(/comment on type public\.lote_estado_t/)
  })

  // ── BLOQUE H (Fondos, 20260935050000): uso de fondo al ejecutar un lote ──

  /** Fondo activo listo para recibir movimientos — mismo atajo de fixture (UPDATE directo de
   * estado) que tests/tenancy/fondos-modelo-general.test.ts, no la ruta de autorización real. */
  async function crearFondoActivo(e: Escenario, codigo: string): Promise<{ id: string }> {
    const tipoId = await idListaTipos('TIPO_FONDO', 'proyecto')
    const { data, error } = await admin
      .from('fondos')
      .insert({ tenant_id: e.tenantId, codigo, nombre: `Fondo ${codigo}`, naturaleza: 'destinacion_especifica', tipo_id: tipoId })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture fondo ${codigo}: ${error.message}`)
    for (const estado of ['pendiente_autorizacion', 'activo'] as const) {
      const { error: errEstado } = await admin.from('fondos').update({ estado }).eq('id', data.id)
      if (errEstado) throw new Error(`fixture fondo -> ${estado}: ${errEstado.message}`)
    }
    return data
  }

  /** Saldo inicial vía aporte manual (documento_id) — mismo patrón de soporte diferenciado (D-42)
   * que fondos-modelo-general.test.ts, para no depender de BLOQUE K (recaudo) en esta suite. */
  async function darSaldoFondo(e: Escenario, fondoId: string, monto: number): Promise<void> {
    const documentoId = await crearDocumento(e.tenantId, `saldo-fondo-${RUN_ID}`, 'soporte_movimiento_fondo')
    const { error } = await admin.from('fondo_movimientos').insert({
      tenant_id: e.tenantId, fondo_id: fondoId, tipo: 'aporte', monto, documento_id: documentoId,
    })
    if (error) throw new Error(`fixture aporte fondo: ${error.message}`)
  }

  it('17. BLOQUE H: ejecutar un lote con fondo_id registra un uso en fondo_movimientos (lote_pago_id) y reduce el saldo del fondo', async () => {
    const e = await prepararEscenario('bloque-h', 5_000_000)
    const fondo = await crearFondoActivo(e, `FON-H-${RUN_ID}`)
    await darSaldoFondo(e, fondo.id, 2_000_000)

    const factura = await crearFacturaAprobada(e)
    const lote = await crearLote(e, { fondo_id: fondo.id })
    await agregarItem(e, lote.id, factura.id, 1_000_000)
    await admin.from('finanzas_lotes_pago').update({ estado: 'programado' }).eq('id', lote.id)
    await e.cliente.rpc('fn_finanzas_aprobar_lote', { p_lote_id: lote.id })

    const { data: ejecutado, error } = await e.cliente
      .rpc('fn_finanzas_ejecutar_lote', { p_lote_id: lote.id, p_fecha_ejecucion: FECHA })
      .single<Database['public']['Tables']['finanzas_lotes_pago']['Row']>()
    expect(error).toBeNull()
    expect(ejecutado!.estado).toBe('ejecutado')

    const { data: movimiento, error: errMov } = await admin
      .from('fondo_movimientos').select('*').eq('fondo_id', fondo.id).eq('tipo', 'uso')
      .single<{ monto: number; lote_pago_id: string | null; fecha: string; documento_id: string | null }>()
    expect(errMov).toBeNull()
    expect(movimiento?.monto).toBe(ejecutado!.monto_total)
    expect(movimiento?.lote_pago_id).toBe(lote.id)
    expect(movimiento?.documento_id).toBeNull()
    expect(movimiento?.fecha).toBe(FECHA)

    const { data: saldo } = await admin.rpc('fn_fondo_saldo_derivado', { p_fondo_id: fondo.id })
    expect(saldo).toBe(2_000_000 - ejecutado!.monto_total)
  }, 30_000)

  it('18. ejecutar un lote SIN fondo_id no crea ningún fondo_movimientos (regresión)', async () => {
    const e = await prepararEscenario('bloque-h-sin-fondo', 5_000_000)
    const factura = await crearFacturaAprobada(e)
    const lote = await crearLote(e)
    await agregarItem(e, lote.id, factura.id, 1_000_000)
    await admin.from('finanzas_lotes_pago').update({ estado: 'programado' }).eq('id', lote.id)
    await e.cliente.rpc('fn_finanzas_aprobar_lote', { p_lote_id: lote.id })
    await e.cliente.rpc('fn_finanzas_ejecutar_lote', { p_lote_id: lote.id, p_fecha_ejecucion: FECHA })

    const { count } = await admin
      .from('fondo_movimientos').select('id', { count: 'exact', head: true }).eq('tenant_id', e.tenantId)
    expect(count).toBe(0)
  }, 30_000)

  it('19. un uso manual sin documento_id ni lote_pago_id sigue rechazado → FONDO_SOPORTE_REQUERIDO', async () => {
    const e = await prepararEscenario('bloque-h-soporte', 5_000_000)
    const fondo = await crearFondoActivo(e, `FON-H-SOP-${RUN_ID}`)
    await darSaldoFondo(e, fondo.id, 1_000_000)

    const { error } = await admin.from('fondo_movimientos').insert({
      tenant_id: e.tenantId, fondo_id: fondo.id, tipo: 'uso', monto: 100_000,
    })
    expect(error?.message).toContain('FONDO_SOPORTE_REQUERIDO')
  }, 30_000)
})
