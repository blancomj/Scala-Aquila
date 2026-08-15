export {
  type DataSnapshot,
  type SnapshotInmueble,
  type SnapshotPeriodo,
  type SnapshotConcepto,
  type SnapshotPresupuesto,
  type SnapshotPolitica,
  clavePeriodo,
} from './snapshot.js'

export { construirGrafo, ordenTopologico, type NodoGrafo } from './graph.js'

export { catalogoDesde, crearContexto } from './context.js'

export { ejecutarPlan, type LineaLiquidacion, type ResultadoConcepto } from './executor.js'

export {
  ensamblarResultado,
  type LiquidationResult,
  type LineaResultado,
  type TotalInmueble,
} from './result.js'

export { calcularResultHash } from './hash.js'

export { liquidar, type ResultadoLiquidacion } from './liquidar.js'

export { construirSnapshotDesdeSupabase, type OpcionesSnapshot } from './snapshot-supabase.js'

export { guardarLiquidacion } from './persistencia-supabase.js'

export {
  DependenciaCiclicaError,
  DependenciaDesconocidaError,
  ConceptoNoAnalizaLimpioError,
  EvaluacionConceptoFallidaError,
  ReconciliacionLiquidacionFallidaError,
  OrdenImputacionInvalidoError,
  EstrategiaImputacionInvalidaError,
  PoliticaMoraNoConfiguradaError,
} from './errors.js'

export {
  imputarPago,
  calcularInteresMora,
  type CategoriaCargo,
  type CargoAbierto,
  type EstrategiaImputacion,
  type AplicacionPago,
  type PlanImputacion,
  type CargoInteresGenerado,
  type PoliticaMora,
} from './cuenta-corriente.js'

export {
  obtenerCargosAbiertos,
  obtenerPoliticaMora,
  obtenerPoliticaImputacion,
  registrarPago,
  registrarCargosDeLiquidacion,
  registrarCargoInteres,
  obtenerUltimaFechaInteresPorCapital,
  type OpcionesCargosAbiertos,
  type PoliticaImputacion,
  type DatosPago,
  type LiquidacionLineaInsertada,
} from './cuenta-corriente-supabase.js'
