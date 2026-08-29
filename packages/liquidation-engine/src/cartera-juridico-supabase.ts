/**
 * I/O Supabase de la certificación de deuda (art. 48) — mismo nivel de
 * autorización que cartera-supabase.ts/cuenta-corriente-supabase.ts (D-14,
 * vigilado por eslint.config.js): único otro módulo del paquete que habla
 * con Supabase.
 *
 * No reutiliza obtenerCargosAbiertos() (cuenta-corriente-supabase.ts):
 * ese lector arma CargoAbierto para imputación de pagos (conceptoPrioridad,
 * sin monto_original ni concepto.codigo, sin filtro de fecha_corte).
 * Extender esa interfaz con lo que solo la certificación necesita
 * cambiaría el contrato de un módulo ya probado por F1-F4 sin necesidad —
 * esta es una lectura distinta, con su propio filtro (vencido a
 * fecha_corte, mismo criterio que fn_posicion_cartera) y su propia forma
 * de salida (jsonb legal, no un plan de imputación).
 */
import type { AquilaClient } from '@aquila/shared'
import {
  construirCertificacionDeuda,
  type CertificacionDeudaDatos,
  type DetalleCargoCertificado,
} from './cartera-juridico.js'
import { calcularCertificacionHash } from './cartera-juridico.js'

async function obtenerCargosParaCertificar(
  cliente: AquilaClient,
  opciones: { readonly tenantId: string; readonly inmuebleId: string; readonly fechaCorte: string },
): Promise<DetalleCargoCertificado[]> {
  const { tenantId, inmuebleId, fechaCorte } = opciones

  const { data: filas, error } = await cliente
    .from('v_cargo_saldo')
    .select('id, periodo_id, categoria, concepto_id, novedad_id, monto_original, monto_pendiente')
    .eq('tenant_id', tenantId)
    .eq('inmueble_id', inmuebleId)
    .gt('monto_pendiente', 0)
  if (error) throw new Error(`No se pudieron leer los cargos del inmueble: ${error.message}`)
  if (filas.length === 0) return []

  const periodoIds = [...new Set(filas.flatMap((f) => (f.periodo_id ? [f.periodo_id] : [])))]
  const { data: periodos, error: errorPeriodos } = await cliente
    .from('periodos')
    .select('id, anio, mes, fecha_vencimiento')
    .in('id', periodoIds)
  if (errorPeriodos) throw new Error(`No se pudieron leer los periodos: ${errorPeriodos.message}`)
  const periodoPorId = new Map(periodos.map((p) => [p.id, p]))

  const conceptoIds = [...new Set(filas.flatMap((f) => (f.concepto_id ? [f.concepto_id] : [])))]
  const conceptoCodigoPorId = new Map<string, string>()
  if (conceptoIds.length > 0) {
    const { data: conceptos, error: errorConceptos } = await cliente
      .from('conceptos')
      .select('id, codigo')
      .in('id', conceptoIds)
    if (errorConceptos) throw new Error(`No se pudieron leer los conceptos: ${errorConceptos.message}`)
    for (const c of conceptos) conceptoCodigoPorId.set(c.id, c.codigo)
  }

  // GAP-CAR-011: cargos.novedad_id → novedades.tipo_novedad_id → lista_tipos.codigo
  // (familia TIPO_NOVEDAD, 20260814180000) es hoy la única marca que distingue una
  // sanción de cualquier otro cargo categoria='otro' — ver cabecera de cartera-juridico.ts.
  const novedadIds = [...new Set(filas.flatMap((f) => (f.novedad_id ? [f.novedad_id] : [])))]
  const motivoCodigoPorNovedadId = new Map<string, string>()
  if (novedadIds.length > 0) {
    const { data: novedades, error: errorNovedades } = await cliente
      .from('novedades')
      .select('id, tipo_novedad_id')
      .in('id', novedadIds)
    if (errorNovedades) throw new Error(`No se pudieron leer las novedades: ${errorNovedades.message}`)

    const tipoNovedadIds = [...new Set(novedades.flatMap((n) => (n.tipo_novedad_id ? [n.tipo_novedad_id] : [])))]
    if (tipoNovedadIds.length > 0) {
      const { data: tipos, error: errorTipos } = await cliente
        .from('lista_tipos')
        .select('id, codigo')
        .in('id', tipoNovedadIds)
      if (errorTipos) throw new Error(`No se pudieron leer los tipos de novedad: ${errorTipos.message}`)
      const codigoPorTipoId = new Map(tipos.map((t) => [t.id, t.codigo]))

      for (const n of novedades) {
        const codigo = n.tipo_novedad_id ? codigoPorTipoId.get(n.tipo_novedad_id) : undefined
        if (codigo) motivoCodigoPorNovedadId.set(n.id, codigo)
      }
    }
  }

  const detalle: DetalleCargoCertificado[] = []
  for (const f of filas) {
    if (
      f.id === null ||
      f.periodo_id === null ||
      f.monto_original === null ||
      f.monto_pendiente === null ||
      f.categoria === null
    ) {
      throw new Error(`Invariante violado: fila de v_cargo_saldo con columna NOT NULL en null`)
    }
    const periodo = periodoPorId.get(f.periodo_id)
    if (!periodo?.fecha_vencimiento) continue // sin fecha_vencimiento no participa en "vencido a fecha_corte" (mismo criterio que fn_posicion_cartera)
    if (periodo.fecha_vencimiento >= fechaCorte) continue // solo vencidos ANTES del corte (fn_posicion_cartera: per.fecha_vencimiento < p_fecha_corte)

    detalle.push({
      cargoId: f.id,
      periodoClave: `${String(periodo.anio)}-${String(periodo.mes).padStart(2, '0')}`,
      conceptoCodigo: f.concepto_id ? (conceptoCodigoPorId.get(f.concepto_id) ?? null) : null,
      fechaVencimiento: periodo.fecha_vencimiento,
      montoOriginal: String(f.monto_original),
      saldoPendiente: String(f.monto_pendiente),
      categoria: f.categoria,
      motivoNovedadCodigo: f.novedad_id ? (motivoCodigoPorNovedadId.get(f.novedad_id) ?? null) : null,
    })
  }
  return detalle
}

