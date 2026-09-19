#!/usr/bin/env node
/**
 * f7-05 / f7-06 / f7-09 — cierre contable en un tenant DESCARTABLE.
 *
 * Decisión del usuario (qa/decisiones.md, 2026-09-18): NO tocar T1 (su
 * septiembre sigue contable_estado=abierto). Se monta el flujo completo en
 * un tenant nuevo con datos mínimos ya conciliados (sin mora, pago completo
 * cada mes) para poder cerrar los 12 periodos de 2026 sin arrastrar la
 * cascada de 8 meses sin contabilizar que bloqueó a T1.
 *
 * Reutiliza el mismo patrón que scripts/qa/seed-qa-suite.mjs (T1/T2), pero
 * a escala mínima: 3 inmuebles, un solo concepto (ADMINISTRACION), sin
 * fondo de imprevistos, sin mora.
 */
import {
  cargarCatalogo,
  clienteAdmin,
  clienteComo,
  exigirLocal,
  invocarFuncion,
  log,
  paso,
} from '../lib.mjs'

exigirLocal()

// Año 2024 (ya terminado por completo) a propósito: certificar un ejercicio (f7-09) es una
// operación que en la vida real solo tiene sentido sobre un año YA CERRADO — usar el año en
// curso (2026) obligaría a fechar pagos "en el futuro" respecto al reloj del entorno (hoy es
// 2026-09-18), lo que el guard PAGO_FECHA_INCOHERENTE rechaza (con razón). 2024 evita el problema
// de raíz y es más realista para lo que este caso prueba.
const ANIO = 2024
const EMAIL_ADMIN = 'blancomj@gmail.com'
const admin = clienteAdmin()
const cat = await cargarCatalogo(admin)
const sesionAdmin = await clienteComo(admin, EMAIL_ADMIN)

const { data: userData } = await sesionAdmin.auth.getUser()
const adminUserId = userData.user.id

async function configurarTenant(tenantId, datos) {
  const { error } = await admin.from('tenants').update(datos).eq('id', tenantId)
  if (error) throw new Error(`configurar tenant: ${error.message}`)
}

async function crearInmuebles(tenantId, defs) {
  const creados = []
  for (const def of defs) {
    const { data, error } = await admin
      .from('inmuebles')
      .insert({
        tenant_id: tenantId,
        codigo: def.codigo,
        tipo_id: cat.id('TIPO_INMUEBLE', 'apartamento'),
        estado: 'activo',
        area_privada: def.area,
        uso_predio_id: cat.id('USO_PREDIO', 'residencial'),
        activo_desde: `${ANIO}-01-01`,
      })
      .select('id, codigo')
      .single()
    if (error) throw new Error(`inmueble ${def.codigo}: ${error.message}`)
    creados.push({ ...def, id: data.id })
  }
  const { error: errorHistorico } = await admin
    .from('inmueble_atributo_historico')
    .update({ vigente_desde: `${ANIO}-01-01` })
    .eq('tenant_id', tenantId)
    .in('inmueble_id', creados.map((c) => c.id))
  if (errorHistorico) throw new Error(`retrodatar atributos: ${errorHistorico.message}`)
  return creados
}

async function crearPropietarios(tenantId, inmuebles, semilla) {
  const ROL_COPROPIETARIO = cat.id('PERSONA_PREDIO', 'copropietario')
  const CEDULA = cat.id('TIPO_IDENTIFICACION', 'cedula')
  const ACTIVO = cat.id('ESTADO_TERCERO', 'activo')
  for (const [i, inm] of inmuebles.entries()) {
    const { data: tercero, error } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenantId,
        tipo_persona: 'natural',
        numero_documento: String(semilla + i * 137 + 17),
        tipo_identificacion_id: CEDULA,
        estado_id: ACTIVO,
        primer_nombre: `QA${i + 1}`,
        primer_apellido: 'Descartable',
        email: `qa.f7.propietario${i + 1}@qa.test`,
      })
      .select('id')
      .single()
    if (error) throw new Error(`tercero ${inm.codigo}: ${error.message}`)
    inm.terceroId = tercero.id
    const { error: errorVinculo } = await admin.from('inmueble_persona_rol').insert({
      tenant_id: tenantId,
      inmueble_id: inm.id,
      tercero_id: tercero.id,
      rol_id: ROL_COPROPIETARIO,
      porcentaje: 100,
      vigente_desde: `${ANIO}-01-01`,
      es_pagador: true,
    })
    if (errorVinculo) throw new Error(`vínculo ${inm.codigo}: ${errorVinculo.message}`)
  }
}

