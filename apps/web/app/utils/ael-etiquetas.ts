/**
 * AEL-004 Fase 8, movimiento 03 — capa de etiquetas del constructor visual.
 *
 * El lienzo hablaba el vocabulario del lenguaje: REGLA / DEFINIR / RETORNAR /
 * SI / ENTONCES / SINO / FIN en mayúsculas y monoespaciada, y los tipos como
 * `#`, `$`, `S/N`, `var`, `ref`, `fn()` a 9 px. Para un administrador de
 * propiedad horizontal eso es código, no una fórmula.
 *
 * Acá vive SOLO la traducción a español llano. La semántica no cambia en
 * absoluto: el AST, el texto que se guarda y lo que evalúa el motor son
 * exactamente los mismos — esto es la etiqueta que se pinta encima.
 *
 * `MODO_SINTAXIS` (el interruptor «Ver sintaxis AEL» del lienzo, apagado por
 * defecto) devuelve la palabra clave junto a la etiqueta, para quien esté
 * aprendiendo el modo texto: el puente entre ambos modos se mantiene, solo
 * deja de ser obligatorio.
 */
import type { OperadorBinario } from '@aquila/ael-language'
import type { BloqueExpresion } from './ael-bloques'
import { FUNCIONES_CATALOGO, PARAMETER_CATALOGO, UNIT_CATALOGO } from './ael-catalogo'

/** Clave de inyección del interruptor «Ver sintaxis AEL» (provee AelBlockCanvas). */
export const CLAVE_MOSTRAR_SINTAXIS = Symbol('aelMostrarSintaxis')

// ── instrucciones ────────────────────────────────────────────────────────
// FIN no aparece: es un artefacto de la gramática textual. En una caja que
// ya se cierra sola no significa nada, y ocupaba una línea entera.

export interface EtiquetaInstruccion {
  /** Lo que se lee en pantalla. */
  readonly texto: string
  /** La palabra clave AEL equivalente, para el modo sintaxis. */
  readonly sintaxis: string
}

export const ETIQUETA_DECLARACION: EtiquetaInstruccion = { texto: 'Calcular', sintaxis: 'DEFINIR' }
export const ETIQUETA_DECLARACION_NEXO = 'como'
export const ETIQUETA_RETORNO: EtiquetaInstruccion = {
  texto: 'Resultado final',
  sintaxis: 'RETORNAR',
}
export const ETIQUETA_CONDICIONAL: EtiquetaInstruccion = { texto: 'Si', sintaxis: 'SI' }
export const ETIQUETA_ENTONCES: EtiquetaInstruccion = { texto: 'Entonces', sintaxis: 'ENTONCES' }
export const ETIQUETA_SINO: EtiquetaInstruccion = { texto: 'De lo contrario', sintaxis: 'SINO' }
export const ETIQUETA_REGLA: EtiquetaInstruccion = { texto: 'Fórmula', sintaxis: 'REGLA' }

/** Botones «agregar instrucción», nombrados por lo que producen. */
export const ETIQUETA_AGREGAR = {
  declaracion: 'Cálculo',
  retorno: 'Resultado',
  condicional: 'Condición',
} as const

// ── operadores ───────────────────────────────────────────────────────────
// Aritméticos con el signo que se usa fuera de un teclado (× ÷, no * /);
// comparaciones en palabras, que es como se leen en voz alta y como las
// escribe el constructor de condiciones de Alcance («es mayor que»).
// El VALOR sigue siendo el operador AEL: solo cambia la etiqueta del option.

export const ETIQUETA_OPERADOR_BINARIO: Readonly<Record<OperadorBinario, string>> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
  '==': 'es igual a',
  '!=': 'es distinto de',
  '>': 'es mayor que',
  '>=': 'es mayor o igual que',
  '<': 'es menor que',
  '<=': 'es menor o igual que',
}

/** Los aritméticos se pintan como símbolo grande; los de comparación, como texto. */
export function esOperadorAritmetico(operador: OperadorBinario): boolean {
  return operador === '+' || operador === '-' || operador === '*' || operador === '/'
}

// ── tipos de valor ───────────────────────────────────────────────────────
// Antes: `#`, `$`, `S/N`, `nulo`, `var`, `ref`, `fn()` a 9 px, sin etiqueta
// visible, dentro de un <select> que había que abrir para saber qué eran.
// Al mudarse al menú contextual (movimiento 02) hay sitio para la palabra.

