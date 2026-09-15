/**
 * CO-8 (20260931900000-20260931940000) — obligaciones tributarias.
 * Ver Casos de uso/Tres Modulos/Contabilidad/CO_08_tributario.md §6 (9 pruebas obligatorias).
 *
 * Nada se activa por defecto (spec §2 regla 2): todo depende de responsable_iva/
 * agente_retencion/uso_economico/explota_bienes_comunes (CO-1), sin valor por defecto.
 *
 * NO existe una tabla `tributario_retencion` propia: `finanzas_factura_retencion` (FIN-2,
 * 20260931150000) ya es la retención practicada — su propio comentario documentaba esta
 * extensión pendiente. Todo gasto de este sistema entra a presupuesto_ejecucion únicamente vía
 * facturas de proveedor, así que no hay otro punto de práctica de retención que cubrir.
 *
 * tributario_iva_generado es un registro INFORMATIVO (decisión confirmada con el usuario en el
 * Plan del corte, punto abierto 1, opción 1): alimenta el resumen y la exógena, pero no genera
 * ningún asiento contable automático — extender contable_hechos()/CO-3 para reconocerlo sería
 * invasivo sobre el núcleo de materialización y excede "AQUILA genera la información base, no
 * presenta declaraciones" (spec §2 regla 1).
 */
import { readFileSync } from 'node:fs'
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
  type TenantPrueba,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/contabilidad/tributario: faltan variables de Supabase en .env')
}

const ANIO = 2034
const MES = 6
const FECHA_EMISION = `${String(ANIO)}-${String(MES).padStart(2, '0')}-10`
const FECHA_VENCIMIENTO = `${String(ANIO)}-${String(MES).padStart(2, '0')}-25`

type FacturaRow = Database['public']['Tables']['finanzas_facturas_proveedor']['Row']
type FacturaInsert = Database['public']['Tables']['finanzas_facturas_proveedor']['Insert']

