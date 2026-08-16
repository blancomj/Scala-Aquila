/**
 * AEL-004 Fase 7 — modelo de "bloques" para el constructor visual, y su
 * conversión bidireccional contra el AST real de @aquila/ael-language.
 *
 * Cada tipo de bloque es el nodo AST correspondiente (mismo discriminante
 * `tipo`, mismos campos) más un `id` para :key/drag/selección en el
 * canvas, con los hijos apuntando a *Bloque en vez de a Expresion/
 * Instruccion crudos. No hay `span`: el canvas no necesita posición
 * textual — astABloques() la descarta, bloquesAAst() genera un span
 * centinela (ver ESPAN_SINTETICO) porque analizar()/evaluar() no
 * dependen semánticamente del span, solo lo usan para ubicar
 * diagnósticos.
 *
 * Invariante heredada de ast.ts: NumeroLiteral.valor/DineroLiteral.monto
 * son el lexema crudo, nunca parseFloat. Cualquier UI que edite estos
 * campos debe capturar/emitir string con validación por regex, nunca
 * Number(x).toString() — eso reescribiría silenciosamente "100.50" como
 * "100.5" o rompería precisión decimal.
 */
import type {
  Condicional,
  Declaracion,
  Expresion,
  Instruccion,
  OperadorBinario,
  OperadorUnario,
  Regla,
  Retorno,
} from '@aquila/ael-language'
import type { Span } from '@aquila/ael-core'

const ESPAN_SINTETICO: Span = {
  inicio: { linea: 1, columna: 1 },
  fin: { linea: 1, columna: 1 },
}

function id(): string {
  return crypto.randomUUID()
}

export type BloqueExpresion =
  | BloqueNumeroLiteral
  | BloqueDineroLiteral
  | BloqueBooleanoLiteral
  | BloqueNuloLiteral
  | BloqueIdentificador
  | BloqueReferenciaContract
  | BloqueLlamadaFuncion
  | BloqueExpresionUnaria
  | BloqueExpresionBinaria

export interface BloqueNumeroLiteral {
  readonly id: string
  readonly tipo: 'NumeroLiteral'
  readonly valor: string
}

export interface BloqueDineroLiteral {
  readonly id: string
  readonly tipo: 'DineroLiteral'
  readonly monto: string
  readonly moneda: string
}

export interface BloqueBooleanoLiteral {
  readonly id: string
  readonly tipo: 'BooleanoLiteral'
  readonly valor: boolean
}

export interface BloqueNuloLiteral {
  readonly id: string
  readonly tipo: 'NuloLiteral'
}

export interface BloqueIdentificador {
  readonly id: string
  readonly tipo: 'Identificador'
  readonly nombre: string
}

export interface BloqueReferenciaContract {
  readonly id: string
  readonly tipo: 'ReferenciaContract'
  readonly contrato: string
  readonly campo: string
}

export interface BloqueLlamadaFuncion {
  readonly id: string
  readonly tipo: 'LlamadaFuncion'
  readonly nombre: string
  readonly argumentos: readonly BloqueExpresion[]
}

export interface BloqueExpresionUnaria {
  readonly id: string
  readonly tipo: 'ExpresionUnaria'
  readonly operador: OperadorUnario
  readonly operando: BloqueExpresion
}

export interface BloqueExpresionBinaria {
  readonly id: string
  readonly tipo: 'ExpresionBinaria'
  readonly operador: OperadorBinario
  readonly izquierda: BloqueExpresion
  readonly derecha: BloqueExpresion
}

export type BloqueInstruccion = BloqueDeclaracion | BloqueRetorno | BloqueCondicional

export interface BloqueDeclaracion {
  readonly id: string
  readonly tipo: 'Declaracion'
  readonly nombre: string
  readonly expresion: BloqueExpresion
}

export interface BloqueRetorno {
  readonly id: string
  readonly tipo: 'Retorno'
  readonly expresion: BloqueExpresion
}

export interface BloqueCondicional {
  readonly id: string
  readonly tipo: 'Condicional'
  readonly condicion: BloqueExpresion
  readonly entonces: readonly BloqueInstruccion[]
  readonly sino: readonly BloqueInstruccion[] | null
}

export interface BloqueRegla {
  readonly id: string
  readonly tipo: 'Regla'
  readonly nombre: string
  readonly cuerpo: readonly BloqueInstruccion[]
}

// ─────────────────────────── AST → bloques ───────────────────────────

