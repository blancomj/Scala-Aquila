/**
 * CO-9 (20260932300000-20260932390000) — gobierno corporativo, asamblea y conservación.
 * Ver Casos de uso/Tres Modulos/Contabilidad/CO_09_gobierno_y_asamblea.md §6 y
 * CO_09_PARCHE_FRONTERA_GOBIERNO.md §3.3 (11 pruebas: las 10 originales menos la 7 —
 * "coeficiente vigente a la fecha de asamblea" ya no es responsabilidad de CO-9 tras el parche,
 * vive en GOB — más las 2 del parche).
 *
 * `principal` (fixture compartida, grupo_3/residencial) reproduce el mismo ciclo anual de
 * `tests/contabilidad/cierre-apertura.test.ts` (1 mes con ingreso, 1 con egreso, materializados,
 * 12 periodos cerrados, ejercicio cerrado) porque certificar exige un ejercicio bloqueado —
 * mismo patrón de fixture, tenant propio.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
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
  console.warn('SALTADO tests/contabilidad/rendicion-cuentas: faltan variables de Supabase en .env')
}

const ANIO = 2041
const ANIO_SIGUIENTE = ANIO + 1
const MES_INGRESO = 3
const MES_EGRESO = 6
const INGRESO = 900_000
const EGRESO = 400_000

interface RespuestaEnlace { documento_id: string; token: string; vigencia_dias: number; expira_en: string }
interface RespuestaVerDocumento { url: string }

d('CO-9: rendición de cuentas (certificación, dictamen, conservación)', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []
  const storagePaths: string[] = []

  afterAll(async () => {
    for (const path of storagePaths) await admin.storage.from('documentos-inmueble').remove([path])
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  // ── fixtures contables (mismo patrón que tests/contabilidad/cierre-apertura.test.ts) ──

  async function crearTenantCompleto(etiqueta: string, marcoGrupo: 'grupo_2' | 'grupo_3' = 'grupo_3') {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)
    const { data: tenant, error } = await cliente
      .rpc('create_tenant', { p_name: `CO-9 ${etiqueta}`, p_slug: `t9-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    const { error: errClasificar } = await admin
      .from('tenants').update({ marco_grupo: marcoGrupo, uso_economico: 'residencial' }).eq('id', tenant.id)
    if (errClasificar) throw new Error(`clasificar (${etiqueta}): ${errClasificar.message}`)
    return { tenantId: tenant.id, cliente }
  }

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', tipo).eq('codigo', codigo).is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  async function crearPeriodo(tenantId: string, anio: number, mes: number): Promise<string> {
    const { data, error } = await admin
      .from('periodos').insert({ tenant_id: tenantId, anio, mes }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture periodo ${String(anio)}-${String(mes)}: ${error.message}`)
    return data.id
  }

  async function periodoId(tenantId: string, anio: number, mes: number): Promise<string> {
    const { data, error } = await admin
      .from('periodos').select('id').eq('tenant_id', tenantId).eq('anio', anio).eq('mes', mes)
      .single<{ id: string }>()
    if (error) throw new Error(`fixture buscar periodo ${String(anio)}-${String(mes)}: ${error.message}`)
    return data.id
  }

  async function crearInmueble(tenantId: string, sufijo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_INMUEBLE', 'apartamento')
    const { data, error } = await admin
      .from('inmuebles').insert({ tenant_id: tenantId, codigo: `CO9-${sufijo}`, tipo_id: tipoId })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble: ${error.message}`)
    return data.id
  }

  async function conceptoAdministracionId(tenantId: string): Promise<string> {
    const { data, error } = await admin
      .from('conceptos').select('id').eq('tenant_id', tenantId).eq('codigo', 'ADMINISTRACION')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture concepto ADMINISTRACION: ${error.message}`)
    return data.id
  }

  async function crearLiquidacion(tenantId: string, periodoId_: string, montoTotal: number): Promise<string> {
    const sufijo = `${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await admin
      .from('liquidaciones')
      .insert({ tenant_id: tenantId, periodo_id: periodoId_, result_hash: `co9-fixture-${sufijo}`, tenant_total: montoTotal })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture liquidacion: ${error.message}`)
    return data.id
  }

  async function pagarCargoCompleto(params: {
    tenantId: string; inmuebleId: string; periodoId: string; liquidacionId: string
    conceptoId: string; monto: number; fecha: string
  }): Promise<void> {
    const { data: linea, error: errLinea } = await admin
      .from('liquidacion_lineas')
      .insert({
        tenant_id: params.tenantId, liquidacion_id: params.liquidacionId, inmueble_id: params.inmuebleId,
        concepto_id: params.conceptoId, monto: params.monto,
      })
      .select('id').single<{ id: string }>()
    if (errLinea) throw new Error(`fixture liquidacion_linea: ${errLinea.message}`)
    const { data: cargo, error: errCargo } = await admin
      .from('cargos')
      .insert({
        tenant_id: params.tenantId, inmueble_id: params.inmuebleId, periodo_id: params.periodoId,
        categoria: 'capital', origen_tipo: 'liquidacion_linea',
        liquidacion_linea_id: linea.id, concepto_id: params.conceptoId, monto_original: params.monto,
      })
      .select('id').single<{ id: string }>()
    if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)
    const { data: formaPago, error: errForma } = await admin
      .from('lista_tipos').select('id').eq('tipo', 'FORMA_PAGO').eq('codigo', 'efectivo').is('tenant_id', null)
      .single<{ id: number }>()
    if (errForma) throw new Error(`fixture forma_pago: ${errForma.message}`)
    const { data: pago, error: errPago } = await admin
      .from('pagos')
      .insert({
        tenant_id: params.tenantId, inmueble_id: params.inmuebleId, monto: params.monto,
        fecha_pago: params.fecha, fecha_registro: params.fecha, forma_pago_id: formaPago.id,
      })
      .select('id').single<{ id: string }>()
    if (errPago) throw new Error(`fixture pago: ${errPago.message}`)
    const { error: errAplic } = await admin.from('pago_aplicaciones').insert({
      tenant_id: params.tenantId, pago_id: pago.id, cargo_id: cargo.id, monto: params.monto,
    })
    if (errAplic) throw new Error(`fixture pago_aplicacion: ${errAplic.message}`)
  }

  async function unaHojaEgreso(tenantId: string): Promise<{ id: string }> {
    const { data, error } = await admin
      .from('presupuesto_cuenta')
      .select('id, contable_cuenta:contable_cuenta_id!inner(requiere_tercero)')
      .eq('tenant_id', tenantId).eq('naturaleza', 'egreso').eq('es_hoja', true).eq('activa', true)
      .eq('contable_cuenta.requiere_tercero', false)
      .limit(1).single<{ id: string }>()
    if (error) throw new Error(`fixture hoja egreso: ${error.message}`)
    return { id: data.id }
  }

  async function unCentroCostoId(): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', 'CENTRO_COSTO').is('tenant_id', null).eq('activo', true)
      .limit(1).single<{ id: number }>()
    if (error) throw new Error(`fixture centro_costo: ${error.message}`)
    return data.id
  }

  async function cuentaPorCodigo(tenantId: string, codigo: string): Promise<string> {
    const { data, error } = await admin
      .from('contable_cuenta').select('id').eq('tenant_id', tenantId).eq('codigo', codigo)
      .single<{ id: string }>()
    if (error) throw new Error(`fixture cuenta ${codigo}: ${error.message}`)
    return data.id
  }

  async function tipoAjusteId(): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', 'TIPO_COMPROBANTE').eq('codigo', 'AJUSTE').is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture tipo AJUSTE: ${error.message}`)
    return data.id
  }

  async function crearComprobanteManual(params: {
    tenantId: string; periodoId: string; fecha: string; monto: number
    cuentaDebitoCodigo: string; cuentaCreditoCodigo: string
  }): Promise<string> {
    const tipoId = await tipoAjusteId()
    const cuentaDebito = await cuentaPorCodigo(params.tenantId, params.cuentaDebitoCodigo)
    const cuentaCredito = await cuentaPorCodigo(params.tenantId, params.cuentaCreditoCodigo)
    const { data: comp, error } = await admin
      .from('contable_comprobante')
      .insert({
        tenant_id: params.tenantId, periodo_id: params.periodoId, tipo_id: tipoId,
        anio: Number(params.fecha.slice(0, 4)), fecha: params.fecha, descripcion: 'CO-9 fixture manual',
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture comprobante manual: ${error.message}`)
    const { error: errDet } = await admin.from('contable_comprobante_detalle').insert([
      { tenant_id: params.tenantId, comprobante_id: comp.id, linea: 1, cuenta_id: cuentaDebito, debito: params.monto, credito: 0 },
      { tenant_id: params.tenantId, comprobante_id: comp.id, linea: 2, cuenta_id: cuentaCredito, debito: 0, credito: params.monto },
    ])
    if (errDet) throw new Error(`fixture detalle manual: ${errDet.message}`)
    return comp.id
  }

  /** Ciclo anual completo (12 periodos, 1 mes con ingreso, 1 con egreso, materializados,
   * cerrados) + apertura del año siguiente — mismo patrón que cierre-apertura.test.ts `ciclo`. */
  async function construirEjercicioCerrado(tenantId: string, cliente: Cliente) {
    const inmuebleId = await crearInmueble(tenantId, `ciclo-${tenantId.slice(0, 8)}`)
    const conceptoId = await conceptoAdministracionId(tenantId)
    const hojaEgreso = await unaHojaEgreso(tenantId)
    const centroCostoId = await unCentroCostoId()

    for (let mes = 1; mes <= 12; mes++) {
      const periodo = await crearPeriodo(tenantId, ANIO, mes)
      if (mes === MES_INGRESO) {
        const liquidacion = await crearLiquidacion(tenantId, periodo, INGRESO)
        await pagarCargoCompleto({
          tenantId, inmuebleId, periodoId: periodo, liquidacionId: liquidacion, conceptoId, monto: INGRESO,
          fecha: `${String(ANIO)}-${String(mes).padStart(2, '0')}-10`,
        })
      }
      if (mes === MES_EGRESO) {
        const { error: errPe } = await admin.from('presupuesto_ejecucion').insert({
          tenant_id: tenantId, cuenta_id: hojaEgreso.id, periodo_id: periodo, monto: EGRESO,
          liquidacion: 'pagado_caja', fecha_documento: `${String(ANIO)}-${String(mes).padStart(2, '0')}-10`,
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

    const { data: comprobanteCierreId, error: errCerrar } = await cliente.rpc('fn_contable_cerrar_ejercicio', {
      p_tenant_id: tenantId, p_anio: ANIO,
    })
    if (errCerrar) throw errCerrar

    const { error: errAbrir } = await cliente.rpc('fn_contable_abrir_ejercicio', { p_tenant_id: tenantId, p_anio: ANIO_SIGUIENTE })
    if (errAbrir) throw errAbrir

    return { comprobanteCierreId }
  }

  // ── fixtures de gobierno (mismo patrón que tests/gobierno/decisiones.test.ts) ──

  async function crearTercero(tenantId: string, primerNombre: string): Promise<string> {
    const sello = `${RUN_ID}-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`
    const tipoIdentId = await idListaTipos('TIPO_IDENTIFICACION', 'cedula')
    const estadoActivoId = await idListaTipos('ESTADO_TERCERO', 'activo')
    const { data, error } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenantId, tipo_persona: 'natural', tipo_identificacion_id: tipoIdentId,
        numero_documento: sello, primer_nombre: primerNombre, primer_apellido: 'CO9', estado_id: estadoActivoId,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture tercero ${primerNombre}: ${error.message}`)
    return data.id
  }

  async function crearOrgano(tenantId: string): Promise<string> {
    const tipoId = await idListaTipos('ORGANO_GOBIERNO', 'asamblea_general')
    const { data, error } = await admin
      .from('gobierno_organos').insert({ tenant_id: tenantId, tipo_id: tipoId, vigente_desde: '2020-01-01' })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture organo: ${error.message}`)
    return data.id
  }

  async function crearMiembro(tenantId: string, organoId: string, terceroId: string, rolCodigo: string): Promise<string> {
    const rolId = await idListaTipos('ROL_CONCEJO_COPROPIEDAD', rolCodigo)
    const { data, error } = await admin
      .from('gobierno_miembros')
      .insert({ tenant_id: tenantId, organo_id: organoId, tercero_id: terceroId, rol_id: rolId, desde: '2020-01-01' })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture miembro ${rolCodigo}: ${error.message}`)
    return data.id
  }

  async function crearCoeficienteSet(tenantId: string, filas: { inmuebleId: string; valor: number }[]): Promise<void> {
    const sumaTotal = filas.reduce((acc, f) => acc + f.valor, 0)
    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .insert({ tenant_id: tenantId, version: 1, vigente_desde: '2020-01-01', estado: 'borrador', suma_total: sumaTotal })
      .select('id').single<{ id: string }>()
    if (errSet) throw new Error(`fixture coeficiente_sets: ${errSet.message}`)
    const { error: errCoef } = await admin.from('coeficientes').insert(
      filas.map((f) => ({ tenant_id: tenantId, set_id: set.id, inmueble_id: f.inmuebleId, valor: f.valor })),
    )
    if (errCoef) throw new Error(`fixture coeficientes: ${errCoef.message}`)
    await admin.from('coeficiente_sets').update({ estado: 'vigente' }).eq('id', set.id)
  }

  async function construirDecisionAprobada(etiqueta: string) {
    const { tenantId, cliente } = await crearTenantCompleto(etiqueta)
    const organoId = await crearOrgano(tenantId)
    const inmA = await crearInmueble(tenantId, `${etiqueta}-A`)
    const inmB = await crearInmueble(tenantId, `${etiqueta}-B`)
    await crearCoeficienteSet(tenantId, [{ inmuebleId: inmA, valor: 0.6 }, { inmuebleId: inmB, valor: 0.4 }])
    const propA = await crearTercero(tenantId, 'PropA')
    const propB = await crearTercero(tenantId, 'PropB')
    const pTercero = await crearTercero(tenantId, 'Presidente')
    const sTercero = await crearTercero(tenantId, 'Secretario')
    const presidenteMiembroId = await crearMiembro(tenantId, organoId, pTercero, 'presidente')
    const secretarioMiembroId = await crearMiembro(tenantId, organoId, sTercero, 'secretario')

    const tipoReunionId = await idListaTipos('TIPO_REUNION', 'asamblea_ordinaria')
    const { data: reunion, error: errReunion } = await admin
      .from('gobierno_reuniones')
      .insert({
        tenant_id: tenantId, organo_id: organoId, tipo_id: tipoReunionId, modalidad: 'presencial',
        convocatoria_regimen: 'primera', fecha_hora: '2041-06-01T15:00:00Z', lugar: 'Salón comunal',
      })
      .select('id').single<{ id: string }>()
    if (errReunion) throw new Error(`fixture reunion: ${errReunion.message}`)

    const { error: errAgenda } = await admin.from('gobierno_agenda_puntos')
      .insert({ tenant_id: tenantId, reunion_id: reunion.id, orden: 1, titulo: 'Aprobar rendición de cuentas' })
    if (errAgenda) throw new Error(`fixture agenda: ${errAgenda.message}`)

    const { data: asistA, error: errAsistA } = await admin.from('gobierno_asistencia')
      .insert({ tenant_id: tenantId, reunion_id: reunion.id, inmueble_id: inmA, asistente_ref: propA, calidad: 'propietario' })
      .select('id').single<{ id: string }>()
    if (errAsistA) throw new Error(`fixture asistencia A: ${errAsistA.message}`)
    const { data: asistB, error: errAsistB } = await admin.from('gobierno_asistencia')
      .insert({ tenant_id: tenantId, reunion_id: reunion.id, inmueble_id: inmB, asistente_ref: propB, calidad: 'propietario' })
      .select('id').single<{ id: string }>()
    if (errAsistB) throw new Error(`fixture asistencia B: ${errAsistB.message}`)

    const { error: errInstalar } = await cliente.from('gobierno_reuniones')
      .update({ estado: 'instalada', presidente_miembro_id: presidenteMiembroId, secretario_miembro_id: secretarioMiembroId })
      .eq('id', reunion.id)
    if (errInstalar) throw new Error(`fixture instalar: ${errInstalar.message}`)

    const { data: materia, error: errMateria } = await admin
      .from('gobierno_materia_decision').select('id').eq('codigo', 'ordinaria').single<{ id: number }>()
    if (errMateria) throw new Error(`fixture materia ordinaria: ${errMateria.message}`)
    const materiaId = materia.id
    const { data: votacion, error: errVot } = await admin
      .from('gobierno_votaciones')
      .insert({ tenant_id: tenantId, reunion_id: reunion.id, materia_id: materiaId, pregunta: '¿Aprobar rendición?' })
      .select('id').single<{ id: string }>()
    if (errVot) throw new Error(`fixture votacion: ${errVot.message}`)
    await admin.from('gobierno_votos').insert({ tenant_id: tenantId, votacion_id: votacion.id, asistencia_id: asistA.id, sentido: 'favor', coeficiente: 0 })
    await admin.from('gobierno_votos').insert({ tenant_id: tenantId, votacion_id: votacion.id, asistencia_id: asistB.id, sentido: 'contra', coeficiente: 0 })
    const { data: cerrada, error: errCierreVot } = await admin
      .from('gobierno_votaciones').update({ estado: 'cerrada' }).eq('id', votacion.id)
      .select('resultado').single<{ resultado: string }>()
    if (errCierreVot) throw new Error(`fixture cerrar votacion: ${errCierreVot.message}`)
    if (cerrada.resultado !== 'aprobada') throw new Error(`fixture votacion: resultado inesperado ${cerrada.resultado}`)

    const { error: errCerrarReunion } = await cliente.from('gobierno_reuniones').update({ estado: 'cerrada' }).eq('id', reunion.id)
    if (errCerrarReunion) throw new Error(`fixture cerrar reunion: ${errCerrarReunion.message}`)

    const { data: decision, error: errDecision } = await admin
      .rpc('gobierno_crear_decision', { p_votacion_id: votacion.id, p_titulo: 'Aprobación de rendición de cuentas 2041' })
      .single<{ id: string; numero: number; anio: number }>()
    if (errDecision) throw new Error(`fixture decision: ${errDecision.message}`)

    return { tenantId, cliente, decisionId: decision.id, votacionId: votacion.id }
  }

  // ── ejercicio principal (grupo_3, para poder ejercitar la corrección post-cierre) ──
  let principal: { tenantId: string; cliente: Cliente; comprobanteCierreId: string }

  beforeAll(async () => {
    const { tenantId, cliente } = await crearTenantCompleto('principal', 'grupo_3')
    const { comprobanteCierreId } = await construirEjercicioCerrado(tenantId, cliente)
    principal = { tenantId, cliente, comprobanteCierreId }
  }, 180_000)

  // ── 1. Certificar un ejercicio abierto → CERTIFICACION_EJERCICIO_ABIERTO ──
  it('1. certificar un ejercicio abierto → CERTIFICACION_EJERCICIO_ABIERTO', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('abierto')
    for (let mes = 1; mes <= 12; mes++) await crearPeriodo(tenantId, ANIO, mes)

    const { error } = await cliente.rpc('fn_contable_certificar_estados', {
      p_tenant_id: tenantId, p_ejercicio: ANIO, p_fecha_corte: `${String(ANIO)}-12-31`,
      p_estados_incluidos: ['estado_situacion_financiera'], p_administrador_documento: '123',
      p_texto_certificacion: 'Certifico que verifiqué los estados.',
    })
    expect(error?.message).toContain('CERTIFICACION_EJERCICIO_ABIERTO')
  }, 30_000)

  // ── 2 + 4: certificar, congelamiento de datos del contador, estabilidad del hash ──
  let certificacionId: string
  let hashInicial: string
  const contadorTercero = { id: '', nombreOriginal: 'Carlos Contador' }

  it('2. certificar un ejercicio cerrado emite hash estable si las cifras no cambian', async () => {
    contadorTercero.id = await crearTercero(principal.tenantId, contadorTercero.nombreOriginal)

    const { data: cert1, error: err1 } = await principal.cliente.rpc('fn_contable_certificar_estados', {
      p_tenant_id: principal.tenantId, p_ejercicio: ANIO, p_fecha_corte: `${String(ANIO)}-12-31`,
      p_estados_incluidos: ['estado_situacion_financiera'], p_administrador_documento: '1000111222',
      p_texto_certificacion: 'Certifico que verifiqué los estados financieros del ejercicio.',
      p_contador_tercero_id: contadorTercero.id, p_contador_tarjeta_profesional: 'TP-99887',
    }).single<{ id: string; hash_contenido: string }>()
    if (err1) throw err1
    certificacionId = cert1.id
    hashInicial = cert1.hash_contenido
    expect(hashInicial).toMatch(/^[0-9a-f]{64}$/)

    const { error: errInvalidar } = await principal.cliente.rpc('fn_contable_invalidar_certificacion', {
      p_tenant_id: principal.tenantId, p_ejercicio: ANIO, p_motivo: 'recertificar sin cambios (prueba de estabilidad)',
    })
    if (errInvalidar) throw errInvalidar

    const { data: cert2, error: err2 } = await principal.cliente.rpc('fn_contable_certificar_estados', {
      p_tenant_id: principal.tenantId, p_ejercicio: ANIO, p_fecha_corte: `${String(ANIO)}-12-31`,
      p_estados_incluidos: ['estado_situacion_financiera'], p_administrador_documento: '1000111222',
      p_texto_certificacion: 'Segunda certificación, mismas cifras.',
      p_contador_tercero_id: contadorTercero.id, p_contador_tarjeta_profesional: 'TP-99887',
    }).single<{ id: string; hash_contenido: string }>()
    if (err2) throw err2
    expect(cert2.hash_contenido).toBe(hashInicial)
    certificacionId = cert2.id
  }, 30_000)

  it('4. los datos del contador quedan congelados al certificar', async () => {
    // crearTercero fija primer_apellido='CO9' — nombre_completo real incluye ese apellido.
    const nombreCongelado = `${contadorTercero.nombreOriginal} CO9`
    const { data: antes, error: errAntes } = await admin
      .from('contable_certificacion').select('contador_nombre').eq('id', certificacionId).single<{ contador_nombre: string }>()
    if (errAntes) throw errAntes
    expect(antes.contador_nombre).toBe(nombreCongelado)

    const { error: errUpdate } = await admin
      .from('terceros').update({ primer_nombre: 'OtroNombre' }).eq('id', contadorTercero.id)
    if (errUpdate) throw errUpdate

    const { data: despues, error: errDespues } = await admin
      .from('contable_certificacion').select('contador_nombre').eq('id', certificacionId).single<{ contador_nombre: string }>()
    if (errDespues) throw errDespues
    expect(despues.contador_nombre).toBe(nombreCongelado)
  }, 15_000)

  // ── 3: corregir un ejercicio ya certificado invalida la certificación; usarla → CERTIFICACION_INVALIDADA ──
  it('3. corregir un ejercicio certificado (Grupo 3) invalida la certificación vigente', async () => {
    const periodoEneroSiguiente = await periodoId(principal.tenantId, ANIO_SIGUIENTE, 1)
    const comprobanteCorrecto = await crearComprobanteManual({
      tenantId: principal.tenantId, periodoId: periodoEneroSiguiente, fecha: `${String(ANIO_SIGUIENTE)}-01-15`,
      monto: 250, cuentaDebitoCodigo: '110505', cuentaCreditoCodigo: '4610',
    })

    const { error: errCorregir } = await principal.cliente.rpc('fn_contable_corregir_error', {
      p_tenant_id: principal.tenantId,
      p_comprobante_origen_id: principal.comprobanteCierreId,
      p_comprobante_correcto_id: comprobanteCorrecto,
      p_periodo_destino: periodoEneroSiguiente,
      p_motivo: 'ajuste de valor detectado tras el cierre',
      p_tipo_correccion: 'valor equivocado',
    })
    if (errCorregir) throw errCorregir

    const { data: certificacion, error: errCert } = await admin
      .from('contable_certificacion').select('invalidada, invalidada_motivo')
      .eq('id', certificacionId).single<{ invalidada: boolean; invalidada_motivo: string | null }>()
    if (errCert) throw errCert
    expect(certificacion.invalidada).toBe(true)
    expect(certificacion.invalidada_motivo).toContain('ajuste de valor detectado tras el cierre')

    const { error: errRendicion } = await principal.cliente.rpc('fn_contable_crear_rendicion', {
      p_tenant_id: principal.tenantId, p_ejercicio: ANIO, p_periodo_desde: `${String(ANIO)}-01-01`,
      p_periodo_hasta: `${String(ANIO)}-12-31`, p_certificacion_id: certificacionId,
    })
    expect(errRendicion?.message).toContain('CERTIFICACION_INVALIDADA')
  }, 30_000)

  // ── 5 + 6: dictamen obligatorio (comercial) vs. opcional (residencial); aprobar bloquea el ejercicio ──
  let rendicionResidencialId: string
  it('5. una copropiedad comercial no puede presentar sin dictamen; una residencial sí puede', async () => {
    const { tenantId: tenantComercial, cliente: clienteComercial } = await crearTenantCompleto('comercial')
    await admin.from('tenants').update({ uso_economico: 'comercial' }).eq('id', tenantComercial)
    await construirEjercicioCerrado(tenantComercial, clienteComercial)
    const { data: certComercial, error: errCertComercial } = await clienteComercial.rpc('fn_contable_certificar_estados', {
      p_tenant_id: tenantComercial, p_ejercicio: ANIO, p_fecha_corte: `${String(ANIO)}-12-31`,
      p_estados_incluidos: ['estado_situacion_financiera'], p_administrador_documento: '999',
      p_texto_certificacion: 'Certifico (comercial).',
    }).single<{ id: string }>()
    if (errCertComercial) throw errCertComercial
    const { data: rendComercial, error: errRendComercial } = await clienteComercial.rpc('fn_contable_crear_rendicion', {
      p_tenant_id: tenantComercial, p_ejercicio: ANIO, p_periodo_desde: `${String(ANIO)}-01-01`,
      p_periodo_hasta: `${String(ANIO)}-12-31`, p_certificacion_id: certComercial.id,
    }).single<{ id: string }>()
    if (errRendComercial) throw errRendComercial
    const { error: errPresentarComercial } = await clienteComercial.rpc('fn_contable_presentar_rendicion', {
      p_id: rendComercial.id, p_acta_referencia_texto: 'Acta asamblea comercial s/n',
    })
    expect(errPresentarComercial?.message).toContain('RENDICION_SIN_DICTAMEN_OBLIGATORIO')

    // Residencial (principal), sin tiene_revisor_fiscal marcado: sí puede presentar sin dictamen.
    // La certificación de las pruebas 2/3/4 ya quedó invalidada por la prueba 3 — se certifica de
    // nuevo (principal no tiene ninguna vigente en este punto).
    const { data: certResidencial, error: errCertResidencial } = await principal.cliente.rpc('fn_contable_certificar_estados', {
      p_tenant_id: principal.tenantId, p_ejercicio: ANIO, p_fecha_corte: `${String(ANIO)}-12-31`,
      p_estados_incluidos: ['estado_situacion_financiera'], p_administrador_documento: '1000111222',
      p_texto_certificacion: 'Tercera certificación, para la rendición residencial.',
    }).single<{ id: string }>()
    if (errCertResidencial) throw errCertResidencial
    const { data: rendResidencial, error: errRendResidencial } = await principal.cliente.rpc('fn_contable_crear_rendicion', {
      p_tenant_id: principal.tenantId, p_ejercicio: ANIO, p_periodo_desde: `${String(ANIO)}-01-01`,
      p_periodo_hasta: `${String(ANIO)}-12-31`, p_certificacion_id: certResidencial.id,
    }).single<{ id: string }>()
    if (errRendResidencial) throw errRendResidencial
    const { error: errPresentarResidencial } = await principal.cliente.rpc('fn_contable_presentar_rendicion', {
      p_id: rendResidencial.id, p_acta_referencia_texto: 'Acta asamblea ordinaria s/n',
    })
    if (errPresentarResidencial) throw errPresentarResidencial
    rendicionResidencialId = rendResidencial.id
  }, 60_000)

  it('6. aprobada la rendición, el ejercicio queda bloqueado', async () => {
    const { data: aprobada, error } = await principal.cliente
      .rpc('fn_contable_aprobar_rendicion', { p_id: rendicionResidencialId })
      .single<{ estado: string; aprobada_at: string | null }>()
    if (error) throw error
    expect(aprobada.estado).toBe('aprobada')
    expect(aprobada.aprobada_at).not.toBeNull()

    const { data: periodos, error: errPeriodos } = await admin
      .from('periodos').select('contable_estado').eq('tenant_id', principal.tenantId).eq('anio', ANIO)
    if (errPeriodos) throw errPeriodos
    expect(periodos).toHaveLength(12)
    for (const p of periodos) expect(p.contable_estado).toBe('bloqueado')
  }, 15_000)

  // ── 8: enlace de consulta caducado no devuelve el documento ──
  it('8. un enlace de consulta con token caducado no devuelve el documento', async () => {
    const tipoDocId = await idListaTipos('TIPO_DOCUMENTO', 'rendicion_cuentas')
    const { data: documento, error: errDoc } = await admin
      .from('documentos')
      .insert({
        tenant_id: principal.tenantId, tipo_documento_id: tipoDocId,
        nombre_archivo: 'rendicion-fixture.pdf', storage_path: `${principal.tenantId}/_copropiedad/${crypto.randomUUID()}/1_rendicion-fixture.pdf`,
        tamano_bytes: 10,
      })
      .select('id').single<{ id: string }>()
    if (errDoc) throw errDoc

    const { data: enlace, response: respEnlace } = await principal.cliente.functions.invoke<RespuestaEnlace>(
      'generar-enlace-documento', { body: { documento_id: documento.id, vigencia_dias: 0 } },
    )
    expect(respEnlace?.status).toBe(200)

    const { data, response } = await admin.functions.invoke<RespuestaVerDocumento>(
      'ver-documento', { body: { id: documento.id, t: enlace!.token } },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(410)
  }, 30_000)

  // ── 9: un documento bajo legal_hold no se marca para purga aunque venza el plazo ──
  it('9. un documento bajo legal_hold no se purga aunque venza el plazo de conservación', async () => {
    const tipoDocId = await idListaTipos('TIPO_DOCUMENTO', 'certificacion_estados_financieros')
    const { data: documentoViejo, error: errDoc } = await admin
      .from('documentos')
      .insert({
        tenant_id: principal.tenantId, tipo_documento_id: tipoDocId,
        nombre_archivo: 'certificacion-vieja.pdf',
        storage_path: `${principal.tenantId}/_copropiedad/${crypto.randomUUID()}/1_certificacion-vieja.pdf`,
        tamano_bytes: 10, created_at: '2010-01-01T00:00:00Z',
      })
      .select('id, grupo_id').single<{ id: string; grupo_id: string }>()
    if (errDoc) throw errDoc

    const { error: errPolitica } = await admin.from('contable_politica_conservacion').insert({
      tenant_id: principal.tenantId, tipo_documento_id: tipoDocId, plazo_anios: 5,
    })
    if (errPolitica) throw errPolitica

    const { data: antesHold, error: errAntes } = await admin.rpc('contable_documentos_proximos_vencer_retencion', {
      p_tenant_id: principal.tenantId, p_dias_anticipacion: 36_500,
    })
    if (errAntes) throw errAntes
    const filaAntes = (antesHold as { documento_id: string; bajo_legal_hold: boolean }[]).find((f) => f.documento_id === documentoViejo.id)
    expect(filaAntes).toBeDefined()
    expect(filaAntes!.bajo_legal_hold).toBe(false)

    const { error: errActivar } = await principal.cliente.rpc('fn_activar_legal_hold', {
      p_tenant_id: principal.tenantId, p_documento_grupo_id: documentoViejo.grupo_id,
      p_motivo: 'documento bajo requerimiento — CO-9 prueba 9',
    })
    if (errActivar) throw errActivar

    const { data: despuesHold, error: errDespues } = await admin.rpc('contable_documentos_proximos_vencer_retencion', {
      p_tenant_id: principal.tenantId, p_dias_anticipacion: 36_500,
    })
    if (errDespues) throw errDespues
    const filaDespues = (despuesHold as { documento_id: string; bajo_legal_hold: boolean }[]).find((f) => f.documento_id === documentoViejo.id)
    expect(filaDespues).toBeDefined()
    expect(filaDespues!.bajo_legal_hold).toBe(true)
  }, 20_000)

  // ── 10: aislamiento entre tenants ──
  it('10. aislamiento entre tenants: un tenant ajeno no ve la certificación ni la rendición', async () => {
    const { cliente: clienteAjeno } = await crearTenantCompleto('ajeno')

    const { data: certAjena } = await clienteAjeno
      .from('contable_certificacion').select('id').eq('id', certificacionId)
    expect(certAjena).toEqual([])

    const { data: rendAjena } = await clienteAjeno
      .from('contable_rendicion_cuentas').select('id').eq('id', rendicionResidencialId)
    expect(rendAjena).toEqual([])
  }, 30_000)

  // ── 11 + 12: frontera con gobierno (parche §3.1/§3.3) ──
  it('11. una rendición con decision_id no duplica el resultado de la votación — se lee en vivo de gobierno', async () => {
    const { tenantId, cliente, decisionId } = await construirDecisionAprobada('gob11')
    await construirEjercicioCerrado(tenantId, cliente)
    const { data: cert, error: errCert } = await cliente.rpc('fn_contable_certificar_estados', {
      p_tenant_id: tenantId, p_ejercicio: ANIO, p_fecha_corte: `${String(ANIO)}-12-31`,
      p_estados_incluidos: ['estado_situacion_financiera'], p_administrador_documento: '777',
      p_texto_certificacion: 'Certifico (gobierno).',
    }).single<{ id: string }>()
    if (errCert) throw errCert
    const { data: rendicion, error: errRend } = await cliente.rpc('fn_contable_crear_rendicion', {
      p_tenant_id: tenantId, p_ejercicio: ANIO, p_periodo_desde: `${String(ANIO)}-01-01`,
      p_periodo_hasta: `${String(ANIO)}-12-31`, p_certificacion_id: cert.id,
    }).single<{ id: string }>()
    if (errRend) throw errRend
    const { data: presentada, error: errPresentar } = await cliente
      .rpc('fn_contable_presentar_rendicion', { p_id: rendicion.id, p_decision_id: decisionId })
      .single<Record<string, unknown>>()
    if (errPresentar) throw errPresentar

    // La fila no tiene ninguna columna de votos propia (parche §3.1) — la única forma de conocer
    // el resultado es seguir decision_id hasta gobierno_decisiones/gobierno_votaciones.
    expect(presentada).not.toHaveProperty('votos_favor')
    expect(presentada).not.toHaveProperty('coeficiente_favor')
    expect(presentada.decision_id).toBe(decisionId)

    const { data: decision, error: errDecisionLeida } = await admin
      .from('gobierno_decisiones').select('votacion_id, estado').eq('id', decisionId).single<{ votacion_id: string; estado: string }>()
    if (errDecisionLeida) throw errDecisionLeida
    const { data: votacion, error: errVotacionLeida } = await admin
      .from('gobierno_votaciones').select('resultado').eq('id', decision.votacion_id).single<{ resultado: string }>()
    if (errVotacionLeida) throw errVotacionLeida
    expect(votacion.resultado).toBe('aprobada')
    expect(decision.estado).toBe('vigente')
  }, 60_000)

  it('12. decision_id y acta_referencia_texto a la vez → RENDICION_ORIGEN_DUPLICADO', async () => {
    const { tenantId, cliente, decisionId } = await construirDecisionAprobada('gob12')
    await construirEjercicioCerrado(tenantId, cliente)
    const { data: cert, error: errCert } = await cliente.rpc('fn_contable_certificar_estados', {
      p_tenant_id: tenantId, p_ejercicio: ANIO, p_fecha_corte: `${String(ANIO)}-12-31`,
      p_estados_incluidos: ['estado_situacion_financiera'], p_administrador_documento: '888',
      p_texto_certificacion: 'Certifico (gobierno 2).',
    }).single<{ id: string }>()
    if (errCert) throw errCert
    const { data: rendicion, error: errRend } = await cliente.rpc('fn_contable_crear_rendicion', {
      p_tenant_id: tenantId, p_ejercicio: ANIO, p_periodo_desde: `${String(ANIO)}-01-01`,
      p_periodo_hasta: `${String(ANIO)}-12-31`, p_certificacion_id: cert.id,
    }).single<{ id: string }>()
    if (errRend) throw errRend

    const { error } = await cliente.rpc('fn_contable_presentar_rendicion', {
      p_id: rendicion.id, p_decision_id: decisionId, p_acta_referencia_texto: 'Acta también',
    })
    expect(error?.message).toContain('RENDICION_ORIGEN_DUPLICADO')
  }, 60_000)
})
