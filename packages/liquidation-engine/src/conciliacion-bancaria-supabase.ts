/**
 * I/O Supabase de la conciliación bancaria CONTABLE (banco↔libro) — Fase 5 del plan aprobado en
 * `Docs/Conciliacion Bancaria/PROMPT_CONCILIACION_BANCARIA_CONTABLE.md` §7 (D-113/D-115/D-116).
 *
 * Toda decisión de cruce/clasificación vive en `conciliacion-bancaria-cruce.ts` (puro) — este
 * archivo solo arma los movimientos desde Supabase, llama esa función, y persiste el resultado.
 * NUNCA contabiliza ni certifica sola: `generarConciliacionBancaria` deja la cabecera en
 * `borrador`; certificar es un paso explícito aparte (`certificarConciliacionBancaria`).
 *
 * REFERENCIA DEL LADO LIBROS — SIMPLIFICACIÓN DE V1: `contable_comprobante_detalle` no tiene una
 * columna de referencia externa propia (`origen_entidad`/`origen_id` trazan al hecho que originó
 * la línea, pero no son un texto comparable contra `extracto_linea.referencia_banco`). Se pasa
 * `referencia: null` para todo movimiento de libro — en la práctica, el cruce banco↔libro en v1
 * se apoya en el paso 2 (monto + fecha) de `cruzarConciliacionBancaria`, no en el paso 1
 * (referencia). Ampliar esto (derivar una referencia real vía `origen_id`) queda para cuando
 * haya un caso de uso real que lo necesite — no se inventa ahora sin ese caso.
 */
import type { AquilaClient } from '@aquila/shared'
import {
  cruzarConciliacionBancaria,
  type MovimientoBanco,
  type MovimientoLibro,
  type TipoPartidaConciliacion,
} from './conciliacion-bancaria-cruce.js'

export class CuentaBancariaSinCuentaContableError extends Error {}
export class ConciliacionBancariaYaExisteError extends Error {}
export class ConciliacionBancariaNoEncontradaError extends Error {}
export class ConciliacionBancariaYaCertificadaError extends Error {}

export interface ResumenGeneracion {
  readonly conciliacionId: string
  readonly saldoInicialBanco: number
  readonly saldoFinalBanco: number
  readonly saldoInicialLibros: number
  readonly saldoFinalLibros: number
  readonly partidasCruzadas: number
  readonly partidasNoCruzadas: number
}

export interface ResumenCertificacion {
  readonly conciliacionId: string
  readonly estado: string
}

/** Primer y último día calendario del mes (`mes` 1-12, como en `periodos`). */
function rangoDelPeriodo(anio: number, mes: number): { desde: string; hasta: string } {
  const desde = `${String(anio)}-${String(mes).padStart(2, '0')}-01`
  // Día 0 del mes siguiente (índice de mes de JS es 0-based, así que pasar
  // `mes` tal cual ya apunta al mes siguiente) = último día de este mes.
  const ultimoDia = new Date(anio, mes, 0).getDate()
  const hasta = `${String(anio)}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`
  return { desde, hasta }
}

async function resolverSaldoInicial(
  cliente: AquilaClient,
  tenantId: string,
  cuentaBancariaId: string,
  anio: number,
  mes: number,
): Promise<{ saldoInicialBanco: number; saldoInicialLibros: number }> {
  const { data, error } = await cliente
    .from('conciliacion_bancaria')
    .select('saldo_final_banco, saldo_final_libros, periodo:periodos!inner(anio, mes)')
    .eq('tenant_id', tenantId)
    .eq('cuenta_bancaria_id', cuentaBancariaId)
  if (error) throw new Error(`No se pudieron leer conciliaciones previas: ${error.message}`)

  type FilaPrevia = {
    saldo_final_banco: number
    saldo_final_libros: number
    periodo: { anio: number; mes: number }
  }
  const claveObjetivo = anio * 12 + mes
  const anteriores = (data as unknown as FilaPrevia[])
    .filter((f) => f.periodo.anio * 12 + f.periodo.mes < claveObjetivo)
    .sort((a, b) => b.periodo.anio * 12 + b.periodo.mes - (a.periodo.anio * 12 + a.periodo.mes))

  const masReciente = anteriores[0]
  return masReciente
    ? { saldoInicialBanco: masReciente.saldo_final_banco, saldoInicialLibros: masReciente.saldo_final_libros }
    : { saldoInicialBanco: 0, saldoInicialLibros: 0 }
}