function expresionABloque(expr: Expresion): BloqueExpresion {
  switch (expr.tipo) {
    case 'NumeroLiteral':
      return { id: id(), tipo: 'NumeroLiteral', valor: expr.valor }
    case 'DineroLiteral':
      return { id: id(), tipo: 'DineroLiteral', monto: expr.monto, moneda: expr.moneda }
    case 'BooleanoLiteral':
      return { id: id(), tipo: 'BooleanoLiteral', valor: expr.valor }
    case 'NuloLiteral':
      return { id: id(), tipo: 'NuloLiteral' }
    case 'Identificador':
      return { id: id(), tipo: 'Identificador', nombre: expr.nombre }
    case 'ReferenciaContract':
      return { id: id(), tipo: 'ReferenciaContract', contrato: expr.contrato, campo: expr.campo }
    case 'LlamadaFuncion':
      return {
        id: id(),
        tipo: 'LlamadaFuncion',
        nombre: expr.nombre,
        argumentos: expr.argumentos.map(expresionABloque),
      }
    case 'ExpresionUnaria':
      return {
        id: id(),
        tipo: 'ExpresionUnaria',
        operador: expr.operador,
        operando: expresionABloque(expr.operando),
      }
    case 'ExpresionBinaria':
      return {
        id: id(),
        tipo: 'ExpresionBinaria',
        operador: expr.operador,
        izquierda: expresionABloque(expr.izquierda),
        derecha: expresionABloque(expr.derecha),
      }
  }
}

function instruccionABloque(inst: Instruccion): BloqueInstruccion {
  switch (inst.tipo) {
    case 'Declaracion':
      return {
        id: id(),
        tipo: 'Declaracion',
        nombre: inst.nombre,
        expresion: expresionABloque(inst.expresion),
      }
    case 'Retorno':
      return { id: id(), tipo: 'Retorno', expresion: expresionABloque(inst.expresion) }
    case 'Condicional':
      return {
        id: id(),
        tipo: 'Condicional',
        condicion: expresionABloque(inst.condicion),
        entonces: inst.entonces.map(instruccionABloque),
        sino: inst.sino === null ? null : inst.sino.map(instruccionABloque),
      }
  }
}

export function astABloques(regla: Regla): BloqueRegla {
  return {
    id: id(),
    tipo: 'Regla',
    nombre: regla.nombre,
    cuerpo: regla.cuerpo.map(instruccionABloque),
  }
}

// ─────────────────────────── bloques → AST ───────────────────────────

function bloqueAExpresion(bloque: BloqueExpresion): Expresion {
  switch (bloque.tipo) {
    case 'NumeroLiteral':
      return { tipo: 'NumeroLiteral', valor: bloque.valor, span: ESPAN_SINTETICO }
    case 'DineroLiteral':
      return {
        tipo: 'DineroLiteral',
        monto: bloque.monto,
        moneda: bloque.moneda,
        span: ESPAN_SINTETICO,
      }
    case 'BooleanoLiteral':
      return { tipo: 'BooleanoLiteral', valor: bloque.valor, span: ESPAN_SINTETICO }
    case 'NuloLiteral':
      return { tipo: 'NuloLiteral', span: ESPAN_SINTETICO }
    case 'Identificador':
      return { tipo: 'Identificador', nombre: bloque.nombre, span: ESPAN_SINTETICO }
    case 'ReferenciaContract':
      return {
        tipo: 'ReferenciaContract',
        contrato: bloque.contrato,
        campo: bloque.campo,
        span: ESPAN_SINTETICO,
      }
    case 'LlamadaFuncion':
      return {
        tipo: 'LlamadaFuncion',
        nombre: bloque.nombre,
        argumentos: bloque.argumentos.map(bloqueAExpresion),
        span: ESPAN_SINTETICO,
      }
    case 'ExpresionUnaria':
      return {
        tipo: 'ExpresionUnaria',
        operador: bloque.operador,
        operando: bloqueAExpresion(bloque.operando),
        span: ESPAN_SINTETICO,
      }
    case 'ExpresionBinaria':
      return {
        tipo: 'ExpresionBinaria',
        operador: bloque.operador,
        izquierda: bloqueAExpresion(bloque.izquierda),
        derecha: bloqueAExpresion(bloque.derecha),
        span: ESPAN_SINTETICO,
      }
  }
}

