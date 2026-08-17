/**
 * Motor de Cobranza — qué acción corresponde y cuándo (Docs/Motor de
 * gestion de cartera/CAR_00_Guia_Oficial.md §9-§10). Puro, sin Supabase —
 * mismo nivel de pureza que cartera.ts (D-14, REC-CAR-009).
 *
 * No decide si escalar de etapa (eso es cartera-escalamiento.ts, F6) ni
 * envía nada (eso es el worker de ejecución + infraestructura de
 * notificaciones, GAP-CAR-005) — solo responde "¿qué estrategias de la
 * clasificación actual corresponde disparar hoy, y cuáles se omiten y por
 * qué?" (REC-CAR-004: una responsabilidad, no reimplementa clasificación
 * ni antigüedad).
 */
import * as fos from '@aquila/financial-kernel'
import { diasCalendario } from './cuenta-corriente.js'

export type TipoAccionCobranza =
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'llamada'
  | 'carta'
  | 'requerimiento_formal'
  | 'aviso_prejuridico'
  | 'publicacion_morosos'
  | 'restriccion_servicios'
  | 'visita'
  | 'asignacion_abogado'
  | 'remision_juridica'
  | 'propuesta_acuerdo'
  | 'revision_manual'

export type EstadoAccionCobranza =
  | 'programada'
  | 'pendiente_aprobacion'
  | 'aprobada'
  | 'rechazada'
  | 'ejecutando'
  | 'ejecutada'
  | 'fallida'
  | 'cancelada'

/** estrategias_cobranza vigente (CAR §9.3) — ya resuelta para el tramo que corresponda evaluar. */
export interface EstrategiaCobranza {
  readonly id: string
  readonly tramoCodigo: string
  readonly tipoAccion: TipoAccionCobranza
  readonly diasDesdeClasificacion: number
  /** null = una sola vez, nunca se repite. */
  readonly frecuenciaDias: number | null
  readonly maxIntentos: number
  /** decimal string o null = sin mínimo — CAR §9.3, no gestionar deudas triviales. */
  readonly montoMinimoDeuda: string | null
  readonly activa: boolean
}

/** Acción ya registrada para el inmueble — lo mínimo que evaluarAccionesAplicables necesita del historial. */
export interface AccionHistorica {
  readonly estrategiaId: string
  readonly estado: EstadoAccionCobranza
  readonly fechaProgramada: string
}

export interface AccionPropuesta {
  readonly estrategiaId: string
  readonly tipoAccion: TipoAccionCobranza
  readonly intentoNumero: number
}

export type MotivoOmision =
  | 'DEUDA_INSUFICIENTE'
  | 'AUN_NO_CORRESPONDE'
  | 'ESTRATEGIA_AGOTADA'
  | 'DENTRO_DE_VENTANA_FRECUENCIA'
  | 'ACCION_UNICA_YA_REALIZADA'
  | 'ACUERDO_VIGENTE'

export interface AccionOmitida {
  readonly estrategiaId: string
  readonly motivo: MotivoOmision
}

export interface ResultadoEvaluacionAcciones {
  readonly propuestas: readonly AccionPropuesta[]
  readonly omitidas: readonly AccionOmitida[]
}

const ESTADOS_QUE_CUENTAN_COMO_VIGENTES: readonly EstadoAccionCobranza[] = [
  'programada',
  'pendiente_aprobacion',
  'aprobada',
  'ejecutada',
]

/**
 * CAR §10.4 (I-C07): las 4 reglas de no-duplicación (ventana de
 * frecuencia, intentos agotados, deuda mínima, acuerdo vigente), más un
 * quinto filtro de entrada que §10.4 no numera pero exige §9.3
 * (`dias_desde_clasificacion`: la estrategia no dispara antes de tiempo).
 * `[NEGOCIO]` La base de datos es la última línea de defensa (constraint
 * parcial); esta función es la primera, para poder simular sin escribir
 * nada (modo `simulacion` del job diario, CAR §18.1).
 *
 * `diasEnTramoActual` — CAR §10.4 dispara N días después de ENTRAR al
 * tramo, no N días de mora total. Se recibe ya calculado por el llamador
 * (diasMora del tramo actual − diasMin del tramo, CAR §8.6) en vez de
 * recalcularlo aquí, para no depender de PoliticaClasificacion completa.
 */
export function evaluarAccionesAplicables(params: {
  readonly clasificacionCodigo: string
  readonly diasEnTramoActual: number
  readonly deudaTotal: string
  readonly estrategias: readonly EstrategiaCobranza[]
  readonly historialAcciones: readonly AccionHistorica[]
  readonly fechaCorte: string
  /** CAR §12.5 — un acuerdo vigente suspende TODO el flujo normal de cobranza. */
  readonly tieneAcuerdoVigente?: boolean
}): ResultadoEvaluacionAcciones {
  const candidatas = params.estrategias.filter(
    (e) => e.activa && e.tramoCodigo === params.clasificacionCodigo,
  )

  if (params.tieneAcuerdoVigente === true) {
    return {
      propuestas: [],
      omitidas: candidatas.map((e) => ({ estrategiaId: e.id, motivo: 'ACUERDO_VIGENTE' })),
    }
  }

  const propuestas: AccionPropuesta[] = []
  const omitidas: AccionOmitida[] = []

  for (const estrategia of candidatas) {
    if (
      estrategia.montoMinimoDeuda !== null &&
      fos.compararDecimales(params.deudaTotal, estrategia.montoMinimoDeuda) < 0
    ) {
      omitidas.push({ estrategiaId: estrategia.id, motivo: 'DEUDA_INSUFICIENTE' })
      continue
    }

    if (params.diasEnTramoActual < estrategia.diasDesdeClasificacion) {
      omitidas.push({ estrategiaId: estrategia.id, motivo: 'AUN_NO_CORRESPONDE' })
      continue
    }

    const historialEstrategia = params.historialAcciones.filter(
      (a) => a.estrategiaId === estrategia.id,
    )
    const ejecutadas = historialEstrategia.filter((a) => a.estado === 'ejecutada')
    if (ejecutadas.length >= estrategia.maxIntentos) {
      omitidas.push({ estrategiaId: estrategia.id, motivo: 'ESTRATEGIA_AGOTADA' })
      continue
    }

    const vigentes = historialEstrategia.filter((a) =>
      ESTADOS_QUE_CUENTAN_COMO_VIGENTES.includes(a.estado),
    )
    if (vigentes.length > 0) {
      if (estrategia.frecuenciaDias === null) {
        omitidas.push({ estrategiaId: estrategia.id, motivo: 'ACCION_UNICA_YA_REALIZADA' })
        continue
      }
      const primeraVigente = vigentes[0]
      if (primeraVigente === undefined) {
        continue
      }
      const masReciente = vigentes.reduce(
        (masNueva, a) => (a.fechaProgramada > masNueva ? a.fechaProgramada : masNueva),
        primeraVigente.fechaProgramada,
      )
      const diasDesdeUltima = diasCalendario(masReciente, params.fechaCorte)
      if (diasDesdeUltima < estrategia.frecuenciaDias) {
        omitidas.push({ estrategiaId: estrategia.id, motivo: 'DENTRO_DE_VENTANA_FRECUENCIA' })
        continue
      }
    }

    propuestas.push({
      estrategiaId: estrategia.id,
      tipoAccion: estrategia.tipoAccion,
      intentoNumero: ejecutadas.length + 1,
    })
  }

  return { propuestas, omitidas }
}
