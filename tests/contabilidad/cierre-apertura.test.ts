/**
 * CO-6 (20260930520000-20260930610000) — cierre, apertura y corrección de errores.
 * Ver Casos de uso/Tres Modulos/Contabilidad/CO_06_cierre_apertura_correccion.md §5
 * (15 pruebas obligatorias).
 *
 * Mismo criterio de fixtures que estados-financieros.test.ts (CO-5): `create_tenant()` +
 * clasificación manual vía `tenants.marco_grupo` + materialización real vía
 * `fn_contabilizar_periodo`. Tenants pequeños y aislados por prueba salvo el ciclo anual
 * (pruebas 8-11-12 y 14, que reutiliza el ejercicio ya bloqueado del ciclo), que es el único
 * escenario que de verdad necesita los 12 periodos y un cierre de ejercicio real.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
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
  console.warn('SALTADO tests/contabilidad/cierre-apertura: faltan variables de Supabase en .env')
}

const ANIO_CICLO = 2040
const ANIO_SIGUIENTE = ANIO_CICLO + 1
const MES_INGRESO = 6
const MES_EGRESO = 9
const INGRESO = 100_000
const EGRESO = 40_000

interface FilaMayor {
  cuenta_id: string
  cuenta_codigo: string
  naturaleza: 'debito' | 'credito'
  saldo_final: number
}

interface FilaDetalle {
  cuenta_id: string
  debito: number
  credito: number
}

interface FilaEstado {
  codigo: string
  valor: number | null
}

function porCodigo(filas: FilaEstado[], codigo: string): FilaEstado {
  const fila = filas.find((f) => f.codigo === codigo)
  if (!fila) throw new Error(`línea ${codigo} no encontrada en el estado`)
  return fila
}

/** Cierta petición de red, en este entorno (Node/Windows→Supabase), intermitentemente tarda
 * ~10s y termina en `TypeError: fetch failed` — un socket/conexión que hay que renegociar, no
 * una consulta lenta (confirmado directamente con un script aislado: la MISMA llamada, repetida
 * de inmediato tras el fallo, responde en <1.5s). Documentado ya como patrón recurrente en este
 * proyecto; se reintenta hasta dos veces en vez de asumir un bug real. Cubre ambas formas en que
 * puede llegar el fallo: supabase-js a veces RESUELVE con `error` poblado (un objeto plano
 * `PostgrestError`-like, NO una instancia real de `Error` — `instanceof Error` no lo detecta), y
 * a veces el propio fetch() RECHAZA la promesa con una instancia real de TypeError. */
function esFetchFailedTransitorio(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false
  const mensaje = (error as { message?: unknown }).message
  return typeof mensaje === 'string' && mensaje.includes('fetch failed')
}
function errorDe(resultado: unknown): unknown {
  return resultado != null && typeof resultado === 'object' && 'error' in resultado
    ? resultado.error
    : undefined
}
// T se infiere solo de fn — sin restringirlo a `{ error: unknown }`, que colapsaba `data` a
// `unknown` en el sitio de la llamada (detectado por eslint: no-unsafe-argument). `PromiseLike`,
// no `Promise`: admin.rpc(...) devuelve un PostgrestFilterBuilder (thenable propio, sin catch/
// finally) — exigir Promise<T> le impedía a tsc unificar T con la forma real de {data, error} y
// la colapsaba a `unknown` en el sitio de la llamada (detectado por `tsc`, no por eslint).
async function conReintento<T>(fn: () => PromiseLike<T>, intentos = 3): Promise<T> {
  for (let i = 1; i <= intentos; i++) {
    try {
      const resultado = await fn()
      if (!esFetchFailedTransitorio(errorDe(resultado)) || i === intentos) return resultado
    } catch (e) {
      if (!esFetchFailedTransitorio(e) || i === intentos) throw e
    }
  }
  throw new Error('conReintento: inalcanzable')
}