async function obtenerPoliticaFinancieraVigenteId(
  cliente: AquilaClient,
  opciones: { readonly tenantId: string },
): Promise<{ readonly id: string; readonly version: number }> {
  const { data, error } = await cliente
    .from('politicas_financieras')
    .select('id, version')
    .eq('tenant_id', opciones.tenantId)
    .eq('estado', 'vigente')
    .single()
  if (error) {
    throw new Error(
      `No hay una política financiera vigente para el tenant ${opciones.tenantId}: ${error.message}`,
    )
  }
  return { id: data.id, version: data.version }
}

export interface OpcionesCertificarDeuda {
  readonly tenantId: string
  readonly inmuebleId: string
  readonly consecutivo: string
  readonly fechaExpedicion: string
  readonly fechaCorte: string
  readonly cargoFirmante: string
}

/**
 * CAR §15.2 — arma la certificación (lectura de cargos + política vigente,
 * agregación pura, hash) e inserta. expedida_por/estado/anulada_* los
 * estampa/gobierna la base de datos (guard_certificacion_insert +
 * certificaciones_deuda_transicion, 20260822340000) — nunca este módulo,
 * mismo criterio que propuesto_por en el resto de F4-F6.
 */
export async function registrarCertificacionDeuda(
  cliente: AquilaClient,
  opciones: OpcionesCertificarDeuda,
): Promise<{ readonly hash: string; readonly certificacionId: string }> {
  const cargos = await obtenerCargosParaCertificar(cliente, opciones)
  const politica = await obtenerPoliticaFinancieraVigenteId(cliente, { tenantId: opciones.tenantId })

  const datos: CertificacionDeudaDatos = construirCertificacionDeuda({
    tenantId: opciones.tenantId,
    inmuebleId: opciones.inmuebleId,
    consecutivo: opciones.consecutivo,
    fechaExpedicion: opciones.fechaExpedicion,
    fechaCorte: opciones.fechaCorte,
    cargos,
    politicaFinancieraId: politica.id,
    politicaVersion: politica.version,
    cargoFirmante: opciones.cargoFirmante,
  })
  const hash = calcularCertificacionHash(datos)

  const { data, error } = await cliente
    .from('certificaciones_deuda')
    .insert({
      tenant_id: datos.tenantId,
      inmueble_id: datos.inmuebleId,
      consecutivo: datos.consecutivo,
      fecha_expedicion: datos.fechaExpedicion,
      fecha_corte: datos.fechaCorte,
      monto_expensas_ordinarias: Number(datos.montoExpensasOrdinarias),
      monto_expensas_extraordinarias: Number(datos.montoExpensasExtraordinarias),
      monto_intereses_mora: Number(datos.montoInteresesMora),
      monto_sanciones: Number(datos.montoSanciones),
      monto_otros: Number(datos.montoOtros),
      monto_total: Number(datos.montoTotal),
      detalle_cargos: datos.detalleCargos.map((c) => ({ ...c })),
      politica_financiera_id: datos.politicaFinancieraId,
      politica_version: datos.politicaVersion,
      cargo_firmante: datos.cargoFirmante,
      certificacion_hash: hash,
    })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo registrar la certificación de deuda: ${error.message}`)

  return { hash, certificacionId: data.id }
}
