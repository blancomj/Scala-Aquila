/**
 * Contrato de la capa de descriptores de proveedor de IA.
 *
 * FASE DE ESTRUCTURA (encargo del usuario, 2026-09-13): solo se declara la
 * metadata necesaria para que una copropiedad elija proveedor + modelo y
 * guarde su credencial — qué credenciales pedir, qué modelos sugerir, a qué
 * documentación enlazar. Deliberadamente NO hay aquí ningún método que hable
 * con el proveedor (generar texto, extraer JSON estructurado, etc.): ese
 * contrato se diseña cuando el primer módulo consumidor real (p. ej.
 * extracción asistida de extractos bancarios en PDF) lo necesite — inventar
 * la forma de esa llamada ahora, sin un consumidor real que la use, sería
 * una abstracción especulativa (ver CLAUDE.md: "no diseñar para requisitos
 * futuros hipotéticos").
 */
import type { Database } from '@aquila/shared'

/** Derivado del enum de la base, nunca escrito a mano — así agregar un
 *  proveedor al enum sin escribir su descriptor es un error de compilación
 *  en el Record exhaustivo de descriptores.ts. */
export type IaProveedor = Database['public']['Enums']['ia_proveedor_t']

export interface CapacidadesProveedorIa {
  /** Modelos sugeridos para el selector de la UI — NO es una lista cerrada
   *  ni se hace cumplir server-side (ver comment on column ia_config.modelo):
   *  los proveedores publican modelos nuevos más rápido de lo que este repo
   *  se despliega. Un modelo fuera de esta lista se puede escribir a mano. */
  readonly modelosSoportados: readonly string[]
  /** Nombres de credencial que este proveedor exige (típicamente solo
   *  'api_key', algunos piden además 'organizacion_id'/'proyecto_id'). Es lo
   *  que hace genérica a la pantalla de configuración: la UI pinta lo que el
   *  descriptor declare, sin un `if (proveedor === 'anthropic')` por cada
   *  proveedor — mismo principio que CapacidadesPasarela. */
  readonly credencialesRequeridas: readonly string[]
  /** Documentación oficial del proveedor — la UI enlaza aquí en vez de
   *  copiar modelos/precios al código, que cambian con frecuencia. */
  readonly urlDocumentacion: string
}

export interface DescriptorProveedorIa {
  readonly proveedor: IaProveedor
  readonly nombreComercial: string
  readonly capacidades: CapacidadesProveedorIa
}
