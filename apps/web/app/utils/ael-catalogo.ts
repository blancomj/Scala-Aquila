/**
 * AEL-004 Fase 2 — catálogo estático compartido por validación,
 * autocompletado y hover del editor de fórmulas. Una sola fuente en vez de
 * duplicar el objeto aproximado que antes vivía solo en ael-validate.ts.
 *
 * UNIT ya no está vacío: `packages/liquidation-engine/src/snapshot-supabase.ts`
 * puebla AREA_PRIVADA/AREA_COMUN/COEFICIENTE por inmueble en el snapshot
 * real de liquidar-periodo (antes solo se cableaban para el panel "Probar
 * fórmula", D-13 revertida). Un inmueble puntual sin área diligenciada
 * simplemente no tiene esa clave — la fórmula que la use para ESE inmueble
 * falla explícito al liquidar (17 §37 SNAPSHOT INCOMPLETE), no aquí: este
 * catálogo solo valida que el CAMPO exista en el dominio, no que todos los
 * inmuebles lo tengan diligenciado.
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

export const UNIT_CATALOGO: Readonly<Record<string, DocContrato>> = {
  AREA_PRIVADA: {
    tipo: 'NUMBER',
    descripcion: 'Área privada del inmueble (m²) — inmuebles.area_privada. Puede faltar por inmueble.',
  },
  AREA_COMUN: {
    tipo: 'NUMBER',
    descripcion: 'Área común asignada al inmueble (m²) — inmuebles.area_comun. Puede faltar por inmueble.',
  },
  COEFICIENTE: {
    tipo: 'NUMBER',
    descripcion: 'Coeficiente de copropiedad vigente del inmueble (set activo del tenant).',
  },
}

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