async function crearCoeficientes(tenantId, inmuebles) {
  const areaTotal = inmuebles.reduce((a, i) => a + i.area, 0)
  const valores = inmuebles.map((i) => Math.round((i.area / areaTotal) * 1e10) / 1e10)
  const desvio = 1 - valores.reduce((a, b) => a + b, 0)
  valores[valores.length - 1] = Math.round((valores[valores.length - 1] + desvio) * 1e10) / 1e10
  const { data: set, error } = await admin
    .from('coeficiente_sets')
    .insert({ tenant_id: tenantId, version: 1, vigente_desde: `${ANIO}-01-01`, estado: 'borrador', suma_total: 1 })
    .select('id')
    .single()
  if (error) throw new Error(`set coeficientes: ${error.message}`)
  const { error: errorCoefs } = await admin.from('coeficientes').insert(
    inmuebles.map((inm, i) => ({ tenant_id: tenantId, set_id: set.id, inmueble_id: inm.id, valor: valores[i] })),
  )
  if (errorCoefs) throw new Error(`coeficientes: ${errorCoefs.message}`)
  const { error: e } = await admin.from('coeficiente_sets').update({ estado: 'vigente' }).eq('id', set.id)
  if (e) throw new Error(`activar coeficientes: ${e.message}`)
  return set.id
}

async function crearPoliticaFinanciera(tenantId) {
  const { error } = await admin.from('politicas_financieras').insert({
    tenant_id: tenantId,
    version: 1,
    estado: 'vigente',
    vigente_desde: `${ANIO}-01-01`,
    redondeo_modo: 'half_up',
    redondeo_escala: 0,
    residual_metodo: 'mayor_resto',
    coeficientes_suma_esperada: 1,
    fondo_imprevistos_porcentaje: null,
    fondo_imprevistos_base: null,
    policy_hash: `qa-f7-${tenantId.slice(0, 8)}`,
  })
  if (error) throw new Error(`política financiera: ${error.message}`)
}

async function crearCuentaBancariaRecaudo(tenantId) {
  const { data: cuentaContable, error: errorBuscar } = await admin
    .from('contable_cuenta')
    .select('id, codigo')
    .eq('tenant_id', tenantId)
    .eq('codigo', '111010')
    .maybeSingle()
  if (errorBuscar) throw new Error(`buscar cuenta contable bancos: ${errorBuscar.message}`)
  if (!cuentaContable) throw new Error('cuenta contable 111010 (bancos, ahorros) no existe en el plan instalado')
  const { data, error } = await admin
    .from('cuentas_bancarias')
    .insert({
      tenant_id: tenantId,
      numero_cuenta: '1122334455',
      tipo_cuenta: 'ahorros',
      es_recaudo: true,
      activa: true,
      titular: 'Copropiedad QA Descartable F7',
      entidad_financiera_id: cat.id('ENTIDAD_FINANCIERA', 'bancolombia'),
      contable_cuenta_id: cuentaContable.id,
    })
    .select('id')
    .single()
  if (error) throw new Error(`cuenta bancaria: ${error.message}`)
  return data.id
}

async function crearPeriodos(tenantId, meses) {
  const ids = {}
  for (const mes of meses) {
    const { data, error } = await admin
      .from('periodos')
      .insert({ tenant_id: tenantId, anio: ANIO, mes, fecha_vencimiento: `${ANIO}-${String(mes).padStart(2, '0')}-10` })
      .select('id')
      .single()
    if (error) throw new Error(`periodo ${ANIO}-${mes}: ${error.message}`)
    ids[mes] = data.id
  }
  return ids
}

