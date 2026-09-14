/**
 * Motor de cruce de conciliación bancaria CONTABLE (banco↔libro) — Fase 4 del plan aprobado en
 * `Docs/Conciliacion Bancaria/PROMPT_CONCILIACION_BANCARIA_CONTABLE.md` §5-B/§7 (D-113/D-115).
 * Función PURA — sin Supabase, sin fecha del sistema (recibe `fechaCorte` como parámetro): dado
 * un saldo inicial y las listas de movimientos de banco y de libros de un período, produce las
 * partidas que NO cruzan, clasificadas, y los saldos finales de ambos lados.
 *
 * NO ES `conciliacion-matching.ts` (esa es banco↔residente, Entregable A) ni auto-aplica nada — a
 * diferencia del motor de recaudo, aquí NUNCA se decide "a quién pertenece el dinero": banco y
 * libros son dos verdades que ya existen, y este motor solo compara. El resultado nunca contabiliza
 * ni concilia solo; lo hace explícito el Fase 5 (Edge Function) al crear el borrador.
 *
 * CONVENCIÓN DE SIGNO — igual en los dos lados, para que sumar dé el saldo real:
 * positivo = entra dinero a la cuenta (abono banco / débito de la cuenta contable de bancos,
 * que es de naturaleza débito por ser grupo 11 — activo); negativo = sale. `MovimientoLibro.monto`
 * es SIEMPRE `debito - credito` de la línea de `contable_comprobante_detalle`, nunca los dos
 * valores separados — quien arma el adaptador de Fase 5 hace esa resta antes de llamar aquí.
 */

export interface MovimientoBanco {
  readonly id: string
  readonly fecha: string // YYYY-MM-DD
  readonly monto: number
  readonly descripcion: string
  readonly referencia: string | null
}

export interface MovimientoLibro {
  readonly id: string
  readonly fecha: string // YYYY-MM-DD
  /** `debito - credito` de la línea del comprobante — ver convención de signo arriba. */
  readonly monto: number
  readonly descripcion: string
  readonly referencia: string | null
}

export type TipoPartidaConciliacion =
  | 'deposito_transito'
  | 'nota_debito_banco'
  | 'nota_credito_banco'
  | 'cheque_pendiente'
  | 'partida_salida_pendiente'
  | 'otro'

export interface PartidaNoCruzada {
  readonly origen: 'banco' | 'libro'
  readonly tipo: TipoPartidaConciliacion
  readonly monto: number
  readonly descripcion: string
  readonly movimientoBancoId: string | null
  readonly movimientoLibroId: string | null
}

export interface ResultadoCruce {
  readonly saldoFinalBanco: number
  readonly saldoFinalLibros: number
  readonly partidasCruzadas: number
  readonly partidas: readonly PartidaNoCruzada[]
}

// Ventana para "monto exacto + fecha" — mismo espíritu que
// conciliacion-matching.ts (VENTANA_DIAS_MONTO_FECHA), pero un motor distinto
// con su propia constante: comparar banco contra libros no es lo mismo que
// comparar banco contra un pagador (aquí ambos lados son "verdad", no hay
// heurístico de similitud de nombre — el cruce es solo monto+fecha).
const VENTANA_DIAS_MONTO_FECHA = 3

// Un movimiento de banco positivo sin match, dentro de esta ventana respecto
// al corte del período, se lee como "ya está en camino a libros" (depósito en
// tránsito) en vez de "el banco sabe algo que libros no" — en este sistema
// concreto extracto_linea suele adelantarse a contable_comprobante (CO-3
// materializa por lotes, §3.7 del prompt), al revés del ejemplo de texto de
// un libro de contabilidad clásico. Fuera de la ventana, la misma línea sin
// match es más probable que sea un abono real del banco no registrado
// (rendimiento, nota crédito) — señal más débil de "está en camino".
const VENTANA_DIAS_RECIENTE = 3

function diasEntre(a: string, b: string): number {
  const msPorDia = 24 * 60 * 60 * 1000
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / msPorDia)
}

function normalizarReferencia(referencia: string | null): string | null {
  if (referencia === null) return null
  const limpio = referencia.trim().toLowerCase()
  return limpio.length > 0 ? limpio : null
}

function clasificarBancoSinCruzar(m: MovimientoBanco, fechaCorte: string): TipoPartidaConciliacion {
  if (m.monto <= 0) return 'nota_debito_banco'
  const diasDesdeElMovimiento = Math.abs(diasEntre(fechaCorte, m.fecha))
  return diasDesdeElMovimiento <= VENTANA_DIAS_RECIENTE ? 'deposito_transito' : 'nota_credito_banco'
}

function clasificarLibroSinCruzar(m: MovimientoLibro): TipoPartidaConciliacion {
  // Salida de dinero según libros que el banco todavía no refleja (cheque
  // girado, transferencia saliente de un lote FIN-3 aún no en el extracto).
  // El adaptador de Fase 5 puede afinar esto a 'partida_salida_pendiente'
  // cuando logre trazar el movimiento hasta un finanzas_lotes_pago concreto
  // (glosario §2/§3 del prompt) — el motor puro no tiene esa información.
  if (m.monto < 0) return 'cheque_pendiente'
  // Entrada según libros que el banco no muestra todavía — caso atípico en
  // este sistema (el flujo normal es al revés, ver VENTANA_DIAS_RECIENTE);
  // se deja sin vocabulario propio a propósito, no se inventa un tipo nuevo
  // fuera del catálogo cerrado en D-CB-3.
  return 'otro'
}