function bloqueAInstruccion(bloque: BloqueInstruccion): Instruccion {
  switch (bloque.tipo) {
    case 'Declaracion':
      return {
        tipo: 'Declaracion',
        nombre: bloque.nombre,
        expresion: bloqueAExpresion(bloque.expresion),
        span: ESPAN_SINTETICO,
      } satisfies Declaracion
    case 'Retorno':
      return {
        tipo: 'Retorno',
        expresion: bloqueAExpresion(bloque.expresion),
        span: ESPAN_SINTETICO,
      } satisfies Retorno
    case 'Condicional':
      return {
        tipo: 'Condicional',
        condicion: bloqueAExpresion(bloque.condicion),
        entonces: bloque.entonces.map(bloqueAInstruccion),
        sino: bloque.sino === null ? null : bloque.sino.map(bloqueAInstruccion),
        span: ESPAN_SINTETICO,
      } satisfies Condicional
  }
}

export function bloquesAAst(bloque: BloqueRegla): Regla {
  return {
    tipo: 'Regla',
    nombre: bloque.nombre,
    cuerpo: bloque.cuerpo.map(bloqueAInstruccion),
    span: ESPAN_SINTETICO,
  }
}

/** Catálogo para selects/autocompletado del canvas (E6+) — ver ael-catalogo.ts. */
export interface CatalogoBloques {
  readonly parameter: readonly string[]
  readonly unit: readonly string[]
  readonly concepto: readonly string[]
  readonly funciones: readonly string[]
}

// ─────────────────── fábricas de bloques por defecto (E6) ───────────────
// Usadas por los botones "+ instrucción"/"+ argumento"/"envolver" del
// constructor visual: siempre producen un fragmento de AST válido (nunca
// un hueco), para que el árbol nunca quede en un estado que no imprima/
// parsee. NumeroLiteral('0') es el placeholder universal — cualquier otro
// tipo de literal exigiría inventar un valor por defecto no obvio (¿qué
// REGLA le pondrías a una ReferenciaContract en blanco?).

export function bloqueNumeroCero(): BloqueNumeroLiteral {
  return { id: id(), tipo: 'NumeroLiteral', valor: '0' }
}

export function bloqueDineroPorDefecto(): BloqueDineroLiteral {
  return { id: id(), tipo: 'DineroLiteral', monto: '0', moneda: 'COP' }
}

export function bloqueBooleanoPorDefecto(): BloqueBooleanoLiteral {
  return { id: id(), tipo: 'BooleanoLiteral', valor: true }
}

export function bloqueNuloPorDefecto(): BloqueNuloLiteral {
  return { id: id(), tipo: 'NuloLiteral' }
}

export function bloqueIdentificadorPorDefecto(): BloqueIdentificador {
  return { id: id(), tipo: 'Identificador', nombre: 'variable' }
}

export function bloqueReferenciaContractPorDefecto(): BloqueReferenciaContract {
  return { id: id(), tipo: 'ReferenciaContract', contrato: 'PARAMETER', campo: '' }
}

export function bloqueLlamadaFuncionPorDefecto(): BloqueLlamadaFuncion {
  return { id: id(), tipo: 'LlamadaFuncion', nombre: '', argumentos: [] }
}

/** Fábrica por defecto de cada tipo hoja — usada por el selector "cambiar tipo" (E6+). */
export const FABRICAS_POR_TIPO: {
  readonly [K in BloqueExpresion['tipo']]?: () => BloqueExpresion
} = {
  NumeroLiteral: bloqueNumeroCero,
  DineroLiteral: bloqueDineroPorDefecto,
  BooleanoLiteral: bloqueBooleanoPorDefecto,
  NuloLiteral: bloqueNuloPorDefecto,
  Identificador: bloqueIdentificadorPorDefecto,
  ReferenciaContract: bloqueReferenciaContractPorDefecto,
  LlamadaFuncion: bloqueLlamadaFuncionPorDefecto,
}

export function bloqueDeclaracionVacia(): BloqueDeclaracion {
  return { id: id(), tipo: 'Declaracion', nombre: 'nueva', expresion: bloqueNumeroCero() }
}

export function bloqueRetornoVacio(): BloqueRetorno {
  return { id: id(), tipo: 'Retorno', expresion: bloqueNumeroCero() }
}

export function bloqueCondicionalVacio(): BloqueCondicional {
  return {
    id: id(),
    tipo: 'Condicional',
    condicion: { id: id(), tipo: 'BooleanoLiteral', valor: true },
    entonces: [],
    sino: null,
  }
}

/** Envuelve `bloque` como lado izquierdo de una nueva ExpresionBinaria. */
export function envolverEnBinaria(bloque: BloqueExpresion): BloqueExpresionBinaria {
  return {
    id: id(),
    tipo: 'ExpresionBinaria',
    operador: '+',
    izquierda: bloque,
    derecha: bloqueNumeroCero(),
  }
}