async function crearPresupuestoVigente(tenantId, rubros) {
  const { data: cuentas, error: errorCuentas } = await admin
    .from('presupuesto_cuenta')
    .select('id, codigo, nombre')
    .eq('tenant_id', tenantId)
  if (errorCuentas) throw errorCuentas
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c]))
  const montoTotal = rubros.reduce((a, [, m]) => a + m, 0)
  const { data: presupuesto, error } = await admin
    .from('presupuestos')
    .insert({ tenant_id: tenantId, anio: ANIO, version: 1, estado: 'borrador', monto_total: montoTotal })
    .select('id')
    .single()
  if (error) throw new Error(`presupuesto: ${error.message}`)
  for (const [codigo, monto] of rubros) {
    const cuenta = porCodigo.get(codigo)
    if (!cuenta) throw new Error(`cuenta presupuestal "${codigo}" no existe (disponibles: ${cuentas.map((c) => c.codigo).slice(0, 20).join(', ')}...)`)
    const { error: e } = await admin.from('presupuesto_rubros').insert({
      tenant_id: tenantId,
      presupuesto_id: presupuesto.id,
      codigo: codigo.toUpperCase(),
      nombre: cuenta.nombre,
      cuenta_id: cuenta.id,
      monto_anual: monto,
    })
    if (e) throw new Error(`rubro ${codigo}: ${e.message}`)
  }
  await admin.from('presupuestos').update({ estado: 'aprobado' }).eq('id', presupuesto.id)
  const { error: e2 } = await admin
    .from('presupuestos')
    .update({
      estado: 'vigente',
      fecha_aprobacion: `${ANIO}-01-05`,
      vigente_desde: `${ANIO}-01-01`,
      vigente_hasta: `${ANIO}-12-31`,
      acta_asamblea: `Acta 001-${ANIO} (banco QA descartable f7)`,
    })
    .eq('id', presupuesto.id)
  if (e2) throw new Error(`activar presupuesto: ${e2.message}`)
  return { id: presupuesto.id, montoTotal }
}

async function activarConceptos(tenantId, codigos) {
  const { error: errorFechas } = await admin
    .from('conceptos')
    .update({ fecha_inicio_anio: ANIO, fecha_inicio_mes: 1 })
    .eq('tenant_id', tenantId)
    .in('codigo', codigos)
  if (errorFechas) throw new Error(`retrodatar conceptos: ${errorFechas.message}`)
  for (const estado of ['en_revision', 'activo']) {
    const { error } = await admin.from('conceptos').update({ estado }).eq('tenant_id', tenantId).in('codigo', codigos)
    if (error) throw new Error(`conceptos → ${estado}: ${error.message}`)
  }
}

async function liquidarPeriodo(cliente, periodoId, etiqueta) {
  await admin.from('rate_limit_hits').delete().like('bucket', '%liquidacion%')
  const sim = await invocarFuncion(cliente, 'simular-liquidacion', { periodo_id: periodoId })
  if (!sim.ok) return { ok: false, etapa: 'simular', detalle: sim.json ?? sim.texto.slice(0, 800) }
  const liquidacionId = sim.json?.liquidacion_id ?? sim.json?.liquidacion?.id ?? sim.json?.id
  if (!liquidacionId) return { ok: false, etapa: 'simular', detalle: `sin liquidacion_id: ${JSON.stringify(sim.json).slice(0, 500)}` }
  const { error: errorProponer } = await cliente
    .from('liquidaciones')
    .update({ estado: 'pendiente_aprobacion', nota_solicitud: `Descartable f7 · ${etiqueta}` })
    .eq('id', liquidacionId)
  if (errorProponer) return { ok: false, etapa: 'proponer', liquidacionId, detalle: errorProponer.message }
  const apl = await invocarFuncion(cliente, 'aplicar-liquidacion', { liquidacion_id: liquidacionId })
  if (!apl.ok) return { ok: false, etapa: 'aplicar', liquidacionId, detalle: apl.json ?? apl.texto.slice(0, 800) }
  return { ok: true, liquidacionId }
}