/**
 * Cruza banco contra libros para un período. Cascada, en este orden (mismo
 * criterio de "determinista primero" que conciliacion-matching.ts):
 *   1. Referencia igual (normalizada) Y monto igual — sin importar qué tan
 *      lejos estén las fechas (un pago se banca el mismo día y se journaliza
 *      días después es normal; la referencia ya lo identifica sin ambigüedad).
 *   2. Sin referencia que sirva: monto exacto + fecha dentro de la ventana —
 *      solo si hay EXACTAMENTE un candidato a cada lado (dos posibles parejas
 *      con el mismo monto en la misma ventana es ambigüedad real).
 *   3. Lo que no cruza queda como partida, clasificada.
 *
 * INVARIANTE DELIBERADO: un par solo cruza si sus montos son IGUALES — nunca
 * "misma referencia, monto distinto". Si se permitiera eso, la diferencia de
 * monto quedaría sin explicar en ningún lado (ni en el saldo, ni en una
 * partida), rompiendo la identidad que hace útil esta conciliación: saldo
 * banco ajustado (saldoFinalBanco menos sus partidas) siempre debe coincidir
 * con saldo libros ajustado (saldoFinalLibros menos las suyas) — ver el test
 * "identidad contable". Una referencia igual con monto distinto es un caso
 * real (pago parcial, error de captura) que debe quedar VISIBLE como partida
 * a cada lado, no silenciado por la referencia.
 *
 * Los saldos finales se calculan sobre TODOS los movimientos de entrada,
 * cruzaran o no — cruzar no cambia el saldo, solo explica la diferencia.
 */
export function cruzarConciliacionBancaria(params: {
  readonly saldoInicialBanco: number
  readonly saldoInicialLibros: number
  readonly movimientosBanco: readonly MovimientoBanco[]
  readonly movimientosLibro: readonly MovimientoLibro[]
  readonly fechaCorte: string
}): ResultadoCruce {
  const { saldoInicialBanco, saldoInicialLibros, movimientosBanco, movimientosLibro, fechaCorte } = params

  const saldoFinalBanco = movimientosBanco.reduce((suma, m) => suma + m.monto, saldoInicialBanco)
  const saldoFinalLibros = movimientosLibro.reduce((suma, m) => suma + m.monto, saldoInicialLibros)

  let bancoPendiente = [...movimientosBanco]
  let libroPendiente = [...movimientosLibro]
  let cruzadas = 0

  // ── 1. Referencia igual Y monto igual ────────────────────────────────
  const bancoTrasReferencia: MovimientoBanco[] = []
  for (const b of bancoPendiente) {
    const refB = normalizarReferencia(b.referencia)
    const indiceMatch =
      refB === null
        ? -1
        : libroPendiente.findIndex((l) => l.monto === b.monto && normalizarReferencia(l.referencia) === refB)
    if (indiceMatch === -1) {
      bancoTrasReferencia.push(b)
      continue
    }
    libroPendiente = libroPendiente.filter((_, i) => i !== indiceMatch)
    cruzadas++
  }
  bancoPendiente = bancoTrasReferencia

  // ── 2. Monto exacto + fecha, solo si es inequívoco ───────────────────
  const bancoTrasMontoFecha: MovimientoBanco[] = []
  for (const b of bancoPendiente) {
    const candidatos = libroPendiente
      .map((l, indice) => ({ l, indice }))
      .filter(({ l }) => l.monto === b.monto && Math.abs(diasEntre(b.fecha, l.fecha)) <= VENTANA_DIAS_MONTO_FECHA)

    if (candidatos.length === 1) {
      const unico = candidatos[0] as { l: MovimientoLibro; indice: number }
      libroPendiente = libroPendiente.filter((_, i) => i !== unico.indice)
      cruzadas++
    } else {
      bancoTrasMontoFecha.push(b)
    }
  }
  bancoPendiente = bancoTrasMontoFecha

  // ── 3. Lo que sobra, clasificado ──────────────────────────────────────
  const partidas: PartidaNoCruzada[] = [
    ...bancoPendiente.map(
      (m): PartidaNoCruzada => ({
        origen: 'banco',
        tipo: clasificarBancoSinCruzar(m, fechaCorte),
        monto: m.monto,
        descripcion: m.descripcion,
        movimientoBancoId: m.id,
        movimientoLibroId: null,
      }),
    ),
    ...libroPendiente.map(
      (m): PartidaNoCruzada => ({
        origen: 'libro',
        tipo: clasificarLibroSinCruzar(m),
        monto: m.monto,
        descripcion: m.descripcion,
        movimientoBancoId: null,
        movimientoLibroId: m.id,
      }),
    ),
  ]

  return { saldoFinalBanco, saldoFinalLibros, partidasCruzadas: cruzadas, partidas }
}
