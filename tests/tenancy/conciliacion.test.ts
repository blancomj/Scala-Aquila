/**
 * importar-extracto-bancario + conciliar-linea (Edge Functions, HTTP real) —
 * Fase 3, Bloque B. Prueba contra la base real, no por inspección.
 *
 * El fixture del banco es SINTÉTICO — no verificado contra un extracto real
 * de Bancolombia (ver conciliacion-parsers.ts). Estos tests prueban la
 * mecánica: idempotencia, cascada de matching, y que el heurístico nunca
 * auto-aplica dinero (§6.1).
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
  type Cliente,
  type TenantPrueba,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/tenancy/conciliacion: faltan variables de Supabase en .env')
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

interface ContextoTenant {
  readonly periodoId: string
  readonly conceptoId: string
  readonly liquidacionId: string
}

/** Cargo de capital mínimo, mismo armado que otros tests de este módulo. */
async function armarCargoCapital(
  admin: Cliente,
  tenantId: string,
  ctx: ContextoTenant,
  monto: number,
): Promise<{ inmuebleId: string; codigo: string; cargoId: string }> {
  const tipoId = await tipoApartamentoId(admin)
  const codigo = `CIL-${String(Date.now())}${String(Math.floor(Math.random() * 10000))}`

  const { data: inmueble, error: e1 } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo, tipo_id: tipoId })
    .select('id')
    .single<{ id: string }>()
  if (e1) throw new Error(`fixture inmueble: ${e1.message}`)

  const { data: linea, error: e2 } = await admin
    .from('liquidacion_lineas')
    .insert({
      tenant_id: tenantId,
      liquidacion_id: ctx.liquidacionId,
      inmueble_id: inmueble.id,
      concepto_id: ctx.conceptoId,
      monto,
    })
    .select('id')
    .single<{ id: string }>()
  if (e2) throw new Error(`fixture linea: ${e2.message}`)

  const { data: cargo, error: e3 } = await admin
    .from('cargos')
    .insert({
      tenant_id: tenantId,
      inmueble_id: inmueble.id,
      periodo_id: ctx.periodoId,
      categoria: 'capital',
      origen_tipo: 'liquidacion_linea',
      liquidacion_linea_id: linea.id,
      concepto_id: ctx.conceptoId,
      monto_original: monto,
    })
    .select('id')
    .single<{ id: string }>()
  if (e3) throw new Error(`fixture cargo: ${e3.message}`)

  return { inmuebleId: inmueble.id, codigo, cargoId: cargo.id }
}