export interface EtiquetaTipo {
  readonly texto: string
  readonly ayuda: string
}

export const ETIQUETA_TIPO_VALOR: Readonly<Partial<Record<BloqueExpresion['tipo'], EtiquetaTipo>>> =
  {
    NumeroLiteral: { texto: 'Número', ayuda: 'Una cantidad fija, como 12 o 0.5.' },
    DineroLiteral: { texto: 'Dinero', ayuda: 'Un monto con moneda, como 50000 COP.' },
    BooleanoLiteral: { texto: 'Sí / No', ayuda: 'Verdadero o falso.' },
    NuloLiteral: { texto: 'Sin valor', ayuda: 'Ausencia de valor.' },
    Identificador: { texto: 'Variable', ayuda: 'Un cálculo definido antes en esta fórmula.' },
    ReferenciaContract: {
      texto: 'Dato del sistema',
      ayuda: 'Un parámetro, un campo del inmueble o el resultado de otro concepto.',
    },
    LlamadaFuncion: { texto: 'Función', ayuda: 'Una operación con nombre, como redondear.' },
  }

/** Nombre legible del contrato — el prefijo de una referencia. */
export const ETIQUETA_CONTRATO: Readonly<Record<string, string>> = {
  PARAMETER: 'Parámetro',
  UNIT: 'Inmueble',
  CONCEPTO: 'Concepto',
}

/**
 * Nombre legible de un campo de contrato.
 *
 * Primero se consulta la etiqueta DECLARADA en el catálogo: derivarla del
 * código pierde las tildes —`AREA_PRIVADA` daría «Area privada»— y en un
 * producto en español eso se nota. Solo se deriva para lo que el catálogo no
 * conoce, que en la práctica son los códigos de concepto: los escribe el
 * usuario, no siguen ninguna convención garantizada, y si no parecen un
 * identificador en mayúsculas se dejan intactos.
 */
export function etiquetaCampo(campo: string): string {
  if (!campo) return ''
  const declarada = PARAMETER_CATALOGO[campo]?.etiqueta ?? UNIT_CATALOGO[campo]?.etiqueta
  if (declarada) return declarada
  if (!/^[A-Z][A-Z0-9_]*$/.test(campo)) return campo
  const palabras = campo.toLowerCase().split('_')
  const [primera, ...resto] = palabras
  if (primera === undefined) return campo
  return [primera.charAt(0).toUpperCase() + primera.slice(1), ...resto].join(' ')
}

/** Nombre de función legible: `REDONDEAR_DINERO` → `Redondear dinero`. */
export function etiquetaFuncion(nombre: string): string {
  return FUNCIONES_CATALOGO[nombre]?.etiqueta ?? etiquetaCampo(nombre)
}

/** Clave de inyección del nodo de expresión activo — lo provee AelBlockCanvas
 * y lo alimenta cada AelBlockExpresion al recibir el foco. El catálogo único
 * (F4, mov. 06) inserta sobre ESE nodo. */
export const CLAVE_NODO_ACTIVO = Symbol('aelNodoActivo')

/** Clave de inyección de los valores de la última «Prueba de fórmula», por
 * nombre de cálculo (F4, mov. 07). La traza ya la produce el evaluador real;
 * hasta ahora se pintaba en una lista aparte, a 300 px de los bloques a los
 * que corresponde. */
export const CLAVE_VALORES_TRAZA = Symbol('aelValoresTraza')

/** Clave con la que se indexa el valor del resultado final en el mapa de
 * traza: el RETORNAR viene con `nombre: null` desde el evaluador, y un
 * espacio inicial no puede colisionar con ningún identificador AEL. */
export const CLAVE_VALOR_RESULTADO = ' resultado'

/** Contrato AEL → nombre de la variable CSS de su color (assets/css/tokens.css).
 * Es el puente entre el modelo y la paleta compartida por los dos modos del
 * editor: las píldoras del lienzo y el resaltado del modo texto. */
export const ORIGEN_POR_CONTRATO: Readonly<Record<string, string>> = {
  PARAMETER: 'parametro',
  UNIT: 'inmueble',
  CONCEPTO: 'concepto',
}
