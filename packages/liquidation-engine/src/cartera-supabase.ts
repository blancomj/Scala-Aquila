/**
 * I/O Supabase de la política de clasificación de cartera — mismo nivel de
 * autorización que cuenta-corriente-supabase.ts (D-14, vigilado por
 * eslint.config.js): único otro módulo del paquete que habla con Supabase.
 *
 * REC-CAR-004: la lectura de cargos abiertos NO se duplica aquí — se
 * reutiliza obtenerCargosAbiertos() de cuenta-corriente-supabase.ts junto
 * con calcularAntiguedad()/calcularPosicionCartera()/clasificarCartera()
 * de cartera.ts. Este módulo solo añade lo que faltaba: la política.
 */
import type { AquilaClient } from '@aquila/shared'
import { calcularPosicionHash, type PoliticaClasificacion, type PosicionCarteraSnapshotDatos, type TramoClasificacion } from './cartera.js'

export async function obtenerPoliticaClasificacionVigente(
  cliente: AquilaClient,
  opciones: { tenantId: string },
): Promise<PoliticaClasificacion> {
  const { data: politica, error: errorPolitica } = await cliente
    .from('politicas_clasificacion_cartera')
    .select('id, version')
    .eq('tenant_id', opciones.tenantId)
    .eq('estado', 'vigente')
    .single()
  if (errorPolitica) {
    throw new Error(
      `No hay una política de clasificación de cartera vigente para el tenant ` +
        `${opciones.tenantId}: ${errorPolitica.message}`,
    )
  }

  const { data: tramos, error: errorTramos } = await cliente
    .from('politica_clasificacion_tramos')
    .select('codigo, dias_min, dias_max, nivel_riesgo, etapa_cobranza, prioridad')
    .eq('politica_id', politica.id)
    .order('dias_min', { ascending: true })
  if (errorTramos) {
    throw new Error(
      `No se pudieron leer los tramos de la política ${politica.id}: ${errorTramos.message}`,
    )
  }

  return {
    id: politica.id,
    version: politica.version,
    tramos: tramos.map(
      (t): TramoClasificacion => ({
        codigo: t.codigo,
        diasMin: t.dias_min,
        diasMax: t.dias_max,
        nivelRiesgo: t.nivel_riesgo,
        etapaCobranza: t.etapa_cobranza,
        prioridad: t.prioridad,
      }),
    ),
  }
}

/**
 * CAR §6.3, I-C15/PH-C27 — congela una posición ya calculada (fn_posicion_
 * cartera + clasificarCartera, compuestas por el llamador — este módulo no
 * las recalcula, REC-CAR-004) en posiciones_cartera_snapshot. Append-only:
 * escritura exclusiva de service_role, igual que cargos/pagos/liquidaciones
 * — un snapshot no es algo que un agent inserte a mano, es siempre
 * calculado. Devuelve el hash para que el llamador pueda verificarlo contra
 * un recálculo independiente (mismo patrón que guardarLiquidacion()).
 */
export async function registrarSnapshotPosicion(
  cliente: AquilaClient,
  datos: PosicionCarteraSnapshotDatos,
): Promise<string> {
  const hash = calcularPosicionHash(datos)
  const { error } = await cliente.from('posiciones_cartera_snapshot').insert({
    tenant_id: datos.tenantId,
    inmueble_id: datos.inmuebleId,
    fecha_corte: datos.fechaCorte,
    deuda_total: Number(datos.deudaTotal),
    deuda_capital: Number(datos.deudaCapital),
    deuda_interes: Number(datos.deudaInteres),
    deuda_otros: Number(datos.deudaOtros),
    saldo_credito: Number(datos.saldoCredito),
    dias_mora_maximo: datos.diasMoraMaximo,
    cantidad_cargos_vencidos: datos.cantidadCargosVencidos,
    fecha_vencimiento_mas_antigua: datos.fechaVencimientoMasAntigua,
    cargo_vencido_mas_antiguo_id: datos.cargoVencidoMasAntiguoId,
    clasificacion_codigo: datos.clasificacionCodigo,
    nivel_riesgo: datos.nivelRiesgo,
    etapa_cobranza: datos.etapaCobranza,
    politica_clasificacion_id: datos.politicaId,
    politica_version: datos.politicaVersion,
    posicion_hash: hash,
  })
  if (error) {
    throw new Error(`No se pudo registrar el snapshot de posición: ${error.message}`)
  }
  return hash
}