async function registrarPagosCompletos(tenantId, periodoId, inmuebles, cuentaRecaudoId, fechaPago, registradoPor) {
  const { data: cargos, error } = await admin
    .from('cargos')
    .select('id, inmueble_id, monto_original')
    .eq('tenant_id', tenantId)
    .eq('periodo_id', periodoId)
  if (error) throw new Error(`leer cargos: ${error.message}`)
  if (!cargos.length) return { pagados: 0, cargos: 0 }
  const porInmueble = new Map()
  for (const c of cargos) {
    const acc = porInmueble.get(c.inmueble_id) ?? { total: 0, cargos: [] }
    acc.total += Number(c.monto_original)
    acc.cargos.push(c)
    porInmueble.set(c.inmueble_id, acc)
  }
  const FORMA = cat.id('FORMA_PAGO', 'transferencia_bancaria')
  let pagados = 0
  for (const inm of inmuebles) {
    const acc = porInmueble.get(inm.id)
    if (!acc || acc.total <= 0) continue
    const { data: pago, error: errorPago } = await admin
      .from('pagos')
      .insert({
        tenant_id: tenantId,
        inmueble_id: inm.id,
        monto: acc.total,
        fecha_pago: fechaPago,
        forma_pago_id: FORMA,
        cuenta_bancaria_id: cuentaRecaudoId,
        referencia: `QA-F7-${periodoId.slice(0, 6)}-${inm.codigo}`,
        pagador_tercero_id: inm.terceroId ?? null,
        registrado_por: registradoPor,
      })
      .select('id')
      .single()
    if (errorPago) throw new Error(`pago ${inm.codigo}: ${errorPago.message}`)
    let pendiente = acc.total
    for (const c of acc.cargos) {
      if (pendiente <= 0) break
      const aplica = Math.min(pendiente, Number(c.monto_original))
      const { error: e } = await admin
        .from('pago_aplicaciones')
        .insert({ tenant_id: tenantId, pago_id: pago.id, cargo_id: c.id, monto: aplica })
      if (e) throw new Error(`aplicación pago ${inm.codigo}: ${e.message}`)
      pendiente -= aplica
    }
    pagados++
  }
  return { pagados, cargos: cargos.length }
}

// ═══════════════════════════════════════════════════════════════════════
paso('Crear tenant descartable')
const sufijo = Date.now().toString(36).slice(-6)
const slug = `qa-descartable-f7-${sufijo}`
const { data: tenantRow, error: errorTenant } = await sesionAdmin
  .rpc('create_tenant', { p_name: 'QA Descartable Cierre Contable F7', p_slug: slug })
  .single()
if (errorTenant) throw new Error(`create_tenant: ${errorTenant.message}`)
const tenantId = tenantRow.id
log(`  tenant ${tenantId} (${slug})`)

paso('Configurar y clasificar marco contable')
await configurarTenant(tenantId, {
  ciudad: 'Barranquilla',
  direccion: 'Calle QA 1-01',
  uso_economico: 'residencial',
  tipo_division_id: cat.id('TIPO_DIVISION_PH', 'residencial'),
  responsable_iva: false,
  explota_bienes_comunes: false,
  agente_retencion: false,
  zona_horaria: 'America/Bogota',
  marco_grupo: 'grupo_3',
  marco_clasificado_at: new Date().toISOString(),
  marco_fundamento: 'Clasificación sembrada por el caso QA f7-05/06/09 (tenant descartable).',
})
const { error: errorPlan } = await admin.rpc('fn_instanciar_plan_contable', { p_tenant_id: tenantId, p_incluir_opcionales: true })
if (errorPlan) throw new Error(`fn_instanciar_plan_contable: ${errorPlan.message}`)
const { error: errorCartera } = await admin.rpc('fn_sembrar_configuracion_cartera', { p_tenant_id: tenantId })
if (errorCartera) throw new Error(`fn_sembrar_configuracion_cartera: ${errorCartera.message}`)

paso('Inmuebles + propietarios + coeficientes')
const inmuebles = await crearInmuebles(tenantId, [
  { codigo: 'F7-A01', area: 50 },
  { codigo: 'F7-A02', area: 55 },
  { codigo: 'F7-A03', area: 60 },
])
await crearPropietarios(tenantId, inmuebles, 1090000000)
await crearCoeficientes(tenantId, inmuebles)
log(`  ${inmuebles.length} inmuebles, coeficientes vigentes`)

paso('Política financiera (sin fondo de imprevistos)')
await crearPoliticaFinanciera(tenantId)

paso('Cuenta bancaria de recaudo')
const cuentaRecaudoId = await crearCuentaBancariaRecaudo(tenantId)

paso('Presupuesto vigente (rubro mínimo)')
const presupuesto = await crearPresupuestoVigente(tenantId, [['egr_administrador', 36000000]])
log(`  presupuesto $${presupuesto.montoTotal.toLocaleString('es-CO')} vigente`)

paso('Concepto ADMINISTRACION activo')
await activarConceptos(tenantId, ['ADMINISTRACION'])

paso('12 periodos de 2026')
const periodos = await crearPeriodos(tenantId, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])

// ═══════════════════════════════════════════════════════════════════════
paso('Ciclo mensual: liquidar → pagar completo → contabilizar → cerrar')