// El mes de referencia se calcula respecto a HOY (no un año fijo como '2027'): las líneas de
// extracto simulan movimientos ya ocurridos, y registrarPago() rechaza correctamente una fecha
// de pago posterior a "ahora" (PAGO_FECHA_INCOHERENTE) — un año fijo caduca en cuanto el reloj
// real lo alcanza. Un mes completo atrás dale margen a los ~10 días que usan los fixtures.
const MES_REF = (() => {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - 1, 1)
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 }
})()
/** 'DD/MM/AAAA', formato que espera csvBancolombia. */
function fechaCsv(dia: number): string {
  return `${String(dia).padStart(2, '0')}/${String(MES_REF.mes).padStart(2, '0')}/${String(MES_REF.anio)}`
}
/** 'AAAA-MM-DD', formato de columna date para INSERT directo. */
function fechaIso(dia: number): string {
  return `${String(MES_REF.anio)}-${String(MES_REF.mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function csvBancolombia(filas: { fecha: string; descripcion: string; referencia?: string; valor: number }[]): File {
  const lineas = [
    'Fecha,Descripción,Referencia,Valor',
    ...filas.map(
      (f) =>
        `${f.fecha},${f.descripcion},${f.referencia ?? ''},"${f.valor.toLocaleString('es-CO')},00"`,
    ),
  ]
  return new File([lineas.join('\n')], 'extracto.csv', { type: 'text/csv' })
}

interface RespuestaImportacion {
  extractoId: string
  lineasTotales: number
  lineasNuevas: number
  lineasYaExistian: number
  autoConciliadas: number
  propuestas: number
  sinCandidato: number
  noEsPago: number
}

d('conciliación bancaria (Edge Functions)', () => {
  let admin: Cliente
  let tenant: TenantPrueba
  let agente: UsuarioPrueba
  let auditor: UsuarioPrueba
  let clienteAgent: Cliente
  let ctx: ContextoTenant

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenant = await crearTenant(admin, 'conc-hf')
    agente = await crearUsuario(admin, 'conc-hf-agente')
    auditor = await crearUsuario(admin, 'conc-hf-auditor')
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    clienteAgent = await clienteComo(env!, agente)

    const { error: errPolitica } = await admin.from('politicas_financieras').insert({
      tenant_id: tenant.id,
      version: 1,
      estado: 'vigente',
      vigente_desde: '2026-01-01',
      redondeo_modo: 'half_up',
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto',
      coeficientes_suma_esperada: 1,
      policy_hash: 'test-fixture-hash',
      imputacion_orden: ['interes', 'capital', 'otro'],
      imputacion_estrategia: 'deuda_mas_antigua',
    })
    if (errPolitica) throw new Error(`fixture politica: ${errPolitica.message}`)

    const { data: periodo, error: eP } = await admin
      .from('periodos')
      .insert({
        tenant_id: tenant.id,
        anio: MES_REF.anio,
        mes: MES_REF.mes,
        estado: 'abierto',
        // Sin esto, v_cargo_saldo no puede determinar la fecha de vencimiento del cargo
        // (CAR §4.4 GAP-CAR-001) y cualquier intento de aplicar un pago falla en cascada.
        fecha_vencimiento: fechaIso(28),
      })
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
        result_hash: `conc-fixture-${String(Date.now())}`,
        tenant_total: 1_000_000,
      })
      .select('id')
      .single<{ id: string }>()
    if (eL) throw new Error(`fixture liquidacion: ${eL.message}`)

    ctx = { periodoId: periodo.id, conceptoId: concepto.id, liquidacionId: liq.id }
  }, 90_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, auditor.id)
  }, 90_000)

  it('un no-auxiliar recibe FORBIDDEN al importar', async () => {
    const clienteAuditorLocal = await clienteComo(env!, auditor)
    const form = new FormData()
    form.set('tenant_id', tenant.id)
    form.set('archivo', csvBancolombia([{ fecha: fechaCsv(1), descripcion: 'X', valor: 1000 }]))
    const { response } = await clienteAuditorLocal.functions.invoke('importar-extracto-bancario', { body: form })
    expect(response?.status).toBe(403)
  }, 60_000)

  it('monto exacto dentro de ventana AUTO-concilia y emite recibo con conceptos', async () => {
    const monto = 213_517
    const { inmuebleId, cargoId } = await armarCargoCapital(admin, tenant.id, ctx, monto)

    const form = new FormData()
    form.set('tenant_id', tenant.id)
    form.set(
      'archivo',
      csvBancolombia([{ fecha: fechaCsv(1), descripcion: 'TRANSFERENCIA RESIDENTE', valor: monto }]),
    )
    const { data, response } = await clienteAgent.functions.invoke<RespuestaImportacion>(
      'importar-extracto-bancario',
      { body: form },
    )
    expect(response?.status).toBe(200)
    expect(data?.autoConciliadas).toBe(1)
    expect(data?.lineasNuevas).toBe(1)

    const { data: linea } = await admin
      .from('extracto_linea')
      .select('estado, pago_id')
      .eq('extracto_id', data!.extractoId)
      .single<{ estado: string; pago_id: string }>()
    expect(linea?.estado).toBe('conciliada_auto')
    expect(linea?.pago_id).toBeTruthy()

    const { data: recibo } = await admin
      .from('recibos_caja')
      .select('folio, datos')
      .eq('pago_id', linea!.pago_id)
      .maybeSingle<{ folio: string; datos: { conceptos: unknown[] } }>()
    expect(recibo?.folio).toBeTruthy()
    expect(recibo?.datos.conceptos.length).toBeGreaterThan(0)

    const { data: cargoTras } = await admin
      .from('v_cargo_saldo')
      .select('monto_pendiente')
      .eq('id', cargoId)
      .single<{ monto_pendiente: number }>()
    expect(Number(cargoTras?.monto_pendiente)).toBe(0)
    void inmuebleId
  }, 90_000)

  it('REIMPORTAR el mismo archivo: cero líneas nuevas, cero pagos nuevos', async () => {
    const monto = 87_331
    await armarCargoCapital(admin, tenant.id, ctx, monto)
    const archivo = csvBancolombia([{ fecha: fechaCsv(2), descripcion: 'TRANSFERENCIA REIMPORT', valor: monto }])

    const form1 = new FormData()
    form1.set('tenant_id', tenant.id)
    form1.set('archivo', archivo)
    const primera = await clienteAgent.functions.invoke<RespuestaImportacion>('importar-extracto-bancario', {
      body: form1,
    })
    expect(primera.data?.lineasNuevas).toBe(1)

    const { data: pagosAntes } = await admin.from('pagos').select('id').eq('tenant_id', tenant.id)
    const totalPagosAntes = pagosAntes?.length ?? 0

    const form2 = new FormData()
    form2.set('tenant_id', tenant.id)
    form2.set('archivo', archivo)
    const segunda = await clienteAgent.functions.invoke<RespuestaImportacion>('importar-extracto-bancario', {
      body: form2,
    })
    expect(segunda.data?.lineasNuevas).toBe(0)
    expect(segunda.data?.extractoId).toBe(primera.data?.extractoId)

    const { data: pagosDespues } = await admin.from('pagos').select('id').eq('tenant_id', tenant.id)
    expect(pagosDespues?.length ?? 0).toBe(totalPagosAntes)
  }, 90_000)

  it('EXTRACTOS SOLAPADOS: la línea común no se duplica', async () => {
    const montoComun = 41_222
    const montoNuevo = 51_222
    await armarCargoCapital(admin, tenant.id, ctx, montoComun)
    await armarCargoCapital(admin, tenant.id, ctx, montoNuevo)

    const filaComun = { fecha: fechaCsv(3), descripcion: 'TRANSFERENCIA SOLAPE COMUN', valor: montoComun }
    const filaNueva = { fecha: fechaCsv(4), descripcion: 'TRANSFERENCIA SOLAPE NUEVA', valor: montoNuevo }

    const formA = new FormData()
    formA.set('tenant_id', tenant.id)
    formA.set('archivo', csvBancolombia([filaComun]))
    const respA = await clienteAgent.functions.invoke<RespuestaImportacion>('importar-extracto-bancario', {
      body: formA,
    })
    expect(respA.data?.lineasNuevas).toBe(1)

    const formB = new FormData()
    formB.set('tenant_id', tenant.id)
    formB.set('archivo', csvBancolombia([filaComun, filaNueva]))
    const respB = await clienteAgent.functions.invoke<RespuestaImportacion>('importar-extracto-bancario', {
      body: formB,
    })
    // Archivo B es un archivo DISTINTO (hash de archivo distinto), así que sí
    // se procesa — pero la línea común (mismo hash_linea) no se reprocesa.
    expect(respB.data?.lineasNuevas).toBe(1)
    expect(respB.data?.lineasYaExistian).toBe(1)
  }, 90_000)

  it('REGLA §6.1: heurístico con nombre parecido NUNCA auto-aplica', async () => {
    const monto = 733_991 // no coincide con ningún saldo pendiente exacto
    const { inmuebleId } = await armarCargoCapital(admin, tenant.id, ctx, monto + 50_000)

    const tipoIdent = await (async () => {
      const { data } = await admin
        .from('lista_tipos')
        .select('id')
        .eq('tipo', 'TIPO_IDENTIFICACION')
        .eq('codigo', 'cedula')
        .is('tenant_id', null)
        .single<{ id: number }>()
      return data!.id
    })()
    const estadoActivo = await (async () => {
      const { data } = await admin
        .from('lista_tipos')
        .select('id')
        .eq('tipo', 'ESTADO_TERCERO')
        .eq('codigo', 'activo')
        .is('tenant_id', null)
        .single<{ id: number }>()
      return data!.id
    })()
    const rolCopropietario = await (async () => {
      const { data } = await admin
        .from('lista_tipos')
        .select('id')
        .eq('tipo', 'PERSONA_PREDIO')
        .eq('codigo', 'copropietario')
        .is('tenant_id', null)
        .single<{ id: number }>()
      return data!.id
    })()

    const { data: tercero, error: eT } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_identificacion_id: tipoIdent,
        numero_documento: `CONC-${String(Date.now())}`,
        tipo_persona: 'natural',
        primer_nombre: 'Rodrigo',
        primer_apellido: 'Valderrama',
        estado_id: estadoActivo,
      })
      .select('id')
      .single<{ id: string }>()
    if (eT) throw new Error(`fixture tercero: ${eT.message}`)

    const { error: eR } = await admin.from('inmueble_persona_rol').insert({
      tenant_id: tenant.id,
      inmueble_id: inmuebleId,
      tercero_id: tercero.id,
      rol_id: rolCopropietario,
      es_pagador: true,
      vigente_desde: fechaIso(1),
    })
    if (eR) throw new Error(`fixture inmueble_persona_rol: ${eR.message}`)

    const form = new FormData()
    form.set('tenant_id', tenant.id)
    form.set(
      'archivo',
      csvBancolombia([{ fecha: fechaCsv(5), descripcion: 'TRANSF RODRIGO VALDERRAMA', valor: monto }]),
    )
    const { data } = await clienteAgent.functions.invoke<RespuestaImportacion>('importar-extracto-bancario', {
      body: form,
    })

    // El nombre coincide (heurístico alto) pero el monto no calza exacto con
    // ningún saldo pendiente — NUNCA debe auto-conciliar.
    expect(data?.autoConciliadas).toBe(0)
    expect((data?.propuestas ?? 0) + (data?.sinCandidato ?? 0)).toBeGreaterThan(0)

    const { data: linea } = await admin
      .from('extracto_linea')
      .select('estado, pago_id')
      .eq('extracto_id', data!.extractoId)
      .single<{ estado: string; pago_id: string | null }>()
    expect(linea?.estado).toBe('pendiente')
    expect(linea?.pago_id).toBeNull()
  }, 90_000)

  it('APLICAR DESDE LA COLA crea el pago por el camino canónico y emite recibo solo', async () => {
    const montoLinea = 64_800
    const { inmuebleId, cargoId } = await armarCargoCapital(admin, tenant.id, ctx, montoLinea)

    // Se fuerza a "pendiente" sin candidato automático (monto ligeramente
    // distinto del saldo, para simular una línea que cayó a la cola manual).
    const { data: extracto, error: eE } = await admin
      .from('extracto_bancario')
      .insert({
        tenant_id: tenant.id,
        origen: 'banco',
        nombre_archivo: 'manual.csv',
        hash_archivo: `manual-${String(Date.now())}`,
        lineas_totales: 1,
      })
      .select('id')
      .single<{ id: string }>()
    if (eE) throw new Error(`fixture extracto: ${eE.message}`)

    const { data: linea, error: eLi } = await admin
      .from('extracto_linea')
      .insert({
        extracto_id: extracto.id,
        tenant_id: tenant.id,
        fecha_movimiento: fechaIso(6),
        monto: montoLinea,
        descripcion_banco: 'CONSIGNACION MANUAL',
        hash_linea: `manual-linea-${String(Date.now())}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (eLi) throw new Error(`fixture linea: ${eLi.message}`)

    const { data, response } = await clienteAgent.functions.invoke<{ pago_id: string; estado: string }>(
      'conciliar-linea',
      {
        body: { accion: 'aplicar_a_inmueble', tenant_id: tenant.id, linea_id: linea.id, inmueble_id: inmuebleId },
      },
    )
    expect(response?.status).toBe(200)
    expect(data?.estado).toBe('conciliada_manual')
    expect(data?.pago_id).toBeTruthy()

    const { data: recibo } = await admin
      .from('recibos_caja')
      .select('folio')
      .eq('pago_id', data!.pago_id)
      .maybeSingle<{ folio: string }>()
    expect(recibo?.folio).toBeTruthy()

    const { data: cargoTras } = await admin
      .from('v_cargo_saldo')
      .select('monto_pendiente')
      .eq('id', cargoId)
      .single<{ monto_pendiente: number }>()
    expect(Number(cargoTras?.monto_pendiente)).toBe(0)
  }, 90_000)

  it('SOBREPAGO va a anticipo vía el mismo registrarPago(), no un pago inventado', async () => {
    const saldoPendiente = 30_000
    const montoLinea = 50_000 // excede el pendiente
    const { inmuebleId, cargoId } = await armarCargoCapital(admin, tenant.id, ctx, saldoPendiente)

    const { data: extracto } = await admin
      .from('extracto_bancario')
      .insert({
        tenant_id: tenant.id,
        origen: 'banco',
        nombre_archivo: 'sobrepago.csv',
        hash_archivo: `sobrepago-${String(Date.now())}`,
        lineas_totales: 1,
      })
      .select('id')
      .single<{ id: string }>()

    const { data: linea } = await admin
      .from('extracto_linea')
      .insert({
        extracto_id: extracto!.id,
        tenant_id: tenant.id,
        fecha_movimiento: fechaIso(7),
        monto: montoLinea,
        descripcion_banco: 'CONSIGNACION SOBREPAGO',
        hash_linea: `sobrepago-linea-${String(Date.now())}`,
      })
      .select('id')
      .single<{ id: string }>()

    const { data } = await clienteAgent.functions.invoke<{ pago_id: string }>('conciliar-linea', {
      body: {
        accion: 'aplicar_a_inmueble',
        tenant_id: tenant.id,
        linea_id: linea!.id,
        inmueble_id: inmuebleId,
      },
    })

    const { data: pago } = await admin
      .from('pagos')
      .select('monto')
      .eq('id', data!.pago_id)
      .single<{ monto: number }>()
    const { data: aplicaciones } = await admin
      .from('pago_aplicaciones')
      .select('monto')
      .eq('pago_id', data!.pago_id)
    const totalAplicado = (aplicaciones ?? []).reduce((s, a) => s + a.monto, 0)

    expect(Number(pago?.monto)).toBe(montoLinea)
    expect(totalAplicado).toBe(saldoPendiente) // el resto quedó como anticipo, no aplicado a ningún cargo
    expect(totalAplicado).toBeLessThan(Number(pago?.monto))

    const { data: cargoTras } = await admin
      .from('v_cargo_saldo')
      .select('monto_pendiente')
      .eq('id', cargoId)
      .single<{ monto_pendiente: number }>()
    expect(Number(cargoTras?.monto_pendiente)).toBe(0)
  }, 90_000)

  it('CREAR SALDO A FAVOR: todo el monto queda sin aplicar a ningún cargo', async () => {
    const saldoPendiente = 20_000
    const montoLinea = 20_000
    const { inmuebleId, cargoId } = await armarCargoCapital(admin, tenant.id, ctx, saldoPendiente)

    const { data: extracto } = await admin
      .from('extracto_bancario')
      .insert({
        tenant_id: tenant.id,
        origen: 'banco',
        nombre_archivo: 'saldofavor.csv',
        hash_archivo: `saldofavor-${String(Date.now())}`,
        lineas_totales: 1,
      })
      .select('id')
      .single<{ id: string }>()

    const { data: linea } = await admin
      .from('extracto_linea')
      .insert({
        extracto_id: extracto!.id,
        tenant_id: tenant.id,
        fecha_movimiento: fechaIso(8),
        monto: montoLinea,
        descripcion_banco: 'ABONO ANTICIPADO',
        hash_linea: `saldofavor-linea-${String(Date.now())}`,
      })
      .select('id')
      .single<{ id: string }>()

    const { data } = await clienteAgent.functions.invoke<{ pago_id: string }>('conciliar-linea', {
      body: {
        accion: 'crear_saldo_a_favor',
        tenant_id: tenant.id,
        linea_id: linea!.id,
        inmueble_id: inmuebleId,
      },
    })

    const { data: aplicaciones } = await admin
      .from('pago_aplicaciones')
      .select('id')
      .eq('pago_id', data!.pago_id)
    expect(aplicaciones ?? []).toHaveLength(0) // nada aplicado — el cargo sigue pendiente

    const { data: cargoTras } = await admin
      .from('v_cargo_saldo')
      .select('monto_pendiente')
      .eq('id', cargoId)
      .single<{ monto_pendiente: number }>()
    expect(Number(cargoTras?.monto_pendiente)).toBe(saldoPendiente)
  }, 90_000)

  it('descartar exige un motivo con al menos 3 caracteres', async () => {
    const { data: extracto } = await admin
      .from('extracto_bancario')
      .insert({
        tenant_id: tenant.id,
        origen: 'banco',
        nombre_archivo: 'descarte.csv',
        hash_archivo: `descarte-${String(Date.now())}`,
        lineas_totales: 1,
      })
      .select('id')
      .single<{ id: string }>()
    const { data: linea } = await admin
      .from('extracto_linea')
      .insert({
        extracto_id: extracto!.id,
        tenant_id: tenant.id,
        fecha_movimiento: fechaIso(9),
        monto: -5_000,
        descripcion_banco: 'COMISION',
        hash_linea: `descarte-linea-${String(Date.now())}`,
      })
      .select('id')
      .single<{ id: string }>()

    const { response } = await clienteAgent.functions.invoke('conciliar-linea', {
      body: { accion: 'descartar', tenant_id: tenant.id, linea_id: linea!.id, motivo: 'x' },
    })
    expect(response?.status).toBe(400)

    const ok = await clienteAgent.functions.invoke<{ estado: string }>('conciliar-linea', {
      body: { accion: 'descartar', tenant_id: tenant.id, linea_id: linea!.id, motivo: 'Comisión bancaria' },
    })
    expect(ok.data?.estado).toBe('descartada')

    const { error } = await admin
      .from('extracto_linea')
      .select('descartada_motivo')
      .eq('id', linea!.id)
      .single()
    expect(error).toBeNull()
  }, 60_000)

  it('resolver dos veces la misma línea da CONCILIACION_LINEA_YA_RESUELTA', async () => {
    const { inmuebleId } = await armarCargoCapital(admin, tenant.id, ctx, 12_345)
    const { data: extracto } = await admin
      .from('extracto_bancario')
      .insert({
        tenant_id: tenant.id,
        origen: 'banco',
        nombre_archivo: 'doble.csv',
        hash_archivo: `doble-${String(Date.now())}`,
        lineas_totales: 1,
      })
      .select('id')
      .single<{ id: string }>()
    const { data: linea } = await admin
      .from('extracto_linea')
      .insert({
        extracto_id: extracto!.id,
        tenant_id: tenant.id,
        fecha_movimiento: fechaIso(10),
        monto: 12_345,
        descripcion_banco: 'X',
        hash_linea: `doble-linea-${String(Date.now())}`,
      })
      .select('id')
      .single<{ id: string }>()

    await clienteAgent.functions.invoke('conciliar-linea', {
      body: { accion: 'aplicar_a_inmueble', tenant_id: tenant.id, linea_id: linea!.id, inmueble_id: inmuebleId },
    })

    const { response } = await clienteAgent.functions.invoke('conciliar-linea', {
      body: { accion: 'aplicar_a_inmueble', tenant_id: tenant.id, linea_id: linea!.id, inmueble_id: inmuebleId },
    })
    expect(response?.status).toBe(409)
  }, 90_000)

  it('cada acción de conciliación queda en audit_log', async () => {
    const { data } = await admin
      .from('audit_log')
      .select('action')
      .eq('tenant_id', tenant.id)
      .like('action', 'conciliacion.%')
    const acciones = new Set((data ?? []).map((a) => a.action))
    expect(acciones.has('conciliacion.aplicada')).toBe(true)
    expect(acciones.has('conciliacion.saldo_a_favor')).toBe(true)
    expect(acciones.has('conciliacion.descartada')).toBe(true)
  })
})
