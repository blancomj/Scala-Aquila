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
import type { PoliticaClasificacion, TramoClasificacion } from './cartera.js'

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
