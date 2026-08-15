/**
 * AEL-004 Fase 2 — catálogo estático compartido por validación,
 * autocompletado y hover del editor de fórmulas. Una sola fuente en vez de
 * duplicar el objeto aproximado que antes vivía solo en ael-validate.ts.
 *
 * UNIT queda vacío a propósito (D-13): `snapshot.unidades` nunca se puebla
 * en liquidar-periodo real. Fase 1 (packages/liquidation-engine/src/
 * prueba-formula-supabase.ts) cablea UNIT.AREA_PRIVADA/AREA_COMUN/
 * COEFICIENTE, pero solo para el panel "Probar fórmula" — no se ofrecen
 * aquí para no autocompletar/validar algo que fallaría al liquidar de
 * verdad.
 */
import type { CatalogoContratos } from '@aquila/ael-language'
import type { Tipo } from '@aquila/ael-core'

export interface DocContrato {
  readonly tipo: Tipo
  readonly descripcion: string
}

export interface DocFuncion {
  readonly firma: string
  readonly descripcion: string
}

export const PALABRAS_RESERVADAS_DOC: Readonly<Record<string, string>> = {
  REGLA: 'Encabezado de la regla — nombre identificador, no forma parte del cálculo.',
  DEFINIR: 'Declara una variable local con el resultado de una expresión.',
  RETORNAR: 'Devuelve el resultado final de la regla — termina la evaluación.',
  SI: 'Inicia un condicional.',
  ENTONCES: 'Rama que se ejecuta cuando la condición de SI es verdadera.',
  SINO: 'Rama que se ejecuta cuando la condición de SI es falsa (opcional).',
  FIN: 'Cierra un bloque SI/ENTONCES/SINO.',
  VERDADERO: 'Literal booleano verdadero.',
  FALSO: 'Literal booleano falso.',
  NULO: 'Literal nulo — ausencia de valor.',
}

export const PARAMETER_CATALOGO: Readonly<Record<string, DocContrato>> = {
  PRESUPUESTO_ANUAL: {
    tipo: 'MONEY',
    descripcion: 'Monto total del presupuesto vigente del año que se está liquidando.',
  },
  OTROS_INGRESOS_ANUAL: {
    tipo: 'MONEY',
    descripcion:
      'Σ fuente_financiacion.valor_aplicado (tipo=otros_ingresos) del presupuesto vigente — neteo GAP-19.',
  },
}

/** Vacío a propósito — ver docstring del módulo. */
export const UNIT_CATALOGO: Readonly<Record<string, DocContrato>> = {}

export const FUNCIONES_CATALOGO: Readonly<Record<string, DocFuncion>> = {
  MIN: { firma: 'MIN(a, b)', descripcion: 'El menor de dos números.' },
  MAX: { firma: 'MAX(a, b)', descripcion: 'El mayor de dos números.' },
  PORCENTAJE: {
    firma: 'PORCENTAJE(monto, porcentaje)',
    descripcion:
      'monto * (porcentaje / 100). El segundo argumento es un porcentaje (10 = 10%), no una fracción.',
  },
  REDONDEAR_DINERO: {
    firma: 'REDONDEAR_DINERO(monto, escala)',
    descripcion:
      'Redondea un monto a la escala indicada, según el modo de redondeo de la política vigente del tenant.',
  },
}

/** Construye el CatalogoContratos que analizar()/parsear() necesitan, para
 * validación estática o autocompletado — CONCEPTO es dinámico (códigos
 * vigentes del tenant), PARAMETER/UNIT salen de los catálogos estáticos. */
export function catalogoContratosEstatico(codigosConceptos: readonly string[]): CatalogoContratos {
  return {
    PARAMETER: Object.fromEntries(
      Object.entries(PARAMETER_CATALOGO).map(([campo, doc]) => [campo, doc.tipo]),
    ),
    UNIT: Object.fromEntries(
      Object.entries(UNIT_CATALOGO).map(([campo, doc]) => [campo, doc.tipo]),
    ),
    // GAP-22: todo concepto de cobro es MONEY en v0 (mismo criterio que
    // packages/liquidation-engine/src/context.ts::catalogoDesde).
    CONCEPTO: Object.fromEntries(codigosConceptos.map((codigo) => [codigo, 'MONEY' as const])),
  }
}
