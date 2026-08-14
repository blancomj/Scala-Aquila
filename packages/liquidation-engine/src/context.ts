/**
 * Construye el ExecutionContext y el CatalogoContratos que ael-runtime/
 * ael-language necesitan, a partir de un DataSnapshot.
 *
 * GAP-22 (paso0/INFORME_PASO_0.md §4): no existe un catálogo formal de
 * Contracts con tipo/unidad/versión (Docs/01 §22). Este módulo lo infiere
 * de los datos que el propio snapshot ya trae — simplificación de v0,
 * documentada, no una invención silenciosa (ampliar cuando GAP-22 se
 * resuelva formalmente).
 */
import type { CatalogoContratos } from '@aquila/ael-language'
import type { Tipo } from '@aquila/ael-core'
import type { ExecutionContext, TypedValue } from '@aquila/ael-runtime'
import { ContractoNoResueltoError } from '@aquila/ael-runtime'
import type { DataSnapshot } from './snapshot.js'

export function catalogoDesde(snapshot: DataSnapshot): CatalogoContratos {
  const parameter: Record<string, Tipo> = {}
  for (const [clave, valor] of Object.entries(snapshot.parametros)) {
    parameter[clave] = valor.tipo
  }

  const unit: Record<string, Tipo> = {}
  for (const camposInmueble of Object.values(snapshot.unidades)) {
    for (const [clave, valor] of Object.entries(camposInmueble)) {
      unit[clave] = valor.tipo
    }
  }

  const concepto: Record<string, Tipo> = {}
  for (const c of snapshot.conceptos) {
    // GAP-22: todo concepto de cobro es MONEY en v0 — no hay catálogo que diga lo contrario.
    concepto[c.codigo] = 'MONEY'
  }

  return { PARAMETER: parameter, UNIT: unit, CONCEPTO: concepto }
}

/**
 * `inmuebleId`: contexto de un concepto `directo` evaluado para un inmueble
 * concreto (resuelve UNIT.*). `null` para un concepto `distribucion`, que se
 * evalúa una sola vez a nivel de tenant (UNIT.* no tiene sentido ahí y
 * lanza si se referencia).
 */
export function crearContexto(
  snapshot: DataSnapshot,
  resultadosPrevios: ReadonlyMap<string, TypedValue>,
  inmuebleId: string | null,
): ExecutionContext {
  return {
    catalogo: catalogoDesde(snapshot),
    modoRedondeoDinero: snapshot.politica.redondeoModo,
    resolverContract(contrato, campo) {
      if (contrato === 'PARAMETER') {
        const valor = snapshot.parametros[campo]
        if (valor === undefined) throw new ContractoNoResueltoError(contrato, campo)
        return valor
      }

      if (contrato === 'UNIT') {
        const valor = inmuebleId === null ? undefined : snapshot.unidades[inmuebleId]?.[campo]
        if (valor === undefined) throw new ContractoNoResueltoError(contrato, campo)
        return valor
      }

      if (contrato === 'CONCEPTO') {
        const valor = resultadosPrevios.get(campo)
        if (valor === undefined) throw new ContractoNoResueltoError(contrato, campo)
        return valor
      }

      throw new ContractoNoResueltoError(contrato, campo)
    },
  }
}
