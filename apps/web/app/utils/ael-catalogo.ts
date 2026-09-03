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
  /** Nombre legible para la UI (mov. 03). Se declara en vez de derivarlo del
   * código porque derivar pierde tildes: AREA_PRIVADA daría «Area privada». */
  readonly etiqueta: string
}

export interface DocFuncion {
  readonly firma: string
  readonly descripcion: string
  /** Nombre legible para la UI (mov. 03). */
  readonly etiqueta: string
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

// Las descripciones se LEEN EN PANTALLA: en el panel «Variables disponibles»
// y en el hover del editor de fórmulas. Están escritas para quien administra
// una copropiedad, no para quien mantiene el motor — antes decían cosas como
// «Σ fuente_financiacion.valor_aplicado (tipo=otros_ingresos) — neteo GAP-19»,
// que mezcla una tabla, una columna y un identificador de gap interno. La
// procedencia técnica de cada valor va en el comentario de su entrada.

export const PARAMETER_CATALOGO: Readonly<Record<string, DocContrato>> = {
  PRESUPUESTO_ANUAL: {
    tipo: 'MONEY',
    etiqueta: 'Presupuesto anual',
    descripcion: 'Total del presupuesto aprobado para el año que se está liquidando.',
  },
  // Σ fuente_financiacion.valor_aplicado (tipo=otros_ingresos) del presupuesto
  // vigente — neteo GAP-19.
  OTROS_INGRESOS_ANUAL: {
    tipo: 'MONEY',
    etiqueta: 'Otros ingresos anuales',
    descripcion:
      'Lo que el presupuesto espera recibir por fuera de las cuotas: arriendos de zonas comunes, ' +
      'parqueaderos, multas. Se resta antes de repartir entre los inmuebles.',
  },
  // Σ fuente_financiacion.valor_aplicado (tipo=cuota_extraordinaria) — es
  // ingreso real (Ley 675 art. 38, INCP), igual que otros_ingresos.
  CUOTA_EXTRAORDINARIA_ANUAL: {
    tipo: 'MONEY',
    etiqueta: 'Cuota extraordinaria anual',
    descripcion:
      'Total de las cuotas extraordinarias aprobadas para el año. Cuenta como ingreso real ' +
      '(Ley 675, art. 38).',
  },
  // Σ fuente_financiacion.valor_aplicado (tipo=fondo_imprevistos) — no es
  // ingreso nuevo, es aplicar un saldo ya existente (INCP: efectivo restringido).
  FONDO_IMPREVISTOS_ANUAL: {
    tipo: 'MONEY',
    etiqueta: 'Fondo de imprevistos anual',
    descripcion:
      'Cuánto se va a tomar este año del fondo de imprevistos. No es plata nueva: es gastar un ' +
      'saldo que ya existe.',
  },
}

export const UNIT_CATALOGO: Readonly<Record<string, DocContrato>> = {
  // inmuebles.area_privada. Un inmueble sin área diligenciada no trae la
  // clave: la fórmula que la use falla explícito al liquidar ESE inmueble.
  AREA_PRIVADA: {
    tipo: 'NUMBER',
    etiqueta: 'Área privada',
    descripcion: 'Metros cuadrados privados del inmueble. Puede faltar si no se ha diligenciado.',
  },
  // inmuebles.area_comun, mismo criterio de ausencia.
  AREA_COMUN: {
    tipo: 'NUMBER',
    etiqueta: 'Área común',
    descripcion:
      'Metros cuadrados de zona común asignados al inmueble. Puede faltar si no se ha diligenciado.',
  },
  COEFICIENTE: {
    tipo: 'NUMBER',
    etiqueta: 'Coeficiente de copropiedad',
    descripcion:
      'Coeficiente vigente del inmueble, del set de coeficientes activo de la copropiedad.',
  },
}

export const FUNCIONES_CATALOGO: Readonly<Record<string, DocFuncion>> = {
  MIN: { etiqueta: 'Mínimo', firma: 'MIN(a, b)', descripcion: 'El menor de dos números.' },
  MAX: { etiqueta: 'Máximo', firma: 'MAX(a, b)', descripcion: 'El mayor de dos números.' },
  PORCENTAJE: {
    etiqueta: 'Porcentaje',
    firma: 'PORCENTAJE(monto, porcentaje)',
    descripcion:
      'monto * (porcentaje / 100). El segundo argumento es un porcentaje (10 = 10%), no una fracción.',
  },
  REDONDEAR_DINERO: {
    etiqueta: 'Redondear dinero',
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