d('CO-6: cierre, apertura y corrección de errores', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  // ── fixtures (mismo patrón que estados-financieros.test.ts) ──

  async function crearTenantCompleto(etiqueta: string): Promise<{ tenantId: string; cliente: Cliente; userId: string }> {
    const usuario = await conReintento(() => crearUsuario(admin, etiqueta))
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)
    const { data: tenant, error } = await cliente
      .rpc('create_tenant', { p_name: `CO-6 ${etiqueta}`, p_slug: `t6-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    // Clasificado por defecto (grupo_2): sin esto, 'marco_sin_clasificar' (advertencia,
    // contable_validacion_cierre §3.1) bloquearía CUALQUIER fn_contable_cerrar_periodo de este
    // archivo salvo que se fuerce explícitamente — ninguna prueba de este corte necesita probar
    // el tenant SIN clasificar (eso ya lo cubre marco-contable-tenant.test.ts, CO-1).
    const { error: errClasificar } = await admin
      .from('tenants').update({ marco_grupo: 'grupo_2', uso_economico: 'residencial' }).eq('id', tenant.id)
    if (errClasificar) throw new Error(`clasificar por defecto (${etiqueta}): ${errClasificar.message}`)
    return { tenantId: tenant.id, cliente, userId: usuario.id }
  }

  /** create_tenant() otorga 'administrador' al creador del tenant (no 'auxiliar', como se
   * asumía en una versión anterior de este corte) — para probar el rechazo específico de
   * auxiliar hace falta un segundo usuario con ese rol explícito, no el creador. */
  async function crearAuxiliar(tenantId: string, etiqueta: string): Promise<Cliente> {
    const usuario = await conReintento(() => crearUsuario(admin, etiqueta))
    usuariosCreados.push(usuario)
    await crearMembership(admin, tenantId, usuario.id, 'auxiliar')
    return clienteComo(env!, usuario)
  }

  async function clasificar(tenantId: string, marcoGrupo: 'grupo_2' | 'grupo_3'): Promise<void> {
    const { error } = await admin
      .from('tenants')
      .update({ marco_grupo: marcoGrupo, uso_economico: 'residencial' })
      .eq('id', tenantId)
    if (error) throw new Error(`fixture clasificar (${marcoGrupo}): ${error.message}`)
  }

  async function crearPeriodo(tenantId: string, anio: number, mes: number): Promise<string> {
    const { data, error } = await admin
      .from('periodos')
      .insert({ tenant_id: tenantId, anio, mes })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture periodo ${String(anio)}-${String(mes)}: ${error.message}`)
    return data.id
  }

  async function periodoId(tenantId: string, anio: number, mes: number): Promise<string> {
    const { data, error } = await admin
      .from('periodos')
      .select('id')
      .eq('tenant_id', tenantId).eq('anio', anio).eq('mes', mes)
      .single<{ id: string }>()
    if (error) throw new Error(`fixture buscar periodo ${String(anio)}-${String(mes)}: ${error.message}`)
    return data.id
  }

  async function tipoApartamentoId(): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id')
      .eq('tipo', 'TIPO_INMUEBLE').eq('codigo', 'apartamento').is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture tipo apartamento: ${error.message}`)
    return data.id
  }

  async function formaPagoEfectivoId(): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id')
      .eq('tipo', 'FORMA_PAGO').eq('codigo', 'efectivo').is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture forma_pago efectivo: ${error.message}`)
    return data.id
  }

  async function crearInmueble(tenantId: string, sufijo: string): Promise<string> {
    const tipoId = await tipoApartamentoId()
    const { data, error } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantId, codigo: `CO6-${sufijo}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble: ${error.message}`)
    return data.id
  }

  async function conceptoAdministracionId(tenantId: string): Promise<string> {
    const { data, error } = await admin
      .from('conceptos').select('id')
      .eq('tenant_id', tenantId).eq('codigo', 'ADMINISTRACION')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture concepto ADMINISTRACION: ${error.message}`)
    return data.id
  }

  async function crearLiquidacion(tenantId: string, periodoId_: string, montoTotal: number): Promise<string> {
    const sufijo = `${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await admin
      .from('liquidaciones')
      .insert({ tenant_id: tenantId, periodo_id: periodoId_, result_hash: `co6-fixture-${sufijo}`, tenant_total: montoTotal })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture liquidacion: ${error.message}`)
    return data.id
  }

  async function armarCargo(params: {
    tenantId: string; inmuebleId: string; periodoId: string; liquidacionId: string
    conceptoId: string; monto: number
  }): Promise<string> {
    const { data: linea, error: errLinea } = await admin
      .from('liquidacion_lineas')
      .insert({
        tenant_id: params.tenantId, liquidacion_id: params.liquidacionId, inmueble_id: params.inmuebleId,
        concepto_id: params.conceptoId, monto: params.monto,
      })
      .select('id')
      .single<{ id: string }>()
    if (errLinea) throw new Error(`fixture liquidacion_linea: ${errLinea.message}`)
    const { data: cargo, error: errCargo } = await admin
      .from('cargos')
      .insert({
        tenant_id: params.tenantId, inmueble_id: params.inmuebleId, periodo_id: params.periodoId,
        categoria: 'capital', origen_tipo: 'liquidacion_linea',
        liquidacion_linea_id: linea.id, concepto_id: params.conceptoId, monto_original: params.monto,
      })
      .select('id')
      .single<{ id: string }>()
    if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)
    return cargo.id
  }

  async function armarPago(tenantId: string, inmuebleId: string, monto: number, fechaPago: string): Promise<string> {
    const formaPagoId = await formaPagoEfectivoId()
    const { data, error } = await admin
      .from('pagos')
      .insert({ tenant_id: tenantId, inmueble_id: inmuebleId, monto, fecha_pago: fechaPago, fecha_registro: fechaPago, forma_pago_id: formaPagoId })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture pago: ${error.message}`)
    return data.id
  }

  async function pagarCargoCompleto(params: {
    tenantId: string; inmuebleId: string; periodoId: string; liquidacionId: string
    conceptoId: string; monto: number; fecha: string
  }): Promise<void> {
    const cargoId = await armarCargo(params)
    const pagoId = await armarPago(params.tenantId, params.inmuebleId, params.monto, params.fecha)
    const { error } = await admin.from('pago_aplicaciones').insert({
      tenant_id: params.tenantId, pago_id: pagoId, cargo_id: cargoId, monto: params.monto,
    })
    if (error) throw new Error(`fixture pago_aplicacion: ${error.message}`)
  }

  async function unaHojaEgreso(tenantId: string): Promise<{ id: string; codigo: string }> {
    const { data, error } = await admin
      .from('presupuesto_cuenta')
      .select('id, contable_cuenta:contable_cuenta_id!inner(codigo, requiere_tercero)')
      .eq('tenant_id', tenantId)
      .eq('naturaleza', 'egreso').eq('es_hoja', true).eq('activa', true)
      .eq('contable_cuenta.requiere_tercero', false)
      .limit(1)
      .single<{ id: string; contable_cuenta: { codigo: string } }>()
    if (error) throw new Error(`fixture hoja egreso: ${error.message}`)
    return { id: data.id, codigo: data.contable_cuenta.codigo }
  }

  async function unCentroCostoId(): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id')
      .eq('tipo', 'CENTRO_COSTO').is('tenant_id', null).eq('activo', true)
      .limit(1)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture centro_costo: ${error.message}`)
    return data.id
  }

  async function cuentaPorCodigo(tenantId: string, codigo: string): Promise<string> {
    const { data, error } = await admin
      .from('contable_cuenta').select('id')
      .eq('tenant_id', tenantId).eq('codigo', codigo)
      .single<{ id: string }>()
    if (error) throw new Error(`fixture cuenta ${codigo}: ${error.message}`)
    return data.id
  }

  async function tipoAjusteId(): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id')
      .eq('tipo', 'TIPO_COMPROBANTE').eq('codigo', 'AJUSTE').is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture tipo AJUSTE: ${error.message}`)
    return data.id
  }

  /** Comprobante manual de dos líneas (una cuenta clase 1 débito, una clase 4 crédito), en
   * `estado` (borrador|contabilizado según `contabilizar`). Sirve tanto para el "borrador
   * bloqueante" (prueba 1) como para los orígenes de corrección (pruebas 13/14). */
  async function crearComprobanteManual(params: {
    tenantId: string; periodoId: string; fecha: string; monto: number
    cuentaDebitoCodigo: string; cuentaCreditoCodigo: string; contabilizar: boolean
    cliente?: Cliente
  }): Promise<string> {
    const tipoId = await tipoAjusteId()
    const cuentaDebito = await cuentaPorCodigo(params.tenantId, params.cuentaDebitoCodigo)
    const cuentaCredito = await cuentaPorCodigo(params.tenantId, params.cuentaCreditoCodigo)
    const { data: comp, error } = await admin
      .from('contable_comprobante')
      .insert({
        tenant_id: params.tenantId, periodo_id: params.periodoId, tipo_id: tipoId,
        anio: Number(params.fecha.slice(0, 4)), fecha: params.fecha, descripcion: 'CO-6 fixture manual',
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture comprobante manual: ${error.message}`)
    const { error: errDet } = await admin.from('contable_comprobante_detalle').insert([
      { tenant_id: params.tenantId, comprobante_id: comp.id, linea: 1, cuenta_id: cuentaDebito, debito: params.monto, credito: 0 },
      { tenant_id: params.tenantId, comprobante_id: comp.id, linea: 2, cuenta_id: cuentaCredito, debito: 0, credito: params.monto },
    ])
    if (errDet) throw new Error(`fixture detalle manual: ${errDet.message}`)
    if (params.contabilizar) {
      // has_role exige un auth.uid() real — el service_role (admin) no tiene uno.
      const quienContabiliza = params.cliente ?? admin
      const { error: errContab } = await quienContabiliza.rpc('fn_contabilizar_comprobante', { p_comprobante_id: comp.id })
      if (errContab) throw new Error(`fixture contabilizar manual: ${errContab.message}`)
    }
    return comp.id
  }

  // ═══════════════════════════════════════════════════════════════════
  // Pruebas 1-4: contable_validacion_cierre / fn_contable_cerrar_periodo
  // ═══════════════════════════════════════════════════════════════════

  it('1. cerrar con un comprobante en borrador → CONTABLE_CIERRE_BLOQUEADO, periodo sigue abierto', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p1-borrador')
    const periodo = await crearPeriodo(tenantId, ANIO_CICLO, 1)
    await crearComprobanteManual({
      tenantId, periodoId: periodo, fecha: `${String(ANIO_CICLO)}-01-15`, monto: 1000,
      cuentaDebitoCodigo: '110505', cuentaCreditoCodigo: '4610', contabilizar: false,
    })

    const { error } = await cliente.rpc('fn_contable_cerrar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodo })
    expect(error?.message).toContain('CONTABLE_CIERRE_BLOQUEADO')

    const { data: p, error: errP } = await admin.from('periodos').select('contable_estado').eq('id', periodo).single<{ contable_estado: string }>()
    if (errP) throw errP
    expect(p.contable_estado).toBe('abierto')
  }, 20_000)

  it('2. cerrar con el periodo anterior abierto → bloqueado', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p2-anterior-abierto')
    await crearPeriodo(tenantId, ANIO_CICLO, 1) // queda abierto a propósito
    const periodo2 = await crearPeriodo(tenantId, ANIO_CICLO, 2)

    const { error } = await cliente.rpc('fn_contable_cerrar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodo2 })
    expect(error?.message).toContain('CONTABLE_CIERRE_BLOQUEADO')
    expect(error?.message).toContain('todavía está abierto')
  }, 20_000)

  it('3. cerrar con contable_conciliacion_proyeccion con diferencias → bloqueado', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p3-conciliacion')
    const periodo = await crearPeriodo(tenantId, ANIO_CICLO, 1)
    const inmuebleId = await crearInmueble(tenantId, 'p3')
    const conceptoId = await conceptoAdministracionId(tenantId)
    const liquidacion = await crearLiquidacion(tenantId, periodo, INGRESO)
    await pagarCargoCompleto({
      tenantId, inmuebleId, periodoId: periodo, liquidacionId: liquidacion,
      conceptoId, monto: INGRESO, fecha: `${String(ANIO_CICLO)}-01-10`,
    })
    const { error: errMat } = await cliente.rpc('fn_contabilizar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodo })
    if (errMat) throw errMat

    // Desincroniza deliberadamente la proyección de lo ya persistido: un cargo/pago NUEVO,
    // creado DESPUÉS de materializar y sin volver a materializar (misma liquidación, una línea
    // más — solo una liquidación "viva" por periodo, liquidaciones_viva_unica).
    // `contable_movimientos()` (la proyección) lo incluye de inmediato; lo persistido no. No se
    // toca ningún dato ya existente — ni `cargos` (append-only) ni
    // `contable_comprobante_detalle` (inmutable una vez contabilizado, CO-2) admiten update/delete.
    await pagarCargoCompleto({
      tenantId, inmuebleId, periodoId: periodo, liquidacionId: liquidacion,
      conceptoId, monto: 500, fecha: `${String(ANIO_CICLO)}-01-20`,
    })

    const { data: hallazgos, error: errValidacion } = await admin.rpc('contable_validacion_cierre', {
      p_tenant_id: tenantId, p_periodo_id: periodo,
    })
    if (errValidacion) throw errValidacion
    expect((hallazgos as { hallazgo: string }[]).some((h) => h.hallazgo === 'conciliacion_proyeccion')).toBe(true)

    const { error } = await cliente.rpc('fn_contable_cerrar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodo })
    expect(error?.message).toContain('CONTABLE_CIERRE_BLOQUEADO')
  }, 20_000)

  it('4. cerrado el periodo, contabilizar en él → CONTABLE_PERIODO_CERRADO', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p4-periodo-cerrado')
    const periodo = await crearPeriodo(tenantId, ANIO_CICLO, 1)
    const { error: errCierre } = await cliente.rpc('fn_contable_cerrar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodo })
    if (errCierre) throw errCierre

    const compId = await crearComprobanteManual({
      tenantId, periodoId: periodo, fecha: `${String(ANIO_CICLO)}-01-20`, monto: 1000,
      cuentaDebitoCodigo: '110505', cuentaCreditoCodigo: '4610', contabilizar: false,
    })
    const { error } = await cliente.rpc('fn_contabilizar_comprobante', { p_comprobante_id: compId })
    expect(error?.message).toContain('CONTABLE_PERIODO_CERRADO')
  }, 20_000)

  // ═══════════════════════════════════════════════════════════════════
  // Pruebas 5-7: fn_contable_reabrir_periodo
  // ═══════════════════════════════════════════════════════════════════

  it('5. reabrir sin motivo → error; con motivo → abre y queda auditado', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p5-reapertura') // cliente = administrador
    const periodo = await crearPeriodo(tenantId, ANIO_CICLO, 1)
    const { error: errCierre } = await cliente.rpc('fn_contable_cerrar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodo })
    if (errCierre) throw errCierre

    const { error: errSinMotivo } = await cliente.rpc('fn_contable_reabrir_periodo', {
      p_tenant_id: tenantId, p_periodo_id: periodo, p_motivo: '',
    })
    expect(errSinMotivo?.message).toContain('CONTABLE_PERIODO_REAPERTURA_SIN_MOTIVO')

    const { error: errConMotivo } = await cliente.rpc('fn_contable_reabrir_periodo', {
      p_tenant_id: tenantId, p_periodo_id: periodo, p_motivo: 'corrección de prueba 5',
    })
    if (errConMotivo) throw errConMotivo

    const { data: p, error: errP } = await admin
      .from('periodos').select('contable_estado, contable_reabierto_motivo').eq('id', periodo)
      .single<{ contable_estado: string; contable_reabierto_motivo: string | null }>()
    if (errP) throw errP
    expect(p.contable_estado).toBe('abierto')
    expect(p.contable_reabierto_motivo).toBe('corrección de prueba 5')

    const { data: auditoria, error: errAud } = await admin
      .from('audit_log').select('id')
      .eq('entity_id', periodo).eq('action', 'contable.periodo.reabierto')
    if (errAud) throw errAud
    expect(auditoria.length).toBeGreaterThan(0)
  }, 20_000)

  it('6. reabrir enero con febrero cerrado → CONTABLE_PERIODO_POSTERIOR_CERRADO', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p6-posterior-cerrado') // cliente = administrador
    const enero = await crearPeriodo(tenantId, ANIO_CICLO, 1)
    const febrero = await crearPeriodo(tenantId, ANIO_CICLO, 2)
    const { error: errCierreEnero } = await cliente.rpc('fn_contable_cerrar_periodo', { p_tenant_id: tenantId, p_periodo_id: enero })
    if (errCierreEnero) throw errCierreEnero
    const { error: errCierreFebrero } = await cliente.rpc('fn_contable_cerrar_periodo', { p_tenant_id: tenantId, p_periodo_id: febrero })
    if (errCierreFebrero) throw errCierreFebrero

    const { error } = await cliente.rpc('fn_contable_reabrir_periodo', {
      p_tenant_id: tenantId, p_periodo_id: enero, p_motivo: 'intento inválido',
    })
    expect(error?.message).toContain('CONTABLE_PERIODO_POSTERIOR_CERRADO')
  }, 20_000)

  it('7. un auxiliar no puede reabrir; un administrador sí', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p7-roles') // cliente = administrador (create_tenant)
    const periodo = await crearPeriodo(tenantId, ANIO_CICLO, 1)
    const { error: errCierre } = await cliente.rpc('fn_contable_cerrar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodo })
    if (errCierre) throw errCierre

    const clienteAuxiliar = await crearAuxiliar(tenantId, 'p7-auxiliar')
    const { error: errAuxiliar } = await clienteAuxiliar.rpc('fn_contable_reabrir_periodo', {
      p_tenant_id: tenantId, p_periodo_id: periodo, p_motivo: 'intento de auxiliar',
    })
    expect(errAuxiliar?.message).toContain('FORBIDDEN')

    const { error: errAdmin } = await cliente.rpc('fn_contable_reabrir_periodo', {
      p_tenant_id: tenantId, p_periodo_id: periodo, p_motivo: 'reapertura por administrador',
    })
    if (errAdmin) throw errAdmin

    const { data: p, error: errP } = await admin.from('periodos').select('contable_estado').eq('id', periodo).single<{ contable_estado: string }>()
    if (errP) throw errP
    expect(p.contable_estado).toBe('abierto')
  }, 20_000)

  // ═══════════════════════════════════════════════════════════════════
  // Ciclo anual completo — pruebas 8, 9, 10, 11, 12 y 14
  // ═══════════════════════════════════════════════════════════════════

  let ciclo: {
    tenantId: string
    cliente: Cliente
    fechaCierre: string
    cuentaResultadoId: string
    comprobanteCierreId: string
  }

  beforeAll(async () => {
    const { tenantId, cliente } = await crearTenantCompleto('ciclo-anual')
    await clasificar(tenantId, 'grupo_2')
    const inmuebleId = await crearInmueble(tenantId, 'ciclo')
    const conceptoId = await conceptoAdministracionId(tenantId)
    const hojaEgreso = await unaHojaEgreso(tenantId)
    const centroCostoId = await unCentroCostoId()

    for (let mes = 1; mes <= 12; mes++) {
      const periodo = await crearPeriodo(tenantId, ANIO_CICLO, mes)

      if (mes === MES_INGRESO) {
        const liquidacion = await crearLiquidacion(tenantId, periodo, INGRESO)
        await pagarCargoCompleto({
          tenantId, inmuebleId, periodoId: periodo, liquidacionId: liquidacion,
          conceptoId, monto: INGRESO, fecha: `${String(ANIO_CICLO)}-${String(mes).padStart(2, '0')}-10`,
        })
      }
      if (mes === MES_EGRESO) {
        const { error: errPe } = await admin.from('presupuesto_ejecucion').insert({
          tenant_id: tenantId, cuenta_id: hojaEgreso.id, periodo_id: periodo, monto: EGRESO,
          liquidacion: 'pagado_caja', fecha_documento: `${String(ANIO_CICLO)}-${String(mes).padStart(2, '0')}-10`,
          centro_costo_id: centroCostoId,
        })
        if (errPe) throw new Error(`fixture presupuesto_ejecucion: ${errPe.message}`)
      }
      if (mes === MES_INGRESO || mes === MES_EGRESO) {
        const { error: errMat } = await cliente.rpc('fn_contabilizar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodo })
        if (errMat) throw errMat
      }

      const { error: errCierre } = await cliente.rpc('fn_contable_cerrar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodo })
      if (errCierre) throw new Error(`fixture cerrar periodo ${String(mes)}: ${errCierre.message}`)
    }

    const { data: comprobanteCierreId, error: errCerrarEjercicio } = await cliente.rpc('fn_contable_cerrar_ejercicio', {
      p_tenant_id: tenantId, p_anio: ANIO_CICLO,
    })
    if (errCerrarEjercicio) throw errCerrarEjercicio

    const cuentaResultadoId = await cuentaPorCodigo(tenantId, '3310')

    ciclo = {
      tenantId, cliente, fechaCierre: `${String(ANIO_CICLO)}-12-31`,
      cuentaResultadoId, comprobanteCierreId: comprobanteCierreId,
    }
  }, 120_000)

  it('8. tras el cierre de ejercicio, el saldo de toda cuenta de clase 4, 5 y 6 es exactamente cero', async () => {
    const { data: mayor, error } = await admin.rpc('contable_libro_mayor', {
      p_tenant_id: ciclo.tenantId, p_desde: '0001-01-01', p_hasta: ciclo.fechaCierre,
    })
    if (error) throw error
    const clases456 = (mayor as FilaMayor[]).filter((f) => ['4', '5', '6'].includes(f.cuenta_codigo[0]!))
    expect(clases456.length).toBeGreaterThan(0)
    for (const cuenta of clases456) {
      expect(cuenta.saldo_final).toBe(0)
    }
  })

  it('9. el comprobante de cierre cuadra y usa la cuenta mapeada a RESULTADO_EJERCICIO', async () => {
    const { data: detalle, error } = await admin
      .from('contable_comprobante_detalle')
      .select('cuenta_id, debito, credito')
      .eq('comprobante_id', ciclo.comprobanteCierreId)
    if (error) throw error
    const filas = detalle as FilaDetalle[]
    const totalDebito = filas.reduce((s, f) => s + f.debito, 0)
    const totalCredito = filas.reduce((s, f) => s + f.credito, 0)
    expect(totalDebito).toBe(totalCredito)

    const lineaResultado = filas.find((f) => f.cuenta_id === ciclo.cuentaResultadoId)
    expect(lineaResultado).toBeDefined()
    expect(lineaResultado!.credito).toBe(INGRESO - EGRESO) // excedente: ingreso > egreso
  })

  it('10. la apertura del ejercicio siguiente reproduce exactamente los saldos de balance del cierre anterior', async () => {
    const { data: saldosCierre, error: errCierre } = await admin.rpc('contable_libro_mayor', {
      p_tenant_id: ciclo.tenantId, p_desde: '0001-01-01', p_hasta: ciclo.fechaCierre,
    })
    if (errCierre) throw errCierre
    // saldo_final viene NATURALIZADO (contable_libro_mayor, CO-4: positivo según naturaleza de
    // la cuenta) — se vuelve a crudo (debito - credito) para comparar contra las líneas del
    // comprobante de apertura, que se construyen en crudo (mismo criterio que
    // fn_contable_cerrar_ejercicio/fn_contable_abrir_ejercicio).
    const balanceCierre = new Map(
      (saldosCierre as FilaMayor[])
        .filter((f) => ['1', '2', '3'].includes(f.cuenta_codigo[0]!))
        .map((f) => [f.cuenta_id, f.naturaleza === 'debito' ? f.saldo_final : -f.saldo_final]),
    )

    const { data: comprobanteAperturaId, error: errApertura } = await ciclo.cliente.rpc('fn_contable_abrir_ejercicio', {
      p_tenant_id: ciclo.tenantId, p_anio: ANIO_SIGUIENTE,
    })
    if (errApertura) throw errApertura

    const { data: detalle, error: errDetalle } = await admin
      .from('contable_comprobante_detalle')
      .select('cuenta_id, debito, credito')
      .eq('comprobante_id', comprobanteAperturaId)
    if (errDetalle) throw errDetalle

    // Agregado por cuenta_id: la apertura puede tener varias líneas por cuenta (una por cada
    // combinación de dimensiones, §3.4/§3.5), mientras que contable_libro_mayor da un solo saldo
    // por cuenta — se compara total contra total, no línea contra línea.
    const netoAperturaPorCuenta = new Map<string, number>()
    for (const linea of detalle as FilaDetalle[]) {
      netoAperturaPorCuenta.set(
        linea.cuenta_id, (netoAperturaPorCuenta.get(linea.cuenta_id) ?? 0) + (linea.debito - linea.credito),
      )
    }
    for (const [cuentaId, neto] of netoAperturaPorCuenta) {
      const saldoOriginal = balanceCierre.get(cuentaId)
      expect(saldoOriginal).toBeDefined()
      expect(neto).toBe(saldoOriginal)
    }
  }, 30_000)

  it('11. ejecutar la apertura dos veces no duplica el comprobante', async () => {
    const { data: primera, error: err1 } = await ciclo.cliente.rpc('fn_contable_abrir_ejercicio', {
      p_tenant_id: ciclo.tenantId, p_anio: ANIO_SIGUIENTE,
    })
    if (err1) throw err1
    const { data: segunda, error: err2 } = await ciclo.cliente.rpc('fn_contable_abrir_ejercicio', {
      p_tenant_id: ciclo.tenantId, p_anio: ANIO_SIGUIENTE,
    })
    if (err2) throw err2
    expect(segunda).toBe(primera)

    const { count, error: errCount } = await admin
      .from('contable_comprobante')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ciclo.tenantId).eq('origen_evento', 'apertura_ejercicio')
    if (errCount) throw errCount
    expect(count).toBe(1)
  })

  it('12. el ESF de apertura del ejercicio nuevo es idéntico al ESF de cierre del anterior, salvo el traslado del resultado', async () => {
    const { data: esfCierre, error: errCierre } = await conReintento(() => admin.rpc('contable_estado_financiero', {
      p_tenant_id: ciclo.tenantId, p_codigo_estado: 'estado_situacion_financiera', p_fecha_corte: ciclo.fechaCierre,
    }))
    if (errCierre) throw errCierre
    const { data: esfApertura, error: errApertura } = await conReintento(() => admin.rpc('contable_estado_financiero', {
      p_tenant_id: ciclo.tenantId, p_codigo_estado: 'estado_situacion_financiera',
      p_fecha_corte: `${String(ANIO_SIGUIENTE)}-01-01`,
    }))
    if (errApertura) throw errApertura
    const filasCierre = esfCierre as FilaEstado[]
    const filasApertura = esfApertura as FilaEstado[]

    const totalActivoCierre = porCodigo(filasCierre, 'total_activo').valor!
    const totalActivoApertura = porCodigo(filasApertura, 'total_activo').valor!
    expect(totalActivoApertura).toBe(totalActivoCierre)

    const totalPPCierre = porCodigo(filasCierre, 'total_pasivo_mas_patrimonio').valor!
    const totalPPApertura = porCodigo(filasApertura, 'total_pasivo_mas_patrimonio').valor!
    expect(totalPPApertura).toBe(totalPPCierre)
    expect(totalActivoApertura).toBe(totalPPApertura)
  }, 20_000)

  it('14. un Grupo 2 con ejercicio cerrado → CONTABLE_CORRECCION_GRUPO_NO_RESUELTO, nada se modifica', async () => {
    const periodoEneroSiguiente = await periodoId(ciclo.tenantId, ANIO_SIGUIENTE, 1)
    const comprobanteCorrecto = await crearComprobanteManual({
      tenantId: ciclo.tenantId, periodoId: periodoEneroSiguiente,
      fecha: `${String(ANIO_SIGUIENTE)}-01-15`, monto: 500,
      cuentaDebitoCodigo: '110505', cuentaCreditoCodigo: '4610', contabilizar: false,
      cliente: ciclo.cliente,
    })

    const { error } = await ciclo.cliente.rpc('fn_contable_corregir_error', {
      p_tenant_id: ciclo.tenantId,
      p_comprobante_origen_id: ciclo.comprobanteCierreId,
      p_comprobante_correcto_id: comprobanteCorrecto,
      p_periodo_destino: periodoEneroSiguiente,
      p_motivo: 'intento sobre ejercicio ya cerrado (Grupo 2)',
      p_tipo_correccion: 'valor equivocado',
    })
    expect(error?.message).toContain('CONTABLE_CORRECCION_GRUPO_NO_RESUELTO')

    const { count, error: errCount } = await admin
      .from('contable_correccion').select('id', { count: 'exact', head: true })
      .eq('comprobante_origen_id', ciclo.comprobanteCierreId)
    if (errCount) throw errCount
    expect(count).toBe(0)

    const { data: origen, error: errOrigen } = await admin
      .from('contable_comprobante').select('estado').eq('id', ciclo.comprobanteCierreId)
      .single<{ estado: string }>()
    if (errOrigen) throw errOrigen
    expect(origen.estado).toBe('contabilizado')
  }, 20_000)

  // ═══════════════════════════════════════════════════════════════════
  // Prueba 13: corrección con ejercicio todavía abierto (periodo cerrado, no bloqueado)
  // ═══════════════════════════════════════════════════════════════════

  it('13. corregir un error de periodo cerrado genera reversión + comprobante correcto, y el neto del error es cero', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('p13-correccion')
    const periodoOrigen = await crearPeriodo(tenantId, ANIO_CICLO, 1)
    // fn_reversar_comprobante (CO-2) fecha la reversión con `current_date` (HOY), no con la
    // fecha del comprobante original — el periodo destino tiene que ser el periodo real de HOY
    // para que esa fecha caiga dentro de su rango; ANIO_CICLO (2040, deliberadamente futuro para
    // no chocar con datos reales) no sirve como destino de una reversión.
    const ahora = new Date()
    const anioDestino = ahora.getUTCFullYear()
    const mesDestino = ahora.getUTCMonth() + 1
    const fechaDestino = ahora.toISOString().slice(0, 10)
    const periodoDestino = await crearPeriodo(tenantId, anioDestino, mesDestino)

    // El origen debe ser un comprobante REAL, materializado desde un cargo/pago (no uno
    // insertado a mano): contable_conciliacion_proyeccion (CO-3) compara TODO lo persistido
    // contra la proyección de cargos/pagos/presupuesto_ejecucion/fondo_movimientos — un
    // comprobante manual ajeno a esas cuatro tablas siempre aparece como diferencia (ninguna
    // combinación de cuentas lo evita), bloqueando el cierre del periodo permanentemente. Un
    // comprobante materializado por la vía normal, en cambio, coincide con su propia proyección
    // por construcción (igual que en el ciclo anual) y el periodo cierra limpio.
    const inmuebleId = await crearInmueble(tenantId, 'p13')
    const conceptoId = await conceptoAdministracionId(tenantId)
    const liquidacion = await crearLiquidacion(tenantId, periodoOrigen, 5000)
    await pagarCargoCompleto({
      tenantId, inmuebleId, periodoId: periodoOrigen, liquidacionId: liquidacion,
      conceptoId, monto: 5000, fecha: `${String(ANIO_CICLO)}-01-10`,
    })
    const { error: errMat } = await cliente.rpc('fn_contabilizar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodoOrigen })
    if (errMat) throw errMat
    // Camino B (CO-3) materializa 'cargos' y 'pago_aplicaciones' como comprobantes separados —
    // se toma específicamente la causación del cargo (el "error" a corregir).
    const { data: origenMaterializado, error: errOrigenMat } = await admin
      .from('contable_comprobante').select('id')
      .eq('tenant_id', tenantId).eq('periodo_id', periodoOrigen).eq('estado', 'contabilizado')
      .eq('origen_entidad', 'cargos')
      .single<{ id: string }>()
    if (errOrigenMat) throw errOrigenMat
    const comprobanteOrigen = origenMaterializado.id

    const { error: errCierre } = await cliente.rpc('fn_contable_cerrar_periodo', { p_tenant_id: tenantId, p_periodo_id: periodoOrigen })
    if (errCierre) throw errCierre

    const comprobanteCorrecto = await crearComprobanteManual({
      tenantId, periodoId: periodoDestino, fecha: fechaDestino, monto: 5000,
      cuentaDebitoCodigo: '110505', cuentaCreditoCodigo: '4610', contabilizar: false, cliente,
    })

    const { data: correccionId, error } = await cliente.rpc('fn_contable_corregir_error', {
      p_tenant_id: tenantId,
      p_comprobante_origen_id: comprobanteOrigen,
      p_comprobante_correcto_id: comprobanteCorrecto,
      p_periodo_destino: periodoDestino,
      p_motivo: 'corrección de prueba 13',
      p_tipo_correccion: 'valor equivocado',
    })
    if (error) throw error

    const { data: correccion, error: errCorreccion } = await admin
      .from('contable_correccion')
      .select('comprobante_origen_id, comprobante_reversion_id, comprobante_correcto_id')
      .eq('id', correccionId)
      .single<{ comprobante_origen_id: string; comprobante_reversion_id: string | null; comprobante_correcto_id: string }>()
    if (errCorreccion) throw errCorreccion
    expect(correccion.comprobante_origen_id).toBe(comprobanteOrigen)
    expect(correccion.comprobante_reversion_id).not.toBeNull()
    expect(correccion.comprobante_correcto_id).toBe(comprobanteCorrecto)

    // Neto del error = cero: origen + reversión se cancelan (misma cuenta, lados intercambiados).
    const { data: detalleOrigen, error: errDetOrigen } = await admin
      .from('contable_comprobante_detalle').select('cuenta_id, debito, credito')
      .eq('comprobante_id', comprobanteOrigen)
    if (errDetOrigen) throw errDetOrigen
    const { data: detalleReversion, error: errDetReversion } = await admin
      .from('contable_comprobante_detalle').select('cuenta_id, debito, credito')
      .eq('comprobante_id', correccion.comprobante_reversion_id!)
    if (errDetReversion) throw errDetReversion

    const netoPorCuenta = new Map<string, number>()
    for (const l of [...(detalleOrigen as FilaDetalle[]), ...(detalleReversion as FilaDetalle[])]) {
      netoPorCuenta.set(l.cuenta_id, (netoPorCuenta.get(l.cuenta_id) ?? 0) + (l.debito - l.credito))
    }
    for (const neto of netoPorCuenta.values()) {
      expect(neto).toBe(0)
    }

    const { data: correctoContabilizado, error: errCorrecto } = await admin
      .from('contable_comprobante').select('estado').eq('id', comprobanteCorrecto)
      .single<{ estado: string }>()
    if (errCorrecto) throw errCorrecto
    expect(correctoContabilizado.estado).toBe('contabilizado')
  }, 20_000)

  // ═══════════════════════════════════════════════════════════════════
  // Prueba 15: aislamiento entre tenants
  // ═══════════════════════════════════════════════════════════════════

  it('15. aislamiento entre tenants en las cinco funciones', async () => {
    const { cliente: clienteB } = await crearTenantCompleto('p15-aislamiento-b')
    const periodoAjeno = await periodoId(ciclo.tenantId, ANIO_CICLO, MES_INGRESO)

    const { data: validacion, error: errValidacion } = await clienteB.rpc('contable_validacion_cierre', {
      p_tenant_id: ciclo.tenantId, p_periodo_id: periodoAjeno,
    })
    // Sin membresía, periodos/comprobantes del tenant ajeno son invisibles bajo RLS: la función
    // no encuentra el periodo (PERIODO_INEXISTENTE) — nunca hallazgos reales de otro tenant.
    expect(errValidacion).not.toBeNull()
    expect(validacion).toBeNull()

    const { error: errCerrarPeriodo } = await clienteB.rpc('fn_contable_cerrar_periodo', {
      p_tenant_id: ciclo.tenantId, p_periodo_id: periodoAjeno,
    })
    expect(errCerrarPeriodo?.message).toContain('FORBIDDEN')

    const { error: errReabrir } = await clienteB.rpc('fn_contable_reabrir_periodo', {
      p_tenant_id: ciclo.tenantId, p_periodo_id: periodoAjeno, p_motivo: 'intento ajeno',
    })
    expect(errReabrir?.message).toContain('FORBIDDEN')

    const { error: errCerrarEjercicio } = await clienteB.rpc('fn_contable_cerrar_ejercicio', {
      p_tenant_id: ciclo.tenantId, p_anio: ANIO_CICLO + 5,
    })
    expect(errCerrarEjercicio?.message).toContain('FORBIDDEN')

    const { error: errAbrirEjercicio } = await clienteB.rpc('fn_contable_abrir_ejercicio', {
      p_tenant_id: ciclo.tenantId, p_anio: ANIO_CICLO + 5,
    })
    expect(errAbrirEjercicio?.message).toContain('FORBIDDEN')
  }, 20_000)
})