// ───────────── mover instrucciones entre ramas distintas (E6+) ──────────
// Una lista de instrucciones no es solo `cuerpo` de la REGLA — también es
// `entonces`/`sino` de cualquier Condicional anidado. RutaLista identifica
// UNA de esas listas: la secuencia de Condicionales que hay que atravesar
// (y por qué rama) desde `cuerpo` para llegar a ella. `cuerpo` mismo es la
// ruta vacía `[]`.

export interface PasoRuta {
  readonly indice: number
  readonly rama: 'entonces' | 'sino'
}
export type RutaLista = readonly PasoRuta[]

function obtenerLista(
  cuerpo: readonly BloqueInstruccion[],
  ruta: RutaLista,
): readonly BloqueInstruccion[] {
  let actual = cuerpo
  for (const paso of ruta) {
    const inst = actual[paso.indice]
    if (inst?.tipo !== 'Condicional') throw new Error('RutaLista inválida: no apunta a un Condicional')
    const rama = paso.rama === 'entonces' ? inst.entonces : inst.sino
    if (rama === null) throw new Error('RutaLista inválida: la rama SINO no existe')
    actual = rama
  }
  return actual
}

function reemplazarLista(
  cuerpo: readonly BloqueInstruccion[],
  ruta: RutaLista,
  nuevaLista: readonly BloqueInstruccion[],
): readonly BloqueInstruccion[] {
  const [primero, ...resto] = ruta
  if (primero === undefined) return nuevaLista
  return cuerpo.map((inst, i) => {
    if (i !== primero.indice || inst.tipo !== 'Condicional') return inst
    if (primero.rama === 'entonces') {
      return { ...inst, entonces: reemplazarLista(inst.entonces, resto, nuevaLista) }
    }
    if (inst.sino === null) throw new Error('RutaLista inválida: la rama SINO no existe')
    return { ...inst, sino: reemplazarLista(inst.sino, resto, nuevaLista) }
  })
}

function rutaIgual(a: RutaLista, b: RutaLista): boolean {
  return a.length === b.length && a.every((paso, i) => paso.indice === b[i]?.indice && paso.rama === b[i]?.rama)
}

/** Busca `bloqueId` en todo el árbol — devuelve su ruta (lista contenedora) e índice, o null. */
export function encontrarRutaDeInstruccion(
  cuerpo: readonly BloqueInstruccion[],
  bloqueId: string,
  rutaActual: RutaLista = [],
): { readonly ruta: RutaLista; readonly indice: number } | null {
  const indice = cuerpo.findIndex((inst) => inst.id === bloqueId)
  if (indice !== -1) return { ruta: rutaActual, indice }

  for (const [i, inst] of cuerpo.entries()) {
    if (inst.tipo !== 'Condicional') continue
    const enEntonces = encontrarRutaDeInstruccion(inst.entonces, bloqueId, [
      ...rutaActual,
      { indice: i, rama: 'entonces' },
    ])
    if (enEntonces) return enEntonces
    if (inst.sino !== null) {
      const enSino = encontrarRutaDeInstruccion(inst.sino, bloqueId, [
        ...rutaActual,
        { indice: i, rama: 'sino' },
      ])
      if (enSino) return enSino
    }
  }
  return null
}

/**
 * Mueve la instrucción `bloqueId` a `destinoIndice` de la lista en
 * `rutaDestino` — dentro de la misma lista (reordenar) o entre ramas
 * distintas (ENTONCES↔SINO↔cuerpo). No admite mover un Condicional dentro
 * de su propia rama descendiente (produciría un árbol cíclico) — ese caso
 * no se guarda contra explícitamente porque ningún drop target de la UI lo
 * ofrece (un Condicional no puede soltarse dentro de su propio ENTONCES/
 * SINO, son componentes hijos distintos en el DOM).
 */
