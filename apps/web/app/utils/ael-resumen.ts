/**
 * AEL-004 Fase 8, movimiento 11 — «Qué calcula esta fórmula», en una frase.
 *
 * La pestaña Definición ya tiene un panel que arma en lenguaje llano lo que
 * hace un concepto, y el equipo decidió con él que ésa es la forma correcta
 * de volver verificable una configuración compleja. Ese panel se detenía
 * justo en la fórmula: decía «Cobra **el resultado de su fórmula**» y no
 * entraba. Esto cierra ese hueco.
 *
 * Es la lectura que hoy no puede hacer nadie —ni en texto ni en bloques— y la
 * que permite a un consejo de administración aprobar una fórmula sin saber
 * AEL. Trabaja sobre el AST real, así que sirve igual en los dos modos.
 *
 * Alcance deliberado: se describen bien las formas comunes y se cae con
 * elegancia al texto AEL para lo que no lo sea. Intentar cubrir todo el AST
 * con lenguaje natural produce frases peores que el código que traducen.
 */
import { imprimirExpresion, type Expresion, type Instruccion, type OperadorBinario, type Regla } from '@aquila/ael-language'
import { ETIQUETA_OPERADOR_BINARIO, etiquetaCampo } from './ael-etiquetas'

/** Cómo se lee cada operador DENTRO de una frase — distinto de la etiqueta
 * del selector, donde «×» es más claro que «por». */
const OPERADOR_EN_FRASE: Readonly<Record<OperadorBinario, string>> = {
  '+': 'más',
  '-': 'menos',
  '*': 'por',
  '/': 'dividido entre',
  '==': 'es igual a',
  '!=': 'es distinto de',
  '>': 'es mayor que',
  '>=': 'es mayor o igual que',
  '<': 'es menor que',
  '<=': 'es menor o igual que',
}

const PRECEDENCIA: Record<OperadorBinario, number> = {
  '==': 0,
  '!=': 0,
  '>': 1,
  '>=': 1,
  '<': 1,
  '<=': 1,
  '+': 2,
  '-': 2,
  '*': 3,
  '/': 3,
}

/** Funciones del catálogo que tienen una lectura natural. Las que no estén
 * aquí se describen como «nombre de a y b», que sigue siendo legible. */
const FUNCION_EN_FRASE: Readonly<Record<string, (args: readonly string[]) => string | null>> = {
  MIN: (a) => (a.length === 2 ? `el menor entre ${a[0]} y ${a[1]}` : null),
  MAX: (a) => (a.length === 2 ? `el mayor entre ${a[0]} y ${a[1]}` : null),
  PORCENTAJE: (a) => (a.length === 2 ? `el ${a[1]}% de ${a[0]}` : null),
  REDONDEAR_DINERO: (a) => (a.length === 2 ? `${a[0]} redondeado a ${a[1]} decimales` : null),
}

function describirReferencia(contrato: string, campo: string): string {
  const legible = etiquetaCampo(campo)
  if (contrato === 'CONCEPTO') return `el concepto «${campo}»`
  if (contrato === 'UNIT') return `${legible.toLowerCase()} del inmueble`
  return legible.toLowerCase()
}

function describirOperando(hijo: Expresion, precedenciaPadre: number, esDerecho: boolean): string {
  const propia = hijo.tipo === 'ExpresionBinaria' ? PRECEDENCIA[hijo.operador] : Infinity
  const necesita = propia < precedenciaPadre || (esDerecho && propia === precedenciaPadre)
  const texto = describirExpresion(hijo)
  return necesita ? `(${texto})` : texto
}

export function describirExpresion(expr: Expresion): string {
  switch (expr.tipo) {
    case 'NumeroLiteral':
      return expr.valor
    case 'DineroLiteral':
      return `${expr.monto} ${expr.moneda}`
    case 'BooleanoLiteral':
      return expr.valor ? 'sí' : 'no'
    case 'NuloLiteral':
      return 'sin valor'
    case 'Identificador':
      return expr.nombre
    case 'ReferenciaContract':
      return describirReferencia(expr.contrato, expr.campo)
    case 'LlamadaFuncion': {
      const args = expr.argumentos.map((a) => describirExpresion(a))
      const natural = FUNCION_EN_FRASE[expr.nombre]?.(args)
      if (natural) return natural
      const nombre = etiquetaCampo(expr.nombre).toLowerCase()
      return args.length > 0 ? `${nombre} de ${args.join(' y ')}` : nombre
    }
    case 'ExpresionUnaria':
      return `menos ${describirOperando(expr.operando, Infinity, false)}`
    case 'ExpresionBinaria': {
      const precedencia = PRECEDENCIA[expr.operador]
      const izquierda = describirOperando(expr.izquierda, precedencia, false)
      const derecha = describirOperando(expr.derecha, precedencia, true)
      const operador = OPERADOR_EN_FRASE[expr.operador] ?? ETIQUETA_OPERADOR_BINARIO[expr.operador]
      return `${izquierda} ${operador} ${derecha}`
    }
  }
}

function describirInstruccion(inst: Instruccion): string {
  switch (inst.tipo) {
    case 'Declaracion':
      return `calcula ${inst.nombre} como ${describirExpresion(inst.expresion)}`
    case 'Retorno':
      return `el resultado es ${describirExpresion(inst.expresion)}`
    case 'Condicional': {
      const entonces = inst.entonces.map(describirInstruccion).join(', y ')
      const sino = inst.sino?.map(describirInstruccion).join(', y ')
      const condicion = describirExpresion(inst.condicion)
      const base = `si ${condicion}, ${entonces || 'no hace nada'}`
      return sino ? `${base}; de lo contrario, ${sino}` : base
    }
  }
}

/**
 * Frase única que describe la regla completa, o `null` si no hay nada que
 * describir. El llamador decide dónde pintarla.
 */
export function resumirRegla(regla: Regla): string | null {
  if (regla.cuerpo.length === 0) return null
  const partes = regla.cuerpo.map(describirInstruccion)
  const frase = partes.join('; ')
  return `${frase.charAt(0).toUpperCase()}${frase.slice(1)}.`
}

/** Reexportado para que el llamador pueda mostrar el AEL crudo como respaldo
 * cuando la frase no le parezca suficiente. */
export { imprimirExpresion }