d('CO-8: obligaciones tributarias', () => {
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

  async function cuentaPorCodigo(tenantId: string, codigo: string): Promise<string> {
    const { data, error } = await admin
      .from('contable_cuenta').select('id').eq('tenant_id', tenantId).eq('codigo', codigo)
      .single<{ id: string }>()
    if (error) throw new Error(`fixture cuenta ${codigo}: ${error.message}`)
    return data.id
  }

  // ── Escenario liviano: tenant + membresía + plan de cuentas, sin proveedor/factura ────────
  // Vía create_tenant() (nunca fn_instanciar_plan_contable directo): 20260932550000 le revocó
  // EXECUTE a public/anon/authenticated — invocable solo internamente desde create_tenant() (la
  // razón de seguridad real: cualquier autenticado podía resembrar la plantilla de OTRO tenant
  // pasando su id). El creador queda 'administrador', que ya satisface cualquier chequeo de
  // 'auxiliar' (has_role, 20260830100000) — no hace falta crearMembership aparte.
  async function tenantConPlan(
    etiqueta: string,
    overrides: Partial<Database['public']['Tables']['tenants']['Update']> = {},
  ): Promise<{ tenant: TenantPrueba; cliente: Cliente }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)
    const { data: tenantRpc, error } = await cliente
      .rpc('create_tenant', { p_name: `CO-8 ${etiqueta}`, p_slug: `t-${RUN_ID}-${etiqueta}` })
      .single<{ id: string; slug: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenantRpc.id)
    if (Object.keys(overrides).length > 0) {
      const { error: errOverrides } = await admin.from('tenants').update(overrides).eq('id', tenantRpc.id)
      if (errOverrides) throw errOverrides
    }
    return { tenant: { id: tenantRpc.id, slug: tenantRpc.slug }, cliente }
  }

  // ── Escenario completo (mismo patrón que tests/finanzas/facturas-proveedor.test.ts): tenant
  // vía create_tenant() (siembra plan de cuentas + cuentas_default + presupuesto), proveedor,
  // hoja de egreso, documento soporte, periodo. ────────────────────────────────────────────────
  async function crearTenantCompleto(etiqueta: string): Promise<{ tenantId: string; cliente: Cliente }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)
    const { data: tenant, error } = await cliente
      .rpc('create_tenant', { p_name: `CO-8 ${etiqueta}`, p_slug: `co8-${RUN_ID}-${etiqueta}` })
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

  /** El periodo (ANIO-MES) ya lo creó prepararEscenario() — se reutiliza, no se crea de nuevo
   * (periodos tiene unique (tenant_id, anio, mes)). */
  async function periodoDeEscenario(tenantId: string): Promise<string> {
    const { data, error } = await admin
      .from('periodos').select('id').eq('tenant_id', tenantId).eq('anio', ANIO).eq('mes', MES)
      .single<{ id: string }>()
    if (error) throw new Error(`fixture periodo (buscar): ${error.message}`)
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
    const [proveedorId, cuentaId, centroCostoId, documentoId] = await Promise.all([
      crearTercero(tenantId, etiqueta),
      unaHojaEgreso(tenantId),
      idListaTipos('CENTRO_COSTO', 'administracion'),
      crearDocumentoMinimo(tenantId, etiqueta),
      crearPeriodo(tenantId, ANIO, MES),
    ])
    return { tenantId, cliente, proveedorId, cuentaId, centroCostoId, documentoId }
  }

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
    return admin.from('finanzas_facturas_proveedor').insert(overrides).select('*').single<FacturaRow>()
  }

  async function llevarAEnRevision(facturaId: string): Promise<void> {
    const { error: e1 } = await admin
      .from('finanzas_facturas_proveedor').update({ estado: 'registrada' }).eq('id', facturaId)
    if (e1) throw new Error(`fixture -> registrada: ${e1.message}`)
    const { error: e2 } = await admin
      .from('finanzas_facturas_proveedor').update({ estado: 'en_revision' }).eq('id', facturaId)
    if (e2) throw new Error(`fixture -> en_revision: ${e2.message}`)
  }

  async function crearConceptoRetencion(
    tenantId: string, cuentaId: string, codigo: string, tarifa: number,
  ): Promise<number> {
    // Gap ReteIVA/ReteICA (2026-09-14): tipo_id ahora es obligatorio — todos los conceptos de
    // este archivo son retención en la fuente (agente_retencion), nunca ReteIVA/ReteICA.
    const tipoFuenteId = await idListaTipos('TIPO_RETENCION_CONCEPTO', 'fuente')
    const { data, error } = await admin
      .from('tributario_concepto_retencion')
      .insert({ tenant_id: tenantId, codigo, nombre: codigo, tarifa, cuenta_contable_id: cuentaId, tipo_id: tipoFuenteId })
      .select('id').single<{ id: number }>()
    if (error) throw new Error(`fixture concepto retención ${codigo}: ${error.message}`)
    return data.id
  }

  it('1. un tenant con agente_retencion=false no puede crear retenciones', async () => {
    const e = await prepararEscenario('sin-agente-retencion')
    const cuenta2320 = await cuentaPorCodigo(e.tenantId, '2320')
    const conceptoId = await crearConceptoRetencion(e.tenantId, cuenta2320, 'honorarios', 11)

    const { data: factura, error } = await crearFactura(filaFactura(e, {
      subtotal: 1_000_000, total_bruto: 1_000_000, total_retenciones: 110_000,
      total_neto_pagar: 890_000,
    }))
    expect(error).toBeNull()

    const { error: errRetencion } = await admin.from('finanzas_factura_retencion').insert({
      tenant_id: e.tenantId, factura_id: factura!.id, concepto_id: conceptoId,
      base: 1_000_000, tarifa: 11, valor: 110_000,
    })
    expect(errRetencion?.message).toContain('TRIBUTARIO_SIN_AGENTE_RETENCION')
  }, 30_000)

  it('2. un tenant con responsable_iva=false no ve ni puede registrar IVA', async () => {
    const { tenant } = await tenantConPlan('sin-responsable-iva')
    const periodoId = await crearPeriodo(tenant.id, ANIO, MES)

    const { error: errIva } = await admin.from('tributario_iva_generado').insert({
      tenant_id: tenant.id, fecha: FECHA_EMISION, base: 1_000_000, tarifa: 19, valor: 190_000,
      periodo_id: periodoId,
    })
    expect(errIva?.message).toContain('TRIBUTARIO_SIN_RESPONSABLE_IVA')

    const { data: tenantFila } = await admin
      .from('tenants').select('iva_periodicidad_id').eq('id', tenant.id).single<{ iva_periodicidad_id: number | null }>()
    expect(tenantFila!.iva_periodicidad_id).toBeNull()
  }, 30_000)

  it('3. un tenant residencial sin explotación no puede marcar cuentas como gravadas de renta', async () => {
    const { tenant } = await tenantConPlan('residencial-sin-explotacion', {
      uso_economico: 'residencial', explota_bienes_comunes: false,
    })
    const naturalezaRenta = await idListaTipos('NATURALEZA_TRIBUTARIA_CUENTA', 'gravado_renta')
    const naturalezaIva = await idListaTipos('NATURALEZA_TRIBUTARIA_CUENTA', 'gravado_iva')
    const cuenta4105 = await cuentaPorCodigo(tenant.id, '4105')

    const { error: errRenta } = await admin
      .from('contable_cuenta').update({ naturaleza_tributaria_id: naturalezaRenta }).eq('id', cuenta4105)
    expect(errRenta?.message).toContain('TRIBUTARIO_MARCA_INCOHERENTE_CON_USO')

    // ET arts. 420/429: la exclusión de renta NO cubre IVA — gravado_iva sí debe poder marcarse.
    const { error: errIva } = await admin
      .from('contable_cuenta').update({ naturaleza_tributaria_id: naturalezaIva }).eq('id', cuenta4105)
    expect(errIva).toBeNull()
  }, 30_000)

  it('4. ninguna migración del corte siembra tarifas ni bases mínimas', () => {
    const archivos = [
      'supabase/migrations/20260931900000_co8_vocabulario.sql',
      'supabase/migrations/20260931910000_co8_segregacion_tributaria.sql',
      'supabase/migrations/20260931920000_co8_retencion.sql',
      'supabase/migrations/20260931930000_co8_iva.sql',
      'supabase/migrations/20260931940000_co8_exogena.sql',
    ]
    for (const archivo of archivos) {
      const texto = readFileSync(archivo, 'utf8')
      expect(texto).not.toMatch(/insert into public\.tributario_concepto_retencion/i)
      // El único literal numérico de "tarifa" permitido en todo el corte es el 2506 del código
      // de cuenta (identificador, no un porcentaje) y los IDs/orden de lista_tipos — ninguna
      // línea del corte inserta un valor en una columna `tarifa`/`base_minima_uvt`.
      expect(texto).not.toMatch(/\btarifa\s*[,)]?\s*values?\b/i)
    }
  })

  it('5. una retención practicada genera el crédito a la cuenta de retención por pagar y reduce el neto', async () => {
    const e = await prepararEscenario('retencion-practicada')
    const { error: errTenant } = await admin.from('tenants').update({ agente_retencion: true }).eq('id', e.tenantId)
    expect(errTenant).toBeNull()

    const cuenta2320 = await cuentaPorCodigo(e.tenantId, '2320')
    const cuentaGasto = await admin.from('presupuesto_cuenta').select('contable_cuenta_id').eq('id', e.cuentaId).single<{ contable_cuenta_id: string }>()
    const conceptoId = await crearConceptoRetencion(e.tenantId, cuenta2320, 'honorarios', 11)

    const { data: factura, error } = await crearFactura(filaFactura(e, {
      subtotal: 1_000_000, total_bruto: 1_000_000, total_retenciones: 110_000,
      total_neto_pagar: 890_000,
    }))
    expect(error).toBeNull()

    const { error: errRetencion } = await admin.from('finanzas_factura_retencion').insert({
      tenant_id: e.tenantId, factura_id: factura!.id, concepto_id: conceptoId,
      base: 1_000_000, tarifa: 11, valor: 110_000,
    })
    expect(errRetencion).toBeNull()

    await llevarAEnRevision(factura!.id)
    const { data: aprobada, error: errAprobar } = await e.cliente
      .rpc('fn_finanzas_aprobar_factura', { p_factura_id: factura!.id })
      .single<FacturaRow>()
    expect(errAprobar).toBeNull()

    const { data: lineas, error: errLineas } = await admin
      .rpc('finanzas_factura_descomposicion', { p_ejecucion_id: aprobada!.presupuesto_ejecucion_id! })
    expect(errLineas).toBeNull()

    const retencion = lineas!.find((l) => l.cuenta_id === cuenta2320)
    expect(retencion?.credito).toBe(110_000)
    expect(retencion?.debito).toBe(0)

    const gasto = lineas!.find((l) => l.cuenta_id === cuentaGasto.data!.contable_cuenta_id)
    expect(gasto?.debito).toBe(1_000_000)

    const totalDebitos = lineas!.reduce((acc, l) => acc + l.debito, 0)
    const totalCreditos = lineas!.reduce((acc, l) => acc + l.credito, 0)
    expect(totalDebitos).toBe(totalCreditos)
    expect(totalCreditos).toBe(1_000_000)
  }, 30_000)

  it('6. el certificado de retención de un tercero suma exactamente las retenciones del periodo', async () => {
    const e = await prepararEscenario('certificado-retencion')
    const { error: errTenant } = await admin.from('tenants').update({ agente_retencion: true }).eq('id', e.tenantId)
    expect(errTenant).toBeNull()

    const cuenta2320 = await cuentaPorCodigo(e.tenantId, '2320')
    const conceptoHonorarios = await crearConceptoRetencion(e.tenantId, cuenta2320, 'honorarios', 11)
    const conceptoServicios = await crearConceptoRetencion(e.tenantId, cuenta2320, 'servicios', 4)

    const { data: f1 } = await crearFactura(filaFactura(e, {
      numero_documento: `FAC-A-${RUN_ID}`, subtotal: 1_000_000, total_bruto: 1_000_000,
      total_retenciones: 110_000, total_neto_pagar: 890_000,
    }))
    const { data: f2 } = await crearFactura(filaFactura(e, {
      numero_documento: `FAC-B-${RUN_ID}`, subtotal: 500_000, total_bruto: 500_000,
      total_retenciones: 20_000, total_neto_pagar: 480_000,
    }))

    await admin.from('finanzas_factura_retencion').insert([
      { tenant_id: e.tenantId, factura_id: f1!.id, concepto_id: conceptoHonorarios, base: 1_000_000, tarifa: 11, valor: 110_000 },
      { tenant_id: e.tenantId, factura_id: f2!.id, concepto_id: conceptoServicios, base: 500_000, tarifa: 4, valor: 20_000 },
    ])

    const { data: certificado, error } = await admin.rpc('tributario_certificado_retencion', {
      p_tenant_id: e.tenantId, p_tercero_id: e.proveedorId,
      p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31`,
    })
    expect(error).toBeNull()
    expect(certificado).toHaveLength(2)
    const totalValor = certificado!.reduce((acc, l) => acc + l.total_valor, 0)
    expect(totalValor).toBe(130_000)
  }, 30_000)

  it('7. contable_ingresos_por_naturaleza_tributaria suma clase 4 sin omitir ni duplicar', async () => {
    const { tenant, cliente } = await tenantConPlan('ingresos-naturaleza')
    const periodoId = await crearPeriodo(tenant.id, ANIO, MES)
    const naturalezaGravadoIva = await idListaTipos('NATURALEZA_TRIBUTARIA_CUENTA', 'gravado_iva')
    const naturalezaNoGravado = await idListaTipos('NATURALEZA_TRIBUTARIA_CUENTA', 'no_gravado')
    const tipoIngresoId = await idListaTipos('TIPO_COMPROBANTE', 'INGRESO')

    const caja = await cuentaPorCodigo(tenant.id, '110505')
    const cuota = await cuentaPorCodigo(tenant.id, '4690') // ingresos diversos — no gravado, sin dimensión exigida
    const parqueadero = await cuentaPorCodigo(tenant.id, '4310') // usufructo — se marca gravado_iva, sin dimensión exigida

    await admin.from('contable_cuenta').update({ naturaleza_tributaria_id: naturalezaNoGravado }).eq('id', cuota)
    await admin.from('contable_cuenta').update({ naturaleza_tributaria_id: naturalezaGravadoIva }).eq('id', parqueadero)

    async function contabilizar(cuentaIngreso: string, monto: number): Promise<void> {
      const { data: periodo } = await admin.from('periodos').select('anio').eq('id', periodoId).single<{ anio: number }>()
      const { data: comp, error: errComp } = await admin
        .from('contable_comprobante')
        .insert({ tenant_id: tenant.id, periodo_id: periodoId, tipo_id: tipoIngresoId, anio: periodo!.anio, fecha: FECHA_EMISION, descripcion: 'CO-8 prueba 7' })
        .select('id').single<{ id: string }>()
      if (errComp) throw errComp
      const { error: errDetalle } = await admin.from('contable_comprobante_detalle').insert([
        { tenant_id: tenant.id, comprobante_id: comp.id, linea: 1, cuenta_id: caja, debito: monto, credito: 0 },
        { tenant_id: tenant.id, comprobante_id: comp.id, linea: 2, cuenta_id: cuentaIngreso, debito: 0, credito: monto },
      ])
      if (errDetalle) throw errDetalle
      const { error: errContab } = await cliente.rpc('fn_contabilizar_comprobante', { p_comprobante_id: comp.id })
      if (errContab) throw errContab
    }

    await contabilizar(cuota, 300_000)
    await contabilizar(parqueadero, 100_000)

    const { data: resumen, error } = await admin.rpc('contable_ingresos_por_naturaleza_tributaria', {
      p_tenant_id: tenant.id, p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31`,
    })
    expect(error).toBeNull()

    const noGravado = resumen!.find((r) => r.naturaleza_tributaria === 'no_gravado')
    const gravadoIva = resumen!.find((r) => r.naturaleza_tributaria === 'gravado_iva')
    expect(noGravado?.total).toBe(300_000)
    expect(gravadoIva?.total).toBe(100_000)

    const totalAgrupado = resumen!.reduce((acc, r) => acc + r.total, 0)
    const { data: libroMayor, error: errLibro } = await admin.rpc('contable_libro_mayor', {
      p_tenant_id: tenant.id, p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31`,
    })
    expect(errLibro).toBeNull()
    const totalClase4Real = libroMayor!
      .filter((l) => l.cuenta_codigo.startsWith('4'))
      .reduce((acc, l) => acc + (l.movimiento_credito - l.movimiento_debito), 0)
    expect(totalAgrupado).toBe(totalClase4Real)
  }, 30_000)

  it('8. la base de exógena de un ejercicio cuadra contra el libro mayor', async () => {
    const e = await prepararEscenario('exogena-cuadre')
    const { error: errTenant } = await admin.from('tenants').update({ agente_retencion: true }).eq('id', e.tenantId)
    expect(errTenant).toBeNull()

    const cuenta2320 = await cuentaPorCodigo(e.tenantId, '2320')
    const conceptoId = await crearConceptoRetencion(e.tenantId, cuenta2320, 'honorarios', 11)
    const { data: factura, error } = await crearFactura(filaFactura(e, {
      subtotal: 1_000_000, total_bruto: 1_000_000, total_retenciones: 110_000, total_neto_pagar: 890_000,
    }))
    expect(error).toBeNull()
    await admin.from('finanzas_factura_retencion').insert({
      tenant_id: e.tenantId, factura_id: factura!.id, concepto_id: conceptoId,
      base: 1_000_000, tarifa: 11, valor: 110_000,
    })
    await llevarAEnRevision(factura!.id)
    await e.cliente.rpc('fn_finanzas_aprobar_factura', { p_factura_id: factura!.id })
    const periodoId = await periodoDeEscenario(e.tenantId)
    const { error: errMaterializar } = await e.cliente
      .rpc('fn_contabilizar_periodo', { p_tenant_id: e.tenantId, p_periodo_id: periodoId })
    expect(errMaterializar).toBeNull()

    const { data: exogena, error: errExogena } = await admin.rpc('tributario_base_exogena', {
      p_tenant_id: e.tenantId, p_anio: ANIO,
    })
    expect(errExogena).toBeNull()
    const saldosCierre = (exogena as { saldos_cierre_cxc_cxp: { cuenta: string; saldo_final: number }[] }).saldos_cierre_cxc_cxp

    const { data: libroMayor, error: errLibro } = await admin.rpc('contable_libro_mayor', {
      p_tenant_id: e.tenantId, p_desde: `${String(ANIO)}-01-01`, p_hasta: `${String(ANIO)}-12-31`,
    })
    expect(errLibro).toBeNull()

    for (const fila of saldosCierre) {
      const cuentaLibroMayor = libroMayor!.find((l) => l.cuenta_codigo === fila.cuenta)
      expect(cuentaLibroMayor?.saldo_final).toBe(fila.saldo_final)
    }
    expect(saldosCierre.length).toBeGreaterThan(0)
  }, 30_000)

  it('9. aislamiento entre tenants', async () => {
    const eA = await prepararEscenario('aislamiento-a')
    const { tenant: tenantB, cliente: clienteB } = await tenantConPlan('aislamiento-b')

    const cuenta2320 = await cuentaPorCodigo(eA.tenantId, '2320')
    await crearConceptoRetencion(eA.tenantId, cuenta2320, 'honorarios', 11)

    const { data: conceptosB, error: errConceptosB } = await clienteB
      .from('tributario_concepto_retencion').select('id').eq('tenant_id', eA.tenantId)
    expect(errConceptosB).toBeNull()
    expect(conceptosB).toEqual([])

    const { data: iva, error: errIva } = await admin
      .from('tributario_iva_generado').select('id').eq('tenant_id', tenantB.id)
    expect(errIva).toBeNull()
    expect(iva).toEqual([])
  }, 30_000)

  // ── Gap ICA / ReteIVA / ReteICA (2026-09-14) ─────────────────────────────
  it('10. un tenant con ica_aplica=false no puede calcular el resumen de ICA', async () => {
    const { tenant } = await tenantConPlan('ica-no-aplica')
    const { error } = await admin.rpc('tributario_resumen_ica', {
      p_tenant_id: tenant.id, p_anio: ANIO, p_periodo_numero: 1,
    })
    expect(error?.message).toContain('TRIBUTARIO_ICA_NO_APLICA')
  }, 30_000)

  it('11. ica_aplica=true sin tarifa/periodicidad configuradas falla con TRIBUTARIO_ICA_SIN_CONFIGURAR', async () => {
    const { tenant } = await tenantConPlan('ica-sin-configurar', { ica_aplica: true })
    const { error } = await admin.rpc('tributario_resumen_ica', {
      p_tenant_id: tenant.id, p_anio: ANIO, p_periodo_numero: 1,
    })
    expect(error?.message).toContain('TRIBUTARIO_ICA_SIN_CONFIGURAR')
  }, 30_000)

  it('12. el resumen de ICA calcula sobre la misma base gravada de renta que comparte con el ET art. 19-5', async () => {
    const periodicidadBimestral = await idListaTipos('PERIODICIDAD_ICA', 'bimestral')
    const { tenant, cliente } = await tenantConPlan('ica-resumen', {
      ica_aplica: true, ica_tarifa_por_mil: 10, ica_periodicidad_id: periodicidadBimestral,
    })
    const periodoId = await crearPeriodo(tenant.id, ANIO, MES)
    const naturalezaGravadoRenta = await idListaTipos('NATURALEZA_TRIBUTARIA_CUENTA', 'gravado_renta')
    const tipoIngresoId = await idListaTipos('TIPO_COMPROBANTE', 'INGRESO')

    const caja = await cuentaPorCodigo(tenant.id, '110505')
    const parqueadero = await cuentaPorCodigo(tenant.id, '4310')
    await admin.from('contable_cuenta').update({ naturaleza_tributaria_id: naturalezaGravadoRenta }).eq('id', parqueadero)

    const { data: periodo } = await admin.from('periodos').select('anio').eq('id', periodoId).single<{ anio: number }>()
    const { data: comp, error: errComp } = await admin
      .from('contable_comprobante')
      .insert({ tenant_id: tenant.id, periodo_id: periodoId, tipo_id: tipoIngresoId, anio: periodo!.anio, fecha: FECHA_EMISION, descripcion: 'CO-8 prueba 12 ICA' })
      .select('id').single<{ id: string }>()
    if (errComp) throw errComp
    await admin.from('contable_comprobante_detalle').insert([
      { tenant_id: tenant.id, comprobante_id: comp.id, linea: 1, cuenta_id: caja, debito: 1_000_000, credito: 0 },
      { tenant_id: tenant.id, comprobante_id: comp.id, linea: 2, cuenta_id: parqueadero, debito: 0, credito: 1_000_000 },
    ])
    const { error: errContab } = await cliente.rpc('fn_contabilizar_comprobante', { p_comprobante_id: comp.id })
    expect(errContab).toBeNull()

    // MES=6 -> bimestre 3 (mayo-junio).
    const periodoNumero = Math.ceil(MES / 2)
    const { data: resumen, error } = await admin
      .rpc('tributario_resumen_ica', { p_tenant_id: tenant.id, p_anio: ANIO, p_periodo_numero: periodoNumero })
      .single()
    expect(error).toBeNull()
    expect(resumen!.base_gravable).toBe(1_000_000)
    expect(resumen!.tarifa_por_mil).toBe(10)
    expect(resumen!.valor_estimado).toBe(10_000)
  }, 30_000)

  it('13. un concepto tipo ReteIVA exige agente_reteiva, independiente de agente_retencion', async () => {
    const e = await prepararEscenario('reteiva-sin-agente')
    // agente_retencion=true (reteFuente) a propósito: la prueba aísla que agente_reteiva es
    // un permiso DISTINTO, no que "cualquier agente de retención" habilite cualquier tipo.
    await admin.from('tenants').update({ agente_retencion: true }).eq('id', e.tenantId)
    const cuenta2367 = await cuentaPorCodigo(e.tenantId, '2320') // cualquier cuenta de clase 23 sirve para la prueba
    const tipoIvaId = await idListaTipos('TIPO_RETENCION_CONCEPTO', 'iva')
    const { data: concepto, error: errConcepto } = await admin
      .from('tributario_concepto_retencion')
      .insert({
        tenant_id: e.tenantId, codigo: 'reteiva-15', nombre: 'ReteIVA', tarifa: 15,
        cuenta_contable_id: cuenta2367, tipo_id: tipoIvaId,
      })
      .select('id').single<{ id: number }>()
    expect(errConcepto).toBeNull()

    const { data: factura, error } = await crearFactura(filaFactura(e, {
      subtotal: 1_000_000, total_bruto: 1_000_000, total_retenciones: 0, total_neto_pagar: 1_000_000,
    }))
    expect(error).toBeNull()

    // e.tenantId tiene agente_retencion=true (prepararEscenario) pero NO agente_reteiva.
    const { error: errRetencion } = await admin.from('finanzas_factura_retencion').insert({
      tenant_id: e.tenantId, factura_id: factura!.id, concepto_id: concepto!.id,
      base: 190_000, tarifa: 15, valor: 28_500,
    })
    expect(errRetencion?.message).toContain('TRIBUTARIO_SIN_AGENTE_RETENCION')

    await admin.from('tenants').update({ agente_reteiva: true }).eq('id', e.tenantId)
    const { error: errRetencionOk } = await admin.from('finanzas_factura_retencion').insert({
      tenant_id: e.tenantId, factura_id: factura!.id, concepto_id: concepto!.id,
      base: 190_000, tarifa: 15, valor: 28_500,
    })
    expect(errRetencionOk).toBeNull()
  }, 30_000)
})