const hallazgos = { f7_05: null, f7_06: null }

for (let mes = 1; mes <= 12; mes++) {
  const periodoId = periodos[mes]
  const etiqueta = `${ANIO}-${String(mes).padStart(2, '0')}`

  const liq = await liquidarPeriodo(sesionAdmin, periodoId, etiqueta)
  if (!liq.ok) {
    log(`  ${etiqueta}: LIQUIDAR FALLÓ en etapa ${liq.etapa} — ${JSON.stringify(liq.detalle).slice(0, 400)}`)
    process.exit(1)
  }

  const fechaPago = `${ANIO}-${String(mes).padStart(2, '0')}-08`
  const pagos = await registrarPagosCompletos(tenantId, periodoId, inmuebles, cuentaRecaudoId, fechaPago, adminUserId)

  const { data: contab, error: errorContab } = await sesionAdmin.rpc('fn_contabilizar_periodo', {
    p_tenant_id: tenantId,
    p_periodo_id: periodoId,
  })
  if (errorContab) {
    log(`  ${etiqueta}: CONTABILIZAR FALLÓ — ${errorContab.message}`)
    process.exit(1)
  }

  // Validación previa (informativa) antes de cerrar, para diagnóstico si falla.
  const { data: validacion } = await admin.rpc('contable_validacion_cierre', {
    p_tenant_id: tenantId,
    p_periodo_id: periodoId,
  })

  const { data: cierre, error: errorCierre } = await sesionAdmin.rpc('fn_contable_cerrar_periodo', {
    p_tenant_id: tenantId,
    p_periodo_id: periodoId,
    p_forzar_advertencias: true,
  })
  if (errorCierre) {
    log(`  ${etiqueta}: CERRAR FALLÓ — ${errorCierre.message}`)
    log(`  hallazgos previos: ${JSON.stringify(validacion)}`)
    process.exit(1)
  }
  log(`  ${etiqueta}: liquidado (${liq.liquidacionId.slice(0, 8)}), pagado (${pagos.pagados}/${pagos.cargos} cargos), contabilizado, cerrado (${cierre})`)

  // ─── f7-05 / f7-06 se verifican justo después de cerrar el PRIMER periodo ───
  if (mes === 1) {
    paso('f7-05 — periodo cerrado y saldo transferido')
    const { data: periodoRow } = await admin.from('periodos').select('contable_estado').eq('id', periodoId).single()
    const desde1 = `${ANIO}-01-01`
    const hasta1 = `${ANIO}-01-31`
    const desde2 = `${ANIO}-02-01`
    const hasta2 = `${ANIO}-02-01` // solo para leer saldo_inicial de febrero (aún sin movimientos propios)
    const { data: mayor1 } = await admin.rpc('contable_libro_mayor', { p_tenant_id: tenantId, p_desde: desde1, p_hasta: hasta1 })
    const { data: mayor2 } = await admin.rpc('contable_libro_mayor', { p_tenant_id: tenantId, p_desde: desde2, p_hasta: hasta2 })
    const finalPorCuenta = new Map((mayor1 ?? []).map((r) => [r.cuenta_id, r.saldo_final]))
    const iniPorCuenta = new Map((mayor2 ?? []).map((r) => [r.cuenta_id, r.saldo_inicial]))
    let transfierenTodas = true
    const detalleTransfer = []
    for (const [cuentaId, saldoFinal] of finalPorCuenta) {
      const saldoInicial = iniPorCuenta.get(cuentaId)
      const ok = Number(saldoInicial ?? NaN) === Number(saldoFinal)
      if (!ok) transfierenTodas = false
      detalleTransfer.push({ cuentaId, saldoFinal, saldoInicial, ok })
    }
    hallazgos.f7_05 = {
      estado: periodoRow.contable_estado,
      transfierenTodas,
      cuentasComparadas: detalleTransfer.length,
      detalle: detalleTransfer,
    }
    log(`  periodo 1 contable_estado=${periodoRow.contable_estado}; ${detalleTransfer.length} cuentas con saldo; transferencia exacta=${transfierenTodas}`)

    paso('f7-06 — movimiento manual con fecha dentro del periodo ya cerrado')
    const { data: cuentaCualquiera } = await admin
      .from('contable_cuenta')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('permite_movimiento', true)
      .limit(2)
    const tipoManual = cat.id('TIPO_COMPROBANTE', 'AJUSTE')
    const { data: compDraft, error: errorDraft } = await sesionAdmin
      .from('contable_comprobante')
      .insert({
        tenant_id: tenantId,
        periodo_id: periodoId,
        tipo_id: tipoManual,
        anio: ANIO,
        fecha: `${ANIO}-01-15`,
        descripcion: 'QA f7-06 · intento de movimiento en periodo cerrado',
      })
      .select('id')
      .single()
    if (errorDraft) {
      hallazgos.f7_06 = { rechazadoAlGuardarBorrador: true, mensaje: errorDraft.message }
      log(`  el borrador mismo fue rechazado: ${errorDraft.message}`)
    } else {
      const { error: errorLineas } = await sesionAdmin.from('contable_comprobante_detalle').insert([
        { tenant_id: tenantId, comprobante_id: compDraft.id, linea: 1, cuenta_id: cuentaCualquiera[0].id, debito: 100000, credito: 0 },
        { tenant_id: tenantId, comprobante_id: compDraft.id, linea: 2, cuenta_id: cuentaCualquiera[1].id, debito: 0, credito: 100000 },
      ])
      if (errorLineas) {
        hallazgos.f7_06 = { rechazadoAlGuardarBorrador: true, mensaje: errorLineas.message }
      } else {
        const { error: errorContabilizarDraft } = await sesionAdmin.rpc('fn_contabilizar_comprobante', { p_comprobante_id: compDraft.id })
        hallazgos.f7_06 = {
          rechazadoAlGuardarBorrador: false,
          rechazadoAlContabilizar: !!errorContabilizarDraft,
          mensaje: errorContabilizarDraft?.message ?? null,
        }
        // limpieza: el borrador queda huérfano si no se contabilizó — se borra para no dejar residuo.
        if (errorContabilizarDraft) await admin.from('contable_comprobante').delete().eq('id', compDraft.id)
      }
    }
    log(`  resultado f7-06: ${JSON.stringify(hallazgos.f7_06)}`)
  }
}