export function moverInstruccionEntreListas(
  raiz: BloqueRegla,
  rutaOrigen: RutaLista,
  origenIndice: number,
  rutaDestino: RutaLista,
  destinoIndice: number,
): BloqueRegla {
  const listaOrigen = obtenerLista(raiz.cuerpo, rutaOrigen)
  const movida = listaOrigen[origenIndice]
  if (!movida) throw new Error('moverInstruccionEntreListas: índice de origen inválido')

  if (rutaIgual(rutaOrigen, rutaDestino)) {
    const sinMovida = listaOrigen.filter((_, i) => i !== origenIndice)
    const destinoAjustado = origenIndice < destinoIndice ? destinoIndice - 1 : destinoIndice
    const nuevaLista = [...sinMovida]
    nuevaLista.splice(Math.max(0, Math.min(destinoAjustado, nuevaLista.length)), 0, movida)
    return { ...raiz, cuerpo: reemplazarLista(raiz.cuerpo, rutaOrigen, nuevaLista) }
  }

  const listaOrigenSinMovida = listaOrigen.filter((_, i) => i !== origenIndice)
  const cuerpoSinMovida = reemplazarLista(raiz.cuerpo, rutaOrigen, listaOrigenSinMovida)
  const listaDestino = obtenerLista(cuerpoSinMovida, rutaDestino)
  const listaDestinoConMovida = [...listaDestino]
  listaDestinoConMovida.splice(
    Math.max(0, Math.min(destinoIndice, listaDestinoConMovida.length)),
    0,
    movida,
  )
  return { ...raiz, cuerpo: reemplazarLista(cuerpoSinMovida, rutaDestino, listaDestinoConMovida) }
}

// ──────────────── diff visual bloque-a-bloque (E6+) ──────────────────────
// Comparación posicional (no LCS/edit-distance): compara el elemento en el
// mismo índice de las dos listas. Suficiente para reglas AEL reales (3-10
// instrucciones) — una inserción en medio de la lista marca todo lo
// siguiente como "cambiado" en vez de detectar el corrimiento, pero eso es
// aceptable para el volumen de instrucciones que maneja este editor; un
// diff tipo Myers es una inversión que este caso de uso no pide.

export type EstadoDiffInstruccion = 'igual' | 'cambiado' | 'nuevo' | 'eliminado'

export interface InstruccionConDiff {
  readonly instruccion: BloqueInstruccion
  readonly estado: EstadoDiffInstruccion
  /** Solo en Condicional: el diff de sus propias ramas, para resaltado anidado. */
  readonly entonces?: readonly InstruccionConDiff[]
  readonly sino?: readonly InstruccionConDiff[] | null
}

function sinIdInstruccion(inst: BloqueInstruccion): unknown {
  return JSON.parse(JSON.stringify(inst), (clave, valor) => (clave === 'id' ? undefined : valor))
}

function instruccionesEstructuralmenteIguales(a: BloqueInstruccion, b: BloqueInstruccion): boolean {
  return JSON.stringify(sinIdInstruccion(a)) === JSON.stringify(sinIdInstruccion(b))
}

/**
 * Diferencia dos listas de instrucciones, posición a posición, recursando
 * en las ramas de cada Condicional. `estadoAusente` decide cómo marcar los
 * elementos que no tienen contraparte en la otra lista: 'nuevo' cuando se
 * llama para la lista B (más larga que A), 'eliminado' cuando se llama para
 * la lista A (más larga que B) — ver diferenciarParDeListas().
 */
function diferenciarListaContra(
  propias: readonly BloqueInstruccion[],
  otras: readonly BloqueInstruccion[],
  estadoAusente: 'nuevo' | 'eliminado',
): readonly InstruccionConDiff[] {
  return propias.map((inst, i) => {
    const contraparte = otras[i]
    const base =
      contraparte === undefined
        ? estadoAusente
        : instruccionesEstructuralmenteIguales(inst, contraparte)
          ? ('igual' as const)
          : ('cambiado' as const)

    if (inst.tipo !== 'Condicional') return { instruccion: inst, estado: base }

    const contraparteCondicional = contraparte?.tipo === 'Condicional' ? contraparte : null
    return {
      instruccion: inst,
      estado: base,
      entonces: diferenciarListaContra(
        inst.entonces,
        contraparteCondicional?.entonces ?? [],
        estadoAusente,
      ),
      sino:
        inst.sino === null
          ? null
          : diferenciarListaContra(inst.sino, contraparteCondicional?.sino ?? [], estadoAusente),
    }
  })
}

/** Par (original, nueva) anotado para mostrar dos canvases de solo lectura lado a lado. */
export function diferenciarParDeListas(
  original: readonly BloqueInstruccion[],
  nueva: readonly BloqueInstruccion[],
): { readonly original: readonly InstruccionConDiff[]; readonly nueva: readonly InstruccionConDiff[] } {
  return {
    original: diferenciarListaContra(original, nueva, 'eliminado'),
    nueva: diferenciarListaContra(nueva, original, 'nuevo'),
  }
}