async function cargarMovimientosBanco(
  cliente: AquilaClient,
  tenantId: string,
  cuentaBancariaId: string,
  desde: string,
  hasta: string,
): Promise<MovimientoBanco[]> {
  const { data, error } = await cliente
    .from('extracto_linea')
    .select('id, fecha_movimiento, monto, descripcion_banco, referencia_banco, extracto:extracto_bancario!inner(cuenta_bancaria_id)')
    .eq('tenant_id', tenantId)
    .eq('extracto.cuenta_bancaria_id', cuentaBancariaId)
    .gte('fecha_movimiento', desde)
    .lte('fecha_movimiento', hasta)
  if (error) throw new Error(`No se pudieron leer los movimientos del extracto: ${error.message}`)

  type Fila = { id: string; fecha_movimiento: string; monto: number; descripcion_banco: string; referencia_banco: string | null }
  return (data as unknown as Fila[]).map((f) => ({
    id: f.id,
    fecha: f.fecha_movimiento,
    monto: f.monto,
    descripcion: f.descripcion_banco,
    referencia: f.referencia_banco,
  }))
}

async function cargarMovimientosLibro(
  cliente: AquilaClient,
  tenantId: string,
  contableCuentaId: string,
  desde: string,
  hasta: string,
): Promise<MovimientoLibro[]> {
  const { data, error } = await cliente
    .from('contable_comprobante_detalle')
    .select('id, debito, credito, descripcion, comprobante:contable_comprobante!inner(fecha, estado)')
    .eq('tenant_id', tenantId)
    .eq('cuenta_id', contableCuentaId)
    .eq('comprobante.estado', 'contabilizado')
    .gte('comprobante.fecha', desde)
    .lte('comprobante.fecha', hasta)
  if (error) throw new Error(`No se pudieron leer los movimientos contables: ${error.message}`)

  type Fila = {
    id: string
    debito: number
    credito: number
    descripcion: string | null
    comprobante: { fecha: string }
  }
  return (data as unknown as Fila[]).map((f) => ({
    id: f.id,
    fecha: f.comprobante.fecha,
    // D-CB-1: cuenta de bancos es grupo 11 (activo) — débito aumenta, crédito disminuye. Misma
    // convención de signo que MovimientoBanco (positivo = entra dinero).
    monto: f.debito - f.credito,
    descripcion: f.descripcion ?? '',
    referencia: null, // ver cabecera del archivo — simplificación de v1.
  }))
}

async function tipoIdsPorCodigo(
  cliente: AquilaClient,
  codigos: readonly TipoPartidaConciliacion[],
): Promise<Map<TipoPartidaConciliacion, number>> {
  const unicos = [...new Set(codigos)]
  if (unicos.length === 0) return new Map()
  const { data, error } = await cliente
    .from('lista_tipos')
    .select('id, codigo')
    .eq('tipo', 'TIPO_PARTIDA_CONCILIACION')
    .in('codigo', unicos)
    .is('tenant_id', null)
  if (error) throw new Error(`No se pudo leer el catálogo de tipo de partida: ${error.message}`)
  const mapa = new Map<TipoPartidaConciliacion, number>()
  for (const fila of data) {
    mapa.set(fila.codigo as TipoPartidaConciliacion, fila.id)
  }
  for (const codigo of unicos) {
    if (!mapa.has(codigo)) {
      throw new Error(`Falta en el catálogo TIPO_PARTIDA_CONCILIACION: "${codigo}".`)
    }
  }
  return mapa
}

/**
 * Genera (calcula y persiste, en borrador) la conciliación bancaria contable de una cuenta y un
 * período. Idempotente por diseño de esquema, no por reintento: una segunda llamada para la
 * misma (cuenta, período) falla con `ConciliacionBancariaYaExisteError` — corregir exige anular
 * y regenerar explícitamente (fuera de alcance de este corte), nunca un upsert silencioso.
 */
