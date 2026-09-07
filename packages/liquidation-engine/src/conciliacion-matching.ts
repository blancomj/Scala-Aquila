/**
 * Cascada de matching de conciliación bancaria (§E.2-E.4 del documento
 * propietario) — función PURA: solo decide, nunca escribe. El orden importa
 * y no es negociable:
 *
 *   1. Referencia estructurada exacta   → score 1.0 → auto-concilia
 *   2. Monto exacto + ventana de fecha  → score alto → auto-concilia
 *   3. Heurístico (nombre ≈ + monto ≈)  → PROPONE, nunca aplica
 *   4. Sin candidato                    → cola manual
 *
 * LA REGLA DE SEGURIDAD QUE EL DOCUMENTO NO DICE EXPLÍCITAMENTE (§6.1 del
 * prompt de Fase 3): el matching heurístico JAMÁS auto-aplica dinero, sin
 * importar qué tan alto sea el score. Aplicar un pago al inmueble equivocado
 * significa que un propietario queda con mora que ya pagó y otro con un
 * abono que no le corresponde — se descubre semanas después, en una
 * reclamación, y corregirlo exige anular y volver a registrar. Un score alto
 * no convierte una heurística en certeza: solo los métodos 1 y 2, que son
 * deterministas, pueden producir `tipo: 'auto'`.
 *
 * Esta función NO calcula similitud de nombres (pg_trgm es SQL, no TS) — la
 * capa Supabase resuelve los candidatos por nombre y se los pasa ya armados;
 * aquí solo se decide qué hacer con ellos.
 */
import { parsearReferencia } from '@aquila/payment-gateways'

export type MetodoMatching = 'referencia' | 'monto_fecha' | 'heuristico'

export interface CandidatoInmueble {
  readonly inmuebleId: string
  readonly codigo: string
}

export interface CandidatoPorReferencia {
  readonly inmuebleId: string
  /** true si la referencia parseada de la línea coincide con una intención
   *  pendiente o con {tenant_slug}-{codigo}-{periodo} de este inmueble. */
  readonly coincideExacto: boolean
}

export interface CandidatoPorMontoFecha {
  readonly inmuebleId: string
  readonly codigo: string
  /** true si el monto de la línea coincide exacto con el saldo pendiente
   *  total del inmueble, o con una intención de pago pendiente. */
  readonly montoCoincide: boolean
  readonly diasDeDiferencia: number
}

export interface CandidatoHeuristico {
  readonly inmuebleId: string
  readonly codigo: string
  /** similarity() de pg_trgm entre el titular de la línea y el nombre del
   *  propietario/pagador — ya calculado en SQL, 0-1. */
  readonly similitudNombre: number
  readonly montoAproximado: boolean
  readonly diasDeDiferencia: number
}

export interface LineaAConciliar {
  readonly monto: number
  readonly fechaMovimiento: string
  readonly descripcionBanco: string
  readonly referenciaBanco: string | null
}

export interface FactorExplicacion {
  readonly factor: string
  readonly detalle: string
  readonly aporte: number
}

export interface PropuestaCandidata {
  readonly inmuebleId: string
  readonly metodo: MetodoMatching
  readonly score: number
  readonly explicacion: readonly FactorExplicacion[]
}

export type DecisionMatching =
  | { readonly tipo: 'no_es_pago'; readonly motivo: string }
  | { readonly tipo: 'auto'; readonly metodo: 'referencia' | 'monto_fecha'; readonly inmuebleId: string; readonly score: 1 }
  | { readonly tipo: 'propuestas'; readonly candidatos: readonly PropuestaCandidata[] }
  | { readonly tipo: 'sin_candidato' }

// Ventana para que "monto exacto + fecha" auto-concilie. Fuera de esta
// ventana, el mismo monto exacto baja a heurístico (§E.3): coincidir en
// plata pero estar muy lejos en el tiempo es señal más débil, no ausente.
const VENTANA_DIAS_MONTO_FECHA = 5

// Umbral de similitud de nombre para que un candidato heurístico se
// considere digno de proponerse (no de auto-aplicarse — eso nunca ocurre
// aquí). Por debajo de esto, ni se muestra: sería ruido en la cola manual.
const UMBRAL_SIMILITUD_NOMBRE = 0.4

