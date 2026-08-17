/**
 * I/O Supabase de estrategias/acciones de cobranza — mismo nivel de
 * autorización que cartera-supabase.ts (D-14, vigilado por eslint.config.js).
 *
 * REC-CAR-004: no recalcula nada de cartera.ts/cartera-cobranza.ts. Este
 * módulo solo lee estrategias/historial y escribe la acción ya decidida
 * por evaluarAccionesAplicables() — el llamador compone.
 */
import type { AquilaClient } from '@aquila/shared'
import type {
  AccionHistorica,
  EstrategiaCobranza,
  TipoAccionCobranza,
} from './cartera-cobranza.js'

export async function obtenerEstrategiasCobranzaVigentes(
  cliente: AquilaClient,
  opciones: { tenantId: string; politicaId: string },
): Promise<EstrategiaCobranza[]> {
  const { data: estrategias, error } = await cliente
    .from('estrategias_cobranza')
    .select('id, tramo_id, tipo_accion, dias_desde_clasificacion, frecuencia_dias, max_intentos, monto_minimo_deuda, activa')
    .eq('tenant_id', opciones.tenantId)
    .eq('politica_id', opciones.politicaId)
  if (error) {
    throw new Error(
      `No se pudieron leer las estrategias de cobranza de la política ${opciones.politicaId}: ${error.message}`,
    )
  }

  const { data: tramos, error: errorTramos } = await cliente
    .from('politica_clasificacion_tramos')
    .select('id, codigo')
    .eq('politica_id', opciones.politicaId)
  if (errorTramos) {
    throw new Error(
      `No se pudieron leer los tramos de la política ${opciones.politicaId}: ${errorTramos.message}`,
    )
  }
  const codigoPorTramoId = new Map(tramos.map((t) => [t.id, t.codigo]))

  return estrategias.map((e): EstrategiaCobranza => {
    const tramoCodigo = codigoPorTramoId.get(e.tramo_id)
    if (tramoCodigo === undefined) {
      throw new Error(`La estrategia ${e.id} referencia un tramo inexistente (integridad de datos)`)
    }
    return {
      id: e.id,
      tramoCodigo,
      tipoAccion: e.tipo_accion,
      diasDesdeClasificacion: e.dias_desde_clasificacion,
      frecuenciaDias: e.frecuencia_dias,
      maxIntentos: e.max_intentos,
      montoMinimoDeuda: e.monto_minimo_deuda === null ? null : String(e.monto_minimo_deuda),
      activa: e.activa,
    }
  })
}

export async function obtenerHistorialAccionesCobranza(
  cliente: AquilaClient,
  opciones: { tenantId: string; inmuebleId: string },
): Promise<AccionHistorica[]> {
  const { data, error } = await cliente
    .from('acciones_cobranza')
    .select('estrategia_id, estado, fecha_programada')
    .eq('tenant_id', opciones.tenantId)
    .eq('inmueble_id', opciones.inmuebleId)
    .not('estrategia_id', 'is', null)
  if (error) {
    throw new Error(
      `No se pudo leer el historial de acciones de cobranza del inmueble ${opciones.inmuebleId}: ${error.message}`,
    )
  }

  // La condición se aplicó en la consulta (.not('estrategia_id', 'is', null)):
  // el tipo generado de esta columna es nullable, pero después de ese
  // filtro no puede serlo — TS no modela filtros de PostgREST.
  return data.map((a) => ({
    estrategiaId: a.estrategia_id,
    estado: a.estado,
    fechaProgramada: a.fecha_programada,
  }))
}

export interface DatosAccionCobranza {
  readonly tenantId: string
  readonly inmuebleId: string
  readonly estrategiaId: string | null
  readonly tipoAccion: TipoAccionCobranza
  readonly canal: 'email' | 'sms' | 'whatsapp' | 'telefono' | 'fisico' | 'interno'
  readonly fechaProgramada: string
  readonly clasificacionCodigo: string
  readonly politicaClasificacionId: string
  readonly politicaVersion: number
  readonly diasMoraAlMomento: number
  readonly deudaTotalAlMomento: string
  readonly alcance: 'inmueble' | 'cargo'
  readonly cargoId: string | null
  readonly destinatarioTerceroId: string
  readonly destinatarioRolCodigo: string
  readonly destinatarioContacto: string | null
  readonly intentoNumero: number
  readonly creadaPor: 'job' | 'manual'
}

/**
 * Registra la acción decidida por evaluarAccionesAplicables() ya resuelta
 * por el llamador (destinatario, foto del momento). estado queda en su
 * default 'programada' — la ejecución real es otra operación (worker,
 * bloqueado por GAP-CAR-005).
 */
export async function registrarAccionCobranza(
  cliente: AquilaClient,
  datos: DatosAccionCobranza,
): Promise<string> {
  const { data, error } = await cliente
    .from('acciones_cobranza')
    .insert({
      tenant_id: datos.tenantId,
      inmueble_id: datos.inmuebleId,
      estrategia_id: datos.estrategiaId,
      tipo_accion: datos.tipoAccion,
      canal: datos.canal,
      fecha_programada: datos.fechaProgramada,
      clasificacion_codigo: datos.clasificacionCodigo,
      politica_clasificacion_id: datos.politicaClasificacionId,
      politica_version: datos.politicaVersion,
      dias_mora_al_momento: datos.diasMoraAlMomento,
      deuda_total_al_momento: Number(datos.deudaTotalAlMomento),
      alcance: datos.alcance,
      cargo_id: datos.cargoId,
      destinatario_tercero_id: datos.destinatarioTerceroId,
      destinatario_rol_codigo: datos.destinatarioRolCodigo,
      destinatario_contacto: datos.destinatarioContacto,
      intento_numero: datos.intentoNumero,
      creada_por: datos.creadaPor,
    })
    .select('id')
    .single()
  if (error) {
    throw new Error(`No se pudo registrar la acción de cobranza: ${error.message}`)
  }
  return data.id
}