export async function generarConciliacionBancaria(
  cliente: AquilaClient,
  params: { tenantId: string; cuentaBancariaId: string; periodoId: string; actorId: string },
): Promise<ResumenGeneracion> {
  const { tenantId, cuentaBancariaId, periodoId, actorId } = params

  const { data: cuenta, error: errCuenta } = await cliente
    .from('cuentas_bancarias')
    .select('id, contable_cuenta_id')
    .eq('id', cuentaBancariaId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (errCuenta) throw new Error(`No se pudo leer la cuenta bancaria: ${errCuenta.message}`)
  if (!cuenta) throw new Error(`La cuenta bancaria ${cuentaBancariaId} no existe en este tenant.`)
  if (!cuenta.contable_cuenta_id) {
    throw new CuentaBancariaSinCuentaContableError(
      `La cuenta bancaria ${cuentaBancariaId} no tiene una cuenta contable asociada (PC-3) — no es `
        + 'conciliable contablemente hasta que se le asigne una en el plan de cuentas.',
    )
  }

  const { data: periodo, error: errPeriodo } = await cliente
    .from('periodos')
    .select('id, anio, mes')
    .eq('id', periodoId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (errPeriodo) throw new Error(`No se pudo leer el período: ${errPeriodo.message}`)
  if (!periodo) throw new Error(`El período ${periodoId} no existe en este tenant.`)

  const { data: existente, error: errExistente } = await cliente
    .from('conciliacion_bancaria')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('cuenta_bancaria_id', cuentaBancariaId)
    .eq('periodo_id', periodoId)
    .maybeSingle()
  if (errExistente) throw new Error(`No se pudo verificar conciliaciones existentes: ${errExistente.message}`)
  if (existente) {
    throw new ConciliacionBancariaYaExisteError(
      `Ya existe una conciliación bancaria para esta cuenta y período (${existente.id}).`,
    )
  }

  const { desde, hasta } = rangoDelPeriodo(periodo.anio, periodo.mes)

  const [saldoInicial, movimientosBanco, movimientosLibro] = await Promise.all([
    resolverSaldoInicial(cliente, tenantId, cuentaBancariaId, periodo.anio, periodo.mes),
    cargarMovimientosBanco(cliente, tenantId, cuentaBancariaId, desde, hasta),
    cargarMovimientosLibro(cliente, tenantId, cuenta.contable_cuenta_id, desde, hasta),
  ])

  const cruce = cruzarConciliacionBancaria({
    saldoInicialBanco: saldoInicial.saldoInicialBanco,
    saldoInicialLibros: saldoInicial.saldoInicialLibros,
    movimientosBanco,
    movimientosLibro,
    fechaCorte: hasta,
  })

  const { data: conciliacion, error: errInsert } = await cliente
    .from('conciliacion_bancaria')
    .insert({
      tenant_id: tenantId,
      cuenta_bancaria_id: cuentaBancariaId,
      periodo_id: periodoId,
      saldo_inicial_banco: saldoInicial.saldoInicialBanco,
      saldo_final_banco: cruce.saldoFinalBanco,
      saldo_inicial_libros: saldoInicial.saldoInicialLibros,
      saldo_final_libros: cruce.saldoFinalLibros,
      preparado_por: actorId,
    })
    .select('id')
    .single()
  if (errInsert) throw new Error(`No se pudo crear la conciliación bancaria: ${errInsert.message}`)

  if (cruce.partidas.length > 0) {
    const tipoIds = await tipoIdsPorCodigo(cliente, cruce.partidas.map((p) => p.tipo))
    const { error: errPartidas } = await cliente.from('conciliacion_bancaria_partida').insert(
      cruce.partidas.map((p) => ({
        tenant_id: tenantId,
        conciliacion_id: conciliacion.id,
        origen: p.origen,
        // La tabla exige monto > 0 (D-CB-3) — el signo ya lo transmiten origen+tipo, igual que
        // fondo_movimientos.monto (D-38): no se guarda dos veces la misma información.
        tipo_id: tipoIds.get(p.tipo) as number,
        extracto_linea_id: p.movimientoBancoId,
        contable_comprobante_detalle_id: p.movimientoLibroId,
        monto: Math.abs(p.monto),
        descripcion: p.descripcion,
      })),
    )
    if (errPartidas) throw new Error(`No se pudieron guardar las partidas: ${errPartidas.message}`)
  }

  return {
    conciliacionId: conciliacion.id,
    saldoInicialBanco: saldoInicial.saldoInicialBanco,
    saldoFinalBanco: cruce.saldoFinalBanco,
    saldoInicialLibros: saldoInicial.saldoInicialLibros,
    saldoFinalLibros: cruce.saldoFinalLibros,
    partidasCruzadas: cruce.partidasCruzadas,
    partidasNoCruzadas: cruce.partidas.length,
  }
}

/**
 * Certifica una conciliación bancaria en borrador — D-CB-3: terminal, `guard_conciliacion_
 * bancaria_transicion` la protege también a nivel de base de datos (defensa en profundidad),
 * pero se valida antes aquí para devolver un error claro en vez del genérico del trigger.
 */
export async function certificarConciliacionBancaria(
  cliente: AquilaClient,
  params: { tenantId: string; conciliacionId: string; actorId: string },
): Promise<ResumenCertificacion> {
  const { data: conciliacion, error: errLectura } = await cliente
    .from('conciliacion_bancaria')
    .select('id, estado')
    .eq('id', params.conciliacionId)
    .eq('tenant_id', params.tenantId)
    .maybeSingle()
  if (errLectura) throw new Error(`No se pudo leer la conciliación: ${errLectura.message}`)
  if (!conciliacion) {
    throw new ConciliacionBancariaNoEncontradaError(
      `No existe la conciliación bancaria ${params.conciliacionId} en este tenant.`,
    )
  }
  if (conciliacion.estado === 'certificada') {
    throw new ConciliacionBancariaYaCertificadaError(
      `La conciliación bancaria ${params.conciliacionId} ya está certificada.`,
    )
  }

  const { data: actualizada, error: errUpdate } = await cliente
    .from('conciliacion_bancaria')
    .update({ estado: 'certificada', certificado_por: params.actorId })
    .eq('id', params.conciliacionId)
    .select('id, estado')
    .single()
  if (errUpdate) throw new Error(`No se pudo certificar la conciliación: ${errUpdate.message}`)

  return { conciliacionId: actualizada.id, estado: actualizada.estado }
}