export function evaluarLinea(
  linea: LineaAConciliar,
  candidatosReferencia: readonly CandidatoPorReferencia[],
  candidatosMontoFecha: readonly CandidatoPorMontoFecha[],
  candidatosHeuristicos: readonly CandidatoHeuristico[],
): DecisionMatching {
  // §6.3: un monto negativo (débito, comisión, traslado) nunca es candidato
  // a pago de residente.
  if (linea.monto <= 0) {
    return { tipo: 'no_es_pago', motivo: 'El monto no es positivo (débito, comisión o traslado).' }
  }

  // ── 1. Referencia estructurada exacta ─────────────────────────────────
  // candidatosReferencia ya viene resuelto por la capa Supabase (que parseó
  // referencia_banco/descripcion_banco con parsearReferencia() de la Fase 2
  // y la cruzó contra intenciones_pago/inmuebles) — aquí solo se decide.
  const exactoPorReferencia = candidatosReferencia.find((c) => c.coincideExacto)
  if (exactoPorReferencia) {
    return { tipo: 'auto', metodo: 'referencia', inmuebleId: exactoPorReferencia.inmuebleId, score: 1 }
  }

  // ── 2. Monto exacto + ventana de fecha ────────────────────────────────
  const candidatosMontoValidos = candidatosMontoFecha.filter(
    (c) => c.montoCoincide && Math.abs(c.diasDeDiferencia) <= VENTANA_DIAS_MONTO_FECHA,
  )
  // Solo auto-concilia si hay EXACTAMENTE un candidato — dos inmuebles con
  // el mismo saldo pendiente exacto en la misma ventana es ambigüedad real,
  // no un caso claro; baja a heurístico/cola manual.
  if (candidatosMontoValidos.length === 1) {
    return {
      tipo: 'auto',
      metodo: 'monto_fecha',
      inmuebleId: (candidatosMontoValidos[0] as CandidatoPorMontoFecha).inmuebleId,
      score: 1,
    }
  }

  // ── 3. Heurístico — SOLO PROPONE, nunca aplica ────────────────────────
  const propuestas = candidatosHeuristicos
    .filter((c) => c.similitudNombre >= UMBRAL_SIMILITUD_NOMBRE)
    .map((c): PropuestaCandidata => armarPropuestaHeuristica(c))
    .sort((a, b) => b.score - a.score)

  if (propuestas.length > 0) {
    return { tipo: 'propuestas', candidatos: propuestas }
  }

  if (candidatosMontoValidos.length > 1) {
    // Ambigüedad de §2: varios candidatos empatados también van a cola
    // manual, pero SÍ como propuestas (no "sin candidato" a secas) — hay
    // información real que mostrar, solo no es unívoca.
    return {
      tipo: 'propuestas',
      candidatos: candidatosMontoValidos.map((c) => ({
        inmuebleId: c.inmuebleId,
        metodo: 'monto_fecha' as const,
        score: 0.6,
        explicacion: [
          {
            factor: 'monto_exacto_ambiguo',
            detalle: `${c.codigo}: monto coincide pero hay más de un inmueble candidato en la ventana de ${String(VENTANA_DIAS_MONTO_FECHA)} días.`,
            aporte: 0.6,
          },
        ],
      })),
    }
  }

  return { tipo: 'sin_candidato' }
}

function armarPropuestaHeuristica(c: CandidatoHeuristico): PropuestaCandidata {
  const factores: FactorExplicacion[] = [
    {
      factor: 'similitud_nombre',
      detalle: `Titular de la transferencia ≈ "${c.codigo}" (similarity ${c.similitudNombre.toFixed(2)}).`,
      aporte: c.similitudNombre * 0.6,
    },
  ]
  if (c.montoAproximado) {
    factores.push({
      factor: 'monto_aproximado',
      detalle: 'El monto se aproxima al saldo pendiente del inmueble.',
      aporte: 0.3,
    })
  }
  const factorFecha = Math.max(0, 1 - Math.abs(c.diasDeDiferencia) / 30) * 0.1
  factores.push({
    factor: 'distancia_fecha',
    detalle: `${String(c.diasDeDiferencia)} día(s) de diferencia con el movimiento del extracto.`,
    aporte: factorFecha,
  })

  const score = Math.min(1, factores.reduce((suma, f) => suma + f.aporte, 0))
  return { inmuebleId: c.inmuebleId, metodo: 'heuristico', score, explicacion: factores }
}

/**
 * Busca una referencia estructurada válida dentro de un texto libre — para
 * usar contra `descripcion_banco` cuando el banco no trae la referencia en
 * su propio campo (frecuente: el propietario copia la referencia como
 * "concepto" del giro, mezclada con otro texto). La capa Supabase la usa
 * para armar `candidatosReferencia` antes de llamar evaluarLinea().
 */
export function buscarReferenciaEnTexto(texto: string): ReturnType<typeof parsearReferencia> {
  for (const token of texto.split(/\s+/)) {
    const referencia = parsearReferencia(token.toLowerCase())
    if (referencia) return referencia
  }
  return null
}