// ═══════════════════════════════════════════════════════════════════════
paso('Cierre de ejercicio (los 12 periodos → bloqueado)')
const { data: cierreEjercicioId, error: errorEjercicio } = await sesionAdmin.rpc('fn_contable_cerrar_ejercicio', {
  p_tenant_id: tenantId,
  p_anio: ANIO,
})
if (errorEjercicio) {
  log(`  fn_contable_cerrar_ejercicio FALLÓ: ${errorEjercicio.message}`)
} else {
  log(`  comprobante de cierre de ejercicio: ${cierreEjercicioId}`)
}

const { data: periodosFinal } = await admin.from('periodos').select('mes, contable_estado').eq('tenant_id', tenantId).order('mes')
log(`  estados finales: ${JSON.stringify(periodosFinal)}`)

paso('f7-09 — certificar estados financieros con los 12 periodos bloqueados')
let certificacion = null
let errorCertificar = null
if (!errorEjercicio) {
  const resp = await sesionAdmin.rpc('fn_contable_certificar_estados', {
    p_tenant_id: tenantId,
    p_ejercicio: ANIO,
    p_fecha_corte: `${ANIO}-12-31`,
    p_estados_incluidos: ['estado_situacion_financiera', 'estado_resultados'],
    p_administrador_documento: '999999999',
    p_texto_certificacion: 'Certifico que he verificado previamente las afirmaciones contenidas en los '
      + 'estados financieros y que las mismas se han tomado fielmente de los libros (Ley 222 de 1995 art. 37). '
      + 'Caso QA f7-09, tenant descartable.',
  }).single()
  certificacion = resp.data
  errorCertificar = resp.error
}
if (errorCertificar) log(`  certificar FALLÓ: ${errorCertificar.message}`)
else log(`  certificación emitida: ${JSON.stringify(certificacion)}`)

// ═══════════════════════════════════════════════════════════════════════
paso('Resumen final para registrar en qa/resultados.jsonl')
log(JSON.stringify({
  tenantId,
  slug,
  f7_05: hallazgos.f7_05,
  f7_06: hallazgos.f7_06,
  periodosFinal,
  cierreEjercicioOk: !errorEjercicio,
  cierreEjercicioError: errorEjercicio?.message ?? null,
  certificacionOk: !errorCertificar,
  certificacionError: errorCertificar?.message ?? null,
  certificacion,
}, null, 2))
