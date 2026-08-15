/**
 * AEL-004 Fase 1 — I/O Supabase del contexto de "probar fórmula". Único
 * módulo, junto a snapshot-supabase.ts/persistencia-supabase.ts/
 * cuenta-corriente-supabase.ts, autorizado a hablar con Supabase (D-14,
 * vigilado por eslint.config.js).
 *
 * Reutiliza construirSnapshotDesdeSupabase para PARAMETER.* (evita duplicar
 * el neteo de otros ingresos, GAP-19) y le añade por encima, solo para el
 * contexto que esta función devuelve, un set chico de UNIT.* (AREA_PRIVADA,
 * AREA_COMUN, COEFICIENTE) leído directo de `inmuebles`/el snapshot —
 * snapshot.ts/context.ts compartidos NO se tocan: `DataSnapshot.unidades`
 * sigue vacío para liquidar-periodo (D-13).
 *
 * Un campo UNIT.* cuyo valor es null (p.ej. area_comun sin diligenciar) se
 * omite del catálogo en vez de resolverse a un valor inventado — una
 * fórmula que lo referencie falla con el mismo diagnóstico "contrato
 * desconocido" que cualquier otro dato faltante (17 §37 SNAPSHOT INCOMPLETE).
 */
import type { AquilaClient } from '@aquila/shared'
import { crearDecimal } from '@aquila/financial-kernel'
import type { CatalogoContratos } from '@aquila/ael-language'
import type { ExecutionContext, TypedValue } from '@aquila/ael-runtime'
import { catalogoDesde, crearContexto } from './context.js'
import { construirSnapshotDesdeSupabase } from './snapshot-supabase.js'

export interface OpcionesContextoPrueba {
  readonly tenantId: string
  readonly inmuebleId: string
  readonly anio: number
  readonly mes: number
}

export interface ContextoPrueba {
  readonly catalogo: CatalogoContratos
  readonly contexto: ExecutionContext
}

export async function construirContextoPrueba(
  cliente: AquilaClient,
  opciones: OpcionesContextoPrueba,
): Promise<ContextoPrueba> {
  const { tenantId, inmuebleId, anio, mes } = opciones

  const snapshot = await construirSnapshotDesdeSupabase(cliente, { tenantId, anio, mes })

  const inmueble = snapshot.inmuebles.find((i) => i.id === inmuebleId)
  if (!inmueble) {
    throw new Error(`El inmueble ${inmuebleId} no está activo en el tenant ${tenantId}`)
  }

  const { data: fila, error: errorInmueble } = await cliente
    .from('inmuebles')
    .select('area_privada, area_comun')
    .eq('id', inmuebleId)
    .eq('tenant_id', tenantId)
    .single()
  if (errorInmueble) {
    throw new Error(`No se pudo leer el inmueble ${inmuebleId}: ${errorInmueble.message}`)
  }

  const unitValores: Record<string, TypedValue> = {
    COEFICIENTE: { tipo: 'NUMBER', valor: crearDecimal(inmueble.coeficiente) },
  }
  if (fila.area_privada !== null) {
    unitValores.AREA_PRIVADA = { tipo: 'NUMBER', valor: crearDecimal(fila.area_privada) }
  }
  if (fila.area_comun !== null) {
    unitValores.AREA_COMUN = { tipo: 'NUMBER', valor: crearDecimal(fila.area_comun) }
  }

  const catalogoBase = catalogoDesde(snapshot)
  const catalogo: CatalogoContratos = {
    ...catalogoBase,
    UNIT: {
      ...catalogoBase.UNIT,
      ...Object.fromEntries(Object.keys(unitValores).map((campo) => [campo, 'NUMBER' as const])),
    },
  }

  const contextoBase = crearContexto(snapshot, new Map(), inmuebleId)
  const contexto: ExecutionContext = {
    catalogo,
    modoRedondeoDinero: contextoBase.modoRedondeoDinero,
    resolverContract(contrato, campo) {
      const valorUnit = contrato === 'UNIT' ? unitValores[campo] : undefined
      if (valorUnit !== undefined) return valorUnit
      return contextoBase.resolverContract(contrato, campo)
    },
  }

  return { catalogo, contexto }
}
