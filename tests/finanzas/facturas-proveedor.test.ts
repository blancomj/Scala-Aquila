/**
 * FIN-2 (20260931120000-20260931210000) — factura de proveedor y retenciones aplicadas.
 * Ver Casos de uso/Tres Modulos/Financiero/FIN_02_factura_proveedor.md §6 (16 pruebas
 * obligatorias, tests 17-18 son regresión adicional) y D-58 en DECISIONES.md.
 *
 * Tests 17-18 (20260931210000): encontrados probando la ficha de factura en el navegador contra
 * un tenant real no responsable de IVA — finanzas_factura_descomposicion() debitaba solo el
 * subtotal al gasto pero acreditaba subtotal+iva_generado a proveedores, rompiendo sum(debito) =
 * sum(credito). Los 16 tests originales no lo detectaron porque siempre usaban
 * iva_descontable = iva_generado (recuperación total). Corregido: el IVA no recuperado
 * (iva_generado - iva_descontable) se suma al gasto.
 *
 * Dos decisiones confirmadas con el usuario antes de implementar: (1) la descomposición
 * contable de la factura se resuelve extendiendo contable_movimientos()/
 * fn_contabilizar_periodo() de CO-3 para que reconozcan un hecho de presupuesto_ejecucion
 * enlazado a una factura (finanzas_factura_descomposicion) — mantiene "cero diferencias"
 * proyección-vs-persistido sin tocar contable_hechos(); (2) al escribirse este corte GOB-1 no
 * existía, así que FACTURA_APROBACION_ORGANO_INCOMPETENTE quedó como advertencia inspeccionable
 * (finanzas_factura_advertencia), nunca un bloqueo.
 *
 * ACTUALIZADO al cerrar GOB-1 (D-60 en DECISIONES.md): gobierno_organos ya existe, lo que hizo
 * que el guard original (`if to_regclass('public.gobierno_organos') is null then <advertencia>`,
 * sin ningún `else` real) dejara de insertar la advertencia — un hallazgo de regresión real, no
 * intencional. Corregido en 20260931400000 (GOB-1): la advertencia se inserta siempre que se
 * supera el umbral, ya no condicionada a que la tabla no exista — porque ATRIBUCION_ORGANO
 * (sembrada por GOB-1) sigue sin un código para "aprobar un gasto", así que verificar un órgano
 * competente real sigue sin ser posible. La prueba 5 se actualizó para reflejar esto.
 *
 * Dos adiciones de columna sobre el corte original, encontradas al preparar los fixtures (no en
 * producción): presupuesto_cuenta_id y centro_costo_id en finanzas_facturas_proveedor — sin
 * ellas, aprobar una factura no tendría de dónde sacar la cuenta/centro de costo que
 * presupuesto_ejecucion y fn_contabilizar_comprobante (CO-2) exigen. Ver cabeceras de
 * 20260931140000/20260931190000 y D-58.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import type { Database } from '@aquila/shared'
import {
  clienteAdmin,
  clienteComo,
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
  console.warn('SALTADO tests/finanzas/facturas-proveedor: faltan variables de Supabase en .env')
}

const ANIO = 2033
const MES = 6
const FECHA_EMISION = `${String(ANIO)}-${String(MES).padStart(2, '0')}-10`
const FECHA_VENCIMIENTO = `${String(ANIO)}-${String(MES).padStart(2, '0')}-25`

d('FIN-2: factura de proveedor y retenciones aplicadas', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function crearTenantCompleto(etiqueta: string): Promise<{ tenantId: string; cliente: Cliente }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)
    const { data: tenant, error } = await cliente
      .rpc('create_tenant', { p_name: `FIN-2 ${etiqueta}`, p_slug: `f2-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    return { tenantId: tenant.id, cliente }
  }

  async function crearPeriodo(tenantId: string, anio: number, mes: number): Promise<string> {
    const { data, error } = await admin
      .from('periodos').insert({ tenant_id: tenantId, anio, mes }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture periodo: ${error.message}`)
    return data.id
  }

  /** El periodo (ANIO-MES) ya lo creó prepararEscenario() — se reutiliza aquí, no se crea de
   * nuevo (periodos tiene unique (tenant_id, anio, mes)). */
  async function periodoDeEscenario(tenantId: string): Promise<string> {
    const { data, error } = await admin
      .from('periodos').select('id').eq('tenant_id', tenantId).eq('anio', ANIO).eq('mes', MES)
      .single<{ id: string }>()
    if (error) throw new Error(`fixture periodo (buscar): ${error.message}`)
    return data.id
  }

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', tipo).eq('codigo', codigo).is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  /** Hoja de egreso ya sembrada por create_tenant() con su contable_cuenta_id vinculado — evita
   * CONTABLE_PARAMETRIZACION_PENDIENTE. TODA hoja de egreso del PUC sembrado exige centro de
   * costo (verificado contra la base real por tests/contabilidad/materializacion.test.ts); la
   * factura siempre trae centro_costo_id. Se filtra requiere_tercero=false igual que ese mismo
   * archivo — la factura igual pobla tercero_id en la ejecución, así que da lo mismo, pero esta
   * es la combinación ya confirmada que existe en el PUC sembrado. */
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

  async function crearDocumentoMinimo(tenantId: string, nombre: string): Promise<string> {
    const tipoDocId = await idListaTipos('TIPO_DOCUMENTO', 'factura_proveedor')
    const { data, error } = await admin
      .from('documentos')
      .insert({ tenant_id: tenantId, tipo_documento_id: tipoDocId, nombre_archivo: `${nombre}.pdf`, storage_path: `test/${nombre}.pdf` })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture documento ${nombre}: ${error.message}`)
    return data.id
  }

  interface Escenario {
    tenantId: string
    cliente: Cliente
    proveedorId: string
    cuentaId: string
    centroCostoId: number
    documentoId: string
  }

  async function prepararEscenario(etiqueta: string): Promise<Escenario> {
    const { tenantId, cliente } = await crearTenantCompleto(etiqueta)
    // El periodo (ANIO-MES) se crea siempre: fn_finanzas_aprobar_factura lo resuelve por
    // fecha_emision al crear una ejecución nueva, y toda prueba que aprueba una factura lo
    // necesita, la use o no explícitamente.
    const [proveedorId, cuentaId, centroCostoId, documentoId] = await Promise.all([
      crearTercero(tenantId, etiqueta),
      unaHojaEgreso(tenantId),
      unCentroCostoId(),
      crearDocumentoMinimo(tenantId, etiqueta),
      crearPeriodo(tenantId, ANIO, MES),
    ])
    return { tenantId, cliente, proveedorId, cuentaId, centroCostoId, documentoId }
  }

  type FacturaInsert = Database['public']['Tables']['finanzas_facturas_proveedor']['Insert']
  function filaFactura(e: Escenario, overrides: Partial<FacturaInsert> = {}): FacturaInsert {
    return {
      tenant_id: e.tenantId, proveedor_id: e.proveedorId, presupuesto_cuenta_id: e.cuentaId,
      centro_costo_id: e.centroCostoId, documento_soporte_id: e.documentoId,
      numero_documento: `FAC-${RUN_ID}`,
      fecha_emision: FECHA_EMISION, fecha_vencimiento: FECHA_VENCIMIENTO,
      subtotal: 1_000_000, iva_generado: 0, iva_descontable: 0,
      total_bruto: 1_000_000, total_retenciones: 0, total_neto_pagar: 1_000_000,
      ...overrides,
    }
  }

  async function crearFactura(overrides: FacturaInsert) {
    return admin.from('finanzas_facturas_proveedor').insert(overrides).select('*').single()
  }

  async function llevarAEnRevision(facturaId: string): Promise<void> {
    const { error: e1 } = await admin
      .from('finanzas_facturas_proveedor').update({ estado: 'registrada' }).eq('id', facturaId)
    if (e1) throw new Error(`fixture -> registrada: ${e1.message}`)
    const { error: e2 } = await admin
      .from('finanzas_facturas_proveedor').update({ estado: 'en_revision' }).eq('id', facturaId)
    if (e2) throw new Error(`fixture -> en_revision: ${e2.message}`)
  }

  it('1. total_bruto ≠ subtotal + iva_generado falla con FACTURA_ARITMETICA_INCONSISTENTE', async () => {
    const e = await prepararEscenario('aritmetica-bruto')
    const { error } = await crearFactura(filaFactura(e, { total_bruto: 999 }))
    expect(error?.message).toContain('FACTURA_ARITMETICA_INCONSISTENTE')
  }, 30_000)

  it('2. total_neto_pagar ≠ total_bruto − total_retenciones falla con la misma', async () => {
    const e = await prepararEscenario('aritmetica-neto')
    const { error } = await crearFactura(filaFactura(e, { total_neto_pagar: 999 }))
    expect(error?.message).toContain('FACTURA_ARITMETICA_INCONSISTENTE')
  }, 30_000)

  it('3. dos facturas con el mismo (proveedor, numero_documento) fallan con FACTURA_DUPLICADA', async () => {
    const e = await prepararEscenario('duplicada')
    const { error: e1 } = await crearFactura(filaFactura(e))
    expect(e1).toBeNull()
    const { error: e2 } = await crearFactura(filaFactura(e))
    expect(e2?.message).toContain('FACTURA_DUPLICADA')
  }, 30_000)

  it('4. aprobar sin documento soporte falla con FACTURA_APROBACION_SIN_SOPORTE', async () => {
    const e = await prepararEscenario('sin-soporte')
    const { data: factura, error } = await crearFactura(filaFactura(e, { documento_soporte_id: null }))
    expect(error).toBeNull()
    await llevarAEnRevision(factura!.id)
    const { error: errAprobar } = await e.cliente.rpc('fn_finanzas_aprobar_factura', { p_factura_id: factura!.id })
    expect(errAprobar?.message).toContain('FACTURA_APROBACION_SIN_SOPORTE')
  }, 30_000)

  it('5. GOB-1 ya existe pero sin atribución para aprobar gastos — precondición de la prueba 6 (actualizada, D-60)', async () => {
    // Actualizado al cerrar GOB-1 (D-60 en DECISIONES.md): la premisa original de esta prueba
    // ("GOB-1 no existe todavía") dejó de ser cierta — gobierno_organos SÍ existe ahora. Lo que
    // sigue siendo cierto, y sigue impidiendo verificar un órgano competente real, es que
    // ATRIBUCION_ORGANO (sembrada por GOB-1) no incluye ningún código para "aprobar un gasto" —
    // GOB_01_organos_gobierno.md §4.2 sembró once atribuciones (aprobar_estados_financieros,
    // aprobar_presupuesto, elegir_consejo, elegir_revisor_fiscal, elegir_comite_convivencia,
    // imponer_sanciones, autorizar_castigo_cartera, autorizar_uso_fondo,
    // aprobar_cuota_extraordinaria, reformar_reglamento, conciliar_conflictos), y ninguna es
    // "aprobar_gasto" (la que el propio informe de FIN-2 propuso). Añadirla es una decisión de
    // FIN-2, no de GOB-1 — fuera de alcance de ese corte.
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', 'ATRIBUCION_ORGANO').eq('codigo', 'aprobar_gasto').is('tenant_id', null)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  }, 30_000)

  it('6. sobre el umbral y sin GOB-1, aprobar pasa con advertencia inspeccionable', async () => {
    const e = await prepararEscenario('advertencia-organo')
    const { error: errPolitica } = await admin
      .from('finanzas_politica_aprobacion_pago')
      .insert({ tenant_id: e.tenantId, version: 1, estado: 'vigente', monto_umbral: 100 })
    expect(errPolitica).toBeNull()

    const { data: factura, error } = await crearFactura(filaFactura(e))
    expect(error).toBeNull()
    await llevarAEnRevision(factura!.id)

    const { data: aprobada, error: errAprobar } = await e.cliente
      .rpc('fn_finanzas_aprobar_factura', { p_factura_id: factura!.id })
      .single<Database['public']['Tables']['finanzas_facturas_proveedor']['Row']>()
    expect(errAprobar).toBeNull()
    expect(aprobada!.estado).toBe('aprobada')

    const { data: advertencias, error: errAdv } = await admin
      .from('finanzas_factura_advertencia').select('*').eq('factura_id', factura!.id)
    expect(errAdv).toBeNull()
    expect(advertencias).toHaveLength(1)
    expect(advertencias![0]!.codigo).toBe('FACTURA_APROBACION_ORGANO_INCOMPETENTE')
  }, 30_000)

  it('7. una factura pagada no admite update sustantivo: FACTURA_PAGADA_INMUTABLE', async () => {
    const e = await prepararEscenario('pagada-inmutable')
    const { data: factura, error } = await crearFactura(filaFactura(e))
    expect(error).toBeNull()
    await llevarAEnRevision(factura!.id)
    const { error: errAprobar } = await e.cliente
      .rpc('fn_finanzas_aprobar_factura', { p_factura_id: factura!.id })
    expect(errAprobar).toBeNull()

    for (const estado of ['programada', 'pagada'] as const) {
      const { error: errPaso } = await admin
        .from('finanzas_facturas_proveedor').update({ estado }).eq('id', factura!.id)
      if (errPaso) throw new Error(`fixture -> ${estado}: ${errPaso.message}`)
    }

    const { error: errMutar } = await admin
      .from('finanzas_facturas_proveedor').update({ subtotal: 1 }).eq('id', factura!.id)
    expect(errMutar?.message).toContain('FACTURA_PAGADA_INMUTABLE')

    // observaciones sigue editable — no es un bloqueo total de la fila.
    const { error: errObs } = await admin
      .from('finanzas_facturas_proveedor').update({ observaciones: 'nota' }).eq('id', factura!.id)
    expect(errObs).toBeNull()
  }, 30_000)

  it('8. aprobar crea presupuesto_ejecucion con liquidacion=por_pagar, tercero_id y monto correctos (prueba central)', async () => {
    const e = await prepararEscenario('crea-ejecucion')
    const { data: factura, error } = await crearFactura(filaFactura(e))
    expect(error).toBeNull()
    await llevarAEnRevision(factura!.id)

    const { data: aprobada, error: errAprobar } = await e.cliente
      .rpc('fn_finanzas_aprobar_factura', { p_factura_id: factura!.id })
      .single<Database['public']['Tables']['finanzas_facturas_proveedor']['Row']>()
    expect(errAprobar).toBeNull()
    expect(aprobada!.presupuesto_ejecucion_id).not.toBeNull()

    const { data: ejecucion, error: errEjec } = await admin
      .from('presupuesto_ejecucion').select('*').eq('id', aprobada!.presupuesto_ejecucion_id!)
      .single()
    expect(errEjec).toBeNull()
    expect(ejecucion!.liquidacion).toBe('por_pagar')
    expect(ejecucion!.tercero_id).toBe(e.proveedorId)
    expect(ejecucion!.monto).toBe(1_000_000)
  }, 30_000)

  it('9. aprobar una factura enlazada a una ejecución con monto distinto falla con FACTURA_EJECUCION_MONTO_DISCREPA', async () => {
    const e = await prepararEscenario('monto-discrepa')
    const periodoId = await periodoDeEscenario(e.tenantId)
    const { data: ejecucionPrevia, error: errEjec } = await admin
      .from('presupuesto_ejecucion')
      .insert({
        tenant_id: e.tenantId, cuenta_id: e.cuentaId, periodo_id: periodoId, monto: 500_000,
        liquidacion: 'por_pagar', tercero_id: e.proveedorId, centro_costo_id: e.centroCostoId,
        fecha_documento: FECHA_EMISION,
      })
      .select('id').single<{ id: string }>()
    expect(errEjec).toBeNull()

    const { data: factura, error } = await crearFactura(
      filaFactura(e, { presupuesto_ejecucion_id: ejecucionPrevia!.id }),
    )
    expect(error).toBeNull()
    await llevarAEnRevision(factura!.id)

    const { error: errAprobar } = await e.cliente
      .rpc('fn_finanzas_aprobar_factura', { p_factura_id: factura!.id })
    expect(errAprobar?.message).toContain('FACTURA_EJECUCION_MONTO_DISCREPA')
  }, 30_000)

  it('10. una ejecución ya facturada no puede enlazarse a una segunda factura: EJECUCION_YA_FACTURADA', async () => {
    const e = await prepararEscenario('ejecucion-ya-facturada')
    const periodoId = await periodoDeEscenario(e.tenantId)
    const { data: ejecucion, error: errEjec } = await admin
      .from('presupuesto_ejecucion')
      .insert({
        tenant_id: e.tenantId, cuenta_id: e.cuentaId, periodo_id: periodoId, monto: 1_000_000,
        liquidacion: 'por_pagar', tercero_id: e.proveedorId, centro_costo_id: e.centroCostoId,
        fecha_documento: FECHA_EMISION,
      })
      .select('id').single<{ id: string }>()
    expect(errEjec).toBeNull()

    const { error: e1 } = await crearFactura(
      filaFactura(e, { numero_documento: `FAC-A-${RUN_ID}`, presupuesto_ejecucion_id: ejecucion!.id }),
    )
    expect(e1).toBeNull()

    const { error: e2 } = await crearFactura(
      filaFactura(e, { numero_documento: `FAC-B-${RUN_ID}`, presupuesto_ejecucion_id: ejecucion!.id }),
    )
    expect(e2?.message).toContain('EJECUCION_YA_FACTURADA')
  }, 30_000)

  it('11. tenant no responsable de IVA con iva_descontable > 0 falla con IVA_DESCONTABLE_INCONSISTENTE', async () => {
    const e = await prepararEscenario('iva-inconsistente')
    const { error: errTenant } = await admin.from('tenants').update({ responsable_iva: false }).eq('id', e.tenantId)
    expect(errTenant).toBeNull()

    const { error } = await crearFactura(filaFactura(e, {
      subtotal: 1_000_000, iva_generado: 190_000, iva_descontable: 190_000,
      total_bruto: 1_190_000, total_neto_pagar: 1_190_000,
    }))
    expect(error?.message).toContain('IVA_DESCONTABLE_INCONSISTENTE')
  }, 30_000)

  it('12. finanzas_factura_descomposicion devuelve gasto + IVA descontable + CxP (verificado a mano)', async () => {
    const e = await prepararEscenario('descomposicion')
    const { error: errTenant } = await admin.from('tenants').update({ responsable_iva: true }).eq('id', e.tenantId)
    expect(errTenant).toBeNull()

    // fn_instanciar_cuentas_default (llamado por create_tenant()) ya siembra IVA_DESCONTABLE ->
    // 2505 por defecto (20260931200000) — se lee ese mapeo, no se inserta uno propio.
    const cuentaGasto = await admin.from('presupuesto_cuenta').select('contable_cuenta_id').eq('id', e.cuentaId).single<{ contable_cuenta_id: string }>()
    const eventoIva = await idListaTipos('EVENTO_CONTABLE', 'IVA_DESCONTABLE')
    const cuentaIva = await admin.from('contable_cuenta_default').select('contable_cuenta_id').eq('tenant_id', e.tenantId).eq('evento_id', eventoIva).single<{ contable_cuenta_id: string }>()

    const { data: factura, error } = await crearFactura(filaFactura(e, {
      subtotal: 1_000_000, iva_generado: 190_000, iva_descontable: 190_000,
      total_bruto: 1_190_000, total_neto_pagar: 1_190_000,
    }))
    expect(error).toBeNull()
    await llevarAEnRevision(factura!.id)
    const { data: aprobada, error: errAprobar } = await e.cliente
      .rpc('fn_finanzas_aprobar_factura', { p_factura_id: factura!.id })
      .single<Database['public']['Tables']['finanzas_facturas_proveedor']['Row']>()
    expect(errAprobar).toBeNull()

    const { data: lineas, error: errLineas } = await admin
      .rpc('finanzas_factura_descomposicion', { p_ejecucion_id: aprobada!.presupuesto_ejecucion_id! })
    expect(errLineas).toBeNull()
    expect(lineas).toHaveLength(3)

    const gasto = lineas!.find((l) => l.cuenta_id === cuentaGasto.data!.contable_cuenta_id)
    expect(gasto?.debito).toBe(1_000_000)
    expect(gasto?.credito).toBe(0)

    const iva = lineas!.find((l) => l.cuenta_id === cuentaIva.data!.contable_cuenta_id)
    expect(iva?.debito).toBe(190_000)
    expect(iva?.credito).toBe(0)

    const totalDebitos = lineas!.reduce((acc, l) => acc + l.debito, 0)
    const totalCreditos = lineas!.reduce((acc, l) => acc + l.credito, 0)
    expect(totalDebitos).toBe(1_190_000)
    expect(totalCreditos).toBe(1_190_000)
  }, 30_000)

  it('13. la materialización de CO-3 produce el comprobante con la descomposición correcta', async () => {
    const e = await prepararEscenario('materializacion')
    const periodoId = await periodoDeEscenario(e.tenantId)

    const { data: factura, error } = await crearFactura(filaFactura(e))
    expect(error).toBeNull()
    await llevarAEnRevision(factura!.id)
    const { data: aprobada, error: errAprobar } = await e.cliente
      .rpc('fn_finanzas_aprobar_factura', { p_factura_id: factura!.id })
      .single<Database['public']['Tables']['finanzas_facturas_proveedor']['Row']>()
    expect(errAprobar).toBeNull()

    const { data: resumen, error: errMat } = await e.cliente
      .rpc('fn_contabilizar_periodo', { p_tenant_id: e.tenantId, p_periodo_id: periodoId })
    expect(errMat).toBeNull()
    const filaEjecucion = resumen!.find((r) => r.hecho_id === aprobada!.presupuesto_ejecucion_id)
    expect(filaEjecucion?.categoria).toBe('creado')

    const { data: detalle, error: errDetalle } = await admin
      .from('contable_comprobante_detalle').select('debito, credito').eq('comprobante_id', filaEjecucion!.comprobante_id)
    expect(errDetalle).toBeNull()
    expect(detalle).toHaveLength(2)
    const totalDebitos = detalle!.reduce((acc, l) => acc + l.debito, 0)
    const totalCreditos = detalle!.reduce((acc, l) => acc + l.credito, 0)
    expect(totalDebitos).toBe(1_000_000)
    expect(totalCreditos).toBe(1_000_000)

    const { data: conciliacion, error: errConc } = await admin
      .rpc('contable_conciliacion_proyeccion', {
        p_tenant_id: e.tenantId, p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31`,
      })
    expect(errConc).toBeNull()
    expect(conciliacion).toHaveLength(0)
  }, 30_000)

  it('14. la factura no genera comprobante propio; el conteo solo cambia por la materialización de CO-3', async () => {
    const e = await prepararEscenario('sin-comprobante-propio')
    const { count: antes } = await admin
      .from('contable_comprobante').select('id', { count: 'exact', head: true }).eq('tenant_id', e.tenantId)

    const { data: factura, error } = await crearFactura(filaFactura(e))
    expect(error).toBeNull()
    await llevarAEnRevision(factura!.id)
    const { error: errAprobar } = await e.cliente
      .rpc('fn_finanzas_aprobar_factura', { p_factura_id: factura!.id })
    expect(errAprobar).toBeNull()

    const { count: despuesDeAprobar } = await admin
      .from('contable_comprobante').select('id', { count: 'exact', head: true }).eq('tenant_id', e.tenantId)
    expect(despuesDeAprobar).toBe(antes ?? 0)
  }, 30_000)

  it('15. aislamiento entre tenants', async () => {
    const a = await prepararEscenario('aislar-a')
    const b = await prepararEscenario('aislar-b')

    const { error: errCruzado } = await crearFactura(filaFactura(a, { proveedor_id: b.proveedorId }))
    expect(errCruzado?.message).toContain('FACTURA_TENANT_INCONSISTENTE')

    const { data: propia } = await crearFactura(filaFactura(a))
    const { data: vistaDesdeB } = await b.cliente
      .from('finanzas_facturas_proveedor').select('*').eq('id', propia!.id)
    expect(vistaDesdeB).toHaveLength(0)
  }, 30_000)

  it('17. iva_descontable > iva_generado falla con IVA_DESCONTABLE_INCONSISTENTE', async () => {
    const e = await prepararEscenario('iva-descontable-excede')
    const { error: errTenant } = await admin.from('tenants').update({ responsable_iva: true }).eq('id', e.tenantId)
    expect(errTenant).toBeNull()

    const { error } = await crearFactura(filaFactura(e, {
      subtotal: 1_000_000, iva_generado: 100_000, iva_descontable: 150_000,
      total_bruto: 1_100_000, total_neto_pagar: 1_100_000,
    }))
    expect(error?.message).toContain('IVA_DESCONTABLE_INCONSISTENTE')
  }, 30_000)

  it('18. tenant no responsable de IVA: el IVA no recuperable engorda el gasto y la descomposición cuadra (regresión encontrada probando la ficha en el navegador)', async () => {
    const e = await prepararEscenario('iva-no-recuperable')
    const { error: errTenant } = await admin.from('tenants').update({ responsable_iva: false }).eq('id', e.tenantId)
    expect(errTenant).toBeNull()

    const { data: factura, error } = await crearFactura(filaFactura(e, {
      subtotal: 100_000, iva_generado: 19_000, iva_descontable: 0,
      total_bruto: 119_000, total_neto_pagar: 119_000,
    }))
    expect(error).toBeNull()
    await llevarAEnRevision(factura!.id)
    const { data: aprobada, error: errAprobar } = await e.cliente
      .rpc('fn_finanzas_aprobar_factura', { p_factura_id: factura!.id })
      .single<Database['public']['Tables']['finanzas_facturas_proveedor']['Row']>()
    expect(errAprobar).toBeNull()

    const cuentaGasto = await admin
      .from('presupuesto_cuenta').select('contable_cuenta_id').eq('id', e.cuentaId)
      .single<{ contable_cuenta_id: string }>()

    const { data: lineas, error: errLineas } = await admin
      .rpc('finanzas_factura_descomposicion', { p_ejecucion_id: aprobada!.presupuesto_ejecucion_id! })
    expect(errLineas).toBeNull()
    expect(lineas).toHaveLength(2) // sin línea de IVA descontable — iva_descontable = 0

    const gasto = lineas!.find((l) => l.cuenta_id === cuentaGasto.data!.contable_cuenta_id)
    expect(gasto?.debito).toBe(119_000) // subtotal + iva_generado no recuperado

    const totalDebitos = lineas!.reduce((acc, l) => acc + l.debito, 0)
    const totalCreditos = lineas!.reduce((acc, l) => acc + l.credito, 0)
    expect(totalDebitos).toBe(119_000)
    expect(totalCreditos).toBe(119_000)
  }, 30_000)

  it('16. factura_estado_t tiene comment on type (D-24)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const archivo = path.resolve(import.meta.dirname, '../../supabase/migrations/20260931120000_fin2_vocabulario.sql')
    const contenido = await fs.readFile(archivo, 'utf8')
    expect(contenido).toMatch(/create type public\.factura_estado_t as enum/)
    expect(contenido).toMatch(/comment on type public\.factura_estado_t is/)
  })
})
