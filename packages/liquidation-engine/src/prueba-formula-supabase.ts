/**
 * AEL-004 Fase 1 — I/O Supabase del contexto de "probar fórmula". Único
 * módulo, junto a snapshot-supabase.ts/persistencia-supabase.ts/
 * cuenta-corriente-supabase.ts, autorizado a hablar con Supabase (D-14,
 * vigilado por eslint.config.js).
 *
 * Reutiliza construirSnapshotDesdeSupabase entero (PARAMETER.* y, desde que
 * `DataSnapshot.unidades` dejó de estar vacío, también UNIT.* — AREA_PRIVADA/
 * AREA_COMUN/COEFICIENTE) — este módulo ya no duplica esa lectura ni
 * reconstruye el catálogo/contexto a mano, solo valida que el inmueble
 * exista y delega en context.ts.
 */
import type { AquilaClient } from '@aquila/shared'
import type { CatalogoContratos } from '@aquila/ael-language'
import type { ExecutionContext } from '@aquila/ael-runtime'
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

  return {
    catalogo: catalogoDesde(snapshot),
    contexto: crearContexto(snapshot, new Map(), inmuebleId),
  }
}
